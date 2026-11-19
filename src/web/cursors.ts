// ========== v1.2.69 专属鼠标指针（暗岩青铜风格） ==========
// 运行时用 canvas 画 1x（32px）与 2x（64px）两档 PNG，写成 CSS image-set（高 DPI 屏不糊）；热点按 1x 像素给，准确落在指尖 / 剑尖 / 准星中心。
// 状态（html[data-cur=…] 切换，只影响游戏画布）：default 默认 · attack 攻击（悬停敌人）· talk 对话（悬停 NPC）· loot 拾取 · interact 交互（传送阵 / 宝箱 / 采集，界面按钮）
//   · shop 商店 / 铸造（功能 NPC、铸造台）· disabled 不可用 / 冷却 · aim 施法瞄准（引导 / 施法中）。
// 界面：可点的按钮 = interact，禁用按钮 / 冷却中的技能 = disabled，输入框保持系统文字光标。手机 / 触屏不启用。
export type CursorKind = 'default' | 'attack' | 'talk' | 'loot' | 'interact' | 'shop' | 'disabled' | 'aim';
export const CURSOR_KINDS: CursorKind[] = ['default', 'attack', 'talk', 'loot', 'interact', 'shop', 'disabled', 'aim'];
/** 热点（1x 像素） */
export const HOTSPOT: Record<CursorKind, [number, number]> = { default: [3, 2], attack: [3, 3], talk: [3, 2], loot: [3, 2], interact: [3, 2], shop: [3, 2], disabled: [3, 2], aim: [16, 16] };

