import html
R='<span class="redact" style="width:{}px"></span>'
def esc(s): return html.escape(s)
CSS=r'''
@font-face{font-family:NS;src:url(file:///home/sandbox/.fonts/NotoSansSC-Regular.otf);font-weight:400}
@font-face{font-family:NS;src:url(file:///home/sandbox/.fonts/NotoSansSC-Bold.otf);font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1280px;background:#05070d;font-family:NS,sans-serif;color:#d6e2f5;padding:36px}
.win{border-radius:18px;overflow:hidden;border:1px solid rgba(90,200,255,.35);
 box-shadow:0 0 0 1px rgba(160,100,255,.15),0 0 60px rgba(40,160,255,.18),0 30px 80px rgba(0,0,0,.6);
 background:radial-gradient(1200px 600px at 80% -10%,rgba(120,70,255,.22),transparent 60%),
 radial-gradient(900px 600px at 0% 110%,rgba(0,200,255,.14),transparent 60%),linear-gradient(180deg,#0b1020,#070a14);position:relative}
.win:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(80,160,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(80,160,255,.05) 1px,transparent 1px);background-size:32px 32px;pointer-events:none}
.top{height:52px;display:flex;align-items:center;gap:14px;padding:0 20px;border-bottom:1px solid rgba(90,200,255,.18);background:rgba(10,16,32,.8);position:relative}
.dots span{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:7px}
.ttl{font-family:'DejaVu Sans Mono',monospace;font-size:13px;letter-spacing:3px;color:#7fdcff}
.ttl b{color:#b99bff}
.st{margin-left:auto;display:flex;gap:10px;font-family:'DejaVu Sans Mono',monospace;font-size:11px;letter-spacing:1px}
.chip{padding:4px 10px;border-radius:20px;border:1px solid rgba(90,200,255,.35);color:#8fe3ff}
.chip.g{border-color:rgba(80,255,170,.4);color:#7dffbf}
.chip.g:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#3dff9e;box-shadow:0 0 8px #3dff9e;margin-right:6px}
.body{display:flex;position:relative}
.side{width:300px;padding:26px 18px;border-right:1px solid rgba(90,200,255,.14);background:rgba(6,10,22,.55)}
.sh{font-family:'DejaVu Sans Mono',monospace;font-size:11px;letter-spacing:3px;color:#5e7aa3;margin:0 10px 16px}
.it{padding:11px 14px;border-radius:10px;margin-bottom:4px;font-size:16px;line-height:1.4;color:#7e8fae;border:1px solid transparent}
.it.on{color:#fff;background:linear-gradient(90deg,rgba(0,200,255,.18),rgba(140,90,255,.08));border-color:rgba(90,200,255,.4);box-shadow:inset 3px 0 0 #3fd4ff,0 0 20px rgba(0,180,255,.15);font-weight:700}
.badge{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;font-weight:400;padding:3px 10px;border-radius:14px;background:rgba(255,190,60,.12);border:1px solid rgba(255,190,60,.45);color:#ffcf6b}
.badge i{width:10px;height:10px;border:2px solid #ffcf6b;border-top-color:transparent;border-radius:50%}
.chat{flex:1;padding:26px 34px 30px;display:flex;flex-direction:column;gap:18px}
.row{display:flex;gap:12px;align-items:flex-start}
.row.u{justify-content:flex-end}
.av{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-family:'DejaVu Sans Mono',monospace;font-size:11px;font-weight:700}
.av.a{background:linear-gradient(135deg,#1ec8ff,#7b5cff);color:#fff;box-shadow:0 0 16px rgba(60,180,255,.5)}
.av.u{background:#1a2238;color:#ffcf6b;border:1px solid rgba(255,200,100,.4)}
.msg{max-width:640px;font-size:15.5px;line-height:1.65;padding:13px 17px;border-radius:14px}
.a .msg{background:rgba(16,26,48,.78);border:1px solid rgba(90,200,255,.28);border-top-left-radius:4px;color:#dbe7fa}
.u .msg{background:linear-gradient(135deg,rgba(130,80,255,.35),rgba(40,120,255,.28));border:1px solid rgba(170,130,255,.45);border-top-right-radius:4px;color:#fff}
.msg.cut{-webkit-mask:linear-gradient(transparent,#000 40%)}
.msg.sys{background:rgba(255,170,40,.08)!important;border:1px solid rgba(255,180,60,.45)!important;color:#ffd894!important;font-family:NS}
.card{max-width:640px;width:640px;border-radius:14px;border:1px solid rgba(90,200,255,.35);background:rgba(10,18,36,.85);overflow:hidden;box-shadow:0 0 24px rgba(0,160,255,.12)}
.ch{padding:14px 18px;border-bottom:1px solid rgba(90,200,255,.18);background:linear-gradient(90deg,rgba(0,200,255,.12),transparent)}
.ch h3{font-size:18px;color:#fff;font-weight:700}
.ch p{font-family:'DejaVu Sans Mono',NS,monospace;font-size:12px;color:#6f8cb5;margin-top:4px}
.cb{padding:14px 20px 16px;font-size:14.5px;line-height:1.65;color:#c8d6ee;-webkit-mask:linear-gradient(#000 60%,transparent)}
.cb h4{font-size:14.5px;color:#7fdcff;margin-bottom:6px}
.cb li{margin-left:20px}
.redact{display:inline-block;height:14px;vertical-align:middle;border-radius:3px;background:repeating-linear-gradient(90deg,#3a4a6a 0 8px,#26324d 8px 16px);margin:0 3px}
.foot{display:flex;align-items:center;gap:12px;margin-top:6px;padding:12px 16px;border-radius:12px;border:1px solid rgba(90,200,255,.25);background:rgba(8,14,30,.8);font-family:'DejaVu Sans Mono',monospace;font-size:13px;color:#5e7aa3}
.foot .cur{width:9px;height:17px;background:#3fd4ff;box-shadow:0 0 10px #3fd4ff}
.foot .send{margin-left:auto;padding:5px 14px;border-radius:8px;background:linear-gradient(135deg,#1ec8ff,#7b5cff);color:#fff;font-weight:700}
'''
def a(t,cls=''): return f'<div class="row a"><div class="av a">AI</div><div class="msg {cls}">{t}</div></div>'
def u(t): return f'<div class="row u"><div class="msg">{t}</div><div class="av u">YOU</div></div>'
def card(h,sub,body): return f'<div class="row a"><div class="av a">AI</div><div class="card"><div class="ch"><h3>{h}</h3>{f"<p>{sub}</p>" if sub else ""}</div><div class="cb">{body}</div></div></div>'
def page(side,proj,msgs,out):
    s=''.join(side)
    h=f'''<html><head><meta charset=utf-8><style>{CSS}</style></head><body><div class="win">
<div class="top"><div class="dots"><span style="background:#ff5f6d"></span><span style="background:#ffc14d"></span><span style="background:#3dff9e"></span></div>
<div class="ttl">AI·AGENT <b>//</b> CONSOLE</div><div class="st"><span class="chip">{proj}</span><span class="chip g">ONLINE</span></div></div>
<div class="body"><div class="side"><div class="sh">// PROJECTS</div>{s}</div>
<div class="chat">{''.join(msgs)}<div class="foot"><span>&gt;</span><span class="cur"></span><span>输入指令…</span><span class="send">SEND ⏎</span></div></div></div></div></body></html>'''
    open(out,'w').write(h)

