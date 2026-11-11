"""3段階の画像（output/story0〜2.png、scripts/shot.mjs で撮る）を、ストーリーの GIF にする。

1枚4秒見せ、0.8秒かけて次へ切り替える。最後まで行ったら最初に戻る。
使い方: python -I scripts/gif.py   → output/day12-power.gif
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
W = 1200
HOLD_MS, FADE_MS, FADE_N = 4000, 800, 8

imgs = []
for i in range(3):
    im = Image.open(OUT / f"story{i}.png").convert("RGB")
    imgs.append(im.resize((W, round(im.height * W / im.width)), Image.LANCZOS))

frames, durs = [], []
for i, im in enumerate(imgs):
    frames.append(im)
    durs.append(HOLD_MS + (1500 if i == len(imgs) - 1 else 0))  # 最後は少し長く
    nxt = imgs[(i + 1) % len(imgs)]
    for k in range(1, FADE_N):
        frames.append(Image.blend(im, nxt, k / FADE_N))
        durs.append(FADE_MS // FADE_N)

pal = [f.quantize(colors=192, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
pal[0].save(OUT / "day12-power.gif", save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True)
print(OUT / "day12-power.gif", f"{(OUT / 'day12-power.gif').stat().st_size // 1024}KB", f"{sum(durs) / 1000:.1f}s")
