"""Mapterhorn の planet.pmtiles から z0〜maxzoom のタイルを取り出し、data/mapterhorn/{z}/{x}/{y}.webp に置く。

使い方: python -I scripts/fetch_mapterhorn.py <maxzoom>
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from pmtiles_remote import RemotePMTiles, fetch_range, tileid_to_zxy, zxy_to_tileid  # noqa: E402

URL = "https://download.mapterhorn.com/planet.pmtiles"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "mapterhorn"
MAX_GAP = 1 << 20      # 1MB までの隙間はまとめて取る
MAX_CHUNK = 64 << 20   # 1回の取得は 64MB まで


def main():
    maxzoom = int(sys.argv[1])
    pm = RemotePMTiles(URL)
    print("tile_type", pm.tile_type, "tile_comp", pm.tile_comp, "zoom", pm.min_zoom, pm.max_zoom)
    max_tid = zxy_to_tileid(maxzoom, 0, 0) + (1 << (2 * maxzoom)) - 1
    ents = pm.entries_up_to(max_tid)
    # data のバイト範囲ごとに、そこを使うタイルを並べる
    by_range = {}
    for tid, run, off, length in ents:
        for t in range(tid, min(tid + run, max_tid + 1)):
            by_range.setdefault((off, length), []).append(t)
    ranges = sorted(by_range)
    todo = [r for r in ranges if not all((OUT / "{}/{}/{}.webp".format(*tileid_to_zxy(t))).exists() for t in by_range[r])]
    print(f"tiles {sum(len(v) for v in by_range.values())}, unique blobs {len(ranges)}, to fetch {len(todo)}")
    # 近いものをまとめる
    chunks = []
    for off, length in todo:
        if chunks and off - (chunks[-1][1]) <= MAX_GAP and (off + length - chunks[-1][0]) <= MAX_CHUNK:
            chunks[-1][1] = max(chunks[-1][1], off + length)
            chunks[-1][2].append((off, length))
        else:
            chunks.append([off, off + length, [(off, length)]])
    total = sum(c[1] - c[0] for c in chunks)
    print(f"chunks {len(chunks)}, {total / 1e6:.1f} MB")
    done = 0
    for start, end, items in chunks:
        buf = fetch_range(URL, pm.data_off + start, end - start)
        for off, length in items:
            blob = buf[off - start: off - start + length]
            for t in by_range[(off, length)]:
                z, x, y = tileid_to_zxy(t)
                p = OUT / str(z) / str(x) / f"{y}.webp"
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(blob)
        done += end - start
        print(f"  {done / 1e6:.1f}/{total / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    main()
