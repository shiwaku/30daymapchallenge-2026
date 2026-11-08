"""座標と線の太さを S 倍して描く ImageDraw の包み。レイアウトは等倍の座標のまま書ける。"""
from PIL import ImageDraw


class SDraw:
    def __init__(self, img, s):
        self.d = ImageDraw.Draw(img)
        self.s = s

    def text(self, xy, t, font, fill):
        self.d.text((xy[0] * self.s, xy[1] * self.s), t, font=font, fill=fill)

    def rectangle(self, box, fill=None, outline=None, width=1):
        self.d.rectangle([v * self.s for v in box], fill=fill, outline=outline, width=width * self.s)

    def textlength(self, t, font):
        return self.d.textlength(t, font=font) / self.s
