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
公開するのは市ごとの店の数だけで、店の点は出さない
"""

import json
import sys
from pathlib import Path

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
    for spec in specs:
        name, src = spec.split("=", 1)
        fc = json.loads(Path(src).read_text(encoding="utf-8"))
        g = shapely.union_all([shapely.geometry.shape(f["geometry"]) for f in fc["features"] if f["properties"].get("N03_004") == name])
        k = [0] * len(CHAINS)
        for j in tree.query(g, predicate="contains"):
            k[chain[j]] += 1
        bbox = [round(v, 4) for v in g.bounds]
        g = shapely.set_precision(shapely.simplify(g, 0.0003), 1e-5)
        feats.append({"type": "Feature", "properties": {"name": name, "k": k, "bbox": bbox}, "geometry": json.loads(shapely.to_geojson(g))})
        print(name, sum(k), k, bbox)
    out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(out, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:])
