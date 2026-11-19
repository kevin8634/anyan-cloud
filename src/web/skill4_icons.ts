// v1.2.72 前四职业第 4 技能槽（绝技）8 个专属图标：程序化 canvas 绘制（本项目原创，不进 assets/），启动时 addIcons 登记
// 规范（docs/设计/技能特效/00_总纲 §9）：深色岩石底 + 主体画技能的「物质」（裂地岩浆、星尘符文楔、冰火绞合……），不用抽象符号
import { addIcons } from './icons';

type G = CanvasRenderingContext2D;
const S = 128;
let seed = 1;
const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function rock(g: G, top: string, bot: string) {
  const lg = g.createLinearGradient(0, 0, 0, S); lg.addColorStop(0, top); lg.addColorStop(1, bot); g.fillStyle = lg; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { const v = R(); g.fillStyle = `rgba(${v < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + R() * 0.05})`; g.fillRect(R() * S, R() * S, 1 + R() * 2.5, 1 + R() * 2.5); }
  for (let i = 0; i < 7; i++) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
}
function vignette(g: G) {
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.75)'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
}
function glow(g: G, x: number, y: number, r: number, col: string, a = 1) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); g.restore();
}
function smoke(g: G, x: number, y: number, r: number, col: string, n = 8) {
  for (let i = 0; i < n; i++) { const px = x + (R() - 0.5) * r, py = y + (R() - 0.5) * r * 0.6, pr = r * (0.3 + R() * 0.4); const rg = g.createRadialGradient(px, py, 0, px, py, pr); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(px, py, pr, 0, 6.29); g.fill(); }
}
function sparks(g: G, x: number, y: number, n: number, spread: number, col: string, up = 0) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = col;
  for (let i = 0; i < n; i++) { const a = R() * 6.28, d = R() * spread; g.globalAlpha = 0.4 + R() * 0.6; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 - up * R(), 1 + R() * 1.8, 1 + R() * 1.8); }
  g.restore();
}
function jag(g: G, pts: [number, number][], w: number, col: string) { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }

