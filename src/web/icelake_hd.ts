// 11-18 Rhett「冰湖也要替换成咱们做的冰面了」：本体野外冰湖（霜脊等 decor 'icelake'）换成钟井冰湖同款冰面
//   = 钢蓝冰盘（30 cm 厚，盖住地形）+ 视差内部气泡 / 两层裂纹 / 掠射菲涅尔 / 碎冰白边 + 表面裂纹线。
//   着色器复制自 DLC well_wet_hd.iceUp（本体不 import DLC 模块）。低画质 / ?off=wildice 回旧 Phong 圆盘。
import * as THREE from 'three';
import { curQuality } from './gfx';

export const wildIceOn = () => { try { return curQuality !== 'low' && !/(?:[?&]off=[^&]*\bwildice\b)/.test(location.search); } catch { return curQuality !== 'low'; } };

const NOISE = `
float wwH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wwN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wwH(i), wwH(i + vec2(1, 0)), f.x), mix(wwH(i + vec2(0, 1)), wwH(i + vec2(1, 1)), f.x), f.y); }
float wwF(vec2 p){ return wwN(p) * 0.55 + wwN(p * 2.07 + 3.1) * 0.3 + wwN(p * 4.3 + 7.7) * 0.15; }
`;

/** 冰湖冰面：视差气泡 + 裂纹 + 菲涅尔；r = 冰盘半径（物体空间，顶面法线朝上） */
function iceUp(m: THREE.MeshStandardMaterial, r = 13, blob = false, K = 1) {   // K：户外增亮（气泡 / 裂纹 / 白边 / 掠射）   // blob：几何带 edgeT（liquid_shape.iceSlab），冰边沿不规则岸线
  if (m.userData?.iceUp) return m;
  m.userData.iceUp = true;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIcW; varying vec3 vIcL; varying float vIcE;' + (blob ? '\nattribute float edgeT;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIcL = transformed; vIcW = (modelMatrix * vec4(transformed, 1.0)).xyz; vIcE = ' + (blob ? 'edgeT' : `length(transformed.xz) / ${r.toFixed(2)}`) + ';');
    sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIcW; varying vec3 vIcL; varying float vIcE;\n' + NOISE + `
vec2 icVor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(wwH(i + g), wwH(i + g + 17.0));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2 - d1); }
float icBub(vec2 p, float k){ vec2 i = floor(p), f = fract(p) - 0.5; float h = wwH(i + k);
  vec2 o = vec2(wwH(i + k + 3.0), wwH(i + k + 9.0)) - 0.5; float rr = 0.06 + 0.1 * wwH(i + k + 5.0);
  return step(0.72, h) * (1.0 - smoothstep(rr * 0.5, rr, length(f - o * 0.6))); }
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 V = normalize(cameraPosition - vIcW); float top = step(0.12, vIcL.y);
    vec2 pd = V.xz / max(V.y, 0.2);
    float b1 = icBub((vIcW.xz - pd * 0.12) * 3.2, 1.0), b2 = icBub((vIcW.xz - pd * 0.45) * 1.7, 7.0);
    vec2 c1 = icVor((vIcW.xz - pd * 0.05) * 0.32 + (wwN(vIcW.xz * 0.7) - 0.5) * 0.6), c2 = icVor((vIcW.xz - pd * 0.3) * 0.75 + 4.0);
    float cr = (1.0 - smoothstep(0.0, 0.03, c1.y)) * smoothstep(0.35, 0.7, wwF(vIcW.xz * 0.12 + 2.0)) * 0.8
             + (1.0 - smoothstep(0.0, 0.05, c2.y)) * smoothstep(0.45, 0.8, wwF(vIcW.xz * 0.2 + 9.0)) * 0.3;
    float cloud = wwF((vIcW.xz - pd * 0.6) * 0.35);
    float rim = smoothstep(${(1 - 1.6 / r).toFixed(3)}, 1.0, vIcE);
    float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
    vec3 add = vec3(0.30, 0.48, 0.58) * (b1 * 0.35 * wwN(vIcW.xz * 0.5) + b2 * 0.22) + vec3(0.55, 0.75, 0.85) * cr * 0.45
             + vec3(0.05, 0.10, 0.14) * cloud + vec3(0.7, 0.85, 0.95) * rim * (0.35 + 0.4 * wwN(vIcW.xz * 2.5))
             + vec3(0.35, 0.5, 0.6) * fr * 0.6;
    totalEmissiveRadiance += add * top * ${K.toFixed(2)}; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + wwN(vIcW.xz * 1.3) * 0.12 - 0.04, 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => 'wildice1|' + blob + '|' + K;
  m.needsUpdate = true;
  return m;
}

