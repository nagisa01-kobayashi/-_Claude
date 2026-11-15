"""第三応援歌「二中ウエルシャイン」ロック調BGM 生成スクリプト
BPM150 / Key E -> F# (最後の1周で転調)
python3 make_song.py で ouenka3_rock.wav を出力する。
"""
import numpy as np
from scipy import signal
import wave

SR = 44100
BPM = 150
SPB = 60.0 / BPM          # 1拍の秒数
rng = np.random.default_rng(7)

TOTAL_BARS = 132
N = int((TOTAL_BARS * 4 + 8) * SPB * SR)
T = {k: np.zeros(N) for k in
     ["kick", "snare", "hat", "cym", "clap", "bass", "gtrL", "gtrR", "lead", "brass", "shout", "fx"]}


def idx(beat):
    return int(round(beat * SPB * SR))


def add(track, beat, sig, gain=1.0):
    i = idx(beat)
    j = min(N, i + len(sig))
    if i >= N:
        return
    T[track][i:j] += sig[: j - i] * gain


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def polyblep_saw(freq):
    """freq: 周波数配列（サンプル毎）"""
    dt = freq / SR
    ph = np.cumsum(dt) % 1.0
    s = 2 * ph - 1
    m1 = ph < dt
    x = ph[m1] / dt[m1]
    s[m1] -= x + x - x * x - 1
    m2 = ph > 1 - dt
    x = (ph[m2] - 1) / dt[m2]
    s[m2] -= x * x + x + x + 1
    return s


def env_adsr(n, a=0.005, d=0.05, s=0.8, r=0.03):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na)
    e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    nr = min(nr, n)
    e[n - nr:] *= np.linspace(1, 0, nr)
    return e


# ------------------------------------------------------------------ drums
def kick(beat, v=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 35)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    s[:200] += rng.standard_normal(200) * np.linspace(0.6, 0, 200)
    add("kick", beat, s, v)


def snare(beat, v=1.0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = signal.sosfilt(SN_SOS, rng.standard_normal(n)) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    add("snare", beat, (noise * 1.2 + tone * 0.7), v)


def hat(beat, v=1.0, open_=False):
    n = int((0.3 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    s = signal.sosfilt(HH_SOS, rng.standard_normal(n)) * np.exp(-t * (9 if open_ else 70))
    add("hat", beat, s, v)


def crash(beat, v=1.0):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    s = signal.sosfilt(CR_SOS, rng.standard_normal(n)) * np.exp(-t * 2.2)
    add("cym", beat, s, v)


def tom(beat, pitch=110, v=1.0):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = pitch * (1 + 0.5 * np.exp(-t * 20))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)
    add("snare", beat, s, v * 0.9)


def clap(beat, v=1.0):
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, off in enumerate([0, 0.008, 0.017, 0.026]):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) * (150 if k < 3 else 25))
    s = signal.sosfilt(CL_SOS, rng.standard_normal(n)) * e
    add("clap", beat, s, v)


SN_SOS = signal.butter(2, [1200, 7000], "bandpass", fs=SR, output="sos")
HH_SOS = signal.butter(4, 7000, "highpass", fs=SR, output="sos")
CR_SOS = signal.butter(2, 4000, "highpass", fs=SR, output="sos")
CL_SOS = signal.butter(2, [900, 3000], "bandpass", fs=SR, output="sos")


def drums_rock(bar0, nbars, fill=True, crash_first=True, open_hat=False, dbl=False):
    for b in range(nbars):
        B = (bar0 + b) * 4
        last = fill and b == nbars - 1
        kicks = [0, 1, 2, 3] if dbl else [0, 1.5, 2, 2.5]
        for k in kicks:
            if last and k >= 2:
                continue
            kick(B + k)
        for s in [1, 3]:
            if not (last and s == 3):
                snare(B + s)
        for h in np.arange(0, 4, 0.5):
            if last and h >= 2:
                continue
            if open_hat and h % 1 == 0.5:
                hat(B + h, 0.5, open_=True)
            else:
                hat(B + h, 0.55 if h % 1 == 0 else 0.35)
        if crash_first and b == 0:
            crash(B, 0.9)
        if last:
            pitches = [240, 240, 180, 180, 130, 130, 95, 95]
            for i, p in enumerate(pitches):
                bt = B + 2 + i * 0.25
                if i < 4:
                    snare(bt, 0.6 + 0.1 * i)
                else:
                    tom(bt, p)
            kick(B + 2)
            kick(B + 3)


