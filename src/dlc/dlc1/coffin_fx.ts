// ======================================================================
// DLC1「负棺人」专属施法表现（v1.0.8）→ ClassExt.fx
// 之前负棺人走本体默认表现（战士的旋风斩 / 雷霆一击 / 天神下凡金光柱 / 飞斧）。现在主角是那口铁棺：
//   棺击 = 紫色重砸 + 骨尘；拖棺冲锋 = 身后拖着铁棺擦出火星；链棺横扫 = 铁棺挂在链上绕身甩一圈；
//   落棺 / 百棺齐落 = 铁棺从天而降；丧钟 = 一圈圈暗紫钟波；万冢 = 墓碑从地里升起；锁魂链 = 一条链甩出去；
//   送葬行列 = 一排兜帽亡者走过；安魂葬礼 = 巨棺立起、棺盖打开、亡魂盘旋升空；开棺 = 棺盖炸开，按魂的种类放出不同颜色的魂。
// 颜色：锈铁 / 骨白 / 魂紫 / 墓绿。只画表现，命中 / 伤害仍由本体结算。
// ======================================================================
import * as THREE from 'three';
import type { ClassFx, ClassFxApi, ClassFxKind } from '../../core/ClassExt';
import type { ResolvedSkill } from '../../core/types';
import { makeCoffin } from './coffin_model';
import { COMBO_BY_KEY, SOUL_COLOR, Soul } from './coffin_skills';
import { ghostMat, chain, tombstone, wisp, hooded, knife, fade, dropOnto, riseFromGround, pulses, hex, rot, noOl, P2 } from './fx_kit';
import { glow } from '../../web/gfx';
import { coffinLand } from './sfx_kit';
import { echoGhost, echoWisp, echoMat } from './tomb_fx';

// ---------------------------------------------------------------- 11-04 立棺墓碑 墓碑回响（特效文档 §3.1）
// 从棺中探出一具灰青亡者（负棺人轮廓、无脸），70% 亮度、去饱和、无白闪地复刻同一个技能动作；去掉几何圈；粒子为原技能约一半
const GHOST_C = 0x7e9294, GHOST_D = 0x3e4a4c;
function echoDust(F: ClassFxApi, p: P2, r: number, n = 8) {
  F.fx('smoke', { x: p.x, y: 0.25, z: p.z }, { count: n, color: GHOST_C, color2: 0x5e6a6c, colorEnd: 0x1a2022, radius: r * 0.4, ring: true, speed: r * 0.8, up: 0.25, life: 0.8, size: 0.9, sizeEnd: 1.8, drag: 2.2 });
  F.fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: Math.ceil(n / 2), color: 0x8a8f8c, color2: 0x5a605e, radius: r * 0.4, speed: 2.4, up: 1.6, life: 0.7, size: 0.2, sizeEnd: 0.14, gravity: 14, spin: 3 });
}
function echoCast(kind: ClassFxKind, s: ResolvedSkill, at: P2, dir: P2 | null, F: ClassFxApi): boolean {
  const tomb = F.me();   // fireFrom 期间玩家坐标临时挪到墓碑处
  const tx = at.x - tomb.x, tz = at.z - tomb.z, tl = Math.hypot(tx, tz);
  const d = tl > 0.3 ? { x: tx / tl, z: tz / tl } : (dir ?? { x: 0, z: 1 });
  const r = s.stats.radius || 2.5, y0 = F.gy(tomb.x, tomb.z), face = Math.atan2(d.x, d.z);
  const st = { x: tomb.x + d.x * 0.7, z: tomb.z + d.z * 0.7 };
  const g = echoGhost(1), arm = g.getObjectByName('echo_arm');
  const spin = kind === 'spin' || kind === 'nova' || kind === 'slam' && !s.tags.includes('targeted');
  F.live(g, 0.75, k => {
    const rise = Math.min(1, k / 0.18);                       // 从棺中探出
    const lunge = k < 0.18 ? 0 : k < 0.45 ? (k - 0.18) / 0.27 : 1;
    g.position.set(st.x + d.x * lunge * 0.6, y0 - 1.2 * (1 - rise) + 0.05, st.z + d.z * lunge * 0.6);
    g.rotation.y = spin ? face + lunge * Math.PI * 2 : face;
    g.rotation.x = 0.25 * Math.sin(lunge * Math.PI);
    if (arm) arm.rotation.x = -2.2 + lunge * 2.6;
    fade(g, k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
  });
  // 落点：远处的目标处 = 灰青棺影砸下；自身范围 = 棺影绕碑一圈；直线 = 一串灰烟
  if (kind === 'line' || kind === 'cone') {
    const len = Math.min(s.stats.range || 10, 14);
    for (let dd = 1.5; dd < len; dd += 2.5) { const p = { x: tomb.x + d.x * dd, z: tomb.z + d.z * dd }; F.fx('smoke', { x: p.x, y: 0.4, z: p.z }, { count: 3, color: GHOST_C, colorEnd: 0x1a2022, radius: 0.4, speed: 0.4, up: 0.6, life: 0.7, size: 0.8, sizeEnd: 1.5 }); }
  } else if (spin) {
    const cf = noOl(makeCoffin(GHOST_C, 0, 0.9)); cf.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = echoMat(0.4); });
    let a = face;
    F.live(cf, 0.5, (k, dt) => { a -= dt * 12; const rr = r * 0.8; cf.position.set(tomb.x + Math.sin(a) * rr, y0 + 1, tomb.z + Math.cos(a) * rr); cf.rotation.set(0, a + Math.PI / 2, Math.PI / 2); fade(cf, 1 - k * k); });
    echoDust(F, tomb, r, 7);
  } else if (kind !== 'projectile') {
    const cf = noOl(makeCoffin(GHOST_C, 0, 1.1)); cf.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = echoMat(0.45); }); cf.rotation.set(-Math.PI / 2 + 0.25, face, 0);
    dropOnto(F, cf, at, 4, 0.22, () => { echoDust(F, at, Math.max(1.5, r), 8); }, 0.4);
  }
  return true;
}


