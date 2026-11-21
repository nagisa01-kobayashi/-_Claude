# 🤸 マット運動コーチ

中学校のマット運動で、生徒が「学習課題を決める → 学習方法を選ぶ → 動画でためす → 振り返る」流れを、トーク形式で支えるアプリです。
Google のサービス（Google ドライブ・Apps Script・スプレッドシート）だけで動き、費用はかかりません。

- **生徒**：日付ごとのトークルームで、コーチの問いかけに答えながら学習を進めます。送った動画は骨格つきでスロー再生でき、いつでも見返せます。動画は生徒の iPad の中だけに保存します。
- **先生**：その日のコーチの問いかけや練習方法メニューを「授業設定」で決めます。クラス → 生徒 → 日付でトークを見られます。学びのまとめに「思考・判断・表現」「主体的に学習に取り組む態度」の評価を入力し、PDF にまとめられます。
- **お手本動画**：ドライブの「お手本動画」フォルダに入れた動画を、生徒がいつでも見られます。
- コーチはアドバイスをしません。分析結果は数字と棒人間の「事実」として示し、考えるのは生徒です。

## しくみ

| 場所 | 内容 |
| --- | --- |
| Apps Script（`gas/Code.gs`） | 短い起動用コード。ドライブの `server.js` と `index.html` を読み込みます |
| ドライブ「骨格推定データ」フォルダ | `server.js`（サーバーの本体）、`index.html`（画面）、`*.b64`（骨格推定のプログラムとモデル） |
| スプレッドシート「マット運動コーチ_データ」 | 生徒・授業設定・トーク・トークルーム・学びのまとめ・評価 |
| 生徒の iPad（IndexedDB） | 送った動画と骨格のデータ、骨格推定の部品 |

## ファイル

| ファイル | 役割 |
| --- | --- |
| `public/app.js` | 全体の画面（左：トーク一覧、右：トーク）、ログイン・登録 |
| `public/chat.js` | 吹き出しの表示、生徒の学習の流れ、骨格つきプレーヤー |
| `public/teacher.js` | 先生の画面（トーク閲覧、まとめ・評価・PDF、授業設定、設定） |
| `public/methods.js` | 練習方法のメニューと、授業設定のひな形 |
| `public/observe.js` | 分析結果を「観察」の言葉にする（アドバイスはしない） |
| `public/analyze.js` | 骨格推定（MediaPipe）と角度の計算 |
| `public/skills.js` | 技と、そのポイント |
| `public/api.js` `public/localdb.js` | サーバーとのやりとり、端末内の保存 |
| `gas/server.js` | サーバーの本体（Apps Script で動く） |
| `gas/gas-loader.js` | 骨格推定の部品をドライブから受け取り、端末に保存する |
| `tools/build-gas.mjs` | 画面を1つの `index.html` にまとめる |
| `tools/dev-server.mjs` | 開発用：Apps Script をまねて `gas/server.js` をそのまま動かす |

## 開発のしかた

```bash
node tools/dev-server.mjs 8095
```

ブラウザで `http://localhost:8095/?user=teacher@school.test`（先生）や `?user=s1@school.test`（生徒）を開きます。

ドライブに置くファイルを作るには、次のコマンドを実行します。

```bash
node tools/build-gas.mjs ドライブのフォルダID
```

`gas/dist/` に `index.html`・`server.js`・`Code.gs`・`assets/*.b64` ができます。

## 注意

- 骨格推定は、体が丸まったり逆さまになったりする場面でずれることがあります。真横から全身が映るように撮影してください。
- 骨格推定には [MediaPipe](https://github.com/google-ai-edge/mediapipe)（Apache License 2.0）を使っています。
