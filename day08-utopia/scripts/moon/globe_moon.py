"""月を球体で描く: 南極の上空から見下ろし、よく日が当たる所（金）と永久影（青）、アルテミスの着陸候補を重ねる。

- 遠近の投影（人工衛星から見た見え方）。南緯75°より極側は LOLA の120m 格子（極座標）、外側は LOLA の16ppd（約1.9km）
- 日照率・永久影は Mazarico ほか（2011）の120m 格子（南緯75°より極側だけ）

使い方: python -I -X utf8 globe_moon.py <data/moon> <moon_regions.json> <出力png> [倍率]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pyogrio
import rasterio
from PIL import Image, ImageFilter, ImageFont
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "carfree"))
from scaledraw import SDraw  # noqa: E402

S = int(sys.argv[4]) if len(sys.argv) > 4 else 1
Image.MAX_IMAGE_PIXELS = None
src = Path(sys.argv[1])
reg = json.load(open(sys.argv[2], encoding="utf-8"))["regions"]
FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size * S)


RM = 1737400.0
BG = np.array([10, 12, 20], np.float32)
GOLD = np.array([255, 200, 80], np.float32)

# ---- 全球（16ppd） ----
g16 = np.fromfile(src / "ldem_16.img", "<i2").reshape(2880, 5760).astype(np.float32) * 0.5  # 90N→90S, 0E→360E


def shade_of(dem, dx, dy):
    gy, gx = np.gradient(dem)
    gx, gy = gx / dx, gy / dy
    out = np.zeros_like(dem)
    for az, w in [(315, 0.6), (45, 0.25), (180, 0.15)]:
        a = np.radians(az)
        lx, ly, lz = np.sin(a) * np.cos(np.radians(35)), np.cos(a) * np.cos(np.radians(35)), np.sin(np.radians(35))
        out += w * np.clip((-gx * lx + gy * ly + lz) / np.sqrt(gx**2 + gy**2 + 1), 0, 1)
    return out


lat16 = 90 - (np.arange(2880) + 0.5) / 16
sh16 = shade_of(g16, np.maximum(RM * np.radians(1 / 16) * np.cos(np.radians(lat16))[:, None], 50), -RM * np.radians(1 / 16))

# ---- 南極（120m、極座標） ----
N, PIX = 7624, 120.0
dem_p = np.fromfile(src / "ldem_75s_120m.img", "<i2").reshape(N, N).astype(np.float32) * 0.5
with rasterio.open(src / "LPSR_75S_120M_201608.TIF") as r:
    tr = r.transform
    from pyproj import CRS as PCRS
    crs = PCRS.from_wkt(r.crs.to_wkt())
    psr = (r.read(1).astype(np.float32) * r.scales[0] + r.offsets[0]) > 0.5
with rasterio.open(src / "AVGVISIB_75S_120M_201608.TIF") as r:
    ill = r.read(1).astype(np.float32) * r.scales[0] + r.offsets[0]
sh_p = shade_of(dem_p, PIX, -PIX)
# 陰影の明るさを全球の方とそろえる
sh_p = (sh_p - np.percentile(sh_p, 2)) / (np.percentile(sh_p, 98) - np.percentile(sh_p, 2)) * (np.percentile(sh16, 98) - np.percentile(sh16, 2)) + np.percentile(sh16, 2)
to_ps = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)

# ---- 段彩（標高 m → 色）。青と金は日照・永久影に使うので、段彩には使わない ----
HYP = np.array([
    (-8000, (34, 30, 58)), (-5000, (52, 54, 92)), (-2500, (70, 92, 104)), (-500, (104, 122, 104)),
    (1000, (150, 146, 112)), (3000, (190, 168, 132)), (5500, (222, 206, 182)), (8000, (246, 242, 236)),
], dtype=object)
HZ = np.array([h for h, _ in HYP], np.float32)
HC = np.array([c for _, c in HYP], np.float32)


def hyp(el):
    return np.stack([np.interp(el, HZ, HC[:, k]) for k in range(3)], -1)


# ---- 色（緯度経度から） ----
def colorize(lat, lon, hit, shade_k):
    r16 = np.clip(((90 - lat) * 16).astype(int), 0, 2879)
    c16 = ((lon % 360) * 16).astype(int) % 5760
    sh = sh16[r16, c16]
    el = g16[r16, c16]
    il = np.zeros_like(sh)
    ps = np.zeros(sh.shape, bool)
    pol = hit & (lat < -75.2)
    xs, ys = to_ps.transform(lon[pol], lat[pol])
    cc = np.clip(((xs - tr.c) / PIX).astype(int), 0, N - 1)
    rr = np.clip(((tr.f - ys) / PIX).astype(int), 0, N - 1)
    sh[pol] = sh_p[rr, cc]
    el[pol] = dem_p[rr, cc]
    il[pol] = ill[rr, cc]
    ps[pol] = psr[rr, cc]
    g = np.clip((il - 0.50) / 0.30, 0, 1) ** 1.5  # 日照率 50%→80% で金色へ
    base = hyp(el) * (0.35 + 0.85 * np.clip(sh, 0, 1))[..., None] * shade_k[..., None]
    col = base * (1 - g[..., None] * 0.9) + GOLD * (g * (0.5 + 0.5 * g))[..., None]
    col = np.where(ps[..., None], base * 0.25 + np.array([40, 110, 255]) * 0.7, col)
    img = np.where(hit[..., None], col, BG).astype(np.float32)
    return img, g * hit


def glow(img, m, radii, gains, k=0.55):
    add = np.zeros_like(img)
    for r_, w_ in zip(radii, gains):
        bl = np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r_ * S)), np.float32) / 255
        add += bl[..., None] * w_
    return np.clip(img + np.array([255, 170, 60]) * add * k, 0, 255)


def ortho(lat0, lon0, Rpx, ang=90.0):
    """正射図法。ang は画像の半径に入れる角度（90で球全体）"""
    n = 2 * Rpx
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64)
    sc = np.sin(np.radians(ang))
    x = (xx + 0.5 - Rpx) / Rpx * sc
    y = (Rpx - yy - 0.5) / Rpx * sc
    rho2 = x * x + y * y
    hit = rho2 <= 1
    z = np.sqrt(np.clip(1 - rho2, 0, 1))
    p0, l0 = np.radians(lat0), np.radians(lon0)
    lat = np.degrees(np.arcsin(np.clip(z * np.sin(p0) + y * np.cos(p0), -1, 1)))
    lon = np.degrees(l0 + np.arctan2(x, z * np.cos(p0) - y * np.sin(p0)))

    def proj(lon_q, lat_q):
        p, l = np.radians(np.asarray(lat_q)), np.radians(np.asarray(lon_q))
        cosc = np.sin(p0) * np.sin(p) + np.cos(p0) * np.cos(p) * np.cos(l - l0)
        xq = np.cos(p) * np.sin(l - l0) / sc
        yq = (np.cos(p0) * np.sin(p) - np.sin(p0) * np.cos(p) * np.cos(l - l0)) / sc
        return Rpx + xq * Rpx, Rpx - yq * Rpx, cosc > 0

    return lat, lon, hit, z, proj


W = 2400
GRp = 1130
img = Image.new("RGB", (W * S, 2900 * S), tuple(BG.astype(int)))
d = SDraw(img, S)
TXT, SUB, GOLDT, BLUE = (225, 228, 238), (150, 156, 175), (255, 200, 80), (120, 170, 235)
d.text((70, 60), "#30DayMapChallenge Day 8 — Utopia", font=font(34), fill=SUB)
d.text((70, 112), "月に住むなら、南極の尾根", font=font(92, True), fill=TXT)
d.text((70, 232), "ほぼいつも日が当たる尾根（太陽光で電気を作れる）のすぐ隣に、一度も日が当たらない永久影（氷がありうる）がある",
       font=font(30), fill=SUB)
# 左: 月の全体（南半球寄りから）
GRp = 540
lat, lon, hit, z, gproj = ortho(-58, 10, GRp * S)
arr, m = colorize(lat, lon, hit, 0.35 + 0.65 * z**0.6)
arr = glow(arr, m, (2, 9), (0.9, 0.7), 0.8)
GX0, GY0 = 70, 330
img.paste(Image.fromarray(arr.astype(np.uint8)), (GX0 * S, GY0 * S))
# 拡大する範囲の枠（南極点から7.2°）
ring = np.linspace(0, 360, 181)
sx, sy, vis = gproj(ring, np.full_like(ring, -90 + 6.0))
from PIL import ImageDraw  # noqa: E402
ImageDraw.Draw(img).line([((GX0 * S + a_), (GY0 * S + b_)) for a_, b_ in zip(sx, sy)], fill=(255, 255, 255), width=2 * S)
d.text((GX0 + 20, GY0 + 2 * GRp + 16), "月（南緯58°の上から見た半球）", font=font(30, True), fill=TXT)
# 右: 南極の拡大（真上から）
ZR = 540
ZANG = 6.0  # 南極点から6°（約180km）
lat, lon, hit, z, proj = ortho(-90, 0, ZR * S, ang=ZANG)
arr, m = colorize(lat, lon, hit, np.ones_like(z))
arr = glow(arr, m, (2, 10), (0.7, 0.5))
GX, GY = 70 + 2 * GRp + 100, 330
img.paste(Image.fromarray(arr.astype(np.uint8)), (GX * S, GY * S))
d.text((GX + 20, GY + 2 * ZR + 16), "南極の拡大（真上から、南極点から約180km）", font=font(30, True), fill=TXT)
# 枠から拡大図へ引き出し線
ImageDraw.Draw(img).line([((GX0 * S + sx.max()), (GY0 * S + sy[np.argmax(sx)])), (GX * S, (GY + ZR) * S)], fill=(150, 156, 175), width=2 * S)
# 着陸候補の地域の外形と名前
NAMES = {r_["key"]: r_ for r_ in reg}
to_ll = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
for key, r_ in NAMES.items():
    z = src / "regions" / f"{key}.zip"
    df = pyogrio.read_dataframe(f"/vsizip/{z.as_posix()}/{key}/{key}_PolarLGRS_ACC_1km_S_Grid.shp")
    t = Transformer.from_crs(df.crs, crs, always_xy=True)
    hull = df.union_all().convex_hull
    xs, ys = t.transform(*np.asarray(hull.exterior.coords).T)
    lo, la = to_ll.transform(xs, ys)
    sx, sy, vis = proj(np.asarray(lo), np.asarray(la))
    sx, sy = sx / S, sy / S
    pts = [((GX + a) * S, (GY + b) * S) for a, b in zip(sx, sy)]
    from PIL import ImageDraw
    ImageDraw.Draw(img).line(pts + [pts[0]], fill=(255, 255, 255), width=2 * S)
    cx, cy = GX + float(np.mean(sx)), GY + float(np.mean(sy))
    r_["sx"], r_["sy"] = cx, cy
OFF = {  # 名前の置き場所（重ならないように）
    "Peak_Near_Cabeus_B": (-300, -10), "Haworth": (-150, -60), "Malapert_Massif": (30, -50), "Mons_Mouton": (40, -40),
    "Nobile_Rim_1": (40, 0), "Nobile_Rim_2": (40, 10), "de_Gerlache_Rim_2": (-360, 20), "Slater_Plain": (40, 20),
}
for key, r_ in NAMES.items():
    ox, oy = OFF.get(key, (30, 0))
    X, Y = r_["sx"] + ox, r_["sy"] + oy
    d.text((X, Y), r_["ja"], font=font(28, True), fill=TXT, stroke_width=4, stroke_fill=(0, 0, 0))
    d.text((X, Y + 34), f"日照 {r_['ill_max'] * 100:.0f}%・永久影まで {r_['km_to_psr']:.1f}km", font=font(22), fill=GOLDT,
           stroke_width=3, stroke_fill=(0, 0, 0))
sx, sy, vis = proj(np.array([0.0]), np.array([-90.0]))
sx, sy = sx / S, sy / S
X, Y = GX + float(sx[0]), GY + float(sy[0])
d.ellipse([X - 6, Y - 6, X + 6, Y + 6], fill=(255, 255, 255), outline=(0, 0, 0), width=2)
d.text((X + 12, Y - 18), "南極点", font=font(28, True), fill=TXT, stroke_width=4, stroke_fill=(0, 0, 0))

ly = GY + 2 * ZR + 80
lx = 70
for c_, t in [(GOLD, "日がよく当たる（平均の日照率50%以上、高いほど明るい）"), (np.array([40, 110, 255]), "永久影（一度も日が当たらない）"),
              (np.array([255, 255, 255]), "アルテミス計画の有人着陸の候補（NASA、2024年10月）")]:
    d.rectangle([lx, ly + 6, lx + 32, ly + 38], fill=tuple(np.asarray(c_).astype(int)))
    d.text((lx + 46, ly + 4), t, font=font(30), fill=TXT)
    lx += 46 + d.textlength(t, font=font(30)) + 44
notes = [
    "陰影段彩図（標高が低いほど紫、高いほど白）。左は月の半球、右は南極の拡大（どちらも正射図法）。南緯75°より極側は LOLA の120m 格子、外側は16ppd（約1.9km）。日照率と永久影は南緯75°より極側だけ。",
    "日照率は地表での平均で、18.6年の月の歳差周期を1時間ごとに計算したもの（Mazarico ほか 2011）。地面から数m上げた太陽電池なら、もっと長く日が当たる。",
    "数字は地域の中でいちばん日が当たる所（120m 格子の1画素）の日照率と、そこからいちばん近い永久影までの距離。ムートン山の台地は外形の公開データがなく省いた。",
    "出典）NASA LRO LOLA: 標高 LDEM_16・LDEM_75S_120M（PDS Geosciences Node）、平均日照率 AVGVISIB_75S_120M・永久影 LPSR_75S_120M（NASA GSFC PGDA、Mazarico et al. 2011, Icarus 211）、",
    "着陸候補の地域: McClernan 2024, Down Selected Artemis III Candidate Landing Site Navigational Grids（USGS、CC0。元は LROC QuickMap）を加工して作成",
]
y = ly + 70
for t in notes:
    d.text((70, y), t, font=font(24), fill=SUB)
    y += 36
img = img.crop((0, 0, W * S, (y + 30) * S))
img.save(sys.argv[3])
print(img.size)