const VIO = 0x9a70ff, VIO_CSS = '#9a70ff', BONE = 0xd8d0c0, BONE_CSS = '#d8d0c0', GRAVE = 0x7fe0b0, GRAVE_CSS = '#7fe0b0';
const LETTER: Record<string, Soul> = { B: 'beast', H: 'man', G: 'giant', A: 'eldritch' };
const id = (s: ResolvedSkill) => s.baseId;
/** 开棺组合：技能 id cf_open_<魂字母> → 颜色 + 魂 */
export function openInfo(s: ResolvedSkill): { color: number; souls: Soul[] } | null {
  const b = id(s); if (!b.startsWith('cf_open_')) return null;
  const key = b.slice(8), c = COMBO_BY_KEY[key];
  const souls = (c ? key : key.replace(/^p\d/, '')).split('').map(ch => LETTER[ch]).filter(Boolean);
  return { color: c ? hex(c.color) : BONE, souls: souls.length ? souls : ['man'] };
}
const colorOf = (s: ResolvedSkill) => openInfo(s)?.color ?? (s.element === 'shadow' ? VIO : BONE);
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

function boneDust(F: ClassFxApi, p: P2, r: number, c: number, n = 14) {
  F.fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: n, color: 0x5a5048, color2: 0x4a4440, colorEnd: 0x1a1820, radius: r * 0.4, ring: true, speed: r * 1.1, up: 0.25, life: 0.9, size: 1, sizeEnd: 2, drag: 2.2 });
  F.fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: n, color: BONE, color2: 0x8a8070, radius: r * 0.5, speed: 3, up: 2.2, life: 0.9, size: 0.26, sizeEnd: 0.18, gravity: 14, spin: 3 });
  F.fx('spark', { x: p.x, y: 0.5, z: p.z }, { count: n * 2, color: 0xffffff, color2: c, colorEnd: VIO, radius: 0.4, ring: true, speed: r * 2.4, up: 0.6, life: 0.35, size: 0.3, sizeEnd: 0.05, drag: 2 });
}
/** 魂从 p 升起（一缕缕） */
function soulsRise(F: ClassFxApi, p: P2, souls: Soul[], r: number, h = 4) {
  souls.forEach((so, i) => {
    const w = wisp(SOUL_COLOR[so], 1.3); let a = i / souls.length * Math.PI * 2;
    F.live(w, 1.1, (k, dt) => { a += dt * 4; const rr = r * (0.2 + k * 0.6); w.position.set(p.x + Math.cos(a) * rr, F.gy(p.x, p.z) + 0.8 + k * h, p.z + Math.sin(a) * rr); w.rotation.set(-1.2, -a, 0); fade(w, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3); });
  });
}
/** 铁棺从天而降砸到 at */
function coffinDrop(F: ClassFxApi, at: P2, r: number, scale = 1.4, h = 9, dur = 0.32, c = VIO) {
  const cf = noOl(makeCoffin(c, 1, scale)); cf.rotation.set(-Math.PI / 2 + 0.25, Math.random() * 6.28, 0);
  dropOnto(F, cf, at, h, dur, () => { F.ring(at, r, css(c), 0.5); F.ring(at, r * 0.5, BONE_CSS, 0.35); F.scorch(at, r * 0.9, 0x1a1020, 2.4); boneDust(F, at, r, c); F.feel('heavy', 0.8); if (F.synth.gate('cf_land', 0.07)) coffinLand(F.synth); });   // v1.0.9 铁棺落地声
}
/** 棺链从 a 甩到 b（0.25 秒伸出，再收回淡出） */
function chainShot(F: ClassFxApi, a: P2, b: P2, mat?: THREE.Material, y = 1.1) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), g = chain(len, 1.3, mat ?? glow(0xb0a8c8, 1.2)), wrap = new THREE.Group(); wrap.add(g);
  wrap.position.set(a.x, F.gy(a.x, a.z) + y, a.z); wrap.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  const n = g.children.length;
  F.live(noOl(wrap), 0.55, k => { const show = Math.min(1, k / 0.35); g.children.forEach((c, i) => { c.visible = i / n <= show; }); if (k > 0.6) wrap.scale.set(1, 1, 1 - (k - 0.6) / 0.4); });
  F.fx('spark', { x: b.x, y, z: b.z }, { count: 12, color: 0xffffff, color2: VIO, speed: 4, up: 0.6, life: 0.3, size: 0.3, sizeEnd: 0.05, drag: 3 });
}

