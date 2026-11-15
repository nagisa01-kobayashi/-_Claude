"""『ONE GOAL』— オギカワールドカップ 主題歌
メロディ・歌詞・コード・伴奏をここで定義し、
  - one_goal.mid  (MIDI：歌詞付き)
  - one_goal.wav / one_goal.mp3 (シンセ音源)
  - one_goal.ly   (LilyPond 楽譜ソース → PDF)
を書き出す。
"""
import os
import subprocess
import numpy as np
import mido

HERE = os.path.dirname(os.path.abspath(__file__))
BPM = 140
BEAT = 60.0 / BPM
SR = 44100

# ---------------------------------------------------------------- 楽曲データ
# 1小節 = 4拍。各音符は (歌詞, 音名 or None(休符), 拍数)。歌詞 "_" はタイで前の音を延ばす。
R = None
MELODY = [
    # --- Intro（スタジアムの掛け声） Bm G D A
    [("Oh", "F#4", 1.5), ("oh", "F#4", .5), ("oh", "A4", 1), ("oh", "B4", 1)],
    [("Oh", "A4", 1.5), ("oh", "F#4", .5), ("oh", "E4", 2)],
    [("Oh", "F#4", 1.5), ("oh", "F#4", .5), ("oh", "A4", 1), ("oh", "B4", 1)],
    [("", R, 1), ("Let's", "A4", .5), ("go", "A4", .5), ("に", "B4", .5), ("ちゅう", "D5", 1.5)],
    # --- Aメロ  Bm G D A | Bm G A A
    [("ふ", "B4", .5), ("え", "B4", .5), ("が", "A4", .5), ("な", "B4", .5), ("る", "D5", 1), ("グ", "F#4", .5), ("ラ", "F#4", .5)],
    [("ウ", "G4", .5), ("ン", "G4", .5), ("ド", "A4", .5), ("が", "B4", .5), ("ゆ", "A4", .5), ("れ", "G4", .5), ("る", "F#4", .5), ("", R, .5)],
    [("", R, .5), ("は", "F#4", .5), ("し", "A4", .5), ("り", "A4", .5), ("だ", "B4", .5), ("せ", "D5", 1), ("", R, .5)],
    [("か", "C#5", .5), ("ぜ", "C#5", .5), ("を", "B4", .5), ("きっ", "A4", .5), ("て", "A4", 1.5), ("", R, .5)],
    [("", R, .5), ("ボー", "B4", 1), ("ル", "A4", .5), ("に", "B4", .5), ("こ", "D5", .5), ("め", "D5", .5), ("ろ", "D5", .5)],
    [("あ", "B4", .5), ("つ", "B4", .5), ("い", "A4", .5), ("お", "G4", .5), ("も", "A4", .5), ("い", "B4", 1.5)],
    [("な", "A4", .5), ("か", "A4", .5), ("ま", "A4", .5), ("の", "B4", .5), ("こ", "C#5", .5), ("え", "C#5", .5), ("が", "B4", .5), ("", R, .5)],
    [("せ", "A4", .5), ("な", "A4", .5), ("か", "B4", .5), ("を", "C#5", .5), ("お", "C#5", .5), ("す", "E5", 1.5)],
    # --- Bメロ  G A G A
    [("ま", "D5", .5), ("け", "D5", .5), ("ら", "D5", .5), ("れ", "D5", .5), ("な", "E5", .5), ("い", "D5", 1), ("", R, .5)],
    [("こ", "C#5", .5), ("の", "C#5", .5), ("いっ", "C#5", .5), ("しゅん", "D5", 1), ("に", "E5", 1), ("", R, .5)],
    [("す", "D5", .5), ("べ", "D5", .5), ("て", "D5", .5), ("を", "E5", .5), ("か", "E5", .5), ("け", "D5", .5), ("て", "B4", 1)],
    [("Here", "A4", 1), ("we", "C#5", 1), ("go!", "E5", 2)],
    # --- サビ  D A Bm G | D A G A-D
    [("オ", "D5", .5), ("ギ", "D5", .5), ("カ", "D5", 1), ("ワー", "E5", 1), ("ル", "D5", .5), ("ド", "C#5", .5)],
    [("カッ", "C#5", .5), ("プ", "A4", .5), ("Go", "A4", .5), ("for", "B4", .5), ("the", "C#5", .5), ("goal!", "E5", 1.5)],
    [("も", "D5", .5), ("え", "D5", .5), ("ろ", "D5", .5), ("に", "F#5", 1), ("ちゅう", "E5", 1.5)],
    [("ゴー", "D5", 1), ("ル", "B4", .5), ("を", "B4", .5), ("う", "A4", .5), ("ば", "B4", .5), ("え", "B4", 1)],
    [("One", "A4", .5), ("team,", "D5", 1), ("one", "A4", .5), ("dream", "E5", 1.5), ("", R, .5)],
    [("つ", "C#5", .5), ("な", "C#5", .5), ("げ", "D5", .5), ("パ", "E5", .5), ("ス", "D5", .5), ("を", "C#5", 1), ("", R, .5)],
    [("しょう", "D5", 1), ("り", "D5", .5), ("を", "D5", .5), ("つ", "E5", .5), ("か", "D5", .5), ("め", "B4", 1)],
    [("We", "A4", .5), ("are", "C#5", .5), ("に", "E5", 1), ("ちゅう!", "D5", 2)],
    # --- アウトロ  D A Bm G | G A G-A D
    [("Oh", "F#4", 1.5), ("oh", "F#4", .5), ("oh", "A4", 1), ("oh", "B4", 1)],
    [("Oh", "A4", 1.5), ("oh", "F#4", .5), ("oh", "E4", 2)],
    [("Oh", "F#4", 1.5), ("oh", "F#4", .5), ("oh", "A4", 1), ("oh", "B4", 1)],
    [("", R, 1), ("Let's", "A4", .5), ("go", "A4", .5), ("に", "B4", .5), ("ちゅう", "D5", 1.5)],
    [("に", "D5", .5), ("ちゅう!", "D5", 1), ("", R, .5), ("に", "D5", .5), ("ちゅう!", "D5", 1), ("", R, .5)],
    [("に", "E5", .5), ("ちゅう!", "E5", 1), ("", R, .5), ("に", "E5", .5), ("ちゅう!", "E5", 1), ("", R, .5)],
    [("Go", "D5", 1), ("for", "D5", .5), ("the", "E5", .5), ("goal!", "F#5", 2)],
    [("_", "F#5", 4)],
]

