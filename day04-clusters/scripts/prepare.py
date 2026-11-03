"""All the Places のコンビニ各社の店舗を、A5（面積の等しい五角形の格子）のセルごとに数える。

公開するのはセルごとの店の数だけ。店の点・住所・名前は出力しない（data/ に置いた取得データは Git 管理外）。

使い方:
    python -I -X utf8 scripts/prepare.py data/raw data-web

入力: data/raw/<spider>.geojson（All the Places 2026-10-24 実行分の出力）
出力:
    data-web/a5-r<N>.geojson  解像度 N の A5 セル（五角形）。properties: k = チェーンごとの店の数、n = 合計
    data-web/stats.json       店舗数・隣の店が同じチェーンの割合・都道府県ごとの店舗数・セルの集計
"""

import json
import re
import sys
from pathlib import Path

import a5
import numpy as np
from pyproj import Transformer
from scipy.spatial import cKDTree

# 並びは凡例の順。spider はファイル名、name は表示名
CHAINS = [
    {"id": "seven", "spider": "seven_eleven_jp", "name": "セブン-イレブン"},
    {"id": "family", "spider": "familymart_jp", "name": "ファミリーマート"},
    {"id": "lawson", "spider": "lawson_jp", "name": "ローソン"},
    {"id": "ministop", "spider": "ministop_jp", "name": "ミニストップ"},
    {"id": "seico", "spider": "seicomart_jp", "name": "セイコーマート"},
    {"id": "yamazaki", "spider": "daily_yamazaki_jp", "name": "デイリーヤマザキ"},
    {"id": "newdays", "spider": "newdays_jp", "name": "NewDays"},
    {"id": "poplar", "spider": "poplar_jp", "name": "ポプラ・生活彩家"},
]
# A5 の解像度。9 = 約130km²、10 = 約32km²、11 = 約8km²。
# 店の位置が分かる細かさにはしない（いちばん細かいセルでも約8km²。12（約2km²）では店のあるセルの約半分が1店だけになる）
RES = [9, 10, 11]
PREF = re.compile(r"^(北海道|東京都|大阪府|京都府|.{2,3}?県)")

# 隣の店までの距離は、面積の比が保たれる図法の平面で測る（アルベルス正積円錐図法）
AEA = "+proj=aea +lat_0=36 +lat_1=30 +lat_2=42 +lon_0=137 +datum=WGS84 +units=m"
to_m = Transformer.from_crs("EPSG:4326", AEA, always_xy=True)


def main(raw: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    lon, lat, chain, pref = [], [], [], []
    for i, c in enumerate(CHAINS):
        fc = json.loads((raw / f"{c['spider']}.geojson").read_text(encoding="utf-8"))
        n = 0
        for f in fc["features"]:
            g = f.get("geometry")
            if not g:
                continue
            x, y = g["coordinates"][:2]
            m = PREF.match(f["properties"].get("addr:full") or "")
            lon.append(x)
            lat.append(y)
            chain.append(i)
            pref.append(m.group(1) if m else "")
            n += 1
        c["count"] = n
        print(c["name"], n)
    chain = np.array(chain)
    x, y = to_m.transform(np.array(lon), np.array(lat))
    xy = np.column_stack([x, y])
    N = len(chain)

    # 隣の店（いちばん近い別の店）が同じチェーンの割合。チェーンを無作為に入れ替えたときの期待値 (n-1)/(N-1) と比べる
    _, idx = cKDTree(xy).query(xy, k=2)
    same = chain[idx[:, 1]] == chain
    for i, c in enumerate(CHAINS):
        k = chain == i
        c["sameNeighbor"] = float(same[k].mean())
        c["expected"] = float((k.sum() - 1) / (N - 1))

    # 都道府県ごとの店舗数（住所の先頭から都道府県名を取る）。
    # 住所が市から始まる店は、都道府県名の分かるいちばん近い店と同じ都道府県とする
    pref = np.array(pref, dtype=object)
    unknown = pref == ""
    known = np.flatnonzero(~unknown)
    _, near = cKDTree(xy[known]).query(xy[unknown])
    pref[unknown] = pref[known][near]
    prefs: dict[str, list[int]] = {}
    for p, ci in zip(pref, chain):
        prefs.setdefault(p, [0] * len(CHAINS))[ci] += 1

    stats = {"run": "2026-10-24-13-32-37", "total": int(N), "unknownPref": int(unknown.sum()), "chains": CHAINS, "prefs": prefs, "res": {}}

    for r in RES:
        cells: dict[int, list[int]] = {}
        for a, b, ci in zip(lon, lat, chain):
            cells.setdefault(a5.lonlat_to_cell((a, b), r), [0] * len(CHAINS))[ci] += 1
        feats = []
        top = [0] * len(CHAINS)
        ties = 0
        for cell, k in cells.items():
            ring = [[round(p[0], 5), round(p[1], 5)] for p in a5.cell_to_boundary(cell)]
            feats.append({"type": "Feature", "properties": {"k": k, "n": sum(k)}, "geometry": {"type": "Polygon", "coordinates": [ring]}})
            m = max(k)
            if k.count(m) > 1:
                ties += 1
            else:
                top[k.index(m)] += 1
        write(out / f"a5-r{r}.geojson", {"type": "FeatureCollection", "features": feats})
        stats["res"][str(r)] = {"areaKm2": a5.cell_area(r) / 1e6, "cells": len(cells), "top": top, "ties": ties, "max": max(sum(k) for k in cells.values())}
        print(f"r{r}", len(cells), "cells", top, "ties", ties)
    write(out / "stats.json", stats)


def write(p: Path, obj) -> None:
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(p, p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
