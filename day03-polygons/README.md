# Day 3 — Polygons

- DATE: 03-11-2026
- NAME: Polygons
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day03-polygons/site/

## Description（公式）

> A map challenge classic. Map with polygons.

## Description（日本語訳）

マップチャレンジの定番。ポリゴンで地図を作る。

## 地図のテーマ

建ててよい量で立ち上げた日本（用途地域を容積率の高さに立ち上げる）

## 内容

用途地域には、土地の広さに対してどれだけの床を建ててよいか（容積率）が決まっている。全国の用途地域の面を、容積率に比例した高さに立ち上げ、用途地域の13色で塗る。斜めの視点で、東京・大阪・名古屋・福岡・札幌・関東を順に見て回る（ボタンでも移動できる）。

都心は商業地域が一面の台地になり、周りの住宅地は低く残る。幹線道路沿いだけを指定した用途地域は、細長い壁になって街に網の目を描く。

容積率が分かる面の71%は200%で、1000%以上は合わせて約4.2km²しかない。いちばん高い1300%は千代田区・名古屋市（と中央区のごく一部）だけ。数字はビューワが `data/stats.json` から計算して出す。

## 言える範囲

- 国土交通省「都市計画決定GISデータ」に入っている市区町村（1,215）だけの数字。自治体が GIS データを出していない場合などは入っていないので、日本全体の値ではない
- データは参考情報で、範囲は概ねの位置（提供元の注記）。時点は自治体ごとに違う
- 面積は、容積率の入っている面（101,695面のうち93,598面）で数えた割合。容積率が入っていない8,097面（134市区町村）は灰色で平らに描き、割合から外した
- 高さは容積率に比例させ、ズームを引くほど大きく誇張している（建物の高さではない）。同じ画面の中では比べられるが、ズームの違う画面どうしは比べられない
- 「国土の約5%」は、用途地域の合計面積を国土面積377,975km²で割った目安

## 使用する技術

- Python（DuckDB spatial）で列を絞り、面積と集計値を出す（`scripts/prepare.py`）
- **tylertoo** で GeoParquet → PMTiles（ズーム4〜14、容積率の高い面を上に描く）
- Vite 8 ＋ MapLibre GL JS 6（TypeScript）。`fill-extrusion` で面を立ち上げる。背景は地理院タイル（淡色地図）を暗くして色を抜いたもの
- 公開版は `site/`（`npm run build` の出力）。GitHub Pages では /day03-polygons/site/

## 作り方

```sh
# mlit-urban-planning-converter の Release data-20260707 の toshikeikaku-qgis.zip から youto.parquet を取り出す
# https://github.com/shiwaku/mlit-urban-planning-converter/releases/tag/data-20260707
python -I scripts/prepare.py <youto.parquet> data/work data/youto_far.pmtiles   # tylertoo と duckdb の入った環境で
cp data/work/stats.json data/stats.json
npm install
npm run dev     # http://localhost:5173/
npm run build   # site/ に出力
```

## データの加工

`scripts/prepare.py` でやること（値は変えない）:

- 提供元の誤り（[mlit-urban-planning-converter #25](https://github.com/shiwaku/mlit-urban-planning-converter/issues/25)）: 長野県箕輪町のファイルに入っている新潟市の用途地域の複製458面を外す（Citycode 20383 で中心が北緯37度より北）
- 「調整」（コード0、茅ヶ崎市の6面）は用途地域ではないので外す
- 不正なジオメトリは ST_MakeValid で直す
- 容積率（FAR）は数値にして使う。空のものは空のまま

## データ

- [国土交通省「都市計画決定GISデータ」](https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html)（令和7年度）を加工して作成。利用条件は国土交通省ウェブサイトの利用ルール（公共データ利用規約 第1.0版）。変換には [mlit-urban-planning-converter](https://github.com/shiwaku/mlit-urban-planning-converter) の Release data-20260707 を使った
- 背景: [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（淡色地図）

## 状況

- [x] データ準備
- [x] 地図作成（index.html）
- [ ] 投稿用の動画
- [ ] 投稿（#30DayMapChallenge）

## 経緯

最初の案は「全国の用途地域を13種類の色だけで描く」だったが、同じ地図は mlit-urban-planning-converter のビューワですでに作っているので、容積率で立ち上げる見せ方に替えた（2026年10月31日）。
