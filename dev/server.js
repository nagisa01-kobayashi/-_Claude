/**
 * 開発用サーバー：Google Apps Script の動きをまねて、コツッターを手元で動かします。
 *   node dev/server.js            → http://localhost:8787/?as=teacher@example.jp
 *   ?as=<メールアドレス> で、ログインしている人を切り替えられます。
 * データは dev/data.json に保存されます（消すと初期状態に戻ります）。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = process.env.KOTSUTTER_DATA || path.join(__dirname, 'data.json');
const VIDEO_DIR = path.join(__dirname, 'videos');
const PORT = Number(process.env.PORT || 8787);
const TEACHER = 'teacher@example.jp';

/* ---------------- 保存データ ---------------- */
let store = { sheets: {}, order: [], props: {}, nextSheetId: 1, sheetIds: {} };
if (fs.existsSync(DATA_FILE)) store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
function persist() { fs.writeFileSync(DATA_FILE, JSON.stringify(store)); }

/* ---------------- Apps Script のまね ---------------- */
let currentEmail = TEACHER;
const stats = { reads: 0, opens: 0 };

function stripQuote(v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; }

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    stats.reads++;
    const d = store.sheets[this.sheet.name];
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = d[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v == null ? '' : v); }
      out.push(o);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((r) => r.length !== this.nc)) {
      throw new Error('The number of rows or columns in the data does not match the range');
    }
    const d = store.sheets[this.sheet.name];
    vals.forEach((row, i) => {
      const ri = this.r - 1 + i;
      while (d.length <= ri) d.push([]);
      row.forEach((v, j) => {
        if (typeof v === 'string' && v.length > 50000) throw new Error('セルの文字数上限を超えました');
        d[ri][this.c - 1 + j] = stripQuote(v);
      });
    });
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; }
  getName() { return this.name; }
  getLastRow() {
    const d = store.sheets[this.name];
    for (let i = d.length - 1; i >= 0; i--) if ((d[i] || []).some((v) => v !== '' && v != null)) return i + 1;
    return 0;
  }
  getRange(r, c, nr, nc) {
    if (r < 1 || c < 1) throw new Error('範囲の指定が正しくありません');
    return new Range(this, r, c, nr, nc);
  }
  setFrozenRows() { return this; }
  deleteRow(r) { store.sheets[this.name].splice(r - 1, 1); return this; }
  clear() { store.sheets[this.name] = []; return this; }
  getSheetId() { return store.sheetIds[this.name]; }
}
const SS = {
  getId() { return 'dev-spreadsheet'; },
  getUrl() { return 'https://docs.google.com/spreadsheets/d/dev-spreadsheet/edit'; },
  getSheetByName(n) { return store.sheets[n] ? new Sheet(n) : null; },
  insertSheet(n) { store.sheets[n] = []; store.order.push(n); store.sheetIds[n] = store.nextSheetId++; return new Sheet(n); },
  getSheets() { return store.order.map((n) => new Sheet(n)); },
  deleteSheet(s) { delete store.sheets[s.name]; store.order = store.order.filter((n) => n !== s.name); }
};

const cache = new Map();
const CacheShim = {
  get(k) { const e = cache.get(k); if (!e || e.exp < Date.now()) return null; return e.v; },
  getAll(keys) { const o = {}; keys.forEach((k) => { const v = CacheShim.get(k); if (v != null) o[k] = v; }); return o; },
  put(k, v, ttl) {
    if (Buffer.byteLength(String(v), 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
    cache.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 });
  },
  putAll(o, ttl) { Object.keys(o).forEach((k) => CacheShim.put(k, o[k], ttl)); },
  remove(k) { cache.delete(k); }
};

function folder(id, name) {
  return {
    getId: () => id,
    getName: () => name,
    createFolder: (n) => folder('folder-' + crypto.randomUUID().slice(0, 8), n),
    createFile: (blob) => {
      fs.mkdirSync(VIDEO_DIR, { recursive: true });
      const fid = 'file-' + crypto.randomUUID().slice(0, 8);
      fs.writeFileSync(path.join(VIDEO_DIR, fid + '_' + blob.name.replace(/[\\/]/g, '_')), Buffer.from(blob.bytes));
      return { getId: () => fid };
    }
  };
}

