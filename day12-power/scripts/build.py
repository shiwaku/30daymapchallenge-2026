"""国別の発電量の伸びと、IEA のデータセンター（DC）需要の見通しから、ビューワのデータを作る。

python -I -X utf8 scripts/build.py data web

入力
- data/ember/yearly_global.csv   Ember Yearly Electricity Data（CC BY 4.0）
- data/ne/ne_50m_admin_0_countries.shp   Natural Earth 1:50m 国の境界（パブリックドメイン）
出力（web/）
- countries.geojson  国ごとの値（g0=2014年の発電量, g1=2024年, d=10年間の増加 TWh, r=年平均伸び率 %,
                     p30=2030年まで伸び率を延ばした値, s=2000〜2024年の発電量の列）
- stats.json         IEA の4地域（米国・中国・欧州・日本）と世界の比較、世界の合計など
"""
import json
import pathlib
import sys

import geopandas as gpd
import pandas as pd
import shapely

Y0, Y1, Y_DC0, Y_DC1 = 2014, 2024, 2024, 2030
SERIES_FROM = 2000
# 表示名（Natural Earth の NAME_JA を、ふだんの短い呼び方に直す）
NAME_JA = {"USA": "米国", "CHN": "中国", "TWN": "台湾", "KOR": "韓国", "PRK": "北朝鮮", "GBR": "英国", "XKX": "コソボ"}

# IEA Energy and AI（2025）, Base Case。2024→2030年のデータセンターの電力消費の増加量（TWh、本文の値）
# https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai
IEA_DC = [
    {"key": "USA", "ember": "United States", "name": "米国", "inc": 240, "pct": 130},
    {"key": "CHN", "ember": "China", "name": "中国", "inc": 175, "pct": 170},
    {"key": "EUR", "ember": "Europe", "name": "欧州", "inc": 45, "pct": 70, "note": "IEA の「欧州」の範囲は本文にない。発電量は Ember の Europe（欧州全体）"},
    {"key": "JPN", "ember": "Japan", "name": "日本", "inc": 15, "pct": 80},
    {"key": "WLD", "ember": "World", "name": "世界", "inc": 530, "pct": None},
]


