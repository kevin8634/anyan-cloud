// v1.2.72 技能特效修复（docs/设计/技能特效/00_总纲 §7、法师 §闪电链 / §奥术风暴）
// ArcBolt：分形折线电弧（主干 + 分支，每 0.05 秒重生形状），多元素 = 多股偏移电束螺旋绞合
// StormCell：区域上空的暗色体积云 + 持续随机落雷（普通混合，会挡光；不画任何地面圆盘）
// shockField：电焦裂纹贴花 + 裂纹间跳动的小电弧（取代自然 / 奥术地面区域的平面色块）
// 只用 vfx.ts 的 live / fx / gy，不依赖 main 的上下文
import * as THREE from 'three';
import { live, fx, fxQuality, BOLT_HIT } from './vfx';
import { gy } from './gfx';
import type { Element } from '../core/types';
import { ARC_PAL, fractal, ribbon, addMat } from './arcgeo';   // 11-19 纯几何拆出（weaponfx 不能经 vfx 早读技能表）
export { ARC_PAL, fractal, ribbon, addMat };

type P3 = { x: number; y: number; z: number };
type P2 = { x: number; z: number };

/** 技能本体元素：附加元素把数据上的主元素改掉后，画面仍保留本体形态与颜色 */
export const BOLT_BASE: Record<string, Element> = { chain_lightning: 'nature', arcane_storm: 'arcane' };
/** 当前是否在结算「电弧类」技能（命中层把自然画成电火花而不是毒雾） */
export const BOLT_CTX: { on: boolean; els: Element[] | null } = { on: false, els: null };
/** 在电弧类技能的结算期间执行 f（命中层 / 地面区域 / 弹射都按电弧画） */
export function withBolt<T>(els: Element[], f: () => T): T { const o = BOLT_CTX.on, e = BOLT_CTX.els; BOLT_CTX.on = true; BOLT_CTX.els = els; BOLT_HIT.on = true; try { return f(); } finally { BOLT_CTX.on = o; BOLT_CTX.els = e; BOLT_HIT.on = o; } }

/** 技能的电束颜色列表：本体在前，其余按 elements 去重，最多 3 股 */
export function boltElements(baseId: string, element: Element, elements?: Element[]): Element[] {
  const out: Element[] = [];
  const push = (e?: Element) => { if (e && !out.includes(e) && out.length < 3) out.push(e); };
  push(BOLT_BASE[baseId]); push(element); (elements ?? []).forEach(push);
  return out.length ? out : ['nature'];
}

const low = () => fxQuality === 'low';

export interface ArcOpts { els?: Element[]; life?: number; width?: number; branches?: number; jag?: number; embers?: boolean }
let arcCount = 0;
/** 当前存活的电弧数（测试用） */
export function arcBoltCount() { return arcCount; }

/**
 * 一道电弧：from → to 瞬间连接，life 秒内每 0.05 秒重生形状并淡出；多元素 = 多股偏移曲线绕中心轴螺旋绞合
 * 火 = 红黄电弧 + 沿线掉火星；冰 = 青白电弧 + 霜晶飘落
 */
