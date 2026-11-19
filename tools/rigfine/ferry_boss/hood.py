# raidA 11-02 v2（Rhett 09:10 第 3 条 / 待批第 7 条）：兜帽 + 额角 投影贴图重绘（0 积分，本地）
# python3 hood.py <F> death|life     读 F/base_<mode>.png（skin.py 输出 2048）、F/emi_<mode>.png、F/v2/mesh/（dump.mjs 从 rig_<mode>.glb 导出的绑定姿势网格）
# 写 F/base_<mode>_v2.png、F/emi_<mode>_v2.png（build.mjs 优先读 _v2）、F/v2/hood_<mode>_pv.jpg
# 原因：头部 1.1 万个身体材质三角在 Lux3D 图集里散成上百个小岛，超分 / webp / mip 让岛边混进相邻无关颜色 →
#       兜帽内沿 / 额角碎片、兜帽大块深浅不一（露黑）。做法：每个纹素按重心坐标还原 3D 位置，
#       用 3D 邻域稳健中值重建平滑底色场（离群岛不参与），原图只保留限幅高频布纹；兜帽内沿（贴脸约 1.6 cm 内）抬到内衬色下限；
#       岛外空像素出血 8 px；死渡颈部缝光按区域压暗。
import numpy as np, cv2, sys, json
from scipy.spatial import cKDTree
F=sys.argv[1].rstrip('/')+'/'; MODE=sys.argv[2]; M=F+'v2/mesh/'
P=np.fromfile(M+'body_pos.bin',np.float32).reshape(-1,3); UV=np.fromfile(M+'body_uv.bin',np.float32).reshape(-1,2); I=np.fromfile(M+'body_idx.bin',np.uint32).reshape(-1,3).astype(np.int64)
FP=np.fromfile(M+'face_pos.bin',np.float32).reshape(-1,3); B=json.load(open(M+'bones.json'))
tex=cv2.imread(F+f'base_{MODE}.png'); S=tex.shape[0]
neck=B['Neck'][1]
# 1. 纹素归属图
own=np.full((S,S),-1,np.int32)
for t in range(len(I)):
    cv2.fillPoly(own,[np.round(UV[I[t]]*S-0.5).astype(np.int32)],int(t))
C=P[I].mean(1)
H=C[:,1]>neck-0.01                      # 头部（兜帽 + 额角 + 后颈）
ys,xs=np.nonzero(own>=0); tid=own[ys,xs]; m=H[tid]; ys,xs,tid=ys[m],xs[m],tid[m]
# 2. 重心坐标 → 3D
U=UV[I[tid]]*S-0.5; p=np.stack([xs,ys],1).astype(np.float32)
v0=U[:,1]-U[:,0]; v1=U[:,2]-U[:,0]; v2=p-U[:,0]
d00=(v0*v0).sum(1); d01=(v0*v1).sum(1); d11=(v1*v1).sum(1); d20=(v2*v0).sum(1); d21=(v2*v1).sum(1)
den=d00*d11-d01*d01; den[np.abs(den)<1e-9]=1e-9
b1=((d11*d20-d01*d21)/den).clip(0,1); b2=((d00*d21-d01*d20)/den).clip(0,1); b0=(1-b1-b2).clip(0,1); bs=b0+b1+b2; b0/=bs; b1/=bs; b2/=bs
X=P[I[tid,0]]*b0[:,None]+P[I[tid,1]]*b1[:,None]+P[I[tid,2]]*b2[:,None]
lab=cv2.cvtColor(tex,cv2.COLOR_BGR2LAB).astype(np.float32); L0=lab[ys,xs]
# 3. 每个三角的稳健颜色
order=np.argsort(tid,kind='stable'); ts=tid[order]; Ls=L0[order]
uq,st,cn=np.unique(ts,return_index=True,return_counts=True)
tri_med=np.zeros((len(I),3),np.float32); has=np.zeros(len(I),bool)
for u,s0,c in zip(uq,st,cn): tri_med[u]=np.median(Ls[s0:s0+c],0); has[u]=True
hid=np.nonzero(H&has)[0]
kd=cKDTree(C[hid])
# 4. 平滑底色场：两轮 3D 稳健中值（第一轮找离群，第二轮去掉离群再算）
R=0.03
nb=kd.query_ball_point(C[hid],R)
med1=np.array([np.median(tri_med[hid[n]],0) for n in nb])
dev=np.abs(tri_med[hid,0]-med1[:,0]); out=dev>22
good=hid[~out]; kd2=cKDTree(C[good])
def field(pts,r=R):
    nn=kd2.query_ball_point(pts,r); o=np.zeros((len(pts),3),np.float32)
    for i,n in enumerate(nn):
        if len(n)<4: _,n=kd2.query(pts[i],k=8)
        o[i]=np.median(tri_med[good[np.atleast_1d(n)]],0)
    return o
