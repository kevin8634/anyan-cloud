import numpy as np,sys
from PIL import Image
V=np.fromfile('m_pos.bin',np.float32).reshape(-1,3);UV=np.fromfile('m_uv.bin',np.float32).reshape(-1,2);F=np.fromfile('m_idx.bin',np.uint32).reshape(-1,3)
T=np.asarray(Image.open('m_tex.webp').convert('RGB')).astype(float);th,tw=T.shape[:2]
V=V-(V.min(0)+V.max(0))/2
def render(yaw,S=700):
    a=np.radians(yaw);R=np.array([[np.cos(a),0,np.sin(a)],[0,1,0],[-np.sin(a),0,np.cos(a)]])
    P=V@R.T;s=S*0.9/(np.ptp(P[:,:2],0).max());x=P[:,0]*s+S/2;y=S/2-P[:,1]*s;z=P[:,2]
    img=np.full((S,S,3),235.);zb=np.full((S,S),-1e9)
    tri=P[F];n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-9
    L=np.array([0.4,0.6,0.7]);L/=np.linalg.norm(L);sh=0.35+0.75*np.abs(n@L)
    for f,(i,j,k) in enumerate(F):
        xs=np.array([x[i],x[j],x[k]]);ys=np.array([y[i],y[j],y[k]])
        x0,x1=int(max(xs.min(),0)),int(min(xs.max()+1,S-1));y0,y1=int(max(ys.min(),0)),int(min(ys.max()+1,S-1))
        if x1<x0 or y1<y0:continue
        gx,gy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        d=(ys[1]-ys[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(ys[0]-ys[2])
        if abs(d)<1e-9:continue
        w0=((ys[1]-ys[2])*(gx-xs[2])+(xs[2]-xs[1])*(gy-ys[2]))/d;w1=((ys[2]-ys[0])*(gx-xs[2])+(xs[0]-xs[2])*(gy-ys[2]))/d;w2=1-w0-w1
        m=(w0>=-1e-3)&(w1>=-1e-3)&(w2>=-1e-3)
        if not m.any():continue
        zz=w0*z[i]+w1*z[j]+w2*z[k];sub=zb[y0:y1+1,x0:x1+1];m&=zz>sub
        if not m.any():continue
        u=w0*UV[i,0]+w1*UV[j,0]+w2*UV[k,0];v=w0*UV[i,1]+w1*UV[j,1]+w2*UV[k,1]
        c=T[(np.clip(v,0,1)*(th-1)).astype(int),(np.clip(u,0,1)*(tw-1)).astype(int)]*sh[f]
        sub[m]=zz[m];img[y0:y1+1,x0:x1+1][m]=np.clip(c[m],0,255)
    return Image.fromarray(img.astype(np.uint8))
yaws=[0,45,90,180];S=Image.new('RGB',(700*4,700))
for i,yw in enumerate(yaws):S.paste(render(yw),(i*700,0))
S.save(sys.argv[1],quality=90)
