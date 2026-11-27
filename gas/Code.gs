/**
 * コツッター（体育のコツ共有アプリ） サーバー側コード
 * Google Apps Script の Webアプリとして動きます。
 *
 * 初めて使うとき：
 *   1. このプロジェクトを開いたスプレッドシート（共有ドライブに置く）で
 *      関数「setup」を1回実行します。
 *   2. 「デプロイ → 新しいデプロイ → ウェブアプリ」
 *      次のユーザーとして実行：自分 / アクセスできるユーザー：（学校ドメイン）内の全員
 * くわしくは docs/setup.md を見てください。
 */

const APP = {
  TZ: 'Asia/Tokyo',
  TWEET_MAX: 140,
  BODY_MAX: 400,
  TASK_MAX: 100,
  OTHER_SKILL_MAX: 20,
  VIDEO_MAX_BYTES: 30 * 1024 * 1024,
  REACTIONS: ['naruhodo', 'yatta', 'dekita'],
  NG_MESSAGE: 'このままでは投稿できません。言葉づかいを見直してから、もう一度投稿してください。'
};

/* ------------------------------------------------------------------ */
/*  シート構成                                                           */
/* ------------------------------------------------------------------ */

const SCHEMA = {
  Settings: ['key', 'value'],
  Teachers: ['id', 'email', 'name'],
  Students: ['id', 'email', 'grade', 'cls', 'number', 'name', 'groupId', 'suspended'],
  Units: ['id', 'name', 'skills', 'tags', 'groups', 'active', 'createdAt'],
  Posts: ['id', 'unitId', 'groupId', 'authorId', 'type', 'skills', 'tags', 'task', 'body',
          'quoteOf', 'videoId', 'status', 'pick', 'createdAt', 'editedAt', 'level', 'taskId'],
  Reactions: ['postId', 'userId', 'kind', 'at'],
  Reposts: ['postId', 'userId', 'at'],
  Reports: ['id', 'postId', 'reporterId', 'reason', 'status', 'at'],
  Achievements: ['userId', 'unitId', 'skill', 'at'],
  Pins: ['userId', 'unitId', 'postId'],
  Evals: ['userId', 'unitId', 'k', 't', 'a', 'memo', 'at', 'byId'],
  Log: ['id', 'at', 'actorId', 'action', 'postId', 'detail']
};
const JSON_COLS = { value: 1, skills: 1, tags: 1, groups: 1, detail: 1 };
const LEVELS = ['◎', '○', '△'];
/** 各シートで行を見分ける列 */
const KEY_COLS = {
  Settings: ['key'], Teachers: ['id'], Students: ['id'], Units: ['id'], Posts: ['id'],
  Reactions: ['postId', 'userId', 'kind'], Reposts: ['postId', 'userId'], Reports: ['id'],
  Achievements: ['userId', 'unitId', 'skill'], Pins: ['userId', 'unitId'], Evals: ['userId', 'unitId'], Log: ['id']
};
const NUM_COLS = { number: 1, suspended: 1, active: 1, pick: 1, createdAt: 1, editedAt: 1, at: 1 };

const DEFAULT_GROUPS = [
  { id: 'g1', name: '2-1・2-3', classes: ['2-1', '2-3'] },
  { id: 'g2', name: '2-2・2-4', classes: ['2-2', '2-4'] },
  { id: 'g3', name: '3-3・3-4', classes: ['3-3', '3-4'] }
];

const DEFAULT_TAGS = ['助走', '踏切', '着手', '突き放し', '回転', '目線', '着地'];

const DEFAULT_UNITS = [
  {
    name: 'マット運動',
    skills: [
      { cat: '回転系（転がる技）', items: ['前転', '開脚前転', '伸膝前転', '後転', '開脚後転', '伸膝後転', '後転倒立'] },
      { cat: '回転系（倒立から回る技）', items: ['倒立前転', '側方倒立回転', 'ロンダート', '倒立ブリッジ', '前方倒立回転', '前方倒立回転跳び'] },
      { cat: '巧技系（バランスの技）', items: ['片足平均立ち', 'Y字バランス', '頭倒立', '倒立'] }
    ]
  },
  {
    name: '跳び箱運動',
    skills: [
      { cat: '切り返し系', items: ['開脚跳び', 'かかえ込み跳び', '屈身跳び'] },
      { cat: '回転系', items: ['台上前転', '首はね跳び', '頭はね跳び', '前方屈腕倒立回転跳び', '前方倒立回転跳び', '側方倒立回転跳び'] }
    ]
  }
];

/**
 * NGワード（初期リスト）。先生の「設定」画面から追加・削除できます。
 * ひらがなだけの短い言葉は、ふつうの言葉にまぎれやすいので、
 * カタカナ・漢字の形を中心にしています（例：「かんがえろ」に「えろ」が入る）。
 */
const DEFAULT_NG = [
  // 暴力・脅し
  '死ね', 'しね', '氏ね', '市ね', '殺す', 'ころす', 'コロス', '消えろ', 'きえろ', '失せろ', 'うせろ', '黙れ', 'だまれ',
  // 悪口・からかい
  'うざい', 'ウザい', 'ウザ', 'きもい', 'キモい', 'キモ', 'きもっ', 'きしょ', 'キショ',
  'バカ', 'ばか', '馬鹿', 'アホ', 'あほ', '阿呆', 'カス', 'クズ', '屑', 'ゴミ', 'ザコ', 'ざこ', '雑魚',
  'へたくそ', 'ヘタクソ', '下手くそ', '下手糞', '運動音痴', 'センスない', 'センスねー',
  '陰キャ', 'いんきゃ', 'ぼっち', 'ボッチ',
  // 体つきのいじり
  'ブス', 'ぶす', 'デブ', 'でぶ', 'ハゲ', '禿', 'チビ', 'ちび',
  // 差別的な言葉
  'ガイジ', 'がいじ', '池沼', 'しょうがいしゃ',
  // 性的な言葉
  'エロ', 'セックス', 'ちんこ', 'チンコ', 'まんこ', 'マンコ', 'おっぱい'
];
/** NGワードの中に含まれても許可する言葉（例：「ばかり」の「ばか」） */
const DEFAULT_ALLOW = ['ばかり', 'ちびっこ', 'きしょう'];

/* ------------------------------------------------------------------ */
/*  Webアプリの入口                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('コツッター')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * 画面からの呼び出しはすべてここを通ります。
 * @param {string} action
 * @param {string} payloadJson
 * @return {string} JSON
 */
function api(action, payloadJson) {
  DB.reset();
  DB._dirty = {};
  TableVer._memo = null;
  const payload = payloadJson ? JSON.parse(payloadJson) : {};
  const me = currentUser_(payload);
  if (action === 'bootstrap') return JSON.stringify(bootstrap_(me, payload));
  if (me && me.guestAccount) {
    // 共通アカウント：名前を選んで仮ログインするまでは、これだけ使える
    const guestOnly = { guestNames: guestNames_, guestLogin: guestLogin_ };
    if (guestOnly[action]) return JSON.stringify(guestOnly[action](me, payload));
    throw new Error('仮ログインの期限が切れました。もう一度、名前を選んでください。');
  }
  if (!me) throw new Error('このアカウントは登録されていません。先生に確認してください。');
  const studentActions = {
    feed: feed_, createPost: createPost_, editPost: editPost_, deletePost: deletePost_,
    react: react_, repost: repost_, report: report_, pin: pin_, toggleAchievement: toggleAchievement_,
    profile: profile_, uploadVideo: uploadVideo_, badges: badges_, guestLogout: guestLogout_
  };
  const teacherActions = {
    setPick: setPick_, teacherDelete: teacherDelete_, setSuspended: setSuspended_,
    getSettings: getSettings_, setSetting: setSetting_, moderation: moderation_, approve: approve_,
    resolveReport: resolveReport_, buzz: buzz_, missing: missing_, matrix: matrix_,
    evalList: evalList_, evalStudent: evalStudent_, saveEval: saveEval_, exportEval: exportEval_,
    saveUnit: saveUnit_, importStudents: importStudents_, listStudents: listStudents_,
    saveTeacher: saveTeacher_, removeTeacher: removeTeacher_, removeStudent: removeStudent_,
    guestInfo: guestInfo_, guestRegenerate: guestRegenerate_
  };
  let fn = studentActions[action];
  if (!fn && me.teacher) fn = teacherActions[action];
  if (!fn) throw new Error('この操作はできません。');
  return JSON.stringify(fn(me, payload) || {});
}

/* ------------------------------------------------------------------ */
/*  初期設定                                                             */
/* ------------------------------------------------------------------ */

