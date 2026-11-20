import { SKILLS, SELF_RATINGS, findSkill } from "./skills.js";
import { loadLandmarker, detectPoses, computeMetrics, drawSkeleton, renderStickFigure } from "./analyze.js";
import { makeCoaching } from "./coach.js";

const $ = (id) => document.getElementById(id);
const state = {
  skill: null,
  pose: null,
  metrics: null,
  keyframes: [],
  coach: null,
  rating: null,
  speed: 0.5,
  showSkeleton: true,
  savedId: null,
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
const show = (el, on = true) => el.classList.toggle("hidden", !on);

// ---------- ステップ1: 技の選択 ----------
function renderSkills() {
  const list = $("skillList");
  list.innerHTML = "";
  for (const s of SKILLS) {
    const b = document.createElement("button");
    b.className = "skill";
    b.innerHTML = `<b>${esc(s.name)}</b><small>${esc(s.group)}</small>`;
    b.onclick = () => selectSkill(s.id);
    b.dataset.id = s.id;
    list.appendChild(b);
  }
  const last = store.get("lastSkill", null);
  if (last && findSkill(last)) selectSkill(last);
}

function selectSkill(id) {
  state.skill = findSkill(id);
  store.set("lastSkill", id);
  document.querySelectorAll(".skill").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
  $("pointsList").innerHTML = state.skill.points.map((p) => `<li>${esc(p)}</li>`).join("");
  show($("pointsBox"));
  // 骨格推定の準備を先に始めておく
  loadLandmarker().catch(() => {});
}

// ---------- ステップ2〜3: 動画を読み込んで分析 ----------
async function onVideoSelected(file) {
  if (!file) return;
  if (!state.skill) {
    alert("先に技をえらんでください。");
    return;
  }
  show($("step-skill"), false);
  show($("step-video"), false);
  show($("step-result"), false);
  show($("step-progress"));
  setProgress(0, "動画を読み込んでいます…");
  window.scrollTo({ top: 0 });

  const video = $("video");
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(file);
  video.load();
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("この動画は読み込めませんでした。"));
    });
    // iPad では一度再生しないとコマ送りで画像が出ないことがあるため
    try {
      await video.play();
      video.pause();
    } catch {}

    setProgress(0, "骨格を見つける準備をしています…");
    await loadLandmarker((p, text) => setProgress(p, text || "骨格を見つける準備をしています…"));
    state.pose = await detectPoses(video, (p) => setProgress(p, `骨格を見つけています… ${Math.round(p * 100)}%`));
    state.metrics = computeMetrics(state.pose, state.skill.motion);
    state.keyframes = state.metrics.keyframes.map((k) => ({
      ...k,
      dataUrl: renderStickFigure(state.pose, state.metrics, k.i),
    }));
  } catch (e) {
    console.error(e);
    show($("step-progress"), false);
    show($("step-skill"));
    show($("step-video"));
    alert(e.message || "分析できませんでした。");
    return;
  }

  show($("step-progress"), false);
  showResult();
  runCoach();
}

function setProgress(p, text) {
  $("progressBar").style.width = `${Math.round(p * 100)}%`;
  $("progressText").textContent = text;
}

// ---------- ステップ4: 結果 ----------
function showResult() {
  show($("step-result"));
  state.rating = null;
  state.savedId = null;
  $("reflection").value = "";
  $("saveMsg").textContent = "";
  renderRatings();
  $("coachSkill").textContent = `${state.skill.name}${$("goal").value.trim() ? `／めあて：${$("goal").value.trim()}` : ""}`;

  const video = $("video");
  video.currentTime = 0;
  video.playbackRate = state.speed;
  $("keyframes").innerHTML = "";
  for (const k of state.keyframes) {
    const b = document.createElement("button");
    b.className = "kf";
    b.innerHTML = `<img src="${k.dataUrl}" alt="" /><div>${esc(k.label)}</div><div>${k.t.toFixed(1)}秒</div>`;
    b.onclick = () => seekTo(k.t);
    $("keyframes").appendChild(b);
  }
  renderMetricsTable();
  drawLoop();
}

function seekTo(t) {
  const video = $("video");
  video.pause();
  video.currentTime = Math.max(0, Math.min(video.duration || 0, t));
  updatePlayBtn();
  $("video").scrollIntoView({ behavior: "smooth", block: "center" });
}

function updatePlayBtn() {
  $("playBtn").textContent = $("video").paused ? "▶ 再生" : "⏸ 止める";
}

