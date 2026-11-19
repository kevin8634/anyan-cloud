# raidA 11-02 首领莫尔维斯（鮟鱇，非人形）本地精绑配置：python3 tools/rigfine/rigfine2.py tools/rigfine/cfg/morvis.py model.json rig.json [regions.png]
# 坐标 = Lux3D 原始件 4513869 原坐标（+Z 朝前 / 头，+Y 上，+X = 鱼的左侧；长 1.0，高 0.72，最低点 y=-0.364）
# 骨骼：root（地面）→ body 身体根 → chest 身体前段 → head 头 → jaw 下颌 / lure1-3 诱饵杆 → lureLamp 诱饵灯
#       body → tail1-3 尾 → tailEnd；body → finL/finR 前鳍肢（胸鳍）；body → ventL/ventR 腹鳍（下垂的两条"腿"）
import numpy as np
B=[('root',None,(0,-0.364,0.0)),
('body','root',(0,0.075,0.0)),('chest','body',(0,0.08,0.13)),('head','chest',(0,0.085,0.22)),('headEnd','head',(0,0.09,0.40)),
('jaw','head',(0,0.0,0.19)),('jawEnd','jaw',(0,-0.11,0.40)),
('lure1','head',(0,0.19,0.285)),('lure2','lure1',(0,0.262,0.345)),('lure3','lure2',(0,0.27,0.415)),('lureLamp','lure3',(0,0.18,0.468)),('lampEnd','lureLamp',(0,0.11,0.495)),
('tail1','body',(0,0.08,-0.12)),('tail2','tail1',(0,0.085,-0.24)),('tail3','tail2',(0,0.09,-0.34)),('tailEnd','tail3',(0,0.09,-0.50)),
('finL','chest',(0.165,0.025,0.10)),('finLt','finL',(0.25,0.0,-0.01)),('finR','chest',(-0.165,0.025,0.10)),('finRt','finR',(-0.25,0.0,-0.01)),
('ventL','body',(0.08,-0.12,0.13)),('ventLt','ventL',(0.17,-0.355,0.07)),('ventR','body',(-0.08,-0.12,0.13)),('ventRt','ventR',(-0.17,-0.355,0.07))]
def regions(x,y,z):
  R=np.full(len(x),'body',dtype=object)
  ax=np.abs(x)
  R[(z>0.17)&(y<-0.012+0.06*np.clip((0.22-z)/0.05,0,1))&(y>-0.2)]='jaw'          # 下颌：嘴角之后向上收一点
  R[(y>0.185)&(z>0.275)&(ax<0.05)]='lure'                                          # 诱饵杆（头顶上方）
  R[(z>0.43)&(y>0.15)&(ax<0.05)]='lure'
  R[(z>0.448)&(y>0.085)&(y<0.2)&(ax<0.045)]='lamp'                                 # 诱饵灯泡（刚性）
  R[(x>0.165)&(z>-0.03)&(z<0.135)&(y>-0.055)&(y<0.09)]='finL'
  R[(x<-0.165)&(z>-0.03)&(z<0.135)&(y>-0.055)&(y<0.09)]='finR'
  R[(y<-0.13)&(z>0.03)&(z<0.175)&(x>0.035)]='ventL'
  R[(y<-0.13)&(z>0.03)&(z<0.175)&(x<-0.035)]='ventR'
  return R
cand={'body':['tail3','tail2','tail1','body','chest','head'],'jaw':['head','jaw'],'lure':['lure1','lure2','lure3'],
'finL':['chest','finL'],'finR':['chest','finR'],'ventL':['body','ventL'],'ventR':['body','ventR']}
rigid={'lamp':'lureLamp'}
ok=[('body','jaw'),('body','lure'),('lure','lamp'),('body','finL'),('body','finR'),('body','ventL'),('body','ventR'),('jaw','ventL'),('jaw','ventR'),('jaw','lure'),('jaw','finL'),('jaw','finR')]
sk=0.6; smin=0.06
bsig={'tail1':0.085,'tail2':0.085,'tail3':0.085,'body':0.085,'chest':0.085,'head':0.085,'jaw':0.1,'finL':0.06,'finR':0.06}
iters=12
