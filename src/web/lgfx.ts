// ========== v0.9.1r：橙装 96 第二步——需要战斗钩子的橙装（本版：战士 14 件 + 法师 11 件） ==========
// 设计表：docs/设计/表_橙装96条.xlsx（不改表）；表里 pending 的条目在 data/legendary_v091.ts 的 LG_HOOKED 里登记后进掉落池
// 挂钩：EffectSystem.preDeal（伤害结算前的倍率：易伤 / 减伤）、onDealt（串联）、casting.applyHits → lgfxHits、tryCast → lgfxCast、main 每帧 lgfxUpdate
// 口径：「急速 +X%」= 冷却按 X% 加速；「跳速 +X%」= 这段时间里该持续伤害每跳 ×(1+X%)（同等每秒伤害）
import type { Ctx, Enemy } from './main';
import { ResolvedSkill, Element } from '../core/types';
import { CombatUnit, unitsInRadius, dotInterval } from '../core/Combat';
import { hasLg, ax, ap, ad, an } from './classgear';
import { res } from './reshud';
import { spawnRing } from './effects';
import { doReset } from './resetfx';
import { chronoHooks, chronoHit, chronoMark, chronoMarks, chronoQueueClone, chrono, sandMax } from './chrono';
import { alchemyHooks, alchemyPots, alchemyZones } from './alchemy';
import type { ModifierDef } from '../core/types';

let CX!: Ctx;
const P = () => CX.player;
const near = (p: { x: number; z: number }, r: number) => (unitsInRadius(CX.world, p, r, 'player') as Enemy[]).filter(e => e.z === CX.zone && e.alive);
const basicDmg = () => CX.loadout.preview('basic', CX.ctx())?.stats.damage ?? 20;
const mine = (e: CombatUnit, els: Element[]) => e.status.dots().filter(d => d.source === P() && els.includes(d.element));
const bleeding = (e: CombatUnit) => mine(e, ['physical']).length > 0;
const burning = (e: CombatUnit) => mine(e, ['fire']).length > 0;
const slowed = (e: CombatUnit) => e.status.has('slow') || e.status.isStunned;
const SLOTS = ['basic', 'skill1', 'skill2', 'skill3', 'skill4', 'ultimate'] as const;

let extra = false;
function hit(t: CombatUnit, amt: number, el: Element, tick = true) {
  if (!t.alive || amt <= 0) return 0;
  extra = true; const v = CX.fx.dealDamage(t, amt, el, P(), false, false, tick); extra = false; return v;
}
/** 橙装持续伤害：总量 total 在 dur 秒内跳完（不再乘强度，total 已经是按伤害算出来的） */
function dotTotal(e: CombatUnit, key: string, el: Element, total: number, dur = 4) {
  if (!e.alive || total <= 0) return;
  e.status.add({ key: `lg:${key}:${el}`, kind: 'dot', remaining: dur, dps: total / dur, element: el, source: P(), interval: 1 });
}
/** 橙装持续伤害：按普攻伤害的比例（吃强度 / 急速 / 暴击） */
function dotBasic(e: CombatUnit, key: string, el: Element, k: number, dur = 4) {
  const p = P();
  e.status.add({ key: `lg:${key}:${el}`, kind: 'dot', remaining: dur, dps: basicDmg() * k * (p.dotPower ?? 1), element: el, source: p, interval: dotInterval(p), crit: p.critChance, critMult: p.critMult });
}

