#!/usr/bin/env python3
"""11-16 DLC1 全屏窗口换羊皮纸：读各窗口自带样式，生成 html.ui-parch 覆盖样式
   输出 src/dlc/dlc1/parch_dlc_css.ts（提交进仓库；改了窗口样式后重跑本脚本）
   规则：
   - 外框（.fw/.dw/.aw/.fc/#d1-judge/…）整块换成羊皮纸底 + 青铜边（同本体 .panel）
   - 浅色文字按原色相压暗成墨色（保持各窗口的配色区分：金→赭、青→深青、紫→深紫、红→深红）
   - 内部暗色底（芯片、格子、行）换成半透明浅纸色；亮色描边压暗；发光文字阴影去掉
"""
import re, colorsys, pathlib, json

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'src/dlc/dlc1'
SRC = {  # 文件: 根选择器
  'smithy.ts': '#d1-forge', 'domain_ui.ts': '#d1-dom', 'abyssbody_ui.ts': '#d1-aby',
  'fate.ts': '#d1-fate', 'judge.ts': '#d1-judge',
}
# 整块换成羊皮纸窗体的选择器
FRAMES = ['#d1-forge .fw', '#d1-dom .dw', '#d1-aby .aw', '#d1-judge', '#d1-fate .fc']

# 压在全屏暗遮罩上、不在羊皮纸窗体里的部分：不改
SKIP = ['#d1-fate .fh', '#d1-fate .fwarn', '#d1-fate .fcols', '#d1-fate .fbot']

COL = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)')

def parse(c):
  if c.startswith('#'):
    h = c[1:]
    if len(h) == 3: h = ''.join(x * 2 for x in h)
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]
  n = [float(x) for x in re.findall(r'[\d.]+', c)]
  return [n[0] / 255, n[1] / 255, n[2] / 255, n[3] if len(n) > 3 else 1.0]

def lum(r, g, b): return 0.2126 * r + 0.7152 * g + 0.0722 * b

def lin(v): return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
def rlum(r, g, b): return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
TEXT_Y = 0.045   # 11-16 文字墨色的相对亮度上限：羊皮纸底 ≈0.68 → 对比度 ≥ 7:1（青/黄/绿色相同明度下更亮，单按 L 压不够）

def ink(c, L=0.24, text=False):
  r, g, b, a = parse(c)
  h, l, s = colorsys.rgb_to_hls(r, g, b)
  if s < 0.12: return '#3a2614' if a >= 1 else f'rgba(58,38,20,{a:.2f})'   # 灰白 → 墨褐
  s = min(0.85, max(0.45, s))
  if text:
    while L > 0.08 and rlum(*colorsys.hls_to_rgb(h, L, s)) > TEXT_Y: L -= 0.01
  r, g, b = colorsys.hls_to_rgb(h, L, s)
  hx = '#%02x%02x%02x' % tuple(round(v * 255) for v in (r, g, b))
  return hx if a >= 1 else f'rgba({round(r*255)},{round(g*255)},{round(b*255)},{a:.2f})'

def paper(c):
  r, g, b, a = parse(c)
  return f'rgba(255,248,228,{min(.55, max(.22, a * .5)):.2f})'

def map_colors(v, fn, pred):
  return COL.sub(lambda m: fn(m.group(0)) if pred(parse(m.group(0))) else m.group(0), v)

light = lambda p: lum(*p[:3]) > 0.45
dark = lambda p: lum(*p[:3]) < 0.3

def rules(css):
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
    yield m.group(1).strip(), m.group(2)

def decls(body):
  out = []
  for d in body.split(';'):
    if ':' not in d: continue
    k, v = d.split(':', 1); out.append((k.strip(), v.strip()))
  return out

