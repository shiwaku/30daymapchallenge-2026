"""主役の日の、東京湾まわりのアメダス・気象台の1時間ごとの値（気象庁「過去の気象データ検索」）を取ってくる。

保存先: data/jma/wind/<block_no>_<YYYYMMDD>.html（Git 管理外）
使い方: python -I day11-sound/scripts/fetch_wind.py
"""

import time
import urllib.request
from pathlib import Path

DAY = (2026, 4, 3)
OUT = Path(__file__).resolve().parent.parent / "data" / "jma" / "wind"

# (都府県番号, 地点番号, 名前, 種類 a=アメダス s=気象台, 緯度, 経度)。緯度経度は気象庁の地点一覧（度・分）から
STATIONS = [
    (44, "0371", "羽田", "a", 35 + 33.2 / 60, 139 + 46.8 / 60),
    (44, "47662", "東京", "s", 35 + 41.5 / 60, 139 + 45.0 / 60),
    (44, "0370", "江戸川臨海", "a", 35 + 38.3 / 60, 139 + 51.8 / 60),
    (44, "1002", "練馬", "a", 35 + 44.3 / 60, 139 + 35.5 / 60),
    (44, "1133", "府中", "a", 35 + 41.0 / 60, 139 + 29.0 / 60),
    (45, "1236", "船橋", "a", 35 + 42.7 / 60, 140 + 2.6 / 60),
    (45, "47682", "千葉", "s", 35 + 36.1 / 60, 140 + 6.2 / 60),
    (45, "0382", "木更津", "a", 35 + 21.7 / 60, 139 + 56.4 / 60),
    (45, "0916", "佐倉", "a", 35 + 43.7 / 60, 140 + 12.7 / 60),
    (45, "0376", "我孫子", "a", 35 + 51.8 / 60, 140 + 6.6 / 60),
    (46, "47670", "横浜", "s", 35 + 26.3 / 60, 139 + 39.1 / 60),
    (46, "0388", "海老名", "a", 35 + 26.0 / 60, 139 + 23.2 / 60),
    (46, "0392", "三浦", "a", 35 + 10.7 / 60, 139 + 37.8 / 60),
    (46, "1443", "辻堂", "a", 35 + 19.2 / 60, 139 + 27.0 / 60),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    y, m, d = DAY
    for pref, block, name, kind, _, _ in STATIONS:
        f = OUT / f"{block}_{y}{m:02d}{d:02d}.html"
        if f.exists():
            continue
        u = (f"https://www.data.jma.go.jp/stats/etrn/view/hourly_{kind}1.php"
             f"?prec_no={pref}&block_no={block}&year={y}&month={m:02d}&day={d:02d}&view=")
        f.write_bytes(urllib.request.urlopen(u, timeout=30).read())
        print(name, f.name)
        time.sleep(0.5)


if __name__ == "__main__":
    main()
