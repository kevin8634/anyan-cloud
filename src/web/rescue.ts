// ========== v1.2.36：副本救援 NPC 重做（异变房间「受困的冒险者」） ==========
// 解救时随机两种：
//   助战型「流亡剑士」（近战）/「猎弓手」（远程）：状态机 跟随 → 索敌（只打已进战或离你 ≤10 米的敌人）→ 走位 → 攻击动作出伤害 → 清完回到你身边；
//     离你 >16 米追回、>30 米瞬移到你身后；站在红圈里会横移出去；不会主动拉远处的怪。伤害沿用旧量级（小怪 5% 最大生命 / 首领 0.8%）。
//   光环型「守誓祭司」：跟在你身后 2.5–3 米（缓动、转身，不贴脸），停下时转向你待机；脚下光环 + 你身上 BUFF 图标：伤害 +8%、每 5 秒回复 2% 最大生命（初稿）。不参战、不可被攻击。
// 模型：比赛包有 Lux3D 人形就用；否则原有包 UBC 写实底座 + 服装染色 + 现有动作库（rig.ts 流程，不受「角色模型」设置限制）；再不行才退回经典模型。
// 防卡：每步走 clampToZone；想走却 2 秒没挪动 → 瞬移回你身后。同一时间最多 1 个随从。
import * as THREE from 'three';
import type { Ctx, Enemy } from './main';
import * as M from './models';
import * as G from './gfx';
import { makeCharacter, hdAvailable, CharAnim, AnimName } from './chars';
import { telegraphs, poisonZones } from './enemies';
import { addBuffSource } from './buffhud';
import { spawnRing } from './effects';

export type AllyKind = 'fighter' | 'archer' | 'aura';
export const ALLY_INFO: Record<AllyKind, { name: string; role: string; color: string }> = {
  fighter: { name: '流亡剑士', role: '助战：自动跟你一起战斗', color: '#7fd7ff' },
  archer: { name: '猎弓手', role: '助战：远处放箭支援', color: '#9fe870' },
  aura: { name: '守誓祭司', role: '光环：伤害 +8%，每 5 秒回复 2% 生命', color: '#ffd780' },
};
export const AURA = { dmg: 0.08, heal: 0.02, every: 5 };

export interface Ally {
  kind: AllyKind; root: THREE.Object3D; anim: CharAnim | null; model: string;
  state: 'caged' | 'follow' | 'engage' | 'return' | 'idle'; tgt: Enemy | null;
  atkCd: number; swingT: number; stuckT: number; healT: number; dodgeT: number;
  pos: THREE.Vector3; ring: THREE.Object3D | null; pring: THREE.Object3D | null;
  stats: { hits: number; dmg: number; teleports: number; dodges: number; heals: number; attacks: number; moveAnim: Record<string, number> };
  lastAnim: string;
}

let CX!: Ctx;
let cur: Ally | null = null;
const v2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** 随机类型（测试可强制） */
let forced: AllyKind | null = null;
export function rescueForce(k: AllyKind | null) { forced = k; }
export function rollAllyKind(): AllyKind { if (forced) return forced; const r = Math.random(); return r < 0.5 ? 'aura' : r < 0.78 ? 'fighter' : 'archer'; }

/** 程序化武器（挂到右手骨） */
function weapon(kind: AllyKind): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'fighter') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.02), G.toon(0xc8ccd4)); blade.position.y = 0.6;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), G.toon(0x8a6a30)); guard.position.y = 0.12;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), G.toon(0x3a2a1a));
    g.add(blade, guard, grip);
  } else if (kind === 'archer') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 5, 16, Math.PI * 0.9), G.toon(0x6a4a2a)); bow.rotation.z = Math.PI / 2 + Math.PI * 0.05;
    g.add(bow);
  } else {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.7, 6), G.toon(0xd8c8a0)); staff.position.y = 0.35;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), G.glow(0xffe0a0, 1.6)); orb.position.y = 1.25;
    g.add(staff, orb);
  }
  return g;
}
function attachHand(root: THREE.Object3D, w: THREE.Object3D) {
  let hand: THREE.Object3D | null = null;
  root.traverse(o => { if (!hand && (o as THREE.Bone).isBone && /^(hand_r|hand\.r|righthand|mixamorig:?righthand|handslotr|hand_R)$/i.test(o.name)) hand = o; });
  if (!hand) root.traverse(o => { if (!hand && (o as THREE.Bone).isBone && /hand.*r(ight)?$|r(ight)?.*hand/i.test(o.name)) hand = o; });
  const h = hand as THREE.Object3D | null;
  if (!h) { w.position.set(0.45, 1.0, 0.15); root.add(w); return; }
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3(); h.getWorldScale(s);
  w.scale.setScalar(1 / Math.max(1e-3, s.x) * (root.scale.x || 1));
  h.add(w);
}

