import numpy as np, cv2
from PIL import Image
D='/workspace/work/gordon_v3/'
A=np.load(D+'A.npy'); X0,X1,Y0,Y1=-0.052,0.054,0.335,0.465; OX0,OX1,OY0,OY1=-0.064,0.066,0.335,0.465; TW=1024
sx=(X1-X0)/TW*1024/(OX1-OX0); sy=(Y1-Y0)/TW*1024/(OY1-OY0); ox=(X0-OX0)/(OX1-OX0)*1024; oy=(OY1-Y1)/(OY1-OY0)*1024
M=np.diag([4,4,1])@np.vstack([A,[0,0,1]])@np.array([[sx,0,ox],[0,sy,oy],[0,0,1]]); Mi=np.linalg.inv(M)
eyes=[(Mi@[x,y,1])[:2] for x,y in [(806,955),(1276,963)]]; print('eyes in face_tex',eyes)
f=np.asarray(Image.open(D+'face_tex.png').convert('RGB')).astype(np.float32)/255
yy,xx=np.mgrid[0:TW,0:TW]
LIFT=float(__import__('sys').argv[1]) if len(__import__('sys').argv)>1 else 0.35
for ex,ey in eyes:
    r=np.sqrt(((xx-ex)/95)**2+((yy-ey)/48)**2); w=np.clip((1.25-r)/0.6,0,1)**1.2
    ri=np.sqrt(((xx-ex)/16)**2+((yy-ey)/13)**2); wi=np.clip((1.3-ri)/0.5,0,1)
    w=w*(1-0.8*wi)                 # 虹膜保持暗
    lifted=1-(1-f)**(1+LIFT)       # 提亮暗部
    f=f*(1-w[...,None])+lifted*w[...,None]
Image.fromarray((f.clip(0,1)*255).astype(np.uint8)).save(D+'face_tex2.png')
c=[int(e) for e in np.array(eyes).mean(0)]
Image.fromarray((f.clip(0,1)*255).astype(np.uint8)[c[1]-90:c[1]+90,c[0]-240:c[0]+240]).resize((960,360)).save(D+'eyelift_pv.jpg')
