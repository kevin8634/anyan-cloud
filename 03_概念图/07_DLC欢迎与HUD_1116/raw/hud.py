from PIL import Image,ImageDraw,ImageFont,ImageFilter
R="/workspace/work/anyan-cloud/03_概念图/07_DLC欢迎与HUD_1116/"
B="/home/sandbox/.fonts/NotoSansSC-Bold.otf";RG="/home/sandbox/.fonts/NotoSansSC-Regular.otf"
F=lambda p,s:ImageFont.truetype(p,s)
TEAL=(84,214,200);PALE=(214,240,236);DIM=(120,150,150);CYAN=(150,250,240);COPPER=(176,120,80)
CLS=["法师","战士","猎手","负棺人","时砂行者","炼金投弹手"]
W2=Image.open(R+"raw/W2_heroes.png").convert("RGB")
FACE=[(206,406),(420,381),(637,437),(900,421),(1105,426),(1368,426)]
def face(i,d,dim=False):
    x,y=FACE[i];im=W2.crop((x-48,y-48,x+48,y+48)).resize((d,d),Image.LANCZOS)
    if dim: im=Image.blend(im,Image.new("RGB",im.size,(6,14,18)),0.45)
    m=Image.new("L",(d,d),0);ImageDraw.Draw(m).ellipse((0,0,d-1,d-1),fill=255);return im,m
def panel(im,box,r=14,a=200,glow=True):
    lay=Image.new("RGBA",im.size,(0,0,0,0));d=ImageDraw.Draw(lay)
    d.rounded_rectangle(box,r,fill=(6,16,22,a))
    if glow:
        g=Image.new("RGBA",im.size,(0,0,0,0));ImageDraw.Draw(g).rounded_rectangle(box,r,outline=TEAL+(200,),width=4)
        lay.alpha_composite(g.filter(ImageFilter.GaussianBlur(6)))
    d.rounded_rectangle(box,r,outline=(40,60,64,255),width=5)
    d.rounded_rectangle(box,r,outline=TEAL+(255,),width=1)
    x0,y0,x1,y1=box
    for cx,cy in ((x0,y0),(x1,y0),(x0,y1),(x1,y1)):   # copper rivets
        d.ellipse((cx-5,cy-5,cx+5,cy+5),fill=COPPER+(255,),outline=(40,30,20,255))
    im.alpha_composite(lay)
def txt(im,xy,s,font,fill,anchor="la"):
    d=ImageDraw.Draw(im);d.text((xy[0]+2,xy[1]+2),s,font=font,fill=(0,0,0,255),anchor=anchor);d.text(xy,s,font=font,fill=fill,anchor=anchor)
def para(im,x,y,w,s,font,fill,lh):
    d=ImageDraw.Draw(im);line=""
    for ch in s:
        if d.textlength(line+ch,font=font)>w and ch not in "，。、；：）": d.text((x,y),line,font=font,fill=fill);y+=lh;line=ch
        else: line+=ch
    if line: d.text((x,y),line,font=font,fill=fill);y+=lh
    return y
