import AVFoundation

/// マイク入力をリアルタイムで増幅してスピーカー（Bluetooth含む）へ出力する
final class AudioAmplifier: ObservableObject {
    @Published var isRunning = false
    @Published var level: Float = 0          // 0...1 入力レベル
    @Published var gain: Float = 3 { didSet { boost.globalGain = 20 * log10(max(gain, 0.01)) } }
    @Published var routeName = ""

    private let engine = AVAudioEngine()
    private let boost = AVAudioUnitEQ(numberOfBands: 1)   // 低音カット＋音量
    private let limiter = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
        componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_PeakLimiter,
        componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0))

    init() {
        let band = boost.bands[0]
        band.filterType = .highPass
        band.frequency = 180
        band.bypass = false
        boost.globalGain = 20 * log10(gain)

        engine.attach(boost)
        engine.attach(limiter)

        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged),
            name: AVAudioSession.routeChangeNotification, object: nil)
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        // A2DP: 出力は高音質Bluetooth、入力はiPad本体マイク
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.allowBluetoothA2DP, .defaultToSpeaker])
        try session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true)

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        engine.connect(input, to: boost, format: format)
        engine.connect(boost, to: limiter, format: format)
        engine.connect(limiter, to: engine.mainMixerNode, format: format)

        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buf, _ in
            guard let data = buf.floatChannelData?[0] else { return }
            var sum: Float = 0
            for i in 0..<Int(buf.frameLength) { sum += data[i] * data[i] }
            let db = 20 * log10(sqrt(sum / Float(max(buf.frameLength, 1))) + 1e-8)
            DispatchQueue.main.async { self?.level = max(0, min(1, (db + 60) / 60)) }
        }

        try engine.start()
        isRunning = true
        updateRouteName()
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isRunning = false
        level = 0
    }

    @objc private func routeChanged(_ note: Notification) {
        DispatchQueue.main.async { self.updateRouteName() }
    }

    private func updateRouteName() {
        routeName = AVAudioSession.sharedInstance().currentRoute.outputs.first?.portName ?? ""
    }
}
