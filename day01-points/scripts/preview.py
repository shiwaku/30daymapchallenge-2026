"""build.py の出力（.npz）から、点の軌跡の試し描きを作る。

使い方: python -I scripts/preview.py <geonet_disp.npz> <出力png> [拡大倍率] [経度min,経度max,緯度min,緯度max]
各局の最初の位置に、東西・南北の変位を倍率で拡大して足し、日ごとに点を打つ。色は上下の変位。
"""

import sys

import matplotlib.pyplot as plt
import numpy as np

R = 6378137.0


def main():
    src, out = sys.argv[1], sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 25000
    extent = [float(v) for v in sys.argv[4].split(",")] if len(sys.argv) > 4 else [128, 146.5, 30.5, 45.8]

    z = np.load(src)
    lat0, lon0, de, dn, du = (z[k] for k in ("lat0", "lon0", "de", "dn", "du"))
    x = lon0 + np.degrees(de * scale / (R * np.cos(np.radians(lat0))))
    y = lat0 + np.degrees(dn * scale / R)

    # 隆起を赤、沈降を青。大きく動いた点が上に来るよう、上下の動きが小さい順に描く
    order = np.argsort(np.abs(du))
    fig, ax = plt.subplots(figsize=(10, 10), facecolor="#0b0d12")
    ax.set_facecolor("#0b0d12")
    sc = ax.scatter(x[order], y[order], c=du[order], cmap="RdBu_r", vmin=-0.5, vmax=0.5,
                    s=0.05, linewidths=0, rasterized=True)
    ax.set_xlim(extent[0], extent[1])
    ax.set_ylim(extent[2], extent[3])
    ax.set_aspect(1 / np.cos(np.radians((extent[2] + extent[3]) / 2)))
    ax.axis("off")
    cb = fig.colorbar(sc, ax=ax, shrink=0.35, pad=0.01)
    cb.set_label("vertical (m)", color="#c8c9ce")
    cb.ax.tick_params(colors="#c8c9ce")
    ax.set_title(f"GEONET daily coordinates (F5.1) 1996-2026, horizontal x{scale:,.0f}, fixed: Fukue",
                 color="#c8c9ce", fontsize=10)
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor=fig.get_facecolor())
    print(out)


if __name__ == "__main__":
    main()