function frameAt(t) {
  const frames = state.pose?.frames;
  if (!frames?.length) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (frames[m].t <= t) lo = m;
    else hi = m - 1;
  }
  const a = frames[lo], b = frames[lo + 1];
  if (b && Math.abs(b.t - t) < Math.abs(a.t - t)) return b;
  return a;
}

let looping = false;
function drawLoop() {
  if (looping) return;
  looping = true;
  const video = $("video");
  const canvas = $("overlay");
  const ctx = canvas.getContext("2d");
  const tick = () => {
    if (!state.pose || $("step-result").classList.contains("hidden")) {
      looping = false;
      return;
    }
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(rect.width * dpr), ch = Math.round(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.clearRect(0, 0, cw, ch);
    if (state.showSkeleton && video.videoWidth) {
      // object-fit: contain の余白を考えて、動画が映っている範囲に合わせる
      const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
      const w = video.videoWidth * scale, h = video.videoHeight * scale;
      ctx.save();
      ctx.translate((cw - w) / 2, (ch - h) / 2);
      const f = frameAt(video.currentTime);
      if (f?.lm) drawSkeleton(ctx, f.lm, w, h, { width: Math.max(3, w / 180) });
      ctx.restore();
    }
    if (video.duration) {
      $("seek").value = String(Math.round((video.currentTime / video.duration) * 1000));
      $("timeNow").textContent = video.currentTime.toFixed(2);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderMetricsTable() {
  const rows = Object.entries(state.metrics.summary)
    .map(([k, v]) => {
      const val = v === true ? "はい" : v === false ? "いいえ" : v == null ? "—" : v;
      return `<tr><td>${esc(prettyKey(k))}</td><td>${esc(val)}</td></tr>`;
    })
    .join("");
  const warn = state.metrics.warnings.map((w) => `<div class="warn">⚠️ ${esc(w)}</div>`).join("");
  $("metricsTable").innerHTML = `<table>${rows}</table>${warn}
    <p class="note">角度は、関節が伸びているほど180度に近くなります。体幹の傾きは、立っていると0度、逆さまで180度です。真横からの撮影でないと、正確に出ないことがあります。</p>`;
}
function prettyKey(k) {
  const m = k.match(/^(.*)_(度|秒|身長比)$/);
  return m ? `${m[1].replace(/_/g, "")}（${m[2]}）` : k.replace(/_/g, "");
}

function renderRatings() {
  const box = $("selfRating");
  box.innerHTML = "";
  for (const r of SELF_RATINGS) {
    const b = document.createElement("button");
    b.textContent = r.label;
    b.className = state.rating === r.id ? "on" : "";
    b.onclick = () => {
      state.rating = r.id;
      renderRatings();
    };
    box.appendChild(b);
  }
}

// ---------- コーチ ----------
function runCoach() {
  show($("coachError"), false);
  show($("coachBody"), false);
  show($("coachLoading"));
  // 少しだけ「考えている」間をとってから表示する
  setTimeout(() => {
    try {
      state.coach = makeCoaching(state.skill, state.metrics, { goal: $("goal").value });
      renderCoach(state.coach);
    } catch (e) {
      console.error(e);
      show($("coachLoading"), false);
      $("coachError").textContent = "コメントを作れませんでした。撮り直してためしてください。";
      show($("coachError"));
    }
  }, 700);
}

function renderCoach(c) {
  show($("coachLoading"), false);
  const timeBtn = (t) =>
    typeof t === "number" && t >= 0 ? `<button class="jump" data-t="${t}">▶ ${t.toFixed(1)}秒の場面を見る</button>` : "";
  const html = [
    `<div class="bubble">${esc(c.summary)}</div>`,
    `<div class="checklist">${c.checks
      .map((k) => `<span class="chk ${k.ok === true ? "ok" : k.ok === false ? "ng" : "na"}">${k.ok === true ? "◎" : k.ok === false ? "△" : "－"} ${esc(k.title)}</span>`)
      .join("")}</div>`,
    c.goal_feedback ? `<div class="sec-title">🎯 めあてについて</div><p>${esc(c.goal_feedback)}</p>` : "",
    `<div class="sec-title">👍 よかったところ</div>`,
    ...c.good_points.map((g) => `<div class="item good"><b>${esc(g.title)}</b><p>${esc(g.detail)}</p></div>`),
    `<div class="sec-title">💡 もっとよくなるポイント</div>`,
    c.improvements.length ? "" : `<p>今回の動画では、大きく直すところは見つかりませんでした。すばらしいです！</p>`,
    ...c.improvements.map(
      (m, i) => `<div class="item tip"><b>${i + 1}. ${esc(m.title)}</b><p>${esc(m.detail)}</p>
        <div class="howto">👉 ${esc(m.how_to)}</div>${timeBtn(m.time_sec)}</div>`
    ),
    `<div class="sec-title">🏃 次にやってみよう</div>`,
    `<div class="item drill"><b>${esc(c.drill.name)}</b><p>${esc(c.drill.how)}</p><p class="note">${esc(c.drill.why)}</p></div>`,
    `<div class="cheer">${esc(c.encouragement)}</div>`,
    c.reliability_note ? `<div class="warn">📷 ${esc(c.reliability_note)}</div>` : "",
  ].join("");
  const body = $("coachBody");
  body.innerHTML = html;
  body.querySelectorAll(".jump").forEach((b) => (b.onclick = () => seekTo(Number(b.dataset.t))));
  show(body);
  if (!$("reflection").value && c.improvements[0]) {
    $("reflection").placeholder = `例：${c.improvements[0].title}`;
  }
}

// ---------- 記録 ----------
function saveRecord() {
  if (!state.metrics) return;
  const list = store.get("history", []);
  const peak = state.keyframes.find((k) => k.label.includes("逆さま")) || state.keyframes[Math.floor(state.keyframes.length / 2)];
  const record = {
    id: state.savedId || Date.now(),
    date: new Date().toISOString(),
    skill: state.skill.name,
    goal: $("goal").value.trim(),
    rating: SELF_RATINGS.find((r) => r.id === state.rating)?.label || "",
    reflection: $("reflection").value.trim(),
    summary: state.coach?.summary || "",
    tips: (state.coach?.improvements || []).map((m) => m.title),
    thumb: peak ? renderStickFigure(state.pose, state.metrics, peak.i, 120) : "",
  };
  const idx = list.findIndex((r) => r.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  state.savedId = record.id;
  const ok = store.set("history", list.slice(0, 100));
  $("saveMsg").textContent = ok ? "記録しました。上の「ふりかえりの記録」から見られます。" : "このiPadでは記録を保存できませんでした。";
}

function openHistory() {
  const list = store.get("history", []);
  $("historyList").innerHTML = list.length
    ? list
        .map((r) => {
          const d = new Date(r.date);
          return `<div class="hist">${r.thumb ? `<img src="${r.thumb}" alt="" style="float:right;width:72px;border-radius:8px;margin-left:8px" />` : ""}
            <div class="meta">${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}　${esc(r.skill)}${r.rating ? `　自己評価：${esc(r.rating)}` : ""}</div>
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

// ---------- イベント ----------
function init() {
  renderSkills();
  $("videoInput").addEventListener("change", (e) => {
    onVideoSelected(e.target.files[0]);
    e.target.value = "";
  });
  const video = $("video");
  $("playBtn").onclick = () => {
    if (video.paused) {
      if (video.ended || video.currentTime >= video.duration - 0.05) video.currentTime = 0;
      video.playbackRate = state.speed;
      video.play();
    } else video.pause();
  };
  video.addEventListener("play", updatePlayBtn);
  video.addEventListener("pause", updatePlayBtn);
  video.addEventListener("ended", updatePlayBtn);
  document.querySelectorAll(".speed button").forEach((b) => {
    b.onclick = () => {
      state.speed = Number(b.dataset.speed);
      video.playbackRate = state.speed;
      document.querySelectorAll(".speed button").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  $("seek").addEventListener("input", (e) => {
    video.pause();
    if (video.duration) video.currentTime = (Number(e.target.value) / 1000) * video.duration;
  });
  $("skeletonToggle").onchange = (e) => (state.showSkeleton = e.target.checked);
  $("saveBtn").onclick = saveRecord;
  $("againBtn").onclick = () => {
    video.pause();
    show($("step-result"), false);
    show($("step-skill"));
    show($("step-video"));
    window.scrollTo({ top: 0 });
  };
  $("historyBtn").onclick = openHistory;
  $("historyClose").onclick = () => $("historyDialog").close();
}

init();

// 一度開いたらオフラインでも使えるようにする
if ("serviceWorker" in navigator && location.protocol !== "file:" && !window.google?.script) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("オフライン機能を有効にできませんでした", e));
}
