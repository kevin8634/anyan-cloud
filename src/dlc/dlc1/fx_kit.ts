// ======================================================================
// DLC1 职业专属施法表现的公用小件（v1.0.8）：半透明兽魂 / 羽刃 / 爪痕 / 铁链 / 墓碑 / 魂火
// 只 import three 和本体 gfx（见 manifest.ts 约定）；物体交给 ClassFxApi.live 放进场景、按寿命淡出。
// 约定：物体面朝 +z（弹体 lookAt 目标），原点在脚底。
// ======================================================================
import * as THREE from 'three';
import { glow, toon } from '../../web/gfx';
import type { ClassFxApi } from '../../core/ClassExt';
import { PACK_ICONS } from './icons.gen';

export type P2 = { x: number; z: number };
export const noOl = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };
/** 半透明发光材质（加法混合，不写深度） */
export const ghostMat = (c: number, k = 1.4, op = 0.7) => glow(c, k, { transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cone = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 5) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
const ball = (r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o; };
/** 兽魂 / 亡者剪影：普通混合的半透明色（加法混合叠多了会发白） */
export const spiritMat = (c: number, op = 0.55) => glow(c, 1.15, { transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
/** 让一组物体整体淡出（材质 opacity × f） */
export function fade(o: THREE.Object3D, f: number) {
  o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (!m || !m.transparent) return; m.userData.op0 ??= m.opacity; m.opacity = m.userData.op0 * Math.max(0, f); });
}

// ---------------------------------------------------------------- 11-14d GPT 特效贴图（icons/hfx_*.jpg，gpt-image-2 黑底发光图）
// Rhett 11-14「猎手仍有代码生成效果的技能，升级成 GPT 做的效果」：爪痕 / 羽刃 / 箭尾 / 锁链 / 图腾法阵 / 裂地 / 嚎叫声波 / 兽魂灵焰。
// 取亮度当形状、按形态色重新上色（保留 30% 原色细节，白热芯留白）；加色混合但不写目标透明度（同 look40 符文光圈，防黑方块）。
// 贴图缺失（未构建 / 被删）时各处返回 null，调用方回退到原来的程序网格。
const FX_TEX: Record<string, THREE.Texture | null> = {};
export const FX_T = { value: 0 };   // 灵焰滚动时间（随渲染更新）
export function fxTex(name: string, repeat = false): THREE.Texture | null {
  if (name in FX_TEX) return FX_TEX[name];
  const src = (PACK_ICONS as Record<string, string>)[name];
  if (!src || typeof document === 'undefined') return (FX_TEX[name] = null);
  const t = new THREE.TextureLoader().load(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (FX_TEX[name] = t);
}
const tickFx = () => { FX_T.value = performance.now() / 1000; };
function tintPatch(scroll: boolean) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uFxT = FX_T;
    sh.fragmentShader = 'uniform float uFxT;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
  { vec4 tc = texture2D(map, vMapUv${scroll ? ' + vec2(0.0, -uFxT * 0.55)' : ''});
    float l = max(tc.r, max(tc.g, tc.b)); vec3 hue = tc.rgb / max(l, 1e-3);
    diffuseColor.rgb *= ${scroll ? 'max(l, 0.45)' : 'l'} * mix(vec3(1.0), hue, 0.3);   // 灵焰兽魂保底亮度 / 不透明度 → 形体看得清
    diffuseColor.rgb += vec3(smoothstep(0.8, 1.0, l)) * 0.5;
    diffuseColor.a *= ${scroll ? 'max(smoothstep(0.015, 0.25, l), 0.4)' : 'smoothstep(0.015, 0.1, l)'}; }
  #endif`);
  };
}
/** 贴图卡片材质：加色（add=true）或普通混合（灵焰兽魂，叠多了不发白） */
export function fxMat(name: string, c: number, k = 1.6, op = 1, o: { repeat?: boolean; scroll?: boolean; add?: boolean } = {}): THREE.MeshBasicMaterial | null {
  const t = fxTex(name, o.repeat || o.scroll); if (!t) return null;
  const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  if (o.add !== false) { m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; }
  m.onBeforeCompile = tintPatch(!!o.scroll); m.customProgramCacheKey = () => 'hfx|' + (o.scroll ? 's' : '') + (o.add === false ? 'n' : 'a');
  m.userData.outlineParameters = { visible: false };
  return m;
}
/** 竖立卡片（PlaneGeometry，图的 +x 朝物体 +z）；cross = 再加一张水平的，任何角度都看得见 */
export function fxCard(name: string, c: number, w: number, h: number, k = 1.6, op = 1, cross = false, repeat = false): THREE.Object3D | null {
  const m = fxMat(name, c, k, op, { repeat }); if (!m) return null;
  const g = new THREE.Group(), geo = new THREE.PlaneGeometry(w, h);
  const a = new THREE.Mesh(geo, m); a.rotation.y = -Math.PI / 2; a.onBeforeRender = tickFx; g.add(a);
  if (cross) { const b = new THREE.Group(); b.rotation.z = Math.PI / 2; const bb = new THREE.Mesh(geo, m); bb.rotation.y = -Math.PI / 2; b.add(bb); g.add(b); }
  return g;
}
/** 贴地的平卡片（法阵 / 裂地 / 声波）：dur 秒，grow = [起, 止] 尺寸倍数，spin 每秒弧度 */
export function fxGround(F: ClassFxApi, name: string, p: P2, size: number, c: number, dur: number, o: { grow?: [number, number]; spin?: number; k?: number; y?: number; fadeIn?: number } = {}): boolean {
  const m = fxMat(name, c, o.k ?? 1.6, 1); if (!m) return false;
  const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); q.rotation.x = -Math.PI / 2; q.renderOrder = 3;
  const g = new THREE.Group(); g.add(q); g.position.set(p.x, F.gy(p.x, p.z) + (o.y ?? 0.06), p.z);
  const [s0, s1] = o.grow ?? [1, 1], fi = o.fadeIn ?? 0.08;
  F.live(g, dur, (k, dt) => { const s = size * (s0 + (s1 - s0) * (1 - Math.pow(1 - k, 2))); g.scale.set(s, 1, s); g.rotation.y += (o.spin ?? 0) * dt; m.opacity = k < fi ? k / fi : Math.max(0, 1 - Math.pow((k - fi) / (1 - fi), 2)); });
  return true;
}
/** 灵焰兽魂材质：流动灵焰（上滚）作形体，普通混合，亮度当透明度 → 边缘自然成丝 */
export const spiritFlameMat = (c: number, op = 0.9) => { const m = fxMat('hfx_spirit_flame', c, 1.5, op, { scroll: true, add: false }); return m; };
const flameMeshes = (g: THREE.Object3D) => { g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.onBeforeRender = tickFx; }); return g; };

