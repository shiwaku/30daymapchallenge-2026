# -*- coding: utf-8 -*-
"""東京PTインフォグラフ（地域構造：時刻別滞留人口ヒートマップ）の見せ方に揃えたアニメーション。

- 時刻: 1時間刻み 26コマ（〜3時, 3時台…26時台, 27時〜）= b-4 の列 p03_pre, p03..p26, p27_post
- 色: 公式配色（画像から抽出）を延長した14段階の段階区分 CLASS_BREAKS（ゾーンの時刻変化を見せるため細分化）
- ゾーン境界線なし、都県境界・調査対象範囲枠を重ねる（小ゾーンを融合して作成、GPKG に保存）
- 描画はオフスクリーン（キャンバス操作の影響を受けない）
- 背景ベクトルタイルは split_basemap で「上: 道路・鉄道・文字」「下: 水面」に分け、乗算せずに重ねる
※公式は地点別滞留人口のヒートマップ。本図は計画基本ゾーン単位の塗り分けによる近似。
"""
import os
import processing
from qgis.core import (Qgis, QgsProject, QgsVectorLayer, QgsFillSymbol, QgsSingleSymbolRenderer, QgsSymbolLayer,
                       QgsProperty, QgsRectangle, QgsFeatureRequest, QgsMapSettings, QgsMapRendererCustomPainterJob,
                       QgsExpressionContext, QgsExpressionContextUtils, QgsExpressionContextScope,
                       QgsCoordinateReferenceSystem)
from qgis.PyQt.QtCore import QSize, QRectF
from qgis.PyQt.QtGui import QImage, QPainter, QColor, QFont, QPen
from qgis.utils import iface

