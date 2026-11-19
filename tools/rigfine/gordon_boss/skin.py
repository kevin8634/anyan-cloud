# raidA 11-01 戈尔顿身体贴图首领化（0 积分）：伤疤 + 前臂/手血污 + 前臂缠绳 + 湿皮（降粗糙度）
# python3 skin.py <dir>（dir 由 export_uv.mjs 导出），输出 base2.png nrm2.png mr2.png pv.jpg
import numpy as np, cv2, json, sys
D=sys.argv[1].rstrip('/')+'/'; S=2048
pos=np.fromfile(D+'pos.bin',np.float32).reshape(-1,3); uv=np.fromfile(D+'uv.bin',np.float32).reshape(-1,2)
jn=np.fromfile(D+'jn.bin',np.int32); idx=np.fromfile(D+'idx.bin',np.uint32).reshape(-1,3); J=json.loads(open(D+'joints.json').read())
import os
base=cv2.imread(D+('base_hd.png' if os.path.exists(D+'base_hd.png') else 'base.webp')).astype(np.float32); nrm=cv2.imread(D+'nrm.webp').astype(np.float32); mr=cv2.imread(D+'mr.webp').astype(np.float32)
assert base.shape[0]==S
rng=np.random.default_rng(11)
# ---- 区域标签（每三角取三顶点主骨骼的众数）
def grp(n):
    if 'Hand' in n: return 4
    if 'ForeArm' in n: return 3
    if n.endswith('Arm') or 'Shoulder' in n: return 2
    if n in ('Spine1','Spine2','Neck'): return 1
    return 0
G=np.array([grp(n) for n in J])[jn]
lab=np.zeros((S,S),np.uint8); P=np.zeros((S,S,3),np.float32)
UVp=np.stack([uv[:,0]*S, uv[:,1]*S],1)   # glTF UV 原点左上，图像同向
for t in idx:
    g=np.bincount(G[t]).argmax()
    pts=np.round(UVp[t]).astype(np.int32)
    cv2.fillPoly(lab,[pts],int(g)+1)
    if g in (3,4):   # 前臂/手逐像素插值坐标（画缠绳用）
        x0,y0=pts.min(0); x1,y1=pts.max(0)+1
        if x1-x0>200 or y1-y0>200: continue
        yy,xx=np.mgrid[y0:y1,x0:x1].astype(np.float32)+0.5
        a,b,c=UVp[t]; v0=b-a; v1=c-a; den=v0[0]*v1[1]-v1[0]*v0[1]
        if abs(den)<1e-6: continue
        px=xx-a[0]; py=yy-a[1]; l1=(px*v1[1]-v1[0]*py)/den; l2=(v0[0]*py-px*v0[1])/den; l0=1-l1-l2
        m=(l0>-0.02)&(l1>-0.02)&(l2>-0.02)
        q=l0[...,None]*pos[t[0]]+l1[...,None]*pos[t[1]]+l2[...,None]*pos[t[2]]
        sub=P[y0:y1,x0:x1]; sub[m]=q[m]
lab=lab.astype(np.int32)-1
# ---- 皮肤遮罩（颜色 + 区域）
hsv=cv2.cvtColor(base.clip(0,255).astype(np.uint8),cv2.COLOR_BGR2HSV).astype(np.float32)
skinc=((hsv[...,0]<22)|(hsv[...,0]>170))&(hsv[...,1]>35)&(hsv[...,2]>60)
skin=(skinc&(lab>=1)).astype(np.float32); skin=cv2.GaussianBlur(cv2.morphologyEx(skin,cv2.MORPH_OPEN,np.ones((3,3))),(0,0),2)
print('皮肤像素', int((skin>0.5).sum()), '前臂', int((lab==3).sum()), '手', int((lab==4).sum()))
height=np.load(D+'h_hd.npy')*0.4 if os.path.exists(D+'h_hd.npy') else np.zeros((S,S),np.float32)
def fbm(sz,oct=5,seed=0):
    r=np.random.default_rng(seed); acc=np.zeros((S,S),np.float32); amp=1
    for o in range(oct):
        n=r.standard_normal((sz*2**o,sz*2**o)).astype(np.float32); acc+=cv2.resize(n,(S,S),interpolation=cv2.INTER_CUBIC)*amp; amp*=0.5
    return acc/acc.std()
