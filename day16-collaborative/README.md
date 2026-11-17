# Day 16 — Collaborative map

- DATE: 16-11-2026
- NAME: Collaborative map
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day16-collaborative/

## Description（公式）

> Do a map with a friend, colleague or a stranger. AI doesn't count as a friend :)

## Description（日本語訳）

友人、同僚、あるいは見知らぬ人と一緒に地図を作ろう。AI は友人に数えません :)

## 地図のテーマ

雲海の竹田城（山城攻城記様のデータと）

## 内容

山城の訪問記サイト「山城攻城記」様が歩いて記事にした城（673城）を、暗い地図に光らせる。そこから兵庫県の竹田城へズームインし、兵庫県の50cm DSM（木や建物の上の高さ）で立体にした山を、雲海に沈める。雲が下がっていくと、石垣の曲輪が雲の上に出てくる。

- 城のデータは山城攻城記様のもので、使うことの了承をいただいている（お題の「誰かと一緒に」）。以前から Web 地図（[csmap-on-maplibre](https://github.com/shiwaku/csmap-on-maplibre)）でも重ねている
- 竹田城は石垣が整備されていて、DSM で見ると森の中に城だけが島のように浮いて見える。DSM と DEM（地面）の差で森を消す案も試したが、竹田城では城が最初から見えているので、雲海にした

ページを開くと、673城の地図 → 竹田城へズームイン → 真上から傾けながら雲が 385m から 290m まで下がる、の順に動く（約21秒）。そのあとは雲が上下し続け、マウスで回せる。スライダーで雲の高さを変えられる。

- URL に `?scene=castle` で3Dだけ、`?scene=overview` で地図だけ、`?poster` で投稿画像用（操作部品を隠す）。`&cloud=290` で雲の高さを決める

## 言える範囲

- 雲は演出で、実際の雲海の観測ではない。雲の高さ（表示の数字）は、地形の標高と同じ基準で置いている
- 地形は兵庫県の 50cm DSM（2021〜2022年度の航空レーザ測量）。表示では 2m 間隔に間引いた点で山の形を作り、色は 0.5m 間隔（DSM と DEM の差で森と地面を塗り分け、陰影をかけたもの）
- 切り出した範囲（約1.4km×1.2km）の DEM の最高点は 352.35m。城の正式な標高とは比べていない
- 城の数（673）は、2026年11月17日に読んだ時点の山城攻城記様のデータの件数。山城以外（平城・台場など）も入る。「約半分が広島県」は、所在地が広島県の 330城（ほかに県名の書かれていない広島県内の行もある）
- 城の位置は山城攻城記様のデータの点で、城の範囲や縄張りではない

## データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| 兵庫県 50cmメッシュ DSM・DEM（2021〜2022年度） | 兵庫県 | CC BY 4.0（兵庫県オープンデータ利用規約） | https://web.pref.hyogo.lg.jp/kk26/3dgeo.html ・ https://www.geospatial.jp/ckan/dataset/2022-hyougo-geo-dsm |
| 山城のデータ（城名・所在地・位置など） | 山城攻城記 | 2次利用は山城攻城記様の許可が必要。この地図は許可を得て使用 | https://gosenzo.net/yamajiro/ |
| 国土地理院最適化ベクトルタイル（背景の海岸線・水部） | 国土地理院 | 国土地理院コンテンツ利用規約 | https://github.com/gsi-cyberjapan/optimal_bvmap |

- DSM・DEM は、AWS の公開バケット（`s3://japan-pointcloud/Hyogo/2022/01/LP/{DSM,DEM}/TXT/05/MF/51/05MF51.zip`）から、竹田城を含む図郭 05MF51 だけを取った（各約240MB、Git 管理外の `data/`）。利用条件は 2026年11月17日に G空間情報センターのデータセットのページと兵庫県のページで確かめた
- 取り出した結果（`web/dsm.bin` 約3.4MB、`web/color.jpg` 約2.8MB、`web/meta.json`）をこのリポジトリに置く
- 山城攻城記様のデータはこのリポジトリに複製せず、配信先（`https://shiwaku.github.io/yamajiro-geojson/castles-data.geojson`）からブラウザで読む。配信元の値に裸の `NaN` が入るので、読んだあと `null` に置き換える
- 画面の下に出典を常に出す。動画・投稿画像にも入っている
- 広島県の城（DoboX の点群）も考えたが、木や建物の点まで入ったオリジナルデータは申請制（利用規約の「特定データ」）で、成果物を公開してよいか書かれていないので使わなかった

## 使用する技術

- Python（NumPy・rasterio・Pillow・pyproj）: XYZ テキストから竹田城まわりを GeoTIFF に切り出し、Web 用に 1m の標高（Uint16）と色の JPEG にする
- three.js 0.170: 地形のメッシュ、雲（高さで霧をかけるシェーダーと、ノイズの雲の面を3枚）
- MapLibre GL JS 5.6 ＋ pmtiles: 導入の673城の地図
- 録画・スクリーンショットは playwright-core（Chrome）。動画はページをそのまま録画したもの（コマ撮りではない）を ffmpeg で MP4 にした

## 作り方

```sh
mkdir -p data/raw && cd data/raw
curl -O https://japan-pointcloud.s3.ap-northeast-1.amazonaws.com/Hyogo/2022/01/LP/DSM/TXT/05/MF/51/05MF51.zip  # DSM_05MF51.zip に名前を変える
curl -O https://japan-pointcloud.s3.ap-northeast-1.amazonaws.com/Hyogo/2022/01/LP/DEM/TXT/05/MF/51/05MF51.zip  # DEM_05MF51.zip に名前を変える
cd ../..
python -X utf8 scripts/xyz2tif.py      # data/takeda_dsm.tif, data/takeda_dem.tif
python -X utf8 scripts/prep_web.py     # web/dsm.bin, web/color.jpg, web/meta.json
python -m http.server 8016             # http://localhost:8016/
node scripts/shot.mjs                  # output/ に静止画
node scripts/record.mjs                # output/day16-collaborative.webm（約34秒）
```

## 状況

- [x] データ準備（兵庫県 DSM・DEM の切り出し、利用条件の確認、山城攻城記様の了承）
- [x] 地図作成（index.html）
- [x] スクリーンショット・動画（`output/day16-collaborative.png`、`output/day16-collaborative.mp4`。出典入り）
- [ ] 投稿（#30DayMapChallenge）

## 投稿文の下書き

本文:

```text
#30DayMapChallenge Day 16 - Collaborative map
山城攻城記様の山城データ（673城）から、竹田城を雲海に浮かべてみました🏯

📝兵庫県の50cm DSMで、木の1本まで立体にしています

デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day16-collaborative/

#threejs #MapLibre
```

（動画 `output/day16-collaborative.mp4` を添付する）

リプライ:

```text
出典）兵庫県 50cmメッシュDSM（2021〜2022年度）を加工して作成（CC BY 4.0）、山城攻城記様の山城データ（許可を得て使用）、国土地理院最適化ベクトルタイル
制作に生成AI（Claude Code）を使用（コードの作成）
```
