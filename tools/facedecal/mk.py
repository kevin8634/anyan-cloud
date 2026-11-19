import numpy as np, sys
from PIL import Image, ImageFilter
sys.argv=['x']; exec(open('ras.py').read().split("if __name__")[0])
X0,X1,Y0,Y1,W=-0.11,0.11,0.65,0.91,1024
tid=render(X0,X1,Y0,Y1,W,'chk.png')
H=tid.shape[0]
yy,xx=np.mgrid[0:H,0:W]
cx,cy,rx,ry=512,640,305,395
r=np.sqrt(((xx-cx)/rx)**2+((yy-cy)/ry)**2)
alpha=np.clip((1.0-r)/0.16,0,1)  # feather
alpha=np.asarray(Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)/255
sel=np.unique(tid[(r<1.04)&(tid>=0)]); np.array(sel,np.uint32).tofile('decal_tris.bin'); print('tris',len(sel))
lo=np.asarray(Image.open('face_in.png').convert('RGB')).astype(np.float32)
hi=np.asarray(Image.open('face_hi_r.png').convert('RGB')).astype(np.float32)
m=r<0.85
for c in range(3):
  a=lo[...,c][m]; b=hi[...,c][m]
  hi[...,c]=(hi[...,c]-b.mean())/b.std()*(a.std()*0.6+b.std()*0.4)+a.mean()
hi=hi.clip(0,255)
rgba=np.dstack([hi,alpha*255]).astype(np.uint8)
im=Image.fromarray(rgba,'RGBA').resize((1024,1024),Image.LANCZOS); im.save('face_decal.webp',quality=90); im.save('face_decal.png')
# preview over original
o=np.asarray(Image.open('chk.png').convert('RGB')).astype(np.float32)
pv=o*(1-alpha[...,None])+hi*alpha[...,None]
Image.fromarray(np.hstack([o,pv]).astype(np.uint8)).resize((1024,605)).save('pv.jpg')
print(H)