export function arcBolt(from: P3, to: P3, o: ArcOpts = {}) {
  const els = (o.els && o.els.length ? o.els : ['nature']) as Element[];
  const life = o.life ?? 0.12, w = o.width ?? 0.07, jag = o.jag ?? 0.22;
  const A = new THREE.Vector3(from.x, from.y, from.z), B = new THREE.Vector3(to.x, to.y, to.z);
  const len = A.distanceTo(B);
  const depth = len > 8 ? 5 : len > 3 ? 4 : 3;
  const branches = low() ? Math.min(1, o.branches ?? 2) : (o.branches ?? 2);
  const g = new THREE.Group();
  const strands = low() ? els.slice(0, 1) : els;
  const axis = B.clone().sub(A).normalize();
  const perp = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const perp2 = new THREE.Vector3().crossVectors(axis, perp).normalize();
  const mats: THREE.MeshBasicMaterial[] = [];
  const build = () => {
    g.children.slice().forEach(c => { g.remove(c); (c as THREE.Mesh).geometry.dispose(); });
    strands.forEach((el, si) => {
      const pal = ARC_PAL[el] ?? ARC_PAL.nature;
      let pts = fractal(A, B, depth, jag);
      if (strands.length > 1) {   // 绞合：每米绕轴转一圈，偏移 6 厘米
        const ph = si / strands.length * Math.PI * 2;
        pts = pts.map((p, i) => { const t = i / (pts.length - 1), a = ph + t * len * Math.PI * 2, r = 0.06 * Math.sin(Math.PI * t) * 1.6; return p.clone().addScaledVector(perp, Math.cos(a) * r).addScaledVector(perp2, Math.sin(a) * r); });
      }
      const ww = si === 0 ? w : w * 0.7;
      g.add(new THREE.Mesh(ribbon(pts, ww * 2.2), mats[si * 3] ??= addMat(pal[0], 0.35)));
      g.add(new THREE.Mesh(ribbon(pts, ww * 0.45), mats[si * 3 + 2] ??= addMat(pal[2], 0.95)));
      if (si === 0) for (let b = 0; b < branches; b++) {   // 分支：从主干某点斜出一小段
        const i0 = 1 + Math.floor(Math.random() * (pts.length - 2));
        const p0 = pts[i0], dl = len * (0.12 + Math.random() * 0.18);
        const p1 = p0.clone().add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.7) * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar(dl));
        g.add(new THREE.Mesh(ribbon(fractal(p0, p1, 2, 0.3), ww * 0.9), mats[si * 3 + 1] ??= addMat(pal[1], 0.6)));
      }
    });
  };
  build();
  arcCount++;
  // 元素附加层：火星 / 霜晶沿线掉落
  if (!low()) for (const el of strands) {
    const n = el === 'fire' || el === 'frost' ? 10 : 0;
    for (let i = 0; i < n; i++) {
      const p = A.clone().lerp(B, Math.random());
      if (el === 'fire') fx('spark', p, { count: 1, color: 0xffe7a3, color2: 0xe2481b, speed: 0.6, up: 0.2, life: 0.55, size: 0.1, gravity: 9 });
      else fx('ice', p, { count: 1, color: 0xf2fbff, color2: 0x9fd8e8, speed: 0.3, up: -0.3, life: 0.7, size: 0.14, gravity: 3 });
    }
  }
  let acc = 0;
  live(g, life, (k, dt) => {
    acc += dt; if (acc >= 0.05 && k < 0.8) { acc = 0; build(); }
    const f = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    mats.forEach((m, i) => { if (m) m.opacity = (i % 3 === 0 ? 0.35 : i % 3 === 1 ? 0.6 : 0.95) * f; });
    if (k >= 1) { arcCount--; mats.forEach(m => m?.dispose()); }
  });
  return g;
}

