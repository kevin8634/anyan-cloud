import sys,json,numpy as np,cv2;sys.path.insert(0,'/workspace/work/p73/tools/rigfine/facehd')
from ras import render
c=sys.argv[1];pre=f'std/w/{c}'
f=lambda n,k:np.fromfile(f'{pre}_{n}.f32',np.float32).reshape(-1,k)
P=f('pos_new',3);idx=np.fromfile(f'{pre}_idx.u32',np.uint32).reshape(-1,3)
x0,x1,y0,y1=json.load(open(f'{pre}_rect.json'))['rect']
_,tid,zb,_=render(P,np.zeros((len(P),2),np.float32),idx,np.zeros((2,2,3),np.float32),x0,x1,y0,y1,512)
T=P[idx];fn=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]);fn/=np.linalg.norm(fn,axis=1,keepdims=True)+1e-12
L=np.array([0.3,0.5,0.8]);L/=np.linalg.norm(L)
sh=np.where(tid>=0,np.clip(fn[np.maximum(tid,0)]@L,0,1),0)
im=cv2.resize((sh*230).astype(np.uint8),(512,512));im=cv2.cvtColor(im,cv2.COLOR_GRAY2BGR)
fr=cv2.resize(cv2.imread(f'{pre}_front_new.png'),(512,512))
out=np.hstack([im,cv2.addWeighted(im,0.5,fr,0.5,0)])
for k in range(0,512,32):
  col=(0,255,255) if k%128==0 else (255,160,0)
  cv2.line(out,(0,k),(1023,k),col,1);cv2.line(out,(k,0),(k,511),col,1);cv2.line(out,(512+k,0),(512+k,511),col,1)
cv2.imwrite(f'/tmp/{c}_geo.jpg',out)
