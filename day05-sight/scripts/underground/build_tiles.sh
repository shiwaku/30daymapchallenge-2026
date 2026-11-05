#!/usr/bin/env bash
# prepare.py の indoor.geojson を、mlt CLI だけで MLT のタイルにする（WSL で実行。tippecanoe は使わない）。
#   bash scripts/underground/build_tiles.sh
# 必要なもの: mlt CLI 0.6.1（cargo install mlt --version 0.6.1 --locked）
#
# mlt 0.6.1 は GeoJSON を直接タイルにできるが、書けるのは MLT version 2（実験的）だけで、出力は z/x/y.mlt のフォルダだけ。
# MapLibre GL JS 6.16 は version 2 を読めない（Unsupported column type code 2075）ので、2段にする。
#   1. GeoJSON → MLT v2 のフォルダ
#   2. v2 のフォルダ → MLT v1 のフォルダ（ビューワが読む。143 枚と少ないので PMTiles にまとめずに配信する）
#   --profile web : MapLibre GL JS 向けの既定（FastPFOR・FSST を使わない。gzip 後に小さくならないため）
#   --verify      : 書いたタイルをデコードし直して、入力と一致しなければ止める
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/../.."
mlt --version
V2=data/shinjuku/web/tiles_v2
rm -rf "$V2" web/tiles
mlt convert --mlt-version 2 --profile web --verify --min-zoom 14 --max-zoom 18 --layer indoor \
  data/shinjuku/web/indoor.geojson "$V2"
mlt convert --mlt-version 1 --profile web --verify "$V2" web/tiles
du -sh "$V2" web/tiles
