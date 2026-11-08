"""月の南極、住むならここ: ほぼずっと日が当たる所（金）と永久影（青）、アルテミスの有人着陸候補の9地域。

斜めから見下ろした立体（地形の高さで画素を上にずらし、奥から手前へ塗り重ねる）で描く。

使い方: python -I -X utf8 poster_moon.py <data/moon> <出力png> [倍率（既定1）] [集計の出力json]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pyogrio
import rasterio
from PIL import Image, ImageFilter, ImageFont
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scaledraw import SDraw  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
src = Path(sys.argv[1])
S = int(sys.argv[3]) if len(sys.argv) > 3 else 1
FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size * S)


BG = (10, 12, 20)
TXT, SUB, GOLD, BLUE = (225, 228, 238), (150, 156, 175), (255, 200, 80), (120, 170, 235)

# ---- データ（どれも 75S〜90S の極座標、120m 格子。同じ並び） ----
PIX = 120.0
N = 7624
# 描く範囲（南極点が原点の極座標、m）。8地域が入るように、地球の見える側（経度0°の側）を広く取る
XMIN, XMAX, YMIN, YMAX = -212_000, 182_000, -75_000, 150_000
with rasterio.open(src / "LPSR_75S_120M_201608.TIF") as r:
    tr = r.transform
    c0, c1 = int((XMIN - tr.c) / PIX), int((XMAX - tr.c) / PIX)
    r0, r1 = int((tr.f - YMAX) / PIX), int((tr.f - YMIN) / PIX)
    psr = (r.read(1)[r0:r1, c0:c1].astype(np.float32) * r.scales[0] + r.offsets[0]) > 0.5
dem = np.fromfile(src / "ldem_75s_120m.img", dtype="<i2").reshape(N, N)[r0:r1, c0:c1].astype(np.float32) * 0.5
with rasterio.open(src / "AVGVISIB_75S_120M_201608.TIF") as r:
    ill = r.read(1)[r0:r1, c0:c1].astype(np.float32) * r.scales[0] + r.offsets[0]
x0 = tr.c + c0 * PIX  # 切り出した範囲の左上（m）
y0 = tr.f - r0 * PIX
H, W = dem.shape

# ---- アルテミスの着陸候補の9地域（USGS が LROC QuickMap から配る1km格子の外形） ----
NAMES = {
    "Peak_Near_Cabeus_B": "カベウスB近くの峰", "Haworth": "ハワース", "Malapert_Massif": "マラパート山塊",
    "Mons_Mouton_Plateau": "ムートン山の台地", "Mons_Mouton": "ムートン山", "Nobile_Rim_1": "ノビレの縁 1",
    "Nobile_Rim_2": "ノビレの縁 2", "de_Gerlache_Rim_2": "ド・ジェルラッシュの縁 2", "Slater_Plain": "スレーター平原",
}
regions = []
for key, ja in NAMES.items():
    z = src / "regions" / f"{key}.zip"
    if not z.exists():  # ムートン山の台地は外形のファイルが公開されていない（ScienceBase で非公開）
        print("なし", key)
        continue
    df = pyogrio.read_dataframe(f"/vsizip/{z.as_posix()}/{key}/{key}_PolarLGRS_ACC_1km_S_Grid.shp")
    t = Transformer.from_crs(df.crs, rasterio.open(src / "LPSR_75S_120M_201608.TIF").crs, always_xy=True)
    hull = df.union_all().convex_hull
    xs, ys = t.transform(*np.asarray(hull.exterior.coords).T)
    regions.append({"key": key, "ja": ja, "xy": np.c_[xs, ys]})


def to_px(x, y):
    return (np.asarray(x) - x0) / PIX, (y0 - np.asarray(y)) / PIX


# ---- 地域ごとの数字 ----
yy, xx = np.mgrid[0:H, 0:W]
psr_idx = np.argwhere(psr)
from scipy.spatial import cKDTree  # noqa: E402
from matplotlib.path import Path as MPath  # noqa: E402
tree = cKDTree(psr_idx)
stats = []
for rg in regions:
    px, py = to_px(*rg["xy"].T)
    path = MPath(np.c_[px, py])
    b0, b1 = int(px.min()), int(px.max()) + 1
    a0, a1 = int(py.min()), int(py.max()) + 1
    sub = np.c_[xx[a0:a1, b0:b1].ravel() + 0.5, yy[a0:a1, b0:b1].ravel() + 0.5]
    inside = path.contains_points(sub).reshape(a1 - a0, b1 - b0)
    il = ill[a0:a1, b0:b1][inside]
    # 地域の中で一番日が当たる画素から、いちばん近い永久影まで
    k = np.argmax(np.where(inside, ill[a0:a1, b0:b1], -1))
    ky, kx = np.unravel_index(k, inside.shape)
    dist, _ = tree.query([ky + a0, kx + b0])
    stats.append({"key": rg["key"], "ja": rg["ja"], "ill_max": float(il.max()), "ill_p90": float(np.percentile(il, 90)),
                  "psr_share": float(psr[a0:a1, b0:b1][inside].mean()), "km_to_psr": float(dist * PIX / 1000),
                  "cx": float(px.mean()), "cy": float(py.mean())})
    print(rg["ja"], {k_: round(v, 3) for k_, v in stats[-1].items() if isinstance(v, float)})
if len(sys.argv) > 4:
    json.dump({"note": "日照率は地表での平均（Mazarico ほか 2011、18.6年の歳差周期を1時間ごと）。地域は1km格子の外形（凸包）",
               "regions": stats}, open(sys.argv[4], "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---- 色を作る（真上から見た絵） ----
gy, gx = np.gradient(dem, PIX)
shade = np.zeros_like(dem)
for az, w in [(315, 0.6), (45, 0.25), (180, 0.15)]:  # 多方向の陰影
    a = np.radians(az)
    lx, ly, lz = np.sin(a) * np.cos(np.radians(35)), np.cos(a) * np.cos(np.radians(35)), np.sin(np.radians(35))
    n = np.sqrt(gx**2 + gy**2 + 1)
    shade += w * np.clip((-gx * lx + gy * ly + lz) / n, 0, 1)
shade = (shade - shade.min()) / (np.ptp(shade) + 1e-6)
base = np.stack([shade * 120 + 18, shade * 120 + 20, shade * 125 + 26], -1)
g = np.clip((ill - 0.30) / 0.35, 0, 1)[..., None] ** 1.6  # 日照率 30%→70% で金色へ（高いほど急に明るく）
col = base * (1 - g * 0.9) + np.array(GOLD) * g * (0.5 + 0.5 * g)
col = np.where(psr[..., None], base * 0.3 + np.array([30, 80, 170]) * 0.6, col)

# ---- 斜めから見下ろす（奥＝上から手前＝下へ塗り重ねる） ----
UP = 4  # 縦を細かく描いてから縮めて、すき間を防ぐ
TILT = 0.55  # 奥行きの縮み（cos）
EXAG = 3.0  # 高さの強調
k = EXAG / PIX * UP
zr = dem - np.median(dem)
OH = int(H * TILT * UP + (zr.max() - zr.min()) * k) + 40
ox = np.zeros((OH, W, 3), np.float32)
ox[:] = BG
mask = np.zeros((OH, W), bool)
top = int(zr.max() * k) + 20
cols = np.arange(W)
for r in range(H):
    ty = (top + r * TILT * UP - zr[r] * k).astype(int)
    for d in range(int(TILT * UP) + 2):
        t_ = np.clip(ty + d, 0, OH - 1)
        ox[t_, cols] = col[r]
        mask[t_, cols] = True
img_map = Image.fromarray(ox.clip(0, 255).astype(np.uint8)).resize((W, OH // UP), Image.LANCZOS)


def oblique(px, py):
    """真上の画素座標 → 斜め図の画素座標（縮める前の UP を戻す）"""
    r = np.clip(np.asarray(py).astype(int), 0, H - 1)
    c = np.clip(np.asarray(px).astype(int), 0, W - 1)
    return np.asarray(px), (top + np.asarray(py) * TILT * UP - zr[r, c] * k) / UP


# ---- 発光（金と青をぼかして足す） ----
arr = np.asarray(img_map).astype(np.float32)
gold = np.clip((arr[..., 0] - arr[..., 2]) / 160, 0, 1)
blue = np.clip((arr[..., 2] - arr[..., 0] - 40) / 90, 0, 1)
for m_, colr, radii, gains in [(gold, (255, 170, 60), (2, 10), (0.7, 0.8)), (blue, (70, 140, 255), (3,), (0.35,))]:
    im = Image.fromarray((m_ * 255).astype(np.uint8))
    add = sum(gn * np.asarray(im.filter(ImageFilter.GaussianBlur(rd))).astype(np.float32) / 255 for rd, gn in zip(radii, gains))
    arr = arr + np.array(colr) * add[..., None]
img_map = Image.fromarray(arr.clip(0, 255).astype(np.uint8))

# ---- 1枚にまとめる ----
MW = 2340  # 地図の幅（等倍）
scale = MW / W
MH = int(img_map.height * scale)
CW = 2400
img = Image.new("RGB", (CW * S, (MH + 1000) * S), BG)
d = SDraw(img, S)
d.text((70, 60), "#30DayMapChallenge Day 8 — Utopia", font=font(34), fill=SUB)
d.text((70, 112), "月に住むなら、南極の尾根", font=font(92, True), fill=TXT)
d.text((70, 232), "ほぼいつも日が当たる尾根（太陽光で電気を作れる）のすぐ隣に、一度も日が当たらない永久影（氷がありうる）がある",
       font=font(30), fill=SUB)
MX, MY = 30, 300
img.paste(img_map.resize((MW * S, MH * S), Image.LANCZOS), (MX * S, MY * S))

# 地域の外形とラベル（斜め図の上に）
order = sorted(stats, key=lambda s_: -s_["ill_max"])
for rg in regions:
    px, py = to_px(*rg["xy"].T)
    ox_, oy_ = oblique(px, py)
    pts = [(MX + a * scale, MY + b * scale) for a, b in zip(ox_, oy_)]
    d.d.line([(a * S, b * S) for a, b in pts + pts[:1]], fill=(255, 255, 255), width=2 * S)
st = {s_["key"]: s_ for s_ in stats}
LBL = {  # ラベルの向き（重ならないように）
    "Peak_Near_Cabeus_B": (1, -1), "Haworth": (-1, 1), "Malapert_Massif": (1, 1), "Mons_Mouton_Plateau": (1, -1),
    "Mons_Mouton": (-1, -1), "Nobile_Rim_1": (1, 1), "Nobile_Rim_2": (-1, 1), "de_Gerlache_Rim_2": (-1, -1), "Slater_Plain": (1, -1),
}
for rg in regions:
    s_ = st[rg["key"]]
    ox_, oy_ = oblique(s_["cx"], s_["cy"])
    x, y = MX + float(ox_) * scale, MY + float(oy_) * scale
    sx, sy = LBL.get(rg["key"], (1, -1))
    tx, ty = x + sx * 40, y + sy * 34
    d.d.line([(x * S, y * S), (tx * S, ty * S)], fill=(255, 255, 255), width=2 * S)
    t = rg["ja"]
    tw = d.textlength(t, font=font(28, True))
    d.text((tx - (tw if sx < 0 else 0) + (-6 if sx < 0 else 6), ty - 16), t, font=font(28, True), fill=TXT,
           stroke_width=4, stroke_fill=BG)

# 南極点
px, py = to_px(0.0, 0.0)
ox_, oy_ = oblique(px, py)
x, y = MX + float(ox_) * scale, MY + float(oy_) * scale
d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(255, 255, 255))
d.text((x + 12, y - 10), "南極点", font=font(26, True), fill=TXT, stroke_width=4, stroke_fill=BG)

# ---- 下の欄: 9地域の数字（3列） ----
ly = MY + MH + 20
items = [(GOLD, "日がよく当たる（平均の日照率が高いほど明るい金）"), ((30, 80, 170), "永久影（一度も日が当たらない）"), ((255, 255, 255), "着陸候補の地域（約15km四方）")]
lx = 70
for c_, t in items:
    d.rectangle([lx, ly + 6, lx + 34, ly + 40], fill=c_)
    d.text((lx + 48, ly + 4), t, font=font(30), fill=TXT)
    lx += 60 + d.textlength(t, font=font(30)) + 40
gy0 = ly + 80
d.text((70, gy0), "アルテミス計画の有人着陸の候補 9地域（NASA、2024年10月）", font=font(36, True), fill=TXT)
d.text((70, gy0 + 50), "地域の中でいちばん日が当たる所の日照率と、そこからいちばん近い永久影までの距離", font=font(26), fill=SUB)
gy0 += 100
cells = [(s_["ja"], f"{s_['ill_max'] * 100:.0f}%", f"永久影まで {s_['km_to_psr']:.1f}km") for s_ in order]
cells.append(("ムートン山の台地", "—", "外形の公開データがなく省いた"))
CWID = 740
for i_, (nm, v, sub) in enumerate(cells):
    cx_ = 70 + (i_ % 3) * (CWID + 20)
    cy_ = gy0 + (i_ // 3) * 92
    d.text((cx_, cy_), nm, font=font(30, True), fill=TXT)
    d.text((cx_ + CWID - 60 - d.textlength(v, font=font(34, True)), cy_ - 4), v, font=font(34, True), fill=GOLD)
    d.text((cx_, cy_ + 42), sub, font=font(24), fill=BLUE if v != "—" else SUB)
ly = gy0 + 3 * 92 - 66

# ---- 凡例と注記 ----
notes = [
    "日照率は地表での平均で、18.6年の月の歳差周期を1時間ごとに計算したもの（Mazarico ほか 2011）。地面から数m上げた太陽電池なら、もっと長く日が当たる。",
    "南極点のまわり約390km×220kmを、斜め上から見下ろした図（高さは3倍に強調）。地域の外形は1km格子の外側をつないだもの。地域でいちばん日が当たる所は120m格子の1画素。",
    "出典）NASA LRO LOLA: 標高 LDEM_75S_120M（PDS Geosciences Node）、平均日照率 AVGVISIB_75S_120M・永久影 LPSR_75S_120M（NASA GSFC PGDA、Mazarico et al. 2011, Icarus 211）、",
    "着陸候補の地域: McClernan 2024, Down Selected Artemis III Candidate Landing Site Navigational Grids（USGS、CC0。元は LROC QuickMap）。NASA が2024年10月に公表した9地域",
]
ny = ly + 66
for t in notes:
    d.text((70, ny), t, font=font(24), fill=SUB)
    ny += 36
img = img.crop((0, 0, CW * S, (ny + 30) * S))
img.save(sys.argv[2])
print(img.size)
