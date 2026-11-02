"""都市の年輪: GHS-UCDB R2024A MTUC の都市中心のポリゴンを、1975〜2030年の12時点で重ねる。

使い方:
  python -I -X utf8 scripts/urban_rings.py <MTUC の gpkg> <出力フォルダ> [still|anim|all]
    still: urban_rings.png（1枚の図）と、確認用の途中の年の静止画 check_2000.png
    anim:  urban_rings.gif と urban_rings.mp4（年ごとに広がっていくアニメーション）

- 対象は、2025年の人口（MT_POP_TOT_2025）の上位50の都市中心
- 各図は都市中心の2025年のポリゴンの重心を中心にした 190 km 四方。全部同じ縮尺（いちばん大きいダッカも収まる）
- 年ごとのレイヤーから、その都市中心と同じ ID（ID_UC_G0 = ID_MTUC_G0）のポリゴンだけを描く。
  のちに合体した部分も同じ ID のマルチポリゴンになっているので、昔の姿までさかのぼれる
- 新しい年を下に、古い年を上に重ねる（年輪のように、内側ほど古い）
- その時点でいちばん新しい年の外周を光らせる（太さと濃さを変えた線を重ねて、ぼかしたように見せる）
- 倍率は MT_UCA_KM2_2025 ÷ MT_UCA_KM2_1975（データの面積の列をそのまま使う）
- 図形は最初に一度だけ作り、コマごとには表示を切り替えるだけにする（描き直さない）
"""

import shutil
import subprocess
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, LinearSegmentedColormap, ListedColormap, to_hex
from matplotlib.patches import PathPatch
from matplotlib.path import Path as MPath

plt.rcParams["font.family"] = ["Yu Gothic", "Meiryo", "sans-serif"]

YEARS = list(range(1975, 2031, 5))
N = 50
HALF = 95_000  # 図の半分の幅（m）
BG = "#07080d"
# 古い年は暗い藍、新しい年ほど熱い白に近づく（街の灯が外へ広がる見え方）
RAMP = LinearSegmentedColormap.from_list("rings", ["#1b1f5e", "#4b1d8f", "#9b1f9a", "#e8336f", "#ff7a3d", "#ffc35c", "#fff4d6"])
COLORS = [to_hex(RAMP(i / (len(YEARS) - 1))) for i in range(len(YEARS))]
COL = dict(zip(YEARS, COLORS))
GLOW = [(9.0, 0.06), (5.0, 0.12), (2.6, 0.30), (1.0, 0.95)]  # (線の太さ, 不透明度) 外側から


def load(gpkg: str):
    base = gpd.read_file(gpkg, layer="GHSL_UCDB_MTUC_GLOBE_R2024")
    top = base.nlargest(N, "MT_POP_TOT_2025").reset_index(drop=True)
    ids = set(top.ID_MTUC_G0)
    layers = {}
    for y in YEARS:
        g = gpd.read_file(gpkg, layer=f"GHSL_UCDB_MTUC_{y}_GLOBE_R2024")
        layers[y] = g[g.ID_UC_G0.isin(ids)].set_index("ID_UC_G0")
    return top, layers


def to_path(geom) -> MPath:
    verts, codes = [], []
    for p in getattr(geom, "geoms", [geom]):
        for ring in [p.exterior, *p.interiors]:
            c = np.asarray(ring.coords)
            verts += c.tolist()
            codes += [MPath.MOVETO] + [MPath.LINETO] * (len(c) - 2) + [MPath.CLOSEPOLY]
    return MPath(verts, codes)


def label(r) -> str:
    a75, a25 = r.MT_UCA_KM2_1975, r.MT_UCA_KM2_2025
    # 1975年に都市中心がなかった都市は、面積が空になっている。倍率の代わりに、都市中心になった年を書く
    grow = f"×{a25 / a75:.1f}" if a75 == a75 and a75 > 0 else f"urban centre since {int(r['GC_UCB_YOB _2025'])}"
    return f"{r.GC_UCN_MAI_2025}\n{grow}"


