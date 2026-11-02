# -*- coding: utf-8 -*-
"""東京都市圏PT H30 基礎集計 b-4（ゾーン別時刻別滞留人口）を計画基本ゾーンに結合する。

入力:
  B4_CSV   : e-Stat / tokyo-pt.jp 配布の b-4.csv（cp932、先頭5行見出し、":0010" 形式のゾーンコード）
  KZONE_SHP: H30_kzone.shp（属性 kzone、EPSG:6677）
  SZONE_SHP: H30_szone.shp（属性 CityName, JisCode, szone、EPSG:6677）
出力:
  OUT_GPKG : レイヤ kzone_b4（計画基本ゾーン＋時刻別滞留人口）、szone（小ゾーン＋親 kzone）
  OUT_CSV  : 整形済みの表（UTF-8、集計行含む）
QGIS の Python コンソール等で run() を呼ぶか、このファイルを exec して実行する。
"""
import csv, io, os
import geopandas as gpd
import pandas as pd

BASE = os.environ.get("PT_BASE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # 既定は day03-polygons/
B4_CSV = os.path.join(BASE, "data", "raw", "b-4.csv")
KZONE_SHP = os.path.join(BASE, "data", "raw", "H30_gis", "H30_kzone.shp")
SZONE_SHP = os.path.join(BASE, "data", "raw", "H30_gis", "H30_szone.shp")
OUT_GPKG = os.path.join(BASE, "data", "pt_h30_zones_b4.gpkg")
OUT_CSV = os.path.join(BASE, "data", "pt_h30_b4_tidy.csv")


def col_name(label):
    """'3時台以前'->p03_pre, '14時台'->p14, '27時台以降'->p27_post, '時刻不明'->p_unknown"""
    if label == "時刻不明":
        return "p_unknown"
    h = int(label.split("時")[0])
    if "以前" in label:
        return "p%02d_pre" % h
    if "以降" in label:
        return "p%02d_post" % h
    return "p%02d" % h


def read_b4(path):
    with open(path, encoding="cp932", newline="") as fh:
        rows = list(csv.reader(fh))
    labels = rows[3][1:]
    cols = [col_name(l) for l in labels]
    recs = []
    for r in rows[5:]:
        if not r or not r[0].startswith(":"):
            continue
        key = r[0][1:]
        code, name = key[:4], key[4:]
        vals = [int(v.replace(",", "")) if v.strip() not in ("", "-") else None for v in r[1:1 + len(cols)]]
        recs.append({"code": code, "name": name, **dict(zip(cols, vals))})
    return pd.DataFrame(recs), cols, labels


def run():
    df, cols, labels = read_b4(B4_CSV)
    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")

    zones = df[df["name"] == ""].copy()          # 計画基本ゾーン（名前なし行）
    zones["kzone"] = zones["code"].astype(int)
    hour_cols = [c for c in cols if c != "p_unknown"]

    kz = gpd.read_file(KZONE_SHP)
    kz["kzone"] = kz["kzone"].astype(int)
    out = kz.merge(zones.drop(columns=["code", "name"]), on="kzone", how="left", indicator=True)
    unmatched_shp = out.loc[out["_merge"] == "left_only", "kzone"].tolist()
    unmatched_csv = sorted(set(zones["kzone"]) - set(kz["kzone"]))
    out = out.drop(columns="_merge")

    out["area_km2"] = out.geometry.area / 1e6
    out["dens_p14"] = out["p14"] / out["area_km2"]                 # 14時台 人/km²
    night = out["p03_pre"].where(out["p03_pre"] > 0)
    out["day_night"] = out["p14"] / night                          # 昼夜比（14時台 / 3時台以前）
    hv = out[hour_cols]
    out["peak_pop"] = hv.max(axis=1)
    out["peak_col"] = hv.idxmax(axis=1)
    out["min_pop"] = hv.min(axis=1)

    sz = gpd.read_file(SZONE_SHP)
    pts = sz.copy()
    pts["geometry"] = sz.geometry.representative_point()
    j = gpd.sjoin(pts, kz[["kzone", "geometry"]], how="left", predicate="within")
    sz["kzone"] = j["kzone"].values

    if os.path.exists(OUT_GPKG):
        os.remove(OUT_GPKG)
    out.to_file(OUT_GPKG, layer="kzone_b4", driver="GPKG")
    sz.to_file(OUT_GPKG, layer="szone", driver="GPKG")

    return {"columns": cols, "labels": labels, "n_zone_rows": len(zones), "n_kzone": len(kz),
            "unmatched_shp": unmatched_shp, "unmatched_csv": unmatched_csv,
            "szone_without_kzone": int(sz["kzone"].isna().sum()),
            "aggregate_rows": df.loc[df["name"] != "", ["code", "name"]].values.tolist()}


if __name__ == "__main__":
    print(run())
