// 動画から骨格を推定し、角度などの数値を計算するモジュール。
// 骨格推定は MediaPipe Pose Landmarker を使い、すべて端末（iPad）の中で行います。
// 動画そのものはどこにも送信しません。

const VISION_VERSION = "0.10.14";
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

// 骨格の番号（MediaPipe の33点）
export const LM = {
  nose: 0, lEar: 7, rEar: 8,
  lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
  lHeel: 29, rHeel: 30, lFoot: 31, rFoot: 32,
};

export const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
];

let landmarkerPromise = null;

export function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${VISION_URL}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
      const make = (delegate) =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      try {
        return await make("GPU");
      } catch (e) {
        console.warn("GPU が使えないため CPU で実行します", e);
        return await make("CPU");
      }
    })();
    landmarkerPromise.catch(() => (landmarkerPromise = null));
  }
  return landmarkerPromise;
}

function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      // iPad の Safari では seeked の直後にまだ描画が終わっていないことがあるため1フレーム待つ
      requestAnimationFrame(() => resolve());
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

/**
 * 動画を少しずつ進めながら骨格を推定する。
 * @returns {Promise<{fps:number, frames:Array<{t:number, lm:Array|null}>, width:number, height:number}>}
 */
export async function detectPoses(video, onProgress = () => {}) {
  const landmarker = await loadLandmarker();
  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) throw new Error("動画の長さを読み取れませんでした。");
  if (duration > 30) throw new Error("動画が長すぎます。1回の技が映った30秒以内の動画にしてください。");

  // 長い動画ほど間引く（最大で約240コマ）
  const fps = Math.min(15, 240 / duration);
  const step = 1 / fps;
  const frames = [];
  const wasMuted = video.muted;
  video.muted = true;
  video.pause();

  for (let t = 0, i = 0; t < duration - 0.02; t += step, i++) {
    await seek(video, t);
    let lm = null;
    try {
      const res = landmarker.detectForVideo(video, Math.round(t * 1000) + 1);
      if (res.landmarks && res.landmarks.length > 0) {
        lm = res.landmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 }));
      }
    } catch (e) {
      console.warn("骨格推定エラー", e);
    }
    frames.push({ t, lm });
    onProgress(Math.min(1, t / duration));
  }
  video.muted = wasMuted;
  onProgress(1);
  smoothFrames(frames);
  return { fps, frames, width: video.videoWidth, height: video.videoHeight };
}

// 抜けたコマを前後から補い、ガタつきを軽くならす
function smoothFrames(frames) {
  const n = frames.length;
  // 短い欠落（2コマまで）は前後の平均で補う
  for (let i = 1; i < n - 1; i++) {
    if (frames[i].lm) continue;
    let j = i + 1;
    while (j < n && !frames[j].lm && j - i < 3) j++;
    const prev = frames[i - 1].lm;
    const next = j < n ? frames[j].lm : null;
    if (prev && next) {
      for (let k = i; k < j; k++) {
        const a = (k - i + 1) / (j - i + 1);
        frames[k].lm = prev.map((p, idx) => ({
          x: p.x + (next[idx].x - p.x) * a,
          y: p.y + (next[idx].y - p.y) * a,
          z: p.z + (next[idx].z - p.z) * a,
          v: Math.min(p.v, next[idx].v) * 0.8,
        }));
        frames[k].interpolated = true;
      }
    }
  }
  // 3コマの移動平均
  const orig = frames.map((f) => f.lm);
  for (let i = 0; i < n; i++) {
    if (!orig[i]) continue;
    const nb = [orig[i - 1], orig[i], orig[i + 1]].filter(Boolean);
    frames[i].lm = orig[i].map((p, idx) => ({
      x: nb.reduce((s, f) => s + f[idx].x, 0) / nb.length,
      y: nb.reduce((s, f) => s + f[idx].y, 0) / nb.length,
      z: p.z,
      v: p.v,
    }));
  }
}

// ---------- 数値の計算 ----------

const deg = (r) => (r * 180) / Math.PI;

function angleAt(a, b, c) {
  // b を頂点とする角度（0〜180度）
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (d === 0) return null;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))));
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

