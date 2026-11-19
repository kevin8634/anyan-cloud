// 时砂行者（v0.7.0-br.A，阶段七）：职业机制全部在这里，老代码只留挂钩
//   时砂：6 格资源，每 2 秒回 1 格（急速缩短），暴击返还；技能消耗 stats.cost，回溯 3 格
//   时痕：技能命中叠层（最多 5 层），每层把这名敌人之后受到伤害的 10% 存起来；满 5 层或 6 秒到期引爆
//   回声：带 echo 标签的技能 2 秒后由蓝色回声分身在原地、原方向再放一次（50% 伤害）
//   回溯：F 键 / 沙漏按钮，回到 3 秒前的位置和生命（最多回 25% 生命），清掉减益
//   终刻：时停 3 秒（敌人、首领脚本、红圈、弹幕全部静止），期间造成的伤害结束时额外打出 50%
// 挂钩：casting.tryCast（时砂不够不能放）、casting.executeSkill（时砂行者的技能走这里）、main 主循环（chronoUpdate、时停冻结 dt）、
//       Combat.EffectSystem.onDealt（时痕储存、暴击返还、时停记账）、F 键、HUD
import * as THREE from 'three';
import { sandSigil, wheelTrail, timeStop, riftTick } from './vfx';
import { zoneStorm, withZoneStyle } from './zonestorm';   // v1.2.81
import { hasLg, ax, ad, an, hasDark, setN, questDone } from './classgear';
import type { Ctx, Enemy } from './main';
import { ResolvedSkill, SlotId, Element } from '../core/types';
import { CombatUnit, unitsInRadius } from '../core/Combat';
import { CHRONO_CFG as K } from '../data/chrono';
import * as M from './models';
import * as G from './gfx';
import { addFx, spawnRing } from './effects';
import { applyHits, nearestEnemy, dist2d } from './casting';
import { uiIcon, skillIcon } from './icons';
import { showTip, hideTip } from './hudbar';

let CX!: Ctx;

interface Mark { n: number; stored: number; left: number; fx: THREE.Group; pips: THREE.Mesh[] }
interface Wheel {
  mesh: THREE.Object3D; s: ResolvedSkill; mul: number; echo: boolean;
  kind: 'home' | 'fan' | 'bolt';
  tgt: Enemy | null;                 // home / bolt：追踪的目标
  origin: THREE.Vector3; dir: THREE.Vector3; maxDist: number;   // fan：直线飞出再飞回
  phase: 'out' | 'back'; t: number; hit: Set<Enemy>; retHit: number; done: boolean;
}
interface EchoJob { at: number; s: ResolvedSkill; origin: THREE.Vector3; yaw: number; tgt: Enemy | null; tgtPos: THREE.Vector3 | null; mul: number; clone?: boolean }
interface Ghost { rig: M.Rig; until: number; t: number }

/** 状态（测试 / 调试读它） */
export const chrono = {
  sand: K.sandMax as number, sandT: 0, rewindEnd: 0, stopUntil: -1, stopTotal: 0,
  stats: { echoes: 0, detonations: 0, detonateDmg: 0, rewinds: 0, stops: 0, wheelHits: 0, blinks: 0, refunds: 0, setClones: 0, stopExtended: 0, echoAll: 0, rifts: 0, zones: 0 },
};
const marks = new Map<Enemy, Mark>();
const wheels: Wheel[] = [];
const echoes: EchoJob[] = [];
const ghosts: Ghost[] = [];
const hist: { t: number; x: number; z: number; hp: number; zone: string }[] = [];
const stopDealt = new Map<Enemy, number>();
// v0.7.4-br.A 技能书：万象回声（到期时间）、时之裂隙
let echoAllUntil = -1;
interface Rift { x: number; z: number; r: number; left: number; tick: number; s: ResolvedSkill; mesh: THREE.Mesh }
const rifts: Rift[] = [];
let histT = 0, detonating = false, critBoost = 0, critBoostUntil = -1, hudCls = '', hudSand = -1, hudMax = 0;

const isChrono = () => CX?.cls?.id === 'chrono';
const rank = (id: string) => CX.tree?.effRank(id) ?? 0;
export const sandMax = () => K.sandMax + rank('cr_max');
// v0.7.2：永劫之轮（暗金）回声 100% 且叠时痕；残响护手 +30%；遗落钟楼·一 +10%
const echoMul = () => (hasDark('d_aeon_wheel') ? 1 : K.echoMul) * (1 + 0.2 * rank('ce_power')) * (hasLg('lg_echo_gauntlet') ? 1 + ax('lg_echo_gauntlet', 0.3) : 1) * (questDone('cq_chrono1') ? 1.1 : 1);
const echoMarks = () => rank('ce_mark') > 0 || hasDark('d_aeon_wheel');
let keeperUntil = -1, cloneReady = 0, stopExtra = 0, extraHit = false;
const scaled = (s: ResolvedSkill, k: number): ResolvedSkill => (k === 1 ? s : { ...s, stats: { ...s.stats, damage: s.stats.damage * k } });
const marksOf = (s: ResolvedSkill) => (s.tags.includes('mark2') ? 2 : s.tags.includes('mark1') ? 1 : 0);
/** 时停中：主循环给敌人、首领脚本、红圈、弹幕传 dt = 0 */
export const chronoFrozen = () => CX?.started && CX.T < chrono.stopUntil;

// ======================================================================
// 施法：能不能放（时砂）→ 执行
// ======================================================================
export function chronoCanPay(pre: ResolvedSkill): boolean {
  if (!isChrono()) return true;
  const c = pre.stats.cost ?? 0;
  if (c <= chrono.sand + 1e-6) return true;
  if (pre.slot !== 'basic') { CX.toast(`时砂不足（需要 ${c} 格）`, '#ffc860'); CX.audio.error(); }
  return false;
}

