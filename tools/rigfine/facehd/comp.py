from ras import *
import cv2, json
from PIL import ImageFilter
pos,uv,idx,nrm=load()
X0,X1,Y0,Y1=-0.052,0.054,0.335,0.465   # 新脸部窗口（模型坐标）
TW=TH=1024
tex=np.asarray(Image.open(D+'d_base.png').convert('RGB')).astype(np.float32)
# 用 1024 方贴图，窗口非等比映射：先按等比渲染再缩放
Wr=1024; img,tid,zb,_=render(pos,uv,idx,tex,X0,X1,Y0,Y1,Wr); Hr=img.shape[0]
lo=cv2.resize(img,(TW,TH),interpolation=cv2.INTER_AREA)
# 选三角：可见比例 + 朝前
T=pos[idx]; n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); nl=np.linalg.norm(n,axis=1)+1e-12; nz=n[:,2]/nl
P2=np.stack([(T[:,:,0]-X0)/(X1-X0)*Wr,(Y1-T[:,:,1])/(Y1-Y0)*Hr],-1)
area=0.5*np.abs((P2[:,1,0]-P2[:,0,0])*(P2[:,2,1]-P2[:,0,1])-(P2[:,2,0]-P2[:,0,0])*(P2[:,1,1]-P2[:,0,1]))
cnt=np.bincount(tid[tid>=0],minlength=len(idx))
inwin=(P2[:,:,0].min(1)>4)&(P2[:,:,0].max(1)<Wr-4)&(P2[:,:,1].min(1)>4)&(P2[:,:,1].max(1)<Hr-4)
vis=np.where(area>3,cnt/np.maximum(area,1e-6),(cnt>0)*1.0)
sel=np.nonzero(inwin&(nz>0.12)&(vis>0.8))[0]
# 连通性清理：去掉被选中但几乎被隔离的碎片——保留选择区域内像素
selmask=np.isin(tid,sel)
print('选中三角', len(sel))
# 高清图回贴到窗口
A=np.load(D+'A.npy')        # 渲染窗口(1024 宽, 旧窗口)->crop512
OX0,OX1,OY0,OY1=-0.064,0.066,0.335,0.465
# 新窗口像素 (TW,TH) -> 模型坐标 -> 旧窗口像素(1024) -> crop512 -> x4
sx=(X1-X0)/TW*1024/(OX1-OX0); sy=(Y1-Y0)/TH*1024/(OY1-OY0)
ox=(X0-OX0)/(OX1-OX0)*1024; oy=(OY1-Y1)/(OY1-OY0)*1024
Mw=np.array([[sx,0,ox],[0,sy,oy],[0,0,1]])
A3=np.vstack([A,[0,0,1]]); M=(np.diag([4,4,1])@A3@Mw)[:2]
hi=cv2.warpAffine(cv2.imread(D+'r_fix_x4.png'),M,(TW,TH),flags=cv2.INTER_AREA|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REPLICATE)[:,:,::-1].astype(np.float32)
msk=np.zeros((512,512),np.float32); cv2.rectangle(msk,(24,24),(488,488),1,-1); msk=cv2.GaussianBlur(msk,(0,0),14)
cm=cv2.warpAffine(msk,(A3@Mw)[:2],(TW,TH),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP)
cov=cv2.resize(selmask.astype(np.uint8)*255,(TW,TH),interpolation=cv2.INTER_NEAREST)
cov_e=cv2.erode(cov,np.ones((19,19),np.uint8)).astype(np.float32)/255
a=cv2.GaussianBlur(cov_e*cm,(0,0),5)*cov_e
a=np.clip(a,0,1)
# 颜色对位：均值对齐到原图，标准差折中
m=a>0.6
for k in range(3):
    L=lo[...,k][m]; Hh=hi[...,k][m]; hi[...,k]=(hi[...,k]-Hh.mean())/Hh.std()*(L.std()*0.35+Hh.std()*0.65)+L.mean()
hi=hi.clip(0,255)
out=lo*(1-a[...,None])+hi*a[...,None]
# 选区外膨胀填充（mip 防渗色）
covf=cv2.dilate(cov,np.ones((5,5),np.uint8))
o8=out.clip(0,255).astype(np.uint8); o8=cv2.inpaint(o8[:,:,::-1],(255-covf),3,cv2.INPAINT_TELEA)[:,:,::-1]
Image.fromarray(o8).save(D+'face_tex.png')
Image.fromarray(np.hstack([lo.clip(0,255).astype(np.uint8),o8])).resize((1024,512)).save(D+'face_tex_pv.jpg')
np.array(sel,np.uint32).tofile(D+'face_tris.bin'); json.dump([X0,X1,Y0,Y1],open(D+'face_rect.json','w'))
