"""build.py の出力（.npz）から、アニメーション用に7日おきの変位をまとめる。

使い方: python -I scripts/to_anim.py <geonet_disp.npz> <出力フォルダ>
出力:
  anim.bin       Int16 の配列 [週][局][東西・南北・上下]（mm）。観測がない週は -32768
  stations.json  局番号・局名・最初の位置と、週の開始日・週の数
その週の日の観測がなければ、前後3日以内でいちばん近い日の値を使う。
"""

import json
import sys
from pathlib import Path

import numpy as np

START = np.datetime64("1996-03-21")
MISSING = -32768


def main():
    src, out = sys.argv[1], Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    z = np.load(src)
    station, t, name, lat0, lon0 = z["station"], z["t"], z["name"], z["lat0"], z["lon0"]
    disp = np.column_stack([z["de"], z["dn"], z["du"]])
    days = np.round((t - 1970) * 365.2425).astype(np.int64) - START.astype(np.int64)

    sids, first = np.unique(station, return_index=True)
    n_weeks = int(days.max() // 7) + 1
    arr = np.full((n_weeks, len(sids), 3), MISSING, dtype=np.int16)
    idx = np.r_[np.sort(first), len(station)]
    for j, (a, b) in enumerate(zip(idx[:-1], idx[1:])):
        d = days[a:b]
        weeks = np.arange(n_weeks) * 7
        pos = np.clip(np.searchsorted(d, weeks), 1, len(d) - 1)
        near = np.where(np.abs(d[pos - 1] - weeks) <= np.abs(d[pos] - weeks), pos - 1, pos)
        ok = np.abs(d[near] - weeks) <= 3
        arr[ok, j] = np.clip(np.round(disp[a:b][near[ok]] * 1000), -32767, 32767).astype(np.int16)

    arr.tofile(out / "anim.bin")
    meta = {
        "start": str(START),
        "step_days": 7,
        "weeks": n_weeks,
        "stations": [
            {"id": str(station[i]), "name": str(name[i]), "lat": round(float(lat0[i]), 6), "lon": round(float(lon0[i]), 6)}
            for i in np.sort(first)
        ],
    }
    (out / "stations.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"{n_weeks} 週 × {len(sids)} 局 → {out}（{arr.nbytes / 1e6:.1f} MB）")
    assert [s["id"] for s in meta["stations"]] == [str(station[i]) for i in idx[:-1]]


if __name__ == "__main__":
    main()