/** 模型：Lux3D（比赛包）→ UBC 写实（原有包）→ 经典 */
export function makeAllyModel(kind: AllyKind): { root: THREE.Object3D; anim: CharAnim | null; model: string } {
  const female = kind === 'aura';
  const clipSet = kind === 'aura' ? 'mage' : 'warrior';
  const luxM = female ? 'LUX_Mage' : kind === 'archer' ? 'LUX_Hunter' : 'LUX_Warrior';
  let c = hdAvailable(luxM) ? makeCharacter({ model: luxM, tex: '', show: [], mats: 'lux', clipSet, height: 2.0, tint: kind === 'aura' ? 0xfff0c0 : 0x80a0c0, tintAmount: 0.08, forceHd: true }) : null;
  let model = c ? luxM : '';
  if (!c && !female && hdAvailable('UBC_Male')) {
    c = makeCharacter({ model: 'UBC_Male', tex: '', show: [], mats: 'warrior_ubc', clipSet, parts: ['Outfit_Male_Ranger'], hideBase: ['Male_Ranger_Head_Hood'], height: 2.0, tint: kind === 'archer' ? 0x4a6a30 : 0x5a6a80, tintAmount: 0.55, forceHd: true });
    if (c) model = 'UBC_Male';
  }
  if (!c && female && hdAvailable('UBC_Female')) {
    c = makeCharacter({ model: 'UBC_Female', tex: '', show: [], mats: 'mage_ubc', clipSet, height: 1.95, forceHd: true });
    if (c) { M.ubcRobe(c, new THREE.Color(0xe8e0c8), 0xd8a840, false); model = 'UBC_Female'; }
  }
  if (c) { c.root.userData.ally = kind; if (model.startsWith('UBC') || model.startsWith('LUX')) attachHand(c.root, weapon(kind)); return { root: c.root, anim: c.anim, model }; }
  const r = M.makeNpcModel(female ? 'Mage' : kind === 'archer' ? 'Rogue_Hooded' : 'Knight', female ? 0xe8d8a0 : 0x8a8a70, 0.3);
  return { root: r.root, anim: r.anim ?? null, model: 'classic' };
}

/** 笼子里的冒险者（异变房间生成时） */
export function makeCaptive(kind: AllyKind): { obj: THREE.Group; ally: Ally } {
  const obj = new THREE.Group();
  const m = makeAllyModel(kind);
  obj.add(m.root);
  for (let i = 0; i < 8; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), G.toon(0x3a3a40)); const a = i / 8 * Math.PI * 2; bar.position.set(Math.cos(a) * 0.8, 1.2, Math.sin(a) * 0.8); bar.name = 'bar'; obj.add(bar); }
  obj.add(nameplate(ALLY_INFO[kind].name, ALLY_INFO[kind].role, ALLY_INFO[kind].color));
  m.anim?.loop('idle');
  const ally: Ally = { kind, root: m.root, anim: m.anim, model: m.model, state: 'caged', tgt: null, atkCd: 1, swingT: -1, stuckT: 0, healT: AURA.every, dodgeT: 0,
    pos: new THREE.Vector3(), ring: null, pring: null, lastAnim: 'idle',
    stats: { hits: 0, dmg: 0, teleports: 0, dodges: 0, heals: 0, attacks: 0, moveAnim: {} } };
  return { obj, ally };
}

function nameplate(name: string, role: string, color: string): THREE.Object3D {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,8,4,.72)'; g.beginPath(); g.roundRect?.(8, 8, 496, 112, 18); g.fill();
    g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.fillStyle = color; g.fillText(name, 256, 58);
    g.font = '28px sans-serif'; g.fillStyle = '#e8e0d0'; g.fillText(role, 256, 100);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  sp.scale.set(2.6, 0.65, 1); sp.position.set(0, 3.0, 0); sp.name = 'plate'; sp.renderOrder = 10;
  return sp;
}

