// 炼金投弹手（v0.7.1-br.A，阶段七）：职业机制全部在这里，老代码只留挂钩（同 chrono.ts 的做法）
//   试剂：红 / 蓝 / 绿各 3 格，各自每 3 秒回 1 格；试剂弹命中让三种试剂的回充各快 0.4 秒
//   调配：技能 1/2/3 = 红/蓝/绿；按下后等 0.45 秒，期间再按一种（可以同色）= 混合药剂，否则投纯色。共 9 种配方（data/alchemy.ts RECIPES）
//   抛物线：药瓶 0.5 秒飞到落点（落点指示圈），能越过矮墙；落地 = 爆炸 + 效果 + 地面区域
//   地面反应：火落在毒池 / 酸池上 = 爆燃（大爆炸，清掉毒池）；冰落在火地上 = 蒸汽（致盲）；毒落在冰雾里 = 冰晶毒（区域延长、伤害提高）
//   大釜炮台（R）：放下药锅 10 秒，每 1.6 秒向最近的敌人投你最近一次的配方（60% 伤害，不耗试剂）
//   推进烟雾（F，25 级）：向后跳 6 米，原地留下致盲烟雾
import { zoneStorm } from './zonestorm';   // v1.2.80
import { resReaction } from './reshud';
import { potionSplash, alchemyBoom, lobTrail, cauldronDrop, cauldronTick, cauldronFire } from './vfx';
import * as THREE from 'three';
import type { Ctx, Enemy } from './main';
import { ResolvedSkill, Element, EffectDef } from '../core/types';
import { CombatUnit, unitsInRadius } from '../core/Combat';
import { ALC_SINGLE } from '../data/skillbook_v07';
import { ALCHEMY_CFG as K, RECIPES, Recipe, Color, COLOR_SLOT, COLOR_HEX, COLOR_NAME, recipeKey, ZoneKind } from '../data/alchemy';
import * as M from './models';
import * as G from './gfx';
import { spawnRing, floatText } from './effects';
import { applyHits } from './casting';
import { skillIcon } from './icons';
import { showTip, hideTip } from './hudbar';
import { hasLg, ax, ap, ad, an, hasDark, setN, questDone } from './classgear';

let CX!: Ctx;

interface Lob { mesh: THREE.Object3D; warn: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; s: ResolvedSkill; recipe: Recipe | null; mul: number; fromPot: boolean }
interface Zone { kind: ZoneKind; x: number; z: number; r: number; left: number; dps: number; slow: number; el: Element; tick: number; mesh: THREE.Mesh; vuln: number }
interface Pot { mesh: THREE.Group; pos: THREE.Vector3; until: number; next: number; recipe: string; follow?: boolean; side?: number }

export const alchemy = {
  reagents: { r: K.reagentMax, b: K.reagentMax, g: K.reagentMax } as Record<Color, number>,
  regenT: { r: 0, b: 0, g: 0 } as Record<Color, number>,
  lastRecipe: 'r', recent: ['r'] as string[], smokeEnd: 0,
  stats: { throws: 0, mixes: 0, reactions: 0, booms: 0, steams: 0, crystals: 0, potThrows: 0, smokes: 0, zones: 0, plagueSpread: 0, chaos: 0, chains: 0, philo: 0, alt: 0 },
  recipesUsed: {} as Record<string, number>,
};
let pending: { color: Color; s: ResolvedSkill; at: number; tgt: THREE.Vector3 } | null = null;
const lobs: Lob[] = [];
const zones: Zone[] = [];
const pots: Pot[] = [];
let philoUntil = -1, lastDt = 0.016;   // v0.7.4 贤者之石 / 移动实验室
const plague = new Map<Enemy, number>();     // 瘟疫：剩余秒数
const vulnHits = new WeakSet<CombatUnit>();
let boilOn = false, fireBuffUntil = -1, extraDmg = false, hudCls = '', hudSig = '';

const isAlc = () => CX?.cls?.id === 'alchemy';
const rank = (id: string) => CX.tree?.effRank(id) ?? 0;
export const reagentMax = () => K.reagentMax + rank('at_max') + (hasLg('lg_trinity_box') ? an('lg_trinity_box', 1) : 0);
/** v0.7.2 地面反应倍率：疯狂学者面具 +40%、腐沼实验室·一 +20% */
const reactMul = () => (hasLg('lg_mad_mask') ? 1 + ax('lg_mad_mask', 0.4) : 1) * (questDone('cq_alchemy1') ? 1.2 : 1);
const colorOf = (s: ResolvedSkill): Color | null => (s.tags.includes('reagent_r') ? 'r' : s.tags.includes('reagent_b') ? 'b' : s.tags.includes('reagent_g') ? 'g' : null);
const zoneMul = () => 1 + 0.15 * rank('ag_zone');
/** v0.9.1s 橙装钩子（web/lgfx.ts） */
export const alchemyHooks: { zoneAdd?: () => number; onPotFire?: (target: Enemy, refire: () => void) => void } = {};
export const alchemyPots = (): readonly { pos: { x: number; z: number } }[] => pots;

