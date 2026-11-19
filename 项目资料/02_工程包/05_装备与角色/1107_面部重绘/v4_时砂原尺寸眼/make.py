# 时砂：在 7c662c9 原贴花（img5，2048）上按原眼睛大小/位置换 gpt 眼部（ESRGAN x4）
import cv2,numpy as np,onnxruntime as ort
g=cv2.imread('../std/w/Chrono_gpt.png')            # 1254
o=cv2.imread('/tmp/oc/img5.webp',cv2.IMREAD_UNCHANGED)  # 2048 BGRA
X0,Y0,X1,Y1=380,540,900,760
crop=g[Y0:Y1,X0:X1][:,:,::-1].astype(np.float32)/255
s=ort.InferenceSession('/workspace/work/gordon_v3/models/real_esrgan_x4.onnx',providers=['CPUExecutionProvider'])
h,w=crop.shape[:2];out=np.zeros((h*4,w*4,3),np.float32);T=110;P=8
for y in range(0,h,T):
  for x in range(0,w,T):
    y0,x0=max(y-P,0),max(x-P,0);y1,x1=min(y+T+P,h),min(x+T+P,w)
    r=s.run(None,{'input':np.ascontiguousarray(crop[y0:y1,x0:x1].transpose(2,0,1)[None])})[0][0].transpose(1,2,0)
    oy,ox=(y-y0)*4,(x-x0)*4;th,tw=min(T,h-y)*4,min(T,w-x)*4
    out[y*4:y*4+th,x*4:x*4+tw]=r[oy:oy+th,ox:ox+tw]
hi=(out[:,:,::-1].clip(0,1)*255).astype(np.float32)
S=5.0;RE=(780,660);DST=(1533,947)
# crop-x4 pixel (u,v) -> gpt (X0+u/4, Y0+v/4) -> dst
M=np.float32([[S/4,0,DST[0]+S*(X0-RE[0])],[0,S/4,DST[1]+S*(Y0-RE[1])]])
wp=cv2.warpAffine(hi,M,(2048,2048),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)
yy,xx=np.mgrid[0:2048,0:2048].astype(np.float32)
# 眼眉带：gpt y 575..735 -> dst
ya,yb=DST[1]+S*(575-RE[1]),DST[1]+S*(735-RE[1])
m=((yy>ya)&(yy<yb)).astype(np.float32);m=cv2.GaussianBlur(m,(0,0),45)
m*= (o[...,3]>0).astype(np.float32)
# 颜色匹配到原件
ob=o[...,:3].astype(np.float32);sel=m>0.5
for c in range(3):
  a,b=wp[...,c][sel],ob[...,c][sel];wp[...,c]=(wp[...,c]-a.mean())/(a.std()+1e-3)*b.std()+b.mean()
res=o.copy();res[...,:3]=(ob*(1-m[...,None])+wp.clip(0,255)*m[...,None]).astype(np.uint8)
cv2.imwrite('Chrono_face_eyes.webp',res,[cv2.IMWRITE_WEBP_QUALITY,95])
v=cv2.resize(res[...,:3],(768,768));cv2.imwrite('/tmp/ne.jpg',v)
print(ya,yb)
