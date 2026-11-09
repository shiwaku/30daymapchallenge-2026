# Day 9 — Urban-rural

- DATE: 09-11-2026
- NAME: Urban-rural

## Description（公式）

> Urban or rural. Cities and countryside.

## Description（日本語訳）

都市か農村か。都市と田園。

## 地図のテーマ

都市はどう広がったか（2000→2020）

## 内容

世界の人口上位の都市圏97について、中心から上下左右40km（80km四方）の建物を、同じ縮尺で並べた。2000年にあった建物を灰色、その後20年で増えた建物を橙で塗り、建物の面積の伸び率が大きい順に並べている。都市が田園を食べていく速さを比べる地図。

- 投稿用の画像: [day09-urban-rural.png](day09-urban-rural.png)
- ビューア: [site/](site/)（都市をクリックすると数字が出る。`data/web/` を読む）

### 主な数字

建物の面積は、都市の点から半径40kmの円の中の合計（2000→2020）。

| | 都市の数 | 伸び率（中央値） |
|---|---|---|
| 97都市 | 97 | +28% |
| 中国 | 16 | +69% |
| インド | 10 | +62% |
| アメリカ | 13 | +12% |
| 日本（東京・大阪・横浜） | 3 | +9% |

- 2倍以上になったのは6都市（重慶 +151%、貴陽 +110%、成都・バンガロール +109%、天津 +105%、プネー +104%）。50%以上は30都市
- 10%未満は7都市（ロサンゼルス +4%、シカゴ +5%、サンフランシスコ・ニューヨーク・ロンドン +8%、横浜・大阪 +9%）

### 人口を載せなかった理由

はじめは人口（GHS-POP）も重ね、中心からの距離帯ごとの増減と「ドーナツ化（中心5kmの人口が5%以上減った都市）」を示す予定だった。日本の2都市で国勢調査の地域メッシュと突き合わせたところ、増減の向きが逆だった（`scripts/check_census.py`）。

| 2000→2020 | 国勢調査 | GHS-POP |
|---|---|---|
| 大阪 半径40km | +0.8% | −7.9% |
| 大阪 中心5km | +8.0% | −6.7% |
| 東京 半径40km | +14.4% | +10.0% |
| 東京 中心5km | +45.8% | +13.3% |

GHS-POP は都心回帰をとらえておらず、ほかの国の都市でも同じくらいずれている恐れがある。そこで人口は載せず、衛星画像から作られた建物の面積（GHS-BUILT-S）だけにした。

### GHS-SMOD と人口集中地区（DID）の突き合わせ（2026-11-09）

GHS-SMOD（1km マスごとの都市〜農村の段階）は、人口（GHS-POP）の密度で都市か農村かを決めている。上のとおり GHS-POP は日本で増減の向きがずれていたので、SMOD を使う前に、国勢調査の人口集中地区（DID、国土数値情報 A16）と東京・大阪で比べた（`scripts/check_smod_did.py`）。

- 範囲: Natural Earth の都市の点から上下左右60km（`ghsl_top100.py` と同じ）。そのうち、比べた府県（東京: 埼玉・千葉・東京・神奈川、大阪: 滋賀・京都・大阪・兵庫・奈良・和歌山）の陸が半分以上のマス
- やり方: 1km マスを100m に割って DID が占める割合を出し、半分以上なら「DID のマス」とした

| 都市 | 年 | DID の面積 | SMOD 都市中心の面積 | DID のマスのうち都市中心に入る | 都市中心のマスのうち DID が半分以上 |
|---|---|---|---|---|---|
| 東京 | 1975 | 2,255 km² | 4,404 km² | 99% | 51% |
| 東京 | 2020 | 3,259 km² | 4,936 km² | 99% | 67% |
| 大阪 | 1975 | 1,291 km² | 2,631 km² | 99% | 48% |
| 大阪 | 2020 | 1,853 km² | 2,637 km² | 95% | 68% |

都市クラスター（21〜30、郊外より上）で比べると、DID のマスは99〜100%入り、都市クラスターのマスのうち DID が半分以上なのは32〜56%。

わかったこと:

- **DID はほぼ全部、SMOD の都市中心に入る（95〜99%）**。都市中心は DID の1.4〜2.0倍広い。基準が違う（DID は人口密度4,000人/km²以上の単位区が隣り合って5,000人以上、SMOD の都市中心は1km マスで1,500人/km²以上が固まって5万人以上）ので、広く出るのは定義どおり
- **広がり方は合わない**。1975→2020年に DID は東京 +45%・大阪 +44% 広がったが、SMOD の都市中心は東京 +12%・大阪 ±0%。SMOD は1975年の時点ですでに広く、その後は中が埋まる形（都市中心の中で DID が半分以上のマスが 約5割→約7割）
- SMOD で言えるのは「ある年に、どこが都市でどこが農村か」まで。都市中心の広がりの大きさは、日本では DID より小さく出る

