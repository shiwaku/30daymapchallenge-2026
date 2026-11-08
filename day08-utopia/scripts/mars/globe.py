"""火星に住むならどこ？ — 地下の氷・低い土地・中緯度の3つの条件を満たす所を、火星の地球儀に光らせる。

条件（NASA の有人着陸候補「探査ゾーン」の目安と、SWIM の氷の地図から）
- 地下5mまでに氷がありそう: SWIM の ice consistency（深さ0〜1m・1〜5m の大きい方）が 0.5 以上
- 標高（MOLA、基準面からの高さ）が +2km 以下（大気が厚いほど着陸しやすい）
- 緯度が南北50°以内（寒さと日照）

使い方: python -I -X utf8 globe.py <data/mars> <出力png> [倍率]
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scaledraw import SDraw  # noqa: E402

S = int(sys.argv[3]) if len(sys.argv) > 3 else 1
Image.MAX_IMAGE_PIXELS = None
src = Path(sys.argv[1])
FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size * S)


ICE_TH, ELEV_MAX, LAT_MAX = 0.5, 2000, 50

# ---- データ ----
mola = np.fromfile(src / "mola/megt90n000fb.img", ">i2").reshape(5760, 11520).astype(np.float32)  # 90N→90S, 0E→360E
c01 = rasterio.open(src / "swim/z/SWIM4MIM_Ci_0_1.tif").read(1)
c15 = rasterio.open(src / "swim/z/SWIM4MIM_Ci_1_5.tif").read(1)  # 60N→60S, 180W→180E, 0.05°
ci = np.fmax(np.where(c01 == -30, np.nan, c01), np.where(c15 == -30, np.nan, c15))
# レーダーの軌跡に沿った筋をならす（0.15°のガウスぼかし。欠測はぼかしに入れない）
from scipy.ndimage import gaussian_filter  # noqa: E402
_v = np.nan_to_num(ci, nan=0.0)
_m = (~np.isnan(ci)).astype(np.float32)
ci = np.where(_m > 0, gaussian_filter(_v, 3) / np.maximum(gaussian_filter(_m, 3), 1e-6), np.nan)

# 陰影（北西から）。経度方向の間隔は緯度で縮める
lat_rows = 90 - (np.arange(5760) + 0.5) / 32
dx = 3396000 * np.radians(1 / 32) * np.cos(np.radians(lat_rows))[:, None]
dy = 3396000 * np.radians(1 / 32)
gy, gx = np.gradient(mola)
gx = gx / np.maximum(dx, 1)
gy = gy / dy
az, alt = np.radians(315), np.radians(40)
slope = np.arctan(np.hypot(gx, gy) * 2.0)
aspect = np.arctan2(-gx, gy)
shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
shade = np.clip(shade, 0, 1).astype(np.float32)


def sample(lat, lon):
    r = np.clip(((90 - lat) * 32).astype(int), 0, 5759)
    c = (((lon % 360) * 32).astype(int)) % 11520
    el, sh = mola[r, c], shade[r, c]
    inside = np.abs(lat) < 60
    rr = np.clip(((60 - lat) / 0.05).astype(int), 0, 2399)
    cc = np.clip((((lon + 180) % 360) / 0.05).astype(int), 0, 7199)
    ice = np.where(inside, ci[rr, cc], np.nan)
    return el, sh, ice


def classify(el, ice, lat):
    icy = np.nan_to_num(ice, nan=-1) >= ICE_TH
    ok = icy & (el <= ELEV_MAX) & (np.abs(lat) <= LAT_MAX)
    return icy, ok


# ---- 面積の割合（火星の表面全体に対して） ----
LA, LO = np.meshgrid(60 - (np.arange(2400) + 0.5) * 0.05, -180 + (np.arange(7200) + 0.5) * 0.05, indexing="ij")
el_g, _, ice_g = sample(LA, LO)
icy_g, ok_g = classify(el_g, ice_g, LA)
w = np.cos(np.radians(LA))
sphere = w.sum() / np.sin(np.radians(60))  # ±60°の帯は球の sin60° 分
stats = {"ok_share": float((w * ok_g).sum() / sphere), "icy_share": float((w * icy_g).sum() / sphere)}

# ---- 正射図法の地球儀 ----
BG = np.array([10, 12, 20], np.float32)
C_OK = np.array([120, 255, 170], np.float32)
C_ICE = np.array([110, 140, 190], np.float32)


def globe(lon0, lat0, R):
    n = 2 * R
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (x + 0.5 - R) / R
    y = (R - y - 0.5) / R
    rho2 = x * x + y * y
    disk = rho2 <= 1
    z = np.sqrt(np.clip(1 - rho2, 0, 1))
    p0, l0 = np.radians(lat0), np.radians(lon0)
    lat = np.degrees(np.arcsin(np.clip(z * np.sin(p0) + y * np.cos(p0), -1, 1)))
    lon = np.degrees(l0 + np.arctan2(x, z * np.cos(p0) - y * np.sin(p0)))
    el, sh, ice = sample(lat, lon)
    icy, ok = classify(el, ice, lat)
    # 地の色: 低い所は暗い赤茶、高い所は明るい黄土
    t = np.clip((el + 6000) / 16000, 0, 1)[..., None]
    base = np.array([96, 46, 30], np.float32) * (1 - t) + np.array([196, 128, 84], np.float32) * t
    light = (0.35 + 0.75 * sh)[..., None] * (0.55 + 0.45 * z[..., None])  # 縁を暗く
    col = base * light
    col = np.where(icy[..., None] & ~ok[..., None], col * 0.45 + C_ICE * 0.55 * light, col)
    col = np.where(ok[..., None], col * 0.15 + C_OK * (0.55 + 0.45 * light), col)
    img = np.where(disk[..., None], col, BG)
    # 発光（条件を満たす所だけ）
    m = (ok & disk).astype(np.float32)
    add = np.zeros_like(img)
    for r_, g_ in ((3, 0.9), (14, 0.6)):
        b = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r_ * S)), np.float32) / 255
        add += b[..., None] * g_
    img = np.clip(img + np.array([90, 255, 160], np.float32) * add * 0.55, 0, 255)
    # 大気のふち
    rim = np.clip(1 - np.abs(np.sqrt(rho2) - 1) * R / (10 * S), 0, 1) * (rho2 > 0.9)
    img = np.clip(img + np.array([220, 140, 100], np.float32) * rim[..., None] * 0.35, 0, 255)
    return img.astype(np.uint8), (lat, lon, disk)


def project(lon0, lat0, R, lat, lon):
    p0, l0 = np.radians(lat0), np.radians(lon0)
    p, l = np.radians(lat), np.radians(lon)
    cosc = np.sin(p0) * np.sin(p) + np.cos(p0) * np.cos(p) * np.cos(l - l0)
    x = np.cos(p) * np.sin(l - l0)
    y = np.cos(p0) * np.sin(p) - np.sin(p0) * np.cos(p) * np.cos(l - l0)
    return R + x * R, R - y * R, cosc > 0


W = 2400
GR = 540  # 地球儀の半径（等倍）
img = Image.new("RGB", (W * S, 1880 * S), tuple(BG.astype(int)))
d = SDraw(img, S)
TXT, SUB, GOLD, ICE = (225, 228, 238), (150, 156, 175), (140, 255, 180), (130, 180, 235)
d.text((70, 60), "#30DayMapChallenge Day 8 — Utopia", font=font(34), fill=SUB)
d.text((70, 112), "火星に住むならどこ？", font=font(92, True), fill=TXT)
d.text((70, 232), "地下5mまでに氷がありそうで、標高が低く（+2km以下）、南北50°以内の所（NASA の有人着陸候補の目安と SWIM の氷の地図から）",
       font=font(30), fill=SUB)

# 左: ユートピア平原の側、右: アキダリア平原（オデッセイ）の側
VIEWS = [
    (115, 28, "ユートピア平原の側（東経115°）"),
    (-25, 22, "アキダリア平原の側（西経25°）"),
]
GY = 330
for k, (lon0, lat0, cap) in enumerate(VIEWS):
    gx0 = 70 + k * (2 * GR + 120)
    arr, _ = globe(lon0, lat0, GR * S)
    img.paste(Image.fromarray(arr), (gx0 * S, GY * S))
    d.text((gx0, GY + 2 * GR + 24), cap, font=font(30, True), fill=TXT)

    def mark(lat, lon, name, sub=None, dx=14, dy=-20, col=TXT):
        px, py, vis = project(lon0, lat0, GR, np.array(lat), np.array(lon))
        if not vis:
            return None
        X, Y = gx0 + float(px), GY + float(py)
        d.ellipse([X - 6, Y - 6, X + 6, Y + 6], fill=(255, 255, 255), outline=(0, 0, 0), width=2)
        d.text((X + dx, Y + dy), name, font=font(30, True), fill=col, stroke_width=4, stroke_fill=(0, 0, 0))
        if sub:
            d.text((X + dx, Y + dy + 38), sub, font=font(22), fill=SUB, stroke_width=3, stroke_fill=(0, 0, 0))
        return X, Y

    if k == 0:
        mark(46.7, 117.5, "ユートピア平原", "Utopia Planitia。1976年にバイキング2号が着陸")
        mark(18.4, 77.5, "ジェゼロ・クレーター", "2021年からパーサヴィアランスが走る", dy=10)
    else:
        # オデッセイ（原作『火星の人』）の主人公の道のり（およそ）
        pts = [(31.2, -28.5), (19.1, -33.2), (22.6, -17.0), (8.0, 0.0), (-2.7, 16.7)]
        lat_l, lon_l = [], []
        for (a1, o1), (a2, o2) in zip(pts[:-1], pts[1:]):
            for f in np.linspace(0, 1, 40):
                lat_l.append(a1 + (a2 - a1) * f)
                lon_l.append(o1 + (o2 - o1) * f)
        px, py, vis = project(lon0, lat0, GR, np.array(lat_l), np.array(lon_l))
        for i in range(0, len(lat_l) - 1, 2):
            if vis[i] and vis[i + 1]:
                ImageDraw.Draw(img).line([((gx0 + px[i]) * S, (GY + py[i]) * S), ((gx0 + px[i + 1]) * S, (GY + py[i + 1]) * S)],
                                         fill=(255, 255, 255), width=3 * S)
        mark(31.2, -28.5, "アキダリア平原", "オデッセイの主人公が取り残された所（およそ）", dx=16, dy=-58)
        mark(19.1, -33.2, "パスファインダー", "1997年に着陸。主人公が掘り出しに行く", dx=-330, dy=6)
        mark(-2.7, 16.7, "スキャパレリ・クレーター", "脱出用の船が待つ所（道のりはおよそ3,200km）", dx=-420, dy=16)

# ---- 数字と凡例 ----
ly = GY + 2 * GR + 90
d.text((70, ly), f"3つの条件を満たすのは火星の表面の {stats['ok_share'] * 100:.1f}%", font=font(44, True), fill=GOLD)
d.text((70, ly + 62), f"地下5mまでに氷がありそうな所は {stats['icy_share'] * 100:.1f}%（SWIM の範囲は南北60°まで）", font=font(30), fill=TXT)
lx = 70
for c_, t in [(C_OK, "3つの条件を満たす"), (C_ICE, "氷はありそうだが、高すぎるか極に近い")]:
    d.rectangle([lx, ly + 126, lx + 32, ly + 158], fill=tuple(c_.astype(int)))
    d.text((lx + 46, ly + 124), t, font=font(30), fill=TXT)
    lx += 46 + d.textlength(t, font=font(30)) + 50
notes = [
    "氷は SWIM（Subsurface Water Ice Mapping）の ice consistency（いくつもの観測が氷のありそうなことで一致する度合い、-1〜1。0.15°でならした）が 0.5 以上。氷の量や確かさではない。",
    "SWIM は南北60°までなので、極冠（北極・南極の氷）は塗っていない。",
    "標高は MOLA（基準面からの高さ）。条件は NASA が2015年に有人着陸の候補地を募ったときの目安（南北50°以内、+2km 以下）に倣った。オデッセイの道のりは原作と映画から読んだおよその位置。",
    "出典）MGS MOLA MEGDR 32ppd（NASA/GSFC、PDS Geosciences Node）、SWIM 4 MIM 合成 ice consistency 地図（Morgan, Putzig ほか、Planetary Science Institute／NASA）を加工して作成",
]
y = ly + 190
for t in notes:
    d.text((70, y), t, font=font(24), fill=SUB)
    y += 36
img = img.crop((0, 0, W * S, (y + 30) * S))
img.save(sys.argv[2])
print(img.size, json.dumps(stats))
