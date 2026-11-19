import json, math, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.colors import LightSource
fm.fontManager.addfont('/home/sandbox/.fonts/NotoSansSC-Regular.otf'); fm.fontManager.addfont('/home/sandbox/.fonts/NotoSansSC-Bold.otf')
plt.rcParams['font.family']='Noto Sans SC'; plt.rcParams['axes.unicode_minus']=False
D=json.load(open('layout.json')); SEG=D['seg']; BOSS=D['boss']
COL={"path":"#e8c070","boss":"#ff7050","shortcut":"#c080ff","tide":"#50d0e0","cave":"#a0e0ff","lift":"#ffffff","bridge":"#d09060","boat":"#40a0ff"}
# ---------- 高度场
st=2.0; X=np.arange(-150,141,st); Z=np.arange(-150,151,st); XX,ZZ=np.meshgrid(X,Z)
def noise(x,z,s):
    return (np.sin(x*0.071*s+1.3)*np.cos(z*0.053*s-0.7)+0.5*np.sin(x*0.17*s+z*0.13*s)+0.25*np.sin(x*0.41*s-z*0.37*s+2))/1.75
dist=np.full(XX.shape,1e9); H=np.zeros(XX.shape); W=np.zeros(XX.shape)
for name,n,t in SEG:
    if t in("lift",): continue
    for i in range(len(n)-1):
        ax,az,ah=n[i]; bx,bz,bh=n[i+1]; dx,dz=bx-ax,bz-az; Ls=dx*dx+dz*dz or 1
        tt=np.clip(((XX-ax)*dx+(ZZ-az)*dz)/Ls,0,1); d=np.hypot(XX-ax-dx*tt,ZZ-az-dz*tt)
        hw=3.5 if t in("bridge",) else 7 if t=="boat" else 5.5
        dd=d-hw; w=1/np.maximum(d,0.5)**4; H+=w*(ah+(bh-ah)*tt); W+=w; dist=np.minimum(dist,dd)
H=H/np.maximum(W,1e-12)
for k,(bx,bz,bh,nm) in BOSS.items():   # 首领场地：不规则空地（非正圆）
    a=np.arctan2(ZZ-bz,XX-bx); r=np.hypot(XX-bx,ZZ-bz); R=17+3.5*np.sin(a*3+bx)+2.2*np.sin(a*5-bz)+1.5*noise(XX,ZZ,1.7)
    if k=="⑤": R=R+8
    dd=r-R; m=dd<dist; dist=np.where(m,dd,dist); H=np.where(dd<4,np.where(dd<0,bh,H+(bh-H)*(1-dd/4)),H)
dist=dist+noise(XX,ZZ,2.3)*2.2
R0=np.hypot(XX,ZZ); abyss=-75+noise(XX,ZZ,0.8)*8
wall=30+noise(XX,ZZ,1.3)*10
ground=np.where(dist<=0,H,H+(abyss-H)*np.clip(dist/12,0,1)**0.6)
ground=np.where(R0>150,wall,np.where(R0>138,ground+(wall-ground)*np.clip((R0-138)/12,0,1),ground))
walk=dist<=0
# ---------- 画布
fig=plt.figure(figsize=(24,15),dpi=110,facecolor="#0c0a0e")
fig.suptitle("潮渊钟井 v2 · 整体构建与概念总图（草案）",color="#f2c75c",fontsize=30,fontweight="bold",y=0.99)
fig.text(0.5,0.935,"主路水平长度约 1100 m（原 257 m 的 4.3 倍；不含渡船步行约 940 m，3.7 倍）· 总落差 66 m（+12 → −54）· 井壁内约 290 × 300 m（原 176 m 见方）· 整体呈 S 形回折，不是绕圈下降· 5 首领 · 2 段钟笼升降 · 1 段渡船",ha="center",color="#d8c8a8",fontsize=14)
# 3D
ax=fig.add_axes([0.0,0.04,0.58,0.88],projection="3d",facecolor="#0c0a0e")
ls=LightSource(azdeg=315,altdeg=40)
base=np.where(walk,0.62,0.0)
cm=plt.get_cmap("bone")
rgb=ls.shade(ground,cmap=cm,vert_exag=1.5,blend_mode="soft",vmin=-90,vmax=45)
tint=np.zeros_like(rgb); tint[...,0]=0.35; tint[...,1]=0.42; tint[...,2]=0.5; tint[...,3]=1
rgb=rgb*0.7+tint*0.3*1
rgb[walk,0]=np.clip(rgb[walk,0]*1.15+0.08,0,1); rgb[walk,1]=np.clip(rgb[walk,1]*1.05+0.05,0,1)
ax.plot_surface(XX,ZZ,ground,facecolors=rgb,rstride=1,cstride=1,linewidth=0,antialiased=False,shade=False)
for name,n,t in SEG:
    a=np.array(n); ax.plot(a[:,0],a[:,1],a[:,2]+1.2,color=COL[t],lw=3.2 if t!="lift" else 2,ls="--" if t in("lift","shortcut","boat") else "-",zorder=10)
