"""海面を h m 上げたとき、海とつながって沈む所に住む人（関東1都6県、250mメッシュ）。

標高は Mapterhorn z12（日本は国土地理院の数値標高モデルが元。z12 では 0.5m 刻み）。
海は標高がちょうど 0m で、いちばん大きくつながった所とする。h 以下でその海とつながる所を「沈む」とする。
堤防・防潮堤は考えない（今の地形のままバスタブに水を張る）。メッシュの中心の画素で判定する。

使い方: python -I -X utf8 flood_pop.py <data/sealevel> <data/carfree/mesh_carfree.parquet> <出力json>
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage

src = Path(sys.argv[1])
d = np.load(src / "dem_z12.npy")
meta = json.load(open(src / "dem_z12.json"))
Z, T = meta["z"], meta["tile"]
KANTO = ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"]
m = pd.read_parquet(sys.argv[2], columns=["lat", "lon", "pop", "pref", "city"])
m = m[m["pref"].isin(KANTO)]
# 伊豆諸島・小笠原は範囲の外なので除く
m = m[(m["lon"] > 138.7) & (m["lon"] < 141.0) & (m["lat"] > 34.85) & (m["lat"] < 37.2)].reset_index(drop=True)
n = 2**Z * T
xs = ((m["lon"] + 180) / 360 * n - meta["x0"] * T).astype(int).to_numpy()
r = np.radians(m["lat"].to_numpy())
ys = ((1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * n - meta["y0"] * T).astype(int)

lab0, _ = ndimage.label(d == 0)
sizes = np.bincount(lab0.ravel())
sizes[0] = 0
sea = lab0 == sizes.argmax()
print("海の画素", sea.sum())

P = m["pop"].sum()
res = {"pop_kanto": int(P), "levels": []}
for h in [x / 2 for x in range(21)]:
    lab, _ = ndimage.label(d <= h)
    keep = np.unique(lab[sea])
    keep = keep[keep > 0]
    wet = np.isin(lab, keep)
    w = wet[ys, xs]
    p = int(m.loc[w, "pop"].sum())
    top = m[w].groupby(["pref", "city"])["pop"].sum().sort_values(ascending=False).head(8)
    res["levels"].append({"h": h, "pop": p, "share": p / P,
                          "top": [[f"{a}{b}", int(v)] for (a, b), v in top.items()]})
    print(h, p, f"{p / P:.3%}", top.head(5).to_dict())
json.dump(res, open(sys.argv[3], "w"), ensure_ascii=False, indent=1)
