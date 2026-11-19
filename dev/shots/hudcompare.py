# v0.9.6c 新旧 HUD 对比图：python3 tools/preview/hudcompare.py → 项目根 sample_v096c_hud.png
from PIL import Image, ImageDraw, ImageFont
O='tools/preview/out/'
F=ImageFont.truetype('/home/sandbox/.fonts/NotoSansSC-Bold.otf',26); f2=ImageFont.truetype('/home/sandbox/.fonts/NotoSansSC-Regular.otf',18)
pc=[Image.open(O+'old_pc.png').convert('RGB'),Image.open(O+'new_pc.png').convert('RGB')]
ph=[Image.open(O+'old_phone.png').convert('RGB'),Image.open(O+'new_phone.png').convert('RGB')]
W=1280; pad=16; lab=44
phs=[p.resize((int(p.width*(W/2-pad)/p.width*1), int(p.height*(W/2-pad)/p.width))) for p in ph]
H=lab+720+pad+lab+720+pad+lab+phs[0].height+pad+60
im=Image.new('RGB',(W+pad*2,H),(18,12,8)); d=ImageDraw.Draw(im)
y=pad
for i,(p,t) in enumerate(zip(pc,['旧版 v0.9.6b · 电脑','新版 v0.9.6c 符文 HUD · 电脑（含太古掉落横幅演示）'])):
    d.text((pad,y),t,font=F,fill=(255,214,120) if i else (190,180,170)); y+=lab; im.paste(p,(pad,y)); y+=720+pad
d.text((pad,y),'手机 740×360：左 旧版 / 右 新版（手机保留左上血条，通知栏移到顶部居中）',font=F,fill=(255,214,120)); y+=lab
im.paste(phs[0],(pad,y)); im.paste(phs[1],(pad+W//2+pad//2,y)); y+=phs[0].height+pad
d.text((pad,y),'血球/资源球+经验弧 · 技能冷却扫光+就绪火星 · 罗盘刻度+单行区域名+符文按钮 · 首领阶段符印+施法条 · 右侧统一通知栏 · 左侧任务羊皮纸条',font=f2,fill=(220,200,170))
im.save('/workspace/projects/9401ed73-b598-4f4e-8980-fe4bc516f83a/sample_v096c_hud.png'); print(im.size)