side1=['<div class="it on">00_创世计划Genesis<br>项目总指挥</div>']+[f'<div class="it">{x}</div>' for x in ['07_天枢 Starhelm','跨境网络与免费节点','AXON光脑','09_Armilla 人工智能','08_视频宣发 Genesis Studio','03_元素工坊 Element Forge','02_宙律 Nomoverse','01_星图 Math Atlas','06_觉弈 Ludoterra','04_生命源码 Life Source','05_奇点前夜 Pre-Singularity']]
m1=[a('……线的参数实验台上扩展，这一点修正上一版的说法。实验越往深层走，文字越少、公式和数据越多。呈现方式我还接着「一镜到底」的分镜往下想：同一道题由一道光柱串起四层，点星就坠入实验舱。要不要按这个方向先出 4 张效果图？','cut'),
card('实验室 × 深空层：契合与呈现','','<h4>一、和深空层标准的关系</h4><ul><li>「三层深度」就是深空层已经定下的「看懂 → 改规则 → 推导 / 建模 / 前沿」，不另立标准。</li><li><b>Lab Kit 不新建</b>，改为扩展已经上线的 /core/deep：参数面板、公式、模拟器都已经有了，实验台也已经支持微分方</li></ul>'),
a('Just so you know, you have 9% of your daily tokens left. They reset at 1:13 AM.','sys'),
u('可以出一下概念图。'),
a('先缓一下：今天的日额度只剩 9%，已经低于我们定的 10% 停工线，4张效果图做不完。任务和规范我已经记下了，额度会在 10 月 30 日凌晨 01:13 重置。重置后，你先把 OneDrive 重新连上，再说一句「出深空效果图」就行。我会先对照原来的概念图定风格，再出光柱总览、实验舱、核素岛、星穹这 4 张。'),
u('已经连上onedrive，你把任务和规范同步进去，然后做一个概念图传一次云盘。'),
a('任务单、呈现规范和 2.0 顺序建议都已经同步到云盘「门户 2.0概念」里了。第一张概念图「一题一光柱」也传上去了：水面上方是七个世界的星团，光柱往下依次穿过公式星座、模型旋臂、生活星云、星穹暗渊四层。另外三张（实验舱、核素岛、星穹）等额度重置后再做。这张的风格要不要调？')]
page(side1,'00_创世计划GENESIS',m1,'win1.html')

