// ======================================================================
// 11-18 Rhett「全面重塑钟铜熔炉，除了保留地板那些熔岩龟裂，其他的你根据技能包搭建场景，去除 BOSS 区域地板的圆圈」
//   按 RPG 场景搭建专长包 v0.7 的章节落地（思路学专长包，代码本项目自写）：
//   · 第 1 章 尺度：主路净宽 ≥ 6 m（团队档）；首领场半径沿用 10 / 10 / 13（玩法不动），地面顶面 ≤ 0.03 m（本体红圈画得出来）
//   · 第 4 章 引导：沿主路左右交替的火盆（每 12 m 一只，只自发光），远处炉心烟囱一直发红光 = 终点地标
//   · 第 5 章 地标：浇铸台 = 吊坩埚的铁龙门架；冷却池 = 淬火池 + 冒白汽；炉心 = 加高烟囱 + 一圈挂链石柱
//   · 第 7 章 区域氛围：入口 = 灰尘慢飘，浇铸台 = 火星，冷却池 = 白色蒸汽（冷），炉心 = 余烬（最密、上升最快，红色独一份）
//   · 第 8 章 填充散布：大件（熔渣巨石）贴边、中件（碎钟模 / 铜锭）挂在大件旁、小件（熔渣碎块）挂在中件旁；
//                    给主路 / 首领场 / 营地 / 熔岩池让位；石头埋 22%；同类一个 InstancedMesh
//   · 第 9 章 玩法：每组小怪 6 m 内补一块掩体巨石（远离主路一侧）
//   去掉：三个首领场的石盘 + 发光圆环（arena 圆圈）、旧的随手撒的钟模。保留：熔岩池（forge_lava_hd，熔岩龟裂硬壳）、大熔炉 + 吊钟。
//   ?off=forgescene 回旧场景（圆盘 + 圆环 + 随机钟模）。低画质：去掉粒子、门架 / 柱只留几何。
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { sceneOr } from './lux_dlc';
import { bellGeo } from './models_bt';
import { waterUp, waterBind, rippleNormal, radialFade } from './water_fx';

export const forgeSceneOn = () => { try { return !/(?:[?&]off=[^&]*\bforgescene\b)/.test(location.search); } catch { return true; } };
const lo = () => curQuality === 'low';
export const forgeSceneStats = { slabs: 0, braziers: 0, big: 0, mid: 0, small: 0, cover: 0, particles: 0, blocks: 0 };

function rng(seed: number) { let s = (seed * 9301 + 49297) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const noOutline = <T extends THREE.Object3D>(o: T): T => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };

