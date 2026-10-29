# Day 1 — Points

- DATE: 01-11-2026
- NAME: Points

## Description（公式）

> A map challenge classic. Map with points.

## Description（日本語訳）

マップチャレンジの定番。点で地図を作る。

## 地図のテーマ

動き続ける基準点（測地系はなぜ改定されるのか）

## 内容

全国約1,450の電子基準点の、1996年からの毎日の位置を点で描く。水平の動きは位置（2.5万倍に拡大）、上下の動きは色で表す。
地面は動き続けるが、公式の座標は元期で止めてある。ずれが補正しきれないほど大きくなると、測地系を決め直す。その様子を、点が流れ、地震で跳ぶアニメーションで見せる。白い点が元期の位置、尾は元期から離れていった道のり。測地系の切り替え日: JGD2000 は2002年4月1日施行、測地成果2011は2011年10月31日公表、測地成果2024は2025年4月1日公表。

## 使用する技術

- 電子基準点データ提供サービス（SFTP）→ Python（公式オフセット補正量の適用・固定点との差）
- GeoParquet → **tylertoo 0.8.0** → PMTiles（全期間の軌跡、約1,300万点）
- 7日おきの変位を Int16 バイナリにして、Vite 8 ＋ MapLibre GL JS 6（TypeScript）で各局のその週の位置を動かす
- 測地系の名前（日本測地系 → JGD2000 → JGD2011 → 測地成果2024）と地震名を大きく出す。水平の動きは「圧縮（√）」・2.5万倍・25万倍を切り替えられ、速度も変えられる
- 「圧縮」は向きはそのままに、変位 d(m) を 120,000×√d (m) で描く。表示上の工夫で、データは変えていない
- 公開版は `site/`（`npm run build` の出力）。GitHub Pages では /day01-points/site/

## 作り方

```sh
# data/geonet/ に SFTP の /data/coordinates_F5.1/<年>/ を置く
curl -o data/gsi_offset/corrf5_1o.dat https://mekira.gsi.go.jp/JAPANESE/corrf5_1o.dat
python -I scripts/build.py data/geonet data/gsi_offset/corrf5_1o.dat data/geonet_disp.npz
python -I scripts/to_geoparquet.py data/geonet_disp.npz data/geonet_trails.parquet 25000
# geonet_bg.parquet は geonet_trails.parquet から du_mm と geometry だけを残したもの
# tylertoo.overview(min_zoom=3, max_zoom=9, point_thinning=1.0, density_drop=False)
# → tylertoo.export_pmtiles(layer_name="trails", feature_order="du_mm", tile_size_limit=None)
python -I scripts/to_anim.py data/geonet_disp.npz data/anim
npm install
npm run dev     # http://localhost:5173/
npm run build   # site/ に出力
```

## 状況

- [x] データ準備
- [x] 地図作成（index.html）
- [ ] 投稿用の動画
- [ ] 投稿（#30DayMapChallenge）

## 経緯

最初はシェアサイクルのステーションを点で描いたが、面白みが弱いので電子基準点に替えた（2026年10月29日）。

## 測地成果と元期（メモ）

「測地系がなぜ改定されるのかの図」の説明に使う。地面は動き続けるが、公式の座標は元期で止めてある。ずれはセミ・ダイナミック補正で埋め、補正しきれないほど動いたら元期ごと決め直す。

| 測地成果 | 元期（座標を固定した日） | 何が変わったか |
|---|---|---|
| 2000（JGD2000） | 1997年1月1日（ITRF94） | 日本の公式な座標を世界測地系に切り替えた |
| 2011（JGD2011） | 2011年5月24日（ITRF2008） | 2011年の地震で大きく動いた東日本の座標を決め直した。動きの小さかった地域は、2000年の値を引き継ぐ |
| 2024 | 2024年6月1日 | 標高だけを、水準測量ではなく GNSS とジオイド2024から求める方式に改めた。緯度・経度は変わらない |

出典:
- [国土地理院 測地成果2000と2011](https://www.gsi.go.jp/sokuchikijun/jgd2000-2011.html)
- [国土地理院 令和7年度 全国の標高成果の改定](https://www.gsi.go.jp/sokuchikijun/hyoko2024rev.html)
- [国土地理院資料（測地成果2000の元期など）](https://www.gsi.go.jp/common/000057208.pdf)

## 電子基準点データの加工

使うデータ: 国土地理院「電子基準点日々の座標値（F5.1解）」1996年3月21日〜（電子基準点データ提供サービスの SFTP から取得）。国土地理院コンテンツ利用規約に従う。出典は「国土地理院 電子基準点日々の座標値を加工して作成」と書く。

加工は次の2つだけ（`scripts/build.py`）。独自の補正はしない。

1. 国土地理院の[オフセット補正量](https://mekira.gsi.go.jp/JAPANESE/corrf5_1o.dat)（F5.1解用、2026年9月15日更新）を、[オフセット補正計算方法](https://www.gsi.go.jp/kanshi/faq2_2.html)のとおり保守作業の日以降に累積して加える。初期オフセット補正量（Z）は、変動だけを見る場合は不要とされているので使わない。
2. 固定点（福江 950462）の動きを各局から引き、固定点に対する相対的な変位にする。固定点の選択はこちらの判断。

### 除外した電子基準点

次の9局は、地震と関係のない日に大きな跳びがあり、公式のオフセット補正量にも載っていない。移転と思われるが確認できないので、データは直さずに地図から除外した（2026年10月29日判断）。

| 局番号 | 局名 | 跳び | 時期 |
|---|---|---|---|
| 950230 | 小田原 | 水平6.2m・上下5.4m | 2001年7月 |
| 93093 | 大東１ | 水平4.4m | 2001年7月 |
| 940061 | 中津川 | 水平4.1m | 1997年12月 |
| 940041 | いわき | 水平2.2m | 2001年8月 |
| 950191 | 象潟 | 水平1.9m | 2001年7月 |
| 950441 | 東洋 | 水平1.3m | 2001年8月 |
| 950477 | 日之影 | 水平0.9m | 1996年3月 |
| 940093 | 千丁 | 水平0.9m | 2026年7月 |
| 950304 | 常滑１ | 水平0.8m | 2001年7月 |
