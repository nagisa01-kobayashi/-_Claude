import { SKILLS, SELF_RATINGS, findSkill } from "./skills.js";
import { loadLandmarker, detectPoses, computeMetrics, drawSkeleton, renderStickFigure } from "./analyze.js";
import { makeCoaching } from "./coach.js";

// ============================================================
// トーク形式の画面（コーチとのやりとり）
// ============================================================

const $ = (id) => document.getElementById(id);
const talk = $("talk");
const state = {
  stage: "skill", // skill → goal → video → analyzing → rating → reflection → done
  skill: null,
  goal: "",
  current: null, // いちばん新しい分析結果
  pendingFile: null,
};

// ---------- 小さな道具 ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
function scrollToBottom() {
  requestAnimationFrame(() => talk.scrollTo({ top: talk.scrollHeight, behavior: "smooth" }));
}

// ---------- 吹き出し ----------
let lastSender = null;

/** 吹き出しを1つ並べる。who は "you"（コーチ）か "me"（自分） */
function addBubble(who, bubble, { wide = false } = {}) {
  const first = lastSender !== who;
  lastSender = who;
  const row = el("div", `row ${who}`);
  if (who === "you") row.appendChild(el("div", `avatar${first ? "" : " ghost"}`, "🧑‍🏫"));
  const stack = el("div", "stack");
  if (wide) stack.style.width = "min(78%, 560px)";
  if (who === "you" && first) stack.appendChild(el("div", "name", "コーチ"));
  const line = el("div", "line");
  if (first && !bubble.classList.contains("video-msg")) bubble.classList.add("tail");
  line.appendChild(bubble);
  line.appendChild(el("div", "meta", who === "me" ? `既読<br>${clock()}` : clock()));
  stack.appendChild(line);
  row.appendChild(stack);
  talk.appendChild(row);
  scrollToBottom();
  return row;
}

/** 自分の吹き出し（文字） */
function me(text) {
  const b = el("div", "bubble");
  b.textContent = text;
  addBubble("me", b);
}

// コーチの発言は順番に、「入力中…」をはさんで出す
let queue = Promise.resolve();
function coach(...items) {
  queue = queue.then(async () => {
    for (const item of items) {
      const typing = showTyping();
      const len = typeof item === "string" ? item.length : 40;
      await wait(Math.min(1100, 350 + len * 12));
      typing.remove();
      lastSender = typing.dataset.prev || lastSender;
      if (typeof item === "string") {
        const b = el("div", "bubble", item);
        addBubble("you", b);
      } else if (typeof item === "function") {
        item();
      } else {
        addBubble("you", item.bubble, { wide: !!item.wide });
      }
    }
  });
  return queue;
}

function showTyping() {
  const prev = lastSender;
  const b = el("div", "bubble", `<span class="typing"><i></i><i></i><i></i></span>`);
  const row = addBubble("you", b);
  row.dataset.prev = prev ?? "";
  lastSender = prev;
  return row;
}

// ---------- かんたん返信 ----------
function setQuick(items) {
  const box = $("quick");
  box.innerHTML = "";
  for (const it of items) {
    const b = el("button", it.main ? "main" : "");
    b.textContent = it.label;
    b.onclick = () => {
      if (it.echo !== false) {
        box.innerHTML = "";
        me(it.say ?? it.label);
      }
      it.action();
    };
    box.appendChild(b);
  }
}
const clearQuick = () => setQuick([]);

function setHeadSub() {
  const s = state.skill ? state.skill.name : "技をえらんでね";
  $("headSub").textContent = state.goal ? `${s}｜めあて：${state.goal}` : s;
}

function cameraHint(on) {
  document.querySelector(".camera").classList.toggle("pulse", on);
}

// ============================================================
// 会話の流れ
// ============================================================

function start() {
  talk.appendChild(el("div", "day", "<span>今日</span>"));
  coach("こんにちは！マット運動コーチです🤸", "動画を送ってくれたら、体の動きを分析してアドバイスするよ。\nまずは、今日練習する技をえらんでね👇").then(askSkill);
}

function askSkill() {
  state.stage = "skill";
  cameraHint(false);
  setQuick(SKILLS.map((s) => ({ label: s.name, action: () => chooseSkill(s.id) })));
}