side2=['<div class="it on">暗岩传说<br><span class="badge"><i></i>工作中</span></div>','<div class="it">暗岩传说：深渊回响宣发</div>']
m2=[u('同步云盘掌握最新开发进度并汇报。'),
a('云盘又往前走了一大段：已发到 v1.2.53，v1.2.54 在做。我正在把最新工程包合进本地，大概两三分钟后汇报。'),
a('同步好了，本地已是最新的 v1.2.54 开发版（523e85c）。已发到 v1.2.53，评委离线包预览在云盘 03 的「评委版_v1.2.54」里，等你体验。进度要点都在下面。'),
card('暗岩传说开发进度（10-29 12:20）','云盘 01_交接/当前状态.md','<h4>已发布 v1.2.49–v1.2.53</h4><ol><li style="margin-left:22px">v1.2.49 营地 A 沉船拾荒营（Lux3D 16 件，约 73/80 积分）</li><li style="margin-left:22px">v1.2.50 铸造淬火＋热浪；光效柔光化</li><li style="margin-left:22px">v1.2.51 锻打节拍＋铭文扫光＋Suno 三首曲</li></ol>'),
u('好的继续吧。'),
a('开工。先零积分验证自带 Key 流程，再重跑评委三步，然后打评委版 zip、解压复测并传云盘。软件渲染跑得慢，大概要一两个小时，不发版、不上魔搭。'),
u('你能估算出开发这个游戏到现在大概耗费的Token数以及假设Pro的价格'+R.format(90)+' 估算目前的开发成本吗？时间+本金'),
a('粗算下来：约 13 天开发，累计大概 5 亿到 15 亿 Token。'+R.format(40)+'<br>'+R.format(70)+R.format(30)+R.format(90)+R.format(60)+R.format(80)+'<br>元，你自己'+R.format(40)+'同大概 30 到 50 小时。我看不到真实用量表，这是按工作量推的，你告诉我实际账号数我能算得更准。'),
card('暗岩传说开发成本估算','','<h4>工作量依据</h4><ul><li>周期：2026-10-17 至 10-29，约 13 天</li><li>产出：v0.9 → v1.2.54，10-23 以来 177 次提交，源码约 5.8 万行 TS（含工具约 7.2 万行）</li><li>多账号并行接力，几乎每天跑到日额度 90%</li></ul>')]
page(side2,'暗岩传说',m2,'win2.html')
