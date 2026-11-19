// ======================================================================
// 长副本 A「潮渊钟井」首领 4 · 摆渡双子：双首领机制（v1.2.69-A8，11-02）
// A4 起的「生死同渡」门槛（packdungeon 机制门槛：死渡 50% 不可破，核心 = 生渡）之上，在 DLC 内把生渡做成真正的第二个首领：
//   1. 上岸：死渡掉到 50%，生渡从渡船跳上岸（水花 + 喊话），血量与死渡同一比例（两条命连在一起）；
//   2. 会走会打：接管它的大脑——追玩家、船篙普攻（伤害 = 死渡普攻 × 0.6，攻击距离 / 移速跟死渡同档、按体型）；
//   3. 渡生引导（可打断）：每 13 秒站定引导 4 秒，提灯连一道光到死渡身上，每秒给死渡回 2% 最大生命、引导完自己回 10%；
//      任何打断（打断技 / 眩晕技 / 冻结叠满）都能断掉 → 踉跄 2.5 秒、冷却重新算；首领警报条（幽魂绿 = 读条法术）+ 光束提示；
//   4. 血量联动：上岸同血；「同舟」——两人相距 8 米内，生渡受到的伤害 -50%（把它拉开打）；「断渡」——生渡倒下，死渡跟着掉 6% 最大生命；
//   5. 锁血：生渡活着，死渡锁血（门槛本身）；死渡身上罩一层白绿「同渡护壳」直到生渡倒下。
// 只读写本体 Enemy 的运行时字段（brain / hp / preDamage / onInterrupt 经 brain.interrupt），不改主干。
// ======================================================================
import * as THREE from 'three';
import type { PackCtx } from '../../core/ContentPacks';
import type { ClassFxApi } from '../../core/ClassExt';
import { hideRaidWarn, raidWarnInfo } from './raid_well_rig';
/** 引导被打断 / 生渡倒下：收起首领警报条（只收「渡生引导」这一条，不碰死渡同时在读的招） */
const hideMendWarn = () => { try { if (raidWarnInfo().text.includes('渡生引导')) hideRaidWarn(); } catch { /* 无 DOM */ } };

/** 本体 Enemy 的最小视图（按运行时字段读） */
interface TUnit {
  alive: boolean; hp: number; maxHp: number; pos: THREE.Vector3; brain: unknown; intent?: unknown; wbAdd?: boolean; isBoss?: boolean;
  preDamage?: (amount: number, src: unknown, el: string) => number;
  rig: { root: THREE.Object3D; anim?: { play?(n: string, s?: number): void; handle?: { worldOf(n: string): THREE.Vector3 | null; height: number } } };
}
type Intent = { state: string; moveDir: { x: number; z: number } | null; speed: number; faceTo: { x: number; z: number } | null; attacked: boolean };
interface BaseBrain { update(dt: number, p: unknown): Intent; provoke(): void; cfg?: Record<string, number>; state?: string; attackCd?: number }

/** v2 两岸：黑水中线 x（世界坐标，raid_well 建场时写入）、两岸离中线的距离、岸中心 z */
export const TWIN_BANK: { x: number | null; z: number; off: number } = { x: null, z: 0, off: 10 };
export const TWIN = { lockK: 0.1, mendCd: 13, mendFirst: 5, mendTime: 4, mendTick: 0.02, mendSelf: 0.1, stun: 2.5, near: 8, nearK: 0.5, breakK: 0.06, dmgK: 0.6 } as const;
const st = {
  death: null as TUnit | null, life: null as TUnit | null, setup: null as TUnit | null,
  mend: null as null | { t: number; tick: number }, cd: 0, lock: 0, healed: 0, mends: 0, interrupts: 0, broke: false, lifeDown: false,
  beam: null as THREE.Group | null, beamGap: 0, shell: null as THREE.Mesh | null, events: [] as { t: number; e: string; v?: number }[], clock: 0,
};
let ctx: PackCtx | null = null;
export const bindTwins = (c: PackCtx) => { ctx = c; };
const FX = (): ClassFxApi | null => { try { return ctx?.fx?.() ?? null; } catch { return null; } };
const ev = (e: string, v?: number) => { st.events.push({ t: Math.round(st.clock * 10) / 10, e, ...(v !== undefined ? { v: Math.round(v * 1000) / 1000 } : {}) }); if (st.events.length > 40) st.events.shift(); };
/** 模型工厂建好单位后（Enemy 构造里 anim.bindUnit）登记：死渡 = 首领本体，生渡 = 门槛核心 */
export function twinBind(id: string, u: unknown) {
  const x = u as TUnit;
  // 构造函数里登记（wbAdd 等字段要构造完才写上，所以这里不判断，上岸时再核对）
  if (id === 'wl_ferry_death') st.death = x;
  else if (id === 'wl_ferry_life') { st.life = x; st.setup = null; }
}
const lifeAlive = () => !!st.life?.alive;

