import sys, io, numpy as np, rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer
from PIL import Image
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
from matplotlib.patches import Patch
plt.rcParams["font.family"] = ["Yu Gothic", "Meiryo", "sans-serif"]
D, OUT = sys.argv[1], sys.argv[2]
f = lambda y: f"{D}/GHS_SMOD_E{y}_GLOBE_R2023A_54009_1000_V2_0.tif"
CL = [(10,"#9ecae1","水域"),(11,"#f7f4ea","ごく低密度の農村"),(12,"#d9e8b5","低密度の農村"),(13,"#8fbf6a","農村の集落"),
      (21,"#ffe066","郊外"),(22,"#ffad42","やや密な都市集落"),(23,"#f0602f","密な都市集落"),(30,"#8b0000","都市中心")]
vals=[c[0] for c in CL]
def classify(a):
    idx=np.full(a.shape,-1,int)
    for i,v in enumerate(vals): idx[a==v]=i
    return np.ma.masked_less(idx,0)
cmap=ListedColormap([c[1] for c in CL]); norm=BoundaryNorm(np.arange(-.5,len(CL)),len(CL))
legend=[Patch(color=c[1],label=c[2]) for c in CL]
tr=Transformer.from_crs("EPSG:4326","+proj=moll +lon_0=0 +datum=WGS84 +units=m",always_xy=True)
P=[("東京",139.75,35.68),("深圳・広州",113.7,22.85),("デリー",77.21,28.61),("ダッカ",90.40,23.78),("ラゴス",3.38,6.52),("カイロ",31.24,30.04)]
H=90_000; YEARS=list(range(1975,2031,5)); frames=[]
for yr in YEARS:
    fig,axs=plt.subplots(2,3,figsize=(13,9.6),facecolor="white")
    with rasterio.open(f(yr)) as r:
        for ax,(n,lo,la) in zip(axs.flat,P):
            x,y=tr.transform(lo,la)
            ax.imshow(classify(r.read(1,window=from_bounds(x-H,y-H,x+H,y+H,r.transform))),cmap=cmap,norm=norm,interpolation="nearest")
            ax.set_xticks([]);ax.set_yticks([]);ax.set_title(n,fontsize=14)
    lab=f"{yr}"+("（予測）" if yr>2020 else "")
    fig.suptitle(lab,fontsize=30,fontweight="bold",x=.5,y=.975)
    fig.text(.5,.915,"GHS-SMOD：1km マスごとの都市〜農村の段階（各図 180km 四方）",ha="center",fontsize=12,color="#444")
    fig.legend(handles=legend,loc="lower center",ncol=4,fontsize=11,frameon=False,bbox_to_anchor=(.5,.025))
    fig.text(.99,.006,"出典: European Commission, JRC — GHS-SMOD R2023A",ha="right",fontsize=9,color="#666")
    fig.subplots_adjust(left=.02,right=.98,top=.87,bottom=.12,wspace=.04,hspace=.12)
    b=io.BytesIO(); fig.savefig(b,dpi=80,format="png"); plt.close(); frames.append(Image.open(b).convert("RGB"))
    print(yr,flush=True)
dur=[700]*len(frames); dur[-1]=2000
frames[0].save(f"{OUT}/ghsl_smod_1975_2030.gif",save_all=True,append_images=frames[1:],duration=dur,loop=0)
