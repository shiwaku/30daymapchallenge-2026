# CLAUDE.md — 30daymapchallenge-2026

## 守ること

- オープンデータだけを使い、出典を必ず書く。
- All the Places のデータは公開物に使わない（自前クロール分に限らず、公式の実行分も。集計・派生物も含む）。各社サイトの利用規約が私的使用を超える複製・頒布を禁じており、CC0 での配布は規約の文面とぶつかるため（2026-11-02 判定）。Overture Places にも All the Places 由来の行が入るので、使うときは出どころ（sources）で除く。
- お題の NAME と Description（各 day の README に原文あり）を満たしているか、作る前に確認する。
- 数字を出すときは、元リポジトリの README に書かれた「言える範囲」を守る。
- 生成AIの使用は公開する（主催者の Code of Conduct）。
- ローカル専用のルールは CLAUDE.local.md（Git 管理外）にある。

## Git

- main へ直接コミットしない。トピックブランチ + PR。