/** 进本时写实模型还在解析（ensureHd 是异步的）：解析完把经典模型换成写实（笼中 / 跟随中都可以） */
export function rescueUpgrade(a: Ally) {
  if (a.model !== 'classic') return false;
  const want = a.kind === 'aura' ? ['LUX_Mage', 'UBC_Female'] : [a.kind === 'archer' ? 'LUX_Hunter' : 'LUX_Warrior', 'UBC_Male'];
  if (!want.some(hdAvailable)) return false;   // 还没解析完（或加载失败）：不要每帧重建经典模型
  const m = makeAllyModel(a.kind);
  if (m.model === 'classic') return false;
  const parent = a.root.parent, old = a.root;
  m.root.position.copy(old.position); m.root.rotation.copy(old.rotation);
  parent?.remove(old); parent?.add(m.root);
  a.root = m.root; a.anim = m.anim; a.model = m.model; a.lastAnim = '';
  m.anim?.loop('idle');
  return true;
}

/** 解救：从笼子里放出来开始跟随 */
export function rescueStart(a: Ally, cage: THREE.Object3D) {
  if (cur) rescueClear();
  cage.children.filter(o => o.name === 'bar' || o.name === 'plate').forEach(o => cage.remove(o));
  const wp = new THREE.Vector3(); a.root.getWorldPosition(wp);
  cage.remove(a.root); CX.scene.add(a.root); a.root.position.copy(wp); a.pos.copy(wp);
  a.state = 'follow';
  if (a.kind === 'aura') {
    a.ring = M.noOutline(M.makeDisc('#ffd780', 0.35, 1.3)); a.ring.position.set(wp.x, G.gy(wp.x, wp.z) + 0.05, wp.z); CX.scene.add(a.ring);
    a.pring = M.noOutline(M.makeDisc('#ffe8a0', 0.18, 1.0)); CX.scene.add(a.pring);
  }
  cur = a;
  a.anim?.play('cheer', 1.2);
}
export function rescueClear() {
  if (!cur) return;
  CX.scene.remove(cur.root); if (cur.ring) CX.scene.remove(cur.ring); if (cur.pring) CX.scene.remove(cur.pring);
  cur = null;
}
export const rescueAlly = () => cur;

function behind(dist: number, side: number) {
  const P = CX.player, ry = P.rig?.root.rotation.y ?? 0;
  const fx = Math.sin(ry), fz = Math.cos(ry);
  return new THREE.Vector3(P.pos.x - fx * dist + fz * side, 0, P.pos.z - fz * dist - fx * side);
}
function teleportBehind(a: Ally) {
  const t = behind(2.2, 0.8);
  const prev = { x: CX.player.pos.x, z: CX.player.pos.z };
  CX.clampToZone(t, prev);
  a.pos.copy(t); a.stats.teleports++; a.stuckT = 0;
  spawnRing(t, 1.2, ALLY_INFO[a.kind].color, 0.4);
}
function setAnim(a: Ally, name: AnimName, ts = 1) { a.anim?.loop(name, ts); a.lastAnim = name; a.stats.moveAnim[name] = (a.stats.moveAnim[name] ?? 0) + 1; }

