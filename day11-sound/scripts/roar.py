"""飛行機の音の素材（web/roar.wav）を作る。

入間航空祭（2026-11-03）で録ったブルーインパルスの通過音（data/20261103_112631571.mp4、Git 管理外）から、
いちばん大きく音が安定している区間を切り出し、頭と尻を重ねてつなぎ目のないループにする。
ビューワ（main.ts）と動画（sound.py）は、このループを城南島で聞こえる強さ（web/loud.json）で鳴らす。

使い方: python -I day11-sound/scripts/roar.py
"""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "20261103_112631571.mp4"
OUT = ROOT / "web" / "roar.wav"
SR = 44100
START, END = 59.6, 64.4  # 秒。いちばん大きく、音が安定している区間
XFADE = 1.0  # 秒。つなぎ目を重ねる長さ


def main():
    with tempfile.TemporaryDirectory() as d:
        raw = Path(d) / "raw.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(START), "-to", str(END), "-i", str(SRC),
                        "-vn", "-ac", "1", "-ar", str(SR), str(raw)], check=True)
        sr, x = wavfile.read(raw)
        x = x.astype(np.float64) / 32768
        cf = int(XFADE * sr)
        # 等パワーで重ねる（尻を頭にかぶせる）
        r = np.linspace(0, np.pi / 2, cf)
        loop = np.concatenate([x[cf:-cf], x[-cf:] * np.cos(r) + x[:cf] * np.sin(r)])
        loop /= np.max(np.abs(loop)) / 0.9
        # MP3 は頭と尻に無音が入ってループが切れるので、WAV のまま出す
        wavfile.write(OUT, sr, (loop * 32767).astype(np.int16))
    print(OUT, f"{len(loop) / SR:.2f}s", f"{OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
