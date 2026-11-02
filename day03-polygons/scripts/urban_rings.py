"""都市の年輪: GHS-UCDB R2024A MTUC の都市中心のポリゴンを、1975〜2030年の12時点で重ねる。

使い方: python -I -X utf8 scripts/urban_rings.py data/ucdb_mtuc/GHS_UCDB_MTUC_GLOBE_R2024A.gpkg output

- 対象は、2025年の人口（MT_POP_TOT_2025）の上位50の都市中心
- 各図は都市中心の2025年のポリゴンの重心を中心にした 190 km 四方。全部同じ縮尺（いちばん大きいダッカも収まる）
- 年ごとのレイヤーから、その都市中心と同じ ID（ID_UC_G0 = ID_MTUC_G0）のポリゴンだけを描く。
  のちに合体した部分も同じ ID のマルチポリゴンになっているので、昔の姿までさかのぼれる
- 新しい年から先に描き、古い年を上に重ねる（年輪のように、内側ほど古い）
- 倍率は MT_UCA_KM2_2025 ÷ MT_UCA_KM2_1975（データの面積の列をそのまま使う）
- 出力: urban_rings.png（1枚の図）と urban_rings_top50.csv（使った都市と面積）
"""

import sys
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import colormaps
from matplotlib.colors import BoundaryNorm, ListedColormap, to_hex

plt.rcParams["font.family"] = ["Yu Gothic", "Meiryo", "sans-serif"]

YEARS = list(range(1975, 2031, 5))
N = 50
HALF = 95_000  # 図の半分の幅（m）
BG = "#0d0f14"
COLORS = [to_hex(colormaps["magma"](0.25 + 0.75 * i / (len(YEARS) - 1))) for i in range(len(YEARS))]
COL = dict(zip(YEARS, COLORS))


def load(gpkg: str):
    base = gpd.read_file(gpkg, layer="GHSL_UCDB_MTUC_GLOBE_R2024")
    top = base.nlargest(N, "MT_POP_TOT_2025").reset_index(drop=True)
    ids = set(top.ID_MTUC_G0)
    layers = {}
    for y in YEARS:
        g = gpd.read_file(gpkg, layer=f"GHSL_UCDB_MTUC_{y}_GLOBE_R2024")
        layers[y] = g[g.ID_UC_G0.isin(ids)].set_index("ID_UC_G0")
    return top, layers


def label(r) -> str:
    a75, a25 = r.MT_UCA_KM2_1975, r.MT_UCA_KM2_2025
    # 1975年に都市中心がなかった都市は、面積が空になっている。倍率の代わりに、都市中心になった年を書く
    grow = f"×{a25 / a75:.1f}" if a75 == a75 and a75 > 0 else f"urban centre since {int(r['GC_UCB_YOB _2025'])}"
    return f"{r.GC_UCN_MAI_2025}\n{grow}"


def draw(top, layers, upto: int, out: Path, show_year: bool = False):
    cols, rows = 10, 5
    fig, axs = plt.subplots(rows, cols, figsize=(24, 14.2), facecolor=BG)
    for ax in axs.flat:
        ax.set_axis_off()
    shown = [y for y in YEARS if y <= upto]
    for k, r in top.iterrows():
        ax = axs.flat[k]
        c = layers[2025].loc[r.ID_MTUC_G0].geometry.centroid
        ax.set_xlim(c.x - HALF, c.x + HALF)
        ax.set_ylim(c.y - HALF, c.y + HALF)
        ax.set_aspect("equal")
        for y in reversed(shown):
            if r.ID_MTUC_G0 in layers[y].index:
                gpd.GeoSeries([layers[y].loc[r.ID_MTUC_G0].geometry]).plot(ax=ax, fc=COL[y], ec=BG, lw=0.15)
        ax.set_title(f"{k + 1}. {label(r)}", color="#c9ccd4", fontsize=11, pad=2, linespacing=1.15)
    fig.suptitle("Urban rings — how the 50 largest urban centres grew, 1975→2030", color="white", fontsize=28, y=0.99)
    fig.text(0.5, 0.948, f"GHSL urban centres (GHS-UCDB MTUC R2024A), every 5 years · each panel 190 km × 190 km, same scale · ranked by 2025 population · ×N = area 2025 ÷ 1975",
             color="#9aa0ad", fontsize=14, ha="center")
    # 凡例: 年ごとの色の帯
    cax = fig.add_axes([0.25, 0.03, 0.5, 0.012])
    cmap = ListedColormap(COLORS)
    norm = BoundaryNorm(range(len(YEARS) + 1), len(YEARS))
    cb = fig.colorbar(plt.cm.ScalarMappable(cmap=cmap, norm=norm), cax=cax, orientation="horizontal")
    cb.set_ticks([i + 0.5 for i in range(len(YEARS))], labels=[str(y) for y in YEARS])
    cb.ax.tick_params(colors="#c9ccd4", labelsize=11, length=0)
    cb.outline.set_visible(False)
    fig.text(0.76, 0.03, "2025 and 2030 are projections", color="#9aa0ad", fontsize=11)
    if show_year:
        fig.text(0.5, 0.03, str(upto) + (" (projection)" if upto > 2020 else ""), color=COL[upto], fontsize=34, ha="center", weight="bold")
    fig.text(0.995, 0.003, "Source: European Commission, JRC — GHS-UCDB R2024A (MTUC), CC BY 4.0", color="#8a8f9c", fontsize=10, ha="right")
    fig.subplots_adjust(left=0.005, right=0.995, top=0.91, bottom=0.075, wspace=0.03, hspace=0.22)
    fig.savefig(out, dpi=100, facecolor=BG)
    plt.close(fig)


def main(gpkg: str, outdir: str) -> None:
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    top, layers = load(gpkg)
    top[["ID_MTUC_G0", "GC_UCN_MAI_2025", "GC_CNT_GAD_2025", "MT_POP_TOT_2025", "MT_UCA_KM2_1975", "MT_UCA_KM2_2025", "MT_UCA_KM2_2030"]].to_csv(out / "urban_rings_top50.csv", index=False)
    draw(top, layers, YEARS[-1], out / "urban_rings.png")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