BASE = os.environ.get("PT_BASE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # 既定は day03-polygons/
OUT_DIR = os.path.join(BASE, "data")
GPKG = os.path.join(OUT_DIR, "pt_h30_zones_b4.gpkg")
B4_LAYER_ID = os.environ.get("PT_B4_LAYER_ID", "")  # QGIS プロジェクトに読み込んだ kzone_b4 レイヤーの ID

COLS = ["p03_pre"] + ["p%02d" % h for h in range(3, 27)] + ["p27_post"]
LABELS = ["〜3時"] + [f"{h}時台" for h in range(3, 27)] + ["27時〜"]
N_FRAMES = len(COLS)   # 26
STOPS = [(0, "#92c7ff"), (5000, "#fff983"), (10000, "#ffcd83"), (15000, "#ff9783"), (20000, "#da83b5")]

# 段階区分（ゾーンの時刻変化を見せるため細分化）。下限値, 単位 人/km²
CLASS_BREAKS = [0, 500, 1000, 2000, 3000, 4000, 5000, 7500, 10000, 12500, 15000, 20000, 30000, 50000]
# 公式配色（水色→黄→橙→サーモン→ピンク紫）を延長し、上位に濃い紫を追加
CLASS_RAMP = [(0.0, "#92c7ff"), (0.30, "#fff983"), (0.55, "#ffcd83"), (0.72, "#ff9783"), (0.85, "#da83b5"), (1.0, "#6e2a7f")]


def class_colors():
    from qgis.PyQt.QtGui import QColor
    n = len(CLASS_BREAKS); out = []
    for i in range(n):
        t = i / (n - 1)
        for (p0, c0), (p1, c1) in zip(CLASS_RAMP[:-1], CLASS_RAMP[1:]):
            if p0 <= t <= p1:
                a, b = QColor(c0), QColor(c1); r = (t - p0) / (p1 - p0)
                out.append(QColor(round(a.red() + (b.red() - a.red()) * r), round(a.green() + (b.green() - a.green()) * r),
                                  round(a.blue() + (b.blue() - a.blue()) * r)).name())
                break
    return out


def _dens_expr():
    arr = "array(" + ", ".join(f"'{c}'" for c in COLS) + ")"
    return f"attribute(array_get({arr}, coalesce(@frame_number, @pt_hour - 2))) / \"area_km2\""


def color_expr():
    parts = []
    for (v0, c0), (v1, c1) in zip(STOPS[:-1], STOPS[1:]):
        parts.append(f"WHEN @d < {v1} THEN color_mix_rgb('{c0}', '{c1}', (@d - {v0}) / {v1 - v0})")
    return f"with_variable('d', {_dens_expr()}, CASE {' '.join(parts)} ELSE '{STOPS[-1][1]}' END)"


def setup_style(layer):
    from qgis.core import QgsGraduatedSymbolRenderer, QgsRendererRange
    cols = class_colors(); ranges = []
    for i, lo in enumerate(CLASS_BREAKS):
        hi = CLASS_BREAKS[i + 1] if i + 1 < len(CLASS_BREAKS) else 10_000_000
        sym = QgsFillSymbol.createSimple({"color": cols[i], "outline_style": "no"})
        lab = f"{lo:,} – {hi:,}" if i + 1 < len(CLASS_BREAKS) else f"{lo:,} 以上"
        ranges.append(QgsRendererRange(lo, hi, sym, lab + " 人/km²"))
    layer.setRenderer(QgsGraduatedSymbolRenderer(_dens_expr(), ranges))
    tp = layer.temporalProperties()
    tp.setMode(Qgis.VectorTemporalMode.RedrawLayerOnly); tp.setIsActive(True)
    nav = iface.mapCanvas().temporalController()
    nav.setNavigationMode(Qgis.TemporalNavigationMode.Movie)
    nav.setTotalMovieFrames(N_FRAMES); nav.setFramesPerSecond(1.5); nav.setLooping(True)
    layer.triggerRepaint()


def ensure_boundaries():
    """小ゾーンを融合して都県境界（pref）と調査対象範囲（study_area）を GPKG に作る（無ければ）。"""
    from osgeo import ogr
    ds = ogr.Open(GPKG)
    names = [ds.GetLayer(i).GetName() for i in range(ds.GetLayerCount()) if ds.GetLayer(i).GetFeatureCount() > 0]
    ds = None
    if "pref" not in names or "study_area" not in names:
        fixed = processing.run("native:fixgeometries", {"INPUT": GPKG + "|layername=szone", "METHOD": 1,
                                                         "OUTPUT": "TEMPORARY_OUTPUT"})["OUTPUT"]
        withpref = processing.run("native:fieldcalculator", {
            "INPUT": fixed, "FIELD_NAME": "pref", "FIELD_TYPE": 1, "FIELD_LENGTH": 2,
            "FORMULA": "floor(\"JisCode\" / 1000)", "OUTPUT": "TEMPORARY_OUTPUT"})["OUTPUT"]
    def _dissolve_fill(fields, table):
        dis = processing.run("native:dissolve", {"INPUT": withpref, "FIELD": fields, "OUTPUT": "TEMPORARY_OUTPUT"})["OUTPUT"]
        # 小ゾーン間の微小な隙間が穴として残るので埋める（5 km² 未満）
        processing.run("native:deleteholes", {"INPUT": dis, "MIN_AREA": 5e6,
                                              "OUTPUT": f"ogr:dbname='{GPKG}' table=\"{table}\" (geom)"})
    if "pref" not in names:
        _dissolve_fill(["pref"], "pref")
    if "study_area" not in names:
        _dissolve_fill([], "study_area")
    pref = QgsVectorLayer(GPKG + "|layername=pref", "都県境界", "ogr")
    study = QgsVectorLayer(GPKG + "|layername=study_area", "H30対象範囲", "ogr")
    pref.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple(
        {"style": "no", "outline_color": "#ffffff", "outline_width": "0.35", "outline_style": "dash"})))
    study.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple(
        {"style": "no", "outline_color": "#202020", "outline_width": "0.5"})))
    return pref, study


def region_extent(layer, buffer_ratio=0.03):
    e = QgsRectangle(layer.extent()); e.scale(1 + buffer_ratio); return e


def ku23_extent(buffer_ratio=0.04):
    sz = QgsVectorLayer(GPKG + "|layername=szone", "sz", "ogr")
    ext = QgsRectangle(); ext.setNull()
    for f in sz.getFeatures(QgsFeatureRequest().setFilterExpression('"JisCode" >= 13101 AND "JisCode" <= 13123')):
        ext.combineExtentWith(f.geometry().boundingBox())
    ext.scale(1 + buffer_ratio); return ext