/** 1コマ分の特徴量を計算（座標はピクセル比に直してから計算） */
function frameFeatures(lm, W, H, floorY, bodyLen) {
  const P = lm.map((p) => ({ x: p.x * W, y: p.y * H, v: p.v }));
  // カメラに近い側（よく見えている側）を選ぶ
  const visL = P[11].v + P[13].v + P[15].v + P[23].v + P[25].v + P[27].v;
  const visR = P[12].v + P[14].v + P[16].v + P[24].v + P[26].v + P[28].v;
  const s = visL >= visR
    ? { sh: P[11], el: P[13], wr: P[15], hip: P[23], kn: P[25], an: P[27], ear: P[7] }
    : { sh: P[12], el: P[14], wr: P[16], hip: P[24], kn: P[26], an: P[28], ear: P[8] };

  const shoulder = mid(P[11], P[12]);
  const hip = mid(P[23], P[24]);
  const head = P[0];

  // 体幹の傾き：腰→肩 の向きが真上なら0度、真下（逆さま）なら180度
  const tx = shoulder.x - hip.x, ty = shoulder.y - hip.y;
  const torsoTilt = deg(Math.acos(Math.max(-1, Math.min(1, -ty / (Math.hypot(tx, ty) || 1)))));

  const kneeL = angleAt(P[23], P[25], P[27]);
  const kneeR = angleAt(P[24], P[26], P[28]);
  const knee = angleAt(s.hip, s.kn, s.an);
  const hipAng = angleAt(s.sh, s.hip, s.kn);
  const elbow = angleAt(s.sh, s.el, s.wr);
  // 首の曲がり：腰-肩-耳 の角度（180度に近いほど頭と背中が一直線、小さいほど頭が曲がっている）
  const neck = angleAt(s.hip, s.sh, s.ear);
  // 足の開き：左右の太ももの間の角度（真横からだと小さめに出ます）
  const legSpread = angleAt(P[25], hip, P[26]);

  const lowestWrist = Math.max(P[15].y, P[16].y);
  const h = (y) => (floorY - y) / bodyLen; // 床からの高さ（身長に対する割合）

  return {
    torsoTilt,
    knee,
    kneeMin: Math.min(kneeL ?? 180, kneeR ?? 180),
    hip: hipAng,
    elbow,
    neck,
    legSpread,
    hipHeight: h(hip.y),
    headHeight: h(head.y),
    shoulderHeight: h(shoulder.y),
    feetHeight: h(Math.min(P[27].y, P[28].y)),
    wristHeight: h(lowestWrist),
    inverted: hip.y < shoulder.y - bodyLen * 0.05,
    hipX: hip.x / bodyLen,
    vis: (visL + visR) / 12,
  };
}

const r0 = (x) => (x == null || !isFinite(x) ? null : Math.round(x));
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);

/**
 * 骨格データから、AIコーチに渡す数値まとめとキーフレームを作る。
 */
