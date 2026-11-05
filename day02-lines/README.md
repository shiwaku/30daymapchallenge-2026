# Day 2 — Lines

- DATE: 02-11-2026
- NAME: Lines
- 投稿: 2026年11月2日（X）

## Description（公式）

> A map challenge classic. Map with lines.

## Description（日本語訳）

マップチャレンジの定番。線で地図を作る。

## 到達圏 120 分の都市比較

図の見出しは「How far can you drive in 120 minutes? 8 cities at the same scale (legal default speeds where unposted)」。

![到達圏 120 分の都市比較](https://raw.githubusercontent.com/shiwaku/overture-road-route-search/main/docs/images/reach_120_legal/all_en.png)

Overture Maps の道路データから全球の道路ネットワークを作り、到達圏を返す API をローカルで動かして検証した。東京・ニューヨーク・ロサンゼルス・ロンドン・パリ・北京・デリー・サンパウロの8都市の中心から、車で120分で届く道路を、中心からの所要時間の色で、同じ縮尺に並べた。道路の線を所要時間で塗っているので、お題の「線で地図を作る」を満たす。

- 作ったリポジトリ: [overture-road-route-search](https://github.com/shiwaku/overture-road-route-search)（図は [docs/images/reach_120_legal/all_en.png](https://github.com/shiwaku/overture-road-route-search/blob/main/docs/images/reach_120_legal/all_en.png)）。投稿したのは英語版（all_en.png。日本語版は all.png）。画像はこのリポジトリにはコピーせず、上で表示しているだけ
- 道路は幹線（motorway〜tertiary とそのランプ）。一方通行と制限速度を使い、探索は SciPy の Dijkstra

### 言える範囲

- 制限速度が無い区間は国の法定速度で、止まらずに走り続けた場合の上限。実態より速い
- 制限速度の入り方や道路の分類が国で違うので、都市どうしの比較には前提がある（元リポジトリの README）
- 面積は、届いた道路が通る 5 km 四方のマスの合計

### データ

- 道路: © Overture Maps Foundation（transportation テーマ、リリース 2026-10-21.0）。元の多くは © OpenStreetMap contributors（ODbL）
- 法定速度: [osm-legal-default-speeds](https://github.com/westnordost/osm-legal-default-speeds)（元は OSM wiki「Default speed limits」、CC BY-SA 2.0）

### 投稿文

`docs/x-post.md` の Day 2。出典と生成AIの使用はリプライに書く。
