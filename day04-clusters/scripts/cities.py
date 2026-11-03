"""市の面（国土数値情報 行政区域 N03）と、その中の店の数（チェーン別）を作る。

使い方:
    python -I -X utf8 scripts/cities.py data/raw data-web/cities.geojson 川越市=data/N03-20250101_11.geojson 札幌市=data/N03-20250101_01.geojson

入力:
    data/raw/<spider>.geojson   All the Places の店舗（Git 管理外。scripts/prepare.py と同じ）
    N03 の GeoJSON              国土数値情報 行政区域 2025年（N03_004 が市の名前。政令市は区ごとの面をまとめる）
出力: data-web/cities.geojson  市の面。properties:
    name  市の名前
    k     チェーンごとの店の数（並びは scripts/prepare.py の CHAINS）。境界の中にある店を数える
    bbox  表示する範囲 [西, 南, 東, 北]
    fine  約2km²のセルに分けた、約8km²のセル（解像度 11）の ID
出力: data-web/a5-r12-cities.geojson  市にかかる約8km²のセルを、約2km²のセル（解像度 12）に分けて数えたもの。
    市の外の店も、そのセルに入っていれば数える。properties は a5-r11.geojson と同じ
約2km²にするのは市の中だけ。全国では店が1店だけのセルが48%になるが、川越市は33%・札幌市は15%で、
全国の約8km²のセル（35%）を超えないため。公開するのはセルごとの店の数だけで、店の点は出さない
"""

import json
import sys
from pathlib import Path

import a5
import shapely

sys.path.insert(0, str(Path(__file__).parent))
from prepare import CHAINS  # noqa: E402


def main(raw: Path, out: Path, specs: list[str]) -> None:
    pts, chain = [], []
    for i, c in enumerate(CHAINS):
        for f in json.loads((raw / f"{c['spider']}.geojson").read_text(encoding="utf-8"))["features"]:
            if f.get("geometry"):
                pts.append(shapely.Point(f["geometry"]["coordinates"][:2]))
                chain.append(i)
    tree = shapely.STRtree(pts)
    feats = []
    fine: set[int] = set()
    for spec in specs:
        name, src = spec.split("=", 1)
        fc = json.loads(Path(src).read_text(encoding="utf-8"))
        g = shapely.union_all([shapely.geometry.shape(f["geometry"]) for f in fc["features"] if f["properties"].get("N03_004") == name])
        k = [0] * len(CHAINS)
        for j in tree.query(g, predicate="contains"):
            k[chain[j]] += 1
        # 市にかかる約8km²のセル（市の境界から 200m 以内に店があるセル）
        parents = {a5.lonlat_to_cell((pts[j].x, pts[j].y), 11) for j in tree.query(g.buffer(0.002), predicate="contains")}
        fine |= parents
        bbox = [round(v, 4) for v in g.bounds]
        g = shapely.set_precision(shapely.simplify(g, 0.0003), 1e-5)
        feats.append({"type": "Feature", "properties": {"name": name, "k": k, "bbox": bbox, "fine": sorted(a5.u64_to_hex(c) for c in parents)}, "geometry": json.loads(shapely.to_geojson(g))})
        print(name, sum(k), k, bbox)
    write(out, feats)
    # 約2km²のセル: fine のセルに入る店を数える
    cells: dict[int, list[int]] = {}
    for p, ci in zip(pts, chain):
        c12 = a5.lonlat_to_cell((p.x, p.y), 12)
        if a5.cell_to_parent(c12, 11) in fine:
            cells.setdefault(c12, [0] * len(CHAINS))[ci] += 1
    r12 = []
    for c, k in cells.items():
        ring = [[round(x, 5), round(y, 5)] for x, y in a5.cell_to_boundary(c)]
        r12.append({"type": "Feature", "properties": {"i": a5.u64_to_hex(c), "k": k, "n": sum(k)}, "geometry": {"type": "Polygon", "coordinates": [ring]}})
    write(out.parent / "a5-r12-cities.geojson", r12)
    print("r12", len(r12), "cells, 1店", sum(1 for f in r12 if f["properties"]["n"] == 1))


def write(p: Path, feats: list) -> None:
    p.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(p, p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:])
