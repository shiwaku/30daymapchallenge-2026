"""投稿用の1枚: 車に頼らず暮らせる場所（全国の250mメッシュ＋地方の4市の拡大）。

使い方: python -I -X utf8 poster.py <data/carfree> <出力png> [倍率（既定1。2で4800px幅）]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from scaledraw import SDraw  # noqa: E402

S = int(sys.argv[3]) if len(sys.argv) > 3 else 1
Image.MAX_IMAGE_PIXELS = None  # 自分で描く大きな画像なので上限を外す

src = Path(sys.argv[1])
m = pd.read_parquet(src / "mesh_carfree.parquet")
city = pd.read_csv(src / "city_carfree.csv")
nat = json.load(open(src / "national.json"))

FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size * S)


BG = np.array([10, 12, 20], float)
C_BOTH = np.array([255, 200, 80], float)
C_SERV = np.array([62, 104, 160], float)
C_NONE = np.array([105, 78, 112], float)
DLON, DLAT = 1 / 320, 1 / 480

cat = np.where(m["both"], 2, np.where(m["service"], 1, 0))
pop = m["pop"].to_numpy().astype(float)
lon = m["lon"].to_numpy()
lat = m["lat"].to_numpy()


def shade(p_both, p_serv, p_none, ref):
    tot = p_both + p_serv + p_none
    with np.errstate(invalid="ignore", divide="ignore"):
        mix = (C_BOTH * p_both[..., None] + C_SERV * p_serv[..., None] + C_NONE * p_none[..., None]) / tot[..., None]
    mix = np.nan_to_num(mix)
    a = np.clip(np.log10(tot + 1) / np.log10(ref), 0, 1) ** 0.9
    a = np.where(tot > 0, np.maximum(a, 0.18), 0)[..., None]
    return (BG * (1 - a) + mix * a).clip(0, 255).astype(np.uint8)


def render(lon0, lon1, lat0, lat1, w, ref):
    """経度方向を中央緯度の cos で縮めた正距円筒で描く。1画素に入るメッシュの人口を足す。"""
    k = np.cos(np.radians((lat0 + lat1) / 2))
    h = int(round(w * (lat1 - lat0) / ((lon1 - lon0) * k)))
    sel = (lon > lon0) & (lon < lon1) & (lat > lat0) & (lat < lat1)
    if (lon1 - lon0) / w < DLON:  # 拡大図: メッシュを矩形で塗る
        out = np.tile(BG.astype(np.uint8), (h, w, 1))
        ls, bs, cs, ps = lon[sel], lat[sel], cat[sel], pop[sel]
        x0 = np.round((ls - DLON / 2 - lon0) / (lon1 - lon0) * w).astype(int)
        x1 = np.round((ls + DLON / 2 - lon0) / (lon1 - lon0) * w).astype(int)
        y0 = np.round((lat1 - bs - DLAT / 2) / (lat1 - lat0) * h).astype(int)
        y1 = np.round((lat1 - bs + DLAT / 2) / (lat1 - lat0) * h).astype(int)
        z = np.zeros(len(ps))
        col = shade(np.where(cs == 2, ps, z), np.where(cs == 1, ps, z), np.where(cs == 0, ps, z), ref)
        for i in range(len(ps)):
            out[max(y0[i], 0):max(y1[i], 0), max(x0[i], 0):max(x1[i], 0)] = col[i]
        return out
    x = ((lon[sel] - lon0) / (lon1 - lon0) * w).astype(int).clip(0, w - 1)
    y = ((lat1 - lat[sel]) / (lat1 - lat0) * h).astype(int).clip(0, h - 1)
    idx = y * w + x
    acc = [np.bincount(idx, weights=np.where(cat[sel] == c, pop[sel], 0), minlength=w * h).reshape(h, w) for c in (2, 1, 0)]
    return shade(*acc, ref)


W, H = 2400, 2560
img = Image.new("RGB", (W * S, H * S), tuple(BG.astype(int)))
d = SDraw(img, S)
GOLD = (255, 200, 80)
TXT = (225, 228, 238)
SUB = (150, 156, 175)

# ---- 題 ----
d.text((70, 60), "#30DayMapChallenge Day 8 — Utopia", font=font(34), fill=SUB)
d.text((70, 112), "車に頼らず暮らせる場所", font=font(92, True), fill=TXT)
d.text((70, 232), "1時間に6本以上の駅まで500m以内、学校と医療機関の両方まで1km以内に住んでいる所（ITDP の指標を国内のデータで計算）",
       font=font(30), fill=SUB)

# ---- 全国 ----
MX, MY, MW = 40, 330, 1620
# 1画素にメッシュが入りきらない倍率では人口を足して混ぜる（ref は1画素あたり）。
# 6倍以上ではメッシュ1つが1.4画素以上になるので、メッシュを四角で塗る（ref は1メッシュあたり）
main = render(128.4, 146.0, 30.9, 45.6, MW * S, 6000 / S**2 if S < 4 else 1500)
MH = main.shape[0] // S
img.paste(Image.fromarray(main), (MX * S, MY * S))
# 沖縄本島（左上の空いた所に）
oki = render(127.62, 128.05, 26.08, 26.75, 250 * S, 1500)
OH, OW = oki.shape[0] // S, oki.shape[1] // S
OX, OY = MX + MW - 330, MY + MH - OH - 60
img.paste(Image.fromarray(oki), (OX * S, OY * S))
d.rectangle([OX - 1, OY - 1, OX + OW, OY + OH], outline=(60, 64, 82), width=2)
d.text((OX, OY - 40), "沖縄本島", font=font(26), fill=SUB)

# 全国の数字
nx, ny = MX + 40, MY + 60
d.text((nx, ny), "全国", font=font(40, True), fill=TXT)
d.text((nx, ny + 52), f"{nat['both'] * 100:.1f}%", font=font(130, True), fill=GOLD)
d.text((nx, ny + 200), f"約{nat['both'] * nat['pop'] / 1e4:,.0f}万人", font=font(40), fill=TXT)
d.text((nx, ny + 262), f"駅だけなら {nat['transit'] * 100:.1f}%", font=font(30), fill=SUB)
d.text((nx, ny + 302), f"学校・医療機関だけなら {nat['service'] * 100:.1f}%", font=font(30), fill=SUB)


# ---- 地方の4市の拡大 ----
def city_share(pref, names):
    c = city[(city["pref"] == pref) & city["city"].isin(names)]
    return (c["both"] * c["pop"]).sum() / c["pop"].sum()


def box(lon, lat, hx=0.10, hy=0.045):
    return (lon - hx, lon + hx, lat - hy, lat + hy)


insets = [
    ("那覇市", "モノレール", city_share("沖縄県", ["那覇市"]), box(127.700, 26.225)),
    ("松山市", "路面電車", city_share("愛媛県", ["松山市"]), box(132.770, 33.840)),
    ("富山市", "路面電車・LRT", city_share("富山県", ["富山市"]), box(137.215, 36.695)),
    ("金沢市", "バスの街", city_share("石川県", ["金沢市"]), box(136.650, 36.565)),
]
IX, IW = 1700, 660
iy = MY
for name, tag, sh, (a, b, c_, e) in insets:
    arr = render(a, b, c_, e, IW * S, 800)
    AH = arr.shape[0] // S
    img.paste(Image.fromarray(arr), (IX * S, (iy + 56) * S))
    d.rectangle([IX - 1, iy + 55, IX + IW, iy + 56 + AH], outline=(60, 64, 82), width=2)
    d.text((IX, iy), name, font=font(40, True), fill=TXT)
    d.text((IX + d.textlength(name, font=font(40, True)) + 18, iy + 12), tag, font=font(26), fill=SUB)
    t = f"{sh * 100:.0f}%" if sh >= 0.005 else "<1%"
    tw = d.textlength(t, font=font(44, True))
    d.text((IX + IW - tw, iy - 4), t, font=font(44, True), fill=GOLD)
    iy += 56 + AH + 34

# ---- 凡例 ----
ly = max(MY + MH, iy) + 20
items = [(C_BOTH, "両方を満たす（車に頼らず暮らせる）"), (C_SERV, "学校・医療機関だけ近い"), (C_NONE, "どちらも遠い")]
lx = 70
for c_, t in items:
    d.rectangle([lx, ly + 6, lx + 34, ly + 40], fill=tuple(c_.astype(int)))
    d.text((lx + 48, ly + 4), t, font=font(32), fill=TXT)
    lx += 60 + d.textlength(t, font=font(32)) + 40
d.text((70, ly + 62), "明るさは人口（250mメッシュ、拡大図はメッシュそのもの。範囲はどれも約18km×10km）。1時間6本は ITDP と同じく上りと下りを合わせた本数（片道では約3本）",
       font=font(26), fill=SUB)
d.text((70, ly + 100), "鉄道（路面電車・モノレールを含む）だけでバスは含まない。距離はメッシュの中心からの直線距離で、道のりより短い。特急・新幹線は本数に含まない",
       font=font(26), fill=SUB)

# ---- 出典 ----
cy = ly + 160
for t in [
    "出典）国勢調査2020 250mメッシュ人口（総務省統計局 e-Stat）、gtfs-gis.jp 全国鉄道運行本数データ 2026年版（西澤明、CC BY 4.0・ODbL）、",
    "国土数値情報（学校 2023年度・医療機関 2020年度、CC BY 4.0）を加工して作成。指標は ITDP「Atlas of Sustainable City Transport」に倣った",
]:
    d.text((70, cy), t, font=font(26), fill=SUB)
    cy += 38

img = img.crop((0, 0, W * S, (cy + 40) * S))
img.save(sys.argv[2])
print(img.size)
