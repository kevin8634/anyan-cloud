# 通用精绑：python3 rigfine2.py <配置.py> <模型.json> <输出 rig.json> [regions.png]
# raidA 拷自 p73（11-02）；新增可选配置 sk/smin（高斯宽度 = max(骨长×sk, smin)，默认 0.35/0.05 与 p73 一致）、bsig（逐骨覆盖）
# 配置定义 B（骨：名, 父, 位置）、regions(x,y,z)->R 数组、cand（区域→候选骨）、ok（允许相邻的区域对）、rigid（刚性区域→骨）
import json,sys,numpy as np
from scipy.sparse import coo_matrix
cfg={}; exec(open(sys.argv[1]).read(),cfg)
d=json.load(open(sys.argv[2])); P=np.array(d['P']).reshape(-1,3); I=np.array(d['I']).reshape(-1,3); n=len(P)
B=cfg['B']; names=[b[0] for b in B]; ix={nm:i for i,nm in enumerate(names)}; pos=np.array([b[2] for b in B],float)
child={}
for b in B:
  if b[1] and b[1] not in child: child[b[1]]=b[0]
R=cfg['regions'](P[:,0],P[:,1],P[:,2]); cand=cfg['cand']; rigid=cfg.get('rigid',{})
def segd(p,a,b):
  ab=b-a; t=np.clip(((p-a)@ab)/max(ab@ab,1e-9),0,1); return np.linalg.norm(p-(a+np.outer(t,ab)),axis=1)
W=np.zeros((n,len(B)))
for r,bl in cand.items():
  m=R==r
  if not m.any(): continue
  for nm in bl:
    j=ix[nm]; a=pos[j]; b=pos[ix[child[nm]]] if nm in child else a
    s=cfg.get('bsig',{}).get(nm) or max(np.linalg.norm(b-a)*cfg.get('sk',0.35),cfg.get('smin',0.05)); W[m,j]=np.exp(-segd(P[m],a,b)**2/(2*s*s))+1e-6
for r,bn in rigid.items(): W[R==r]=0; W[R==r,ix[bn]]=1
W/=W.sum(1,keepdims=True)
ok={frozenset(p) for p in cfg['ok']}
allowed=lambda a,b: a==b or frozenset((a,b)) in ok
tri_ok=np.array([allowed(R[a],R[b]) and allowed(R[b],R[c]) and allowed(R[a],R[c]) for a,b,c in I])
print('cut tris',(~tri_ok).sum(),'of',len(I))
E=np.concatenate([I[tri_ok][:,[0,1]],I[tri_ok][:,[1,2]],I[tri_ok][:,[2,0]]])
q=np.round(P/1e-4).astype(np.int64); _,rep=np.unique(q,axis=0,return_inverse=True); rep=rep.ravel()
groups={}
for v in range(n): groups.setdefault(rep[v],[]).append(v)
WE=[(g[0],v) for g in groups.values() if len(g)>1 for v in g[1:] if allowed(R[g[0]],R[v])]
if WE: E=np.vstack([E,np.array(WE)])
A=coo_matrix((np.ones(len(E)),(E[:,0],E[:,1])),shape=(n,n)); A=((A+A.T)>0).astype(float)
deg=np.array(A.sum(1)).ravel(); deg[deg==0]=1
rig=np.isin(R,list(rigid.keys()))
for it in range(cfg.get('iters',10)):
  Wn=0.5*W+0.5*(A@W)/deg[:,None]; Wn[rig]=W[rig]; W=Wn
si=np.argsort(-W,1)[:,:4]; sw=np.take_along_axis(W,si,1); sw/=sw.sum(1,keepdims=True)
print({r:int((R==r).sum()) for r in set(R)})
json.dump({'bones':[{'name':b[0],'parent':b[1],'p':list(map(float,b[2]))} for b in B],'si':si.ravel().tolist(),'sw':np.round(sw.ravel(),4).tolist(),'index':I[tri_ok].ravel().tolist()},open(sys.argv[3],'w'))
if len(sys.argv)>4:
  import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
  regs=sorted(set(R)); cm=plt.get_cmap('tab10')
  fig,ax=plt.subplots(1,2,figsize=(14,10))
  for a,(i,j) in zip(ax,[(0,1),(2,1)]):
    for k,r in enumerate(regs):
      m=R==r; a.scatter(P[m,i],P[m,j],s=1,color=cm(k),label=r)
    a.plot(pos[:,i],pos[:,j],'o',color='orange',ms=5); a.set_aspect('equal'); a.grid(True)
  ax[0].legend(markerscale=6); plt.tight_layout(); plt.savefig(sys.argv[4],dpi=60)
