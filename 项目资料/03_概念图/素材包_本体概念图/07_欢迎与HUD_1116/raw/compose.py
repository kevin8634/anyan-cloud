from PIL import Image,ImageDraw,ImageFont,ImageFilter
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
OUT=".."
SRC="../../07_创角_1116/"
B="/home/sandbox/.fonts/NotoSansSC-Bold.otf";R="/home/sandbox/.fonts/NotoSansSC-Regular.otf"
F=lambda p,s:ImageFont.truetype(p,s)
GOLD=(232,196,120);PALE=(245,228,190);INK=(52,34,18);DIM=(170,150,120)
CLS=[("法师","A_bell_sanctum",(788,190)),("战士","B_storm_cliff",(758,180)),("猎手","C_campfire_camp",(782,170)),
     ("负棺人","D_void_forge",(798,160)),("时砂行者","E_chrono_sands",(758,190)),("炼金投弹手","F_alchemy_lab",(748,150))]
_faces={}
def face(i,d):
    n,f,(x,y)=CLS[i]
    if f not in _faces: _faces[f]=Image.open(SRC+f+".jpg").convert("RGB")
    im=_faces[f].crop((x-70,y-70,x+70,y+70)).resize((d,d),Image.LANCZOS)
    m=Image.new("L",(d,d),0);ImageDraw.Draw(m).ellipse((0,0,d-1,d-1),fill=255)
    return im,m
def txt(d,xy,s,font,fill,anchor="la",sh=True):
    if sh: d.text((xy[0]+2,xy[1]+2),s,font=font,fill=(0,0,0),anchor=anchor)
    d.text(xy,s,font=font,fill=fill,anchor=anchor)
def para(d,x,y,w,s,font,fill,lh):
    line=""
    for ch in s:
        if d.textlength(line+ch,font=font)>w: d.text((x,y),line,font=font,fill=fill);y+=lh;line=ch
        else: line+=ch
    if line: d.text((x,y),line,font=font,fill=fill);y+=lh
    return y

