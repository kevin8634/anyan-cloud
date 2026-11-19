// ========== v1.2.35：冷却重置的统一入口（内置冷却 + 技能栏闪金光 + 飘字） ==========
// 所有「重置冷却」类效果（EffectDef resetCooldown、lgfx 代码型橙装）都走 doReset：
//   - slot = 'longest'：重置剩余冷却最长的非大招技能（技能 1–4）
//   - icd：内置冷却（按目标槽位共用，'longest' 单独一组），防止多件叠加无限连放
//   - 技能本来就没在冷却（< 0.3 秒）时不触发、不占内置冷却
import type { Ctx } from './main';
import type { SlotId } from '../core/types';
import { floatText } from './effects';

let CX!: Ctx;
const icd = new Map<string, number>();
const NAME: Record<SlotId, string> = { basic: '普攻', skill1: '技能 1', skill2: '技能 2', skill3: '技能 3', skill4: '技能 4', ultimate: '大招' };
export const resetStats = { n: 0, blocked: 0, bySlot: {} as Record<string, number>, flashes: 0, last: '' };

export function doReset(slot: SlotId | 'longest', icdSec = 0): boolean {
  if (!CX?.loadout) return false;
  let s: SlotId | undefined;
  if (slot === 'longest') {
    let best = 0.3;
    for (const k of ['skill1', 'skill2', 'skill3', 'skill4'] as SlotId[]) { const l = CX.loadout.cooldownLeft(k, CX.T); if (l > best) { best = l; s = k; } }
  } else s = slot;
  if (!s || CX.loadout.cooldownLeft(s, CX.T) < 0.3) return false;
  const key = slot === 'longest' ? 'longest' : s;
  if (icdSec > 0 && CX.T < (icd.get(key) ?? -Infinity)) { resetStats.blocked++; return false; }
  if (icdSec > 0) icd.set(key, CX.T + icdSec);
  CX.loadout.resetCooldown(s);
  resetStats.n++; resetStats.bySlot[s] = (resetStats.bySlot[s] ?? 0) + 1; resetStats.last = s;
  flashSlot(s);
  try { floatText(CX.player, `${NAME[s]}重置`, '#ffd34d', s === 'ultimate' ? 1.3 : 1.05); } catch { /* 无头测试 */ }
  return true;
}

/** 技能栏对应按钮闪金光 0.9 秒 */
export function flashSlot(s: SlotId) {
  const el = typeof document !== 'undefined' ? document.getElementById(`sk-${s}`) : null;
  if (!el) return;
  el.classList.remove('sk-reset'); void el.offsetWidth; el.classList.add('sk-reset');
  resetStats.flashes++;
  setTimeout(() => el.classList.remove('sk-reset'), 900);
}

export function resetfxReset() { icd.clear(); }
export function bindResetfx(ctx: Ctx) { CX = ctx; }
