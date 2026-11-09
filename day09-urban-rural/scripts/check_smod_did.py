"""GHS-SMOD の「都市中心」（30）と「都市クラスター」（21〜30）を、国勢調査の人口集中地区（DID、国土数値情報 A16）と
東京・大阪のまわり（Natural Earth の点から上下左右60km、ghsl_top100.py と同じ範囲）で比べる。1975年と2020年。

使い方: python scripts/check_smod_did.py <DID を展開したフォルダ（{75,20}/{pref}/*.shp）> <都道府県界 parquet>
"""
import sys, glob
import numpy as np, geopandas as gpd, pandas as pd, rasterio
from rasterio.windows import from_bounds
from rasterio.features import rasterize
from rasterio.transform import Affine
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DID, ADM = sys.argv[1:3]
MOLL = "ESRI:54009"
SUB = 10  # 1km マスを 100m に割って DID の割合を出す
CITIES = {"東京": ["11", "12", "13", "14"], "大阪": ["25", "26", "27", "28", "29", "30"]}
ne = gpd.read_file(ROOT / "data/ne/ne_10m_populated_places.shp")
adm = gpd.read_parquet(ADM).to_crs(MOLL)

rows = []
for city, prefs in CITIES.items():
    pt = ne[ne.NAME_JA.isin([city + "都", city + "市", city])].nlargest(1, "POP_MAX").to_crs(MOLL).geometry.iloc[0]
    land = adm[adm.pref_code.astype(str).str.zfill(2).isin(prefs)].union_all()
    for yy, Y in [("75", 1975), ("20", 2020)]:
        with rasterio.open(ROOT / f"data/ghsl/GHS_SMOD_E{Y}_GLOBE_R2023A_54009_1000_V2_0.tif") as r:
            win = from_bounds(pt.x - 60_000, pt.y - 60_000, pt.x + 60_000, pt.y + 60_000, r.transform).round_offsets().round_lengths()
            smod = r.read(1, window=win)
            tr = r.window_transform(win)
        h, w = smod.shape
        fine = Affine(tr.a / SUB, 0, tr.c, 0, tr.e / SUB, tr.f)
        did = pd.concat([gpd.read_file(f) for p in prefs for f in glob.glob(f"{DID}/{yy}/{p}/*.shp")]).set_crs(4612, allow_override=True).to_crs(MOLL) \
            if Y == 1975 else pd.concat([gpd.read_file(f) for p in prefs for f in glob.glob(f"{DID}/{yy}/{p}/*.shp")]).to_crs(MOLL)
        frac = lambda g: rasterize([(x, 1) for x in g], out_shape=(h * SUB, w * SUB), transform=fine, dtype="uint8").reshape(h, SUB, w, SUB).mean(axis=(1, 3))
        fd, fl = frac(did.geometry), frac([land])
        m = fl >= 0.5  # 対象の府県の陸のマスだけ
        D = (fd >= 0.5) & m
        for name, S in [("都市中心(30)", (smod == 30) & m), ("都市クラスター(21-30)", (smod >= 21) & m)]:
            rows.append(dict(都市=city, 年=Y, SMOD=name, DID_km2=round(float((fd * m).sum())), SMOD_km2=int(S.sum()),
                             DIDマスのうちSMODに入る=f"{(D & S).sum() / D.sum():.0%}",
                             SMODマスのうちDIDが半分以上=f"{(D & S).sum() / S.sum():.0%}",
                             SMODマスのDID割合平均=f"{fd[S].mean():.0%}"))
out = pd.DataFrame(rows)
out.to_csv(ROOT / "data/check_smod_did.csv", index=False, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
print(out.to_string(index=False))