// ---------------------------------------------------------------- 兽魂（低面数剪影，面朝 +z）
export function spiritWolf(c: number, s = 1) {
  const g = new THREE.Group(), m = spiritFlameMat(c) ?? spiritMat(c);   // 11-14d 灵焰贴图
  g.add(box(0.42, 0.42, 1.1, m, 0, 0.75, 0));                 // 身
  g.add(ball(0.26, m, 0, 0.98, 0.62, 1, 0.95, 1.2));          // 头
  g.add(cone(0.14, 0.42, m, 0, 0.9, 0.95, Math.PI / 2));      // 吻
  g.add(cone(0.07, 0.2, m, -0.12, 1.25, 0.6), cone(0.07, 0.2, m, 0.12, 1.25, 0.6));   // 耳
  g.add(cone(0.1, 0.7, m, 0, 0.85, -0.82, -Math.PI / 2 - 0.5));   // 尾
  for (const [x, z] of [[-0.15, 0.38], [0.15, 0.38], [-0.15, -0.38], [0.15, -0.38]]) g.add(box(0.1, 0.55, 0.1, m, x, 0.3, z));
  g.add(ball(0.05, ghostMat(0xffffff, 1.6, 0.95), -0.1, 1.04, 0.84), ball(0.05, ghostMat(0xffffff, 1.6, 0.95), 0.1, 1.04, 0.84));   // 眼
  g.scale.setScalar(s); return noOl(flameMeshes(g));
}
export function spiritBear(c: number, s = 1) {
  const g = new THREE.Group(), m = spiritFlameMat(c) ?? spiritMat(c);   // 11-14d 灵焰贴图
  g.add(ball(0.62, m, 0, 1.05, 0, 1, 0.9, 1.3));               // 身
  g.add(ball(0.36, m, 0, 1.45, 0.82));                         // 头
  g.add(ball(0.11, m, -0.24, 1.78, 0.78), ball(0.11, m, 0.24, 1.78, 0.78));   // 耳
  g.add(ball(0.16, m, 0, 1.36, 1.14, 1, 0.8, 1));              // 吻
  for (const [x, z] of [[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]]) g.add(box(0.26, 0.7, 0.26, m, x, 0.35, z));
  g.add(ball(0.05, ghostMat(0xffffff, 1.6, 0.95), -0.13, 1.55, 1.12), ball(0.05, ghostMat(0xffffff, 1.6, 0.95), 0.13, 1.55, 1.12));
  g.scale.setScalar(s); return noOl(flameMeshes(g));
}
export function spiritEagle(c: number, s = 1) {
  const g = new THREE.Group(), m = spiritFlameMat(c) ?? spiritMat(c);   // 11-14d 灵焰贴图
  g.add(ball(0.18, m, 0, 0, 0, 0.8, 0.7, 2));                  // 身
  g.add(ball(0.12, m, 0, 0.05, 0.38));                         // 头
  g.add(cone(0.05, 0.18, ghostMat(0xffe0a0, 2, 0.9), 0, 0.03, 0.52, Math.PI / 2));   // 喙
  const wing = (side: number) => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 3), m); w.rotation.set(0, 0, side * Math.PI / 2); w.scale.set(1, 1, 0.12); w.position.set(side * 0.68, 0.02, -0.05); w.name = side < 0 ? 'wl' : 'wr'; return w; };
  g.add(wing(-1), wing(1));
  g.add(cone(0.16, 0.45, m, 0, 0, -0.42, -Math.PI / 2, 0, 0, 3));   // 尾羽
  g.scale.setScalar(s); return noOl(flameMeshes(g));
}
/** 扇动翅膀（每帧调） */
export function flap(g: THREE.Object3D, t: number) { const a = Math.sin(t * 22) * 0.45; const l = g.getObjectByName('wl'), r = g.getObjectByName('wr'); if (l) l.rotation.x = a; if (r) r.rotation.x = a; }

