// 開発用サーバー：Google Apps Script の機能（スプレッドシート・ドライブなど）をまねして、
// gas/server.js をそのまま動かします。画面は public/ をそのまま配信します。
//   node tools/dev-server.mjs [ポート]
// ブラウザで http://localhost:8095/?user=teacher@school.test（先生）や ?user=s1@school.test（生徒）を開きます。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || 8095);
const OUT = process.env.DEV_OUT || path.join(root, "gas", "dist", "dev-drive");
const TEACHER = "teacher@school.test";
fs.mkdirSync(OUT, { recursive: true });

// ---------- まねした Apps Script ----------
let seq = 0;
const newId = (p) => `${p}${++seq}`;
const spreadsheets = {};
const files = {};
const folders = {};
const props = {};
let fakeToday = process.env.DEV_TODAY || null;

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  setNumberFormat() { return this; }
  setValues(vals) {
    for (let i = 0; i < vals.length; i++) {
      const row = (this.sheet.data[this.r - 1 + i] ||= []);
      for (let j = 0; j < vals[i].length; j++) row[this.c - 1 + j] = vals[i][j];
    }
    return this;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.data[this.r - 1 + i] || [];
      out.push(Array.from({ length: this.nc }, (_, j) => (row[this.c - 1 + j] ?? "")));
    }
    return out;
  }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getLastRow() { return this.data.length; }
  getMaxRows() { return 1000; }
  getDataRange() {
    const nc = Math.max(1, ...this.data.map((r) => r.length));
    return new Range(this, 1, 1, Math.max(1, this.data.length), nc);
  }
  setFrozenRows() {}
  deleteRow(i) { this.data.splice(i - 1, 1); }
}
class Spreadsheet {
  constructor(name) { this.id = newId("ss"); this.name = name; this.sheets = [new Sheet("シート1")]; files[this.id] = { id: this.id, name, kind: "ss" }; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
}
const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
function fileObj(f) {
  return {
    getId: () => f.id, getName: () => f.name, getSize: () => (f.content || "").length,
    getMimeType: () => f.mime || "text/plain", getUrl: () => `file://${f.path || f.id}`,
    moveTo: (folder) => { f.parent = folder.getId(); },
    getBlob: () => ({ getDataAsString: () => f.content || "" }),
  };
}
function folderObj(d) {
  return {
    getId: () => d.id, getName: () => d.name,
    getParents: () => iter(d.parent ? [folderObj(folders[d.parent])] : []),
    getFilesByName: (n) => iter(Object.values(files).filter((f) => f.parent === d.id && f.name === n).map(fileObj)),
    getFiles: () => iter(Object.values(files).filter((f) => f.parent === d.id).map(fileObj)),
    getFoldersByName: (n) => iter(Object.values(folders).filter((x) => x.parent === d.id && x.name === n).map(folderObj)),
    createFolder: (n) => { const x = { id: newId("fo"), name: n, parent: d.id }; folders[x.id] = x; return folderObj(x); },
    createFile: (blob) => {
      const id = newId("f");
      const p = path.join(OUT, blob.name.replace(/[\/]/g, "_"));
      fs.writeFileSync(p, blob.data);
      if (blob.html) fs.writeFileSync(p.replace(/\.pdf$/, ".html"), blob.html);
      files[id] = { id, name: blob.name, parent: d.id, path: p, mime: blob.type };
      return fileObj(files[id]);
    },
    setSharing: () => {},
  };
}
const mainFolder = { id: "main", name: "マット運動コーチ", parent: null };
const assetFolder = { id: "assets", name: "骨格推定データ", parent: "main" };
folders.main = mainFolder;
folders.assets = assetFolder;
files.srv = { id: "srv", name: "server.js", parent: "assets", get content() { return fs.readFileSync(path.join(root, "gas", "server.js"), "utf8"); } };

const pad = (n) => String(n).padStart(2, "0");
const services = (user) => ({
  SpreadsheetApp: {
    create: (n) => { const s = new Spreadsheet(n); spreadsheets[s.id] = s; return s; },
    openById: (id) => { if (!spreadsheets[id]) throw new Error("not found"); return spreadsheets[id]; },
  },
  DriveApp: {
    getFolderById: (id) => { if (!folders[id]) throw new Error("no folder"); return folderObj(folders[id]); },
    getFileById: (id) => fileObj(files[id]),
    getRootFolder: () => folderObj(mainFolder),
    Access: { DOMAIN_WITH_LINK: 1 }, Permission: { VIEW: 1 },
  },
  Session: { getActiveUser: () => ({ getEmail: () => user }), getEffectiveUser: () => ({ getEmail: () => TEACHER }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const j = new Date(d.getTime() + 9 * 3600e3);
      let s = `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
      if (fakeToday && fmt === "yyyy-MM-dd") s = fakeToday;
      return fmt === "yyyy-MM-dd" ? s : `${s} ${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}:${pad(j.getUTCSeconds())}`;
    },
    newBlob: (data, type, name) => ({
      getAs: () => ({ setName: (n) => ({ name: n, data: "(PDF の代わり)", html: data, type: "application/pdf" }) }),
    }),
  },
  HtmlService: { createHtmlOutput: (h) => ({ setTitle() { return this; }, addMetaTag() { return this; } }) },
});

function runServer(user) {
  const s = services(user);
  const src = files.srv.content;
  return new Function("FOLDER_ID", ...Object.keys(s), src + "\nreturn { api, setup };")("assets", ...Object.values(s));
}

// ---------- HTTP ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json" };
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const { name, args } = JSON.parse(body);
      const user = String(req.headers["x-dev-user"] || "s1@school.test");
      try {
        const result = runServer(user).api(name, args);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (url.pathname === "/__dev/today") {
      fakeToday = url.searchParams.get("d") || null;
      return res.writeHead(200).end("ok");
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(root, "public", path.normalize(rel));
    if (!file.startsWith(path.join(root, "public"))) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("not found");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
    });
  })
  .listen(PORT, () => console.log(`dev server: http://localhost:${PORT}/?user=teacher@school.test`));