// ---------------- 状态 ----------------
export const lgfx = {
  slot: '' as string, slotT: -1,          // 当前这次技能命中的槽位（preDeal 判断「普攻伤害」）
  ultUntil: 0, ultTaken: 0, ultOn: false, // 战士 12：大招期间
  s1Until: 0,                             // 战士 17：技能 1 后 3 秒
  rageUntil: 0, rageMul: 1, prevRage: 0,  // 战士 20
  stillT: 0, lastPos: null as { x: number; z: number } | null,
  shieldPeak: 0, shieldPrev: 0, hurtT: -9, // 战士 24
  empSeen: 0, empUntil: 0,                // 法师 33
  trail: [] as { x: number; z: number; t: number }[], trailT: 0, trailSlowT: 0,   // 法师 41
  ext: new WeakMap<CombatUnit, number>(), // 法师 45：每个目标已延长的秒数
  w09: new WeakMap<CombatUnit, number>(), // 战士 09：誓血结算冷却
  zonesSeen: new WeakSet<object>(),       // 法师 47
  // 时砂 / 炼金（v0.9.1s）
  moveMul: 1, rewindT: -9, markICD: 0, pendExt: new Set<CombatUnit>(), boomICD: 0, blastReady: false, slowT: 0,
  vuln: new WeakMap<CombatUnit, { n: number; t: number }>(),
  stats2: { c50: 0, c53: 0, c54: 0, c59: 0, c60: 0, c63: 0, c66: 0, c67: 0, c68: 0, c72: 0, a74: 0, a80: 0, a81: 0, a88: 0, a89: 0, a91: 0, a92: 0, a93: 0 },
  stats: { w09: 0, w03: 0, w05: 0, w06: 0, w11: 0, w12: 0, w18: 0, w21: 0, w23: 0, w24: 0, m27: 0, m41: 0, m43: 0, m45: 0, m46: 0, m47: 0 },
};
const S = lgfx;

/** 技能命中（casting.applyHits，套装之后） */
export function lgfxHits(s: ResolvedSkill, hits: Enemy[]): ResolvedSkill {
  S.slot = s.slot ?? ''; S.slotT = CX.T;
  const c = CX.cls.id, p = P();
  if (c === 'warrior') {
    if (s.slot === 'skill3' && hits.length && hasLg('lg91_warrior_03')) {   // 镇岳巨锤：技能 3 命中获得护盾
      const v = s.stats.damage * hits.length * ax('lg91_warrior_03', 0.25);
      p.status.addShield('lg:w03', v, 6, p.maxHp * 0.3, p); S.stats.w03++;
    }
    if (s.slot !== 'basic' && hasLg('lg91_warrior_09')) for (const e of hits) {   // v1.2.35 誓血：技能命中流血目标，立刻结算剩余流血的 50%（每目标 4 秒一次）
      if ((S.w09.get(e) ?? -99) + 4 > CX.T) continue;
      const sum = mine(e, ['physical']).reduce((a, d) => a + d.dps * d.ticksLeft, 0);
      if (sum <= 0) continue;
      S.w09.set(e, CX.T); hit(e, sum * ax('lg91_warrior_09', 0.5), 'physical', false); S.stats.w09++;
    }
    if (s.slot === 'skill2' && hasLg('lg91_warrior_23')) {   // 技能 2 每命中一个流血目标，冷却 -0.5 秒
      const n = hits.filter(bleeding).length;
      if (n) { CX.loadout.reduceCooldown('skill2', ad('lg91_warrior_23', 0.5) * n); S.stats.w23 += n; }
    }
  }
  if (c === 'chrono') {
    if (s.slot === 'basic' && hasLg('lg91_chrono_50')) hits.forEach(e => S.pendExt.add(e));   // 下一帧延长（施法后切割会重新挂上）
  }
  if (c === 'alchemy') {
    if (s.slot === 'basic' && hasLg('lg91_alchemy_74')) for (const e of hits) if (inAlcZone(e.getPos())) for (const d of mine(e, ['nature'])) { e.status.refreshDot(d.key, Math.round(ad('lg91_alchemy_74', 4) / dotInterval(p))); S.stats2.a74++; }
    if (s.slot === 'skill1' && hasLg('lg91_alchemy_91')) for (const e of hits) {
      const fb = mine(e, ['frost']); if (!fb.length) continue;
      const sum = fb.reduce((a, d) => a + d.dps * d.ticksLeft, 0); fb.forEach(d => e.status.remove(d.key)); hit(e, sum, 'frost', false); S.stats2.a91++;
    }
    if (S.blastReady && s.tags.some(t => t.startsWith('reagent_')) && hasLg('lg91_alchemy_89')) { S.blastReady = false; S.stats2.a89++; return { ...s, stats: { ...s.stats, damage: s.stats.damage * (1 + ax('lg91_alchemy_89', 0.4)) } }; }
  }
  if (c === 'mage' && s.slot === 'basic' && hasLg('lg91_mage_45')) {   // 普攻延长燃烧 0.5 秒（每个目标最多 +3 秒）
    for (const e of hits) {
      const used = S.ext.get(e) ?? 0; if (used >= ad('lg91_mage_45', 3)) continue;
      const burns = mine(e, ['fire']); if (!burns.length) continue;
      for (const d of burns) e.status.extendDot(d.key, Math.max(1, Math.round(ad('lg91_mage_45', 0.5) / dotInterval(p))));
      S.ext.set(e, used + ad('lg91_mage_45', 0.5)); S.stats.m45++;
    }
  }
  return s;
}

