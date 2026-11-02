"""Geofabrik の関東の .osm.pbf から、東京都・埼玉県の道を取り出す（DuckDB spatial の ST_ReadOSM）。

python -I -X utf8 scripts/extract.py data/geofabrik/kanto-261101.osm.pbf data/work

出力（data/work/、どれも © OpenStreetMap contributors, ODbL）
- ways.parquet   自転車に関係しうるタグを持つ道（判定は analyze.py）と背景の幹線道路・川。
                 列: id, tags(JSON), refs(ノード ID の列), wkt
- pref.parquet   東京都・埼玉県の境界を作るための relation の外周の way（wkt）
- places.parquet 市・区の名前（place=city / town）
"""
import pathlib
import sys

import duckdb

# 自転車の判定に使うタグのどれかを持つ道を候補にする（判定そのものは analyze.py）
BIKE_COND = """
  tags['highway'] = 'cycleway'
  OR tags['bicycle'] = 'designated'
  OR tags['cycleway'] IS NOT NULL OR tags['cycleway:both'] IS NOT NULL
  OR tags['cycleway:left'] IS NOT NULL OR tags['cycleway:right'] IS NOT NULL
  OR tags['bicycle_road'] = 'yes' OR tags['cyclestreet'] = 'yes'
"""
BG_COND = """
  tags['highway'] IN ('motorway','trunk','primary','secondary')
  OR tags['waterway'] = 'river'
"""


def main() -> None:
    pbf, out = sys.argv[1], pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(out / "tmp.duckdb"))
    con.sql("INSTALL spatial; LOAD spatial; SET preserve_insertion_order=false;")
    con.sql(f"""
      CREATE OR REPLACE TABLE raw AS
      SELECT kind, id, tags, refs, ref_roles, ref_types, lat, lon
      FROM ST_ReadOSM('{pbf}')
    """)
    print("raw", con.sql("SELECT kind, count(*) FROM raw GROUP BY 1").fetchall(), flush=True)

    # 都県の relation（admin_level=4）
    con.sql("""
      CREATE OR REPLACE TABLE rel AS
      SELECT id, tags['ISO3166-2'] AS iso, tags['name'] AS name,
             unnest(refs) AS ref, unnest(ref_roles) AS role, unnest(ref_types) AS rtype
      FROM raw WHERE kind='relation' AND tags['ISO3166-2'] IN ('JP-13','JP-11')
        AND tags['boundary']='administrative'
    """)
    print("rel members", con.sql("SELECT iso, count(*) FROM rel GROUP BY 1").fetchall(), flush=True)

    con.sql(f"""
      CREATE OR REPLACE TABLE w AS
      SELECT id, tags, refs, 'cand' AS src FROM raw
      WHERE kind='way' AND tags['highway'] IS NOT NULL AND ({BIKE_COND})
      UNION ALL
      SELECT id, tags, refs, 'bg' AS src FROM raw WHERE kind='way' AND ({BG_COND})
      UNION ALL
      SELECT r.id, r.tags, r.refs, 'pref:' || rel.iso AS src
      FROM raw r JOIN rel ON r.id = rel.ref
      WHERE r.kind='way' AND rel.rtype='way' AND rel.role IN ('outer','')
    """)
    con.sql("""
      CREATE OR REPLACE TABLE wn AS
      SELECT w.id, w.src, u.idx, u.ref FROM w,
        LATERAL (SELECT unnest(w.refs) AS ref, generate_subscripts(w.refs, 1) AS idx) u
    """)
    con.sql("""
      CREATE OR REPLACE TABLE geom AS
      SELECT wn.id, wn.src,
        ST_AsText(ST_MakeLine(list(ST_Point(n.lon, n.lat) ORDER BY wn.idx))) AS wkt
      FROM wn JOIN raw n ON n.kind='node' AND n.id = wn.ref
      GROUP BY wn.id, wn.src
    """)
    con.sql(f"""
      COPY (
        SELECT w.id, w.src, to_json(w.tags)::VARCHAR AS tags, w.refs, g.wkt
        FROM w JOIN geom g ON g.id=w.id AND g.src=w.src
        WHERE w.src IN ('cand','bg')
      ) TO '{out / "ways.parquet"}' (FORMAT parquet)
    """)
    con.sql(f"""
      COPY (
        SELECT w.id, substr(w.src, 6) AS iso, g.wkt FROM w JOIN geom g ON g.id=w.id AND g.src=w.src
        WHERE w.src LIKE 'pref:%'
      ) TO '{out / "pref.parquet"}' (FORMAT parquet)
    """)
    con.sql(f"""
      COPY (
        SELECT id, tags['name'] AS name, tags['place'] AS place, lon, lat FROM raw
        WHERE kind='node' AND tags['place'] IN ('city','town') AND tags['name'] IS NOT NULL
      ) TO '{out / "places.parquet"}' (FORMAT parquet)
    """)
    print(con.sql("SELECT src, count(*) FROM geom GROUP BY 1 ORDER BY 1").fetchall())
    con.close()
    (out / "tmp.duckdb").unlink()


if __name__ == "__main__":
    main()
