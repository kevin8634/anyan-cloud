// v0.9.1f 首领机制特效：红圈落地冲击、读条聚能、护盾、阶段转换、狂暴、熔岩 / 冰面、安全点、首领倒下
// 只依赖 vfx.ts / gfx.ts；raid.ts（长副本 / 深渊 / 三首领副本）和 enemies.ts（矿洞 / 腐沼首领）调用
import * as THREE from 'three';
import { fx, live, scorch, sigilMaterial, vfxTime } from './vfx';
import { beamMaterial } from './gfx';

type P2 = { x: number; z: number };
export type BossTheme = 'fire' | 'frost' | 'shadow' | 'stone' | 'nature' | 'holy';
const PAL: Record<BossTheme, { a: number; b: number; dark: number; smoke: number; debris: number }> = {
  fire: { a: 0xff5a10, b: 0xffd060, dark: 0x501008, smoke: 0x3a302a, debris: 0x4a3a30 },
  frost: { a: 0x5fc0ff, b: 0xe8f8ff, dark: 0x1a4a78, smoke: 0xb8d0e8, debris: 0xcfe8ff },
  shadow: { a: 0x9a4aff, b: 0xe8c8ff, dark: 0x200a40, smoke: 0x2a1a3a, debris: 0x3a2a4a },
  stone: { a: 0xe0a050, b: 0xfff0c0, dark: 0x3a2a18, smoke: 0x6a5a48, debris: 0x6a5a48 },
  nature: { a: 0x7aff3a, b: 0xe0ffa0, dark: 0x1a3a08, smoke: 0x3a4a2a, debris: 0x5a4020 },
  holy: { a: 0xffd060, b: 0xffffff, dark: 0x6a4a10, smoke: 0xd8c8a0, debris: 0xe8d8b0 },
};
export function themeOf(el?: string): BossTheme {
  return el === 'fire' || el === 'frost' || el === 'shadow' || el === 'nature' || el === 'holy' ? el : el === 'arcane' ? 'shadow' : 'stone';
}
const noOutline = <T extends THREE.Mesh>(m: T) => { (m.material as THREE.Material).userData.outlineParameters = { visible: false }; return m; };
const add = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

/** 贴地冲击波：一圈向外扩散、越扩越淡的光环 */
export function shockwave(p: P2, r: number, color: number, dur = 0.5, width = 0.12) {
  const mat = add(color);
  const m = noOutline(new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64), mat));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.12, p.z); m.renderOrder = 4;
  live(m, dur, k => { const e = 1 - Math.pow(1 - k, 3); m.scale.setScalar(Math.max(0.05, r * (0.25 + 1.0 * e))); mat.opacity = (1 - k) * 0.9; });
}
/** 光柱：从地面冲起再淡出 */
export function pillar(p: P2, r: number, h: number, color: number, dur = 0.9, k0 = 1.4) {
  const mat = beamMaterial(color, k0);
  const m = noOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 24, 1, true), mat));
  m.position.set(p.x, h / 2, p.z); m.renderOrder = 4;
  live(m, dur, k => { const up = Math.min(1, k * 5); m.scale.set(1 - k * 0.4, up, 1 - k * 0.4); m.position.y = h * up / 2; mat.uniforms.k.value = k0 * (1 - k * k); });
}

