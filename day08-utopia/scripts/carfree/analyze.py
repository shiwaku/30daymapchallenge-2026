"""車に頼らず暮らせる所（全国・250mメッシュ）。

ITDP（Atlas of Sustainable City Transport / pedestriansfirst）の2つの指標を国内のデータで計算する。
- 公共交通: 1時間に6本以上（ITDP は 7〜21時の平均10分間隔、上下合算）の駅まで500m以内
- 生活施設: 学校と医療機関の両方が1,000m以内（ITDP の定義）
- 食料品店: スーパーか生鮮食品店（青果・鮮魚・精肉）が1,000m以内（ITDP にはない。国内向けに足した）
距離はメッシュの中心から点までの直線距離（大圏距離）。ITDP は道のりで測るので、こちらは広めに出る。

使い方: python -I -X utf8 analyze.py <day08 の data フォルダ> <出力フォルダ>
"""
import glob
import json
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
from scipy.spatial import cKDTree

data = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
R = 6371008.8

FREQ_PER_DAY = 108  # 1時間6本 × 18時間（6〜24時。Day 2 と同じならし方）
D_TRANSIT = 500
D_SERVICE = 1000
SCHOOL = {"16001", "16002", "16003", "16004", "16011", "16012", "16013", "16014"}  # 幼・小・中・中等・高・特支・こども園・義務
HEALTH = {1, 2}  # 病院・一般診療所（歯科は ITDP も含めない）


# ---- メッシュ人口 ----
def mesh_center(code: pd.Series):
    c = code.str
    a, b = c[0:2].astype(int), c[2:4].astype(int)
    p, q = c[4].astype(int), c[5].astype(int)
    r, s = c[6].astype(int), c[7].astype(int)
    m4, m5 = c[8].astype(int), c[9].astype(int)
    lat = a / 1.5 + p / 12 + r / 120 + (m4 >= 3) / 240 + (m5 >= 3) / 480 + 1 / 960
    lon = 100 + b + q / 8 + s / 80 + (m4 % 2 == 0) / 160 + (m5 % 2 == 0) / 320 + 1 / 640
    return lat.to_numpy(), lon.to_numpy()


rows = []
for f in sorted(glob.glob(str(data / "mesh250/*.zip"))):
    z = zipfile.ZipFile(f)
    df = pd.read_csv(z.open(z.namelist()[0]), encoding="cp932", skiprows=[1], dtype=str,
                     usecols=["KEY_CODE", "T001142001"])
    rows.append(df)
mesh = pd.concat(rows, ignore_index=True)
mesh["pop"] = pd.to_numeric(mesh["T001142001"], errors="coerce").fillna(0).astype(int)
mesh = mesh[mesh["pop"] > 0].drop(columns="T001142001").rename(columns={"KEY_CODE": "code"})
mesh["lat"], mesh["lon"] = mesh_center(mesh["code"])
print("メッシュ", len(mesh), "人口", mesh["pop"].sum())

