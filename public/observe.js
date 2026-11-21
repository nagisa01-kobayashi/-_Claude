// 分析結果を「事実」として伝えるためのモジュール（アドバイスはしません）
// 骨格から計算した数値を、中学生にわかる言葉の「観察」にします。

const fmtDeg = (x) => (x == null ? null : `約${Math.round(x)}°`);
const fmtSec = (x) => (x == null ? null : `${(Math.round(x * 10) / 10).toFixed(1)}秒`);
const fmtRatio = (x) => (x == null ? null : `身長の約${(Math.round(x * 10) / 10).toFixed(1)}倍`);

// 観察項目：key（前回と比べるため）, label, 値, 説明
function obsItem(key, label, value, raw, hint, time) {
  return value == null ? null : { key, label, value, raw, hint, time: time ?? null };
}

export function observe(skill, metrics) {
  const r = metrics.raw;
  const m = skill.motion;
  const list = [];
  const roll = m === "forward-roll" || m === "backward-roll" || m === "handstand-roll";
  list.push(obsItem("peakT", "いちばん逆さまになった時刻", fmtSec(r.peakT), r.peakT, "動画のこの時刻を見てみよう", r.peakT));
  if (roll) {
    list.push(obsItem("rollDur", "回転にかかった時間", fmtSec(r.rollDur), r.rollDur, "短いほど、すばやく回っている"));
    list.push(obsItem("minHipRoll", "回っているときの腰の角度（いちばん小さいとき）", fmtDeg(r.minHipRoll), r.minHipRoll, "小さいほど体が丸まっている", r.tightestT));
    list.push(obsItem("minNeckRoll", "回っているときの首の角度（いちばん小さいとき）", fmtDeg(r.minNeckRoll), r.minNeckRoll, "小さいほど、あごを引いて頭が丸まっている", r.neckT));
    list.push(obsItem("medianKneeRoll", "回っているときのひざの角度", fmtDeg(r.medianKneeRoll), r.medianKneeRoll, "180°に近いほど、ひざが伸びている"));
  }
  if (m === "backward-roll") {
    list.push(obsItem("maxElbowAfterPeak", "逆さまのあとのひじの角度（いちばん伸びたとき）", fmtDeg(r.maxElbowAfterPeak), r.maxElbowAfterPeak, "180°に近いほど、腕で押せている", r.peakT));
  }
  if (m === "cartwheel" || m === "handstand" || m === "handstand-roll") {
    list.push(obsItem("maxFeetH", "足先のいちばん高い位置", fmtRatio(r.maxFeetH), r.maxFeetH, "1.0をこえると、立っているときの頭より高い", r.highestFeetT));
    list.push(obsItem("peakElbow", "逆さまのときのひじの角度", fmtDeg(r.peakElbow), r.peakElbow, "180°に近いほど、ひじが伸びている", r.peakT));
    list.push(obsItem("peakHip", "逆さまのときの腰の角度", fmtDeg(r.peakHip), r.peakHip, "180°に近いほど、体がまっすぐ", r.peakT));
    list.push(obsItem("peakKnee", "逆さまのときのひざの角度", fmtDeg(r.peakKnee), r.peakKnee, "180°に近いほど、ひざが伸びている", r.peakT));
  }
  if (m === "cartwheel") list.push(obsItem("peakSpread", "逆さまのときの足の開き", fmtDeg(r.peakSpread), r.peakSpread, "大きいほど、足が開いている", r.peakT));
  if (m === "handstand") list.push(obsItem("invertedHold", "逆さまの姿勢が続いた時間", fmtSec(r.invertedHold), r.invertedHold, "長いほど、倒立を保てている"));
  if (/kaikyaku/.test(skill.id)) list.push(obsItem("maxSpreadRise", "立ち上がるまでの足の開き（いちばん大きいとき）", fmtDeg(r.maxSpreadRise), r.maxSpreadRise, "真横から撮ると小さめに出る", r.riseT));
  if (m !== "handstand") {
    list.push(obsItem("standKnee", "立ち上がるときのひざの角度", fmtDeg(r.standKnee), r.standKnee, "180°に近いほど、ひざが伸びている", r.standT));
    if (r.stoodUp) list.push(obsItem("handsAtRise", "立ち上がるときに手が床に", r.handsAtRise ? "ついていた" : "ついていなかった", r.handsAtRise ? 1 : 0, "", r.riseT));
    list.push(obsItem("stoodUp", "最後に立ち上がれたか", r.stoodUp ? "立ち上がれた" : "読み取れなかった", r.stoodUp ? 1 : 0, ""));
  }
  const notes = [];
  if (r.detectionRate < 0.7) notes.push("体を見つけられない場面が多くありました。全身が映るように撮ると、より正確になります。");
  if (!r.rotated && m !== "handstand") notes.push("回転している場面をはっきり読み取れませんでした。真横から撮ると、より正確になります。");
  return { items: list.filter(Boolean), notes };
}

/** 前回の観察と比べる（数値の項目だけ） */
export function compareObs(prev, cur) {
  if (!prev) return [];
  const out = [];
  for (const c of cur.items) {
    const p = prev.items.find((x) => x.key === c.key);
    if (!p || typeof c.raw !== "number" || typeof p.raw !== "number" || ["stoodUp", "handsAtRise", "peakT"].includes(c.key)) continue;
    const diff = c.raw - p.raw;
    const unit = c.value.includes("°") ? "°" : c.value.includes("秒") ? "秒" : "";
    const d = unit === "°" ? Math.round(diff) : Math.round(diff * 10) / 10;
    if (d === 0) continue;
    out.push({ label: c.label, text: `${p.value} → ${c.value}（${d > 0 ? "+" : ""}${d}${unit}）` });
  }
  return out;
}

/** 保存用に、大事な場面の骨格だけを小さくまとめる */
export function packKeyframes(pose, metrics) {
  const q = (x) => Math.round(x * 1000) / 1000;
  return metrics.keyframes.map((k) => ({
    t: Math.round(k.t * 100) / 100,
    label: k.label,
    lm: (pose.frames[k.i].lm || []).map((p) => [q(p.x), q(p.y), Math.round(p.v * 100) / 100]),
  }));
}
export function unpackLm(arr) {
  return (arr || []).map(([x, y, v]) => ({ x, y, z: 0, v }));
}
