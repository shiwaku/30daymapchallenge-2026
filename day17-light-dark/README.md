# Day 17 — Light & dark

- DATE: 17-11-2026
- NAME: Light & dark
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day17-light-dark/site/

## Description（公式）

> Play with visual effects. What can you map with just light and shadows?

## Description（日本語訳）

視覚効果で遊ぼう。光と影だけで何が地図にできる？

## 地図のテーマ

日本の送電網

## 内容

国土地理院の地図に描かれている送電線を全国分集めて、黒い背景の上で光だけで描く（お題の「光と影だけで」）。線を太くぼかした光を重ねて、送電線が集まる所ほど明るく見せる。

（はじめは Day 12 Power 用に作ったもの。Day 12 は世界の発電量にしたので、Day 17 に回した。夜間光で日本の夜を描く案はやめた）

国土地理院最適化ベクトルタイルでは、送電線（`PwrTrnsmL` レイヤ）は拡大した地図（ズーム14〜16）にしか入っていない。日本全体を一度に見る地図はないので、ズーム14のタイル（138,978枚）を PMTiles から全部読み、送電線だけを取り出してつないだ。

- 送電線: 全国で約 77,441km（地図上の線の長さの合計）
- 点: 地図に書かれた名前の注記のうち、「〜発電所」で終わるもの（680か所）と「〜変電所」「〜開閉所」「〜変換所」で終わるもの（89か所）。拡大すると名前が出る
- 拡大すると、背景に地理院の道路・水部が薄く出る

## 言える範囲

- 線は国土地理院の地図（電子国土基本図）に描かれた送電線で、属性は地物コード（8202）だけ。**電圧・事業者・回線数・周波数（50Hz/60Hz）の情報はない**ので、色分けはしていない
- 地図に描かれていない送電線は入らない。たとえば東京の都心部には線がほとんどない（東経139.70〜139.80度・北緯35.65〜35.72度の範囲で0.1km。同じ大きさの多摩の範囲、東経139.30〜139.40度では約39km）。地中にあるためか、地図に描かれていないためかは、このデータからは分からない。電柱の配電線は入らない
- 長さは、ズーム14のタイルの線をタイルの範囲で切って、測地線長（GRS80）を足したもの。同じルートに複数の回線があっても線は1本なので、「送電線の延長（回線の長さ）」の統計とは違う。電力会社などの公表値とは比べていない
- データは 2026年7月1日時点（国土地理院の説明。最新の状況がいつも反映されているとは限らない、と書かれている）。最適化ベクトルタイルは試験公開で、基本測量成果ではない
- 点は地図の**名前の注記**の位置で、施設の位置そのものではない。名前の書かれていない発電所・変電所は入らないので、施設の数ではない。「太陽光発電所」とだけ書かれた注記が274か所ある
- 表示用に、線を約1mの許容で単純化し、座標を約1m（1e-5度）に丸めている

## データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| 国土地理院最適化ベクトルタイル（PMTiles、ズーム4〜16、2026年7月1日時点） | 国土地理院 | 国土地理院コンテンツ利用規約に従う（出典「国土地理院最適化ベクトルタイル」。加工したことも書く） | https://github.com/gsi-cyberjapan/optimal_bvmap |
| 国土地理院コンテンツ利用規約 | 国土地理院 | — | https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html |

- 利用条件は 2026年11月2日に上の2つのページで確かめた。利用規約は公共データ利用規約（PDL1.0）に準じ、編集・加工したときは出典とは別に加工したことを書く（国土地理院が作ったように見せない）
- 画面の下に「出典: 国土地理院最適化ベクトルタイル（2026年7月1日時点のデータ）を加工して作成（国土地理院コンテンツ利用規約）」を常に出す。投稿画像（`output/day17-light-dark.png`）にも入っている
- 送電線と注記は、PMTiles（約16.9GB）のうちズーム14のタイル（約2.9GB）だけを Range リクエストで一度読んで取り出した。取り出した結果（`web/power.geojson` 約9MB、`web/plants.geojson`、`web/stats.json`）をこのリポジトリに置く
- 背景（水部・海岸線・都府県界・道路）は、配信元の PMTiles をブラウザから直接読む（`Access-Control-Allow-Origin: *`）
- 以前の XYZ 版（`optimal_bvmap-v1/{z}/{x}/{y}.pbf`）は2023年10月のデータで更新が止まっているので使わない
- 国土数値情報の発電施設データ（P03）は「非商用」で、最新が2013年度なので使わない

## 使用する技術

- Python（`pmtiles`・`mapbox-vector-tile`・Shapely・pyproj）: PMTiles のディレクトリからズーム14のタイルを数え、続いているタイルをまとめて Range リクエストで取得。タイルから `PwrTrnsmL` と `Anno` のレイヤだけを取り出して解析する
- Shapely: タイルの範囲で切る → 経緯度に戻す → タイルの境目でつなぐ（`line_merge`）
- Vite 8 ＋ MapLibre GL JS 6 ＋ pmtiles（TypeScript）。送電線は GeoJSON を3本の線（太くぼかした線2本＋芯）で重ねて光らせる
- 確認・投稿画像は playwright-core（Chrome）で撮る
- 公開版は `site/`（`npm run build` の出力）。GitHub Pages では /day17-light-dark/site/、データは ../web/ を読む

## 作り方

```sh
npm install
python -X utf8 scripts/fetch.py 8         # data/ にズーム14の送電線と注記（約2.9GB を読む。数分）
python -X utf8 scripts/build.py           # web/power.geojson, web/plants.geojson, web/stats.json
npm run dev                                # http://localhost:5173/
npm run build                              # site/ に出力
node scripts/shot.mjs http://localhost:5173/   # output/ にスクリーンショット
```

URL に `?poster` を付けると、拡大ボタンを消して全国を表示する（投稿画像用。出典は残る）。

## 状況

- [x] データ準備（ズーム14のタイルから送電線・注記を取り出し。利用規約を確認）
- [x] 地図作成（index.html）
- [x] スクリーンショット（`output/day17-light-dark.png`、`output/mobile.png` ほか。出典入り）
- [ ] 短い動画（画面録画）
- [ ] 投稿（#30DayMapChallenge）

## 投稿文の下書き

本文:

```text
#30DayMapChallenge Day 17 - Light & dark
地理院の最適化ベクトルタイルから送電線を全国分集めて、光らせてみました🗺️

📝送電線はズーム14〜16にしか無いので、z14のタイル約14万枚を読みました。線の合計は約7.7万km

デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day17-light-dark/site/

#MapLibre #PMTiles
```

（画像 `output/day17-light-dark.png` を添付する）

リプライ:

```text
出典）国土地理院最適化ベクトルタイル（2026年7月1日時点）を加工して作成
制作に生成AI（Claude Code）を使用（コードの作成）
```
