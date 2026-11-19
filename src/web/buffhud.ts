// ========== v1.2.13：BUFF / DEBUFF 图标行（玩家头像下方 + 首领血条下方 + 目标框） ==========
// 读 CombatUnit.status（StatusSet.view()）；同类状态合并成一个图标（取最长剩余时间，层数 / 护盾量相加）。
// 内容包或系统模块可以用 addBuffSource 追加额外的图标（比如命运技能的临时变异）。
import type { Ctx } from './main';
import type { CombatUnit } from '../core/Combat';

let CX: Ctx;
export function bindBuffHud(c: Ctx) { CX = c; initTip(); }

export interface BuffIcon { id: string; glyph: string; name: string; desc: string; remaining?: number; stacks?: number; debuff: boolean; color?: string }
type Source = (unit: CombatUnit, who: 'player' | 'boss' | 'target') => BuffIcon[];
const sources: Source[] = [];
/** 追加 BUFF 来源（返回给该单位额外显示的图标） */
export function addBuffSource(f: Source) { sources.push(f); }

const EL: Record<string, [string, string]> = { physical: ['流血', '#c33'], fire: ['燃烧', '#f72'], frost: ['冰冻', '#6cf'], arcane: ['奥术灼烧', '#c6f'], shadow: ['暗影侵蚀', '#a5d'], nature: ['中毒', '#6c4'], poison: ['中毒', '#6c4'], lightning: ['感电', '#ff6'] };

/** 把一个单位身上的状态整理成图标（纯函数，测试可用） */
export function iconsOf(unit: CombatUnit, who: 'player' | 'boss' | 'target'): BuffIcon[] {
  const st = unit.status; if (!st?.view) return [];
  const m = new Map<string, BuffIcon>();
  const put = (ic: BuffIcon) => {
    const o = m.get(ic.id);
    if (!o) { m.set(ic.id, ic); return; }
    o.remaining = Math.max(o.remaining ?? 0, ic.remaining ?? 0);
    if (ic.stacks) o.stacks = (o.stacks ?? 0) + ic.stacks;
  };
  for (const s of st.view()) {
    if (s.remaining <= 0) continue;
    switch (s.kind) {
      case 'dot': { const [n, c] = EL[s.element ?? 'physical'] ?? ['持续伤害', '#c33']; put({ id: 'dot_' + (s.element ?? 'physical'), glyph: '☠', name: n, desc: `每秒受到 ${Math.round(s.dps ?? 0)} 点伤害`, remaining: s.remaining, stacks: 1, debuff: true, color: c }); break; }
      case 'slow': put({ id: 'slow', glyph: '❄', name: '减速', desc: `移动速度 -${Math.round((s.percent ?? 0) * 100)}%`, remaining: s.remaining, debuff: true, color: '#7ad' }); break;
      case 'stun': put({ id: 'stun', glyph: '✦', name: '眩晕', desc: '无法行动', remaining: s.remaining, debuff: true, color: '#fd5' }); break;
      case 'shield': put({ id: 'shield', glyph: '⛨', name: '护盾', desc: `吸收 ${Math.round(s.pool ?? 0)} 点伤害`, remaining: s.remaining, stacks: Math.round(s.pool ?? 0), debuff: false, color: '#9cf' }); break;
      case 'reflect': put({ id: 'reflect', glyph: '◈', name: '减伤', desc: `受到伤害 -${Math.round((s.percent ?? 0) * 100)}%`, remaining: s.remaining, debuff: false, color: '#fc6' }); break;
      case 'invuln': if (s.remaining > 1) put({ id: 'invuln', glyph: '✧', name: '无敌', desc: '免疫伤害和负面状态', remaining: s.remaining, debuff: false, color: '#fff' }); break;
      case 'stack': if (s.key === 'erosion') {   // v1.2.35 侵蚀：玩家持续伤害叠在目标身上，每层 +1% 持续伤害，满 40 层发金光
        const n = s.pool ?? 0; put({ id: 'erosion', glyph: '☣', name: '侵蚀', desc: `你的持续伤害对它 +${n}%（每秒叠 1 层，最多 40 层）`, remaining: s.remaining, stacks: n, debuff: true, color: n >= 40 ? '#ffd040' : '#b070ff' }); break;
      } else {   // 叠层：施加者是别人 = 负面（首领身上被玩家叠的印记也算玩家的 DEBUFF）
        const deb = who === 'player' ? s.source !== unit && s.source !== null : true;
        put({ id: 'stk_' + s.key, glyph: '◆', name: stackName(s.key), desc: `${s.pool ?? 0} 层`, remaining: s.remaining, stacks: s.pool ?? 0, debuff: deb, color: deb ? '#e66' : '#6e9' }); break;
      }
    }
  }
  const out = [...m.values()];
  for (const f of sources) { try { out.push(...f(unit, who)); } catch { /* 来源出错不影响 HUD */ } }
  return out;
}
const stackName = (k: string) => k.replace(/^(stk_|stack_)/, '').replace(/_/g, ' ').slice(0, 8) || '叠层';