// ======================================================================
// 施法
// ======================================================================
export function alchemyCanPay(pre: ResolvedSkill): boolean {
  if (!isAlc()) return true;
  const c = colorOf(pre); if (!c) return true;
  if (alchemy.reagents[c] >= 1 - 1e-6) return true;
  CX.toast(`${COLOR_NAME[c]}色试剂不足`, '#c0ff80'); CX.audio.error();
  return false;
}

export function alchemyExecute(s: ResolvedSkill): boolean {
  if (!isAlc() || s.slot === 'skill4') return false;   // v0.7.8：第 4 槽绝技走通用施法，不耗试剂
  const c = colorOf(s);
  const tgt = CX.target && CX.target.alive ? CX.target.pos.clone() : null;
  if (CX.target) CX.faceTo(CX.target.pos);
  if (s.tags.includes('cauldron')) { placeCauldron(s.tags.includes('follow')); return true; }
  if (s.tags.includes('philo')) {   // v0.7.4 贤者之石：试剂充满，10 秒不消耗
    philoUntil = CX.T + 10; alchemy.stats.philo++;
    for (const k of ['r', 'b', 'g'] as Color[]) alchemy.reagents[k] = reagentMax();
    CX.player.rig.anim?.play('castLong', 1.6); CX.audio.ultimate(); CX.feel.emit('ultimate');
    const p = CX.player.getPos(); spawnRing(p, s.stats.radius, '#ffd040', 0.7);
    CX.particles.emit({ x: p.x, y: 1.2, z: p.z }, { count: 60, color: 0xffd040, color2: 0xff4a20, speed: 5, up: 2, radius: 0.8, life: 0.9, size: 0.4, drag: 1.5 });
    if (s.stats.damage > 0) applyHits(s, (unitsInRadius(CX.world, p, s.stats.radius, 'player') as Enemy[]).filter(e => e.z === CX.zone));
    pendingHud(); return true;
  }
  if (!c) {   // 试剂弹
    if (!tgt) return true;
    CX.player.rig.anim?.play('shoot', 1.8); CX.audio.projectile();
    throwLob(s, null, CX.player.pos, tgt, 1, false);
    return true;
  }
  if (CX.T >= philoUntil) alchemy.reagents[c] = Math.max(0, alchemy.reagents[c] - 1);
  CX.audio.click();
  if (hasDark('d_chaos_tincture')) {   // v0.7.2 混沌原液：每一瓶随机变成混合药剂，伤害 +35%
    if (pending) flushPending();
    const cs: Color[] = ['r', 'b', 'g'], o = cs[Math.floor(Math.random() * 3)];
    const key = recipeKey(c, o);
    const b = o === c ? s : CX.loadout.preview(COLOR_SLOT[o], CX.ctx()) ?? s;
    alchemy.stats.chaos++; alchemy.stats.mixes++;
    fireRecipe(key, s, b, tgt ?? CX.player.pos.clone().add(new THREE.Vector3(Math.sin(CX.player.rig.root.rotation.y) * 8, 0, Math.cos(CX.player.rig.root.rotation.y) * 8)), 1 + ax('d_chaos_tincture', 0.35));
    return true;
  }
  if (pending && CX.T - pending.at <= K.mixWindow) {
    // 第二种：混合
    const a = pending; pending = null;
    const key = recipeKey(a.color, c);
    if (Math.random() < 0.1 * rank('at_free') + (hasLg('lg_sage_flask') ? ap('lg_sage_flask', 0.2) : 0)) alchemy.reagents[c] = Math.min(reagentMax(), alchemy.reagents[c] + 1);
    alchemy.stats.mixes++;
    fireRecipe(key, a.s, s, tgt ?? a.tgt, 1);
  } else {
    if (pending) flushPending();
    pending = { color: c, s, at: CX.T, tgt: tgt ?? CX.player.pos.clone().add(new THREE.Vector3(Math.sin(CX.player.rig.root.rotation.y) * 8, 0, Math.cos(CX.player.rig.root.rotation.y) * 8)) };
  }
  pendingHud();
  return true;
}

function flushPending() {
  if (!pending) return;
  const a = pending; pending = null;
  const tgt = CX.target && CX.target.alive ? CX.target.pos.clone() : a.tgt;
  fireRecipe(a.color, a.s, null, tgt, 1);
  pendingHud();
}

