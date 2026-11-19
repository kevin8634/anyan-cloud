import numpy as np
pos=np.fromfile('mage.pos',np.float32).reshape(-1,3); idx=np.fromfile('mage.idx',np.uint32).reshape(-1,3)
X0,X1,Y0,Y1=-0.11,0.11,0.65,0.91; W=1024; H=1210
T=pos[idx]; c=T.mean(1)
px=(c[:,0]-X0)/(X1-X0)*W; py=(Y1-c[:,1])/(Y1-Y0)*H
r=np.sqrt(((px-512)/305)**2+((py-640)/395)**2)
n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); nz=n[:,2]/(np.linalg.norm(n,axis=1)+1e-12)
old=set(np.fromfile('decal_tris.bin',np.uint32).tolist())
sel=np.nonzero((r<1.0)&(nz>-0.3)&(c[:,2]>0.05))[0]
print(len(old),len(sel), len(old-set(sel.tolist())))
s=sorted(set(sel.tolist())|old); np.array(s,np.uint32).tofile('decal_tris2.bin'); print(len(s))
