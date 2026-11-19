import numpy as np
B=[('root',None,(0.08,-1,0.0)),('hips','root',(0.08,-0.15,0.0)),('spine','hips',(0.08,0.1,0.0)),('chest','spine',(0.08,0.35,0.0)),
('neck','chest',(0.06,0.6,0.02)),('head','neck',(0.06,0.68,0.03)),('headEnd','head',(0.06,0.9,0.03)),
('uarmR','chest',(-0.12,0.55,0.0)),('farmR','uarmR',(-0.21,0.27,0.0)),('handR','farmR',(-0.25,-0.02,0.03)),('handRend','handR',(-0.3,-0.18,0.03)),
('uarmL','chest',(0.25,0.55,0.0)),('farmL','uarmL',(0.34,0.28,0.0)),('handL','farmL',(0.36,0.0,0.0)),('handLend','handL',(0.36,-0.12,0.0)),
('thighR','hips',(-0.02,-0.18,0.0)),('shinR','thighR',(-0.03,-0.52,0.03)),('footR','shinR',(-0.04,-0.9,0.0)),('toeR','footR',(-0.04,-0.98,0.1)),
('thighL','hips',(0.19,-0.18,-0.03)),('shinL','thighL',(0.2,-0.52,-0.1)),('footL','shinL',(0.21,-0.9,-0.17)),('toeL','footL',(0.21,-0.98,-0.05))]
def regions(x,y,z):
  R=np.full(len(x),'torso',dtype=object)
  R[(y>0.64)]='head'
  R[(y<-0.25)&(x<0.08)]='legR'; R[(y<-0.25)&(x>=0.08)]='legL'
  R[(x<-0.16)&(y>-0.28)&(y<0.56)]='armR'
  R[(x>0.27)&(y>-0.2)&(y<0.56)]='armL'
  R[((x<-0.27)&(y<-0.08))|(x<-0.4)]='staff'
  R[x>0.45]='lantern'
  return R
cand={'head':['neck','head'],'torso':['hips','spine','chest','neck'],'armR':['chest','uarmR','farmR','handR'],'armL':['chest','uarmL','farmL','handL'],
'legR':['hips','thighR','shinR','footR'],'legL':['hips','thighL','shinL','footL'],'staff':['handR'],'lantern':['handL']}
rigid={'staff':'handR','lantern':'handL'}
ok=[('head','torso'),('torso','armR'),('torso','armL'),('torso','legR'),('torso','legL'),('armR','staff'),('armL','lantern')]
