# Day 5 — Senses: Sight

- DATE: 05-11-2026
- NAME: Senses: Sight
- ビューワ: https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/

## Description（公式）

> How do you see something? Maybe map a viewshed?

## Description（日本語訳）

どうやって何かを見る？ 可視領域（viewshed）を地図にしてみては？

## 地図のテーマ

地上から見えない新宿駅

## 内容

新宿駅の通路や改札の多くは地下にあり、地上を歩いていても見えない。国土交通省の「新宿駅周辺屋内地図」の各階を立体に積み、地面を半透明にして、足の下に広がる地下1〜3階を透かして見せる。「どうやって見るか」というお題に、「地面を透かして見る」で答える。viewshed（可視領域）の地図ではない。

- 地下1〜3階は水色〜紫、地上の階（地上1階〜4階）は灰色で薄く描く。黄色は点字ブロック
- 地面には OSM の道路（歩道を除く）を薄く敷く。地面がないと、地下の階が地面の上に浮いて見えるため
- パネルの数字: この屋内地図にある床のうち **63%** が地下（地下 約11.2万m²、地上 約6.6万m²）。階ごとの床の面積は棒で示す
- ボタンで「地上の階」「地面」「点字ブロック」を消せる
- `?tour` で開くと、地面を不透明にして地上だけを見せ、3秒後に地下が浮かび上がり、ゆっくり回る（投稿用の録画に使う）

城跡の CS立体図（はじめに作った版）は `castle.html` に残した（下の「別ページ: 森の下の山城」）。

## 言える範囲

- 63% は「このデータに入っている床」の中での割合。データの範囲（新宿駅とその周辺の地下街・駅ビルの一部）の外にある床や、データに入っていない階は数えていない。地上の階は駅ビルの一部しか入っていないので、駅の建物全体の地下の割合ではない
- 面積は各階の「階層データ（Floor）」のポリゴンを階ごとに合わせて、平面直角座標系 IX系（EPSG:6677）で測った。グランドレベル（屋外）と1階は同じ「地上1階」に数えた
- 階の高さは、データに実測値がないので1階あたり30mで均等に積んだ（見やすさのための強調で、実際の深さではない）
- 点字ブロックの約5.6kmは、データの「視覚障害者誘導用ブロック等（線）」の長さの合計。データに入っているものだけで、すべての点字ブロックかどうかは分からない。歩行空間ネットワークの点字ブロックの属性（brail_tile）は全区間が「不明（99）」なので使っていない
- データは令和2年度（2020年）の更新版で、その後の駅の工事（西口の再開発など）は入っていない

## データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| 新宿駅周辺屋内地図オープンデータ（令和2年度更新版）Shapefile | 国土交通省（高精度測位社会プロジェクト） | 新宿駅周辺屋内地図オープンデータ利用規約（政府標準利用規約。出典「国土交通省 高精度測位社会プロジェクト」、加工したときはその旨も書く） | https://www.geospatial.jp/ckan/dataset/mlit-indoor-shinjuku-r2 |
| 地上の道路 | © OpenStreetMap contributors | ODbL 1.0 | https://www.openstreetmap.org/copyright |

