# raidA 11-02 摆渡死渡/生渡身体贴图首领化（0 积分）
# python3 skin.py <dir> death|life   需 dir/base_hd.png h.npy nrm_bake.png（2048）
# death：深渊幽魂绿（皮肤灰绿、发光脉络、外套缝线 / 下摆符文渗光）；life：白灰版（外套漂白成灰白麻布、皮肤苍白、暖白微光）
import numpy as np, cv2, sys
D=sys.argv[1].rstrip('/')+'/'; MODE=sys.argv[2]; S=2048; K=0.6
b=cv2.imread(D+'base_hd.png').astype(np.float32); h=np.load(D+'h.npy'); nb=cv2.imread(D+'nrm_bake.png').astype(np.float32)
hsv=cv2.cvtColor(b.astype(np.uint8),cv2.COLOR_BGR2HSV).astype(np.float32)
lum=hsv[...,2]/255; sat=hsv[...,1]/255
skin=np.clip((lum-0.5)/0.15,0,1)*np.clip((0.35-sat)/0.15,0,1); skin=cv2.GaussianBlur(skin,(0,0),3)   # 苍白皮肤
cloth=np.clip((0.42-lum)/0.12,0,1)*(1-skin)
rng=np.random.default_rng(3)
def noise(n,sig): z=cv2.resize(rng.standard_normal((n,n)).astype(np.float32),(S,S),interpolation=cv2.INTER_CUBIC); return cv2.GaussianBlur(z,(0,0),sig)
# 脉络：多尺度噪声的零等值线
v=np.zeros((S,S),np.float32)
for n,w in [(24,1),(48,0.6)]:
    z=noise(n,2); v=np.maximum(v,np.clip(1-np.abs(z)/0.05,0,1)*w)
v=cv2.GaussianBlur(v,(0,0),1.0)*skin*np.clip(noise(10,4)*1.5+0.4,0,1)
# 布料：缝线 / 褶皱暗缝渗光（比周围暗的细线）
g=cv2.cvtColor(b.astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)
crev=np.clip((cv2.GaussianBlur(g,(0,0),5)-g-4)/16,0,1)*cloth*np.clip(noise(12,5)*1.2+0.3,0,1)
nm=nb/255*2-1
dx=cv2.Sobel(h,cv2.CV_32F,1,0,ksize=3); dy=cv2.Sobel(h,cv2.CV_32F,0,1,ksize=3)
dn=np.dstack([-dx*0.4,dy*0.4,np.zeros_like(h)])     # 细节法线 ×0.4（同戈尔顿身体）
# 文件是 BGR：通道 2=R(x) 1=G(y) 0=B(z)
n2=np.dstack([nm[...,2]+dn[...,0],nm[...,1]+dn[...,1],nm[...,0]]); n2/=np.linalg.norm(n2,axis=2,keepdims=True)
cv2.imwrite(D+f'nrm_{MODE}.png',((n2*0.5+0.5)*255).clip(0,255).astype(np.uint8)[:,:,::-1])
if MODE=='death':
    GC=np.array([170,255,90],np.float32)   # BGR 幽魂绿 0x5affaa 一带（副本主色 0x50f0e0/0x60ffd0）
    o=b.copy()
    gray=g[...,None]
    o=o*(1-0.35*skin[...,None])+(gray*np.array([0.92,1.0,0.86]))*0.35*skin[...,None]   # 皮肤去血色偏灰绿
    o=o*(1-0.18*cloth[...,None])+ (o*np.array([1.05,1.08,0.85]))*0.18*cloth[...,None]
    em=np.clip(v*0.45+crev*1.1,0,1)
    o=o*(1-0.25*em[...,None])+GC*0.25*em[...,None]
    E=GC*em[...,None]
else:
    GC=np.array([235,245,255],np.float32)
    L=cv2.cvtColor(b.astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32)
    L[...,0]=np.clip(L[...,0]*0.55+120,0,255)*(1-skin)+np.clip(L[...,0]*1.05+12,0,255)*skin   # 布料漂成灰白麻布，皮肤更白
    L[...,1]=128+(L[...,1]-128)*0.15; L[...,2]=128+(L[...,2]-128)*0.15+2
    o=cv2.cvtColor(L.clip(0,255).astype(np.uint8),cv2.COLOR_LAB2BGR).astype(np.float32)
    o=o*(1-0.5*crev[...,None])+o*0.75*0.5*crev[...,None]   # 布缝稍深
    em=np.clip(v*0.6,0,1); E=GC*em[...,None]*0.7
cv2.imwrite(D+f'base_{MODE}.png',o.clip(0,255).astype(np.uint8))
cv2.imwrite(D+f'emi_{MODE}.png',cv2.resize(E.clip(0,255).astype(np.uint8),(1024,1024),interpolation=cv2.INTER_AREA))
cv2.imwrite(D+f'pv_{MODE}.jpg',cv2.resize(np.hstack([b,o,E]),(1536,512)).clip(0,255).astype(np.uint8))
print(MODE,'ok skin',float(skin.mean()),'emi',float(em.mean()))