function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss && props.getProperty('SS_ID')) ss = SpreadsheetApp.openById(props.getProperty('SS_ID'));
  if (!ss) throw new Error('スプレッドシートの「拡張機能 → Apps Script」から開いたプロジェクトで実行してください。');
  props.setProperty('SS_ID', ss.getId());

  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const cols = SCHEMA[name];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  });
  ['シート1', 'Sheet1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  if (!props.getProperty('VIDEO_FOLDER_ID')) {
    const folderName = 'コツッター_提出動画（先生のみ）';
    const parents = DriveApp.getFileById(ss.getId()).getParents();
    const folder = parents.hasNext() ? parents.next().createFolder(folderName) : DriveApp.createFolder(folderName);
    props.setProperty('VIDEO_FOLDER_ID', folder.getId());
  }

  DB._ss = ss;
  DB.reset();
  const st = settings_();
  const defaults = {
    groups: DEFAULT_GROUPS, showCounts: true, approvalMode: false, openGroups: {},
    ngWords: DEFAULT_NG, ngAllow: DEFAULT_ALLOW
  };
  Object.keys(defaults).forEach(function (k) {
    if (!(k in st)) DB.insert('Settings', { key: k, value: defaults[k] });
  });
  if (DB.all('Units').length === 0) {
    DEFAULT_UNITS.forEach(function (u, i) {
      DB.insert('Units', {
        id: 'u' + (i + 1), name: u.name, skills: u.skills, tags: DEFAULT_TAGS,
        groups: DEFAULT_GROUPS.map(function (g) { return g.id; }), active: 1, createdAt: Date.now() + i
      });
    });
  }
  const email = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (email && !DB.all('Teachers').some(function (t) { return t.email === email; })) {
    DB.insert('Teachers', { id: newId_('t'), email: email, name: '管理者' });
  }
  DB.finishWrites();
  Ver.bump(['global']);
  return 'セットアップが完了しました。';
}

/* ------------------------------------------------------------------ */
/*  データアクセス                                                        */
/* ------------------------------------------------------------------ */

/**
 * シートの中身は、Googleのキャッシュにも入れておきます。
 * 読むだけのときはスプレッドシートを開かずにすむので、画面の表示が速くなります。
 * 書き込みがあったシートは版番号を変えて、古いキャッシュを使わないようにします。
 */
const TableVer = {
  _memo: null,
  load: function () {
    if (this._memo) return this._memo;
    const ks = Object.keys(SCHEMA).map(function (n) { return 'tv:' + n; });
    this._memo = CacheService.getScriptCache().getAll(ks) || {};
    return this._memo;
  },
  get: function (name) {
    const m = this.load();
    let v = m['tv:' + name];
    if (!v) {
      v = String(Date.now()) + Math.random().toString(36).slice(2, 7);
      CacheService.getScriptCache().put('tv:' + name, v, 21600);
      m['tv:' + name] = v;
    }
    return v;
  },
  bump: function (names) {
    const o = {};
    names.forEach(function (n) { o['tv:' + n] = String(Date.now()) + Math.random().toString(36).slice(2, 7); });
    CacheService.getScriptCache().putAll(o, 21600);
    this._memo = null;
  }
};

const DB = {
  _ss: null,
  _memo: {},
  _dirty: {},
  _inLock: false,
  _pendingVer: null,
  reset: function () { this._memo = {}; },
  /** 書き込みを確定させ、キャッシュの版番号を進める */
  finishWrites: function () {
    const names = Object.keys(this._dirty);
    if (!names.length) return;
    SpreadsheetApp.flush();
    TableVer.bump(names);
    this._dirty = {};
  },
  touch: function (name) {
    delete this._memo[name];
    this._dirty[name] = true;
  },
  ss: function () {
    if (!this._ss) {
      const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
      if (!id) throw new Error('初期設定（setup）がまだ実行されていません。');
      this._ss = SpreadsheetApp.openById(id);
    }
    return this._ss;
  },
  sheet: function (name) { return this.ss().getSheetByName(name); },
  all: function (name) {
    if (this._memo[name]) return this._memo[name];
    const cols = SCHEMA[name];
    let rows = null, key = null;
    // この実行で書き込んだシートは、必ずシートから読む
    // （ロックの中でもキャッシュを使う。キャッシュは前の書き込みが確定した後の版なので、シートと同じ内容）
    if (!this._dirty[name]) {
      key = 'tbl:' + name + ':' + TableVer.get(name);
      rows = BigCache.get(key);
    }
    if (!rows) {
      const sh = this.sheet(name);
      const n = sh.getLastRow() - 1;
      rows = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
      if (key) BigCache.put(key, rows, 21600);
    }
    const out = rows.map(function (r, i) {
      const o = { _row: i + 2 };
      cols.forEach(function (c, j) { o[c] = decode_(c, r[j]); });
      return o;
    });
    this._memo[name] = out;
    return out;
  },
  /** 列が増えたとき、見出し行を自動で直す（実行ごとに1回だけ確認） */
  _hdr: {},
  ensureHeader: function (name, sh) {
    if (this._hdr[name]) return;
    this._hdr[name] = true;
    const cols = SCHEMA[name];
    const cur = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    if (cols.some(function (c, i) { return cur[i] !== c; })) sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  },
  insert: function (name, obj) {
    const sh = this.sheet(name);
    this.ensureHeader(name, sh);
    const cols = SCHEMA[name];
    sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length)
      .setValues([cols.map(function (c) { return encode_(c, obj[c]); })]);
    this.touch(name);
  },
  insertMany: function (name, list) {
    if (!list.length) return;
    const sh = this.sheet(name);
    const cols = SCHEMA[name];
    sh.getRange(sh.getLastRow() + 1, 1, list.length, cols.length)
      .setValues(list.map(function (obj) { return cols.map(function (c) { return encode_(c, obj[c]); }); }));
    this.touch(name);
  },
  /** 全行をまとめて書き直す（行の数は変えない） */
  rewrite: function (name, list) {
    if (!list.length) return;
    const cols = SCHEMA[name];
    this.sheet(name).getRange(2, 1, list.length, cols.length)
      .setValues(list.map(function (obj) { return cols.map(function (c) { return encode_(c, obj[c]); }); }));
    this.touch(name);
  },
  /** 次に読むとき、キャッシュを使わずシートから読む */
  fresh: function (name) {
    delete this._memo[name];
    this._dirty[name] = true;
  },
  /** 書き換える行が本当にその行か、シートで確かめる（違っていたら探し直す） */
  locate: function (name, obj) {
    const cols = SCHEMA[name];
    const keys = KEY_COLS[name] || [cols[0]];
    const same = function (row) {
      return keys.every(function (k) { return String(decode_(k, row[cols.indexOf(k)])) === String(obj[k] == null ? '' : obj[k]); });
    };
    const row = this.sheet(name).getRange(obj._row, 1, 1, cols.length).getValues()[0];
    if (same(row)) return obj._row;
    this.fresh(name);
    const hit = this.all(name).filter(function (o) {
      return keys.every(function (k) { return String(o[k]) === String(obj[k] == null ? '' : obj[k]); });
    })[0];
    if (!hit) throw new Error('データが更新されていました。もう一度試してください。');
    obj._row = hit._row;
    return hit._row;
  },
  update: function (name, obj) {
    const cols = SCHEMA[name];
    const r = this.locate(name, obj);
    this.sheet(name).getRange(r, 1, 1, cols.length)
      .setValues([cols.map(function (c) { return encode_(c, obj[c]); })]);
    this.touch(name);
  },
  remove: function (name, obj) {
    const r = this.locate(name, obj);
    this.sheet(name).deleteRow(r);
    this.touch(name);
  }
};

function encode_(col, v) {
  if (JSON_COLS[col]) return v == null ? '' : "'" + JSON.stringify(v);
  if (NUM_COLS[col]) return v == null || v === '' ? '' : Number(v);
  if (v == null || v === '') return '';
  // 先頭に ' を付けると、数式や日付として解釈されず「文字」として保存されます
  return "'" + String(v);
}

function decode_(col, v) {
  if (JSON_COLS[col]) {
    if (v === '' || v == null) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  if (NUM_COLS[col]) return v === '' || v == null ? 0 : Number(v) || 0;
  return v == null ? '' : String(v);
}

/** 書き込みは必ずロックの中で行います（同時に投稿されても壊れないように） */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  // ロックを待っている間に、ほかの人の書き込みで版が進んでいるかもしれないので読み直す
  TableVer._memo = null;
  DB._inLock = true;
  DB._pendingVer = [];
  try {
    DB.reset();
    return fn();
  } finally {
    try {
      DB.finishWrites();
      const pv = DB._pendingVer;
      DB._pendingVer = null;
      // シートのキャッシュを新しくしてから、タイムラインの版番号を進める
      if (pv && pv.length) Ver.bump(pv, true);
    } finally {
      DB._inLock = false;
      DB.reset();
      lock.releaseLock();
    }
  }
}

