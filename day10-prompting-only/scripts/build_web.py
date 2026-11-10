"""Web 版（MapLibre + deck.gl）のデータを作る。

入力（data/、Git 管理外）:
  tokyo_gairoju.csv  東京都建設局「都道の街路樹（23区）」CSV（Shift_JIS）
  jma_013.csv        気象庁 生物季節観測 累年値 いちょうの黄葉（Shift_JIS）
  jma_014.csv        同 いちょうの落葉

出力（web/）:
  trees.bin   点の並び。先頭にイチョウ、続いてその他。Float32 の [経度, 緯度] を交互に並べる
  meta.json   イチョウの本数・全体の本数・範囲
  phenology.json  日ごとの「その日までに黄葉（落葉）した年の数」（東京、1991〜2020年）
  roads.json  通称道路名ごとのイチョウの本数と、イチョウがいちばん密に並ぶ地点（半径 RADIUS m に入る本数が最多の木）

使い方: python -I day10-prompting-only/scripts/build_web.py
"""

import csv
import math
from collections import Counter, defaultdict
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
RADIUS = 250  # 密な地点を探す半径（m）
MIN_TREES = 100  # 一覧に出す通りの最少本数
START, END = dt.date(2001, 10, 15), dt.date(2001, 12, 15)  # 年はダミー（月日だけ使う）


def read_trees():
    ginkgo, others = [], []
    by_road = defaultdict(list)  # 通称道路名 → イチョウの (経度, 緯度, 区)
    all_by_road = Counter()  # 通称道路名 → 全樹種の本数
    with open(DATA / "tokyo_gairoju.csv", encoding="cp932", newline="") as f:
        for row in csv.DictReader(f):
            try:
                lon, lat = float(row["経度"]), float(row["緯度"])
            except (ValueError, KeyError):
                continue
            name = (row.get("通称道路名") or "").strip()
            if name:
                all_by_road[name] += 1
            if row["樹種"] == SPECIES:
                ginkgo.append((lon, lat))
                if name:
                    by_road[name].append((lon, lat, row["行政区"]))
            else:
                others.append((lon, lat))
    return ginkgo, others, by_road, all_by_road


def densest(pts):
    """半径 RADIUS m に入るイチョウが最も多い木を返す（本数も）"""
    lat0 = sum(p[1] for p in pts) / len(pts)
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
    xy = [(p[0] * kx, p[1] * ky) for p in pts]
    r2 = RADIUS * RADIUS
    best, best_n = 0, -1
    for i, (x, y) in enumerate(xy):
        n = sum(1 for (u, v) in xy if (u - x) ** 2 + (v - y) ** 2 <= r2)
        if n > best_n:
            best, best_n = i, n
    return pts[best], best_n


def roads(by_road, all_by_road):
    out = []
    for name, pts in by_road.items():
        if len(pts) < MIN_TREES:
            continue
        spot, near = densest(pts)
        wards = [w for w, _ in Counter(p[2] for p in pts).most_common()]
        out.append({
            "name": name,
            "n": len(pts),
            "share": round(len(pts) / all_by_road[name], 3),
            "wards": wards,
            "spot": [round(spot[0], 6), round(spot[1], 6)],
            "spotWard": spot[2],
            "near": near,
        })
    out.sort(key=lambda r: -r["n"])
    return out


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
    ginkgo, others, by_road, all_by_road = read_trees()
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
    rs = roads(by_road, all_by_road)
    (WEB / "roads.json").write_text(json.dumps({"radius": RADIUS, "roads": rs}, ensure_ascii=False), encoding="utf-8")
    print(f"通り {len(rs)} 本（イチョウ {MIN_TREES} 本以上）")
    print(f"イチョウ {len(ginkgo):,} 本 / 全 {len(pts):,} 本、{len(days)} 日")


if __name__ == "__main__":
    main()
