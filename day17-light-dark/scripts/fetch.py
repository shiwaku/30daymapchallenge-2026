"""国土地理院最適化ベクトルタイル（PMTiles）から、z14 のタイルを読み、送電線（PwrTrnsmL）と、
発電所・変電所などの名前の注記（Anno のうち vt_text が「発電所」「変電所」「開閉所」で終わる点）を取り出す。

送電線のレイヤは z14〜16 にしかないので、全国を見るために z14 のタイルを全部読む（PMTiles の
ディレクトリで、データのあるタイルだけを知る）。続いているタイルはまとめて Range リクエストで取る。

出力（data/、Git 管理外）:
  data/z14_index.json          z14 のタイルの一覧（tile_id, offset, length）
  data/pwr/<run>.ndjson        タイルごとの送電線（タイル内座標 0..4096）と注記
使い方: python -I -X utf8 scripts/fetch.py [並列数]
"""
import gzip
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import mapbox_vector_tile
from pmtiles.tile import deserialize_directory, deserialize_header, tileid_to_zxy, zxy_to_tileid

URL = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "pwr")
Z = 14
UA = {"User-Agent": "30daymapchallenge-day17 (one-time z14 read)"}
SUFFIX = ("発電所", "変電所", "開閉所", "変換所")


def get(offset, length, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(URL, headers={**UA, "Range": f"bytes={offset}-{offset + length - 1}"})
            with urllib.request.urlopen(req, timeout=120) as r:
                b = r.read()
            if len(b) != length:
                raise IOError(f"short read {len(b)} != {length}")
            return b
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def read_dir(b, comp):
    if comp == 2:  # gzip
        b = gzip.decompress(b)
    return deserialize_directory(b)


def index_z14():
    path = os.path.join(DATA, "z14_index.json")
    if os.path.exists(path):
        return json.load(open(path))
    head = get(0, 16384)
    h = deserialize_header(head[:127])
    print({k: h[k] for k in ("min_zoom", "max_zoom", "tile_compression", "internal_compression", "addressed_tiles_count", "tile_entries_count")})
    lo, hi = zxy_to_tileid(Z, 0, 0), zxy_to_tileid(Z + 1, 0, 0)
    out = []

    def walk(entries):
        for e in entries:
            if e.run_length == 0:  # 葉ディレクトリ
                last = e.tile_id  # 葉の最初の tile_id。範囲外なら読まない
                nxt = [x for x in entries if x.tile_id > e.tile_id]
                end = nxt[0].tile_id if nxt else 1 << 62
                if end <= lo or last >= hi:
                    continue
                walk(read_dir(get(h["leaf_directory_offset"] + e.offset, e.length), h["internal_compression"]))
            else:
                for k in range(e.run_length):
                    t = e.tile_id + k
                    if lo <= t < hi:
                        out.append([t, h["tile_data_offset"] + e.offset, e.length])

    root = read_dir(head[h["root_offset"]:h["root_offset"] + h["root_length"]], h["internal_compression"])
    walk(root)
    out.sort(key=lambda r: r[1])
    os.makedirs(DATA, exist_ok=True)
    json.dump({"header": {k: v for k, v in h.items() if isinstance(v, (int, float, str))}, "tiles": out}, open(path, "w"))
    return {"tiles": out}


def layer_bytes(tile, names):
    """MVT のバイト列から、指定した名前のレイヤだけを取り出して、そのレイヤだけのタイルにする"""
    out = bytearray()
    i, n = 0, len(tile)
    while i < n:
        key, i = varint(tile, i)
        field, wt = key >> 3, key & 7
        if wt == 2:
            ln, i = varint(tile, i)
            body = tile[i:i + ln]
            i += ln
            if field == 3 and layer_name(body) in names:
                out += tile_key(len(body)) + body
        elif wt == 0:
            _, i = varint(tile, i)
        elif wt == 1:
            i += 8
        elif wt == 5:
            i += 4
        else:
            raise ValueError("wire type")
    return bytes(out)


def varint(b, i):
    s = r = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if c < 0x80:
            return r, i
        s += 7


def tile_key(ln):
    out = bytearray([0x1A])
    while True:
        c = ln & 0x7F
        ln >>= 7
        out.append(c | (0x80 if ln else 0))
        if not ln:
            return bytes(out)


def layer_name(body):
    i = 0
    while i < len(body):
        key, i = varint(body, i)
        field, wt = key >> 3, key & 7
        if wt == 2:
            ln, i = varint(body, i)
            if field == 1:
                return body[i:i + ln].decode("utf8")
            i += ln
        elif wt == 0:
            _, i = varint(body, i)
        elif wt == 1:
            i += 8
        elif wt == 5:
            i += 4
    return None


def parse(tid, raw):
    try:
        raw = gzip.decompress(raw)
    except OSError:
        pass
    sub = layer_bytes(raw, {"PwrTrnsmL", "Anno"})
    if not sub:
        return None
    t = mapbox_vector_tile.decode(sub, default_options={"y_coord_down": True})
    z, x, y = tileid_to_zxy(tid)
    rec = {"z": z, "x": x, "y": y}
    p = t.get("PwrTrnsmL")
    if p:
        rec["ext"] = p["extent"]
        rec["lines"] = [{"code": f["properties"].get("vt_code"), "g": f["geometry"]} for f in p["features"]]
    a = t.get("Anno")
    if a:
        labels = []
        for f in a["features"]:
            txt = f["properties"].get("vt_text") or ""
            if txt.endswith(SUFFIX) and f["geometry"]["type"] == "Point":
                labels.append({"t": txt, "code": f["properties"].get("vt_code"), "g": f["geometry"]["coordinates"]})
        if labels:
            rec["ext"] = a["extent"]
            rec["labels"] = labels
    return rec if ("lines" in rec or "labels" in rec) else None


def runs(tiles, max_bytes=8 << 20, max_gap=0):
    """オフセットが続いているタイルを、max_bytes までまとめる"""
    cur, start, end = [], None, None
    for t in tiles:
        if cur and (t[1] != end + max_gap and t[1] > end or t[1] + t[2] - start > max_bytes) :
            yield start, end - start, cur
            cur = []
        if not cur:
            start, end = t[1], t[1]
        cur.append(t)
        end = max(end, t[1] + t[2])
    if cur:
        yield start, end - start, cur


def job(k, start, length, tiles):
    path = os.path.join(OUT, f"{k:06d}.ndjson")
    if os.path.exists(path):
        return 0
    b = get(start, length)
    lines = []
    seen = set()
    for tid, off, ln in tiles:
        if tid in seen:
            continue
        seen.add(tid)
        r = parse(tid, b[off - start:off - start + ln])
        if r:
            lines.append(json.dumps(r, separators=(",", ":"), ensure_ascii=False))
    tmp = path + ".tmp"
    open(tmp, "w", encoding="utf8").write("\n".join(lines) + ("\n" if lines else ""))
    os.replace(tmp, path)
    return length


def main():
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    idx = index_z14()
    tiles = idx["tiles"]
    print(f"z14 tiles: {len(tiles)}  bytes: {sum(t[2] for t in tiles) / 1e9:.2f} GB")
    if "--index-only" in sys.argv:
        return
    os.makedirs(OUT, exist_ok=True)
    rs = list(runs(tiles))
    print(f"requests: {len(rs)}")
    done = 0
    t0 = time.time()
    with ThreadPoolExecutor(workers) as ex:
        futs = [ex.submit(job, k, s, l, ts) for k, (s, l, ts) in enumerate(rs)]
        for i, f in enumerate(as_completed(futs)):
            done += f.result()
            if i % 50 == 0:
                print(f"{i}/{len(rs)}  {done / 1e9:.2f} GB  {time.time() - t0:.0f}s", flush=True)
    print("done")


if __name__ == "__main__":
    main()
