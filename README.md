# 30DayMapChallenge 2026

[#30DayMapChallenge](https://30daymapchallenge.com/) 2026（11月1日〜30日）に参加するための作業リポジトリ。

## 30日の一覧

準備度: ◎ 既存の成果物あり ／ ○ 少し加工すれば作れる ／ △ データ確認から。DATE・NAME・Description は [公式ページ](https://30daymapchallenge.com/#2026-themes) の原文。日本語訳は参考訳。

| DAY | DATE | NAME | Description（公式） | Description（日本語訳） | 地図のテーマ | 内容 | 使用する技術 | 準備 |
|---|---|---|---|---|---|---|---|---|
| Day 1 | 01-11-2026 | [Points](day01-points/) | A map challenge classic. Map with points. | マップチャレンジの定番。点で地図を作る。 | 動き続ける基準点（投稿済み） | 全国の電子基準点の1996年からの毎日の位置を点で描き、測地系がなぜ改定されるのかを見せる | Python（公式オフセット補正）→ 7日おきの変位を Int16 バイナリ → MapLibre GL JS（アニメーション）。全期間の軌跡は GeoParquet → tylertoo → PMTiles（2.5万倍のときの背景） | ◎ |
| Day 2 | 02-11-2026 | [Lines](day02-lines/) | A map challenge classic. Map with lines. | マップチャレンジの定番。線で地図を作る。 | 車で120分、世界8都市（投稿済み） | Overture Maps の道路から全球の道路網を作り、東京・ニューヨーク・パリなど8都市の中心から車で120分で届く道路を、所要時間の色で同じ縮尺に並べる。図は別リポジトリ [overture-road-route-search](https://github.com/shiwaku/overture-road-route-search) | Overture Maps（transportation）→ SciPy の Dijkstra（到達圏 API）→ 同じ縮尺の画像 | ◎ |
| Day 3 | 03-11-2026 | [Polygons](day03-polygons/) | A map challenge classic. Map with polygons. | マップチャレンジの定番。ポリゴンで地図を作る。 | 首都圏の滞留人口、1時間ごと（投稿済み） | 東京都市圏パーソントリップ調査（H30）の計画基本ゾーンを、時刻別滞留人口の密度で1時間ずつ塗る（首都圏→23区） | e-Stat（PT 表b-4）・協議会 H30_gis → GeoPandas・QGIS・ffmpeg | ◎ |
| Day 4 | 04-11-2026 | [Clusters](day04-clusters/) | Clusters of something. Hotspots, groups, things that gather together. | 何かのクラスター。ホットスポット、グループ、集まってくるもの。 | コンビニの縄張り（投稿済み） | コンビニ8チェーン・57,253店を、面積の等しい五角形の格子 A5 のセル（約130km²→約8km²）ごとに数え、店がいちばん多いチェーンで塗り分ける。店の点は出さない | Python（pya5）→ GeoJSON → MapLibre GL JS | ◎ |
| Day 5 | 05-11-2026 | [Senses: Sight](day05-sight/) | How do you see something? Maybe map a viewshed? | どうやって何かを見る？ 可視領域（viewshed）を地図にしてみては？ | 地上から見えない新宿駅（投稿済み） | 新宿駅の屋内地図を階ごとに積み、地面を透かして地下1〜3階を見せる（このデータの床の63%が地下） | MLT（mlt CLI 0.6.1 で GeoJSON から直接）＋ MapLibre GL JS 6.16 の fill-extrusion | ○ |
| Day 6 | 06-11-2026 | [Vintage](day06-vintage/) | Spin up your time machine and do a map which looks like a historical map, or maybe the theme itself should be vintage. | タイムマシンを起動して、昔の地図のように見える地図を作ろう。あるいはテーマそのものを昔のものにしてもいい。 | 鉄道の150年 | 日本の旅客鉄道の変遷を古地図風のスタイルで描く（2021・2022年の Qiita 記事の発展） | GeoPandas → PMTiles → MapLibre GL JS（紙テクスチャ・明朝体のスタイル） | ○ |
| Day 7 | 07-11-2026 | [10 minute map](day07-10min/) | You have no more than 10 minutes to complete this map. | この地図を仕上げる時間は10分以内。 | 公図を5分で地図に載せる（投稿済み） | 位置の分からない法務省 地図XML（任意座標系）を、QGIS の中の AI に頼んで公共座標に位置合わせし、オルソ画像に重ねるまでを録画（約5分→10倍速） | QGIS・Mapsuke・moj-chizu-xml-georeference（住所検索で大まかに置き、道路縁・DEM の線に合わせる） | ○ |
| Day 8 | 08-11-2026 | [Utopia](day08-utopia/) | A map of something which could be. | ありえるかもしれない何かの地図。 | 住むならどこ？ 地球・月・火星（投稿済み） | 地球・月・火星を同じ段彩の地球儀で並べ、月は南極の日の当たる尾根と永久影、火星は氷があって低い中緯度（表面の4.0%）を重ねる | LOLA 20m・MOLA 463m・SWIM → Python（Terrarium タイル）→ MapLibre GL JS（globe・color-relief・hillshade） | ◎ |
| Day 9 | 09-11-2026 | [Urban-rural](day09-urban-rural/) | Urban or rural. Cities and countryside. | 都市か農村か。都市と田園。 | 都市か農村か、1975→2020（投稿済み） | 世界の8都市の120km四方を、1kmマスごとの都市〜農村の段階（GHS-SMOD）で塗り、1975→2020年を GIF で動かす。別に、人口上位の都市圏97で2000→2020年に増えた建物（GHS-BUILT-S）を並べたビューアもある | GHSL GHS-SMOD・GHS-BUILT-S → Python（rasterio・Pillow、都市ごとに正距方位図法）→ GIF・Vite のビューア | ◎ |
| Day 10 | 10-11-2026 | [Prompting only](day10-prompting-only/) | For this map, make AI work for its money and produce something from start to finish in a chat window or on the command line. | この地図では AI にしっかり働いてもらい、チャット画面かコマンドラインの中だけで最初から最後まで作ろう。 | 都道のイチョウが色づいて散るまで（投稿済み） | 東京都の都道の街路樹（23区、約14万本）のうちイチョウを、気象庁の過去30年の黄葉日・落葉日の割合で1日ずつ少しずつ色づけて散らせる時系列アニメーション。Claude Code への指示だけで作る | 東京都建設局「都道の街路樹」・気象庁 生物季節観測 → Claude Code・MapLibre・deck.gl | ○ |
| Day 11 | 11-11-2026 | [Senses: Sound](day11-sound/) | How do you hear something? How do you map a soundscape? Noise pollution mapped? | どうやって何かを聞く？ サウンドスケープはどう地図にする？ 騒音公害を地図にしてみては？ | 頭の上を飛ぶ音 | 低い高度を飛ぶ航空機の軌跡と、その下に住む人口（騒音値ではなく「上空を通る」ことを示す） | Python → MLT → deck.gl（高度方向に立体表示） | ○ |
| Day 12 | 12-11-2026 | [Power](day12-power/) | Power as in nuclear power? Or physical power or influence? Power grid on a map? Read this the way you want, like every other prompt. | 原子力の Power？ 体力や影響力の Power？ 送電網を地図に？ ほかのお題と同じく、好きなように解釈していい。 | AIの覇権は、電力を増やせる国が取るか | 国別の発電量の伸び（直近10年）を世界地図にし、IEA のデータセンター需要の見通し（2024→2030年）がその伸びの何割を食うかを重ねる | Ember Yearly Electricity Data・IEA Energy and AI → 世界地図 | ◎ |
| Day 13 | 13-11-2026 | [Interactions](day13-interactions/) | Interactions between things, or maybe the result would be an interactive map? | 物と物とのあいだのやり取り。あるいは、結果がインタラクティブな地図になるかも？ | 人はどこへ通うか | 2020年国勢調査の市区町村間の通勤・通学（15歳以上、OD）を線で描き、市区町村をクリックすると出て行く流れ・入って来る流れに切り替える | e-Stat の Excel → Python（openpyxl・GeoPandas）→ JSON → MapLibre GL JS ＋ deck.gl ArcLayer | ◎ |
| Day 14 | 14-11-2026 | [Borgesian map](day14-borgesian/) | A map so detailed it becomes the territory. Inspired by Borges' On Exactitude in Science. | 細かすぎて、実際の土地そのものになってしまう地図。ボルヘスの『学問の厳密さについて』に着想を得たお題。 | 1億2600万人の地図 | 1億2600万人を125mメッシュで全部描く | 数値PNGタイル（Terrain-RGB 方式で値をエンコード）→ PMTiles → maplibre-gl-shader-layer | ◎ |
| Day 15 | 15-11-2026 | [Inside out](day15-inside-out/) | Inside out, upside down. Something on this map is not quite right. | 裏返し、逆さま。この地図には、どこか正しくないところがある。 | 陸と海を裏返した地球 | 標高の符号を反転して陸と海を入れ替える（陸: Mapterhorn、海底: GEBCO_2026） | Python（rasterio）→ Terrarium タイル → MapLibre GL JS（globe） | ◎ |
| Day 16 | 16-11-2026 | [Collaborative map](day16-collaborative/) | Do a map with a friend, colleague or a stranger. AI doesn't count as a friend :) | 友人、同僚、あるいは見知らぬ人と一緒に地図を作ろう。AI は友人に数えません :) | 誰かと1枚 | 社外の誰か（FOSS4G 仲間・家族など）と1枚作る。相手が見つからなければ見送る | 相手と決める | △ |
| Day 17 | 17-11-2026 | [Light & dark](day17-light-dark/) | Play with visual effects. What can you map with just light and shadows? | 視覚効果で遊ぼう。光と影だけで何が地図にできる？ | 光る日本の送電網 | 国土地理院の地図に描かれた送電線（約7.7万km）を全国分集めて光だけで描く（はじめは Day 12 用に作った）。送電線はズーム14〜16にしか入っていないので、ズーム14のタイル約14万枚を読んで集めた | 国土地理院最適化ベクトルタイル（PMTiles、Range リクエスト）→ Python（Shapely）→ GeoJSON → MapLibre GL JS（発光の線） | ◎ |
| Day 18 | 18-11-2026 | [NULL](day18-null/) | （説明文なし） | （説明文なし） | 名前のない道 | OSM の道路のうち、名前（name）が入っていない道を描く | DuckDB（OSM の集計）→ PMTiles → MapLibre GL JS | △ |
| Day 19 | 19-11-2026 | [Senses: Smell](day19-smell/) | How do you map things which your nose can sense? What does a smelly map look like? | 鼻で感じられるものをどう地図にする？ においのする地図はどんな見た目？ | 秋の東京、においのする並木 | 東京都の都道の街路樹（23区・多摩）から、イチョウ（ぎんなん）とキンモクセイを1本ずつ置き、においが漂う範囲としてぼかして描く | 東京都建設局 街路樹 CSV → Python → MapLibre GL JS（heatmap） | ○ |
| Day 20 | 20-11-2026 | [Hexagons](day20-hexagons/) | Hexagons, the good old bestagons. | 六角形。おなじみの「最強の多角形（bestagons）」。 | 六角形の山脈 | 日本の地形を六角形のモザイクで描く | DuckDB の H3 拡張（標高を集計）→ deck.gl H3HexagonLayer | ○ |
| Day 21 | 21-11-2026 | [OpenStreetMap](day21-osm/) | The awesome data source for mapping. You can also use this day to edit OSM. | 地図作りのための素晴らしいデータソース。この日に OSM を編集してもいい。 | OSM の建物はどこまで描かれているか | OSM の建物数を国勢調査の世帯数と比べ、描かれている割合を示す | DuckDB Spatial → PMTiles → MapLibre GL JS | △ |
| Day 22 | 22-11-2026 | [Projections](day22-projections/) | The different ways of representing a globe on a flat surface. What does your favourite map projection say about you? | 地球儀を平面に表すさまざまな方法。あなたの好きな投影法は、あなたについて何を語る？ | 世界のシェアモビリティ | 世界のシェアモビリティステーションを各種の投影法で比べる（2023年の GBFS 記事の発展） | MapLibre GL JS（globe）＋ d3-geo（MapLibre が持たない投影法） | ○ |
| Day 23 | 23-11-2026 | [Senses: Taste](day23-taste/) | Food, drink or something else which you can taste. | 食べ物、飲み物、そのほか味わえるもの。 | 日本のワイン・地ビール | 日本のワイナリー・醸造所 | Overpass API → MapLibre GL JS | △ |
| Day 24 | 24-11-2026 | [Network](day24-network/) | Route network, transit network, human network or something completely different. | 道路網、交通網、人のネットワーク、あるいはまったく別の何か。 | 街の通り道 | 道路網の中心性で、街のどの道が「通り道」になっているかを描く | City2Graph ＋ GeoPandas → MapLibre GL JS | ○ |
| Day 25 | 25-11-2026 | [Is this a map?](day25-is-this-a-map/) | Stretch the limits of maps and blend your map with an artwork or some creative data visualization. When does something become a map and when does it stop being one? | 地図の限界を広げ、アート作品や創造的なデータ可視化と混ぜ合わせよう。何かが地図になるのはいつで、地図でなくなるのはいつ？ | 人口の山並み | 日本の人口をリッジライン（Joy Division 風）で描く | Python（matplotlib） | ○ |
| Day 26 | 26-11-2026 | [Water](day26-water/) | About 71% of the Earth's surface. That wet thing, you know? | 地球表面の約71%。あの濡れたもの、わかるよね？ | 日本の流域 | 日本の流域をすべて色分けする | pyflwdir（流向・流域抽出）→ Zarr → MapLibre GL JS | ○ |
| Day 27 | 27-11-2026 | [New tool](day27-new-tool/) | The challenge has always been about learning things. Try out a new tool in your mapmaking workflow. | このチャレンジは、いつも何かを学ぶためのもの。地図作りのワークフローに新しいツールを取り入れてみよう。 | 新しいツールで1枚 | まだ使ったことのないタイル配信・描画ツールで1枚作る | Martin または Navara（MLT・Zarr・City2Graph・deck.gl-raster は他の日で使うので除く） | ○ |
| Day 28 | 28-11-2026 | [Senses: Feeling](day28-feeling/) | The most abstract of the senses series. How would you map a feeling? | 五感シリーズで一番抽象的なお題。感情をどうやって地図にする？ | 楽しかった道 | 自分の自転車の GPS ログで「楽しかった道」を描く（2021年の Qiita 記事の発展） | GPX → GeoPandas → MapLibre GL JS | ○ |
| Day 29 | 29-11-2026 | [Raster](day29-raster/) | Do something cool with pixels. | ピクセルで何かかっこいいことをしよう。 | CS立体図アート | 全国の CS立体図をアートとして描く | TiTiler（expression で色を計算）→ MapLibre GL JS | ◎ |
| Day 30 | 30-11-2026 | [Pen & paper](day30-pen-paper/) | Time to wrap up the challenge by closing your laptop for a while and going back to basics. Do an analogue map with pen and paper. | しばらくノートパソコンを閉じて基本に戻り、チャレンジを締めくくろう。ペンと紙でアナログの地図を作る。 | 一番好きだった場所 | 30日間で一番好きだった場所を手描きする | ペンと紙（投稿用にスキャン） | — |

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
