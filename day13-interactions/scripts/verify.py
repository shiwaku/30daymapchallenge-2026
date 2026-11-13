"""OD 量図のデータ（web/muni.json）が表d-1 と公表値に合っているかを確かめる。

使い方: python -I -X utf8 scripts/verify.py data/pt web
確かめること:
  1. 表d-1 の全計行が、協議会の公表値（提言本編 図2-14 目的別・図2-16 代表交通手段別、2018年）と合う
  2. 表d-1 のゾーン別の行を足すと、表d-1 自身の合計行（圏域内合計・都県別）と合う
  3. 市区町村にまとめても、トリップが漏れたり二重に数えられたりしていない
  4. muni.json の市区町村間の値が、build_muni.py とは別の方法（ゾーン名の市区町村名）で足し直した値と合う
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from build_pt import read_d1  # noqa: E402

MODES5 = ["鉄道", "バス", "自動車", "自転車", "徒歩"]
ALL = ["鉄道", "バス", "自動車", "２輪車", "自転車", "徒歩", "その他", "不明", "計"]
ok_all = True


def check(name: str, a: float, b: float, tol: float):
    global ok_all
    good = abs(a - b) <= tol
    ok_all &= good
    print(f"  {'OK ' if good else 'NG '} {name}: {a:,.1f} / {b:,.1f}（差 {a - b:,.1f}、許容 {tol:,.1f}）")


def main(src: Path, web: Path):
    df = read_d1(src / "d-1.zip")
    for c in ALL:
        df[c] = df[c].astype(float)
    code = lambda s: s.str.split(" ").str[0]  # noqa: E731
    df["o"] = code(df["発地"])
    df["d"] = code(df["着地"])
    zones = json.loads((web / "zones.json").read_text(encoding="utf-8"))
    zc = {z["c"] for z in zones}
    mu = json.loads((web / "muni.json").read_text(encoding="utf-8"))

    print("1. 表d-1 の全計（8888→8888）と協議会の公表値（万トリップ、提言本編 p.14 図2-14・p.15 図2-16）")
    g = df[(df.o == "8888") & (df.d == "8888")].set_index("目的種類")
    pub_p = {"通勤": (["自宅－勤務"], 1365), "通学": (["自宅－通学"], 497), "業務": (["自宅－業務", "勤務・業務"], 326),
             "私事": (["自宅－私事", "私事"], 2011), "帰宅": (["帰宅"], 3113)}
    for k, (rows, v) in pub_p.items():
        check(f"目的 {k}", g.loc[rows, "計"].sum() / 1e4, v, 0.5)
    pub_m = {"鉄道": 2418, "バス": 207, "自動車": 1970, "２輪車": 99, "自転車": 921, "徒歩": 1658}
    for m, v in pub_m.items():
        check(f"手段 {m}", g.loc["計", m] / 1e4, v, 0.5)

    s = df[df["目的種類"] == "自宅－私事"]
    print("\n2. 表d-1 自宅－私事: ゾーン別の行の合計と、表の合計行")
    zz = s[s.o.isin(zc) & s.d.isin(zc)]
    total5 = zz[MODES5].sum().sum()
    inside = s[(s.o == "8600") & (s.d == "8600")]
    print(f"  圏域内合計（8600→8600）5手段 {inside[MODES5].sum().sum():,.0f}、うち 615ゾーンどうし {total5:,.0f}"
          f"（差 {inside[MODES5].sum().sum() - total5:,.0f} は「○○（その他）」「以下不明」のゾーンに入るトリップ）")
    # 計画基本ゾーンと「（その他）」「以下不明」のコードを足すと、圏域内合計に一致する
    detail = s[~s.o.str.match(r"^(7|8|9)\d{3}$") & ~s.d.str.match(r"^(7|8|9)\d{3}$")]
    check("ゾーン＋その他＋以下不明 の合計 = 圏域内合計（計）", detail["計"].sum(), inside["計"].sum(), 1)

    print("\n3. 市区町村にまとめた muni.json の保存")
    tot_m = sum(u["intra"] for u in mu["units"]) + sum(mu["v"])
    check("同じ市区町村 + 市区町村間 = 615ゾーンどうしの合計", tot_m, total5, len(mu["units"]) + len(mu["v"]))
    check("total.trips", mu["total"]["trips"], total5, 1)
    check("各市区町村の発地合計（intra+near+far）", sum(u["intra"] + u["near"] + u["far"] for u in mu["units"]), total5,
          3 * len(mu["units"]))
    pairs = pd.DataFrame({"o": mu["o"], "d": mu["d"]})
    print(f"  {'OK ' if not pairs.duplicated().any() and (pairs.o != pairs.d).all() else 'NG '}"
          f" 市区町村間の組 {len(pairs):,}（重複なし・同じ市区町村どうしなし）")

    print("\n4. 別の方法で足し直す（ゾーン名の先頭の市区町村名で、町村をつないでいない単位だけ）")
    names = [u["n"] for u in mu["units"]]
    single = {n for n in names if "・" not in n}
    zname = {z["c"]: z["n"].split("（")[0] for z in zones}
    zz = zz.assign(om=zz.o.map(zname), dm=zz.d.map(zname), v=zz[MODES5].sum(axis=1))
    zz = zz[zz.om.isin(single) & zz.dm.isin(single) & (zz.om != zz.dm)]
    alt = zz.groupby(["om", "dm"]).v.sum()
    got = pd.Series(mu["v"], index=pd.MultiIndex.from_arrays([[names[i] for i in mu["o"]], [names[i] for i in mu["d"]]]))
    got = got[[o in single and d in single for o, d in got.index]]
    j = pd.concat([alt.rename("alt"), got.rename("muni")], axis=1).fillna(0)
    diff = (j.alt - j.muni).abs()
    bad = j[diff > 1]
    global ok_all
    ok_all &= bad.empty
    print(f"  {'OK ' if bad.empty else 'NG '} {len(j):,} 組を比べ、差が1トリップを超える組 {len(bad)}"
          f"（最大の差 {diff.max():.1f}。四捨五入のずれ）")
    for o, d in [("世田谷区", "渋谷区"), ("三鷹市", "武蔵野市"), ("川越市", "さいたま市大宮区"), ("板橋区", "豊島区")]:
        print(f"    {o}→{d}: 足し直し {j.alt.get((o, d), 0):,.0f} / muni.json {j.muni.get((o, d), 0):,.0f}")
    if not bad.empty:
        print(bad.head(10))

    print("\n結果:", "すべて OK" if ok_all else "NG あり")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