def hud(src,out,L,sel,info):
    im=Image.open(src).convert("RGB");d=ImageDraw.Draw(im)
    # left roster
    saves=[(0,"薇拉·钟语","Lv.42 法师"),(3,"墨尔·负棺","Lv.37 负棺人"),(1,"格雷恩","Lv.18 战士"),(5,"欧文·硝火","Lv.9 炼金投弹手")]
    for (ci,nm,lv),(cx,cy,r) in zip(saves,L["rings"]):
        fi,m=face(ci,2*r-8);im.paste(fi,(cx-r+4,cy-r+4),m)
        tx=L["tx"];txt(d,(tx,cy-26),nm,F(B,23),PALE);txt(d,(tx,cy+6),lv,F(R,18),GOLD)
    px,py=L["plus"];txt(d,(px,py),"新建角色",F(B,22),PALE,anchor="mm")
    txt(d,L["roster_title"],"角色列表",F(B,22),GOLD,anchor="mm")
    # right detail
    bx,by=L["banner"];d.text((bx,by),info["name"],font=F(B,34),fill=INK,anchor="mm",stroke_width=2,stroke_fill=(236,214,170))
    dx,dy=L["diff"];txt(d,(dx,dy),"难度",F(B,18),PALE,anchor="rm")
    # dim unused diamonds
    for k,(gx,gy) in enumerate(L["gems"]):
        if k>=info["diff"]: d.ellipse((gx-11,gy-11,gx+11,gy+11),fill=(40,30,22))
    x0,y0,w=L["parch"]
    y=y0
    d.text((x0,y),"定位",font=F(B,20),fill=(120,40,20));y+=30
    y=para(d,x0,y,w,info["role"],F(R,19),INK,27)+12
    d.text((x0,y),"职业简介",font=F(B,20),fill=(120,40,20));y+=30
    y=para(d,x0,y,w,info["desc"],F(R,18),INK,26)+12
    d.text((x0,y),"招牌技能",font=F(B,20),fill=(120,40,20));y+=30
    for s,e in info["skills"]:
        d.text((x0,y),"◆ "+s,font=F(B,19),fill=INK);y+=26
        y=para(d,x0+22,y,w-22,e,F(R,16),(70,48,28),23)+6
    for (sx,sy,sw),(s,_),col in zip(L["sockets"],info["skills"],info["skcol"]):
        # glyph-ish icon: radial glow + first char
        g=Image.new("RGBA",(sw,sw),(0,0,0,0));gd=ImageDraw.Draw(g)
        for rr in range(sw//2,0,-2):
            a=int(230*(1-rr/(sw/2)))
            gd.ellipse((sw/2-rr,sw/2-rr,sw/2+rr,sw/2+rr),fill=col+(a,))
        im.paste(g,(sx,sy),g);d=ImageDraw.Draw(im)
        txt(d,(sx+sw//2,sy+sw//2),s[0],F(B,int(sw*0.45)),PALE,anchor="mm")
        txt(d,(sx+sw//2,sy+sw+14),s[:4],F(R,14),PALE,anchor="mm")
    # bottom class strip
    cx0,cy,step,r=L["strip"]
    bar=Image.new("RGBA",im.size,(0,0,0,0));bd=ImageDraw.Draw(bar)
    bd.rounded_rectangle((cx0-r-24,cy-r-10,cx0+5*step+r+24,cy+r+34),18,fill=(10,8,8,170),outline=(150,115,60,255),width=2)
    im.paste(bar,(0,0),bar);d=ImageDraw.Draw(im)
    for i in range(6):
        x=cx0+i*step;rr=r+(6 if i==sel else 0)
        ring=(255,214,120) if i==sel else (150,120,70)
        if i==sel:
            for k in range(14,0,-2): d.ellipse((x-rr-k,cy-rr-k,x+rr+k,cy+rr+k),outline=(255,200,100,),width=1)
        d.ellipse((x-rr-4,cy-rr-4,x+rr+4,cy+rr+4),fill=ring)
        fi,m=face(i,2*rr);
        if i!=sel: fi=Image.blend(fi,Image.new("RGB",fi.size,(20,15,10)),0.35)
        im.paste(fi,(x-rr,cy-rr),m);d=ImageDraw.Draw(im)
        txt(d,(x,cy+r+18),CLS[i][0],F(B,15 if len(CLS[i][0])<5 else 13),PALE if i==sel else DIM,anchor="mm")
    # name field + button
    nx,ny=L["name"];txt(d,(nx,ny),"角色名：",F(B,24),INK,anchor="lm",sh=False)
    d.text((nx+110,ny),info["nick"],font=F(R,24),fill=(60,40,20),anchor="lm")
    cw=d.textlength(info["nick"],font=F(R,24));d.line((nx+114+cw,ny-14,nx+114+cw,ny+14),fill=INK,width=2)
    d.text((nx+330,ny),"2–12 字，可用中英文",font=F(R,16),fill=(70,50,25),anchor="lm")
    ex,ey=L["enter"];txt(d,(ex,ey),"进入游戏",F(B,36),(255,240,210),anchor="mm")
    im.save(out,"JPEG",quality=88)

MAGE=dict(name="法　师",diff=2,nick="薇拉",role="远程施法 · 火焰 / 冰霜 / 奥术",
 desc="远程施法，火焰、冰霜、奥术三系。霜环冻结近身敌人，奥术禁锢打断读条，陨星坠落毁天灭地。",
 skills=[("霜环","冻结近身敌人"),("奥术禁锢","打断读条"),("陨星坠落","大招 · 毁天灭地")],
 skcol=[(120,190,255),(170,120,255),(240,200,120)])
COFF=dict(name="负棺人",diff=3,nick="墨尔",role="近战 · 收魂开棺",
 desc="背着铁棺行走的不死送葬者。击杀敌人把魂收进棺里：背棺链甩、立棺成碑、开棺放魂出招；倒下时躺进棺里，用魂换命。",
 skills=[("拖棺冲锋","拖着铁棺冲入敌阵"),("丧钟","可打断读条"),("开棺","放魂出招")],
 skcol=[(200,120,255),(140,90,220),(120,255,200)])
L1=dict(rings=[(93,250,44),(93,370,44),(93,486,44),(93,600,44)],tx=152,plus=(183,795),roster_title=(183,163),
 banner=(1360,212),diff=(1300,272),gems=[(1330,272),(1360,272),(1390,272)],parch=(1245,300,235),
 sockets=[(1236,716,64),(1326,716,64),(1416,716,64)],strip=(470,858,118,30),name=(285,963),enter=(1315,963))
L2=dict(rings=[(85,221,42),(85,340,42),(85,454,42),(85,569,42)],tx=142,plus=(165,765),roster_title=(165,140),
 banner=(1360,205),diff=(1300,251),gems=[(1322,251),(1357,251),(1393,251)],parch=(1242,292,228),
 sockets=[(1243,720,66),(1332,720,66),(1418,720,66)],strip=(470,858,118,30),name=(345,962),enter=(1335,958))
hud("H1_mage_v2.png",OUT+"/H1_mage.jpg",L1,0,MAGE)
hud("H2_coffin_v2.png",OUT+"/H2_coffin.jpg",L2,3,COFF)
