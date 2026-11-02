"""自転車に適した道を OSM のタグで選び、つながり（連結成分）とすき間を計算する。

python -I -X utf8 scripts/analyze.py data/work web

入力: extract.py の出力（data/work/ways.parquet, pref.parquet, places.parquet）
出力（web/、ビューワが読む。© OpenStreetMap contributors, ODbL）
- bike.geojson   自転車に適した道。c=つながりの番号（長い順に0,1,2…）、ckm=そのつながりの長さ(km)、
                 k=道の種類（0 自転車道 / 1 車道の自転車レーン / 2 歩行者と共用）、
                 c300/km300・c1000/km1000=300m・1km までのすき間を埋めたあとのつながり
- gaps.geojson   大きなつながりどうしのすき間（直線で結んだ最短の線）。計算の結果で、計画ではない
- base.geojson   背景（都県の境界、幹線道路、川）
- places.geojson 市・区の名前
- stats.json     数字（README とビューワで使う）

距離はすべて JGD2011 平面直角座標系 第IX系（EPSG:6677）で測る。
"""
import json
import pathlib
import sys
from collections import Counter, defaultdict

import duckdb
import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import polygonize, unary_union

CRS = "EPSG:6677"
SOUTH = 35.48  # これより南（島しょ部）は使わない
# 端点からこの距離以内に別の道があれば、つながっているとみなす（道路の横断や、データ上の小さな切れ目）
SNAP_M = 20
# すき間を探す対象の、つながりの長さの下限（km）
GAP_MIN_KM = 2.0
# すき間の上限（m）。これより短いすき間を「埋める」と仮定する場合を、いくつか計算する
THRESHOLDS = [300, 1000]
GAP_MAX_M = max(THRESHOLDS)
LANE_VALUES = {"lane", "track", "opposite_lane", "opposite_track"}
SKIP_HW = {"construction", "proposed", "abandoned", "disused", "platform", "steps", "corridor", "elevator", "raceway"}
PATH_HW = {"path", "footway", "pedestrian", "track", "bridleway"}


def classify(t: dict) -> str | None:
    """自転車に適した道なら種類を返す。そうでなければ None。

    cycleway = highway=cycleway（自転車の専用の道）
    lane     = 車道に付いた自転車レーン・自転車道（cycleway, cycleway:both/left/right = lane / track）
    shared   = 歩行者と共用の、自転車が指定された道（highway=path / footway / pedestrian などで bicycle=designated）
               （自転車横断帯 footway=crossing を含む）
    車道沿いの歩道（footway=sidewalk）は、自転車が指定されていても（自転車通行可の歩道）含めない。
    矢羽根（cycleway=shared_lane）や、自転車が通ってよいだけの道（bicycle=yes）も含めない。
    """
    hw = t.get("highway")
    if not hw or hw in SKIP_HW or t.get("area") == "yes":
        return None
    if t.get("bicycle") in {"no", "dismount", "private", "use_sidepath"}:
        return None
    if t.get("access") in {"private", "no"} and t.get("bicycle") not in {"designated", "yes", "permissive"}:
        return None
    if hw == "cycleway" or t.get("bicycle_road") == "yes" or t.get("cyclestreet") == "yes":
        return "cycleway"
    if any(t.get(k) in LANE_VALUES for k in ("cycleway", "cycleway:both", "cycleway:left", "cycleway:right")):
        return "lane"
    if t.get("bicycle") == "designated" and hw in PATH_HW and t.get("footway") != "sidewalk":
        return "shared"
    return None


class DSU:
    def __init__(self) -> None:
        self.p: dict = {}

    def find(self, x):
        p = self.p
        p.setdefault(x, x)
        root = x
        while p[root] != root:
            root = p[root]
        while p[x] != root:
            p[x], x = root, p[x]
        return root

    def union(self, a, b) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        self.p[rb] = ra
        return True


