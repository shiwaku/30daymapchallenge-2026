"""電子基準点日々の座標値（F5.1解）を、固定点に対する東西・南北・上下の変位にまとめる。

使い方: python -I scripts/build.py <coordinates_F5.1 を落としたフォルダ> <オフセット補正量 corrf5_1o.dat> <出力 .npz> [固定点の局番号]
出力: station（局番号）, name, t（年、小数）, lat0, lon0（各局の最初の位置）, de, dn, du（m）

加工は次の2つだけ。
1. 国土地理院のオフセット補正量（https://mekira.gsi.go.jp/JAPANESE/corrf5_1o.dat）を、
   「オフセット補正計算方法」（https://www.gsi.go.jp/kanshi/faq2_2.html）のとおり、保守作業の日以降に累積して加える。
   初期オフセット補正量（Z）は変動だけを見る場合は不要とされているので使わない。
2. 固定点（既定は福江）の動きを各局から引き、固定点に対する相対的な変位にする。
EXCLUDE の局は、地震と関係のない日に大きな跳びがあり、オフセット補正量にも載っていないので使わない（データは直さない）。
"""

import gzip
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

A = 6378137.0
F = 1 / 298.257222101
E2 = F * (2 - F)

FIXED = "950462"  # 福江（長崎県）

# 局番号: (局名, 跳びの大きさ, 時期)。README の「除外した電子基準点」と対応させる
EXCLUDE = {
    "950230": ("小田原", "水平6.2m・上下5.4m", "2001年7月"),
    "93093": ("大東１", "水平4.4m", "2001年7月"),
    "940061": ("中津川", "水平4.1m", "1997年12月"),
    "940041": ("いわき", "水平2.2m", "2001年8月"),
    "950191": ("象潟", "水平1.9m", "2001年7月"),
    "950441": ("東洋", "水平1.3m", "2001年8月"),
    "950477": ("日之影", "水平0.9m", "1996年3月"),
    "940093": ("千丁", "水平0.9m", "2026年7月"),
    "950304": ("常滑１", "水平0.8m", "2001年7月"),
}


def read_pos(path):
    sid = name = None
    rows = []
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        in_data = False
        for line in f:
            if line.startswith(" ID "):
                sid = line.split()[1]
            elif line.startswith(" J_NAME"):
                name = line.split(maxsplit=1)[1].strip()
            elif line.startswith("+DATA"):
                in_data = True
            elif line.startswith("-DATA"):
                break
            elif in_data and not line.startswith("*"):
                p = line.split()
                day = np.datetime64(f"{p[0]}-{p[1]}-{p[2]}")
                # 列: 年 月 日 時刻 X Y Z 緯度 経度 楕円体高
                rows.append((day, float(p[7]), float(p[8]), float(p[9])))
    return sid, name, rows


def read_offsets(path):
    """局番号 → [(日, 緯度の補正量（度）, 経度の補正量（度）, 高さの補正量（m）, 作業コード)]"""
    offsets = defaultdict(list)
    with open(path, encoding="cp932") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            site, day, _dx, _dy, _dz, db, dl, dh, code = line.strip().split(",")[:9]
            if code == "Z":
                continue
            offsets[site].append((np.datetime64(day.replace("/", "-")), float(db), float(dl), float(dh), code))
    return offsets


def to_enu(lat, lon, h, lat0, lon0, h0):
    """小さな変位なので、子午線・卯酉線の曲率半径で m に直す。"""
    phi = np.radians(lat0)
    w = np.sqrt(1 - E2 * np.sin(phi) ** 2)
    m = A * (1 - E2) / w**3
    n = A / w
    de = np.radians(lon - lon0) * (n + h0) * np.cos(phi)
    dn = np.radians(lat - lat0) * (m + h0)
    return de, dn, h - h0


def main():
    src, offset_path, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    fixed_sid = sys.argv[4] if len(sys.argv) > 4 else FIXED

    series = defaultdict(list)
    names = {}
    for f in sorted(src.glob("[12][0-9][0-9][0-9]/*.pos.gz")):
        sid, name, rows = read_pos(f)
        if sid and rows:
            series[sid].extend(rows)
            names[sid] = name
    print(f"{len(series)} 局を読み込み")

    offsets = read_offsets(offset_path)
    n_applied = 0
    corrected = {}
    for sid, rows in series.items():
        rows.sort()
        days = np.array([r[0] for r in rows])
        lat, lon, h = (np.array([r[i] for r in rows]) for i in (1, 2, 3))
        for day, db, dl, dh, _code in offsets.get(sid, []):
            after = days >= day
            lat[after] += db
            lon[after] += dl
            h[after] += dh
            n_applied += 1
        enu = np.column_stack(to_enu(lat, lon, h, lat[0], lon[0], h[0]))
        corrected[sid] = (days, lat[0], lon[0], enu)
    print(f"オフセット補正量を適用: {n_applied} 件")

    # 固定点の動きを各局から引く。局の最初の日の固定点の位置を 0 にそろえる
    fd, _, _, fenu = corrected[fixed_sid]
    fixed_by_day = dict(zip(fd, fenu))

    cols = defaultdict(list)
    for sid in sorted(corrected):
        if sid in EXCLUDE:
            continue
        days, lat0, lon0, enu = corrected[sid]
        keep = np.array([d in fixed_by_day for d in days])
        if keep.sum() < 30:
            continue
        ref = np.array([fixed_by_day[d] for d in days[keep]])
        rel = enu[keep] - (ref - ref[0])
        t = days[keep].astype("datetime64[D]").astype(float) / 365.2425 + 1970
        k = int(keep.sum())
        cols["station"].append(np.full(k, sid))
        cols["name"].append(np.full(k, names[sid]))
        cols["t"].append(t)
        cols["lat0"].append(np.full(k, lat0))
        cols["lon0"].append(np.full(k, lon0))
        cols["de"].append(rel[:, 0])
        cols["dn"].append(rel[:, 1])
        cols["du"].append(rel[:, 2])

    data = {k: np.concatenate(v) for k, v in cols.items()}
    np.savez_compressed(out, **data)
    print(f"{len(np.unique(data['station']))} 局・{len(data['t']):,} 日分 → {out}")


if __name__ == "__main__":
    main()
