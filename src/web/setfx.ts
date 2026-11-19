// ========== v0.9.1m：长副本职业套装 6 件效果（2 / 4 / 6 件特殊效果，6 件按主专精 / 终极天赋变化） ==========
// 数据与说明：data/sets.ts（FURY_SET_BONUSES / FROST_BONUSES / CHRONO_SET_BONUSES / ALCHEMY_SET_BONUSES / SET6）
// 挂钩：casting.applyHits → setfxHits（每次技能命中，可改伤害）；casting.tryCast → setfxCast；EffectSystem.onDealt（串联）；
//       chrono.ts chronoHooks（引爆倍率 / 第二个分身 / 终刻结束 / 回溯）；alchemy.ts alchemyZones / alchemySwamp；main 每帧 setfxUpdate
import type { Ctx, Enemy } from './main';
import { ResolvedSkill, Element, SlotId } from '../core/types';
import { CombatUnit, unitsInRadius, dotInterval } from '../core/Combat';
import { setN } from './classgear';
import { SET6 } from '../data/sets';
import { chronoHooks, chronoStore, chronoCloneActive } from './chrono';
import { alchemyZones, alchemySwamp } from './alchemy';
import { spawnRing } from './effects';

let CX!: Ctx;
const P = () => CX.player;
const rank = (id: string) => CX.tree?.effRank(id) ?? 0;
/** 主专精 = 投点最多的一系（并列取靠前的） */
function mainSpec(): string | null {
  let best: string | null = null, n = 0;
  for (const sp of CX.tree.def.specs) { const k = CX.tree.spentIn(sp.id); if (k > n) { n = k; best = sp.id; } }
  return best;
}
/** 6 件分支：没满 6 件 = null；主专精点了终极 = 该分支 id；否则 'general' */
export function spec6(setId: string): string | null {
  if (setN(setId) < 6) return null;
  const sp = mainSpec();
  const b = SET6[setId]?.branches.find(x => x.spec === sp);
  return b && rank(b.capstone) > 0 ? b.spec : 'general';
}
const enemiesNear = (p: { x: number; z: number }, r: number) => (unitsInRadius(CX.world, p, r, 'player') as Enemy[]).filter(e => e.z === CX.zone && e.alive);
const basicDmg = () => CX.loadout.preview('basic', CX.ctx())?.stats.damage ?? 20;
let extra = false;   // 套装补的伤害不再触发套装
function hit(t: CombatUnit, amt: number, el: Element, tick = true, crit = false) {
  if (!t.alive || amt <= 0) return 0;
  extra = true; const v = CX.fx.dealDamage(t, amt, el, P(), crit, false, tick); extra = false; return v;
}
/** 给目标加一个套装持续伤害（吃强度 / 急速 / 暴击，和技能的持续伤害同口径） */
function addDot(e: CombatUnit, key: string, el: Element, dps: number, dur: number, interval?: number) {
  const p = P();
  e.status.add({ key: `set:${key}:${el}`, kind: 'dot', remaining: dur, dps: dps * (p.dotPower ?? 1), element: el, source: p, interval: interval ?? dotInterval(p), crit: p.critChance, critMult: p.critMult });
}
/** 目标身上玩家的持续伤害（可按元素过滤）剩余总伤害 */
function remainingDot(e: CombatUnit, els?: Element[]) {
  return e.status.dots().filter(d => d.source === P() && (!els || els.includes(d.element))).reduce((a, d) => a + d.dps * d.ticksLeft, 0);
}
const myDots = (e: CombatUnit, els: Element[]) => e.status.dots().filter(d => d.source === P() && els.includes(d.element));

