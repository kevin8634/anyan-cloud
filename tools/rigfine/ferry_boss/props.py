# raidA 11-02 摆渡双子附加件贴图（0 积分，程序化）：长袍下摆 1024（底色带 alpha 破边 / 法线 / 自发光）+ 船篙木纹 512
# python3 props.py <dir> death|life
import numpy as np, cv2, sys
D=sys.argv[1].rstrip('/')+'/'; MODE=sys.argv[2]; S=1024
rng=np.random.default_rng(21 if MODE=='death' else 22)
def noise(nx,ny,sig,W=S,H=S): z=cv2.resize(rng.standard_normal((ny,nx)).astype(np.float32),(W,H),interpolation=cv2.INTER_CUBIC); return cv2.GaussianBlur(z,(0,0),sig)
yy,xx=np.mgrid[0:S,0:S].astype(np.float32)/S   # u=x 绕一圈，v=y 自腰向下
# 褶皱：沿 u 的竖向条纹（频率随 v 增大，下摆散开），+ 布纹
fold=np.sin(xx*2*np.pi*14+noise(8,4,30)*2.2)*0.6+np.sin(xx*2*np.pi*31+noise(12,6,20)*3)*0.25
weave=noise(256,256,0.7)*0.25+noise(512,512,0.5)*0.15
h=fold*(0.4+0.6*yy)+weave
# 破边：底部 18% 撕成长短不一的布条
edge=0.88+0.045*np.clip(noise(48,1,3,S,1)[0],-2,2)+0.025*np.clip(noise(160,1,1,S,1)[0],-2,2)
strips=np.abs(np.sin(xx*np.pi*40+noise(20,1,6,S,1)[0]*3))
cut=edge[None,:]-0.06*(strips>0.9)
alpha=(yy<cut).astype(np.float32)
holes=(noise(40,40,3)>1.6)&(yy>0.7)   # 下摆虫蛀小洞
alpha[holes]=0
alpha=cv2.GaussianBlur(alpha,(0,0),0.8)
near=np.clip(1-(cut-yy)/0.12,0,1)*alpha    # 靠近破边
if MODE=='death':
    base=np.array([30,36,28],np.float32)   # BGR 墨绿黑
    col=base*(1+0.35*h[...,None])+np.array([10,14,6])*noise(6,6,40)[...,None]
    col=col*(1-0.35*near[...,None])+np.array([60,90,50])*0.35*near[...,None]
    runes=(np.abs(np.sin(xx*2*np.pi*9))>0.985)&(np.abs(yy-0.62)<0.06)   # 一圈符文竖刻
    em=np.clip(near**2*1.0+runes*0.6*(noise(30,4,2)>0)+np.clip(-h-0.9,0,1)*0.25*yy,0,1)
    em=cv2.GaussianBlur(em,(0,0),1.5)*alpha
    E=np.array([170,255,90],np.float32)*em[...,None]
else:
    base=np.array([176,182,186],np.float32)  # 灰白麻布
    col=base*(1+0.22*h[...,None])+np.array([6,6,6])*noise(6,6,40)[...,None]
    col=col*(1-0.25*near[...,None])+np.array([120,124,128])*0.25*near[...,None]
    em=cv2.GaussianBlur(near**3*0.35,(0,0),2)*alpha; E=np.array([235,245,255],np.float32)*em[...,None]
rgba=np.dstack([col.clip(0,255),alpha*255]).astype(np.uint8)
cv2.imwrite(D+f'robe_{MODE}_base.png',rgba); cv2.imwrite(D+f'robe_{MODE}_emi.png',E.clip(0,255).astype(np.uint8))
dx=cv2.Sobel(h,cv2.CV_32F,1,0,ksize=3); dy=cv2.Sobel(h,cv2.CV_32F,0,1,ksize=3)
N=np.dstack([-dx*0.25,dy*0.25,np.ones_like(h)]); N/=np.linalg.norm(N,axis=2,keepdims=True)
cv2.imwrite(D+f'robe_nrm.png',((N*0.5+0.5)*255).clip(0,255).astype(np.uint8)[:,:,::-1])
# 船篙木纹 512（u 绕杆，v 沿杆）：深褐湿木 + 纵向纹理 + 铁箍位置留给几何
W=512; gy,gx=np.mgrid[0:W,0:W].astype(np.float32)/W
g=np.sin(gx*2*np.pi*6+noise(6,40,8,W,W)*4)*0.5+noise(64,256,0.8,W,W)*0.5
wood=(np.array([28,40,58],np.float32) if MODE=='death' else np.array([60,74,92],np.float32))*(1+0.3*g[...,None])
cv2.imwrite(D+f'pole_{MODE}_base.png',wood.clip(0,255).astype(np.uint8))
dx=cv2.Sobel(g,cv2.CV_32F,1,0,ksize=3); N=np.dstack([-dx*0.3,np.zeros_like(g),np.ones_like(g)]); N/=np.linalg.norm(N,axis=2,keepdims=True)
cv2.imwrite(D+'pole_nrm.png',((N*0.5+0.5)*255).astype(np.uint8)[:,:,::-1])
print(MODE,'ok alpha',float(alpha.mean()))