function chooseSkill(id) {
  state.skill = findSkill(id);
  state.goal = "";
  store.set("lastSkill", id);
  setHeadSub();
  clearQuick();
  loadLandmarker().catch(() => {}); // 準備を先に始めておく

  const points = el(
    "div",
    "bubble wide",
    `<div class="card-title">📌 ${esc(state.skill.name)}のポイント</div><ul>${state.skill.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
  );
  // 技をえらぶ前に動画が送られていたら、そのまま分析する
  if (state.pendingFile) {
    const f = state.pendingFile;
    state.pendingFile = null;
    coach(`${state.skill.name}だね！さっそく見てみるよ👀`).then(() => analyze(f, true));
    return;
  }
  coach(`${state.skill.name}だね！👍`, { bubble: points, wide: true }, "今日のめあてを教えてね✏️\n下からえらぶか、自分の言葉で送ってね。").then(askGoal);
}

function askGoal() {
  state.stage = "goal";
  const ideas = state.skill.goalIdeas || [];
  setQuick([...ideas.map((g) => ({ label: g, action: () => setGoal(g, false) })), { label: "めあてなし", action: () => setGoal("", false) }]);
}

function setGoal(text, echo = true) {
  if (echo) me(text);
  clearQuick();
  state.goal = text.trim();
  setHeadSub();
  coach(state.goal ? `めあて「${esc(state.goal)}」、いいね！😊` : "OK！").then(askVideo);
}

function askVideo() {
  state.stage = "video";
  const tips = el(
    "div",
    "bubble wide",
    `<div class="card-title">📹 動画を送ってね</div>下の <b>カメラボタン</b> から、撮影するか、写真からえらんで送ってね。
<ul><li><b>真横</b>から撮る</li><li><b>頭から足まで全身</b>が入るように</li><li>iPadは<b>横向き</b>で、動かさない</li><li>マットから<b>3〜5m</b>はなれる</li><li>1回の技だけ（30秒以内）</li></ul>`
  );
  coach({ bubble: tips, wide: true }).then(() => {
    cameraHint(true);
    setQuick([
      { label: "📹 動画を送る", main: true, echo: false, action: () => $("videoInput").click() },
      { label: "技を変える", action: changeSkill },
    ]);
  });
}

function changeSkill() {
  clearQuick();
  coach("どの技にする？").then(askSkill);
}

// ---------- 動画が送られてきたとき ----------
function onVideoFile(file) {
  if (!file) return;
  if (state.stage === "analyzing") {
    coach("いま動画を見ているところだよ。終わるまで少し待ってね⏳");
    return;
  }
  if (!state.skill) {
    sendVideoBubble(file);
    state.pendingFile = file;
    coach("動画ありがとう！これはどの技かな？").then(askSkill);
    return;
  }
  analyze(file);
}

function sendVideoBubble(file) {
  const url = URL.createObjectURL(file);
  const wrap = el("div", "video-msg");
  const v = el("video");
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "metadata";
  v.src = `${url}#t=0.1`;
  wrap.appendChild(v);
  addBubble("me", wrap);
  return url;
}

async function analyze(file, alreadySent = false) {
  state.stage = "analyzing";
  clearQuick();
  cameraHint(false);
  if (!alreadySent) sendVideoBubble(file);
  const url = URL.createObjectURL(file);
  const skill = state.skill;
  const goal = state.goal;

  // 分析中の吹き出し（iPad では動画が画面に見えていないとコマが進まないので、ここに表示する）
  const box = el(
    "div",
    "bubble wide",
    `<div>動画を見ているよ👀</div><div class="small status">準備しています…</div><div class="prog"><div></div></div>`
  );
  const video = el("video", "analyze-video");
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

  await coach({ bubble: box, wide: true });

  try {
    video.src = url;
    video.load();
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("動画を読み込めませんでした。別の動画でためしてね。")), 20000);
      const ok = () => {
        clearTimeout(t);
        resolve();
      };
      if (video.readyState >= 1) ok();
      video.addEventListener("loadedmetadata", ok, { once: true });
      video.addEventListener("error", () => reject(new Error("この動画は読み込めませんでした。別の動画でためしてね。")), { once: true });
    });
    await loadLandmarker((p, text) => status(p, text || "準備しています…"));
    status(0, "体の動きを読み取っています… 0%");
    const pose = await detectPoses(video, (p) => status(p, `体の動きを読み取っています… ${Math.round(p * 100)}%`));
    status(1, "読み取りおわり！");
    const metrics = computeMetrics(pose, skill.motion);
    const keyframes = metrics.keyframes.map((k) => ({ ...k, dataUrl: renderStickFigure(pose, metrics, k.i) }));
    const result = makeCoaching(skill, metrics, { goal });
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    box.querySelector(".prog").remove();
    box.querySelector(".status").textContent = "見おわったよ！結果を送るね📨";

    state.current = { skill, goal, url, pose, metrics, keyframes, coach: result, rating: null, recordId: null };
    await sendResults(state.current);
    askRating();
  } catch (e) {
    console.error(e);
    video.pause();
    video.remove();
    box.querySelector(".prog")?.remove();
    box.querySelector(".status").textContent = "うまく読み取れなかったよ😢";
    state.stage = "video";
    coach(esc(e.message || "分析できませんでした。"), "全身が映るように真横から撮って、もう一度送ってみてね。").then(() => {
      cameraHint(true);
      setQuick([
        { label: "📹 もう一度送る", main: true, echo: false, action: () => $("videoInput").click() },
        { label: "技を変える", action: changeSkill },
      ]);
    });
  }
}

