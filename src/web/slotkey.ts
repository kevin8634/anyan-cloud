// ========== v1.2.15 第 8 技能格：电脑 G 键 + 手机技能区按钮 + 行囊里的「装入 / 卸下」栏 ==========
// 由内容包 PackManifest.skillSlot 提供；默认空且隐藏：没有包、包没给物品、或格子里没装东西时，按钮不出现，G 键不做任何事。
// 本文件只放通用词。
import type { Ctx } from './main';
import { packs, packSlotSkill, packSlotItems, packSlotEquip, type PackSlotSkill } from '../core/ContentPacks';
import { showTip, hideTip } from './hudbar';

let CX!: Ctx;
let el: HTMLDivElement | null = null;
let cur: PackSlotSkill | null = null;
let t = 0, lastTxt = '', lastReady = false, lastPct = -1;

/** 电脑 / 手机的位置（#skillbar 内的 right / bottom / 边长，px）：放在第 4 技能、翻滚、第 7 键之间的空位，测试也读这张表 */
export const SLOT8_LAYOUT = { pc: { right: 282, bottom: 96, size: 58 }, phone: { right: 230, bottom: 72, size: 46 } };
const L = SLOT8_LAYOUT;
const CSS = `
#sk-slot8{position:absolute;width:${L.pc.size}px;height:${L.pc.size}px;right:${L.pc.right}px;bottom:${L.pc.bottom}px;border-radius:12px;box-sizing:border-box;border:2px solid var(--sc,#9ad8ff);background:radial-gradient(circle at 50% 40%,#1a2230,#05080c);cursor:pointer;touch-action:none;box-shadow:0 0 0 2px #120a02,0 0 8px rgba(0,0,0,.8);overflow:visible}
#sk-slot8 .si{position:absolute;inset:3px;border-radius:9px;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font:900 22px/1 sans-serif;color:var(--sc,#9ad8ff);text-shadow:0 0 6px #000}
#sk-slot8 .scd{position:absolute;left:3px;right:3px;bottom:3px;height:0;background:rgba(0,0,0,.68);border-radius:0 0 9px 9px}
#sk-slot8 .st{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 18px/1 sans-serif;color:#ffe9a8;text-shadow:-1px -1px 0 #000,1px 1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;pointer-events:none}
#sk-slot8.ready{animation:sk8p 1.6s ease-in-out infinite}
@keyframes sk8p{0%,100%{box-shadow:0 0 0 2px #120a02,0 0 4px var(--sc,#9ad8ff)}50%{box-shadow:0 0 0 2px #120a02,0 0 16px var(--sc,#9ad8ff)}}
#sk-slot8 .sk{position:absolute;right:-2px;bottom:-4px;min-width:16px;padding:0 3px;border-radius:4px;background:#000c;border:1px solid #aaa6;font:bold 11px/15px sans-serif;color:#eee;text-align:center}
#sk-slot8 .sn{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;font:bold 10px/1 sans-serif;color:#ddd;text-shadow:0 1px 2px #000;white-space:nowrap}
html.phone #skillbar #sk-slot8{width:${L.phone.size}px;height:${L.phone.size}px;right:${L.phone.right}px;bottom:${L.phone.bottom}px}
html.phone #sk-slot8 .si{font-size:17px}
html.phone #sk-slot8 .st{font-size:15px}
html.phone #sk-slot8 .sn{display:none}
.slot8row{margin-top:8px;padding:6px 8px;border:1px solid #a08a60;border-radius:6px;background:rgba(90,60,20,.08)}
.slot8row .s8h{font-weight:bold;color:#5a3a14;margin-bottom:4px}
.slot8row .s8i{display:inline-flex;align-items:center;gap:6px;margin:3px 8px 3px 0;padding:3px 6px;border-radius:6px;border:1px solid #b09060;background:rgba(255,248,230,.65);color:#3a2a14;vertical-align:middle}
.slot8row .s8i.on{border-color:var(--sc,#9ad8ff);box-shadow:0 0 6px var(--sc,#9ad8ff)}
.slot8row .s8i.off{opacity:.55}
.slot8row .s8c{width:28px;height:28px;border-radius:6px;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font:900 14px/1 sans-serif;color:var(--sc,#9ad8ff);background-color:#05080c}
.slot8row .s8i .btn{margin:0;padding:2px 8px;font-size:12px}
`;

