"""投稿用の1枚画像。97都市の建物の広がり（data/web/built/*.png）を、建物の面積が伸びた順に並べる。
人口は載せない（GHS-POP が日本の2都市で国勢調査と逆の向きだったため。scripts/check_census.py）。

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

grow = lambda p: p["built20"] / p["built00"] - 1
P.sort(key=grow, reverse=True)

FT = lambda s, b=False: ImageFont.truetype(f"C:/Windows/Fonts/{'YuGothB' if b else 'YuGothM'}.ttc", s)
BG = (11, 13, 18)
ORANGE, GREY = (255, 140, 38), (199, 204, 214)
T, G, LAB, COLS, M, TOP, BOT = 150, 14, 38, 10, 32, 190, 56
rows = math.ceil(len(P) / COLS)
W = M * 2 + COLS * T + (COLS - 1) * G
H = TOP + rows * (T + LAB) + (rows - 1) * G + BOT
im = Image.new("RGB", (W, H), BG)
dr = ImageDraw.Draw(im)

for k, p in enumerate(P):
    x = M + (k % COLS) * (T + G)
    y = TOP + (k // COLS) * (T + LAB + G)
    im.paste(Image.open(WEB / f"built/{p['rank']}.png").resize((T, T), Image.NEAREST), (x, y))
    bc = grow(p) * 100
    dr.text((x, y + T + 4), p["name"], font=FT(14, True), fill=(232, 232, 234))
    dr.text((x, y + T + 22), f"{bc:+.0f}%　{p['built00']:.0f}→{p['built20']:.0f} km²", font=FT(12), fill=(154, 156, 163))

# 見出しと凡例
dr.text((M, 24), "都市はどう広がったか（2000→2020）", font=FT(40, True), fill=(232, 232, 234))
dr.text((M, 80), "世界の人口上位の都市圏97、中心から上下左右40km（80km四方）の建物。左上から、建物の面積（km²）が大きく伸びた順。", font=FT(16), fill=(200, 201, 206))
ly = 128
dr.rectangle([M, ly, M + 22, ly + 22], fill=GREY)
dr.text((M + 30, ly + 11), "2000年にあった建物", font=FT(15), fill=(200, 201, 206), anchor="lm")
lx = M + 210
dr.rectangle([lx, ly, lx + 22, ly + 22], fill=ORANGE)
dr.text((lx + 30, ly + 11), "その後20年で増えた建物", font=FT(15), fill=(200, 201, 206), anchor="lm")

dr.text((W - M, H - 30),
        "出典: GHSL（European Commission, JRC）GHS-BUILT-S R2023A（1kmマス、CC BY 4.0）を加工して作成／都市と順位: Natural Earth　#30DayMapChallenge Day 9 Urban-rural",
        font=FT(13), fill=(154, 156, 163), anchor="ra")
im.save(ROOT / "output/day09-urban-rural.png", optimize=True)
print(im.size)