const crackM = new THREE.MeshBasicMaterial({ color: 0x9cc8e0, transparent: true, opacity: 0.5, depthWrite: false });
/** 冰湖：半径 r；顶面在本地 y = +0.04（与旧圆盘同高） */
/** 11-18 Rhett 选冰面 B（钟井冰湖原版）：不规则岸线冰盘（顶面 + 侧裙，edgeT 给冰边），不再铺直线裂纹片；?off=wildiceb 回圆盘 + 直线裂纹 */
function iceSlabB(r: number, h: number, seed: number, n = 72): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2;
    const k = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.04 * Math.sin(a * 5 + seed * 1.7) + 0.025 * Math.sin(a * 9 + seed * 2.3) - 0.03;
    pts.push(new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * k)); }
  const R = 5, pos: number[] = [], et: number[] = [], idx: number[] = [], y = h / 2;
  pos.push(0, y, 0); et.push(0);
  for (let j = 1; j <= R; j++) { const t = j / R; for (const p of pts) { pos.push(p.x * t, y, p.y * t); et.push(t); } }
  for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
  for (let j = 1; j < R; j++) { const a0 = 1 + (j - 1) * n, b0 = 1 + j * n; for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i); } }
  const ring = 1 + (R - 1) * n, base = pos.length / 3;
  for (const p of pts) { pos.push(p.x * 1.03, -h / 2, p.y * 1.03); et.push(1); }
  for (let i = 0; i < n; i++) { const i1 = (i + 1) % n, a = ring + i, b = ring + i1, c = base + i, d = base + i1; idx.push(a, d, c, a, b, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('edgeT', new THREE.Float32BufferAttribute(et, 1)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
let seedN = 0;
export function makeIceLakeHd(r: number): THREE.Object3D {
  const g = new THREE.Group(); g.name = 'iceLakeHd';
  const B = !/(?:[?&]off=[^&]*\bwildiceb\b)/.test(typeof location !== 'undefined' ? location.search : '');
  // 11-18 19:37 Rhett 截图「你看冰湖」：钟井洞里的暗钢蓝参数搬到雪地白天成了一块黑油 → 户外冰：浅钢蓝、低金属、高光滑、细节 ×2.2；?off=wildice2 回 C12 暗色
  const OUT2 = !/(?:[?&]off=[^&]*\bwildice2\b)/.test(typeof location !== 'undefined' ? location.search : '');
  const mat = OUT2 ? new THREE.MeshStandardMaterial({ color: 0x8fb8cf, metalness: 0.08, roughness: 0.1, envMapIntensity: 1.25 })
    : new THREE.MeshStandardMaterial({ color: 0x2c4a5c, metalness: 0.45, roughness: 0.2, envMapIntensity: 0.6 });
  const ice = new THREE.Mesh(B ? iceSlabB(r, 0.3, 1.3 + (seedN++) * 2.17) : new THREE.CylinderGeometry(r, r * 1.03, 0.3, 72, 1), iceUp(mat, r, B, OUT2 ? 2.2 : 1));
  ice.position.y = 0.04 - 0.15; ice.receiveShadow = true; g.add(ice);
  if (!B) { const n = Math.round(r * 1.8);
    for (let k = 0; k < n; k++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.07, r * (0.3 + (k % 3) * 0.15)), crackM); c.rotation.x = -Math.PI / 2; c.rotation.z = k * 0.7; const a = k * 2.399, d = r * 0.45 * Math.sqrt((k + 0.5) / n); c.position.set(Math.cos(a) * d, 0.042, Math.sin(a) * d); g.add(c); } }
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  return g;
}
