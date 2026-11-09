# Day 10 — Prompting only

- DATE: 10-11-2026
- NAME: Prompting only

## Description（公式）

> For this map, make AI work for its money and produce something from start to finish in a chat window or on the command line.

## Description（日本語訳）

この地図では AI にしっかり働いてもらい、チャット画面かコマンドラインの中だけで最初から最後まで作ろう。

## 地図のテーマ

カタログの URL だけを渡して、AI に1枚作らせる

## 内容

自分で整備している STAC カタログ（[catalog.shi-works.com](https://catalog.shi-works.com/catalog.json)）の URL だけを最初の一文で渡し、データ選び・集計・地図のデザイン・公開まで Claude Code に任せる。こちらからは指示を出すだけで、コードやデータを手で触らない。カタログの入口には AI 向けの使い方（`AGENTS.md`）がある。

最初の一文（予定）:

```text
https://catalog.shi-works.com/catalog.json のデータを使って、地図を1枚作って公開して
```

- 作業は Day 10 専用の新しいセッションで行い、最初の一文から最後までのやりとりを作業ログとして公開する
- 投稿では、地図・最初の一文・指示の回数を見せる
- 気をつけること:
  - 人口メッシュを六角形でまとめる方向に進んだら止める（Day 20 の別の担当分と重なるため）
  - 交通事故統計の年齢層・生活道路の定義など、言える範囲はカタログ側の説明に従っているか最後に確かめる
  - 出典は各コレクションの表記（例: 「交通事故統計情報のオープンデータ」（警察庁）を加工して作成）に従う

## 使用する技術

- Claude Code（どのツールを使うかも AI に任せる）

## データ

- [shi-works カタログ](https://catalog.shi-works.com/catalog.json)（STAC、GeoParquet）。2026-11-09 時点のコレクション:
  - 交通事故統計（本票、警察庁、2019〜2025年）
  - 道路交通センサス（国交省、2021年）
  - 人口集中地区（総務省統計局、2020年）
  - 簡易100mメッシュ人口（2020年、CC BY 4.0）
  - 行政区域（国土数値情報、2026年、CC BY 4.0）
- 整備の記録: [shiwaku/shi-works-catalog](https://github.com/shiwaku/shi-works-catalog)

## 経緯

- 11-09 の候補は、交通事故統計を集計する MCP を使う案だった。データを AI が自分で探すところからお題に含めるため、カタログの URL を渡す形にした

## 状況

- 準備度: ○
- [ ] データ準備
- [ ] 地図作成
- [ ] スクリーンショット / 短い動画（chiitiler）
- [ ] 投稿（#30DayMapChallenge）