// ---------------- 状态 ----------------
export const setfx = {
  soul: 0,                      // 狂怒 2 件：战魂
  chanUntil: 0, chanMul: 1, chanCrit: false, echoEnd: 0,   // v1.2.73 剑刃风暴整段战魂；万象回声结束结算
  whirlUntil: 0, whirlNext: 0, whirlSkill: null as ResolvedSkill | null,
  wallOn: false, wallTaken: 0,
  steamUntil: 0, steamNext: 0, steamPos: null as { x: number; z: number } | null,
  cutLog: [] as { t: number; v: number }[],
  alcSeq: [] as string[], swamp: false, blastReady: 0, tickT: 0,
  stats: { soulSpent: 0, mortal: 0, whirlPulses: 0, wallBursts: 0, frostfire: 0, steams: 0, spreads: 0, binds: 0, deathBlasts: 0, etch: 0, doom: 0, replays: 0, stopCuts: 0, mixes: 0, swampResets: 0, blasts: 0 },
};
const S = setfx;

/** 每次技能命中（casting.applyHits 调用）：可以返回改过伤害的技能 */
export function setfxHits(s: ResolvedSkill, hits: Enemy[]): ResolvedSkill {
  const c = CX.cls.id;
  if (c === 'warrior' && setN('set_fury') >= 2) {
    // 2 件：下一个直接伤害技能（普攻除外）消耗全部战魂，每点 +4%；6 件通用：满 10 点的大招再 +60%
    let mul = 1, forceCrit = false;
    const chan = s.baseId === 'bladestorm';
    if (chan && CX.T < S.chanUntil && hits.length) { mul = S.chanMul; forceCrit = S.chanCrit; }   // v1.2.73 剑刃风暴：整段引导沿用开场消耗的战魂
    else if (s.slot !== 'basic' && s.stats.damage > 0 && S.soul > 0 && hits.length) {
      mul += S.soul * 0.04;
      const sp = spec6('set_fury');
      if (S.soul >= 10 && s.slot === 'ultimate' && sp === 'general') mul += 0.6;
      if (S.soul >= 10 && sp === 'w_arms') forceCrit = true;
      if (chan) { mul *= 1.1; S.chanMul = mul; S.chanCrit = forceCrit; S.chanUntil = CX.T + 6.3; }   // 引导类略高 +10%（Rhett 11-03：过低改正常略高）
      S.stats.soulSpent += S.soul; S.soul = 0;
    }
    // 4 件：同一敌人被技能 2 命中 3 次 → 重置技能 1
    if (setN('set_fury') >= 4 && s.slot === 'skill2') for (const e of hits) if (e.alive && e.status.addStack('set:fury3', 3, 8, P()) >= 3) { CX.loadout.resetCooldown('skill1'); break; }
    const sp = spec6('set_fury');
    // 6 件 · 武器（致死打击 = 普攻）：一次结算剩余流血
    if (sp === 'w_arms' && s.slot === 'basic' && s.displayName.includes('致死')) for (const e of hits) { const r = remainingDot(e, ['physical']); if (r > 0) { hit(e, r, 'physical', false); S.stats.mortal++; } }
    if (sp === 'w_arms' && forceCrit) mul *= P().critMult ?? 1.6;
    // 6 件 · 狂怒：技能 2 之后继续旋转 5 秒
    if (sp === 'w_fury' && s.slot === 'skill2' && CX.T > S.whirlUntil) { S.whirlUntil = CX.T + 5; S.whirlNext = CX.T + 1; S.whirlSkill = s; }
    if (mul !== 1) return { ...s, stats: { ...s.stats, damage: s.stats.damage * mul } };
  }
  if (c === 'mage' && setN('set_frost') >= 2) {
    // 2 件：冰霜伤害命中燃烧的敌人，结算剩余燃烧 30%
    if (s.element === 'frost') for (const e of hits) { const r = remainingDot(e, ['fire']); if (r > 0) { hit(e, r * 0.3, 'fire', false); S.stats.frostfire++; } }
    const sp = spec6('set_frost');
    if (sp === 'm_frost' && s.slot === 'skill2') for (const e of hits) {   // 碎火：扩散燃烧
      const burns = myDots(e, ['fire']); if (!burns.length) continue;
      const top = burns.reduce((a, b) => (a.dps * a.ticksLeft >= b.dps * b.ticksLeft ? a : b));
      for (const o of enemiesNear(e.getPos(), 5)) if (o !== e) { o.status.add({ key: top.key, kind: 'dot', remaining: 4, dps: top.dps, element: 'fire', source: P(), interval: dotInterval(P()), crit: P().critChance, critMult: P().critMult }); S.stats.spreads++; }
      e.status.refreshDot(top.key, 4);
    }
    if (sp === 'm_arcane' && s.slot === 'skill3') for (const e of hits) { addDot(e, 'bind', 'fire', basicDmg() * 0.12, 4, 0.5); S.stats.binds++; }   // 缚焰
    if (sp === 'm_fire' && s.slot === 'ultimate' && hits[0]) {   // 蒸爆：陨星落在冰原上
      const p = hits[0].getPos();
      if (frostFields().some(z => Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < z.radius + 2)) { S.steamUntil = CX.T + 4; S.steamNext = CX.T + 1; S.steamPos = p; }
    }
  }
  if (c === 'chrono' && spec6('set_chrono') === 'c_mark') { /* 命定：倍率走 chronoHooks.detMul */ }
  return s;
}

