import json,numpy as np
from scipy.sparse import coo_matrix, diags
d=json.load(open('drowned.json')); P=np.array(d['P']).reshape(-1,3); I=np.array(d['I']).reshape(-1,3); n=len(P)
x,y,z=P[:,0],P[:,1],P[:,2]
B=[('root',None,(0.17,-1,0.02)),('hips','root',(0.17,0.0,0.02)),('spine','hips',(0.17,0.22,0.0)),('chest','spine',(0.17,0.45,0.0)),
('neck','chest',(0.17,0.66,0.04)),('head','neck',(0.17,0.76,0.06)),('headEnd','head',(0.17,1.0,0.06)),
('uarmR','chest',(-0.02,0.57,0.0)),('farmR','uarmR',(-0.14,0.27,0.02)),('handR','farmR',(-0.22,-0.06,0.08)),('handRend','handR',(-0.25,-0.2,0.1)),
('uarmL','chest',(0.38,0.57,0.0)),('farmL','uarmL',(0.49,0.26,0.0)),('handL','farmL',(0.54,-0.06,0.06)),('handLend','handL',(0.55,-0.2,0.08)),
('thighR','hips',(0.03,-0.08,0.03)),('shinR','thighR',(0.0,-0.5,0.02)),('footR','shinR',(-0.01,-0.88,0.0)),('toeR','footR',(-0.01,-0.98,0.12)),
('thighL','hips',(0.31,-0.08,0.03)),('shinL','thighL',(0.37,-0.5,0.02)),('footL','shinL',(0.42,-0.88,0.0)),('toeL','footL',(0.44,-0.98,0.15))]
names=[b[0] for b in B]; ix={nm:i for i,nm in enumerate(names)}
pos=np.array([b[2] for b in B])
child={}
for b in B:
  if b[1] and b[1] not in child: child[b[1]]=b[0]
# regions
R=np.full(n,'torso',dtype=object)
R[(y>0.655)&(np.abs(x-0.17)<0.13)]='head'; R[y>0.72]='head'
R[(y<-0.15)&(x<0.17)]='legR'; R[(y<-0.15)&(x>=0.17)]='legL'
R[(((x<-0.065)&(y<0.45))|((x<-0.03)&(y>=0.45)))&(y>-0.22)&(y<0.62)]='armR'
R[(x>0.445)&(y>-0.26)&(y<0.62)]='armL'
anchor=((y<-0.2)&(x<-0.14))|((y<-0.68)&(z>0.14)&(x<0.13))|((x<-0.15)&(y<-0.55))
R[anchor]='anchor'
cand={'head':['neck','head'],'torso':['hips','spine','chest','neck'],'armR':['chest','uarmR','farmR','handR'],'armL':['chest','uarmL','farmL','handL'],
'legR':['hips','thighR','shinR','footR'],'legL':['hips','thighL','shinL','footL'],'anchor':['handR']}
def segd(p,a,b):
  ab=b-a; t=np.clip(((p-a)@ab)/max(ab@ab,1e-9),0,1); return np.linalg.norm(p-(a+np.outer(t,ab)),axis=1)
nb=len(B); W=np.zeros((n,nb))
for r,bl in cand.items():
  m=R==r
  if not m.any(): continue
  for nm in bl:
    j=ix[nm]; a=pos[j]; b=pos[ix[child[nm]]] if nm in child else a
    L=np.linalg.norm(b-a); s=max(L*0.35,0.05)
    W[m,j]=np.exp(-segd(P[m],a,b)**2/(2*s*s))+1e-6
W/=W.sum(1,keepdims=True)
# allowed region adjacency
ok={frozenset(p) for p in [('head','torso'),('torso','armR'),('torso','armL'),('torso','legR'),('torso','legL'),('armR','anchor')]}
def allowed(a,b): return a==b or frozenset((a,b)) in ok
# weld
q=np.round(P/1e-4).astype(np.int64); _,rep=np.unique(q,axis=0,return_inverse=True); rep=rep.ravel()
tri_ok=np.array([allowed(R[a],R[b]) and allowed(R[b],R[c]) and allowed(R[a],R[c]) for a,b,c in I])
print('cut tris',(~tri_ok).sum(),'of',len(I))
# coincident verts with disallowed regions: don't weld them
E=[]
for a,b,c in I[tri_ok]: E+= [(a,b),(b,c),(c,a)]
E=np.array(E)
# weld edges: verts sharing position and allowed regions
order=np.argsort(rep); 
groups={}
for v in range(n): groups.setdefault(rep[v],[]).append(v)
WE=[(g[0],v) for g in groups.values() if len(g)>1 for v in g[1:] if allowed(R[g[0]],R[v])]
E=np.vstack([E,np.array(WE)]) if WE else E
A=coo_matrix((np.ones(len(E)),(E[:,0],E[:,1])),shape=(n,n)); A=((A+A.T)>0).astype(float)
deg=np.array(A.sum(1)).ravel(); deg[deg==0]=1
rigid=(R=='anchor')
for it in range(10):
  Wn=0.5*W+0.5*(A@W)/deg[:,None]
  Wn[rigid]=W[rigid]
  W=Wn
W[rigid]=0; W[rigid,ix['handR']]=1
# top4
si=np.argsort(-W,1)[:,:4]; sw=np.take_along_axis(W,si,1); sw/=sw.sum(1,keepdims=True)
cnt={r:int((R==r).sum()) for r in cand}; print(cnt)
json.dump({'bones':[{'name':b[0],'parent':b[1],'p':list(b[2])} for b in B],'si':si.ravel().tolist(),'sw':np.round(sw.ravel(),4).tolist(),'index':I[tri_ok].ravel().tolist(),'region':[str(r) for r in R]},open('drowned_rig.json','w'))
# label plot
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
col={'head':'r','torso':'k','armR':'b','armL':'c','legR':'g','legL':'y','anchor':'m'}
fig,ax=plt.subplots(1,2,figsize=(14,10))
for a,(i,j) in zip(ax,[(0,1),(2,1)]):
  for r,c in col.items():
    m=R==r; a.scatter(P[m,i],P[m,j],s=1,c=c,label=r)
  a.plot(pos[:,i],pos[:,j],'o',color='orange',ms=4); a.set_aspect('equal')
ax[0].legend(markerscale=6); plt.tight_layout(); plt.savefig('regions.png',dpi=80)
