"""Extract aircraft that passed near Tsurugashima Station from an adsb.lol globe_history tar (read from stdin)."""
import gzip, json, math, sys, tarfile
from datetime import datetime, timezone

LAT0, LON0 = float(sys.argv[1]), float(sys.argv[2])
RADIUS_KM = 12.0
T_START = datetime(2026, 10, 18, 21, 30, tzinfo=timezone.utc).timestamp()  # 06:30 JST
T_END = datetime(2026, 10, 19, 0, 30, tzinfo=timezone.utc).timestamp()     # 09:30 JST
# 粗い事前フィルタ用の矩形（関東南西部）
BBOX = (35.4, 36.4, 138.8, 140.0)


def dist_km(lat, lon):
    dy = (lat - LAT0) * 111.0
    dx = (lon - LON0) * 111.0 * math.cos(math.radians(LAT0))
    return math.hypot(dx, dy)


out = []
with tarfile.open(fileobj=sys.stdin.buffer, mode="r|") as tf:
    for m in tf:
        if not m.isfile() or "trace_full_" not in m.name:
            continue
        raw = tf.extractfile(m).read()
        try:
            d = json.loads(gzip.decompress(raw))
        except OSError:
            d = json.loads(raw)
        base = d.get("timestamp", 0)
        pts, near = [], False
        callsigns = set()
        for p in d.get("trace", []):
            t = base + p[0]
            if t < T_START or t > T_END:
                continue
            lat, lon = p[1], p[2]
            if lat is None or not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]):
                continue
            if len(p) > 8 and isinstance(p[8], dict) and p[8].get("flight"):
                callsigns.add(p[8]["flight"].strip())
            pts.append([t, lat, lon, p[3], p[9] if len(p) > 9 else None])
            if dist_km(lat, lon) <= RADIUS_KM:
                near = True
        if near:
            out.append({
                "icao": d.get("icao"), "r": d.get("r"), "t": d.get("t"), "desc": d.get("desc"),
                "ownOp": d.get("ownOp"), "dbFlags": d.get("dbFlags", 0),
                "callsigns": sorted(callsigns), "points": pts,
            })

json.dump(out, sys.stdout, ensure_ascii=False)
print(f"\n{len(out)} aircraft", file=sys.stderr)
