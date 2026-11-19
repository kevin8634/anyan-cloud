import sys,os,numpy as np,cv2,onnxruntime as ort
c=sys.argv[1];W='w/'
i=cv2.imread(W+c+'_front_new.png');O=cv2.resize(cv2.imread(W+c+'_gpt.png'),(1024,1024),interpolation=cv2.INTER_AREA)
g=lambda im:cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY).astype(np.float32)/255,(0,0),4)
import json
L=json.loads(sys.argv[2]);src=np.float32(L['out'])*2;dst=np.float32(L['in'])*2
if 'nin' in L:
  src=np.vstack([src,np.float32([L['nout']])*2]);dst=np.vstack([dst,np.float32([L['nin']])*2])
  M=cv2.estimateAffine2D(src,dst,method=cv2.LMEDS)[0] if False else cv2.estimateAffine2D(src,dst,ransacReprojThreshold=1e4)[0]
else:
  M=cv2.getAffineTransform(src,dst) if os.environ.get('FULLAFF') else cv2.estimateAffinePartial2D(src,dst)[0]
al=cv2.warpAffine(O,M,(1024,1024),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REFLECT_101)
cv2.imwrite(W+c+'_al.png',al)
# ESRGAN x4 on 512 -> 2048
FAST=os.environ.get('FAST')
if FAST:
  hi=cv2.resize(al,(2048,2048),interpolation=cv2.INTER_CUBIC).astype(np.float32)
so=ort.SessionOptions();so.intra_op_num_threads=4
s=None if FAST else ort.InferenceSession('/workspace/work/gordon_v3/models/real_esrgan_x4.onnx',so,providers=['CPUExecutionProvider'])
img=cv2.resize(al,(512,512),interpolation=cv2.INTER_AREA)[:,:,::-1].astype(np.float32)/255
out=np.zeros((2048,2048,3),np.float32);T=128;P=8
for y in ([] if FAST else range(0,512,T)):
  for x in range(0,512,T):
    y0,x0=max(y-P,0),max(x-P,0);y1,x1=min(y+T+P,512),min(x+T+P,512)
    o=s.run(None,{'input':img[y0:y1,x0:x1].transpose(2,0,1)[None]})[0][0].transpose(1,2,0)
    oy,ox=(y-y0)*4,(x-x0)*4;out[y*4:y*4+T*4,x*4:x*4+T*4]=o[oy:oy+T*4,ox:ox+T*4]
hi=hi if FAST else (out[:,:,::-1].clip(0,1)*255)
# keep gpt low/mid freq colour, ESRGAN high freq (standard K=0.6)
K=0.6;lo=cv2.resize(al,(2048,2048),interpolation=cv2.INTER_CUBIC).astype(np.float32)
base=cv2.GaussianBlur(lo,(0,0),3)+(hi-cv2.GaussianBlur(hi,(0,0),3))*(1+0.15*K)
bb=cv2.GaussianBlur(base,(0,0),1.6);base=(base+(base-bb)*0.35*K).clip(0,255)
cov=(cv2.cvtColor(cv2.resize(i,(2048,2048)),cv2.COLOR_BGR2GRAY)>6).astype(np.uint8)
cov=cv2.morphologyEx(cov,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8));cov=cv2.erode(cov,np.ones((9,9),np.uint8)).astype(np.float32)
yy,xx=np.mgrid[0:2048,0:2048];r=np.sqrt(((xx+.5)/2048-.5)**2+((yy+.5)/2048-.5)**2)
a=np.clip((0.5-r)/0.07,0,1)*cv2.GaussianBlur(cov,(0,0),10)
if L.get('bgcut'):
  gm=(cv2.cvtColor(cv2.resize(al,(2048,2048)),cv2.COLOR_BGR2GRAY)>22).astype(np.uint8)
  gm=cv2.morphologyEx(gm,cv2.MORPH_OPEN,np.ones((9,9),np.uint8));a=a*cv2.GaussianBlur(cv2.erode(gm,np.ones((13,13),np.uint8)).astype(np.float32),(0,0),8)
if 'eyes' in L:
  ex,ey,rx,ry=[v*4 for v in L['eyes']];e=((xx-ex)/rx)**2+((yy-ey)/ry)**2
  a=cv2.GaussianBlur(np.clip((1-e)/0.35,0,1).astype(np.float32),(0,0),6)*(cov>0)
if 'band' in L:
  b0,b1=[v*4 for v in L['band']];a=a*np.clip(np.minimum(yy-b0,b1-yy)/48+0.5,0,1)
cv2.imwrite(W+c+'_decal2.webp',np.dstack([base.astype(np.uint8),(a*255).astype(np.uint8)]),[cv2.IMWRITE_WEBP_QUALITY,95]);print(c,'M',np.round(M,3).tolist())