def render(layers, extent, frame, size=(968, 877), dpi=96.0, bg="#ffffff"):
    ms = QgsMapSettings()
    ms.setLayers(layers); ms.setDestinationCrs(QgsCoordinateReferenceSystem("EPSG:6677"))
    ms.setOutputSize(QSize(*size)); ms.setOutputDpi(dpi); ms.setExtent(extent); ms.setBackgroundColor(QColor(bg))
    ctx = QgsExpressionContext()
    ctx.appendScopes(QgsExpressionContextUtils.globalProjectLayerScopes(None))
    ctx.appendScope(QgsExpressionContextUtils.mapSettingsScope(ms))
    sc = QgsExpressionContextScope("frame"); sc.setVariable("frame_number", frame); ctx.appendScope(sc)
    ms.setExpressionContext(ctx)
    img = QImage(QSize(*size), QImage.Format.Format_ARGB32_Premultiplied); img.fill(QColor(bg))
    p = QPainter(img); QgsMapRendererCustomPainterJob(ms, p).renderSynchronously(); p.end()
    return img


def decorate(img, i, title):
    p = QPainter(img); p.setRenderHint(QPainter.RenderHint.Antialiasing)
    f = QFont("Meiryo"); f.setPointSize(11); p.setFont(f)
    bw = max(330, p.fontMetrics().horizontalAdvance(title) + 24)
    p.fillRect(QRectF(10, 10, bw, 92), QColor(255, 255, 255, 230))
    p.setPen(QColor("#333333")); p.drawText(20, 34, title)
    f.setPointSize(24); f.setBold(True); p.setFont(f); p.setPen(QColor("#00a19a")); p.drawText(20, 82, LABELS[i])
    p.fillRect(QRectF(20, 92, bw - 20, 4), QColor("#dddddd"))
    p.fillRect(QRectF(20, 92, (bw - 20) * i / (N_FRAMES - 1), 4), QColor("#00a19a"))
    # legend: 段階区分
    cols = class_colors(); n = len(CLASS_BREAKS); rh = 17
    lx, ly = 10, img.height() - 30 - rh * n - 50
    p.fillRect(QRectF(lx, ly, 200, rh * n + 64), QColor(255, 255, 255, 235))
    f = QFont("Meiryo"); f.setPointSize(9); p.setFont(f); p.setPen(QColor("#333333"))
    p.drawText(lx + 10, ly + 20, f"滞留人口密度（{LABELS[i]}）")
    f.setPointSize(8); p.setFont(f)
    for k in range(n):
        y = ly + 28 + (n - 1 - k) * rh          # 上ほど高密度
        p.fillRect(QRectF(lx + 10, y, 24, rh - 3), QColor(cols[k])); p.setPen(QPen(QColor("#888888"))); p.drawRect(QRectF(lx + 10, y, 24, rh - 3))
        lab = f"{CLASS_BREAKS[k]:,} – {CLASS_BREAKS[k+1]:,}" if k + 1 < n else f"{CLASS_BREAKS[k]:,} 以上"
        p.setPen(QColor("#333333")); p.drawText(lx + 42, y + rh - 5, lab + " 人/km²")
    y = ly + 28 + n * rh + 6
    p.setPen(QPen(QColor("#202020"), 2)); p.drawLine(lx + 10, y + 6, lx + 34, y + 6)
    p.setPen(QColor("#333333")); p.drawText(lx + 42, y + 10, "H30対象範囲")
    f.setPointSize(8); p.setFont(f); p.setPen(QColor("#555555"))
    src = "出典: 東京都市圏PT調査(H30) b-4 ゾーン別時刻別滞留人口（計画基本ゾーン単位）/ 地理院地図"
    sw = p.fontMetrics().horizontalAdvance(src)
    p.fillRect(QRectF(img.width() - sw - 18, img.height() - 24, sw + 12, 20), QColor(255, 255, 255, 230))
    p.drawText(img.width() - sw - 12, img.height() - 10, src)
    p.end()


TOP_LINE_LAYERS = {"road", "railway"}                  # 色の上に重ねる線
TOP_LABEL_LAYERS = {"label", "symbol", "transp"}       # 色の上に重ねる文字（注記・道路番号・交通）
BOTTOM_LAYERS = {"waterarea"}                          # 色の下に敷く面