/** 按配方组一个可结算的技能：伤害 = 两种颜色技能（已含天赋 / 装备 / 等级加成）的平均值 × 配方倍率 */
function buildSkill(rc: Recipe, a: ResolvedSkill, b: ResolvedSkill | null, mul: number): ResolvedSkill {
  const dmg = (b ? (a.stats.damage + b.stats.damage) / 2 : a.stats.damage) * rc.dmg * mul * (b ? 1 + 0.12 * rank('ab_nova') : 1);
  const rad = b ? rc.radius * Math.max(a.stats.radius / RECIPES[colorOf(a) ?? 'r'].radius, 1) : a.stats.radius;
  const effects: EffectDef[] = b ? [] : [...a.effects];
  if (b) {
    if (rc.slow) effects.push({ type: 'slow', percent: rc.slow, duration: 3 });
    if (rc.dot) effects.push({ type: 'dot', element: 'nature', dps: Math.round(a.stats.damage * 0.25 * rc.dot), duration: 5 });
    if (rc.knock) effects.push({ type: 'knockback', distance: rc.knock });
  }
  if (rc.stun) effects.push({ type: 'stun', duration: rc.stun + (rc.key === 'bb' && rank('ag_freeze') ? 1 : 0) });
  if (rc.blind) effects.push({ type: 'stun', duration: rc.blind });
  if (rc.interrupt) effects.push({ type: 'interrupt' });
  if (!b && rc.key === 'b' && rank('ag_freeze')) effects.push({ type: 'slow', percent: 0.65, duration: 3 });
  return { ...a, baseId: a.baseId, displayName: rc.name, element: rc.element, effects, tags: [...a.tags, 'mix_' + rc.key], stats: { ...a.stats, damage: dmg, radius: rad } };
}

function fireRecipe(key: string, a: ResolvedSkill, b: ResolvedSkill | null, at: THREE.Vector3, mul: number, from = CX.player.pos, fromPot = false) {
  const rc = (!b && ALC_SINGLE[a.baseId]) || RECIPES[key]; if (!rc) return;
  if (!b && ALC_SINGLE[a.baseId] && !fromPot) alchemy.stats.alt++;   // v0.7.4 同色替换：单投用新技能自己的配方
  const s = buildSkill(rc, a, b, mul);
  if (!fromPot) {
    alchemy.lastRecipe = key;
    alchemy.recent = [key, ...alchemy.recent.filter(k => k !== key)].slice(0, 2);
    alchemy.recipesUsed[key] = (alchemy.recipesUsed[key] ?? 0) + 1;
    CX.player.rig.anim?.play('shoot', 1.7);
    CX.audio.castBolt(rc.element); CX.audio.alchemyGlass();
    if (b) CX.particles.emit({ x: from.x, y: 1.6, z: from.z }, { count: 14, color: COLOR_HEX[key[0] as Color], color2: COLOR_HEX[(key[1] ?? key[0]) as Color], speed: 2, up: 1.5, life: 0.5, size: 0.35 });
  }
  throwLob(s, rc, from, at, 1, fromPot);
}

function throwLob(s: ResolvedSkill, rc: Recipe | null, from: THREE.Vector3, to: THREE.Vector3, mul: number, fromPot: boolean) {
  alchemy.stats.throws++;
  const col = rc ? rc.color : new THREE.Color(CX.ELEMENT_COLOR[s.element]).getHex();
  const mesh = M.makeOrb(col, rc ? 0.2 : 0.15);
  const warn = M.makeDisc(col, 0.22, s.stats.radius); warn.position.set(to.x, G.gy(to.x, to.z) + 0.06, to.z);
  CX.scene.add(warn);
  const f = G.lift(from, fromPot ? 1 : 1.6);
  mesh.position.copy(f); CX.scene.add(mesh);
  lobs.push({ mesh, warn, from: f, to: G.lift(to, 0.3), t: 0, dur: K.flight * (fromPot ? 1.2 : 1) * (rc && s.tags.includes('slowfuse') && !s.tags.some(t => t.startsWith('mix_') && t.length > 5) ? 2.2 : 1), s, recipe: rc, mul, fromPot });
}

function updateLobs(dt: number) {
  for (let i = lobs.length - 1; i >= 0; i--) {
    const l = lobs[i]; l.t += dt;
    const k = Math.min(1, l.t / l.dur);
    l.mesh.position.lerpVectors(l.from, l.to, k);
    l.mesh.position.y += Math.sin(k * Math.PI) * (2.2 + l.from.distanceTo(l.to) * 0.12);   // 抛物线
    (l.warn.material as THREE.MeshBasicMaterial).opacity = 0.15 + k * 0.3;
    lobTrail(l.mesh.position, l.recipe?.color ?? 0xd07dff);   // v0.9.1h
    if (Math.random() < 0.5) CX.particles.emit(l.mesh.position, { count: 1, color: l.recipe?.color ?? 0xd07dff, speed: 0.2, up: 0.1, life: 0.3, size: 0.25 });
    if (k >= 1) { CX.scene.remove(l.mesh); CX.scene.remove(l.warn); lobs.splice(i, 1); land(l); }
  }
}