out, seen = [], set()
for f, root in SRC.items():
  t = (D / f).read_text()
  # 只取样式模板串里以根选择器开头的规则
  css = '\n'.join(l for l in t.splitlines() if l.lstrip().startswith((root, 'html.phone ' + root)) or (l.startswith('}') and root in l))
  for sel, body in rules(css):
    if not sel.startswith(root) or '@' in sel: continue
    if any(sel == fr for fr in FRAMES): continue
    base = sel.replace('html.phone ', '')
    if any(base.startswith(k) for k in SKIP): continue          # 压在暗色遮罩上的部分保持原样
    is_root = base == root
    nd = []
    for k, v in decls(body):
      imp = ' !important' if '!important' in v else ''
      v0 = v.replace('!important', '').strip()
      if k == 'color' and is_root and root == '#d1-fate': continue
      if k == 'color' and COL.search(v0) and light(parse(COL.search(v0).group(0))):
        nd.append(f'color:{ink(COL.search(v0).group(0), text=True)}{imp}')
      elif k in ('background', 'background-color', 'background-image') and COL.search(v0) and 'url(' not in v0:
        cs = [parse(c) for c in COL.findall(v0)]
        if 'clip' in body and 'text' in body: continue          # 渐变字：保留
        if is_root: continue                                     # 根节点是全屏暗遮罩
        if all(dark(p) for p in cs): nd.append(f'background:{paper(COL.findall(v0)[0])}{imp}')
        elif any(light(p) for p in cs) and not all(light(p) for p in cs): nd.append(f'{k}:{map_colors(v0, lambda c: ink(c, .38), light)}{imp}')
      elif k.startswith('border') and 'radius' not in k and 'image' not in k and COL.search(v0):
        nd.append(f'{k}:{map_colors(v0, lambda c: ink(c, .32), light)}{imp}')
      elif k == 'text-shadow' and v0 != 'none':
        nd.append('text-shadow:0 1px 0 rgba(255,244,214,.55)')
      elif k == 'box-shadow' and COL.search(v0) and any(light(parse(c)) for c in COL.findall(v0)):
        nd.append(f'box-shadow:{map_colors(v0, lambda c: ink(c, .38), light)}')
      elif k == '-webkit-text-fill-color' and COL.search(v0) and light(parse(COL.search(v0).group(0))):
        nd.append(f'-webkit-text-fill-color:{ink(COL.search(v0).group(0), text=True)}')
    if nd:
      ph = sel.startswith('html.phone ')
      s = ','.join(('html.ui-parch.phone ' + x[len('html.phone '):]) if ph else ('html.ui-parch ' + x.strip()) for x in sel.split(','))
      key = s + '{' + ';'.join(nd) + '}'
      if key not in seen: seen.add(key); out.append(key)

# 11-16 模板里的内联 style="color:#xxx"（铸造台的黄字提示、领域/深渊的彩色小字）：属性选择器 + !important 压成同色相墨色
INL = re.compile(r'style="[^"]*?color:(#[0-9a-fA-F]{3,6})\b')
for f, root in SRC.items():
  scope = root if root != '#d1-fate' else None
  if not scope: continue
  for c in sorted(set(INL.findall((D / f).read_text()))):
    if light(parse(c)):
      out.append(f'html.ui-parch {scope} [style*="color:{c}"]{{color:{ink(c, text=True)}!important;text-shadow:none!important}}')
# 动态色（深渊状态 chip 的三种色）
for c in ('#ffd0ff', '#c8a8ff'):   # #ff8a9a 上面已从模板里扫到
  out.append(f'html.ui-parch #d1-aby [style*="color:{c}"]{{color:{ink(c, text=True)}!important;text-shadow:none!important}}')