/** 命中层：电弧缠身 + 臭氧白烟 + 电火花（元素各一层） */
export function shockHit(p: P3, els: Element[], heavy = false) {
  const top = { x: p.x, y: p.y + 0.6, z: p.z };
  for (let i = 0; i < (low() ? 1 : 2); i++) {
    const a = Math.random() * 6.28;
    arcBolt({ x: p.x + Math.cos(a) * 0.45, y: p.y + 1.4, z: p.z + Math.sin(a) * 0.45 }, { x: p.x - Math.cos(a) * 0.4, y: p.y + 0.2, z: p.z - Math.sin(a) * 0.4 }, { els: [els[0]], life: 0.2, width: 0.035, branches: 0, jag: 0.35 });
  }
  const pal = ARC_PAL[els[0]] ?? ARC_PAL.nature;
  fx('spark', top, { count: heavy ? 10 : 6, color: pal[2], color2: pal[1], speed: 5, up: 1, life: 0.18, size: 0.1, gravity: 10 });
  fx('smoke', top, { count: 2, color: 0xd8d8e0, color2: 0xb8b8c4, colorEnd: 0x606070, speed: 0.4, up: 0.8, life: 0.9, size: 0.5, sizeEnd: 1.2 });
  if (els.includes('fire')) fx('flame', top, { count: 4, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, radius: 0.2, speed: 0.6, up: 1.4, life: 0.45, size: 0.6, sizeEnd: 0.2 });
  if (els.includes('frost')) fx('ice', top, { count: 5, color: 0xe8f8ff, color2: 0x9fd8e8, speed: 3, up: 0.6, life: 0.4, size: 0.3, sizeEnd: 0.15, drag: 3 });
  if (els.includes('fire') && els.includes('frost')) fx('smoke', top, { count: 4, color: 0xf0f4f8, color2: 0xdde6ee, colorEnd: 0x9fb4c4, speed: 1.6, up: 1, life: 0.8, size: 0.6, sizeEnd: 1.6 });   // 冰火相遇：蒸汽爆
}

