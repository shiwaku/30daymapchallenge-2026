# 試作: 鶴ヶ島上空の朝

2026年10月19日（月）6:35〜9:05 に、東武東上線の鶴ヶ島駅から半径 12km 以内を通った航空機の航跡を、所属ごとに色分けしたアニメーション。

- ページ: `index.html`（MapLibre GL JS、データは HTML に埋め込み）

## 分かったこと

10機のうち、低い高度を通ったのは次の7機。

| 駅に最も近づいた時刻 | 所属（推定） | 機体 | 駅からの距離 | 高度 |
|---|---|---|---|---|
| 6:44 | 民間 | 小型機（JA02GA、詳細不明） | 4.6km | 約1,600m |
| 6:48 | 民間 | アトラス航空 B767 貨物機 | 7.4km | 約1,000m |
| 7:32 | 航空自衛隊 | C-2 輸送機 | 4.4km | 約1,700m |
| 7:46 | 米空軍 | C-5M 輸送機 | 6.6km | 約2,000m |
| 8:28 | 航空自衛隊 | C-130H 輸送機 | 10.7km | 約1,300m |
| 8:48 | 航空自衛隊 | U-680A 飛行点検機 | 6.5km | 約680m |
| 8:57 | 米空軍 | C-37A 要人輸送機 | 7.1km | 約2,400m |

残りの3機は、高度 8,000〜9,000m を通過した旅客機。

## 言える範囲

- 軍用機であることは、ADSB.lol の機体データベースにある軍用フラグで確かめた。どこの所属かは、機種・機番・コールサインからの推定。
- ADS-B を発信していない機体は含まれない。軍用機は発信を切って飛ぶことがあるので、実際に飛んでいた機体はもっと多い可能性がある。
- 1日分だけの結果なので、「月曜の朝に多い」とは言えない。

## データ

- 航跡: [ADSB.lol](https://adsb.lol/) の日次アーカイブ [adsblol/globe_history_2026](https://github.com/adsblol/globe_history_2026) `v2026.10.18-planes-readsb-prod-0`（ODbL）
- 背景: [地理院タイル（淡色地図）](https://maps.gsi.go.jp/development/ichiran.html)

## 作り方

```sh
# 1. 日次アーカイブ（約3.7GB）を取得
gh release download v2026.10.18-planes-readsb-prod-0 -R adsblol/globe_history_2026 -D work/
# 2. 駅から半径12kmを通った機体を抽出
cat work/*.tar.aa work/*.tar.ab | python3 scripts/extract.py 35.9347 139.3925 > work/near.json
# 3. 所属を付けて HTML を生成
python3 scripts/build.py work/near.json 35.9347 139.3925 鶴ヶ島駅 index.html pages
```

所属の判定表は `scripts/build.py` の `KNOWN` にある。

## 生成AIの使用

データの取得・抽出・所属の判定・ページの作成は、Claude Code（Claude Opus 5.5）との対話で行った。所属の推定は AI によるもので、機種・機番・コールサインを根拠にしている。
