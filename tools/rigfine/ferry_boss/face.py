# 死渡独立 2048 脸底色 + 细节法线(K=0.6) + 眼火自发光 + 脸部三角选择
import sys; sys.path.insert(0,'/workspace/work/p93/anyan/tools/rigfine/facehd')
import ras; from ras import *
import cv2
K=0.6; S=2048
pos,uv,idx,nrm=load('/workspace/work/ferry/fh/d')
X0,X1,Y0,Y1=-0.06,0.06,0.36,0.48
tid=np.load('tid.npy'); Wr=1024; Hr=tid.shape[0]
TPL=np.float32([[192.98,239.95],[318.90,240.19],[256.0,371.0]])
A,_=cv2.estimateAffinePartial2D(np.float32([[310,465],[690,465],[510,830]]),TPL)   # 1024 窗口 -> crop512
Ai=cv2.invertAffineTransform(A)
# crop512*4 -> 窗口2048：先 /4，再 Ai，再 *2
M=np.diag([2,2,1])@np.vstack([Ai,[0,0,1]])@np.diag([0.25,0.25,1])
hi=np.load('gx4.npy').astype(np.float32)[:,:,::-1].clip(0,1)*255
hiW=cv2.warpAffine(hi,M[:2],(S,S),flags=cv2.INTER_AREA,borderMode=cv2.BORDER_REPLICATE)
emi=cv2.resize(cv2.imread('eye_emi512.png').astype(np.float32),(2048,2048),interpolation=cv2.INTER_CUBIC)
emiW=cv2.warpAffine(emi,M[:2],(S,S),flags=cv2.INTER_LINEAR)
lo=cv2.resize(cv2.imread('face_lo.png').astype(np.float32),(S,S),interpolation=cv2.INTER_CUBIC)
# 三角选择（同 comp.py）
T=pos[idx]; n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); nz=n[:,2]/(np.linalg.norm(n,axis=1)+1e-12)
P2=np.stack([(T[:,:,0]-X0)/(X1-X0)*Wr,(Y1-T[:,:,1])/(Y1-Y0)*Hr],-1)
area=0.5*np.abs((P2[:,1,0]-P2[:,0,0])*(P2[:,2,1]-P2[:,0,1])-(P2[:,2,0]-P2[:,0,0])*(P2[:,1,1]-P2[:,0,1]))
cnt=np.bincount(tid[tid>=0],minlength=len(idx))
inwin=(P2[:,:,0].min(1)>4)&(P2[:,:,0].max(1)<Wr-4)&(P2[:,:,1].min(1)>4)&(P2[:,:,1].max(1)<Hr-4)
vis=np.where(area>3,cnt/np.maximum(area,1e-6),(cnt>0)*1.0)
sel=np.nonzero(inwin&(nz>0.0)&(vis>0.6))[0]
cov=cv2.resize(np.isin(tid,sel).astype(np.uint8)*255,(S,S),interpolation=cv2.INTER_NEAREST)
# CF 有效区（crop 内 24px 边）
msk=np.zeros((2048,2048),np.float32); cv2.rectangle(msk,(96,96),(1952,1952),1,-1); msk=cv2.GaussianBlur(msk,(0,0),56)
cm=cv2.warpAffine(msk,M[:2],(S,S))
cov_e=cv2.erode(cov,np.ones((37,37),np.uint8)).astype(np.float32)/255
a=np.clip(cv2.GaussianBlur(cov_e*cm,(0,0),10)*cov_e,0,1)
# 原投影低频对齐到 HD 的色调（选区边缘回原色）；非 CF 区：原图 + 锐化
Lb=cv2.cvtColor(lo.clip(0,255).astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32); Lb[...,1]=(Lb[...,1]-128)*0.25+125; Lb[...,2]=(Lb[...,2]-128)*0.4+130; lo=cv2.cvtColor(Lb.astype(np.uint8),cv2.COLOR_LAB2BGR).astype(np.float32)
bl=cv2.GaussianBlur(lo,(0,0),4); lo_s=(lo+(lo-bl)*0.5*K).clip(0,255)
out=lo_s*(1-a[...,None])+hiW*a[...,None]
bb=cv2.GaussianBlur(out,(0,0),1.6); out=(out+(out-bb)*0.35*K).clip(0,255)
emiW*=a[...,None]
out=out*(1-0.55*np.clip(emiW.max(2,keepdims=True)/255,0,1))+emiW*0.55
covf=cv2.dilate(cov,np.ones((9,9),np.uint8))
o8=cv2.inpaint(out.clip(0,255).astype(np.uint8),255-covf,3,cv2.INPAINT_TELEA)
cv2.imwrite('face_base.png',o8); cv2.imwrite('face_emi.png',cv2.dilate(emiW.clip(0,255).astype(np.uint8),np.ones((5,5),np.uint8)))
g=cv2.cvtColor(o8,cv2.COLOR_BGR2GRAY).astype(np.float32)/255
h=(g-cv2.GaussianBlur(g,(0,0),8))+(g-cv2.GaussianBlur(g,(0,0),2))*0.6
rng=np.random.default_rng(7); nn=rng.standard_normal((S,S)).astype(np.float32); h+=(cv2.GaussianBlur(nn,(0,0),1.1)-cv2.GaussianBlur(nn,(0,0),3))*0.03
dx=cv2.Sobel(h,cv2.CV_32F,1,0,ksize=3); dy=cv2.Sobel(h,cv2.CV_32F,0,1,ksize=3); Sx=6*K
N=np.dstack([-dx*Sx,dy*Sx,np.ones_like(h)]); N/=np.linalg.norm(N,axis=2,keepdims=True)
cv2.imwrite('face_nrm.png',((N*0.5+0.5)*255).clip(0,255).astype(np.uint8)[:,:,::-1])
np.array(sel,np.uint32).tofile('face_tris.bin'); print('sel',len(sel))
cv2.imwrite('face_pv.jpg',np.hstack([cv2.resize(lo,(768,768)),cv2.resize(o8,(768,768))]))