// ---------- 結果を送る ----------
function sendResults(cur) {
  const c = cur.coach;
  const player = createPlayer(cur);
  const msgs = [];

  msgs.push({ bubble: player.el, wide: true });

  const sum = el("div", "bubble wide");
  sum.innerHTML = `${esc(c.summary)}<div class="checklist">${c.checks
    .map((k) => `<span class="chk ${k.ok === true ? "ok" : k.ok === false ? "ng" : "na"}">${k.ok === true ? "◎" : k.ok === false ? "△" : "－"} ${esc(k.title)}</span>`)
    .join("")}</div>`;
  msgs.push({ bubble: sum, wide: true });

  if (c.goal_feedback) msgs.push(`🎯 <b>めあてについて</b>\n${esc(c.goal_feedback)}`);

  const good = el(
    "div",
    "bubble wide",
    `<div class="card-title">👍 よかったところ</div>${c.good_points.map((g) => `<div class="point good"><b>${esc(g.title)}</b><p>${esc(g.detail)}</p></div>`).join("")}`
  );
  msgs.push({ bubble: good, wide: true });

  if (!c.improvements.length) msgs.push("💡 大きく直すところは見つからなかったよ。すばらしい！🎉");
  c.improvements.forEach((m, i) => {
    const b = el(
      "div",
      "bubble wide",
      `<div class="card-title">💡 ポイント${i + 1}：${esc(m.title)}</div><div class="point tip"><p>${esc(m.detail)}</p><div class="howto">👉 ${esc(m.how_to)}</div></div>`
    );
    if (typeof m.time_sec === "number" && m.time_sec >= 0) {
      const j = el("button", "jump", `▶ ${m.time_sec.toFixed(1)}秒の場面を見る`);
      j.onclick = () => player.seekTo(m.time_sec);
      b.appendChild(j);
    }
    msgs.push({ bubble: b, wide: true });
  });

  msgs.push({
    bubble: el(
      "div",
      "bubble wide",
      `<div class="card-title">🏃 次にやってみよう</div><div class="point drill"><b>${esc(c.drill.name)}</b><p>${esc(c.drill.how)}</p><p class="small">${esc(c.drill.why)}</p></div>`
    ),
    wide: true,
  });
  if (c.reliability_note) msgs.push(`📷 <b>撮り方のアドバイス</b>\n${esc(c.reliability_note)}`);
  msgs.push(esc(c.encouragement));
  return coach(...msgs);
}

// ---------- ふりかえり ----------
function askRating() {
  coach("今日の自分はどうだった？").then(() => {
    state.stage = "rating";
    setQuick(SELF_RATINGS.map((r) => ({ label: r.label, action: () => setRating(r.id) })));
  });
}