// ---------------------------------------------------------------- 羽刃 / 爪痕
export function featherBlade(c: number, s = 1) {
  const g = new THREE.Group();
  const card = fxCard('hfx_feather', c, 1.15, 0.42, 1.8, 1, true);   // 11-14d GPT 羽刃
  if (card) { g.add(card); const core = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4), glow(0xffffff, 2)); core.rotation.x = Math.PI / 2; g.add(core); g.scale.setScalar(s); return noOl(g); }
  const vane = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 4), ghostMat(c, 1.8, 0.85)); vane.rotation.x = Math.PI / 2; vane.scale.set(1, 1, 0.25); g.add(vane);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), glow(0xffffff, 2.2)); core.rotation.x = Math.PI / 2; g.add(core);
  g.scale.setScalar(s); return noOl(g);
}
/** 11-05 箭矢（猎手鹰契拉弓射出）：木箭杆 + 钢箭头 + 三片箭羽（形态色发光）+ 细光芯；沿 +z 飞（箭头在 +z） */
export function arrowBolt(c: number, s = 1) {
  const g = new THREE.Group(); g.name = 'h_arrow';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 5), toon(0x6a4a2a)); shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toon(0xd8dee6)); head.rotation.x = Math.PI / 2; head.position.z = 0.57; g.add(head);
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.22), ghostMat(c, 1.6, 0.9)); v.position.set(0, 0, -0.4); v.rotation.set(Math.PI / 2, 0, 0);
    const pv = new THREE.Group(); pv.rotation.z = i / 3 * Math.PI * 2; v.position.y = 0.04; pv.add(v); pv.position.z = 0; g.add(pv);
  }
  const trail = fxCard('hfx_arrow_trail', c, 1.9, 0.34, 1.5, 0.9, true);   // 11-14d GPT 箭尾光（头在 +z、尾巴拖向身后）
  if (trail) { trail.position.z = -0.55; g.add(trail); }
  else { const core = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), ghostMat(c, 2.2, 0.55)); core.rotation.x = Math.PI / 2; g.add(core); }
  g.scale.setScalar(s); return noOl(g);
}
/** 三道爪痕：在 p 前方竖着划下，0.3 秒淡出 */
export function clawMarks(F: ClassFxApi, p: P2, dir: P2, c: number, big = false, y = 1.1) {
  const g = new THREE.Group(), n = 3, w = big ? 0.12 : 0.07, h = big ? 1.9 : 1.3;
  const cm = fxMat('hfx_claw', c, 1.7, 1);   // 11-14d GPT 爪痕（图里已是斜向三道）
  if (cm) { const q = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.95, h * 0.95), cm); g.add(q); }
  else for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ghostMat(i === 1 ? 0xe0f0ff : c, i === 1 ? 1.2 : 1.6, 0.9));
    m.position.set((i - 1) * (big ? 0.32 : 0.22), 0, 0); m.rotation.z = 0.35; g.add(m);
  }
  g.position.set(p.x + dir.x * 0.9, F.gy(p.x, p.z) + y, p.z + dir.z * 0.9); g.rotation.y = Math.atan2(dir.x, dir.z);
  noOl(g);
  F.live(g, 0.32, k => { g.scale.set(1, Math.min(1, k * 6), 1); fade(g, 1 - k * k); });
}