def hud(src,out,sel,info):
    im=Image.open(src).convert("RGBA")
    # LEFT roster
    panel(im,(44,120,334,872))
    txt(im,(189,152),"角色列表",F(B,24),CYAN,"mm")
    ImageDraw.Draw(im).line((70,178,308,178),fill=TEAL+(160,),width=1)
    saves=[(0,"薇拉·钟语","Lv.40 法师"),(3,"墨尔·负棺","Lv.37 负棺人"),(2,"芙蕾·兽契","Lv.33 猎手"),(1,"格雷恩","Lv.30 战士")]
    for k,(ci,nm,lv) in enumerate(saves):
        y=196+k*128;on=(ci==sel)
        panel(im,(60,y,318,y+112),10,170 if not on else 210,glow=on)
        fi,m=face(ci,80);d=ImageDraw.Draw(im);d.ellipse((70,y+12,158,y+100),fill=(TEAL if on else (60,80,84))+(255,))
        im.paste(fi,(74,y+16),m)
        txt(im,(170,y+28),nm,F(B,22),PALE);txt(im,(170,y+64),lv,F(RG,17),TEAL if on else DIM)
    panel(im,(60,712,318,800),10,150,glow=False)
    txt(im,(189,756),"＋  新建角色",F(B,22),PALE,"mm")
    txt(im,(189,840),"DLC 存档 · 等级上限 40",F(RG,15),DIM,"mm")
    # RIGHT detail
    X0,X1=1200,1492
    panel(im,(X0,120,X1,872))
    txt(im,((X0+X1)//2,162),info["name"],F(B,34),CYAN,"mm")
    d=ImageDraw.Draw(im);d.line((X0+26,192,X1-26,192),fill=TEAL+(160,),width=1)
    txt(im,(X0+26,216),"难度",F(B,18),PALE)
    for k in range(3):
        gx,gy=X0+100+k*30,228;c=CYAN if k<info["diff"] else (40,60,64)
        d.polygon([(gx,gy-10),(gx+10,gy),(gx,gy+10),(gx-10,gy)],fill=c+(255,),outline=TEAL+(255,))
    x0,w=X0+26,X1-X0-52;y=256
    def h(s,y): txt(im,(x0,y),s,F(B,19),COPPER);return y+30
    y=h("定位",y);y=para(im,x0,y,w,info["role"],F(RG,18),PALE,26)+10
    y=h("职业简介",y);y=para(im,x0,y,w,info["desc"],F(RG,17),(190,214,212),25)+10
    y=h("招牌技能",y)
    for s,e in info["skills"]:
        ImageDraw.Draw(im).text((x0,y),"◆ "+s,font=F(B,18),fill=PALE);y+=25
        y=para(im,x0+22,y,w-22,e,F(RG,15),DIM,22)+4
    for k,((s,_),col) in enumerate(zip(info["skills"],info["skcol"])):
        sx,sy,sw=X0+30+k*86,756,66
        g=Image.new("RGBA",(sw,sw),(0,0,0,0));gd=ImageDraw.Draw(g)
        for rr in range(sw//2,0,-2): gd.ellipse((sw/2-rr,sw/2-rr,sw/2+rr,sw/2+rr),fill=col+(int(230*(1-rr/(sw/2))),))
        d=ImageDraw.Draw(im);d.rectangle((sx-3,sy-3,sx+sw+2,sy+sw+2),fill=(8,18,24,255),outline=TEAL+(255,),width=2)
        im.alpha_composite(g,(sx,sy));txt(im,(sx+sw//2,sy+sw//2),s[0],F(B,30),PALE,"mm")
        txt(im,(sx+sw//2,sy+sw+16),s[:4],F(RG,14),PALE,"mm")
    # BOTTOM class strip
    cx0,cy,step,r=470,850,118,32
    panel(im,(cx0-r-26,cy-r-12,cx0+5*step+r+26,cy+r+34),16,190,glow=False)
    for i in range(6):
        x=cx0+i*step;on=i==sel;rr=r+(6 if on else 0);d=ImageDraw.Draw(im)
        if on:
            g=Image.new("RGBA",im.size,(0,0,0,0));ImageDraw.Draw(g).ellipse((x-rr-10,cy-rr-10,x+rr+10,cy+rr+10),fill=CYAN+(170,))
            im.alpha_composite(g.filter(ImageFilter.GaussianBlur(8)));d=ImageDraw.Draw(im)
        d.ellipse((x-rr-4,cy-rr-4,x+rr+4,cy+rr+4),fill=(CYAN if on else (70,92,96))+(255,))
        fi,m=face(i,2*rr,not on);im.paste(fi,(x-rr,cy-rr),m)
        txt(im,(x,cy+r+20),CLS[i],F(B,15 if len(CLS[i])<5 else 13),PALE if on else DIM,"mm")
    # name field + enter button (bottom band)
    panel(im,(250,926,900,984),10,215,glow=False);d=ImageDraw.Draw(im)
    d.text((272,955),"角色名：",font=F(B,24),fill=PALE,anchor="lm")
    d.text((382,955),info["nick"],font=F(RG,24),fill=CYAN,anchor="lm")
    cw=d.textlength(info["nick"],font=F(RG,24));d.line((386+cw,941,386+cw,969),fill=CYAN,width=2)
    d.text((600,955),"2–12 字，可用中英文",font=F(RG,16),fill=DIM,anchor="lm")
    panel(im,(1000,918,1290,992),14,230,glow=True)
    g=Image.new("RGBA",im.size,(0,0,0,0));ImageDraw.Draw(g).text((1145,955),"进入游戏",font=F(B,36),fill=(60,220,210,255),anchor="mm")
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(8)))
    ImageDraw.Draw(im).text((1145,955),"进入游戏",font=F(B,36),fill=(226,252,248,255),anchor="mm",stroke_width=2,stroke_fill=(8,36,40,255))
    im.convert("RGB").save(out,"JPEG",quality=90)
MAGE=dict(name="法　师",diff=2,nick="薇拉",role="远程施法 · 火焰 / 冰霜 / 奥术",
 desc="远程施法，火焰、冰霜、奥术三系。霜环冻结近身敌人，奥术禁锢打断读条，陨星坠落毁天灭地。",
 skills=[("霜环","冻结近身敌人"),("奥术禁锢","打断读条"),("陨星坠落","大招 · 毁天灭地")],
 skcol=[(120,200,255),(90,220,210),(170,240,255)])
COFF=dict(name="负棺人",diff=3,nick="墨尔",role="近战 · 重甲 · 收魂开棺",
 desc="鸣钟人的送葬者，死后仍背着铁棺守约。击杀敌人把魂收进棺里：背棺链甩、立棺成碑、开棺放魂出招；倒下时躺进棺里，用魂换命。",
 skills=[("拖棺冲锋","拖着铁棺冲入敌阵"),("丧钟","可打断读条"),("开棺","放魂出招")],
 skcol=[(120,230,220),(90,180,200),(160,255,230)])
hud(R+"raw/H1_ui.png",R+"H1_mage.jpg",0,MAGE)
hud(R+"raw/H2_ui_fix.png",R+"H2_coffin.jpg",3,COFF)
print("ok")
