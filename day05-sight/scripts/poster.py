"""output/poster/ の画面（scripts/poster-capture.mjs）から、4つの城の「航空写真｜CS立体図」を並べたポスターを組む。

使い方: python -I -X utf8 scripts/poster.py  → output/day05-sight-poster.png
同じ範囲を左に航空写真、右に CS立体図で並べる。出典は画像の下に入れる。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path("output")
SRC = OUT / "poster"
FONT_B = "C:/Windows/Fonts/YuGothB.ttc"
FONT_M = "C:/Windows/Fonts/YuGothM.ttc"

# 画面 1600x900 で、城は (996, 450) あたりに来る（パネルの分の余白を左に取っている）
CX, CY = 996, 450
HALF_W, HALF_H = 400, 215
CASTLES = [
    ("karasawayama", "唐沢山城", "栃木県佐野市"),
    ("konosumiyama", "此隅山城", "兵庫県豊岡市"),
    ("arikoyama", "有子山城", "兵庫県豊岡市"),
    ("kagomori", "河後森城", "愛媛県松野町"),
]
W = HALF_W * 4
ROW_H = HALF_H * 2
HEAD = 190
FOOT = 120
BG = (11, 13, 18)
FG = (232, 232, 234)
SUB = (154, 156, 163)


def main() -> None:
    img = Image.new("RGB", (W, HEAD + ROW_H * len(CASTLES) + 8 * (len(CASTLES) - 1) + FOOT), BG)
    d = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FONT_B, 54)
    f_sub = ImageFont.truetype(FONT_M, 24)
    f_name = ImageFont.truetype(FONT_B, 30)
    f_place = ImageFont.truetype(FONT_M, 18)
    f_tag = ImageFont.truetype(FONT_B, 20)
    f_foot = ImageFont.truetype(FONT_M, 17)

    d.text((40, 34), "森の下の山城を見る", font=f_title, fill=FG)
    d.text((42, 110), "#30DayMapChallenge 2026 Day 5 — Senses: Sight　｜　左: 航空写真　右: CS立体図（航空レーザで測った地面の形）", font=f_sub, fill=SUB)

    box = (CX - HALF_W, CY - HALF_H, CX + HALF_W, CY + HALF_H)
    y = HEAD
    for cid, name, place in CASTLES:
        photo = Image.open(SRC / f"{cid}-photo.png").convert("RGB").crop(box)
        cs = Image.open(SRC / f"{cid}-cs.png").convert("RGB").crop(box)
        img.paste(photo, (0, y))
        img.paste(cs, (W // 2, y))
        d.line([(W // 2, y), (W // 2, y + ROW_H)], fill=(255, 255, 255), width=3)
        # 城の名前（左上）とラベル（各段の下）
        d.rounded_rectangle((16, y + 14, 16 + 22 + d.textlength(name, font=f_name) + 14 + d.textlength(place, font=f_place) + 20, y + 66), 8, fill=(11, 13, 18))
        d.text((30, y + 22), name, font=f_name, fill=FG)
        d.text((30 + d.textlength(name, font=f_name) + 14, y + 33), place, font=f_place, fill=SUB)
        for x, tag in ((W // 2 - 16, "航空写真"), (W - 16, "CS立体図")):
            tw = d.textlength(tag, font=f_tag)
            d.rounded_rectangle((x - tw - 20, y + ROW_H - 46, x, y + ROW_H - 14), 6, fill=(11, 13, 18))
            d.text((x - tw - 10, y + ROW_H - 44), tag, font=f_tag, fill=FG)
        y += ROW_H + 8

    lines = [
        "出典: CS立体図 栃木県森林資源データ（2021〜2022年度計測）、兵庫県50㎝メッシュCS立体図（xyzタイル）・兵庫県、愛媛県森林資源データ（2018年計測）（いずれも G空間情報センター）",
        "航空写真: 地理院タイル（全国最新写真（シームレス））　山頂の位置: 地理院タイル（標高タイル）　城の解説: 文化遺産オンライン（文化庁）",
        "https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/",
    ]
    for i, t in enumerate(lines):
        d.text((40, y + 14 + i * 30), t, font=f_foot, fill=SUB if i < 2 else FG)
    out = OUT / "day05-sight-poster.png"
    img.save(out)
    print(out, img.size)


if __name__ == "__main__":
    main()