// ---------------------------------------------------------------- 铁链 / 墓碑 / 魂火 / 亡者
const IRON = 0x4a4c50, STONE = 0x6a6670;
export function chainLink(s = 1, mat?: THREE.Material) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.11 * s, 0.03 * s, 4, 8), mat ?? toon(IRON)); m.scale.set(1, 1.5, 1); return m; }
/** 一条链：从 a 到 b 的 n 节链环（返回 Group，位置在 a） */
export function chain(len: number, s = 1, mat?: THREE.Material) {
  const g = new THREE.Group(), step = 0.26 * s, n = Math.max(2, Math.round(len / step));
  for (let i = 0; i < n; i++) { const l = chainLink(s, mat); l.position.z = i * step; l.rotation.z = i % 2 ? Math.PI / 2 : 0; l.rotation.x = Math.PI / 2; g.add(l); }
  return g;
}
/** 11-14d GPT 灵契锁链：每米一段（两张交叉卡片），从原点沿 +z 排开；无贴图返回 null */
export function chainStrip(len: number, c: number, s = 1): THREE.Group | null {
  if (!fxTex('hfx_chain')) return null;
  const g = new THREE.Group(), seg = 0.9 * s, n = Math.max(2, Math.ceil(len / seg));
  for (let i = 0; i < n; i++) { const k = fxCard('hfx_chain', c, seg * 1.02, 0.3 * s, 1.8, 1, true); if (!k) return null; k.position.z = (i + 0.5) * seg; g.add(k); }
  return g;
}
export function tombstone(s = 1) {
  const g = new THREE.Group(), m = toon(STONE);
  const slab = box(0.62 * s, 0.9 * s, 0.16 * s, m, 0, 0.45 * s, 0); g.add(slab);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.31 * s, 0.31 * s, 0.16 * s, 12, 1, false, 0, Math.PI), m); cap.rotation.set(Math.PI / 2, 0, Math.PI / 2); cap.position.y = 0.9 * s; g.add(cap);
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.26 * s, 0.34 * s), ghostMat(0xa080ff, 2.2, 0.9)); rune.position.set(0, 0.6 * s, 0.09 * s); g.add(rune);
  return g;
}
export function wisp(c: number, s = 1) {
  const g = new THREE.Group();
  g.add(ball(0.2 * s, ghostMat(c, 1.2, 0.8)));
  g.add(ball(0.1 * s, glow(c, 1.8)));
  const tail = cone(0.16 * s, 0.7 * s, ghostMat(c, 1.4, 0.55), 0, 0, -0.38 * s, -Math.PI / 2); g.add(tail);
  return noOl(g);
}
/** 兜帽亡者剪影（送葬队列） */
export function hooded(c: number, s = 1) {
  const g = new THREE.Group(), m = spiritMat(c);
  g.add(cone(0.42 * s, 1.5 * s, m, 0, 0.75 * s, 0, 0, 0, 0, 7));
  g.add(ball(0.22 * s, m, 0, 1.55 * s, 0.02 * s));
  g.add(ball(0.04 * s, ghostMat(0xc0ffe0, 3, 1), -0.07 * s, 1.56 * s, 0.2 * s), ball(0.04 * s, ghostMat(0xc0ffe0, 3, 1), 0.07 * s, 1.56 * s, 0.2 * s));
  return noOl(g);
}
/** 小飞刀（送行刀） */
export function knife(c: number) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 4), glow(c, 1.6)); b.rotation.x = Math.PI / 2; b.scale.set(1, 1, 0.3); b.position.z = 0.12; g.add(b);
  g.add(box(0.05, 0.05, 0.22, toon(0x3a2a22), 0, 0, -0.22));
  return noOl(g);
}

