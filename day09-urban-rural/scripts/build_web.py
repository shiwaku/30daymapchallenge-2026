"""ビューア用のデータを作る。

入力: data/sprawl_donut.csv（sprawl_donut.py の出力）、GHS-BUILT-S 2000/2020、Natural Earth
出力: data/web/
  - cities.geojson  都市ごとの型と数字（2000→2020）
  - countries.geojson  背景の国境（Natural Earth 1:50m）
  - built/{rank}.png  中心から 40km 四方の建物：2000年にあった分（灰）と 2000→2020年に増えた分（橙）

型（2000→2020、半径 40km）:
  shrink: 人口が減ったのに建物は増えた
  sprawl: 建物の伸び率 > 人口の伸び率（SDG 11.3.1 の比 > 1）
  dense:  人口の伸び率 >= 建物の伸び率（比 <= 1）
  donut:  中心 0-5km の人口が減り、20-40km は増えた（型とは別に付ける印）
"""
from pathlib import Path
import json
import sys
import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/web"
(OUT / "built").mkdir(parents=True, exist_ok=True)

# 除外: 元データか都市の点の人口が怪しいもの
#   42 アマラーヴァティー（建設中の州都なのに POP_MAX 580万）
#   52 ルアンダ（GHS-POP 1975 が 5万人で、伸びが極端）
#   80 河池（POP_MAX が広い行政区の人口）
EXCLUDE = {42, 52, 80}
RINGS = [(0, 5), (5, 10), (10, 20), (20, 40)]

d = pd.read_csv(ROOT / "data/sprawl_donut.csv")
d = d[~d["rank"].isin(EXCLUDE)]
ne = gpd.read_file(ROOT / "data/ne/ne_10m_populated_places.shp").nlargest(100, "POP_MAX").reset_index(drop=True)
ne["rank"] = ne.index + 1

def short(n):
    for s in ("特別市", "広域市", "市", "都"):
        if n.endswith(s) and len(n) > len(s) + 1:
            return n[: -len(s)]
    return n

feats = []
for rank, g in d.groupby("rank"):
    a = g[g.year == 2000].iloc[0]
    b = g[g.year == 2020].iloc[0]
    c = ne[ne["rank"] == rank].iloc[0]
    p = b["pop"] / a["pop"]
    bl = b["built_km2"] / a["built_km2"]
    lcr = np.log(bl) / np.log(p) if p != 1 else None
    if p < 1 and bl > 1:
        typ = "shrink"
    elif lcr is not None and lcr > 1:
        typ = "sprawl"
    else:
        typ = "dense"
    rings = [{"r": f"{lo}-{hi}", "p00": round(a[f"pop_{lo}_{hi}"]), "p20": round(b[f"pop_{lo}_{hi}"])} for lo, hi in RINGS]
    donut = rings[0]["p20"] < rings[0]["p00"] and rings[-1]["p20"] > rings[-1]["p00"]
    feats.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(c.geometry.x, 4), round(c.geometry.y, 4)]},
        "properties": {
            "rank": int(rank), "name": short(c.NAME_JA), "name_en": c.NAME, "country": c.ADM0NAME,
            "type": typ, "donut": bool(donut),
            "pop00": round(a["pop"]), "pop20": round(b["pop"]),
            "built00": round(a["built_km2"], 1), "built20": round(b["built_km2"], 1),
            "lcr": None if lcr is None else round(float(lcr), 2),
            "m2pp00": round(a["built_km2"] * 1e6 / a["pop"], 1), "m2pp20": round(b["built_km2"] * 1e6 / b["pop"], 1),
            "rings": json.dumps(rings),
        },
    })
(OUT / "cities.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
print(pd.Series([f["properties"]["type"] for f in feats]).value_counts().to_dict(),
      "donut:", [f["properties"]["name"] for f in feats if f["properties"]["donut"]])

# 背景の国境
co = gpd.read_file(ROOT / "data/ne/ne_50m_admin_0_countries.shp")[["geometry"]]
co["geometry"] = co.geometry.simplify(0.02)
(OUT / "countries.geojson").write_text(co.to_json(drop_id=True), encoding="utf-8")

# 都市ごとの建物の広がり（40km 四方 = 80 x 80 マス）
tr = Transformer.from_crs("EPSG:4326", "+proj=moll +lon_0=0 +datum=WGS84 +units=m", always_xy=True)
H = 40_000
src = {y: rasterio.open(ROOT / f"data/ghsl/GHS_BUILT_S_E{y}_GLOBE_R2023A_54009_1000_V1_0.tif") for y in (2000, 2020)}
for f in feats:
    x, y = tr.transform(*f["geometry"]["coordinates"])
    s = {}
    for yr, r in src.items():
        a = r.read(1, window=from_bounds(x - H, y - H, x + H, y + H, r.transform), boundless=True, fill_value=0).astype("float64")
        a[a > 1e6 + 1] = 0
        s[yr] = np.clip(a / 1e6, 0, 1)  # マスの中で建物が占める割合
    old = np.sqrt(s[2000]).clip(0, 1)
    new = ((s[2020] - s[2000] - 0.03) / 0.2).clip(0, 1)  # マスの 3% 未満の増加は塗らない。23% 以上で最も濃く
    rgb = np.zeros(old.shape + (3,))
    base = np.array([20, 23, 30]) / 255
    grey = np.array([0.78, 0.80, 0.84])
    orange = np.array([1.0, 0.55, 0.15])
    rgb[:] = base
    rgb = rgb * (1 - old[..., None]) + grey * old[..., None]
    rgb = rgb * (1 - new[..., None]) + orange * new[..., None]
    Image.fromarray((rgb * 255).astype(np.uint8)).resize((240, 240), Image.NEAREST).save(OUT / f"built/{f['properties']['rank']}.png", optimize=True)
print("built png:", len(feats))