# ---- 1. 伤疤：胸背上臂随机刀疤（部分带缝线）
scar=np.zeros((S,S),np.float32); edge=np.zeros((S,S),np.float32)
cand=np.argwhere((skin>0.8)&((lab==1)|(lab==2)|(lab==3)))
for i in range(int(sys.argv[2]) if len(sys.argv)>2 else 48):
    y,x=cand[rng.integers(len(cand))]; L=rng.uniform(25,85); ang=rng.uniform(0,np.pi)
    n=int(L); ts=np.linspace(-0.5,0.5,n); bend=rng.uniform(-0.25,0.25)
    xs=x+np.cos(ang)*ts*L-np.sin(ang)*bend*L*(ts**2-0.25); ys=y+np.sin(ang)*ts*L+np.cos(ang)*bend*L*(ts**2-0.25)
    pts=np.stack([xs,ys],1).astype(np.int32)
    w=int(rng.integers(2,5)); cv2.polylines(scar,[pts],False,1.0,w,cv2.LINE_AA); cv2.polylines(edge,[pts],False,1.0,w+3,cv2.LINE_AA)
    if rng.random()<0.35:   # 缝线
        for k in range(3,n-3,7):
            dx,dy=-np.sin(ang)*6,np.cos(ang)*6; cx,cy=xs[k],ys[k]
            cv2.line(edge,(int(cx-dx),int(cy-dy)),(int(cx+dx),int(cy+dy)),1.0,1,cv2.LINE_AA)
scar=cv2.GaussianBlur(scar,(0,0),0.8)*skin; edge=np.clip(cv2.GaussianBlur(edge,(0,0),1.0)-scar,0,1)*skin
scarc=np.array([150,155,205],np.float32)   # 浅粉疤（BGR）
base=base*(1-0.75*scar[...,None])+scarc*0.75*scar[...,None]
base*= (1-0.35*edge)[...,None]
height+=scar*1.4-edge*0.5
# ---- 2. 前臂缠绳（腕上一段螺旋麻绳）
arm=(lab==3)|(lab==4)
ax=np.abs(P[...,0]); fm=(lab==3)&(ax>0)
sel=pos[np.isin(np.arange(len(pos)),idx[np.isin(G[idx],[3]).all(1)].ravel())]
for side in (1,-1):
    sv=sel[np.sign(sel[:,0])==side]
    if not len(sv): continue
    xa,xb=np.percentile(np.abs(sv[:,0]),[5,95]); yc,zc=sv[:,1].mean(),sv[:,2].mean()
    m=fm&(np.sign(P[...,0])==side)
    u=(ax-xa)/(xb-xa+1e-6)   # 0 肘 → 1 腕
    band=m&(u>0.42)&(u<0.97)
    th=np.arctan2(P[...,2]-zc,P[...,1]-yc)
    ph=(u*(xb-xa)/0.011+th/(2*np.pi))*2*np.pi   # 螺旋：每圈约 0.011（网格单位）
    rope=0.5+0.5*np.cos(ph); rope=rope**0.6
    twist=0.5+0.5*np.cos(ph*1+ (P[...,0]*side)*900)   # 绳股
    bm=cv2.GaussianBlur(band.astype(np.float32),(0,0),1.2)
    rc=np.array([62,96,128],np.float32)*(0.55+0.45*rope)[...,None]*(0.85+0.15*twist)[...,None]
    base=base*(1-bm[...,None])+rc*bm[...,None]
    height+=bm*(rope*1.6+twist*0.25)
    skin*= (1-bm)