/** 时砂行者的技能：返回 true = 已处理（executeSkill 不再走通用流程） */
export function chronoExecute(s: ResolvedSkill): boolean {
  if (!isChrono()) return false;
  chrono.sand = Math.max(0, chrono.sand - (s.stats.cost ?? 0));
  const cd = s.stats.cooldown ?? 0;
  CX.audio.skillLayer(s.slot === 'basic' || cd <= 0.5 ? 0 : s.slot === 'ultimate' || cd >= 12 ? 2 : 1, 'physical');
  if (CX.target && !s.tags.includes('blink')) CX.faceTo(CX.target.pos);
  const origin = CX.player.pos.clone(), yaw = CX.player.rig.root.rotation.y;
  const tgt = CX.target && CX.target.alive ? CX.target : null;
  if (s.tags.includes('timestop')) castStop(s);
  else if (s.tags.includes('echo_all')) castEchoAll(s);
  else if (s.tags.includes('rift')) castRift(s, tgt?.pos.clone() ?? fwdPoint(s.stats.range * 0.6));
  else if (s.tags.includes('blink')) castBlink(s);
  else if (s.tags.includes('zone_cast')) castZone(s, tgt?.pos.clone() ?? fwdPoint(Math.min(8, s.stats.range)), 1, false);
  else if (s.tags.includes('fan')) castFan(s, origin, tgt?.pos.clone() ?? null, yaw, 1, false);
  else if (s.tags.includes('chakram')) castThrow(s, origin, tgt, 1, false);
  else if (s.shape === 'single' && tgt) castBolt(s, origin, tgt, 1, false);
  else return false;
  // 回声：2 秒后原地重放；终极天赋「平行回响」重放两次，停滞之刻也会回声
  const allOn = CX.T < echoAllUntil && s.slot !== 'ultimate' && s.slot !== 'basic';
  const echo = s.tags.includes('echo') || allOn || (rank('ce_parallel') > 0 && s.slot === 'skill3');
  if (echo) {
    const job = { s, origin, yaw, tgt, tgtPos: tgt?.pos.clone() ?? null, mul: allOn ? Math.max(1, echoMul()) : echoMul() };
    echoes.push({ ...job, at: CX.T + K.echoDelay });
    if (rank('ce_parallel') > 0) echoes.push({ ...job, at: CX.T + K.echoDelay + 1.5 });
    if (chronoFrozen() && chronoHooks.extraEcho?.()) echoes.push({ ...job, at: CX.T + K.echoDelay + 0.75 });   // v0.9.1s 橙装：大招期间回声 +1
  }
  return true;
}

// ---- 时轮投掷（普攻）：飞向目标，命中后飞回来，回程再打一次 ----
function castThrow(s: ResolvedSkill, from: THREE.Vector3, tgt: Enemy | null, mul: number, echo: boolean, rig?: M.Rig) {
  if (!tgt) return;
  (rig ?? CX.player.rig).anim?.play(echo ? 'attack3' : (['attack1', 'attack3'] as const)[Math.floor(Math.random() * 2)], 1.8);
  if (!echo) { CX.audio.projectile(); CX.audio.chronoTick(); }
  const n = Math.max(1, Math.round(s.stats.projectileCount));
  const tgts: Enemy[] = [tgt];
  if (s.tags.includes('focus')) while (tgts.length < n) tgts.push(tgt);   // v0.7.4 刻印飞轮：全部打同一个目标
  while (tgts.length < n) { const e = nearestEnemy(s.stats.range, tgts); if (!e) break; tgts.push(e); }
  tgts.forEach((t, i) => { const w = newWheel(s, mul, echo, 'home', from, t, i); if (s.tags.includes('focus')) w.t = -0.12 * i; wheels.push(w); });
}

// ---- 千刃回旋：扇形飞出数枚时轮，直线来回，沿途切割 ----
function castFan(s: ResolvedSkill, from: THREE.Vector3, at: THREE.Vector3 | null, yaw: number, mul: number, echo: boolean, rig?: M.Rig) {
  (rig ?? CX.player.rig).anim?.play('attack3', 1.5);
  if (!echo) { CX.audio.whirl(); CX.audio.chronoTick(); }
  const base = at ? Math.atan2(at.x - from.x, at.z - from.z) : yaw;
  const n = Math.max(1, Math.round(s.stats.projectileCount));
  const spread = 0.28;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * spread;
    const w = newWheel(s, mul, echo, 'fan', from, null, i);
    w.dir.set(Math.sin(a), 0, Math.cos(a)); w.maxDist = s.stats.range;
    wheels.push(w);
  }
}

// ---- 停滞之刻：一道金沙射向目标，命中定身 + 打断 + 2 层时痕 ----
function castBolt(s: ResolvedSkill, from: THREE.Vector3, tgt: Enemy, mul: number, echo: boolean, rig?: M.Rig) {
  (rig ?? CX.player.rig).anim?.play('shoot', 1.7);
  if (!echo) CX.audio.castBolt('arcane');
  wheels.push(newWheel(s, mul, echo, 'bolt', from, tgt, 0));
}

function newWheel(s: ResolvedSkill, mul: number, echo: boolean, kind: Wheel['kind'], from: THREE.Vector3, tgt: Enemy | null, i: number): Wheel {
  const mesh = kind === 'bolt' ? M.makeOrb(echo ? '#7ab0ff' : '#ffd070', 0.24) : makeWheelMesh(echo);
  mesh.position.copy(from).add(new THREE.Vector3(0, 1.3 + i * 0.12, 0));
  CX.scene.add(mesh);
  return { mesh, s, mul, echo, kind, tgt, origin: from.clone(), dir: new THREE.Vector3(), maxDist: 0, phase: 'out', t: 0, hit: new Set(), retHit: -1, done: false };
}

let wheelGeo: THREE.BufferGeometry | null = null;
function makeWheelMesh(echo: boolean) {
  wheelGeo ??= new THREE.TorusGeometry(0.34, 0.06, 4, 16);
  const g = new THREE.Group();
  const ring = new THREE.Mesh(wheelGeo, G.glow(echo ? 0x7ab0ff : 0xffd070, echo ? 1.4 : 1.2, echo ? { transparent: true, opacity: 0.7 } : {}));
  M.noOutline(ring); ring.rotation.x = Math.PI / 2; g.add(ring);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), G.glow(0xfff0c0, 1.6)); M.noOutline(core); g.add(core);
  return g;
}

/** 命中结算：伤害（×mul）+ 效果，然后叠时痕 */
function hitWith(s: ResolvedSkill, list: Enemy[], mul: number, nMarks: number, echo = false) {
  const live = list.filter(e => e.alive);
  if (!live.length) return;
  chronoHit.echo = echo; applyHits(scaled(s, mul), live); chronoHit.echo = false;
  if (echo) chronoHooks.onEchoHit?.(s, live, CX.castStat.crit);   // v0.9.1s 橙装
  chrono.stats.wheelHits += live.length;
  if (nMarks) for (const e of live) addMark(e, nMarks);
}