def drums_half(bar0, nbars):
    for b in range(nbars):
        B = (bar0 + b) * 4
        kick(B)
        kick(B + 2.5, 0.8)
        snare(B + 2)
        for h in range(4):
            hat(B + h, 0.5)
        if b % 4 == 0:
            crash(B, 0.6)


def snare_build(bar0, nbars):
    total = nbars * 4
    for i in range(int(total * 4)):
        bt = bar0 * 4 + i * 0.25
        prog = i / (total * 4)
        if prog < 0.25 and i % 4:
            continue
        if prog < 0.5 and i % 2:
            continue
        snare(bt, 0.3 + 0.7 * prog)
        if i % 4 == 0:
            kick(bt, 0.8)


# ------------------------------------------------------------------ pitched
ROOT = {"E": 0, "F#": 2, "G#": 4, "A": 5, "B": 7, "C#m": 9, "D": 10}


def bass_note(beat, dur, midi, v=1.0):
    n = idx(dur)
    f = np.full(n, mtof(midi))
    s = polyblep_saw(f) * 0.6 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.8
    s *= env_adsr(n, 0.004, 0.08, 0.75, 0.02)
    add("bass", beat, s, v)


def gtr_chord(beat, dur, midi, mute=False, v=1.0):
    n = idx(dur)
    t = np.arange(n) / SR
    for tr, det in (("gtrL", 1.003), ("gtrR", 0.997)):
        s = np.zeros(n)
        for iv, g in ((0, 1.0), (7, 0.8), (12, 0.6)):
            s += polyblep_saw(np.full(n, mtof(midi + iv) * det)) * g
        e = env_adsr(n, 0.003, 0.1, 0.9, 0.02)
        if mute:
            e *= np.exp(-t * 14) * 0.8 + 0.08
        add(tr, beat, s * e, v)


def lead_note(beat, dur, midi, v=1.0, slide=True, vib=True, track="lead"):
    n = idx(dur)
    t = np.arange(n) / SR
    f0 = mtof(midi)
    f = np.full(n, f0)
    if slide:
        f *= 2 ** ((-1 + np.minimum(t / 0.06, 1)) / 12)
    if vib:
        depth = np.clip((t - 0.18) / 0.25, 0, 1) * 0.35
        f *= 2 ** (depth * np.sin(2 * np.pi * 5.8 * t) / 12)
    s = polyblep_saw(f) * 0.7 + np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.3
    s *= env_adsr(n, 0.004, 0.12, 0.85, 0.03)
    add(track, beat, s, v)


