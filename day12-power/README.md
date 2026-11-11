# Day 12 — Power

- DATE: 12-11-2026
- NAME: Power
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day12-power/site/

## Description（公式）

> Power as in nuclear power? Or physical power or influence? Power grid on a map? Read this the way you want, like every other prompt.

## Description（日本語訳）

原子力の Power？ 体力や影響力の Power？ 送電網を地図に？ ほかのお題と同じく、好きなように解釈していい。

## 地図のテーマ

AIの覇権は、電力を増やせる国が取るか

## 内容

お題の Power を「電力」と「覇権（影響力）」の両方で読む。「AIの覇権は電力で決まる」という話を、各国が実際にどれだけ発電を増やしてきたかで確かめる。3段階で、最初は自動で切り替わり、ボタンで行き来できる。

1. **10年で発電量をどれだけ増やせたか**: 2014→2024年の発電量の増減（TWh）で国を塗る。世界は +7,266TWh で、そのうち中国が +4,244TWh（58%）。次はインド +776、米国 +295。ドイツ（−127）・英国（−54）・日本（−48）は減った
2. **AIのデータセンター（DC）が、その伸びを食う割合**: IEA の見通しの DC の電力消費の増加（2024→2030年）を年あたりにして、直近10年の発電の伸び（年あたり）と比べる

| | 発電の伸び 2014→2024年（TWh/年） | DC需要の伸び 2024→2030年（TWh/年） | 割合 |
|---|---:|---:|---:|
| 米国 | +29.5 | +40.0（6年で約240） | 136% |
| 中国 | +424.4 | +29.2（約175） | 7% |
| 欧州 | +9.3 | +7.5（45超） | 81% |
| 日本 | −4.8 | +2.5（約15） | 発電が減っている |
| 世界 | +726.6 | +88.3（約530） | 12% |

電力で見る限り、余裕があるのは中国。米国は発電の伸びのほぼすべて（またはそれ以上）を DC が使う計算になる。日本と欧州は発電がほとんど増えていない。

3. **10年後、中国の発電量は米国の何倍か**: 過去10年（2014→2024年）の伸びをそのまま2034年まで延ばす。毎年同じ量だけ増える場合と、毎年同じ率で増える場合の2通りを帯で示す。パネルに2000〜2034年のグラフ、地図に2034年の値の吹き出しを出す

| | 2024年（実績） | 2034年（同じ量で増える） | 2034年（同じ率で増える） | 年平均伸び率 |
|---|---:|---:|---:|---:|
| 中国 | 10,025 TWh | 14,269 | 17,384 | 5.7% |
| 米国 | 4,391 | 4,686 | 4,707 | 0.7% |
| インド | 2,035 | 2,812 | 3,291 | 4.9% |
| 中国 ÷ 米国 | 2.3倍 | 3.0倍 | 3.7倍 | |

電力の面で見る限り、次の10年に余裕があるのは中国。インドは伸びが速いが、2034年でも米国に届かない。

国にマウスを乗せると、2024年の発電量・10年間の増減・年平均伸び率と、2000〜2024年の推移が出る。

### 期間の取り方で割合がどう変わるか

発電の伸びを測る期間を変えると、米国と欧州の割合は大きく変わる。中国と日本は変わらない。ビューワの数字は 2014→2024年（全部の国で値がそろう最新の10年）。

| | 2014→2024 | 2015→2025 | 2019→2024 | 2009→2024 |
|---|---:|---:|---:|---:|
| 米国 | 136% | 92% | 86% | 133% |
| 中国 | 7% | 6% | 6% | 7% |
| 欧州 | 81% | 108% | 発電が減少 | 51% |
| 日本 | 発電が減少 | 発電が減少 | 発電が減少 | 発電が減少 |

## 言える範囲

- 電力は AI の条件の1つにすぎない。半導体・資金・人材・規制は扱っていない。「電力の面から見ると」の話
- 発電量は国内で発電した電力量（Ember の Total generation）。輸出入は含まない。年間の電力量（TWh）で比べているので、送電の容量・接続待ち・変電設備のような、実際に詰まりやすい所は表れない
- DC需要は IEA「Energy and AI」（2025）の基本シナリオ（Base Case）の、本文に書かれた2024→2030年の増加量（概数）。地域別の値は米国・中国・欧州・日本だけ。6年で割って年あたりにした
- IEA の「欧州」の範囲は本文に定義がない。発電量は Ember の Europe（欧州全体）を使った。範囲が同じかは分からない
- 割合は「過去10年の発電の伸び（年あたり）」と「これからの DC 需要の伸び（年あたり）」の比で、将来の発電の伸びは見ていない。DC 以外の需要の伸び（電気自動車・冷房・産業など）も見ていない
- 米国と欧州の割合は、発電の伸びを測る期間で大きく変わる（上の表）
- 2034年の値は、過去10年の伸びをそのまま延ばした計算で、IEA などの公式な見通しではない。中国の伸びは近年ゆるやかになっているので、同じ率で増える方は上限に近い。2015→2025年の伸びで延ばしても 3.1〜3.8倍で、ほとんど変わらない
- 「AIの覇権国はどこか」には答えられない。言えるのは「電力の面では中国が有利」まで
- Ember の最新年は国によって2024年か2025年。全部の国で2024年までにそろえた。2014年か2024年の値がない国はデータなし（194の国・地域に値がある）
- 国の形は Natural Earth 1:50m を0.02度で簡略化した。Ember のコソボ（XKX）は Natural Earth の KOS に対応させた

## データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| Yearly Electricity Data（`release_generation_yearly_global.csv`、2026年11月7日取得） | Ember | CC BY 4.0 | https://ember-energy.org/data/yearly-electricity-data/ |
| Energy and AI（2025）、Energy demand from AI | IEA | CC BY 4.0（報告書のページに表示。IEA のデータセット・データベースは CC の対象外で、ここでは使っていない） | https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai |
| Admin 0 – Countries（1:50m） | Natural Earth | パブリックドメイン | https://www.naturalearthdata.com/ |

- 利用条件は2026年11月7日に、Ember のデータのページと IEA の利用規約（https://www.iea.org/terms）で確かめた
- 下書きは Our World in Data の energy-data を使っていたが、発電量の列の元に Energy Institute の Statistical Review が含まれ、その再配布の条件を確かめられなかったので、Ember から直接取った
- 画面の右下に出典を常に出す。投稿画像にも入っている

## 使用する技術

- Python（pandas・GeoPandas・Shapely）: Ember の CSV から国別の発電量を取り出し、Natural Earth の国の形に付ける
- Vite 8 ＋ MapLibre GL JS 6（TypeScript）。比較の吹き出しは HTML のマーカー、推移は SVG
- 公開版は `site/`（`npm run build` の出力）。GitHub Pages では /day12-power/site/、データは ../web/ を読む
- スクリーンショットは playwright-core（Chrome）。`?step=0|1|2` で段階を指定、`?poster` で投稿用の画像（ボタンなし）。GIF は Pillow（`scripts/gif.py`）

## 作り方

```sh
mkdir -p data/ember data/ne
curl -L -o data/ember/yearly_global.csv https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_yearly_global.csv
curl -L -o data/ne/ne50.zip https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip && unzip -o data/ne/ne50.zip -d data/ne
python -I -X utf8 scripts/build.py data web   # web/countries.geojson, web/stats.json
npm install
npm run dev     # http://localhost:5173/
npm run build   # site/ に出力
node scripts/shot.mjs http://localhost:5173/   # output/ にスクリーンショット（step0〜2、ポスター、GIF 用の story0〜2）
python -I scripts/gif.py                       # story0〜2 から output/day12-power.gif（1枚4秒、切り替え0.8秒）
```

## 生成AIの使用

最初の案と下書き（世界の発電量の地図と比較表）は claude.ai のチャットで作った。データの取り直し、コード、README の下書きには Claude（Anthropic、Claude Code）を使った。

## 投稿文の下書き

GIF（`output/day12-power.gif`）を添付。

本文（X の文字数で279）:

```text
#30DayMapChallenge Day 12 - Power
AIの覇権は電力で決まる？ 各国の発電量の伸びを地図にしてみた⚡
📝データセンターの需要増は、米国では発電の伸びの86〜136%、中国では7%ほど。この伸びが続くと、10年後の中国の発電量は米国の3〜3.7倍
デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day12-power/site/
#MapLibre
```

リプライ（X の文字数で274）:

```text
出典）Ember Yearly Electricity Data（CC BY 4.0）、IEA Energy and AI（CC BY 4.0）を加工して作成 / Natural Earth
10年後の値は過去10年の伸びを延ばした計算で、公式の見通しではありません。半導体・資金・人材は扱っていません
制作に生成AI（Claude）を使用（案と下書き、コードの作成）
```

## 状況

- [x] データ準備（Ember・IEA・Natural Earth。利用条件を確認）
- [x] 地図作成（index.html）
- [x] スクリーンショット（output/day12-power.png）
- [x] 3段階のストーリーの GIF（output/day12-power.gif、約3.7MB・15.6秒）
- [ ] 投稿（#30DayMapChallenge）

送電網の地図（はじめ Day 12 用に作ったもの）は Day 17 Light & dark に移した。
