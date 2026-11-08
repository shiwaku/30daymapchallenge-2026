# Day 8 — Utopia

- DATE: 08-11-2026
- NAME: Utopia

## Description（公式）

> A map of something which could be.

## Description（日本語訳）

ありえるかもしれない何かの地図。

## 地図のテーマ

住むならどこ？ 地球・月・火星（投稿済み）

## 内容

「ありうるかもしれない」住む場所を、地球の外に探す。地球・月・火星を MapLibre GL JS の地球儀で横に並べ、3つとも同じ配色の陰影段彩図（低いほど紫、高いほど白）で描いた。月と火星には「住めそうな所」を重ねた。

- **月**: 南極の尾根。ほぼいつも日が当たる所（太陽光で電気を作れる）と、一度も日が当たらない永久影（氷がありうる）が数 km の距離で隣り合う。NASA が2024年10月に示したアルテミス計画の有人着陸の候補（9地域、外形が公開されている8地域）を重ねた
- **火星**: 地下5mまでに氷がありそうで、標高が +2km 以下、南北50°以内の所（NASA が2015年に有人着陸の候補地を募ったときの目安と、氷の地図 SWIM から）。火星の表面の **4.0%**。火星には本当に「ユートピア平原（Utopia Planitia）」があり、条件をよく満たす。映画『オデッセイ』（原作『火星の人』）の主人公の道のり（アキダリア平原→パスファインダー→スキャパレリ・クレーター、およそ3,200km）も点線で入れた

投稿した動画（ビューワを画面録画、約29秒）は `output/planets/demo3.mp4`（Git 管理外）。動画用に自動で動くページ（`planets/promo.html`）で録った約53秒版（`output/planets/day08-planets.mp4`）もある。

### 主な数字

月（候補地域の中でいちばん日が当たる所の日照率と、そこからいちばん近い永久影までの距離。`moon/moon_regions.json`）:

| 地域 | 日照率 | 永久影まで |
|---|---|---|
| ノビレの縁 1 | 86% | 1.8km |
| マラパート山塊 | 85% | 0.2km |
| ムートン山 | 80% | 1.1km |
| ド・ジェルラッシュの縁 2 | 79% | 2.9km |
| ハワース | 75% | 1.1km |
| カベウスB近くの峰 | 68% | 0.8km |
| スレーター平原 | 66% | 0.3km |
| ノビレの縁 2 | 54% | 3.4km |

火星: 3つの条件を満たすのは表面の 4.0%。地下5mまでに氷がありそうな所は 9.8%（SWIM の範囲は南北60°まで）。

静止画: `moon/day08-moon.png`（南極を斜めから見た立体）、`mars/day08-mars.png`（火星の地球儀2面）。どちらも `-hires.png` あり。

### 言える範囲

- 陰影段彩の基準面はそれぞれ違う（地球は平均海面、月は半径1737.4km の球、火星は MOLA の基準面）。同じ色は同じ「基準面からの高さ」で、同じ気圧や環境ではない。地球の海は海底の深さを入れず青1色
- 月の日照率は地表での平均（18.6年の歳差周期を1時間ごとに計算、Mazarico ほか 2011）。地面から数m上げた太陽電池なら、もっと長く日が当たる。数字は120m 格子の1画素
- 月の候補地域の外形は1km 格子の外側をつないだもの（凸包）。9地域のうちムートン山の台地は外形が公開されていない。有人着陸がアルテミス III から IV に移ったとの報道があるので、「III」とは書いていない
- 火星の氷は SWIM の ice consistency（いくつもの観測が氷のありそうなことで一致する度合い、-1〜1）が 0.5 以上。氷の量や確かさではない。レーダーの軌跡に沿った縦の筋が残る（0.15°でならした）。極冠は SWIM の範囲外で塗っていない
- オデッセイの道のりは、原作と映画から読んだおよその位置
- MapLibre の地球儀は Web メルカトルのタイルで緯度85°より極側を描けないので、月は座標を回して南極を正面（緯度0°・経度0°）に置いた。球体の見た目は同じだが、ビューワの「北」は本当の北ではない

## データ