def brass_note(beat, dur, midi, v=1.0):
    n = idx(dur) + int(0.05 * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for d in (-0.12, -0.05, 0, 0.05, 0.12):
        s += polyblep_saw(np.full(n, mtof(midi + d)))
    s += polyblep_saw(np.full(n, mtof(midi - 12))) * 0.6
    dark = signal.sosfilt(BR_SOS, s)
    bright_amt = np.exp(-t * 6) * 0.7 + 0.3
    out = dark * (1 - bright_amt) + s * bright_amt * 0.6
    out *= env_adsr(n, 0.03, 0.15, 0.85, 0.08)
    add("brass", beat, out, v)


BR_SOS = signal.butter(2, 1400, "lowpass", fs=SR, output="sos")
F_SOS = [signal.butter(2, [f * 0.85, f * 1.15], "bandpass", fs=SR, output="sos")
         for f in (520, 1850, 2500)]


def shout(beat, v=1.0):
    """みんなの「Hey!」（群衆の掛け声風）"""
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    src = np.zeros(n)
    for _ in range(10):
        f0 = rng.uniform(140, 300)
        f = f0 * (1.15 - 0.25 * np.minimum(t / 0.3, 1))
        on = int(rng.uniform(0, 0.02) * SR)
        src[on:] += polyblep_saw(f[: n - on]) * rng.uniform(0.6, 1)
    src += rng.standard_normal(n) * np.exp(-t * 30) * 2.0
    out = sum(signal.sosfilt(sos, src) * g for sos, g in zip(F_SOS, (1.0, 0.7, 0.4)))
    out *= np.minimum(t / 0.015, 1) * np.exp(-t * 7)
    add("shout", beat, out, v)


def riser(bar0, nbars):
    n = idx(nbars * 4)
    t = np.arange(n) / SR
    s = rng.standard_normal(n)
    sos = signal.butter(2, 3000, "highpass", fs=SR, output="sos")
    s = signal.sosfilt(sos, s) * (t / t[-1]) ** 2
    add("fx", bar0 * 4, s, 0.5)


# ------------------------------------------------------------------ parts
def bass_line(bar0, chords, tr=0, style="8th"):
    for b, c in enumerate(chords):
        B = (bar0 + b) * 4
        r = 28 + ROOT[c] + tr
        if style == "8th":
            for i in range(8):
                bass_note(B + i * 0.5, 0.45, r)
        elif style == "oct":
            for i in range(8):
                bass_note(B + i * 0.5, 0.45, r + (12 if i % 2 else 0))
        elif style == "whole":
            bass_note(B, 3.9, r)


def gtr_part(bar0, chords, tr=0, style="mute8"):
    for b, c in enumerate(chords):
        B = (bar0 + b) * 4
        r = 40 + ROOT[c] + tr
        if style == "mute8":
            for i in range(8):
                gtr_chord(B + i * 0.5, 0.45, r, mute=True, v=0.9 if i % 2 == 0 else 0.75)
        elif style == "drive":
            for i in range(8):
                gtr_chord(B + i * 0.5, 0.48, r, mute=(i % 4 != 0))
        elif style == "ring":
            gtr_chord(B, 2.0, r)
            gtr_chord(B + 2.5, 1.45, r)
        elif style == "hold":
            gtr_chord(B, 3.95, r)


def mel(bar0, notes, tr=0, inst="lead", v=1.0):
    for (b, d, m) in notes:
        bt = bar0 * 4 + b
        if inst == "lead":
            lead_note(bt, d, m + tr, v, slide=d >= 1.0)
        else:
            brass_note(bt, d, m + tr, v)


# メロディ（拍, 長さ, MIDI） 2小節 = 8拍
CALL = [(0, .5, 71), (.5, 1, 71), (1.5, .5, 73), (2, 1.5, 76), (3.5, .5, 75), (4, 2.5, 73)]  # 二中ウエルシャイントナイト
RESP = [(0, 1, 69), (1, 1, 71), (2, 1, 73), (3, 3.5, 75)]                                   # 二中ウエルシャイン
OZA = [(0, 1, 80), (1, .5, 78), (1.5, 1, 76), (2.5, .5, 78), (3, 1.2, 80)]                   # オーザサンゴザップ
COME = [(4.5, .5, 76), (5, 1.8, 81)]                                                         # カムザップ
FIN = [(0, .5, 71), (.5, 1, 73), (1.5, .5, 75), (2, 5.5, 76)]                                # 二中ウエルシャイン
HALF_CHORDS = ["E", "C#m", "A", "B", "E", "C#m", "A", "B", "C#m", "A", "B", "E"]


def lyric_half(bar0, tr=0, big=False):
    mel(bar0 + 0, CALL, tr, "lead")
    mel(bar0 + 2, RESP, tr, "brass")
    for k in range(4):
        clap(bar0 * 4 + 8 + k, 0.8)
    mel(bar0 + 4, CALL, tr, "lead")
    mel(bar0 + 6, RESP, tr, "brass")
    for k in range(4):
        clap(bar0 * 4 + 24 + k, 0.8)
    mel(bar0 + 8, OZA, tr, "lead")
    mel(bar0 + 8, COME, tr, "brass")
    shout((bar0 + 8) * 4 + 7, 0.9)
    mel(bar0 + 10, FIN, tr, "lead")
    mel(bar0 + 10, FIN, tr, "brass", 0.8)
    if big:
        mel(bar0 + 10, [(b, d, m + 12) for b, d, m in FIN], tr, "brass", 0.35)
    gtr_part(bar0, HALF_CHORDS[:2], tr, "mute8")
    gtr_part(bar0 + 2, HALF_CHORDS[2:4], tr, "drive")
    gtr_part(bar0 + 4, HALF_CHORDS[4:6], tr, "mute8")
    gtr_part(bar0 + 6, HALF_CHORDS[6:8], tr, "drive")
    gtr_part(bar0 + 8, HALF_CHORDS[8:12], tr, "ring" if not big else "drive")
    bass_line(bar0, HALF_CHORDS[:8], tr, "8th")
    bass_line(bar0 + 8, HALF_CHORDS[8:], tr, "oct")
    drums_rock(bar0, 7, fill=True, dbl=big)
    drums_rock(bar0 + 7, 1, fill=False, crash_first=False, dbl=big)
    drums_rock(bar0 + 8, 4, fill=True, open_hat=True, dbl=big)


def lyrics(bar0, tr=0, big=False):
    lyric_half(bar0, tr, big)
    lyric_half(bar0 + 12, tr, big)
    shout((bar0 + 23) * 4 + 3.5, 1.0)


RIFF = [0, 0, 12, 0, 10, 0, 7, 5, 0, 0, 12, 0, 14, 12, 10, 7]


def riff(bar0, nbars, tr=0, lead_dbl=False):
    for b in range(nbars):
        B = (bar0 + b) * 4
        if b >= nbars - 2 and nbars > 2:
            if b == nbars - 2:
                for i in range(4):
                    gtr_chord(B + i * 0.5, 0.45, 45 + tr)
                    bass_note(B + i * 0.5, 0.45, 33 + tr)
                for i in range(4):
                    gtr_chord(B + 2 + i * 0.5, 0.45, 47 + tr)
                    bass_note(B + 2 + i * 0.5, 0.45, 35 + tr)
            else:
                gtr_chord(B, 3.9, 47 + tr)
                bass_note(B, 3.9, 35 + tr)
            continue
        half = (b % 2) * 8
        for i in range(8):
            off = RIFF[half + i]
            gtr_chord(B + i * 0.5, 0.45, 40 + off + tr, mute=(off == 0))
            bass_note(B + i * 0.5, 0.45, 28 + (off % 12) + tr)
            if lead_dbl:
                lead_note(B + i * 0.5, 0.45, 64 + off + tr, 0.45, slide=False, vib=False)
    drums_rock(bar0, nbars, fill=True, open_hat=True)


def solo(bar0, nbars):
    chords = ["E", "C#m", "A", "B"] * (nbars // 4)
    pent = [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88]
    tones = {"E": [64, 68, 71, 76, 80, 83, 88], "C#m": [64, 68, 73, 76, 80, 85],
             "A": [69, 73, 76, 81, 85], "B": [66, 71, 75, 78, 83]}
    cur = 5
    for b in range(nbars):
        B = (bar0 + b) * 4
        c = chords[b]
        if b == nbars - 1:
            lead_note(B, 3.8, 88, 1.0)
            continue
        if b % 4 == 3 and b > 8:
            for i in range(16):
                lead_note(B + i * 0.25, 0.24, pent[(cur + (i % 4) - 1) % len(pent)] if i < 15 else 83,
                          0.8, slide=False, vib=False)
            continue
        beat = 0.0
        RHYS = [[1, .5, .5, 1, 1], [.5, .5, .5, .5, 2], [1.5, .5, 1, 1],
                [.25, .25, .5, .5, .5, 2], [.5, 1, .5, 2]]
        rhy = RHYS[rng.integers(len(RHYS))]
        for k, d in enumerate(rhy):
            if k == 0:
                m = min(tones[c], key=lambda x: abs(x - pent[cur]))
                cur = int(np.argmin([abs(p - m) for p in pent]))
            else:
                cur = int(np.clip(cur + rng.choice([-2, -1, 1, 1, 2]), 2, len(pent) - 1))
                m = pent[cur]
            lead_note(B + beat, d * 0.95, m, 0.95, slide=d >= 1)
            beat += d
    gtr_part(bar0, chords, 0, "drive")
    bass_line(bar0, chords, 0, "8th")
    for b, c in enumerate(chords):
        brass_note((bar0 + b) * 4, 3.9, 52 + ROOT[c], 0.25)
        brass_note((bar0 + b) * 4, 3.9, 56 + ROOT[c] - (1 if c == "C#m" else 0), 0.2)
    for g in range(nbars // 4):
        drums_rock(bar0 + g * 4, 4, fill=True, open_hat=True)


def breakdown(bar0):
    # 8小節：ハーフテンポで「コール→手拍子＆Hey!」
    chords = ["E", "C#m", "A", "B"] * 2
    drums_half(bar0, 8)
    bass_line(bar0, chords, 0, "whole")
    for b, c in enumerate(chords):
        gtr_chord((bar0 + b) * 4, 3.9, 40 + ROOT[c], v=0.55)
    for p in range(2):
        mel(bar0 + p * 4, CALL, 0, "lead", 0.9)
        for b, d, m in RESP:
            clap((bar0 + p * 4 + 2) * 4 + b, 1.0)
        shout((bar0 + p * 4 + 2) * 4 + 3, 1.0)
        mel(bar0 + p * 4 + 2, RESP, 0, "brass", 0.5)
    # 4小節ビルドアップ（B → F#キーへ）
    b2 = bar0 + 8
    snare_build(b2, 4)
    riser(b2, 4)
    for i in range(32):
        bt = b2 * 4 + i * 0.5
        gtr_chord(bt, 0.45, 47, mute=i < 16, v=0.6 + 0.4 * i / 32)
        bass_note(bt, 0.45, 35)
    for k in range(3):
        shout((b2 + 3) * 4 + 1 + k * 0.5, 0.8 + 0.1 * k)


def outro(bar0, tr):
    riff(bar0, 4, tr, lead_dbl=True)
    B = bar0 + 4
    # キメ
    for i, c in enumerate(["A", "B", "C#m", "B"]):
        gtr_chord((B) * 4 + i, 0.9, 40 + ROOT[c] + tr)
        bass_note((B) * 4 + i, 0.9, 28 + ROOT[c] + tr)
        kick(B * 4 + i)
        snare(B * 4 + i, 0.8)
        crash(B * 4 + i, 0.4)
    gtr_chord((B + 1) * 4, 7.8, 40 + tr)
    bass_note((B + 1) * 4, 7.8, 28 + tr)
    lead_note((B + 1) * 4, 7.5, 76 + tr + 12, 0.8)
    brass_note((B + 1) * 4, 7.5, 64 + tr, 0.6)
    crash((B + 1) * 4, 1.0)
    kick((B + 1) * 4)
    for i in range(24):
        tom((B + 2) * 4 + i * 0.25, 200 - i * 5, 0.4 + i * 0.02)
    shout((B + 1) * 4, 1.0)
    # 最後の一撃
    end = (B + 3) * 4
    gtr_chord(end, 6, 40 + tr)
    bass_note(end, 6, 28 + tr)
    brass_note(end, 5, 64 + tr, 0.7)
    brass_note(end, 5, 71 + tr, 0.5)
    kick(end, 1.2)
    snare(end, 1.0)
    crash(end, 1.2)
    shout(end, 1.1)
    return end + 6


# ------------------------------------------------------------------ arrangement
bar = 0
# イントロ 4小節：ギターのロングトーン＋ビルド
gtr_chord(0, 7.8, 40, v=0.8)
bass_note(0, 7.8, 28)
lead_note(0, 7.5, 88, 0.5)
for i in range(8):
    kick(i, 0.9)
gtr_chord(8, 3.8, 45)
gtr_chord(12, 3.8, 47)
bass_note(8, 3.8, 33)
bass_note(12, 3.8, 35)
snare_build(2, 2)
riser(0, 4)
bar = 4
riff(bar, 8); bar += 8                    # リフ
lyrics(bar); bar += 24                    # 歌詞 1周目
riff(bar, 8, lead_dbl=True); bar += 8     # 間奏
lyrics(bar); bar += 24                    # 歌詞 2周目
solo(bar, 16); bar += 16                  # ギターソロ
breakdown(bar); bar += 12                 # ブレイク（掛け合い）
lyrics(bar, tr=2, big=True); bar += 24    # 転調して 3周目
end_beat = outro(bar, tr=2)
print("bars used:", bar + 8, "seconds:", end_beat * SPB)

# ------------------------------------------------------------------ mix
L_end = idx(end_beat) + int(0.5 * SR)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)


def dist(x, gain):
    return np.tanh(x * gain)


def gtr_proc(x):
    x = hp(x, 90)
    x = dist(lp(x, 3500), 9.0)
    x = lp(x, 5000, 4)
    x = hp(x, 80)
    pk = signal.sosfilt(signal.butter(2, [600, 1600], "bandstop", fs=SR, output="sos"), x)
    return x * 0.5 + pk * 0.5


gL = gtr_proc(T["gtrL"])
gR = gtr_proc(T["gtrR"])
lead = lp(dist(lp(T["lead"], 6000), 4.0), 6500, 4)
d = idx(0.75)  # 付点8分ディレイ
lead_wet = np.zeros(N)
lead_wet[d:] += lead[:-d] * 0.35
lead_wet[2 * d:] += lead[:-2 * d] * 0.18
bass = lp(dist(T["bass"], 1.8), 1200)
brass = lp(T["brass"], 7000) * 0.5
shout_t = T["shout"]

# リバーブ（指数減衰ノイズIR）
ir_n = int(1.6 * SR)
ti = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-ti * 4)
irR = rng.standard_normal(ir_n) * np.exp(-ti * 4)
irL, irR = lp(irL, 6000) * 0.02, lp(irR, 6000) * 0.02

def norm(x):
    p = np.max(np.abs(x[:L_end])) + 1e-9
    return x / p

mix_parts = {
    # name: (signal, gain, pan(-1..1), reverb send)
    "kick": (norm(T["kick"]), 0.95, 0.0, 0.05),
    "snare": (norm(T["snare"]), 0.70, 0.0, 0.25),
    "hat": (norm(T["hat"]), 0.22, 0.35, 0.05),
    "cym": (norm(T["cym"]), 0.28, -0.3, 0.1),
    "clap": (norm(T["clap"]), 0.45, 0.1, 0.3),
    "bass": (norm(bass), 0.62, 0.0, 0.0),
    "gtrL": (norm(gL), 0.36, -0.85, 0.08),
    "gtrR": (norm(gR), 0.36, 0.85, 0.08),
    "lead": (norm(lead), 0.50, 0.05, 0.25),
    "leadwet": (lead_wet / (np.max(np.abs(lead)) + 1e-9), 0.50, -0.4, 0.3),
    "brass": (norm(brass), 0.42, 0.3, 0.3),
    "shout": (norm(shout_t), 0.55, 0.0, 0.35),
    "fx": (norm(T["fx"]), 0.12, 0.0, 0.3),
}
L = np.zeros(N)
R = np.zeros(N)
send = np.zeros(N)
for name, (sig_, g, pan, rv) in mix_parts.items():
    gl = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2) * g
    gr = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2) * g
    L += sig_ * gl
    R += sig_ * gr
    send += sig_ * g * rv
L += signal.fftconvolve(send, irL)[:N]
R += signal.fftconvolve(send, irR)[:N]

out = np.stack([L, R], axis=1)[:L_end]
out /= np.max(np.abs(out)) / 1.6
out = np.tanh(out) / np.tanh(1.6) * 0.97   # ソフトリミッター
fade = int(0.3 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]

pcm = (out * 32767).astype(np.int16)
with wave.open("ouenka3_rock.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote ouenka3_rock.wav", len(pcm) / SR, "sec")