/** 走一步（带夹边）；返回实际位移 */
function stepTo(a: Ally, to: { x: number; z: number }, speed: number, dt: number, stopAt = 0) {
  const dx = to.x - a.pos.x, dz = to.z - a.pos.z, d = Math.hypot(dx, dz);
  if (d <= stopAt + 0.02) return 0;
  const k = Math.min(d - stopAt, speed * dt) / d;
  const prev = { x: a.pos.x, z: a.pos.z };
  a.pos.x += dx * k; a.pos.z += dz * k;
  CX.clampToZone(a.pos, prev);
  return v2(a.pos, prev);
}
function face(a: Ally, x: number, z: number, dt: number) {
  const want = Math.atan2(x - a.pos.x, z - a.pos.z);
  let d = want - a.root.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  a.root.rotation.y += d * Math.min(1, dt * 8);
}
/** 站在红圈 / 毒圈里？返回往外的方向 */
function dangerOut(a: Ally): { x: number; z: number } | null {
  for (const t of telegraphs.values()) { const p = t.disc.position, d = v2(a.pos, p); if (d < t.r + 0.4) { const k = d || 1; return { x: (a.pos.x - p.x) / k || 1, z: (a.pos.z - p.z) / k }; } }
  for (const z of poisonZones.values()) { const d = v2(a.pos, z.p); if (d < z.r + 0.3) { const k = d || 1; return { x: (a.pos.x - z.p.x) / k || 1, z: (a.pos.z - z.p.z) / k }; } }
  return null;
}
function pickTarget(a: Ally, zone: string): Enemy | null {
  const P = CX.player;
  let best: Enemy | null = null, bd = 1e9;
  for (const e of CX.enemies) {
    if (!e.alive || e.z !== zone || !CX.isActive(e) || e.kind === 'dgx_goblin' || e.isDummy) continue;
    const engaged = e.intent?.state === 'chase' || e.intent?.state === 'attack' || e.hp < e.maxHp;
    const dp = v2(e.pos, P.pos);
    if (!(engaged && dp < 18) && dp > 10) continue;   // 只打已进战或离你 ≤10 米的敌人，不主动拉远处的怪
    const d = v2(e.pos, a.pos) + dp * 0.5;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** 每帧（dungeonplus.dgxUpdate 调用） */
export function rescueUpdate(dt: number, zone: string) {
  const a = cur; if (!a) return;
  const P = CX.player;
  if (a.model === 'classic') rescueUpgrade(a);
  a.anim?.mixer.update(dt);
  const dP = v2(a.pos, P.pos);
  let moved = 0, want = false;
  if (dP > 30) { teleportBehind(a); }
  if (a.kind === 'aura') {
    // ---- 光环型：身后 2.5–3 米 ----
    const slot = behind(2.75, 0.35);
    const ds = v2(a.pos, slot), pm = (P as unknown as { moving?: boolean }).moving;
    const out = dangerOut(a);
    if (out) { moved = stepTo(a, { x: a.pos.x + out.x * 2, z: a.pos.z + out.z * 2 }, 6, dt); want = true; a.stats.dodges += dt; }
    else if (ds > 0.35 || dP > 3.1) {
      const sp = Math.min(7.5, 1.5 + ds * 2.2);
      if (dP > 2.3 || ds > 1.2) { moved = stepTo(a, slot, sp, dt); want = true; }
    } else if (dP < 2.2) moved = stepTo(a, { x: a.pos.x + (a.pos.x - P.pos.x), z: a.pos.z + (a.pos.z - P.pos.z) }, 1.5, dt);   // 太近：退半步，不贴脸
    void pm;
    const spd = moved / Math.max(dt, 1e-3);
    if (spd > 3.6) setAnim(a, 'run', Math.min(1.3, spd / 5.5)); else if (spd > 0.25) setAnim(a, 'walk', Math.max(0.6, spd / 2)); else setAnim(a, 'idle');
    if (spd > 0.25) face(a, a.pos.x + (slot.x - a.pos.x), a.pos.z + (slot.z - a.pos.z), dt); else face(a, P.pos.x, P.pos.z, dt);
    a.state = spd > 0.25 ? 'follow' : 'idle';
    a.healT -= dt;
    if (a.healT <= 0) { a.healT = AURA.every; if (P.alive && P.hp < P.maxHp) { CX.fx.heal(P, P.maxHp * AURA.heal); a.stats.heals++; spawnRing(P.getPos(), 1.4, '#ffe8a0', 0.5); } a.anim?.play('cast', 1.4); }
  } else {
    // ---- 助战型：状态机 ----
    const ranged = a.kind === 'archer', range = ranged ? 9 : 1.9;
    if (a.tgt && (!a.tgt.alive || a.tgt.z !== zone)) a.tgt = null;
    if (dP > 16) { a.state = 'return'; a.tgt = null; }
    else if (a.state === 'return' && dP < 4) a.state = 'follow';
    if (a.state !== 'return') {
      if (!a.tgt || (a.atkCd <= 0 && a.swingT < 0)) a.tgt = pickTarget(a, zone);
      a.state = a.tgt ? 'engage' : 'follow';
    }
    a.atkCd -= dt;
    const out = dangerOut(a);
    if (out) { moved = stepTo(a, { x: a.pos.x - out.z * 2 + out.x, z: a.pos.z + out.x * 2 + out.z }, 6.5, dt); want = true; a.stats.dodges += dt; }   // 红圈：横移出去
    else if (a.state === 'return') { moved = stepTo(a, behind(2, 1), 8, dt, 0.5); want = true; }
    else if (a.state === 'engage' && a.tgt) {
      const t = a.tgt, d = v2(a.pos, t.pos), reach = range + (t.isBoss ? 1.4 : 0.4);
      if (d > reach) { moved = stepTo(a, t.pos, 6.5, dt, reach - 0.3); want = true; }
      else if (ranged && d < 3.5) { moved = stepTo(a, { x: a.pos.x + (a.pos.x - t.pos.x), z: a.pos.z + (a.pos.z - t.pos.z) }, 4, dt); }   // 弓手拉开距离
      face(a, t.pos.x, t.pos.z, dt);
      if (d <= reach + 0.2 && a.atkCd <= 0 && a.swingT < 0) {
        a.atkCd = ranged ? 1.8 : 1.5; a.swingT = ranged ? 0.35 : 0.28; a.stats.attacks++;
        a.anim?.play(ranged ? 'shoot' : (['attack1', 'attack2', 'attack3'] as AnimName[])[a.stats.attacks % 3], ranged ? 1.4 : 1.5);
      }
    } else {
      const slot = behind(2.2, 1.4), ds = v2(a.pos, slot);
      if (ds > 0.5 && dP > 2.0) { moved = stepTo(a, slot, Math.min(7.5, 2 + ds * 2), dt, 0.3); want = true; }
    }
    if (a.swingT >= 0) {
      a.swingT -= dt;
      if (a.swingT < 0 && a.tgt?.alive) {   // 出手瞬间结算
        const t = a.tgt, amt = Math.round(t.maxHp * (t.isBoss ? 0.008 : 0.05));
        CX.fx.dealDamage(t, amt, 'physical', P); a.stats.hits++; a.stats.dmg += amt;
        const tp = t.getPos();
        if (ranged) { const from = { x: a.pos.x, y: 1.4, z: a.pos.z }; CX.particles.emit(from, { count: 6, color: 0xd0f0a0, speed: 1, life: 0.2, size: 0.2 }); }
        CX.particles.emit({ x: tp.x, y: 1.2, z: tp.z }, { count: 12, color: 0xffffff, color2: ranged ? 0x9fe870 : 0x7fd7ff, speed: 4, up: 1, life: 0.3, size: 0.25 });
        t.brain?.provoke?.();
      }
    }
    const spd = moved / Math.max(dt, 1e-3);
    if (a.swingT < 0) { if (spd > 3.6) setAnim(a, 'run', Math.min(1.3, spd / 5.5)); else if (spd > 0.25) setAnim(a, 'walk', Math.max(0.6, spd / 2)); else setAnim(a, 'idle'); }
    if (spd > 0.25 && !(a.state === 'engage' && a.tgt)) face(a, a.pos.x + (a.pos.x - (a.root.position.x)) * 10 + 1e-3, a.pos.z + (a.pos.z - a.root.position.z) * 10, dt);
    else if (a.state !== 'engage' && spd <= 0.25) face(a, P.pos.x, P.pos.z, dt);
  }
  // 防卡：想走却 2 秒几乎没挪动 → 瞬移
  if (want && moved < 0.01) { a.stuckT += dt; if (a.stuckT > 2) teleportBehind(a); } else a.stuckT = 0;
  a.root.position.set(a.pos.x, G.gy(a.pos.x, a.pos.z), a.pos.z);
  if (a.ring) a.ring.position.set(a.pos.x, a.root.position.y + 0.05, a.pos.z);
  if (a.pring) { const near = dP < 9; a.pring.visible = near; a.pring.position.set(P.pos.x, G.gy(P.pos.x, P.pos.z) + 0.04, P.pos.z); }
}

/** 光环：你造成的伤害 +8%（离祭司 9 米内） */
export function auraOn() { return !!cur && cur.kind === 'aura' && !!CX?.player && v2(cur.pos, CX.player.pos) < 9; }

export function bindRescue(ctx: Ctx) {
  CX = ctx;
  const pre = CX.fx.preDeal;
  CX.fx.preDeal = (t, amt, el, src, crit, tick) => { const v = pre ? pre(t, amt, el, src, crit, tick) : amt; return src === CX.player && t !== CX.player && auraOn() ? v * (1 + AURA.dmg) : v; };
  addBuffSource((unit, who) => who === 'player' && unit === CX.player && auraOn()
    ? [{ id: 'ally_aura', glyph: '✚', name: '守誓光环', desc: `守誓祭司：伤害 +${Math.round(AURA.dmg * 100)}%，每 ${AURA.every} 秒回复 ${Math.round(AURA.heal * 100)}% 最大生命`, debuff: false, color: '#ffd780' }] : []);
}

export function rescueDebug() {
  const a = cur; if (!a) return null;
  return { kind: a.kind, model: a.model, state: a.state, anim: a.lastAnim, dist: Math.round(v2(a.pos, CX.player.pos) * 100) / 100, tgt: a.tgt ? a.tgt.kind : null, aura: auraOn(), stats: { ...a.stats, moveAnim: { ...a.stats.moveAnim } }, pos: { x: a.pos.x, z: a.pos.z } };
}