| データ | 細かさ・使ったズーム | 提供・ライセンス |
|---|---|---|
| 地球の標高 | Mapterhorn（`tiles.mapterhorn.com` を直接読む） | Mapterhorn（日本は国土地理院 数値標高モデル、ほか。https://mapterhorn.com/attribution ） |
| 月の標高（全球） | LOLA LDEM_16（約1.9km）→ z4 | NASA LRO LOLA、PDS Geosciences Node |
| 月の標高（南緯75〜85°） | LDEM_75S_120M（120m）→ z8 | 同上 |
| 月の標高（南緯85°より極側） | LDEM_85S_20M（20m）→ z10 | 同上 |
| 月の平均日照率・永久影 | AVGVISIB_75S_120M・LPSR_75S_120M（120m）→ z8 | NASA GSFC PGDA（Mazarico et al. 2011, Icarus 211） |
| アルテミスの着陸候補 | 1km 格子のシェープファイル | McClernan 2024, USGS（CC0、doi:10.5066/P1MEQ6UK。元は LROC QuickMap） |
| 火星の標高 | MGS MOLA DEM 463m → z7 | NASA/GSFC、USGS Astrogeology（CC0） |
| 火星の氷 | SWIM 4 MIM 合成 ice consistency（0〜1m・1〜5m、約3km）→ z5 | Morgan, Putzig ほか、Planetary Science Institute／NASA（利用条件の明示なし。出典を明記して使用） |

ズームは「画素の大きさ = 2π×半径 ÷ (512×2^z)」が元の格子に近いところで止めた。月の日照率・永久影や火星の氷は、標高より粗いので重ね合わせのタイルを先に止め、拡大すると引き伸ばされる。

## 使用する技術

- 月と火星のタイル: Python（NumPy・rasterio）で Terrarium 形式の標高 PNG と重ね合わせの PNG を作る（`scripts/planets/make_tiles.py`）。月は座標を回してから作る
- 表示: MapLibre GL JS 5.24 の地球儀（globe）。段彩は color-relief、陰影は hillshade。ビューワ `planets/index.html`（大きさを「同じ」と「本当の比」で切り替え）、動画用 `planets/promo.html`
- 動画: ビューワの画面録画（投稿分）。動画用ページは Playwright の画面録画（`scripts/planets/record.mjs`、コマ撮りではない）
- 静止画: Pillow（`scripts/moon/`・`scripts/mars/`）。フォントは BIZ UDゴシック

## 作り方

```sh
# 月（data/moon/）: LOLA の ldem_16.img・ldem_75s_120m.img・ldem_85s_20m.img（PDS Geosciences Node）、
#   PGDA の AVGVISIB_75S_120M_201608.TIF・LPSR_75S_120M_201608.TIF、USGS の着陸候補（regions/*.zip）
# 火星（data/mars/）: USGS の Mars_MGS_MOLA_DEM_mosaic_global_463m.tif（mola/）、SWIM 4 MIM の GeoTIFF（swim/z/）
python -I -X utf8 scripts/planets/make_tiles.py moon data/moon planets/tiles/moon   # 約5分
python -I -X utf8 scripts/planets/make_tiles.py mars data/mars planets/tiles/mars   # 約20分（約1.6GB）
python -X utf8 scripts/planets/to_pmtiles.py planets/tiles output/pmtiles          # 公開用に PMTiles 4つ（約2GB）
cd planets && python -m http.server 8809                                             # http://localhost:8809/?local
node scripts/planets/record.mjs http://localhost:8809/promo.html output/planets/day08-planets.mp4 1600x900
python -I -X utf8 scripts/moon/poster_moon.py data/moon moon/day08-moon.png 1 moon/moon_regions.json
python -I -X utf8 scripts/mars/globe.py data/mars mars/day08-mars.png
```

タイル（`planets/tiles/`、約2GB）は Git に入れず、PMTiles（`moon-dem`・`moon-ov`・`mars-dem`・`mars-ov`）にまとめて外に置く。ビューワは `planets/index.html` の `TILE_BASE` の場所から読む（`?tiles=URL` で差し替え、`?local` で手元の `planets/tiles/` を読む）。

## 投稿文

本文（X の文字数で274）:

```text
#30DayMapChallenge Day 8 - Utopia
地球の次に住むなら、月か火星か。地球儀で並べてみました🌏🌕
📝月は南極の尾根。マラパート山塊は日照85%の所から永久影（氷がありうる）まで0.2km。火星は氷があって低い中緯度で、表面の4.0%。火星には本当に「ユートピア平原」がある
#MapLibre #OpenData
```

リプライ:

```text
出典）地球: Mapterhorn、月: NASA LRO LOLA・GSFC PGDA（Mazarico et al. 2011）・USGS（アルテミス着陸候補）、火星: MGS MOLA（USGS）・SWIM（PSI/NASA）を加工して作成
制作に生成AI（Claude Code）を使用（データの加工とコードの作成）
```

## 状況

- [x] データ準備（月の南極は20m、火星は463m）
- [x] ビューワと動画
- [x] 投稿（#30DayMapChallenge、2026-11-08、動画）
- [x] タイルを PMTiles にまとめ、ビューワを PMTiles で読むように
- [ ] PMTiles を外に置いてビューワを公開（R2 など）
