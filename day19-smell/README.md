# Day 19 — Senses: Smell

- DATE: 19-11-2026
- NAME: Senses: Smell

## Description（公式）

> How do you map things which your nose can sense? What does a smelly map look like?

## Description（日本語訳）

鼻で感じられるものをどう地図にする？ においのする地図はどんな見た目？

## 地図のテーマ

秋の東京、においのする並木

## 内容

東京都の都道の街路樹（23区・多摩、228,058本）から、においの強い木を1本ずつ置き、においが漂う範囲としてぼかして描く。主役はイチョウ（24,354本、ぎんなんが落ちる11月）で、キンモクセイ（6,495本、花は10月）を重ねる。

- 言える範囲: 「イチョウが植わっている道」まで。ぎんなんがなるのは雌木だけで、データに雌雄は無いので、においが確実にする道とは言えない
- 範囲は都道だけ（区市町村道・公園の木は含まない）。23区の調査年度は区ごとに令和2〜5年度

## 使用する技術

- Python（CSV → GeoJSON）→ MapLibre GL JS（木ごとにぼかした円・heatmap）

## データ

- 東京都建設局「都道の街路樹」CC BY 4.0（[カタログ](https://catalog.data.metro.tokyo.lg.jp/dataset/t000014d2000000029)）
  - [街路樹（都道：23区）](https://www.opendata.metro.tokyo.lg.jp/kensetsu/tokyo_gairoju.csv)（2025-02-20 更新）: 144,183本（イチョウ 17,216・キンモクセイ 4,024）。列は 樹種・区分・樹高・枝張・幹周・行政区・種別・整理番号・路線名・通称道路名・経度・緯度。Shift_JIS。2026-11-09 に取り直し、手元の写し（2025-04 取得）と SHA-256 が一致
  - [街路樹（都道：多摩地域）](https://www.opendata.metro.tokyo.lg.jp/kensetsu/tokyo_tama_gairoju.csv)（2026-04-26 更新）: 83,875本（イチョウ 7,138・キンモクセイ 2,471）。列名は英語（name・type・height・perimeter・width・route・route_name・route_nickname・route_type・longitude・latitude）。UTF-8（BOM 付き）

## 経緯

- はじめは「においのする井戸」（mlit-groundwater-well-registry）の予定だった。台帳（71,198本）の水質の列に硫化水素が無く、においに関わるのは FE（鉄）・NH4-N くらいだったので、2026-11-09 に街路樹に替えた

## 状況

- 準備度: ○
- [ ] データ準備
- [ ] 地図作成
- [ ] スクリーンショット / 短い動画（chiitiler）
- [ ] 投稿（#30DayMapChallenge）
