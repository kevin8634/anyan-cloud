# raidA 11-02 v2（Rhett 第 3 条「兜帽露黑」）：重选脸部独立贴图的三角形 + 补脸部贴图（0 积分，不重跑 CodeFormer / 超分）
# python3 facesel.py <F>
# 诊断：v1 的脸部选区（face.py：窗口内正面可见三角）把 637 个兜帽前沿 / 侧面三角也划进了脸部材质，
#       脸部贴图在这些位置是正面投影的暗色 + inpaint 拖影 → 兜帽内沿、两侧大块发黑（hood_l / hood_r 机位最明显）；
#       额头发际处选区呈锯齿，锯齿缝里是 Lux3D 图集碎片 → 额角碎片。
# 做法：用原图集亮度分出真皮肤，闭运算 + 模糊阈值得到平滑的脸部椭圆（眼窝、鼻孔填进来），
#       新选区 = 窗口内可见三角 ∩ 脸部椭圆（发际线成平滑曲线，兜帽三角回到身体材质，由 hood.py 统一重绘）；
#       新加入的发际三角在脸部贴图里只用皮肤像素 inpaint 补色（死渡 / 生渡 底色、法线、自发光都补）。
# 输出：F/fh/face_tris_v2.bin；F/face_{base,nrm,emi}_v2.png、F/face_life_{base,nrm,emi}_v2.png（build.mjs 优先读 _v2）；F/v2/facesel_v2.jpg
import numpy as np, cv2, sys, os
from scipy.spatial import cKDTree
F=sys.argv[1].rstrip('/')+'/'; os.makedirs(F+'v2',exist_ok=True)
pos=np.fromfile(F+'fh/d.position',np.float32).reshape(-1,3); uv=np.fromfile(F+'fh/d.texcoord_0',np.float32).reshape(-1,2); idx=np.fromfile(F+'fh/d.idx',np.uint32).reshape(-1,3).astype(np.int64)
sel=np.fromfile(F+'fh/face_tris.bin',np.uint32).astype(np.int64); tid=np.load(F+'fh/tid.npy')
X0,X1,Y0,Y1=-0.06,0.06,0.36,0.48; S=2048; Wr=tid.shape[1]; Hr=tid.shape[0]
# 1. 原图集亮度（每三角）
tex=cv2.imread(F+'base_hd.png'); TS=tex.shape[0]; Lt=cv2.cvtColor(tex,cv2.COLOR_BGR2LAB)[...,0].astype(np.float32)
own=np.full((TS,TS),-1,np.int32)
for t in sel: cv2.fillPoly(own,[np.round(uv[idx[t]]*TS-0.5).astype(np.int32)],int(t))
ys,xs=np.nonzero(own>=0); tt=own[ys,xs]; cnt=np.bincount(tt,minlength=len(idx)); lum=np.bincount(tt,Lt[ys,xs],minlength=len(idx))/np.maximum(cnt,1)
P2=lambda t: np.stack([(pos[idx[t]][...,0]-X0)/(X1-X0)*S,(Y1-pos[idx[t]][...,1])/(Y1-Y0)*S],-1)
# 2. 皮肤掩码 → 平滑脸部椭圆：直接用 v1 脸部贴图（同一正面投影窗口）的亮度分皮肤 / 兜帽，闭运算填眼窝鼻孔
fb=cv2.imread(F+'face_base.png'); Lf=cv2.cvtColor(fb,cv2.COLOR_BGR2LAB)[...,0]
skin=((cv2.GaussianBlur(Lf,(0,0),3)>105)*255).astype(np.uint8)
n,lab,st,_=cv2.connectedComponentsWithStats(skin); skin=((lab==1+np.argmax(st[1:,4]))*255).astype(np.uint8)
skin=cv2.morphologyEx(skin,cv2.MORPH_OPEN,np.ones((15,15),np.uint8))   # 去掉兜帽上的亮细线
n,lab,st,_=cv2.connectedComponentsWithStats(skin); skin=((lab==1+np.argmax(st[1:,4]))*255).astype(np.uint8)
hull=cv2.convexHull(cv2.findNonZero(skin)); m=np.zeros((S,S),np.uint8); cv2.fillPoly(m,[hull],255)   # 脸在正面投影里近似凸：凸包含眼窝、发际线平滑
m=cv2.dilate(m,np.ones((int(os.environ.get('FACE_GROW',13)),)*2,np.uint8))   # 略外扩：发际处兜帽内沿的锯齿三角并进脸部（贴图用皮肤补色）
# 3. 新选区：窗口内正面可见（同 face.py 判据）且三个顶点都在脸部椭圆里
T=pos[idx]; nrm=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); nz=nrm[:,2]/(np.linalg.norm(nrm,axis=1)+1e-12)
Q=np.stack([(T[:,:,0]-X0)/(X1-X0)*Wr,(Y1-T[:,:,1])/(Y1-Y0)*Hr],-1)
area=0.5*np.abs((Q[:,1,0]-Q[:,0,0])*(Q[:,2,1]-Q[:,0,1])-(Q[:,2,0]-Q[:,0,0])*(Q[:,1,1]-Q[:,0,1]))
vc=np.bincount(tid[tid>=0],minlength=len(idx)); vis=np.where(area>3,vc/np.maximum(area,1e-6),(vc>0)*1.0)
inwin=(Q[:,:,0].min(1)>4)&(Q[:,:,0].max(1)<Wr-4)&(Q[:,:,1].min(1)>4)&(Q[:,:,1].max(1)<Hr-4)
Qc=(Q.mean(1)*S/Wr).round().astype(int).clip(0,S-1); inside=m[Qc[:,1],Qc[:,0]]>0   # 重心在脸部凸包内
new=np.nonzero(inwin&(nz>0.0)&(vis>0.3)&inside)[0]
old=set(sel.tolist()); add=[t for t in new if t not in old]; drop=[t for t in sel if t not in set(new.tolist())]
np.array(new,np.uint32).tofile(F+'fh/face_tris_v2.bin')
print('脸部三角 v1',len(sel),'→ v2',len(new),'新增(发际)',len(add),'移出(兜帽)',len(drop))
# 4. 脸部贴图补色：v2 覆盖区里，凡不是 v1 真皮肤覆盖的像素，用皮肤像素 inpaint
cov2=np.zeros((S,S),np.uint8)
for t in new: cv2.fillPoly(cov2,[np.round(P2(t)).astype(np.int32)],255)
# 只补贴近脸部轮廓（凸包边 70 px 内）的非皮肤像素 = 发际 / 兜帽内沿投影进来的暗色；眼窝、眉、鼻孔、嘴离轮廓远，不动
band=(cv2.distanceTransform(m,cv2.DIST_L2,5)<int(os.environ.get('FACE_BAND',70))).astype(np.uint8)*255
fill=cv2.dilate(cov2,np.ones((13,13),np.uint8))&(255-cv2.erode(skin,np.ones((5,5),np.uint8)))&band
for pre in ['face_','face_life_']:
    for kind in ['base','nrm','emi']:
        src=F+pre+kind+'.png'
        if not os.path.exists(src): continue
        im=cv2.imread(src)
        if kind=='emi': o=im.copy(); o[fill>0]=0
        else: o=cv2.inpaint(im,fill,9,cv2.INPAINT_TELEA)
        cv2.imwrite(F+pre+kind+'_v2.png',o)
# 预览
pv=np.full((S,S,3),40,np.uint8); sd,sn,sa=set(drop),set(new.tolist()),set(add)
for t in np.argsort(T[:,:,2].mean(1)):
    if not inwin[t] or nz[t]<=0 or vis[t]<=0.3: continue
    q=np.round(P2(t)).astype(np.int32); c=(60,60,200) if t in sd else (200,200,200) if t in sn else (90,90,90)
    if t in sa: c=(80,200,80)
    cv2.fillPoly(pv,[q],c)
cv2.polylines(pv,cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],True,(0,255,255),3)
b=cv2.imread(F+'face_base.png'); b2=cv2.imread(F+'face_base_v2.png')
cv2.imwrite(F+'v2/facesel_v2.jpg',np.hstack([cv2.resize(pv,(700,700)),cv2.resize(b,(700,700)),cv2.resize(b2,(700,700))]))
