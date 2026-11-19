// v0.7.5：职业资源（引擎无关）。每个职业一种新资源，只增强已有技能，不加新按钮。
// 战士 怒气 0–100（条）；法师 奥能充能 0–4（点）；时砂行者 连击点 0–5（点，时砂保留）；炼金投弹手 反应热度 0–100（条，试剂保留）
import { ModifierDef, SlotId, Element } from './types';
import { RES_DEF, ResKind } from '../data/resources';
import { ResBonus, NO_BONUS } from '../data/spirits';

export interface ResState {
  kind: ResKind; value: number;
  /** 最后一次进战斗 / 获得资源的时间（衰减用） */
  lastGain: number;
  /** 法师：上一个技能的元素；时砂：连击目标 + 上次加点的施法序号 */
  lastEl?: Element; comboTarget?: string; comboCast?: number;
  /** 施法序号（每次 tryCast +1） */
  castSeq: number;
  /** 统计（测试 / 平衡脚本用） */
  stats: { gained: number; spent: number; empowered: number; freeUlts: number };
  /** v0.7.6 英灵传承：资源加成 */
  bonus: ResBonus;
}
export const newRes = (cls: string): ResState => ({ kind: RES_DEF[cls]?.kind ?? 'rage', value: 0, lastGain: -99, castSeq: 0, stats: { gained: 0, spent: 0, empowered: 0, freeUlts: 0 }, bonus: { ...NO_BONUS } });
export const resMax = (r: ResState) => RES_DEF_BY_KIND[r.kind].max + (r.bonus?.maxAdd ?? 0);
/** 强化门槛（英灵可降低） */
export const resThr = (r: ResState) => Math.max(1, RES_DEF_BY_KIND[r.kind].threshold + (r.bonus?.thrAdd ?? 0));
const RES_DEF_BY_KIND = Object.fromEntries(Object.values(RES_DEF).map(d => [d.kind, d])) as Record<ResKind, (typeof RES_DEF)[string]>;
export const resDef = (r: ResState) => RES_DEF_BY_KIND[r.kind];

const BASE_KINDS: Record<string, 1> = { rage: 1, arcane: 1, combo: 1, heat: 1 };
/** v1.0.6：内容包资源直接加 / 减（职业运行时用） */
export function resGain(r: ResState, n: number, now: number) { gain(r, n, now); }
function gain(r: ResState, n: number, now: number) {
  const before = r.value;
  r.value = Math.min(resMax(r), r.value + (r.kind === 'rage' || r.kind === 'heat' || !(r.kind in BASE_KINDS) ? n * (1 + (r.bonus?.gainMul ?? 0)) : n));
  r.lastGain = now; r.stats.gained += r.value - before;
}
/** 每帧：脱战一段时间后衰减（连击点断档直接清零） */
export function resTick(r: ResState, dt: number, now: number) {
  const d = resDef(r);
  if (now - r.lastGain < d.decayDelay + (r.bonus?.delayAdd ?? 0) || r.value <= 0) return;
  if (d.decayPerSec >= 999) { r.value = 0; r.comboTarget = undefined; return; }
  r.value = Math.max(0, r.value - d.decayPerSec * dt);
}
/** 玩家技能命中敌人（非持续伤害）；targetId 用来判断连击是否打在同一目标上 */
export function resOnHit(r: ResState, slot: SlotId | undefined, targetId: string, now: number) {
  const d = resDef(r);
  if (r.kind === 'rage') gain(r, slot === 'basic' ? d.gainBasic! : d.gainSkillHit!, now);
  else if (r.kind !== 'arcane' && r.kind !== 'heat' && r.kind !== 'combo' && (d.gainBasic != null || d.gainSkillHit != null)) gain(r, (slot === 'basic' ? d.gainBasic : d.gainSkillHit) ?? 0, now);   // v1.0.6 内容包资源：命中获得
  else if (r.kind === 'combo') {
    if (r.comboCast === r.castSeq) return;   // 一次施法只加 1 点
    if (r.comboTarget !== targetId) { r.value = 0; r.comboTarget = targetId; }
    r.comboCast = r.castSeq;
    gain(r, 1, now);
  } else r.lastGain = now;
}
/** 玩家受到伤害（非持续伤害）：怒气按损失的生命比例增加 */
export function resOnHurt(r: ResState, amount: number, maxHp: number, now: number) {
  if (r.kind !== 'rage') return;
  gain(r, Math.min(20, amount / maxHp * 100 * resDef(r).gainHurtPerPct!), now);
}
/** 炼金：地面反应 */
export function resOnReaction(r: ResState, now: number) { if (r.kind === 'heat') gain(r, resDef(r).gainReaction!, now); }
/** 每次施法前调用（slot / element / tags = 预览出来的技能）：法师按元素轮换攒层 */
export function resOnCast(r: ResState, slot: SlotId, el: Element, now: number) {
  r.castSeq++;
  if (r.kind === 'arcane' && slot !== 'basic') {
    if (r.lastEl !== el) gain(r, 1, now);
    r.lastEl = el; r.lastGain = now;
  }
}