function formatDate(date, tz, fmt) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  if (parts.hour === '24') parts.hour = '00';
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute);
}

const ctx = vm.createContext({
  console,
  SpreadsheetApp: { openById: () => { stats.opens++; return SS; }, getActiveSpreadsheet: () => SS, flush: () => {} },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in store.props ? store.props[k] : null),
      setProperty: (k, v) => { store.props[k] = String(v); }
    })
  },
  CacheService: { getScriptCache: () => CacheShim },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  Session: {
    getActiveUser: () => ({ getEmail: () => currentEmail }),
    getEffectiveUser: () => ({ getEmail: () => TEACHER })
  },
  Utilities: {
    formatDate,
    getUuid: () => crypto.randomUUID(),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name })
  },
  DriveApp: {
    getFileById: () => ({ getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return folder('root', 'root'); } }; } }),
    createFolder: (n) => folder('folder-' + crypto.randomUUID().slice(0, 8), n),
    getFolderById: (id) => folder(id, id)
  },
  HtmlService: {}
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

function callApi(email, action, payload) {
  currentEmail = email;
  const r = ctx.api(action, JSON.stringify(payload || {}));
  persist();
  return JSON.parse(r);
}

/* ---------------- 初回だけ：見本データ ---------------- */
function seed() {
  currentEmail = TEACHER;
  ctx.setup();
  const t = (a, p) => callApi(TEACHER, a, p);
  t('saveTeacher', { email: TEACHER, name: '山田' });
  t('saveTeacher', { email: 'teacher2@example.jp', name: '佐藤' });
  const names = {
    '2-1': ['青木 はると', '石井 さくら', '上田 そうた', '江口 ゆい', '大野 れん'],
    '2-3': ['加藤 ひなた', '木村 みお', '工藤 りく', '小池 あおい'],
    '2-2': ['佐々木 ゆうと', '清水 ここな', '鈴木 かいと'],
    '2-4': ['高橋 めい', '田中 そら'],
    '3-3': ['中村 あかり', '西田 しょう', '野口 つむぎ'],
    '3-4': ['橋本 けんと', '藤井 えま']
  };
  const rows = [];
  let n = 0;
  Object.keys(names).forEach((cls) => names[cls].forEach((nm, i) => {
    n++;
    rows.push({ grade: cls[0], kumi: cls[2], number: i + 1, name: nm, email: 's' + String(n).padStart(2, '0') + '@example.jp' });
  }));
  t('importStudents', { rows });

  const S = (i) => 's' + String(i).padStart(2, '0') + '@example.jp';
  const mk = (who, p) => callApi(who, 'createPost', Object.assign({ unitId: 'u1' }, p)).id;
  const p1 = mk(S(1), { type: 'tweet', skills: ['開脚前転'], tags: ['着手'], body: '足を開くタイミングは、おしりがマットにつく直前！早すぎると勢いが止まる。' });
  const p2 = mk(S(2), { type: 'tweet', skills: ['後転'], tags: ['目線'], body: 'おへそを見ながら転がると、まっすぐ回れた。手は耳の横でパーにしておくと押しやすい。' });
  const p3 = mk(S(6), {
    type: 'reflection', level: '○', skills: ['開脚前転'], tags: ['着手', '回転'],
    task: '開脚前転で、手をつかずに立ち上がるにはどうすればよいか',
    body: '最初は足を開くのが早くて、立ち上がれなかった。青木さんのつぶやきを見て、おしりがつく直前に開くようにしたら、勢いが残って立てた。なぜなら、回転の勢いを足を閉じている間にためられるから。次は、手を股の近くにつく練習をしたい。'
  });
  const p4 = mk(S(3), { type: 'tweet', skills: ['側方倒立回転'], tags: ['着手', '目線'], body: '手は「1、2」で一直線に。目線は最初についた手を見ると、こわくない！' });
  callApi(S(7), 'createPost', {
    unitId: 'u1', type: 'tweet', skills: ['開脚前転'], tags: ['着手'], quoteOf: p1,
    body: '足を開くタイミングのコツを選んだのは、いつも早く開いていたから。直前にしたら立てた！ありがとう！'
  });
  mk(S(4), { type: 'tweet', skills: ['倒立'], tags: ['目線'], body: '壁倒立は、指の間を見ると体がまっすぐになる。' });
  mk(S(5), {
    type: 'reflection', level: '◎', skills: ['後転', '開脚後転'], tags: ['回転'],
    task: '後転で、まっすぐ回るにはどうすればよいか',
    body: 'まっすぐ回れずに横にずれていた。石井さんの「おへそを見る」をやってみたら、体が丸くなってまっすぐ回れた。手で同時に押すことも大事だと分かった。'
  });
  [[S(2), p1, 'naruhodo'], [S(3), p1, 'dekita'], [S(6), p1, 'dekita'], [S(7), p1, 'dekita'], [S(8), p1, 'yatta'], [S(5), p1, 'yatta'],
   [S(1), p2, 'naruhodo'], [S(5), p2, 'dekita'], [S(4), p2, 'yatta'], [S(1), p3, 'naruhodo'], [S(2), p3, 'naruhodo'],
   [S(1), p4, 'yatta'], [S(9), p4, 'naruhodo']].forEach((x) => callApi(x[0], 'react', { postId: x[1], kind: x[2] }));
  callApi(S(6), 'repost', { postId: p1 });
  callApi(S(5), 'repost', { postId: p2 });
  t('setPick', { postId: p3, on: true });
  mk(TEACHER, { type: 'tweet', groupId: '*', skills: [], tags: [], body: '今日のめあて：仲間のコツを1つ選んで試し、「やってみた報告」を書いてみよう！' });
  ['前転', '後転', '開脚前転'].forEach((s) => callApi(S(1), 'toggleAchievement', { unitId: 'u1', skill: s }));
  ['前転', '開脚前転'].forEach((s) => callApi(S(6), 'toggleAchievement', { unitId: 'u1', skill: s }));
  try { callApi(S(9), 'createPost', { unitId: 'u1', type: 'tweet', skills: ['前転'], body: 'お前ほんとヘタクソ' }); } catch (e) { /* NGワードでブロックされる見本 */ }
  callApi(S(8), 'report', { postId: p4, reason: 'ふざけている・関係ない投稿' });
  // 少し前の時刻に見せる
  const posts = store.sheets.Posts;
  const now = Date.now();
  for (let i = 1; i < posts.length; i++) posts[i][13] = now - (posts.length - i) * 7 * 60 * 1000;
  persist();
}
if (!store.sheets.Posts) seed();

