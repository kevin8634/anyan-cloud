// ======================================================================
// DLC1 镜渊城 · 第五轮：地底海穹顶（概念图 sky_mirror_abyss + B3）
//   1. 岩穹顶：压扁的半椭球（内侧），湿黑岩 shader（多层噪声起伏 + 假法线受月光），天顶偏东北一个参差破口：
//      破口里是从水下看上层水面（波动的亮网纹）+ 冷月（随波纹抖动），破口周围岩面有青绿焦散 + 银色月光边
//   2. 月光光柱：沿月亮方向从破口斜照到长街附近（加色圆筒，竖向丝缕，缓慢流动）
//   3. 远景环带：比赛版用 sky_mirror_abyss 中段（倒悬塔尖 / 海雾 / 远处沉钟楼与沉船桅杆，左右接缝离线羽化），普通版程序化剪影
//   4. 钟乳石：实例化（破口避开，湖上方和穹顶边缘更密）
//   5. 倒悬城：40–60 座倒挂塔楼 / 钟楼 / 房屋 / 尖塔（程序化 4 种，合批成 InstancedMesh；比赛版再加 Lux3D 倒挂钟楼实例），
//      青色窗光、挂铜钟、挂青灯；整组名 sea_city —— 浅水反射里隐藏，只在深水镜面里倒映
//   档位：low 城 24 / 钟乳石 40 / 无光柱；medium 36 / 90；high 50 / 170；ultra 58（含 Lux3D）/ 280
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WildBuildApi } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { QL_DEMO } from '../../web/map_look';
import { makeGlbScene } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { PACK_TEXTURES } from './textures.gen';
import { SEA_MOON, LAKE, h3 } from './seafloor';
import { seaU, seaEnv as seaEnvTex } from './seabed';
import { cyanLamps } from './mirrorlake';
import { sceneInstSrc } from './lux_dlc';

const DOME = { x: 10, z: 0, R: 150, H: 70, y0: -2 };
/** 穹顶内表面高度（局部坐标） */
export const domeY = (x: number, z: number) => { const r = Math.hypot(x - DOME.x, z - DOME.z) / DOME.R; return DOME.y0 + DOME.H * Math.sqrt(Math.max(0, 1 - r * r)); };
/** 破口中心（月亮方向上）与半径 */
export const HOLE = { x: 40, z: 36, r: 21 };
export const skyStats = { city: 0, lux: 0, stal: 0, windows: 0, bells: 0, lamps: 0, band: '' };

const NOISE3 = `
float sk_h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float sk_n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sk_h(i), sk_h(i + vec3(1,0,0)), f.x), mix(sk_h(i + vec3(0,1,0)), sk_h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sk_h(i + vec3(0,0,1)), sk_h(i + vec3(1,0,1)), f.x), mix(sk_h(i + vec3(0,1,1)), sk_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sk_f(vec3 p){ return sk_n(p) * 0.5 + sk_n(p * 2.03) * 0.25 + sk_n(p * 4.1) * 0.15 + sk_n(p * 8.3) * 0.1; }`;

