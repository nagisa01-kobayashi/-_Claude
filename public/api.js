// サーバー（Google Apps Script）とのやりとり
// Apps Script の中では google.script.run を、開発用サーバーでは /api を使います。

export function gsRun(fn, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args);
  });
}

export async function withRetry(task, tries = 5) {
  let wait = 800;
  for (let i = 0; ; i++) {
    try {
      return await task();
    } catch (e) {
      // アプリが出したエラー（日本語のメッセージ）はやり直さない
      const msg = String((e && e.message) || e);
      if (i >= tries - 1 || /[ぁ-んァ-ヶ一-龠]/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, wait + Math.random() * 800));
      wait *= 2;
    }
  }
}

const isGas = () => !!(window.google && google.script && google.script.run);

function devUser() {
  try {
    const u = new URLSearchParams(location.search).get("user");
    if (u) sessionStorage.setItem("devUser", u);
    return sessionStorage.getItem("devUser") || "s1@school.test";
  } catch {
    return "s1@school.test";
  }
}

/** サーバーの操作を呼ぶ */
export async function callApi(name, ...args) {
  if (isGas()) {
    const text = await withRetry(() => gsRun("api", name, args));
    return JSON.parse(text);
  }
  const res = await fetch("/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dev-user": devUser() },
    body: JSON.stringify({ name, args }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "サーバーでエラーが起きました。");
  return JSON.parse(json.result);
}
