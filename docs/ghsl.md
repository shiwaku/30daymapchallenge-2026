# GHSL（Global Human Settlement Layer）の整理

European Commission の JRC が作る、全球の人の住まい方のデータ。配布元は JRC のオープンデータ（https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/ ）と GHSL のサイト（https://human-settlement.emergency.copernicus.eu/ ）。ライセンスは CC BY 4.0（各フォルダの copyright.txt）。

2026年11月2日に配布元のフォルダ一覧から整理した。説明を一次資料で確かめられなかったものには「未確認」と書く。

## 全体の組み立て

下の段のグリッドから、上の段の分類・ポリゴン・統計が作られている。

```
グリッド（ラスタ）         建物（BUILT-S / V / H / C）・人口（POP）・陸地（LAND）
   ↓ 都市化度（Degree of Urbanisation）の第1段階
集落の段階（ラスタ）       SMOD（1km マスごとに 都市中心〜農村 の段階）
   ↓ 都市中心のマスのまとまり / 行政区域に当てはめる（第2段階）
ポリゴン                   UCDB（都市中心）・MTUC（都市中心の時系列）・DUC（行政区域ごとの分類）・FUA（通勤圏）
   ↓ 集計
統計（表）                 COUNTRY_STATS ほか
```

## 版（リリース）

- 名前の `R2023A` などがリリース。同じ製品でも版で値が変わるので、混ぜて使わない
- いまの中心は **R2023A**（グリッド・SMOD・DUC）と **R2024A**（UCDB）
- **R2025A** には、国連の World Urbanization Prospects 2025 と組んだ **WUP** の系列がある（下）。2030年より先の予測まで入っている
- 年（エポック）は1975〜2030年の5年おき。2025・2030年は予測

## グリッド（ラスタ）

| 製品 | 中身 | 解像度・年 |
|---|---|---|
| GHS-BUILT-S | 建物の面積（マスごとの屋根の面積） | 10m〜1km、1975〜2030 |
| GHS-BUILT-V | 建物の体積 | 100m・1km |
| GHS-BUILT-H | 建物の高さ | 100m・1km、2018 |
| GHS-BUILT-C | 建物の形と使われ方（住宅・非住宅など）の分類 | 10m、2018 |
| GHS-POP | 人口（国勢調査などを建物の分布で振り分けたもの） | 100m・1km、1975〜2030 |
| GHS-LAND | 陸地の割合 | |
| GHS-AGE（R2025A） | 未確認。ファイル名（1975052020 など）から、建物ができた時期と思われる | 100m・1km |

座標系は2つ: Mollweide（ESRI:54009、ファイル名の `54009_1000` など、面積が正しい）と緯度経度（`4326_30ss` など）。

## SMOD（集落の段階、ラスタ）

GHS-POP と GHS-BUILT-S から、都市化度の第1段階で 1km マスを分類したもの。

| 値 | 段階 |
|---|---|
| 30 | 都市中心（Urban Centre） |
| 23 | 密な都市集落 |
| 22 | やや密な都市集落 |
| 21 | 郊外 |
| 13 | 農村の集落 |
| 12 | 低密度の農村 |
| 11 | ごく低密度の農村 |
| 10 | 水域 |

人口密度で段階を決めるので、言えるのは「都市化した範囲」まで。建物がどう広がったか（スプロール）は BUILT-S と POP で見る。

## ポリゴン（ベクタ）

| 製品 | 中身 | 年 |
|---|---|---|
| **GHS-UCDB R2024A** | 都市中心（約11,400）のポリゴンと、人口・面積・気候・排出・緑・災害など数百の属性。境界は2025年で固定 | 属性は1975〜2030 |
| **GHS-UCDB MTUC R2024A** | 都市中心のポリゴンを年ごとに持つ版（Multi-Temporal Urban Centres）。年ごとのレイヤーが ID（`ID_UC_G0`）で本体とつながる。本体には各年の面積（`MT_UCA_KM2_年`）・人口（`MT_POP_TOT_年`）など | 1975〜2030 の12時点 |
| GHS-DUC R2023A | 行政区域（GADM）ごとの都市化度の分類と統計 | 時系列（MT） |
| GHS-FUA R2019A | 都市中心とその通勤圏（Functional Urban Area）のポリゴン | 2015 |
| GHS-OBAT R2024A | 未確認（GeoPackage・CSV・国別統計・グリッド統計がある） | |

UCDB の主題別の表（THEME）: 気候・排出・災害への暴露・一般特性・地理・GHSL・緑・災害リスク・健康・インフラ・土地利用・自然・SDG など。

## WUP 系列（R2025A）

国連の World Urbanization Prospects 2025 のために作られた系列。グリッドから統計まで、一式がそろっている。

| 製品 | 中身 |
|---|---|
| GHS-WUP-POP / GHS-WUP-BUILT-S | 人口・建物のグリッド |
| GHS-WUP-DEGURBA | 都市化度の第1段階（SMOD に当たる）、1km、1975〜2100 |
| GHS-WUP-MTUC | 都市中心のポリゴンの時系列（統計と vector の2つの zip） |
| GHS-WUP-DUC | 都市化度の第2段階を GADM 4.1（レベル0〜2）に当てはめた統計 |
| GHS-WUP-COUNTRY-STATS | 国ごとの都市化度別の面積・人口・建物 |

R2023A/R2024A と WUP R2025A は、もとの人口グリッドが違うので値が合わない。どちらか一方にそろえる。

## このリポジトリで持っているもの（data/ は Git 管理外）

| 場所 | 中身 |
|---|---|
| day09-urban-rural/data/ghsl/ | SMOD R2023A（1975〜2030 の12時点、1km、Mollweide）、BUILT-S・POP R2023A（1975・2000・2020、1km）、2020年の UC・DUC の shapefile |
| day03-polygons/data/ucdb_mtuc/ | UCDB MTUC R2024A V1.2（GeoPackage、全12時点のポリゴンと本体の表） |

## 出典の書き方

- GHSL: 「European Commission, Joint Research Centre — GHS-◯◯ R20xxA」。変えたところがあれば書く（CC BY 4.0 の条件）
- UCDB の引用: Mari Rivero, I. ほか (2024): GHS-UCDB R2024A - GHS Urban Centre Database 2025. European Commission, JRC. doi:10.2905/1a338be6-7eaf-480c-9664-3a8ade88cbcd

## 参考

- 配布元のフォルダ一覧: https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/
- GHSL Data Package 2023（GHSL_Data_Package_2023.pdf。SMOD の zip に入っている）
- UCDB の説明: https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php 、報告書 "Stats in the City"（JRC139768）
- WUP 系列: https://human-settlement.emergency.copernicus.eu/ghs_wup2025.php 、GHSL WUP Projections Data Package 2025（JRC144209）
