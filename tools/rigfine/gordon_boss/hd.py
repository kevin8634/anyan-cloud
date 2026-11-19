# raidA 11-01 重要角色贴图重绘标准（同脸部 v4b，0 积分）：Real-ESRGAN x4 → 目标尺寸；低频取原图、高频取超分，锐化 K=0.6
# python3 hd.py <原图> <x4.npy> <输出底色.png> <输出高度.npy> <目标边长> [K=0.6]
import numpy as np, cv2, sys
src,x4p,outp,hp,S=sys.argv[1:6]; S=int(S); K=float(sys.argv[6]) if len(sys.argv)>6 else 0.6
lo=cv2.resize(cv2.imread(src).astype(np.float32),(S,S),interpolation=cv2.INTER_CUBIC)
hi=cv2.resize(np.load(x4p).astype(np.float32)[:,:,::-1].clip(0,1)*255,(S,S),interpolation=cv2.INTER_AREA)
sig=6*S/2048
base=cv2.GaussianBlur(lo,(0,0),sig)+(hi-cv2.GaussianBlur(hi,(0,0),sig))*(1+0.15*K)
bb=cv2.GaussianBlur(base,(0,0),1.6*S/2048); base=(base+(base-bb)*0.35*K).clip(0,255)
cv2.imwrite(outp,base.astype(np.uint8))
g=cv2.cvtColor(base.astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)/255
h=(g-cv2.GaussianBlur(g,(0,0),8*S/2048))+(g-cv2.GaussianBlur(g,(0,0),2*S/2048))*0.6
np.save(hp,(h*6*K).astype(np.float32)); print('ok',S)
