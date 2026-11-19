import numpy as np, json, os, sys
from PIL import Image, ImageFilter
cfg=json.load(open('cfg.json'))
ELL={"Warrior":(0.5,0.55,0.36,0.45),"Chrono":(0.5,0.5,0.37,0.38),"Alchemy":(0.5,0.5,0.38,0.47),"Hunter":(0.5,0.52,0.36,0.46),"Coffin":(0.5,0.55,0.37,0.43)}
for c in sys.argv[1:]:
    X0,X1,Y0,Y1=cfg[c]; W=768
    lo=np.asarray(Image.open(f'in_{c}.png').convert('RGB')).astype(np.float32); H,W=lo.shape[:2]
    hi=np.asarray(Image.open(f'hi_{c}.png').convert('RGB').resize((W,H),Image.LANCZOS)).astype(np.float32)
    ex,ey,rx,ry=ELL[c]
    yy,xx=np.mgrid[0:H,0:W]; r=np.sqrt(((xx/W-ex)/rx)**2+((yy/H-ey)/ry)**2)
    a=np.clip((1-r)/0.16,0,1); a=np.asarray(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32)/255
    m=r<0.85
    for k in range(3):
        A=lo[...,k][m]; B=hi[...,k][m]; hi[...,k]=(hi[...,k]-B.mean())/B.std()*(A.std()*0.5+B.std()*0.5)+A.mean()
    hi=hi.clip(0,255)
    Image.fromarray(np.dstack([hi,a*255]).astype(np.uint8),'RGBA').resize((1024,1024),Image.LANCZOS).save(f'decal_{c}.webp',quality=90)
    pos=np.fromfile(c+'.pos',np.float32).reshape(-1,3); idx=np.fromfile(c+'.idx',np.uint32).reshape(-1,3)
    T=pos[idx]; ce=T.mean(1); u=(ce[:,0]-X0)/(X1-X0); v=(Y1-ce[:,1])/(Y1-Y0)
    rr=np.sqrt(((u-ex)/rx)**2+((v-ey)/ry)**2)
    n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); nz=n[:,2]/(np.linalg.norm(n,axis=1)+1e-12)
    zmax=pos[:,2].max(); sel=np.nonzero((rr<1.0)&(nz>-0.3)&(ce[:,2]>zmax*0.15))[0].astype(np.uint32); sel.tofile(f'tris_{c}.bin')
    pv=lo*(1-a[...,None])+hi*a[...,None]; Image.fromarray(np.hstack([lo,pv]).astype(np.uint8)).save(f'pv_{c}.jpg')
    print(c,len(sel))