// ---------------------------------------------------------------- 1. 穹顶
function domeMesh(O: { x: number; z: number }): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 128, 48, 0, Math.PI * 2, 0, Math.PI / 2 + 0.08);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: true, fog: false,
    uniforms: { uTime: seaU.uTime, uHole: { value: new THREE.Vector3(O.x + HOLE.x, domeY(HOLE.x, HOLE.z), O.z + HOLE.z) }, uHoleR: { value: HOLE.r }, uMoon: { value: new THREE.Vector3(...SEA_MOON).normalize() } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uHole; uniform float uHoleR; uniform vec3 uMoon; varying vec3 vW;
${NOISE3}
void main(){
  vec3 V = normalize(vW - cameraPosition); float dist = length(vW - cameraPosition);
  vec2 hp = vW.xz - uHole.xz; float hd = length(hp), ang = atan(hp.y, hp.x);
  float rag = sk_f(vec3(cos(ang) * 2.2, sin(ang) * 2.2, 3.0)) * 0.55 + sk_n(vec3(cos(ang) * 9.0, sin(ang) * 9.0, 1.0)) * 0.2;
  float edgeR = uHoleR * (0.72 + rag * 0.62);
  float inHole = 1.0 - smoothstep(edgeR - 0.6, edgeR + 0.6, hd);
  // 湿黑岩：大尺度起伏 + 层状裂理，假法线（噪声梯度）受破口月光
  vec3 q = vW * 0.03; float e = 0.6;
  float h0 = sk_f(q), hx = sk_f(q + vec3(e * 0.05, 0.0, 0.0)), hz = sk_f(q + vec3(0.0, 0.0, e * 0.05));
  float strata = sin(vW.y * 0.9 + sk_n(vW * 0.08) * 6.0) * 0.5 + 0.5;
  vec3 rock = vec3(0.034, 0.046, 0.045) * (0.3 + 1.5 * h0) * (0.75 + 0.5 * strata);
  vec3 bump = normalize(vec3((hx - h0) * 40.0, 1.0, (hz - h0) * 40.0));
  vec3 L = normalize(uHole + vec3(0.0, 30.0, 0.0) - vW);
  float ndl = max(0.0, dot(bump, L) * 0.7 + 0.3); rock *= 0.6 + 0.8 * max(0.0, dot(bump, normalize(vec3(0.3, -1.0, 0.2))) * 0.5 + 0.5);
  float nearH = exp(-max(0.0, hd - edgeR) / 26.0);
  rock += vec3(0.42, 0.55, 0.56) * ndl * nearH * 0.16;
  // 破口周围青绿焦散（扭曲域交叉正弦网纹，缓慢流动）
  vec2 cp = vW.xz * 0.11 + vec2(sk_n(vW * 0.05 + uTime * 0.05), sk_n(vW * 0.05 + 7.0 - uTime * 0.04)) * 2.4;
  float c1 = abs(sin(cp.x * 2.0 + uTime * 0.35) + sin(cp.y * 2.3 - uTime * 0.3) + sin((cp.x + cp.y) * 1.6 + uTime * 0.2));
  float caus = pow(max(0.0, 1.0 - c1 * 0.55), 4.0);
  rock += vec3(0.2, 0.75, 0.62) * caus * nearH * (0.1 + 0.18 * nearH);
  // 破口边缘：月光勾出的银边
  float rim = exp(-pow((hd - edgeR) / 1.8, 2.0));
  rock += vec3(0.5, 0.62, 0.62) * rim * 0.22 * (0.6 + 0.4 * sk_n(vec3(ang * 6.0, 0.0, 0.0)));
  // 远处穹顶淡入墨绿海雾
  float fogK = 1.0 - exp(-dist * 0.0065);
  rock = mix(rock, vec3(0.022, 0.05, 0.046), fogK * 0.55);
  // 破口里：从水下仰望上层水面 —— 亮网纹波光 + 冷月（随波纹抖动）
  vec2 sp = V.xz / max(V.y, 0.15) * 26.0;
  vec2 wp = sp + vec2(sk_n(vec3(sp * 0.07, uTime * 0.15)), sk_n(vec3(sp * 0.07 + 9.0, uTime * 0.13))) * 6.0;
  float net = abs(sin(wp.x * 0.5 + uTime * 0.6) + sin(wp.y * 0.55 - uTime * 0.5) + sin((wp.x - wp.y) * 0.4 + uTime * 0.4));
  float wave = pow(max(0.0, 1.0 - net * 0.5), 3.0);
  vec3 sky = vec3(0.07, 0.13, 0.14) + vec3(0.32, 0.46, 0.46) * wave;
  vec3 Vw = normalize(V + vec3(sin(wp.y * 0.3 + uTime) , 0.0, cos(wp.x * 0.3 - uTime)) * 0.006);
  float md = dot(Vw, uMoon);
  float disc = smoothstep(0.99935, 0.99955, md), glow = pow(max(md, 0.0), 260.0) * 0.55 + pow(max(md, 0.0), 40.0) * 0.12;
  float mare = sk_f(vec3(Vw * 260.0)); 
  sky += vec3(0.86, 0.95, 0.96) * disc * (0.85 - mare * 0.25) * 1.25 + vec3(0.55, 0.72, 0.74) * glow;
  vec3 col = mix(rock, sky, inHole);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  m.userData.outlineParameters = { visible: false };
  const d = new THREE.Mesh(geo, m); d.scale.set(DOME.R, DOME.H, DOME.R); d.position.set(O.x + DOME.x, DOME.y0, O.z + DOME.z); d.name = 'sea_dome'; d.frustumCulled = false; d.renderOrder = -5;
  return d;
}

// ---------------------------------------------------------------- 2. 光柱
function godRays(O: { x: number; z: number }): THREE.Mesh {
  const top = new THREE.Vector3(O.x + HOLE.x, domeY(HOLE.x, HOLE.z) - 1, O.z + HOLE.z), md = new THREE.Vector3(...SEA_MOON).normalize();
  const L = (top.y - 0.5) / md.y;
  const geo = new THREE.CylinderGeometry(HOLE.r * 0.62, HOLE.r * 0.95, L, 48, 1, true); geo.translate(0, -L / 2, 0);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: seaU.uTime },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
${NOISE3}
void main(){
  vec3 V = normalize(cameraPosition - vW); float side = pow(1.0 - abs(dot(normalize(vN), V)), 1.5);
  float streak = sk_n(vec3(vUv.x * 48.0, vUv.y * 1.5 - uTime * 0.05, 0.0)) * 0.6 + sk_n(vec3(vUv.x * 130.0, vUv.y * 3.0 + uTime * 0.03, 3.0)) * 0.4;
  float a = smoothstep(0.35, 0.9, streak) * (1.0 - side) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y) * 0.05;
  float near = smoothstep(4.0, 22.0, length(cameraPosition - vW));
  gl_FragColor = vec4(vec3(0.55, 0.8, 0.78) * a * near, 1.0);
}` });
  m.userData.outlineParameters = { visible: false };
  const c = new THREE.Mesh(geo, m); c.position.copy(top); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), md); c.name = 'sea_godrays'; c.frustumCulled = false; c.renderOrder = 11;
  return c;
}

// ---------------------------------------------------------------- 3. 远景环带
function bandTexture(): THREE.Texture {
  const src = PACK_TEXTURES['sky_band'];
  if (src) { const t = new THREE.TextureLoader().load(src); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; skyStats.band = 'image'; return t; }
  // 普通版：程序化剪影（沉钟楼 / 桅杆 / 倒挂塔尖 + 海雾带）
  const W = 2048, H = 360, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1a1a'); gr.addColorStop(0.5, '#173030'); gr.addColorStop(1, '#040a0a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#081212';
  for (let i = 0; i < 60; i++) { const x = r() * W, w = 6 + r() * 20, h = 20 + r() * 70; g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x + w, 0); g.lineTo(x, h); g.fill(); }   // 倒挂塔尖
  for (let i = 0; i < 14; i++) { const x = r() * W, w = 8 + r() * 14, h = 30 + r() * 50, y = H * 0.56; g.fillRect(x - w / 2, y - h, w, h); g.beginPath(); g.moveTo(x - w / 2 - 2, y - h); g.lineTo(x + w / 2 + 2, y - h); g.lineTo(x, y - h - 18 - r() * 20); g.fill(); }   // 沉钟楼
  g.fillRect(W * 0.6, H * 0.56 - 60, 2, 60); g.fillRect(W * 0.6 - 18, H * 0.56 - 48, 36, 2);   // 桅杆
  g.filter = 'blur(8px)'; g.fillStyle = 'rgba(70,110,104,0.35)'; for (let i = 0; i < 9; i++) g.fillRect(0, H * (0.5 + r() * 0.1), W, 4 + r() * 8); g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; skyStats.band = 'procedural'; return t;
}
function horizonBand(O: { x: number; z: number }): THREE.Mesh {
  const R = 136, Hh = 62, geo = new THREE.CylinderGeometry(R, R, Hh, 96, 1, true);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: { map: { value: bandTexture() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
void main(){ vec3 c = texture2D(map, vec2(vUv.x * 2.0, vUv.y)).rgb; c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))), c, 0.6) * vec3(0.8, 0.95, 0.92);
  float a = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.34, 0.56, vUv.y));   // v1.2.54 Rhett：远景带上半截是画出来的平顶岩穹 + 剪影钟乳石（像一块破布、没纹理）→ 只留下半截海雾与远城剪影，顶部交给 3D 穹顶 / 钟乳石
  gl_FragColor = vec4(c * 0.85, a * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  m.userData.outlineParameters = { visible: false };
  const b = new THREE.Mesh(geo, m); b.position.set(O.x + DOME.x, Hh / 2 - 9, O.z + DOME.z); b.name = 'sea_skyband'; b.frustumCulled = false; b.renderOrder = -4;
  return b;
}

// ---------------------------------------------------------------- 4. 钟乳石 + 5. 倒悬城（几何原型：顶面 y = 0，向下延伸，单位高 1）
function noisy(g: THREE.BufferGeometry, k: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + (h3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50) + seed) - 0.5) * k; p.setXYZ(i, x * f, y, z * f); }
  g.computeVertexNormals(); return g;
}
function stalGeo(): THREE.BufferGeometry {   // v1.2.54 Rhett「钟乳石没纹理」：加密分段 + 沉积环鼓包 + 尖端收细，像真钟乳石
  const g = new THREE.ConeGeometry(1, 1, 12, 14); g.rotateX(Math.PI); g.translate(0, -0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = -y;   // t: 0 顶 → 1 尖
    const ring = 1 + 0.12 * Math.sin(t * 38 + h3(Math.round(x * 9), 7, 1) * 2) * (1 - t), taper = 1 - 0.35 * Math.pow(t, 3);
    p.setXYZ(i, x * ring * taper, y, z * ring * taper); }
  return noisy(g, 0.32, 3);
}
/** 湿岩纹理（世界坐标 3D 噪声）：明暗斑驳 + 竖向流水沉积纹 + 尖端矿物青光；穹顶外的钟乳石 / 岩体共用 */
function wetRock(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying float vLy;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vec4 wpp = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  wpp = instanceMatrix * wpp;\n  #endif\n  vWp = (modelMatrix * wpp).xyz; vLy = -position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWp; varying float vLy;
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float big = n3(vWp * 0.08) * 0.6 + n3(vWp * 0.35) * 0.3 + n3(vWp * 1.6) * 0.1;
  float streak = n3(vec3(vWp.x * 2.2, vWp.y * 0.12, vWp.z * 2.2));            // 竖向流水沉积
  vec3 rockC = mix(vec3(0.16, 0.19, 0.19), vec3(0.42, 0.44, 0.40), big);
  rockC = mix(rockC, vec3(0.55, 0.53, 0.46), smoothstep(0.62, 0.85, streak) * 0.55);   // 钙质白痕
  diffuseColor.rgb *= rockC * 2.2;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.22, 0.75, smoothstep(0.35, 0.7, n3(vWp * 0.5)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(0.05, 0.32, 0.30) * smoothstep(0.82, 1.0, vLy) * 0.9;   // 尖端挂的水珠反射青光`);
  };
  m.customProgramCacheKey = () => 'wetRock1';
  return m;
}
const box = (w: number, h: number, d: number, y: number, x = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y - h / 2, z); return g.index ? g.toNonIndexed() : g; };
const spire = (r: number, h: number, y: number, seg = 4, x = 0, z = 0) => { const g = new THREE.ConeGeometry(r, h, seg); g.rotateX(Math.PI); if (seg === 4) g.rotateY(Math.PI / 4); g.translate(x, y - h / 2, z); return g.index ? g.toNonIndexed() : g; };
const cyl = (r: number, h: number, y: number, seg = 8) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(0, y - h / 2, 0); return g.index ? g.toNonIndexed() : g; };
/** 4 种倒悬建筑原型（宽约 1，高 1） */
function protos(): THREE.BufferGeometry[] {
  const strip = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };
  const m = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map(strip))!;
  // A 哥特塔楼：方塔身 + 两道檐 + 角小尖 + 倒锥尖顶
  const A = m([box(0.6, 0.06, 0.6, 0.0), box(0.46, 0.5, 0.46, -0.04), box(0.56, 0.04, 0.56, -0.3), box(0.52, 0.04, 0.52, -0.55),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => spire(0.05, 0.18, -0.57, 4, sx * 0.24, sz * 0.24)), spire(0.33, 0.44, -0.56)]);
  // B 钟楼：八角塔身 + 镂空钟室（四柱）+ 八角尖
  const B = m([cyl(0.3, 0.42, 0.0, 8), cyl(0.33, 0.04, -0.42, 8), ...[0, 1, 2, 3].map(k => box(0.07, 0.2, 0.07, -0.46, Math.cos(k * Math.PI / 2 + 0.78) * 0.24, Math.sin(k * Math.PI / 2 + 0.78) * 0.24)),
    cyl(0.31, 0.04, -0.66, 8), spire(0.3, 0.34, -0.7, 8)]);
  // C 房屋群：高低三座 + 倒坡屋顶
  const roof = (w: number, d: number, h: number, y: number, x: number) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, -h); s.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(x, y, -d / 2); return g.index ? g.toNonIndexed() : g; };
  const C = m([box(0.4, 0.45, 0.5, 0.0, -0.25), roof(0.44, 0.5, 0.22, -0.45, -0.25), box(0.32, 0.65, 0.4, 0.0, 0.12), roof(0.36, 0.4, 0.2, -0.65, 0.12), box(0.26, 0.3, 0.3, 0.0, 0.38), roof(0.3, 0.3, 0.16, -0.3, 0.38)]);
  // D 细尖塔：圆柱 + 环 + 长尖
  const D = m([cyl(0.14, 0.4, 0.0, 6), cyl(0.2, 0.03, -0.4, 6), cyl(0.12, 0.15, -0.43, 6), spire(0.14, 0.42, -0.58, 6)]);
  return [A, B, C, D];
}
function bellGeo(): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.001 + 0.22 + 0.3 * t * t, -t * 0.7)); }
  prof.unshift(new THREE.Vector2(0.001, 0)); const g = new THREE.LatheGeometry(prof, 14); return g;
}

