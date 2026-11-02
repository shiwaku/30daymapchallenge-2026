"""投稿用の1枚画像。97都市の建物の広がり（data/web/built/*.png）を、広がり方の順に並べる。

入力: data/web/cities.geojson, data/web/built/{rank}.png（build_web.py の出力）
出力: output/day09-urban-rural.png
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "data/web"
(ROOT / "output").mkdir(exist_ok=True)

P = [f["properties"] for f in json.loads((WEB / "cities.geojson").read_text(encoding="utf-8"))["features"]]

def order(p):
    """人口が減った → 人口ほぼ横ばい → 建物の伸び÷人口の伸び が大きい順"""
    if p["type"] == "shrink":
        return (0, 0)
    if abs(p["pop20"] / p["pop00"] - 1) < 0.05:
        return (1, 0)
    return (2, -p["lcr"])
P.sort(key=order)

FT = lambda s, b=False: ImageFont.truetype(f"C:/Windows/Fonts/{'YuGothB' if b else 'YuGothM'}.ttc", s)
BG = (11, 13, 18)
RED, BLUE, ORANGE, GREY = (255, 90, 95), (79, 195, 247), (255, 140, 38), (199, 204, 214)
T, G, LAB, COLS, M, TOP, BOT = 150, 14, 38, 10, 32, 190, 56
rows = math.ceil(len(P) / COLS)
W = M * 2 + COLS * T + (COLS - 1) * G
H = TOP + rows * (T + LAB) + (rows - 1) * G + BOT
im = Image.new("RGB", (W, H), BG)
dr = ImageDraw.Draw(im)

def glyph(cx, cy, rings, R=20):
    """中心からの距離帯ごとの人口増減を同心円で描く（赤=減った、青=増えた。濃いほど大きい）"""
    rad = [R * math.sqrt(x / 40) for x in (5, 10, 20, 40)]
    dr.ellipse([cx - R - 3, cy - R - 3, cx + R + 3, cy + R + 3], fill=BG)
    for i in reversed(range(4)):
        v = rings[i]["p20"] / rings[i]["p00"] - 1
        t = min(abs(v) / 0.5, 1) ** 0.6
        c = RED if v < 0 else BLUE
        col = tuple(int(BG[k] + (c[k] - BG[k]) * (0.3 + 0.7 * t)) for k in range(3))
        dr.ellipse([cx - rad[i], cy - rad[i], cx + rad[i], cy + rad[i]], fill=col, outline=BG)

for k, p in enumerate(P):
    x = M + (k % COLS) * (T + G)
    y = TOP + (k // COLS) * (T + LAB + G)
    im.paste(Image.open(WEB / f"built/{p['rank']}.png").resize((T, T), Image.NEAREST), (x, y))
    if p["donut"]:
        dr.rectangle([x - 3, y - 3, x + T + 2, y + T + 2], outline=RED, width=3)
        dr.rounded_rectangle([x + 4, y + 4, x + 70, y + 24], radius=10, fill=RED)
        dr.text((x + 37, y + 14), "ドーナツ", font=FT(12, True), fill=BG, anchor="mm")
    glyph(x + T - 25, y + T - 25, json.loads(p["rings"]))
    pc = (p["pop20"] / p["pop00"] - 1) * 100
    bc = (p["built20"] / p["built00"] - 1) * 100
    dr.text((x, y + T + 4), p["name"], font=FT(14, True), fill=(232, 232, 234))
    dr.text((x, y + T + 22), f"人口 {pc:+.0f}%　建物 {bc:+.0f}%", font=FT(12), fill=(154, 156, 163))

# 見出しと凡例
dr.text((M, 24), "都市はどう広がったか（2000→2020）", font=FT(40, True), fill=(232, 232, 234))
dr.text((M, 80), "世界の人口上位の都市圏97、中心から40km四方。左上ほど、人口の伸びより建物の広がりが速い。", font=FT(16), fill=(200, 201, 206))
ly = 128
dr.rectangle([M, ly, M + 22, ly + 22], fill=GREY)
dr.text((M + 30, ly + 11), "2000年にあった建物", font=FT(15), fill=(200, 201, 206), anchor="lm")
lx = M + 210
dr.rectangle([lx, ly, lx + 22, ly + 22], fill=ORANGE)
dr.text((lx + 30, ly + 11), "その後20年で増えた建物", font=FT(15), fill=(200, 201, 206), anchor="lm")
lx += 260
sample = [{"p00": 100, "p20": 80}, {"p00": 100, "p20": 95}, {"p00": 100, "p20": 115}, {"p00": 100, "p20": 140}]
glyph(lx + 20, ly + 11, sample)
t = "中心からの距離ごとの人口（内から0-5・5-10・10-20・20-40km）赤＝減った・青＝増えた"
dr.text((lx + 50, ly + 11), t, font=FT(15), fill=(200, 201, 206), anchor="lm")
lx += 50 + int(dr.textlength(t, font=FT(15))) + 40
dr.rectangle([lx, ly - 2, lx + 26, ly + 24], outline=RED, width=3)
dr.text((lx + 36, ly + 11), "ドーナツ（中心5kmの人口が5%以上減った）", font=FT(15), fill=(200, 201, 206), anchor="lm")

dr.text((W - M, H - 30),
        "出典: GHSL（European Commission, JRC）GHS-POP・GHS-BUILT-S R2023A（CC BY 4.0）を加工して作成／都市: Natural Earth　#30DayMapChallenge Day 9 Urban-rural",
        font=FT(13), fill=(154, 156, 163), anchor="ra")
im.save(ROOT / "output/day09-urban-rural.png", optimize=True)
print(im.size)
