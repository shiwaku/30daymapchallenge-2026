# -*- coding: utf-8 -*-
"""QGIS で描いたコマの出典の行を描き直し、首都圏版→23区版の順に1本の mp4 と GIF にする。

使い方: python fix_credit_and_video.py <region_frames_dir> <23ku_frames_dir> <out_dir> [night]
night を付けると、夜景版（主要駅・鉄道線入り）の出典で描き、ファイル名に _night を付ける。
"""
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

LINES_DAY = [
    "出典：政府統計の総合窓口(e-Stat) 東京都市圏パーソントリップ調査 平成30年度 表b-4 を加工して作成",
    "ゾーン：東京都市圏交通計画協議会ホームページ（H30_gis）を加工して作成 / 背景：地理院地図",
]
LINES_NIGHT = [
    "出典：政府統計の総合窓口(e-Stat) 東京都市圏パーソントリップ調査 平成30年度 表b-4 を加工して作成",
    "ゾーン：東京都市圏交通計画協議会ホームページ（H30_gis）、駅：国土数値情報（駅別乗降客数データ）を加工して作成",
    "駅の英語名：© OpenStreetMap contributors / 鉄道線：地理院タイル（ベクトルタイル）",
]
LINES = LINES_DAY
FONT = ImageFont.truetype(r"C:\Windows\Fonts\meiryo.ttc", 11)
DUR = [1.4] + [0.7] * 24 + [1.4]  # 元の GIF と同じ（最初と最後は2倍）


def fix(img):
    img = img.convert("RGB")
    nl = len(LINES)
    d = ImageDraw.Draw(img)
    w, h = img.size
    tw = max(d.textlength(s, font=FONT) for s in LINES)
    # 元の出典の箱（y 853–873, x 463–961）を覆う
    x0 = min(w - tw - 18, 455)
    d.rectangle((x0, h - 6 - 18 * nl, w - 6, h - 3), fill=(255, 255, 255))
    for k, s in enumerate(LINES):
        d.text((w - 12 - d.textlength(s, font=FONT), h - 3 - 18 * nl + k * 18), s, font=FONT, fill=(85, 85, 85))
    return img


def main(reg, ku, out, mode="day"):
    global LINES
    LINES = LINES_NIGHT if mode == "night" else LINES_DAY
    sfx = "_night" if mode == "night" else ""
    tmp = os.path.join(out, "frames" + sfx)
    os.makedirs(tmp, exist_ok=True)
    listing, gif_frames = [], {}
    n = 0
    for name, src in (("region", reg), ("23ku", ku)):
        gif_frames[name] = []
        for i in range(26):
            im = fix(Image.open(os.path.join(src, f"frame_{i:02d}.png")))
            p = os.path.join(tmp, f"{n:03d}.png")
            im.save(p)
            gif_frames[name].append(im)
            listing.append(f"file '{os.path.basename(p)}'\nduration {DUR[i]}")
            n += 1
    listing.append(f"file '{os.path.basename(p)}'")
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w", encoding="utf-8") as f:
        f.write("\n".join(listing) + "\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt",
                    "-vf", "scale=968:878:flags=lanczos,format=yuv420p", "-r", "30",
                    "-c:v", "libx264", "-crf", "18", "-movflags", "+faststart",
                    os.path.abspath(os.path.join(out, f"day03-pt-stay{sfx}.mp4")).replace("\\", "/")], check=True, cwd=tmp)
    for name, fr in gif_frames.items():
        fr[0].save(os.path.join(out, f"pt_stay_{name}{sfx}.gif"), save_all=True, append_images=fr[1:],
                   duration=[int(x * 1000) for x in DUR], loop=0, optimize=True)
        fr[11].save(os.path.join(out, f"pt_stay_{name}{sfx}_13h.png"))


if __name__ == "__main__":
    main(*sys.argv[1:5])