const cast: NonNullable<ClassFx['cast']> = (kind: ClassFxKind, s, at, dir, F) => {
  if (s.tags.includes('echo')) return echoCast(kind, s, at, dir, F);   // 11-04 立棺墓碑 墓碑回响 = 灰青亡者重放
  const c = colorOf(s), r = s.stats.radius || 2.5, me = F.me(), d = dir ?? { x: Math.sin(F.facing()), z: Math.cos(F.facing()) };
  const op = openInfo(s);
  switch (kind) {
    case 'melee': {
      if (s.tags.includes('ranged')) { chainShot(F, me, at); return true; }   // 缚棺链
      // 棺击：铁棺正面砸下（短暂出现的半透明棺影）+ 紫色冲击 + 骨尘
      const ghost = noOl(makeCoffin(VIO, 0, 0.9)); ghost.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = ghostMat(VIO, 1.2, 0.45); });
      const hp = { x: me.x + d.x * 1.3, z: me.z + d.z * 1.3 };
      ghost.position.set(hp.x, F.gy(hp.x, hp.z) + 1.6, hp.z); ghost.rotation.y = Math.atan2(d.x, d.z);
      F.live(ghost, 0.28, k => { ghost.rotation.x = -k * 1.4; ghost.position.y = F.gy(hp.x, hp.z) + 1.6 - k * 0.9; fade(ghost, 1 - k); });
      F.fx('star', { x: hp.x, y: 0.6, z: hp.z }, { count: 1, color: 0xffffff, color2: VIO, speed: 0, up: 0, life: 0.16, size: 1.8, sizeEnd: 0.3 });
      F.fx('shard', { x: hp.x, y: 0.3, z: hp.z }, { count: 6, color: BONE, color2: 0x8a8070, speed: 3, up: 1.6, life: 0.6, size: 0.22, sizeEnd: 0.15, gravity: 14, spin: 3 });
      return true;
    }
    case 'dash': {
      // 拖棺冲锋：身后拖着一口铁棺；棺跃：棺跟着划一道弧
      const cf = noOl(makeCoffin(VIO, 0, 1.1)), leap = s.tags.includes('leap');
      F.live(cf, leap ? 0.36 : 0.24, () => { const p = F.me(); cf.position.set(p.x - d.x * 1.6, (leap ? p.y : F.gy(p.x, p.z)) + 0.35, p.z - d.z * 1.6); cf.rotation.set(-Math.PI / 2 + 0.15, Math.atan2(d.x, d.z), 0); });
      return true;
    }
    case 'dashHit': {
      if (s.tags.includes('leap')) { coffinDrop(F, at, 3, 1.3, 2.5, 0.12); }
      else { F.ring(at, 2, VIO_CSS, 0.35); boneDust(F, at, 2, VIO, 10); }
      F.fx('star', { x: at.x, y: 1, z: at.z }, { count: 1, color: 0xffffff, color2: VIO, speed: 0, up: 0, life: 0.2, size: 2.4, sizeEnd: 0.4 });
      return true;
    }
    case 'spin': case 'ultimate': {
      if (kind === 'ultimate' && op) return openCoffin(F, s, at, op, r, d);
      if (kind === 'ultimate' && id(s) === 'cf_ferry') {
        // 冥河引魂（原冥河摆渡）：脚下一圈墓绿色的冥河，兜帽摆渡人和亡魂绕行
        F.sigil(at, r, GRAVE, 1.6); pulses(F, at, r, GRAVE_CSS, 3, 0.18);
        for (let i = 0; i < 6; i++) { const w = i % 3 === 0 ? hooded(GRAVE, 1.1) : wisp(GRAVE, 1.1); let a = i / 6 * Math.PI * 2; F.live(w, 1.4, (k, dt) => { a -= dt * 3; const p = F.me(); w.position.set(p.x + Math.cos(a) * r * 0.75, F.gy(p.x, p.z) + (i % 3 === 0 ? 0 : 0.8), p.z + Math.sin(a) * r * 0.75); w.rotation.y = -a + Math.PI; fade(w, k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); }); }
        F.fx('smoke', { x: at.x, y: 0.2, z: at.z }, { count: 24, color: 0x2a5a4a, color2: 0x1a3a30, colorEnd: 0x0a1410, radius: r * 0.8, ring: true, speed: 0.5, swirl: -3, up: 0.2, life: 1.4, size: 1.2, sizeEnd: 2.4 });
        return true;
      }
      if (kind === 'ultimate') {
        // 安魂葬礼：身后立起一口巨棺，棺盖打开，亡魂盘旋升空
        const big = noOl(makeCoffin(VIO, 2, 2.4)), behind = { x: me.x - d.x * 1.8, z: me.z - d.z * 1.8 };
        big.rotation.y = Math.atan2(d.x, d.z);
        const lid = big.getObjectByName('coffin_lid');
        F.live(big, 1.6, k => { const y0 = F.gy(behind.x, behind.z); big.position.set(behind.x, y0 - 2 + Math.min(1, k / 0.25) * 3.9, behind.z); if (lid) lid.rotation.y = -Math.min(1, Math.max(0, (k - 0.25) / 0.2)) * 1.9; if (k > 0.8) big.position.y -= (k - 0.8) / 0.2 * 4; });
        soulsRise(F, behind, ['man', 'eldritch', 'man', 'beast', 'eldritch', 'giant'], 2.5, 6);
        F.sigil(at, r, VIO, 1.4); pulses(F, at, r, VIO_CSS, 3, 0.16);
        F.fx('streak', { x: behind.x, y: 1, z: behind.z }, { count: 22, color: 0xffffff, color2: VIO, radius: 1, speed: 0.3, up: 9, drag: 1, life: 0.8, size: 0.7, sizeEnd: 0.1 });
        return true;
      }
      // 链棺横扫：铁棺挂在棺链上绕身一圈
      const cf = noOl(makeCoffin(VIO, 0, 1)), links = chain(r * 0.8, 1.1), arm = new THREE.Group(); arm.add(links); let a = F.facing();
      F.live(cf, 0.5, (k, dt) => { a -= dt * 13; const p = F.me(), rr = r * 0.82; cf.position.set(p.x + Math.sin(a) * rr, F.gy(p.x, p.z) + 1, p.z + Math.cos(a) * rr); cf.rotation.set(0, a + Math.PI / 2, Math.PI / 2); arm.position.set(p.x, F.gy(p.x, p.z) + 1, p.z); arm.rotation.y = a; });
      F.live(noOl(arm), 0.5, () => { /* 跟随在上面一起更新 */ });
      F.whirl(r, 0x8a60ff, 0.5);
      boneDust(F, at, r, c, 10);
      return true;
    }
    case 'slam': case 'nova': {
      // v1.2.84 修：背棺态普攻（链甩，形状改成圆形）原来落到默认「天降铁棺」，每一下都砸棺；改走链棺横扫（棺挂链上绕身一圈）
      if (s.tags.includes('back') && s.tags.includes('f_melee')) return cast('spin', s, at, dir, F);
      if (s.tags.includes('shout')) {
        // 丧钟：暗紫钟波一圈圈荡开
        pulses(F, at, r, VIO_CSS, 4, 0.12); F.sigil(at, r * 0.8, VIO, 0.9);
        F.fx('rune', { x: at.x, y: 1.8, z: at.z }, { count: 10, color: VIO, color2: 0xffffff, radius: 0.6, ring: true, speed: r * 1.2, up: -0.2, life: 0.7, size: 0.5, sizeEnd: 0.1 });
        return true;
      }
      if (id(s) === 'cf_shroud') {
        // 裹尸布：骨白的布幔绕身卷起
        F.fx('smoke', { x: at.x, y: 0.6, z: at.z }, { count: 26, color: 0xe8e0d0, color2: 0xb8b0a0, colorEnd: 0x6a6460, radius: r * 0.6, ring: true, speed: 0.4, swirl: 6, up: 1.2, life: 1, size: 1, sizeEnd: 1.8 });
        F.ring(at, r, BONE_CSS, 0.5);
        return true;
      }
      if (op) return openCoffin(F, s, at, op, r, d);
      coffinDrop(F, at, r, 1.4, 6, 0.22);
      return true;
    }
    case 'targeted': {
      if (op) return openCoffin(F, s, at, op, r, d);
      if (id(s) === 'cf_drop') { coffinDrop(F, at, r, 1.6, 10, 0.3); return true; }
      if (id(s) === 'cf_hundred') {
        // 百棺齐落：一阵铁棺雨
        coffinDrop(F, at, r * 0.6, 2, 12, 0.36);
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + Math.random() * 0.4, rr = r * (0.45 + Math.random() * 0.45); const p = { x: at.x + Math.cos(a) * rr, z: at.z + Math.sin(a) * rr }; const g = new THREE.Group(); let go = false; F.live(g, 0.05 + i * 0.06, k => { if (k >= 1 && !go) { go = true; coffinDrop(F, p, 2, 1, 10, 0.3); } }); }
        return true;
      }
      // 万冢 / 腐冢永夜：墓碑一圈圈从地里升起，紫雾、魂火
      const n = s.slot === 'skill4' || s.slot === 'ultimate' ? 8 : 6;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = r * (i % 2 ? 0.55 : 0.85); const t = tombstone(1.1 + (i % 3) * 0.15); t.rotation.y = -a + Math.PI / 2 + (Math.random() - 0.5) * 0.5; riseFromGround(F, t, { x: at.x + Math.cos(a) * rr, z: at.z + Math.sin(a) * rr }, 1.3, 1.6 + i * 0.05); }
      F.sigil(at, r, VIO, 1.8);
      F.fx('smoke', { x: at.x, y: 0.3, z: at.z }, { count: 22, color: 0x4a2a7a, color2: 0x2a1a4a, colorEnd: 0x0a0814, radius: r * 0.8, ring: true, speed: 0.4, swirl: 2, up: 0.3, life: 1.6, size: 1.2, sizeEnd: 2.4 });
      soulsRise(F, at, ['eldritch', 'man', 'eldritch'], r * 0.6, 3);
      return true;
    }
    case 'line': case 'cone': {
      if (op) return openCoffin(F, s, at, op, r, d);
      const len = s.stats.range || 10, end = { x: at.x + d.x * len, z: at.z + d.z * len };
      if (id(s) === 'cf_procession') {
        // 送葬行列：一排兜帽亡者抬着棺走过去
        for (let i = 0; i < 4; i++) { const side = rot(d, Math.PI / 2), off = (i % 2 ? 0.6 : -0.6); const h = hooded(i === 1 || i === 2 ? GRAVE : BONE, 1.1); const st = { x: at.x + side.x * off - d.x * (i < 2 ? 0 : 1.2), z: at.z + side.z * off - d.z * (i < 2 ? 0 : 1.2) }; h.rotation.y = Math.atan2(d.x, d.z); F.live(h, 0.9, k => { h.position.set(st.x + d.x * len * k, F.gy(st.x, st.z) + Math.abs(Math.sin(k * 20)) * 0.08, st.z + d.z * len * k); fade(h, k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); }); }
        const cf = noOl(makeCoffin(VIO, 0, 1)); cf.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = ghostMat(BONE, 1, 0.55); });
        F.live(cf, 0.9, k => { cf.position.set(at.x - d.x * 0.6 + d.x * len * k, F.gy(at.x, at.z) + 1.7, at.z - d.z * 0.6 + d.z * len * k); cf.rotation.set(-Math.PI / 2, Math.atan2(d.x, d.z), 0); fade(cf, k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); });
        F.fx('smoke', { x: at.x + d.x * len * 0.5, y: 0.2, z: at.z + d.z * len * 0.5 }, { count: 16, color: 0x3a4a44, colorEnd: 0x0a1410, radius: len * 0.4, speed: 0.8, up: 0.3, life: 1.2, size: 1.2, sizeEnd: 2.2 });
        return true;
      }
      // 锁魂链 / 渡魂长链：棺链笔直甩出，沿途魂火
      chainShot(F, me, end, glow(id(s) === 'cf_u_ferryman' ? GRAVE : 0xb0a8c8, 1.3));
      for (let dd = 1.5; dd < len; dd += 2) { const p = { x: at.x + d.x * dd, z: at.z + d.z * dd }; F.fx('flame', { x: p.x, y: 0.3, z: p.z }, { count: 2, color: 0xe0d0ff, color2: VIO, colorEnd: 0x2a1040, radius: 0.4, speed: 0.3, up: 1.6, life: 0.6, size: 0.7, sizeEnd: 0.2 }); }
      F.ring(end, s.stats.radius || 2, VIO_CSS, 0.4);
      return true;
    }
    case 'blink': {
      // 寿衣步：一阵阴风，起落都是骨白布幔
      const from = { x: at.x - d.x * s.stats.range, z: at.z - d.z * s.stats.range };
      for (const p of [from, at]) F.fx('smoke', { x: p.x, y: 0.8, z: p.z }, { count: 16, color: 0xe8e0d0, color2: 0xa8a090, colorEnd: 0x3a3440, radius: 0.6, speed: 1.6, swirl: 4, up: 0.8, life: 0.8, size: 0.9, sizeEnd: 1.6 });
      for (let i = 0; i <= 5; i++) { const k = i / 5; F.fx('streak', { x: from.x + (at.x - from.x) * k, y: 1, z: from.z + (at.z - from.z) * k }, { count: 2, color: 0xffffff, color2: VIO, radius: 0.4, speed: 0.2, up: 0.1, life: 0.3, size: 0.8, sizeEnd: 0.1 }); }
      F.ring(at, r, VIO_CSS, 0.45);
      return true;
    }
    case 'projectile': return false;
  }
  return false;
};

