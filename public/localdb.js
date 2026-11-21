// この iPad の中に、送った動画と骨格のデータを保存する（IndexedDB）
// 動画は外に送らないので、ほかの端末では再生できません。

let dbPromise = null;
function openLocalDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("mat-coach-local", 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore("videos");
          req.result.createObjectStore("poses");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    // 容量が足りなくなっても消されにくくする
    try {
      navigator.storage && navigator.storage.persist && navigator.storage.persist();
    } catch {}
  }
  return dbPromise;
}

async function localPut(store, key, value) {
  const db = await openLocalDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function localGet(store, key) {
  const db = await openLocalDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const saveVideo = (id, blob) => localPut("videos", id, blob);
export const loadVideo = (id) => localGet("videos", id);
export const savePose = (id, pose) => localPut("poses", id, pose);
export const loadPose = (id) => localGet("poses", id);
