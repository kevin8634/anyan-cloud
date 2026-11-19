# raidA 11-03 A8fix（Rhett 11-03 18:06 批第 7 条：兜帽内沿 / 额角暗色块本地补色，0 积分）
# python3 hood2.py <F> death|life    在 hood.py（v2）之后跑：读 F/base_<mode>_v2.png、脸部 face*_base_v2.png 与 F/v2/mesh/
# 写 F/base_<mode>_v3.png、F/nrm_<mode>_v3.png、F/face{,_life}_base_v3.png（build.mjs 优先 _v3 → _v2 → 原件）、F/v2/hood2_<mode>_pv.jpg
# v2 遗留：脸部材质上沿（发际 / 额角）是锯齿状三角边界，亮皮肤三角直接顶进兜帽内侧的阴影里 → 近景是「暗色块里夹几片亮碎片」；
#   兜帽内沿身体三角离脸近的地方仍有几块比周围暗 / 亮的原图集碎片。
# 做法：①脸部纹素按重心还原 3D，离脸部边界（开放边）越近越向「兜帽内衬色 × 阴影」过渡（上沿 / 额角宽 1.8 cm、两颊 0.9 cm、下颌不动），
#        锯齿边界变成柔和的帽檐阴影渐变；②兜帽内沿（贴脸 2.5 cm 内）身体纹素换成 3D 平滑场（不留原碎片细节），与①同色衔接。
import numpy as np, cv2, sys, json
from scipy.spatial import cKDTree
F=sys.argv[1].rstrip('/')+'/'; MODE=sys.argv[2]; M=F+'v2/mesh/'
def ld(p):
    return (np.fromfile(M+p+'_pos.bin',np.float32).reshape(-1,3), np.fromfile(M+p+'_uv.bin',np.float32).reshape(-1,2),
            np.fromfile(M+p+'_idx.bin',np.uint32).reshape(-1,3).astype(np.int64))
P,UV,I=ld('body'); FP,FU,FI=ld('face'); B=json.load(open(M+'bones.json')); neck=B['Neck'][1]
def texels(Pv,Uv,Iv,tris,S):
    own=np.full((S,S),-1,np.int32)
    for t in tris: cv2.fillPoly(own,[np.round(Uv[Iv[t]]*S-0.5).astype(np.int32)],int(t))
    ys,xs=np.nonzero(own>=0); tid=own[ys,xs]
    U=Uv[Iv[tid]]*S-0.5; p=np.stack([xs,ys],1).astype(np.float32)
    v0=U[:,1]-U[:,0]; v1=U[:,2]-U[:,0]; v2=p-U[:,0]
    d00=(v0*v0).sum(1); d01=(v0*v1).sum(1); d11=(v1*v1).sum(1); d20=(v2*v0).sum(1); d21=(v2*v1).sum(1)
    den=d00*d11-d01*d01; den[np.abs(den)<1e-9]=1e-9
    b1=((d11*d20-d01*d21)/den).clip(0,1); b2=((d00*d21-d01*d20)/den).clip(0,1); b0=(1-b1-b2).clip(0,1); s=b0+b1+b2
    b=np.stack([b0/s,b1/s,b2/s],1); X=(Pv[Iv[tid]]*b[:,:,None]).sum(1)
    return ys,xs,X
