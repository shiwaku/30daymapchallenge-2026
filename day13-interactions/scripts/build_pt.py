"""東京都市圏パーソントリップ調査（H30）の OD 表 d-1 から、ビューワ用のデータを作る。

入力（data/pt/、Git 管理外）:
  d-1.zip                       表d-1「目的種類別代表交通手段別OD表」（計画基本ゾーン、協議会の基礎集計）
  H30_gis/H30_kzone.shp         計画基本ゾーン（EPSG:6677）
  H30_gis/H30_szone.shp         小ゾーン（市区町村名 CityName を持つ。ゾーンの名前に使う）
  S12/S12-23_NumberOfPassengers.shp  国土数値情報 駅別乗降客数（2018年 = S12_037。ゾーンの名前に使う）

使い方: python -I -X utf8 scripts/build_pt.py data/pt web
出力（web/）:
  zones.json     ゾーンごとの名前・線の端の位置・発生/集中/ゾーン内の内訳（目的×手段、しきい値で切る前の全件）
  flows.json     ゾーン間の流れ（全目的・全手段で MIN_FLOW トリップ以上の組）。目的×手段の値を平たく並べる
  areas.geojson  ゾーンの形（表示用に簡略化）
  stats.json     全体の数字
"""
import io
import json
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import MultiPolygon
from shapely.ops import polylabel

MIN_FLOW = 500  # これ以上の組だけを線にする（トリップ/日）。標本誤差が大きい小さな組を落とす
SIMPLIFY_M = 60

# 目的の区分（d-1 の目的種類 → ビューワの区分）。「不明」は全目的にだけ入る
PURPOSES = ["通勤", "通学", "私事", "業務", "帰宅", "不明"]
P_MAP = {"自宅－勤務": "通勤", "自宅－通学": "通学", "自宅－私事": "私事", "私事": "私事",
         "自宅－業務": "業務", "勤務・業務": "業務", "帰宅": "帰宅", "不明": "不明"}
# 代表交通手段の区分。二輪車・その他・不明は「その他」にまとめる
MODES = ["鉄道", "バス", "自動車", "自転車", "徒歩", "その他"]
M_COLS = {"鉄道": ["鉄道"], "バス": ["バス"], "自動車": ["自動車"], "自転車": ["自転車"], "徒歩": ["徒歩"],
          "その他": ["２輪車", "その他", "不明"]}
K = len(PURPOSES) * len(MODES)