/** 红圈落地：冲击波 + 焦痕 + 主题粒子（火 / 冰 / 暗影 / 岩石 / 自然） */
export function bossImpact(p: P2, r: number, theme: BossTheme, heavy = false) {
  const c = PAL[theme], n = Math.min(1.8, 0.6 + r * 0.18) * (heavy ? 1.4 : 1);
  shockwave(p, r * 1.15, c.b, 0.45, 0.1);
  shockwave(p, r * 0.9, c.a, 0.6, 0.25);
  scorch(p, r * 0.95, theme === 'frost' ? 0x9fd8ff : theme === 'holy' ? 0xffe0a0 : c.dark, theme === 'frost' ? 3 : 2.6);
  fx('star', { x: p.x, y: 0.6, z: p.z }, { count: 1, color: 0xffffff, color2: c.b, speed: 0, up: 0, life: 0.22, size: 2 + r * 0.9, sizeEnd: 0.6 });
  if (theme === 'frost') {
    fx('ice', { x: p.x, y: 0.3, z: p.z }, { count: 26 * n, color: 0xe8f8ff, color2: c.a, radius: r * 0.5, speed: 6, up: 1.6, gravity: 12, life: 0.8, size: 0.5, sizeEnd: 0.25, spin: 6 });
    fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 12 * n, color: c.smoke, colorEnd: 0x8090a0, radius: r * 0.8, ring: true, speed: 0.8, up: 0.3, life: 1.4, size: 1.6, sizeEnd: 3 });
  } else if (theme === 'nature') {
    fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: 18 * n, color: c.debris, color2: c.a, speed: 6, up: 1.8, gravity: 14, life: 0.9, size: 0.35, spin: 8 });
    fx('dot', { x: p.x, y: 0.2, z: p.z }, { count: 26 * n, color: c.a, color2: c.b, radius: r * 0.8, speed: 1, up: 2, life: 1, size: 0.25, sizeEnd: 0.05 });
  } else {
    if (theme === 'fire') fx('flame', { x: p.x, y: 0.3, z: p.z }, { count: 22 * n, color: 0xffb050, color2: c.a, colorEnd: c.dark, radius: r * 0.6, speed: 1.6, up: 1.6, life: 0.8, size: 1.3, sizeEnd: 0.3 });
    else fx('dot', { x: p.x, y: 0.3, z: p.z }, { count: 24 * n, color: c.a, color2: c.b, radius: r * 0.7, speed: 1.4, up: 2.2, life: 0.8, size: 0.3, sizeEnd: 0.05 });
    fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: 16 * n, color: c.debris, color2: c.a, speed: 7, up: 1.6, gravity: 14, life: 0.8, size: 0.3, sizeEnd: 0.22, spin: 8 });
    fx('spark', { x: p.x, y: 0.4, z: p.z }, { count: 18 * n, color: c.b, color2: c.a, speed: 9, up: 0.8, gravity: 8, drag: 1.5, life: 0.45, size: 0.35, sizeEnd: 0.06 });
    fx('smoke', { x: p.x, y: 0.6, z: p.z }, { count: 10 * n, color: c.smoke, colorEnd: 0x141010, radius: r * 0.6, speed: 1, up: 1.2, life: 1.6, size: 1.4, sizeEnd: 3 });
  }
}
/** 红圈快落下时：边缘冒一圈火星，提醒「要爆了」 */
export function teleWarn(p: P2, r: number, theme: BossTheme) {
  const c = PAL[theme];
  fx('spark', { x: p.x, y: 0.1, z: p.z }, { count: Math.min(40, 10 + r * 4), color: c.b, color2: c.a, radius: r * 0.98, ring: true, speed: 0.2, up: 2.4, gravity: 3, life: 0.4, size: 0.25, sizeEnd: 0.05 });
}

/** 读条聚能：首领脚下法阵 + 四周光点向首领收拢；返回 stop()（读完 / 打断时调用） */
export function castCharge(follow: () => THREE.Vector3, theme: BossTheme, dur: number, scale = 1) {
  const c = PAL[theme], r = 2.6 * scale, total = dur + 0.8;
  const mat = sigilMaterial(new THREE.Color(c.a));
  const m = noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
  let now = 0, stopped = -1;
  live(m, total, (k, dt) => {
    now = k * total; const q = follow();
    if (stopped < 0 && now >= dur) stopped = now;
    m.position.set(q.x, 0.05, q.z);
    mat.uniforms.time.value = vfxTime() * 1.5;
    const out = stopped >= 0 ? Math.max(0, 1 - (now - stopped) / 0.3) : 1;
    mat.uniforms.fade.value = Math.min(1, now / 0.25) * out * (0.75 + 0.25 * Math.sin(now * 10));
    if (stopped >= 0) return;
    const prog = now / dur;
    if (Math.random() < dt * 50) fx('dot', { x: q.x, y: 0.4 + Math.random() * 2, z: q.z }, { count: 1 + Math.round(prog * 2), color: c.b, color2: c.a, radius: r * 1.3, ring: true, speed: -r * 2.2, up: 0.6, life: 0.45, size: 0.22 + prog * 0.2, sizeEnd: 0.04 });
    if (Math.random() < dt * 8) fx(theme === 'fire' ? 'flame' : theme === 'frost' ? 'ice' : 'star', { x: q.x, y: 1.6 * scale, z: q.z }, { count: 1, color: c.b, color2: c.a, speed: 0, up: 0.3, life: 0.3, size: 0.8 + prog * 1.4, sizeEnd: 0.2 });
  });
  return () => { if (stopped < 0) stopped = now; };
}
/** 读条被打断：白金色碎光炸开 + 小冲击波 */
export function castBreak(p: THREE.Vector3, theme: BossTheme, scale = 1) {
  const c = PAL[theme];
  shockwave(p, 3.2 * scale, 0xffffff, 0.4, 0.15);
  fx('star', { x: p.x, y: 2 * scale, z: p.z }, { count: 1, color: 0xffffff, color2: 0xffe080, speed: 0, up: 0, life: 0.25, size: 4 * scale, sizeEnd: 0.5 });
  fx('shard', { x: p.x, y: 2 * scale, z: p.z }, { count: 22, color: 0xffffff, color2: c.a, speed: 8, up: 0.8, gravity: 10, life: 0.6, size: 0.3, sizeEnd: 0.15, spin: 10 });
  fx('spark', { x: p.x, y: 2 * scale, z: p.z }, { count: 26, color: 0xffffff, color2: 0xffd34d, speed: 9, up: 0.6, gravity: 8, drag: 1.5, life: 0.5, size: 0.35, sizeEnd: 0.05 });
}

