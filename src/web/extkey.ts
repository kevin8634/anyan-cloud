// ========== v1.1.1 扩展按键（第 7 键）：电脑 T 键 + 手机技能区按钮 ==========
// 由内容包 PackManifest.extKey 提供；没有包 / 不可见时按钮不创建或隐藏，T 键不做任何事。本文件只放通用词。
import type { Ctx } from './main';
import { packExtKey, packs, type PackExtKey } from '../core/ContentPacks';
import { showTip, hideTip } from './hudbar';

let CX!: Ctx;
let el: HTMLDivElement | null = null;
let cur: PackExtKey | null = null;
let t = 0, lastPct = -1, lastReady = false;

const CSS = `
#sk-ext{position:absolute;width:58px;height:58px;right:216px;bottom:128px;border-radius:50%;box-sizing:border-box;border:2px solid var(--xc,#e0c070);background:radial-gradient(circle at 50% 40%,#1c2428,#06090a);cursor:pointer;touch-action:none;box-shadow:0 0 8px rgba(0,0,0,.8);overflow:visible}
#sk-ext .xr{position:absolute;inset:-5px;border-radius:50%;background:conic-gradient(var(--xc,#e0c070) calc(var(--p,0)*1%),rgba(255,255,255,.08) 0);-webkit-mask:radial-gradient(circle,transparent 60%,#000 61%);mask:radial-gradient(circle,transparent 60%,#000 61%);pointer-events:none}
#sk-ext .xi{position:absolute;inset:4px;border-radius:50%;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font:900 22px/1 sans-serif;color:var(--xc,#e0c070);text-shadow:0 0 6px #000;filter:grayscale(.75) brightness(.6);transition:filter .2s}
#sk-ext.ready .xi{filter:none}
#sk-ext.ready{animation:skxp 1.4s ease-in-out infinite}
@keyframes skxp{0%,100%{box-shadow:0 0 8px rgba(0,0,0,.8),0 0 4px var(--xc,#e0c070)}50%{box-shadow:0 0 8px rgba(0,0,0,.8),0 0 18px var(--xc,#e0c070)}}
#sk-ext .xk{position:absolute;right:-2px;bottom:-4px;min-width:16px;padding:0 3px;border-radius:4px;background:#000c;border:1px solid #aaa6;font:bold 11px/15px sans-serif;color:#eee;text-align:center}
#sk-ext .xp{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;font:bold 10px/1 sans-serif;color:#ddd;text-shadow:0 1px 2px #000;white-space:nowrap}
html.phone #skillbar #sk-ext{width:46px;height:46px;right:176px;bottom:100px}
html.phone #sk-ext .xi{font-size:17px}
html.phone #sk-ext .xp{top:auto;bottom:1px;margin:0;font-size:9px}
`;

function create() {
  const bar = document.getElementById('skillbar'); if (!bar) return null;
  const st = document.createElement('style'); st.id = 'sk-ext-css'; st.textContent = CSS; document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'sk-ext';
  d.innerHTML = `<div class="xr"></div><div class="xi"></div>${CX.isTouch ? '' : '<div class="xk">T</div>'}<div class="xp"></div>`;
  let press = 0;
  const down = (ev: Event) => {
    ev.preventDefault(); ev.stopPropagation(); extKeyUse();
    if (ev.type === 'touchstart') { clearTimeout(press); press = window.setTimeout(() => { const r = d.getBoundingClientRect(); if (cur) showTip(cur.tip(), { clientX: Math.max(8, r.left - 300), clientY: r.top }, true); }, 450); }
  };
  const up = () => { if (press) { clearTimeout(press); press = 0; hideTip(); } };
  d.addEventListener('touchstart', down, { passive: false }); d.addEventListener('mousedown', down);
  d.addEventListener('touchend', up); d.addEventListener('touchcancel', up);
  d.addEventListener('mouseenter', ev => { if (cur) showTip(cur.tip(), ev); });
  d.addEventListener('mouseleave', () => { up(); hideTip(); });
  bar.appendChild(d);
  return d;
}
function paint(k: PackExtKey) {
  if (!el) return;
  el.style.setProperty('--xc', k.color ?? '#e0c070');
  const xi = el.querySelector('.xi') as HTMLElement;
  xi.style.backgroundImage = k.icon ? `url("${k.icon}")` : '';
  xi.textContent = k.icon ? '' : (k.glyph ?? k.name.slice(0, 1));
  el.dataset.id = k.id; lastPct = -1;
}

export function bindExtKey(c: Ctx) { CX = c; }
/** 每帧（main 循环）：约 10 次 / 秒刷新显隐和充能 */
export function extKeyUpdate(dt: number) {
  if (!packs().length || (t += dt) < 0.1) return;
  t = 0;
  const k = packExtKey();
  if (!k) { cur = null; if (el) el.style.display = 'none'; return; }
  if (!el) el = create();
  if (!el) return;
  if (k !== cur) { cur = k; paint(k); }
  el.style.display = '';
  const p = Math.max(0, Math.min(1, k.charge())), pct = Math.round(p * 100), ready = p >= 1;
  if (pct !== lastPct) { lastPct = pct; el.style.setProperty('--p', String(pct)); (el.querySelector('.xp') as HTMLElement).textContent = ready ? k.name : `${pct}%`; }
  if (ready !== lastReady) { lastReady = ready; el.classList.toggle('ready', ready); }
}
/** T 键 / 点按钮 */
export function extKeyUse(): boolean {
  const k = packExtKey(); if (!k) return false;
  try { const ok = k.use(); if (el) t = 1; return ok; } catch (e) { console.error('扩展按键出错', e); return false; }
}
/** 测试用 */
export const extKeyState = () => ({ el: !!el, shown: !!el && el.style.display !== 'none', id: cur?.id ?? null });
