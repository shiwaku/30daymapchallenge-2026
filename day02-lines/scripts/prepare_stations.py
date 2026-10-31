"""gtfs-gis.jp 全国鉄道運行本数データ（事業者別・駅別）を、ビューワで読む駅の GeoJSON にする。

使い方: python -I scripts/prepare_stations.py data/raw/unkohonsu2026_eki.geojson data/stations2026.geojson

やること（値は変えない）:
- 同じ名前で 500m 以内にある駅（事業者ごとに分かれている）を1つにまとめ、位置は平均をとる
- 乗り入れる事業者の数を持たせる（ビューワで、3社以上の駅をターミナル駅として区別する）
- 座標を小数5桁（約1m）に丸める
"""

import json
import math
import sys

MERGE_M = 500


def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    dx = (a[0] - b[0]) * 111_320 * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * 110_540
    return math.hypot(dx, dy)


def main(src: str, dst: str) -> None:
    with open(src, encoding="utf-8") as f:
        fc = json.load(f)

    groups: list[dict] = []
    by_name: dict[str, list[dict]] = {}
    for feat in fc["features"]:
        p = feat["properties"]
        name = p["駅名"]
        xy = tuple(feat["geometry"]["coordinates"][:2])
        g = next((g for g in by_name.get(name, []) if dist_m(g["xy"][0], xy) <= MERGE_M), None)
        if g is None:
            g = {"name": name, "xy": [], "ops": set()}
            groups.append(g)
            by_name.setdefault(name, []).append(g)
        g["xy"].append(xy)
        g["ops"].add(p["事業者名"])

    features = []
    for i, g in enumerate(groups):
        x = sum(p[0] for p in g["xy"]) / len(g["xy"])
        y = sum(p[1] for p in g["xy"]) / len(g["xy"])
        features.append({
            "type": "Feature",
            "id": i,
            "properties": {"name": g["name"], "ops": len(g["ops"])},
            "geometry": {"type": "Point", "coordinates": [round(x, 5), round(y, 5)]},
        })

    with open(dst, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(fc['features'])} stations (per operator) -> {len(features)}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
