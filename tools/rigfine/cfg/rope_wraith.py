import numpy as np
B=[('root',None,(0.05,-1,0.0)),('hips','root',(0.05,0.0,0.0)),('spine','hips',(0.05,0.2,0.0)),('chest','spine',(0.05,0.42,0.0)),
('neck','chest',(0.06,0.6,0.02)),('head','neck',(0.07,0.7,0.05)),('headEnd','head',(0.07,0.98,0.1)),
('uarmR','chest',(-0.18,0.6,0.05)),('farmR','uarmR',(-0.3,0.5,0.3)),('handR','farmR',(-0.42,0.4,0.55)),('handRend','handR',(-0.45,0.4,0.7)),
('uarmL','chest',(0.26,0.6,0.05)),('farmL','uarmL',(0.38,0.45,0.2)),('handL','farmL',(0.5,0.3,0.38)),('handLend','handL',(0.56,0.25,0.5)),
('robe1','hips',(0.05,-0.3,0.0)),('robe2','robe1',(0.05,-0.62,0.0)),('robe3','robe2',(0.08,-0.85,0.05)),('robeEnd','robe3',(0.12,-1.0,0.15))]
def regions(x,y,z):
  R=np.full(len(x),'torso',dtype=object)
  R[(y>0.62)&(np.abs(x-0.07)<0.24)]='head'
  R[(x<-0.22)&(y>0.15)]='armR'; R[(x>0.28)&(y>0.12)]='armL'
  R[(z>0.3)&(y>0.15)&(x<0.05)]='armR'; R[(z>0.3)&(y>0.12)&(x>=0.05)]='armL'
  R[y<-0.05]='robe'
  return R
cand={'head':['neck','head'],'torso':['hips','spine','chest','neck'],'armR':['chest','uarmR','farmR','handR'],'armL':['chest','uarmL','farmL','handL'],
'robe':['hips','robe1','robe2','robe3']}
ok=[('head','torso'),('torso','armR'),('torso','armL'),('torso','robe')]
iters=14