def study_area() -> tuple[gpd.GeoDataFrame, object]:
    pref = duckdb.sql(f"SELECT * FROM '{WORK / 'pref.parquet'}'").df()
    polys = []
    for iso, g in pref.groupby("iso"):
        lines = [shapely.from_wkt(w) for w in g.wkt]
        poly = unary_union(list(polygonize(lines)))
        # 島しょ部を外す
        poly = poly.intersection(shapely.box(138.0, SOUTH, 141.0, 37.0))
        polys.append({"iso": iso, "geometry": poly})
    gdf = gpd.GeoDataFrame(polys, crs="EPSG:4326")
    return gdf, unary_union(gdf.geometry)


def main() -> None:
    out = pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    pref, area = study_area()
    print("area km2", pref.to_crs(CRS).area.sum() / 1e6)

    ways = duckdb.sql(f"SELECT * FROM '{WORK / 'ways.parquet'}'").df()
    ways["t"] = ways.tags.map(json.loads)
    ways["geometry"] = shapely.from_wkt(ways.wkt)
    ways = gpd.GeoDataFrame(ways.drop(columns=["wkt", "tags"]), crs="EPSG:4326")
    shapely.prepare(area)
    ways = ways[shapely.intersects(ways.geometry.values, area)].copy()

    cand = ways[ways.src == "cand"].copy()
    cand["k"] = cand.t.map(classify)
    # 判定に入らなかった候補の内訳（README 用）
    skipped = Counter()
    for t, k in zip(cand.t, cand.k):
        if k is None:
            v = [t.get(x) for x in ("cycleway", "cycleway:both", "cycleway:left", "cycleway:right")]
            skipped["shared_lane" if "shared_lane" in v else
                    "sidewalk" if t.get("footway") == "sidewalk" else
                    f"bicycle={t.get('bicycle')}/{t.get('highway')}"] += 1
    bike = cand[cand.k.notna()].copy()
    bike = bike.to_crs(CRS)
    bike["m"] = bike.length
    shared_lane_m = 0.0
    sl = cand[cand.k.isna()].copy()
    sl = sl[[any(t.get(x) == "shared_lane" for x in ("cycleway", "cycleway:both", "cycleway:left", "cycleway:right")) for t in sl.t]]
    if len(sl):
        shared_lane_m = float(sl.to_crs(CRS).length.sum())
    sw = cand[cand.k.isna().values & np.array([t.get("footway") == "sidewalk" and t.get("bicycle") == "designated" for t in cand.t])]
    sidewalk_m = float(sw.to_crs(CRS).length.sum()) if len(sw) else 0.0
    print("bike ways", len(bike), "km", bike.m.sum() / 1000, bike.groupby("k").m.sum().div(1000).round(1).to_dict())

    # 1. ノードを共有する道をつなぐ
    dsu = DSU()
    for wid, refs in zip(bike.id, bike.refs):
        dsu.find(("w", wid))
        for r in refs:
            dsu.union(("w", wid), ("n", int(r)))
    # 2. 端点から SNAP_M 以内に別の道があればつなぐ
    geoms = bike.geometry.values
    ids = bike.id.values
    tree = shapely.STRtree(geoms)
    ends = []
    owner = []
    for i, g in enumerate(geoms):
        c = shapely.get_coordinates(g)
        ends += [shapely.Point(c[0]), shapely.Point(c[-1])]
        owner += [i, i]
    pi, gi = tree.query(np.array(ends, dtype=object), predicate="dwithin", distance=SNAP_M)
    snapped = 0
    for a, b in zip(pi, gi):
        if dsu.union(("w", ids[owner[a]]), ("w", ids[b])):
            snapped += 1
    print("snap unions", snapped)

    bike["root"] = [dsu.find(("w", w)) for w in ids]
    comp_m = bike.groupby("root").m.sum().sort_values(ascending=False)
    rank = {r: i for i, r in enumerate(comp_m.index)}
    bike["c"] = bike.root.map(rank)
    bike["ckm"] = bike.root.map(comp_m) / 1000
    total_km = bike.m.sum() / 1000
    print("components", len(comp_m), "largest km", comp_m.iloc[0] / 1000, "top10", (comp_m.iloc[:10] / 1000).round(1).tolist())

    # 3. すき間: GAP_MIN_KM 以上のつながりどうしの最短の直線
    big = comp_m[comp_m >= GAP_MIN_KM * 1000]
    comp_geom = {}
    for r in big.index:
        comp_geom[r] = MultiLineString([g for g in bike.geometry[bike.root == r]])
    roots = list(big.index)
    cg = np.array([comp_geom[r] for r in roots], dtype=object)
    ctree = shapely.STRtree(cg)
    a_idx, b_idx = ctree.query(cg, predicate="dwithin", distance=GAP_MAX_M)
    cands = []
    crossing = []
    for a, b in zip(a_idx, b_idx):
        if a >= b:
            continue
        line = shapely.shortest_line(cg[a], cg[b])
        d = line.length
        if d < 1:
            # 線が交わっているのにノードを共有していない（橋と下の道のような立体交差が多い）。
            # 「すき間」ではないので数えず、組の数だけ記録する
            crossing.append((roots[a], roots[b]))
            continue
        cands.append((d, roots[a], roots[b], line))
    cands.sort(key=lambda x: x[0])
    print("gap candidates", len(cands))

    # すき間を短い順に埋める（クラスカル法の最小全域森。すでに同じつながりになった組は飛ばす）。
    # しきい値 T までのすき間を埋めた状態は、この順番の先頭から d <= T の分だけ埋めた状態になる
    dsu2 = DSU()
    chosen = []
    for d, ra, rb, line in cands:
        if dsu2.union(ra, rb):
            chosen.append((d, ra, rb, line))

    scen = {}
    for T in THRESHOLDS:
        dsu_t = DSU()
        for d, ra, rb, _ in chosen:
            if d <= T:
                dsu_t.union(ra, rb)
        after = defaultdict(float)
        for r, m in comp_m.items():
            after[dsu_t.find(r)] += m
        after_s = sorted(after.items(), key=lambda x: -x[1])
        rank_t = {r: i for i, (r, _) in enumerate(after_s)}
        bike[f"c{T}"] = [rank_t[dsu_t.find(r)] for r in bike.root]
        bike[f"km{T}"] = [round(after[dsu_t.find(r)] / 1000, 1) for r in bike.root]
        used = [(d, ra, rb) for d, ra, rb, _ in chosen if d <= T]
        into_main = [d for d, ra, rb in used if rank_t[dsu_t.find(ra)] == 0]
        # いまのつながりのうち、最大のつながりに入るもの
        members = [r for r in comp_m.index if rank_t[dsu_t.find(r)] == 0]
        scen[T] = {
            "n_gaps": len(used), "gaps_m": round(sum(d for d, _, _ in used)),
            "largest_km": round(after_s[0][1] / 1000, 1),
            "largest_share": round(after_s[0][1] / 1000 / total_km, 4),
            "largest_n_gaps": len(into_main), "largest_gaps_m": round(sum(into_main)),
            "largest_members": len(members),
            "n_components_ge10km": sum(1 for _, m in after_s if m >= 10000),
            "top5_km": [round(m / 1000, 1) for _, m in after_s[:5]],
        }
        print("T", T, scen[T])

    # すき間ごとに、つなぐ2つのつながり（いまの長さ）を記録する
    gaps = []
    for d, ra, rb, line in chosen:
        gaps.append({
            "geometry": line, "m": round(d),
            "a": round(max(comp_m[ra], comp_m[rb]) / 1000, 1), "b": round(min(comp_m[ra], comp_m[rb]) / 1000, 1),
            "ca": min(rank[ra], rank[rb]), "cb": max(rank[ra], rank[rb]),
        })
    gdf_gaps = gpd.GeoDataFrame(gaps, crs=CRS)

    # ---- 書き出し ----
    km_bins = [0, 1, 10, 50, 1e9]
    stats = {
        "osm_extract": "Geofabrik kanto-261101.osm.pbf（2026-11-01 時点の OSM）",
        "snap_m": SNAP_M, "gap_min_km": GAP_MIN_KM, "thresholds_m": THRESHOLDS,
        "area_km2": round(pref.to_crs(CRS).area.sum() / 1e6),
        "total_km": round(total_km, 1),
        "by_kind_km": bike.groupby("k").m.sum().div(1000).round(1).to_dict(),
        "shared_lane_km_excluded": round(shared_lane_m / 1000, 1),
        "sidewalk_designated_km_excluded": round(sidewalk_m / 1000, 1),
        "skipped_candidates": dict(skipped.most_common(12)),
        "n_ways": int(len(bike)),
        "n_components": int(len(comp_m)),
        "largest_km": round(comp_m.iloc[0] / 1000, 1),
        "largest_share": round(comp_m.iloc[0] / 1000 / total_km, 4),
        "top10_km": (comp_m.iloc[:10] / 1000).round(1).tolist(),
        "components_by_size": {
            f"{lo}-{hi}km": {"n": int(((comp_m / 1000 >= lo) & (comp_m / 1000 < hi)).sum()),
                             "km": round(float(comp_m[(comp_m / 1000 >= lo) & (comp_m / 1000 < hi)].sum() / 1000), 1)}
            for lo, hi in zip(km_bins[:-1], km_bins[1:])
        },
        "n_big_components": int(len(big)),
        "n_crossing_pairs_excluded": len(crossing),
        "n_gap_candidates": len(cands),
        "fill": {str(T): v for T, v in scen.items()},
    }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1))

    def write(gdf: gpd.GeoDataFrame, name: str, cols: list[str], tol: float, prec: float = 1e-5) -> None:
        g = gdf.copy()
        g["geometry"] = g.geometry.simplify(tol) if tol else g.geometry
        g = g.to_crs("EPSG:4326")
        g["geometry"] = shapely.set_precision(g.geometry.values, prec)
        g = g[~g.geometry.is_empty]
        feats = [{"type": "Feature", "properties": {c: (v.item() if hasattr(v, "item") else v) for c, v in zip(cols, row[:-1])},
                  "geometry": mapping(row[-1])} for row in g[cols + ["geometry"]].itertuples(index=False, name=None)]
        path = out / name
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        print(name, len(feats), f"{path.stat().st_size / 1e6:.1f} MB")

    bike["ckm"] = bike.ckm.round(2)
    bike["k"] = bike.k.map({"cycleway": 0, "lane": 1, "shared": 2})
    # 同じつながり・種類の線はまとめてファイルを小さくする
    TCOLS = ["c", "ckm"] + [f"{p}{T}" for T in THRESHOLDS for p in ("c", "km")]
    bike_m = bike.dissolve(by=["c", "k"], aggfunc={c: "first" for c in TCOLS[1:]}).reset_index()
    bike_m["geometry"] = bike_m.geometry.map(lambda g: shapely.line_merge(g) if g.geom_type == "MultiLineString" else g)
    write(bike_m, "bike.geojson", ["c", "k"] + TCOLS[1:], 2)
    write(gdf_gaps, "gaps.geojson", ["m", "a", "b", "ca", "cb"], 0)

    bg = ways[ways.src == "bg"].copy()
    bg["kind"] = [("river" if t.get("waterway") == "river" else
                   "major" if t.get("highway") in ("motorway", "trunk") else "road") for t in bg.t]
    bg = bg.to_crs(CRS)
    bg = bg.dissolve(by="kind").reset_index()
    bg["geometry"] = bg.geometry.map(shapely.line_merge)
    pb = pref.to_crs(CRS).copy()
    pb["kind"] = "pref"
    pb["geometry"] = pb.geometry.boundary
    base = gpd.GeoDataFrame(pd_concat([bg[["kind", "geometry"]], pb[["kind", "geometry"]]]), crs=CRS)
    write(base, "base.geojson", ["kind"], 8, 1e-4)
    land = pref.to_crs(CRS).copy()
    land["kind"] = "land"
    write(land, "land.geojson", ["iso"], 20, 1e-4)

    places = duckdb.sql(f"SELECT * FROM '{WORK / 'places.parquet'}'").df()
    pl = gpd.GeoDataFrame(places, geometry=gpd.points_from_xy(places.lon, places.lat), crs="EPSG:4326")
    pl = pl[pl.intersects(area)]
    write(pl.to_crs(CRS), "places.geojson", ["name", "place"], 0)


def pd_concat(frames):
    import pandas as pd
    return pd.concat(frames, ignore_index=True)


WORK = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("data/work")

if __name__ == "__main__":
    main()