/** 落地：反应判定 → 爆炸结算 → 生成地面区域 */
function land(l: Lob) {
  const p = { x: l.to.x, z: l.to.z }, s = l.s, rc = l.recipe;
  const el = s.element;
  const hex = rc?.color ?? 0xd07dff;
  spawnRing(p, s.stats.radius, '#' + new THREE.Color(hex).getHexString(), 0.35);
  CX.particles.emit({ x: p.x, y: 0.4, z: p.z }, { count: rc ? 40 : 14, color: hex, color2: 0xffffff, speed: rc ? 5 : 3, up: 1.6, radius: 0.4, life: 0.6, size: 0.4, gravity: 4, drag: 1.2 });
  potionSplash(p, s.stats.radius, hex, !!rc);
  if (rc) CX.feel.emit('heavy', 0.35);
  const hits = (unitsInRadius(CX.world, p, s.stats.radius, 'player') as Enemy[]).filter(e => e.z === CX.zone);
  if (hits.length) {
    const fireBuff = el === 'fire' && CX.T < fireBuffUntil ? 1.25 : 1;
    applyHits(fireBuff !== 1 ? { ...s, stats: { ...s.stats, damage: s.stats.damage * fireBuff } } : s, hits);
    if (!rc) refundBasic();
    if (rc?.plague) for (const e of hits) if (e.alive) plague.set(e, 6);
  }
  if (!rc) return;
  react(p, rc, s);
  if (rc.zone) addZone(rc.zone.kind, p.x, p.z, rc.zone.r * (1 + 0.12 * rank('ag_size')) * (rc.zone.kind === 'poison' && hasLg('lg_corrode_gloves') ? 1 + ax('lg_corrode_gloves', 0.3) : 1), rc.zone.dur * zoneMul() + (alchemyHooks.zoneAdd?.() ?? 0), s.stats.damage * rc.zone.dps * (1 + 0.15 * rank('ag_dps')), rc.zone.slow ?? 0, rc.element, rc.vuln ?? 0);
  
}

function react(p: { x: number; z: number }, rc: Recipe, s: ResolvedSkill) {
  const near = (k: ZoneKind[]) => zones.filter(z => k.includes(z.kind) && Math.hypot(z.x - p.x, z.z - p.z) < z.r + s.stats.radius * 0.6);
  const isFire = rc.element === 'fire', isFrost = rc.element === 'frost', isPoison = rc.key === 'g' || rc.key === 'gg' || rc.key === 'bg';
  if (isFire) {
    const pools = near(['poison', 'crystal']);
    for (const z of pools) boom(z, s);
  }
  if (isFrost) {
    for (const z of near(['fire', 'acid'])) {
      alchemy.stats.reactions++; alchemy.stats.steams++; resReaction();
      removeZone(z);
      const r = z.r + 1;
      spawnRing({ x: z.x, z: z.z }, r, '#ffffff', 0.6);
      CX.particles.emit({ x: z.x, y: 0.6, z: z.z }, { count: 60, color: 0xffffff, color2: 0xcfe8ff, speed: 3, up: 2.5, radius: z.r, life: 1.4, size: 0.8, drag: 1 });
      const blind = K.steamBlind * (1 + 0.25 * rank('ag_react')) * reactMul();
      for (const e of unitsInRadius(CX.world, { x: z.x, z: z.z }, r, 'player') as Enemy[]) {
        if (e.z !== CX.zone) continue;
        if (!e.ccImmune) e.status.add({ key: 'steam', kind: 'stun', remaining: blind, source: CX.player });
        e.onInterrupt?.();
        floatText(e, '致盲', '#ffffff', 0.9);
      }
      CX.audio.frostNova();
    }
  }
  if (isPoison) {
    for (const z of near(['frost'])) {
      alchemy.stats.reactions++; alchemy.stats.crystals++; resReaction();
      z.kind = 'crystal'; z.left += 4 * (1 + 0.25 * rank('ag_react')); z.dps = Math.max(z.dps, s.stats.damage * 0.15 * reactMul()); z.vuln = Math.max(z.vuln, 0.15); z.slow = Math.max(z.slow, 0.4);
      hideZoneFx(z); z.mesh = zoneStorm({ x: z.x, z: z.z }, z.r, z.el, z.left, 'crystal') as unknown as THREE.Mesh;   // v1.2.80 冰雾结晶：换成晶毒雾样式
      spawnRing({ x: z.x, z: z.z }, z.r, '#40e0c0', 0.5);
    }
  }
}

/** 爆燃：火点燃毒池（伤害 = 这一瓶的 2 倍，范围 = 毒池 + 1.5 米），终极天赋会连锁点燃附近的毒池 */
function boom(z: Zone, s: ResolvedSkill, depth = 0) {
  if (!zones.includes(z)) return;
  alchemy.stats.reactions++; alchemy.stats.booms++; resReaction();
  removeZone(z);
  const r = z.r + 1.5, c = { x: z.x, z: z.z };
  const dmg = s.stats.damage * K.boomMul * (1 + 0.2 * rank('ab_boom')) * reactMul();
  const hits = (unitsInRadius(CX.world, c, r, 'player') as Enemy[]).filter(e => e.z === CX.zone);
  if (hits.length) applyHits({ ...s, displayName: '爆燃', element: 'fire', effects: [{ type: 'dot', element: 'fire', dps: Math.round(dmg * 0.06), duration: 3 }], stats: { ...s.stats, damage: dmg } }, hits);
  spawnRing(c, r, '#ff7a10', 0.7); alchemyBoom(c, r);
  CX.particles.emit({ x: c.x, y: 0.5, z: c.z }, { count: 110, color: 0xff6a10, color2: 0xc8ff40, speed: 8, up: 3, radius: z.r * 0.6, life: 1, size: 0.6, gravity: 4, drag: 1 });
  CX.feel.emit('heavy', 1); CX.audio.meteor(); CX.audio.alchemyGlass();
  if (rank('ab_chain')) {
    fireBuffUntil = CX.T + 3;
    if (depth < 6) for (const o of zones.filter(o => (o.kind === 'poison' || o.kind === 'acid' || o.kind === 'crystal') && Math.hypot(o.x - c.x, o.z - c.z) < 6)) setTimeoutT(() => boom(o, s, depth + 1), 0.25);
  } else if (depth === 0 && hasLg('lg_saltpeter_robe')) {   // v0.7.2 硝石长袍：连锁一次
    const o = zones.find(o => (o.kind === 'poison' || o.kind === 'acid' || o.kind === 'crystal') && Math.hypot(o.x - c.x, o.z - c.z) < 6);
    if (o) { alchemy.stats.chains++; setTimeoutT(() => boom(o, s, 1), 0.25); }
  }
}
const timers: { at: number; f: () => void }[] = [];
const setTimeoutT = (f: () => void, sec: number) => timers.push({ at: CX.T + sec, f });

