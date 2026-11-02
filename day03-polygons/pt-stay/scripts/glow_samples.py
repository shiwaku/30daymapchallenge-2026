# -*- coding: utf-8 -*-
"""グロー（発光）表現の見本を作る。案1: 高密度区分だけ外側グロー / 案3: 夜景風（暗背景＋inferno系＋グロー）。
anim_kzone_b4_ptinfo.py の描画・装飾関数を利用。元レイヤのスタイルは変更しない（複製レイヤで描画）。"""
import os
from qgis.core import (QgsProject, QgsFillSymbol, QgsGraduatedSymbolRenderer, QgsRendererRange, QgsEffectStack,
                       QgsDrawSourceEffect, QgsOuterGlowEffect, Qgis, QgsSingleSymbolRenderer)
from qgis.PyQt.QtGui import QColor

BASE = os.environ.get("PT_BASE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # 既定は day03-polygons/
pt = {"__name__": "ptinfo"}
_p = os.path.join(BASE, "scripts", "anim_kzone_b4_ptinfo.py")
exec(compile(open(_p, encoding="utf-8").read(), _p, "exec"), pt)
OUT = os.path.join(BASE, "data", "glow_samples"); os.makedirs(OUT, exist_ok=True)


def _glow_stack(color, spread_mm, blur, opacity):
    st = QgsEffectStack()
    g = QgsOuterGlowEffect(); g.setColor(QColor(color)); g.setSpread(spread_mm)
    g.setSpreadUnit(Qgis.RenderUnit.Millimeters); g.setBlurLevel(blur); g.setOpacity(opacity)
    st.appendEffect(g); st.appendEffect(QgsDrawSourceEffect())
    return st


def glow_renderer(colors, glow_from, spread0=0.6, dspread=0.35, blur=3.0, op0=0.55, dop=0.12):
    br = pt["CLASS_BREAKS"]; ranges = []
    for i, lo in enumerate(br):
        hi = br[i + 1] if i + 1 < len(br) else 10_000_000
        sym = QgsFillSymbol.createSimple({"color": colors[i], "outline_style": "no"})
        sym.symbolLayer(0).setRenderingPass(i)                # 高い区分を後に描く
        if i >= glow_from:
            k = i - glow_from
            sym.symbolLayer(0).setPaintEffect(_glow_stack(colors[i], spread0 + dspread * k, blur, min(1.0, op0 + dop * k)))
        ranges.append(QgsRendererRange(lo, hi, sym, f"{lo:,}"))
    r = QgsGraduatedSymbolRenderer(pt["_dens_expr"](), ranges)
    r.setUsingSymbolLevels(True)
    return r


def night_colors(n):
    from matplotlib import colormaps
    cm = colormaps["inferno"]
    return [QColor.fromRgbF(*cm(0.10 + 0.88 * i / (n - 1))[:3]).name() for i in range(n)]


def sample(option, name, extent, title, frame=10):
    proj = QgsProject.instance()
    b4 = proj.mapLayer(pt["B4_LAYER_ID"]).clone()
    pref, study = pt["ensure_boundaries"]()
    n = len(pt["CLASS_BREAKS"])
    if option == 1:
        cols = pt["class_colors"]()
        b4.setRenderer(glow_renderer(cols, glow_from=pt["CLASS_BREAKS"].index(15000)))
        vt = proj.mapLayer("____________________bbf1ec0d_2c0d_46e0_b67d_3800b115faaf")
        top, bottom = pt["split_basemap"](vt)
        layers = [study, pref, top, b4, bottom]; bg = "#ffffff"; keep = (top, bottom)
    else:
        cols = night_colors(n)
        b4.setRenderer(glow_renderer(cols, glow_from=pt["CLASS_BREAKS"].index(5000), spread0=0.4, dspread=0.3, op0=0.45, dop=0.07))
        pref.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"style": "no", "outline_color": "#8a93b8", "outline_width": "0.3", "outline_style": "dash"})))
        study.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"style": "no", "outline_color": "#c9cfe8", "outline_width": "0.4"})))
        layers = [study, pref, b4]; bg = "#0b1026"; keep = ()
    img = pt["render"](layers, extent, frame, bg=bg)
    orig = pt["class_colors"]; pt["class_colors"] = lambda: cols      # 凡例を案の配色に
    try:
        pt["decorate"](img, frame, title)
    finally:
        pt["class_colors"] = orig
    path = os.path.join(OUT, f"glow_opt{option}_{name}_f{frame:02d}.png"); img.save(path)
    return path