// ---------------------------------------------------------------- 电焦裂纹贴花
const crackTex: Record<string, THREE.CanvasTexture> = {};
function crackTexture(rune: boolean) {
  const key = rune ? 'r' : 'c';
  if (crackTex[key]) return crackTex[key];
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  if (g) {
    const R = Math.random;
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 40); rg.addColorStop(0, 'rgba(20,16,28,0.7)'); rg.addColorStop(1, 'rgba(20,16,28,0)'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {   // 放射焦黑细裂纹，带分叉
      let x = 64, y = 64, a = i / 11 * 6.28 + R() * 0.4; g.strokeStyle = 'rgba(14,10,20,0.95)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 7; j++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 7.5; y += Math.sin(a) * 7.5; g.lineTo(x, y); if (R() < 0.25) { const bx = x, by = y, ba = a + (R() - 0.5) * 2; g.moveTo(bx + Math.cos(ba) * 8, by + Math.sin(ba) * 8); g.lineTo(bx, by); } }
      g.stroke();
    }
    if (rune) {   // 裂纹里的粉白符文刻痕
      g.strokeStyle = 'rgba(243,217,255,0.95)'; g.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = 12 + R() * 26, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d; g.beginPath(); g.moveTo(x - 3, y - 4); g.lineTo(x + 3, y - 4); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.moveTo(x - 3, y + 1); g.lineTo(x + 2, y + 4); g.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; crackTex[key] = t; return t;
}
let crackLive = 0;
const CRACK_CAP = 24;
/** 电焦裂纹贴花：rune = 裂纹里有余亮的符文刻痕（奥术），最后 35% 淡出 */
export function shockCrack(p: P2, r: number, dur = 5, rune = false) {
  if (low() || crackLive >= CRACK_CAP) return;
  crackLive++;
  const dark = new THREE.MeshBasicMaterial({ map: crackTexture(false), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  dark.userData.outlineParameters = { visible: false };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), dark);
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(p.x, gy(p.x, p.z) + 0.032, p.z); m.renderOrder = 1;
  let glow: THREE.Mesh | null = null, gm: THREE.MeshBasicMaterial | null = null;
  if (rune) {
    gm = new THREE.MeshBasicMaterial({ map: crackTexture(true), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, color: 0xd8b0ff, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5 });
    gm.userData.outlineParameters = { visible: false };
    glow = new THREE.Mesh(m.geometry.clone(), gm); glow.position.z = 0.002; m.add(glow);
  }
  live(m, dur, (k) => {
    const fade = Math.min(1, k * dur / 0.1) * (k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
    dark.opacity = 0.9 * fade;
    if (gm) { const t = k * dur; gm.opacity = fade * (t < 0.5 ? 1 : 0.35 + 0.15 * Math.sin(t * 3)); gm.color.setHex(t < 0.5 ? 0xf3d9ff : 0x8e5bff); }
    if (k >= 1) crackLive--;
  });
}

/** 自然 / 奥术地面区域：裂纹网 + 每 0.5 秒在裂纹间跳一下的小电弧（不画圆盘、不画圆环） */
export function shockField(p: P2, r: number, el: Element, dur: number) {
  const rune = el === 'arcane';
  const n = Math.max(3, Math.min(7, Math.round(r * 1.2)));
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, d = i === 0 ? 0 : r * (0.35 + Math.random() * 0.55); shockCrack({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }, 0.8 + Math.random() * 0.6, dur, rune && i % 2 === 0); }
  const els: Element[] = [el === 'arcane' ? 'arcane' : 'nature'];
  let acc = 0;
  live(new THREE.Group(), dur, (_k, dt) => {
    acc += dt; if (acc < 0.5) return; acc = 0;
    const a = Math.random() * 6.28, d = Math.random() * r * 0.8, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const b = a + (Math.random() - 0.5) * 1.5, l = 0.8 + Math.random() * 1.2;
    const x2 = x + Math.cos(b) * l, z2 = z + Math.sin(b) * l;
    arcBolt({ x, y: gy(x, z) + 0.08, z }, { x: x2, y: gy(x2, z2) + 0.08, z: z2 }, { els, life: 0.1, width: 0.03, branches: 0, jag: 0.4 });
  });
}

// ---------------------------------------------------------------- 风暴云
let cloudTex: THREE.CanvasTexture | null = null;
function getCloudTex() {
  if (cloudTex) return cloudTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  if (g) {
    // 积雨云团：大团柔边打底 + 小团亮暗交错做出翻卷的体积感（贴图本身是灰度，颜色由材质给）
    for (let i = 0; i < 14; i++) {
      const x = 64 + (Math.random() - 0.5) * 46, y = 64 + (Math.random() - 0.5) * 40, r = 20 + Math.random() * 24;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(200,200,200,0.4)'); rg.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
    }
    for (let i = 0; i < 40; i++) {
      const x = 64 + (Math.random() - 0.5) * 70, y = 64 + (Math.random() - 0.5) * 60, r = 5 + Math.random() * 10, v = Math.random() < 0.55 ? 255 : 90;
      if (Math.hypot(x - 64, y - 64) > 46) continue;
      const rg = g.createRadialGradient(x, y - r * 0.3, 0, x, y, r); rg.addColorStop(0, `rgba(${v},${v},${v},0.28)`); rg.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = rg; g.fillRect(0, 0, S, S);
    }
  }
  cloudTex = new THREE.CanvasTexture(c); return cloudTex;
}

export interface StormOpts {
  els: Element[];
  /** 持续时间（视觉 6 秒） */
  dur?: number;
  /** 每次落雷时调用：返回落点（优先敌人），null = 区域内随机 */
  pick?: () => P3 | null;
  /** 云成形后第一击 */
  onFirst?: () => void;
}
let stormLive = 0;
export function stormCount() { return stormLive; }
/**
 * 区域风暴：0.3 秒内卷起直径约 2r 的暗色雷云（软粒子 sprite，普通混合，云底被内部电光照亮），
 * 持续每 0.25–0.4 秒落 1–2 道电弧；结束后 0.6 秒散去。云的颜色随元素：奥术紫黑 / 雷铅灰 / 火灰红
 */
export function stormCell(c: P2, r: number, o: StormOpts) {
  const dur = o.dur ?? 6, els = o.els.length ? o.els : ['arcane' as Element];
  const main = els[0];
  const base = main === 'arcane' ? 0x241f2e : main === 'fire' ? 0x3a2622 : main === 'frost' ? 0x3a4450 : 0x2a2c33;   // 写实：云体是铅灰带一点紫，只有电光把云底照成紫色
  const lit = (ARC_PAL[main] ?? ARC_PAL.arcane)[0];
  const y0 = gy(c.x, c.z) + 7;
  const g = new THREE.Group(); g.position.set(c.x, y0, c.z);
  const N = low() ? 8 : 18;
  const puffs: { s: THREE.Sprite; m: THREE.SpriteMaterial; a: number; d: number; h: number; sz: number }[] = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.SpriteMaterial({ map: getCloudTex(), color: base, transparent: true, opacity: 0, depthWrite: false, fog: true, toneMapped: true });
    const s = new THREE.Sprite(m);
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r * 0.75, sz = r * (0.55 + Math.random() * 0.5);
    s.scale.setScalar(sz * 0.2); g.add(s);
    puffs.push({ s, m, a, d, h: (Math.random() - 0.5) * 1.2, sz });
  }
  stormLive++;
  const total = dur + 0.6;
  let t = 0, next = 0.3, flash = 0, first = false;
  const strike = () => {
    const tgt = o.pick?.() ?? null;
    const a = Math.random() * 6.28, d = Math.random() * r;
    const to = tgt ?? { x: c.x + Math.cos(a) * d, y: gy(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d), z: c.z + Math.sin(a) * d };
    const from = { x: to.x + (Math.random() - 0.5) * 2, y: y0 - 0.3, z: to.z + (Math.random() - 0.5) * 2 };
    arcBolt(from, { x: to.x, y: to.y + (tgt ? 1 : 0), z: to.z }, { els, life: 0.08 + Math.random() * 0.04, width: 0.09, branches: 3 });
    fx('spark', { x: to.x, y: gy(to.x, to.z) + 0.2, z: to.z }, { count: 8, color: 0xf4f1ff, color2: (ARC_PAL[main] ?? ARC_PAL.arcane)[1], speed: 4, up: 1.5, life: 0.15, size: 0.12, gravity: 8 });
    fx('smoke', { x: to.x, y: gy(to.x, to.z) + 0.3, z: to.z }, { count: 2, color: 0xe0e0e8, color2: 0xc0c0cc, colorEnd: 0x505060, speed: 0.4, up: 0.6, life: 1, size: 0.5, sizeEnd: 1.3 });
    shockCrack({ x: to.x, z: to.z }, 0.7 + Math.random() * 0.4, 6, main === 'arcane');
    flash = 0.08;
  };
  live(g, total, (k, dt) => {
    t += dt;
    const form = Math.min(1, t / 0.3), out = t > dur ? 1 - Math.min(1, (t - dur) / 0.6) : 1;
    g.rotation.y += dt * 0.26;   // 逆时针约 15°/秒
    for (const p of puffs) {
      p.s.position.set(Math.cos(p.a) * p.d * (0.4 + 0.6 * form), p.h + (1 - out) * 2, Math.sin(p.a) * p.d * (0.4 + 0.6 * form));
      p.s.scale.setScalar(p.sz * (0.2 + 0.8 * form) * (1 + (1 - out) * 0.4));
      p.m.opacity = 0.72 * form * out;
      p.m.color.setHex(base).lerp(new THREE.Color(lit), Math.min(0.6, flash * 7));
    }
    if (Math.random() < dt * 3 && t < dur) flash = Math.max(flash, 0.05);   // 云内闪
    flash = Math.max(0, flash - dt);   // 不加点光源（动态增减灯会触发着色器重编译），云体自身变亮表现闪电
    if (!first && t >= 0.3) { first = true; for (let i = 0; i < (low() ? 1 : 3); i++) strike(); o.onFirst?.(); }
    if (first && t < dur && t >= next) { strike(); if (!low() && Math.random() < 0.4) strike(); next = t + 0.25 + Math.random() * 0.15; }
    if (k >= 1) stormLive--;
  });
  return g;
}