// ---------------------------------------------------------------- 首领场地面（无圆圈）：程序化 canvas 石板 + 发光板缝
type FloorKind = 'cast' | 'wet' | 'scorch';
const floorTex = new Map<FloorKind, { map: THREE.CanvasTexture; em: THREE.CanvasTexture }>();
function floorTextures(kind: FloorKind) {
  const hit = floorTex.get(kind); if (hit) return hit;
  const N = 512, R = rng(kind === 'cast' ? 11 : kind === 'wet' ? 23 : 37);
  const cm = document.createElement('canvas'), ce = document.createElement('canvas'); cm.width = cm.height = ce.width = ce.height = N;
  const a = cm.getContext('2d')!, e = ce.getContext('2d')!;
  const base = kind === 'cast' ? [58, 50, 44] : kind === 'wet' ? [40, 44, 46] : [30, 24, 22];
  a.fillStyle = `rgb(${base.join(',')})`; a.fillRect(0, 0, N, N); e.fillStyle = '#000'; e.fillRect(0, 0, N, N);
  const c = N / 2;
  // 同心环 + 径向切分的石板（环宽 0.18N，每环块数随半径增加），每块色差 / 缺角
  for (let ring = 0; ring < 3; ring++) {
    const r0 = ring === 0 ? 0 : 0.17 * N * ring, r1 = 0.17 * N * (ring + 1) + (ring === 2 ? 0.03 * N : 0), n = ring === 0 ? 1 : 6 + ring * 5;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2 + ring * 0.3, a1 = (i + 1) / n * Math.PI * 2 + ring * 0.3, k = 0.82 + R() * 0.3;
      a.fillStyle = `rgb(${base.map(v => Math.round(v * k)).join(',')})`;
      a.beginPath(); if (ring === 0) a.arc(c, c, r1 - 3, 0, Math.PI * 2); else { a.arc(c, c, r1 - 3, a0 + 0.006, a1 - 0.006); a.arc(c, c, r0 + 3, a1 - 0.006, a0 + 0.006, true); } a.closePath(); a.fill();
      // 板面细噪：碎点
      for (let j = 0; j < 40; j++) { const t = a0 + (a1 - a0) * R(), rr = r0 + (r1 - r0) * R(); a.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,230,200'},${0.04 + R() * 0.06})`; a.fillRect(c + Math.cos(t) * rr, c + Math.sin(t) * rr, 2 + R() * 4, 2 + R() * 4); }
    }
  }
  // 板缝发光：浇铸台 = 径向导流槽（熔铜流过的槽）；炉心 = 不规则龟裂（亮）；冷却池 = 几乎不亮（冷）
  const glow = kind === 'cast' ? 'rgba(255,120,30,' : kind === 'scorch' ? 'rgba(255,70,15,' : 'rgba(120,170,190,';
  const gk = kind === 'wet' ? 0.25 : 1;
  e.lineCap = 'round';
  if (kind === 'cast') for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2 + 0.2; e.strokeStyle = glow + (0.8 * gk) + ')'; e.lineWidth = 5; e.beginPath(); e.moveTo(c + Math.cos(t) * N * 0.08, c + Math.sin(t) * N * 0.08); e.lineTo(c + Math.cos(t) * N * 0.47, c + Math.sin(t) * N * 0.47); e.stroke(); }
  const cracks = kind === 'scorch' ? 26 : 10;
  for (let i = 0; i < cracks; i++) {
    let x = c + (R() - 0.5) * N * 0.8, y = c + (R() - 0.5) * N * 0.8, ang = R() * 6.28;
    if (Math.hypot(x - c, y - c) > N * 0.47) continue;
    e.strokeStyle = glow + ((kind === 'scorch' ? 0.85 : 0.45) * gk) + ')'; e.lineWidth = 1.5 + R() * 2.5; e.beginPath(); e.moveTo(x, y);
    for (let k = 0; k < 6; k++) { ang += (R() - 0.5) * 1.2; x += Math.cos(ang) * 14; y += Math.sin(ang) * 14; e.lineTo(x, y); } e.stroke();
  }
  const map = new THREE.CanvasTexture(cm), em = new THREE.CanvasTexture(ce); map.colorSpace = THREE.SRGBColorSpace; em.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = em.anisotropy = 4;
  const out = { map, em }; floorTex.set(kind, out); return out;
}
/** 首领场地面：r 半径；边缘不画圈，外沿碎边混进地面（alpha 渐隐 + 一圈半埋碎板） */
function bossFloor(r: number, kind: FloorKind, seed: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'forgeFloor';
  const { map, em } = floorTextures(kind), R = rng(seed);
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: kind === 'scorch' ? 1.3 : kind === 'cast' ? 0.9 : 0.4,
    roughness: kind === 'wet' ? 0.35 : 0.85, metalness: kind === 'cast' ? 0.25 : 0.05, transparent: true, alphaMap: radialFade(), depthWrite: true });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.18, 64), mat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.025; disc.receiveShadow = true; g.add(disc);
  // 外沿半埋碎板（打散圆形轮廓）
  const sg = new THREE.BoxGeometry(1, 0.16, 1), sm = new THREE.MeshStandardMaterial({ color: kind === 'wet' ? 0x2a2e30 : 0x2e2622, roughness: 0.9, flatShading: true });
  const n = Math.round(r * 2.2), inst = new THREE.InstancedMesh(sg, sm, n), o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, rr = r * (1.02 + R() * 0.2), w = 0.6 + R() * 1.1; o.position.set(Math.cos(a) * rr, -0.02, Math.sin(a) * rr); o.rotation.set((R() - 0.5) * 0.25, R() * 3, (R() - 0.5) * 0.25); o.scale.set(w, 1, w * (0.5 + R() * 0.5)); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
  inst.receiveShadow = true; g.add(inst); forgeSceneStats.slabs += n;
  return noOutline(g);
}