def main() -> None:
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    d = pd.read_csv(src / "ember" / "yearly_global.csv")
    t = d[d["Electricity source"] == "Total generation"]
    gen = t.pivot_table(index="Area", columns="Year", values="Generation (TWh)")
    iso = t.dropna(subset=["ISO 3 code"]).groupby("Area")["ISO 3 code"].first()
    cty = t[t["Area type"] == "Country or economy"].Area.unique()

    def row(area: str) -> dict | None:
        s = gen.loc[area]
        g0, g1 = s.get(Y0), s.get(Y1)
        if pd.isna(g0) or pd.isna(g1) or g0 <= 0:
            return None
        r = (g1 / g0) ** (1 / (Y1 - Y0)) - 1
        return {
            "g0": round(float(g0), 1), "g1": round(float(g1), 1), "d": round(float(g1 - g0), 1),
            "r": round(r * 100, 2), "per_year": round(float(g1 - g0) / (Y1 - Y0), 1),
            "p30": round(float(g1 * (1 + r) ** (Y_DC1 - Y1)), 1),
            "s": [None if pd.isna(s.get(y)) else round(float(s.get(y)), 1) for y in range(SERIES_FROM, Y1 + 1)],
        }

    vals = {}
    for a in cty:
        v = row(a)
        if v and a in iso.index:
            vals[iso[a]] = {"name_en": a, **v}
    print("countries with values", len(vals))

    # ---- 国の形 ----
    ne = gpd.read_file(src / "ne" / "ne_50m_admin_0_countries.shp")
    # ISO_A3 が -99 の国（フランス・ノルウェーなど）は ISO_A3_EH、それもなければ ADM0_A3
    code = ne.ISO_A3.where(ne.ISO_A3 != "-99", ne.ISO_A3_EH)
    code = code.where(code != "-99", ne.ADM0_A3)
    ne["iso"] = code.replace({"KOS": "XKX"})  # コソボは Ember が XKX
    ne = ne[ne.iso != "ATA"]  # 南極は描かない
    ne["geometry"] = ne.geometry.simplify(0.02)
    ne["geometry"] = shapely.set_precision(ne.geometry.values, 0.001)
    missing = sorted(set(vals) - set(ne.iso))
    print("Ember にあって地図にない:", [(k, vals[k]["name_en"]) for k in missing])
    feats = []
    for _, r in ne.iterrows():
        v = vals.get(r.iso)
        props = {"iso": r.iso, "name": NAME_JA.get(r.iso) or (r.NAME_JA if isinstance(r.NAME_JA, str) and r.NAME_JA else r.NAME)}
        if v:
            props.update({k: v[k] for k in ("g0", "g1", "d", "r", "per_year", "p30", "s")})
        feats.append({"type": "Feature", "properties": props, "geometry": shapely.geometry.mapping(r.geometry)})
    (out / "countries.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    # ---- IEA の地域との比較 ----
    comp = []
    for x in IEA_DC:
        v = row(x["ember"])
        dc_per_year = x["inc"] / (Y_DC1 - Y_DC0)
        comp.append({
            **{k: x[k] for k in ("key", "name", "inc", "pct")}, "note": x.get("note"),
            "g1": v["g1"], "d": v["d"], "per_year": v["per_year"], "r": v["r"],
            "dc_per_year": round(dc_per_year, 1),
            # 発電の伸び（直近10年の年平均の増加）に対する、DC 需要の伸びの比。発電が増えていなければ None
            "ratio": round(dc_per_year / v["per_year"], 3) if v["per_year"] > 0.5 else None,
        })
    # 発電の伸びを測る期間を変えたときの割合（結論が期間の取り方に左右されないかの確認）
    WINDOWS = [(2014, 2024), (2015, 2025), (2019, 2024), (2009, 2024)]
    sens = {}
    for x in IEA_DC[:4]:
        sg = gen.loc[x["ember"]]
        rows_ = []
        for a0, a1 in WINDOWS:
            py = (sg[a1] - sg[a0]) / (a1 - a0)
            rows_.append({"y0": a0, "y1": a1, "per_year": round(float(py), 1),
                          "ratio": round(x["inc"] / 6 / float(py), 3) if py > 0.5 else None})
        sens[x["key"]] = rows_
    # 10年後の見通し（中国と米国）。過去10年（2014→2024）の伸びをそのまま延ばした2通り。公式の見通しではない
    #   lin: 毎年同じ量だけ増える（2014→2024 の年あたり増加量）
    #   cagr: 毎年同じ率で増える（2014→2024 の年平均伸び率）
    Y_OUT = Y1 + 10
    outlook = {"from": SERIES_FROM, "base": Y1, "to": Y_OUT, "areas": {}}
    for key, area in (("CHN", "China"), ("USA", "United States"), ("IND", "India")):
        sg = gen.loc[area]
        g0, g1 = float(sg[Y0]), float(sg[Y1])
        step, r = (g1 - g0) / (Y1 - Y0), (g1 / g0) ** (1 / (Y1 - Y0)) - 1
        outlook["areas"][key] = {
            "actual": [round(float(sg[y]), 1) for y in range(SERIES_FROM, Y1 + 1)],
            "lin": [round(g1 + step * k, 1) for k in range(0, Y_OUT - Y1 + 1)],
            "cagr": [round(g1 * (1 + r) ** k, 1) for k in range(0, Y_OUT - Y1 + 1)],
            "r": round(r * 100, 2),
        }
    a_c, a_u = outlook["areas"]["CHN"], outlook["areas"]["USA"]
    outlook["ratio_now"] = round(a_c["actual"][-1] / a_u["actual"][-1], 2)
    outlook["ratio_lin"] = round(a_c["lin"][-1] / a_u["lin"][-1], 2)
    outlook["ratio_cagr"] = round(a_c["cagr"][-1] / a_u["cagr"][-1], 2)
    top = sorted(vals.items(), key=lambda kv: -kv[1]["d"])
    stats = {
        "years": [Y0, Y1], "dc_years": [Y_DC0, Y_DC1], "series_from": SERIES_FROM,
        "n_countries": len(vals),
        "world": row("World"),
        "compare": comp,
        "sensitivity": sens,
        "outlook": outlook,
        "top_increase": [{"iso": k, "name_en": v["name_en"], "d": v["d"]} for k, v in top[:12]],
        "top_decrease": [{"iso": k, "name_en": v["name_en"], "d": v["d"]} for k, v in top[::-1][:8]],
        "sources": {
            "ember": "Ember Yearly Electricity Data（release_generation_yearly_global.csv、2026-11-07 取得）",
            "iea": "IEA (2025) Energy and AI, Energy demand from AI（Base Case）",
            "ne": "Natural Earth 1:50m Admin 0 Countries",
        },
    }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: stats[k] for k in ("compare", "top_increase", "top_decrease")}, ensure_ascii=False, indent=0))


if __name__ == "__main__":
    main()