# 各小節のコード: [(コード名, 拍数), ...]
def bars(*names):
    return [[(n, 4)] for n in names]

CHORDS = (
    bars("Bm", "G", "D", "A")                                   # Intro
    + bars("Bm", "G", "D", "A", "Bm", "G", "A", "A")              # Aメロ
    + bars("G", "A", "G", "A")                                    # Bメロ
    + bars("D", "A", "Bm", "G", "D", "A", "G") + [[("A", 2), ("D", 2)]]  # サビ
    + bars("D", "A", "Bm", "G", "G", "A") + [[("G", 2), ("A", 2)]] + bars("D")  # アウトロ
)

SECTIONS = [  # (名前, 開始小節(0始まり), 小節数)
    ("intro", 0, 4), ("verse", 4, 8), ("pre", 12, 4), ("chorus", 16, 8), ("outro", 24, 8),
]
NBARS = len(MELODY)
assert NBARS == len(CHORDS) == 32
for i, b in enumerate(MELODY):
    assert abs(sum(d for _, _, d in b) - 4) < 1e-9, f"bar {i+1}"
for i, b in enumerate(CHORDS):
    assert sum(d for _, d in b) == 4, f"chord bar {i+1}"


def section_of(bar):
    for name, s, n in SECTIONS:
        if s <= bar < s + n:
            return name
    return "end"


NOTE_IDX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_num(name):
    n = NOTE_IDX[name[0]]
    rest = name[1:]
    while rest and rest[0] in "#b":
        n += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return n + 12 * (int(rest) + 1)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


CHORD_ROOT = {"Bm": 47, "G": 43, "D": 50, "A": 45, "F#m": 42, "E": 40}   # ギターの根音(オクターブ2付近)
CHORD_TRIAD = {"Bm": [0, 3, 7], "G": [0, 4, 7], "D": [0, 4, 7], "A": [0, 4, 7], "F#m": [0, 3, 7], "E": [0, 4, 7]}


def chord_events():
    """(開始拍, 拍数, コード名) のリスト"""
    ev, t = [], 0.0
    for b in CHORDS:
        for name, d in b:
            ev.append((t, d, name))
            t += d
    return ev