- 利用規約は 2026年11月5日に G空間情報センターの利用規約 PDF で確かめた
- Shapefile は [mlit-shinjuku-indoor-3dmap-on-maplibre](https://github.com/shiwaku/mlit-shinjuku-indoor-3dmap-on-maplibre) の `data/raw/` にあるもの（上のデータセットから取得したもの）を `data/shinjuku/` に置いて使う（Git 管理外）
- OSM の道路は Overpass API で取得（2026年11月5日、新宿駅のまわり約1.2km四方。トンネル・地下・屋内の道路は除く）

## 使用する技術

- **MLT（MapLibre Tile）** を最新のツールで作る
  - mlt CLI 0.6.1（`cargo install mlt --version 0.6.1 --locked`）。0.6 から GeoJSON の FeatureCollection を直接タイルにできるので、**tippecanoe は使わない**
  - ただし mlt 0.6.1 が GeoJSON から書けるのは MLT version 2（実験的）だけで、MapLibre GL JS 6.16 は version 2 を読めない（`Unsupported column type code 2075`）。そこで mlt で version 1 に変換し直す（GeoJSON → v2 → v1）
  - GeoJSON 入力の出力は `z/x/y.mlt` のフォルダだけで、PMTiles にはまとめられない。z14〜18 の143枚（約1MB）なので、フォルダのまま GitHub Pages から配信する
  - タイルは1レイヤー（`indoor`）にまとめ、`kind` で床・壁・点字ブロック・地面・道路を分ける。高さは整数 cm（`b` = 下端、`t` = 上端）
- **MapLibre GL JS 6.16**（`encoding: "mlt"`）の fill-extrusion だけで積む（deck.gl は使わない）。fill-extrusion は 0m より下に描けないので、地下3階の床を 0m に置いて全体を持ち上げる
- 部屋（Space）は塗ると下の階が見えなくなるので、輪郭を 0.15m 幅・高さ 2.5m の薄い壁にする
- Vite 8（TypeScript）。`index.html`（新宿駅）と `castle.html`（城跡）の2ページを `site/` にビルドする

## 作り方

```sh
npm install
python -I -X utf8 scripts/underground/prepare.py     # data/shinjuku/web/indoor.geojson と web/stats.json
bash scripts/underground/build_tiles.sh              # WSL で。web/tiles/{z}/{x}/{y}.mlt
npm run build                                        # site/ に出力（web/ の中身もコピーされる）
npx vite preview --port 4173
node scripts/underground/shot.mjs http://localhost:4173/ output/day05-underground.png
node scripts/underground/shot-tour.mjs http://localhost:4173/?tour      # 録画前の確認（始めと終わりの静止画）
node scripts/underground/record-live.mjs http://localhost:4173/?tour    # output/day05-underground.mp4（約24秒）
```

URL に `?bare` を付けるとパネルを消す。`?hash` で地図の位置を URL に出す。

## 投稿文の下書き

本文:

```text
#30DayMapChallenge Day 5 - Senses: Sight
新宿駅の屋内地図を階ごとに積んで、地面を透かしてみました🗺️

📝地上を歩いていても見えませんが、このデータにある床の63%は地下1〜3階にあります

デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/

#MapLibre #MLT
```

（動画 `output/day05-underground.mp4` を添付する。出典は画面内にある）

リプライ:

```text
出典）国土交通省 高精度測位社会プロジェクト「新宿駅周辺屋内地図データ」（国土交通省）を加工して作成、地上の道路 © OpenStreetMap contributors
制作に生成AI（Claude Code）を使用（コードの作成）
```

## 状況

- [x] データ準備（屋内地図 Shapefile、OSM の道路）
- [x] 地図作成（index.html。MLT は mlt CLI 0.6.1、MapLibre GL JS 6.16）
- [x] スクリーンショット（`output/day05-underground.png`）
- [x] 短い動画（`output/day05-underground.mp4`、画面録画、約24秒、出典は画面内）
- [ ] 投稿（#30DayMapChallenge）

## 別ページ: 森の下の山城（castle.html）

はじめに作った版。https://shiwaku.github.io/30daymapchallenge-2026/day05-sight/site/castle.html

### 内容

山城の遺構は、たいてい森の中にある。航空写真では木の梢しか写らず、曲輪（尾根を削って平らにした段）や堀切（尾根を断ち切る溝）は見えない。航空レーザは木の間を抜けて地面まで届くので、その地面の形を CS立体図にすると、森の下の城の形が出てくる。

国の史跡の山城4つ（唐沢山城・此隅山城・有子山城・河後森城）を、同じ範囲の航空写真と CS立体図で見比べる。「どうやって見るか」というお題に、「森を透かして見る」で答える。viewshed（可視領域）の地図ではない。

- 左右で比べる: 仕切りの左が航空写真、右が CS立体図。仕切りはドラッグ（または ← → キー）で動かせる。開くと仕切りが右から左へ動いて、城の山頂の少し左で止まる
- 写真に重ねる（乗算）: 航空写真の上に CS立体図を乗算で重ねる。写真の木の色の上に、地面の凹凸が乗る
- 城を選ぶと、その城へ移動する。名前は山頂に置く（下の「城について」）
- ポスター画像（`output/day05-sight-poster.png`）は、4つの城の同じ範囲を「航空写真｜CS立体図」で並べたもの

### 城について

城の説明は、文化遺産オンライン（文化庁）の史跡の解説に書かれていることだけを使う。遺構（曲輪・堀切など）の位置を地図の上で指すことはしない（解説に位置が書かれていないため）。

| 城 | 所在 | 史跡 | 使った記述 | 出典 |
|---|---|---|---|---|
| 唐沢山城 | 栃木県佐野市 | 国史跡「唐沢山城跡」（2014年3月18日指定） | 唐沢山山頂を主郭として一帯に曲輪を配する山城。山腹には中世山城として機能していた頃の曲輪や堀切が残る | [文化遺産オンライン](https://online.bunka.go.jp/heritages/detail/232631) |
| 此隅山城 | 兵庫県豊岡市 | 国史跡「山名氏城跡」（1996年11月13日指定）の一つ | 山名氏の本城。標高140mの此隅山頂を中心に、四方にのびる尾根上に削平による平坦地（くるわ）を多数設ける | [文化遺産オンライン](https://online.bunka.go.jp/heritages/detail/210750) |
| 有子山城 | 兵庫県豊岡市 | 同上 | 天正2年（1574）頃に山名祐豊が築いた。標高321mの山頂に主郭、その西方に6段のくるわが階段状に続き、山腹にはたてぼりの遺構も残る | [文化遺産オンライン](https://online.bunka.go.jp/heritages/detail/210750) |
| 河後森城 | 愛媛県北宇和郡松野町 | 国史跡「河後森城跡」（1997年9月11日指定） | 南側に開く馬蹄形の尾根線上に、東から古城・本城・新城の各地区が展開する。古城地区と本城の間を大堀切で切断している | [文化遺産オンライン](https://online.bunka.go.jp/heritages/detail/139647) |

名前を置く点（山頂）は、地理院地図の注記（地理院の地名検索で返る「唐沢山」「此隅山城跡」「有子山城跡」「河後森城跡」の点）のまわりで、地理院の標高タイル（DEM5A）のいちばん高い点を `scripts/find_summit.py` で探したもの。得られた標高は 244.8m・138.1m・321.7m・172.2m で、解説の標高（此隅山 140m、有子山 321m、河後森城の本城 171m）とほぼ合う。

### 言える範囲

- CS立体図は、航空レーザ測量の地面のデータ（DEM）から作った図。尾根（凸）が赤、谷（凹）が青、急な斜面が暗く、緩い斜面が明るく出る（各データセットの説明より）。見えているのは地面の形で、それが城の遺構かどうかは図からは決められない。道路・林道・畑の段なども同じように写る
- 唐沢山城の山頂には神社があり、航空写真でも建物と開けた所が見える。どの城も「全部が森に隠れている」わけではない
- 計測した年は県で違う（栃木県は2021〜2022年度、兵庫県は2020〜2021年度など、愛媛県は2018年）。航空写真（全国最新写真）の撮影時期もそれとは別
- 此隅山城の図の一部が黒く抜けているのは、兵庫県のタイルにデータがない範囲
- 名前の位置は山頂で、主郭の正確な位置ではない（解説で「山頂に主郭」とあるのは唐沢山城と有子山城）

### データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| 栃木県「微地形図（CS立体図）」XYZタイル（令和3〜4年度の航空レーザ測量） | 栃木県（G空間情報センター） | 航空レーザ計測に基づく森林資源データの利用規約（CC BY 4.0 と互換。出典例「栃木県森林資源データ（yyyy年計測）」） | https://www.geospatial.jp/ckan/dataset/csmap_tochigi |
| 兵庫県50㎝メッシュCS立体図（xyzタイル） | 兵庫県（G空間情報センター） | 兵庫県オープンデータ利用規約（CC BY 4.0。出典「[タイトル]、兵庫県」） | https://www.geospatial.jp/ckan/dataset/csmap_hyogo |
| 愛媛県「微地形図（CS立体図）」XYZタイル（平成30年度の航空レーザ測量、0.5m） | 愛媛県（G空間情報センター） | 航空レーザ計測に基づく森林資源データの利用規約（CC BY 4.0 と互換。出典例「愛媛県森林資源データ（yyyy年計測）」） | https://www.geospatial.jp/ckan/dataset/csmap_ehime |
| 全国最新写真（シームレス） | 国土地理院 | 地理院タイル（国土地理院コンテンツ利用規約。出典「地理院タイル」と一覧ページへのリンク。GRUS 画像を含む範囲では「GRUS画像（© Axelspace）」も必要。この4か所が当たるかは確かめていないので、画面には常に書く） | https://maps.gsi.go.jp/development/ichiran.html |
| 標高タイル（DEM5A、PNG） | 国土地理院 | 同上（山頂の位置を探すのに使っただけで、画面には出さない） | 同上 |
| 史跡の解説 | 文化庁 文化遺産オンライン | 説明文を要約して載せ、リンクを付ける | 上の表 |

- 利用規約は 2026年11月2日に各ページ（G空間情報センターの利用規約 PDF）で確かめた
- タイルは配信元から直接読む（このリポジトリにはコピーしない）。どの配信元も `Access-Control-Allow-Origin: *` を返す
- 愛媛県のタイルは TMS（y を南から数える）で配信されているので、`scheme: "tms"` で読む
- 画面の下に、表示している城の CS立体図・航空写真・解説の出典を常に出す。ポスター画像にも出典を入れる

### 使用する技術

- Vite 8 ＋ MapLibre GL JS 6（TypeScript）
- 地図を2つ重ね（下: 航空写真、上: CS立体図）、位置を同期する。上の地図を CSS の `clip-path` で仕切りの右側だけ見せる
- 「写真に重ねる」は、上の地図の canvas に `mix-blend-mode: multiply` をかける（乗算）。そのままだと暗いので、下の写真を明るくする（`filter: brightness(1.55)`）
- 城の名前は2つの地図の上に HTML で置く（グリフを使わない）
- 確認・ポスター用に playwright-core（Chrome）で撮る
- 公開版は `site/`（`npm run build` の出力）。GitHub Pages では /day05-sight/site/

### 作り方

```sh
npm install
npm run dev                                  # http://localhost:5173/
npm run build                                # site/ に出力

# 確認用（dev サーバーを立てた状態で）
python -I -X utf8 scripts/peek_tiles.py 139.6006 36.3536 16 "https://rinya-tochigi.geospatial.jp/2023/rinya/tile/csmap/{z}/{x}/{y}.png" output/peek/karasawa_cs.png
python -I -X utf8 scripts/find_summit.py 134.8807 35.4554 300   # 山頂を探す
node scripts/shot.mjs http://localhost:5173/ output 1600x900     # 4つの城のスクリーンショット
node scripts/check.mjs http://localhost:5173/                    # 乗算モードとスマートフォン幅
node scripts/poster-capture.mjs http://localhost:5173/           # ポスター用の画面
python -I -X utf8 scripts/poster.py                              # output/day05-sight-poster.png
```

URL に `?castle=arikoyama` を付けるとその城から開く。`?split=0.3` で仕切りを固定、`?bare` でパネルと出典を消す（ポスターを組むとき用。組んだ画像には出典を入れる）。

