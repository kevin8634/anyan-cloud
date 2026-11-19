import numpy as np, sys
from PIL import Image
pos=np.fromfile('mage.pos',np.float32).reshape(-1,3); uv=np.fromfile('mage.uv',np.float32).reshape(-1,2); idx=np.fromfile('mage.idx',np.uint32).reshape(-1,3)
tex=np.asarray(Image.open('tex0.webp').convert('RGB')).astype(np.float32)
def render(x0,x1,y0,y1,W,out,facez=None):
    H=int(W*(y1-y0)/(x1-x0)); img=np.zeros((H,W,3),np.float32); zb=np.full((H,W),-9.0); tid=np.full((H,W),-1)
    T=pos[idx]; keep=(T[:,:,1].max(1)>y0)&(T[:,:,1].min(1)<y1)&(T[:,:,0].max(1)>x0)&(T[:,:,0].min(1)<x1)
    for t in np.nonzero(keep)[0]:
        a,b,c=pos[idx[t]]; ua,ub,uc=uv[idx[t]]
        P=np.array([[ (p[0]-x0)/(x1-x0)*W, (y1-p[1])/(y1-y0)*H ] for p in (a,b,c)])
        mn=np.floor(P.min(0)).astype(int); mx=np.ceil(P.max(0)).astype(int)
        mn=np.maximum(mn,0); mx=np.minimum(mx,[W-1,H-1])
        if (mx<mn).any(): continue
        xs,ys=np.meshgrid(np.arange(mn[0],mx[0]+1)+.5,np.arange(mn[1],mx[1]+1)+.5)
        d=(P[1,1]-P[2,1])*(P[0,0]-P[2,0])+(P[2,0]-P[1,0])*(P[0,1]-P[2,1])
        if abs(d)<1e-9: continue
        l0=((P[1,1]-P[2,1])*(xs-P[2,0])+(P[2,0]-P[1,0])*(ys-P[2,1]))/d
        l1=((P[2,1]-P[0,1])*(xs-P[2,0])+(P[0,0]-P[2,0])*(ys-P[2,1]))/d
        l2=1-l0-l1; m=(l0>=-1e-4)&(l1>=-1e-4)&(l2>=-1e-4)
        if not m.any(): continue
        z=l0*a[2]+l1*b[2]+l2*c[2]
        X=(xs-.5).astype(int); Y=(ys-.5).astype(int)
        m&= z>zb[Y,X]
        if not m.any(): continue
        U=(l0*ua[0]+l1*ub[0]+l2*uc[0])*2047; V=(l0*ua[1]+l1*ub[1]+l2*uc[1])*2047
        col=tex[np.clip(V,0,2047).astype(int),np.clip(U,0,2047).astype(int)]
        zb[Y[m],X[m]]=z[m]; img[Y[m],X[m]]=col[m]; tid[Y[m],X[m]]=t
    Image.fromarray(img.clip(0,255).astype(np.uint8)).save(out); return tid
if __name__=='__main__':
    a=list(map(float,sys.argv[1:5])); render(*a,int(sys.argv[5]),sys.argv[6])
