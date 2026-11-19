// ========== v1.2.35：可控触发（重做「生命低于 X%」类装备 / 天赋 / 英灵） ==========
// 写 core/CondFlags 的状态，SkillResolver 的 flag / stacks 条件读取：
//   oath   立誓：位移技能（冲锋 / 闪现 / 位移标签）或翻滚后 4 秒（誓约护符）
//   evade  顿悟：翻滚或闪现后 4 秒，下一个技能消耗（濒死顿悟）
//   kill   击杀后 5 秒（劫掠者披风）
//   hurt   受到伤害后 4 秒（英灵·不屈誓言）
//   cc     眩晕 / 打断敌人后 6 秒（骑士团誓约指环）
//   shield 护盾存在（灰烬龙鳞披风）       near6 6 米内敌人数，最多 5（背水一战）
//   troll / core  技能命中叠层，满 10 层下一个技能消耗（巨魔之血 3 件 / 熔核）
// 另：墓守锁链（暗金）锁链目标的易伤 / 回血 / 各职业联动在这里实现。
import type { Ctx, Enemy } from './main';
import type { ResolvedSkill, Element } from '../core/types';
import type { CombatUnit } from '../core/Combat';
import { CondFlags } from '../core/CondFlags';
import { hasDark, hasLg, ax, ad } from './classgear';
import { chronoHooks } from './chrono';
import { addBuffSource, BuffIcon } from './buffhud';
import { spawnRing } from './effects';

let CX!: Ctx;
const P = () => CX.player;
const T = () => CX.T;
const CHAIN = 'd_warden_chain';
const chained = new WeakMap<CombatUnit, number>();
const chainFrozen = new WeakMap<CombatUnit, number>();
const trollVuln = new WeakMap<CombatUnit, number>();
const healed = new WeakSet<CombatUnit>();
let pendCc: CombatUnit[] = [];
let wasRolling = false;
let pullAt = -1;
export const trigStats = { oath: 0, evade: 0, kill: 0, cc: 0, chainMark: 0, chainHeal: 0, chainCd: 0, chainFreeze: 0, chainPull: 0, troll: 0, trollBoss: 0 };

const isMove = (s: ResolvedSkill) => s.shape === 'dash' || s.tags.some(t => t === 'blink' || t === 'leap' || t === 'movement' || t === 'dash');
function moved(blink: boolean) {
  CondFlags.setTimed('oath', T() + 4); trigStats.oath++;
  if (blink) { CondFlags.setTimed('evade', T() + 4); trigStats.evade++; }
}

/** 成功施法（casting.tryCast） */
export function trigfxCast(s: ResolvedSkill) {
  if (!isMove(s)) return;
  moved(s.tags.includes('blink') || s.shape === 'dash');
  if (CX.cls.id === 'chrono' && hasDark(CHAIN)) pullAt = T() + 0.35;   // 落点确定后再拉
}

