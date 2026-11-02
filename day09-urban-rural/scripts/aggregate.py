"""国土数値情報 人口集中地区（A16）の全年次を読み、全国の DID 人口・面積・密度を集計する。

入力: data/ext/A16-YY_*_DID.shp（1960〜2005 は都道府県別、2010〜2020 は全国1ファイル）
出力: data/national.csv
"""
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "data" / "ext"
YEARS = [1960, 1965, 1970, 1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020]

con = duckdb.connect()
con.sql("INSTALL spatial; LOAD spatial;")

rows = []
for y in YEARS:
    yy = f"{y % 100:02d}"
    files = sorted(EXT.glob(f"A16-{yy}_*_DID.shp"))
    union = " UNION ALL ".join(
        f"SELECT A16_001::VARCHAR AS id, A16_005::BIGINT AS pop, A16_006::DOUBLE AS area_attr, "
        f"ST_Area_Spheroid(ST_FlipCoordinates(geom)) / 1e6 AS area_geom "
        f"FROM ST_Read('{f.as_posix()}')"
        for f in files
    )
    # 1つの DID が複数の面に分かれていると、どの面にも DID 全体の人口・面積が入っている。
    # 人口・面積は DID（A16_001）ごとに1回だけ数え、図形の面積は面ごとに足す。
    con.sql(f"CREATE OR REPLACE TEMP TABLE y AS {union}")
    r = con.sql(
        "SELECT (SELECT count(DISTINCT id) FROM y), "
        "(SELECT sum(pop) FROM (SELECT DISTINCT id, pop, area_attr FROM y)), "
        "(SELECT sum(area_attr) FROM (SELECT DISTINCT id, pop, area_attr FROM y)), "
        "(SELECT sum(area_geom) FROM y)"
    ).fetchone()
    rows.append((y, len(files), *r))
    print(y, len(files), r)

con.sql(
    "CREATE TABLE t(year INT, files INT, dids BIGINT, pop BIGINT, area_attr DOUBLE, area_geom DOUBLE)"
)
con.executemany("INSERT INTO t VALUES (?,?,?,?,?,?)", rows)
con.sql(
    f"""COPY (SELECT *, pop / area_attr AS density FROM t ORDER BY year)
        TO '{(ROOT / "data" / "national.csv").as_posix()}' (HEADER)"""
)
