"""自宅から私事（買い物・食事・通院・娯楽など）へ出かけるトリップの OD 量を、市区町村ごとに出す。

入力（data/pt/、Git 管理外）:
  d-1.zip   協議会 表d-1「目的種類別代表交通手段別OD表」の「自宅－私事」の行（発地＝自宅のあるゾーン）
  H30_gis/H30_kzone.shp  計画基本ゾーン
  H30_gis/H30_szone.shp  小ゾーン（市区町村名・コード付き。計画基本ゾーンと市区町村の対応に使う）
  S12/S12-23_NumberOfPassengers.shp  国土数値情報 駅別乗降客数（主な駅の名前と位置）
  ../n02/N02-24_RailroadSection.shp   国土数値情報 鉄道（2024年。背景の路線に使う）

使い方: python -I -X utf8 scripts/build_muni.py data/pt web
出力（web/）:
  muni.json           市区町村（の単位）ごとの名前・ラベル位置・数と、市区町村間の OD（向きつき）
  muni_areas.geojson  市区町村（の単位）の形
  stations.json       乗降客数の多い駅（名前・位置）
  rail.geojson        鉄道路線（都市圏の範囲で切り抜き、簡略化）

市区町村の単位: d-1 は計画基本ゾーン単位なので、ゾーンを市区町村ごとにまとめる。政令市は区ごと。
計画基本ゾーンが複数の町村にまたがるところ（16ゾーン。埼玉県北西部・千葉県東部など）は、
またがる町村をつなげて1つの単位にする（例: 東松山市・吉見町）。小ゾーンの面積の2%未満のはみ出しは無視する。
手段は鉄道・バス・自動車・自転車・徒歩の5つ（二輪車・その他・不明は除く）。
「となり」は境界が接する単位（10m までのすき間は接するとみなす）。
"""
import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from build_pt import label_point, read_d1  # noqa: E402

MODES = ["鉄道", "バス", "自動車", "自転車", "徒歩"]
MIN_N = 5136  # 相対誤差30%の目安
CENTER = ["千代田区", "中央区", "港区", "新宿区", "渋谷区"]
N_STATIONS = 60


def units_of(kz: gpd.GeoDataFrame, sz: gpd.GeoDataFrame):
    """計画基本ゾーン → 市区町村の単位（またがる町村はつなげる）"""
    sz = sz.copy()
    sz["kzone"] = gpd.sjoin(sz.assign(geometry=sz.representative_point()), kz[["kzone", "geometry"]],
                            predicate="within", how="left")["kzone"]
    sz["a"] = sz.area
    g = sz.groupby(["kzone", "JisCode", "CityName"]).a.sum().reset_index()
    g["sh"] = g.a / g.groupby("kzone").a.transform("sum")
    g = g[g.sh >= 0.02]
    # 町村をつなぐ（union-find）
    parent = {j: j for j in g.JisCode}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for _, h in g.groupby("kzone"):
        js = list(h.JisCode)
        for j in js[1:]:
            parent[find(j)] = find(js[0])
    g["u"] = g.JisCode.map(find)
    # 単位の名前: 面積の大きい順に市区町村名をつなぐ
    area = sz.groupby(["JisCode", "CityName"]).a.sum().reset_index()
    area["u"] = area.JisCode.map(lambda j: find(j) if j in parent else None)
    area = area.dropna(subset=["u"]).sort_values("a", ascending=False)
    names = area.groupby("u").CityName.apply(lambda s: "・".join(dict.fromkeys(s)))
    k2u = g.sort_values("a", ascending=False).drop_duplicates("kzone").set_index("kzone").u
    return k2u, names