/** 成功施法（casting.tryCast，套装之后） */
export function lgfxCast(s: ResolvedSkill) {
  if (CX.cls.id !== 'warrior') return;
  if (s.slot === 'ultimate') {
    if (hasLg('lg91_warrior_12')) { S.ultUntil = CX.T + ad('lg91_warrior_12', 6); S.ultOn = true; S.ultTaken = 0; }
    if (hasLg('lg91_warrior_20')) { S.rageMul = 1 + ax('lg91_warrior_20', 0.05) * Math.floor(S.prevRage / 10); S.rageUntil = CX.T + ad('lg91_warrior_20', 8); }
  }
  if (s.slot === 'skill1' && hasLg('lg91_warrior_17')) S.s1Until = CX.T + ad('lg91_warrior_17', 3);
}

const frostFields = () => CX.fx.activeZones.filter(z => z.owner === P() && z.element === 'frost');
const inField = (q: { x: number; z: number }) => frostFields().some(z => Math.hypot(z.pos.x - q.x, z.pos.z - q.z) <= z.radius);
const melee = (src: CombatUnit) => { const a = src.getPos(), b = P().getPos(); return Math.hypot(a.x - b.x, a.z - b.z) <= 3.5; };

/** 伤害结算前（EffectSystem.preDeal）：返回改过的伤害 */
function preDeal(t: CombatUnit, amt: number, el: Element, src: CombatUnit | null, crit: boolean, tick: boolean): number {
  const p = P(), c = CX.cls.id;
  if (!CX.started) return amt;
  // ---- 玩家受到伤害 ----
  if (t === p && src && src !== p) {
    let k = 1;
    if (c === 'warrior') {
      if (p.status.reflectBuff && hasLg('lg91_warrior_06')) k -= ax('lg91_warrior_06', 0.15);
      if (CX.T < S.ultUntil && hasLg('lg91_warrior_12')) k -= ax('lg91_warrior_12', 0.2);
      if (S.stillT >= 1 && hasLg('lg91_warrior_18')) k -= ax('lg91_warrior_18', 0.2);
    }
    if (c === 'mage' && hasLg('lg91_mage_35') && inField(p.getPos())) k -= ax('lg91_mage_35', 0.15);
    if (c === 'alchemy' && hasLg('lg91_alchemy_83') && alchemyZones().some(z => z.kind === 'fire' && Math.hypot(z.x - p.getPos().x, z.z - p.getPos().z) <= z.r)) k -= ax('lg91_alchemy_83', 0.2);
    return amt * Math.max(0.2, k);
  }
  if (src !== p || t === p) return amt;
  // ---- 玩家造成伤害 ----
  let k = 1;
  if (c === 'warrior') {
    if (tick && el === 'physical') {
      if (p.status.shield > 0 && hasLg('lg91_warrior_03')) k += ax('lg91_warrior_03', 0.3);
      if (CX.T < S.s1Until && hasLg('lg91_warrior_17')) k += ax('lg91_warrior_17', 0.3);
      if (CX.T < S.rageUntil && hasLg('lg91_warrior_20')) k *= S.rageMul;
    }
    if (!tick && S.slot === 'basic' && S.slotT === CX.T && bleeding(t) && hasLg('lg91_warrior_04')) k += ax('lg91_warrior_04', 0.2);
  }
  if (c === 'mage') {
    if (tick && el === 'fire' && CX.T < S.empUntil && hasLg('lg91_mage_33')) k += ax('lg91_mage_33', 0.3);
    if (burning(t) && slowed(t) && hasLg('lg91_mage_29')) k += ax('lg91_mage_29', 0.15);
    if (crit && slowed(t) && hasLg('lg91_mage_44')) { const cm = p.critMult ?? 1.5; k *= (cm + ax('lg91_mage_44', 0.3)) / cm; }
  }
  if (c === 'chrono') {
    if (tick && el === 'physical') {
      if (chrono.sand >= sandMax() - 1e-6 && hasLg('lg91_chrono_57')) k += ax('lg91_chrono_57', 0.25);
      if (CX.T < S.rewindT + 3 && hasLg('lg91_chrono_69')) k += ax('lg91_chrono_69', 0.5);
    }
    if (!tick && S.slot === 'basic' && S.slotT === CX.T && CX.T < S.rewindT + 5 && hasLg('lg91_chrono_51')) k += ax('lg91_chrono_51', 0.4);
  }
  if (c === 'alchemy') {
    if (tick) {
      const q = p.getPos();
      if (hasLg('lg91_alchemy_84') && inAlcZone(q)) k += ax('lg91_alchemy_84', 0.2);
      if (hasLg('lg91_alchemy_96') && alchemyPots().length) k += ax('lg91_alchemy_96', 0.3);
    }
    if (!tick && S.slot === 'basic' && S.slotT === CX.T && alchemyPots().length && hasLg('lg91_alchemy_75')) k += ax('lg91_alchemy_75', 0.25);
    if (hasLg('lg91_alchemy_94') && mine(t, ['fire']).length && mine(t, ['frost']).length && mine(t, ['nature']).length) k += ax('lg91_alchemy_94', 0.2);
    const v = S.vuln.get(t); if (v && CX.T - v.t < 4 && hasLg('lg91_alchemy_95')) k += ax('lg91_alchemy_95', 0.01) * v.n;
  }
  return amt * k;
}
const inAlcZone = (q: { x: number; z: number }) => alchemyZones().some(z => Math.hypot(z.x - q.x, z.z - q.z) <= z.r);

