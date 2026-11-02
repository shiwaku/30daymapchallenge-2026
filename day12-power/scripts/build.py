"""fetch.py で取り出した z14 タイルごとの送電線を、経緯度の線にして全国の GeoJSON にする。

- タイルの線はバッファ付きで隣のタイルと重なるので、タイルの範囲（0..extent）で切ってから使う
- 長さはタイルで切った線の測地線長の合計（GRS80）
- タイルの境目でつなぎ直し（line_merge）、表示用に約1m の許容で単純化し、座標を 1e-5 度（約1m）に丸める
- 発電所・変電所などの名前の注記は、タイルの中にある点だけを使い、同じ名前の近い点（約300m 以内）は1つにする

出力: web/power.geojson, web/plants.geojson, web/stats.json
使い方: python -X utf8 scripts/build.py
"""
import glob
import json
import math
import os
from collections import Counter

from pyproj import Geod
from shapely import clip_by_rect, line_merge, set_precision
from shapely.geometry import LineString, MultiLineString, mapping, shape
from shapely.ops import transform

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "data", "pwr")
WEB = os.path.join(HERE, "web")
GEOD = Geod(ellps="GRS80")


def to_lonlat(z, x, y, ext):
    n = 2 ** z

    def f(px, py, *_):
        gx = (x + px / ext) / n
        gy = (y + py / ext) / n
        lon = gx * 360.0 - 180.0
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * gy))))
        return lon, lat

    def fv(xs, ys, *_):
        out = [f(a, b) for a, b in zip(xs, ys)]
        return [o[0] for o in out], [o[1] for o in out]

    return fv


def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type == "MultiLineString":
        return list(g.geoms)
    if hasattr(g, "geoms"):
        return [p for q in g.geoms for p in lines_of(q)]
    return []


def main():
    os.makedirs(WEB, exist_ok=True)
    parts = []
    total_m = 0.0
    codes = Counter()
    tiles_with = 0
    labels = []
    files = sorted(glob.glob(os.path.join(SRC, "*.ndjson")))
    for fn in files:
        for row in open(fn, encoding="utf8"):
            r = json.loads(row)
            z, x, y, ext = r["z"], r["x"], r["y"], r.get("ext", 4096)
            proj = to_lonlat(z, x, y, ext)
            if "lines" in r:
                tiles_with += 1
                for ln in r["lines"]:
                    codes[ln["code"]] += 1
                    g = clip_by_rect(shape(ln["g"]), 0, 0, ext, ext)
                    for part in lines_of(g):
                        if part.length == 0:
                            continue
                        ll = transform(proj, part)
                        lon, lat = ll.xy
                        total_m += GEOD.line_length(lon, lat)
                        parts.append(ll)
            for lb in r.get("labels", []):
                px, py = lb["g"]
                if not (0 <= px < ext and 0 <= py < ext):
                    continue
                lon, lat = proj([px], [py])
                labels.append((lb["t"], lb["code"], lon[0], lat[0]))

    print(f"tiles with lines: {tiles_with}  pieces: {len(parts)}  codes: {dict(codes)}")
    print(f"total length: {total_m / 1000:,.0f} km")

    merged = line_merge(set_precision(MultiLineString(parts), 1e-7))
    # 表示用: 一直線上の余分な点（タイルの境目で切った点など）を約1m の許容で落とし、座標を 1e-5 度に丸める
    out = [g.simplify(1e-5) for g in lines_of(merged)]
    feats = [{
        "type": "Feature", "properties": {},
        "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in g.coords]},
    } for g in out if g.length > 0]
    print(f"vertices (web): {sum(len(f['geometry']['coordinates']) for f in feats):,}")
    with open(os.path.join(WEB, "power.geojson"), "w", encoding="utf8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, separators=(",", ":"))
    print(f"merged lines: {len(feats)}")

    # 名前の注記: 同じ名前で近い点は1つにする
    kept = []
    for t, code, lon, lat in sorted(labels):
        if any(k[0] == t and abs(k[2] - lon) < 0.004 and abs(k[3] - lat) < 0.003 for k in kept[-20:]):
            continue
        kept.append((t, code, lon, lat))

    def kind(t):
        for s in ("発電所", "変電所", "開閉所", "変換所"):
            if t.endswith(s):
                return s
        return ""

    pf = [{
        "type": "Feature",
        "properties": {"name": t, "kind": kind(t)},
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
    } for t, code, lon, lat in kept]
    with open(os.path.join(WEB, "plants.geojson"), "w", encoding="utf8") as f:
        json.dump({"type": "FeatureCollection", "features": pf}, f, ensure_ascii=False, separators=(",", ":"))
    kinds = Counter(p["properties"]["kind"] for p in pf)
    print(f"labels: {dict(kinds)}  codes: {dict(Counter(k[1] for k in kept))}")

    stats = {
        "total_km": round(total_m / 1000),
        "z14_tiles_read": None,
        "z14_tiles_with_lines": tiles_with,
        "line_codes": {str(k): v for k, v in codes.items()},
        "merged_lines": len(feats),
        "labels": dict(kinds),
    }
    idx = os.path.join(HERE, "data", "z14_index.json")
    if os.path.exists(idx):
        stats["z14_tiles_read"] = len(json.load(open(idx))["tiles"])
    json.dump(stats, open(os.path.join(WEB, "stats.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(stats)


if __name__ == "__main__":
    main()
