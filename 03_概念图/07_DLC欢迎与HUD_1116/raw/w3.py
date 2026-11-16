from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageChops
R="/workspace/work/anyan-cloud/03_概念图/07_DLC欢迎与HUD_1116/"
lg=Image.open("/workspace/work/dlcwh/logo/f_056.png").convert("RGB").crop((100,60,1180,680))
W=1020;lg=lg.resize((W,int(lg.height*W/lg.width)),Image.LANCZOS);w,h=lg.size
bg=Image.open(R+"raw/W3_logo.png").convert("RGB")
m=Image.new("L",(w,h),0);ImageDraw.Draw(m).rectangle((50,35,w-51,h-51),fill=255);m=m.filter(ImageFilter.GaussianBlur(25))
lg=ImageChops.multiply(lg,Image.merge("RGB",(m,m,m)))
x0=(1536-w)//2;y0=40
reg=bg.crop((x0,y0,x0+w,y0+h))
dark=Image.blend(reg,Image.new("RGB",reg.size,(0,0,0)),0.35)
reg=Image.composite(dark,reg,m)
reg=ImageChops.screen(reg,lg)
im=bg.copy();im.paste(reg,(x0,y0))
# button text
F=ImageFont.truetype("/home/sandbox/.fonts/NotoSansSC-Bold.otf",50)
cx,cy=767,893;s="开始冒险"
glow=Image.new("RGBA",im.size,(0,0,0,0));gd=ImageDraw.Draw(glow)
gd.text((cx,cy),s,font=F,fill=(60,220,210,255),anchor="mm")
glow=glow.filter(ImageFilter.GaussianBlur(9))
im=im.convert("RGBA");im.alpha_composite(glow);im.alpha_composite(glow)
d=ImageDraw.Draw(im)
d.text((cx,cy),s,font=F,fill=(214,248,242,255),anchor="mm",stroke_width=2,stroke_fill=(10,40,44,255))
im.convert("RGB").save(R+"W3_logo.jpg","JPEG",quality=90)
print("ok")