/** 伤害结算后（EffectSystem.onDealt，串联在套装之后） */
function onDealt(t: CombatUnit, dealt: number, el: Element, src: CombatUnit | null, crit: boolean, tick: boolean) {
  if (extra || dealt <= 0 || !CX.started) return;
  const p = P(), c = CX.cls.id;
  if (t === p && src && src !== p) {
    S.hurtT = CX.T;
    if (c !== 'warrior') return;
    if (CX.T < S.ultUntil && hasLg('lg91_warrior_12')) S.ultTaken += dealt;
    if (!tick && hasLg('lg91_warrior_06') && Math.random() < ap('lg91_warrior_06', 0.3)) { dotBasic(src, 'w06', 'physical', ax('lg91_warrior_06', 0.12)); S.stats.w06++; }
    if (!tick && hasLg('lg91_warrior_18') && melee(src)) { dotBasic(src, 'w18', 'physical', ax('lg91_warrior_18', 0.1)); S.stats.w18++; }
    if (!tick && hasLg('lg91_warrior_21') && melee(src)) { dotTotal(src, 'w21', 'physical', dealt * ax('lg91_warrior_21', 0.15)); S.stats.w21++; }
    return;
  }
  if (src !== p || t === p) return;
  if (c === 'warrior' && tick && el === 'physical') {
    if (hasLg('lg91_warrior_05')) { CX.fx.heal(p, dealt * ax('lg91_warrior_05', 0.03)); S.stats.w05++; }
    if (crit && hasLg('lg91_warrior_11') && res.kind === 'rage') { res.value = Math.min(100 + (res.bonus?.maxAdd ?? 0), res.value + ax('lg91_warrior_11', 5)); S.stats.w11++; }
  }
  if (c === 'mage' && tick && el === 'fire') {
    if (crit && hasLg('lg91_mage_27') && Math.random() < ap('lg91_mage_27', 0.5)) { const d = mine(t, ['fire'])[0]; if (d) { t.status.extendDot(d.key, an('lg91_mage_27', 1)); S.stats.m27++; } }
    if (hasLg('lg91_mage_43') && Math.random() < ap('lg91_mage_43', 0.02, true) && doReset('ultimate', 20)) S.stats.m43++;   // v1.2.35 旧：2% 重置技能 1
  }
  if (c === 'chrono' && tick && el === 'physical' && t.alive) {
    if (crit && hasLg('lg91_chrono_50') && CX.T >= S.markICD) { S.markICD = CX.T + 0.5; chronoMark(t as Enemy, 1); S.stats2.c50++; }
    if (hasLg('lg91_chrono_67') && Math.random() < ap('lg91_chrono_67', 0.05)) { chronoMark(t as Enemy, 1); S.stats2.c67++; }
  }
  if (c === 'alchemy') {
    if (tick && el === 'fire' && crit && hasLg('lg91_alchemy_80') && CX.T >= S.boomICD) {
      S.boomICD = CX.T + 0.5; const q = t.getPos(); spawnRing(q, 3, '#ff7a10', 0.35); S.stats2.a80++;
      for (const e of near(q, 3)) hit(e, basicDmg() * ax('lg91_alchemy_80', 0.3), 'fire', false);
    }
    if (tick && el === 'nature' && hasLg('lg91_alchemy_95')) { const v = S.vuln.get(t); S.vuln.set(t, { n: Math.min(10, (v && CX.T - v.t < 4 ? v.n : 0) + 1), t: CX.T }); }
    if (!t.alive && hasLg('lg91_alchemy_92')) {
      const cor = mine(t, ['nature']);
      if (cor.length) { const q = t.getPos(); for (const o of near(q, 4)) if (o !== t) for (const d of cor) o.status.add({ key: d.key, kind: 'dot', remaining: Math.max(1, d.ticksLeft) * dotInterval(p), dps: d.dps, element: 'nature', source: p, interval: dotInterval(p), crit: p.critChance, critMult: p.critMult }); spawnRing(q, 4, '#5aff3a', 0.3); S.stats2.a92++; }
    }
  }
  if (c === 'mage' && !t.alive && hasLg('lg91_mage_46')) {   // 燃烧中的目标死亡：燃烧跳到最近的敌人
    const burns = mine(t, ['fire']); if (!burns.length) return;
    const pos = t.getPos();
    const to = near(pos, 8).filter(e => e !== t).sort((a, b) => Math.hypot(a.getPos().x - pos.x, a.getPos().z - pos.z) - Math.hypot(b.getPos().x - pos.x, b.getPos().z - pos.z))[0];
    if (!to) return;
    for (const d of burns) to.status.add({ key: d.key, kind: 'dot', remaining: Math.max(1, d.ticksLeft) * dotInterval(p), dps: d.dps, element: 'fire', source: p, interval: dotInterval(p), crit: p.critChance, critMult: p.critMult });
    spawnRing(to.getPos(), 1.5, '#ff7030', 0.3); S.stats.m46++;
  }
}