function setRating(id) {
  clearQuick();
  state.current.rating = id;
  const reply = { good: "いいね！✨ その調子！", soso: "少しずつできてきているね👍", hard: "むずかしい技にチャレンジしたことが大事だよ💪" }[id];
  coach(reply, "最後に、次にがんばることを送ってね✏️").then(() => {
    state.stage = "reflection";
    const ideas = state.current.coach.improvements.slice(0, 2).map((m) => m.title);
    setQuick([...ideas.map((t) => ({ label: t, action: () => setReflection(t, false) })), { label: "スキップ", action: () => setReflection("", false) }]);
  });
}

function setReflection(text, echo = true) {
  if (echo) me(text);
  clearQuick();
  const ok = saveRecord(text.trim());
  coach(ok ? "記録したよ📒 上の「記録」ボタンから、いつでも見られるよ。" : "このiPadでは記録を保存できなかったよ。ごめんね🙏", "次はどうする？").then(showNextMenu);
}

function showNextMenu() {
  state.stage = "done";
  cameraHint(true);
  setQuick([
    { label: "📹 もう一回撮る", main: true, echo: false, action: () => $("videoInput").click() },
    { label: "めあてを変える", action: () => coach("新しいめあてを教えてね✏️").then(askGoal) },
    { label: "ほかの技にする", action: changeSkill },
    { label: "📒 記録を見る", echo: false, action: openHistory },
  ]);
}

// ---------- 文字が送られてきたとき ----------
function onText(text) {
  me(text);
  const t = text.trim();
  const skillHit = SKILLS.find((s) => t.includes(s.name));
  switch (state.stage) {
    case "skill":
      if (skillHit) chooseSkill(skillHit.id);
      else coach("下のボタンから技をえらんでね👇");
      return;
    case "goal":
      setGoal(t, false);
      return;
    case "rating": {
      const id = /うまく|できた!?$|よかった/.test(t) && !/少し/.test(t) ? "good" : /少し|まあまあ|ふつう/.test(t) ? "soso" : /むずかし|できなかった|だめ/.test(t) ? "hard" : null;
      if (id) setRating(id);
      else coach("下のボタンからえらんでね👇");
      return;
    }
    case "reflection":
      setReflection(t, false);
      return;
    case "analyzing":
      coach("いま動画を見ているところだよ。ちょっと待ってね⏳");
      return;
    default:
      if (skillHit) {
        clearQuick();
        chooseSkill(skillHit.id);
      } else if (/記録/.test(t)) openHistory();
      else if (/めあて/.test(t)) coach("新しいめあてを教えてね✏️").then(askGoal);
      else coach("動画を送ってくれたら分析するよ📹\n下のカメラボタンを押してね。");
  }
}

// ============================================================
// 骨格つき動画プレーヤー
// ============================================================
const players = [];

function createPlayer(cur) {
  const root = el("div", "bubble wide player");
  root.innerHTML = `<div class="card-title">🎥 骨格つき動画（スローで見てみよう）</div>
    <div class="video-wrap"><video playsinline webkit-playsinline muted preload="auto"></video><canvas></canvas></div>
    <div class="controls">
      <button class="play">▶ 再生</button>
      <button data-speed="0.25">0.25倍</button><button data-speed="0.5" class="on">0.5倍</button><button data-speed="1">1倍</button>
      <label><input type="checkbox" checked /> 骨格</label>
    </div>
    <input type="range" min="0" max="1000" value="0" aria-label="再生位置" />
    <div class="time"><span>0.00</span> 秒</div>
    <div class="card-title" style="margin-top:6px">大事な場面</div>
    <div class="keyframes"></div>
    <details class="data"><summary>くわしいデータ</summary><table></table></details>`;
  const video = root.querySelector("video");
  const canvas = root.querySelector("canvas");
  const playBtn = root.querySelector(".play");
  const range = root.querySelector("input[type=range]");
  const timeEl = root.querySelector(".time span");
  const skeleton = root.querySelector("input[type=checkbox]");
  video.muted = true;
  video.playsInline = true;
  video.src = cur.url;
  let speed = 0.5;

  const p = { el: root, video, canvas, cur, show: true, last: "" };
  players.push(p);

  const updateBtn = () => (playBtn.textContent = video.paused ? "▶ 再生" : "⏸ 止める");
  playBtn.onclick = () => {
    if (video.paused) {
      if (video.ended || video.currentTime >= video.duration - 0.05) video.currentTime = 0;
      video.playbackRate = speed;
      video.play().catch(() => {});
    } else video.pause();
  };
  video.addEventListener("play", updateBtn);
  video.addEventListener("pause", updateBtn);
  video.addEventListener("ended", updateBtn);
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
      const f = frameAt(cur.pose.frames, video.currentTime);
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

  const kfBox = root.querySelector(".keyframes");
  for (const k of cur.keyframes) {
    const b = el("button", "kf", `<img src="${k.dataUrl}" alt="" /><div>${esc(k.label)}</div><div>${k.t.toFixed(1)}秒</div>`);
    b.onclick = () => p.seekTo(k.t);
    kfBox.appendChild(b);
  }

  const prettyKey = (k) => {
    const m = k.match(/^(.*)_(度|秒|身長比)$/);
    return m ? `${m[1].replace(/_/g, "")}（${m[2]}）` : k.replace(/_/g, "");
  };
  root.querySelector("table").innerHTML = Object.entries(cur.metrics.summary)
    .map(([k, v]) => `<tr><td>${esc(prettyKey(k))}</td><td>${esc(v === true ? "はい" : v === false ? "いいえ" : v ?? "—")}</td></tr>`)
    .join("");
  return p;
}