/** 这次施法能不能被强化；能就返回要临时加上的修饰器（和要花掉的资源） */
export function resEmpower(r: ResState, slot: SlotId, tags: string[] = []): { mods: ModifierDef[]; cost: number; label: string } | null {
  const thr = resThr(r), more = r.bonus?.empowerMore ?? 0;
  const m = (name: string, ops: ModifierDef['ops']): ModifierDef => ({ id: `res:${r.kind}`, name, desc: '', source: 'buff', match: { slots: [slot] }, priority: 40, ops });
  switch (r.kind) {
    case 'rage':
      if (slot === 'basic' || slot === 'ultimate' || r.value < thr) return null;
      return { cost: thr, label: '怒气强化', mods: [m('怒·', [{ op: 'more', stat: 'damage', value: 0.3 + more }, { op: 'mul', stat: 'radius', value: 0.25 }, { op: 'rename', prefix: '怒·' }])] };
    case 'arcane':
      if (slot === 'basic' || r.value < thr) return null;
      return { cost: thr, label: '奥能满溢', mods: [m('奥能', [{ op: 'add', stat: 'projectileCount', value: 1 }, { op: 'mul', stat: 'radius', value: 0.5 }, { op: 'more', stat: 'damage', value: 0.2 + more }, { op: 'rename', prefix: '满溢·' }])] };
    case 'combo': {
      if (!(slot === 'skill1' || slot === 'skill3' || slot === 'ultimate') || r.value < 1) return null;
      const n = Math.floor(r.value);
      return { cost: n, label: `连击 ${n} 点`, mods: [m('连击', [{ op: 'more', stat: 'damage', value: 0.1 * n + more }, ...(n >= 5 ? [{ op: 'addEffect' as const, effect: { type: 'stun' as const, duration: 1 } }] : []), ...(n >= 3 ? [{ op: 'rename' as const, suffix: `·连${n}` }] : [])])] };
    }
    case 'heat':
      if (slot === 'basic' || slot === 'ultimate' || r.value < thr || !tags.some(t => t.startsWith('reagent_'))) return null;
      return { cost: thr, label: '沸腾', mods: [m('沸腾', [{ op: 'more', stat: 'damage', value: 0.5 + more }, { op: 'mul', stat: 'radius', value: 0.3 + more }, { op: 'rename', prefix: '沸腾·' }])] };
    default: {   // v1.0.6 内容包资源：规则由包给
      const e = resDef(r).empower?.(r.value, thr, slot, tags, more);
      return e ? { ...e, mods: e.mods.map(x => ({ ...x, id: x.id || `res:${r.kind}`, match: x.match ?? { slots: [slot] } })) } : null;
    }
  }
}
/** 战士：怒气满 100 时大招无视冷却（消耗全部怒气） */
export const resFreeUlt = (r: ResState) => r.kind === 'rage' && r.value >= resMax(r) - 1e-6;
export function resSpend(r: ResState, n: number) { const s = Math.min(r.value, n); r.value -= s; r.stats.spent += s; r.stats.empowered++; if (r.kind === 'combo' && r.value < 1) r.comboTarget = undefined; }