frames = ','.join('html.ui-parch ' + s for s in FRAMES)
head = [
  f'{frames}{{color:#3a2614;background:var(--pu-tile,none) 0 0/512px repeat,#e9d6ad!important;border:12px solid transparent!important;border-image:var(--pu-rail) 17 / 12px / 0 stretch!important;border-radius:0!important;'
  'box-shadow:0 0 0 1px rgba(8,5,2,.9),0 16px 54px rgba(0,0,0,.82),inset 0 0 0 1px rgba(46,26,8,.6),inset 0 0 26px rgba(118,72,22,.38),inset 0 0 110px rgba(120,80,30,.2)!important}',
  # 按钮：同本体羊皮纸签
  'html.ui-parch :is(#d1-forge,#d1-dom,#d1-aby,#d1-fate,#d1-judge) :is(.btn,button):not(.fhold){border-radius:0;border:2px solid transparent;border-image:var(--pu-btn-n) 24 fill / 9px / 0 stretch;background:none;color:#3a2614;text-shadow:0 1px 0 rgba(255,244,214,.6);box-shadow:none}',
  'html.ui-parch :is(#d1-forge,#d1-dom,#d1-aby,#d1-fate,#d1-judge) :is(.btn,button):not(.fhold):hover:not(:disabled){border-image-source:var(--pu-btn-h);color:#2a1606;filter:none}',
  'html.ui-parch :is(#d1-forge,#d1-dom,#d1-aby,#d1-fate,#d1-judge) :is(.btn,button):not(.fhold):active:not(:disabled){border-image-source:var(--pu-btn-p);transform:translateY(1px)}',
  'html.ui-parch :is(#d1-forge,#d1-dom,#d1-aby,#d1-fate,#d1-judge) :is(.btn,button):not(.fhold):disabled{filter:grayscale(.85) brightness(.92);opacity:.55}',
  'html.ui-parch #d1-judge h4 button{border:0;border-image:none;background:none}',
  'html.ui-parch :is(#d1-forge,#d1-dom,#d1-aby,#d1-fate) :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea){background:rgba(255,250,236,.78)!important;color:#2b1a0a!important;border:1px solid rgba(110,72,24,.7)!important;border-radius:0}',
  # 关闭键：控件图 X
  'html.ui-parch :is(#d1-dom,#d1-aby) .x{border:0;border-radius:0;background:var(--pu-close) center/100% 100% no-repeat;color:transparent;font-size:0;box-shadow:none}',
  'html.ui-parch :is(#d1-forge .fw,#d1-dom .dw,#d1-aby .aw,#d1-fate .fc)::-webkit-scrollbar{width:12px}',
  'html.ui-parch :is(#d1-forge .fw,#d1-dom .dw,#d1-aby .aw,#d1-fate .fc) ::-webkit-scrollbar-thumb,html.ui-parch :is(#d1-forge .fw,#d1-dom .dw,#d1-aby .aw,#d1-fate .fc)::-webkit-scrollbar-thumb{background:var(--pu-sb-thumb) center/100% 100%;border:0}',
  'html.ui-parch :is(#d1-forge .fw,#d1-dom .dw,#d1-aby .aw,#d1-fate .fc) ::-webkit-scrollbar-track,html.ui-parch :is(#d1-forge .fw,#d1-dom .dw,#d1-aby .aw,#d1-fate .fc)::-webkit-scrollbar-track{background:var(--pu-sb-track) center/100% 100%}',
  # 11-16 卡片标题用各建筑 / 部位自己的色（--c，多为浅色）：羊皮纸上压成同色相深墨（color-mix 不支持时退回墨褐）
  'html.ui-parch :is(#d1-dom,#d1-aby) .card .t b{color:#3a2614;color:color-mix(in srgb,var(--c) 35%,#1a0e04);text-shadow:none}',
  'html.ui-parch #d1-aby .card.off{opacity:.84}',   # 11-16 未变异卡原 .62：浅纸底上整卡发白，提一点
  # 手机全屏时不要青铜边吃掉空间
  'html.ui-parch.phone :is(#d1-dom .dw,#d1-aby .aw){border-width:6px!important}',
]
css = '\n'.join(head + out)
(D / 'parch_dlc_css.ts').write_text(
  '// 由 tools/parch_dlc.py 生成（11-16 DLC 全屏窗口羊皮纸覆盖样式，只在 html.ui-parch 下生效）；改窗口样式后重跑\n'
  f'export const PARCH_DLC_CSS = {json.dumps(css, ensure_ascii=False)};\n')
print(len(out), 'rules,', len(css), 'chars')
