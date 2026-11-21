// Google Apps Script 版を組み立てるスクリプト
//   node tools/build-gas.mjs [ドライブのフォルダID]
// 出力: gas/dist/ に Code.gs（Apps Script に貼る）・index.html（ドライブに置く）と、
//       ドライブに置く部品 gas/dist/assets/*.b64
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f) => fs.readFileSync(path.join(root, "public", f), "utf8");
const gas = (f) => fs.readFileSync(path.join(root, "gas", f), "utf8");
const out = path.join(root, "gas", "dist");
const folderId = process.argv[2] || "__ASSET_FOLDER_ID__";
fs.mkdirSync(path.join(out, "assets"), { recursive: true });

// ---- モジュールを1つのスクリプトにまとめる ----
const modules = [
  ["skills.js", pub("skills.js")],
  ["methods.js", pub("methods.js")],
  ["analyze.js", pub("analyze.js")],
  ["observe.js", pub("observe.js")],
  ["api.js", pub("api.js")],
  ["localdb.js", pub("localdb.js")],
  ["chat.js", pub("chat.js")],
  ["teacher.js", pub("teacher.js")],
  ["gas-loader.js", gas("gas-loader.js")],
  ["app.js", pub("app.js")],
];
const seen = new Map();
const code = modules
  .map(([name, src]) => {
    const body = src
      .replace(/^import [^;]+;\s*$/gm, "")
      .replace(/^export (?=(async )?function|const|let|class)/gm, "");
    for (const m of body.matchAll(/^(?:async function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) throw new Error(`名前が重なっています: ${m[1]}（${seen.get(m[1])} と ${name}）`);
      seen.set(m[1], name);
    }
    return `// ===== ${name} =====\n${body}`;
  })
  .join("\n");
if (/<\/script/i.test(code)) throw new Error("スクリプトの中に </script が含まれています");

const html = pub("index.html");
const bodyStart = html.indexOf("<body>");
const bodyEnd = html.indexOf('<script type="module"');
const body = html.slice(bodyStart + "<body>".length, bodyEnd);
const indexHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<base target="_top" />
<style>
${pub("style.css")}
</style>
</head>
<body>
${body}
<script type="module">
${code}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, "index.html"), indexHtml);

const codeGs = gas("Code.gs").replace("__ASSET_FOLDER_ID__", folderId);
fs.writeFileSync(path.join(out, "Code.gs"), codeGs);
fs.copyFileSync(path.join(root, "gas", "server.js"), path.join(out, "server.js"));
for (const f of ["appsscript.json", "project.json"]) fs.rmSync(path.join(out, f), { force: true });

// ---- ドライブに置く部品（base64 に変えて、分割する）----
const CHUNK = 3_000_000; // 1ファイルあたりの文字数
const assets = {
  bundle: "vendor/mediapipe/vision_bundle.mjs",
  loader: "vendor/mediapipe/wasm/vision_wasm_internal.js",
  wasm: "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  loader_nosimd: "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  wasm_nosimd: "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  model: "vendor/models/pose_landmarker_full.task",
};
for (const f of fs.readdirSync(path.join(out, "assets"))) fs.unlinkSync(path.join(out, "assets", f));
let count = 0;
for (const [name, rel] of Object.entries(assets)) {
  const b64 = fs.readFileSync(path.join(root, "public", rel)).toString("base64");
  for (let i = 0, n = 0; i < b64.length; i += CHUNK, n++) {
    fs.writeFileSync(path.join(out, "assets", `${name}.${String(n).padStart(2, "0")}.b64`), b64.slice(i, i + CHUNK));
    count++;
  }
}
console.log(`gas/dist に出力しました（index.html ${Math.round(indexHtml.length / 1024)}KB、部品 ${count} ファイル）`);
