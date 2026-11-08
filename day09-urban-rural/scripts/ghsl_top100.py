import sys, re, numpy as np, rasterio, geopandas as gpd
from rasterio.windows import from_bounds
from pyproj import Transformer
from PIL import Image, ImageDraw, ImageFont
D, NE, OUT = sys.argv[1:4]
f = lambda y: f"{D}/GHS_SMOD_E{y}_GLOBE_R2023A_54009_1000_V2_0.tif"
CL = {10:"#9ecae1",11:"#f7f4ea",12:"#d9e8b5",13:"#8fbf6a",21:"#ffe066",22:"#ffad42",23:"#f0602f",30:"#8b0000"}
NM = [(11,"ごく低密度の農村"),(12,"低密度の農村"),(13,"農村の集落"),(21,"郊外"),(22,"やや密な都市集落"),(23,"密な都市集落"),(30,"都市中心"),(10,"水域")]
lut = np.full((256,3),255,np.uint8)
for v,c in CL.items(): lut[v]=[int(c[i:i+2],16) for i in (1,3,5)]
d = gpd.read_file(f"{NE}/ne_10m_populated_places.shp").nlargest(100,"POP_MAX")
tr = Transformer.from_crs("EPSG:4326","+proj=moll +lon_0=0 +datum=WGS84 +units=m",always_xy=True)
xy = [tr.transform(lo,la) for lo,la in zip(d.geometry.x,d.geometry.y)]
names = [re.sub(r"(特別市|広域市|市|都)$","",n) for n in d.NAME_JA]
H=60_000; P=120; GAP=10; LAB=20; COLS=10; TOP=90; BOT=70; M=20
W = M*2+COLS*P+(COLS-1)*GAP; Hh = TOP+10*(P+LAB)+9*GAP+BOT
FT = lambda s,b=False: ImageFont.truetype("C:/Windows/Fonts/YuGothB.ttc" if b else "C:/Windows/Fonts/YuGothM.ttc", s)
frames=[]
for yr in range(1975,2031,5):
    im = Image.new("RGB",(W,Hh),"white"); dr = ImageDraw.Draw(im)
    with rasterio.open(f(yr)) as r:
        for k,((x,y),n) in enumerate(zip(xy,names)):
            a = r.read(1, window=from_bounds(x-H,y-H,x+H,y+H,r.transform), boundless=True, fill_value=10)
            a = np.clip(a,0,255).astype(np.uint8)
            px = M+(k%COLS)*(P+GAP); py = TOP+(k//COLS)*(P+LAB+GAP)
            im.paste(Image.fromarray(lut[a]).resize((P,P),Image.NEAREST),(px,py))
            dr.text((px+P/2,py+P+2),f"{k+1}. {n}",font=FT(13),fill="#222",anchor="ma")
    dr.text((M,18),f"{yr}"+("（予測）" if yr>2020 else ""),font=FT(44,True),fill="#111")
    dr.text((M+330,26),"人口上位100都市圏の 120km 四方：1km マスごとの都市〜農村の段階（GHS-SMOD）",font=FT(17),fill="#444")
    dr.text((M+330,52),"都市の順位：Natural Earth Populated Places の POP_MAX（都市圏人口）",font=FT(14),fill="#666")
    lx=M; ly=Hh-BOT+14
    for v,t in NM:
        dr.rectangle([lx,ly,lx+18,ly+14],fill=CL[v],outline="#999"); dr.text((lx+24,ly-2),t,font=FT(14),fill="#333"); lx+=24+int(dr.textlength(t,font=FT(14)))+22
    dr.text((W-M,Hh-22),"出典: European Commission, JRC — GHS-SMOD R2023A ／ Natural Earth",font=FT(12),fill="#666",anchor="ra")
    frames.append(im); print(yr,flush=True)
dur=[800]*len(frames); dur[-1]=2500
frames[0].save(f"{OUT}/ghsl_smod_top100_1975_2030.gif",save_all=True,append_images=frames[1:],duration=dur,loop=0,optimize=True)
frames[-1].save(f"{OUT}/top100_last.png"); frames[0].save(f"{OUT}/top100_first.png")