def split_basemap(vt):
    """ベクトルタイル背景を複製し、(上: 道路・鉄道＋文字, 下: 水面) の2枚に分ける。元レイヤは変更しない。
    どちらも通常の描画モード（乗算しない）なので、滞留人口の色は凡例どおりに出る。"""
    from qgis.PyQt.QtGui import QPainter
    normal = QPainter.CompositionMode.CompositionMode_SourceOver
    top = vt.clone(); bottom = vt.clone()
    for lyr, keep in ((top, lambda st: st.layerName() in TOP_LINE_LAYERS and st.geometryType() == Qgis.GeometryType.Line),
                      (bottom, lambda st: st.layerName() in BOTTOM_LAYERS)):
        r = vt.renderer().clone()
        styles = r.styles()
        for st in styles:
            st.setEnabled(bool(keep(st)))
        r.setStyles(styles)
        lyr.setRenderer(r)
        lyr.setBlendMode(normal); lyr.setOpacity(1.0)
    lab = vt.labeling().clone()
    lstyles = lab.styles()
    for st in lstyles:
        st.setEnabled(st.layerName() in TOP_LABEL_LAYERS)
    lab.setStyles(lstyles)
    top.setLabeling(lab); top.setLabelsEnabled(True)
    bottom.setLabelsEnabled(False)
    return top, bottom


def export(name, extent, title, basemap_layers, frames=None, frame_ms=700, split=True):
    """split=True: ベクトルタイル背景を split_basemap で上下に分け、乗算せずに重ねる。"""
    from PIL import Image
    b4 = QgsProject.instance().mapLayer(B4_LAYER_ID)
    pref, study = ensure_boundaries()
    if split:
        vts = [l for l in basemap_layers if l.type() == Qgis.LayerType.VectorTile]
        if vts:
            top, bottom = split_basemap(vts[0])
            _keep = (top, bottom)   # 描画中に破棄されないよう参照を保持
            layers = [study, pref, top, b4, bottom]
            return _export_layers(name, extent, title, layers, frames, frame_ms)
    # b4 below vector-tile labels if basemap is a vector tile layer drawn on top; else under everything
    layers = [study, pref] + ([l for l in basemap_layers if l.type() == Qgis.LayerType.VectorTile]) + [b4] + \
             [l for l in basemap_layers if l.type() != Qgis.LayerType.VectorTile and l.id() != B4_LAYER_ID]
    return _export_layers(name, extent, title, layers, frames, frame_ms)


def _export_layers(name, extent, title, layers, frames=None, frame_ms=700):
    from PIL import Image
    d = os.path.join(OUT_DIR, f"anim_b4_ptinfo_{name}_frames"); os.makedirs(d, exist_ok=True)
    paths = []
    for i in (frames if frames is not None else range(N_FRAMES)):
        img = render(layers, extent, i); decorate(img, i, title)
        pth = os.path.join(d, f"frame_{i:02d}.png"); img.save(pth); paths.append(pth)
    allp = [os.path.join(d, f"frame_{i:02d}.png") for i in range(N_FRAMES)]
    gif = None
    if all(os.path.exists(x) for x in allp):
        gif = make_gif(allp, os.path.join(OUT_DIR, f"b4_anim_ptinfo_{name}.gif"), frame_ms)
    return paths, gif


def make_gif(frame_paths, gif_path, frame_ms=700):
    """全コマ共通の固定パレット（区分色を必ず含む）で GIF を作る。コマごとの減色で区分色がずれるのを防ぐ。"""
    from PIL import Image
    ims = [Image.open(x).convert("RGB") for x in frame_paths]
    fixed = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in class_colors()]
    # 残りの色: 全コマを縮小して並べた画像から抽出
    w, h = ims[0].size; tw, th = w // 4, h // 4
    sheet = Image.new("RGB", (tw * len(ims), th))
    for k, im in enumerate(ims):
        sheet.paste(im.resize((tw, th), Image.Resampling.NEAREST), (k * tw, 0))
    n_rest = 256 - len(fixed)
    rest = sheet.quantize(colors=n_rest, method=Image.Quantize.MEDIANCUT).getpalette()[:n_rest * 3]
    pal = [v for c in fixed for v in c] + rest
    pal += [0] * (768 - len(pal))
    pal_img = Image.new("P", (1, 1)); pal_img.putpalette(pal)
    q = [im.quantize(palette=pal_img, dither=Image.Dither.NONE) for im in ims]
    dur = [frame_ms] * len(q); dur[0] = dur[-1] = frame_ms * 2
    q[0].save(gif_path, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=False)
    return gif_path
