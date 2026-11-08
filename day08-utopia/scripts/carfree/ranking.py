"""投稿用の2枚目: 政令指定都市・中核市・その他の市（人口10万人以上）の順位。

使い方: python -I -X utf8 ranking.py <data/carfree> <出力png> [倍率（既定1。2で4800px幅）]
"""
import sys
from pathlib import Path

import pandas as pd
from PIL import Image, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from city_class import CHUKAKU, SEIREI  # noqa: E402
from scaledraw import SDraw  # noqa: E402

S = int(sys.argv[3]) if len(sys.argv) > 3 else 1

src = Path(sys.argv[1])
c = pd.read_csv(src / "city_carfree.csv")
ku = c[(c["pref"] == "東京都") & c["city"].str.endswith("区")]
ku23 = (ku["both"] * ku["pop"]).sum() / ku["pop"].sum()

seirei = c[c["city"].isin(SEIREI)].sort_values("both", ascending=False)
chukaku = c[c["city"].isin(CHUKAKU)].sort_values("both", ascending=False)
METRO = ["東京都", "神奈川県", "埼玉県", "千葉県", "大阪府", "京都府", "兵庫県", "奈良県", "愛知県", "岐阜県", "三重県"]
other_all = c[c["city"].str.endswith("市") & ~c["city"].isin(SEIREI + CHUKAKU) & ~c["pref"].isin(METRO)]
other = other_all[other_all["pop"] >= 100000].sort_values("both", ascending=False)

FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"
f = lambda s, b=False: ImageFont.truetype(FONT_B if b else FONT_R, s * S)  # noqa: E731
BG, TXT, SUB, GOLD, ZERO, GRID = (10, 12, 20), (225, 228, 238), (150, 156, 175), (255, 200, 80), (120, 100, 128), (40, 44, 60)

ROW = 40
W = 2400
img = Image.new("RGB", (W * S, 2200 * S), BG)
d = SDraw(img, S)
d.text((70, 60), "#30DayMapChallenge Day 8 — Utopia", font=f(34), fill=SUB)
d.text((70, 112), "車に頼らず暮らせる人の割合（市ごと）", font=f(80, True), fill=TXT)
d.text((70, 220), "1時間に6本以上の駅まで500m以内、学校・医療機関・食料品店のどれも1km以内に住む人の割合。全国は "
       f"{(c['both'] * c['pop']).sum() / c['pop'].sum() * 100:.1f}%、東京23区は {ku23 * 100:.0f}%", font=f(30), fill=SUB)


def column(x, y, title, note, df, n, bar_w, label_w=190):
    d.text((x, y), title, font=f(40, True), fill=TXT)
    d.text((x, y + 52), note, font=f(26), fill=SUB)
    y += 110
    for _, r in df.head(n).iterrows():
        v = r["both"]
        name = r["city"]
        d.text((x, y + 4), name, font=f(28), fill=TXT)
        bx = x + label_w
        d.rectangle([bx, y + 8, bx + bar_w, y + ROW - 8], fill=GRID)
        if v > 0:
            d.rectangle([bx, y + 8, bx + max(int(bar_w * v), 3), y + ROW - 8], fill=GOLD)
        t = f"{v * 100:.0f}%" if v >= 0.005 else ("0%" if v == 0 else "<1%")
        d.text((bx + bar_w + 14, y + 4), t, font=f(28, True), fill=GOLD if v >= 0.005 else ZERO)
        y += ROW
    return y


BAR = 300
# 政令指定都市
y1 = column(70, 300, "政令指定都市（20市）", "", seirei, 20, BAR)
# 中核市（2列）
half = (len(chukaku) + 1) // 2
y2 = column(820, 300, f"中核市（{len(chukaku)}市）", "", chukaku.iloc[:half], half, BAR - 40, 170)
y3 = column(1360, 300, "", "", chukaku.iloc[half:], len(chukaku) - half, BAR - 40, 170)
# その他の市
n0 = (other["both"] == 0).sum()
y4 = column(1900, 300, "三大都市圏の外の市", f"政令市・中核市以外で人口10万人以上の{len(other)}市", other, 20, 200, 160)
yy = y4 + 30
for t in [f"{len(other)}市のうち", f"{n0}市が0%"]:
    d.text((1900, yy), t, font=f(34, True), fill=TXT)
    yy += 48
n0a = (other_all["both"] == 0).sum()
d.text((1900, yy + 10), f"人口を問わなければ", font=f(26), fill=SUB)
d.text((1900, yy + 46), f"{len(other_all)}市のうち{n0a}市が0%", font=f(26), fill=SUB)

y = max(y1, y2, y3, yy + 90) + 40
for t in [
    "鉄道（路面電車・モノレールを含む）だけでバスは含まない。1時間6本は ITDP と同じく上りと下りを合わせた本数（片道では約3本）で、同じ駅の別の事業者の本数は足した。",
    "距離はメッシュの中心からの直線距離で、道のりより短い。特急・新幹線は本数に含まない。中核市は総務省の令和5年4月1日現在の62市。東京23区はどの区分にも入れていない。",
    "三大都市圏は東京・神奈川・埼玉・千葉・大阪・京都・兵庫・奈良・愛知・岐阜・三重の1都2府8県とした",
    "出典）国勢調査2020 250mメッシュ人口・経済センサス‐活動調査2021 500mメッシュ（e-Stat）、gtfs-gis.jp 全国鉄道運行本数データ 2026年版（西澤明、CC BY 4.0・ODbL）、",
    "国土数値情報（学校 2023年度・医療機関 2020年度・行政区域 2026年、CC BY 4.0）を加工して作成。指標は ITDP「Atlas of Sustainable City Transport」に倣った",
]:
    d.text((70, y), t, font=f(25), fill=SUB)
    y += 38
img.crop((0, 0, W * S, (y + 40) * S)).save(sys.argv[2])
print(len(seirei), len(chukaku), len(other), n0)