type C2 = CanvasRenderingContext2D;
const GOLD = ['#fff0b8', '#e8bb4e', '#8a5a14'], IRON = '#1a0f05';
function metal(g: C2, x0: number, y0: number, x1: number, y1: number, cols = GOLD) {
  const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, cols[0]); gr.addColorStop(0.45, cols[1]); gr.addColorStop(1, cols[2]); return gr;
}
function stroke(g: C2, w = 1.6) { g.lineJoin = 'round'; g.lineWidth = w; g.strokeStyle = IRON; g.stroke(); }
/** 基础箭头（青铜爪形） */
function arrow(g: C2, cols = GOLD, sx = 1) {
  g.save(); g.scale(sx, sx);
  g.beginPath(); g.moveTo(3, 2); g.lineTo(3, 23); g.lineTo(8.5, 18); g.lineTo(12.5, 27); g.lineTo(16.5, 25.2); g.lineTo(12.6, 16.6); g.lineTo(20, 16.2); g.closePath();
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 2; g.shadowOffsetX = 1; g.shadowOffsetY = 1.5;
  g.fillStyle = metal(g, 3, 2, 18, 26, cols); g.fill(); g.shadowColor = 'transparent'; stroke(g);
  g.beginPath(); g.moveTo(5, 6); g.lineTo(5, 18); g.lineTo(13, 15.5); g.closePath(); g.fillStyle = 'rgba(255,255,255,.28)'; g.fill();   // 高光
  g.restore();
}
function badge(g: C2, cx: number, cy: number, r: number, fill: string, ring = '#e8bb4e') {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 1, cx, cy, r); gr.addColorStop(0, '#5a3a18'); gr.addColorStop(1, fill); g.fillStyle = gr; g.fill();
  g.lineWidth = 1.4; g.strokeStyle = ring; g.stroke(); g.beginPath(); g.arc(cx, cy, r + 0.9, 0, Math.PI * 2); g.lineWidth = 0.8; g.strokeStyle = IRON; g.stroke();
}
const DRAW: Record<CursorKind, (g: C2) => void> = {
  default: g => arrow(g),
  attack: g => {   // 斜剑：剑尖在左上
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 2; g.shadowOffsetX = 1; g.shadowOffsetY = 1.5;
    g.beginPath(); g.moveTo(3, 3); g.lineTo(9, 4.5); g.lineTo(22, 17.5); g.lineTo(17.5, 22); g.lineTo(4.5, 9); g.closePath();
    g.fillStyle = metal(g, 3, 3, 20, 20, ['#ffffff', '#d8dde6', '#6a7280']); g.fill(); g.shadowColor = 'transparent'; stroke(g, 1.3);
    g.beginPath(); g.moveTo(5, 5); g.lineTo(19.5, 19.5); g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,255,255,.8)'; g.stroke();   // 血槽高光
    g.beginPath(); g.moveTo(16, 25); g.lineTo(25, 16); g.lineWidth = 3.4; g.lineCap = 'round'; g.strokeStyle = IRON; g.stroke(); g.lineWidth = 2.2; g.strokeStyle = '#e8bb4e'; g.stroke();   // 护手
    g.beginPath(); g.moveTo(21.5, 21.5); g.lineTo(27, 27); g.lineWidth = 3.6; g.strokeStyle = IRON; g.stroke(); g.lineWidth = 2.4; g.strokeStyle = '#7a2a10'; g.stroke();   // 握柄
    g.beginPath(); g.arc(28, 28, 2.2, 0, Math.PI * 2); g.fillStyle = '#e8bb4e'; g.fill(); stroke(g, 1);
    g.beginPath(); g.moveTo(3, 3); g.lineTo(8, 4.3); g.lineTo(4.3, 8); g.closePath(); g.fillStyle = 'rgba(255,60,40,.85)'; g.fill();   // 剑尖红光
    g.restore();
  },
  talk: g => {
    arrow(g, GOLD, 0.82);
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 2;
    g.beginPath(); g.moveTo(15, 12); g.quadraticCurveTo(15, 7, 21, 7); g.lineTo(26, 7); g.quadraticCurveTo(31, 7, 31, 12); g.lineTo(31, 16); g.quadraticCurveTo(31, 21, 26, 21); g.lineTo(21, 21); g.lineTo(17, 25); g.lineTo(18, 20.6); g.quadraticCurveTo(15, 19.5, 15, 16); g.closePath();
    g.fillStyle = metal(g, 15, 7, 30, 22, ['#fff8e0', '#f0dcae', '#b08850']); g.fill(); g.shadowColor = 'transparent'; stroke(g, 1.3);
    g.fillStyle = '#5a3410'; for (const x of [19, 23, 27]) { g.beginPath(); g.arc(x, 14, 1.4, 0, Math.PI * 2); g.fill(); }
    g.restore();
  },
  loot: g => {
    arrow(g, GOLD, 0.82);
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 2;
    g.beginPath(); g.moveTo(20, 13); g.quadraticCurveTo(14, 18, 15.5, 25); g.quadraticCurveTo(17, 30, 23, 30); g.quadraticCurveTo(29, 30, 30.5, 25); g.quadraticCurveTo(32, 18, 26, 13); g.closePath();
    g.fillStyle = metal(g, 15, 13, 30, 30, ['#d8a060', '#9a5a24', '#4a2408']); g.fill(); g.shadowColor = 'transparent'; stroke(g, 1.3);
    g.beginPath(); g.moveTo(19, 11); g.lineTo(27, 11); g.lineTo(25, 14); g.lineTo(21, 14); g.closePath(); g.fillStyle = '#7a4418'; g.fill(); stroke(g, 1);
    g.beginPath(); g.moveTo(19.5, 14.5); g.lineTo(26.5, 14.5); g.lineWidth = 1.6; g.strokeStyle = '#e8bb4e'; g.stroke();
    g.beginPath(); g.arc(23, 23, 2.6, 0, Math.PI * 2); g.fillStyle = '#ffd34d'; g.fill(); stroke(g, 0.9);   // 金币
    g.restore();
  },
  interact: g => {
    arrow(g, GOLD, 0.82); badge(g, 23.5, 23.5, 7, '#123a5a', '#8ad0ff');
    g.save(); g.translate(23.5, 23.5); g.strokeStyle = '#bfe8ff'; g.lineWidth = 1.5; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -1.6); g.lineTo(0, -4.6); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 1.2, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); g.restore();
  },
  shop: g => {
    arrow(g, GOLD, 0.82);
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 2;
    g.beginPath(); g.moveTo(15, 22); g.lineTo(31, 22); g.lineTo(29, 25); g.lineTo(26, 25); g.lineTo(27, 29); g.lineTo(19, 29); g.lineTo(20, 25); g.lineTo(17, 25); g.closePath();   // 铁砧
    g.fillStyle = metal(g, 15, 22, 30, 29, ['#c8ccd4', '#6a707c', '#2a2e36']); g.fill(); g.shadowColor = 'transparent'; stroke(g, 1.2);
    g.save(); g.translate(24, 15); g.rotate(-0.6);   // 锤子
    g.fillStyle = '#7a4418'; g.fillRect(-1.1, -1, 2.2, 9); g.strokeStyle = IRON; g.lineWidth = 1; g.strokeRect(-1.1, -1, 2.2, 9);
    g.fillStyle = metal(g, -5, -4, 5, 1, ['#fff0b8', '#e8bb4e', '#8a5a14']); g.fillRect(-5, -4.5, 10, 4); g.strokeRect(-5, -4.5, 10, 4); g.restore();
    g.fillStyle = '#ffb040'; for (const [x, y] of [[29, 18], [31, 20.5], [27.5, 19.5]]) { g.beginPath(); g.arc(x, y, 0.9, 0, Math.PI * 2); g.fill(); }   // 火星
    g.restore();
  },
  disabled: g => {
    g.save(); g.globalAlpha = 0.85; arrow(g, ['#d0d0d0', '#8a8a8a', '#3a3a3a'], 0.82); g.restore();
    g.save(); g.beginPath(); g.arc(23.5, 23.5, 6.8, 0, Math.PI * 2); g.fillStyle = 'rgba(20,0,0,.6)'; g.fill(); g.lineWidth = 3.2; g.strokeStyle = IRON; g.stroke(); g.lineWidth = 2; g.strokeStyle = '#ff4030'; g.stroke();
    g.beginPath(); g.moveTo(19, 28); g.lineTo(28, 19); g.lineWidth = 3.2; g.strokeStyle = IRON; g.stroke(); g.lineWidth = 2; g.strokeStyle = '#ff4030'; g.stroke(); g.restore();
  },
  aim: g => {
    g.save(); g.translate(16, 16);
    const ring = (r: number, w: number, c: string) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = c; g.stroke(); };
    ring(10, 3.6, IRON); ring(10, 1.8, '#ffb040'); ring(4.2, 2.6, IRON); ring(4.2, 1.1, '#ffe9a8');
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -7); g.lineTo(0, -14.5); g.lineWidth = 3.4; g.strokeStyle = IRON; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = '#fff0b8'; g.stroke(); }
    g.beginPath(); g.arc(0, 0, 1.3, 0, Math.PI * 2); g.fillStyle = '#ff5030'; g.fill();
    g.restore();
  },
};