type Bld = { x: number; z: number; type: number; w: number; L: number; ry: number };
function layoutCity(n: number): Bld[] {
  const out: Bld[] = [], ok = (x: number, z: number, sp: number) => Math.hypot(x - HOLE.x, z - HOLE.z) > HOLE.r + 4 && out.every(b => Math.hypot(b.x - x, b.z - z) > sp);
  const nLake = Math.round(n * 0.55);
  for (let i = 0; out.length < nLake && i < 4000; i++) {   // 湖上方：密集
    const a = h3(i, 1, 51) * 6.283, r = Math.sqrt(h3(i, 2, 51)) * 34, x = LAKE.x - 2 + Math.cos(a) * r * 1.1, z = LAKE.z + Math.sin(a) * r;
    if (!ok(x, z, 5.5)) continue;
    const t = h3(i, 3, 51), type = t < 0.38 ? 0 : t < 0.6 ? 1 : t < 0.82 ? 2 : 3;
    out.push({ x, z, type, w: type === 2 ? 7 + h3(i, 4, 51) * 5 : 4.5 + h3(i, 4, 51) * 4.5, L: 16 + h3(i, 5, 51) * 18, ry: h3(i, 6, 51) * 6.283 });
  }
  for (let i = 0; out.length < n && i < 6000; i++) {      // 其余：沿穹顶散开
    const a = h3(i, 1, 52) * 6.283, r = 25 + h3(i, 2, 52) * 100, x = DOME.x + Math.cos(a) * r, z = DOME.z + Math.sin(a) * r;
    if (!ok(x, z, 10)) continue;
    const t = h3(i, 3, 52), type = t < 0.4 ? 0 : t < 0.6 ? 1 : t < 0.82 ? 2 : 3;
    out.push({ x, z, type, w: type === 2 ? 7 + h3(i, 4, 52) * 5 : 4.5 + h3(i, 4, 52) * 4, L: 14 + h3(i, 5, 52) * 16, ry: h3(i, 6, 52) * 6.283 });
  }
  // 塔尖不低于 y = 20（玩家头顶留够空间），太低的缩短
  for (const b of out) { const top = domeY(b.x, b.z) + 1.5; b.L = Math.min(b.L, top - 20); }
  return out.filter(b => b.L > 6);
}

