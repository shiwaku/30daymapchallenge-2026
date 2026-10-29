"""build.py の出力（.npz）を、軌跡の点の GeoParquet にする。tylertoo で PMTiles にする前段。

使い方: python -I scripts/to_geoparquet.py <geonet_disp.npz> <出力 .parquet> [拡大倍率]
点の位置は「各局の最初の位置 ＋ 水平の変位 × 拡大倍率」。属性に変位そのもの（mm）を残す。
"""

import json
import sys

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

R = 6378137.0


def wkb_points(x, y):
    """リトルエンディアンの WKB Point（21 バイト）をまとめて作る。"""
    rec = np.empty(len(x), dtype=[("order", "u1"), ("type", "<u4"), ("x", "<f8"), ("y", "<f8")])
    rec["order"] = 1
    rec["type"] = 1
    rec["x"] = x
    rec["y"] = y
    buf = rec.tobytes()
    offsets = np.arange(len(x) + 1, dtype=np.int32) * 21
    return pa.Array.from_buffers(pa.binary(), len(x), [None, pa.py_buffer(offsets), pa.py_buffer(buf)])


def main():
    src, out = sys.argv[1], sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 25000

    z = np.load(src)
    station, t, lat0, lon0, de, dn, du = (z[k] for k in ("station", "t", "lat0", "lon0", "de", "dn", "du"))
    x = lon0 + np.degrees(de * scale / (R * np.cos(np.radians(lat0))))
    y = lat0 + np.degrees(dn * scale / R)

    table = pa.table({
        "station": pa.array(station.astype(str)),
        "t": pa.array(t.astype(np.float32)),
        "de_mm": pa.array(np.round(de * 1000).astype(np.int32)),
        "dn_mm": pa.array(np.round(dn * 1000).astype(np.int32)),
        "du_mm": pa.array(np.round(du * 1000).astype(np.int32)),
        "geometry": wkb_points(x, y),
    })
    geo = {
        "version": "1.1.0",
        "primary_column": "geometry",
        "columns": {"geometry": {
            "encoding": "WKB",
            "geometry_types": ["Point"],
            "bbox": [float(x.min()), float(y.min()), float(x.max()), float(y.max())],
        }},
    }
    table = table.replace_schema_metadata({b"geo": json.dumps(geo).encode()})
    pq.write_table(table, out, compression="zstd", row_group_size=100_000)
    print(f"{table.num_rows:,} 点（水平 x{scale:,.0f}）→ {out}")


if __name__ == "__main__":
    main()
