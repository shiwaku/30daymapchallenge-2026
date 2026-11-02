"""令和2年国勢調査 従業地・通学地集計 第3表（47都道府県分の Excel）から、市区町村間の OD 表を作る。

使い方: python -I -X utf8 scripts/prepare_od.py <xlsx のフォルダ> <出力フォルダ>
出力:
  od.csv       常住地コード, 従業地・通学地コード, 15歳以上就業者・通学者, うち就業者, うち通学者
  origins.csv  常住地ごとの内訳（15歳以上就業者・通学者の総数、自市区町村、他市区町村、不詳など）

- 単位は市区町村（政令指定都市は区、東京都は特別区）。地域識別コード 0（区）・2（市）・3（町村）だけを使い、
  a（都道府県）・1（政令市・特別区部の合計）は使わない
- 第3表の注1により、「他市区町村で従業・通学」の内訳で従業・通学先が「不詳・外国」の人は常住地と同じ
  市区町村に計上されている。この行（常住地 = 従業地）は OD に入れない
"""
import csv
import sys
from pathlib import Path

import openpyxl

FINE = {"0", "2", "3"}


def num(v):
    return v if isinstance(v, int) else 0


def code(s):
    return str(s).split("_", 1)[0]


def name(s):
    return str(s).split("_", 1)[1]


def main(src: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    od = open(out / "od.csv", "w", newline="", encoding="utf-8")
    ow = csv.writer(od)
    ow.writerow(["o", "d", "all15", "work15", "school15"])
    org = {}
    files = sorted(src.glob("*.xlsx"))
    for i, f in enumerate(files):
        wb = openpyxl.load_workbook(f, read_only=True)
        ws = wb.active
        n = 0
        for r in ws.iter_rows(min_row=11, values_only=True):
            if r[0] != "0_総数" or r[1] not in FINE:
                continue
            o = code(r[3])
            cat = str(r[5])
            if cat.startswith("02_") and r[6] in FINE:
                d = code(r[8])
                if d == o or num(r[10]) == 0:
                    continue
                ow.writerow([o, d, num(r[10]), num(r[11]), num(r[12])])
                n += 1
            elif r[6] == "a" and code(r[8]) == "00000":
                rec = org.setdefault(o, {"code": o, "pref": name(r[2]), "name": name(r[3])})
                rec[cat.split("_", 1)[0]] = num(r[10])
        wb.close()
        print(f"{i + 1}/{len(files)} {f.name} {n} flows", flush=True)
    od.close()
    keys = ["0", "01", "011", "012", "02", "021", "022", "023", "024", "03", "R1"]
    with open(out / "origins.csv", "w", newline="", encoding="utf-8") as fo:
        w = csv.writer(fo)
        w.writerow(["code", "pref", "name"] + ["c" + k for k in keys])
        for rec in org.values():
            w.writerow([rec["code"], rec["pref"], rec["name"]] + [rec.get(k, 0) for k in keys])
    print(len(org), "origins")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