/** 护盾读条：罩住首领的六边形能量泡；返回 stop(broken)（破盾时碎裂，读完时淡出） */
export function shieldBubble(follow: () => THREE.Vector3, theme: BossTheme, scale = 1, maxDur = 30) {
  const c = PAL[theme];
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(c.a) }, fade: { value: 0 }, time: { value: 0 }, hit: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 color; uniform float fade; uniform float time; uniform float hit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        vec2 h = vec2(atan(vP.z, vP.x) * 3.0, vP.y * 2.4);
        vec2 g = abs(fract(h + vec2(0.5 * floor(mod(h.y, 2.0)), 0.0)) - 0.5);
        float hex = smoothstep(0.42, 0.5, max(g.x, g.y));
        float band = smoothstep(0.15, 0.0, abs(fract(vP.y * 0.35 - time * 0.6) - 0.5));
        float a = (0.12 + f * 0.9 + hex * 0.35 + band * 0.25 + hit) * fade;
        gl_FragColor = vec4(mix(color, vec3(1.0), f * 0.4 + hit) * 1.4, min(a, 0.95));
      }`,
  });
  const R = 2.4 * scale;
  const m = noOutline(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), mat));
  m.renderOrder = 5;
  let now = 0, end = -1, broke = false;
  live(m, maxDur, (k, _dt) => {
    now = k * maxDur; const q = follow();
    m.position.set(q.x, R * 0.75, q.z);
    mat.uniforms.time.value = vfxTime();
    mat.uniforms.hit.value = Math.max(0, mat.uniforms.hit.value - _dt * 3);
    if (end < 0) { mat.uniforms.fade.value = Math.min(1, now / 0.3); m.scale.setScalar(0.6 + 0.4 * Math.min(1, now / 0.3)); }
    else { const e = (now - end) / 0.35; mat.uniforms.fade.value = Math.max(0, 1 - e); m.scale.setScalar(broke ? 1 + e * 0.5 : 1 - e * 0.3); if (e >= 1) m.visible = false; }
  });
  return {
    flash() { mat.uniforms.hit.value = 0.6; },
    stop(broken: boolean) {
      if (end >= 0) return; end = now; broke = broken;
      if (broken) { const q = follow(); fx('shard', { x: q.x, y: R * 0.8, z: q.z }, { count: 40, color: 0xffffff, color2: c.a, radius: R * 0.8, speed: 7, up: 1, gravity: 9, life: 0.8, size: 0.4, sizeEnd: 0.2, spin: 10 }); shockwave(q, R * 2.2, c.b, 0.5, 0.12); }
    },
  };
}

/** 阶段转换：双层冲击波 + 光柱 + 大法阵 + 碎石 */
export function phaseBurst(p: P2, theme: BossTheme, scale = 1) {
  const c = PAL[theme];
  pillar(p, 1.6 * scale, 14, c.a, 1.2, 1.6);
  shockwave(p, 9 * scale, c.b, 0.7, 0.06);
  shockwave(p, 6 * scale, c.a, 0.9, 0.2);
  const mat = sigilMaterial(new THREE.Color(c.a));
  const m = noOutline(new THREE.Mesh(new THREE.PlaneGeometry(10 * scale, 10 * scale), mat));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.05, p.z); m.renderOrder = 3;
  live(m, 1.6, k => { mat.uniforms.time.value = vfxTime() * 2; mat.uniforms.fade.value = (k < 0.1 ? k / 0.1 : 1) * (1 - k * k); m.scale.setScalar(0.6 + 0.4 * Math.min(1, k * 4)); });
  fx('star', { x: p.x, y: 2, z: p.z }, { count: 1, color: 0xffffff, color2: c.b, speed: 0, up: 0, life: 0.35, size: 9 * scale, sizeEnd: 1 });
  fx('shard', { x: p.x, y: 0.4, z: p.z }, { count: 30, color: c.debris, color2: c.a, radius: 1.5, speed: 10, up: 2, gravity: 14, life: 1.1, size: 0.45, sizeEnd: 0.3, spin: 8 });
  fx('streak', { x: p.x, y: 0.2, z: p.z }, { count: 24, color: 0xffffff, color2: c.a, radius: 1.8 * scale, ring: true, speed: 0.5, up: 12, drag: 1.5, life: 0.8, size: 0.9, sizeEnd: 0.1 });
  fx('smoke', { x: p.x, y: 0.4, z: p.z }, { count: 18, color: c.smoke, colorEnd: 0x141010, radius: 3 * scale, ring: true, speed: 3, up: 0.6, life: 1.8, size: 2, sizeEnd: 4 });
}
/** 狂暴：脚下红色火焰 + 升腾的红光（每帧调用，内部按几率发射） */
export function enrageTick(p: P2, scale = 1) {
  if (Math.random() < 0.5) fx('flame', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0xff6040, color2: 0xff1a10, colorEnd: 0x400000, radius: 1.1 * scale, ring: true, speed: 0.1, up: 2.4, life: 0.6, size: 0.9 * scale, sizeEnd: 0.2 });
  if (Math.random() < 0.3) fx('spark', { x: p.x, y: 1 * scale, z: p.z }, { count: 1, color: 0xffa080, color2: 0xff2010, radius: 0.9 * scale, speed: 0.3, up: 3, life: 0.6, size: 0.25, sizeEnd: 0.04 });
}
/** 熔岩 / 冰面 / 毒池区域：区域里随机冒泡 */
export function zoneTick(p: P2, r: number, theme: BossTheme) {
  if (Math.random() > Math.min(0.9, 0.12 + r * 0.06)) return;
  const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r * 0.9, q = { x: p.x + Math.cos(a) * d, y: 0.1, z: p.z + Math.sin(a) * d };
  const c = PAL[theme];
  if (theme === 'fire') { fx(Math.random() < 0.6 ? 'flame' : 'spark', q, { count: 1, color: 0xffc060, color2: 0xff5010, colorEnd: 0x400800, speed: 0.2, up: 1.6, life: 0.7, size: 0.6, sizeEnd: 0.1 }); if (Math.random() < 0.15) fx('smoke', q, { count: 1, color: 0x3a2a20, colorEnd: 0x101010, speed: 0.1, up: 1, life: 1.4, size: 0.8, sizeEnd: 1.8 }); }
  else if (theme === 'frost') fx(Math.random() < 0.5 ? 'ice' : 'smoke', q, { count: 1, color: 0xdff4ff, color2: c.a, colorEnd: 0x8aa0b8, speed: 0.15, up: 0.5, life: 1.1, size: 0.45, sizeEnd: 0.9, spin: 2 });
  else fx('dot', q, { count: 1, color: c.b, color2: c.a, speed: 0.1, up: 1.2, life: 0.8, size: 0.25, sizeEnd: 0.05 });
}
/** 安全点：金色光点从符文上升起 */
export function safeTick(p: P2, r: number) {
  if (Math.random() < 0.6) fx('dot', { x: p.x, y: 0.1, z: p.z }, { count: 1, color: 0xcff0ff, color2: 0x7ad8ff, radius: r * 0.9, ring: true, speed: 0, up: 2.2, life: 1, size: 0.25, sizeEnd: 0.05 });
  if (Math.random() < 0.12) fx('streak', { x: p.x, y: 0.1, z: p.z }, { count: 1, color: 0xffffff, color2: 0x7ad8ff, radius: r * 0.6, speed: 0, up: 5, life: 0.6, size: 0.6, sizeEnd: 0.1 });
}
/** 首领出场：落地冲击 + 暗色光柱 */
export function bossEntrance(p: P2, theme: BossTheme, scale = 1) {
  const c = PAL[theme];
  pillar(p, 1.2 * scale, 10, c.a, 0.9, 1.2);
  shockwave(p, 6 * scale, c.a, 0.6, 0.15);
  fx('smoke', { x: p.x, y: 0.3, z: p.z }, { count: 16, color: c.smoke, colorEnd: 0x141010, radius: 2, ring: true, speed: 2.5, up: 0.4, life: 1.5, size: 1.6, sizeEnd: 3.2 });
}
/** 11-04 Rhett：深渊每 5 层首领胜利的收敛版（原 bossDeath 光柱 18–22 米高、白闪 10×体型，过曝且挡住顶部对白）：
 *  细矮光柱（半径约 0.55×体型、7 米高、亮度约 4 成）1.1 秒内淡出，无白芯柱；白闪缩到 3 米 / 0.3 秒；
 *  光环只在 halo 点（传送点；没有传送点时为倒下处）3 米内，不再铺满场地 */
export function bossDeathSoft(p: P2, theme: BossTheme, scale = 1, halo?: P2) {
  const c = PAL[theme], s = Math.min(1.6, Math.max(0.6, scale)), h = halo ?? p;
  pillar(p, 0.55 * s, 7, 0xffd060, 1.1, 0.75);
  shockwave(h, 3.2, 0xffe0a0, 0.8, 0.06);
  shockwave(h, 2.4, c.a, 0.9, 0.18);
  fx('star', { x: p.x, y: 1.4, z: p.z }, { count: 1, color: 0xffe9a0, color2: 0xffd060, speed: 0, up: 0, life: 0.3, size: 3, sizeEnd: 0.5 });
  fx('star', { x: p.x, y: 1, z: p.z }, { count: 14, color: 0xffe9a0, color2: 0xffffff, radius: 1, speed: 2, up: 3, gravity: 4, life: 1.1, size: 0.3, sizeEnd: 0.04 });
  fx('dot', { x: h.x, y: 0.2, z: h.z }, { count: 18, color: c.b, color2: c.a, radius: 2.2, ring: true, speed: 0.3, up: 1.6, life: 1.1, size: 0.22, sizeEnd: 0.04 });
  fx('smoke', { x: p.x, y: 0.5, z: p.z }, { count: 8, color: c.smoke, colorEnd: 0x141010, radius: 1.5, ring: true, speed: 1.4, up: 0.5, life: 1.4, size: 1.4, sizeEnd: 2.6 });
}
/** 首领倒下：金色光柱 + 冲击波 + 星芒雨 */
export function bossDeath(p: P2, theme: BossTheme, scale = 1) {
  const c = PAL[theme];
  pillar(p, 1.4 * scale, 18, 0xffd060, 2.2, 1.8);
  pillar(p, 0.6 * scale, 22, 0xffffff, 1.6, 1.2);
  shockwave(p, 10 * scale, 0xffe0a0, 0.9, 0.05);
  shockwave(p, 7 * scale, c.a, 1.1, 0.2);
  fx('star', { x: p.x, y: 2, z: p.z }, { count: 1, color: 0xffffff, color2: 0xffd060, speed: 0, up: 0, life: 0.5, size: 10 * scale, sizeEnd: 1 });
  fx('star', { x: p.x, y: 1, z: p.z }, { count: 30, color: 0xffe9a0, color2: 0xffffff, radius: 1.5, speed: 3, up: 6, gravity: 4, life: 1.6, size: 0.45, sizeEnd: 0.05 });
  fx('dot', { x: p.x, y: 0.3, z: p.z }, { count: 40, color: c.b, color2: c.a, radius: 3 * scale, ring: true, speed: 0.4, up: 3, life: 1.8, size: 0.3, sizeEnd: 0.05 });
  fx('smoke', { x: p.x, y: 0.5, z: p.z }, { count: 16, color: c.smoke, colorEnd: 0x141010, radius: 2.5, ring: true, speed: 2, up: 0.8, life: 2, size: 1.8, sizeEnd: 3.6 });
}
