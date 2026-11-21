import { SKILLS, findSkill } from "./skills.js";
import { loadLandmarker, detectPoses, computeMetrics, drawSkeleton, renderStick, stickDims } from "./analyze.js";
import { observe, compareObs, packKeyframes, unpackLm } from "./observe.js";
import { methodsFor } from "./methods.js";
import { callApi } from "./api.js";
import { saveVideo, loadVideo, savePose, loadPose } from "./localdb.js";

// ============================================================
// トーク画面（吹き出しの表示と、生徒の学習の流れ）
// ============================================================

const byId = (id) => document.getElementById(id);
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hhmm = (ts) => {
  const d = ts ? new Date(String(ts).replace(" ", "T")) : new Date();
  return isNaN(d) ? "" : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const nowTs = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const newMsgId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const mk = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

// ---------------- 吹き出しの表示 ----------------
let lastFrom = null;

export function clearTalk() {
  byId("talk").innerHTML = "";
  lastFrom = null;
}

export function talkNotice(text) {
  byId("talk").appendChild(mk("div", "day", `<span>${esc(text)}</span>`));
  lastFrom = null;
}

function scrollDown() {
  const t = byId("talk");
  requestAnimationFrame(() => t.scrollTo({ top: t.scrollHeight, behavior: "smooth" }));
}

/** 吹き出しを1つ並べる。from: "coach" | "me" */
function placeBubble(from, bubble, { wide = false, ts = null, read = true } = {}) {
  const who = from === "me" ? "me" : "you";
  const first = lastFrom !== who;
  lastFrom = who;
  const row = mk("div", `row ${who}`);
  if (who === "you") row.appendChild(mk("div", `avatar${first ? "" : " ghost"}`, "🧑‍🏫"));
  const stack = mk("div", "stack");
  if (wide) stack.classList.add("wide");
  if (who === "you" && first) stack.appendChild(mk("div", "name", "コーチ"));
  const line = mk("div", "line");
  if (first && !bubble.classList.contains("video-msg")) bubble.classList.add("tail");
  line.appendChild(bubble);
  line.appendChild(mk("div", "meta", who === "me" ? `${read ? "既読<br>" : ""}${hhmm(ts)}` : hhmm(ts)));
  stack.appendChild(line);
  row.appendChild(stack);
  byId("talk").appendChild(row);
  scrollDown();
  return row;
}

/** メッセージ（保存される形）を吹き出しにする */
export function renderMessage(msg, opts = {}) {
  const d = msg.data || {};
  const from = msg.from === "me" ? "me" : "coach";
  switch (msg.type) {
    case "text": {
      const b = mk("div", "bubble");
      b.textContent = d.text || "";
      return placeBubble(from, b, { ts: msg.ts });
    }
    case "card": {
      const b = mk("div", "bubble card", `<div class="card-title">${esc(d.title)}</div>${d.lines?.length ? `<ul>${d.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}${d.note ? `<div class="small">${esc(d.note)}</div>` : ""}`);
      return placeBubble(from, b, { wide: true, ts: msg.ts });
    }
    case "methods":
      return placeBubble(from, methodsBubble(msg, opts), { wide: true, ts: msg.ts });
    case "video":
      return placeBubble("me", videoBubble(msg), { ts: msg.ts });
    case "analysis":
      return placeBubble(from, analysisBubble(msg, opts), { wide: true, ts: msg.ts });
    case "summary":
      return placeBubble(from, summaryBubble(d), { wide: true, ts: msg.ts });
    case "notice":
      return talkNotice(d.text);
    default:
      return null;
  }
}

function methodsBubble(msg, opts) {
  const d = msg.data;
  const b = mk("div", "bubble card", `<div class="card-title">🏃 練習方法メニュー${d.skillName ? `（${esc(d.skillName)}）` : ""}</div>`);
  for (const m of d.items || []) {
    const c = mk(
      "div",
      "method",
      `<div class="method-name">${esc(m.name)}</div><div class="method-how">${esc(m.how)}</div>${m.focus ? `<div class="method-focus">💡 ここを意識するとよいかも：${esc(m.focus)}</div>` : ""}`
    );
    const btns = mk("div", "method-btns");
    if (opts.onPickMethod) {
      const pick = mk("button", "pick", "これにする");
      pick.onclick = () => opts.onPickMethod(m);
      btns.appendChild(pick);
    }
    if (m.video && opts.onModel) {
      const v = mk("button", "model", "🎬 お手本");
      v.onclick = () => opts.onModel(m.video);
      btns.appendChild(v);
    }
    if (btns.children.length) c.appendChild(btns);
    b.appendChild(c);
  }
  return b;
}

function videoBubble(msg) {
  const wrap = mk("div", "video-msg");
  const holder = mk("div", "video-holder", `<div class="video-missing">🎥 動画</div>`);
  wrap.appendChild(holder);
  loadVideo(msg.data.localId || msg.id).then((blob) => {
    if (!blob) {
      holder.innerHTML = `<div class="video-missing">🎥 動画<br><small>この端末には保存されていません</small></div>`;
      return;
    }
    const v = mk("video");
    v.controls = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.preload = "metadata";
    v.src = URL.createObjectURL(blob) + "#t=0.1";
    holder.innerHTML = "";
    holder.appendChild(v);
  });
  return wrap;
}

function analysisBubble(msg, opts) {
  const d = msg.data;
  const b = mk("div", "bubble card analysis");
  b.appendChild(mk("div", "card-title", `📊 ${d.trial ? `${d.trial}回目の` : ""}動画の分析`));
  const playerSlot = mk("div");
  b.appendChild(playerSlot);

  // 大事な場面（棒人間）
  const kf = mk("div", "keyframes");
  for (const k of d.keyframes || []) {
    const img = renderStick(unpackLm(k.lm), d.dims, 200);
    const btn = mk("button", "kf", `<img src="${img}" alt="" /><div>${esc(k.label)}</div><div>${Number(k.t).toFixed(1)}秒</div>`);
    btn.onclick = () => playerSlot.__player?.seekTo(k.t);
    kf.appendChild(btn);
  }
  b.appendChild(mk("div", "sub-title", "大事な場面"));
  b.appendChild(kf);

  // 観察（数字）
  const obs = mk("div", "obs");
  obs.innerHTML = (d.items || [])
    .map((it) => `<div class="obs-row"><div class="obs-label">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</div><div class="obs-val">${esc(it.value)}</div></div>`)
    .join("");
  b.appendChild(mk("div", "sub-title", "数字で見ると"));
  b.appendChild(obs);
  if (d.compare?.length) {
    b.appendChild(mk("div", "sub-title", "前回とくらべると"));
    b.appendChild(mk("div", "obs", d.compare.map((c) => `<div class="obs-row"><div class="obs-label">${esc(c.label)}</div><div class="obs-val">${esc(c.text)}</div></div>`).join("")));
  }
  for (const n of d.notes || []) b.appendChild(mk("div", "warn", `📷 ${esc(n)}`));

  // この端末に動画と骨格があれば、骨格つきプレーヤーを出す
  Promise.all([loadVideo(d.videoId), loadPose(d.videoId)]).then(([blob, pose]) => {
    if (!blob || !pose) {
      playerSlot.appendChild(mk("div", "small", "※ 骨格つきの動画は、動画を送った端末で見られます。"));
      return;
    }
    const p = createPlayer(URL.createObjectURL(blob), pose.frames);
    playerSlot.__player = p;
    playerSlot.appendChild(p.el);
  });
  return b;
}

export function summaryBubble(s) {
  const qa = (arr) => (arr || []).filter((x) => x && x.a).map((x) => `<div class="qa"><div class="q">${esc(x.q)}</div><div class="a">${esc(x.a)}</div></div>`).join("");
  const ind = s.indicators || {};
  return mk(
    "div",
    "bubble card summary",
    `<div class="card-title">📝 今日の学びのまとめ</div>
    <div class="sum-grid">
      <div>技</div><div>${esc(s.skill)}</div>
      <div>学習課題</div><div>${esc(s.task)}</div>
      <div>学習方法</div><div>${esc((s.methods || []).join("／"))}</div>
      <div>試した回数</div><div>${esc(ind.trials || 0)}回</div>
      ${s.selfCheck ? `<div>自己評価</div><div>${esc(s.selfCheck)}</div>` : ""}
    </div>
    ${qa(s.planAnswers) ? `<div class="sub-title">計画</div>${qa(s.planAnswers)}` : ""}
    ${qa(s.videoAnswers) ? `<div class="sub-title">動画を見ての気づき</div>${qa(s.videoAnswers)}` : ""}
    ${qa(s.reflection) ? `<div class="sub-title">振り返り</div>${qa(s.reflection)}` : ""}`
  );
}

// ---------------- 骨格つき動画プレーヤー ----------------
const players = [];
export function createPlayer(url, frames) {
  const root = mk("div", "player");
  root.innerHTML = `<div class="video-wrap"><video playsinline webkit-playsinline muted preload="auto"></video><canvas></canvas></div>
    <div class="controls">
      <button class="play">▶ 再生</button>
      <button data-speed="0.25">0.25倍</button><button data-speed="0.5" class="on">0.5倍</button><button data-speed="1">1倍</button>
      <label><input type="checkbox" checked /> 骨格</label>
    </div>
    <input type="range" min="0" max="1000" value="0" aria-label="再生位置" />
    <div class="time"><span>0.00</span> 秒</div>`;
  const video = root.querySelector("video");
  const canvas = root.querySelector("canvas");
  const playBtn = root.querySelector(".play");
  const range = root.querySelector("input[type=range]");
  const timeEl = root.querySelector(".time span");
  const skeleton = root.querySelector("input[type=checkbox]");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  let speed = 0.5;
  const p = { el: root, show: true, last: "" };
  players.push(p);
  const updateBtn = () => (playBtn.textContent = video.paused ? "▶ 再生" : "⏸ 止める");
  playBtn.onclick = () => {
    if (video.paused) {
      if (video.ended || video.currentTime >= video.duration - 0.05) video.currentTime = 0;
      video.playbackRate = speed;
      video.play().catch(() => {});
    } else video.pause();
  };
  ["play", "pause", "ended"].forEach((ev) => video.addEventListener(ev, updateBtn));
  root.querySelectorAll("[data-speed]").forEach((b) => {
    b.onclick = () => {
      speed = Number(b.dataset.speed);
      video.playbackRate = speed;
      root.querySelectorAll("[data-speed]").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  range.addEventListener("input", () => {
    video.pause();
    if (video.duration) video.currentTime = (Number(range.value) / 1000) * video.duration;
  });
  skeleton.onchange = () => (p.show = skeleton.checked);
  p.tick = () => {
    const rect = video.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(rect.width * dpr), ch = Math.round(rect.height * dpr);
    const key = `${cw}x${ch}@${video.currentTime}:${p.show}`;
    if (key === p.last) return;
    p.last = key;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    if (p.show && video.videoWidth) {
      const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
      const w = video.videoWidth * scale, h = video.videoHeight * scale;
      ctx.save();
      ctx.translate((cw - w) / 2, (ch - h) / 2);
      const f = nearestFrame(frames, video.currentTime);
      if (f?.lm) drawSkeleton(ctx, f.lm, w, h, { width: Math.max(3, w / 180) });
      ctx.restore();
    }
    if (video.duration) {
      range.value = String(Math.round((video.currentTime / video.duration) * 1000));
      timeEl.textContent = video.currentTime.toFixed(2);
    }
  };
  p.seekTo = (t) => {
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration || 0, t));
    root.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return p;
}

function nearestFrame(frames, t) {
  if (!frames?.length) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (frames[m].t <= t) lo = m;
    else hi = m - 1;
  }
  const a = frames[lo], b = frames[lo + 1];
  return b && Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a;
}

(function drawPlayers() {
  for (const p of players) if (p.el.isConnected) p.tick();
  requestAnimationFrame(drawPlayers);
})();

// ---------------- かんたん返信 ----------------
function setQuick(items) {
  const box = byId("quick");
  box.innerHTML = "";
  for (const it of items) {
    const b = mk("button", it.main ? "main" : "");
    b.textContent = it.label;
    b.onclick = () => {
      if (it.echo !== false) {
        box.innerHTML = "";
        Room.say(it.say ?? it.label);
      }
      it.action();
    };
    box.appendChild(b);
  }
}
const clearQuick = () => setQuick([]);

// ============================================================
// 生徒のトークルーム（今日の学習の流れ）
// ============================================================
export const Room = {
  date: "",
  readOnly: true,
  lesson: null,
  student: null,
  ctx: null,
  pending: [],
  queue: Promise.resolve(),
  onModel: null, // お手本動画を開く
  onSaved: null,

  /** トークルームを開く */
  open({ date, messages, ctx, lesson, student, readOnly, onModel }) {
    Object.assign(this, { date, lesson, student, readOnly, onModel, pending: [], queue: Promise.resolve() });
    clearTalk();
    clearQuick();
    talkNotice(dateLabel(date));
    for (const m of messages || []) renderMessage(m, this.renderOpts(m, messages));
    byId("composer").classList.toggle("hidden", readOnly);
    if (readOnly) return;
    this.ctx = ctx || newCtx();
    if (!messages || !messages.length) this.greet();
    else this.resume();
  },

  renderOpts(msg, all) {
    const opts = { onModel: this.onModel };
    if (!this.readOnly && msg.type === "methods") {
      const lastMethods = [...(all || [])].reverse().find((m) => m.type === "methods");
      if (lastMethods === msg) opts.onPickMethod = (m) => this.pickMethod(m, true);
    }
    return opts;
  },

  // ---------- 送る・保存する ----------
  post(from, type, data, id) {
    const msg = { id: id || newMsgId(), ts: nowTs(), from, type, data };
    renderMessage(msg, this.renderOpts(msg, [msg]));
    this.pending.push(msg);
    this.persistSoon();
    return msg;
  },
  say(text) {
    return this.post("me", "text", { text });
  },
  coach(...items) {
    this.queue = this.queue.then(async () => {
      for (const it of items) {
        const typing = showTyping();
        const len = typeof it === "string" ? it.length : 40;
        await pause(Math.min(1000, 300 + len * 10));
        typing.remove();
        lastFrom = typing.__prev;
        if (typeof it === "string") this.post("coach", "text", { text: it });
        else if (typeof it === "function") await it();
        else this.post("coach", it.type, it.data);
      }
    });
    return this.queue;
  },
  persistTimer: null,
  persistSoon() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 600);
  },
  async persist() {
    if (!this.pending.length) return;
    const batch = this.pending.splice(0);
    try {
      await callApi("saveMessages", this.date, batch, this.ctx);
      byId("saveState").textContent = "";
      this.onSaved && this.onSaved();
    } catch (e) {
      console.warn("保存できませんでした", e);
      this.pending.unshift(...batch);
      byId("saveState").textContent = "⚠️ 保存できていません（自動でやり直します）";
      clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => this.persist(), 5000);
    }
  },

  // ---------- 流れ ----------
  get skill() {
    return findSkill(this.ctx.skillId);
  },
  allowedSkills() {
    const ids = this.lesson.skills || [];
    return ids.length ? SKILLS.filter((s) => ids.includes(s.id)) : SKILLS;
  },

  greet() {
    const name = this.student?.name ? `${this.student.name}さん、` : "";
    this.coach(`${name}こんにちは！今日の授業は「${this.lesson.title}」だよ。`, "学習課題を決めて、練習方法を選んで、動画でためして、最後に振り返ろう。").then(() => {
      const skills = this.allowedSkills();
      if (skills.length === 1) {
        this.ctx.skillId = skills[0].id;
        this.coach(`今日の技は「${skills[0].name}」だよ。`).then(() => this.askTask());
      } else this.askSkill();
    });
  },

  askSkill() {
    this.ctx.stage = "skill";
    this.coach("まずは、今日練習する技をえらんでね👇").then(() => this.quick("skill"));
  },

  chooseSkill(id) {
    this.ctx.skillId = id;
    this.askTask();
  },

  askTask() {
    this.ctx.stage = "task";
    this.coach(this.lesson.taskPrompt).then(() => this.quick("task"));
  },

  setTask(text) {
    this.ctx.task = text;
    this.coach(`学習課題は「${text}」に決まり！`).then(() => this.runQuestions("afterTask"));
  },

  showHints() {
    const s = this.skill;
    this.coach({ type: "card", data: { title: `💡 ${s.name}で意識するとよいところ`, lines: s.points, note: "課題を決めるヒントにしてね。" } }).then(() => this.quick(this.ctx.stage));
  },

  askMethod() {
    this.ctx.stage = "method";
    const items = methodsFor(this.lesson, this.ctx.skillId);
    this.coach(this.lesson.methodPrompt, { type: "methods", data: { skillName: this.skill.name, items } }).then(() => this.quick("method"));
  },

  pickMethod(m, fromCard = false) {
    if (this.ctx.stage !== "method") return;
    if (fromCard) {
      clearQuick();
      this.say(m.name);
    }
    if (this.ctx.method && this.ctx.method !== m.name) this.ctx.methodChanges = (this.ctx.methodChanges || 0) + 1;
    this.ctx.method = m.name;
    if (!this.ctx.methodsTried.includes(m.name)) this.ctx.methodsTried.push(m.name);
    this.ctx.stage = "method-picked";
    const lines = [`「${m.name}」でやってみよう！`];
    if (m.focus) lines.push(`💡 ここを意識するとよいかも：${m.focus}`);
    this.coach(lines.join("\n")).then(() => this.runQuestions("afterMethod"));
  },

  askPractice() {
    this.ctx.stage = "practice";
    this.coach("練習したら、動画を撮って送ってね📹\n（真横から、頭から足まで全身が入るように）").then(() => this.quick("practice"));
  },

  askNext() {
    this.ctx.stage = "next";
    this.coach("次はどうする？").then(() => this.quick("next"));
  },

  startReflection() {
    if (this.lesson.selfCheck) {
      this.ctx.stage = "selfcheck";
      this.coach(`振り返りをしよう。\n学習課題「${this.ctx.task}」は達成できた？`).then(() => this.quick("selfcheck"));
    } else this.runQuestions("reflection");
  },

  setSelfCheck(label) {
    this.ctx.selfCheck = label;
    this.runQuestions("reflection");
  },

  // 先生が設定した問いかけを順番に聞く
  runQuestions(key) {
    const list = (this.lesson.questions[key] || []).filter((q) => q && q.trim());
    if (!list.length) return this.afterQuestions(key);
    this.ctx.stage = "q";
    this.ctx.q = { key, i: 0 };
    this.coach(list[0]);
  },
  answer(text) {
    const { key, i } = this.ctx.q;
    const list = (this.lesson.questions[key] || []).filter((q) => q && q.trim());
    const rec = { q: list[i], a: text };
    if (key === "afterVideo") rec.trial = this.ctx.trials;
    this.ctx.answers[key].push(rec);
    if (i + 1 < list.length) {
      this.ctx.q.i = i + 1;
      this.coach(list[i + 1]);
    } else {
      this.ctx.q = null;
      this.afterQuestions(key);
    }
  },
  afterQuestions(key) {
    if (key === "afterTask") this.askMethod();
    else if (key === "afterMethod") this.askPractice();
    else if (key === "afterVideo") this.askNext();
    else if (key === "reflection") this.finish();
  },

  finish() {
    const c = this.ctx;
    const reflection = c.answers.reflection;
    const summary = {
      lessonTitle: this.lesson.title,
      date: this.date,
      skill: this.skill?.name || "",
      task: c.task || "",
      methods: c.methodsTried,
      selfCheck: c.selfCheck || "",
      planAnswers: [{ q: "学習課題", a: c.task }, { q: "選んだ学習方法", a: c.methodsTried.join("／") }, ...c.answers.afterTask, ...c.answers.afterMethod],
      videoAnswers: c.answers.afterVideo.map((x) => ({ q: `${x.trial ? `（${x.trial}回目）` : ""}${x.q}`, a: x.a })),
      reflection,
      indicators: {
        trials: c.trials,
        methodsTried: c.methodsTried.length,
        methodChanges: c.methodChanges || 0,
        reflectionChars: reflection.reduce((n, x) => n + (x.a || "").length, 0),
      },
    };
    c.stage = "done";
    c.done = true;
    this.coach({ type: "summary", data: summary }, "今日の学びをまとめたよ。おつかれさま！✨\nこのまとめは先生も見るよ。").then(async () => {
      this.quick("done");
      try {
        await callApi("saveSummary", this.date, summary);
      } catch (e) {
        console.warn(e);
        this.coach("まとめを保存できなかったよ。通信を確かめて、もう一度「振り返りをやり直す」をためしてね。");
      }
    });
  },

  // ---------- 動画 ----------
  async onVideo(file) {
    if (this.readOnly || !file) return;
    const st = this.ctx.stage;
    if (st === "analyzing") return this.coach("いま動画を分析しているよ。終わるまで待ってね⏳");
    if (!["practice", "next", "done"].includes(st)) {
      return this.coach("先に、学習課題と練習方法を決めてから動画を送ってね。");
    }
    clearQuick();
    this.ctx.stage = "analyzing";
    const videoId = newMsgId();
    const stored = await saveVideo(videoId, file);
    this.post("me", "video", { name: file.name || "動画", size: file.size, localId: videoId }, videoId);
    if (!stored) this.coach("※ この端末に動画を保存できなかったので、あとで見返すことはできないよ（容量がいっぱいかも）。");
    await this.queue;
    await this.analyze(file, videoId);
  },

  async analyze(file, videoId) {
    const skill = this.skill;
    const box = mk("div", "bubble card", `<div>動画を分析しているよ👀</div><div class="small status">準備しています…</div><div class="prog"><div></div></div>`);
    const video = mk("video", "analyze-video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    box.appendChild(video);
    const status = (p, text) => {
      box.querySelector(".status").textContent = text;
      box.querySelector(".prog > div").style.width = `${Math.round(p * 100)}%`;
    };
    const row = placeBubble("coach", box, { wide: true });
    const url = URL.createObjectURL(file);
    try {
      video.src = url;
      video.load();
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("動画を読み込めませんでした。")), 20000);
        const ok = () => {
          clearTimeout(t);
          resolve();
        };
        if (video.readyState >= 1) ok();
        video.addEventListener("loadedmetadata", ok, { once: true });
        video.addEventListener("error", () => reject(new Error("この動画は読み込めませんでした。")), { once: true });
      });
      await loadLandmarker((p, text) => status(p, text || "準備しています…"));
      status(0, "体の動きを読み取っています… 0%");
      const pose = await detectPoses(video, (p) => status(p, `体の動きを読み取っています… ${Math.round(p * 100)}%`));
      const metrics = computeMetrics(pose, skill.motion);
      const obs = observe(skill, metrics);
      const compare = compareObs(this.ctx.lastObs, obs);
      this.ctx.trials = (this.ctx.trials || 0) + 1;
      this.ctx.lastObs = { items: obs.items.map(({ key, value, raw, label }) => ({ key, value, raw, label })) };
      await savePose(videoId, { frames: pose.frames, width: pose.width, height: pose.height });
      video.pause();
      video.remove();
      row.remove();
      lastFrom = null;
      this.post("coach", "analysis", {
        videoId,
        trial: this.ctx.trials,
        skillId: skill.id,
        items: obs.items,
        notes: obs.notes,
        compare,
        keyframes: packKeyframes(pose, metrics),
        dims: stickDims(pose, metrics),
      });
      this.coach(`動画と数字を見て、学習課題「${this.ctx.task}」についてふり返ってみよう。`).then(() => this.runQuestions("afterVideo"));
    } catch (e) {
      console.error(e);
      video.pause();
      video.remove();
      row.remove();
      lastFrom = null;
      this.ctx.stage = "practice";
      this.coach(`うまく読み取れなかったよ😢\n${e.message || ""}`, "全身が映るように真横から撮って、もう一度送ってみてね。").then(() => this.quick("practice"));
    }
  },

  // ---------- 入力 ----------
  onText(text) {
    if (this.readOnly) return;
    const t = text.trim();
    if (!t) return;
    clearQuick();
    this.say(t);
    const st = this.ctx.stage;
    const hit = SKILLS.find((s) => t.includes(s.name));
    if (/お手本/.test(t) && st !== "q" && st !== "task") return this.onModel && this.onModel(null, this.skill);
    switch (st) {
      case "skill":
        if (hit && this.allowedSkills().includes(hit)) return this.chooseSkill(hit.id);
        return this.coach("下のボタンから技をえらんでね👇").then(() => this.quick("skill"));
      case "task":
        return this.setTask(t);
      case "q":
        return this.answer(t);
      case "method":
        return this.pickMethod({ name: t, focus: "" });
      case "selfcheck":
        return this.setSelfCheck(t);
      case "analyzing":
        return this.coach("いま動画を分析しているよ。ちょっと待ってね⏳");
      default:
        return this.coach("練習したら動画を送ってね📹（下のカメラボタン）").then(() => this.quick(st));
    }
  },

  /** 段階ごとのかんたん返信 */
  quick(stage) {
    const cam = { label: "📹 動画を送る", main: true, echo: false, action: () => byId("videoInput").click() };
    const model = { label: "🎬 お手本を見る", echo: false, action: () => this.onModel && this.onModel(null, this.skill) };
    const S = {
      skill: () => this.allowedSkills().map((s) => ({ label: s.name, action: () => this.chooseSkill(s.id) })),
      task: () => [
        ...((this.lesson.taskOptions?.length ? this.lesson.taskOptions : this.skill?.goalIdeas) || []).map((g) => ({ label: g, action: () => this.setTask(g) })),
        { label: "💡 ヒントを見る", echo: false, action: () => this.showHints() },
        model,
      ],
      method: () => [
        ...methodsFor(this.lesson, this.ctx.skillId).map((m) => ({ label: m.name, action: () => this.pickMethod(m) })),
        { label: "💡 意識するところ", echo: false, action: () => this.showHints() },
        model,
      ],
      practice: () => [cam, model, { label: "方法を変える", action: () => this.askMethod() }],
      next: () => [
        { label: "📹 もう一回ためす", main: true, echo: false, action: () => byId("videoInput").click() },
        { label: "方法を変える", action: () => this.askMethod() },
        model,
        { label: "振り返りへ進む", action: () => this.startReflection() },
      ],
      selfcheck: () => ["◎ できた", "○ 少しできた", "△ まだできない"].map((l) => ({ label: l, action: () => this.setSelfCheck(l) })),
      done: () => [
        { label: "📹 もう少し練習する", echo: false, action: () => byId("videoInput").click() },
        { label: "振り返りをやり直す", action: () => this.startReflection() },
        model,
      ],
    };
    setQuick(S[stage] ? S[stage]() : []);
    byId("cameraBtn").classList.toggle("pulse", ["practice", "next"].includes(stage));
  },

  /** 途中から再開するとき */
  resume() {
    const st = this.ctx.stage;
    if (st === "analyzing") this.ctx.stage = "practice";
    if (!this.ctx.skillId) return this.askSkill();
    if (this.ctx.stage === "q") {
      const { key, i } = this.ctx.q;
      const list = (this.lesson.questions[key] || []).filter((q) => q && q.trim());
      return this.coach(`続きからだよ。\n${list[i] || ""}`);
    }
    if (this.ctx.stage === "method-picked") return this.runQuestions("afterMethod");
    this.quick(this.ctx.stage);
  },
};

function newCtx() {
  return { stage: "skill", skillId: null, task: "", method: "", methodsTried: [], methodChanges: 0, trials: 0, lastObs: null, q: null, selfCheck: "", answers: { afterTask: [], afterMethod: [], afterVideo: [], reflection: [] } };
}

function showTyping() {
  const prev = lastFrom;
  const row = placeBubble("coach", mk("div", "bubble", `<span class="typing"><i></i><i></i><i></i></span>`));
  row.__prev = prev;
  lastFrom = prev;
  return row;
}

export function dateLabel(date) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const w = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${w}）`;
}
