"""extract.py の出力に所属を付けて template.html に埋め込み、HTML を出力する。

usage: build.py NEAR_JSON LAT LON CENTER_LABEL OUT_HTML {pages|artifact}
  pages:    単体の HTML（doctype 付き）。背景は地理院タイルを直接読む
  artifact: Artifact 用。背景は同じ場所に置いた tiles/ を読む
"""
import json, math, sys
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
NEAR, LAT0, LON0, LABEL, OUT, MODE = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6]
R = 12.0
TEMPLATE = __file__.rsplit("/", 1)[0] + "/template.html"
GSI = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"

CATS = [
    {"key": "jasdf", "label": "航空自衛隊", "color": "#1d5fd1"},
    {"key": "usaf", "label": "米空軍", "color": "#d1342b"},
    {"key": "civil_low", "label": "民間機（低空）", "color": "#e08a00"},
    {"key": "civil_high", "label": "民間旅客機（高空）", "color": "#8a94a0"},
]

# 機種・機番・コールサインからの判定（軍用の5機は DB の軍用フラグ dbFlags=1 も立っている）
KNOWN = {
    "87cc38": ("jasdf", "C-2 輸送機", "航空自衛隊 C-2（機番 88-1207）"),
    "87cc1a": ("jasdf", "C-130H 輸送機", "航空自衛隊 C-130H（機番 45-1073）"),
    "87cd05": ("jasdf", "U-680A 飛行点検機", "航空自衛隊 U-680A（Cessna 680、機番 12-3033）"),
    "ae0588": ("usaf", "C-5M 輸送機", "米空軍 C-5M Super Galaxy（87-0043、航空機動軍団 REACH）"),
    "ae6cf2": ("usaf", "C-37A 要人輸送機", "米空軍 C-37A（Gulfstream V、20-1949、SAM）"),
    "a8bc4f": ("civil_low", "B767 貨物機", "アトラス航空 B767-300（N662GT）"),
    "84090c": ("civil_low", "小型機（詳細不明）", "日本の民間機（登録情報なし、JA02GA）"),
    "8409f9": ("civil_low", "ヘリコプター", "日本の民間ヘリコプター Bell 505（JA02RX）"),
}


def dist_km(lat, lon):
    return math.hypot((lat - LAT0) * 111, (lon - LON0) * 111 * math.cos(math.radians(LAT0)))


aircraft = []
for a in json.load(open(NEAR)):
    cs = next((c for c in a["callsigns"] if len(c) > 2), a["r"] or a["icao"])
    if a["icao"] in KNOWN:
        cat, name, detail = KNOWN[a["icao"]]
    else:
        cat, name, detail = "civil_high", a["t"] or "", f'{a["desc"] or ""}（{a["r"] or ""}）'
    pts = [[p[0], round(p[2], 5), round(p[1], 5), p[3]] for p in a["points"]]
    near = min(a["points"], key=lambda p: dist_km(p[1], p[2]))
    alt = near[3] if isinstance(near[3], (int, float)) else None
    aircraft.append({
        "id": a["icao"], "label": f"{name} {cs}".strip(), "cat": cat, "tc": near[0],
        "detail": f"{detail}<br>コールサイン {cs}<br>最接近 {dist_km(near[1], near[2]):.1f}km・"
                  f"{datetime.fromtimestamp(near[0], JST).strftime('%H:%M')}"
                  + (f"・高度 約{round(alt * 0.3048, -1):.0f}m" if alt else ""),
        "pts": pts,
    })

ring = [[LON0 + R / (111 * math.cos(math.radians(LAT0))) * math.cos(math.radians(d)),
         LAT0 + R / 111 * math.sin(math.radians(d))] for d in range(0, 361, 5)]
data = {
    "cats": CATS, "aircraft": aircraft, "center": [LON0, LAT0], "centerLabel": LABEL,
    "tiles": GSI if MODE == "pages" else "tiles/{z}/{x}/{y}.png", "tileMaxZoom": 18 if MODE == "pages" else 12,
    "t0": datetime(2026, 10, 18, 21, 35, tzinfo=timezone.utc).timestamp(),
    "t1": datetime(2026, 10, 19, 0, 5, tzinfo=timezone.utc).timestamp(),
    "ring": {"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": ring}},
}
html = open(TEMPLATE).read()
html = (html.replace("__DATA__", json.dumps(data, ensure_ascii=False))
        .replace("__RADIUS__", f"{R:.0f}").replace("__CENTER__", LABEL))
if MODE == "pages":
    head, body = html.split("</style>", 1)
    html = ('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'{head}</style>\n</head>\n<body>{body}</body>\n</html>\n')
open(OUT, "w").write(html)
print(len(aircraft), "aircraft,", len(html) // 1024, "KB →", OUT)