def melody_events():
    """(開始拍, 拍数, midi, 歌詞) — タイは結合済み"""
    ev, t = [], 0.0
    for b in MELODY:
        for lyr, p, d in b:
            if p is not None:
                if lyr == "_" and ev:
                    s, dd, m, l = ev[-1]
                    ev[-1] = (s, dd + d, m, l)
                else:
                    ev.append((t, d, midi_num(p), lyr))
            t += d
    return ev


# ---------------------------------------------------------------- 合成ユーティリティ
TOTAL_BEATS = NBARS * 4 + 1
TOTAL_SEC = TOTAL_BEATS * BEAT + 3.0
N = int(TOTAL_SEC * SR)
rng = np.random.default_rng(7)


def env(n, a=0.005, d=0.1, s=0.7, r=0.05, sustain_len=None):
    """ADSR エンベロープ（n サンプル。最後の r 秒がリリース）"""
    e = np.ones(n)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = max(1, min(na, n))
    e[:na] = np.linspace(0, 1, na)
    nd = min(nd, max(0, n - na))
    if nd > 0:
        e[na:na + nd] = np.linspace(1, s, nd)
    e[na + nd:] = s
    nr = min(nr, n)
    if nr > 0:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def additive(freq, n, nharm, bright, odd_only=False, vib=None):
    t = np.arange(n) / SR
    phase = 2 * np.pi * freq * t
    if vib is not None:
        rate, depth, delay = vib
        ramp = np.clip((t - delay) / 0.2, 0, 1)
        phase = 2 * np.pi * np.cumsum(freq * (1 + depth * ramp * np.sin(2 * np.pi * rate * t))) / SR
    out = np.zeros(n)
    kmax = int(min(nharm, (SR / 2 - 500) / freq))
    for k in range(1, kmax + 1):
        if odd_only and k % 2 == 0:
            continue
        out += np.sin(k * phase) / k * np.exp(-(k - 1) / bright)
    return out


def place(buf, sig, t_sec, gain=1.0):
    i = int(t_sec * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += gain * sig[: j - i]


def smooth(x, k):
    ker = np.ones(k) / k
    return np.convolve(x, ker, mode="same")


def highpass_noise(n, k=6):
    x = rng.standard_normal(n)
    return x - smooth(x, k)


# ---------------------------------------------------------------- ドラム
def kick():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 45 + 85 * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    s[:200] += rng.standard_normal(200) * 0.3 * np.linspace(1, 0, 200)
    return s


def snare():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    nz = highpass_noise(n, 4) * np.exp(-t / 0.10)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return 0.55 * nz + 0.6 * tone


def hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    return highpass_noise(n, 3) * np.exp(-t / (0.12 if open_ else 0.022))


def crash():
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    return highpass_noise(n, 3) * np.exp(-t / 0.8)


def tom(f0=150):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = f0 * (0.7 + 0.3 * np.exp(-t / 0.05))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)


def clap():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for off in (0, 0.010, 0.021):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) / (0.008 if off < 0.02 else 0.07))
    return highpass_noise(n, 5) * e


K, S, CR, CL = kick(), snare(), crash(), clap()
HC, HO = hat(), hat(True)
T1, T2, T3 = tom(190), tom(140), tom(100)


def drums():
    buf = np.zeros(N)
    for bar in range(NBARS):
        sec = section_of(bar)
        b0 = bar * 4
        hit = lambda beat, smp, g: place(buf, smp, (b0 + beat) * BEAT, g)
        if sec == "intro" or (sec == "outro" and bar < 28):
            # スタジアム風のタム・パターン
            for bt in (0, 1.5, 2, 3):
                hit(bt, K, 0.9)
            for bt, tm in ((0, T3), (0.75, T3), (1.5, T2), (2, T3), (2.75, T3), (3.5, T1)):
                hit(bt, tm, 0.55)
            hit(1, S, 0.6); hit(3, S, 0.6)
            for i in range(8):
                hit(i * 0.5, HC, 0.12)
            if bar in (0, 24):
                hit(0, CR, 0.35)
        elif sec == "verse":
            for bt in (0, 2, 2.5):
                hit(bt, K, 0.9)
            hit(1, S, 0.7); hit(3, S, 0.7)
            for i in range(8):
                hit(i * 0.5, HC, 0.16 if i % 2 == 0 else 0.10)
            if bar == 4:
                hit(0, CR, 0.3)
        elif sec == "pre":
            for bt in range(4):
                hit(bt, K, 0.9)
            if bar < 15:
                hit(1, S, 0.7); hit(3, S, 0.7)
                for i in range(4):
                    hit(i, HO, 0.12)
            else:  # フィル
                for i in range(16):
                    hit(i * 0.25, S, 0.25 + 0.03 * i)
        else:  # chorus / outro後半
            for bt in (0, 1.5, 2, 2.5):
                hit(bt, K, 0.95)
            hit(1, S, 0.8); hit(3, S, 0.8)
            for i in range(8):
                hit(i * 0.5, HO if i % 2 == 1 else HC, 0.14)
            if bar in (16, 20, 28, 30):
                hit(0, CR, 0.4)
            if sec == "outro":
                hit(1, CL, 0.5); hit(3, CL, 0.5)
                if bar == 31:  # 最後のタム回し
                    for i, tm in enumerate([T1] * 4 + [T2] * 4 + [T3] * 4 + [S] * 4):
                        hit(i * 0.25, tm, 0.5)
    # ラストの一撃
    end = NBARS * 4 * BEAT
    place(buf, K, end, 1.0); place(buf, CR, end, 0.5); place(buf, S, end, 0.8)
    return buf


