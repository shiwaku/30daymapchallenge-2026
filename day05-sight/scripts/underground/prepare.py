"""新宿駅周辺屋内地図（国土交通省）を、MapLibre の fill-extrusion で積み上げるための GeoJSONSeq にする。

入力: data/shinjuku/ShinjukuTerminal/ShinjukuTerminal_<階>_<種別>.shp
出力: data/shinjuku/web/indoor.geojson（1レイヤー。kind = floor / wall / twsi / ground）、web/stats.json
  mlt convert（0.6 以降）は GeoJSON の FeatureCollection を直接タイルにでき、1ファイルが1レイヤーになるのでまとめる。

- 階の高さは実測値がないので、1階分を LEVEL_M（m）として均等に積む（見やすさのための強調。実際の深さではない）。
  MapLibre の fill-extrusion は 0 m より下に描けないので、地下3階の床を 0 m に置き、全体を持ち上げる。
- グランドレベル（0）と 1階（1）はどちらも地上の階として同じ高さに置く。
- 部屋（Space）は塗りつぶすと下の階が見えなくなるので、輪郭だけを薄い壁にする。
- 高さの属性は整数 cm（tippecanoe → mlt convert で列の型をそろえるため）。
"""

import glob
import json
import os
import sys

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString, box, mapping

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(ROOT, "data", "shinjuku", "ShinjukuTerminal")
OUT = os.path.join(ROOT, "data", "shinjuku", "web")
LEVEL_M = 30.0
# ファイル名の階 → 階の番号（地下3階 = -3）
LEVEL = {"B3": -3, "B2": -2, "B1": -1, "0": 0, "1": 0, "2": 1, "2out": 1, "3": 2, "3out": 2, "4": 3, "4out": 3}
LABEL = {-3: "B3", -2: "B2", -1: "B1", 0: "GL", 1: "2F", 2: "3F", 3: "4F"}
GROUND_CM = int(3 * LEVEL_M * 100)  # 地上（GL）の床の高さ


def z_cm(level):
    return int((level + 3) * LEVEL_M * 100)


def read(kind):
    out = []
    for f in sorted(glob.glob(os.path.join(SRC, f"ShinjukuTerminal_*_{kind}.shp"))):
        key = os.path.basename(f).split("_")[1]
        d = gpd.read_file(f).to_crs(6677)
        d["level"] = LEVEL[key]
        out.append(d[["level", "geometry"]])
    return pd.concat(out, ignore_index=True)


FEATURES = []


def write(name, gdf):
    gdf = gdf.to_crs(4326)
    for _, r in gdf.iterrows():
        if r.geometry is None or r.geometry.is_empty:
            continue
        props = {"kind": name}
        props.update({k: (int(v) if k in ("b", "t", "lv", "ug") else v) for k, v in r.items() if k != "geometry"})
        FEATURES.append({"type": "Feature", "geometry": mapping(r.geometry), "properties": props})
    print(name, len(gdf), file=sys.stderr)


def attrs(gdf, lift_cm, thick_cm):
    gdf["lv"] = gdf.level
    gdf["ug"] = (gdf.level < 0).astype(int)
    gdf["fl"] = gdf.level.map(LABEL)
    gdf["b"] = gdf.level.map(z_cm) + lift_cm
    gdf["t"] = gdf.b + thick_cm
    return gdf.drop(columns="level")


def main():
    os.makedirs(OUT, exist_ok=True)

    # 床: 階ごとに合併（施設ごとのポリゴンが重なるので）
    floor = read("Floor")
    floor["geometry"] = floor.buffer(0)
    floor = floor.dissolve(by="level").reset_index().explode(index_parts=False)
    area = floor.assign(a=floor.area).groupby("level").a.sum()
    write("floor", attrs(floor, 0, 40))

    # 壁: 部屋の輪郭を 0.15 m 幅の帯にして、床から 2.5 m 立てる
    space = read("Space")
    space["geometry"] = space.boundary.buffer(0.15, cap_style="flat")
    write("wall", attrs(space, 40, 250))

    # 点字ブロック: 線は 0.3 m 幅、点は 0.6 m 角。床の上に 0.3 m
    tl = read("TWSILine")
    tl_len = tl.length.sum()
    tl["geometry"] = tl.buffer(0.3, cap_style="flat")
    tp = read("TWSIPoint")
    tp["geometry"] = tp.buffer(0.6, cap_style="square")
    write("twsi", attrs(pd.concat([tl, tp], ignore_index=True).pipe(gpd.GeoDataFrame, crs=6677), 40, 30))

    # 地面: 全体を囲む板を GL の床のすぐ下に置く
    x0, y0, x1, y1 = floor.total_bounds
    g = gpd.GeoDataFrame({"ug": [0], "b": [GROUND_CM - 60], "t": [GROUND_CM - 20]}, geometry=[box(x0 - 120, y0 - 120, x1 + 120, y1 + 120)], crs=6677)
    write("ground", g)

    # 地上の道路（OSM）: 地面の上に薄く置き、地下が地面の下にあると読めるようにする。歩道（footway）は入れない
    width = {"motorway": 10, "trunk": 10, "primary": 8, "secondary": 6, "tertiary": 5, "pedestrian": 4}
    osm = json.load(open(os.path.join(ROOT, "data", "shinjuku", "osm", "roads.json"), encoding="utf-8"))
    rows = []
    for e in osm["elements"]:
        hw = e["tags"].get("highway")
        if hw == "footway" or "geometry" not in e:
            continue
        rows.append({"w": width.get(hw, 3), "geometry": LineString([(p["lon"], p["lat"]) for p in e["geometry"]])})
    road = gpd.GeoDataFrame(rows, crs=4326).to_crs(6677)
    road["geometry"] = road.buffer(road.w / 2, cap_style="flat")
    road = gpd.GeoDataFrame(geometry=[road.union_all().intersection(g.geometry[0])], crs=6677).explode(index_parts=False)
    road["ug"], road["b"], road["t"] = 0, GROUND_CM - 20, GROUND_CM
    write("road", road)

    with open(os.path.join(OUT, "indoor.geojson"), "w", encoding="utf-8") as fp:
        json.dump({"type": "FeatureCollection", "features": FEATURES}, fp, ensure_ascii=False)

    under = float(area[area.index < 0].sum())
    above = float(area[area.index >= 0].sum())
    stats = {
        "floor_m2": {LABEL[int(k)]: round(float(v)) for k, v in area.items()},
        "underground_m2": round(under),
        "above_m2": round(above),
        "underground_share": round(under / (under + above), 3),
        "twsi_line_m": round(float(tl_len)),
        "level_m": LEVEL_M,
        "bounds": list(gpd.GeoSeries([box(x0, y0, x1, y1)], crs=6677).to_crs(4326).total_bounds),
    }
    with open(os.path.join(ROOT, "web", "stats.json"), "w", encoding="utf-8") as fp:
        json.dump(stats, fp, ensure_ascii=False, indent=2)
    print(json.dumps(stats, ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main()
