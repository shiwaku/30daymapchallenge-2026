# Day 11 — Senses: Sound

- DATE: 11-11-2026
- NAME: Senses: Sound

## Description（公式）

> How do you hear something? How do you map a soundscape? Noise pollution mapped?

## Description（日本語訳）

どうやって何かを聞く？ サウンドスケープはどう地図にする？ 騒音公害を地図にしてみては？

## 地図のテーマ

頭の上を飛ぶ音

## 内容

低い高度を飛ぶ航空機の軌跡と、その下に住む人口（騒音値ではなく「上空を通る」ことを示す）

## 使用する技術

- Python → MLT → deck.gl（高度方向に立体表示）

## データ

- adsb-flight-data-converter（ADSB.lol）＋ 国勢調査メッシュ

## 試作

- [鶴ヶ島上空の朝](morning-flights/)（[ページ](https://shiwaku.github.io/30daymapchallenge-2026/day11-sound/morning-flights/)）: 2026年10月19日朝に鶴ヶ島駅の上空を通った航空機を、所属ごとに色分けしたアニメーション（MapLibre GL JS）

## 状況

- 準備度: ○
- [ ] データ準備
- [ ] 地図作成
- [ ] スクリーンショット / 短い動画（chiitiler）
- [ ] 投稿（#30DayMapChallenge）
