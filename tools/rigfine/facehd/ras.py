import numpy as np
from PIL import Image
D='/workspace/work/gordon_v3/'
def load(pre=D+'d'):
    pos=np.fromfile(pre+'.position',np.float32).reshape(-1,3); uv=np.fromfile(pre+'.texcoord_0',np.float32).reshape(-1,2)
    idx=np.fromfile(pre+'.idx',np.uint32).reshape(-1,3); nrm=np.fromfile(pre+'.normal',np.float32).reshape(-1,3)
    return pos,uv,idx,nrm
def bilin(tex,U,V):
    h,w=tex.shape[:2]; x=np.clip(U*w-.5,0,w-1.001); y=np.clip(V*h-.5,0,h-1.001)
    x0=x.astype(int); y0=y.astype(int); fx=(x-x0)[...,None]; fy=(y-y0)[...,None]
    return (tex[y0,x0]*(1-fx)*(1-fy)+tex[y0,x0+1]*fx*(1-fy)+tex[y0+1,x0]*(1-fx)*fy+tex[y0+1,x0+1]*fx*fy)
def render(pos,uv,idx,tex,x0,x1,y0,y1,W):
    """正面(+z)正交投影：返回 img, tid, zbuf, 以及每像素原 UV"""
    H=int(round(W*(y1-y0)/(x1-x0))); img=np.zeros((H,W,tex.shape[2]),np.float32); zb=np.full((H,W),-9.0); tid=np.full((H,W),-1); UVo=np.zeros((H,W,2),np.float32)
    T=pos[idx]; keep=(T[:,:,1].max(1)>y0)&(T[:,:,1].min(1)<y1)&(T[:,:,0].max(1)>x0)&(T[:,:,0].min(1)<x1)
    for t in np.nonzero(keep)[0]:
        a,b,c=pos[idx[t]]; ua,ub,uc=uv[idx[t]]
        P=np.array([[(p[0]-x0)/(x1-x0)*W,(y1-p[1])/(y1-y0)*H] for p in (a,b,c)])
        mn=np.maximum(np.floor(P.min(0)).astype(int),0); mx=np.minimum(np.ceil(P.max(0)).astype(int),[W-1,H-1])
        if (mx<mn).any(): continue
        xs,ys=np.meshgrid(np.arange(mn[0],mx[0]+1)+.5,np.arange(mn[1],mx[1]+1)+.5)
        d=(P[1,1]-P[2,1])*(P[0,0]-P[2,0])+(P[2,0]-P[1,0])*(P[0,1]-P[2,1])
        if abs(d)<1e-12: continue
        l0=((P[1,1]-P[2,1])*(xs-P[2,0])+(P[2,0]-P[1,0])*(ys-P[2,1]))/d
        l1=((P[2,1]-P[0,1])*(xs-P[2,0])+(P[0,0]-P[2,0])*(ys-P[2,1]))/d
        l2=1-l0-l1; m=(l0>=-1e-4)&(l1>=-1e-4)&(l2>=-1e-4)
        if not m.any(): continue
        z=l0*a[2]+l1*b[2]+l2*c[2]; X=(xs-.5).astype(int); Y=(ys-.5).astype(int)
        m&=z>zb[Y,X]
        if not m.any(): continue
        U=l0*ua[0]+l1*ub[0]+l2*uc[0]; V=l0*ua[1]+l1*ub[1]+l2*uc[1]
        zb[Y[m],X[m]]=z[m]; tid[Y[m],X[m]]=t; UVo[Y[m],X[m],0]=U[m]; UVo[Y[m],X[m],1]=V[m]
    hit=tid>=0; img[hit]=bilin(tex,UVo[hit][:,0],UVo[hit][:,1])
    return img,tid,zb,UVo