/** 変更があったかどうかを、ポーリングのたびに安く判定するための版番号 */
const Ver = {
  get: function (keys) {
    const c = CacheService.getScriptCache();
    const ks = keys.map(function (k) { return 'v:' + k; });
    const got = c.getAll(ks);
    const missing = {};
    const vals = ks.map(function (k) {
      if (got[k]) return got[k];
      const v = String(Date.now()) + Math.floor(Math.random() * 1000);
      missing[k] = v;
      return v;
    });
    if (Object.keys(missing).length) c.putAll(missing, 21600);
    return vals.join('.');
  },
  bump: function (keys, now) {
    if (!now && DB._pendingVer) {
      keys.forEach(function (k) { if (DB._pendingVer.indexOf(k) < 0) DB._pendingVer.push(k); });
      return;
    }
    const c = CacheService.getScriptCache();
    const o = {};
    keys.forEach(function (k) { o['v:' + k] = String(Date.now()) + Math.floor(Math.random() * 1000); });
    c.putAll(o, 21600);
  }
};

/** 大きなデータを分割してキャッシュする（1件 100KB まで、の制限対策） */
const BigCache = {
  SIZE: 25000,
  put: function (key, obj, ttl) {
    const s = JSON.stringify(obj);
    const n = Math.max(1, Math.ceil(s.length / this.SIZE));
    if (n > 200) return;
    const m = {};
    for (let i = 0; i < n; i++) m[key + ':' + i] = s.substr(i * this.SIZE, this.SIZE);
    m[key + ':n'] = String(n);
    try { CacheService.getScriptCache().putAll(m, ttl || 600); } catch (e) { /* キャッシュできなくても動作は続ける */ }
  },
  get: function (key) {
    const c = CacheService.getScriptCache();
    const n = Number(c.get(key + ':n'));
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + ':' + i);
    const got = c.getAll(keys);
    let s = '';
    for (let i = 0; i < keys.length; i++) {
      if (got[keys[i]] == null) return null;
      s += got[keys[i]];
    }
    try { return JSON.parse(s); } catch (e) { return null; }
  }
};

/* ------------------------------------------------------------------ */
/*  共通ヘルパー                                                          */
/* ------------------------------------------------------------------ */

function newId_(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function dayKey_(ms) {
  return Utilities.formatDate(new Date(ms), APP.TZ, 'yyyy-MM-dd');
}

function settings_() {
  const o = {};
  DB.all('Settings').forEach(function (r) { o[r.key] = r.value; });
  return o;
}

function groups_() {
  return settings_().groups || DEFAULT_GROUPS;
}

function groupOfClass_(cls) {
  const g = groups_().filter(function (x) { return (x.classes || []).indexOf(cls) >= 0; })[0];
  return g ? g.id : '';
}

function isOpen_(st, gid) {
  return !st.openGroups || st.openGroups[gid] !== false;
}

function studentMe_(s, email, guest) {
  return {
    id: s.id, email: email, name: s.name, cls: s.cls, number: s.number,
    groupId: s.groupId, suspended: !!s.suspended, teacher: false, guest: !!guest
  };
}

function currentUser_(payload) {
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return null;
  // 先生・生徒の判定結果を覚えておく（名簿や設定が変わると自動で作り直す）
  const vkey = 'me:' + email + ':' + TableVer.get('Teachers') + TableVer.get('Students') + TableVer.get('Settings');
  if (!(payload && payload._g)) {
    const hit = CacheService.getScriptCache().get(vkey);
    if (hit) return JSON.parse(hit);
  }
  const me = currentUserUncached_(email, payload);
  if (me && !me.guest) CacheService.getScriptCache().put(vkey, JSON.stringify(me), 21600);
  return me;
}

function currentUserUncached_(email, payload) {
  const t = DB.all('Teachers').filter(function (x) { return x.email === email; })[0];
  if (t) return { id: t.id, email: email, name: t.name, teacher: true };
  // 共通アカウント（仮ログイン用）
  if ((settings_().guestEmails || []).indexOf(email) >= 0) {
    const tok = payload && payload._g;
    if (tok) {
      const raw = CacheService.getScriptCache().get('guest:' + tok);
      if (raw) {
        const g = JSON.parse(raw);
        const gs = DB.all('Students').filter(function (x) { return x.id === g.sid; })[0];
        if (gs && g.email === email) return studentMe_(gs, email, true);
      }
    }
    return { guestAccount: true, email: email };
  }
  const s = DB.all('Students').filter(function (x) { return x.email === email; })[0];
  if (s) return studentMe_(s, email, false);
  return null;
}

/* ------------------------------------------------------------------ */
/*  仮ログイン（共通アカウント＋名前＋先生の合言葉）                           */
/* ------------------------------------------------------------------ */

function hash_(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** 今日の合言葉（4桁）。毎日変わり、先生が「新しくする」と変わる */
function guestCode_() {
  const salt = settings_().guestSalt;
  if (!salt) return '';
  return String(1000 + hash_(salt + '|' + dayKey_(Date.now())) % 9000);
}

function guestClasses_() {
  const out = [];
  groups_().forEach(function (g) { (g.classes || []).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); }); });
  return out.sort();
}

function guestNames_(me, d) {
  if (guestClasses_().indexOf(d.cls) < 0) throw new Error('組が見つかりません。');
  return {
    students: DB.all('Students').filter(function (s) { return s.cls === d.cls; })
      .sort(function (a, b) { return a.number - b.number; })
      .map(function (s) { return { id: s.id, name: s.name, number: s.number }; })
  };
}

function guestLogin_(me, d) {
  const s = DB.all('Students').filter(function (x) { return x.id === d.studentId; })[0];
  if (!s || !s.groupId) throw new Error('名前が見つかりません。');
  const c = CacheService.getScriptCache();
  const failKey = 'gfail:' + s.id;
  const fails = Number(c.get(failKey) || 0);
  if (fails >= 5) throw new Error('合言葉を何度もまちがえたので、10分ほど待ってからやり直してください。');
  const code = guestCode_();
  if (!code) throw new Error('先生がまだ合言葉を用意していません。先生に伝えてください。');
  if (String(d.code || '').normalize('NFKC').trim() !== code) {
    c.put(failKey, String(fails + 1), 600);
    throw new Error('合言葉がちがいます。');
  }
  const token = Utilities.getUuid();
  // その日の終わりまで（最長6時間）有効
  const now = new Date();
  const hm = Utilities.formatDate(now, APP.TZ, 'HH:mm').split(':');
  const left = (24 * 60 - (Number(hm[0]) * 60 + Number(hm[1]))) * 60;
  c.put('guest:' + token, JSON.stringify({ sid: s.id, email: me.email }), Math.max(60, Math.min(21600, left)));
  c.remove(failKey);
  withLock_(function () { log_(s.id, 'guest_login', '', { name: s.name, cls: s.cls }); });
  return { token: token };
}

function guestLogout_(me, d) {
  if (d._g) CacheService.getScriptCache().remove('guest:' + d._g);
  return { ok: true };
}

function guestInfo_() {
  if (!settings_().guestSalt) {
    withLock_(function () { putSetting_('guestSalt', Utilities.getUuid()); });
    DB.reset();
  }
  return { code: guestCode_(), emails: settings_().guestEmails || [] };
}

function guestRegenerate_() {
  withLock_(function () { putSetting_('guestSalt', Utilities.getUuid()); });
  DB.reset();
  return { code: guestCode_() };
}

function userMap_() {
  const m = {};
  DB.all('Teachers').forEach(function (t) { m[t.id] = { id: t.id, name: t.name, teacher: true }; });
  DB.all('Students').forEach(function (s) {
    m[s.id] = { id: s.id, name: s.name, cls: s.cls, number: s.number, groupId: s.groupId, teacher: false };
  });
  return m;
}

function findUnit_(id) {
  return DB.all('Units').filter(function (u) { return u.id === id; })[0] || null;
}

function unitSkills_(unit) {
  const out = [];
  (unit.skills || []).forEach(function (c) { (c.items || []).forEach(function (s) { out.push(s); }); });
  return out;
}

function unitView_(u) {
  return { id: u.id, name: u.name, skills: u.skills || [], tags: u.tags || [], groups: u.groups || [], active: !!u.active };
}

function visibleUnits_(me) {
  const units = DB.all('Units').slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
  return units.filter(function (u) {
    return me.teacher || (u.groups || []).indexOf(me.groupId) >= 0;
  }).map(unitView_);
}

function findPost_(id) {
  return DB.all('Posts').filter(function (p) { return p.id === id; })[0] || null;
}

