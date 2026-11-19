import cv2, numpy as np
D='/workspace/work/gordon_v3/'
a=cv2.imread(D+'r_cf8_x4.png'); hsv=cv2.cvtColor(a,cv2.COLOR_BGR2HSV).astype(np.float32)
V=hsv[...,2]; Sa=hsv[...,1]; med=cv2.medianBlur(a,41); Vm=cv2.cvtColor(med,cv2.COLOR_BGR2HSV)[...,2].astype(np.float32)
m=np.zeros(V.shape,np.uint8)
for (x0,y0,x1,y1),th in [((870,880,980,1060),28),((1000,960,1090,1500),14)]:
    sub=((V-Vm)>th)&(Sa<120); m[y0:y1,x0:x1]=sub[y0:y1,x0:x1]
m=cv2.dilate(m*255,np.ones((7,7),np.uint8))
b=cv2.inpaint(a,m,9,cv2.INPAINT_TELEA)
# 眼部：局部对比增强（虹膜/眼睑暗线），高光点
def darkest(x0,y0,x1,y1):
    g=cv2.GaussianBlur(cv2.cvtColor(b,cv2.COLOR_BGR2GRAY),(0,0),9)[y0:y1,x0:x1]; yy,xx=np.unravel_index(np.argmin(g),g.shape); return x0+xx,y0+yy
eyes=[darkest(700,900,880,1010),darkest(1180,900,1380,1010)]
print('iris',eyes)
f=b.astype(np.float32); blur=cv2.GaussianBlur(f,(0,0),6)
yy,xx=np.mgrid[0:2048,0:2048]
for ex,ey in eyes:
    r=np.sqrt(((xx-ex)/150)**2+((yy-ey)/55)**2); w=np.clip(1.2-r,0,1)[...,None]
    f=f+(f-blur)*0.6*w                        # 眼周细节锐化
    ri=np.sqrt(((xx-ex)/34)**2+((yy-ey)/26)**2); wi=np.clip(1.15-ri,0,1)[...,None]**1.5
    f=f*(1-0.28*wi)                          # 虹膜/瞳孔压暗
    if V[ey-25:ey+25,ex-35:ex+35].max()>170: continue
    hx,hy=ex-10,ey-11; rh=np.sqrt((xx-hx)**2+(yy-hy)**2); wh=np.exp(-(rh/4.2)**2)[...,None]
    f=f*(1-wh*0.85)+np.array([235,240,245])*wh*0.85   # 角膜高光
cv2.imwrite(D+'r_fix_x4.png',f.clip(0,255).astype(np.uint8)); cv2.imwrite(D+'fixmask.png',m)
o=f.clip(0,255).astype(np.uint8)
cv2.imwrite(D+'fix_eyes.jpg',np.vstack([cv2.resize(a[800:1150,550:1550],(1000,350)),cv2.resize(o[800:1150,550:1550],(1000,350))]))
