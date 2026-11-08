"""250mメッシュの地図を描く共通部分（poster.py・regions.py）。init() でメッシュと倍率を渡す。"""
import numpy as np
from PIL import Image, ImageFilter

BG = np.array([10, 12, 20], float)
C_BOTH = np.array([255, 200, 80], float)
C_SERV = np.array([62, 104, 160], float)
C_NONE = np.array([105, 78, 112], float)
DLON, DLAT = 1 / 320, 1 / 480

cat = pop = lon = lat = None
S = 1


def init(m, s):
    global cat, pop, lon, lat, S
    cat = np.where(m["both"], 2, np.where(m["service"], 1, 0))
    pop = m["pop"].to_numpy().astype(float)
    lon = m["lon"].to_numpy()
    lat = m["lat"].to_numpy()
    S = s


def shade(p_both, p_serv, p_none, ref):
    tot = p_both + p_serv + p_none
    with np.errstate(invalid="ignore", divide="ignore"):
        mix = (C_BOTH * p_both[..., None] + C_SERV * p_serv[..., None] + C_NONE * p_none[..., None]) / tot[..., None]
    mix = np.nan_to_num(mix)
    a = np.clip(np.log10(tot + 1) / np.log10(ref), 0, 1) ** 0.9
    a = np.where(tot > 0, np.maximum(a, 0.18), 0)[..., None]
    return (BG * (1 - a) + mix * a).clip(0, 255).astype(np.uint8)


def render(lon0, lon1, lat0, lat1, w, ref):
    """経度方向を中央緯度の cos で縮めた正距円筒で描く。1画素に入るメッシュの人口を足す。"""
    k = np.cos(np.radians((lat0 + lat1) / 2))
    h = int(round(w * (lat1 - lat0) / ((lon1 - lon0) * k)))
    sel = (lon > lon0) & (lon < lon1) & (lat > lat0) & (lat < lat1)
    if (lon1 - lon0) / w < DLON:  # 拡大図: メッシュを矩形で塗る
        out = np.tile(BG.astype(np.uint8), (h, w, 1))
        ls, bs, cs, ps = lon[sel], lat[sel], cat[sel], pop[sel]
        x0 = np.round((ls - DLON / 2 - lon0) / (lon1 - lon0) * w).astype(int)
        x1 = np.round((ls + DLON / 2 - lon0) / (lon1 - lon0) * w).astype(int)
        y0 = np.round((lat1 - bs - DLAT / 2) / (lat1 - lat0) * h).astype(int)
        y1 = np.round((lat1 - bs + DLAT / 2) / (lat1 - lat0) * h).astype(int)
        z = np.zeros(len(ps))
        col = shade(np.where(cs == 2, ps, z), np.where(cs == 1, ps, z), np.where(cs == 0, ps, z), ref)
        for i in range(len(ps)):
            out[max(y0[i], 0):max(y1[i], 0), max(x0[i], 0):max(x1[i], 0)] = col[i]
        return out
    x = ((lon[sel] - lon0) / (lon1 - lon0) * w).astype(int).clip(0, w - 1)
    y = ((lat1 - lat[sel]) / (lat1 - lat0) * h).astype(int).clip(0, h - 1)
    idx = y * w + x
    acc = [np.bincount(idx, weights=np.where(cat[sel] == c, pop[sel], 0), minlength=w * h).reshape(h, w) for c in (2, 1, 0)]
    return shade(*acc, ref)


def glow(arr, radii, gains):
    """金色の所（両方を満たす所）だけをぼかして足し、光らせる。radii は等倍のときの画素数。"""
    rgb = arr.astype(float)
    mask = np.clip((rgb[..., 0] - rgb[..., 2]) / (C_BOTH[0] - C_BOTH[2]), 0, 1)
    mk = Image.fromarray((mask * 255).astype(np.uint8))
    add = np.zeros_like(mask)
    for r, g in zip(radii, gains):
        add += g * np.asarray(mk.filter(ImageFilter.GaussianBlur(r * S)), float) / 255
    out = rgb + np.array([255, 170, 60], float) * add[..., None]
    return out.clip(0, 255).astype(np.uint8)
