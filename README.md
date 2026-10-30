# 30DayMapChallenge 2026（個人）

[#30DayMapChallenge](https://30daymapchallenge.com/) 2026（11月1日〜30日）に個人として参加するための作業リポジトリ。

## 30日の一覧

準備度: ◎ 既存の成果物あり ／ ○ 少し加工すれば作れる ／ △ データ確認から。DATE・NAME・Description は [公式ページ](https://30daymapchallenge.com/#2026-themes) の原文。日本語訳は参考訳。

| DATE | NAME | Description（公式） | Description（日本語訳） | 地図のテーマ | 内容 | 使用する技術 | 準備 |
|---|---|---|---|---|---|---|---|
| 01-11-2026 | [Points](day01-points/) | A map challenge classic. Map with points. | マップチャレンジの定番。点で地図を作る。 | 動き続ける基準点 | 全国の電子基準点の1996年からの毎日の位置を点で描き、測地系がなぜ改定されるのかを見せる | GeoParquet → tylertoo → PMTiles ＋ MapLibre GL JS（アニメーション） | ◎ |
| 02-11-2026 | [Lines](day02-lines/) | A map challenge classic. Map with lines. | マップチャレンジの定番。線で地図を作る。 | 路線図では同じ1本 | 全国の鉄道を平日1日の本数で描き直し、本数の少ない線と、いま走っていない区間を示す | GeoJSON ＋ MapLibre GL JS（line-width を本数で式指定） | ◎ |
| 03-11-2026 | [Polygons](day03-polygons/) | A map challenge classic. Map with polygons. | マップチャレンジの定番。ポリゴンで地図を作る。 | 13色で描く日本 | 全国の用途地域を13種類の色だけで描く | PMTiles → MapLibre GL JS | ◎ |
| 04-11-2026 | [Clusters](day04-clusters/) | Clusters of something. Hotspots, groups, things that gather together. | 何かのクラスター。ホットスポット、グループ、集まってくるもの。 | チェーン店の縄張り | 全国チェーンと地域チェーンの店舗の集まり方を比べる（ドラッグストア・ホームセンターなど） | DuckDB Spatial（集計）→ PMTiles → MapLibre GL JS | ○ |
| 05-11-2026 | [Senses: Sight](day05-sight/) | How do you see something? Maybe map a viewshed? | どうやって何かを見る？ 可視領域（viewshed）を地図にしてみては？ | 森の下に隠れたものを見る | 山城の遺構を CS立体図で浮かび上がらせる | CS立体図 XYZ タイル ＋ MapLibre GL JS（乗算合成） | △ |
| 06-11-2026 | [Vintage](day06-vintage/) | Spin up your time machine and do a map which looks like a historical map, or maybe the theme itself should be vintage. | タイムマシンを起動して、昔の地図のように見える地図を作ろう。あるいはテーマそのものを昔のものにしてもいい。 | 鉄道の150年 | 日本の旅客鉄道の変遷を古地図風のスタイルで描く（2021・2022年の Qiita 記事の発展） | GeoPandas → PMTiles → MapLibre GL JS（紙テクスチャ・明朝体のスタイル） | ○ |
| 07-11-2026 | [10 minute map](day07-10min/) | You have no more than 10 minutes to complete this map. | この地図を仕上げる時間は10分以内。 | 10分で今日の気温 | 当日のアメダス気温を10分で描く（作業を録画） | QGIS | ○ |
| 08-11-2026 | [Utopia](day08-utopia/) | A map of something which could be. | ありえるかもしれない何かの地図。 | 自転車で走りやすい東京 | 自転車に適した道だけでつないだ東京・埼玉の道路網 | bicycle-route-search（既存）→ MapLibre GL JS | ○ |
| 09-11-2026 | [Urban-rural](day09-urban-rural/) | Urban or rural. Cities and countryside. | 都市か農村か。都市と田園。 | 都市はどこまで広がったか | 人口集中地区（DID）の広がりを 1960→2020年で重ねる | GeoPandas → PMTiles → MapLibre GL JS（年次スライダー） | ○ |
| 10-11-2026 | [Prompting only](day10-prompting-only/) | For this map, make AI work for its money and produce something from start to finish in a chat window or on the command line. | この地図では AI にしっかり働いてもらい、チャット画面かコマンドラインの中だけで最初から最後まで作ろう。 | AI だけで1枚 | Claude Code との対話だけで、データ取得から地図の公開まで行う（作業ログも公開） | Claude Code ＋ DuckDB-WASM ＋ MapLibre GL JS | ○ |
| 11-11-2026 | [Senses: Sound](day11-sound/) | How do you hear something? How do you map a soundscape? Noise pollution mapped? | どうやって何かを聞く？ サウンドスケープはどう地図にする？ 騒音公害を地図にしてみては？ | 頭の上を飛ぶ音 | 低い高度を飛ぶ航空機の軌跡と、その下に住む人口（騒音値ではなく「上空を通る」ことを示す） | Python → MLT → deck.gl（高度方向に立体表示） | ○ |
| 12-11-2026 | [Power](day12-power/) | Power as in nuclear power? Or physical power or influence? Power grid on a map? Read this the way you want, like every other prompt. | 原子力の Power？ 体力や影響力の Power？ 送電網を地図に？ ほかのお題と同じく、好きなように解釈していい。 | 日本の送電網 | 地理院ベクトルタイルの送電線で日本の送電網を描く | 地理院 最適化ベクトルタイル → MapLibre GL JS | ○ |
| 13-11-2026 | [Interactions](day13-interactions/) | Interactions between things, or maybe the result would be an interactive map? | 物と物とのあいだのやり取り。あるいは、結果がインタラクティブな地図になるかも？ | 人はどこへ通うか | 国勢調査の通勤・通学 OD を流れで描き、ブラウザで絞り込めるようにする（2021年の Qiita 記事の更新版） | DuckDB-WASM（絞り込み）＋ deck.gl ArcLayer | ○ |
| 14-11-2026 | [Borgesian map](day14-borgesian/) | A map so detailed it becomes the territory. Inspired by Borges' On Exactitude in Science. | 細かすぎて、実際の土地そのものになってしまう地図。ボルヘスの『学問の厳密さについて』に着想を得たお題。 | 1億2600万人の地図 | 1億2600万人を125mメッシュで全部描く | 数値PNGタイル（Terrain-RGB 方式で値をエンコード）→ PMTiles → maplibre-gl-shader-layer | ◎ |
| 15-11-2026 | [Inside out](day15-inside-out/) | Inside out, upside down. Something on this map is not quite right. | 裏返し、逆さま。この地図には、どこか正しくないところがある。 | 大陸から見た日本 | 逆さ地図：南を上にして大陸側から日本を見る | MapLibre GL JS（bearing 180°） | ◎ |
| 16-11-2026 | [Collaborative map](day16-collaborative/) | Do a map with a friend, colleague or a stranger. AI doesn't count as a friend :) | 友人、同僚、あるいは見知らぬ人と一緒に地図を作ろう。AI は友人に数えません :) | 誰かと1枚 | 社外の誰か（FOSS4G 仲間・家族など）と1枚作る。相手が見つからなければ見送る | 相手と決める | △ |
| 17-11-2026 | [Light & dark](day17-light-dark/) | Play with visual effects. What can you map with just light and shadows? | 視覚効果で遊ぼう。光と影だけで何が地図にできる？ | 夜の日本 | 夜間光で日本の夜を描く | GDAL（COG 化）→ deck.gl-raster（COG をブラウザで直接描画） | △ |
| 18-11-2026 | [NULL](day18-null/) | （説明文なし） | （説明文なし） | 名前のない道 | OSM の道路のうち、名前（name）が入っていない道を描く | DuckDB（OSM の集計）→ PMTiles → MapLibre GL JS | △ |
| 19-11-2026 | [Senses: Smell](day19-smell/) | How do you map things which your nose can sense? What does a smelly map look like? | 鼻で感じられるものをどう地図にする？ においのする地図はどんな見た目？ | においのする井戸 | 硫化水素・鉄など、においに関わる水質項目がある深井戸 | GeoParquet → MapLibre GL JS | △ |
| 20-11-2026 | [Hexagons](day20-hexagons/) | Hexagons, the good old bestagons. | 六角形。おなじみの「最強の多角形（bestagons）」。 | 六角形の山脈 | 日本の地形を六角形のモザイクで描く | DuckDB の H3 拡張（標高を集計）→ deck.gl H3HexagonLayer | ○ |
| 21-11-2026 | [OpenStreetMap](day21-osm/) | The awesome data source for mapping. You can also use this day to edit OSM. | 地図作りのための素晴らしいデータソース。この日に OSM を編集してもいい。 | OSM の建物はどこまで描かれているか | OSM の建物数を国勢調査の世帯数と比べ、描かれている割合を示す | DuckDB Spatial → PMTiles → MapLibre GL JS | △ |
| 22-11-2026 | [Projections](day22-projections/) | The different ways of representing a globe on a flat surface. What does your favourite map projection say about you? | 地球儀を平面に表すさまざまな方法。あなたの好きな投影法は、あなたについて何を語る？ | 世界のシェアモビリティ | 世界のシェアモビリティステーションを各種の投影法で比べる（2023年の GBFS 記事の発展） | MapLibre GL JS（globe）＋ d3-geo（MapLibre が持たない投影法） | ○ |
| 23-11-2026 | [Senses: Taste](day23-taste/) | Food, drink or something else which you can taste. | 食べ物、飲み物、そのほか味わえるもの。 | 日本のワイン・地ビール | 日本のワイナリー・醸造所 | Overpass API → MapLibre GL JS | △ |
| 24-11-2026 | [Network](day24-network/) | Route network, transit network, human network or something completely different. | 道路網、交通網、人のネットワーク、あるいはまったく別の何か。 | 街の通り道 | 道路網の中心性で、街のどの道が「通り道」になっているかを描く | City2Graph ＋ GeoPandas → MapLibre GL JS | ○ |
| 25-11-2026 | [Is this a map?](day25-is-this-a-map/) | Stretch the limits of maps and blend your map with an artwork or some creative data visualization. When does something become a map and when does it stop being one? | 地図の限界を広げ、アート作品や創造的なデータ可視化と混ぜ合わせよう。何かが地図になるのはいつで、地図でなくなるのはいつ？ | 人口の山並み | 日本の人口をリッジライン（Joy Division 風）で描く | Python（matplotlib） | ○ |
| 26-11-2026 | [Water](day26-water/) | About 71% of the Earth's surface. That wet thing, you know? | 地球表面の約71%。あの濡れたもの、わかるよね？ | 日本の流域 | 日本の流域をすべて色分けする | pyflwdir（流向・流域抽出）→ Zarr → MapLibre GL JS | ○ |
| 27-11-2026 | [New tool](day27-new-tool/) | The challenge has always been about learning things. Try out a new tool in your mapmaking workflow. | このチャレンジは、いつも何かを学ぶためのもの。地図作りのワークフローに新しいツールを取り入れてみよう。 | 新しいツールで1枚 | まだ使ったことのないタイル配信・描画ツールで1枚作る | Martin または Navara（MLT・Zarr・City2Graph・deck.gl-raster は他の日で使うので除く） | ○ |
| 28-11-2026 | [Senses: Feeling](day28-feeling/) | The most abstract of the senses series. How would you map a feeling? | 五感シリーズで一番抽象的なお題。感情をどうやって地図にする？ | 楽しかった道 | 自分の自転車の GPS ログで「楽しかった道」を描く（2021年の Qiita 記事の発展） | GPX → GeoPandas → MapLibre GL JS | ○ |
| 29-11-2026 | [Raster](day29-raster/) | Do something cool with pixels. | ピクセルで何かかっこいいことをしよう。 | CS立体図アート | 全国の CS立体図をアートとして描く | TiTiler（expression で色を計算）→ MapLibre GL JS | ◎ |
| 30-11-2026 | [Pen & paper](day30-pen-paper/) | Time to wrap up the challenge by closing your laptop for a while and going back to basics. Do an analogue map with pen and paper. | しばらくノートパソコンを閉じて基本に戻り、チャレンジを締めくくろう。ペンと紙でアナログの地図を作る。 | 一番好きだった場所 | 30日間で一番好きだった場所を手描きする | ペンと紙（投稿用にスキャン） | — |

全日共通: 投稿用の静止画は chiitiler で作る。

## 方針

- オープンデータだけを使い、出典を必ず書く。
- 生成AIを使った日は作り方を公開する（Day 10 以外も）。
- 試すツールは FOSS4G Hiroshima 2026 で後追いすると決めたもの。

## 構成

```
dayNN-<theme>/
  README.md   お題の原文・内容・データ・試すツール・進捗
```