/** 生渡接管大脑：追打 + 渡生引导（可打断） */
function takeOver(L: TUnit, D: TUnit) {
  const base = L.brain as BaseBrain, dcfg = ((D.brain as { base?: BaseBrain })?.base?.cfg ?? {}) as Record<string, number>;
  if (base.cfg) Object.assign(base.cfg, { aggroRange: 70, attackRange: dcfg.attackRange ?? 4, attackDamage: Math.round((dcfg.attackDamage ?? 175) * TWIN.dmgK), attackInterval: 2.4, moveSpeed: (dcfg.moveSpeed ?? 3.4) * 0.9, leashRange: 99, patrolRadius: 0 });
  const ab = { id: 'mend', name: '渡生引导', castTime: TWIN.mendTime, kind: 'cast' };
  const W = {
    base, casting: null as null | { ab: typeof ab; elapsed: number }, cds: new Map<string, number>(), def: { abilities: [ab] }, phaseIndex: 0,
    provoke() { base.provoke(); },
    interrupt() {
      if (!W.casting) return false;
      W.casting = null; st.mend = null; st.lock = TWIN.stun; st.cd = TWIN.mendCd; st.interrupts++; ev('interrupt');
      L.rig.anim?.play?.('hit'); ctx?.yell('打断了「渡生引导」——生渡踉跄了一下'); hideBeam(); hideMendWarn(); return true;
    },
    update(dt: number, p: unknown): Intent {
      const idle = (face: { x: number; z: number } | null): Intent => ({ state: 'attack', moveDir: null, speed: 0, faceTo: face, attacked: false });
      if (!L.alive) { W.casting = null; return base.update(dt, p); }
      if (st.lock > 0) { st.lock -= dt; return idle(null); }
      if (W.casting) {
        W.casting.elapsed += dt;
        if (W.casting.elapsed >= ab.castTime) { W.casting = null; endMend(L, D, true); }
        return idle(D.alive ? { x: D.pos.x, z: D.pos.z } : null);
      }
      st.cd -= dt;
      if (st.cd <= 0 && D.alive && D.hp < D.maxHp) { W.casting = { ab, elapsed: 0 }; st.mend = { t: 0, tick: 0 }; ev('mend'); ctx?.yell('生渡举起提灯——「渡生引导」！打断它，不然死渡会回血'); return idle({ x: D.pos.x, z: D.pos.z }); }
      return base.update(dt, p);
    },
  };
  L.brain = W;
  // 同舟：离死渡 8 米内减伤一半
  L.preDamage = (a: number) => (D.alive && Math.hypot(L.pos.x - D.pos.x, L.pos.z - D.pos.z) < TWIN.near ? a * TWIN.nearK : a);
}
function endMend(L: TUnit, D: TUnit, ok: boolean) {
  st.mend = null; st.cd = TWIN.mendCd; hideBeam();
  if (!ok) return;
  st.mends++; const v = Math.round(L.maxHp * TWIN.mendSelf); L.hp = Math.min(L.maxHp, L.hp + v); ev('mendDone');
  ctx?.toast('「渡生引导」完成：死渡被拉回了一截血，生渡也回了 10%', '#9affd8');
  const F = FX(); if (F) { F.ring({ x: D.pos.x, z: D.pos.z }, 5, '#9affd8', 0.8); F.fx('star', { x: D.pos.x, y: 3, z: D.pos.z }, { count: 30, color: 0xc8ffe8, speed: 3, up: 2, life: 0.8, size: 0.5 } as never); }
}
// ---------------------------------------------------------------- 表现：引导光束 / 同渡护壳
const add = (o: THREE.Object3D) => { const sc = st.death?.rig.root.parent; if (sc) sc.add(o); return !!sc; };
function beamAt(L: TUnit, D: TUnit) {
  if (!st.beam) {
    const g = new THREE.Group(); g.name = 'wl_twin_beam';
    const mk = (c: number, o: number, r: number) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }); m.userData.outlineParameters = { visible: false }; const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true), m); me.rotation.x = Math.PI / 2; return me; };
    const core = mk(0xffffff, 0.85, 0.06), glow = mk(0x7affd0, 0.35, 0.28), halo = mk(0x40c0a0, 0.15, 0.7);
    const pivot = new THREE.Group(); pivot.add(core, glow, halo); g.add(pivot); g.userData.pivot = pivot; g.userData.mats = [core.material, glow.material, halo.material];
    const pl = new THREE.PointLight(0x9affd8, 4, 10); g.add(pl); g.userData.pl = pl;
    if (!add(g)) return; st.beam = g;
  }
  // 起点 = 右手提灯灯芯（正式绑骨件的刚性件 Prop_FerryLanternCore，跟 RightHand 走）；静态回退件没有灯芯节点 → 右手骨 / 估算高度
  const core = lanternCore(L), h = L.rig.anim?.handle;
  let a: THREE.Vector3;
  if (core) { core.updateWorldMatrix(true, false); a = core.getWorldPosition(new THREE.Vector3()); }
  else { a = h?.worldOf('haR') ?? L.pos.clone().setY(3.4); a.y = Math.max(a.y, L.pos.y + 2.4); }
  const b = D.pos.clone(); b.y += (st.death?.rig.anim?.handle?.height ?? 4.3) * 0.6;
  const g = st.beam, piv = g.userData.pivot as THREE.Group, len = a.distanceTo(b);
  g.visible = true; g.position.copy(a).lerp(b, 0.5); g.lookAt(b); piv.scale.set(1, 1, len); st.beamGap = len;   // 圆柱已转到沿 z（lookAt 方向），长度要缩放 z（原来缩 y = 一块竖着的光板）
  const k = st.mend ? Math.min(1, st.mend.t / 0.4) : 0, fl = 0.75 + Math.sin(st.clock * 22) * 0.25;
  (g.userData.mats as THREE.MeshBasicMaterial[]).forEach((m, i) => { m.opacity = [0.85, 0.35, 0.15][i] * k * fl; });
  (g.userData.pl as THREE.PointLight).intensity = 4 * k * fl;
  const F = FX(); if (F && Math.random() < 0.6) { const u = Math.random(); F.fx('dot', { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u }, { count: 1, color: 0xc8ffe8, speed: 0.4, up: 0.3, life: 0.5, size: 0.35 } as never); }
}
const coreCache = new WeakMap<object, THREE.Object3D | null>();
function lanternCore(L: TUnit): THREE.Object3D | null {
  const r = L.rig.root; if (coreCache.has(r)) return coreCache.get(r)!;
  let f: THREE.Object3D | null = null; r.traverse(o => { if (!f && o.name === 'Prop_FerryLanternCore') f = o; });
  coreCache.set(r, f); return f;
}
function hideBeam() { if (st.beam) st.beam.visible = false; }
function shellAt(D: TUnit, on: boolean) {
  if (on && !st.shell) {
    const m = new THREE.MeshBasicMaterial({ color: 0xbfffe8, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); m.userData.outlineParameters = { visible: false };
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), m); s.name = 'wl_twin_shell'; if (!add(s)) return; st.shell = s;
  }
  if (!st.shell) return;
  st.shell.visible = on; if (!on) return;
  const H = D.rig.anim?.handle?.height ?? 4.3; st.shell.position.set(D.pos.x, D.pos.y + H * 0.5, D.pos.z); st.shell.scale.set(H * 0.42, H * 0.6, H * 0.42);
  (st.shell.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(st.clock * 3) * 0.05;
}
function clearFx() { if (st.beam) { st.beam.parent?.remove(st.beam); st.beam = null; } if (st.shell) { st.shell.parent?.remove(st.shell); st.shell = null; } }

