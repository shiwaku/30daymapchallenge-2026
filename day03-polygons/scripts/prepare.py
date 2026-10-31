"""都市計画決定GISデータの用途地域（youto.parquet）を、容積率で立ち上げる地図用の PMTiles にする。

使い方: python -I scripts/prepare.py <youto.parquet> <作業フォルダ> <出力 .pmtiles>

やること（値は変えない）:
- 列を絞る: code（用途地域コード 1〜13）, far（容積率 %、数値にできないものは空）, bcr（建ぺい率 %）, pref, city
- 提供元の誤り（mlit-urban-planning-converter #25）: 長野県箕輪町のファイルに入っている新潟市の用途地域の複製を外す。
  見分け方は「Citycode が 20383 で、中心が北緯37度より北」（箕輪町は北緯36度、新潟市は北緯37.9度）
- 「調整」（コード0）は用途地域ではないので外す
- 不正なジオメトリは ST_MakeValid で直す
- 座標系は EPSG:6668 のまま EPSG:4326 として扱う（実用上同じ）
- 集計値（面積など）を JSON に書き出す。ビューワの説明文の数字に使う
- tylertoo でズーム4〜14の PMTiles にする。容積率の高い面を上に描く
"""

import json
import sys
from pathlib import Path

import duckdb
import tylertoo


def main(src: str, work: str, out: str) -> None:
    wd = Path(work)
    wd.mkdir(parents=True, exist_ok=True)
    gpq = wd / "youto_far.parquet"
    ov = wd / "youto_far_overview.parquet"

    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    con.sql(f"""
        CREATE TABLE y AS
        SELECT
            CAST(YoutoCode AS INTEGER) AS code,
            TRY_CAST(FAR AS DOUBLE) AS far,
            TRY_CAST(BCR AS DOUBLE) AS bcr,
            Pref AS pref,
            Cityname AS city,
            ST_MakeValid(geometry)::GEOMETRY AS geometry
        FROM read_parquet('{src}')
        WHERE YoutoCode BETWEEN 1 AND 13
          AND NOT (Citycode = '20383' AND ST_Y(ST_Centroid(geometry)) > 37)
    """)
    con.sql("ALTER TABLE y ADD COLUMN km2 DOUBLE")
    con.sql("UPDATE y SET km2 = ST_Area_Spheroid(ST_FlipCoordinates(geometry)) / 1e6")

    stats = {
        "features": con.sql("SELECT count(*) FROM y").fetchone()[0],
        "km2": con.sql("SELECT sum(km2) FROM y").fetchone()[0],
        "no_far": con.sql("SELECT count(*) FROM y WHERE far IS NULL").fetchone()[0],
        "no_far_cities": con.sql("SELECT count(DISTINCT pref || city) FROM y WHERE far IS NULL").fetchone()[0],
        "cities": con.sql("SELECT count(DISTINCT pref || city) FROM y").fetchone()[0],
        "by_code": [
            {"code": c, "n": n, "km2": a, "far_mean": m}
            for c, n, a, m in con.sql(
                "SELECT code, count(*), sum(km2), sum(far * km2) FILTER (WHERE far IS NOT NULL) / sum(km2) FILTER (WHERE far IS NOT NULL) FROM y GROUP BY code ORDER BY code"
            ).fetchall()
        ],
        "by_far": [
            {"far": f, "km2": a}
            for f, a in con.sql("SELECT far, sum(km2) FROM y WHERE far IS NOT NULL GROUP BY far ORDER BY far").fetchall()
        ],
        "max_far": [
            {"pref": p, "city": c, "km2": a}
            for p, c, a in con.sql(
                "SELECT pref, city, sum(km2) FROM y WHERE far = (SELECT max(far) FROM y) GROUP BY ALL ORDER BY 3 DESC"
            ).fetchall()
        ],
    }
    (wd / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")

    # tylertoo は GeoParquet の CRS を見るので、EPSG:4326 として書き出す
    con.sql(f"""
        COPY (SELECT code, far, bcr, pref, city, ST_SetCRS(geometry, 'EPSG:4326') AS geometry FROM y ORDER BY far NULLS FIRST)
        TO '{gpq.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
    """)

    tylertoo.overview(str(gpq), str(ov), min_zoom=4, max_zoom=14, sort_key="far")
    tylertoo.export_pmtiles(str(ov), out, layer_name="youto", feature_order="far:asc", tile_size_limit=None)
    print(json.dumps({k: v for k, v in stats.items() if not isinstance(v, list)}, ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
