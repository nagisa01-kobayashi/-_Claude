// マット運動 AIコーチ — サーバー
// ・public/ の画面を配信する
// ・/api/coach で、iPad から届いた「数値データ」と「棒人間の画像」を Claude に渡し、
//   コーチのアドバイスを返す（動画や顔の写った画像は受け取りません）
//
// 起動:  ANTHROPIC_API_KEY=... npm start
// お試し（AIを使わない見本の回答）:  npm run mock

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { findSkill, SELF_RATINGS } from "./public/skills.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT || 8080);
const MOCK = process.env.MOCK_COACH === "1";
const PASSCODE = process.env.APP_PASSCODE || ""; // 設定すると、合言葉を知っている人だけが使える
const MODEL = process.env.COACH_MODEL || "claude-opus-5-5";
const MAX_BODY = 6 * 1024 * 1024;
const LIMIT_PER_HOUR = Number(process.env.LIMIT_PER_HOUR || 60); // 1台あたり1時間の上限回数

const client = MOCK ? null : new Anthropic();

// ---------- AIコーチへの指示 ----------

const SYSTEM_PROMPT = `あなたは中学校の保健体育でマット運動を教える、やさしくて頼れるコーチです。
生徒が自分の演技の動画をiPadで撮り、アプリが骨格（関節の位置）を推定しました。あなたには次のものが届きます。
- 技の名前と、その技の「ポイント」「よくあるつまずき」（先生が用意したもの）
- 生徒の「今日のめあて」と自己評価（書いていない場合もあります）
- 骨格から計算した数値のまとめと、時間ごとの数値の変化
- 大事な場面の「棒人間」の画像（顔や服装は写っていません。進む方向が右になるようにそろえてあります。青が左半身、オレンジが右半身、黄色の丸が頭、頭の中の黒い点が鼻の位置、灰色の線が床です）

数値の読み方:
- 体幹傾き: 腰から肩への向き。0度＝まっすぐ立っている、90度＝横向き、180度＝真っ逆さま
- 腰・ひざ・ひじの角度: 180度に近いほど伸びている、小さいほど曲がっている
- 首の角度: 腰-肩-耳の角度。180度に近いほど頭と背中が一直線。前転や後転で小さくなっていれば、あごを引いて背中が丸まっている可能性が高い
- 足の開き: 左右の太ももの間の角度。真横から撮った動画では実際より小さく出ます
- 高さ: 床からの高さを身長に対する割合で表したもの（1.0でおよそ身長ぶん）
- 骨格の推定は、体が逆さまになったり丸まったりする場面でずれることがあります。数値と画像が食いちがうときは、決めつけずに「〜かもしれません」と伝えてください

アドバイスの書き方:
- 中学生が読んでわかる、やさしい言葉と「です・ます」で書く。専門用語には短い説明をそえる
- まず良かったところを具体的にほめる。次に、伸ばすポイントを多くても3つにしぼる。いちばん大事なものを最初に書く
- 「どこを」「どうすると」良くなるのか、体の感覚で伝わる言葉（例:「おへそをのぞきこむように」）で書く
- 伸ばすポイントには、その場面の時刻（秒）をそえる。動画のどこを見ればよいか生徒がわかるようにする
- 生徒の「めあて」があれば、それができていたかに必ずふれる
- 首や手首など、けがにつながる動きが見られたら、やさしく、でもはっきり伝える
- 次にやってみる練習を1つ、安全に一人でもできるものを提案する（例: ゆりかご、坂道マットでの前転、かえるの足打ち など）
- 数値をそのまま並べない。必要なときだけ「ひざが伸びていました」のように言葉で伝える
- 撮り方の問題で分析しにくかった場合は、reliability_note に次の撮り方のコツを書く（問題がなければ空の文字列）`;

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "goal_feedback", "good_points", "improvements", "drill", "encouragement", "reliability_note"],
  properties: {
    summary: { type: "string", description: "演技全体についての、ひとことのまとめ（1〜2文）" },
    goal_feedback: { type: "string", description: "めあてについてのコメント。めあてがなければ空の文字列" },
    good_points: {
      type: "array",
      description: "良かったところ（1〜3個）",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: {
          title: { type: "string", description: "短い見出し" },
          detail: { type: "string", description: "具体的な説明" },
        },
      },
    },
    improvements: {
      type: "array",
      description: "伸ばすポイント（1〜3個、大事な順）",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "how_to", "time_sec"],
        properties: {
          title: { type: "string", description: "短い見出し" },
          detail: { type: "string", description: "今どうなっているか" },
          how_to: { type: "string", description: "どうすると良くなるか。体の感覚で伝わる言葉で" },
          time_sec: { type: "number", description: "動画の中でその場面が見られる時刻（秒）。特定できなければ -1" },
        },
      },
    },
    drill: {
      type: "object",
      additionalProperties: false,
      required: ["name", "how", "why"],
      properties: {
        name: { type: "string", description: "練習の名前" },
        how: { type: "string", description: "やり方" },
        why: { type: "string", description: "この練習で何が身につくか" },
      },
    },
    encouragement: { type: "string", description: "前向きになれる、最後のひとこと" },
    reliability_note: { type: "string", description: "撮り方や推定の注意点。問題なければ空の文字列" },
  },
};

