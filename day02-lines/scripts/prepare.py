"""gtfs-gis.jp 全国鉄道運行本数データ（区間別）を、ビューワで読む軽い GeoJSON にする。

使い方: python -I scripts/prepare.py data/raw/unkohonsu2026_kukan.geojson data/kukan2026.geojson

やること（値は変えない）:
- geometry.type の大文字（LINESTRING）を GeoJSON 標準の LineString に直す
- 列名を短くする。本数の列名は版によらず …2024 なので、名前の先頭で探す
- n = 順方向と逆方向の平均（片道あたりの1日の本数）を足す
- 座標を小数5桁（約1m）に丸める
"""

import json
import sys


def main(src: str, dst: str) -> None:
    with open(src, encoding="utf-8") as f:
        fc = json.load(f)

    features = []
    for i, feat in enumerate(fc["features"]):
        p = feat["properties"]
        fw = next(v for k, v in p.items() if k.startswith("順方向運行本数"))
        rv = next(v for k, v in p.items() if k.startswith("逆方向運行本数"))
        coords = [[round(x, 5), round(y, 5)] for x, y in feat["geometry"]["coordinates"]]
        features.append({
            "type": "Feature",
            "id": i,
            "properties": {
                "op": p["事業者名"],
                "line": p["路線名"],
                "a": p["起点駅"],
                "b": p["終点駅"],
                "fw": fw,
                "rv": rv,
                "n": (fw + rv) / 2,
                "km": p["営業キロ"],
            },
            "geometry": {"type": "LineString", "coordinates": coords},
        })

    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(features)} sections -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
