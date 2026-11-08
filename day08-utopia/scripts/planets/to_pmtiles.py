"""planets/tiles/{body}/{dem,ov}/{z}/{x}/{y}.png を PMTiles 1つずつにまとめる。

python -I -X utf8 scripts/planets/to_pmtiles.py planets/tiles output/pmtiles
→ output/pmtiles/{moon,mars}-{dem,ov}.pmtiles
"""
import json
import sys
from pathlib import Path

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer


def pack(src: Path, dst: Path, name: str) -> None:
    tiles = []
    for p in src.glob("*/*/*.png"):
        z, x, y = int(p.parts[-3]), int(p.parts[-2]), int(p.stem)
        tiles.append((zxy_to_tileid(z, x, y), p))
    tiles.sort()
    zs = [int(p.parts[-3]) for _, p in tiles]
    with open(dst, "wb") as f:
        w = Writer(f)
        for tid, p in tiles:
            w.write_tile(tid, p.read_bytes())
        w.finalize(
            {
                "tile_type": TileType.PNG,
                "tile_compression": Compression.NONE,
                "min_zoom": min(zs),
                "max_zoom": max(zs),
                "min_lon_e7": -1800000000, "min_lat_e7": -850000000,
                "max_lon_e7": 1800000000, "max_lat_e7": 850000000,
                "center_zoom": 0, "center_lon_e7": 0, "center_lat_e7": 0,
            },
            {"name": name, "tileSize": 512},
        )
    print(f"{dst.name}: {len(tiles)} tiles, z{min(zs)}-{max(zs)}, {dst.stat().st_size / 1e6:.0f} MB")


def main() -> None:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for body in ("moon", "mars"):
        for kind in ("dem", "ov"):
            pack(src / body / kind, out / f"{body}-{kind}.pmtiles", f"{body}-{kind}")


if __name__ == "__main__":
    main()