function updateWheels(dt: number) {
  for (let i = wheels.length - 1; i >= 0; i--) {
    const w = wheels[i];
    w.t += dt;
    const m = w.mesh;
    m.rotation.y += dt * 22;
    wheelTrail(m.position, w.echo);   // v0.9.1h
    if (Math.random() < 0.6) CX.particles.emit(m.position, { count: 1, color: w.echo ? 0x7ab0ff : 0xffc860, color2: 0xfff0c0, speed: 0.3, up: 0.2, life: 0.35, size: 0.3 });
    const mk = marksOf(w.s) + (w.echo && !echoMarks() ? -99 : 0);
    if (w.kind === 'fan') {
      const sp = 20 * dt;
      if (w.phase === 'out') {
        m.position.addScaledVector(w.dir, sp);
        if (dist2d(m.position, w.origin) >= w.maxDist) { if (w.s.tags.includes('pierce')) w.done = true; else { w.phase = 'back'; w.hit.clear(); } }
      } else {
        const home = G.lift(w.echo ? w.origin : CX.player.pos, 1.3);
        const d = m.position.distanceTo(home);
        m.position.addScaledVector(home.sub(m.position).normalize(), Math.min(d, sp));
        if (d < 0.7 || w.t > 3) w.done = true;
      }
      const near = (unitsInRadius(CX.world, { x: m.position.x, z: m.position.z }, w.s.stats.radius, 'player') as Enemy[]).filter(e => e.z === CX.zone && !w.hit.has(e));
      if (near.length) { near.forEach(e => w.hit.add(e)); hitWith(w.s, near, w.mul, Math.max(0, mk), w.echo); }
    } else {
      // home / bolt：追踪目标；home 命中后飞回施法者，回程 0.15 秒时再打一次
      if (w.phase === 'out') {
        const tg = w.tgt;
        if (!tg || !tg.alive || tg.z !== CX.zone) { if (w.kind === 'bolt') w.done = true; else w.phase = 'back'; }
        else {
          const to = tg.pos.clone().setY(tg.pos.y + 1.1);
          const d = m.position.distanceTo(to);
          const sp = (w.kind === 'bolt' ? 26 : 24) * dt;
          m.position.addScaledVector(to.sub(m.position).normalize(), Math.min(d, sp));
          if (d < 0.6) {
            const out = w.kind === 'bolt' ? Math.max(0, mk) : w.s.tags.includes('mark_out') ? 1 : 0;
            hitWith(w.s, [tg], w.mul, w.echo && !echoMarks() ? 0 : out, w.echo);
            spawnRing(tg.getPos(), 1.1, w.kind === 'bolt' ? '#ffd070' : '#ffe0a0', 0.25);
            if (w.kind === 'bolt') { w.done = true; stasisFx(tg); }
            else { w.phase = 'back'; w.retHit = 0.15; }
          }
        }
      } else {
        const home = G.lift(w.echo ? w.origin : CX.player.pos, 1.3);
        const d = m.position.distanceTo(home);
        m.position.addScaledVector(home.sub(m.position).normalize(), Math.min(d, 24 * dt));
        if (w.retHit > 0) {
          w.retHit -= dt;
          if (w.retHit <= 0 && w.tgt?.alive) hitWith(w.s, [w.tgt], w.mul, w.echo && !echoMarks() ? 0 : w.s.tags.includes('mark_ret') ? 1 : 0, w.echo);
        }
        if (d < 0.7 || w.t > 3) w.done = true;
      }
    }
    if (w.done) { CX.scene.remove(m); wheels.splice(i, 1); }
  }
}

function stasisFx(tg: Enemy) {
  const p = tg.getPos(), s = tg.rig.scale ?? 1;
  const g = new THREE.Group();
  for (const k of [1, -1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 1.1 * s, 8, 1, true), G.glow(0xffd070, 1.2, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    M.noOutline(c); c.position.y = k > 0 ? 1.6 * s : 0.55 * s; if (k > 0) c.rotation.x = Math.PI; g.add(c);
  }
  g.position.set(p.x, G.gy(p.x, p.z) + 0, p.z);
  addFx(g, 1.5, k => { g.rotation.y = k * 3; g.children.forEach(c => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k))); });
}

// ---- 沙影步：向面朝方向瞬移，离开的位置炸一圈时砂（之后回声再炸一次） ----
function castBlink(s: ResolvedSkill) {
  const P = CX.player.pos, from = P.clone();
  let yaw = CX.player.rig.root.rotation.y;
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  let dist = s.stats.range;
  // v0.7.4 相位折跃：瞬移到目标身后；逆流冲刺：向后闪
  const ph = s.tags.includes('phase') && CX.target?.alive ? CX.target : null;
  if (ph) { const d = Math.hypot(ph.pos.x - P.x, ph.pos.z - P.z); dir.set(ph.pos.x - P.x, 0, ph.pos.z - P.z).normalize(); dist = Math.min(s.stats.range, d + 1.4); yaw = Math.atan2(dir.x, dir.z); }
  if (s.tags.includes('back')) dir.multiplyScalar(-1);
  for (let d = 0; d < dist; d += 0.25) {
    const prev = { x: P.x, z: P.z };
    P.addScaledVector(dir, 0.25);
    CX.clampToZone(P, prev);
    if (Math.hypot(P.x - prev.x, P.z - prev.z) < 0.05) break;   // 撞墙
  }
  chrono.stats.blinks++;
  chronoHooks.onBlink?.(s, from, P.clone());   // v0.9.1s 橙装
  CX.player.status.add({ key: 'blink', kind: 'invuln', remaining: 0.25, source: null });
  CX.player.rig.anim?.play('dash', 2);
  CX.audio.charge(); CX.audio.chronoTick();
  if (ph) { if (marks.has(ph)) { chrono.sand = Math.min(sandMax(), chrono.sand + 1); chrono.stats.refunds++; } sandBurst(P, s, 1, false); CX.faceTo(ph.pos); }
  else sandBurst(from, s, 1, false);
  if (s.tags.includes('fan_after')) { const tg = CX.target?.alive ? CX.target.pos.clone() : null; castFan({ ...s, tags: s.tags.filter(t => t !== 'mark1'), stats: { ...s.stats, radius: 1.3, range: 12 } }, P.clone(), tg, yaw, 1, false); }
  showGhost(from, yaw, 'dash', 0.6, 0xffd070);
  for (let i = 0; i <= 10; i++) { const k = i / 10; CX.particles.emit({ x: from.x + (P.x - from.x) * k, y: 1, z: from.z + (P.z - from.z) * k }, { count: 3, color: 0xffc860, color2: 0x7ab0ff, speed: 0.4, up: 0.5, life: 0.6, size: 0.4 }); }
}

