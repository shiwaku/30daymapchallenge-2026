"""Natural Earth の都道府県（admin-1）から、地方ブロックと都道府県の面を作る。

使い方:
    python -I -X utf8 scripts/blocks.py data/ne_10m_admin_1_states_provinces.geojson data-web/blocks.geojson data-web/prefs.geojson

入力: Natural Earth 10m admin-1（パブリックドメイン）
出力: data-web/blocks.geojson  地方ブロックの面。properties:
    name   ブロック名
    prefs  含む都道府県（data-web/stats.json の prefs のキーと同じ）
    bbox   表示する範囲 [西, 南, 東, 北]。離島（小笠原・大東・奄美より南の島など）を除いた本体の範囲
出力: data-web/prefs.geojson  都道府県の面。properties は同じ（prefs はその都道府県だけ）
"""

import json
import sys
from pathlib import Path

import shapely

BLOCKS = {
    "北海道": ["北海道"],
    "東北": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "関東": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "中部": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
    "近畿": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "中国・四国": ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
    "九州・沖縄": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
}
# 表示する範囲に入れない部分: 面積が小さい島（度² で 0.02 未満）、北緯30度より南の島（奄美・小笠原など）、
# 地方ブロックでは沖縄県（左下の小さな地図で出す）。沖縄県だけを出すときは、沖縄本島（0.05 以上）に合わせる
MIN_PART = 0.02


def main_bounds(parts) -> list[float]:
    return [round(v, 3) for v in shapely.union_all(parts).bounds]


def parts_of(g, pref: str):
    if pref == "沖縄県":
        return [x for x in shapely.get_parts(g) if x.area >= 0.05 and x.centroid.y < 27.5]
    return [x for x in shapely.get_parts(g) if x.area >= MIN_PART and x.centroid.y >= 30]


def feature(name: str, prefs: list[str], g, bbox) -> dict:
    g = shapely.set_precision(shapely.simplify(g, 0.005), 1e-4)
    return {"type": "Feature", "properties": {"name": name, "prefs": prefs, "bbox": bbox}, "geometry": json.loads(shapely.to_geojson(g))}


def main(src: Path, out: Path, out_prefs: Path) -> None:
    fc = json.loads(src.read_text(encoding="utf-8"))
    geom = {f["properties"]["name_ja"]: shapely.geometry.shape(f["geometry"]) for f in fc["features"] if f["properties"].get("iso_a2") == "JP"}
    feats = []
    for name, prefs in BLOCKS.items():
        u = shapely.union_all([geom[p] for p in prefs])
        bbox = main_bounds([g for p in prefs if p != "沖縄県" for g in parts_of(geom[p], p)])
        feats.append(feature(name, prefs, u, bbox))
        print(name, bbox)
    write(out, feats)
    # 都道府県（並びは地方ブロックの順 = 都道府県コードの順）
    write(out_prefs, [feature(p, [p], geom[p], main_bounds(parts_of(geom[p], p))) for ps in BLOCKS.values() for p in ps])


def write(p: Path, feats: list) -> None:
    p.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(p, p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
