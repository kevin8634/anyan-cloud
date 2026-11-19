# raidA 11-02 莫尔维斯首领化自发光贴图（0 积分，本地）：深渊幽魂绿 0x50f0e0 / 0x60ffd0
# python3 emi.py <cfg/morvis.py> <meshdir> <out_emi.png> [preview.jpg]
#  - 诱饵灯泡（lamp 区）整块 0x60ffd0 满亮；诱饵杆末端渐亮
#  - 发光脉络：逐像素插值 3D 坐标 → 3D 正弦叠加噪声取零等值线（脊线）→ 只落在青色鱼皮上（锁链 / 铁罐 / 骨管 / 牙齿不发光）
#  - 眼睛：头部前上方高亮像素加一点
import numpy as np,cv2,sys
cfg={};exec(open(sys.argv[1]).read(),cfg);D=sys.argv[2].rstrip('/')+'/'
P=np.fromfile(D+'pos.bin',np.float32).reshape(-1,3);U=np.fromfile(D+'uv.bin',np.float32).reshape(-1,2);I=np.fromfile(D+'idx.bin',np.uint32).reshape(-1,3)
base=cv2.imread(D+'base.png');S=base.shape[0]
R=cfg['regions'](P[:,0],P[:,1],P[:,2]);
code={'body':1,'jaw':2,'lure':3,'lamp':4,'finL':5,'finR':5,'ventL':5,'ventR':5}
rc=np.array([code[r] for r in R])
lab=np.zeros((S,S),np.uint8);X=np.zeros((S,S,3),np.float32)
UVp=U*S
for t in I:
  g=np.bincount(rc[t]).argmax();pts=UVp[t]
  x0,y0=np.floor(pts.min(0)).astype(int)-1;x1,y1=np.ceil(pts.max(0)).astype(int)+2
  x0=max(x0,0);y0=max(y0,0);x1=min(x1,S);y1=min(y1,S)
  if x1<=x0 or y1<=y0 or x1-x0>300 or y1-y0>300: continue
  yy,xx=np.mgrid[y0:y1,x0:x1].astype(np.float32)+0.5
  a,b,c=pts;v0=b-a;v1=c-a;den=v0[0]*v1[1]-v1[0]*v0[1]
  if abs(den)<1e-9: continue
  px=xx-a[0];py=yy-a[1];l1=(px*v1[1]-v1[0]*py)/den;l2=(v0[0]*py-px*v0[1])/den;l0=1-l1-l2
  m=(l0>-0.08)&(l1>-0.08)&(l2>-0.08)
  q=l0[...,None]*P[t[0]]+l1[...,None]*P[t[1]]+l2[...,None]*P[t[2]]
  lab[y0:y1,x0:x1][m]=g;X[y0:y1,x0:x1][m]=q[m]
print('labelled px',int((lab>0).sum()))
hsv=cv2.cvtColor(base,cv2.COLOR_BGR2HSV).astype(np.float32);H,Sa,V=hsv[...,0],hsv[...,1],hsv[...,2]
skin=((H>72)&(H<112)&(Sa>30)&(V>35)).astype(np.float32)          # 青 / 蓝绿鱼皮
skin=cv2.GaussianBlur(cv2.morphologyEx(skin,cv2.MORPH_OPEN,np.ones((3,3))),(0,0),1.5)
# 3D 脊线噪声
rng=np.random.default_rng(7);n=np.zeros((S,S),np.float32)
for i in range(7):
  k=rng.normal(size=3);k/=np.linalg.norm(k);f=rng.uniform(14,30);ph=rng.uniform(0,6.3)
  n+=np.sin((X@k)*f+ph)*(1/(1+i*0.25))
n2=np.zeros((S,S),np.float32)
for i in range(5):
  k=rng.normal(size=3);k/=np.linalg.norm(k);f=rng.uniform(40,70);ph=rng.uniform(0,6.3);n2+=np.sin((X@k)*f+ph)
vein=np.exp(-(n/0.13)**2)*1.0+np.exp(-((n+0.35*n2)/0.07)**2)*0.55
vein*=np.clip((n2+3)/4,0.3,1)
body=((lab==1)|(lab==2)|(lab==5)).astype(np.float32)
# 越靠后 / 越靠下越暗一点，头部与背脊更亮
zf=np.clip((X[...,2]+0.45)/0.8,0.35,1.0)
E=np.zeros((S,S),np.float32)
E+=vein*skin*body*zf*1.0
# 诱饵杆末端渐亮
lt=(lab==3).astype(np.float32)*np.clip((X[...,2]-0.36)/0.1,0,1)*0.8;E=np.maximum(E,lt)
lamp=(lab==4).astype(np.float32);E=np.maximum(E,lamp)
# 眼睛：头部前上方的亮点
eye=((lab==1)&(X[...,2]>0.26)&(X[...,2]<0.34)&(X[...,1]>0.09)&(X[...,1]<0.16)&(np.abs(X[...,0])>0.08)&(V>170)).astype(np.float32)
E=np.maximum(E,cv2.GaussianBlur(eye,(0,0),1.2)*0.9)
E=cv2.GaussianBlur(E,(0,0),0.7).clip(0,1)
c1=np.array([0xe0,0xf0,0x50],np.float32)  # BGR of 0x50f0e0（脉络）
c2=np.array([0xd0,0xff,0x60],np.float32)  # BGR of 0x60ffd0（灯）
L=np.maximum(lamp,lt)[...,None]
col=(c1*(1-L)+c2*L)*E[...,None]
# 灯泡内部保留原贴图明暗细节（避免死平）
det=(V/255.0)[...,None];col=np.where(lamp[...,None]>0,c2*(0.75+0.25*det),col)
cv2.imwrite(sys.argv[3],col.clip(0,255).astype(np.uint8))
print('emissive px >0.1:',int((E>0.1).sum()),'lamp px',int(lamp.sum()))
if len(sys.argv)>4:
  pv=(base.astype(np.float32)*0.6+col).clip(0,255).astype(np.uint8);cv2.imwrite(sys.argv[4],cv2.resize(pv,(1024,1024)))