export function computeMetrics(pose, motion = "") {
  const { frames, width: W, height: H } = pose;
  const valid = frames.filter((f) => f.lm);
  const detectionRate = valid.length / Math.max(1, frames.length);
  if (valid.length < 5) {
    throw new Error("体をうまく見つけられませんでした。全身が映るように、真横から撮り直してみてください。");
  }

  // 床の高さ＝足首の一番低い位置。体の大きさ＝肩〜足首の長さの中央値
  const ankleYs = valid.map((f) => Math.max(f.lm[27].y, f.lm[28].y) * H).sort((a, b) => a - b);
  const floorY = ankleYs[Math.floor(ankleYs.length * 0.9)];
  const lens = valid
    .map((f) => {
      const sh = mid(f.lm[11], f.lm[12]), hp = mid(f.lm[23], f.lm[24]);
      const an = mid(f.lm[27], f.lm[28]);
      return Math.hypot((sh.x - hp.x) * W, (sh.y - hp.y) * H) + Math.hypot((hp.x - an.x) * W, (hp.y - an.y) * H);
    })
    .sort((a, b) => a - b);
  const bodyLen = lens[Math.floor(lens.length / 2)] || H * 0.5;

  for (const f of frames) f.feat = f.lm ? frameFeatures(f.lm, W, H, floorY, bodyLen) : null;

  const F = frames.map((f, i) => ({ i, t: f.t, ...f.feat })).filter((f) => f.torsoTilt != null);

  // 進む方向（右向きなら +1）
  const travel = F[F.length - 1].hipX - F[0].hipX;
  const direction = travel >= 0 ? 1 : -1;

  // 回転の中心となる場面＝体幹が最も逆さまになったコマ
  const peak = F.reduce((a, b) => (b.torsoTilt > a.torsoTilt ? b : a));
  const rotating = F.filter((f) => f.torsoTilt > 90);
  const rollStart = rotating.length ? rotating[0] : peak;
  const rollEnd = rotating.length ? rotating[rotating.length - 1] : peak;

  // 手が床についた最初のコマ
  const handsDown = F.find((f) => f.wristHeight < 0.12 && f.t <= peak.t) || null;
  // 回転後に立ち上がった（腰が高くなった）コマ
  const after = F.filter((f) => f.t > rollEnd.t);
  const standUp = after.find((f) => f.hipHeight > 0.45 && f.torsoTilt < 45) || after[after.length - 1] || null;
  // 回転中で体が最も小さく丸まったコマ
  const rollPhase = F.filter((f) => f.t >= rollStart.t - 0.2 && f.t <= rollEnd.t + 0.3);
  const tightest = rollPhase.length ? rollPhase.reduce((a, b) => (b.hip < a.hip ? b : a)) : peak;
  // 立ち上がりの直前（回転が終わってから立つまで）
  const risePhase = after.filter((f) => !standUp || f.t <= standUp.t);
  const handsAtRise = risePhase.some((f) => f.wristHeight < 0.08);
  // 倒立に近い場面（足が最も高いコマ）
  const highestFeet = F.reduce((a, b) => (b.feetHeight > a.feetHeight ? b : a));

  const pick = (f, label) => (f ? { i: f.i, t: f.t, label } : null);
  let keyframes = [
    pick(F[0], "はじめの姿勢"),
    pick(handsDown, "手をついたところ"),
    pick(rollStart !== peak ? rollStart : null, "回転に入るところ"),
    pick(peak, "いちばん逆さまのところ"),
    pick(tightest !== peak ? tightest : null, "いちばん体が丸まったところ"),
    pick(highestFeet !== peak && highestFeet.feetHeight > 0.8 ? highestFeet : null, "足がいちばん高いところ"),
    pick(standUp, "立ち上がるところ"),
    pick(F[F.length - 1], "おわりの姿勢"),
  ].filter(Boolean);
  // 時刻が近すぎるものはまとめる
  keyframes.sort((a, b) => a.t - b.t);
  keyframes = keyframes.filter((k, idx) => idx === 0 || k.t - keyframes[idx - 1].t > 0.12);

  const minOf = (arr, key) => {
    const xs = arr.map((f) => f[key]).filter((x) => x != null);
    return xs.length ? Math.min(...xs) : null;
  };
  const maxOf = (arr, key) => {
    const xs = arr.map((f) => f[key]).filter((x) => x != null);
    return xs.length ? Math.max(...xs) : null;
  };

  const summary = {
    動画の長さ_秒: r2(frames[frames.length - 1].t),
    骨格を検出できたコマの割合: r2(detectionRate),
    進む方向: direction > 0 ? "画面の右へ" : "画面の左へ",
    回転にかかった時間_秒: rotating.length ? r2(rollEnd.t - rollStart.t) : null,
    体幹のいちばん大きな傾き_度: r0(peak.torsoTilt),
    逆さまになった場面の時刻_秒: r2(peak.t),
    回転中のいちばん小さい腰の角度_度: r0(minOf(rollPhase, "hip")),
    回転中のいちばん小さいひざの角度_度: r0(minOf(rollPhase, "kneeMin")),
    回転中のいちばん大きいひざの角度_度: r0(maxOf(rollPhase, "knee")),
    回転中のいちばん小さい首の角度_度: r0(minOf(rollPhase, "neck")),
    逆さまの場面のひじの角度_度: r0(peak.elbow),
    逆さまの場面の腰の角度_度: r0(peak.hip),
    逆さまの場面のひざの角度_度: r0(peak.knee),
    足先のいちばん高い位置_身長比: r2(highestFeet.feetHeight),
    立ち上がりまでの足の開きの最大_度: r0(maxOf(risePhase.length ? risePhase : after, "legSpread")),
    立ち上がりのときのひざの角度_度: standUp ? r0(standUp.knee) : null,
    立ち上がりで手が床についていたか: handsAtRise,
    立ち上がれたか: !!(standUp && standUp.hipHeight > 0.45),
  };

  // 時系列（最大40行に間引き）
  const stride = Math.max(1, Math.ceil(F.length / 40));
  const timeline = F.filter((_, idx) => idx % stride === 0).map((f) => ({
    t: r2(f.t),
    体幹傾き: r0(f.torsoTilt),
    腰: r0(f.hip),
    ひざ: r0(f.knee),
    ひじ: r0(f.elbow),
    首: r0(f.neck),
    足の開き: r0(f.legSpread),
    腰の高さ: r2(f.hipHeight),
    頭の高さ: r2(f.headHeight),
    手首の高さ: r2(f.wristHeight),
  }));

  const warnings = [];
  if (detectionRate < 0.6) warnings.push("体を見つけられないコマが多くありました。");
  if (bodyLen < H * 0.25 && bodyLen < W * 0.25) warnings.push("体が小さく映っています。もう少し近くから撮ると正確になります。");
  if (!rotating.length && motion !== "handstand") warnings.push("回転している場面をはっきり見つけられませんでした。");

  return { summary, timeline, keyframes, warnings, direction, floorY, bodyLen };
}