export function skyBuild(api: WildBuildApi) {
  const O = api.origin, q = curQuality, add = (o: THREE.Object3D, keep = false) => { api.add(o, 0, 0); if (!keep) o.position.set(0, 0, 0); };
  const placed = (o: THREE.Object3D, x: number, y: number, z: number) => { api.add(o, 0, 0); o.position.set(x, y, z); };
  void placed;
  const dome = domeMesh(O); api.add(dome, 0, 0); dome.position.set(O.x + DOME.x, DOME.y0, O.z + DOME.z);
  const band = horizonBand(O); api.add(band, 0, 0); band.position.set(O.x + DOME.x, 31 - 9, O.z + DOME.z);
  if (q !== 'low') { const g = godRays(O); api.add(g, 0, 0); g.position.set(O.x + HOLE.x, domeY(HOLE.x, HOLE.z) - 1, O.z + HOLE.z); }
  const city = new THREE.Group(); city.name = 'sea_city';
  const o = new THREE.Object3D(), cc = new THREE.Color();
  const rockM = wetRock(new THREE.MeshStandardMaterial({ color: 0x4a5654, roughness: 0.35, metalness: 0.05, flatShading: false, emissive: 0x0a1716, envMap: seaEnvTex(), envMapIntensity: 1.2 })); rockM.userData.outlineParameters = { visible: false };   // 湿岩：环境反射给一点光泽，否则仰视全黑
  // 4. 钟乳石
  const nSt = q === 'ultra' ? 280 : q === 'high' ? 170 : q === 'medium' ? 90 : 40;
  const st = new THREE.InstancedMesh(stalGeo(), rockM, nSt); let k = 0;
  for (let i = 0; k < nSt && i < nSt * 20; i++) {
    const over = h3(i, 1, 61) < 0.45, a = h3(i, 2, 61) * 6.283, r = over ? Math.sqrt(h3(i, 3, 61)) * 40 : 30 + h3(i, 3, 61) * 115;
    const x = over ? LAKE.x + Math.cos(a) * r : DOME.x + Math.cos(a) * r, z = over ? LAKE.z + Math.sin(a) * r : DOME.z + Math.sin(a) * r;
    const hd = Math.hypot(x - HOLE.x, z - HOLE.z); if (hd < HOLE.r + 1.5) continue;
    const L = (hd < HOLE.r + 10 ? 3 : 4) + Math.pow(h3(i, 4, 61), 1.6) * (r > 100 ? 22 : 15), w = L * (0.11 + 0.08 * h3(i, 5, 61));
    if (domeY(x, z) - L < 16) continue;
    o.position.set(O.x + x, domeY(x, z) + 1.2, O.z + z); o.rotation.set((h3(i, 6, 61) - 0.5) * 0.15, h3(i, 7, 61) * 6.283, (h3(i, 8, 61) - 0.5) * 0.15); o.scale.set(w, L, w); o.updateMatrix(); st.setMatrixAt(k++, o.matrix);
  }
  st.count = k; st.frustumCulled = false; st.name = 'sea_stalactites'; add(st); if (QL_DEMO.sun) st.castShadow = true;   // 11-17g 月光体积光：钟乳石投影切出光柱（?off=qlsun 回不投影） skyStats.stal = k;
  // 5. 倒悬城
  const nB = q === 'ultra' ? 50 : q === 'high' ? 50 : q === 'medium' ? 36 : 24;
  const blds = layoutCity(nB), P = protos();
  const cityM = new THREE.MeshStandardMaterial({ color: 0x4a5656, roughness: 0.6, metalness: 0.1, flatShading: true, emissive: 0x081414, envMap: seaEnvTex(), envMapIntensity: 1.0 }); cityM.userData.outlineParameters = { visible: false };
  const byType: Bld[][] = [[], [], [], []]; blds.forEach(b => byType[b.type].push(b));
  byType.forEach((list, t) => { if (!list.length) return; const im = new THREE.InstancedMesh(P[t], cityM, list.length);
    list.forEach((b, i) => { o.position.set(O.x + b.x, domeY(b.x, b.z) + 2, O.z + b.z); o.rotation.set(0, b.ry, 0); o.scale.set(b.w, b.L, b.w * (t === 2 ? 0.8 : 1)); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      cc.setScalar(0.75 + 0.5 * h3(i, t, 71)); im.setColorAt(i, cc); });
    im.frustumCulled = false; city.add(im); });
  skyStats.city = blds.length;
  // 比赛版：Lux3D 倒挂钟楼（实例化）补到 ~58 座
  if ((q === 'ultra' || q === 'high') && 'scene_invertedtower' in PACK_CREATURE_GLB) {
    const g = makeGlbScene('scene_invertedtower', { h: 1 }, { tint: 0x6a7472 }); const mesh = g?.children[0] as THREE.Mesh | undefined;
    if (mesh) {
      mesh.geometry.computeBoundingBox(); const bb = mesh.geometry.boundingBox!, H = bb.max.y - bb.min.y;
      const nL = q === 'ultra' ? 8 : 5, spots: [number, number, number][] = [[48, 30, 30], [64, 52, 34], [42, 58, 26], [70, 34, 28], [56, 66, 30], [36, 44, 24], [74, 48, 26], [52, 18, 24]];
      const lux = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, nL);
      for (let i = 0; i < nL; i++) { const [x, z, L0] = spots[i], L = Math.min(L0, domeY(x, z) - 20); o.position.set(O.x + x, domeY(x, z) + 1.5 - (bb.max.y / H) * L, O.z + z); o.rotation.set(0, i * 1.7, 0); o.scale.setScalar(L / H); o.updateMatrix(); lux.setMatrixAt(i, o.matrix); }
      lux.frustumCulled = false; lux.castShadow = false; city.add(lux); skyStats.lux = nL;
      blds.push(...spots.slice(0, nL).map(([x, z, L], i) => ({ x, z, type: 9, w: L * 0.25, L: Math.min(L, domeY(x, z) - 20), ry: i })));
    }
  }
  // 青色窗光：每座 4–9 扇（贴在塔身四面）
  const win: THREE.Matrix4[] = [];
  blds.forEach((b, bi) => { if (b.type === 9) return; const nW = 4 + Math.floor(h3(bi, 1, 81) * 6), top = domeY(b.x, b.z) + 2, half = b.w * (b.type === 3 ? 0.14 : b.type === 1 ? 0.3 : 0.23) + 0.03;
    for (let k2 = 0; k2 < nW; k2++) { const f = Math.floor(h3(bi, k2, 82) * 4), yy = top - b.L * (0.08 + h3(bi, k2, 83) * (b.type === 2 ? 0.45 : 0.42)), a = b.ry + f * Math.PI / 2;
      const along2 = (h3(bi, k2, 84) - 0.5) * half * 1.2, nx = Math.sin(a), nz = Math.cos(a);
      o.position.set(O.x + b.x + nx * half + nz * along2, yy, O.z + b.z + nz * half - nx * along2); o.rotation.set(0, a, 0); o.scale.set(0.35 + b.w * 0.03, 0.6 + b.w * 0.05, 1); o.updateMatrix(); win.push(o.matrix.clone()); } });
  const winM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 0.85), side: THREE.DoubleSide }); winM.userData.outlineParameters = { visible: false };
  const wim = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), winM, Math.max(1, win.length)); win.forEach((m2, i) => wim.setMatrixAt(i, m2)); wim.count = win.length; wim.frustumCulled = false; city.add(wim); skyStats.windows = win.length;
  // 挂铜钟（塔底垂下锁链）+ 青灯
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4a4028, roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide }); bronze.userData.outlineParameters = { visible: false };
  const chainM = new THREE.MeshStandardMaterial({ color: 0x1e2222, roughness: 0.6, metalness: 0.6 }); chainM.userData.outlineParameters = { visible: false };
  const nBell = Math.min(blds.length, q === 'low' ? 8 : 24), bells = (() => { const src = q === 'low' ? null : sceneInstSrc('scene_wl_well_bell', 0.8); if (!src) return new THREE.InstancedMesh(bellGeo(), bronze, nBell); const g = src.geo; g.computeBoundingBox(); g.translate(0, -g.boundingBox!.max.y, 0); g.scale(src.k, src.k, src.k); return new THREE.InstancedMesh(g, src.mat, nBell); })()   /* 11-14d Rhett：倒挂城的钟改用已有模型（顶点挂在链底） */, chains = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 4), chainM, nBell);
  const lampL: { x: number; y: number; z: number; h: number }[] = [];
  for (let i = 0; i < nBell; i++) {
    const b = blds[(i * 7) % blds.length], tip = domeY(b.x, b.z) + 2 - b.L, side = (h3(i, 1, 91) - 0.5) * b.w * 0.6, len = 1.2 + h3(i, 2, 91) * 2.5, s = 0.6 + h3(i, 3, 91) * 0.7;
    const y0 = Math.max(tip + b.L * 0.6, 34 + len); const bx = b.x + side, bz = b.z - side * 0.5;   // r3：钟不低于 34 米（低处的钟在 B3 机位上像前景大钟）
    o.rotation.set(0, 0, 0); o.position.set(O.x + bx, y0 - len / 2, O.z + bz); o.scale.set(1, len, 1); o.updateMatrix(); chains.setMatrixAt(i, o.matrix);
    o.position.set(O.x + bx, y0 - len, O.z + bz); o.scale.setScalar(s); o.updateMatrix(); bells.setMatrixAt(i, o.matrix);
  }
  for (let i = 0; i < blds.length && lampL.length < (q === 'low' ? 10 : 40); i++) { const b = blds[i], y = domeY(b.x, b.z) + 2 - b.L * (0.3 + h3(i, 1, 93) * 0.4), sd = b.w * 0.45;
    lampL.push({ x: b.x + Math.cos(i) * sd, y: y - 1.2, z: b.z + Math.sin(i) * sd, h: 0.6 }); }
  bells.frustumCulled = chains.frustumCulled = false; city.add(bells, chains); skyStats.bells = nBell;
  for (const m2 of cyanLamps(lampL, O)) { if ((m2 as THREE.InstancedMesh).isInstancedMesh && !(m2 as THREE.Mesh).name) { const im = m2 as THREE.InstancedMesh; if ((im.material as THREE.ShaderMaterial).isShaderMaterial) continue; } city.add(m2); }
  skyStats.lamps = lampL.length;
  api.add(city, 0, 0); city.position.set(0, 0, 0);
  city.traverse(c => { (c as THREE.Mesh).castShadow = false; });
  void add;
}