function buildUserContent(req, skill) {
  const rating = SELF_RATINGS.find((r) => r.id === req.selfRating)?.label || "（なし）";
  const text = [
    `## 技: ${skill.name}（${skill.group}）`,
    `### この技のポイント`,
    ...skill.points.map((p) => `- ${p}`),
    `### よくあるつまずき`,
    ...skill.commonErrors.map((p) => `- ${p}`),
    ``,
    `## 生徒の今日のめあて: ${req.goal?.trim() || "（なし）"}`,
    `## 生徒の自己評価: ${rating}`,
    ``,
    `## 数値のまとめ`,
    "```json",
    JSON.stringify(req.metrics.summary, null, 1),
    "```",
    `## 時間ごとの数値（t は秒）`,
    "```json",
    JSON.stringify(req.metrics.timeline),
    "```",
    req.metrics.warnings?.length ? `## アプリからの注意\n${req.metrics.warnings.map((w) => `- ${w}`).join("\n")}` : "",
    ``,
    `## 大事な場面の棒人間の画像（このあとに順番に並んでいます）`,
    ...req.keyframes.map((k, i) => `${i + 1}. ${k.label}（${k.t.toFixed(2)}秒）`),
  ].join("\n");

  const content = [{ type: "text", text }];
  req.keyframes.forEach((k, i) => {
    content.push({ type: "text", text: `画像${i + 1}: ${k.label}（${k.t.toFixed(2)}秒）` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: k.image } });
  });
  content.push({ type: "text", text: "この生徒に、コーチとしてアドバイスをしてください。" });
  return content;
}

async function askCoach(req, skill) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: COACH_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserContent(req, skill) }],
  });

  if (response.stop_reason === "refusal") {
    throw new UserError("AIコーチが回答できませんでした。もう一度ためしてください。", 502);
  }
  if (response.stop_reason === "max_tokens") {
    throw new UserError("回答が長くなりすぎました。もう一度ためしてください。", 502);
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new UserError("AIコーチの回答を読み取れませんでした。もう一度ためしてください。", 502);
  }
}

function mockCoach(req, skill) {
  const peakT = req.metrics.summary["逆さまになった場面の時刻_秒"] ?? -1;
  return {
    summary: `（見本の回答です）${skill.name}の流れがしっかりできていました。あと少しで、もっとなめらかになります。`,
    goal_feedback: req.goal ? `めあての「${req.goal}」を意識して取り組めていました。` : "",
    good_points: [
      { title: "最後まで回りきれた", detail: "止まらずに最後まで回りきれていました。勢いがついています。" },
      { title: "スタートの姿勢", detail: "回り始める前に、腰を高く上げられていました。" },
    ],
    improvements: [
      {
        title: "あごをもう少し引こう",
        detail: "逆さまになる場面で、頭が少し上がっているように見えます。",
        how_to: "おへそをのぞきこむようにすると、背中が丸くなってなめらかに転がれます。",
        time_sec: peakT,
      },
    ],
    drill: {
      name: "ゆりかご",
      how: "体育座りから、ひざをかかえて背中を丸め、前後にゆらゆら転がります。10回を目安に。",
      why: "背中を丸めて転がる感覚と、起き上がるときにかかとを引きつける感覚が身につきます。",
    },
    encouragement: "練習するたびに上手になっています。次の1回も楽しんでいきましょう！",
    reliability_note: "",
  };
}