// ---------------------------------------------------------------- 地标
const ironM = () => new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.7, roughness: 0.55 });
const stoneM = (c = 0x2c2420) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true });
const hotM = (c = 0xff6a18, k = 2.2) => new THREE.MeshStandardMaterial({ color: 0x220800, emissive: c, emissiveIntensity: k, roughness: 0.6 });
/** 浇铸台：铁龙门架（两柱一梁）+ 吊坩埚 + 倾倒的铜水流 + 下方钟模 */
function gantry(api: WildBuildApi, x: number, z: number, ry: number) {
  const g = new THREE.Group(), im = ironM();
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9, 0.7), im); col.position.set(s * 5.5, 4.5, 0); col.castShadow = true; g.add(col);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), stoneM()); foot.position.set(s * 5.5, 0.3, 0); g.add(foot);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), im); brace.position.set(s * 4.5, 7.6, 0); brace.rotation.z = s * 0.75; g.add(brace);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.8, 0.9), im); beam.position.y = 9.2; beam.castShadow = true; g.add(beam);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), im); chain.position.set(1.2, 7.6, 0); g.add(chain);
  const cru = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 1.4, 16, 1, true), im); (cru.material as THREE.Material).side = THREE.DoubleSide; cru.position.set(1.2, 5.8, 0); cru.rotation.z = 0.55; g.add(cru);
  const melt = new THREE.Mesh(new THREE.CircleGeometry(1.0, 16), hotM(0xff8a28, 2.6)); melt.rotation.x = -Math.PI / 2; melt.position.set(0, 0.55, 0); cru.add(melt);
  if (!lo()) { const pour = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 4.4, 8), hotM(0xffa040, 3)); pour.position.set(0.35, 3.1, 0); g.add(pour); }
  const mold = new THREE.Mesh(bellGeo(1.1, 1.9, 16), stoneM(0x3a3028)); (mold.material as THREE.Material).side = THREE.DoubleSide; mold.position.set(0.3, 0, 0); g.add(mold);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), hotM(0xff7020, 2)); ring.rotation.x = -Math.PI / 2; ring.position.set(0.3, 1.75, 0); g.add(ring);
  api.add(noOutline(g), x, z, ry); api.block?.(x + Math.cos(ry) * 5.5, z - Math.sin(ry) * 5.5, 0.7); api.block?.(x - Math.cos(ry) * 5.5, z + Math.sin(ry) * 5.5, 0.7); api.block?.(x, z, 1.4);
  forgeSceneStats.blocks += 3;
}
/** 冷却池：淬火水池（秋林水体）+ 石沿 + 水边一排冷却中的钟 */
function quenchPool(api: WildBuildApi, x: number, z: number, r: number) {
  const g = new THREE.Group();
  const nm = rippleNormal().clone(); nm.repeat.set(r / 2, r / 2); nm.needsUpdate = true;
  const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), alphaMap: radialFade(), roughness: 0.12 });
  const w = new THREE.Mesh(new THREE.CircleGeometry(r, 48), waterUp(wm, { ql: true, edge: 'alpha', shallow: 0x22383a, deep: 0x06100f, sky: 0x8a6a58, foamW: 0.12, caus: 0.1, speed: 0.4, depth: 2.2 }, lo()));
  w.rotation.x = -Math.PI / 2; w.position.y = 0.03; waterBind(w); g.add(w);
  const R = rng(91), sm = stoneM(0x342c28);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + R() * 0.1, b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.8), sm); b.position.set(Math.cos(a) * (r + 0.35), 0.12, Math.sin(a) * (r + 0.35)); b.rotation.y = -a + Math.PI / 2; b.rotation.z = (R() - 0.5) * 0.1; b.castShadow = true; g.add(b); }
  for (let i = 0; i < 4; i++) { const a = 0.4 + i * 0.5, bell = sceneOr('scene_wl_cracked_bell', { h: 1.5 + R() * 0.5 }, () => { const m = new THREE.Mesh(bellGeo(0.7, 1.3, 14), stoneM(0x5a4030)); (m.material as THREE.Material).side = THREE.DoubleSide; const gg = new THREE.Group(); gg.add(m); return gg; });
    bell.position.set(Math.cos(a) * (r + 1.8), 0, Math.sin(a) * (r + 1.8)); bell.rotation.y = R() * 6; g.add(bell); }
  api.add(noOutline(g), x, z);
  if (!lo()) api.add(particles('steam', r * 0.8, 70), x, z);
}
/** 炉心：一圈挂链石柱（柱顶火盆）；熔炉本体在 forge.ts，这里给它加高烟囱 + 顶上红光 = 全图终点地标 */
function coreRing(api: WildBuildApi, x: number, z: number, r: number) {
  const R = rng(57);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.5 + (i - 2.5) / 6 * Math.PI * 1.7;   // 入口方向（+z）留开
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 6.5, 8), stoneM(0x2a201c)); col.position.y = 3.25; col.castShadow = true; g.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.6, 8), ironM()); cap.position.y = 6.8; g.add(cap);
    const coal = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hotM(0xff4a10, 2.4)); coal.position.y = 7.05; g.add(coal);
    const ch = sceneOr('scene_chain', { h: 3.2 }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), ironM()); m.position.y = -1.6; const gg = new THREE.Group(); gg.add(m); return gg; });
    ch.position.set(0.8, 6.4, 0); ch.rotation.z = 0.2 + R() * 0.2; g.add(ch);
    api.add(noOutline(g), px, pz, -a); api.block?.(px, pz, 1.0); forgeSceneStats.blocks++;
  }
}
export function chimney(): THREE.Group {
  const g = new THREE.Group();
  const st = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.6, 26, 10), stoneM(0x221a16)); st.position.y = 13; st.castShadow = true; g.add(st);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.35, 6, 16), hotM(0xff4a10, 2.2)); lip.rotation.x = Math.PI / 2; lip.position.y = 26; g.add(lip);
  if (!lo()) { const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4010, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); col.position.y = 33; g.add(col); }
  return noOutline(g);
}