ax.plot([30,30],[-16,-16],[44,-40],color="#9ab0c0",lw=1.6); 
th=np.linspace(0,2*np.pi,30); ax.plot(30+6*np.cos(th),-16+6*np.sin(th),np.full(30,-40),color="#d0a050",lw=3)  # 裂钟
for k,(bx,bz,bh,nm) in BOSS.items(): ax.text(bx,bz,bh+9,f"{k} {nm.split(' · ')[-1]}",color="#ffd0a0",fontsize=13,fontweight="bold",ha="center")
ax.text(0,128,20,"井口 · 入口",color="#ffffff",fontsize=12,ha="center"); ax.text(30,-16,48,"井心悬钟（各层可见）",color="#c8d8e8",fontsize=11,ha="center")
ax.set_box_aspect((290,300,150)); ax.view_init(elev=38,azim=-62); ax.set_axis_off()
ax.set_xlim(-150,140); ax.set_ylim(-150,150); ax.set_zlim(-90,60)
# 俯视
bx2=fig.add_axes([0.58,0.36,0.40,0.54],facecolor="#0c0a0e")
sh=ls.shade(ground,cmap=plt.get_cmap("gray"),vert_exag=2,blend_mode="soft",vmin=-90,vmax=45)
bx2.imshow(sh,origin="lower",extent=[X[0],X[-1],Z[0],Z[-1]],alpha=0.85)
bx2.contour(XX,ZZ,walk.astype(float),levels=[0.5],colors="#e8d0a0",linewidths=0.8)
for name,n,t in SEG:
    a=np.array(n); bx2.plot(a[:,0],a[:,1],color=COL[t],lw=2.6,ls="--" if t in("lift","shortcut","boat") else "-")
for k,(bx,bz,bh,nm) in BOSS.items(): bx2.text(bx,bz,k,color="#fff",fontsize=17,fontweight="bold",ha="center",va="center",bbox=dict(boxstyle="circle",fc="#a03020",ec="#ffd080"))
lab={"西崖折返栈道":(-70,122),"潮汐低栈道（涨潮淹）":(-146,24),"寒潮冰窟（冰隧道）":(-146,-28),"锈链断桥（跨深渊，绕井心西侧）":(-30,-20),"摆渡暗河（坐船，沿东壁南下）":(124,-10),"沉钟回廊（井壁拱廊，折回井心）":(30,-118),"断桥绳梯捷径（屠夫死后放下）":(-56,30)}
for name,(lx,lz) in lab.items(): bx2.text(lx,lz,name.split("（")[0],color="#f0e0c0",fontsize=11)
bx2.set_xlim(-150,140); bx2.set_ylim(-150,150); bx2.set_aspect("equal"); bx2.tick_params(colors="#776"); [s.set_color("#443") for s in bx2.spines.values()]
bx2.set_title("俯视（北在上，单位 m）",color="#f2c75c",fontsize=15,pad=6)
# 剖面
cx=fig.add_axes([0.62,0.06,0.36,0.24],facecolor="#151217")
d0=0; pts=[]
for name,n,t in SEG:
    if t=="shortcut": continue
    for i in range(len(n)-1):
        a,b=n[i],n[i+1]; L=math.dist(a[:2],b[:2]); cx.plot([d0,d0+L],[a[2],b[2]],color=COL[t],lw=3,ls="--" if t in("lift","boat") else "-"); d0+=L
    if t=="boss": cx.text(d0-8,n[-1][2]+4,name.split(" ")[0],color="#fff",fontsize=14,fontweight="bold")
cx.set_title("沿主路的高度剖面（横轴：沿路距离 m，纵轴：高度 m）",color="#f2c75c",fontsize=13); cx.tick_params(colors="#998"); cx.grid(color="#333",lw=0.5)
[s.set_color("#443") for s in cx.spines.values()]
# 图例
from matplotlib.lines import Line2D
NM={"path":"栈道 / 回廊","boss":"首领场地","shortcut":"捷径","tide":"涨潮区","cave":"冰窟","lift":"钟笼升降","bridge":"锈链断桥","boat":"渡船"}
fig.legend([Line2D([0],[0],color=COL[k],lw=3) for k in NM],NM.values(),loc="lower left",ncol=8,facecolor="#1a161c",edgecolor="#443",labelcolor="#eee",fontsize=12,bbox_to_anchor=(0.03,0.01))
fig.savefig("钟井v2_概念总图.png",facecolor=fig.get_facecolor()); print("ok")