function ensureCss() { if (document.getElementById('sk-slot8-css')) return; const st = document.createElement('style'); st.id = 'sk-slot8-css'; st.textContent = CSS; document.head.appendChild(st); }
function create() {
  const bar = document.getElementById('skillbar'); if (!bar) return null;
  ensureCss();
  const d = document.createElement('div'); d.id = 'sk-slot8';
  d.innerHTML = `<div class="si"></div><div class="scd"></div><div class="st"></div>${CX.isTouch ? '' : '<div class="sk">G</div>'}<div class="sn"></div>`;
  let press = 0;
  const down = (ev: Event) => {
    ev.preventDefault(); ev.stopPropagation(); slotKeyUse();
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
function paint(k: PackSlotSkill) {
  if (!el) return;
  el.style.setProperty('--sc', k.color ?? '#9ad8ff');
  const si = el.querySelector('.si') as HTMLElement;
  si.style.backgroundImage = k.icon ? `url("${k.icon}")` : '';
  si.textContent = k.icon ? '' : (k.glyph ?? k.name.slice(0, 1));
  (el.querySelector('.sn') as HTMLElement).textContent = k.name;
  el.dataset.id = k.id; lastTxt = ''; lastPct = -1;
}

export function bindSlotKey(c: Ctx) { CX = c; }
/** 每帧（main 循环）：约 10 次 / 秒刷新显隐和冷却 */
export function slotKeyUpdate(dt: number) {
  if (!packs().length || (t += dt) < 0.1) return;
  t = 0;
  const k = packSlotSkill();
  if (!k) { cur = null; if (el) el.style.display = 'none'; return; }
  if (!el) el = create();
  if (!el) return;
  if (k !== cur || el.dataset.id !== k.id) { cur = k; paint(k); }
  el.style.display = '';
  const left = Math.max(0, k.cdLeft()), ready = left <= 0;
  const pct = ready ? 0 : Math.round(Math.min(1, left / Math.max(0.01, k.cd)) * 100);
  if (pct !== lastPct) { lastPct = pct; (el.querySelector('.scd') as HTMLElement).style.height = `calc(${pct}% - ${pct ? 6 : 0}px)`; }
  const txt = ready ? '' : left >= 10 ? String(Math.ceil(left)) : left.toFixed(1);
  if (txt !== lastTxt) { lastTxt = txt; (el.querySelector('.st') as HTMLElement).textContent = txt; }
  if (ready !== lastReady) { lastReady = ready; el.classList.toggle('ready', ready); }
}
/** G 键 / 点按钮：格子空 = 什么都不做 */
export function slotKeyUse(): boolean {
  const k = packSlotSkill(); if (!k) return false;
  try { const ok = k.use(); t = 1; return ok; } catch (e) { console.error('第 8 技能格出错', e); return false; }
}
/** 行囊里的「第 8 技能格」栏（没有可装入的物品 = 空字符串，整栏不显示） */
export function renderSlotBag(box: HTMLElement | null) {
  if (!box) return;
  const list = packs().length ? packSlotItems() : [];
  if (!list.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  ensureCss();
  box.style.display = '';
  const title = list[0].title;
  box.innerHTML = `<div class="slot8row"><div class="s8h">${title}（${CX.isTouch ? '技能区按钮' : 'G 键'}）</div>${list.map(({ pack, item: it }, i) => `<span class="s8i${it.equipped ? ' on' : ''}${it.usable ? '' : ' off'}" style="--sc:${it.color ?? '#9ad8ff'}" data-s8="${i}"><span class="s8c" style="${it.icon ? `background-image:url('${it.icon}')` : ''}">${it.icon ? '' : (it.glyph ?? it.name.slice(0, 1))}</span><span>${it.name}${it.note ? `<small style="opacity:.7"> · ${it.note}</small>` : ''}</span>${it.equipped ? `<button class="btn" data-s8u="${pack}">卸下</button>` : `<button class="btn" data-s8e="${i}" ${it.usable ? '' : 'disabled'}>装入</button>`}</span>`).join('')}</div>`;
  box.querySelectorAll<HTMLElement>('[data-s8]').forEach(x => {
    const it = list[+x.dataset.s8!].item;
    x.addEventListener('mouseenter', ev => showTip(it.tip, ev)); x.addEventListener('mouseleave', hideTip);
  });
  box.querySelectorAll<HTMLElement>('[data-s8e]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const { pack, item } = list[+b.dataset.s8e!]; slotEquip(pack, item.id); renderSlotBag(box); });
  box.querySelectorAll<HTMLElement>('[data-s8u]').forEach(b => b.onclick = ev => { ev.stopPropagation(); slotEquip(b.dataset.s8u!, null); renderSlotBag(box); });
}
/** 装入 / 卸下（失败提示原因） */
export function slotEquip(pack: string, id: string | null): boolean {
  const err = packSlotEquip(pack, id);
  if (err) { CX.toast(err, '#ff6060'); return false; }
  CX.audio.equip();
  const k = packSlotSkill();
  CX.toast(id ? `第 8 技能格：装入 [${k?.name ?? id}]（${CX.isTouch ? '点技能区按钮' : '按 G'}释放）` : '第 8 技能格：已卸下', '#d8c090');
  t = 1; slotKeyUpdate(0);
  CX.save();
  return true;
}
/** 测试用 */
export const slotKeyState = () => ({ el: !!el, shown: !!el && el.style.display !== 'none', id: cur?.id ?? null, cdLeft: cur ? cur.cdLeft() : 0, cd: cur?.cd ?? 0, layout: SLOT8_LAYOUT });
