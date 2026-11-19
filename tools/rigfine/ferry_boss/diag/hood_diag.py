import numpy as np,cv2,json,sys
D=sys.argv[1]+'/'
P=np.fromfile(D+'body_pos.bin',np.float32).reshape(-1,3); UV=np.fromfile(D+'body_uv.bin',np.float32).reshape(-1,2); I=np.fromfile(D+'body_idx.bin',np.uint32).reshape(-1,3)
B=json.load(open(D+'bones.json')); tex=cv2.imread(D+'body_base.png'); S=tex.shape[0]
neck=B['Neck'][1]; head=B['Head']
c=P[I].mean(1); hsel=np.nonzero(c[:,1]>neck-0.01)[0]
print('neck y',neck,'head',head,'head tris',len(hsel))
# per-tri mean colour
uvc=UV[I[hsel]].mean(1); px=(uvc[:,0]*S).astype(int).clip(0,S-1); py=(uvc[:,1]*S).astype(int).clip(0,S-1)
col=tex[py,px].astype(np.float32); lum=col.mean(1)
# 3D 邻域稳健中值
from scipy.spatial import cKDTree
t=cKDTree(c[hsel]); nb=t.query_ball_point(c[hsel],0.035)
med=np.array([np.median(lum[n]) for n in nb]); dev=lum-med
bad=np.abs(dev)>28
print('lum med',np.median(lum),'outliers',bad.sum(),'dark',(dev<-28).sum(),'light',(dev>28).sum())
# 3 views scatter
W=600; img=np.full((W,W*3,3),40,np.uint8)
cc=c[hsel]; ctr=cc.mean(0); sc=W/0.34
for k,(ax,sgn) in enumerate([(0,1),(2,1),(0,-1)]):
  for i in np.argsort(cc[:,2]*(1 if k!=2 else -1) if k!=1 else cc[:,0]):
    x=int(W/2+sgn*(cc[i,ax]-ctr[ax])*sc)+k*W; y=int(W/2-(cc[i,1]-ctr[1])*sc)
    cv2.circle(img,(x,y),3,tuple(int(v) for v in col[i]),-1)
    if bad[i]: cv2.circle(img,(x,y),4,(0,0,255) if dev[i]<0 else (255,0,255),1)
cv2.imwrite(D+'diag_hood_scatter.jpg',img)
# atlas with head triangles
at=tex.copy()
for tri in I[hsel]:
  pts=(UV[tri]*S).astype(np.int32); cv2.polylines(at,[pts],True,(0,255,255),1)
for tri in I[hsel][bad]:
  pts=(UV[tri]*S).astype(np.int32); cv2.fillPoly(at,[pts],(0,0,255))
cv2.imwrite(D+'diag_hood_atlas.jpg',cv2.resize(at,(1024,1024)))
