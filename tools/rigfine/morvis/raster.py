# 软光栅正交视图（不占浏览器）：python3 raster.py <meshdir> <out.png> [regions.npy]
import numpy as np,cv2,sys
D=sys.argv[1].rstrip('/')+'/'
P=np.fromfile(D+'pos.bin',np.float32).reshape(-1,3);U=np.fromfile(D+'uv.bin',np.float32).reshape(-1,2);I=np.fromfile(D+'idx.bin',np.uint32).reshape(-1,3)
T=cv2.imread(D+'base.png');S=T.shape[0]
lab=np.load(sys.argv[3]) if len(sys.argv)>3 else None
pal=np.array([[60,60,230],[60,200,60],[230,90,40],[40,200,230],[200,60,200],[230,200,40],[120,120,120],[255,150,150],[150,255,150],[150,150,255],[90,40,140],[20,120,200],[200,120,20],[255,255,255],[0,90,0],[90,0,0]],np.uint8)
def view(ax_h,ax_v,ax_d,sh,sv,sd,R=600):
  X=P[:,ax_h]*sh;Y=P[:,ax_v]*sv;Z=P[:,ax_d]*sd
  px=((X+0.55)/1.1*R);py=((0.55-Y)/1.1*R)
  img=np.full((R,R,3),40,np.uint8);zb=np.full((R,R),-9.0)
  n=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]]);n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-12
  L=np.zeros(3);L[ax_d]=sd;L[ax_v]+=0.6*sv;L/=np.linalg.norm(L);sh_=0.35+0.65*np.abs(n@L)
  for t,(a,b,c) in enumerate(I):
    xs=px[[a,b,c]];ys=py[[a,b,c]];x0,x1=int(xs.min()),int(xs.max())+1;y0,y1=int(ys.min()),int(ys.max())+1
    if x1-x0>60 or y1-y0>60: continue
    yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+0.5;yy=yy+0.5
    d=(xs[1]-xs[0])*(ys[2]-ys[0])-(xs[2]-xs[0])*(ys[1]-ys[0])
    if abs(d)<1e-9: continue
    l1=((xx-xs[0])*(ys[2]-ys[0])-(xs[2]-xs[0])*(yy-ys[0]))/d;l2=((xs[1]-xs[0])*(yy-ys[0])-(xx-xs[0])*(ys[1]-ys[0]))/d;l0=1-l1-l2
    m=(l0>=-0.01)&(l1>=-0.01)&(l2>=-0.01)&(xx<R)&(yy<R)&(xx>=0)&(yy>=0)
    if not m.any(): continue
    z=l0*Z[a]+l1*Z[b]+l2*Z[c];iy=yy[m].astype(int);ix=xx[m].astype(int);z=z[m]
    w=z>zb[iy,ix];iy,ix,z=iy[w],ix[w],z[w];zb[iy,ix]=z
    if lab is not None: col=pal[lab[t]%len(pal)]*sh_[t]
    else:
      uv=(l0[m][w,None]*U[a]+l1[m][w,None]*U[b]+l2[m][w,None]*U[c]);col=T[np.clip((uv[:,1]*S).astype(int),0,S-1),np.clip((uv[:,0]*S).astype(int),0,S-1)]*sh_[t]
    img[iy,ix]=np.clip(col,0,255)
  for k in range(23):
    q=int(k*R/22);v=-0.55+k*0.05
    img[min(q,R-1),::4]=90;img[::4,min(q,R-1)]=90
    if k%2==0: cv2.putText(img,'%.1f'%v if k%4==0 else '',(q+1,R-4),0,0.35,(200,200,200),1);cv2.putText(img,'%.1f'%(-v) if k%4==0 else '',(2,q-2),0,0.35,(200,200,200),1)
  return img
a=view(2,1,0,1,1,1);b=view(0,1,2,1,1,1);c=view(0,2,1,1,-1,1)
out=np.hstack([a,b,c]);cv2.putText(out,'side +x: h=z v=y',(5,20),0,0.6,(255,255,255),1);cv2.putText(out,'front +z',(605,20),0,0.6,(255,255,255),1);cv2.putText(out,'top: h=x v=-z',(1205,20),0,0.6,(255,255,255),1)
cv2.imwrite(sys.argv[2],out)
