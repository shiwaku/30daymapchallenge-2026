# X 投稿のテンプレート

## 決まり

- 1つの投稿は X の文字数で280以内（無料プラン）。日本語は1文字を2、URL は長さによらず23と数える
- 本文の投稿と、自分へのリプライの2つに分ける。出典と生成AIの使用はリプライに書く
- 動画にも出典を入れる（画面内か投稿文）。動画は単独で出回るので、リプライだけに頼らない
- 数字は、各 day の README の「言える範囲」を超えない
- 生成AIの使用は必ず書く（主催者の Code of Conduct「Whatever you use, be open about how you made it.」）
- 日本語で書く

## テンプレート

本文:

```text
#30DayMapChallenge Day {日}: {お題}
{タイトル}

{何を描いたか、何が見えるかを1〜2文で}
{ビューワの URL}
```

（動画を添付する）

リプライ:

```text
出典：{各 day の README の「データ」にある出典の書き方}
制作に生成AI（Claude Code）を使用（コードの作成）
```

## 各日の下書き

数字は書いた時点のもの。投稿する前に、各 day の README と見比べる。

### Day 1 — Points

本文:

```text
#30DayMapChallenge Day 1: Points
動き続ける電子基準点

全国約1,450の電子基準点が、1996年からどう動いたかを点で描いた。地面は少しずつ流れ、地震で跳ぶ。
https://shiwaku.github.io/30daymapchallenge-2026/day01-points/site/
```

リプライ:

```text
出典：国土地理院 電子基準点日々の座標値を加工して作成
制作に生成AI（Claude Code）を使用（コードの作成）
```

### Day 2 — Lines

投稿済み（2026-11-02）。投稿したのは鉄道の地図ではなく、overture-road-route-search の到達圏の図（day02-lines/README.md の「投稿したもの」）。

投稿した本文:

```text
#30DayMapChallenge Day 2 - lines
Overture Mapsの道路データから作成した全球の道路ネットワークデータに基づく到達圏のAPI化の検証🚗
世界は広い！！！！API / 描画の処理は改善が必要📝
```

（画像 https://github.com/shiwaku/overture-road-route-search/blob/main/docs/images/reach_120_legal/all.png を添付）

リプライ（出典と生成AIの使用）:

```text
出典）© Overture Maps Foundation（2026-10-21.0）、© OpenStreetMap contributors、osm-legal-default-speeds（CC BY-SA 2.0）
制作に生成AI（Claude Code）を使用（コードの作成）
https://github.com/shiwaku/overture-road-route-search
```

以下は鉄道の地図の下書き（未投稿。別の日に回すときに使う）。

本文:

```text
#30DayMapChallenge Day 2 - Lines
全国の鉄道を、平日1日に走る列車の本数で描いてみました🗺️

📝線はつながっていても、営業キロの約4割は1時間に1本より少ない。最後に、2026年春に列車が走っていなかった区間も出しています。

デモサイトはこちら↓
https://shiwaku.github.io/30daymapchallenge-2026/day02-lines/site/

#MapLibre #GTFS
```

（動画 day02-lines/output/day02-lines.mp4 を添付する）

リプライ:

```text
出典）gtfs-gis.jp 全国鉄道運行本数データ 2026年版（西澤明、CC BY 4.0 / ODbL）を加工して作成
制作に生成AI（Claude Code）を使用（コードの作成）
```