/** 生徒がその投稿を見てよいか（同じ授業集団、または全集団向けの先生投稿） */
function canSeePost_(me, p) {
  if (!p) return false;
  if (me.teacher) return true;
  const sameGroup = p.groupId === me.groupId || p.groupId === '*';
  if (!sameGroup) return false;
  return p.status === 'published' || (p.status === 'pending' && p.authorId === me.id);
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function bumpGroup_(gid) {
  if (gid === '*') Ver.bump(groups_().map(function (g) { return 'g:' + g.id; }));
  else Ver.bump(['g:' + gid]);
}

function log_(actorId, action, postId, detail) {
  DB.insert('Log', { id: newId_('l'), at: Date.now(), actorId: actorId, action: action, postId: postId || '', detail: detail || null });
}

function snapshot_(p) {
  return { type: p.type, skills: p.skills, tags: p.tags, task: p.task, body: p.body, level: p.level, authorId: p.authorId };
}

/* ------------------------------------------------------------------ */
/*  NGワード                                                             */
/* ------------------------------------------------------------------ */

function norm_(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[\s・.．_＿\-‐―ー～〜!！?？。、,，"'“”*＊/／]/g, '');
}

/** @return {string|null} 引っかかった言葉（なければ null） */
function ngCheck_(text) {
  const st = settings_();
  const raw = String(text || '').normalize('NFKC');
  let t = norm_(text);
  (st.ngAllow || []).forEach(function (a) {
    const n = norm_(a);
    if (n) t = t.split(n).join('〇');
  });
  const words = st.ngWords || [];
  for (let i = 0; i < words.length; i++) {
    const w = norm_(words[i]);
    if (w && t.indexOf(w) >= 0) return words[i];
  }
  if (/https?:\/\/|www\./i.test(raw)) return '(URL)';
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(raw)) return '(メールアドレス)';
  if (/0\d{9,10}/.test(raw.replace(/[\s\-‐―ー−()（）]/g, ''))) return '(電話番号)';
  return null;
}

/* ------------------------------------------------------------------ */
/*  起動・タイムライン                                                     */
/* ------------------------------------------------------------------ */

function bootstrap_(me, d) {
  if (!me) {
    return { unregistered: true, email: Session.getActiveUser().getEmail() || '' };
  }
  if (me.guestAccount) return { guestAccount: true, classes: guestClasses_() };
  d = d || {};
  const st = settings_();
  const groups = groups_();
  const mine = me.teacher ? groups : groups.filter(function (g) { return g.id === me.groupId; });
  // 最初のタイムラインも一緒に返して、通信の回数を減らす
  let first = null;
  const gid = me.teacher ? (mine.some(function (g) { return g.id === d.groupId; }) ? d.groupId : (mine[0] || {}).id) : me.groupId;
  const units = visibleUnits_(me).filter(function (u) { return !me.teacher || u.groups.indexOf(gid) >= 0; });
  let uid = units.some(function (u) { return u.id === d.unitId; }) ? d.unitId : '';
  if (!uid) uid = ((units.filter(function (u) { return u.active; })[0]) || units[0] || {}).id || '';
  if (d.withFeed && gid && uid) {
    try { first = feed_(me, { unitId: uid, groupId: gid }); first.unitId = uid; first.groupId = gid; } catch (e) { first = null; }
  }
  return {
    feed: first,
    me: {
      id: me.id, name: me.name, cls: me.cls || '', number: me.number || 0,
      teacher: me.teacher, groupId: me.groupId || '', suspended: !!me.suspended, guest: !!me.guest
    },
    groups: mine.map(function (g) { return { id: g.id, name: g.name, classes: g.classes }; }),
    units: visibleUnits_(me),
    limits: { tweet: APP.TWEET_MAX, body: APP.BODY_MAX, task: APP.TASK_MAX, videoBytes: APP.VIDEO_MAX_BYTES, other: APP.OTHER_SKILL_MAX },
    showCounts: st.showCounts !== false,
    approvalMode: !!st.approvalMode
  };
}

function reactionIndex_() {
  const rx = {};
  DB.all('Reactions').forEach(function (r) {
    if (!rx[r.postId]) rx[r.postId] = { naruhodo: [], yatta: [], dekita: [] };
    const arr = rx[r.postId][r.kind];
    if (arr && arr.indexOf(r.userId) < 0) arr.push(r.userId);
  });
  const rp = {};
  DB.all('Reposts').forEach(function (r) {
    if (!rp[r.postId]) rp[r.postId] = [];
    if (rp[r.postId].indexOf(r.userId) < 0) rp[r.postId].push(r.userId);
  });
  return { rx: rx, rp: rp };
}

function authorView_(users, id) {
  const a = users[id] || { id: id, name: '（退会）', teacher: false };
  return { id: a.id, name: a.name, cls: a.cls || '', teacher: !!a.teacher };
}

/** 投稿を、画面に出す形（全員共通の部分）にする */
function postBase_(p, users, idx, byId) {
  const v = {
    id: p.id, unitId: p.unitId, groupId: p.groupId, type: p.type, skills: p.skills || [], tags: p.tags || [],
    task: p.task, body: p.body, createdAt: p.createdAt, editedAt: p.editedAt, status: p.status, pick: !!p.pick,
    author: authorView_(users, p.authorId),
    rx: (idx.rx[p.id]) || { naruhodo: [], yatta: [], dekita: [] },
    rp: idx.rp[p.id] || [],
    videoId: p.videoId || '',
    level: p.level || '',
    taskId: p.taskId || ''
  };
  if (p.quoteOf) {
    const q = byId[p.quoteOf];
    if (q && q.status === 'published') {
      v.quote = {
        id: q.id, type: q.type, skills: q.skills || [], task: q.task, body: q.body, createdAt: q.createdAt,
        author: authorView_(users, q.authorId), groupId: q.groupId
      };
    } else {
      v.quote = { unavailable: true };
    }
  }
  return v;
}

/** 一人ひとりに合わせて、見せてよい情報だけにする */
function personalize_(views, me, st) {
  const showCounts = me.teacher || st.showCounts !== false;
  return views.filter(function (p) {
    if (me.teacher) return true;
    if (p.status === 'published') return true;
    return p.status === 'pending' && p.author.id === me.id;
  }).map(function (p) {
    const o = {};
    Object.keys(p).forEach(function (k) { o[k] = p[k]; });
    o.my = {
      naruhodo: p.rx.naruhodo.indexOf(me.id) >= 0,
      yatta: p.rx.yatta.indexOf(me.id) >= 0,
      dekita: p.rx.dekita.indexOf(me.id) >= 0,
      repost: p.rp.indexOf(me.id) >= 0
    };
    o.counts = showCounts
      ? { naruhodo: p.rx.naruhodo.length, yatta: p.rx.yatta.length, dekita: p.rx.dekita.length, repost: p.rp.length }
      : null;
    o.mine = p.author.id === me.id;
    o.hasVideo = !!p.videoId;
    if (me.teacher && p.videoId) o.videoUrl = 'https://drive.google.com/file/d/' + p.videoId + '/view';
    if (!me.teacher && o.quote && !o.quote.unavailable && o.quote.groupId !== me.groupId && o.quote.groupId !== '*') {
      o.quote = { unavailable: true };
    }
    delete o.rx; delete o.rp; delete o.videoId;
    return o;
  });
}

function buildGroupFeed_(gid, unitId) {
  const users = userMap_();
  const idx = reactionIndex_();
  const byId = {};
  DB.all('Posts').forEach(function (p) { byId[p.id] = p; });
  return DB.all('Posts').filter(function (p) {
    return p.unitId === unitId && (p.groupId === gid || p.groupId === '*') &&
      (p.status === 'published' || p.status === 'pending');
  }).sort(function (a, b) { return b.createdAt - a.createdAt; })
    .map(function (p) { return postBase_(p, users, idx, byId); });
}

function feed_(me, d) {
  const gid = me.teacher ? d.groupId : me.groupId;
  if (!gid) throw new Error('授業集団が設定されていません。先生に確認してください。');
  const v = Ver.get(['global', 'g:' + gid]);
  if (d.ver && d.ver === v) return { unchanged: true, ver: v };
  const key = 'feed:' + gid + ':' + d.unitId + ':' + v;
  let base = BigCache.get(key);
  if (!base) {
    base = buildGroupFeed_(gid, d.unitId);
    BigCache.put(key, base, 900);
  }
  const st = settings_();
  const meRow = me.teacher ? null : DB.all('Students').filter(function (s) { return s.id === me.id; })[0];
  // 送る投稿は新しい順に limit 件まで（古い投稿は「もっと見る」で読む）
  const all = personalize_(base, me, st);
  const limit = Math.max(50, Math.min(3000, Number(d.limit) || 150));
  return {
    ver: v,
    posts: all.slice(0, limit),
    more: all.length > limit,
    open: isOpen_(st, gid),
    suspended: meRow ? !!meRow.suspended : false,
    showCounts: st.showCounts !== false,
    approvalMode: !!st.approvalMode,
    units: visibleUnits_(me),
    badges: me.teacher ? badges_(me) : null
  };
}

/** 先生の画面のお知らせ数（通報・承認待ち） */
function badges_(me) {
  if (!me.teacher) return {};
  return {
    reports: DB.all('Reports').filter(function (r) { return r.status === 'open'; }).length,
    pending: DB.all('Posts').filter(function (p) { return p.status === 'pending'; }).length
  };
}

/* ------------------------------------------------------------------ */
/*  投稿                                                                 */
/* ------------------------------------------------------------------ */

function validatePostInput_(me, d, unit, type) {
  const allSkills = unitSkills_(unit);
  const skills = [];
  (Array.isArray(d.skills) ? d.skills : []).forEach(function (s) {
    s = clean_(s);
    if (!s) return;
    if (allSkills.indexOf(s) >= 0 || (s.indexOf('その他：') === 0 && s.length <= APP.OTHER_SKILL_MAX + 4)) {
      if (skills.indexOf(s) < 0) skills.push(s);
    }
  });
  const tags = (Array.isArray(d.tags) ? d.tags : []).filter(function (t) {
    return (unit.tags || []).indexOf(t) >= 0;
  });
  const task = (type === 'reflection' || type === 'task') ? clean_(d.task) : '';
  const body = type === 'task' ? '' : clean_(d.body);
  const level = type === 'reflection' && LEVELS.indexOf(d.level) >= 0 ? d.level : '';

  if (!me.teacher && skills.length === 0) throw new Error('技を選んでください。');
  if (type === 'task') {
    if (!task) throw new Error('学習課題を書いてください。');
    if (task.length > APP.TASK_MAX) throw new Error('学習課題は' + APP.TASK_MAX + '字までです。');
  } else if (type === 'tweet') {
    if (!body) throw new Error('つぶやきを書いてください。');
    if (body.length > APP.TWEET_MAX) throw new Error('つぶやきは' + APP.TWEET_MAX + '字までです。');
  } else {
    if (!task) throw new Error('学習課題を書いてください。');
    if (task.length > APP.TASK_MAX) throw new Error('学習課題は' + APP.TASK_MAX + '字までです。');
    if (!body) throw new Error('つかんだコツや学んだ過程を書いてください。');
    if (body.length > APP.BODY_MAX) throw new Error('振り返りは' + APP.BODY_MAX + '字までです。');
    if (!me.teacher && !level) throw new Error('学習課題の達成度（◎○△）を選んでください。');
  }
  const hit = ngCheck_([task, body, skills.join(' ')].join('\n'));
  return { skills: skills, tags: tags, task: task, body: body, level: level, hit: hit };
}

function createPost_(me, d) {
  return withLock_(function () {
    const st = settings_();
    const unit = findUnit_(d.unitId);
    if (!unit) throw new Error('単元が見つかりません。');
    if (!unit.active) throw new Error('この単元は終了しているため、投稿できません。');
    let gid;
    if (me.teacher) {
      gid = d.groupId === '*' ? '*' : d.groupId;
      if (gid !== '*' && !groups_().some(function (g) { return g.id === gid; })) throw new Error('授業集団を選んでください。');
    } else {
      const meRow = DB.all('Students').filter(function (s) { return s.id === me.id; })[0];
      gid = meRow.groupId;
      if ((unit.groups || []).indexOf(gid) < 0) throw new Error('この単元には投稿できません。');
      if (meRow.suspended) throw new Error('いまは投稿できません。先生に確認してください。');
      if (!isOpen_(st, gid)) throw new Error('いまは投稿の受付時間外です。');
    }
    const type = ['reflection', 'tweet', 'task'].indexOf(d.type) >= 0 ? d.type : 'tweet';
    const v = validatePostInput_(me, d, unit, type);
    if (v.hit) {
      log_(me.id, 'blocked', '', { text: [v.task, v.body].filter(String).join('\n'), word: v.hit });
      throw new Error(APP.NG_MESSAGE);
    }
    let quoteOf = '';
    if (d.quoteOf) {
      const q = findPost_(d.quoteOf);
      if (!q || q.status !== 'published' || !canSeePost_(me, q)) throw new Error('引用する投稿が見つかりません。');
      quoteOf = q.id;
    }
    let videoId = '';
    if (d.uploadToken && type === 'reflection') {
      videoId = CacheService.getScriptCache().get('up:' + me.id + ':' + d.uploadToken) || '';
      if (!videoId) throw new Error('動画の送信が確認できませんでした。もう一度試してください。');
    }
    let taskId = '';
    if (d.taskId && type === 'reflection') {
      const tp = findPost_(d.taskId);
      if (tp && tp.type === 'task' && tp.authorId === me.id) taskId = tp.id;
    }
    const status = (!me.teacher && st.approvalMode) ? 'pending' : 'published';
    const p = {
      id: newId_('p'), unitId: unit.id, groupId: gid, authorId: me.id, type: type,
      skills: v.skills, tags: v.tags, task: v.task, body: v.body, quoteOf: quoteOf, videoId: videoId,
      status: status, pick: 0, createdAt: Date.now(), editedAt: 0, level: v.level, taskId: taskId
    };
    DB.insert('Posts', p);
    if (me.guest) log_(me.id, 'guest_post', p.id, { name: me.name, cls: me.cls });
    bumpGroup_(gid);
    return { ok: true, id: p.id, pending: status === 'pending' };
  });
}

function editPost_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.id);
    if (!p || p.authorId !== me.id || (p.status !== 'published' && p.status !== 'pending')) {
      throw new Error('この投稿は編集できません。');
    }
    const st = settings_();
    const unit = findUnit_(p.unitId);
    if (!unit || !unit.active) throw new Error('この単元は終了しているため、編集できません。');
    if (!me.teacher) {
      const meRow = DB.all('Students').filter(function (s) { return s.id === me.id; })[0];
      if (meRow.suspended) throw new Error('いまは投稿できません。先生に確認してください。');
      if (!isOpen_(st, p.groupId)) throw new Error('いまは投稿の受付時間外です。');
    }
    const v = validatePostInput_(me, d, unit, p.type);
    if (v.hit) {
      log_(me.id, 'blocked', p.id, { text: [v.task, v.body].filter(String).join('\n'), word: v.hit });
      throw new Error(APP.NG_MESSAGE);
    }
    log_(me.id, 'edit', p.id, snapshot_(p));
    p.skills = v.skills; p.tags = v.tags; p.task = v.task; p.body = v.body;
    if (p.type === 'reflection') p.level = v.level;
    p.editedAt = Date.now();
    if (!me.teacher && st.approvalMode) p.status = 'pending';
    DB.update('Posts', p);
    bumpGroup_(p.groupId);
    return { ok: true, pending: p.status === 'pending' };
  });
}

