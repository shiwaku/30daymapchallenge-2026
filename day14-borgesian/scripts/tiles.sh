#!/usr/bin/env bash
# A5 のセル（data/cells_rNN.geojsonl）を、解像度ごとに1つのズームだけに入れたベクトルタイルにし、1つの PMTiles にまとめる。
# 解像度 r はズーム r-3 のタイルに入れる。ビューワは r を r-3 〜 r-2 で出す（解像度15から先は人口なしの格子をブラウザで作る）。
# WSL（tippecanoe 2.80）で実行: wsl -d Ubuntu -- bash scripts/tiles.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/tiles
parts=()
for r in $(seq 3 14); do
  rr=$(printf "%02d" "$r")
  z=$((r - 3)); zmin=$z
  out="data/tiles/r${rr}.pmtiles"
  # 五角形の形を崩さない（単純化・小さな面の間引き・落としをしない）
  tippecanoe -q -f -o "$out" -l "r${r}" -Z "$zmin" -z "$z" \
    --no-line-simplification --no-tiny-polygon-reduction --no-feature-limit --no-tile-size-limit \
    --no-tile-stats -P "data/cells_r${rr}.geojsonl" &
  parts+=("$out")
  # 同時に動かすのは4つまで
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 1; done
done
wait
tile-join -q -f -o data/cells.pmtiles --no-tile-size-limit -n "A5 population 2020" "${parts[@]}"
ls -la data/cells.pmtiles
