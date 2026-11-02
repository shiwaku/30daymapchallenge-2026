"""指定した経緯度のまわり 3x3 枚の XYZ タイルを取って 1 枚の PNG にする（データの範囲と見え方の確認用）。

使い方: python -I -X utf8 scripts/peek_tiles.py <lon> <lat> <z> <タイルURL> <出力PNG>
タイル URL は {z}/{x}/{y}、TMS は {-y} で書く。
"""
import io
import math
import sys
import urllib.request

from PIL import Image


def main() -> None:
    lon, lat, z, url, out = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
    n = 2**z
    cx = int((lon + 180) / 360 * n)
    cy = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    img = Image.new("RGB", (256 * 3, 256 * 3), (255, 0, 255))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            x, y = cx + dx, cy + dy
            u = url.replace("{z}", str(z)).replace("{x}", str(x)).replace("{-y}", str(n - 1 - y)).replace("{y}", str(y))
            try:
                req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
                data = urllib.request.urlopen(req, timeout=20).read()
                img.paste(Image.open(io.BytesIO(data)).convert("RGB"), ((dx + 1) * 256, (dy + 1) * 256))
            except Exception as e:  # 範囲外は 404 になる
                print("miss", u, e)
    img.save(out)


if __name__ == "__main__":
    main()