def build(top, layers):
    """図と、年ごとの塗り・光の Patch を作って返す。表示はあとで切り替える"""
    cols, rows = 10, 5
    fig, axs = plt.subplots(rows, cols, figsize=(24, 14.2), facecolor=BG)
    fills = {y: [] for y in YEARS}
    glows = {y: [] for y in YEARS}
    for ax in axs.flat:
        ax.set_axis_off()
    for k, r in top.iterrows():
        ax = axs.flat[k]
        c = layers[2025].loc[r.ID_MTUC_G0].geometry.centroid
        ax.set_xlim(c.x - HALF, c.x + HALF)
        ax.set_ylim(c.y - HALF, c.y + HALF)
        ax.set_aspect("equal")
        for i, y in enumerate(YEARS):
            if r.ID_MTUC_G0 not in layers[y].index:
                continue
            path = to_path(layers[y].loc[r.ID_MTUC_G0].geometry)
            z = 100 - i  # 古い年ほど上
            fills[y].append(ax.add_patch(PathPatch(path, fc=COL[y], ec="none", zorder=z)))
            for lw, a in GLOW:
                ec = "#fffaf0" if lw < 2 else COL[y]
                glows[y].append(ax.add_patch(PathPatch(path, fc="none", ec=ec, lw=lw, alpha=a, zorder=200, joinstyle="round")))
        ax.set_title(f"{k + 1}. {label(r)}", color="#c9ccd4", fontsize=11, pad=2, linespacing=1.15)
    fig.suptitle("Urban rings — how the 50 largest urban centres grew, 1975→2030", color="white", fontsize=28, y=0.99)
    fig.text(0.5, 0.948, "GHSL urban centres (GHS-UCDB MTUC R2024A), every 5 years · each panel 190 km × 190 km, same scale · ranked by 2025 population · ×N = area 2025 ÷ 1975",
             color="#9aa0ad", fontsize=14, ha="center")
    cax = fig.add_axes([0.25, 0.03, 0.5, 0.012])
    norm = BoundaryNorm(range(len(YEARS) + 1), len(YEARS))
    cb = fig.colorbar(plt.cm.ScalarMappable(cmap=ListedColormap(COLORS), norm=norm), cax=cax, orientation="horizontal")
    cb.set_ticks([i + 0.5 for i in range(len(YEARS))], labels=[str(y) for y in YEARS])
    cb.ax.tick_params(colors="#c9ccd4", labelsize=11, length=0)
    cb.outline.set_visible(False)
    fig.text(0.76, 0.03, "2025 and 2030 are projections", color="#9aa0ad", fontsize=11)
    fig.text(0.995, 0.003, "Source: European Commission, JRC — GHS-UCDB R2024A (MTUC), CC BY 4.0", color="#8a8f9c", fontsize=10, ha="right")
    year_text = fig.text(0.02, 0.02, "", fontsize=40, weight="bold", ha="left")
    fig.subplots_adjust(left=0.005, right=0.995, top=0.91, bottom=0.075, wspace=0.03, hspace=0.22)
    return fig, fills, glows, year_text


def show(fills, glows, year_text, upto: int, with_year: bool):
    for y in YEARS:
        for p in fills[y]:
            p.set_visible(y <= upto)
        for p in glows[y]:
            p.set_visible(y == upto)
    year_text.set_text((str(upto) + (" projection" if upto > 2020 else "")) if with_year else "")
    year_text.set_color(COL[upto])


def main(gpkg: str, outdir: str, mode: str = "all") -> None:
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    top, layers = load(gpkg)
    top[["ID_MTUC_G0", "GC_UCN_MAI_2025", "GC_CNT_GAD_2025", "MT_POP_TOT_2025", "MT_UCA_KM2_1975", "MT_UCA_KM2_2025", "MT_UCA_KM2_2030"]].to_csv(out / "urban_rings_top50.csv", index=False)
    fig, fills, glows, year_text = build(top, layers)
    if mode in ("still", "all"):
        show(fills, glows, year_text, YEARS[-1], with_year=False)
        fig.savefig(out / "urban_rings.png", dpi=100, facecolor=BG)
        show(fills, glows, year_text, 2000, with_year=True)
        fig.savefig(out / "check_2000.png", dpi=100, facecolor=BG)
    if mode in ("anim", "all"):
        frames = out / "anim"
        shutil.rmtree(frames, ignore_errors=True)
        frames.mkdir()
        for i, y in enumerate(YEARS):
            show(fills, glows, year_text, y, with_year=True)
            fig.savefig(frames / f"{i:02d}.png", dpi=67, facecolor=BG)
        # 1コマ0.7秒、最後は3秒止める。GIF はパレットを作ってから書き出す
        n = len(YEARS)
        lst = frames / "list.txt"
        lst.write_text("".join(f"file '{i:02d}.png'\nduration {3.0 if i == n - 1 else 0.7}\n" for i in range(n)) + f"file '{n - 1:02d}.png'\n", encoding="utf-8")
        ff = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst.as_posix()]
        subprocess.run(ff + ["-vf", "split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none", "-loop", "0", (out / "urban_rings.gif").as_posix()], check=True)
        subprocess.run(ff + ["-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", (out / "urban_rings.mp4").as_posix()], check=True)
    plt.close(fig)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "all")
