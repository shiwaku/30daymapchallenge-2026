# Day 19 — Senses: Smell

- DATE: 19-11-2026
- NAME: Senses: Smell

## Description（公式）

> How do you map things which your nose can sense? What does a smelly map look like?

## Description（日本語訳）

鼻で感じられるものをどう地図にする？ においのする地図はどんな見た目？

## 地図のテーマ

においのする井戸

## 内容

硫化水素・鉄など、においに関わる水質項目がある深井戸

## 使用する技術

- GeoParquet → MapLibre GL JS

## データ

- mlit-groundwater-well-registry（F9、該当項目の有無を要確認）

## 候補（手元のデータ、2026-11-09 調べ）

- ⚠ mlit-groundwater-well-registry（71,198本）の水質の列は TEMP・PH・NOX・NH4-N・CL・ER・HD・FE・DR・CA・MG・SO4・AL・KMNO4 だけで、硫化水素は無い。においに関わるのは FE（鉄）・NH4-N くらい
- 別案: 東京都の街路樹（都道、144,183本、手元に CSV）。イチョウ 17,216本・キンモクセイ 4,025本で、秋のにおいの地図になる。雌雄（ぎんなんがなるのは雌木）は分からない。出典・ライセンス・時点は要確認

## 状況

- 準備度: △
- [ ] データ準備
- [ ] 地図作成
- [ ] スクリーンショット / 短い動画（chiitiler）
- [ ] 投稿（#30DayMapChallenge）