# ---- 駅 ----
st = gpd.read_file(data / "rail/unkohonsu2026_eki.geojson")
st["dep"] = pd.to_numeric(st["両方向発計"], errors="coerce").fillna(0)
# 事業者ごとに分かれている同じ駅（同じ駅名で300m以内）は本数を足す。乗り換えて使えるため
sm = st.to_crs(6933)
parent = list(range(len(sm)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for _, grp in sm.groupby("駅名"):
    ids = grp.index.tolist()
    for i in ids:
        for j in ids:
            if i < j and grp.geometry[i].distance(grp.geometry[j]) <= 300:
                parent[find(j)] = find(i)
st["grp"] = [find(i) for i in range(len(st))]
st["dep_sum"] = st.groupby("grp")["dep"].transform("sum")
freq = st[st["dep_sum"] >= FREQ_PER_DAY]
print("駅", len(st), "1時間6本以上", len(freq))

# ---- 学校・医療機関 ----
sc = gpd.read_file(data / "ksj/p29/P29-23_GML/P29-23.geojson")
sc = sc[sc["P29_003"].isin(SCHOOL) & (sc["P29_007"] != "2")]
hc = gpd.read_file(data / "ksj/p04/P04-20_GML/P04-20.geojson")
hc = hc[hc["P04_001"].isin(HEALTH)]
print("学校", len(sc), "医療機関", len(hc))


# ---- 食料品店（japan-food-store-master のスーパーと生鮮食品店） ----
# 地図は公開できるレイヤ（Overture Places＋食品営業許可。All the Places を含まない）で塗る。
# 割合の数字は ATP 基準マスター（チェーン公式サイト由来＋Overture・OSM・許可で補う。網羅がよい）で出す。
# ATP 由来の店は位置が分かる形で出せないので、市区町村・都道府県・全国の割合にだけ使う
FOOD_CATS = {"supermarket", "fresh_food"}


def food(name):
    f = pd.read_parquet(data / f"food/{name}.parquet", columns=["cat", "lat", "lng"])
    f = f[f["cat"].isin(FOOD_CATS)]
    print(name, len(f), f["cat"].value_counts().to_dict())
    return gpd.GeoDataFrame(f, geometry=gpd.points_from_xy(f["lng"], f["lat"]), crs=6668)


gr_pub = food("food_store_master_public_noosm")
gr_atp = food("food_store_master_atp_permit")


def xyz(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.c_[np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)]


MXYZ = xyz(mesh["lat"].to_numpy(), mesh["lon"].to_numpy())


def nearest(pts: gpd.GeoDataFrame):
    tree = cKDTree(xyz(pts.geometry.y.to_numpy(), pts.geometry.x.to_numpy()))
    chord, _ = tree.query(MXYZ, k=1)
    return 2 * R * np.arcsin(np.clip(chord / 2, 0, 1))


mesh["d_rail"] = nearest(freq)
mesh["d_school"] = nearest(sc)
mesh["d_health"] = nearest(hc)
mesh["d_grocery_pub"] = nearest(gr_pub)
mesh["d_grocery_atp"] = nearest(gr_atp)
mesh["transit"] = mesh["d_rail"] <= D_TRANSIT
mesh["service_itdp"] = (mesh["d_school"] <= D_SERVICE) & (mesh["d_health"] <= D_SERVICE)
mesh["both_itdp"] = mesh["transit"] & mesh["service_itdp"]
# 地図用（公開できるレイヤ）
mesh["service"] = mesh["service_itdp"] & (mesh["d_grocery_pub"] <= D_SERVICE)
# 数字用（ATP 基準）
mesh["service_atp"] = mesh["service_itdp"] & (mesh["d_grocery_atp"] <= D_SERVICE)
mesh["both_atp"] = mesh["transit"] & mesh["service_atp"]
mesh["both"] = mesh["transit"] & mesh["service"]

# ---- 市区町村 ----
n03 = pyogrio.read_dataframe(data / "n03/N03-20260101.shp", columns=["N03_001", "N03_003", "N03_004", "N03_007"])
n03 = n03.set_crs(6668, allow_override=True)
pts = gpd.GeoDataFrame(mesh[["code"]], geometry=gpd.points_from_xy(mesh["lon"], mesh["lat"]), crs=6668)
j = gpd.sjoin(pts, n03, how="left", predicate="within")
j = j[~j.index.duplicated()]
mesh["pref"] = j["N03_001"]
mesh["city"] = j["N03_004"]
mesh["jcode"] = j["N03_007"]
miss = mesh["pref"].isna()
print("市区町村に入らなかったメッシュ（海岸沿い。いちばん近い市区町村に入れる）", miss.sum(), "人口", mesh.loc[miss, "pop"].sum())
pm = pts[miss.to_numpy()].to_crs(6933)
jn = gpd.sjoin_nearest(pm, n03.to_crs(6933), how="left")
jn = jn[~jn.index.duplicated()]
mesh.loc[miss, "pref"] = jn["N03_001"]
mesh.loc[miss, "city"] = jn["N03_004"]
mesh.loc[miss, "jcode"] = jn["N03_007"]

mesh.to_parquet(out / "mesh_carfree.parquet")


def share(g):
    p = g["pop"].sum()
    return pd.Series({
        "pop": p,
        "transit": g.loc[g["transit"], "pop"].sum() / p,
        # service・both・grocery は ATP 基準の店で数える。both_map は地図に塗った（公開できるレイヤの）割合
        "service": g.loc[g["service_atp"], "pop"].sum() / p,
        "both": g.loc[g["both_atp"], "pop"].sum() / p,
        "both_itdp": g.loc[g["both_itdp"], "pop"].sum() / p,
        "both_map": g.loc[g["both"], "pop"].sum() / p,
        "grocery": g.loc[g["d_grocery_atp"] <= D_SERVICE, "pop"].sum() / p,
    })


nat = share(mesh)
print("全国", nat.to_dict())
city = mesh.dropna(subset=["city"]).groupby(["pref", "city"]).apply(share, include_groups=False).reset_index()
city.to_csv(out / "city_carfree.csv", index=False, encoding="utf-8")
pref = mesh.dropna(subset=["pref"]).groupby("pref").apply(share, include_groups=False).reset_index()
pref.to_csv(out / "pref_carfree.csv", index=False, encoding="utf-8")
json.dump({k: float(v) for k, v in nat.items()}, open(out / "national.json", "w"), ensure_ascii=False)