/** 技能命中（casting.applyHits，结算前） */
export function trigfxHits(s: ResolvedSkill, hits: Enemy[]): ResolvedSkill {
  if (!hits.length) return s;
  const now = T();
  if (s.slot !== 'basic') {
    CondFlags.addStack('troll', 1, 10); CondFlags.addStack('core', 1, 10);
    if (s.effects.some(e => e.type === 'stun' || e.type === 'interrupt')) { CondFlags.setTimed('cc', now + 6); trigStats.cc++; }
    else if (s.effects.some(e => e.type === 'stackStun')) pendCc.push(...hits);
  } else if (s.effects.some(e => e.type === 'stackStun')) pendCc.push(...hits);
  for (const r of CondFlags.hitRules) {
    if (r.skillIds && !r.skillIds.includes(s.baseId)) continue;
    if (r.slots && !r.slots.includes(s.slot)) continue;
    CondFlags.addStack(r.key, r.perTarget ? hits.length : 1, r.max, r.dur ? now + r.dur : Infinity, now);
  }
  if (s.appliedModifiers.includes('set_troll_3')) {   // 巨魔之怒爆发：首领改为打断 + 4 秒易伤
    trigStats.troll++;
    for (const e of hits) if (e.isBoss) { e.onInterrupt?.(); trollVuln.set(e, now + 4); trigStats.trollBoss++; }
  }
  if (hasDark(CHAIN)) {
    const c = CX.cls.id;
    for (const e of hits) {
      if ((chained.get(e) ?? 0) <= now) continue;
      if (c === 'warrior' && s.slot === 'skill1' && s.shape === 'dash') { const l = CX.loadout.cooldownLeft('skill1', now); if (l > 0) { CX.loadout.reduceCooldown('skill1', l * 0.5); trigStats.chainCd++; } }
      if ((c === 'mage' && s.baseId === 'frost_ring') || (c === 'alchemy' && s.slot === 'skill2')) {
        if ((chainFrozen.get(e) ?? -99) + 10 <= now && e.alive) {
          chainFrozen.set(e, now);
          if (!e.ccImmune) e.status.add({ key: 'stun', kind: 'stun', remaining: ad(CHAIN, c === 'mage' ? 1.5 : 1), source: P() });
          e.onInterrupt?.(); trigStats.chainFreeze++;
        }
      }
    }
    if (s.slot !== 'basic') for (const e of hits) { chained.set(e, now + ad(CHAIN, 6)); trigStats.chainMark++; }
  }
  return s;
}

function preDeal(t: CombatUnit, amt: number, _el: Element, src: CombatUnit | null): number {
  if (!CX.started || src !== P() || t === P()) return amt;
  let k = 1;
  if ((chained.get(t) ?? 0) > T() && hasDark(CHAIN)) k += ax(CHAIN, 0.15);
  if ((trollVuln.get(t) ?? 0) > T()) k += 0.1;
  return amt * k;
}

function onDealt(t: CombatUnit, dealt: number, _el: Element, src: CombatUnit | null) {
  if (!CX.started || dealt <= 0) return;
  const p = P();
  if (t === p && src && src !== p) { CondFlags.setTimed('hurt', T() + 4); return; }
  if (src !== p || t === p || t.alive) return;
  if (healed.has(t)) return;
  healed.add(t);
  CondFlags.setTimed('kill', T() + 5); trigStats.kill++;
  if ((chained.get(t) ?? 0) > T() && hasDark(CHAIN)) { CX.fx.heal(p, p.maxHp * ax(CHAIN, 0.03)); trigStats.chainHeal++; }
}

/** 每帧 */
export function trigfxUpdate(_dt: number) {
  if (!CX.started) return;
  const r = !!CX.dodge?.rolling;
  if (r && !wasRolling) moved(true);
  wasRolling = r;
  if (pendCc.length) { if (pendCc.some(e => e.alive && e.status.isStunned)) { CondFlags.setTimed('cc', T() + 6); trigStats.cc++; } pendCc = []; }
  if (pullAt > 0 && T() >= pullAt) {
    pullAt = -1;
    const pos = P().getPos();
    const near = CX.enemies.filter(e => e.alive && e.z === CX.zone && CX.isActive(e) && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 6);
    const anchor = near.find(e => (chained.get(e) ?? 0) > T()) ?? CX.enemies.find(e => e.alive && e.z === CX.zone && (chained.get(e) ?? 0) > T());
    if (anchor) {
      for (const e of near) {
        if (e === anchor || e.isBoss || e.ccImmune) continue;
        const dx = anchor.pos.x - e.pos.x, dz = anchor.pos.z - e.pos.z, d = Math.hypot(dx, dz);
        if (d < 1.2) continue;
        const k = Math.min(3, d - 1) / d; e.pos.x += dx * k; e.pos.z += dz * k; trigStats.chainPull++;
      }
      spawnRing(anchor.getPos(), 2.5, '#8fd0ff', 0.4);
    }
  }
}