/* ---------------- HTTP ---------------- */
const MOCK = `<script>
(function () {
  var as = new URLSearchParams(location.search).get('as') || '${TEACHER}';
  function Runner() { this.s = null; this.f = null; }
  Runner.prototype.withSuccessHandler = function (f) { this.s = f; return this; };
  Runner.prototype.withFailureHandler = function (f) { this.f = f; return this; };
  Runner.prototype.api = function () {
    var self = this, args = Array.prototype.slice.call(arguments);
    fetch('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: as, args: args }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { setTimeout(function () { if (j.error) { self.f && self.f(new Error(j.error)); } else { self.s && self.s(j.result); } }, 120); })
      .catch(function (e) { self.f && self.f(e); });
  };
  window.google = { script: {} };
  Object.defineProperty(window.google.script, 'run', { get: function () { return new Runner(); } });
})();
</script>
`;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size < 60 * 1024 * 1024) chunks.push(c); });
    req.on('end', () => {
      let out;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        currentEmail = String(body.as || TEACHER).toLowerCase();
        const r0 = stats.reads, o0 = stats.opens;
        out = { result: ctx.api(body.args[0], body.args[1]) };
        if (process.env.KOTSUTTER_DEBUG) console.log(body.args[0], 'sheetReads=' + (stats.reads - r0), 'opens=' + (stats.opens - o0));
        persist();
      } catch (e) {
        out = { error: e.message || String(e) };
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (req.url.split('?')[0] === '/') {
    const html = fs.readFileSync(path.join(ROOT, 'gas', 'Index.html'), 'utf8').replace("<script>\n'use strict';", MOCK + "<script>\n'use strict';");
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, () => console.log('コツッター開発サーバー: http://localhost:' + PORT + '/?as=' + TEACHER));