// ======================================================================
// 地面区域
// ======================================================================
const ZONE_STYLE: Record<ZoneKind, string> = { fire: 'napalm', frost: 'frost', poison: 'spores', acid: 'acid', crystal: 'crystal' };
const ZONE_COL: Record<ZoneKind, number> = { fire: 0xff5a10, frost: 0x9fe8ff, poison: 0x5aff3a, acid: 0xc8ff20, crystal: 0x40e0c0 };
function addZone(kind: ZoneKind, x: number, z: number, r: number, dur: number, dps: number, slow: number, el: Element, vuln: number) {
  // v1.2.80 实心圆盘 → 通用区域件（贴花 + 雾 + 粒子 + 冲击点，不画正圆），按种类给炼金专用样式
  const mesh = zoneStorm({ x, z }, r, el, dur, ZONE_STYLE[kind]) as unknown as THREE.Mesh;
  zones.push({ kind, x, z, r, left: dur, dps, slow, el, tick: 0.5, mesh, vuln });
  alchemy.stats.zones++;
}
function hideZoneFx(z: Zone) { z.mesh.visible = false; const ed = z.mesh.userData.edge as THREE.Object3D | null; if (ed) ed.visible = false; }
function removeZone(z: Zone) { const i = zones.indexOf(z); if (i >= 0) zones.splice(i, 1); }   // v1.2.80 区域件按持续时间自行淡出回收

function updateZones(dt: number) {
  for (const z of [...zones]) {
    z.left -= dt; z.tick -= dt;
    if (z.kind === 'poison' && hasLg('lg_corrode_gloves')) {   // v0.7.2 腐蚀手套：毒池跟着池里最近的敌人走
      const e = (unitsInRadius(CX.world, { x: z.x, z: z.z }, z.r + 1, 'player') as Enemy[]).find(x => x.z === CX.zone);
      if (e) { const dx = e.pos.x - z.x, dz = e.pos.z - z.z, d = Math.hypot(dx, dz); if (d > 0.3) { z.x += dx / d * 1.6 * dt; z.z += dz / d * 1.6 * dt; z.mesh.position.x = z.x; z.mesh.position.z = z.z; const ed = z.mesh.userData.edge as THREE.Object3D | null; if (ed) { ed.position.x = z.x; ed.position.z = z.z; } } }
    }
    if (z.tick <= 0) {
      z.tick += 0.5 / (1 + (CX.player.haste ?? 0));   // v0.9.1l 急速缩短区域跳间隔
      for (const e of unitsInRadius(CX.world, { x: z.x, z: z.z }, z.r, 'player') as Enemy[]) {
        if (e.z !== CX.zone) continue;
        if (z.dps > 0) CX.fx.dealDamage(e, z.dps * 0.5 * (boilOn ? 1.25 : 1), z.el, CX.player, false, false, true);
        if (z.slow && !e.ccImmune) e.status.add({ key: 'alc_slow', kind: 'slow', remaining: 0.8, percent: z.slow, source: CX.player });
      }
    }
    if (z.left <= 0) removeZone(z);
  }
  boilOn = rank('ag_boil') > 0 && new Set(zones.map(z => z.kind)).size >= 3;
}

/** 晶毒雾里的敌人受到伤害 +15%：在 onDealt 里补一段伤害 */
function inVuln(e: CombatUnit) { const p = e.getPos(); return zones.find(z => z.vuln > 0 && Math.hypot(z.x - p.x, z.z - p.z) <= z.r)?.vuln ?? 0; }
function onDealt(t: CombatUnit, dealt: number, _el: Element, src: CombatUnit | null, _crit: boolean, tick: boolean) {
  if (!isAlc() || src !== CX.player || dealt <= 0 || extraDmg) return;
  const v = inVuln(t) + (boilOn && !tick ? 0.25 : 0) + (setN('set_alchemy') >= 4 && new Set(zones.map(z => z.kind)).size >= 3 ? 0.2 : 0);
  if (v > 0 && t.alive) { extraDmg = true; CX.fx.dealDamage(t, dealt * v, _el, CX.player, false, false, true); extraDmg = false; vulnHits.add(t); }
}

