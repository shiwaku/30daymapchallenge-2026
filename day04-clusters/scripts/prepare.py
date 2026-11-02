"""All the Places のコンビニ各社の店舗から、縄張り（いちばん近い店がどのチェーンか）の面と集計値を作る。

使い方:
    python -I -X utf8 scripts/prepare.py data/raw data-web

入力: data/raw/<spider>.geojson（All the Places 2026-10-24 実行分の出力。CC0）
出力:
    data-web/stores.json        店舗の点（[経度, 緯度, チェーン番号] の配列）
    data-web/territory.geojson  チェーンごとの縄張り（ボロノイ図を店から R km の円で切り、チェーンごとにまとめた面）
    data-web/grid.json          全国を見るときの格子（格子ごとに店がいちばん多いチェーン）
    data-web/stats.json         店舗数・隣の店が同じチェーンの割合・都道府県ごとの店舗数・縄張りの面積
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import shapely
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
# 縄張りの面は、店から R m より遠いところは描かない（店のない山や海を塗らない）
R = 2500
# 面を軽くするための単純化（m）
SIMPLIFY = 120
# 全国を見るときの格子（m）。格子ごとに、店がいちばん多いチェーンと、その割合を出す
GRID = 12000
PREF = re.compile(r"^(北海道|東京都|大阪府|京都府|.{2,3}?県)")

# 日本全体を面積の比が保たれる図法で扱う（アルベルス正積円錐図法）
AEA = "+proj=aea +lat_0=36 +lat_1=30 +lat_2=42 +lon_0=137 +datum=WGS84 +units=m"
to_m = Transformer.from_crs("EPSG:4326", AEA, always_xy=True)
to_ll = Transformer.from_crs(AEA, "EPSG:4326", always_xy=True)


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
    lon, lat, chain = np.array(lon), np.array(lat), np.array(chain)
    x, y = to_m.transform(lon, lat)
    xy = np.column_stack([x, y])
    N = len(chain)

    # 隣の店（いちばん近い別の店）が同じチェーンの割合。チェーンを無作為に入れ替えたときの期待値（n-1)/(N-1) と比べる
    _, idx = cKDTree(xy).query(xy, k=2)
    same = chain[idx[:, 1]] == chain
    for i, c in enumerate(CHAINS):
        k = chain == i
        c["sameNeighbor"] = float(same[k].mean())
        c["expected"] = float((k.sum() - 1) / (N - 1))

    # 都道府県ごとの店舗数（住所の先頭から都道府県名を取る）。
    # 住所が市から始まる店（都道府県名がない店）は、都道府県名の分かるいちばん近い店と同じ都道府県とする
    pref = np.array(pref, dtype=object)
    unknown = pref == ""
    known = np.flatnonzero(~unknown)
    _, near = cKDTree(xy[known]).query(xy[unknown])
    pref[unknown] = pref[known][near]
    prefs: dict[str, list[int]] = {}
    for p, ci in zip(pref, chain):
        prefs.setdefault(p, [0] * len(CHAINS))[ci] += 1

    # 縄張り: 全店のボロノイ図（いちばん近い店が同じになる範囲）を、店から R m の円で切る
    pts = shapely.points(xy)
    # 同じ座標の店は1つにまとめる（どちらのチェーンを残すかは先に読んだほう）
    _, first = np.unique(np.round(xy, 1), axis=0, return_index=True)
    first = np.sort(first)
    cells = shapely.get_parts(shapely.voronoi_polygons(shapely.multipoints(pts[first])))
    # セルと店の対応を、セルに含まれる店で取る
    tree = shapely.STRtree(pts[first])
    ci_, pi_ = tree.query(cells, predicate="contains")
    cell_chain = np.full(len(cells), -1)
    cell_chain[ci_] = chain[first][pi_]
    circles = shapely.buffer(pts[first][pi_], R, quad_segs=6)
    clipped = shapely.intersection(cells[ci_], circles)

    feats = []
    for i, c in enumerate(CHAINS):
        part = clipped[cell_chain[ci_] == i]
        u = shapely.union_all(part)
        c["areaKm2"] = float(u.area / 1e6)
        u = shapely.simplify(u, SIMPLIFY, preserve_topology=True)
        u = shapely.transform(u, lambda a: np.column_stack(to_ll.transform(a[:, 0], a[:, 1])))
        u = shapely.set_precision(u, 1e-5)
        feats.append({"type": "Feature", "properties": {"c": i}, "geometry": json.loads(shapely.to_geojson(u))})
        print(c["name"], f"{c['areaKm2']:.0f} km2")
    write(out / "territory.geojson", {"type": "FeatureCollection", "features": feats})

    stats = {
        "run": "2026-10-24-13-32-37",
        "radiusM": R,
        "total": int(N),
        "unknownPref": int(unknown.sum()),
        "chains": CHAINS,
        "prefs": prefs,
    }
    # 格子ごとの集計。点は格子の中心に置く（[経度, 緯度, 店がいちばん多いチェーン, 店の数, そのチェーンの割合]）
    gx, gy = np.floor(x / GRID).astype(int), np.floor(y / GRID).astype(int)
    cells_: dict[tuple[int, int], np.ndarray] = {}
    for a, b, ci in zip(gx, gy, chain):
        cells_.setdefault((a, b), np.zeros(len(CHAINS), int))[ci] += 1
    grid = []
    for (a, b), v in cells_.items():
        cx, cy = to_ll.transform((a + 0.5) * GRID, (b + 0.5) * GRID)
        top = int(v.argmax())
        # 同数のときは、どのチェーンとも決めない（-1）
        if (v == v[top]).sum() > 1:
            top = -1
        grid.append([round(cx, 4), round(cy, 4), top, int(v.sum()), round(float(v.max() / v.sum()), 3)])
    write(out / "grid.json", grid)
    stats["gridM"] = GRID
    stats["gridTop"] = [sum(1 for g in grid if g[2] == i) for i in range(len(CHAINS))]
    stats["gridCells"] = len(grid)
    write(out / "stats.json", stats)

    # 店舗の点は軽くするため [経度, 緯度, チェーン番号] の配列で書く（ビューワで GeoJSON に戻す）
    write(out / "stores.json", [[round(a, 5), round(b, 5), int(ci)] for a, b, ci in zip(lon, lat, chain)])



def write(p: Path, obj) -> None:
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(p, p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