export function trigfxReset() { CondFlags.reset(); pendCc = []; wasRolling = false; pullAt = -1; }

const ICONS: Record<string, [string, string, string, string]> = {   // key → 字形, 名字, 说明, 颜色
  oath: ['⚔', '立誓', '誓约护符：伤害提高', '#ffd34d'], evade: ['✧', '顿悟', '下一个技能伤害 +50% 并吸血', '#c9a0ff'],
  kill: ['☗', '劫掠', '击杀后技能伤害 +20%', '#ff8040'], hurt: ['⛊', '不屈', '受到伤害后技能伤害提高', '#c0c0ff'],
  cc: ['✦', '誓约追击', '控制敌人后技能伤害 +25%', '#ffe080'], troll: ['♨', '巨魔之怒', '满 10 层下一个技能眩晕', '#7fd060'],
  core: ['✹', '熔核', '满 10 层下一个技能伤害 +60%', '#ff6020'], tide: ['≋', '浪涌', '每层技能伤害 +4%', '#60d0ff'],
  near6: ['⚑', '背水', '身边每个敌人技能伤害 +8%', '#ff5050'],
};
let keyCache = { sig: '', keys: new Set<string>() };
function activeKeys(): Set<string> {
  const mods = CX.loadout.allModifiers();
  const sig = mods.length + ':' + (mods[0]?.id ?? '') + ':' + (mods[mods.length - 1]?.id ?? '');
  if (sig === keyCache.sig) return keyCache.keys;
  const keys = new Set<string>();
  for (const m of mods) for (const c of m.conditions ?? []) if (c.type === 'flag' || c.type === 'stacks') keys.add(c.key);
  keyCache = { sig, keys };
  return keys;
}

export function bindTrigfx(ctx: Ctx) {
  CX = ctx;
  CondFlags.provide('shield', () => (CX.player?.status.shield ?? 0) > 0.5 ? 1 : 0);
  CondFlags.provide('near6', () => { const p = CX.player?.getPos(); if (!p) return 0; let n = 0; for (const e of CX.enemies) if (e.alive && e.z === CX.zone && CX.isActive(e) && !e.isDummy && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) <= 6) n++; return Math.min(5, n); });
  const prevD = CX.fx.onDealt;
  CX.fx.onDealt = (...a) => { prevD?.(...a); onDealt(a[0], a[1], a[2], a[3]); };
  const pre = CX.fx.preDeal;
  CX.fx.preDeal = (t, amt, el, src, crit, tick) => preDeal(t, pre ? pre(t, amt, el, src, crit, tick) : amt, el, src);
  chronoHooks.markBonus = () => (CX.cls.id === 'chrono' && CondFlags.get('oath', CX.T) > 0 && hasLg('lg_x_oathcharm') ? 1 : 0);
  addBuffSource((unit, who) => {
    const out: BuffIcon[] = [];
    if (who === 'player' && unit === CX.player) {
      for (const k of activeKeys()) {
        const ic = ICONS[k]; if (!ic) continue;
        const v = CondFlags.get(k, CX.T); if (v <= 0) continue;
        out.push({ id: 'trig_' + k, glyph: ic[0], name: ic[1], desc: ic[2], remaining: CondFlags.left(k, CX.T), stacks: v > 1 ? v : undefined, debuff: false, color: ic[3] });
      }
    } else if ((chained.get(unit) ?? 0) > CX.T && hasDark(CHAIN)) {
      out.push({ id: 'trig_chain', glyph: '⛓', name: '锁链', desc: '墓守锁链：你对它的伤害 +15%，死亡时你回复 3% 最大生命', remaining: (chained.get(unit) ?? 0) - CX.T, debuff: true, color: '#8fd0ff' });
    }
    return out;
  });
}

export const trigfxDebug = () => ({ stats: { ...trigStats }, flags: CondFlags.debug(CX.T) });