/** 按下技能并成功释放（casting.tryCast 调用） */
export function setfxCast(s: ResolvedSkill) {
  if (CX.cls.id === 'chrono' && s.tags.includes('echo_all') && spec6('set_chrono') === 'general') S.echoEnd = CX.T + 8;
  if (CX.cls.id !== 'alchemy' || setN('set_alchemy') < 2) return;
  const col = s.tags.includes('reagent_r') ? 'r' : s.tags.includes('reagent_b') ? 'b' : s.tags.includes('reagent_g') ? 'g' : '';
  if (!col) return;
  S.alcSeq.push(col); if (S.alcSeq.length > 3) S.alcSeq.shift();
  if (S.alcSeq.length === 3 && new Set(S.alcSeq).size === 3) {   // 2 件：三色连投，第 3 瓶落点再混合反应
    S.alcSeq = [];
    const tg = CX.target; if (!tg) return;
    const at = tg.getPos(), dmg = s.stats.damage * 0.6;
    setTimeout(() => {
      if (!CX.started) return;
      spawnRing(at, 3, '#c080ff', 0.5);
      for (const e of enemiesNear(at, 3)) { hit(e, dmg, 'arcane', false); addDot(e, 'mixR', 'fire', basicDmg() * 0.1, 4); addDot(e, 'mixB', 'frost', basicDmg() * 0.08, 4); addDot(e, 'mixG', 'nature', basicDmg() * 0.1, 4); }
      S.stats.mixes++;
    }, 550);
  }
}

const frostFields = () => CX.fx.activeZones.filter(z => z.owner === P() && z.element === 'frost');
const inField = (p: { x: number; z: number }) => frostFields().some(z => Math.hypot(z.pos.x - p.x, z.pos.z - p.z) <= z.radius);
const inZone = (p: { x: number; z: number }) => alchemyZones().some(z => Math.hypot(z.x - p.x, z.z - p.z) <= z.r);