const DRAW: Record<string, (g: G) => void> = {
  // 裂地猛击：透视的地裂从脚下劈向远方，裂缝里岩浆红光，碎岩飞起
  earthsplitter(g) {
    rock(g, '#2a2420', '#3e3128');
    const pts: [number, number][] = []; let x = 64, y = 124; for (let i = 0; i < 9; i++) { pts.push([x, y]); y -= 11 + R() * 3; x += (R() - 0.5) * 14; }
    g.save(); g.globalCompositeOperation = 'lighter'; for (let w = 20; w > 0; w -= 5) jag(g, pts.map(([px, py]) => [px, py] as [number, number]), w * (1), `rgba(255,${80 + (20 - w) * 6},20,${0.08 + (20 - w) * 0.03})`); g.restore();
    { const L: [number, number][] = [], Rr: [number, number][] = []; pts.forEach(([px, py], i) => { const w = 9 * (1 - i / pts.length) + 1.5; L.push([px - w - R() * 2, py]); Rr.push([px + w + R() * 2, py]); });
      const lg = g.createLinearGradient(0, 124, 0, 30); lg.addColorStop(0, '#fff0b0'); lg.addColorStop(0.3, '#ff9a30'); lg.addColorStop(1, '#a02a08');
      g.fillStyle = lg; g.beginPath(); L.forEach(([x2, y2], i) => i ? g.lineTo(x2, y2) : g.moveTo(x2, y2)); Rr.reverse().forEach(([x2, y2]) => g.lineTo(x2, y2)); g.closePath(); g.fill();
      g.strokeStyle = '#1a120c'; g.lineWidth = 2.5; g.stroke(); }
    jag(g, pts, 2, '#fff4c8');
    pts.forEach(([px, py], i) => { if (i % 2) { const sx = px + (R() < 0.5 ? -1 : 1) * (6 + R() * 10); jag(g, [[px, py], [sx, py - 6], [sx + (R() - 0.5) * 8, py - 12]], 1.5, 'rgba(255,140,40,0.8)'); } });
    for (let i = 0; i < 9; i++) { const rx = 30 + R() * 68, ry = 30 + R() * 60, rs = 4 + R() * 7; g.fillStyle = `rgb(${70 + R() * 30 | 0},${58 + R() * 20 | 0},${48 + R() * 15 | 0})`; g.beginPath(); g.moveTo(rx, ry - rs); g.lineTo(rx + rs, ry - rs * 0.2); g.lineTo(rx + rs * 0.4, ry + rs); g.lineTo(rx - rs * 0.8, ry + rs * 0.5); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,150,60,0.5)'; g.fillRect(rx - rs * 0.6, ry + rs * 0.2, rs, 1.5); }
    smoke(g, 64, 40, 70, 'rgba(60,50,40,0.35)', 6); glow(g, 64, 110, 40, 'rgba(255,120,30,0.6)'); sparks(g, 64, 80, 40, 40, '#ffc060', 20);
    vignette(g);
  },
  // 狂怒咆哮：铁盔剪影张口怒吼，血红冲击波一圈圈震开，尘土被推出去
  rage_roar(g) {
    rock(g, '#2a1614', '#1a0d0c');
    for (let k = 0; k < 4; k++) { g.strokeStyle = `rgba(230,${50 + k * 20},30,${0.6 - k * 0.12})`; g.lineWidth = 5 - k; g.beginPath(); g.ellipse(64, 70, 26 + k * 13, 22 + k * 11, 0, 0, 6.29); g.stroke(); }
    smoke(g, 64, 100, 110, 'rgba(110,70,50,0.35)', 10);
    g.fillStyle = '#18100e'; g.beginPath(); g.moveTo(44, 92); g.lineTo(42, 56); g.quadraticCurveTo(44, 34, 64, 30); g.quadraticCurveTo(84, 34, 86, 56); g.lineTo(84, 92); g.lineTo(72, 84); g.lineTo(56, 84); g.closePath(); g.fill();
    g.strokeStyle = '#8a6a50'; g.lineWidth = 1.5; g.stroke();
    for (const sx of [-1, 1]) { g.fillStyle = '#d8c8a8'; g.beginPath(); g.moveTo(64 + sx * 20, 44); g.quadraticCurveTo(64 + sx * 40, 40, 64 + sx * 42, 18); g.quadraticCurveTo(64 + sx * 32, 34, 64 + sx * 18, 52); g.closePath(); g.fill(); g.strokeStyle = '#3a2a1a'; g.lineWidth = 1; g.stroke(); }
    g.fillStyle = '#2a201c'; g.fillRect(62, 32, 4, 20);
    g.fillStyle = '#0a0606'; g.fillRect(48, 54, 32, 6); g.fillRect(61, 54, 6, 22);
    glow(g, 55, 57, 7, 'rgba(255,60,30,1)'); glow(g, 73, 57, 7, 'rgba(255,60,30,1)');
    g.fillStyle = '#300806'; g.beginPath(); g.ellipse(64, 80, 8, 5, 0, 0, 6.29); g.fill(); glow(g, 64, 80, 10, 'rgba(255,80,30,0.7)');
    sparks(g, 64, 70, 60, 55, '#ff7040');
    vignette(g);
  },
  // 星界弹幕：五枚刻满符文的紫色菱形能量楔斜飞，各拖一缕星尘
  star_barrage(g) {
    rock(g, '#16102a', '#0c0818');
    for (let i = 0; i < 70; i++) sparks(g, R() * S, R() * S, 1, 0, '#c8b0ff');
    for (let i = 0; i < 5; i++) {
      const x = 22 + i * 18 + (R() - 0.5) * 6, y = 98 - i * 16 + (R() - 0.5) * 8, a = -0.75;
      g.save(); g.globalCompositeOperation = 'lighter';
      const tl = g.createLinearGradient(x, y, x - 40 * Math.cos(a), y - 40 * Math.sin(a)); tl.addColorStop(0, 'rgba(180,140,255,0.8)'); tl.addColorStop(1, 'rgba(80,40,200,0)');
      g.strokeStyle = tl; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 40 * Math.cos(a), y - 40 * Math.sin(a)); g.stroke(); g.restore();
      sparks(g, x - 20 * Math.cos(a), y - 20 * Math.sin(a), 10, 10, '#e8d8ff');
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = '#8e5bff'; g.beginPath(); g.moveTo(10, 0); g.lineTo(0, -4.5); g.lineTo(-7, 0); g.lineTo(0, 4.5); g.closePath(); g.fill();
      g.strokeStyle = '#f3d9ff'; g.lineWidth = 1; g.stroke(); g.beginPath(); g.moveTo(-3, -1.5); g.lineTo(3, 1.5); g.moveTo(1, -2); g.lineTo(1, 2); g.stroke();
      g.restore(); glow(g, x, y, 12, 'rgba(160,110,255,0.8)');
    }
    vignette(g);
  },
  // 寒焰交织：左边火柱、右边冰刺绞合在一起，交界处蒸汽爆开
  frostfire(g) {
    rock(g, '#201a1c', '#141820');
    for (let i = 0; i < 6; i++) { const x = 72 + i * 7 + (R() - 0.5) * 6, h = 34 + R() * 40; const lg = g.createLinearGradient(x, 120, x, 120 - h); lg.addColorStop(0, '#2e5f7a'); lg.addColorStop(0.6, '#9fd8e8'); lg.addColorStop(1, '#f2fbff'); g.fillStyle = lg; g.beginPath(); g.moveTo(x - 6, 120); g.lineTo(x + (R() - 0.5) * 8, 120 - h); g.lineTo(x + 6, 120); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.8; g.stroke(); }
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) { const x = 40 + (R() - 0.5) * 30, y = 120 - R() * 95, r = 6 + R() * 14; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,231,163,0.9)'); rg.addColorStop(0.5, 'rgba(226,72,27,0.6)'); rg.addColorStop(1, 'rgba(80,10,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); }
    g.restore();
    smoke(g, 64, 50, 50, 'rgba(235,240,245,0.45)', 9);
    smoke(g, 38, 20, 40, 'rgba(30,24,22,0.5)', 4);
    sparks(g, 40, 50, 30, 30, '#ffd080', 20); sparks(g, 86, 60, 25, 25, '#e8f8ff');
    vignette(g);
  },
  // 时痕爆裂：地面一圈金色时砂炸开，砂环上刻着钟点刻痕，中心指针碎裂
  mark_burst(g) {
    rock(g, '#2a2216', '#1a140c');
    g.save(); g.translate(64, 72); g.scale(1, 0.62);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) { const a = R() * 6.28, d = 34 + (R() - 0.5) * 16; g.fillStyle = `rgba(255,${190 + R() * 50 | 0},${90 + R() * 60 | 0},${0.3 + R() * 0.6})`; g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.5 + R() * 2, 1.5 + R() * 2); }
    g.restore();
    g.strokeStyle = '#e8c070'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 34, 0, 6.29); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; g.lineWidth = i % 3 ? 1.5 : 3; g.beginPath(); g.moveTo(Math.cos(a) * 28, Math.sin(a) * 28); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); g.stroke(); }
    g.restore();
    glow(g, 64, 72, 30, 'rgba(255,200,100,0.8)');
    g.strokeStyle = '#3a2a14'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(64, 72); g.lineTo(80, 50); g.moveTo(64, 72); g.lineTo(52, 60); g.stroke();
    g.strokeStyle = '#f0d890'; g.lineWidth = 1.5; g.stroke();
    sparks(g, 64, 60, 80, 50, '#ffe0a0', 30);
    vignette(g);
  },
  // 时之涡：铜金色砂流卷成漩涡，向中心的暗洞收拢，碎石被卷起
  time_vortex(g) {
    rock(g, '#241c12', '#120e08');
    g.save(); g.translate(64, 66); g.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 4; arm++) for (let i = 0; i < 140; i++) { const t = i / 140, a = arm * 1.57 + t * 7.5, d = 6 + t * 52 + (R() - 0.5) * 5; g.fillStyle = `rgba(${230 + R() * 25 | 0},${170 + R() * 40 | 0},${80 + R() * 40 | 0},${0.15 + (1 - t) * 0.55})`; g.fillRect(Math.cos(a) * d, Math.sin(a) * d * 0.8, 1.5 + R() * 2.2, 1.5 + R() * 2.2); }
    g.restore();
    const rg = g.createRadialGradient(64, 66, 0, 64, 66, 14); rg.addColorStop(0, '#000'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(64, 66, 14, 0, 6.29); g.fill();
    for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = 20 + R() * 34; g.fillStyle = '#4a3a28'; g.fillRect(64 + Math.cos(a) * d, 66 + Math.sin(a) * d * 0.8, 3 + R() * 3, 3 + R() * 3); }
    glow(g, 64, 66, 26, 'rgba(255,190,90,0.35)');
    vignette(g);
  },
  // 酸雨云：低垂的病绿灰云，黄绿酸雨落下，地面腐蚀冒泡
  acid_cloud(g) {
    rock(g, '#1c201a', '#141810');
    smoke(g, 64, 34, 110, 'rgba(120,132,96,0.8)', 16); smoke(g, 64, 24, 90, 'rgba(70,78,54,0.8)', 10); glow(g, 70, 30, 30, 'rgba(180,230,80,0.25)');
    g.strokeStyle = 'rgba(190,230,60,0.75)'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const x = 16 + R() * 96, y = 46 + R() * 50; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 8 + R() * 6); g.stroke(); }
    g.fillStyle = 'rgba(90,110,20,0.75)'; g.beginPath(); g.ellipse(64, 112, 44, 9, 0, 0, 6.29); g.fill();
    for (let i = 0; i < 14; i++) { const x = 26 + R() * 76, y = 108 + R() * 8; g.strokeStyle = 'rgba(220,255,120,0.8)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 1.5 + R() * 2.5, 0, 6.29); g.stroke(); }
    smoke(g, 64, 104, 70, 'rgba(160,190,90,0.25)', 6);
    glow(g, 64, 108, 30, 'rgba(160,220,40,0.35)');
    vignette(g);
  },
  // 连锁爆裂：铜塞药瓶炸开，火光沿弧线依次跳出三团爆炸
  chain_bomb(g) {
    rock(g, '#24180f', '#140e08');
    const pts: [number, number][] = [[32, 92], [62, 62], [96, 76], [104, 34]];
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,170,60,0.6)'; g.lineWidth = 1.5; g.beginPath(); pts.forEach(([x, y], i) => i ? g.quadraticCurveTo((pts[i - 1][0] + x) / 2, Math.min(pts[i - 1][1], y) - 14, x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]);
    pts.slice(1).forEach(([x, y], i) => { const r = 12 + i * 2; smoke(g, x, y - 4, r * 2, 'rgba(40,30,24,0.55)', 4); g.save(); g.globalCompositeOperation = 'lighter'; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,240,190,1)'); rg.addColorStop(0.4, 'rgba(255,140,40,0.9)'); rg.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); g.restore(); sparks(g, x, y, 14, r * 1.2, '#ffd080'); });
    g.save(); g.translate(32, 92); g.rotate(-0.4);
    g.fillStyle = '#2c4a3a'; g.beginPath(); g.arc(0, 6, 11, 0, 6.29); g.fill(); g.fillRect(-4, -12, 8, 12);
    g.fillStyle = 'rgba(120,220,140,0.55)'; g.beginPath(); g.arc(0, 8, 8, 0, 3.14); g.fill();
    g.fillStyle = '#a06a30'; g.fillRect(-5, -16, 10, 5);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(-3, 3, 6, 3.6, 4.6); g.stroke();
    g.restore(); glow(g, 36, 76, 8, 'rgba(255,200,80,1)');
    vignette(g);
  },
};

export const SKILL4_ICON_IDS = Object.keys(DRAW);
let done = false;
/** 启动时调用一次：画 8 张图标并登记为 sk_<id>（已有同名图标时不覆盖） */
export function installSkill4Icons() {
  if (done || typeof document === 'undefined') return; done = true;
  addIcons(skill4IconUrls());
}
/** 8 张图标的 data URL（测试 / 预览也用） */
export function skill4IconUrls() {
  const map: Record<string, string> = {};
  for (const [id, f] of Object.entries(DRAW)) {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); if (!g) continue;
    seed = 7 + id.length * 131 + id.charCodeAt(0);
    try { f(g); map[`sk_${id}`] = c.toDataURL('image/jpeg', 0.88); } catch { /* 画不出来就回退职业图标 */ }
  }
  return map;
}