function deletePost_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.id);
    if (!p || p.authorId !== me.id || (p.status !== 'published' && p.status !== 'pending')) {
      throw new Error('この投稿は削除できません。');
    }
    log_(me.id, 'delete_self', p.id, snapshot_(p));
    p.status = 'deleted_self';
    DB.update('Posts', p);
    removePinsOf_(p.id);
    bumpGroup_(p.groupId);
    return { ok: true };
  });
}

function removePinsOf_(postId) {
  DB.all('Pins').filter(function (x) { return x.postId === postId; })
    .sort(function (a, b) { return b._row - a._row; })
    .forEach(function (x) { DB.remove('Pins', x); });
}

/** 同じ行が重なっていても、すべて消す（下の行から消すので行番号がずれない） */
function removeAll_(name, rows) {
  rows.slice().sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { DB.remove(name, r); });
}

function react_(me, d) {
  if (APP.REACTIONS.indexOf(d.kind) < 0) throw new Error('リアクションの種類が正しくありません。');
  return withLock_(function () {
    const p = findPost_(d.postId);
    if (!p || p.status !== 'published' || !canSeePost_(me, p)) throw new Error('投稿が見つかりません。');
    if (p.authorId === me.id) throw new Error('自分の投稿にはリアクションできません。');
    const rows = DB.all('Reactions').filter(function (r) {
      return r.postId === p.id && r.userId === me.id && r.kind === d.kind;
    });
    removeAll_('Reactions', rows);
    if (!rows.length) DB.insert('Reactions', { postId: p.id, userId: me.id, kind: d.kind, at: Date.now() });
    bumpGroup_(p.groupId);
    return { ok: true, on: !rows.length };
  });
}

function repost_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.postId);
    if (!p || p.status !== 'published' || !canSeePost_(me, p)) throw new Error('投稿が見つかりません。');
    if (p.authorId === me.id) throw new Error('自分の投稿はリポストできません。');
    const rows = DB.all('Reposts').filter(function (r) { return r.postId === p.id && r.userId === me.id; });
    removeAll_('Reposts', rows);
    if (!rows.length) DB.insert('Reposts', { postId: p.id, userId: me.id, at: Date.now() });
    bumpGroup_(p.groupId);
    return { ok: true, on: !rows.length };
  });
}

