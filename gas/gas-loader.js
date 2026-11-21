// Google Apps Script 版だけで使う、骨格推定の部品の読み込み。
// 部品は Google ドライブに置いた base64 のテキストを少しずつ受け取り、
// iPad の中（IndexedDB）に保存して、2回目からはすぐに使えるようにします。

const ASSET_VERSION = "mediapipe-0.10.14-full";
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

// gsRun と withRetry は api.js にあります

// ---- iPad の中への保存（IndexedDB）。使えない環境では保存せずに進む ----
function openDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("mat-coach", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("assets");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function dbGet(db, key) {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const req = db.transaction("assets").objectStore("assets").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function dbPut(db, key, value) {
  return new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gasAssetProvider(onProgress) {
  onProgress(0, "はじめての準備をしています…");
  let simd = false;
  try {
    await WebAssembly.instantiate(SIMD_TEST);
    simd = true;
  } catch {}
  const want = { bundle: "bundle", loader: simd ? "loader" : "loader_nosimd", wasm: simd ? "wasm" : "wasm_nosimd", model: "model" };

  const db = await openDb();
  const buffers = {};
  let list = null;
  let done = 0;
  for (const [role, name] of Object.entries(want)) {
    const key = `${ASSET_VERSION}/${name}`;
    const cached = await dbGet(db, key);
    if (cached) {
      buffers[role] = cached;
      continue;
    }
    if (!list) {
      list = await withRetry(() => gsRun("getAssetList"));
    }
    const chunks = list[name];
    if (!chunks || !chunks.length) throw new Error(`部品「${name}」が見つかりません。先生に知らせてください。`);
    const total = Object.values(want).reduce((s, n) => s + (list[n] || []).reduce((a, c) => a + c.size, 0), 0);
    const parts = [];
    for (const c of chunks) {
      const text = await withRetry(() => gsRun("getAssetChunk", c.name));
      parts.push(decodeBase64(text));
      done += c.size;
      onProgress(Math.min(0.99, done / total), `はじめての準備をしています（${Math.round((done / total) * 100)}%）… 2回目からはすぐに始まります`);
    }
    const size = parts.reduce((s, p) => s + p.length, 0);
    const all = new Uint8Array(size);
    let off = 0;
    for (const p of parts) {
      all.set(p, off);
      off += p.length;
    }
    buffers[role] = all.buffer;
    await dbPut(db, key, all.buffer);
  }

  const url = (buf, type) => URL.createObjectURL(new Blob([buf], { type }));
  const vision = await import(url(buffers.bundle, "text/javascript"));
  return {
    vision,
    fileset: {
      wasmLoaderPath: url(buffers.loader, "text/javascript"),
      wasmBinaryPath: url(buffers.wasm, "application/wasm"),
    },
    baseOptions: { modelAssetBuffer: new Uint8Array(buffers.model) },
  };
}

setAssetProvider(gasAssetProvider);