/** 画一个指针（scale 1 = 32px，2 = 64px），返回 PNG dataURL */
export function cursorPng(k: CursorKind, scale: 1 | 2 = 1): string {
  const c = document.createElement('canvas'); c.width = c.height = 32 * scale;
  const g = c.getContext('2d')!; g.scale(scale, scale); DRAW[k](g);
  return c.toDataURL('image/png');
}
/** 指针 CSS 值：支持 image-set 的浏览器给 1x / 2x 两档，否则只给 1x（运行时检测，避免整条声明失效） */
function css(k: CursorKind, fb: string, set: '' | '-webkit-' | 'none') {
  const [x, y] = HOTSPOT[k], a = cursorPng(k, 1);
  return set === 'none' ? `url("${a}") ${x} ${y}, ${fb}` : `${set}image-set(url("${a}") 1x, url("${cursorPng(k, 2)}") 2x) ${x} ${y}, ${fb}`;
}
let on = false, cur: CursorKind = 'default';
export function initCursors() {
  if (typeof document === 'undefined' || on) return;
  if (typeof matchMedia !== 'function' || typeof CSS === 'undefined') return;   // 无界面环境（node 自检）
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) return;   // 纯触屏不需要
  const FB: Record<CursorKind, string> = { default: 'default', attack: 'crosshair', talk: 'pointer', loot: 'pointer', interact: 'pointer', shop: 'pointer', disabled: 'not-allowed', aim: 'crosshair' };
  const probe = 'url("data:image/png;base64,iVBORw0KGgo=") 1x';
  // v1.2.70 Rhett：部分浏览器 / 系统缩放下 image-set 指针整条失效、退回系统白手 → 一律用 32px 单图 url（所有桌面浏览器都支持）；probe 仅保留给调试
  void probe; const set = 'none' as const;
  const C = Object.fromEntries(CURSOR_KINDS.map(k => [k, `var(--cur-${k})`])) as Record<CursorKind, string>;
  const vars = CURSOR_KINDS.map(k => `--cur-${k}:${css(k, FB[k], set)};`).join('');
  const clickable = 'button:not(:disabled),.btn:not(:disabled):not(.disabled),.mbtn,.cell,.tnode,.trk,.trk-btn,[data-tr],[data-fc],[data-ab],[data-close],.x,a[href],select,label,.tab,.skill,[onclick],summary';
  const st = document.createElement('style'); st.id = 'dr-cursors';
  st.textContent = `html.dr-cur{${vars}}
html.dr-cur,html.dr-cur body{cursor:${C.default}}
html.dr-cur :where(${clickable}){cursor:${C.interact}}
html.dr-cur :where(button:disabled,.btn:disabled,.btn.disabled,.skill.oncd,.tnode.locked,[aria-disabled=true]){cursor:${C.disabled}}
html.dr-cur :where(input[type=text],input:not([type]),textarea,[contenteditable=true]){cursor:text}
${CURSOR_KINDS.map(k => `html.dr-cur[data-cur=${k}] #game{cursor:${C[k]}}`).join('\n')}`;
  document.head.appendChild(st);
  // 页面原有的 cursor:pointer / not-allowed / grab 规则也换成专属指针（只改本页内联样式表）
  const MAP: Record<string, CursorKind> = { pointer: 'interact', 'not-allowed': 'disabled', crosshair: 'aim', grab: 'interact', move: 'interact' };
  const walk = (rules: CSSRuleList) => { for (const r of Array.from(rules)) {
    if (r instanceof CSSStyleRule) { const k = MAP[r.style.cursor]; if (k) r.style.setProperty('cursor', `var(--cur-${k}, ${r.style.cursor})`); }
    else if ('cssRules' in r) try { walk((r as CSSGroupingRule).cssRules); } catch { /* 忽略 */ } } };
  for (const sh of Array.from(document.styleSheets)) { if (sh.ownerNode === st) continue; try { walk(sh.cssRules); } catch { /* 跨域样式表读不到 */ } }
  document.documentElement.classList.add('dr-cur'); on = true; setCursor('default');
}
/** 切换游戏画布上的指针状态 */
export function setCursor(k: CursorKind) { if (!on || k === cur && document.documentElement.dataset.cur === k) return; cur = k; document.documentElement.dataset.cur = k; }
export function cursorDebug() { return { on, cur, set: getComputedStyle(document.getElementById('game') ?? document.body).cursor.slice(0, 40), data: document.documentElement.dataset.cur ?? '', styleLen: document.getElementById('dr-cursors')?.textContent?.length ?? 0 }; }
