# Day 8 — Utopia

- DATE: 08-11-2026
- NAME: Utopia
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day08-utopia/site/

## Description（公式）

> A map of something which could be.

## Description（日本語訳）

ありえるかもしれない何かの地図。

## 地図のテーマ

自転車の道が、つながったら（自転車で走りやすい東京）

## 内容

OpenStreetMap（OSM）で「自転車に適した道」として描かれている道を、東京都（島しょ部を除く）と埼玉県で集め、ひと続きに走れるつながり（連結成分）ごとに、その長さで色を変えて描く。長いつながりほど明るく、いちばん長いつながりは黄色に光らせる。背景は幹線道路・川・都県境だけを薄く置く。

そのうえで、短いすき間を埋めたらどこまでつながるかを計算して見せる（お題の「ありえるかもしれない」）。最初は自動で進み、ボタンで行き来できる。

1. いまの自転車の道: 約1,588kmの道が1,480のかたまりに分かれていて、いちばん長いつながりは60.5km（全体の3.8%、荒川の下流沿い）
2. 300m以下のすき間を埋めると: 67か所・合計8.5kmで、いちばん長いつながりは75.6km
3. 1km以下のすき間を埋めると: 125か所・合計44.1kmで、いちばん長いつながりは215.0km（全体の13.5%、多摩川沿いから立川・府中・小金井あたりまで）。このつながりに入るすき間は28か所・合計10.8km

すき間はピンクの線で示す。線にマウスを乗せると、すき間の長さと、つなぐ2つのつながりの長さを出す。

### 自転車に適した道の決め方（OSM のタグ）

次のどれかに当てはまる道（way）。

| 種類 | タグ |
|---|---|
| 自転車道 | `highway=cycleway`（`bicycle_road=yes`・`cyclestreet=yes` も含む） |
| 車道の自転車レーン・自転車道 | `cycleway` / `cycleway:both` / `cycleway:left` / `cycleway:right` が `lane` / `track`（`opposite_lane` / `opposite_track` を含む） |
| 歩行者と共用 | `highway=path` / `footway` / `pedestrian` / `track` / `bridleway` で `bicycle=designated`。ただし車道沿いの歩道（`footway=sidewalk`）は除く |

次のものは含めない。

- `bicycle=no` / `dismount` / `private` / `use_sidepath` の道、`access=private` / `no` の道（自転車が許されている場合を除く）、工事中・計画中の道、階段、広場（`area=yes`）
- 矢羽根（`cycleway=shared_lane`。約786km）。車と同じ車線を走るため
- 車道沿いの歩道で `bicycle=designated` のもの（自転車通行可の歩道。約110km）。歩道を走ることになるため
- 自転車が通ってよいだけの道（`bicycle=yes`）と、住宅地の静かな道。含めると、ほぼすべての道がつながってしまい、「自転車のための道」の地図でなくなるため

### つながりとすき間の計算

- 道どうしが OSM のノードを共有していれば、つながっているとみなす。加えて、道の端点から20m以内に別の道があれば、つながっているとみなす（道路の横断や、データの小さな切れ目）
- つながりの長さは、つながっている道の中心線の長さの合計（車道の両側にレーンがあっても1本として数える）。距離は JGD2011 平面直角座標系 第IX系（EPSG:6677）で測る
- すき間は、長さ2km以上のつながり（185個）どうしで、いちばん近い2点を直線で結んだ線。1km以下の組は171組あった
- すき間を短い順に埋めていき、すでに同じつながりになった組は飛ばす（クラスカル法の最小全域森）。「300mまで」「1kmまで」は、この順で 300m・1km 以下のすき間だけを埋めた状態
- 線が交わっているのにノードを共有していない組は、すき間に数えない（1組。荒川の河川敷の道と、その上を通る鹿浜橋の歩道で、立体交差）

### 言える範囲

- OSM に描かれている道の地図で、実際の自転車の道のすべてではない。OSM の描き込みは地域・人によって差があり、描かれていない自転車レーンや、タグの付け方が違う道もある。描き込みの多い地域ほど長く、多く見える
- 「自転車に適した」は上のタグの決め方によるもので、走りやすさや安全を確かめたものではない。歩行者と共用の道や川沿いの道には、歩行者が多い所、段差や車止めのある所もある
- すき間は直線距離で、計算の結果。整備の計画ではなく、その間に実際に通れる道があるか、川や線路を越えられるかも確かめていない。直線より実際の道のりは長い
- 2km未満のつながり（1,295個、合計約516km）は、すき間の計算に入れていない
- データは 2026年11月1日時点の OSM（Geofabrik の抽出）

## データ

- © OpenStreetMap contributors（ODbL）。[Geofabrik](https://download.geofabrik.de/asia/japan/kanto.html) の関東の抽出 `kanto-261101.osm.pbf`（2026-11-01 時点）を加工して作成
- ビューワが読むデータは `web/`（OSM から作った派生データなので ODbL）

## 使用する技術

- DuckDB spatial（`ST_ReadOSM` で .osm.pbf を読み、道の線を組み立てる）
- Python（GeoPandas・Shapely。つながりは Union-Find、すき間は STRtree と `shortest_line`）
- Vite 8 ＋ MapLibre GL JS 6（TypeScript）。データは GeoJSON（合計約2.7MB）をそのまま読む
- 道の線はつながりごとにまとめ、2m で簡略化している
- 公開版は `site/`（`npm run build` の出力）。GitHub Pages では /day08-utopia/site/。`web/` を `../web/` で読む
- スクリーンショットは playwright-core（Chrome）。`?step=0|1|2` で段階を指定、`?poster` で投稿用の画像（ボタンなし）

## 作り方

```sh
curl -L -o data/geofabrik/kanto-261101.osm.pbf https://download.geofabrik.de/asia/japan/kanto-261101.osm.pbf
python -I -X utf8 scripts/extract.py data/geofabrik/kanto-261101.osm.pbf data/work   # 約30秒
python -I -X utf8 scripts/analyze.py data/work web                                    # web/ に出力
npm install
npm run dev     # http://localhost:5173/
npm run build   # site/ に出力
node scripts/shot.mjs http://localhost:5173/   # output/ にスクリーンショット
```

`scripts/fetch.py`（Overpass API で取る版）も置いてあるが、2026年11月2日には Overpass が混んでいてタイムアウトしたため、Geofabrik の抽出を使った。

## 投稿文の下書き

本文:

```text
#30DayMapChallenge Day 8 - Utopia
東京・埼玉の自転車道と自転車レーンをOSMから集め、つながりごとに色分けしてみました🗺️
📝ひと続きの最長は約60km。1km以下のすき間28か所（計約11km）を埋めると約215kmになる計算
デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day08-utopia/site/
#MapLibre #OpenStreetMap
```

X の文字数で278（日本語2・URL 23で数えた）。すき間は直線距離の計算で、計画ではない（ビューワと画像に書いてある）。

リプライ:

```text
出典）© OpenStreetMap contributors（ODbL）を加工して作成
制作に生成AI（Claude Code）を使用（コードの作成）
```

画像は `output/day08-utopia.png`（`node scripts/shot.mjs` で作る。画面内に出典あり）。

## 状況

- [x] データ準備
- [x] 地図作成（index.html）
- [x] スクリーンショット（output/day08-utopia.png）
- [ ] 投稿（#30DayMapChallenge）
