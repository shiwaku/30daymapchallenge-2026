# Day 12 — Power

- DATE: 12-11-2026
- NAME: Power

## Description（公式）

> Power as in nuclear power? Or physical power or influence? Power grid on a map? Read this the way you want, like every other prompt.

## Description（日本語訳）

原子力の Power？ 体力や影響力の Power？ 送電網を地図に？ ほかのお題と同じく、好きなように解釈していい。

## 地図のテーマ

AIの覇権は、電力を増やせる国が取るか

## 内容（予定）

お題の Power を「電力」と「覇権（影響力）」の両方で読む。「AIの覇権は電力不足で決まる」という話を、電力の面から確かめる。

1. 国別に、直近10年で発電量をどれだけ増やせたか（TWh）を世界地図で塗る（AIのデータセンターに回せる電力の伸びしろの目安）
2. IEA がデータセンターの電力需要を国・地域別に出している所（米国・中国・欧州・日本）について、2024→2030年の需要の伸びが、発電の伸びの何割に当たるかを重ねる
3. 発電の延長は IEA と年をそろえて2030年までにする（直近10年の伸び率をそのまま延ばした機械的な値で、予測ではない）

（下書きの `data/世界の発電量マップ.html` は claude.ai で作ったもの。発電量は OWID 経由だったが、Energy Institute のデータの再配布条件を確かめられなかったので、Ember から直接取り直す）

## 言える範囲（予定）

- 電力は AI の必要条件の1つにすぎない。半導体・資金・人材・規制は扱わない。「電力の面から見ると」の話にとどめる
- 年間の発電量（TWh）で比べるので、送電の容量・接続待ち・変電設備のような、実際に詰まりやすい所は表れない
- IEA の国・地域別の値は本文に書かれた増加量（概数）。「欧州」の範囲は本文に定義がない

## データ（予定）

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| Yearly Electricity Data（国別の発電量） | Ember | CC BY 4.0（取得時に確かめる） | https://ember-energy.org/data/yearly-electricity-data/ |
| Energy and AI（2025）、データセンターの電力需要 | IEA | 報告書は CC BY 4.0（データセット・データベースは対象外） | https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai |
| 国の境界 | Natural Earth | パブリックドメイン | https://www.naturalearthdata.com/ |

## 状況

- 準備度: △
- [ ] データ準備
- [ ] 地図作成
- [ ] スクリーンショット
- [ ] 投稿（#30DayMapChallenge）

送電網の地図（はじめ Day 12 用に作ったもの）は Day 17 Light & dark に移した。