// ---------------------------------------------------------------- 引导火盆（只自发光，不加灯）
function brazier(): THREE.Group {
  const g = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 6), ironM()); leg.position.y = 0.55; g.add(leg);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 10, 1, true), ironM()); (bowl.material as THREE.Material).side = THREE.DoubleSide; bowl.position.y = 1.25; g.add(bowl);
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), hotM(0xff7a20, 2.6)); coal.rotation.x = -Math.PI / 2; coal.position.y = 1.36; g.add(coal);
  return noOutline(g);
}

// ---------------------------------------------------------------- 第 7 章粒子（GPU 动画，CPU 只推时间）
type PKind = 'dust' | 'spark' | 'steam' | 'ember';
const PK: Record<PKind, { c: number; size: number; rise: number; sway: number; life: number; h: number; add: boolean; a: number }> = {
  dust: { c: 0xb8a890, size: 0.05, rise: 0.02, sway: 0.35, life: 9, h: 3, add: false, a: 0.35 },
  spark: { c: 0xffa040, size: 0.06, rise: 0.15, sway: 0.3, life: 5, h: 4, add: true, a: 0.9 },
  steam: { c: 0xd8e4e8, size: 0.9, rise: 0.6, sway: 0.5, life: 6, h: 5, add: false, a: 0.12 },
  ember: { c: 0xff5018, size: 0.07, rise: 1.1, sway: 1.4, life: 4, h: 9, add: true, a: 1 },
};
const PT = { uT: { value: 0 } };
function particles(kind: PKind, r: number, n: number): THREE.Points {
  const P = PK[kind], R = rng(n * 7 + r * 13), s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const a = R() * 6.283, rr = Math.sqrt(R()) * r; s.set([Math.cos(a) * rr, Math.sin(a) * rr, R(), 0.7 + R() * 0.6], i * 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.h / 2, 0), r + P.h);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: P.add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !P.add,
    uniforms: { uT: PT.uT, uC: { value: new THREE.Color(P.c) } },
    vertexShader: `attribute vec4 seed; uniform float uT; varying float vA;
void main(){ float t = fract(uT / ${P.life.toFixed(1)} * seed.w + seed.z);
  vec3 p = vec3(seed.x + sin(uT * 0.7 + seed.z * 20.0) * ${P.sway.toFixed(2)} * t, t * ${(P.rise * P.life).toFixed(2)} + 0.2, seed.y + cos(uT * 0.6 + seed.z * 13.0) * ${P.sway.toFixed(2)} * t);
  p.y = min(p.y, ${P.h.toFixed(1)});
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  vA = sin(t * 3.14159) * smoothstep(1.5, 4.0, -mv.z) * ${P.a.toFixed(2)};
  gl_PointSize = ${P.size.toFixed(2)} * (0.8 + t * ${kind === 'steam' ? '1.6' : '0.3'}) * 600.0 / max(-mv.z, 0.1); }`,
    fragmentShader: `uniform vec3 uC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard;
  float a = smoothstep(0.5, ${kind === 'steam' ? '0.0' : '0.15'}, d) * vA; gl_FragColor = vec4(uC * ${P.add ? 'a * 2.0' : '1.0'}, a); }` });
  m.userData.outlineParameters = { visible: false };
  const pts = new THREE.Points(g, m); pts.renderOrder = 6; pts.onBeforeRender = () => { PT.uT.value = performance.now() / 1000; };
  forgeSceneStats.particles += n; return pts;
}

