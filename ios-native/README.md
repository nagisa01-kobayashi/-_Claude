# こえアンプ（ネイティブ版 / SwiftUI）

Webアプリ版より遅延が少し小さく、出力先の制御が確実な版です。ビルドには **Mac と Xcode** が必要です。

## ビルド手順
1. Xcode → File → New → Project → iOS「App」（Interface: SwiftUI、名前: VoiceAmp）
2. 自動生成された `VoiceAmpApp.swift` / `ContentView.swift` を、このフォルダの3ファイルで置き換え（`AudioAmplifier.swift` も追加）
3. ターゲット → Info に `Privacy - Microphone Usage Description`（例:「声を拡声するためにマイクを使います」）を追加
4. Signing & Capabilities → Background Modes →「Audio, AirPlay, and Picture in Picture」をオン（画面を閉じても動かしたい場合）
5. iPadをMacにつないで実行

## ポイント
- `.allowBluetoothA2DP` を指定しているため、出力は高音質のBluetooth（A2DP）、入力はiPad本体マイクになります。
- 低音カット(180Hz) → 音量 → ピークリミッター の順で処理し、ハウリングと音割れを抑えます。
