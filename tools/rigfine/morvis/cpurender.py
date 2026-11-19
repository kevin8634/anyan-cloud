# CPU 透视渲染（画家算法 + 每三角取贴图色 + 自发光叠加），浏览器被占用时出 GIF / 对照图用
# python3 cpurender.py <evaldir> <clip|rest> <outdir> [size=420] [az=0.8] [el=0.18] [dist=2.9]
import numpy as np,cv2,json,sys,os
D=sys.argv[1].rstrip('/')+'/';clip=sys.argv[2];O=sys.argv[3];os.makedirs(O,exist_ok=True)
S=int(sys.argv[4]) if len(sys.argv)>4 else 420;az=float(sys.argv[5]) if len(sys.argv)>5 else 0.8;el=float(sys.argv[6]) if len(sys.argv)>6 else 0.18;dist=float(sys.argv[7]) if len(sys.argv)>7 else 2.55
SS=2 # 超采样
U=np.fromfile(D+'mesh/uv.bin',np.float32).reshape(-1,2);I=np.fromfile(D+'mesh/idx.bin',np.uint32).reshape(-1,3).astype(np.int64)
base=cv2.imread(D+'mesh/base.png').astype(np.float32);T=base.shape[0]
emi=cv2.imread(D+'mesh/emi.png').astype(np.float32) if os.path.exists(D+'mesh/emi.png') else np.zeros_like(base)
n=len(U)
if clip=='rest': F=np.fromfile(D+'mesh/pos.bin',np.float32).reshape(1,n,3);label='rest'
else:
  meta=json.load(open(D+'clips.json'));F=np.fromfile(D+clip+'.bin',np.float32).reshape(-1,n,3);label=meta['clips'][clip]['label']
# 每三角颜色：三顶点 + 质心 UV 采样平均
def samp(img,uv): return img[np.clip((uv[...,1]*T).astype(int),0,T-1),np.clip((uv[...,0]*T).astype(int),0,T-1)]
uvt=U[I];cen=uvt.mean(1)
col=(samp(base,cen)*2+samp(base,uvt[:,0])+samp(base,uvt[:,1])+samp(base,uvt[:,2]))/5
ecol=(samp(emi,cen)*2+samp(emi,uvt[:,0])+samp(emi,uvt[:,1])+samp(emi,uvt[:,2]))/5
tgt=np.array([0,0.07,0.06]);eye=tgt+dist*np.array([np.cos(el)*np.sin(az),np.sin(el),np.cos(el)*np.cos(az)])
fw=(tgt-eye);fw/=np.linalg.norm(fw);rt=np.cross(fw,[0,1,0]);rt/=np.linalg.norm(rt);up=np.cross(rt,fw)
f=1/np.tan(np.radians(32)/2);R=S*SS
def proj(X):
  d=X-eye;x=d@rt;y=d@up;z=d@fw;return np.stack([(x/z*f*0.5+0.5)*R,(0.5-y/z*f*0.5)*R],-1),z
L1=np.array([2,4,3.]);L1/=np.linalg.norm(L1);L2=np.array([-3,1,-2.]);L2/=np.linalg.norm(L2)
# 地面圆盘
th=np.linspace(0,2*np.pi,96);disc=np.stack([1.6*np.cos(th),np.full_like(th,-0.364),1.6*np.sin(th)],1)
def srgb(c): return c
for fi,X in enumerate(F):
  img=np.zeros((R,R,3),np.float32);img[:]=(0x1c,0x18,0x10)
  dp,_=proj(disc);cv2.fillPoly(img,[np.round(dp*16).astype(np.int32)],(0x2e,0x2a,0x1d),cv2.LINE_AA,4)
  for rr in (0.5,1.0,1.5):
    rp,_=proj(np.stack([rr*np.cos(th),np.full_like(th,-0.362),rr*np.sin(th)],1));cv2.polylines(img,[np.round(rp*16).astype(np.int32)],True,(0x4a,0x4a,0x2f),SS,cv2.LINE_AA,4)
  # 投影阴影（顶点压到地面）
  sh=X.copy();sh[:,1]=-0.363;sp,_=proj(sh);
  a=X[I[:,0]];b=X[I[:,1]];c=X[I[:,2]];nr=np.cross(b-a,c-a);nr/=np.linalg.norm(nr,axis=1,keepdims=True)+1e-12
  shm=np.zeros((R,R),np.uint8);[cv2.fillConvexPoly(shm,np.round(sp[t]*4).astype(np.int32),255,cv2.LINE_8,2) for t in I[::3]]
  shm=cv2.GaussianBlur(shm,(0,0),3*SS).astype(np.float32)/255;img*=1-0.55*shm[...,None]
  P2,z=proj(X);zt=z[I].mean(1);order=np.argsort(-zt)
  vd=(eye-(a+b+c)/3);vd/=np.linalg.norm(vd,axis=1,keepdims=True);ns=np.where(((nr*vd).sum(1)<0)[:,None],-nr,nr)
  lit=0.3+0.8*np.clip(ns@L1,0,1)+0.2*np.clip(ns@L2,0,1)
  hemi=0.25*(ns[:,1]*0.5+0.5)
  cc=col*(lit+hemi)[:,None]*0.85+ecol*1.2;cc=np.clip(cc,0,255)
  pts=np.round(P2[I]*4).astype(np.int32)
  for t in order: cv2.fillConvexPoly(img,pts[t],cc[t].tolist(),cv2.LINE_AA,2)
  out=cv2.resize(img,(S,S),interpolation=cv2.INTER_AREA)
  # 自发光泛光
  g=cv2.resize(np.clip(out-170,0,255),(S//4,S//4));g=cv2.GaussianBlur(g,(0,0),3);out=np.clip(out+cv2.resize(g,(S,S))*0.6,0,255)
  out=out.astype(np.uint8)
  cv2.putText(out,clip,(8,20),cv2.FONT_HERSHEY_SIMPLEX,0.55,(220,240,180),1,cv2.LINE_AA)
  cv2.imwrite(f'{O}/f{fi:03d}.png',out)
print(clip,len(F),'frames →',O)