function frameAt(frames, t) {
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

(function drawAll() {
  for (const p of players) if (p.el.isConnected) p.tick();
  requestAnimationFrame(drawAll);
})();

// ============================================================
// 記録
// ============================================================
function saveRecord(reflection) {
  const cur = state.current;
  if (!cur) return false;
  const list = store.get("history", []);
  const peak = cur.keyframes.find((k) => k.label.includes("逆さま")) || cur.keyframes[Math.floor(cur.keyframes.length / 2)];
  const record = {
    id: cur.recordId || Date.now(),
    date: new Date().toISOString(),
    skill: cur.skill.name,
    goal: cur.goal,
    rating: SELF_RATINGS.find((r) => r.id === cur.rating)?.label || "",
    reflection,
    summary: cur.coach.summary,
    tips: cur.coach.improvements.map((m) => m.title),
    thumb: peak ? renderStickFigure(cur.pose, cur.metrics, peak.i, 120) : "",
  };
  cur.recordId = record.id;
  const idx = list.findIndex((r) => r.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  return store.set("history", list.slice(0, 100));
}

function openHistory() {
  const list = store.get("history", []);
  $("historyList").innerHTML = list.length
    ? list
        .map((r) => {
          const d = new Date(r.date);
          return `<div class="hist">${r.thumb ? `<img src="${r.thumb}" alt="" />` : ""}
            <div class="meta2">${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}　${esc(r.skill)}${r.rating ? `　自己評価：${esc(r.rating)}` : ""}</div>
            ${r.goal ? `<p>🎯 ${esc(r.goal)}</p>` : ""}
            ${r.summary ? `<p>🧑‍🏫 ${esc(r.summary)}</p>` : ""}
            ${r.tips?.length ? `<p>💡 ${r.tips.map(esc).join("／")}</p>` : ""}
            ${r.reflection ? `<p>✏️ ${esc(r.reflection)}</p>` : ""}
          </div>`;
        })
        .join("")
    : `<p>まだ記録がありません。</p>`;
  $("historyDialog").showModal();
}

// ============================================================
// 入力欄
// ============================================================
function initComposer() {
  const input = $("msgInput");
  const send = $("sendBtn");
  const resize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
    send.disabled = !input.value.trim();
  };
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    resize();
    onText(text);
  };
  input.addEventListener("input", resize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  });
  send.onclick = submit;
  $("videoInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    onVideoFile(f);
  });
  $("plusBtn").onclick = () => {
    setQuick([
      { label: "技を変える", action: changeSkill },
      { label: "めあてを変える", action: () => (state.skill ? coach("新しいめあてを教えてね✏️").then(askGoal) : changeSkill()) },
      { label: "📹 撮り方のコツ", action: askVideo },
      { label: "📒 記録を見る", echo: false, action: openHistory },
    ]);
  };
  $("historyBtn").onclick = openHistory;
  $("historyClose").onclick = () => $("historyDialog").close();
}

initComposer();
start();

// 一度開いたらオフラインでも使えるようにする（Google Apps Script 版では使わない）
if ("serviceWorker" in navigator && location.protocol !== "file:" && !window.google?.script) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("オフライン機能を有効にできませんでした", e));
}