def parts(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


def label_point(g):
    big = max(parts(g), key=lambda p: p.area)
    c = big.centroid
    return c if big.contains(c) else polylabel(big, tolerance=10)


def read_d1(path: Path) -> pd.DataFrame:
    with zipfile.ZipFile(path) as z:
        df = pd.read_csv(io.TextIOWrapper(z.open("d-1.csv"), encoding="cp932"), skiprows=3, thousands=",")
    df.columns = [c.strip() for c in df.columns]
    for c in ["発地", "着地", "目的種類"]:
        df[c] = df[c].astype(str).str.strip(" :")
    return df


def main(src: Path, web: Path):
    web.mkdir(parents=True, exist_ok=True)
    kz = gpd.read_file(src / "H30_gis/H30_kzone.shp")
    kz["kzone"] = kz["kzone"].astype(str).str.zfill(4)
    kz["geometry"] = kz.geometry.buffer(0)  # 壊れたリングを直す
    kz = kz.dissolve(by="kzone", as_index=False)
    codes = sorted(kz.kzone)
    idx = {c: i for i, c in enumerate(codes)}

    df = read_d1(src / "d-1.zip")
    df = df[df["目的種類"] != "計"]
    unknown_purposes = set(df["目的種類"]) - set(P_MAP)
    assert not unknown_purposes, unknown_purposes
    # 計画基本ゾーンどうしの行だけ（市区町村などの合計行と「不明」ゾーンを除く）
    inside = df["発地"].isin(idx) & df["着地"].isin(idx)
    lost = df.loc[~inside & ~df["発地"].str.contains(" ") & ~df["着地"].str.contains(" "), "計"].sum()
    df = df[inside].copy()
    for m, cols in M_COLS.items():
        df[m] = df[cols].sum(axis=1)
    assert (df[MODES].sum(axis=1) == df["計"]).all()
    df["p"] = df["目的種類"].map(P_MAP).map(PURPOSES.index)
    df["o"] = df["発地"].map(idx)
    df["d"] = df["着地"].map(idx)

    # (o, d) × 目的 × 手段 の値を作る
    g = df.groupby(["o", "d", "p"])[MODES].sum()
    pair_vals: dict[tuple[int, int], np.ndarray] = {}
    for (o, d, p), row in g.iterrows():
        v = pair_vals.setdefault((o, d), np.zeros(K, dtype=np.int64))
        v[p * len(MODES):(p + 1) * len(MODES)] += row.to_numpy()

    nz = len(codes)
    gen = np.zeros((nz, K), dtype=np.int64)    # ゾーンから出る（ほかのゾーンへ）
    att = np.zeros((nz, K), dtype=np.int64)    # ゾーンへ来る（ほかのゾーンから）
    intra = np.zeros((nz, K), dtype=np.int64)  # ゾーンの中で完結
    for (o, d), v in pair_vals.items():
        if o == d:
            intra[o] += v
        else:
            gen[o] += v
            att[d] += v

    inter = {k: v for k, v in pair_vals.items() if k[0] != k[1]}
    keep = sorted(((k, v) for k, v in inter.items() if v.sum() >= MIN_FLOW), key=lambda kv: -kv[1].sum())
    flows = {"o": [k[0] for k, _ in keep], "d": [k[1] for k, _ in keep],
             "v": [int(x) for _, v in keep for x in v]}

    # ゾーンの名前: 市区町村名（小ゾーンの面積でいちばん多いもの）。同じ市区町村に複数ゾーンがあるときは、
    # ゾーン内でいちばん乗降客数の多い駅の名前を添える（駅がなければゾーン番号）
    sz = gpd.read_file(src / "H30_gis/H30_szone.shp", encoding="cp932").to_crs(kz.crs)
    sz["kzone"] = gpd.sjoin(sz.assign(geometry=sz.representative_point()), kz[["kzone", "geometry"]],
                            predicate="within", how="left")["kzone"]
    sz["a"] = sz.area
    city = sz.sort_values("a", ascending=False).drop_duplicates("kzone").set_index("kzone")["CityName"]
    st = gpd.read_file(src / "S12/S12-23_NumberOfPassengers.shp", encoding="utf-8").to_crs(kz.crs)
    st = st.assign(geometry=st.geometry.centroid)
    st["r"] = pd.to_numeric(st["S12_037"], errors="coerce").fillna(0)
    st = gpd.sjoin(st, kz[["kzone", "geometry"]], predicate="within")
    top_st = st.groupby(["kzone", "S12_001"])["r"].sum().reset_index().sort_values("r", ascending=False) \
        .drop_duplicates("kzone").set_index("kzone")["S12_001"]
    kz["city"] = kz.kzone.map(city).fillna("")
    multi = kz.city.map(kz.city.value_counts()) > 1
    kz["name"] = [
        (f"{c}（{top_st[z]}駅付近）" if z in top_st.index else f"{c}（{z}）") if m else c
        for z, c, m in zip(kz.kzone, kz.city, multi)
    ]
    dup = kz.name[kz.name.duplicated(keep=False)]
    kz.loc[dup.index, "name"] = kz.loc[dup.index].apply(lambda r: f"{r.city}（{r.kzone}）", axis=1)

    pts = gpd.GeoSeries([label_point(x) for x in kz.geometry], crs=kz.crs).to_crs(4326)
    kz = kz.set_index("kzone").loc[codes]
    zones = []
    for i, c in enumerate(codes):
        zones.append({"c": c, "n": kz.loc[c, "name"], "x": round(float(pts.iloc[i].x), 4), "y": round(float(pts.iloc[i].y), 4),
                      "g": gen[i].tolist(), "a": att[i].tolist(), "s": intra[i].tolist()})
    (web / "zones.json").write_text(json.dumps(zones, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (web / "flows.json").write_text(json.dumps(flows, separators=(",", ":")), encoding="utf-8")

    a = kz.reset_index()[["kzone", "geometry"]].copy()
    a["geometry"] = a.geometry.simplify(SIMPLIFY_M, preserve_topology=True)
    a["i"] = a.kzone.map(idx)
    a.to_crs(4326).drop(columns="kzone").to_file(web / "areas.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)

    tot = sum(v.sum() for v in pair_vals.values())
    inter_tot = sum(v.sum() for v in inter.values())
    by_p = np.zeros(K, dtype=np.int64)
    for v in inter.values():
        by_p += v
    stats = {
        "n_zones": nz, "min_flow": MIN_FLOW, "purposes": PURPOSES, "modes": MODES,
        "trips_total": int(tot), "trips_intra": int(tot - inter_tot), "trips_inter": int(inter_tot),
        "n_pairs": len(inter), "n_flows_web": len(keep), "flows_web_total": int(sum(v.sum() for _, v in keep)),
        "trips_unknown_zone": int(lost),
        "inter_by_purpose": {p: int(by_p[i * len(MODES):(i + 1) * len(MODES)].sum()) for i, p in enumerate(PURPOSES)},
        "inter_by_mode": {m: int(by_p[j::len(MODES)].sum()) for j, m in enumerate(MODES)},
        "top": [{"o": zones[k[0]]["n"], "d": zones[k[1]]["n"], "n": int(v.sum())} for k, v in keep[:10]],
    }
    (web / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    for f in sorted(web.iterdir()):
        print(f.name, f.stat().st_size)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
