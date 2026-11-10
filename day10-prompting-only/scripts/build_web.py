"""Web 版（MapLibre + deck.gl）のデータを作る。

入力（data/、Git 管理外）:
  tokyo_gairoju.csv  東京都建設局「都道の街路樹（23区）」CSV（Shift_JIS）
  jma_013.csv        気象庁 生物季節観測 累年値 いちょうの黄葉（Shift_JIS）
  jma_014.csv        同 いちょうの落葉

出力（web/）:
  trees.bin   点の並び。先頭にイチョウ、続いてその他。Float32 の [経度, 緯度] を交互に並べる
  meta.json   イチョウの本数・全体の本数・範囲
  phenology.json  日ごとの「その日までに黄葉（落葉）した年の数」（東京、1991〜2020年）

使い方: python -I day10-prompting-only/scripts/build_web.py
"""

import csv
import datetime as dt
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
WEB = ROOT / "web"

SPECIES = "イチョウ"
TOKYO = "662"  # 気象庁の地点番号（東京）
YEARS = range(1991, 2021)  # 平年値と同じ30年
START, END = dt.date(2001, 10, 15), dt.date(2001, 12, 15)  # 年はダミー（月日だけ使う）


def read_trees():
    ginkgo, others = [], []
    with open(DATA / "tokyo_gairoju.csv", encoding="cp932", newline="") as f:
        for row in csv.DictReader(f):
            try:
                lon, lat = float(row["経度"]), float(row["緯度"])
            except (ValueError, KeyError):
                continue
            (ginkgo if row["樹種"] == SPECIES else others).append((lon, lat))
    return ginkgo, others


def read_jma(name):
    with open(DATA / name, encoding="cp932") as f:
        lines = f.read().splitlines()
    hdr = lines[1].split(",")
    row = next(l for l in lines if l.startswith(TOKYO + ",")).split(",")
    out = {}
    for i, h in enumerate(hdr):
        if h.isdigit() and int(h) in YEARS and row[i] not in ("", "0"):
            v = row[i]
            out[int(h)] = dt.date(2001, int(v[:-2]), int(v[-2:]))
    if len(out) != len(YEARS):
        sys.exit(f"{name}: {len(YEARS)}年分そろっていない（{len(out)}年）")
    return out


def main():
    WEB.mkdir(exist_ok=True)
    ginkgo, others = read_trees()
    pts = ginkgo + others
    with open(WEB / "trees.bin", "wb") as f:
        for lon, lat in pts:
            f.write(struct.pack("<ff", lon, lat))
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    meta = {
        "ginkgo": len(ginkgo),
        "total": len(pts),
        "bounds": [[min(lons), min(lats)], [max(lons), max(lats)]],
    }
    (WEB / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    yellow, fall = read_jma("jma_013.csv"), read_jma("jma_014.csv")
    days = []
    d = START
    while d <= END:
        days.append({
            "md": d.strftime("%m-%d"),
            "y": sum(v <= d for v in yellow.values()),
            "f": sum(v <= d for v in fall.values()),
        })
        d += dt.timedelta(days=1)
    pheno = {
        "station": "東京（北の丸公園の標本木）",
        "years": [YEARS.start, YEARS.stop - 1],
        "n": len(YEARS),
        "days": days,
    }
    (WEB / "phenology.json").write_text(json.dumps(pheno, ensure_ascii=False), encoding="utf-8")
    print(f"イチョウ {len(ginkgo):,} 本 / 全 {len(pts):,} 本、{len(days)} 日")


if __name__ == "__main__":
    main()