function sandBurst(at: THREE.Vector3, s: ResolvedSkill, mul: number, echo: boolean) {
  const p = { x: at.x, z: at.z };
  spawnRing(p, s.stats.radius, echo ? '#7ab0ff' : '#ffd070', 0.45);
  sandSigil(p, s.stats.radius, echo);
  CX.particles.emit({ x: p.x, y: 0.4, z: p.z }, { count: 40, color: echo ? 0x7ab0ff : 0xffc860, color2: 0xfff0c0, speed: 5, up: 1, radius: 0.6, life: 0.6, size: 0.4, drag: 2 });
  const hits = (unitsInRadius(CX.world, p, s.stats.radius, 'player') as Enemy[]).filter(e => e.z === CX.zone);
  hitWith(s, hits, mul, echo && !echoMarks() ? 0 : marksOf(s), echo);
}

// ---- v0.7.4 技能书：沙牢 / 迟滞领域（目标处圆形区域）、万象回声、时之裂隙 ----
function fwdPoint(d: number) { const y = CX.player.rig.root.rotation.y; return CX.player.pos.clone().add(new THREE.Vector3(Math.sin(y) * d, 0, Math.cos(y) * d)); }
function castZone(s: ResolvedSkill, at: THREE.Vector3, mul: number, echo: boolean, rig?: M.Rig) {
  (rig ?? CX.player.rig).anim?.play('cast', 1.6);
  if (!echo) CX.audio.castBolt('arcane');
  const p = { x: at.x, z: at.z };
  spawnRing(p, s.stats.radius, echo ? '#7ab0ff' : '#ffd070', 0.6);
  // v1.2.81 六芒法阵 → 时砂沙涡（通用区域件）：带持续区域的技能由 groundZone 铺（统一换沙涡样式），瞬发的铺一段短沙涡
  if (!s.effects.some(e => e.type === 'groundZone')) zoneStorm(p, s.stats.radius, 'physical', s.effects.some(e => e.type === 'stun') ? 2 : 1.2, 'sand');
  const hits = (unitsInRadius(CX.world, p, s.stats.radius, 'player') as Enemy[]).filter(e => e.z === CX.zone);
  withZoneStyle('sand', () => hitWith(s, hits, mul, echo && !echoMarks() ? 0 : marksOf(s), echo));
  chrono.stats.zones++;
}
function castEchoAll(s: ResolvedSkill) {
  echoAllUntil = CX.T + 8; chrono.stats.echoAll++;
  CX.player.rig.anim?.play('castLong', 1.6); CX.audio.ultimate(); CX.feel.emit('ultimate');
  sandBurst(CX.player.pos.clone(), s, 1, false);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; showGhost(CX.player.pos.clone().add(new THREE.Vector3(Math.sin(a) * 2, 0, Math.cos(a) * 2)), a, 'cast', 1.2); }
}
function castRift(s: ResolvedSkill, at: THREE.Vector3) {
  CX.player.rig.anim?.play('castLong', 1.6); CX.audio.ultimate(); CX.feel.emit('ultimate');
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 32), G.glow(0x7a5aff, 1.5, { transparent: true, opacity: 0.8 }));
  mesh.visible = false; zoneStorm({ x: at.x, z: at.z }, s.stats.radius, 'physical', 4, 'rift');   // v1.2.81 紫色光环 → 时之裂隙贴花（虚空裂口 + 金边 + 向内卷的时砂），环只留作计时占位
  M.noOutline(mesh); mesh.rotation.x = Math.PI / 2; mesh.position.set(at.x, G.gy(at.x, at.z) + 0.4, at.z); mesh.scale.setScalar(s.stats.radius * 0.5); CX.scene.add(mesh);
  rifts.push({ x: at.x, z: at.z, r: s.stats.radius, left: 4, tick: 0, s, mesh });
  chrono.stats.rifts++;
  castZone(s, at, 1, false);
}
function updateRifts(dt: number) {
  for (let i = rifts.length - 1; i >= 0; i--) {
    const r = rifts[i]; r.left -= dt; r.tick -= dt;
    riftTick(r, r.r);   // v0.9.1h
    r.mesh.rotation.z += dt * 4; r.mesh.scale.setScalar(r.r * (0.45 + 0.1 * Math.sin(CX.T * 8)));
    const list = (unitsInRadius(CX.world, { x: r.x, z: r.z }, r.r, 'player') as Enemy[]).filter(e => e.z === CX.zone && e.alive);
    for (const e of list) if (!e.isBoss) { const dx = r.x - e.pos.x, dz = r.z - e.pos.z, d = Math.hypot(dx, dz); if (d > 0.6) { e.pos.x += dx / d * Math.min(d, 3 * dt); e.pos.z += dz / d * Math.min(d, 3 * dt); } }
    if (Math.random() < 0.7) CX.particles.emit({ x: r.x, y: 0.5, z: r.z }, { count: 2, color: 0x7a5aff, color2: 0xffd070, speed: -3, up: 0.5, radius: r.r, life: 0.5, size: 0.3 });
    if (r.tick <= 0) { r.tick = 0.5; hitWith(r.s, list, 0.25, 0); }
    if (r.left <= 0 || r.mesh.userData.zone !== undefined && r.mesh.userData.zone !== CX.zone) {
      chronoHooks.onRiftEnd?.(list);   // v1.2.73 时痕 6 件通用
      for (const e of list) if (marks.has(e)) detonate(e);
      spawnRing({ x: r.x, z: r.z }, r.r, '#b09aff', 0.6);
      CX.scene.remove(r.mesh); rifts.splice(i, 1);
    }
    r.mesh.userData.zone ??= CX.zone;
  }
}