// 瘟疫：中了瘟疫的敌人每秒把毒传给 3 米内一个没中的
let plagueT = 0;
function updatePlague(dt: number) {
  plagueT -= dt;
  const spread = plagueT <= 0; if (spread) plagueT = 1;
  for (const [e, left] of [...plague]) {
    if (!e.alive || e.z !== CX.zone || left <= 0) { plague.delete(e); continue; }
    plague.set(e, left - dt);
    if (!spread) continue;
    CX.particles.emit({ x: e.pos.x, y: 1.2, z: e.pos.z }, { count: 3, color: 0x9aff3a, speed: 0.4, up: 0.6, life: 0.6, size: 0.35 });
    const o = (unitsInRadius(CX.world, e.getPos(), 3, 'player') as Enemy[]).find(x => x !== e && x.z === CX.zone && !plague.has(x));
    if (o) {
      plague.set(o, 6); alchemy.stats.plagueSpread++;
      const g = CX.loadout.preview('skill3', CX.ctx());
      o.status.add({ key: 'dot:plague:nature', kind: 'dot', remaining: 5, dps: Math.round((g?.stats.damage ?? 26) * 0.4), element: 'nature', source: CX.player });
      CX.particles.emit({ x: o.pos.x, y: 1, z: o.pos.z }, { count: 12, color: 0x9aff3a, speed: 1.5, up: 1, life: 0.6, size: 0.35 });
    }
  }
}