# 脸部开放边界顶点
from collections import Counter
ec=Counter(); [ec.update([tuple(sorted((a,b))) for a,b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0]))]) for t in FI.tolist()]
bv=np.unique(np.array([e for e,c in ec.items() if c==1]).ravel())
# 只要贴着身体材质的边界（脸 / 兜帽交界）；脸内部的 UV 缝重复顶点、眼口开口不算
bd,_=cKDTree(P).query(FP[bv]); bv=bv[bd<0.003]; BP=FP[bv]; kdB=cKDTree(BP)
fc=FP.mean(0)
# ---- 身体：兜帽内沿平滑场
tb=cv2.imread(F+f'base_{MODE}_v2.png'); S=tb.shape[0]; lab=cv2.cvtColor(tb,cv2.COLOR_BGR2LAB).astype(np.float32)
C=P[I].mean(1); head=np.nonzero(C[:,1]>neck)[0]
ys,xs,X=texels(P,UV,I,head,S); L0=lab[ys,xs]
fd,_=cKDTree(FP).query(X); kdX=cKDTree(X[::7]); Ls=L0[::7]
# 3D 稳健中值场（半径 3 cm），只在贴脸 2.5 cm 内用
near=fd<0.025; idx=np.nonzero(near)[0]
nn=kdX.query_ball_point(X[idx],0.03)
fld=np.array([np.median(Ls[n],0) if len(n)>3 else L0[i] for i,n in zip(idx,nn)],np.float32)
w=np.clip(1-(fd[idx]-0.012)/0.013,0,1)[:,None]          # 贴脸 1.2 cm 内全换，2.5 cm 处回原图
det=(L0[idx]-fld); det[:,0]=det[:,0].clip(-6,6); det[:,1:]=0   # 只留很弱的布纹
new=L0[idx]*(1-w)+(fld+det*0.5)*w
lab2=lab.copy(); lab2[ys[idx],xs[idx]]=new.clip(0,255)
# ③ 额角 / 发际的锯齿尖三角：材质 ID 渲染确认是身体材质三角插在脸部材质里（三个顶点都与脸部顶点重合，贴在额头面上），
#    其纹素是兜帽图集色 → 近景是额头上的灰 / 暗尖块。把这些三角的纹素换成同位置额头皮肤色（脸部贴图按 3D 最近纹素取色，低频 + 弱高频）。
#    （先试过按「离脸 1–1.8 cm」选，会把帽檐前沿也染成皮肤色，弃用）
fp='face_' if MODE=='death' else 'face_life_'
tf0=cv2.imread(F+fp+'base_v2.png'); SF=tf0.shape[0]; lfb=cv2.GaussianBlur(cv2.cvtColor(tf0,cv2.COLOR_BGR2LAB).astype(np.float32),(0,0),5)
fy,fx,FX=texels(FP,FU,FI,range(len(FI)),SF); sub=slice(None,None,5); kdF=cKDTree(FX[sub]); FC=lfb[fy[sub],fx[sub]]
vd,_=cKDTree(FP).query(P); coin=vd<0.0015
spike=np.zeros(len(I),bool); spike[head]=coin[I[head]].all(1)
yt,xt,XT=texels(P,UV,I,np.nonzero(spike)[0],S)
_,fi=kdF.query(XT,k=4); skc=FC[fi].mean(1)
hfb=(lab-cv2.GaussianBlur(lab,(0,0),3))[yt,xt]; hfb[:,0]=hfb[:,0].clip(-6,6); hfb[:,1:]=0
lab2[yt,xt]=(skc+hfb*0.5).clip(0,255)
sk=np.zeros(1)
ob=cv2.cvtColor(lab2.astype(np.uint8),cv2.COLOR_LAB2BGR); cv2.imwrite(F+f'base_{MODE}_v3.png',ob)
# 同区域法线贴图压平（图集碎片里的法线细节让尖三角一明一暗），配合 build.mjs 3.5 的顶点法线平滑
nm=np.zeros((S,S),np.float32); nm[ys[idx],xs[idx]]=w[:,0]*0.85; nm=cv2.GaussianBlur(nm,(0,0),2)
tn=cv2.imread(F+f'nrm_{MODE}.png').astype(np.float32); NS=tn.shape[0]
if NS!=S: nm=cv2.resize(nm,(NS,NS))
flat=np.array([255,128,128],np.float32)   # BGR
cv2.imwrite(F+f'nrm_{MODE}_v3.png',(tn*(1-nm[...,None])+flat*nm[...,None]).clip(0,255).astype(np.uint8))
# 边界处的内衬色（给脸部过渡用）：每个脸部边界顶点取 3D 半径 2.5 cm 内身体内沿纹素中值
kdN=cKDTree(X[idx]); nb=kdN.query_ball_point(BP,0.025)
rimcol=np.array([np.median(new[n],0) if len(n)>3 else np.median(new,0) for n in nb],np.float32)
# ---- 脸部：不动（v2 脸部上沿本身没问题，问题在身体材质尖三角；先前试过把脸部边界往内衬色渐变，额头变灰、尖角仍在，弃用）
print(MODE,'脸部边界顶点',len(bv),'内沿身体纹素',len(idx),'尖三角',int(spike.sum()),'改皮肤色纹素',len(yt))
