// マット運動コーチ — サーバー側のプログラム（Google Apps Script で動きます）
// Code.gs がこのファイルを Google ドライブから読み込んで実行します。
// FOLDER_ID（部品を置いたフォルダの ID）は Code.gs から渡されます。
//
// データはスプレッドシート「マット運動コーチ_データ」に保存します（はじめて使うときに自動で作ります）。

const TZ = "Asia/Tokyo";
const SHEETS = {
  settings: ["key", "value"],
  students: ["email", "class", "number", "name", "registeredAt"],
  lessons: ["id", "date", "title", "json", "updatedAt"],
  talk: ["id", "ts", "email", "date", "from", "type", "data"],
  rooms: ["email", "date", "ctx", "updatedAt"],
  summaries: ["email", "date", "json", "updatedAt"],
  evaluations: ["email", "date", "thinking", "attitude", "memo", "updatedAt"],
};
const SHEET_NAMES = {
  settings: "設定",
  students: "生徒",
  lessons: "授業設定",
  talk: "トーク",
  rooms: "トークルーム",
  summaries: "学びのまとめ",
  evaluations: "評価",
};

// ---------------- 入口 ----------------
function doGet() {
  const html = assetFile_("index.html").getBlob().getDataAsString("UTF-8");
  return HtmlService.createHtmlOutput(html)
    .setTitle("マット運動コーチ")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** 画面からの呼び出しはすべてここを通る。結果は JSON 文字列で返す */
function api(name, args) {
  const me = whoami_();
  const fn = API[name];
  if (!fn) throw new Error("不明な操作です: " + name);
  if (TEACHER_ONLY.indexOf(name) >= 0 && !me.isTeacher) throw new Error("先生だけが使える機能です。");
  return JSON.stringify(fn.apply(null, [me].concat(args || [])));
}

/** はじめての準備（先生が一度実行すると、スプレッドシートなどを作ります） */
function setup() {
  db_();
  videoFolder_();
  pdfFolder_();
  return "準備ができました";
}

// ---------------- だれが使っているか ----------------
function whoami_() {
  const email = (Session.getActiveUser().getEmail() || "").toLowerCase();
  const owner = (Session.getEffectiveUser().getEmail() || "").toLowerCase();
  const teachers = (getSetting_("teachers") || []).map((t) => String(t).toLowerCase());
  const isTeacher = !!email && (email === owner || teachers.indexOf(email) >= 0);
  const student = email ? findRow_("students", (r) => r.email === email) : null;
  return { email, isTeacher, student };
}

// ---------------- 画面から呼べる操作 ----------------
const TEACHER_ONLY = [
  "overview", "teacherRoom", "lessons", "saveLesson", "deleteLesson",
  "saveSettings", "summaries", "saveEvaluation", "makePdf",
];

const API = {
  /** 起動時の情報 */
  init(me) {
    const today = today_();
    const rooms = me.email ? rows_("rooms").filter((r) => r.email === me.email).map((r) => r.date) : [];
    return {
      me: { email: me.email, isTeacher: me.isTeacher, student: me.student },
      today,
      settings: { classes: getSetting_("classes") || [], teachers: getSetting_("teachers") || [] },
      lesson: me.student || me.isTeacher ? lessonFor_(me, today) : null,
      rooms: rooms.sort().reverse(),
      modelVideos: modelVideos_(),
      // 生徒は今日のトークもいっしょに返す（通信の回数を減らすため）
      room: me.email && !me.isTeacher ? roomOf_(me.email, today) : null,
    };
  },

  /** 生徒の登録（組・番号・名前） */
  register(me, cls, number, name) {
    if (!me.email) throw new Error("Google アカウントを確認できませんでした。");
    cls = String(cls || "").trim();
    name = String(name || "").trim();
    number = String(number || "").trim();
    if (!cls || !number || !name) throw new Error("組・番号・名前をすべて入れてください。");
    upsert_("students", (r) => r.email === me.email, { email: me.email, class: cls, number, name, registeredAt: now_() });
    return { email: me.email, class: cls, number, name };
  },

  /** 自分のトークルームを開く */
  room(me, date) {
    return roomOf_(me.email, date);
  },

  /** メッセージを保存（生徒は今日のトークだけ） */
  saveMessages(me, date, messages, ctx) {
    if (!me.email) throw new Error("Google アカウントを確認できませんでした。");
    if (date !== today_() && !me.isTeacher) throw new Error("前の日のトークには書きこめません。");
    withLock_(() => {
      const sh = sheet_("talk");
      const rows = (messages || []).map((m) => [
        String(m.id), String(m.ts || now_()), me.email, date, String(m.from), String(m.type), JSON.stringify(m.data || {}),
      ]);
      if (rows.length) writeRows_(sh, sh.getLastRow() + 1, rows);
      if (ctx) upsert_("rooms", (r) => r.email === me.email && r.date === date, { email: me.email, date, ctx: JSON.stringify(ctx), updatedAt: now_() }, true);
    });
    return { ok: true };
  },

  /** 学びのまとめを保存 */
  saveSummary(me, date, summary) {
    if (!me.email) throw new Error("Google アカウントを確認できませんでした。");
    upsert_("summaries", (r) => r.email === me.email && r.date === date, { email: me.email, date, json: JSON.stringify(summary), updatedAt: now_() });
    return { ok: true };
  },

  // ---------- ここから先生用 ----------
  overview() {
    const students = rows_("students");
    const rooms = rows_("rooms").map((r) => ({ email: r.email, date: r.date, updatedAt: r.updatedAt }));
    return { students, rooms, classes: getSetting_("classes") || [] };
  },

  teacherRoom(me, email, date) {
    return roomOf_(String(email).toLowerCase(), date);
  },

  lessons() {
    return rows_("lessons")
      .map((r) => Object.assign(JSON.parse(r.json || "{}"), { id: r.id, date: r.date, title: r.title }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  saveLesson(me, lesson) {
    lesson.id = lesson.id || "L" + Date.now();
    upsert_("lessons", (r) => r.id === lesson.id, {
      id: lesson.id, date: lesson.date || "", title: lesson.title || "", json: JSON.stringify(lesson), updatedAt: now_(),
    });
    return lesson;
  },

  deleteLesson(me, id) {
    withLock_(() => {
      const sh = sheet_("lessons");
      const values = sh.getDataRange().getValues();
      for (let i = values.length - 1; i >= 1; i--) if (String(values[i][0]) === id) sh.deleteRow(i + 1);
      forget_("lessons");
    });
    return { ok: true };
  },

  saveSettings(me, settings) {
    if (settings.classes) setSetting_("classes", settings.classes.map(String).filter(Boolean));
    if (settings.teachers) setSetting_("teachers", settings.teachers.map((t) => String(t).trim().toLowerCase()).filter(Boolean));
    return { ok: true };
  },

  /** まとめと評価の一覧（クラス・期間で絞りこみ） */
  summaries(me, cls, from, to) {
    return collectSummaries_(cls, from, to);
  },

  saveEvaluation(me, email, date, thinking, attitude, memo) {
    upsert_("evaluations", (r) => r.email === email && r.date === date, {
      email, date, thinking: thinking || "", attitude: attitude || "", memo: memo || "", updatedAt: now_(),
    });
    return { ok: true };
  },

  /** まとめを PDF にしてドライブに保存し、URL を返す */
  makePdf(me, cls, from, to) {
    const list = collectSummaries_(cls, from, to);
    if (!list.length) throw new Error("この条件のまとめはまだありません。");
    const html = pdfHtml_(list, cls, from, to);
    const name = `学びのまとめ_${cls || "全クラス"}_${from || ""}〜${to || ""}`;
    const pdf = Utilities.newBlob(html, "text/html", name + ".html").getAs("application/pdf").setName(name + ".pdf");
    const file = pdfFolder_().createFile(pdf);
    return { url: file.getUrl(), name: file.getName() };
  },
};

// ---------------- 部品 ----------------
function roomOf_(email, date) {
  const messages = talkOf_(email, date).map((r) => ({ id: r.id, ts: r.ts, from: r.from, type: r.type, data: safeJson_(r.data) }));
  const room = findRow_("rooms", (r) => r.email === email && r.date === date);
  const summary = findRow_("summaries", (r) => r.email === email && r.date === date);
  return { date, messages, ctx: room ? safeJson_(room.ctx) : null, summary: summary ? safeJson_(summary.json) : null };
}

// トークは行が多くなるので、まず「メール・日付」の列だけ読んで、必要な行の範囲だけを読む
function talkOf_(email, date) {
  const sh = sheet_("talk");
  const last = sh.getLastRow();
  if (last < 2) return [];
  const keys = sh.getRange(2, 3, last - 1, 2).getValues();
  let lo = -1, hi = -1;
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === email && String(keys[i][1]) === date) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }
  if (lo < 0) return [];
  const head = SHEETS.talk;
  const values = sh.getRange(lo + 2, 1, hi - lo + 1, head.length).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (String(keys[lo + i][0]) !== email || String(keys[lo + i][1]) !== date) continue;
    const o = {};
    head.forEach((h, j) => (o[h] = values[i][j] == null ? "" : String(values[i][j])));
    out.push(o);
  }
  return out;
}

function lessonFor_(me, date) {
  const cls = me.student ? me.student.class : "";
  const list = rows_("lessons")
    .filter((r) => r.date === date)
    .map((r) => Object.assign(safeJson_(r.json), { id: r.id, date: r.date, title: r.title }));
  return list.find((l) => !l.classes || !l.classes.length || l.classes.indexOf(cls) >= 0) || null;
}

function collectSummaries_(cls, from, to) {
  const students = rows_("students");
  const evals = rows_("evaluations");
  const byEmail = {};
  students.forEach((s) => (byEmail[s.email] = s));
  return rows_("summaries")
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .map((r) => {
      const s = byEmail[r.email] || { email: r.email, class: "", number: "", name: r.email };
      const ev = evals.find((e) => e.email === r.email && e.date === r.date) || {};
      return {
        email: r.email, date: r.date, class: s.class, number: s.number, name: s.name,
        summary: safeJson_(r.json), thinking: ev.thinking || "", attitude: ev.attitude || "", memo: ev.memo || "",
      };
    })
    .filter((r) => !cls || r.class === cls)
    .sort((a, b) => (a.class + pad_(a.number) + a.date < b.class + pad_(b.number) + b.date ? -1 : 1));
}

function pad_(n) {
  return ("000" + n).slice(-3);
}

function esc_(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function pdfHtml_(list, cls, from, to) {
  const qa = (arr) =>
    (arr || []).filter((x) => x && x.a).map((x) => `<div class="qa"><div class="q">${esc_(x.q)}</div><div class="a">${esc_(x.a)}</div></div>`).join("") || `<div class="none">（記入なし）</div>`;
  const pages = list.map((r, i) => {
    const s = r.summary || {};
    const ind = s.indicators || {};
    return `<div class="page"${i ? ' style="page-break-before: always"' : ""}>
      <table class="head"><tr><td><b>${esc_(r.class)}　${esc_(r.number)}番　${esc_(r.name)}</b></td><td class="r">${esc_(r.date)}　${esc_(s.lessonTitle || "")}</td></tr></table>
      <table class="basic">
        <tr><th>技</th><td>${esc_(s.skill || "")}</td><th>試した回数</th><td>${esc_(ind.trials || 0)}回</td></tr>
        <tr><th>学習課題</th><td colspan="3">${esc_(s.task || "")}</td></tr>
        <tr><th>学習方法</th><td colspan="3">${esc_((s.methods || []).join("／"))}</td></tr>
        <tr><th>自己評価</th><td colspan="3">${esc_(s.selfCheck || "")}</td></tr>
      </table>
      <h3>思考力・判断力・表現力等にかかわる記述</h3>
      <div class="sub">課題の設定・方法の選択</div>${qa(s.planAnswers)}
      <div class="sub">動画を見ての気づき</div>${qa(s.videoAnswers)}
      <div class="sub">振り返り（コツや感覚の言語化）</div>${qa(s.reflection)}
      <h3>主体的に学習に取り組む態度にかかわる様子</h3>
      <div class="ind">動画で試した回数：${esc_(ind.trials || 0)}回／試した方法：${esc_(ind.methodsTried || 0)}種類／振り返りの文字数：${esc_(ind.reflectionChars || 0)}字／方法を変えた回数：${esc_(ind.methodChanges || 0)}回／コーチへの質問：${esc_(ind.questions || 0)}回</div>
      ${(s.questions || []).length ? `<div class="sub">コーチに質問したこと</div><div class="qa">${s.questions.map((x) => `<div class="a">・${esc_(x)}</div>`).join("")}</div>` : ""}
      <table class="eval"><tr><th>思考・判断・表現</th><td>${esc_(r.thinking || "　")}</td><th>主体的に学習に取り組む態度</th><td>${esc_(r.attitude || "　")}</td></tr>
      <tr><th>メモ</th><td colspan="3">${esc_(r.memo || "")}</td></tr></table>
    </div>`;
  });
  return `<html><head><meta charset="utf-8"><style>
    body { font-family: sans-serif; font-size: 10.5pt; color: #111; }
    table.head { border-bottom: 2px solid #0f766e; margin: 0 0 8px; }
    table.head td { border: 0; padding: 0 0 4px; font-size: 12pt; }
    table.head td.r { text-align: right; color: #555; font-size: 10pt; }
    table { border-collapse: collapse; width: 100%; margin: 6px 0; }
    th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #eef6f4; width: 16%; white-space: nowrap; }
    h3 { font-size: 11pt; margin: 12px 0 4px; color: #0f766e; }
    .sub { font-weight: bold; margin: 6px 0 2px; font-size: 10pt; }
    .qa { margin: 0 0 4px 8px; } .q { color: #555; font-size: 9pt; } .a { padding-left: 8px; }
    .none { color: #999; margin-left: 8px; } .ind { margin-left: 8px; }
    .cover { margin-bottom: 8px; color: #555; }
  </style></head><body>
  <div class="cover">学びのまとめ　${esc_(cls || "全クラス")}　${esc_(from || "")}〜${esc_(to || "")}　（${list.length}件）</div>
  ${pages.join("")}</body></html>`;
}

function modelVideos_() {
  try {
    const hit = CacheService.getScriptCache().get("modelVideos");
    if (hit) return JSON.parse(hit);
  } catch (e) {}
  const list = listModelVideos_();
  try {
    CacheService.getScriptCache().put("modelVideos", JSON.stringify(list), 300);
  } catch (e) {}
  return list;
}
function listModelVideos_() {
  try {
    const out = [];
    const it = videoFolder_().getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (/^video\//.test(f.getMimeType())) out.push({ id: f.getId(), name: f.getName() });
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  } catch (e) {
    return [];
  }
}

// ---------------- フォルダ ----------------
function mainFolder_() {
  const parents = DriveApp.getFolderById(FOLDER_ID).getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

function childFolder_(prop, name, share) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(prop);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {}
  }
  const parent = mainFolder_();
  const it = parent.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : parent.createFolder(name);
  if (share) {
    try {
      folder.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}
  }
  props.setProperty(prop, folder.getId());
  return folder;
}
function videoFolder_() {
  return childFolder_("VIDEO_FOLDER", "お手本動画", true);
}
function pdfFolder_() {
  return childFolder_("PDF_FOLDER", "評価資料（PDF）", false);
}

function assetFile_(name) {
  const it = DriveApp.getFolderById(FOLDER_ID).getFilesByName(name);
  if (!it.hasNext()) throw new Error("ファイルが見つかりません: " + name);
  return it.next();
}

// ---------------- スプレッドシート ----------------
let dbCache_ = null;
function db_() {
  if (dbCache_) return dbCache_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("DB_ID");
  if (id) {
    try {
      dbCache_ = SpreadsheetApp.openById(id);
      return dbCache_;
    } catch (e) {}
  }
  const ss = SpreadsheetApp.create("マット運動コーチ_データ");
  DriveApp.getFileById(ss.getId()).moveTo(mainFolder_());
  props.setProperty("DB_ID", ss.getId());
  dbCache_ = ss;
  Object.keys(SHEETS).forEach((k) => sheet_(k));
  const first = ss.getSheets()[0];
  if (first && !Object.values(SHEET_NAMES).includes(first.getName())) ss.deleteSheet(first);
  return ss;
}

const sheetCache_ = {};
function sheet_(key) {
  if (sheetCache_[key]) return sheetCache_[key];
  const ss = db_();
  let sh = ss.getSheetByName(SHEET_NAMES[key]);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES[key]);
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS[key].length).setNumberFormat("@");
    sh.getRange(1, 1, 1, SHEETS[key].length).setValues([SHEETS[key]]);
    sh.setFrozenRows(1);
  }
  sheetCache_[key] = sh;
  return sh;
}

