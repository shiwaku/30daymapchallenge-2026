"""国勢調査2020 250mメッシュ人口（e-Stat T001142）を全国分取得する。

1次メッシュの一覧は、学校・医療機関・駅の点がある1次メッシュから作る（人が住む所はほぼ含まれる）。
使い方: python -I -X utf8 fetch_mesh.py <day08 の data フォルダ>
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

import geopandas as gpd

data = Path(sys.argv[1]).resolve()
out = data / "mesh250"
out.mkdir(parents=True, exist_ok=True)

codes = set()
for f in ["ksj/p29/P29-23_GML/P29-23.geojson", "ksj/p04/P04-20_GML/P04-20.geojson"]:
    g = gpd.read_file(data / f)
    for x, y in zip(g.geometry.x, g.geometry.y):
        codes.add(f"{int(y * 1.5):02d}{int(x - 100):02d}")
st = json.load(open(data / "rail/unkohonsu2026_eki.geojson", encoding="utf-8"))
for ft in st["features"]:
    x, y = ft["geometry"]["coordinates"][:2]
    codes.add(f"{int(y * 1.5):02d}{int(x - 100):02d}")
codes = sorted(codes)
print(len(codes), "1次メッシュ")

ng = []
for c in codes:
    p = out / f"T001142_{c}.zip"
    if p.exists() and p.stat().st_size > 1000:
        continue
    url = f"https://www.e-stat.go.jp/gis/statmap-search/data?statsId=T001142&code={c}&downloadType=2"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        b = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:
        ng.append((c, str(e)))
        continue
    if b[:2] != b"PK":
        ng.append((c, "not zip"))
        continue
    p.write_bytes(b)
    time.sleep(0.3)
print("取得できなかった:", ng)