// ---------- 描画 ----------

/** 動画の上に骨格を重ねて描く */
export function drawSkeleton(ctx, lm, W, H, opts = {}) {
  if (!lm) return;
  const { color = "#22d3ee", joint = "#ffffff", width = Math.max(3, W / 200) } = opts;
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  for (const [a, b] of BONES) {
    if (lm[a].v < 0.3 || lm[b].v < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * W, lm[a].y * H);
    ctx.lineTo(lm[b].x * W, lm[b].y * H);
    ctx.stroke();
  }
  // 頭
  const sh = mid(lm[11], lm[12]);
  const head = lm[0];
  ctx.beginPath();
  ctx.moveTo(sh.x * W, sh.y * H);
  ctx.lineTo(head.x * W, head.y * H);
  ctx.stroke();
  ctx.fillStyle = joint;
  for (const idx of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (lm[idx].v < 0.3) continue;
    ctx.beginPath();
    ctx.arc(lm[idx].x * W, lm[idx].y * H, width * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 顔や服装が写らない「棒人間」の画像を作る（AIコーチに送るのはこの画像だけ）。
 * 進む方向が右になるように左右をそろえる。
 */
export function renderStickFigure(pose, metrics, frameIndex, size = 384) {
  const { frames, width: W, height: H } = pose;
  const lm = frames[frameIndex].lm;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // 縮尺は全コマ共通（体の大きさ基準）にして、左右はそのコマの体の中心に合わせる
  const span = metrics.bodyLen * 2.6;
  let cx = W / 2;
  if (lm) {
    const xs = lm.filter((p) => p.v >= 0.3).map((p) => p.x * W);
    if (xs.length) cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  const cy = metrics.floorY - span * 0.36;
  const flip = metrics.direction < 0;
  const tx = (x) => size / 2 + ((flip ? -1 : 1) * (x - cx) / span) * size;
  const ty = (y) => size / 2 + ((y - cy) / span) * size;

  // 床
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ty(metrics.floorY));
  ctx.lineTo(size, ty(metrics.floorY));
  ctx.stroke();

  if (!lm) return canvas.toDataURL("image/png");
  const P = lm.map((p) => ({ x: tx(p.x * W), y: ty(p.y * H), v: p.v }));
  const seg = (a, b, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  // 左半身＝青、右半身＝オレンジ、体幹＝黒
  const L = "#2563eb", R = "#ea580c", C = "#111827";
  seg(P[11], P[13], L); seg(P[13], P[15], L); seg(P[23], P[25], L); seg(P[25], P[27], L); seg(P[27], P[31], L);
  seg(P[12], P[14], R); seg(P[14], P[16], R); seg(P[24], P[26], R); seg(P[26], P[28], R); seg(P[28], P[32], R);
  seg(P[11], P[12], C); seg(P[23], P[24], C); seg(P[11], P[23], C); seg(P[12], P[24], C);
  const sh = mid(P[11], P[12]);
  const headC = { x: (P[0].x + P[7].x + P[8].x) / 3, y: (P[0].y + P[7].y + P[8].y) / 3 };
  seg(sh, headC, C);
  // 頭（円）と鼻の向き（顔の向きがわかるように小さな点）
  const r = Math.max(8, Math.hypot(P[7].x - P[8].x, P[7].y - P[8].y) * 0.9);
  ctx.fillStyle = "#fde68a";
  ctx.strokeStyle = C;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(headC.x, headC.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C;
  ctx.beginPath();
  ctx.arc(P[0].x, P[0].y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL("image/png");
}