# ---------------------------------------------------------------- ベース・ギター・パッド
def bass():
    buf = np.zeros(N)
    for start, dur, name in chord_events():
        bar = int(start // 4)
        sec = section_of(bar)
        root = CHORD_ROOT[name] - 12
        step = 0.5
        n_steps = int(dur / step)
        for i in range(n_steps):
            t = start + i * step
            # サビ・アウトロは8分でオクターブを混ぜる
            m = root + (12 if sec in ("chorus", "outro") and i % 4 == 3 else 0)
            n = int(step * BEAT * SR * 0.92)
            s = additive(mtof(m), n, 12, 3.5) * env(n, 0.003, 0.08, 0.6, 0.02)
            place(buf, s, t * BEAT, 0.55)
    end = NBARS * 4 * BEAT
    n = int(2.5 * SR)
    place(buf, additive(mtof(CHORD_ROOT["D"] - 12), n, 12, 3.5) * env(n, .003, .3, .5, 1.5), end, 0.6)
    return buf


def dist(x, gain=6.0):
    y = np.tanh(gain * x)
    return smooth(y, 6)


def power_chord(name, n, palm=False):
    root = CHORD_ROOT[name]
    s = np.zeros(n)
    for m in (root, root + 7, root + 12):
        s += additive(mtof(m), n, 24, 9) * (1.0 if m == root else 0.8)
        s += additive(mtof(m) * 1.004, n, 24, 9) * 0.5  # ダブリング感
    s = dist(s * 0.35, 4.0 if palm else 6.0)
    return s


def guitar():
    buf = np.zeros(N)
    for start, dur, name in chord_events():
        bar = int(start // 4)
        sec = section_of(bar)
        if sec == "verse":  # ブリッジミュートの8分刻み
            for i in range(int(dur / 0.5)):
                n = int(0.5 * BEAT * SR)
                s = power_chord(name, n, palm=True) * env(n, 0.002, 0.06, 0.15, 0.02)
                place(buf, s, (start + i * 0.5) * BEAT, 0.30)
        elif sec == "pre":
            for i in range(int(dur / 1)):
                n = int(1 * BEAT * SR)
                s = power_chord(name, n) * env(n, 0.003, 0.2, 0.6, 0.03)
                place(buf, s, (start + i) * BEAT, 0.32)
        else:  # 伸ばし＋半小節ごとに再ストローク
            seg = 2.0 if dur >= 2 else dur
            for i in range(int(dur / seg)):
                n = int(seg * BEAT * SR)
                s = power_chord(name, n) * env(n, 0.004, 0.4, 0.75, 0.04)
                place(buf, s, (start + i * seg) * BEAT, 0.32)
    end = NBARS * 4 * BEAT
    n = int(2.8 * SR)
    place(buf, power_chord("D", n) * env(n, .004, .5, .6, 1.8), end, 0.36)
    return buf


def pad():
    buf = np.zeros(N)
    for start, dur, name in chord_events():
        sec = section_of(int(start // 4))
        if sec not in ("chorus", "outro", "pre"):
            continue
        n = int(dur * BEAT * SR)
        root = CHORD_ROOT[name] + 12
        s = np.zeros(n)
        for iv in CHORD_TRIAD[name]:
            f = mtof(root + iv)
            s += additive(f, n, 14, 4) + additive(f * 1.006, n, 14, 4)
        place(buf, s * env(n, 0.08, 0.2, 0.8, 0.1), start * BEAT, 0.05 if sec == "pre" else 0.08)
    return buf


def lead():
    """歌メロをなぞる、ブラス風のリード（歌のガイド）"""
    buf = np.zeros(N)
    for start, dur, m, lyr in melody_events():
        n = int(dur * BEAT * SR * 0.95)
        f = mtof(m)
        s = 0.7 * additive(f, n, 16, 5, vib=(5.5, 0.006, 0.18)) + 0.5 * additive(f, n, 16, 4, odd_only=True)
        # 掛け声パートはオクターブ下も重ねて「みんなで歌う」感じに
        if lyr in ("Oh", "oh") or "ちゅう" in lyr:
            s += 0.6 * additive(f / 2, n, 12, 4)
        place(buf, s * env(n, 0.02, 0.1, 0.85, 0.05), start * BEAT, 0.22)
    # 簡易ディレイ（スタジアムの広がり）
    d = int(BEAT * 0.75 * SR)
    out = buf.copy()
    out[d:] += 0.28 * buf[:-d]
    out[2 * d:] += 0.12 * buf[:-2 * d]
    return out


def render_audio():
    mix = (
        drums() * 0.9
        + bass()
        + guitar()
        + pad()
        + lead()
    )
    fade = int(0.5 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)          # 軽いリミッター
    mix *= 0.89 / np.max(np.abs(mix))
    # ステレオ化：ほんの少しだけ左右をずらす
    dl = int(0.012 * SR)
    left = mix
    right = np.concatenate([np.zeros(dl), mix[:-dl]]) * 0.6 + mix * 0.4
    st = np.stack([left, right], axis=1)
    pcm = (st * 32767).astype("<i2")
    import wave
    wav = os.path.join(HERE, "one_goal.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "192k",
                    os.path.join(HERE, "one_goal.mp3")], check=True)


# ---------------------------------------------------------------- MIDI
def render_midi():
    mf = mido.MidiFile(ticks_per_beat=480, charset="utf-8")
    tpb = 480

    def track(name, events, channel, program, lyrics=False):
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=name))
        if channel != 9:
            tr.append(mido.Message("program_change", program=program, channel=channel))
        msgs = []
        for start, dur, note, vel, lyr in events:
            on, off = int(start * tpb), int((start + dur) * tpb) - 10
            if lyrics and lyr:
                msgs.append((on, 0, mido.MetaMessage("lyrics", text=lyr)))
            msgs.append((on, 1, mido.Message("note_on", note=note, velocity=vel, channel=channel)))
            msgs.append((off, -1, mido.Message("note_off", note=note, velocity=0, channel=channel)))
        msgs.sort(key=lambda x: (x[0], x[1]))
        now = 0
        for t, _, m in msgs:
            m.time = t - now
            now = t
            tr.append(m)
        return tr

    conductor = mido.MidiTrack()
    conductor.append(mido.MetaMessage("track_name", name="ONE GOAL"))
    conductor.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
    conductor.append(mido.MetaMessage("time_signature", numerator=4, denominator=4))
    conductor.append(mido.MetaMessage("key_signature", key="D"))
    mf.tracks.append(conductor)

    mel = [(s, d, m, 100, l) for s, d, m, l in melody_events()]
    mf.tracks.append(track("Melody (歌)", mel, 0, 61, lyrics=True))   # Brass Section

    gtr, bas = [], []
    for s, d, name in chord_events():
        r = CHORD_ROOT[name]
        for m in (r, r + 7, r + 12):
            gtr.append((s, d, m, 90, None))
        for i in range(int(d / 0.5)):
            bas.append((s + i * 0.5, 0.5, r - 12, 95, None))
    mf.tracks.append(track("Guitar", gtr, 1, 30))   # Distortion Guitar
    mf.tracks.append(track("Bass", bas, 2, 33))

    dr = []
    for bar in range(NBARS):
        b0 = bar * 4
        sec = section_of(bar)
        for bt in (0, 2, 2.5) if sec == "verse" else (0, 1.5, 2, 2.5):
            dr.append((b0 + bt, 0.25, 36, 110, None))
        for bt in (1, 3):
            dr.append((b0 + bt, 0.25, 38, 105, None))
        for i in range(8):
            dr.append((b0 + i * 0.5, 0.25, 42, 70, None))
        if bar in (0, 4, 16, 20, 24, 28, 30):
            dr.append((b0, 1, 49, 100, None))
    dr.append((NBARS * 4, 2, 49, 120, None)); dr.append((NBARS * 4, 0.5, 36, 120, None))
    mf.tracks.append(track("Drums", dr, 9, 0))
    mf.save(os.path.join(HERE, "one_goal.mid"))


# ---------------------------------------------------------------- LilyPond 楽譜
LY_DUR = {0.5: "8", 1: "4", 1.5: "4.", 2: "2", 3: "2.", 4: "1"}
LY_CHORD = {"Bm": ("b", ":m"), "G": ("g", ""), "D": ("d", ""), "A": ("a", ""), "F#m": ("fis", ":m")}
SECTION_MARK = {0: "Intro", 4: "Aメロ", 12: "Bメロ", 16: "サビ", 24: "Outro"}


def ly_pitch(name):
    letter = name[0].lower()
    acc = ""
    rest = name[1:]
    while rest and rest[0] in "#b":
        acc += "is" if rest[0] == "#" else "es"
        rest = rest[1:]
    octv = int(rest) - 3
    return letter + acc + ("'" * octv if octv > 0 else "," * (-octv))


def render_ly():
    notes, words = [], []
    for i, b in enumerate(MELODY):
        if i in SECTION_MARK:
            notes.append(f'\\mark \\markup \\box "{SECTION_MARK[i]}"')
            if i:
                notes.append('\\bar "||"')
        for j, (lyr, p, d) in enumerate(b):
            if p is None:
                notes.append("r" + LY_DUR[d])
                continue
            tie = ""
            nxt = b[j + 1] if j + 1 < len(b) else (MELODY[i + 1][0] if i + 1 < len(MELODY) else None)
            if nxt and nxt[0] == "_":
                tie = "~"
            notes.append(ly_pitch(p) + LY_DUR[d] + tie)
            if lyr != "_":
                words.append('"' + lyr + '"')
        notes.append("|")
    chords = []
    for b in CHORDS:
        for name, d in b:
            root, qual = LY_CHORD[name]
            chords.append(root + LY_DUR[d] + qual)
    ly = r'''\version "2.24.0"
\header {
  title = "ONE GOAL"
  subtitle = "オギカワールドカップ 主題歌"
  composer = "作詞・作曲：Claude"
  tagline = ##f
}
\paper {
  #(set-paper-size "a4")
  property-defaults.fonts.serif = "WenQuanYi Zen Hei"
  property-defaults.fonts.sans = "WenQuanYi Zen Hei"
  top-margin = 12 bottom-margin = 12 left-margin = 15 right-margin = 15
  system-system-spacing.basic-distance = #14
}
melody = \relative {
  \clef treble \key d \major \time 4/4 \tempo "熱く！" 4 = 140
  \set Score.markFormatter = #format-mark-box-alphabet
  %NOTES%
  \bar "|."
}
\score {
  <<
    \new ChordNames \chordmode { %CHORDS% }
    \new Staff \with { instrumentName = "歌" } { \new Voice = "mel" { \absolute { \clef treble \key d \major \time 4/4 \tempo "熱く！" 4 = 140 %ABSNOTES% \bar "|." } } }
    \new Lyrics \lyricsto "mel" { \override LyricText.font-size = #-0.5 %WORDS% }
  >>
  \layout { indent = 8\mm \context { \Score \override BarNumber.break-visibility = ##(#f #t #t) } }
}
'''
    ly = ly.replace("melody = \\relative {\n  \\clef treble \\key d \\major \\time 4/4 \\tempo \"熱く！\" 4 = 140\n  \\set Score.markFormatter = #format-mark-box-alphabet\n  %NOTES%\n  \\bar \"|.\"\n}\n", "")
    ly = ly.replace("%ABSNOTES%", " ".join(notes)).replace("%CHORDS%", " ".join(chords)).replace("%WORDS%", " ".join(words))
    path = os.path.join(HERE, "one_goal.ly")
    with open(path, "w", encoding="utf-8") as f:
        f.write(ly)
    subprocess.run(["lilypond", "-s", "-o", os.path.join(HERE, "one_goal"), path], check=True, cwd=HERE)


if __name__ == "__main__":
    render_midi()
    render_ly()
    render_audio()
    print("done:", round(TOTAL_SEC, 1), "sec")
