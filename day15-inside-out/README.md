# Day 15 — Inside out

- DATE: 15-11-2026
- NAME: Inside out

## Description（公式）

> Inside out, upside down. Something on this map is not quite right.

## Description（日本語訳）

裏返し、逆さま。この地図には、どこか正しくないところがある。

## 地図のテーマ

陸と海を裏返した地球

## 内容

地球全体の標高の符号を反転（h → −h）し、陸と海を入れ替える。海面（0m）はそのままなので、今の海岸線が新しい海岸線になる。見慣れた大陸の輪郭が「海の形」として残る。

- 太平洋・大西洋などの海が大陸になり、ユーラシアやオーストラリアが海に沈む
- 最高峰は海溝。日本海溝・伊豆小笠原海溝・マリアナ海溝が、列島を縁取る 8,000〜10,000m 級の山脈になる
- エベレストやチベット高原は、いちばん深い海になる
- 中央海嶺はまわりの深海平原より浅いので、裏返すと高原の中を走る谷になる
- 日本列島は細長い海になり、富士山は深い穴になる。伊豆諸島は点々と並ぶ小さな湖になる

陸の地形は Mapterhorn、海底の地形は GEBCO_2026 でつないでいる。

### 先行作品

陸と海を入れ替えた地図には先行作品がある（Frans Blok の Inverted World Map（2014）、Wikipedia の Inverted Earth、Esri ブログの Sparrow の作例など）。ここでは、陸側を細かい標高（Mapterhorn）にして日本の山地まで裏返したことと、地球儀で回して見られるようにしたことが違い。

## 言える範囲

- 標高の符号を反転しただけで、水の量はそろえていない（Wikipedia の Inverted Earth のように海面を下げて海の体積を保つ、ということはしていない）。気候・浸食などは考えていない
- 陸と海の判定は「Mapterhorn の値がちょうど 0m のところが海」。そこに GEBCO を入れ、GEBCO が 0m より上（GEBCO 上は陸）のときは 0m に抑えた。海岸の低地で Mapterhorn が 0m の画素は海として扱われるが、z7（赤道で1画素 約610m）では目立たない
- 湖（カスピ海・五大湖・琵琶湖など）は Mapterhorn の水面の高さのまま。湖底は入れていない。死海のような海面より低い陸もそのまま
- 細かさが違う。陸（今の海）は Mapterhorn の z7、海底（今の陸）は GEBCO の15秒格子（約460m）。拡大すると、裏返した海の底のほうが細かく見える
- Web メルカトルのタイルは緯度 ±85°まで。静止画では、それより極側を GEBCO の4分格子で埋めた（Mapterhorn は使っていない）
- 南極・グリーンランドは氷の表面の高さ（GEBCO の ice surface 版。Mapterhorn も氷の表面）

## データ

| データ | 提供 | ライセンス・利用条件 | URL |
|---|---|---|---|
| Mapterhorn（`planet.pmtiles` の z0〜z7、Terrarium 形式、2026年11月7日取得） | Mapterhorn（元データは Copernicus GLO-30、国土地理院 基盤地図情報 数値標高モデル ほか151件） | 元データごとのライセンス（一覧は https://mapterhorn.com/attribution ） | https://mapterhorn.com/ |
| GEBCO_2026 Grid（ice surface elevation、GeoTIFF、2026年11月7日取得） | GEBCO Compilation Group | パブリックドメイン。出典の表示を求められている（GEBCO の利用条件） | https://www.gebco.net/ |

- GEBCO の引用: GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa
- Mapterhorn の日本部分の元データは国土地理院の基盤地図情報（数値標高モデル）。Mapterhorn の出典表示に従い、国土地理院・Copernicus GLO-30 を画像に書いた。ほかの元データは mapterhorn.com/attribution へのリンクで示す
- 加工: 2つをつなぎ、標高の符号を反転した
- 取得したデータ（`data/`）と作ったタイル（`output/tiles/`、4.7GB）は Git 管理外

## 使用する技術

- Python（numpy・rasterio・Pillow）
  - `scripts/pmtiles_remote.py`: PMTiles v3 を HTTP の範囲指定で読む（外部の CLI を使わない）
  - `scripts/fetch_mapterhorn.py`: Mapterhorn の z0〜z7 を取り出す
  - `scripts/build_inverted.py`: GEBCO をタイルに合わせて投影し、つないで反転し、Terrarium（WebP 可逆）で書き出す
  - `scripts/render_globe.py`: 正射図法の地球儀の静止画（出典入り）
- GDAL（`gdaladdo`）: GEBCO に縮小版（オーバービュー）を付ける
- MapLibre GL JS 5.24（globe 表示、color-relief ＋ hillshade）: `site/index.html`。手元で見るためのページ（タイルは公開しない）

## 作り方

```sh
cd day15-inside-out
python -I scripts/fetch_mapterhorn.py 7                 # data/mapterhorn/
mkdir -p data/gebco && curl -L -o data/gebco/gebco_2026_geotiff.zip \
  "https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ice_surface_elevation/geotiff/gebco_2026_geotiff.zip?download=1"
unzip data/gebco/gebco_2026_geotiff.zip -d data/gebco/tif
for f in data/gebco/tif/*.tif; do gdaladdo -ro -r average "$f" 2 4 8 16 32 64; done
python -I scripts/build_inverted.py 7                   # output/tiles/（約20分）
python -I scripts/render_globe.py 140 20 5              # output/day15_inside_out_globe.png
python -m http.server 8715 --bind 127.0.0.1             # http://127.0.0.1:8715/site/index.html?maxzoom=7
```

`site/index.html` は `?lon=&lat=&zoom=` で場所、`?spin=度/秒` で自動回転（画面録画用）。

## 生成AIの使用

データの調べ、コード、README の下書きに Claude（Anthropic、Claude Code）を使った。

## 状況

- [x] データ準備（Mapterhorn z0〜z7、GEBCO_2026）
- [x] 地図作成（裏返したタイル、site/index.html）
- [x] 静止画（output/day15_inside_out_globe.png、画面内に出典あり）
- [ ] 回る地球の画面録画
- [ ] 投稿（#30DayMapChallenge）