// ======================================================================
// 大釜炮台
// ======================================================================
function placeCauldron(follow = false) {
  const n = rank('at_twin') ? 2 : 1;
  const life = (K.cauldronLife + 3 * rank('at_life')) * (hasLg('lg_eternal_pot') ? ad('lg_eternal_pot', 2) : 1);
  CX.player.rig.anim?.play('cast', 1.6); CX.audio.anvil(true); CX.feel.emit('heavy', 0.5);
  const yaw = CX.player.rig.root.rotation.y;
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : (i ? 1 : -1) * 1.4;
    const pos = CX.player.pos.clone().add(new THREE.Vector3(Math.sin(yaw) * 1.6 + Math.cos(yaw) * side, 0, Math.cos(yaw) * 1.6 - Math.sin(yaw) * side));
    CX.clampToZone(pos, { x: CX.player.pos.x, z: CX.player.pos.z });
    const mesh = makeCauldron();
    mesh.position.copy(pos); CX.scene.add(mesh);
    const rcp = alchemy.recent[i] ?? alchemy.recent[0] ?? 'r';
    pots.push({ mesh, pos, until: CX.T + life, next: CX.T + 0.6, recipe: rcp, follow, side });
    spawnRing(pos, 1.4, '#9aff3a', 0.5); cauldronDrop(pos);   // v0.9.1h
  }
}
function makeCauldron() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), G.toon(0x2a2a2e)); body.position.y = 0.62; g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 16), G.toon(0x4a4a50)); rim.rotation.x = Math.PI / 2; rim.position.y = 1.06; g.add(rim);
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16), G.glow(0x8aff40, 1.4)); M.noOutline(liquid); liquid.rotation.x = -Math.PI / 2; liquid.position.y = 1.02; g.add(liquid);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.35, 5), G.toon(0x2a2a2e)); leg.position.set(Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4); g.add(leg); }
  g.userData.liquid = liquid;
  return g;
}
function updatePots() {
  for (let i = pots.length - 1; i >= 0; i--) {
    const p = pots[i];
    if (CX.T > p.until || CX.zone !== p.mesh.userData.zone && p.mesh.userData.zone !== undefined) { CX.scene.remove(p.mesh); pots.splice(i, 1); continue; }
    p.mesh.userData.zone ??= CX.zone;
    if (p.follow) {   // v0.7.4 移动实验室：跟在身后
      const y = CX.player.rig.root.rotation.y, tx = CX.player.pos.x - Math.sin(y) * 1.8 + Math.cos(y) * (p.side ?? 0), tz = CX.player.pos.z - Math.cos(y) * 1.8 - Math.sin(y) * (p.side ?? 0);
      p.pos.x += (tx - p.pos.x) * Math.min(1, 4 * lastDt); p.pos.z += (tz - p.pos.z) * Math.min(1, 4 * lastDt); p.mesh.position.copy(p.pos);
    }
    cauldronTick(p.pos);   // v0.9.1h
    if (Math.random() < 0.4) CX.particles.emit({ x: p.pos.x, y: 1.1, z: p.pos.z }, { count: 1, color: 0x8aff40, speed: 0.2, up: 1.2, life: 0.7, size: 0.35 });
    if (CX.T < p.next) continue;
    p.next = CX.T + K.cauldronEvery * (questDone('cq_alchemy2') ? 0.75 : 1);
    let best: Enemy | null = null, bd = 14;
    for (const e of CX.enemies) { if (!e.alive || e.z !== CX.zone || e.isDummy) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
    if (!best) continue;
    const key = p.recipe;
    const a = CX.loadout.preview(COLOR_SLOT[key[0] as Color], CX.ctx()), b = key.length > 1 ? CX.loadout.preview(COLOR_SLOT[key[1] as Color], CX.ctx()) : null;
    if (!a) continue;
    alchemy.stats.potThrows++; cauldronFire(p.pos);   // v0.9.1h
    const mulP = K.cauldronMul * (1 + 0.15 * rank('at_pot')) * (p.follow ? 0.8 : 1), tg = best;
    fireRecipe(key, a, b ?? null, best.pos.clone(), mulP, p.pos, true);
    alchemyHooks.onPotFire?.(tg, () => { if (tg.alive) fireRecipe(key, a, b ?? null, tg.pos.clone(), mulP, p.pos, true); });   // v0.9.1s 橙装
  }
}

// ======================================================================
// 推进烟雾（F，25 级）
// ======================================================================
export function alchemySmoke(force = false): boolean {
  if (!isAlc() || !CX.started || !CX.player.alive) return false;
  if (!force && CX.progression.level < K.smokeLevel) { CX.toast(`推进烟雾 ${K.smokeLevel} 级解锁`, '#c0ff80'); CX.audio.error(); return false; }
  if (CX.T < alchemy.smokeEnd) { CX.toast(`推进烟雾冷却中（${Math.ceil(alchemy.smokeEnd - CX.T)} 秒）`, '#c0ff80'); CX.audio.error(); return false; }
  alchemy.smokeEnd = CX.T + K.smokeCd; alchemy.stats.smokes++;
  const P = CX.player.pos, from = P.clone(), yaw = CX.player.rig.root.rotation.y;
  const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  for (let d = 0; d < K.smokeBack; d += 0.25) { const prev = { x: P.x, z: P.z }; P.addScaledVector(dir, 0.25); CX.clampToZone(P, prev); if (Math.hypot(P.x - prev.x, P.z - prev.z) < 0.05) break; }
  CX.player.status.add({ key: 'smoke', kind: 'invuln', remaining: 0.3, source: null });
  CX.player.rig.anim?.play('dash', 1.8); CX.audio.roll();
  CX.particles.emit({ x: from.x, y: 0.8, z: from.z }, { count: 70, color: 0x8a8a8a, color2: 0xd0d0d0, speed: 2.5, up: 1.2, radius: 1.5, life: 1.8, size: 1, drag: 1.5 });
  for (const e of unitsInRadius(CX.world, { x: from.x, z: from.z }, 3.2, 'player') as Enemy[]) {
    if (e.z !== CX.zone) continue;
    if (!e.ccImmune) e.status.add({ key: 'smoke', kind: 'stun', remaining: 1.5, source: CX.player });
    e.onInterrupt?.(); floatText(e, '致盲', '#dddddd', 0.9);
  }
  return true;
}

function refundBasic() { for (const c of ['r', 'b', 'g'] as Color[]) alchemy.regenT[c] += K.basicRefund; }

// ======================================================================
// 每帧
// ======================================================================
export function alchemyUpdate(dt: number, frozen = false) {
  syncHud();
  lastDt = dt;
  if (!isAlc() || !CX.player) return;
  if (pending && CX.T - pending.at > K.mixWindow) flushPending();
  const mx = reagentMax();
  const haste = CX.charSheet?.().haste ?? 0;
  const box = CX.inventory.equipped.offHand?.weaponType === 'reagent' ? 1.25 : 1;
  const rate = (1 + haste / 100) * box * (1 + 0.08 * rank('at_regen')) * (boilOn ? 1.3 : 1);
  for (const c of ['r', 'b', 'g'] as Color[]) {
    if (alchemy.reagents[c] >= mx) { alchemy.reagents[c] = mx; alchemy.regenT[c] = 0; continue; }
    alchemy.regenT[c] += dt * rate;
    while (alchemy.regenT[c] >= K.reagentRegen && alchemy.reagents[c] < mx) { alchemy.regenT[c] -= K.reagentRegen; alchemy.reagents[c]++; }
  }
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= CX.T) { const f = timers[i].f; timers.splice(i, 1); f(); }
  updateLobs(dt);
  if (!frozen) { updateZones(dt); updatePlague(dt); }
  updatePots();
}

export function alchemyReset() {
  if (!CX) return;
  for (const l of lobs) { CX.scene.remove(l.mesh); CX.scene.remove(l.warn); } lobs.length = 0;
  for (const z of zones) hideZoneFx(z); zones.length = 0;
  for (const p of pots) CX.scene.remove(p.mesh); pots.length = 0;
  plague.clear(); pending = null; timers.length = 0; philoUntil = -1;
  for (const c of ['r', 'b', 'g'] as Color[]) { alchemy.reagents[c] = reagentMax(); alchemy.regenT[c] = 0; }
}