def rail_overlay_dark(vt, color="#c9d3f2", width=0.25):
    """背景ベクトルタイルを複製し、鉄道線だけを淡色の細線で描くレイヤにする（暗背景用）。元レイヤは変更しない。"""
    from qgis.core import QgsLineSymbol
    from qgis.PyQt.QtGui import QPainter
    lyr = vt.clone()
    r = vt.renderer().clone(); styles = r.styles()
    for st in styles:
        on = st.layerName() == "railway" and st.geometryType() == Qgis.GeometryType.Line
        st.setEnabled(on)
        if on:
            st.setSymbol(QgsLineSymbol.createSimple({"line_color": color, "line_width": str(width), "capstyle": "round"}))
    r.setStyles(styles); lyr.setRenderer(r)
    lyr.setLabelsEnabled(False)
    lyr.setBlendMode(QPainter.CompositionMode.CompositionMode_SourceOver)
    return lyr


def station_layer_dark(top_n):
    """主要駅（日英併記）を暗背景向け（白文字＋濃紺の縁取り、白丸）にしたレイヤ。"""
    from qgis.core import QgsMarkerSymbol, QgsSingleSymbolRenderer
    from qgis.PyQt.QtGui import QColor
    lyr = pt["station_layer"](top_n)
    lyr.setRenderer(QgsSingleSymbolRenderer(QgsMarkerSymbol.createSimple(
        {"name": "circle", "color": "#ffffff", "outline_color": "#0b1026", "outline_width": "0.4", "size": "1.8"})))
    lab = lyr.labeling().clone(); s = lab.settings()
    fmt = s.format(); fmt.setColor(QColor("#ffffff"))
    buf = fmt.buffer(); buf.setColor(QColor("#0b1026")); buf.setOpacity(0.85); buf.setSize(1.2); fmt.setBuffer(buf)
    s.setFormat(fmt); lab.setSettings(s); lyr.setLabeling(lab)
    return lyr


def sample_night_stations(name, extent, title, top_n, frame=10):
    proj = QgsProject.instance()
    b4 = proj.mapLayer(pt["B4_LAYER_ID"]).clone()
    pref, study = pt["ensure_boundaries"]()
    n = len(pt["CLASS_BREAKS"]); cols = night_colors(n)
    b4.setRenderer(glow_renderer(cols, glow_from=pt["CLASS_BREAKS"].index(5000), spread0=0.4, dspread=0.3, op0=0.45, dop=0.07))
    pref.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"style": "no", "outline_color": "#8a93b8", "outline_width": "0.3", "outline_style": "dash"})))
    study.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"style": "no", "outline_color": "#c9cfe8", "outline_width": "0.4"})))
    vt = proj.mapLayer("____________________bbf1ec0d_2c0d_46e0_b67d_3800b115faaf")
    rail = rail_overlay_dark(vt); st = station_layer_dark(top_n)
    layers = [st, study, pref, rail, b4]
    img = pt["render"](layers, extent, frame, bg="#0b1026")
    orig = pt["class_colors"]; pt["class_colors"] = lambda: cols
    try:
        pt["decorate"](img, frame, title)
    finally:
        pt["class_colors"] = orig
    path = os.path.join(OUT, f"glow_opt3_st_{name}_f{frame:02d}.png"); img.save(path)
    return path



def export_night(name, extent, title, top_n, frames=None, frame_ms=700):
    """案3（夜景風＋グロー＋鉄道線＋主要駅 日英併記）で全コマを書き出し、固定パレットの GIF を作る。"""
    proj = QgsProject.instance()
    b4 = proj.mapLayer(pt["B4_LAYER_ID"]).clone()
    pref, study = pt["ensure_boundaries"]()
    n = len(pt["CLASS_BREAKS"]); cols = night_colors(n)
    b4.setRenderer(glow_renderer(cols, glow_from=pt["CLASS_BREAKS"].index(5000), spread0=0.4, dspread=0.3, op0=0.45, dop=0.07))
    pref.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"style": "no", "outline_color": "#8a93b8", "outline_width": "0.3", "outline_style": "dash"})))
    study.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"style": "no", "outline_color": "#c9cfe8", "outline_width": "0.4"})))
    vt = proj.mapLayer("____________________bbf1ec0d_2c0d_46e0_b67d_3800b115faaf")
    rail = rail_overlay_dark(vt); st = station_layer_dark(top_n)
    layers = [st, study, pref, rail, b4]
    d = os.path.join(BASE, "data", f"anim_b4_night_{name}_frames"); os.makedirs(d, exist_ok=True)
    orig = pt["class_colors"]; pt["class_colors"] = lambda: cols
    try:
        for i in (frames if frames is not None else range(pt["N_FRAMES"])):
            img = pt["render"](layers, extent, i, bg="#0b1026"); pt["decorate"](img, i, title)
            img.save(os.path.join(d, f"frame_{i:02d}.png"))
        allp = [os.path.join(d, f"frame_{i:02d}.png") for i in range(pt["N_FRAMES"])]
        gif = None
        if all(os.path.exists(x) for x in allp):
            gif = pt["make_gif"](allp, os.path.join(BASE, "data", f"b4_anim_night_{name}.gif"), frame_ms)
    finally:
        pt["class_colors"] = orig
    return d, gif
