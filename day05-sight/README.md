# Day 5 — Senses: Sight

- DATE: 05-11-2026
- NAME: Senses: Sight
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/
- 投稿: 2026年11月5日（X）

## Description（公式）

> How do you see something? Maybe map a viewshed?

## Description（日本語訳）

どうやって何かを見る？ 可視領域（viewshed）を地図にしてみては？

## 地図のテーマ

地上から見えない新宿駅

## 内容

新宿駅の通路や改札の多くは地下にあり、地上を歩いていても見えない。国土交通省の「新宿駅周辺屋内地図」の各階を立体に積み、地面を半透明にして、足の下に広がる地下1〜3階を透かして見せる。「どうやって見るか」というお題に、「地面を透かして見る」で答える。viewshed（可視領域）の地図ではない。

- 地下1〜3階は水色〜紫（寒色）で発光させる。地上の階（地上1階〜4階）は上ほど赤みの暖色で薄く描く。黄色は点字ブロック
- 地面には OSM の道路（歩道を除く）を薄く敷く。地面がないと、地下の階が地面の上に浮いて見えるため
- パネルの数字: この屋内地図にある床のうち **63%** が地下（地下 約11.2万m²、地上 約6.6万m²）。階ごとの床の面積は棒で示す
- ボタンで「地上の階」「地面」「点字ブロック」を消せる
- `?tour` で開くと（約15秒）、地面を不透明にして地上だけを見せ、2秒後に地下が浮かび上がり、回りながら途中で地面と道路を消す（投稿用の録画に使う）

## 言える範囲

- 63% は「このデータに入っている床」の中での割合。データの範囲（新宿駅とその周辺の地下街・駅ビルの一部）の外にある床や、データに入っていない階は数えていない。地上の階は駅ビルの一部しか入っていないので、駅の建物全体の地下の割合ではない
- 面積は各階の「階層データ（Floor）」のポリゴンを階ごとに合わせて、平面直角座標系 IX系（EPSG:6677）で測った。グランドレベル（屋外）と1階は同じ「地上1階」に数えた
- 階の高さは、データに実測値がないので1階あたり30mで均等に積んだ（見やすさのための強調で、実際の深さではない）
- 点字ブロックの約5.6kmは、データの「視覚障害者誘導用ブロック等（線）」の長さの合計。データに入っているものだけで、すべての点字ブロックかどうかは分からない。歩行空間ネットワークの点字ブロックの属性（brail_tile）は全区間が「不明（99）」なので使っていない
- データは令和2年度（2020年）の更新版で、その後の駅の工事（西口の再開発など）は入っていない

## データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| 新宿駅周辺屋内地図オープンデータ（令和2年度更新版）Shapefile | 国土交通省（高精度測位社会プロジェクト） | 新宿駅周辺屋内地図オープンデータ利用規約（政府標準利用規約。出典「国土交通省 高精度測位社会プロジェクト」、加工したときはその旨も書く） | https://www.geospatial.jp/ckan/dataset/mlit-indoor-shinjuku-r2 |
| 地上の道路 | © OpenStreetMap contributors | ODbL 1.0 | https://www.openstreetmap.org/copyright |

- 利用規約は 2026年11月5日に G空間情報センターの利用規約 PDF で確かめた
- Shapefile は [mlit-shinjuku-indoor-3dmap-on-maplibre](https://github.com/shiwaku/mlit-shinjuku-indoor-3dmap-on-maplibre) の `data/raw/` にあるもの（上のデータセットから取得したもの）を `data/shinjuku/` に置いて使う（Git 管理外）
- OSM の道路は Overpass API で取得（2026年11月5日、新宿駅のまわり約1.2km四方。トンネル・地下・屋内の道路は除く）

## 使用する技術

- **MLT（MapLibre Tile）** を最新のツールで作る
  - mlt CLI 0.6.1（`cargo install mlt --version 0.6.1 --locked`）。0.6 から GeoJSON の FeatureCollection を直接タイルにできるので、**tippecanoe は使わない**
  - ただし mlt 0.6.1 が GeoJSON から書けるのは MLT version 2（実験的）だけで、MapLibre GL JS 6.16 は version 2 を読めない（`Unsupported column type code 2075`）。そこで mlt で version 1 に変換し直す（GeoJSON → v2 → v1）
  - GeoJSON 入力の出力は `z/x/y.mlt` のフォルダだけで、PMTiles にはまとめられない。z14〜18 の143枚（約1MB）なので、フォルダのまま GitHub Pages から配信する
  - タイルは1レイヤー（`indoor`）にまとめ、`kind` で床・壁・点字ブロック・地面・道路を分ける。高さは整数 cm（`b` = 下端、`t` = 上端）
- **MapLibre GL JS 6.16**（`encoding: "mlt"`）の fill-extrusion だけで積む（deck.gl は使わない）。fill-extrusion は 0m より下に描けないので、地下3階の床を 0m に置いて全体を持ち上げる
- 発光: fill-extrusion には発光の描き方がないので、地下の階だけを描いた2枚目の地図を同じカメラで重ね、CSS の `filter: blur()` でぼかして `mix-blend-mode: screen`（明るさを足す合成）で乗せる。地上の階・地面・道路は光らせない
- 部屋（Space）は塗ると下の階が見えなくなるので、輪郭を 0.15m 幅・高さ 2.5m の薄い壁にする
- Vite 8（TypeScript）。`site/` にビルドする

## 作り方

```sh
npm install
python -I -X utf8 scripts/underground/prepare.py     # data/shinjuku/web/indoor.geojson と web/stats.json
bash scripts/underground/build_tiles.sh              # WSL で。web/tiles/{z}/{x}/{y}.mlt
npm run build                                        # site/ に出力（web/ の中身もコピーされる）
npx vite preview --port 4173
node scripts/underground/shot.mjs http://localhost:4173/ output/day05-underground.png
node scripts/underground/shot-tour.mjs http://localhost:4173/?tour      # 録画前の確認（始めと終わりの静止画）
node scripts/underground/record-live.mjs http://localhost:4173/?tour    # output/day05-underground.mp4（約15秒）
```

URL に `?bare` を付けるとパネルを消す。`?hash` で地図の位置を URL に出す。

## 投稿文

本文:

```text
#30DayMapChallenge Day 5 - Senses: Sight
新宿駅の屋内地図を階ごとに積んで、地面を透かしてみました🗺️

📝地上を歩いていても見えませんが、このデータにある床の63%は地下1〜3階にあります

デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/

#MapLibre #MLT
```

（動画 `output/day05-underground.mp4` を添付する。出典は画面内にある）

リプライ:

```text
出典）国土交通省 高精度測位社会プロジェクト「新宿駅周辺屋内地図データ」（国土交通省）を加工して作成、地上の道路 © OpenStreetMap contributors
制作に生成AI（Claude Code）を使用（コードの作成）
```

## 状況

- [x] データ準備（屋内地図 Shapefile、OSM の道路）
- [x] 地図作成（index.html。MLT は mlt CLI 0.6.1、MapLibre GL JS 6.16）
- [x] スクリーンショット（`output/day05-underground.png`）
- [x] 短い動画（`output/day05-underground.mp4`、画面録画、約15秒、地面を消す場面あり、出典は画面内）
- [x] 投稿（2026年11月5日、X）