// よく読む表（設定・生徒・授業設定）は、しばらくのあいだキャッシュに置いて速くする
const CACHED_SHEETS = ["settings", "students", "lessons"];
const rowsMemo_ = {};
function rows_(key) {
  if (rowsMemo_[key]) return rowsMemo_[key];
  const cacheable = CACHED_SHEETS.indexOf(key) >= 0;
  if (cacheable) {
    try {
      const hit = CacheService.getScriptCache().get("rows:" + key);
      if (hit) return (rowsMemo_[key] = JSON.parse(hit));
    } catch (e) {}
  }
  const out = readRows_(key);
  rowsMemo_[key] = out;
  if (cacheable) {
    try {
      CacheService.getScriptCache().put("rows:" + key, JSON.stringify(out), 600);
    } catch (e) {}
  }
  return out;
}
function forget_(key) {
  delete rowsMemo_[key];
  try {
    CacheService.getScriptCache().remove("rows:" + key);
  } catch (e) {}
}

function readRows_(key) {
  const values = sheet_(key).getDataRange().getValues();
  const head = SHEETS[key];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const o = {};
    head.forEach((h, j) => (o[h] = values[i][j] == null ? "" : String(values[i][j])));
    out.push(o);
  }
  return out;
}

function findRow_(key, pred) {
  return rows_(key).find(pred) || null;
}