// ---- 终刻：时停 ----
function castStop(s: ResolvedSkill) {
  const dur = K.stopTime + 0.5 * rank('cr_ult');
  chrono.stopUntil = CX.T + dur; chrono.stopTotal = dur; chrono.stats.stops++; stopExtra = 0;
  stopDealt.clear();
  CX.player.rig.anim?.play('castLong', 1.6);
  CX.audio.ultimate(); CX.feel.emit('ultimate');
  const p = CX.player.getPos();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), G.glow(0x7ab0ff, 1, { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  M.noOutline(dome); dome.position.set(p.x, G.gy(p.x, p.z) + 0, p.z);
  addFx(dome, 0.7, k => { dome.scale.setScalar(0.5 + k * s.stats.radius); ((dome.material as THREE.MeshBasicMaterial).opacity = 0.25 * (1 - k)); });
  spawnRing(p, s.stats.radius, '#7ab0ff', 0.8); spawnRing(p, s.stats.radius * 0.5, '#ffd070', 0.6);
  timeStop(p, s.stats.radius);   // v0.9.1h 终刻钟面
  CX.particles.emit({ x: p.x, y: 1, z: p.z }, { count: 90, color: 0xffd070, color2: 0x7ab0ff, speed: 7, up: 1.5, radius: 1, life: 1, size: 0.45, drag: 1.5 });
  const hits = (unitsInRadius(CX.world, p, s.stats.radius, 'player') as Enemy[]).filter(e => e.z === CX.zone);
  hitWith(s, hits, 1, marksOf(s));
  setStopLook(true);
}

function endStop() {
  chrono.stopUntil = -1;
  chronoHooks.onStopEnd?.();   // v0.9.1m 套装 6 件
  chronoHooks.onStopEndLg?.([...stopDealt.keys()]);   // v0.9.1s 橙装
  setStopLook(false);
  detonating = true;
  for (const [e, d] of stopDealt) {
    if (!e.alive || e.z !== CX.zone || d < 1) continue;
    CX.fx.dealDamage(e, d * K.stopBonus, 'arcane', CX.player, false);
    spawnRing(e.getPos(), 1.6, '#ffd070', 0.4);
  }
  detonating = false;
  stopDealt.clear();
  CX.feel.emit('heavy', 0.8); CX.audio.thunder();
}

function setStopLook(on: boolean) {
  const cv = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (cv) cv.style.filter = on ? 'saturate(.35) sepia(.35) hue-rotate(170deg) brightness(1.05)' : '';
  document.documentElement.classList.toggle('timestop', on);
}

// ======================================================================
// 时痕
// ======================================================================
function addMark(e: Enemy, n: number) {
  if (!n || !e.alive || e.isDummy && false) return;
  n += chronoHooks.markBonus?.() ?? 0;   // v1.2.35 誓约护符：立誓期间每次多叠 1 层
  let m = marks.get(e);
  if (!m) {
    const fx = new THREE.Group(); const pips: THREE.Mesh[] = [];
    for (let i = 0; i < markCap(); i++) {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), G.glow(0x403020, 1, { transparent: true, opacity: 0.55 }));
      M.noOutline(p); p.position.x = (i - (markCap() - 1) / 2) * 0.28; fx.add(p); pips.push(p);
    }
    CX.scene.add(fx);
    m = { n: 0, stored: 0, left: K.markLife, fx, pips };
    marks.set(e, m);
  }
  m.n = Math.min(markCap(), m.n + n);
  m.pips.forEach((p, i) => { const on = i < m!.n; (p.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xffd070 : 0x403020); (p.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.5; p.scale.setScalar(on ? 1.25 : 1); });
  if (m.n >= markCap() && !detonating) detonate(e);
}

function detonate(e: Enemy) {
  const m = marks.get(e); if (!m) return;
  marks.delete(e); CX.scene.remove(m.fx);
  if (!e.alive || e.z !== CX.zone) return;
  const basic = CX.loadout.preview('basic', CX.ctx())?.stats.damage ?? 15;
  const dmg = (m.stored + m.n * basic * K.markBase) * (rank('cm_doom') ? 1.6 : 1) * (chronoHooks.detMul?.(e) ?? 1) * (chronoHooks.lgDetMul?.(e) ?? 1);   // v0.9.1m 套装 6 件；v0.9.1s 橙装
  detonating = true;
  const dealt = CX.fx.dealDamage(e, dmg, 'arcane', CX.player, false);
  detonating = false;
  chrono.stats.detonations++; chrono.stats.detonateDmg += dealt;
  chronoHooks.onDetonate?.(e, dealt);   // v0.9.1s 橙装
  const p = e.getPos();
  spawnRing(p, 2.2, '#ffd070', 0.5); spawnRing(p, 1.2, '#ffffff', 0.35);
  CX.particles.emit({ x: p.x, y: 1.2, z: p.z }, { count: 50, color: 0xffd070, color2: 0xfff0c0, speed: 6, up: 2, radius: 0.5, life: 0.7, size: 0.45, drag: 1.5 });
  CX.audio.thunder(); CX.feel.emit('heavy', 0.6);
  if (rank('cm_doom')) boostCrit(0.25, 2);
  if (hasLg('lg_keeper_hood')) keeperUntil = CX.T + ad('lg_keeper_hood', 2);   // v0.7.2 守时者兜帽
  if (setN('set_chrono') >= 4 && CX.T >= cloneReady) {  // v0.7.2 时痕 4 件：回声分身 4 秒，每秒一枚时轮
    cloneReady = CX.T + 6; chrono.stats.setClones++;
    const basic = CX.loadout.preview('basic', CX.ctx());
    const P = CX.player.pos.clone(), yaw = CX.player.rig.root.rotation.y;
    if (basic) for (let k = 0; k < 4 + (chronoHooks.cloneAdd?.() ?? 0); k++) echoes.push({ s: basic, origin: P.clone().add(new THREE.Vector3(Math.cos(yaw) * 1.2, 0, -Math.sin(yaw) * 1.2)), yaw, tgt: null, tgtPos: null, mul: echoMul(), at: CX.T + 0.3 + k, clone: true });
    if (basic && chronoHooks.extraClone?.()) for (let k = 0; k < 4; k++) echoes.push({ s: basic, origin: P.clone().add(new THREE.Vector3(-Math.cos(yaw) * 1.2, 0, Math.sin(yaw) * 1.2)), yaw, tgt: null, tgtPos: null, mul: echoMul(), at: CX.T + 0.8 + k, clone: true });   // v0.9.1m 套装 6 件 · 平行
  }
  if (rank('cm_spread')) {
    detonating = true;
    for (const o of unitsInRadius(CX.world, p, 4, 'player') as Enemy[]) {
      if (o === e || o.z !== CX.zone) continue;
      CX.fx.dealDamage(o, dealt * 0.5, 'arcane', CX.player, false);
      addMark(o, 1);
    }
    detonating = false;
  }
}