// ---------------------------------------------------------------- 动作
/** 物体从高处砸到 at（dur 秒），落地时调用 land() */
export function dropOnto(F: ClassFxApi, o: THREE.Object3D, at: P2, h: number, dur: number, land: () => void, hold = 0.5) {
  const y0 = F.gy(at.x, at.z); let landed = false;
  o.position.set(at.x, y0 + h, at.z);
  F.live(o, dur + hold, k => {
    const t = Math.min(1, k * (dur + hold) / dur);
    o.position.y = y0 + h * (1 - t * t);
    if (t >= 1 && !landed) { landed = true; land(); }
    if (landed) { const u = (k * (dur + hold) - dur) / hold; fade(o, 1 - u); if (u > 0.4) o.position.y = y0 - (u - 0.4) / 0.6 * 1.6; }   // 不透明的模型：落地后沉进地里
  });
}
/** 从地下升起，停留后沉下 */
export function riseFromGround(F: ClassFxApi, o: THREE.Object3D, at: P2, depth: number, dur: number) {
  const y0 = F.gy(at.x, at.z); o.position.set(at.x, y0 - depth, at.z);
  F.live(o, dur, k => { const u = k < 0.2 ? k / 0.2 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1; o.position.y = y0 - depth * (1 - (1 - (1 - u) * (1 - u))); });
}
/** 层层外扩的环（钟声 / 嚎叫） */
export function pulses(F: ClassFxApi, p: P2, r: number, color: string, n = 3, gap = 0.12) {
  for (let i = 0; i < n; i++) { const g = new THREE.Group(); let done = false; F.live(g, gap * i + 0.01, k => { if (k >= 1 && !done) { done = true; F.ring(p, r * (0.6 + 0.4 * (i + 1) / n), color, 0.55); } }); }
}
export const hex = (c: string | number) => new THREE.Color(c).getHex();
export const rot = (d: P2, a: number): P2 => ({ x: d.x * Math.cos(a) - d.z * Math.sin(a), z: d.x * Math.sin(a) + d.z * Math.cos(a) });

/** 契印图腾：三段兽面（狼 / 熊 / 鹰）木柱 + 发光符文环 */
export function makeTotem(c: number) {
  const g = new THREE.Group(), wood = toon(0x5a3a26), dark = toon(0x3a2418);
  const seg = (y: number, r: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.62, 8), m); o.position.y = y; g.add(o); return o; };
  seg(0.31, 0.3, dark); seg(0.93, 0.28, wood); seg(1.55, 0.26, dark);
  for (const [y, k] of [[0.42, 0], [1.04, 1], [1.66, 2]] as const) {
    g.add(ball(0.06, ghostMat(c, 3, 1), -0.1, y, 0.27), ball(0.06, ghostMat(c, 3, 1), 0.1, y, 0.27));
    if (k === 2) { const w = box(1.2, 0.12, 0.08, wood, 0, y + 0.18, 0); g.add(w); }   // 鹰翼横木
    if (k === 1) g.add(ball(0.09, wood, -0.22, y + 0.28, 0.12), ball(0.09, wood, 0.22, y + 0.28, 0.12));   // 熊耳
    if (k === 0) g.add(cone(0.07, 0.2, wood, -0.14, y + 0.33, 0.1), cone(0.07, 0.2, wood, 0.14, y + 0.33, 0.1));   // 狼耳
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 4, 16), ghostMat(c, 2.4, 0.9)); ring.rotation.x = Math.PI / 2; ring.position.y = y - 0.25; g.add(ring);
  }
  g.add(cone(0.18, 0.5, dark, 0, -0.15, 0, Math.PI));
  return noOl(g);
}