### 言える範囲

- 言えること: 97都市の中心まわりで、GHS-BUILT-S の建物の面積が2000→2020年にどれだけ増えたか。都市どうしの伸び率の比べ合い
- 言えないこと: 人口の増減、スプロール（人口の伸びより建物の広がりが速いか）、ドーナツ化。人口は上の理由で使っていない
- 建物の面積は 1km マスの推計値（衛星画像からのモデル）。マスの中の建物の割合なので、小さな建物の増減や建て替え（高層化）は表れにくい。画像では、マスの3%未満の増加は塗っていない
- 「都市圏」は行政の境界ではなく、Natural Earth の都市の点から半径40km の円。海や隣の都市も入る
- 都市と順位は Natural Earth Populated Places の POP_MAX 上位100。データに疑問のある3都市（アマラーヴァティー: 建設中の州都なのに580万人、ルアンダ: GHS-POP 1975年が5万人、河池: 広い行政区の人口）を除いた

## データ

| データ | 提供元 | 用途 | ライセンス |
|---|---|---|---|
| [GHS-BUILT-S R2023A](https://human-settlement.emergency.copernicus.eu/download.php?ds=bu)（2000・2020年、1km、Mollweide） | European Commission, JRC | 建物の面積 | CC BY 4.0 |
| [GHS-POP R2023A](https://human-settlement.emergency.copernicus.eu/download.php?ds=pop)（2000・2020年、1km） | European Commission, JRC | 国勢調査との突き合わせだけ（地図には使っていない） | CC BY 4.0 |
| [Natural Earth](https://www.naturalearthdata.com/) Populated Places（1:10m） | Natural Earth | 都市の点と順位 | パブリックドメイン |
| [国勢調査 地域メッシュ統計](https://www.e-stat.go.jp/gis)（2000年 500m・2020年 250m） | 総務省統計局（e-Stat） | GHS-POP の確かめ | 政府標準利用規約（第2.0版）準拠 |
| [国土数値情報 人口集中地区（A16）](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A16-v2_3.html)（1975・2020年） | 国土交通省（国勢調査の DID を加工） | GHS-SMOD の確かめ | 国土数値情報利用規約。平成7年度以降は商用可、それより前（1975年）は非商用。この確かめは非商用 |
| [GHS-SMOD R2023A](https://human-settlement.emergency.copernicus.eu/download.php?ds=smod)（1975〜2030年、1km） | European Commission, JRC | 都市〜農村の段階（下書きの GIF と DID との突き合わせ） | CC BY 4.0 |

## 使用する技術

- Python（rasterio・GeoPandas・Pillow）→ 都市ごとの PNG と GeoJSON
- Vite ＋ TypeScript（ビューア）

## 作り方

```bash
# data/ghsl/ に GHS-BUILT-S・GHS-POP（2000・2020）、data/ne/ に Natural Earth を置く
python scripts/sprawl_donut.py   # 都市ごとの人口・建物の面積 → data/sprawl_donut.csv
python scripts/build_web.py      # data/web/（cities.geojson・built/*.png）
python scripts/build_poster.py   # output/day09-urban-rural.png
npm install && npm run build     # site/
# 確かめ: data/census2000/ に e-Stat の T000386（500m）、2020年は Day 8 の250mメッシュ
python scripts/check_census.py
# 確かめ: 国土数値情報 A16（1975・2020、上の府県）を <DID>/{75,20}/{府県コード}/ に展開。都道府県界は国土数値情報 N03 の parquet
python scripts/check_smod_did.py <DID> <N03.parquet>   # → data/check_smod_did.csv
```

`ghsl_anim.py`・`ghsl_top100.py`・`smod_by_country.py` と GIF 2枚は、GHS-SMOD（都市・農村の区分）を試した下書き。投稿には使っていない。

## 投稿文

本文:

```text
#30DayMapChallenge Day 9 - Urban-rural
世界の大都市97の、2000→2020年に増えた建物を同じ縮尺で並べてみました🏙️
📝建物の面積は中央値で+28%。中国16都市は+69%、インド10都市は+62%、アメリカ13都市は+12%、東京・大阪・横浜は+9〜10%。重慶は2.5倍
#OpenData #Python
```

リプライ:

```text
出典）GHSL（European Commission, JRC）GHS-BUILT-S R2023A、Natural Earth を加工して作成
人口（GHS-POP）は、大阪で国勢調査と増減の向きが逆だったので載せていません
制作に生成AI（Claude Code）を使用（データの加工とコードの作成）
```

## 状況

- [x] データ準備
- [x] 地図作成
- [x] 画像・ビューア
- [ ] 投稿（#30DayMapChallenge）