/** 开棺：身后的铁棺棺盖炸开，按棺中魂放出对应颜色的魂；再按组合形状画主表现 */
function openCoffin(F: ClassFxApi, s: ResolvedSkill, at: P2, op: { color: number; souls: Soul[] }, r: number, d: P2): boolean {
  const me = F.me(), behind = { x: me.x - d.x * 1.2, z: me.z - d.z * 1.2 };
  const cf = noOl(makeCoffin(op.color, 1, 1.5)); cf.rotation.y = Math.atan2(d.x, d.z);
  const lid = cf.getObjectByName('coffin_lid');
  F.live(cf, 0.9, k => { cf.position.set(behind.x, F.gy(behind.x, behind.z) + 0.9, behind.z); if (lid) lid.rotation.y = -Math.min(1, k / 0.15) * 2.2; if (k > 0.75) cf.scale.setScalar(1 - (k - 0.75) / 0.25); });
  F.fx('star', { x: behind.x, y: 1.4, z: behind.z }, { count: 1, color: 0xffffff, color2: op.color, speed: 0, up: 0, life: 0.3, size: 4, sizeEnd: 0.6 });
  soulsRise(F, behind, op.souls, 1.2, 2.5);
  const c = op.color, ccss = css(c);
  if (s.shape === 'circle' && s.tags.includes('targeted')) {
    // 魂飞向目标处炸开
    op.souls.forEach((so, i) => { const w = wisp(SOUL_COLOR[so], 1.4); const from = { x: behind.x + (i - 1) * 0.6, z: behind.z }; F.live(w, 0.4, k => { w.position.set(from.x + (at.x - from.x) * k, F.gy(at.x, at.z) + 1.5 + Math.sin(k * Math.PI) * 3, from.z + (at.z - from.z) * k); w.lookAt(at.x, 1, at.z); }); });
    F.sigil(at, r, c, 1.4); F.ring(at, r, ccss, 0.6); boneDust(F, at, r, c, 16);
  } else if (s.shape === 'line') {
    const len = s.stats.range || 12;
    op.souls.forEach((so, i) => { const side = rot(d, Math.PI / 2), off = (i - (op.souls.length - 1) / 2) * 0.9; const st = { x: me.x + side.x * off, z: me.z + side.z * off }; const w = wisp(SOUL_COLOR[so], 1.6); F.live(w, 0.5, k => { w.position.set(st.x + d.x * len * k, F.gy(st.x, st.z) + 0.9, st.z + d.z * len * k); w.lookAt(st.x + d.x * len, 0.9, st.z + d.z * len); fade(w, k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); }); });
    F.ring({ x: me.x + d.x * len, z: me.z + d.z * len }, s.stats.radius || 3, ccss, 0.45);
  } else if (s.tags.includes('slam')) {
    coffinDrop(F, at, r, 1.8, 7, 0.24, c);
  } else {
    // 自身范围（绕身）：魂绕身一周
    op.souls.concat(op.souls).forEach((so, i, arr) => { const w = wisp(SOUL_COLOR[so], 1.4); let a = i / arr.length * Math.PI * 2; F.live(w, 0.7, (k, dt) => { a -= dt * 10; const p = F.me(); w.position.set(p.x + Math.cos(a) * r * 0.75, F.gy(p.x, p.z) + 1, p.z + Math.sin(a) * r * 0.75); w.rotation.y = -a; fade(w, 1 - k * k); }); });
    F.whirl(r, new THREE.Color(c).multiplyScalar(0.55).getHex(), 0.6); F.ring(at, r, ccss, 0.5);
  }
  return true;
}

