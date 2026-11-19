# 戈尔顿脸部 v4：2048 脸部底色（ESRGAN x4 → 2048）+ 细节法线（高频 + 毛孔）
import numpy as np, cv2, sys, os
K=float(os.environ.get('K','1'))   # 锐化/法线强度系数（标准：0.6）
TAG=os.environ.get('TAG','v4')
D='/workspace/work/gordon_v4/'
lo=cv2.imread(D+'face_v3.png').astype(np.float32)
x4=np.load(D+'face_x4.npy').astype(np.float32)[:,:,::-1]*255   # RGB->BGR
hi=cv2.resize(x4.clip(0,255),(2048,2048),interpolation=cv2.INTER_AREA)
# 颜色对齐到 v3（逐通道均值/方差，低频取 v3，高频取超分）
lo2=cv2.resize(lo,(2048,2048),interpolation=cv2.INTER_CUBIC)
blo=cv2.GaussianBlur(lo2,(0,0),6); bhi=cv2.GaussianBlur(hi,(0,0),6)
base=blo+(hi-bhi)*(1+0.15*K)
# 轻度锐化（眼周更强）
yy,xx=np.mgrid[0:2048,0:2048].astype(np.float32)
w=np.zeros((2048,2048),np.float32)
for ex,ey in [(670,600),(1360,588)]:
    r=np.sqrt(((xx-ex)/260)**2+((yy-ey)/120)**2); w=np.maximum(w,np.clip(1.2-r,0,1))
bb=cv2.GaussianBlur(base,(0,0),1.6)
base=base+(base-bb)*((0.35+0.55*w)*K)[...,None]
base=base.clip(0,255)
cv2.imwrite(D+f'face_{TAG}_base.png',base.astype(np.uint8))
# 细节法线：亮度高频当高度 + 细毛孔噪声
g=cv2.cvtColor(base.astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)/255
h=(g-cv2.GaussianBlur(g,(0,0),8))*1.0+(g-cv2.GaussianBlur(g,(0,0),2))*0.6
rng=np.random.default_rng(7); n=rng.standard_normal((2048,2048)).astype(np.float32)
pore=cv2.GaussianBlur(n,(0,0),1.1)-cv2.GaussianBlur(n,(0,0),3.0)
# 胡须区（低饱和灰）少加毛孔
hsv=cv2.cvtColor(base.astype(np.uint8),cv2.COLOR_BGR2HSV).astype(np.float32)
skin=np.clip((hsv[...,1]-40)/50,0,1); skin=cv2.GaussianBlur(skin,(0,0),6)
h=h+pore*0.035*skin
S=float(sys.argv[1]) if len(sys.argv)>1 else 6.0*K
dx=cv2.Sobel(h,cv2.CV_32F,1,0,ksize=3); dy=cv2.Sobel(h,cv2.CV_32F,0,1,ksize=3)
N=np.dstack([-dx*S,dy*S,np.ones_like(h)]); N/=np.linalg.norm(N,axis=2,keepdims=True)
nm=((N*0.5+0.5)*255).clip(0,255).astype(np.uint8)
cv2.imwrite(D+f'face_{TAG}_nrm.png',nm[:,:,::-1])   # RGB 写成 BGR 文件
cv2.imwrite(D+f'face_{TAG}_pv.jpg',np.hstack([cv2.resize(lo2,(1024,1024)),cv2.resize(base,(1024,1024))])[200:700])
print('ok')