// ---------------------------------------------------------------- 第 8 章散布
type Pt = { x: number; z: number };
function segDist(p: Pt, a: Pt, b: Pt) { const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); }
export type ForgeLayout = { path: Pt[]; arenas: { x: number; z: number; r: number }[]; keep: { x: number; z: number; r: number }[]; half: number; trash: Pt[] };
function scatter(api: WildBuildApi, L: ForgeLayout) {
  const R = rng(4242);
  const pathD = (p: Pt) => { let d = 1e9; for (let i = 0; i < L.path.length - 1; i++) d = Math.min(d, segDist(p, L.path[i], L.path[i + 1])); return d; };
  const free = (p: Pt, rad: number, pathClear: number) => pathD(p) > pathClear + rad && L.arenas.every(a => Math.hypot(p.x - a.x, p.z - a.z) > a.r + 2 + rad) && L.keep.every(k => Math.hypot(p.x - k.x, p.z - k.z) > k.r + rad);
  const edgeK = (p: Pt) => { const e = L.half - Math.max(Math.abs(p.x), Math.abs(p.z)); return 1 - Math.min(1, Math.max(0, (e - 6) / 26)); };   // 越靠边越容易落（贴墙）
  // 大件：熔渣巨石
  const big: { p: Pt; s: number }[] = [];
  for (let i = 0; i < 900 && big.length < 34; i++) { const p = { x: (R() * 2 - 1) * (L.half - 4), z: (R() * 2 - 1) * (L.half - 4) }, s = 1.0 + Math.pow(R(), 2.2) * 1.6;
    if (R() > 0.15 + 0.85 * edgeK(p)) continue; if (!free(p, s, 1.8)) continue; if (big.some(b => Math.hypot(b.p.x - p.x, b.p.z - p.z) < 4 + (b.s + s) * 0.5)) continue; big.push({ p, s }); }
  // 第 9 章掩体：每组小怪 6 m 内要有大件，没有就在远离主路一侧 3.2 m 补一块
  for (const t of L.trash) { if (big.some(b => Math.hypot(b.p.x - t.x, b.p.z - t.z) < 6)) continue;
    let best: Pt | null = null, bd = -1; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, p = { x: t.x + Math.cos(a) * 3.2, z: t.z + Math.sin(a) * 3.2 }; const d = pathD(p); if (d > bd && L.arenas.every(ar => Math.hypot(p.x - ar.x, p.z - ar.z) > ar.r + 1)) { bd = d; best = p; } }
    if (best && bd > 2.2) { big.push({ p: best, s: 1.9 }); forgeSceneStats.cover++; } }
  // 中件挂在大件旁（50%），其余散在空处；小件挂在中件旁（60%）
  const mid: { p: Pt; s: number; k: number }[] = [];
  for (let i = 0; i < 1400 && mid.length < 70; i++) { const s = 0.35 + Math.pow(R(), 2.2) * 0.5; let p: Pt;
    if (R() < 0.5 && big.length) { const b = big[Math.floor(R() * big.length)], a = R() * 6.283, d = (b.s + s) * 0.5 * (1 + R() * 0.9); p = { x: b.p.x + Math.cos(a) * d, z: b.p.z + Math.sin(a) * d }; }
    else p = { x: (R() * 2 - 1) * (L.half - 3), z: (R() * 2 - 1) * (L.half - 3) };
    if (!free(p, s, 1.0)) continue; if (mid.some(m => Math.hypot(m.p.x - p.x, m.p.z - p.z) < 1)) continue; mid.push({ p, s, k: R() < 0.55 ? 0 : 1 }); }
  const small: { p: Pt; s: number }[] = [];
  for (let i = 0; i < 2600 && small.length < 260; i++) { const s = 0.06 + Math.pow(R(), 2.2) * 0.14; let p: Pt;
    if (R() < 0.6 && mid.length) { const m = mid[Math.floor(R() * mid.length)], a = R() * 6.283, d = (m.s + s) * 0.5 * (1 + R() * 0.9); p = { x: m.p.x + Math.cos(a) * d, z: m.p.z + Math.sin(a) * d }; }
    else p = { x: (R() * 2 - 1) * (L.half - 2), z: (R() * 2 - 1) * (L.half - 2) };
    if (L.arenas.some(a => Math.hypot(p.x - a.x, p.z - a.z) < a.r * 0.6)) continue; small.push({ p, s }); }
  // 实例化：大件 = 熔渣巨石（扁十二面体），中件 = 碎钟模 / 铜锭，小件 = 熔渣碎块
  const o = new THREE.Object3D();
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: { p: Pt; s: number }[], sy: number, bury: number, cast: boolean) => {
    if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { const gy = api.groundY(it.p.x, it.p.z); o.position.set(it.p.x, gy - it.s * sy * bury, it.p.z); o.rotation.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4); o.scale.set(it.s, it.s * sy, it.s * (0.8 + R() * 0.4)); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; noOutline(im);
    const holder = new THREE.Group(); holder.add(im); api.add(holder, 0, 0); holder.position.y -= api.groundY(0, 0);   // 实例自带贴地高度，抵掉 api.add 的贴地
  };
  const slag = new THREE.MeshStandardMaterial({ color: 0x1e1814, roughness: 0.95, flatShading: true, emissive: 0x200600, emissiveIntensity: 0.4 });
  mk(new THREE.DodecahedronGeometry(1, 0), slag, big, 0.7, 0.22, true);
  mk(bellGeo(0.5, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.9, side: THREE.DoubleSide }), mid.filter(m => m.k === 0), 1, 0.25, true);
  mk(new THREE.BoxGeometry(1, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a5a24, metalness: 0.75, roughness: 0.4 }), mid.filter(m => m.k === 1).map(m => ({ p: m.p, s: m.s * 1.4 })), 1, 0.1, true);
  mk(new THREE.DodecahedronGeometry(1, 0), slag, small, 0.6, 0.25, false);
  for (const b of big) if (b.s > 1.3) { api.block?.(b.p.x, b.p.z, 0.45 * b.s * 1.4); forgeSceneStats.blocks++; }
  forgeSceneStats.big = big.length; forgeSceneStats.mid = mid.length; forgeSceneStats.small = small.length;
}