/** 每帧（wellUpdate 调用）：inFight = 在潮渊钟井地图里 */
export function twinsTick(dt: number, inMap: boolean) {
  st.clock += dt;
  const D = st.death, L = st.life;
  if (!inMap || !D || !D.alive) { if (st.beam || st.shell) clearFx(); if (!inMap || (D && !D.alive)) { st.mend = null; } if (!inMap) { st.death = st.life = st.setup = null; st.lifeDown = false; } return; }
  if (L && L.alive && L.wbAdd && st.setup !== L) {   // 上岸（门槛核心）
    st.setup = L; st.lifeDown = false; st.broke = false; st.cd = TWIN.mendFirst; st.lock = 0; st.mend = null;
    L.hp = Math.max(1, Math.round(L.maxHp * Math.min(1, Math.max(0.2, D.hp / D.maxHp))));   // 上岸同血
    // v2「两岸分站」：生渡跳上死渡对面那一岸（中间是黑水）
    if (TWIN_BANK.x !== null) { const bx = TWIN_BANK.x + (D.pos.x < TWIN_BANK.x ? TWIN_BANK.off : -TWIN_BANK.off); L.pos.x = bx; L.pos.z = TWIN_BANK.z + (Math.random() - 0.5) * 6; }
    takeOver(L, D); ev('ashore', L.hp / L.maxHp);
    // v2「双 10% 锁血」（Rhett 11-07 20:37 确认）：生渡活着时死渡最多打到 10%；死渡在 10% 以上时生渡也最多打到 10%——两人都压到 10% 才能击倒生渡（核心），之后死渡解锁
    const nearDmg = L.preDamage, lockK = TWIN.lockK;
    D.preDamage = (a: number) => (L.alive && L.hp > L.maxHp * lockK + 1 ? Math.max(0, Math.min(a, D.hp - D.maxHp * lockK)) : a);
    L.preDamage = (a: number, s: unknown, el: string) => { const v = nearDmg ? nearDmg(a, s, el) : a; return D.alive && D.hp > D.maxHp * lockK + 1 ? Math.max(0, Math.min(v, L.hp - L.maxHp * lockK)) : v; };
    ctx?.yell('生渡撑着船篙跳上了对岸——「上船。」两岸各一个：谁先到 10% 谁就停在那里，两人都压到 10% 才打得死');
    const F = FX(); if (F) { F.fx('dot', { x: L.pos.x, y: 0.4, z: L.pos.z }, { count: 40, color: 0x9ab8c0, speed: 4, up: 5, life: 0.9, size: 0.4, gravity: 9 } as never); F.ring({ x: L.pos.x, z: L.pos.z }, 4, '#c8ffe8', 0.7); }
  }
  // 生渡倒下 → 断渡
  if (L && st.setup === L && !L.alive && !st.lifeDown) {
    st.lifeDown = true; st.mend = null; hideBeam(); hideMendWarn();
    if (!st.broke) { st.broke = true; const v = Math.round(D.maxHp * TWIN.breakK); D.hp = Math.max(1, D.hp - v); ev('break', v / D.maxHp); ctx?.yell('生渡沉进了黑水——「断渡」！死渡跟着被撕下一截生命'); const F = FX(); if (F) F.ring({ x: D.pos.x, z: D.pos.z }, 6, '#ff6080', 0.8); }
  }
  // 引导：每秒回血 + 光束
  if (L && L.alive && st.mend) {
    st.mend.t += dt; st.mend.tick += dt;
    while (st.mend.tick >= 1) { st.mend.tick -= 1; const v = Math.min(D.maxHp - D.hp, Math.round(D.maxHp * TWIN.mendTick)); if (v > 0) { D.hp += v; st.healed += v; ev('heal', v / D.maxHp); } }
    beamAt(L, D);
  } else hideBeam();
  shellAt(D, lifeAlive() && st.setup === L);
}
/** 测试 / 调试 */
export const twinsInfo = () => {
  const D = st.death, L = st.life, W = L?.brain as { casting?: { elapsed: number } | null; base?: BaseBrain } | undefined;
  return { death: D ? { hp: D.hp, max: D.maxHp, alive: D.alive, x: D.pos.x, z: D.pos.z } : null,
    life: L ? { hp: L.hp, max: L.maxHp, alive: L.alive, x: L.pos.x, z: L.pos.z, state: (W?.base as { state?: string } | undefined)?.state ?? null, casting: W?.casting ? W.casting.elapsed : null, cfg: W?.base?.cfg ? { ...W.base.cfg } : null } : null,
    setup: !!st.setup && st.setup === L, cd: st.cd, lock: st.lock, mending: !!st.mend, healed: st.healed, mends: st.mends, interrupts: st.interrupts, broke: st.broke, shell: !!st.shell?.visible, beam: !!st.beam?.visible, beamLen: st.beam?.visible ? +((st.beam.userData.pivot as THREE.Group).scale.z).toFixed(3) : 0, beamGap: st.beam?.visible ? +st.beamGap.toFixed(3) : 0, beamThin: st.beam?.visible ? (() => { const sc = (st.beam!.userData.pivot as THREE.Group).scale; return sc.x === 1 && sc.y === 1; })() : null, events: st.events.map(x => ({ ...x })) };
};
/** 测试：立刻让生渡开始引导 */
export const twinsMendNow = (delay = 0) => { st.cd = delay; st.lock = 0; };
