"""OD 表（prepare_od.py の出力）と国土数値情報 行政区域（N03, 2020年1月1日時点）から、ビューワ用のデータを作る。

使い方: python -I -X utf8 scripts/build_web.py <N03 の .shp か .geojson> <data/work> <web>
出力（web/）:
  munis.json     市区町村ごとの名前・位置・内訳（OD はしきい値で切る前の全件から数える）
  flows.json     市区町村間の流れ（MIN_FLOW 人以上）。列ごとの配列
  areas.geojson  市区町村の形（表示用に簡略化）
  stats.json     全体の数字
"""
import csv
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import polylabel

MIN_FLOW = 10  # これ以上の流れだけをビューワに載せる（人）
SIMPLIFY_M = 120  # 形の簡略化（m）
MIN_PART_KM2 = 0.3  # これより小さい島は表示用の形から落とす（いちばん大きい部分は残す）


def parts(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


def label_point(g):
    big = max(parts(g), key=lambda p: p.area)
    c = big.centroid
    if big.contains(c):
        return c
    return polylabel(big, tolerance=10)


def main(n03: Path, work: Path, web: Path):
    web.mkdir(parents=True, exist_ok=True)
    od = pd.read_csv(work / "od.csv", dtype={"o": str, "d": str})
    org = pd.read_csv(work / "origins.csv", dtype={"code": str})
    assert (od.all15 == od.work15 + od.school15).all()

    g = gpd.read_file(n03)
    g = g[g["N03_007"].notna()].to_crs(6933)  # 面積を保つ投影で面積・点を計算
    g = g.dissolve(by="N03_007", as_index=False)
    pts = gpd.GeoSeries([label_point(x) for x in g.geometry], crs=6933).to_crs(4326)
    g["x"] = pts.x.round(4)
    g["y"] = pts.y.round(4)

    codes = set(org.code)
    missing = sorted(codes - set(g.N03_007))
    print("N03 にない常住地コード:", missing)
    od_codes = set(od.o) | set(od.d)
    print("OD にあって origins にないコード:", sorted(od_codes - codes))
    assert not missing

    # しきい値で切る前の全件から、市区町村ごとの流出・流入を数える
    out_all = od.groupby("o").all15.sum()
    in_all = od.groupby("d").all15.sum()
    in_work = od.groupby("d").work15.sum()
    in_school = od.groupby("d").school15.sum()

    pos = g.set_index("N03_007")[["x", "y"]]
    org = org.sort_values("code").reset_index(drop=True)
    idx = {c: i for i, c in enumerate(org.code)}
    munis = []
    for r in org.itertuples():
        munis.append({
            "c": r.code, "p": r.pref, "n": r.name,
            "x": float(pos.loc[r.code, "x"]), "y": float(pos.loc[r.code, "y"]),
            "t": int(r.c0),        # 常住する15歳以上就業者・通学者
            "s": int(r.c01),       # 自市区町村で従業・通学
            "h": int(r.c011),      # うち自宅で従業
            "o": int(r.c02),       # 他市区町村で従業・通学（「不詳・外国」を含む）
            "ou": int(r.c024),     # うち従業・通学市区町村「不詳・外国」
            "u": int(r.c03),       # 従業地・通学地「不詳」
            "oa": int(out_all.get(r.code, 0)),  # OD に出る流出の合計（= o - ou のはず）
            "ia": int(in_all.get(r.code, 0)),   # 他市区町村からの流入の合計
            "iw": int(in_work.get(r.code, 0)),
            "is": int(in_school.get(r.code, 0)),
        })
    bad = [m for m in munis if m["oa"] != m["o"] - m["ou"]]
    print("流出の合計が合わない市区町村:", len(bad), [(m["n"], m["oa"], m["o"], m["ou"]) for m in bad[:5]])

    keep = od[od.all15 >= MIN_FLOW].sort_values("all15", ascending=False)
    flows = {
        "o": [idx[c] for c in keep.o], "d": [idx[c] for c in keep.d],
        "w": keep.work15.astype(int).tolist(), "s": keep.school15.astype(int).tolist(),
    }
    (web / "munis.json").write_text(json.dumps(munis, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (web / "flows.json").write_text(json.dumps(flows, separators=(",", ":")), encoding="utf-8")

    # 表示用の形: 小さい島を落とし、簡略化
    def shrink(geom):
        ps = sorted(parts(geom), key=lambda p: p.area, reverse=True)
        ps = [ps[0]] + [p for p in ps[1:] if p.area >= MIN_PART_KM2 * 1e6]
        return MultiPolygon(ps) if len(ps) > 1 else ps[0]

    a = g[["N03_007", "geometry"]].copy()
    a["geometry"] = a.geometry.apply(shrink).simplify(SIMPLIFY_M, preserve_topology=True)
    a = a.to_crs(4326).rename(columns={"N03_007": "c"})
    a["i"] = a.c.map(idx).fillna(-1).astype(int)
    a = a[a.i >= 0]
    a.to_file(web / "areas.geojson", driver="GeoJSON", COORDINATE_PRECISION=4)

    stats = {
        "n_munis": len(munis),
        "n_od_pairs": int(len(od)),
        "od_total": int(od.all15.sum()),
        "n_flows_web": int(len(keep)),
        "flows_web_total": int(keep.all15.sum()),
        "min_flow": MIN_FLOW,
        "residents_total": int(org.c0.sum()),
        "self_total": int(org.c01.sum()),
        "other_total": int(org.c02.sum()),
        "other_unknown_total": int(org.c024.sum()),
        "unknown_total": int(org.c03.sum()),
        "top": [
            {"o": munis[idx[r.o]]["p"] + munis[idx[r.o]]["n"], "d": munis[idx[r.d]]["p"] + munis[idx[r.d]]["n"], "n": int(r.all15)}
            for r in keep.head(10).itertuples()
        ],
    }
    (web / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    for f in web.iterdir():
        print(f.name, f.stat().st_size)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