function report_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.postId);
    if (!p || !canSeePost_(me, p)) throw new Error('投稿が見つかりません。');
    const dup = DB.all('Reports').some(function (r) {
      return r.postId === p.id && r.reporterId === me.id && r.status === 'open';
    });
    if (!dup) {
      DB.insert('Reports', {
        id: newId_('r'), postId: p.id, reporterId: me.id,
        reason: clean_(d.reason).slice(0, 100), status: 'open', at: Date.now()
      });
    }
    return { ok: true };
  });
}

function pin_(me, d) {
  return withLock_(function () {
    const existing = DB.all('Pins').filter(function (x) { return x.userId === me.id && x.unitId === d.unitId; })[0];
    if (!d.postId) {
      if (existing) DB.remove('Pins', existing);
      return { ok: true };
    }
    const p = findPost_(d.postId);
    if (!p || p.authorId !== me.id || p.status !== 'published' || p.type !== 'reflection') {
      throw new Error('固定できるのは、公開されている自分の振り返りだけです。');
    }
    if (existing) { existing.postId = p.id; DB.update('Pins', existing); }
    else DB.insert('Pins', { userId: me.id, unitId: d.unitId, postId: p.id });
    return { ok: true };
  });
}

function toggleAchievement_(me, d) {
  return withLock_(function () {
    const unit = findUnit_(d.unitId);
    if (!unit) throw new Error('単元が見つかりません。');
    if (unitSkills_(unit).indexOf(d.skill) < 0) throw new Error('技が見つかりません。');
    const rows = DB.all('Achievements').filter(function (a) {
      return a.userId === me.id && a.unitId === d.unitId && a.skill === d.skill;
    });
    removeAll_('Achievements', rows);
    if (!rows.length) DB.insert('Achievements', { userId: me.id, unitId: d.unitId, skill: d.skill, at: Date.now() });
    return { ok: true, on: !rows.length };
  });
}

/** 動画は先生だけが開けるフォルダに保存します（最大15秒・30MB） */
function uploadVideo_(me, d) {
  if (me.teacher) throw new Error('動画の提出は生徒用の機能です。');
  const data = String(d.data || '');
  if (!data) throw new Error('動画が空です。');
  if (data.length * 3 / 4 > APP.VIDEO_MAX_BYTES) throw new Error('動画のサイズが大きすぎます（30MBまで）。');
  if (!/^video\//.test(String(d.mime || ''))) throw new Error('動画ファイルを選んでください。');
  const bytes = Utilities.base64Decode(data);
  const ext = (String(d.name || '').match(/\.[A-Za-z0-9]{2,4}$/) || ['.mov'])[0];
  const fname = [me.cls, ('0' + me.number).slice(-2), me.name, Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmm')]
    .join('_') + ext;
  const folderId = PropertiesService.getScriptProperties().getProperty('VIDEO_FOLDER_ID');
  const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, d.mime, fname));
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('up:' + me.id + ':' + token, file.getId(), 21600);
  return { token: token };
}

/* ------------------------------------------------------------------ */
/*  プロフィール                                                          */
/* ------------------------------------------------------------------ */

function profile_(me, d) {
  const users = userMap_();
  const target = users[d.userId];
  if (!target) throw new Error('ユーザーが見つかりません。');
  if (!me.teacher && !target.teacher && target.groupId !== me.groupId) throw new Error('このページは見られません。');
  const st = settings_();
  const showCounts = me.teacher || st.showCounts !== false;
  const idx = reactionIndex_();
  const byId = {};
  DB.all('Posts').forEach(function (p) { byId[p.id] = p; });
  const inUnit = function (p) { return p.unitId === d.unitId; };

  const own = DB.all('Posts').filter(function (p) {
    return inUnit(p) && p.authorId === target.id && canSeePost_(me, p) &&
      (p.status === 'published' || p.status === 'pending');
  }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  const repostRows = DB.all('Reposts').filter(function (r) { return r.userId === target.id; })
    .sort(function (a, b) { return b.at - a.at; });
  const reposted = repostRows.map(function (r) { return byId[r.postId]; }).filter(function (p) {
    return p && inUnit(p) && p.status === 'published' && canSeePost_(me, p);
  });
  const pinRow = DB.all('Pins').filter(function (x) { return x.userId === target.id && x.unitId === d.unitId; })[0];
  const pinned = pinRow && byId[pinRow.postId] && byId[pinRow.postId].status === 'published' ? byId[pinRow.postId] : null;

  const toViews = function (list) {
    return personalize_(list.map(function (p) { return postBase_(p, users, idx, byId); }), me, st);
  };
  let helped = 0;
  own.forEach(function (p) {
    if (p.status !== 'published') return;
    helped += ((idx.rx[p.id] || {}).dekita || []).filter(function (u) { return u !== target.id; }).length;
  });
  const out = {
    user: { id: target.id, name: target.name, cls: target.cls || '', teacher: !!target.teacher },
    posts: toViews(own),
    reposts: toViews(reposted),
    pinned: pinned ? toViews([pinned])[0] || null : null,
    stats: {
      posts: own.filter(function (p) { return p.status === 'published'; }).length,
      quotes: own.filter(function (p) { return p.quoteOf && p.status === 'published'; }).length,
      helped: showCounts ? helped : null
    },
    isMe: target.id === me.id
  };
  if (out.isMe || me.teacher) {
    out.achievements = DB.all('Achievements').filter(function (a) {
      return a.userId === target.id && a.unitId === d.unitId;
    }).map(function (a) { return a.skill; }).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
    // 自分がリアクションした投稿（本人と先生だけが見られる）
    const latest = {};
    DB.all('Reactions').forEach(function (x) {
      if (x.userId !== target.id) return;
      const k = latest[x.postId] || (latest[x.postId] = { at: 0, kinds: [] });
      if (x.at > k.at) k.at = x.at;
      if (k.kinds.indexOf(x.kind) < 0) k.kinds.push(x.kind);
    });
    const reactedPosts = Object.keys(latest).map(function (id) { return byId[id]; }).filter(function (p) {
      return p && inUnit(p) && p.status === 'published' && canSeePost_(me, p);
    }).sort(function (a, b) { return latest[b.id].at - latest[a.id].at; });
    out.reacted = toViews(reactedPosts).map(function (v) { v.reactedKinds = latest[v.id].kinds; return v; });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  先生：投稿の管理                                                      */
/* ------------------------------------------------------------------ */

function setPick_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.postId);
    if (!p) throw new Error('投稿が見つかりません。');
    p.pick = d.on ? 1 : 0;
    DB.update('Posts', p);
    bumpGroup_(p.groupId);
    return { ok: true };
  });
}

function teacherDelete_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.postId);
    if (!p) throw new Error('投稿が見つかりません。');
    if (p.status === 'published' || p.status === 'pending') {
      const snap = snapshot_(p);
      snap.reason = clean_(d.reason || '');
      log_(me.id, 'delete_teacher', p.id, snap);
      p.status = 'deleted_teacher';
      DB.update('Posts', p);
      removePinsOf_(p.id);
    }
    DB.all('Reports').filter(function (r) { return r.postId === p.id && r.status === 'open'; })
      .forEach(function (r) { r.status = 'done'; DB.update('Reports', r); });
    bumpGroup_(p.groupId);
    return { ok: true };
  });
}

function setSuspended_(me, d) {
  return withLock_(function () {
    const s = DB.all('Students').filter(function (x) { return x.id === d.userId; })[0];
    if (!s) throw new Error('生徒が見つかりません。');
    s.suspended = d.on ? 1 : 0;
    DB.update('Students', s);
    log_(me.id, d.on ? 'suspend' : 'unsuspend', '', { userId: s.id, name: s.name, cls: s.cls });
    Ver.bump(['g:' + s.groupId]);
    return { ok: true };
  });
}

function approve_(me, d) {
  return withLock_(function () {
    const p = findPost_(d.postId);
    if (!p || p.status !== 'pending') throw new Error('承認待ちの投稿が見つかりません。');
    if (d.ok) {
      p.status = 'published';
    } else {
      log_(me.id, 'reject', p.id, snapshot_(p));
      p.status = 'rejected';
    }
    DB.update('Posts', p);
    bumpGroup_(p.groupId);
    return { ok: true };
  });
}

function resolveReport_(me, d) {
  return withLock_(function () {
    const r = DB.all('Reports').filter(function (x) { return x.id === d.id; })[0];
    if (r) { r.status = 'done'; DB.update('Reports', r); }
    return { ok: true };
  });
}

