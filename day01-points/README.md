# Day 1 — Points

- DATE: 01-11-2026
- NAME: Points

## Description（公式）

> A map challenge classic. Map with points.

## Description（日本語訳）

マップチャレンジの定番。点で地図を作る。

## 地図のテーマ

シェアサイクルはどこにあるか

## 内容

全国のシェアサイクルステーションを点で描く

## 使用する技術

- Python（ODPT API）→ tippecanoe → PMTiles → MapLibre GL JS

## データ

- [公共交通オープンデータセンター](https://www.odpt.org/)（ODPT）の GBFS `station_information`（CC BY 4.0）
  - ドコモ・バイクシェア（`docomo-cycle`, `docomo-cycle-tokyo`。重複する station_id は除く）
  - HELLO CYCLING（`hellocycling`）
- 2026年10月29日取得: ドコモ・バイクシェア 6,231 / HELLO CYCLING 15,616、計 21,847 ステーション
- 駐輪可能台数には 0 や 32767 などの外れ値があるので、表示では 1〜40 台に収めている

## 作り方

```sh
python -I scripts/fetch.py   # data/stations.geojson
wsl -e tippecanoe -o data/stations.pmtiles --force -l stations -Z3 -z10 -r1   --no-feature-limit --no-tile-size-limit data/stations.geojson
npx http-server -p 8731      # http://localhost:8731/
```

背景地図は使わず、点だけで描く。全国で見ると都市にしかないことが、東京に寄るとドコモ（都心）と HELLO CYCLING（その外側）の縄張りが見える。

## 状況

- 準備度: ◎
- [x] データ準備
- [x] 地図作成（index.html）
- [ ] スクリーンショット / 短い動画（chiitiler）
- [ ] 投稿（#30DayMapChallenge）
