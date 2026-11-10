"""Day 11（風で変わる羽田の空）の Web 用データを作る。

入力:
  ADS-B 観測点  ../adsb-flight-data-converter/work/points/*.parquet（ADSB.lol globe_history から作ったもの、UTC 日ごと）
  羽田の風     data/jma/MMDD.html（主役の日）、data/jma/hourly/YYYYMMDD.html（2024年度）
               気象庁「過去の気象データ検索」の 1時間ごとの値（羽田、prec_no=44 block_no=0371）

出力（web/）:
  tracks.bin    主役の日の航跡。Float32 の [経度, 緯度, 高度(m), 時刻(秒, その日の0時から)] を点ごとに並べる
  tracks.json   航跡ごとの点の数・着陸/離陸・機種・便名
  day.json      主役の日の 1時間ごとの風と、航跡から推定した運用
  jonan.json    城南島の上（半径 JONAN_R m、高度 JONAN_FT ft 未満）を通った時刻・高度・機種
  runways.json  羽田の4本の滑走路の中心線（OpenStreetMap、ODbL）と、1時間ごとの使われ方（航跡からの推定）
  loud.json     城南島で聞こえる飛行機の音の強さ（0〜1）。2秒ごと、1日分。機体と城南島の3Dの距離から決める
  wind.json     主役の日の、東京湾まわりのアメダス・気象台14地点の1時間ごとの風向（度）・風速（m/s）
  ground.json   羽田の誘導路（線）・エプロン（面）と、城南島海浜公園の範囲（OpenStreetMap、ODbL）
  year.json     2024年度の月ごとの「南寄りの風の時間の割合」と公表の南風運用の割合

使い方: python -I day11-sound/scripts/prepare.py
"""

import datetime as dt
import glob
import html
import json
import math
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
ADSB = ROOT.parent.parent / "adsb-flight-data-converter" / "work" / "points"
JMA = ROOT / "data" / "jma"
WEB = ROOT / "web"

DAY = dt.date(2026, 4, 3)  # 主役の日（JST）。北風の朝 → 南風 → 南風の15〜18時 → 南風
HANEDA = (139.781, 35.553)
RADIUS_KM = 35
MAX_FT = 10000  # これより高い所は描かない（空港のまわりの離着陸を見せる）
STEP_S = 8  # 航跡の点を間引く間隔（秒）
GAP_S = 120  # これより間が空いたら別の航跡にする
JONAN = (139.788, 35.580)  # 城南島海浜公園のあたり
JONAN_R = 500
JONAN_FT = 1500
FT = 0.3048
JST = dt.timezone(dt.timedelta(hours=9))

DIRS = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"]
ANG = {d: i * 22.5 for i, d in enumerate(DIRS)}

# 国交省の公表値（2024年度、昼間 6〜23時の南風運用の割合）。ニュースレター「羽田空港のこれから」第19号（2025年秋）
OFFICIAL_2024 = {4: 29, 5: 63, 6: 55, 7: 70, 8: 69, 9: 50, 10: 19, 11: 12, 12: 15, 1: 19, 2: 23, 3: 24}


def km(lon, lat, lon0, lat0):
    return math.hypot((lon - lon0) * 111.32 * math.cos(math.radians(lat0)), (lat - lat0) * 110.57)