/** 冷却加速（急速口径） */
function haste(dt: number, pct: number) { if (pct > 0) for (const s of SLOTS) CX.loadout.reduceCooldown(s, dt * pct); }

/** 每帧 */
export function lgfxUpdate(dt: number) {
  if (!CX.started || !P().alive) return;
  const p = P(), c = CX.cls.id, pos = p.getPos();
  const moved = S.lastPos ? Math.hypot(pos.x - S.lastPos.x, pos.z - S.lastPos.z) : 0;
  S.stillT = moved > 0.02 ? 0 : S.stillT + dt;
  if (c === 'warrior') {
    if (res.kind === 'rage') S.prevRage = res.value;
    if (hasLg('lg91_warrior_15')) haste(dt, Math.min(ax('lg91_warrior_15', 0.1), ax('lg91_warrior_15', 0.02) * near(pos, 8).filter(bleeding).length));
    if (S.ultOn && CX.T >= S.ultUntil) {   // 大招结束：期间受到伤害的 30% 化作周围流血
      S.ultOn = false;
      if (S.ultTaken > 0) { spawnRing(pos, 6, '#ff2030', 0.6); for (const e of near(pos, 6)) dotTotal(e, 'w12', 'physical', S.ultTaken * ax('lg91_warrior_12', 0.3)); S.stats.w12++; }
    }
    if (hasLg('lg91_warrior_24')) {   // 护盾被打破：护盾值 50% 的范围流血
      const sh = p.status.shield;
      if (sh > 0) S.shieldPeak = Math.max(S.shieldPeak, sh);
      if (S.shieldPrev > 0 && sh <= 0.5 && CX.T - S.hurtT < 0.2 && S.shieldPeak > 0) {
        spawnRing(pos, 5, '#ff2030', 0.5); for (const e of near(pos, 5)) dotTotal(e, 'w24', 'physical', S.shieldPeak * ax('lg91_warrior_24', 0.5)); S.stats.w24++;
      }
      if (sh <= 0.5) S.shieldPeak = 0;
      S.shieldPrev = sh;
    }
  }
  if (c === 'mage') {
    if (res.stats.empowered > S.empSeen) { if (hasLg('lg91_mage_33')) S.empUntil = CX.T + ad('lg91_mage_33', 5); }
    S.empSeen = res.stats.empowered;
    if (hasLg('lg91_mage_38') && near(pos, 8).filter(burning).length >= 3) haste(dt, ax('lg91_mage_38', 0.1));
    if (hasLg('lg91_mage_41')) {   // 冰霜路径
      if (moved > 0.02 && CX.T >= S.trailT) { S.trailT = CX.T + 0.4; S.trail.push({ x: pos.x, z: pos.z, t: CX.T + ad('lg91_mage_41', 3) }); spawnRing(pos, 1.2, '#9ad8ff', 0.25); }
      S.trail = S.trail.filter(q => q.t > CX.T);
      if (CX.T >= S.trailSlowT) {
        S.trailSlowT = CX.T + 0.5;
        for (const q of S.trail) for (const e of near(q, 1.5)) if (!e.ccImmune) { e.status.add({ key: 'lg:m41', kind: 'slow', remaining: 1, percent: ax('lg91_mage_41', 0.3), source: p }); S.stats.m41++; }
      }
    }
    if (hasLg('lg91_mage_47')) for (const z of frostFields()) {   // 冰原持续 +3 秒
      if (S.zonesSeen.has(z)) continue;
      S.zonesSeen.add(z); (z as { ticksLeft: number }).ticksLeft += Math.round(ad('lg91_mage_47', 3) / (z.interval ?? 1)); S.stats.m47++;
    }
  }
  if (c === 'chrono') {
    for (const e of S.pendExt) { if (e.alive) mine(e, ['physical']).forEach(d => e.status.extendDot(d.key, Math.round(ad('lg91_chrono_50', 2) / dotInterval(p)))); }
    S.pendExt.clear();
    const tg = CX.target, marked = !!tg?.alive && chronoMarks(tg) > 0 && hasLg('lg91_chrono_65');
    S.moveMul = marked ? 1 + ax('lg91_chrono_65', 0.15) : 1;
    CX.loadout.lgMods = marked ? [RANGE_MOD] : [];
  } else { S.moveMul = 1; if (CX.loadout.lgMods.length) CX.loadout.lgMods = []; }
  if (c === 'alchemy') {
    if ((CX.dodge?.rolling || p.status.isInvulnerable) && hasLg('lg91_alchemy_89')) S.blastReady = true;
    if (hasLg('lg91_alchemy_90') && alchemyPots().some(q => Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) <= 5)) haste(dt, ax('lg91_alchemy_90', 0.15));
    if (hasLg('lg91_alchemy_88') && CX.T >= S.slowT) {
      S.slowT = CX.T + 0.5;
      for (const z of alchemyZones()) for (const e of near(z, z.r)) if (!e.ccImmune) { e.status.add({ key: 'lg:a88', kind: 'slow', remaining: 0.8, percent: Math.min(0.8, ((z as { slow?: number }).slow ?? 0) + ax('lg91_alchemy_88', 0.2)), source: p }); S.stats2.a88++; }
    }
  }
  S.lastPos = { x: pos.x, z: pos.z };
}
const RANGE_MOD: ModifierDef = { id: 'lg91_chrono_65_r', name: '时痕·追猎', source: 'buff', desc: '', match: { slots: ['basic'] }, priority: 40, ops: [{ op: 'add', stat: 'range', value: 2 }] };
/** 移速倍率（时痕 65：对带时痕的目标 +15%） */
export const lgMoveMul = () => S.moveMul;