// v1.2.68 专门显示区：增益 / 减益分两行（各自边框颜色），图标带剩余时间扫光、层数；悬停显示说明浮窗（不再用浏览器 title）
const total = new Map<string, number>();    // 每个图标见过的最长剩余时间 → 扫光比例
const shown = new Map<string, BuffIcon>();  // 行内图标 → 浮窗内容
const fmtT = (r?: number) => r === undefined ? '' : r >= 60 ? `${Math.ceil(r / 60)}分` : String(Math.ceil(r));
function row(rowId: string, list: BuffIcon[], kind: 'b' | 'd', max: number) {
  if (!list.length) return '';
  const lab = kind === 'b' ? '增益' : '减益';
  return `<div class="bh-row bh-row-${kind}"><span class="bh-lab">${lab}</span>` + list.slice(0, max).map(i => {
    const key = `${rowId}:${i.id}`;
    if (i.remaining !== undefined) total.set(key, Math.max(total.get(key) ?? 0, i.remaining)); else total.delete(key);
    shown.set(key, i);
    const tot = total.get(key), p = i.remaining !== undefined && tot ? Math.max(0, Math.min(1, i.remaining / tot)) : 1;
    const st = i.stacks && i.stacks > 1 && i.id !== 'shield' ? `<b>${i.stacks}</b>` : '';
    return `<span class="bh ${i.debuff ? 'bh-d' : 'bh-b'}${i.remaining !== undefined && i.remaining < 3 ? ' bh-end' : ''}" data-id="${i.id}" data-k="${key}" aria-label="${i.name}：${i.desc}" style="--bc:${i.color ?? (i.debuff ? '#e55' : '#6d6')};--p:${(p * 360).toFixed(0)}deg"><i>${i.glyph}</i>${st}<small>${fmtT(i.remaining)}</small></span>`;
  }).join('') + (list.length > max ? `<span class="bh-more">+${list.length - max}</span>` : '') + '</div>';
}
function render(el: HTMLElement | null, icons: BuffIcon[]) {
  if (!el) return;
  const buffs = icons.filter(i => !i.debuff), debs = icons.filter(i => i.debuff);
  const sig = icons.map(i => `${i.id}:${i.debuff ? 1 : 0}:${i.remaining ? Math.ceil(i.remaining * 2) : ''}:${i.stacks ?? ''}`).join('|');
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  for (const k of [...total.keys()]) if (k.startsWith(el.id + ':') && !icons.some(i => k === `${el.id}:${i.id}`)) { total.delete(k); shown.delete(k); }
  el.innerHTML = row(el.id, buffs, 'b', 10) + row(el.id, debs, 'd', 10);
  if (el.id === 'pf-buffs') document.documentElement.style.setProperty('--pfb', `${el.offsetHeight}px`);   // 任务追踪跟着往下让
  if (tipKey && tipKey.startsWith(el.id + ':')) fillTip();
}

