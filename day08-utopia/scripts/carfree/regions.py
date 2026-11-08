"""投稿用: 首都圏・中京圏・近畿圏の拡大（250mメッシュをそのまま塗り、主な市の割合を添える）。

使い方: python -I -X utf8 regions.py <data/carfree> <出力フォルダ> [倍率（既定1）]
"""
import sys
from pathlib import Path

import pandas as pd
from PIL import Image, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from maplib import BG, C_BOTH, C_NONE, C_SERV, glow, init, render  # noqa: E402
from scaledraw import SDraw  # noqa: E402

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
S = int(sys.argv[3]) if len(sys.argv) > 3 else 1
Image.MAX_IMAGE_PIXELS = None
init(pd.read_parquet(src / "mesh_carfree.parquet"), S)
city = pd.read_csv(src / "city_carfree.csv")
pref = pd.read_csv(src / "pref_carfree.csv")

FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size * S)


GOLD, TXT, SUB = (255, 200, 80), (225, 228, 238), (150, 156, 175)


def share(df):
    return (df["both"] * df["pop"]).sum() / df["pop"].sum()


def city_share(p, names):
    if names == "23区":
        return share(city[(city["pref"] == p) & city["city"].str.endswith("区")])
    return share(city[(city["pref"] == p) & (city["city"] == names)])


# 市の位置はおよその市役所（23区は東京駅）
REGIONS = [
    ("shutoken", "首都圏", ["東京都", "神奈川県", "埼玉県", "千葉県"], "1都3県", (138.95, 140.75, 35.05, 36.25), [
        ("東京都", "23区", "東京23区", 139.767, 35.681), ("神奈川県", "横浜市", "横浜市", 139.638, 35.444),
        ("神奈川県", "川崎市", "川崎市", 139.703, 35.531), ("埼玉県", "さいたま市", "さいたま市", 139.646, 35.861),
        ("千葉県", "千葉市", "千葉市", 140.123, 35.607), ("神奈川県", "相模原市", "相模原市", 139.373, 35.571),
        ("東京都", "八王子市", "八王子市", 139.316, 35.666), ("千葉県", "船橋市", "船橋市", 139.983, 35.695),
        ("埼玉県", "川越市", "川越市", 139.486, 35.925), ("神奈川県", "横須賀市", "横須賀市", 139.672, 35.281),
    ]),
    ("chukyo", "中京圏", ["愛知県", "岐阜県", "三重県"], "愛知・岐阜・三重", (136.40, 137.55, 34.62, 35.50), [
        ("愛知県", "名古屋市", "名古屋市", 136.907, 35.181), ("岐阜県", "岐阜市", "岐阜市", 136.761, 35.423),
        ("愛知県", "豊田市", "豊田市", 137.156, 35.083), ("愛知県", "岡崎市", "岡崎市", 137.174, 34.954),
        ("愛知県", "一宮市", "一宮市", 136.803, 35.304), ("三重県", "四日市市", "四日市市", 136.624, 34.965),
        ("三重県", "津市", "津市", 136.509, 34.719), ("愛知県", "春日井市", "春日井市", 136.972, 35.248),
        ("愛知県", "豊橋市", "豊橋市", 137.392, 34.769),
    ]),
    ("kinki", "近畿圏", ["大阪府", "京都府", "兵庫県", "奈良県"], "大阪・京都・兵庫・奈良", (134.95, 136.05, 34.33, 35.10), [
        ("大阪府", "大阪市", "大阪市", 135.502, 34.694), ("京都府", "京都市", "京都市", 135.768, 35.012),
        ("兵庫県", "神戸市", "神戸市", 135.196, 34.690), ("大阪府", "堺市", "堺市", 135.483, 34.574),
        ("奈良県", "奈良市", "奈良市", 135.805, 34.685), ("大阪府", "東大阪市", "東大阪市", 135.601, 34.679),
        ("兵庫県", "西宮市", "西宮市", 135.342, 34.737), ("大阪府", "枚方市", "枚方市", 135.650, 34.814),
        ("兵庫県", "姫路市", "姫路市", 134.686, 34.815), ("大阪府", "高槻市", "高槻市", 135.617, 34.846),
    ]),
]

W, MW, MX = 2400, 2320, 40
for key, name, prefs, pref_note, (a, b, c, e), cities in REGIONS:
    arr = render(a, b, c, e, MW * S, 1500)
    arr = glow(arr, (2, 10), (0.35, 0.5))
    MH = arr.shape[0] // S
    MY = 280
    H = MY + MH + 260
    img = Image.new("RGB", (W * S, H * S), tuple(BG.astype(int)))
    d = SDraw(img, S)
    img.paste(Image.fromarray(arr), (MX * S, MY * S))
    d.text((70, 50), "#30DayMapChallenge Day 8 — Utopia ／ 車に頼らず暮らせる場所", font=font(32), fill=SUB)
    d.text((70, 100), name, font=font(84, True), fill=TXT)
    sh = share(pref[pref["pref"].isin(prefs)])
    tx = 70 + d.textlength(name, font=font(84, True)) + 36
    d.text((tx, 128), f"{pref_note}で {sh * 100:.0f}%", font=font(48, True), fill=GOLD)
    d.text((70, 210), "1時間に6本以上の駅まで500m以内、学校と医療機関の両方まで1km以内に住んでいる所（250mメッシュ）",
           font=font(30), fill=SUB)
    k = __import__("math").cos(__import__("math").radians((c + e) / 2))
    for p_, cname, label, lo, la in cities:
        if not (a < lo < b and c < la < e):
            continue
        x = MX + (lo - a) / (b - a) * MW
        y = MY + (e - la) / (e - c) * MH
        v = city_share(p_, cname)
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 255, 255), outline=(10, 12, 20), width=2)
        d.text((x + 14, y - 40), label, font=font(34, True), fill=TXT, stroke_width=5, stroke_fill=(10, 12, 20))
        d.text((x + 14, y - 2), f"{v * 100:.0f}%", font=font(34, True), fill=GOLD, stroke_width=5, stroke_fill=(10, 12, 20))
    ly = MY + MH + 24
    lx = 70
    for col, t in [(C_BOTH, "両方を満たす"), (C_SERV, "学校・医療機関だけ近い"), (C_NONE, "どちらも遠い")]:
        d.rectangle([lx, ly + 6, lx + 30, ly + 36], fill=tuple(col.astype(int)))
        d.text((lx + 42, ly + 4), t, font=font(30), fill=TXT)
        lx += 42 + d.textlength(t, font=font(30)) + 50
    d.text((lx, ly + 8), "明るさは人口。市の割合は市内に住む人のうち両方を満たす人の割合", font=font(26), fill=SUB)
    for i, t in enumerate([
        "鉄道（路面電車・モノレールを含む）だけでバスは含まない。1時間6本は上りと下りを合わせた本数（ITDP に倣う）。距離は直線距離",
        "出典）国勢調査2020 250mメッシュ人口（総務省統計局 e-Stat）、gtfs-gis.jp 全国鉄道運行本数データ 2026年版（西澤明、CC BY 4.0・ODbL）、",
        "国土数値情報（学校 2023年度・医療機関 2020年度・行政区域 2026年、CC BY 4.0）を加工して作成",
    ]):
        d.text((70, ly + 70 + i * 38), t, font=font(25), fill=SUB)
    img.save(out / f"region_{key}{'' if S == 1 else f'_x{S}'}.png")
    print(key, img.size, f"{sh:.3f}")
