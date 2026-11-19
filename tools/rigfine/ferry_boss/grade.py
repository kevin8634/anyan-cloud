# 死渡脸：CodeFormer 细节 + 原件尸色（低频色取原投影，去血色，眼窝压暗）→ 512
import numpy as np, cv2
cf=cv2.imread('cf_out.png').astype(np.float32); org=cv2.imread('cf_crop.png').astype(np.float32)
Lc=cv2.cvtColor(cf.astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32); Lo=cv2.cvtColor(org.astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32)
L=cv2.GaussianBlur(Lo[...,0],(0,0),10)*0.55+cv2.GaussianBlur(Lc[...,0],(0,0),10)*0.45+(Lc[...,0]-cv2.GaussianBlur(Lc[...,0],(0,0),10))*1.15
a=cv2.GaussianBlur(Lo[...,1],(0,0),8)*0.7+128*0.3-3; b=cv2.GaussianBlur(Lo[...,2],(0,0),8)*0.7+128*0.3+2   # 偏灰绿
yy,xx=np.mgrid[0:512,0:512].astype(np.float32)
sock=np.zeros((512,512),np.float32)
for ex,ey in [(193,242),(319,242)]: sock=np.maximum(sock,np.clip(1.25-np.sqrt(((xx-ex)/44)**2+((yy-ey)/26)**2),0,1))
sock=cv2.GaussianBlur(sock,(0,0),6); L=L*(1-0.55*sock)
cheek=np.zeros_like(sock)
for ex,ey in [(170,320),(342,320)]: cheek=np.maximum(cheek,np.clip(1-np.sqrt(((xx-ex)/40)**2+((yy-ey)/45)**2),0,1))
L=L*(1-0.18*cv2.GaussianBlur(cheek,(0,0),10))   # 颧下凹陷
out=cv2.cvtColor(np.dstack([L,a,b]).clip(0,255).astype(np.uint8),cv2.COLOR_LAB2BGR)
cv2.imwrite('graded.png',out)
# 眼：幽魂绿眼火（自发光）
em=np.zeros((512,512,3),np.float32)
for ex,ey in [(193,243),(319,243)]:
    r=np.sqrt(((xx-ex)/13)**2+((yy-ey)/8)**2); g=np.clip(1-r,0,1)**1.5+0.35*np.clip(1-r/2.6,0,1)**2
    em=np.maximum(em,g[...,None]*np.array([170,255,80],np.float32))
cv2.imwrite('eye_emi512.png',em.clip(0,255).astype(np.uint8))
o2=out.astype(np.float32); o2=o2*(1-np.clip(em.max(2,keepdims=True)/255,0,1)*0.6)+em*0.6
cv2.imwrite('graded_pv.jpg',np.hstack([org,cf,o2]).clip(0,255).astype(np.uint8))
