"""録画した時刻の記録（tlog.json）から、動画に重ねる音を作り、映像と合わせて mp4 にする。

- 風の音: 羽田の風速（web/day.json、1時間ごとを時間で滑らかにつないだもの）で大きさと高さを変えた雑音（データを音に置き換えたもの）
- 飛行機の音: 入間航空祭で録ったブルーインパルスの通過音のループ（web/roar.wav、scripts/roar.py で作る）を、
  城南島で聞こえる強さ（web/loud.json）で鳴らす。強いほど大きく、弱いほど高い音を削って遠くの音にする。旅客機の音ではない

使い方: python -I day11-sound/scripts/sound.py <録画フォルダ>   （record.mjs が作った tlog.json と video.mp4 があるフォルダ）
出力: <録画フォルダ>/sound.wav、day11-sound/output/day11-haneda.mp4
"""

import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 44100


def wind_speed_curve(t):
    """t（秒、配列）での羽田の風速。ビューワの hanedaWind と同じく、u・v を1時間ごとに線形補間する"""
    hours = json.loads((ROOT / "web" / "day.json").read_text(encoding="utf-8"))["hours"]
    u = np.zeros(24)
    v = np.zeros(24)
    for h in hours:
        if h["deg"] is not None and h["ws"] is not None:
            r = math.radians(h["deg"] + 180)
            u[h["h"]] = h["ws"] * math.sin(r)
            v[h["h"]] = h["ws"] * math.cos(r)
    hf = np.clip(t / 3600 - 0.5, 0, 23)
    return np.hypot(np.interp(hf, np.arange(24), u), np.interp(hf, np.arange(24), v))


def varying_filter(x, ctrl, lo, hi, kind, blocks=2048):
    """ctrl（0〜1）に合わせて遮断周波数を変えるフィルタ（ブロックごとに切り替える）"""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), blocks):
        c = float(np.mean(ctrl[i:i + blocks]))
        f = lo + (hi - lo) * c
        sos = butter(2, f / (SR / 2), btype=kind, output="sos")
        if zi is None or zi.shape[0] != sos.shape[0]:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + blocks], zi = sosfilt(sos, x[i:i + blocks], zi=zi)
    return out


def plane_envelope(lv, window=0.25, release=1.0):
    """動画の時間で、直前 window 秒の最大値を取り、release 秒で下がる包絡にする（上がるときはすぐ）"""
    w = max(1, int(window * SR))
    blk = 256
    m = np.array([lv[max(0, i - w):i + blk].max() for i in range(0, len(lv), blk)])
    k = np.exp(-blk / (release * SR))
    env = np.zeros_like(m)
    e = 0.0
    for i, v in enumerate(m):
        e = v if v > e else e * k
        env[i] = e
    return np.repeat(env, blk)[:len(lv)]


def main():
    rec = Path(sys.argv[1])
    tlog = np.array(json.loads((rec / "tlog.json").read_text()))
    dur = tlog[-1, 0] / 1000
    n = int(dur * SR)
    tau = np.arange(n) / SR
    t = np.interp(tau * 1000, tlog[:, 0], tlog[:, 1])  # 音の各時刻での地図の時刻

    loud = json.loads((ROOT / "web" / "loud.json").read_text())
    lv = np.interp(t / loud["step"], np.arange(len(loud["lv"])), loud["lv"])
    ws = wind_speed_curve(t)

    rng = np.random.default_rng(11)
    # 風: 白い雑音を帯域で絞り、ゆっくり揺らす（風速が強いほど大きく高く）
    wn = rng.standard_normal(n)
    gust = 0.75 + 0.25 * np.sin(2 * np.pi * 0.23 * tau) * np.sin(2 * np.pi * 0.071 * tau + 1.3)
    wctrl = np.clip(ws / 10, 0, 1)
    wind = varying_filter(wn, wctrl, 250, 1100, "lowpass")
    wind = varying_filter(wind, wctrl * 0.5, 80, 300, "highpass")
    wind *= np.minimum(1.0, 0.06 * ws ** 1.3) * gust

    # 飛行機: 録った通過音のループ（ビューワと同じく、強いほど大きく明るく）
    sr, roar = wavfile.read(ROOT / "web" / "roar.wav")
    assert sr == SR
    roar = np.resize(roar.astype(np.float64) / 32768, n)
    # 早送りでは1機の通過が数十ミリ秒になるので、通ったら一気に上げ、ゆっくり下げる包絡にする
    env = plane_envelope(lv)
    plane = varying_filter(roar, env, 1500, 12000, "lowpass") * env

    mix = wind * 0.6 + plane * 0.9
    # 始まりと終わりをなめらかに
    fade = np.minimum(1, np.minimum(tau / 1.0, (dur - tau) / 1.5))
    mix *= np.clip(fade, 0, 1)
    mix /= max(1e-6, np.max(np.abs(mix))) / 0.85
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(str(rec / "sound.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    out = ROOT / "output" / "day11-haneda.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(rec / "video.mp4"), "-i", str(rec / "sound.wav"),
                    "-c:v", "copy", "-af", "loudnorm=I=-18:TP=-1.5:LRA=14", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", "-shortest", str(out)], check=True)
    print(out, f"{dur:.1f}s")


if __name__ == "__main__":
    main()