/** EffectSystem.onDealt（串联在时砂 / 炼金之后） */
function onDealt(t: CombatUnit, dealt: number, el: Element, src: CombatUnit | null, _crit: boolean, tick: boolean) {
  if (extra || dealt <= 0) return;
  const p = P(), c = CX.cls.id;
  // 狂怒 6 件 · 防护：盾墙期间被打 → 攻击者流血，记录受到的伤害
  if (t === p && src && src !== p && c === 'warrior' && S.wallOn) { S.wallTaken += dealt; addDot(src, 'wall', 'physical', basicDmg() * 0.15, 4); return; }
  if (src !== p || t === p) return;
  if (c === 'warrior' && tick && el === 'physical' && setN('set_fury') >= 2) S.soul = Math.min(10, S.soul + 1);
  if (c === 'mage' && tick && el === 'fire' && setN('set_frost') >= 4 && inField(t.getPos())) hit(t, dealt * 0.5, 'fire');   // 冰原里燃烧 ×1.5
  if (c === 'mage' && !t.alive && setN('set_frost') >= 6 && spec6('set_frost') === 'general' && inField(t.getPos()) && myDots(t, ['fire']).length) {   // 通用：死亡爆炸传染
    const pos = t.getPos(); spawnRing(pos, 4, '#ff7030', 0.4); S.stats.deathBlasts++;
    for (const o of enemiesNear(pos, 4)) { hit(o, basicDmg() * 0.6, 'fire', false); addDot(o, 'blast', 'fire', basicDmg() * 0.15, 4); }
  }
  if (c === 'chrono' && tick && el === 'physical') {
    if (setN('set_chrono') >= 2) { chronoStore(t as Enemy, dealt * 0.2); S.stats.etch++; }
    S.cutLog.push({ t: CX.T, v: dealt });
    if (spec6('set_chrono') === 'c_echo' && chronoCloneActive()) hit(t, dealt * 0.3, 'physical');
  }
  if (c === 'alchemy' && tick && setN('set_alchemy') >= 6 && spec6('set_alchemy') === 'a_ground' && S.swamp && inZone(t.getPos())) hit(t, dealt, el);   // 沸腾：持续伤害翻倍
  if (c === 'alchemy' && !tick && el === 'fire' && spec6('set_alchemy') === 'a_blast' && S.swamp && CX.T >= S.blastReady && inZone(t.getPos())) {   // 殉爆
    S.blastReady = CX.T + 4; S.stats.blasts++;
    for (const z of alchemyZones()) for (const e of enemiesNear(z, z.r)) { const r = remainingDot(e); if (r > 0) hit(e, r, 'fire', false); }
  }
}

/** 每帧 */
export function setfxUpdate(_dt: number) {
  if (!CX.started || !P().alive) return;
  const c = CX.cls.id;
  if (c === 'warrior') {
    const sp = spec6('set_fury');
    if (sp === 'w_fury' && S.whirlSkill && CX.T < S.whirlUntil && CX.T >= S.whirlNext) {   // 血舞：每秒一圈
      S.whirlNext += 1; S.stats.whirlPulses++;
      const s = S.whirlSkill, pos = P().getPos(), wr = Math.max(4, s.stats.radius);   // v1.2.73 地震波（直线宽 2）也有 4 米圈
      spawnRing(pos, wr, '#ff2030', 0.35);
      for (const e of enemiesNear(pos, wr)) {
        const bleeding = myDots(e, ['physical']).length > 0;
        const v = hit(e, s.stats.damage * 0.4, 'physical', false);
        myDots(e, ['physical']).forEach(d => e.status.refreshDot(d.key, 4));
        if (bleeding && v > 0) CX.fx.heal(P(), v * 0.08);
      }
    }
    const on = sp === 'w_prot' && !!P().status.reflectBuff;
    if (on && !S.wallOn) { S.wallOn = true; S.wallTaken = 0; }
    if (!on && S.wallOn) {   // 盾墙结束：范围流血爆发
      S.wallOn = false;
      if (S.wallTaken > 0) { const pos = P().getPos(); spawnRing(pos, 6, '#ff2030', 0.6); S.stats.wallBursts++; for (const e of enemiesNear(pos, 6)) addDot(e, 'wallburst', 'physical', S.wallTaken * 0.25 / 4 / (P().dotPower ?? 1), 4); }
    }
  }
  if (c === 'mage' && S.steamPos && CX.T < S.steamUntil && CX.T >= S.steamNext) {   // 蒸爆
    S.steamNext += 1; S.stats.steams++;
    spawnRing(S.steamPos, 4, '#ffffff', 0.4);
    for (const z of frostFields()) for (const e of enemiesNear(z.pos, z.radius)) { const r = myDots(e, ['fire']).reduce((a, d) => a + d.dps, 0); if (r > 0) hit(e, r, 'fire'); }
    CX.loadout.reduceCooldown('ultimate', 1);
  }
  if (c === 'chrono' && S.echoEnd && CX.T >= S.echoEnd) {   // 万象回声结束：一次结算所有敌人剩余切割
    S.echoEnd = 0;
    if (spec6('set_chrono') === 'general') for (const e of enemiesNear(P().getPos(), 40)) { const r = remainingDot(e, ['physical']); if (r > 0) { hit(e, r, 'physical', false); S.stats.stopCuts++; } }
  }
  S.cutLog = S.cutLog.filter(x => CX.T - x.t <= 3);
  if (c === 'alchemy' && setN('set_alchemy') >= 4) {
    const sw = alchemySwamp();
    if (sw && !S.swamp && spec6('set_alchemy') === 'general') { CX.loadout.resetCooldown('ultimate'); S.stats.swampResets++; CX.toast('三色沼泽：大釜炮台冷却重置', '#c080ff'); }
    S.swamp = sw;
    if (sw && CX.T >= S.tickT) {   // 4 件：区域里的敌人减速并补三种持续伤害（每秒）
      S.tickT = CX.T + 1;
      const twin = spec6('set_alchemy') === 'a_turret';
      if (twin) CX.loadout.reduceCooldown('ultimate', 1);
      for (const z of alchemyZones()) for (const e of enemiesNear(z, z.r)) {
        if (!e.ccImmune) e.status.add({ key: 'set:swamp_slow', kind: 'slow', remaining: 1.2, percent: 0.3, source: P() });
        const k = twin ? 0.12 : 0.06;
        addDot(e, 'swR', 'fire', basicDmg() * k, 2); addDot(e, 'swB', 'frost', basicDmg() * k, 2); addDot(e, 'swG', 'nature', basicDmg() * k, 2);
      }
    }
  }
}