function updateMarks(dt: number, frozen: boolean) {
  for (const [e, m] of [...marks]) {
    if (!e.alive || e.z !== CX.zone) { marks.delete(e); CX.scene.remove(m.fx); continue; }
    m.fx.position.set(e.pos.x, G.gy(e.pos.x, e.pos.z) + 2.5 * (e.rig.scale ?? 1) + 0.3, e.pos.z);
    m.fx.quaternion.copy(CX.camera.quaternion);
    if (!frozen) { m.left -= dt; if (m.left <= 0) detonate(e); }
  }
}

/** Combat 钩子：所有伤害结算后调用 */
function onDealt(t: CombatUnit, dealt: number, _el: Element, src: CombatUnit | null, crit: boolean, tick: boolean) {
  if (!isChrono() || src !== CX.player || dealt <= 0 || extraHit) return;
  // v0.7.2 终末之刻：时停期间暴击延长时停
  if (crit && !tick && chronoFrozen() && stopExtra < ad('lg_final_moment', 1.5) && hasLg('lg_final_moment')) { const a = Math.min(ax('lg_final_moment', 0.2), ad('lg_final_moment', 1.5) - stopExtra); stopExtra += a; chrono.stopUntil += a; chrono.stats.stopExtended += a; }
  // v0.7.2 守时者兜帽：引爆后 2 秒内伤害 +25%（补一段伤害）
  if (CX.T < keeperUntil && t.alive) { extraHit = true; CX.fx.dealDamage(t, dealt * 0.25, _el, CX.player, false, false, true); extraHit = false; }
  if (crit && !tick) {
    const add = K.critRefund + (rank('cr_sand') ? 0.5 : 0);
    chrono.sand = Math.min(sandMax(), chrono.sand + add); chrono.stats.refunds++;
  }
  if (detonating) return;
  const e = t as Enemy;
  const m = marks.get(e);
  if (m) m.stored += dealt * (K.markStore + 0.02 * rank('cm_store')) * m.n;
  if (chronoFrozen()) stopDealt.set(e, (stopDealt.get(e) ?? 0) + dealt);
}

function boostCrit(v: number, dur: number) {
  if (critBoostUntil < CX.T) { CX.player.critChance += v; critBoost = v; }
  else if (v > critBoost) { CX.player.critChance += v - critBoost; critBoost = v; }
  critBoostUntil = Math.max(critBoostUntil, CX.T + dur);
}

// ======================================================================
// 回声分身
// ======================================================================
function ghostRig(): M.Rig {
  const rig = M.makeChrono(CX.look ?? 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.42, depthWrite: false });
  rig.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat; m.castShadow = false; } if ((o as THREE.Light).isLight) o.visible = false; });
  rig.root.userData.ghostMat = mat;
  return rig;
}
function showGhost(at: THREE.Vector3, yaw: number, anim: string, life: number, color = 0x6aa8ff): M.Rig {
  let g = ghosts.find(x => x.until < CX.T);
  if (!g) { g = { rig: ghostRig(), until: 0, t: 0 }; ghosts.push(g); CX.scene.add(g.rig.root); }
  g.until = CX.T + life; g.t = 0;
  g.rig.root.visible = true;
  g.rig.root.position.copy(at); g.rig.root.rotation.y = yaw;
  (g.rig.root.userData.ghostMat as THREE.MeshBasicMaterial).color.setHex(color);
  g.rig.anim?.play(anim as never, 1.6);
  return g.rig;
}
function updateGhosts(dt: number) {
  for (const g of ghosts) {
    if (!g.rig.root.visible) continue;
    g.t += dt;
    g.rig.anim?.update(dt);
    const left = g.until - CX.T;
    (g.rig.root.userData.ghostMat as THREE.MeshBasicMaterial).opacity = 0.42 * Math.max(0, Math.min(1, left / 0.3));
    if (left <= 0) g.rig.root.visible = false;
  }
}

