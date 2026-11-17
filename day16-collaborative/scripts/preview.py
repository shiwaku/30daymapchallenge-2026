"""DSM と DEM の陰影図を横に並べて確認する（output/preview.png）。"""
from pathlib import Path
import numpy as np, rasterio
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
def shade(z, res=0.5, az=315, alt=45):
    gy, gx = np.gradient(z, res)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    a, b = np.radians(az), np.radians(alt)
    s = np.sin(b)*np.cos(slope) + np.cos(b)*np.sin(slope)*np.cos(a - aspect)
    return (np.clip(s, 0, 1)*255).astype(np.uint8)
ims = []
for k in ["dsm", "dem"]:
    with rasterio.open(ROOT/"data"/f"takeda_{k}.tif") as src: z = src.read(1)
    ims.append(Image.fromarray(shade(z)))
w, h = ims[0].size
out = Image.new("L", (w*2, h)); out.paste(ims[0], (0, 0)); out.paste(ims[1], (w, 0))
out.resize((w, h//2)).save(ROOT/"output"/"preview.png")