export function setfxReset() {
  S.soul = 0; S.chanUntil = 0; S.chanMul = 1; S.chanCrit = false; S.echoEnd = 0; S.whirlUntil = 0; S.whirlSkill = null; S.wallOn = false; S.wallTaken = 0; S.steamUntil = 0; S.steamPos = null; S.cutLog = []; S.alcSeq = []; S.swamp = false;
}

export function bindSetfx(__ctx: Ctx) {
  CX = __ctx;
  const prev = CX.fx.onDealt;
  CX.fx.onDealt = (...a) => { prev?.(...a); onDealt(...a); };
  // 时痕 6 件
  chronoHooks.detMul = e => {
    if (CX.cls.id !== 'chrono' || spec6('set_chrono') !== 'c_mark') return 1;
    const cuts = myDots(e, ['physical']);
    cuts.forEach(d => e.status.refreshDot(d.key, 4));
    if (cuts.length) S.stats.doom++;
    return 1 + 0.15 * cuts.length;
  };
  chronoHooks.extraClone = () => CX.cls.id === 'chrono' && spec6('set_chrono') === 'c_echo';
  chronoHooks.onStopEnd = () => {
    if (CX.cls.id !== 'chrono' || spec6('set_chrono') !== 'general') return;
    for (const e of enemiesNear(P().getPos(), 40)) { const r = remainingDot(e, ['physical']); if (r > 0) { hit(e, r, 'physical', false); S.stats.stopCuts++; } }
  };
  // v1.2.73 时痕 6 件通用扩到另两个大招（Rhett 11-03）：时之裂隙收束时结算裂隙里剩余切割 ×2（隐藏组合，偏高）；万象回声 8 秒结束时结算一次（正常）
  chronoHooks.onRiftEnd = (list: Enemy[]) => {
    if (CX.cls.id !== 'chrono' || spec6('set_chrono') !== 'general') return;
    for (const e of list) { const r = remainingDot(e, ['physical']); if (r > 0 && e.alive) { hit(e, r * 2, 'physical', false); S.stats.stopCuts++; } }
  };
  chronoHooks.onRewind = () => {
    if (CX.cls.id !== 'chrono' || spec6('set_chrono') !== 'c_rewind') return;
    const sum = S.cutLog.reduce((a, x) => a + x.v, 0), tg = CX.target;
    if (sum > 0 && tg?.alive) { hit(tg, sum, 'physical', false); S.stats.replays++; spawnRing(tg.getPos(), 2, '#ffd070', 0.5); }
    S.cutLog = [];
  };
}

/** 测试用 */
export const setfxDebug = () => ({ ...S, stats: { ...S.stats }, spec: { fury: spec6('set_fury'), frost: spec6('set_frost'), chrono: spec6('set_chrono'), alchemy: spec6('set_alchemy') } });
export type { SlotId };