def jma_rows(path):
    t = open(path, encoding="utf-8", errors="replace").read()
    out = []
    for r in re.findall(r'<tr class="mtx"[^>]*>(.*?)</tr>', t, re.S):
        c = [html.unescape(re.sub(r"<.*?>", "", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        if not c or not c[0].isdigit():
            continue
        wd = c[7].rstrip(")] ").strip()
        try:
            ws = float(c[6].rstrip(")] "))
        except ValueError:
            ws = None
        out.append((int(c[0]), wd if wd in ANG else None, ws))
    return out


def southerly(wd):
    # 南寄り = 東南東〜西南西から吹く風
    return wd is not None and 112.5 <= ANG[wd] <= 247.5


def load_points():
    t0 = dt.datetime.combine(DAY, dt.time(0), JST)
    t1 = t0 + dt.timedelta(days=1)
    files = [str(ADSB / f"{d:%Y-%m-%d}.parquet") for d in (DAY - dt.timedelta(days=1), DAY)]
    lat0 = HANEDA[1]
    dlat = RADIUS_KM / 110.57
    dlon = RADIUS_KM / (111.32 * math.cos(math.radians(lat0)))
    q = f"""
      select icao, leg, coalesce(t, '') t, coalesce(trim(flight), '') flight, ts, lon, lat, alt_baro, baro_rate
      from read_parquet({files})
      where ts >= {t0.timestamp()} and ts < {t1.timestamp()}
        and not on_ground and alt_baro is not null and alt_baro between -100 and {MAX_FT}
        and lat between {lat0 - dlat} and {lat0 + dlat} and lon between {HANEDA[0] - dlon} and {HANEDA[0] + dlon}
      order by icao, leg, ts"""
    return duckdb.sql(q).fetchall(), t0.timestamp()


def build_tracks(rows, base):
    tracks = []
    cur = None
    for icao, leg, typ, flight, ts, lon, lat, alt, rate in rows:
        if km(lon, lat, *HANEDA) > RADIUS_KM:
            continue
        key = (icao, leg)
        if cur is None or cur["key"] != key or ts - cur["pts"][-1][3] - base > GAP_S:
            if cur and len(cur["pts"]) >= 4:
                tracks.append(cur)
            cur = {"key": key, "t": typ, "f": flight, "pts": [], "last": -1e9, "rates": []}
        if ts - cur["last"] < STEP_S:
            continue
        cur["last"] = ts
        cur["pts"].append((lon, lat, max(0.0, alt * FT), ts - base))
        if rate is not None:
            cur["rates"].append(rate)
        if not cur["f"] and flight:
            cur["f"] = flight
    if cur and len(cur["pts"]) >= 4:
        tracks.append(cur)
    for tr in tracks:
        p = tr["pts"]
        # 着陸: 終わりが空港に近く低い。離陸: 始まりが空港に近く低い
        end_near = km(p[-1][0], p[-1][1], *HANEDA) < 6 and p[-1][2] < 600
        start_near = km(p[0][0], p[0][1], *HANEDA) < 6 and p[0][2] < 600
        if end_near and not start_near:
            tr["k"] = "arr"
        elif start_near and not end_near:
            tr["k"] = "dep"
        else:
            tr["k"] = "arr" if p[-1][2] < p[0][2] else "dep"
    return tracks


def heading(p, q):
    dx = (q[0] - p[0]) * math.cos(math.radians(p[1]))
    dy = q[1] - p[1]
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def runway_dir(h):
    if h >= 310 or h < 10:
        return "34"
    if 130 <= h <= 190:
        return "16"
    if 195 <= h <= 250:
        return "22"
    if 20 <= h <= 80:
        return "05"
    return None


def operations(tracks):
    """1時間ごとに、空港の近く（5km以内、高度600ft未満）での着陸・離陸の向きを数え、運用を推定する"""
    by_hour = defaultdict(Counter)
    for tr in tracks:
        low = [p for p in tr["pts"] if p[2] < 600 * FT and km(p[0], p[1], *HANEDA) < 5]
        if len(low) < 2:
            continue
        rw = runway_dir(heading(low[0], low[-1]))
        if rw:
            by_hour[int(low[-1][3] // 3600)][tr["k"] + rw] += 1
    ops = []
    for h in range(24):
        c = by_hour[h]
        arr = {k[3:]: v for k, v in c.items() if k.startswith("arr")}
        if sum(arr.values()) < 4:
            ops.append({"h": h, "mode": None, "counts": dict(c)})
            continue
        top = max(arr, key=arr.get)
        mode = {"34": "north", "22": "south", "16": "south-city"}.get(top)
        ops.append({"h": h, "mode": mode, "counts": dict(c)})
    return ops


def jonan_passes(tracks):
    out = []
    for i, tr in enumerate(tracks):
        best = None
        for p in tr["pts"]:
            d = km(p[0], p[1], *JONAN) * 1000
            if d <= JONAN_R and p[2] < JONAN_FT * FT and (best is None or d < best[0]):
                best = (d, p)
        if best:
            out.append({"i": i, "s": round(best[1][3], 1), "alt": round(best[1][2]), "d": round(best[0]), "t": tr["t"], "f": tr["f"]})
    out.sort(key=lambda x: x["s"])
    return out


# 滑走路の向き（航跡の向き）と、その向きで使う滑走路
DIR_RUNWAYS = {"34": "AC", "16": "AC", "22": "BD", "05": "BD"}


def runways(hours):
    """data/osm/haneda_osm.json（Overpass で取った aeroway=runway）から、滑走路ごとに中心線の両端を出す"""
    d = json.load(open(ROOT / "data" / "osm" / "haneda_osm.json", encoding="utf-8"))
    pts = defaultdict(list)
    names = {}
    for e in d["elements"]:
        t = e.get("tags", {})
        if t.get("aeroway") != "runway":
            continue
        m = re.search(r"([A-D])滑走路", t.get("name", ""))
        if not m:
            continue
        pts[m.group(1)] += [(g["lon"], g["lat"]) for g in e["geometry"]]
        names[m.group(1)] = t.get("ref")
    out = []
    for k in sorted(pts):
        p = pts[k]
        cx = sum(x for x, _ in p) / len(p)
        cy = sum(y for _, y in p) / len(p)
        # いちばん離れた2点を両端にする
        a = max(p, key=lambda q: km(q[0], q[1], cx, cy))
        b = max(p, key=lambda q: km(q[0], q[1], *a))
        out.append({"id": k, "ref": names[k], "path": [list(a), list(b)], "c": [cx, cy]})
    use = []
    for h in hours:
        u = {k: {"arr": 0, "dep": 0} for k in "ABCD"}
        for key, n in h["counts"].items():
            kind, rw = key[:3], key[3:]
            for k in DIR_RUNWAYS.get(rw, ""):
                u[k][kind] += n / 2
        use.append(u)
    return {"runways": out, "use": use}


def station_wind():
    """data/jma/wind/<地点番号>_<日>.html（fetch_wind.py で取ったもの）から、地点ごとに24時間の風を出す"""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from fetch_wind import STATIONS

    out = []
    for _, block, name, kind, lat, lon in STATIONS:
        t = open(JMA / "wind" / f"{block}_{DAY:%Y%m%d}.html", encoding="utf-8", errors="replace").read()
        vals = {}
        for r in re.findall(r'<tr class="mtx"[^>]*>(.*?)</tr>', t, re.S):
            c = [html.unescape(re.sub(r"<.*?>", "", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
            if not c or not c[0].isdigit():
                continue
            # アメダスは 風速=6・風向=7 列目、気象台は 風速=8・風向=9 列目
            iw, idr = (6, 7) if kind == "a" else (8, 9)
            wd = c[idr].rstrip(")] ").strip()
            try:
                ws = float(c[iw].rstrip(")] "))
            except ValueError:
                continue
            if wd == "静穏":
                vals[int(c[0])] = (0, 0.0)
            elif wd in ANG:
                vals[int(c[0])] = (ANG[wd], ws)
        # h時台には (h+1)時の値（h時〜h+1時の観測）を当てる。欠けた時間は前の時間の値で埋める
        hours, last = [], (0, 0.0)
        for h in range(24):
            last = vals.get(h + 1, last)
            hours.append([last[0], last[1]])
        out.append({"name": name, "lon": round(lon, 4), "lat": round(lat, 4), "h": hours})
    return out


LOUD_STEP = 2  # 秒
LOUD_REF = 300  # この距離（m）で強さ 0.63 になる


def loudness(tracks):
    """城南島（地上）から各機体までの3Dの距離 d で、強さ = 1 - exp(-Σ (LOUD_REF / d)^2) とする。
    音の強さの目安で、騒音の測定値ではない。航跡の点のあいだは1秒ごとに線形に補間する"""
    n = 86400 // LOUD_STEP
    acc = [0.0] * n
    jx, jy = JONAN
    cx = 111320 * math.cos(math.radians(jy))
    for tr in tracks:
        p = tr["pts"]
        for a, b in zip(p, p[1:]):
            dt = b[3] - a[3]
            if dt <= 0 or dt > GAP_S:
                continue
            # 遠い区間は飛ばす（4km より遠ければ聞こえないとみなす）
            if min(km(a[0], a[1], jx, jy), km(b[0], b[1], jx, jy)) > 4:
                continue
            for k in range(int(dt) + 1):
                f = k / dt
                x = (a[0] + (b[0] - a[0]) * f - jx) * cx
                y = (a[1] + (b[1] - a[1]) * f - jy) * 110540
                z = a[2] + (b[2] - a[2]) * f
                d2 = x * x + y * y + z * z + 50 ** 2
                i = int((a[3] + k) // LOUD_STEP)
                if 0 <= i < n:
                    acc[i] += (LOUD_REF ** 2) / d2 / LOUD_STEP
    return [round(1 - math.exp(-v), 3) for v in acc]


def chain_rings(ways):
    """端点でつないで閉じた輪にする（OSM のリレーションのメンバーの線から外周を作る）"""
    segs = [[(round(g["lon"], 7), round(g["lat"], 7)) for g in w["geometry"]] for w in ways]
    rings = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, sg in enumerate(segs):
                if sg[0] == ring[-1]:
                    ring += sg[1:]
                elif sg[-1] == ring[-1]:
                    ring += sg[::-1][1:]
                elif sg[-1] == ring[0]:
                    ring = sg[:-1] + ring
                elif sg[0] == ring[0]:
                    ring = sg[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(ring) >= 4:
            rings.append([list(c) for c in ring])
    return rings


def ground():
    """data/osm/park_taxi.json（誘導路・エプロン）と data/osm/park_ways.json（城南島海浜公園のリレーションの線）から"""
    osm = ROOT / "data" / "osm"
    d = json.load(open(osm / "park_taxi.json", encoding="utf-8"))
    taxi, apron = [], []
    for e in d["elements"]:
        if e["type"] != "way" or "geometry" not in e:
            continue
        c = [[round(g["lon"], 6), round(g["lat"], 6)] for g in e["geometry"]]
        kind = e.get("tags", {}).get("aeroway")
        if kind == "taxiway":
            taxi.append(c)
        elif kind == "apron" and c[0] == c[-1]:
            apron.append(c)
    park = chain_rings(json.load(open(osm / "park_ways.json", encoding="utf-8"))["elements"])
    return {"taxiways": taxi, "aprons": apron, "park": park}


def year_wind():
    am, pm, day = defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0])
    for f in sorted(glob.glob(str(JMA / "hourly" / "*.html"))):
        m = int(Path(f).stem[4:6])
        for h, wd, _ in jma_rows(f):
            if wd is None:
                continue
            s = int(southerly(wd))
            if 7 <= h <= 12:
                am[m][0] += s; am[m][1] += 1
            if 16 <= h <= 19:
                pm[m][0] += s; pm[m][1] += 1
            if 7 <= h <= 23:
                day[m][0] += s; day[m][1] += 1
    months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
    pct = lambda c, m: round(100 * c[m][0] / c[m][1]) if c[m][1] else None
    return [{"m": m, "wind": pct(day, m), "am": pct(am, m), "pm": pct(pm, m), "ops": OFFICIAL_2024[m]} for m in months]


def main():
    WEB.mkdir(exist_ok=True)
    rows, base = load_points()
    tracks = build_tracks(rows, base)
    with open(WEB / "tracks.bin", "wb") as f:
        for tr in tracks:
            for lon, lat, alt, s in tr["pts"]:
                f.write(struct.pack("<ffff", lon, lat, alt, s))
    meta = [{"n": len(tr["pts"]), "k": tr["k"], "t": tr["t"], "f": tr["f"]} for tr in tracks]
    (WEB / "tracks.json").write_text(json.dumps({"day": DAY.isoformat(), "haneda": HANEDA, "tracks": meta}, ensure_ascii=False), encoding="utf-8")

    wind = {h: (wd, ws) for h, wd, ws in jma_rows(JMA / f"{DAY:%m%d}.html")}
    ops = operations(tracks)
    hours = []
    for o in ops:
        # 気象庁の「h時」の値は (h-1)時〜h時の観測。h時台の運用には h+1 時の値を合わせる
        wd, ws = wind.get(o["h"] + 1, (None, None))
        hours.append({**o, "wd": wd, "deg": ANG.get(wd) if wd else None, "ws": ws})
    (WEB / "day.json").write_text(json.dumps({"day": DAY.isoformat(), "hours": hours}, ensure_ascii=False), encoding="utf-8")

    (WEB / "runways.json").write_text(json.dumps(runways(hours), ensure_ascii=False), encoding="utf-8")
    passes = jonan_passes(tracks)
    (WEB / "jonan.json").write_text(json.dumps({"spot": JONAN, "r": JONAN_R, "ft": JONAN_FT, "passes": passes}, ensure_ascii=False), encoding="utf-8")
    (WEB / "ground.json").write_text(json.dumps(ground(), ensure_ascii=False), encoding="utf-8")
    (WEB / "loud.json").write_text(json.dumps({"step": LOUD_STEP, "lv": loudness(tracks)}), encoding="utf-8")
    (WEB / "wind.json").write_text(json.dumps({"day": DAY.isoformat(), "stations": station_wind()}, ensure_ascii=False), encoding="utf-8")
    (WEB / "year.json").write_text(json.dumps({"fy": 2024, "months": year_wind()}, ensure_ascii=False), encoding="utf-8")

    npts = sum(len(t["pts"]) for t in tracks)
    print(f"{DAY} 航跡 {len(tracks)} 本（着陸 {sum(t['k']=='arr' for t in tracks)}、離陸 {sum(t['k']=='dep' for t in tracks)}）、点 {npts:,}")
    print(f"城南島の上を通った便 {len(passes)}")
    print("運用:", " ".join(f"{o['h']}:{o['mode'] or '-'}" for o in ops))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
