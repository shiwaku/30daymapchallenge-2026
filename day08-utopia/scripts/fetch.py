"""Overpass API から東京都（島しょ部を除く）と埼玉県の OSM データを取る。

python -I -X utf8 scripts/fetch.py data/osm

出力（どれも OSM の JSON。© OpenStreetMap contributors, ODbL）
- bike.json   自転車に適した道の候補（タグの判定は prepare.py で行う）
- roads.json  背景に薄く描く幹線道路（motorway〜secondary）
- water.json  背景の川（waterway=river）
- pref.json   都県の境界（relation）
"""
import json
import pathlib
import sys
import time

import requests

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# 島しょ部を外すための範囲（南, 西, 北, 東）
BBOX = "35.48,138.6,36.32,139.95"
HEAD = f"""[out:json][timeout:900][maxsize:2000000000][bbox:{BBOX}];
area["ISO3166-2"="JP-13"]->.tk;
area["ISO3166-2"="JP-11"]->.st;
(.tk; .st;)->.a;
"""
QUERIES = {
    "bike": HEAD + """(
  way(area.a)[highway=cycleway];
  way(area.a)[highway][bicycle=designated];
  way(area.a)[highway]["cycleway"];
  way(area.a)[highway]["cycleway:both"];
  way(area.a)[highway]["cycleway:left"];
  way(area.a)[highway]["cycleway:right"];
  way(area.a)[highway][bicycle_road=yes];
  way(area.a)[highway][cyclestreet=yes];
);
out body geom qt;
""",
    "roads": HEAD + """way(area.a)[highway~"^(motorway|trunk|primary|secondary)$"];
out tags geom qt;
""",
    "water": HEAD + """way(area.a)[waterway=river];
out tags geom qt;
""",
    "pref": """[out:json][timeout:300];
rel["ISO3166-2"~"^JP-(11|13)$"]["boundary"="administrative"];
out geom;
""",
}


def run(name: str, q: str, out: pathlib.Path) -> None:
    path = out / f"{name}.json"
    if path.exists():
        print("skip", path)
        return
    for ep in ENDPOINTS * 2:
        try:
            t = time.time()
            r = requests.post(ep, data={"data": q}, timeout=1200,
                              headers={"User-Agent": "30daymapchallenge-day08"})
            r.raise_for_status()
            js = r.json()
            js["_fetched"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
            js["_endpoint"] = ep
            path.write_text(json.dumps(js), encoding="utf-8")
            print(name, len(js["elements"]), "elements", f"{time.time()-t:.0f}s", ep, flush=True)
            return
        except Exception as e:  # noqa: BLE001
            print("retry", name, ep, e, flush=True)
            time.sleep(20)
    raise SystemExit(f"failed: {name}")


def main() -> None:
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, q in QUERIES.items():
        run(name, q, out)


if __name__ == "__main__":
    main()