# ---- 3. 血污：前臂/手重，胸口溅点
nz=fbm(6,5,3); nz2=fbm(24,3,4)
bw=np.zeros((S,S),np.float32); bw[lab==4]=0.75; bw[lab==3]=0.6; bw[lab==1]=0.3; bw[lab==2]=0.3
bw=cv2.GaussianBlur(bw,(0,0),6)
blood=np.clip((nz*0.9+nz2*0.7+(bw-0.5)*2.6-0.75)*1.4,0,1)*(lab>=1)
blood=cv2.GaussianBlur(blood,(0,0),1.0)
bc=np.array([18,20,62],np.float32)
base=base*(1-0.8*blood[...,None])+ (base*0.35+bc*0.65)*0.8*blood[...,None]
# ---- 5. 深渊幽魂绿（副本主色 0x50f0e0 / 0x60ffd0）：皮肤偏灰绿、发光脉络、伤疤渗光 → 自发光贴图
GC=np.array([170,255,90],np.float32)   # BGR 幽魂绿
gt=np.array([150,170,140],np.float32)
base=base*(1-0.35*skin[...,None])+ (base*0.55+gt*0.45)*0.35*skin[...,None]
r1=fbm(10,4,21); r2=fbm(3,3,22)
vein=np.clip(1-np.abs(r1)/0.14,0,1)**1.5   # 脊状噪声 → 细脉
patch=np.clip((r2+0.5)*1.3,0,1)*np.clip(skin*1.2,0,1)*((lab==1)|(lab==2)|(lab==3))
em=vein*patch*0.9 + scar*0.28 + cv2.GaussianBlur(scar,(0,0),5)*0.3*skin
em=np.clip(em,0,1)
base=base*(1-0.35*em[...,None])+GC*0.35*em[...,None]
cloth=(1-np.clip(skin*1.5,0,1))*(lab>=0)*(hsv[...,2]<110)
base=base*(1-0.18*cloth[...,None])+np.array([70,80,40],np.float32)*0.18*cloth[...,None]   # 围裙/裤子湿青调
emi=cv2.resize(GC[None,None,:]*em[...,None],(1024,1024),interpolation=cv2.INTER_AREA)
cv2.imwrite(D+'emi2.png',emi.clip(0,255).astype(np.uint8))
# ---- 4. 湿皮：皮肤和血降粗糙度（MR 贴图 G 通道）
wet=cv2.resize(np.clip(skin*0.9+blood*0.6,0,1),(mr.shape[1],mr.shape[0]),interpolation=cv2.INTER_AREA)
mr[...,1]=mr[...,1]*(1-0.32*wet)
# ---- 法线叠加（高度 → 切线空间扰动）
height=cv2.GaussianBlur(height,(0,0),0.9)
dx=cv2.Sobel(height,cv2.CV_32F,1,0,ksize=3); dy=cv2.Sobel(height,cv2.CV_32F,0,1,ksize=3)
n=nrm[...,::-1]/127.5-1   # RGB
k=float(sys.argv[3]) if len(sys.argv)>3 else 0.9
n[...,0]-=dx*k; n[...,1]+=dy*k; n/=np.linalg.norm(n,axis=2,keepdims=True)
nrm2=((n*0.5+0.5)*255).clip(0,255)[...,::-1]
cv2.imwrite(D+'base2.png',base.clip(0,255).astype(np.uint8)); cv2.imwrite(D+'nrm2.png',nrm2.astype(np.uint8)); cv2.imwrite(D+'mr2.png',mr.clip(0,255).astype(np.uint8))
pv=np.hstack([cv2.resize(cv2.imread(D+'base.webp'),(1024,1024)),cv2.resize(base.clip(0,255).astype(np.uint8),(1024,1024))])
cv2.imwrite(D+'pv.jpg',pv); cv2.imwrite(D+'lab.png',((lab+1)*50).astype(np.uint8))
print('ok')