// ======================================================================
// HUD：头像框下三排试剂 + 推进烟雾按钮；调配中的技能键高亮
// ======================================================================
function syncHud() {
  const cls = CX.cls?.id ?? '';
  const bar = document.getElementById('pf-reag'), btn = document.getElementById('sk-smoke');
  if (!bar || !btn) return;
  if (cls !== hudCls) {
    hudCls = cls; hudSig = '';
    const on = cls === 'alchemy';
    bar.style.display = on ? '' : 'none'; btn.style.display = on ? '' : 'none';
    if (on) btn.innerHTML = `<div class="ic">${skillIcon('smoke', '#c0c0c0')}</div><div class="cd" style="height:0"></div><div class="cdt"></div><span class="key">F</span><span class="nm">烟雾</span>`;
  }
  if (cls !== 'alchemy') return;
  const mx = reagentMax();
  const sig = (['r', 'b', 'g'] as Color[]).map(c => alchemy.reagents[c]).join(',') + '|' + mx;
  if (sig !== hudSig) {
    hudSig = sig;
    bar.innerHTML = (['r', 'b', 'g'] as Color[]).map(c => `<span class="rg rg-${c}">${Array.from({ length: mx }, (_, i) => `<i class="${i < alchemy.reagents[c] ? 'on' : ''}"></i>`).join('')}</span>`).join('');
  }
  const lv = CX.progression.level >= K.smokeLevel;
  const left = Math.max(0, alchemy.smokeEnd - CX.T);
  (btn.querySelector('.cd') as HTMLElement).style.height = `${!lv ? 100 : left > 0 ? Math.min(100, left / K.smokeCd * 100) : 0}%`;
  (btn.querySelector('.cdt') as HTMLElement).textContent = !lv ? `${K.smokeLevel}级` : left > 0 ? String(Math.ceil(left)) : '';
}
function pendingHud() {
  for (const c of ['r', 'b', 'g'] as Color[]) document.getElementById(`sk-${COLOR_SLOT[c]}`)?.classList.toggle('mixing', !!pending && pending.color === c);
}

export function alchemyTipLine(p: ResolvedSkill): string {
  if (!isAlc()) return '';
  const c = colorOf(p);
  if (c) {
    const rows = (['r', 'b', 'g'] as Color[]).map(o => { const r = RECIPES[recipeKey(c, o)]; return `${COLOR_NAME[c]}+${COLOR_NAME[o]} <b>${r.name}</b>：${r.desc}`; });
    return `<span class="ln" style="color:#c0ff80">消耗 1 格${COLOR_NAME[c]}色试剂 · 单按：${RECIPES[c].desc}</span><br><span class="tt-sub">0.45 秒内再按一种 = 混合：<br>${rows.join('<br>')}</span><br>`;
  }
  if (p.tags.includes('cauldron')) return `<span class="ln" style="color:#c0ff80">放下药锅 ${(K.cauldronLife + 3 * rank('at_life')) * (hasLg('lg_eternal_pot') ? ad('lg_eternal_pot', 2) : 1)} 秒，每 ${+(K.cauldronEvery * (questDone('cq_alchemy2') ? 0.75 : 1)).toFixed(2)} 秒向最近的敌人投掷你最近一次的配方（${Math.round(K.cauldronMul * (1 + 0.15 * rank('at_pot')) * 100)}% 伤害，不耗试剂）</span><br>`;
  if (p.tags.includes('lob')) return `<span class="ln" style="color:#c0ff80">抛物线投掷，越过矮墙；命中让三种试剂的回充各快 ${K.basicRefund} 秒</span><br>`;
  return '';
}

/** v0.9.1m 套装用：当前地面区域、是否形成三色沼泽（3 种区域同时在场） */
export const alchemyZones = (): readonly { x: number; z: number; r: number; kind: string }[] => zones;
export const alchemySwamp = () => new Set(zones.map(z => z.kind)).size >= 3;
export function alchemyDebug() {
  return { reagents: { ...alchemy.reagents }, max: reagentMax(), zoneKinds: zones.map(z => z.kind), lobs: lobs.length, pots: pots.length, pending: pending?.color ?? null, plague: plague.size, last: alchemy.lastRecipe, used: { ...alchemy.recipesUsed }, reactMul: reactMul(), set4: setN('set_alchemy') >= 4, kinds: new Set(zones.map(z => z.kind)).size, ...alchemy.stats };
}

export function bindAlchemy(__ctx: Ctx) {
  CX = __ctx;
  const prev = CX.fx.onDealt;
  CX.fx.onDealt = (...a) => { prev?.(...a); onDealt(...a); };
  const btn = document.getElementById('sk-smoke');
  if (btn) {
    const down = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); alchemySmoke(); };
    btn.addEventListener('touchstart', down, { passive: false }); btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseenter', ev => showTip(`<b class="tt-name" style="color:#c0ff80">推进烟雾</b><span class="tt-sub">F · ${K.smokeLevel} 级解锁 · 冷却 ${K.smokeCd} 秒</span>向后跳 ${K.smokeBack} 米，原地炸开烟雾：3 米内的敌人致盲 1.5 秒并被打断读条`, ev as MouseEvent));
    btn.addEventListener('mouseleave', () => hideTip());
  }
}