function moderation_(me) {
  const users = userMap_();
  const idx = reactionIndex_();
  const byId = {};
  DB.all('Posts').forEach(function (p) { byId[p.id] = p; });
  const st = settings_();
  const view = function (p) {
    const v = personalize_([postBase_(p, users, idx, byId)], me, st)[0];
    v.status = p.status;
    return v;
  };
  const reports = DB.all('Reports').filter(function (r) { return r.status === 'open'; })
    .sort(function (a, b) { return b.at - a.at; })
    .map(function (r) {
      const p = byId[r.postId];
      return {
        id: r.id, at: r.at, reason: r.reason,
        reporter: authorView_(users, r.reporterId),
        post: p ? view(p) : null
      };
    });
  const pending = DB.all('Posts').filter(function (p) { return p.status === 'pending'; })
    .sort(function (a, b) { return a.createdAt - b.createdAt; }).map(view);
  const log = DB.all('Log').slice(-200).reverse().map(function (l) {
    const det = l.detail || {};
    const p = l.postId ? byId[l.postId] : null;
    return {
      id: l.id, at: l.at, action: l.action, actor: authorView_(users, l.actorId),
      author: det.authorId ? authorView_(users, det.authorId) : (p ? authorView_(users, p.authorId) : null),
      detail: det
    };
  });
  const suspended = DB.all('Students').filter(function (s) { return s.suspended; })
    .map(function (s) { return { id: s.id, name: s.name, cls: s.cls, number: s.number }; });
  return { reports: reports, pending: pending, log: log, suspended: suspended };
}

/* ------------------------------------------------------------------ */
/*  先生：バズ・未提出・できた技                                            */
/* ------------------------------------------------------------------ */

function studentsOfGroup_(gid) {
  return DB.all('Students').filter(function (s) { return s.groupId === gid; })
    .sort(function (a, b) { return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : a.number - b.number; });
}

function buzz_(me, d) {
  const today = dayKey_(Date.now());
  const users = userMap_();
  const idx = reactionIndex_();
  const byId = {};
  DB.all('Posts').forEach(function (p) { byId[p.id] = p; });
  const st = settings_();
  const score = {};
  DB.all('Reactions').forEach(function (r) {
    if (d.range === 'today' && dayKey_(r.at) !== today) return;
    if (!score[r.postId]) score[r.postId] = { dekita: 0, yatta: 0, naruhodo: 0, total: 0 };
    score[r.postId][r.kind]++;
    score[r.postId].total++;
  });
  const list = DB.all('Posts').filter(function (p) {
    return p.unitId === d.unitId && p.groupId === d.groupId && p.status === 'published' && score[p.id];
  }).sort(function (a, b) {
    const sa = score[a.id], sb = score[b.id];
    return (sb.dekita - sa.dekita) || (sb.yatta - sa.yatta) || (sb.total - sa.total) || (b.createdAt - a.createdAt);
  }).slice(0, 10).map(function (p) {
    const v = personalize_([postBase_(p, users, idx, byId)], me, st)[0];
    v.score = score[p.id];
    return v;
  });
  return { list: list, today: today };
}

function missing_(me, d) {
  const today = dayKey_(Date.now());
  const done = {}, tasked = {};
  DB.all('Posts').forEach(function (p) {
    if (p.unitId !== d.unitId || (p.status !== 'published' && p.status !== 'pending') || dayKey_(p.createdAt) !== today) return;
    if (p.type === 'reflection') done[p.authorId] = true;
    if (p.type === 'task') tasked[p.authorId] = true;
  });
  const students = studentsOfGroup_(d.groupId);
  const pick = function (s) { return { id: s.id, name: s.name, cls: s.cls, number: s.number }; };
  return {
    today: today,
    total: students.length,
    missing: students.filter(function (s) { return !done[s.id]; }).map(pick),
    noTask: students.filter(function (s) { return !tasked[s.id]; }).map(pick)
  };
}

function matrix_(me, d) {
  const unit = findUnit_(d.unitId);
  if (!unit) throw new Error('単元が見つかりません。');
  const have = {};
  DB.all('Achievements').forEach(function (a) {
    if (a.unitId === d.unitId) have[a.userId + '|' + a.skill] = true;
  });
  const skills = unitSkills_(unit);
  return {
    skills: unit.skills,
    students: studentsOfGroup_(d.groupId).map(function (s) {
      return {
        id: s.id, name: s.name, cls: s.cls, number: s.number,
        done: skills.filter(function (k) { return have[s.id + '|' + k]; })
      };
    })
  };
}

/* ------------------------------------------------------------------ */
/*  先生：評価                                                            */
/* ------------------------------------------------------------------ */

function statsFor_(sid, unitId, idx) {
  const posts = DB.all('Posts').filter(function (p) {
    return p.authorId === sid && p.unitId === unitId && p.status === 'published';
  });
  let helped = 0;
  posts.forEach(function (p) {
    helped += ((idx.rx[p.id] || {}).dekita || []).filter(function (u) { return u !== sid; }).length;
  });
  const unitPostIds = {};
  DB.all('Posts').forEach(function (p) { if (p.unitId === unitId) unitPostIds[p.id] = true; });
  return {
    tasks: posts.filter(function (p) { return p.type === 'task'; }).length,
    reflections: posts.filter(function (p) { return p.type === 'reflection'; }).length,
    tweets: posts.filter(function (p) { return p.type === 'tweet'; }).length,
    quotes: posts.filter(function (p) { return !!p.quoteOf; }).length,
    helped: helped,
    reacted: (function () {
      const seen = {};
      DB.all('Reactions').forEach(function (r) { if (r.userId === sid && unitPostIds[r.postId]) seen[r.postId + '|' + r.kind] = 1; });
      return Object.keys(seen).length;
    })(),
    achievements: DB.all('Achievements').filter(function (a) { return a.userId === sid && a.unitId === unitId; })
      .map(function (a) { return a.skill; }).filter(function (k, i, arr) { return arr.indexOf(k) === i; }).length,
    videos: posts.filter(function (p) { return !!p.videoId; }).length
  };
}

function evalOf_(sid, unitId) {
  const e = DB.all('Evals').filter(function (x) { return x.userId === sid && x.unitId === unitId; })[0];
  return e ? { k: e.k, t: e.t, a: e.a, memo: e.memo, at: e.at } : { k: '', t: '', a: '', memo: '', at: 0 };
}

function evalList_(me, d) {
  const idx = reactionIndex_();
  return {
    students: studentsOfGroup_(d.groupId).map(function (s) {
      return {
        id: s.id, name: s.name, cls: s.cls, number: s.number,
        stats: statsFor_(s.id, d.unitId, idx), ev: evalOf_(s.id, d.unitId)
      };
    })
  };
}

function evalStudent_(me, d) {
  const users = userMap_();
  const s = users[d.userId];
  if (!s || s.teacher) throw new Error('生徒が見つかりません。');
  const idx = reactionIndex_();
  const byId = {};
  DB.all('Posts').forEach(function (p) { byId[p.id] = p; });
  const st = settings_();
  const posts = DB.all('Posts').filter(function (p) {
    return p.authorId === s.id && p.unitId === d.unitId && p.status === 'published';
  }).sort(function (a, b) { return a.createdAt - b.createdAt; });
  const views = personalize_(posts.map(function (p) { return postBase_(p, users, idx, byId); }), me, st);
  const helpedPosts = views.map(function (v) {
    const ids = ((idx.rx[v.id] || {}).dekita || []).filter(function (u) { return u !== s.id; });
    return { post: v, by: ids.map(function (u) { return authorView_(users, u); }) };
  }).filter(function (x) { return x.by.length > 0; })
    .sort(function (a, b) { return b.by.length - a.by.length; });
  const unit = findUnit_(d.unitId);
  return {
    user: { id: s.id, name: s.name, cls: s.cls, number: s.number },
    reflections: views.filter(function (v) { return v.type === 'reflection'; }),
    quotes: views.filter(function (v) { return !!v.quote; }),
    tweets: views.filter(function (v) { return v.type === 'tweet' && !v.quote; }),
    tasks: views.filter(function (v) { return v.type === 'task'; }),
    helpedPosts: helpedPosts,
    achievements: DB.all('Achievements').filter(function (a) { return a.userId === s.id && a.unitId === d.unitId; })
      .map(function (a) { return a.skill; }),
    skills: unit ? unit.skills : [],
    stats: statsFor_(s.id, d.unitId, idx),
    ev: evalOf_(s.id, d.unitId)
  };
}

function saveEval_(me, d) {
  const ok = function (x) { return ['', 'A', 'B', 'C'].indexOf(x) >= 0 ? x : ''; };
  return withLock_(function () {
    const row = DB.all('Evals').filter(function (x) { return x.userId === d.userId && x.unitId === d.unitId; })[0];
    const o = row || { userId: d.userId, unitId: d.unitId };
    o.k = ok(d.k); o.t = ok(d.t); o.a = ok(d.a);
    o.memo = clean_(d.memo).slice(0, 1000);
    o.at = Date.now(); o.byId = me.id;
    if (row) DB.update('Evals', o); else DB.insert('Evals', o);
    return { ok: true };
  });
}

