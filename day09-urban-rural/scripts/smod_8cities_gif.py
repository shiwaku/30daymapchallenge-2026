"""投稿用の GIF。8都市の 120km 四方を、GHS-SMOD（1km マスごとの都市〜農村の段階）で 1975→2020 年の5年ごとに動かす。
上の段は SMOD の都市中心のマスが大きく増えた都市、下の段はあまり変わらなかった都市（1975→2020 の都市中心のマス数で選んだ）。
大阪は SMOD ではほぼ変わらないが、DID は +44% 広がっていた（README「GHS-SMOD と人口集中地区（DID）の突き合わせ」）ので外した。

入力: data/ghsl/GHS_SMOD_E{年}_GLOBE_R2023A_54009_1000_V2_0.tif, data/web/cities.geojson
出力: output/day09-smod-8cities.gif（と確認用の最初・最後のコマの PNG）
"""
from pathlib import Path
import json
import numpy as np, rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ROWS = [("1975→2020年に大きく変わった", ["東莞", "ダッカ", "上海", "カイロ"]),
        ("あまり変わらなかった", ["東京", "ニューヨーク", "ロンドン", "ベルリン"])]
COUNTRY = {"東莞": "中国", "ダッカ": "バングラデシュ", "上海": "中国", "カイロ": "エジプト",
           "東京": "日本", "ニューヨーク": "アメリカ", "ロンドン": "イギリス", "ベルリン": "ドイツ"}
YEARS = range(1975, 2021, 5)
HALF = 60_000
CL = {10: "#24597d", 11: "#1c201e", 12: "#27382c", 13: "#3f6142", 21: "#8c6b3c", 22: "#c98b3e", 23: "#f0b55a", 30: "#fff0c8"}
NM = [(11, "ごく低密度の農村"), (12, "低密度の農村"), (13, "農村の集落"), (21, "郊外"), (22, "やや密な都市集落"), (23, "密な都市集落"), (30, "都市中心"), (10, "水域")]
lut = np.zeros((256, 3), np.uint8)
for v, c in CL.items():
    lut[v] = [int(c[i:i + 2], 16) for i in (1, 3, 5)]

pts = {f["properties"]["name"]: f["geometry"]["coordinates"]
       for f in json.loads((ROOT / "data/web/cities.geojson").read_text(encoding="utf-8"))["features"]}
tr = Transformer.from_crs(4326, "ESRI:54009", always_xy=True)

FT = lambda s, b=False: ImageFont.truetype(f"C:/Windows/Fonts/{'YuGothB' if b else 'YuGothM'}.ttc", s)
BG, FG, SUB, MUTE = (11, 13, 18), (232, 232, 234), (200, 201, 206), (140, 142, 150)
T, G, M, TOP, ROWH, LAB = 360, 16, 28, 150, 34, 42
W = M * 2 + 4 * T + 3 * G
H = TOP + 2 * (ROWH + T + LAB) + 20 + 110

frames = []
for yr in YEARS:
    im = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(im)
    with rasterio.open(ROOT / f"data/ghsl/GHS_SMOD_E{yr}_GLOBE_R2023A_54009_1000_V2_0.tif") as r:
        for i, (title, names) in enumerate(ROWS):
            y0 = TOP + i * (ROWH + T + LAB + 20)
            dr.text((M, y0 + 4), title, font=FT(20, True), fill=SUB)
            for j, n in enumerate(names):
                x, y = tr.transform(*pts[n])
                a = r.read(1, window=from_bounds(x - HALF, y - HALF, x + HALF, y + HALF, r.transform), boundless=True, fill_value=10)
                a = np.clip(a, 0, 255).astype(np.uint8)
                px, py = M + j * (T + G), y0 + ROWH
                im.paste(Image.fromarray(lut[a]).resize((T, T), Image.NEAREST), (px, py))
                dr.text((px, py + T + 8), n, font=FT(20, True), fill=FG)
                dr.text((px + dr.textlength(n, font=FT(20, True)) + 10, py + T + 12), COUNTRY[n], font=FT(15), fill=MUTE)
    dr.text((M, 22), "都市か農村か（1975→2020）", font=FT(40, True), fill=FG)
    dr.text((W - M, 18), str(yr), font=FT(64, True), fill=FG, anchor="ra")
    dr.text((M, 84), "各都市の中心から上下左右60km（120km四方）。1km マスごとの都市〜農村の段階（GHS-SMOD）。", font=FT(17), fill=SUB)
    dr.text((M, 110), "人口密度と建物の広がりから決めた区分。日本では、広がりが人口集中地区（DID）より小さく出る。", font=FT(15), fill=MUTE)
    lx, ly = M, H - 100
    for v, t in NM:
        dr.rectangle([lx, ly, lx + 20, ly + 16], fill=CL[v], outline=(90, 92, 100))
        dr.text((lx + 28, ly + 8), t, font=FT(15), fill=SUB, anchor="lm")
        lx += 28 + int(dr.textlength(t, font=FT(15))) + 26
    dr.text((M, H - 64), "衛星で観測した年は1975・1990・2000・2014・2018年。ほかの年は GHSL が補間した推計。", font=FT(14), fill=MUTE)
    dr.text((W - M, H - 34), "出典: GHSL（European Commission, JRC）GHS-SMOD R2023A（1kmマス、CC BY 4.0）を加工して作成／都市の点: Natural Earth　#30DayMapChallenge Day 9 Urban-rural",
            font=FT(13), fill=MUTE, anchor="ra")
    frames.append(im)

out = ROOT / "output"
dur = [700] * len(frames)
dur[0], dur[-1] = 1500, 3000
frames[0].save(out / "day09-smod-8cities.gif", save_all=True, append_images=frames[1:], duration=dur, loop=0, optimize=True)
frames[0].save(out / "day09-smod-8cities_1975.png")
frames[-1].save(out / "day09-smod-8cities_2020.png")
print(W, H, (out / "day09-smod-8cities.gif").stat().st_size)
