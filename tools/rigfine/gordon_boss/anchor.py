# 锚贴图：hd.py 输出的底色/高度 → 法线 + 锈缝幽魂绿自发光（0 积分）
import numpy as np, cv2, sys
D=sys.argv[1].rstrip('/')+'/'
b=cv2.imread(D+'anchor_base_hd.png').astype(np.float32); h=np.load(D+'anchor_h.npy'); S=b.shape[0]
dx=cv2.Sobel(h,cv2.CV_32F,1,0,ksize=3); dy=cv2.Sobel(h,cv2.CV_32F,0,1,ksize=3)
N=np.dstack([-dx,dy,np.ones_like(h)]); N/=np.linalg.norm(N,axis=2,keepdims=True)
cv2.imwrite(D+'anchor_nrm.png',((N*0.5+0.5)*255).clip(0,255).astype(np.uint8)[:,:,::-1])
g=cv2.cvtColor(b.astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)
crev=np.clip((cv2.GaussianBlur(g,(0,0),6)-g-6)/25,0,1)   # 比周围暗 = 锈缝
r=np.random.default_rng(5); n=cv2.resize(r.standard_normal((8,8)).astype(np.float32),(S,S),interpolation=cv2.INTER_CUBIC)
em=crev*np.clip(n*0.8+0.6,0,1); em=cv2.GaussianBlur(em,(0,0),1.2)
GC=np.array([170,255,90],np.float32)
cv2.imwrite(D+'anchor_emi.png',(GC*em[...,None]*0.9).clip(0,255).astype(np.uint8))
cv2.imwrite(D+'anchor_base_hd.png',(b*(1-0.2*em[...,None])+GC*0.2*em[...,None]).clip(0,255).astype(np.uint8))
print('ok', float(em.mean()))
