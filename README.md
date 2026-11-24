# コツッター

中学校の保健体育の授業で使う、X（旧Twitter）風の「コツ共有アプリ」です。
誰かがつぶやいたコツや運動のポイントが、ほかの誰かに生かされる流れをつくることを目的にしています。

- 仕様書：[docs/kotsutter-spec.md](docs/kotsutter-spec.md)
- 導入ガイド（先生向け）：[docs/setup.md](docs/setup.md)

## ファイル構成

| パス | 内容 |
|---|---|
| `gas/Code.gs` | サーバー側（Google Apps Script）。データはスプレッドシートとGoogleドライブに保存 |
| `gas/Index.html` | 画面（HTML・CSS・JavaScriptを1ファイルにまとめたもの） |
| `gas/appsscript.json` | Apps Scriptの設定（clasp を使う場合） |
| `dev/server.js` | 開発用：Apps Scriptをまねて、手元で動かすためのサーバー |

## 手元で試す（開発用）

Node.js があれば、Googleの環境なしで動かせます。見本データが自動で入ります。

```bash
node dev/server.js
```

- 先生として開く：http://localhost:8787/?as=teacher@example.jp
- 生徒として開く：http://localhost:8787/?as=s01@example.jp （s01〜s19）

`dev/data.json` を消すと、見本データの状態に戻ります。