// ---------------------------------------------------------------- 总装
export function forgeScene(api: WildBuildApi, L: ForgeLayout & { b1: Pt; b2: Pt; b3: Pt; furnace: Pt }) {
  Object.assign(forgeSceneStats, { slabs: 0, braziers: 0, big: 0, mid: 0, small: 0, cover: 0, particles: 0, blocks: 0 });
  // 首领场地面（无圆圈）
  api.add(bossFloor(10, 'cast', 3), L.b1.x, L.b1.z);
  api.add(bossFloor(10, 'wet', 5), L.b2.x, L.b2.z);
  api.add(bossFloor(13, 'scorch', 7), L.b3.x, L.b3.z);
  // 地标
  gantry(api, L.b1.x - 13.5, L.b1.z - 2, Math.PI / 2);   // 浇铸台西侧，门架横跨在场地外沿
  quenchPool(api, L.b2.x - 15, L.b2.z - 3, 4.2);         // 冷却池在场地西外侧（首领「淬火」：站在池外）
  coreRing(api, L.b3.x, L.b3.z, 17);
  api.add(chimney(), L.furnace.x, L.furnace.z);
  // 引导火盆：主路两侧交替，每 12 m；进首领场 / 营地范围不放
  let side = 1, acc = 6;
  for (let i = 0; i < L.path.length - 1; i++) { const a = L.path[i], b = L.path[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (; acc < len; acc += 12) { const t = acc / len, p = { x: a.x + (b.x - a.x) * t + nx * 4 * side, z: a.z + (b.z - a.z) * t + nz * 4 * side };
      if (L.arenas.some(ar => Math.hypot(p.x - ar.x, p.z - ar.z) < ar.r + 2) || L.keep.some(k => Math.hypot(p.x - k.x, p.z - k.z) < k.r)) continue;
      api.add(brazier(), p.x, p.z); api.block?.(p.x, p.z, 0.4); forgeSceneStats.braziers++; side = -side; }
    acc -= len; }
  // 区域氛围粒子（第 7 章：入口灰尘 → 浇铸台火星 → 冷却池蒸汽 → 炉心余烬最密）
  if (!lo()) {
    api.add(particles('dust', 12, 50), 0, 40);
    api.add(particles('spark', 11, 90), L.b1.x, L.b1.z);
    api.add(particles('ember', 15, 220), L.b3.x, L.b3.z);
  }
  scatter(api, L);
}
