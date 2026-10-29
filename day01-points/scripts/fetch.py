"""ODPT の GBFS からシェアサイクルのステーションを取得し、1つの GeoJSON にまとめる。

使い方: python -I scripts/fetch.py  （day01-points で実行。data/stations.geojson を出力）
"""

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://api-public.odpt.org/api/v4/gbfs/{}/station_information.json"

# system_id → 表示用の事業者名。docomo-cycle-tokyo は docomo-cycle と station_id が重なるので後で除く
SYSTEMS = {
    "docomo-cycle": "docomo",
    "docomo-cycle-tokyo": "docomo",
    "hellocycling": "hellocycling",
}

OUT = Path(__file__).resolve().parent.parent / "data" / "stations.geojson"


def fetch(system_id):
    with urllib.request.urlopen(BASE.format(system_id), timeout=60) as r:
        body = json.load(r)
    return body["last_updated"], body["data"]["stations"]


def main():
    features = []
    seen = set()
    updated = {}
    for system_id, operator in SYSTEMS.items():
        last_updated, stations = fetch(system_id)
        updated[system_id] = datetime.fromtimestamp(last_updated, timezone.utc).isoformat()
        dup = 0
        for s in stations:
            key = (operator, s["station_id"])
            if key in seen:
                dup += 1
                continue
            seen.add(key)
            capacity = s.get("capacity", s.get("vehicle_capacity"))
            if isinstance(capacity, dict):
                capacity = sum(int(v) for v in capacity.values())
            # 事業者によっては文字列で入っている
            capacity = int(capacity) if capacity not in (None, "") else None
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(s["lon"], 6), round(s["lat"], 6)]},
                "properties": {
                    "operator": operator,
                    "name": s["name"],
                    "capacity": capacity,
                },
            })
        print(f"{system_id}: {len(stations)} 件（重複 {dup} 件を除外）")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
    print(f"合計 {len(features)} 件 → {OUT}")
    print("取得時点:", updated)


if __name__ == "__main__":
    main()