function exportEval_(me, d) {
  const unit = findUnit_(d.unitId);
  const g = groups_().filter(function (x) { return x.id === d.groupId; })[0];
  if (!unit || !g) throw new Error('単元か授業集団が見つかりません。');
  const idx = reactionIndex_();
  const rows = [['組', '番号', '氏名', '学習課題数', '振り返り数', 'つぶやき数', 'やってみた報告数', '生かされた数（できた！）',
    'リアクションした数', 'できた技の数', '動画提出数', '知識・技能', '思考・判断・表現', '主体的に学習に取り組む態度', 'メモ']];
  studentsOfGroup_(d.groupId).forEach(function (s) {
    const st = statsFor_(s.id, d.unitId, idx);
    const ev = evalOf_(s.id, d.unitId);
    rows.push(["'" + s.cls, s.number, "'" + s.name, st.tasks, st.reflections, st.tweets, st.quotes, st.helped,
      st.reacted, st.achievements, st.videos, ev.k, ev.t, ev.a, ev.memo ? "'" + ev.memo : '']);
  });
  const ss = DB.ss();
  const name = ('評価_' + unit.name + '_' + g.name).slice(0, 90);
  let sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  return { ok: true, url: ss.getUrl() + '#gid=' + sh.getSheetId(), sheet: name };
}

/* ------------------------------------------------------------------ */
/*  先生：設定                                                            */
/* ------------------------------------------------------------------ */

function getSettings_() {
  const st = settings_();
  return {
    showCounts: st.showCounts !== false,
    approvalMode: !!st.approvalMode,
    openGroups: st.openGroups || {},
    ngWords: st.ngWords || [],
    ngAllow: st.ngAllow || [],
    guestEmails: st.guestEmails || [],
    groups: groups_(),
    units: DB.all('Units').slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).map(unitView_),
    teachers: DB.all('Teachers').map(function (t) { return { id: t.id, email: t.email, name: t.name }; })
  };
}

function putSetting_(key, value) {
  const row = DB.all('Settings').filter(function (r) { return r.key === key; })[0];
  if (row) { row.value = value; DB.update('Settings', row); }
  else DB.insert('Settings', { key: key, value: value });
}

function setSetting_(me, d) {
  return withLock_(function () {
    const st = settings_();
    switch (d.key) {
      case 'showCounts':
      case 'approvalMode':
        putSetting_(d.key, !!d.value);
        break;
      case 'openGroup': {
        const og = st.openGroups || {};
        og[d.groupId] = !!d.value;
        putSetting_('openGroups', og);
        break;
      }
      case 'guestEmails': {
        const list = (Array.isArray(d.value) ? d.value : []).map(function (w) { return clean_(w).toLowerCase(); })
          .filter(function (w) { return w.indexOf('@') > 0; });
        putSetting_('guestEmails', list.filter(function (w, i) { return list.indexOf(w) === i; }));
        break;
      }
      case 'ngWords':
      case 'ngAllow': {
        const list = (Array.isArray(d.value) ? d.value : []).map(function (w) { return clean_(w); })
          .filter(function (w) { return !!w; });
        putSetting_(d.key, list.filter(function (w, i) { return list.indexOf(w) === i; }));
        break;
      }
      case 'groups': {
        const gs = (d.value || []).map(function (g, i) {
          return {
            id: g.id || ('g' + Date.now().toString(36) + i),
            name: clean_(g.name) || ('集団' + (i + 1)),
            classes: (g.classes || []).map(function (c) { return clean_(c); }).filter(String)
          };
        });
        putSetting_('groups', gs);
        DB.reset();
        DB.fresh('Students');
        const all = DB.all('Students');
        all.forEach(function (s) { s.groupId = groupOfClass_(s.cls); });
        DB.rewrite('Students', all);
        break;
      }
      default:
        throw new Error('この設定は変更できません。');
    }
    Ver.bump(['global']);
    return { ok: true };
  });
}

function saveUnit_(me, d) {
  return withLock_(function () {
    const name = clean_(d.name);
    if (!name) throw new Error('単元名を入れてください。');
    const skills = (d.skills || []).map(function (c) {
      return {
        cat: clean_(c.cat) || '技',
        items: (c.items || []).map(function (s) { return clean_(s); }).filter(String)
      };
    }).filter(function (c) { return c.items.length > 0; });
    if (!skills.length) throw new Error('技を1つ以上登録してください。');
    const tags = (d.tags || []).map(function (t) { return clean_(t).replace(/^[#＃]/, ''); }).filter(String);
    const row = d.id ? findUnit_(d.id) : null;
    const o = row || { id: newId_('u'), createdAt: Date.now() };
    o.name = name; o.skills = skills; o.tags = tags;
    o.groups = (d.groups || []).filter(String);
    o.active = d.active ? 1 : 0;
    if (row) DB.update('Units', o); else DB.insert('Units', o);
    Ver.bump(['global']);
    return { ok: true, id: o.id };
  });
}

/**
 * 名簿の取り込み。rows: [{grade, kumi, number, name, email}]
 * 同じメールアドレスの生徒がいれば上書きします。
 */
function importStudents_(me, d) {
  return withLock_(function () {
    DB.fresh('Students');
    const existing = {};
    DB.all('Students').forEach(function (s) { existing[s.email] = s; });
    const teacherEmails = {};
    DB.all('Teachers').forEach(function (t) { teacherEmails[t.email] = true; });
    let added = 0, updated = 0;
    const newRows = [], changed = [];
    DB.all('Students');
    const noGroup = {};
    const errors = [];
    (d.rows || []).forEach(function (r, i) {
      const email = clean_(r.email).toLowerCase();
      const grade = clean_(r.grade).replace(/[年\s]/g, '').normalize('NFKC');
      const kumi = clean_(r.kumi).replace(/[組\s]/g, '').normalize('NFKC');
      const cls = grade && kumi ? grade + '-' + kumi : '';
      const name = clean_(r.name);
      const number = Number(String(r.number || '').normalize('NFKC').replace(/[^\d]/g, '')) || 0;
      if (!email || email.indexOf('@') < 0 || !cls || !name) {
        errors.push((i + 1) + '行目：学年・組・氏名・メールのどれかが読み取れません');
        return;
      }
      if (teacherEmails[email]) { errors.push((i + 1) + '行目：先生として登録済みのアドレスです'); return; }
      const gid = groupOfClass_(cls);
      if (!gid) noGroup[cls] = true;
      const s = existing[email];
      if (s) {
        s.grade = grade; s.cls = cls; s.number = number; s.name = name; s.groupId = gid;
        if (s._row) changed.push(s);
        updated++;
      } else {
        const ns = { id: newId_('s'), email: email, grade: grade, cls: cls, number: number, name: name, groupId: gid, suspended: 0 };
        newRows.push(ns);
        existing[email] = ns;
        added++;
      }
    });
    if (changed.length) DB.rewrite('Students', DB.all('Students'));
    DB.insertMany('Students', newRows);
    Ver.bump(['global']);
    return { added: added, updated: updated, errors: errors, noGroup: Object.keys(noGroup) };
  });
}

function listStudents_() {
  const gname = {};
  groups_().forEach(function (g) { gname[g.id] = g.name; });
  return {
    students: DB.all('Students').slice().sort(function (a, b) {
      return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : a.number - b.number;
    }).map(function (s) {
      return {
        id: s.id, email: s.email, cls: s.cls, number: s.number, name: s.name,
        groupId: s.groupId, groupName: gname[s.groupId] || '（未割り当て）', suspended: !!s.suspended
      };
    })
  };
}

function removeStudent_(me, d) {
  return withLock_(function () {
    const s = DB.all('Students').filter(function (x) { return x.id === d.id; })[0];
    if (s) DB.remove('Students', s);
    Ver.bump(['global']);
    return { ok: true };
  });
}

function saveTeacher_(me, d) {
  return withLock_(function () {
    const email = clean_(d.email).toLowerCase();
    const name = clean_(d.name);
    if (!email || email.indexOf('@') < 0 || !name) throw new Error('名前とメールアドレスを入れてください。');
    if (DB.all('Students').some(function (s) { return s.email === email; })) throw new Error('生徒として登録済みのアドレスです。');
    const row = DB.all('Teachers').filter(function (t) { return t.email === email || t.id === d.id; })[0];
    if (row) { row.email = email; row.name = name; DB.update('Teachers', row); }
    else DB.insert('Teachers', { id: newId_('t'), email: email, name: name });
    Ver.bump(['global']);
    return { ok: true };
  });
}

function removeTeacher_(me, d) {
  return withLock_(function () {
    if (d.id === me.id) throw new Error('自分自身は削除できません。');
    const row = DB.all('Teachers').filter(function (t) { return t.id === d.id; })[0];
    if (row) DB.remove('Teachers', row);
    Ver.bump(['global']);
    return { ok: true };
  });
}
