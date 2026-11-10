"""録画した時刻の記録（tlog.json）から、動画に重ねる音を作り、映像と合わせて mp4 にする。

音はデータを音に置き換えたもので、実際に録った音ではない。
- 風の音: 羽田の風速（web/day.json、1時間ごとを時間で滑らかにつないだもの）で大きさと高さを変えた雑音
- 飛行機の音: 城南島で聞こえる強さ（web/loud.json）で大きさと明るさを変えた低い雑音と、低いうなり

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

    # 飛行機: 低めの雑音（強いほど明るく）と、低いうなり
    pn = np.cumsum(rng.standard_normal(n)) * 0.02
    pn -= varying_filter(pn, np.zeros(n), 20, 20, "lowpass")  # 直流をとる
    plane = varying_filter(pn, lv, 150, 1600, "lowpass") * 3.0
    hum = np.sin(2 * np.pi * (70 + 30 * lv) * tau) * 0.25
    plane = (plane + hum) * lv ** 1.2

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