// ---------- 入力のチェック ----------

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validate(body) {
  const skill = findSkill(body?.skillId);
  if (!skill) throw new UserError("技の種類が正しくありません。");
  if (!body.metrics || typeof body.metrics.summary !== "object" || !Array.isArray(body.metrics.timeline)) {
    throw new UserError("分析データが足りません。");
  }
  if (!Array.isArray(body.keyframes) || body.keyframes.length === 0 || body.keyframes.length > 10) {
    throw new UserError("場面の画像が正しくありません。");
  }
  for (const k of body.keyframes) {
    if (typeof k.image !== "string" || !/^[A-Za-z0-9+/=]+$/.test(k.image) || typeof k.t !== "number") {
      throw new UserError("場面の画像が正しくありません。");
    }
    k.label = String(k.label || "").slice(0, 40);
  }
  body.goal = String(body.goal || "").slice(0, 200);
  body.metrics.timeline = body.metrics.timeline.slice(0, 60);
  body.metrics.warnings = (body.metrics.warnings || []).slice(0, 5).map((w) => String(w).slice(0, 100));
  return skill;
}

// 1台（IPアドレス）あたりの回数制限
const usage = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (usage.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= LIMIT_PER_HOUR) return true;
  list.push(now);
  usage.set(ip, list);
  return false;
}

// ---------- HTTP サーバー ----------

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new UserError("データが大きすぎます。", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UserError("データの形が正しくありません。");
  }
}

async function handleCoach(req, res) {
  if (PASSCODE && req.headers["x-app-passcode"] !== PASSCODE) {
    return sendJson(res, 401, { error: "合言葉がちがいます。先生に確認してください。", needPasscode: true });
  }
  const ip = req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    return sendJson(res, 429, { error: "使いすぎのため、少し時間をおいてからためしてください。" });
  }
  const body = await readBody(req);
  const skill = validate(body);
  const coach = MOCK ? mockCoach(body, skill) : await askCoach(body, skill);
  sendJson(res, 200, { coach, mock: MOCK });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("見つかりません");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, { needPasscode: !!PASSCODE, mock: MOCK });
    }
    if (req.url === "/api/coach" && req.method === "POST") return await handleCoach(req, res);
    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
    res.writeHead(405).end();
  } catch (err) {
    if (err instanceof UserError) return sendJson(res, err.status, { error: err.message });
    if (err instanceof Anthropic.RateLimitError) {
      return sendJson(res, 429, { error: "AIコーチが混み合っています。少し待ってからためしてください。" });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("APIキーが正しくありません:", err.message);
      return sendJson(res, 500, { error: "AIコーチの設定に問題があります。先生に知らせてください。" });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      console.error("API に接続できません:", err.message);
      return sendJson(res, 502, { error: "AIコーチにつながりませんでした。ネットワークを確認してください。" });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("API エラー:", err.status, err.message);
      return sendJson(res, 502, { error: "AIコーチでエラーが起きました。もう一度ためしてください。" });
    }
    console.error(err);
    sendJson(res, 500, { error: "サーバーでエラーが起きました。" });
  }
});

server.listen(PORT, () => {
  console.log(`マット運動 AIコーチ: http://localhost:${PORT}`);
  if (MOCK) console.log("（お試しモード: AIは使わず、見本の回答を返します）");
  else if (!process.env.ANTHROPIC_API_KEY) console.warn("注意: ANTHROPIC_API_KEY が設定されていません。");
  if (PASSCODE) console.log("合言葉が設定されています。");
});