export function lgfxReset() {
  S.rewindT = -9; S.pendExt.clear(); S.blastReady = false; S.moveMul = 1; if (CX?.loadout) CX.loadout.lgMods = [];
  S.ultUntil = 0; S.ultOn = false; S.ultTaken = 0; S.s1Until = 0; S.rageUntil = 0; S.empUntil = 0; S.trail = []; S.shieldPeak = 0; S.shieldPrev = 0; S.lastPos = null;
}

export function bindLgfx(ctx: Ctx) {
  CX = ctx;
  const prev = CX.fx.onDealt;
  CX.fx.onDealt = (...a) => { prev?.(...a); onDealt(...a); };
  // 时砂
  const isC = () => CX.cls.id === 'chrono';
  chronoHooks.markAdd = () => (isC() && hasLg('lg91_chrono_61') ? an('lg91_chrono_61', 1) : 0);
  chronoHooks.cloneAdd = () => (isC() && hasLg('lg91_chrono_62') ? an('lg91_chrono_62', 2) : 0);
  chronoHooks.extraEcho = () => isC() && hasLg('lg91_chrono_71');
  chronoHooks.lgDetMul = e => (isC() && hasLg('lg91_chrono_61') ? 1 + ax('lg91_chrono_61', 0.1) : 1) * (isC() && hasLg('lg91_chrono_70') ? 1 + ax('lg91_chrono_70', e.isBoss ? 0.3 : 0.2) : 1);
  chronoHooks.onDetonate = (e, dealt) => { if (isC() && hasLg('lg91_chrono_53') && e.alive) { dotTotal(e, 'c53', 'physical', dealt * ax('lg91_chrono_53', 0.2)); S.stats2.c53++; } };
  chronoHooks.onEchoHit = (s, hits, crit) => {
    if (!isC()) return;
    if (hasLg('lg91_chrono_54')) { const d = s.effects.find(x => x.type === 'dot' && x.element === 'physical') as { dps: number; duration: number } | undefined; if (d) for (const e of hits) { dotTotal(e, 'c54', 'physical', d.dps * d.duration * (P().dotPower ?? 1) * ax('lg91_chrono_54', 0.5), d.duration); S.stats2.c54++; } }
    if (hasLg('lg91_chrono_60') && Math.random() < ap('lg91_chrono_60', 0.1)) { chrono.sand = Math.min(sandMax(), chrono.sand + 1); S.stats2.c60++; }
    if (crit && hasLg('lg91_chrono_68')) for (const e of hits) { const v = mine(e, ['physical']).reduce((a, d) => a + d.dps, 0); if (v > 0) { hit(e, v, 'physical'); S.stats2.c68++; } }
  };
  chronoHooks.onBlink = (_s, from, to) => {
    if (!isC()) return;
    if (hasLg('lg91_chrono_66')) { chronoQueueClone(from, ax('lg91_chrono_66', 0.3)); S.stats2.c66++; }
    if (hasLg('lg91_chrono_59')) {
      const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz || 1;
      for (const e of near({ x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }, Math.sqrt(L2) / 2 + 1.5)) {
        const q = e.getPos(), k = Math.max(0, Math.min(1, ((q.x - from.x) * dx + (q.z - from.z) * dz) / L2));
        if (Math.hypot(q.x - (from.x + dx * k), q.z - (from.z + dz * k)) <= 1.5) { chronoMark(e, 1); S.stats2.c59++; }
      }
    }
  };
  chronoHooks.onStopEndLg = hitList => { if (isC() && hasLg('lg91_chrono_72')) for (const e of hitList) if (e.alive) mine(e, ['physical']).forEach(d => { e.status.extendDot(d.key, Math.round(ad('lg91_chrono_72', 4) / dotInterval(P()))); S.stats2.c72++; }); };
  chronoHooks.onRewindLg = () => {
    if (!isC()) return;
    S.rewindT = CX.T;
    if (hasLg('lg91_chrono_63')) for (const e of near(P().getPos(), 4)) { dotBasic(e, 'c63', 'physical', ax('lg91_chrono_63', 0.15)); S.stats2.c63++; }
  };
  void chronoHit;
  // 炼金
  const isA = () => CX.cls.id === 'alchemy';
  alchemyHooks.zoneAdd = () => (isA() && hasLg('lg91_alchemy_85') ? ad('lg91_alchemy_85', 2) : 0);
  alchemyHooks.onPotFire = (tg, refire) => {
    if (!isA()) return;
    if (hasLg('lg91_alchemy_81')) { dotBasic(tg, 'a81', 'frost', ax('lg91_alchemy_81', 0.1)); S.stats2.a81++; }
    if (hasLg('lg91_alchemy_93') && Math.random() < ap('lg91_alchemy_93', 0.15)) { setTimeout(refire, 250); S.stats2.a93++; }
  };
  const pre = CX.fx.preDeal;
  CX.fx.preDeal = (t, amt, el, src, crit, tick) => preDeal(t, pre ? pre(t, amt, el, src, crit, tick) : amt, el, src, crit, tick);
}

/** 测试用 */
export const lgfxDebug = () => ({ stats: { ...S.stats }, stats2: { ...S.stats2 }, rewindT: S.rewindT, moveMul: S.moveMul, blastReady: S.blastReady, ultUntil: S.ultUntil, s1Until: S.s1Until, rageMul: S.rageMul, empUntil: S.empUntil, trail: S.trail.length, stillT: S.stillT });