function runEcho(j: EchoJob) {
  if (!CX.player.alive) return;
  if (j.clone) {   // 时痕 4 件的回声分身：找 14 米内最近的敌人
    let best: Enemy | null = null, bd = 14;
    for (const e of CX.enemies) { if (!e.alive || e.z !== CX.zone || e.isDummy) continue; const d = Math.hypot(e.pos.x - j.origin.x, e.pos.z - j.origin.z); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    j = { ...j, tgt: best, tgtPos: best.pos.clone() };
  }
  chrono.stats.echoes++;
  const s = j.s;
  const yaw = j.tgtPos ? Math.atan2(j.tgtPos.x - j.origin.x, j.tgtPos.z - j.origin.z) : j.yaw;
  const rig = showGhost(j.origin, yaw, s.tags.includes('blink') ? 'cast' : 'attack3', 0.9);
  CX.particles.emit({ x: j.origin.x, y: 1, z: j.origin.z }, { count: 20, color: 0x7ab0ff, color2: 0xffffff, speed: 1.5, up: 1, radius: 0.5, life: 0.6, size: 0.35 });
  const tgt = j.tgt && j.tgt.alive && j.tgt.z === CX.zone ? j.tgt : null;
  if (s.tags.includes('blink')) sandBurst(j.origin, s, j.mul, true);
  else if (s.tags.includes('zone_cast')) castZone(s, tgt?.pos.clone() ?? j.tgtPos ?? j.origin, j.mul, true, rig);
  else if (s.tags.includes('fan')) castFan(s, j.origin, tgt?.pos.clone() ?? j.tgtPos, j.yaw, j.mul, true, rig);
  else if (s.tags.includes('chakram') && tgt) castThrow(s, j.origin, tgt, j.mul, true, rig);
  else if (s.shape === 'single' && tgt) castBolt(s, j.origin, tgt, j.mul, true, rig);
}

// ======================================================================
// 回溯（F）
// ======================================================================
export function rewindCd() { return Math.max(2, K.rewindCd - 1.5 * rank('cr_cd') - (hasLg('lg_backflow') ? ax('lg_backflow', 4) : 0) - (questDone('cq_chrono2') ? 2 : 0)); }
export function chronoRewind(): boolean {
  if (!isChrono() || !CX.started || !CX.player.alive || CX.player.status.isStunned && false) return false;
  if (CX.T < chrono.rewindEnd) { CX.toast(`回溯冷却中（${Math.ceil(chrono.rewindEnd - CX.T)} 秒）`, '#ffc860'); CX.audio.error(); return false; }
  if (chrono.sand < K.rewindCost - 1e-6) { CX.toast(`时砂不足（回溯需要 ${K.rewindCost} 格）`, '#ffc860'); CX.audio.error(); return false; }
  const want = CX.T - K.rewindBack;
  const pts = hist.filter(h => h.zone === CX.zone);
  const to = pts.reduce<typeof pts[0] | undefined>((b, h) => (!b || Math.abs(h.t - want) < Math.abs(b.t - want) ? h : b), undefined);   // 最接近 3 秒前的一笔
  if (!to) return false;
  chrono.sand -= K.rewindCost;
  chrono.rewindEnd = CX.T + rewindCd();
  chrono.stats.rewinds++;
  const P = CX.player, from = P.pos.clone();
  showGhost(from, P.rig.root.rotation.y, 'idle', 0.7, 0xffd070);
  // 沿路倒放：一串沙粒从现在的位置飞回 3 秒前
  for (let i = 0; i <= 12; i++) { const k = i / 12; CX.particles.emit({ x: from.x + (to.x - from.x) * k, y: 1.1, z: from.z + (to.z - from.z) * k }, { count: 3, color: 0x7ab0ff, color2: 0xffd070, speed: 0.5, up: 0.6, life: 0.7, size: 0.4 }); }
  if (rank('cr_blast')) {
    const step = CX.loadout.preview('skill1', CX.ctx());
    if (step) sandBurst(from, { ...step, stats: { ...step.stats, radius: 4 } }, 1.2, false);
  }
  P.pos.set(to.x, P.pos.y, to.z);
  const heal = P.maxHp * (K.rewindHeal + 0.1 * rank('cr_heal'));
  if (to.hp > P.hp) P.hp = Math.min(P.maxHp, Math.round(Math.min(to.hp, P.hp + heal)));
  P.status.clear();
  P.status.add({ key: 'rewind', kind: 'invuln', remaining: 0.5, source: null });
  if (rank('cr_eternal')) { boostCrit(1, 3); chrono.sand = Math.min(sandMax(), chrono.sand + 1); }
  if (hasLg('lg_backflow')) chrono.sand = Math.min(sandMax(), chrono.sand + an('lg_backflow', 1));   // v0.7.2 倒流沙漏
  CX.audio.portal(); CX.feel.emit('heavy', 0.4);
  chronoHooks.onRewind?.();   // v0.9.1m 套装 6 件
  chronoHooks.onRewindLg?.();   // v0.9.1s 橙装
  spawnRing(P.getPos(), 2, '#7ab0ff', 0.5);
  P.rig.anim?.play('cast', 2);
  hist.length = 0;
  return true;
}

// ======================================================================
// 每帧
// ======================================================================
export function chronoUpdate(dt: number) {
  syncHud();
  if (!isChrono() || !CX.player) return;
  const frozen = chronoFrozen();
  if (chrono.stopUntil > 0 && !frozen) endStop();
  // 时砂回复（急速缩短间隔）
  const mx = sandMax();
  if (chrono.sand < mx) {
    const haste = CX.charSheet?.().haste ?? 0;
    chrono.sandT += dt * (1 + haste / 100);
    while (chrono.sandT >= K.sandRegen) { chrono.sandT -= K.sandRegen; chrono.sand = Math.min(mx, chrono.sand + 1); }
  } else { chrono.sandT = 0; chrono.sand = mx; }
  // 位置记录（回溯用）：每 0.1 秒一笔，保留 4 秒
  histT -= dt;
  if (histT <= 0 && CX.player.alive) {
    histT = 0.1;
    hist.push({ t: CX.T, x: CX.player.pos.x, z: CX.player.pos.z, hp: CX.player.hp, zone: CX.zone });
    while (hist.length && hist[0].t < CX.T - K.rewindBack - 1) hist.shift();
  }
  for (let i = echoes.length - 1; i >= 0; i--) if (echoes[i].at <= CX.T) { const j = echoes[i]; echoes.splice(i, 1); runEcho(j); }
  updateWheels(dt);
  if (!frozen) updateRifts(dt);
  updateMarks(dt, frozen);
  updateGhosts(dt);
  if (critBoostUntil > 0 && CX.T > critBoostUntil) { CX.player.critChance -= critBoost; critBoost = 0; critBoostUntil = -1; }
  if (!CX.player.alive) { echoes.length = 0; }
}

/** 换职业 / 换地图：清掉飞行中的时轮、时痕、回声 */
export function chronoReset() {
  if (!CX) return;
  for (const w of wheels) CX.scene.remove(w.mesh); wheels.length = 0;
  for (const [, m] of marks) CX.scene.remove(m.fx); marks.clear();
  echoes.length = 0; hist.length = 0; stopDealt.clear();
  for (const r of rifts) CX.scene.remove(r.mesh); rifts.length = 0; echoAllUntil = -1;
  if (chrono.stopUntil > 0) { chrono.stopUntil = -1; setStopLook(false); }
  if (critBoostUntil > 0 && CX.player) { CX.player.critChance -= critBoost; critBoost = 0; critBoostUntil = -1; }
  ghosts.forEach(g => (g.rig.root.visible = false));
  chrono.sand = sandMax();
}

// ======================================================================
// HUD：头像框下的时砂条 + 沙漏（回溯）按钮
// ======================================================================
function syncHud() {
  const cls = CX.cls?.id ?? '';
  const bar = document.getElementById('pf-res'), btn = document.getElementById('sk-rewind');
  if (!bar || !btn) return;
  if (cls !== hudCls) {
    hudCls = cls; hudSand = -1;
    const on = cls === 'chrono';
    bar.style.display = on ? '' : 'none'; btn.style.display = on ? '' : 'none';
    if (on) btn.innerHTML = `<div class="ic">${skillIcon('rewind', '#7ab0ff')}</div><div class="cd" style="height:0"></div><div class="cdt"></div><span class="key">F</span><span class="nm">回溯</span>`;
  }
  if (cls !== 'chrono') return;
  const mx = sandMax();
  if (mx !== hudMax) { hudMax = mx; bar.innerHTML = Array.from({ length: mx }, () => '<i></i>').join('') + '<b></b>'; hudSand = -1; }
  const v = Math.round(chrono.sand * 2) / 2;
  if (v !== hudSand) {
    hudSand = v;
    bar.querySelectorAll('i').forEach((e, i) => { (e as HTMLElement).className = i + 1 <= v ? 'on' : i + 0.5 <= v ? 'half' : ''; });
    (bar.querySelector('b') as HTMLElement).textContent = `${Math.floor(v)}/${mx}`;
  }
  const left = Math.max(0, chrono.rewindEnd - CX.T), cdTot = rewindCd();
  (btn.querySelector('.cd') as HTMLElement).style.height = `${left > 0 ? Math.min(100, left / cdTot * 100) : 0}%`;
  (btn.querySelector('.cdt') as HTMLElement).textContent = left > 0 ? String(Math.ceil(left)) : '';
  btn.classList.toggle('oor', chrono.sand < K.rewindCost);
}

/** 技能提示框多一行：时砂消耗 + 机制说明 */
export function chronoTipLine(p: ResolvedSkill): string {
  if (!isChrono()) return '';
  const parts: string[] = [];
  if (p.stats.cost) parts.push(`消耗 <b style="color:#ffd070">${p.stats.cost}</b> 格时砂`);
  const n = marksOf(p) + (p.tags.includes('mark_ret') ? 1 : 0) + (p.tags.includes('mark_out') ? 1 : 0);
  if (n) parts.push(`叠 ${n} 层时痕`);
  if (p.tags.includes('echo')) parts.push(`2 秒后回声重放（${Math.round(echoMul() * 100)}%）`);
  if (p.tags.includes('return')) parts.push('飞回时再命中一次');
  if (p.tags.includes('blink')) parts.push(p.tags.includes('phase') ? '瞬移到目标身后' : p.tags.includes('back') ? `向后闪 ${p.stats.range.toFixed(0)} 米` : `向前瞬移 ${p.stats.range.toFixed(0)} 米`);
  if (p.tags.includes('echo_all')) parts.push('8 秒内每个技能都被回声以 100% 重放');
  if (p.tags.includes('rift')) parts.push('裂隙 4 秒，拉扯并切割，结束时引爆范围内时痕');
  if (p.tags.includes('focus')) parts.push(`${Math.round(p.stats.projectileCount)} 枚时轮打同一目标`);
  if (p.tags.includes('pierce')) parts.push('直线穿透');
  if (p.tags.includes('timestop')) parts.push(`时停 ${(K.stopTime + 0.5 * rank('cr_ult')).toFixed(1)} 秒，期间伤害结束时额外打出 ${K.stopBonus * 100}%`);
  return parts.length ? `<span class="ln" style="color:#ffe0a0">${parts.join(' · ')}</span><br>` : '';
}

export function chronoDebug() {
  return { sand: chrono.sand, max: sandMax(), marks: [...marks.values()].map(m => m.n), wheels: wheels.length, echoesPending: echoes.length, frozen: !!chronoFrozen(), hist: hist.length, echoMul: echoMul(), echoMarks: echoMarks(), rewindCd: rewindCd(), ...chrono.stats };
}
/** 测试：给目标直接叠时痕 */
export function chronoMark(e: Enemy, n: number) { addMark(e, n); }
/** v0.9.1m 套装钩子（web/setfx.ts 填） */
export const chronoHooks: {
  detMul?: (e: Enemy) => number; extraClone?: () => boolean; onStopEnd?: () => void; onRiftEnd?: (list: Enemy[]) => void; onRewind?: () => void;
  // v0.9.1s 橙装钩子（web/lgfx.ts）
  lgDetMul?: (e: Enemy) => number; onDetonate?: (e: Enemy, dealt: number) => void; markAdd?: () => number; markBonus?: () => number; cloneAdd?: () => number; extraEcho?: () => boolean;
  onEchoHit?: (s: ResolvedSkill, hits: Enemy[], crit: boolean) => void; onBlink?: (s: ResolvedSkill, from: THREE.Vector3, to: THREE.Vector3) => void; onStopEndLg?: (hit: Enemy[]) => void; onRewindLg?: () => void;
} = {};
/** v0.9.1s：当前这次命中是不是回声 / 分身打的 */
export const chronoHit = { echo: false };
const markCap = () => K.markMax + (chronoHooks.markAdd?.() ?? 0);
/** v0.9.1s：在 origin 放一个回声分身，delay 秒后朝最近的敌人扔一次普攻 */
export function chronoQueueClone(origin: THREE.Vector3, delay: number) {
  const basic = CX.loadout.preview('basic', CX.ctx()); if (!basic) return;
  echoes.push({ s: basic, origin: origin.clone(), yaw: CX.player.rig.root.rotation.y, tgt: null, tgtPos: null, mul: echoMul(), at: CX.T + delay, clone: true });
}
export const chronoMarks = (e: Enemy) => marks.get(e)?.n ?? 0;
/** v0.9.1m：往目标的时痕里额外存伤害（没有时痕就不存） */
export function chronoStore(e: Enemy, amt: number) { const m = marks.get(e); if (m) m.stored += amt; }
/** v0.9.1m：回声分身是否在场（4 件分身持续 4 秒，冷却 6 秒） */
export const chronoCloneActive = () => CX.T < cloneReady - 2;

export function bindChrono(__ctx: Ctx) {
  CX = __ctx;
  { const prev = CX.fx.onDealt; CX.fx.onDealt = (...a) => { prev?.(...a); onDealt(...a); }; }   // v0.9.1m 改为串联（套装钩子也挂在这里）
  const btn = document.getElementById('sk-rewind');
  if (btn) {
    const down = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); chronoRewind(); };
    btn.addEventListener('touchstart', down, { passive: false }); btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseenter', ev => showTip(`<b class="tt-name" style="color:#7ab0ff">回溯</b><span class="tt-sub">F · 消耗 ${K.rewindCost} 格时砂 · 冷却 ${rewindCd().toFixed(1)} 秒</span>回到 ${K.rewindBack} 秒前的位置，生命回到当时（最多恢复 ${Math.round((K.rewindHeal + 0.1 * rank('cr_heal')) * 100)}% 最大生命），清除身上的减益，短暂无敌`, ev as MouseEvent));
    btn.addEventListener('mouseleave', () => hideTip());
  }
  void uiIcon;
}
