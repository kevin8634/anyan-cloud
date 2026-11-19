import numpy as np, json, os, sys, subprocess
from PIL import Image, ImageFilter
cfg=json.load(open('cfg2.json'))
for c in sys.argv[1:]:
    X0,X1,Y0,Y1=cfg[c]
    os.environ['PFX']=c
    g={}; exec(open('ras2.py').read().split("if __name__")[0], g)
    lo=np.asarray(Image.open(f'in2_{c}.png').convert('RGB')).astype(np.float32); H,W=lo.shape[:2]
    tid=g['render'](X0,X1,Y0,Y1,W,'/tmp/chk.png')
    cov=Image.fromarray(((tid>=0)*255).astype(np.uint8)).filter(ImageFilter.MinFilter(int(os.environ.get('ERODE','15'))))
    hi=np.asarray(Image.open(f"{os.environ.get('HI','hi2')}_{c}.png").convert('RGB').resize((W,H),Image.LANCZOS)).astype(np.float32)
    bg=(hi.max(2)<18)   # 背景黑边：用邻近头发/皮肤颜色外扩，避免侧面拉伸出黑条
    if bg.any():
        def _bx(x):
            p=np.pad(x,[(2,2),(2,2)]+[(0,0)]*(x.ndim-2),mode='edge'); return sum(p[i:i+x.shape[0],j:j+x.shape[1]] for i in range(5) for j in range(5))/25
        fg=(~bg).astype(np.float32); acc=hi*fg[...,None]
        for _ in range(80):
            if fg.min()>0: break
            S=_bx(acc); C=_bx(fg)
            new=(fg==0)&(C>0.01); acc[new]=S[new]/C[new][:,None]; fg=np.where(new,1.0,fg).astype(np.float32)
        hi=acc
    yy,xx=np.mgrid[0:H,0:W]; ex,ey,rx,ry=map(float,os.environ.get('ELL','0.5,0.5,0.47,0.52').split(','))
    r=np.sqrt(((xx/W-ex)/rx)**2+((yy/H-ey)/ry)**2)
    a=np.clip((1-r)/0.12,0,1)*(np.asarray(cov)/255.0)
    HOLE=os.environ.get('HOLE')
    if HOLE:
        hx,hy,hrx,hry=map(float,HOLE.split(','))
        hr=np.sqrt(((xx/W-hx)/hrx)**2+((yy/H-hy)/hry)**2); a=a*np.clip((hr-1)/0.15,0,1)
    a=np.asarray(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)/255
    m=(a>0.5)
    for k in range(3):
        A=lo[...,k][m]; B=hi[...,k][m]; hi[...,k]=(hi[...,k]-B.mean())/B.std()*(A.std()*0.5+B.std()*0.5)+A.mean()
    hi=hi.clip(0,255)
    Image.fromarray(np.dstack([hi,a*255]).astype(np.uint8),'RGBA').resize((1024,1024),Image.LANCZOS).save(f'decal2_{c}.webp',quality=90)
    pos=np.fromfile(c+'.pos',np.float32).reshape(-1,3); idx=np.fromfile(c+'.idx',np.uint32).reshape(-1,3)
    T=pos[idx]; ce=T.mean(1); u=(ce[:,0]-X0)/(X1-X0); v=(Y1-ce[:,1])/(Y1-Y0)
    rr=np.sqrt(((u-ex)/rx)**2+((v-ey)/ry)**2)
    n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); nz=n[:,2]/(np.linalg.norm(n,axis=1)+1e-12)
    keep=np.ones(len(rr),bool)
    if HOLE: keep=np.sqrt(((u-hx)/hrx)**2+((v-hy)/hry)**2)>1.0
    zmax=pos[:,2].max(); sel=np.nonzero(keep&(rr<1.0)&(nz>-0.6)&(ce[:,2]>zmax*0.1))[0].astype(np.uint32); sel.tofile(f'tris2_{c}.bin')
    pv=lo*(1-a[...,None])+hi*a[...,None]; Image.fromarray(np.hstack([lo,pv]).astype(np.uint8)).resize((W,H//2)).save(f'pv2_{c}.jpg')
    print(c,len(sel))