function upsert_(key, pred, obj, locked) {
  const run = () => {
    const sh = sheet_(key);
    const head = SHEETS[key];
    const row = head.map((h) => (obj[h] == null ? "" : String(obj[h])));
    const list = readRows_(key);
    const idx = list.findIndex(pred);
    writeRows_(sh, idx >= 0 ? idx + 2 : sh.getLastRow() + 1, [row]);
    forget_(key);
  };
  if (locked) run();
  else withLock_(run);
}

// 日付などが勝手に変換されないように、文字列として書きこむ
function writeRows_(sh, startRow, rows) {
  const range = sh.getRange(startRow, 1, rows.length, rows[0].length);
  range.setNumberFormat("@");
  range.setValues(rows);
}

function getSetting_(key) {
  const r = findRow_("settings", (x) => x.key === key);
  return r ? safeJson_(r.value) : null;
}
function setSetting_(key, value) {
  upsert_("settings", (x) => x.key === key, { key, value: JSON.stringify(value) });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function safeJson_(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
function today_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}
function now_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
}

// ---------------- 骨格推定の部品を届ける ----------------
function getAssetList() {
  const list = {};
  const files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const m = f.getName().match(/^([a-z_]+)\.(\d+)\.b64$/);
    if (m) (list[m[1]] = list[m[1]] || []).push({ name: f.getName(), size: f.getSize() });
  }
  for (const k in list) list[k].sort((a, b) => (a.name < b.name ? -1 : 1));
  return list;
}

function getAssetChunk(name) {
  if (!/^[a-z_]+\.\d+\.b64$/.test(name)) throw new Error("bad name");
  return assetFile_(name).getBlob().getDataAsString();
}