def main(src: Path, web: Path):
    zones = json.loads((web / "zones.json").read_text(encoding="utf-8"))
    codes = [z["c"] for z in zones]

    kz = gpd.read_file(src / "H30_gis/H30_kzone.shp")
    kz["kzone"] = kz["kzone"].astype(str).str.zfill(4)
    kz["geometry"] = kz.geometry.buffer(0)
    kz = kz.dissolve(by="kzone").loc[codes].reset_index()
    sz = gpd.read_file(src / "H30_gis/H30_szone.shp", encoding="cp932").to_crs(kz.crs)
    k2u, names = units_of(kz, sz)
    kz["u"] = kz.kzone.map(k2u)
    assert kz.u.notna().all()

    mu = kz.dissolve(by="u").reset_index()[["u", "geometry"]]
    mu["n"] = mu.u.map(names)
    nu = len(mu)
    uidx = {u: i for i, u in enumerate(mu.u)}
    k2i = {k: uidx[u] for k, u in zip(kz.kzone, kz.u)}

    # となり
    b = mu[["u", "geometry"]].copy()
    b["geometry"] = b.geometry.buffer(10)
    sj = gpd.sjoin(mu[["u", "geometry"]], b, predicate="intersects")
    adj = {(uidx[x], uidx[y]) for x, y in zip(sj.u_left, sj.u_right) if x != y}

    # OD
    df = read_d1(src / "d-1.zip")
    df = df[(df["目的種類"] == "自宅－私事") & df["発地"].isin(k2i) & df["着地"].isin(k2i)].copy()
    df["v"] = df[MODES].astype(float).sum(axis=1)
    df["o"] = df["発地"].map(k2i)
    df["d"] = df["着地"].map(k2i)
    od = df.groupby(["o", "d"]).v.sum().reset_index()
    od = od[od.v > 0]
    intra = np.zeros(nu)
    m = od.o == od.d
    np.add.at(intra, od.o[m], od.v[m])
    pairs = od[~m].sort_values("v", ascending=False).reset_index(drop=True)
    pairs["adj"] = [(o, d) in adj for o, d in zip(pairs.o, pairs.d)]
    near = np.zeros(nu)
    far = np.zeros(nu)
    np.add.at(near, pairs.o[pairs.adj], pairs.v[pairs.adj])
    np.add.at(far, pairs.o[~pairs.adj], pairs.v[~pairs.adj])
    center = [i for i, n in enumerate(mu.n) if n in CENTER]
    to_center = pairs[pairs.d.isin(center) & ~pairs.o.isin(center)].v.sum()

    pts = gpd.GeoSeries([label_point(g) for g in mu.geometry], crs=mu.crs).to_crs(4326)
    total = float(od.v.sum())
    out = {
        "units": [
            {"n": n, "x": round(float(p.x), 4), "y": round(float(p.y), 4),
             "intra": int(round(intra[i])), "near": int(round(near[i])), "far": int(round(far[i]))}
            for i, (n, p) in enumerate(zip(mu.n, pts))
        ],
        "o": pairs.o.tolist(), "d": pairs.d.tolist(), "v": pairs.v.round().astype(int).tolist(),
        "adj": pairs.adj.astype(int).tolist(),
        "total": {"trips": int(total), "intra": int(intra.sum()), "near": int(near.sum()), "far": int(far.sum()),
                  "to_center": int(to_center)},
        "min_n": MIN_N,
    }
    (web / "muni.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    areas = mu.assign(i=range(nu))[["i", "geometry"]].copy()
    areas["geometry"] = areas.geometry.simplify(30)
    (web / "muni_areas.geojson").write_text(areas.to_crs(4326).to_json(drop_id=True, to_wgs84=True), encoding="utf-8")

    # 主な駅: 同じ名前で 1.5km 以内の駅（会社ちがい）をまとめ、乗降客数（2018年）の多い順に
    st = gpd.read_file(src / "S12/S12-23_NumberOfPassengers.shp", encoding="utf-8").to_crs(kz.crs)
    st = st.assign(geometry=st.geometry.centroid, r=pd.to_numeric(st["S12_037"], errors="coerce").fillna(0))
    st = st[st.within(mu.union_all())]
    rows = []
    for name, h in st.groupby("S12_001"):
        h = h.sort_values("r", ascending=False)
        used = np.zeros(len(h), bool)
        xy = np.c_[h.geometry.x, h.geometry.y]
        for k in range(len(h)):
            if used[k]:
                continue
            near_k = (~used) & (np.hypot(*(xy - xy[k]).T) < 1500)
            used |= near_k
            w = h.r.to_numpy()[near_k]
            rows.append({"n": name, "r": w.sum(), "x": xy[near_k, 0].mean(), "y": xy[near_k, 1].mean()})
    top = pd.DataFrame(rows).sort_values("r", ascending=False).head(N_STATIONS)
    p = gpd.GeoSeries(gpd.points_from_xy(top.x, top.y), crs=kz.crs).to_crs(4326)
    stations = [{"n": n, "r": int(r), "x": round(float(q.x), 4), "y": round(float(q.y), 4)} for n, r, q in zip(top.n, top.r, p)]
    (web / "stations.json").write_text(json.dumps(stations, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    rail = gpd.read_file(src.parent / "n02/N02-24_RailroadSection.shp", encoding="utf-8").to_crs(kz.crs)
    rail = gpd.clip(rail[["geometry"]], mu.union_all().buffer(500))
    rail["geometry"] = rail.geometry.simplify(20)
    rail = rail[~rail.geometry.is_empty]
    (web / "rail.geojson").write_text(rail.to_crs(4326).to_json(drop_id=True, to_wgs84=True), encoding="utf-8")

    t = out["total"]
    print(f"市区町村の単位 {nu}（うち、町村をつないだもの {sum('・' in n for n in mu.n)}）")
    print(f"自宅→私事 {total:,.0f}: 同じ市区町村 {t['intra'] / total:.1%}  となり {t['near'] / total:.1%}  その先 {t['far'] / total:.1%}"
          f"  都心5区へ（5区の外から） {to_center / total:.1%}")
    print(f"向きつきの組 {len(pairs):,}、{MIN_N}以上 {(pairs.v >= MIN_N).sum()}、2000以上 {(pairs.v >= 2000).sum()}、1000以上 {(pairs.v >= 1000).sum()}")
    print(pairs.head(10).assign(o=lambda x: x.o.map(mu.n), d=lambda x: x.d.map(mu.n)).to_string())
    print("駅:", " ".join(s["n"] for s in stations[:30]))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