// ---------- 悬停浮窗 ----------
let tip: HTMLElement | null = null, tipKey: string | null = null;
function fillTip() {
  if (!tip || !tipKey) return;
  const i = shown.get(tipKey); if (!i) { hideTip(); return; }
  const h = `<div class="bt-h" style="color:${i.color ?? '#fff'}"><i>${i.glyph}</i>${i.name}<em class="${i.debuff ? 'd' : 'b'}">${i.debuff ? '减益' : '增益'}</em></div><div class="bt-d">${i.desc}</div>`
    + (i.stacks && i.stacks > 1 && i.id !== 'shield' ? `<div class="bt-s">层数 ${i.stacks}</div>` : '')
    + (i.remaining !== undefined ? `<div class="bt-s">剩余 ${i.remaining >= 60 ? `${Math.floor(i.remaining / 60)} 分 ${Math.ceil(i.remaining % 60)} 秒` : `${i.remaining.toFixed(1)} 秒`}</div>` : '');
  if (tip.dataset.h !== h) { tip.dataset.h = h; tip.innerHTML = h; }
}
function hideTip() { tipKey = null; if (tip) tip.style.display = 'none'; }
function initTip() {
  if (tip || typeof document === 'undefined') return;
  tip = document.createElement('div'); tip.id = 'bh-tip'; document.body.appendChild(tip);
  document.addEventListener('mousemove', e => {
    const t = (e.target as HTMLElement | null)?.closest?.('.bh') as HTMLElement | null;
    if (!t || !t.dataset.k) { if (tipKey) hideTip(); return; }
    tipKey = t.dataset.k; fillTip(); tip!.style.display = 'block';
    const w = tip!.offsetWidth, h = tip!.offsetHeight;
    tip!.style.left = `${Math.max(4, Math.min(e.clientX + 14, innerWidth - w - 6))}px`; tip!.style.top = `${Math.max(4, Math.min(e.clientY + 16, innerHeight - h - 6))}px`;
  });
}
/** 测试用：模拟悬停某个图标，返回浮窗文字 */
export function buffTipDebug(rowId: string, id: string) { initTip(); tipKey = `${rowId}:${id}`; fillTip(); const s = tip?.textContent ?? ''; hideTip(); return s; }

/** 截图 / 测试用：假首领（runehud.hudDemo）身上的图标 */
let demoIcons: BuffIcon[] | null = null;
export function buffDemo(on: boolean) {
  demoIcons = on ? [
    { id: 'enrage', glyph: '♨', name: '狂怒', desc: '造成的伤害 +30%', remaining: 18, debuff: false, color: '#ff7a3a' },
    { id: 'ward', glyph: '⛨', name: '熔岩护甲', desc: '受到的火焰伤害 -50%', remaining: 40, stacks: 3, debuff: false, color: '#ffb040' },
    { id: 'dot_fire', glyph: '☠', name: '燃烧', desc: '每秒受到 420 点伤害', remaining: 5, stacks: 4, debuff: true, color: '#f72' },
    { id: 'erosion', glyph: '☣', name: '侵蚀', desc: '你的持续伤害对它 +22%', remaining: 9, stacks: 22, debuff: true, color: '#b070ff' },
    { id: 'slow', glyph: '❄', name: '减速', desc: '移动速度 -30%', remaining: 2.4, debuff: true, color: '#7ad' },
  ] : null;
}
/** 每帧（HUD 刷新）调用 */
export function updateBuffHud(boss: CombatUnit | null, bossShown: boolean, target: CombatUnit | null) {
  render(CX.$('pf-buffs'), CX.player?.alive ? iconsOf(CX.player as unknown as CombatUnit, 'player') : []);
  render(CX.$('bf-buffs'), bossShown && boss ? iconsOf(boss, 'boss') : bossShown && demoIcons ? demoIcons : []);
  render(CX.$('tf-buffs'), target ? iconsOf(target, 'target') : []);
}
/** 测试用：当前三行的图标 id */
export function buffHudDebug() {
  const ids = (id: string) => Array.from(CX.$(id)?.querySelectorAll('.bh') ?? []).map(e => ({ id: (e as HTMLElement).dataset.id, debuff: e.classList.contains('bh-d'), row: e.closest('.bh-row')?.classList.contains('bh-row-d') ? 'd' : 'b' }));
  return { player: ids('pf-buffs'), boss: ids('bf-buffs'), target: ids('tf-buffs') };
}