export const COFFIN_FX: ClassFx = {
  cast,
  projectile: (s, i) => {
    if (s.tags.includes('echo')) return { obj: echoWisp(1.1), spin: false };   // 11-04 立棺墓碑 回响：灰青弹体
    const op = openInfo(s);
    if (op && op.souls.every(x => x === 'man')) return { obj: knife(BONE), spin: true };   // 千刃送行：飞刀
    if (op) return { obj: wisp(SOUL_COLOR[op.souls[i % op.souls.length]], 1.3), spin: false };   // 噬魂兽 / 渊犬
    return { obj: wisp(colorOf(s), 1.1), spin: false };
  },
  trail: (s, p, F) => {
    if (s.tags.includes('echo')) { F.fx('smoke', { x: p.x, y: p.y, z: p.z }, { count: 1, color: GHOST_C, colorEnd: GHOST_D, speed: 0.2, up: 0.3, life: 0.4, size: 0.5, sizeEnd: 0.9 }); return true; }
    const c = colorOf(s);
    F.fx('flame', { x: p.x, y: p.y, z: p.z }, { count: 1, color: 0xffffff, color2: c, colorEnd: 0x1a0828, speed: 0.2, up: 0.4, life: 0.35, size: 0.5, sizeEnd: 0.1 });
    return true;
  },
  dashTrail: (s, p, F) => {
    // 铁棺擦地：火星 + 尘土
    F.fx('spark', { x: p.x, y: 0.15, z: p.z }, { count: 3, color: 0xffd080, color2: 0xff7020, speed: 3, up: 1, life: 0.3, size: 0.2, sizeEnd: 0.05, gravity: 10 });
    F.fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0x5a5048, colorEnd: 0x1a1820, radius: 0.3, speed: 0.5, up: 0.3, life: 0.6, size: 0.7, sizeEnd: 1.3 });
    return true;
  },
};
