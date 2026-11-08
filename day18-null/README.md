# Day 18 — NULL

- DATE: 18-11-2026
- NAME: NULL

## Description（公式）

（公式ページに説明文なし）

## Description（日本語訳）

（説明文なし）

## 地図のテーマ

名前のない道

## 内容

OSM の道路のうち、名前（name）が入っていない道を描く

## 使用する技術

- DuckDB（OSM の集計）→ PMTiles → MapLibre GL JS

## データ

- japan-basemap-tile-pipeline（OSM）

## 候補（手元のデータ、2026-11-09 調べ）

- sapporo-address-grid: 札幌の交差点にはほとんど名前がなく、住所（条・丁目）で呼ぶ。「名前のない道」と同じ話として補える
- 別案: ndl-warp-geospatial-data-fetcher（配布元が消え、国立国会図書館の WARP にしか残っていない地理空間データ）

## 状況

- 準備度: △
- [ ] データ準備
- [ ] 地図作成
- [ ] スクリーンショット / 短い動画（chiitiler）
- [ ] 投稿（#30DayMapChallenge）
