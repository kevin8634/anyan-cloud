// v0.7.6：英灵传承面板（Y）+ 击杀 / 等级 / 纹语挂钩
import { paragon } from './paragon_ui';
import type { Ctx } from './main';
import { Spirits, SpiritSave } from '../core/Spirits';
import { SPIRIT_SLOT_LEVELS, SPIRIT_TIER_AT, STAT_NAME, spiritDef, SpiritDef } from '../data/spirits';
import { runeWordsSave } from './awaken_ui';

let CX!: Ctx;
const $ = (id: string) => document.getElementById(id);
export let spirits = new Spirits('warrior', () => 1);
spirits.paragonLevel = () => paragon.level;   // v0.7.11 暗岩印记英灵
/** 每个职业一份（存档 spirits[cls]） */
let all: Record<string, SpiritSave> = {};
let selSlot = 0;

export function spiritsReset(cls: string) {
  if (spirits.cls && CX) all[spirits.cls] = spirits.save();
  spirits = new Spirits(cls, () => CX?.progression.level ?? 1); spirits.paragonLevel = () => paragon.level;
  spirits.load(all[cls]);
}
export function spiritsSave() { all[spirits.cls] = spirits.save(); return { ...all }; }
export function spiritsLoad(s?: Record<string, SpiritSave> | null) { all = { ...(s ?? {}) }; spirits.load(all[spirits.cls]); }

/** syncCharacter 里调用：修饰器 + 资源加成 + 新解锁提示 */
export function spiritMods() {
  if (!CX) return [];
  spirits.setStat('runeword', runeWordsSave().length);
  for (const d of spirits.newlyUnlocked()) if (CX.started) CX.toast(`英灵「${d.name} · ${d.title}」愿意传承于你（按 Y 装备）`, d.color);
  return spirits.modifiers();
}
/** 击败首领 / 精英 */
export function spiritOnKill(kind: 'dungeon' | 'elite' | 'raid') {
  if (!CX) return;
  const up = spirits.bump(kind);
  for (const d of up) CX.toast(`英灵「${d.title}」升到 ${spirits.tier(d.id)} 阶！`, d.color);
  CX.syncCharacter();
  if ($('spirit')?.style.display === 'flex') renderSpirits();
}

const tierStars = (t: number) => '★'.repeat(t) + '☆'.repeat(3 - t);
function card(d: SpiritDef, cls = '') {
  const u = spirits.unlocked(d), t = spirits.tier(d.id), x = spirits.xp[d.id] ?? 0, next = SPIRIT_TIER_AT[t];
  return `<div class="spr-card ${cls}${u ? '' : ' locked'}" data-spr="${d.id}" style="--c:${d.color}">
    <i class="pic ic-${d.icon}"></i><div><b>${d.name} · ${d.title}</b> <small style="color:var(--ink-warm,#5a3a00)">${u ? tierStars(t) : ''}</small><br>
    <small>${u ? d.desc(Math.max(1, t)) : `🔒 ${STAT_NAME[d.unlock.stat]} ${spirits.stat(d.unlock.stat)}/${d.unlock.n}`}</small>
    ${u && next !== undefined ? `<br><small class="dim">升阶：装备时击败首领 ${x}/${next}</small>` : ''}</div></div>`;
}
export function renderSpirits() {
  const body = $('spr-body'); if (!body) return;
  const n = spirits.slotCount();
  if (selSlot >= Math.max(1, n)) selSlot = 0;
  const slots = SPIRIT_SLOT_LEVELS.map((lv, i) => {
    const d = spiritDef(spirits.slots[i]);
    if (i >= n) return `<div class="spr-slot off">🔒 ${lv} 级</div>`;
    return `<div class="spr-slot${i === selSlot ? ' on' : ''}" data-spr-slot="${i}" style="--c:${d?.color ?? '#776'}">${d ? `<i class="pic ic-${d.icon}"></i><small>${d.title} ${tierStars(spirits.tier(d.id))}</small>` : '<small>空</small>'}</div>`;
  }).join('');
  const pool = spirits.pool().map(d => card(d, spirits.slots.includes(d.id) ? 'eq' : '')).join('');
  body.innerHTML = `<div class="dim">英灵是你在冒险中赢得的传承：击败首领、精英，发现纹语都会唤醒新的英灵。10 / 15 / 20 / 25 / 30 级各开 1 个传承槽；装着的英灵随你击败首领升阶（10 / 30 次，长副本首领算 2 次）。</div>
    <div class="spr-slots">${slots}</div>
    ${n ? `<div class="dim">选中第 ${selSlot + 1} 个槽，点击下面的英灵装上；再点已装的英灵卸下。</div>` : '<div class="dim">10 级开放第一个传承槽。</div>'}
    <div class="spr-pool">${pool}</div>`;
}
function onClick(ev: MouseEvent) {
  const el = (ev.target as HTMLElement).closest('[data-spr-slot],[data-spr]') as HTMLElement | null;
  if (!el) return;
  if (el.dataset.sprSlot) { selSlot = +el.dataset.sprSlot; renderSpirits(); return; }
  const id = el.dataset.spr!, d = spiritDef(id)!;
  if (!spirits.slotCount()) { CX.toast('10 级开放传承槽'); CX.audio.error(); return; }
  if (!spirits.unlocked(d)) { CX.toast(`还没解锁：${STAT_NAME[d.unlock.stat]} ${d.unlock.n}`); CX.audio.error(); return; }
  const at = spirits.slots.indexOf(id);
  if (at >= 0 && at < spirits.slotCount()) spirits.equip(at, null); else spirits.equip(selSlot, id);
  CX.audio.click(); CX.syncCharacter(); CX.save(); renderSpirits();
}
export function openSpirits() { CX.togglePanel('spirit', true); renderSpirits(); }
export function bindSpiritUi(ctx: Ctx) {
  CX = ctx;
  spirits = new Spirits(spirits.cls, () => CX?.progression.level ?? 1); spirits.paragonLevel = () => paragon.level;
  $('spr-body')?.addEventListener('click', onClick);
  $('btn-spirit')?.addEventListener('click', () => CX.togglePanel('spirit'));
}
export const spiritDebug = () => ({ cls: spirits.cls, slots: spirits.slotCount(), equipped: spirits.equipped().map(d => d.id), stats: { ...spirits.stats }, xp: { ...spirits.xp }, bonus: spirits.resBonus(), mods: spirits.modifiers().length });
export const spiritResBonus = () => spirits.resBonus();