# 场定义在顶点上，纹素按重心插值（平滑、跨岛连续）
vid=np.unique(I[hid].ravel()); vf=np.zeros((len(P),3),np.float32); vf[vid]=field(P[vid])
fld=vf[I[tid,0]]*b0[:,None]+vf[I[tid,1]]*b1[:,None]+vf[I[tid,2]]*b2[:,None]
# 5. 内沿下限：贴脸 2.5 cm 内抬到内衬色下限（不黑）
medL=np.median(tri_med[good,0])
fd,_=cKDTree(FP).query(X); rim=np.clip(1-(fd-0.008)/0.016,0,1)
floorL=medL*(0.78 if MODE=='death' else 0.82)
fld[:,0]=np.maximum(fld[:,0],fld[:,0]*(1-rim)+np.maximum(fld[:,0],floorL)*rim)
# 6. 高频细节：原图减本三角中值，限幅；离群三角不保留细节，换细噪声布纹
det=L0-tri_med[tid]; det[:,0]=det[:,0].clip(-16,16)*0.7; det[:,1:]=det[:,1:].clip(-3,3)*0.5
isout=np.zeros(len(I),bool); isout[hid[out]]=True
rng=np.random.default_rng(5); nz=cv2.GaussianBlur(rng.standard_normal((S,S)).astype(np.float32),(0,0),1.2)*9
det[isout[tid]]=0; det[isout[tid],0]+=nz[ys,xs][isout[tid]]
# 内沿也减弱原细节（碎片多在这里）
det*= (1-0.6*rim)[:,None]
new=fld+det
lab2=lab.copy(); lab2[ys,xs]=new.clip(0,255)
o=cv2.cvtColor(lab2.astype(np.uint8),cv2.COLOR_LAB2BGR)
# 7. 出血：头部岛外 8 px 的空像素（不碰其它部位）
hm=np.zeros((S,S),np.uint8); hm[ys,xs]=255; empty=(own<0)
acc=o.astype(np.float32)*(hm[...,None]>0); wgt=(hm>0).astype(np.float32); filled=hm>0
for _ in range(8):
    a2=cv2.blur(acc,(3,3)); w2=cv2.blur(wgt,(3,3)); grow=(w2>0)&~filled&empty
    acc[grow]=a2[grow]/w2[grow,None]; wgt[grow]=1; filled|=grow; acc=acc*filled[...,None]
gm=filled&~(hm>0); o[gm]=acc[gm].clip(0,255).astype(np.uint8)
cv2.imwrite(F+f'base_{MODE}_v2.png',o)
# 8. 自发光：兜帽区去掉碎片光点；死渡颈部缝光压暗
e=cv2.imread(F+f'emi_{MODE}.png').astype(np.float32); ES=e.shape[0]
own_s=cv2.resize(own,(ES,ES),interpolation=cv2.INTER_NEAREST); ok=own_s>=0
cy=np.full(own_s.shape,-9,np.float32); cy[ok]=C[own_s[ok],1]
neckband=ok&(cy>neck-0.07)&(cy<neck+0.06)
k=0.45 if MODE=='death' else 0.7
e[neckband]*=k
headband=ok&(cy>=neck+0.06)          # 兜帽内沿 / 帽身上的布缝渗光（死渡近景是一条亮绿线，像穿帮）压到 0.3
e[headband]*=0.3 if MODE=='death' else 0.5
cv2.imwrite(F+f'emi_{MODE}_v2.png',e.clip(0,255).astype(np.uint8))
# 预览：头部图集区域前后
yy0,yy1,xx0,xx1=ys.min(),ys.max(),xs.min(),xs.max()
pv=np.hstack([cv2.resize(tex,(900,900)),cv2.resize(o,(900,900))])
cv2.imwrite(F+f'v2/hood_{MODE}_pv.jpg',pv)
print(MODE,'头部三角',int(H.sum()),'纹素',len(ys),'离群三角',int(out.sum()),'内沿纹素',int((rim>0).sum()),'出血',int(gm.sum()),'颈部自发光像素',int(neckband.sum()))
