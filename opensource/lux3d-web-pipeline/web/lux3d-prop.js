// lux3d-prop.js — 在 three.js 里用 Lux3D 生成的道具 / 武器：解析（含 meshopt）→ 立起 + 归一化 → 写实 PBR 材质 + 程序环境反射 → 可选「熔炉成形」溶解
// 出自《暗岩传说：深渊回响》（MIT）。依赖 three ≥ 0.160。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** 程序生成的环境反射（不需要 HDR 文件）：上冷青天光、中暖色地平线、下暗地 */
let _env = null;
export function propEnv() {
  if (_env) return _env;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#9fd8e8'); g.addColorStop(0.42, '#e8f4ff'); g.addColorStop(0.5, '#ffd9a0'); g.addColorStop(0.58, '#5a4a3a'); g.addColorStop(1, '#141210');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  _env = new THREE.CanvasTexture(c); _env.mapping = THREE.EquirectangularReflectionMapping; _env.colorSpace = THREE.SRGBColorSpace; return _env;
}

/**
 * 解析 GLB（ArrayBuffer 或 URL）→ 返回一个网格：最长轴立成 +Y，握点（anchor：0 = 底端，1 = 顶端）在原点，总长 len。
 * flip = true：生成件「头」朝下时翻转（可以看各高度截面宽度判断：剑的护手离剑柄近）
 */
export async function loadProp(src, { len = 1.2, anchor = 0.15, flip = false } = {}) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = typeof src === 'string' ? await loader.loadAsync(src) : await loader.parseAsync(src, '');
  let mesh = null; gltf.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) throw new Error('GLB 里没有网格');
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  for (const nm of ['position', 'normal']) {   // meshopt 量化属性转浮点，否则旋转缩放会溢出拉丝
    const a = geo.getAttribute(nm); if (!a || a.array instanceof Float32Array) continue;
    const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
    geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize));
  }
  geo.computeBoundingBox(); let b = geo.boundingBox;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  if (sx > sy && sx >= sz) geo.rotateZ(Math.PI / 2); else if (sz > sy && sz > sx) geo.rotateX(-Math.PI / 2);
  if (flip) geo.rotateZ(Math.PI);
  geo.computeBoundingBox(); b = geo.boundingBox;
  const L = b.max.y - b.min.y, k = len / L;
  geo.translate(-(b.max.x + b.min.x) / 2, -(b.min.y + L * anchor), -(b.max.z + b.min.z) / 2); geo.scale(k, k, k);
  const src0 = mesh.material;
  const mat = src0.isMeshStandardMaterial ? src0.clone() : new THREE.MeshStandardMaterial({ map: src0.map ?? null });
  mat.envMap = propEnv(); mat.envMapIntensity = 1.35;
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  if (mat.emissiveMap) { mat.emissive.setHex(0xffffff); mat.emissiveIntensity = 1.6; mat.emissiveMap.colorSpace = THREE.SRGBColorSpace; }
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
}

const NOISE = `
float fs_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fs_n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fs_h(i), fs_h(i + vec3(1,0,0)), f.x), mix(fs_h(i + vec3(0,1,0)), fs_h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fs_h(i + vec3(0,0,1)), fs_h(i + vec3(1,0,1)), f.x), mix(fs_h(i + vec3(0,1,1)), fs_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fs_fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * fs_n(p); p *= 2.03; a *= 0.5; } return s; }`;

/** 熔炉成形：给网格打溶解补丁，返回 set(t)，t 从 0（全无）到 1（完整），边缘发橙红光 */
export function forgeReveal(m, color = new THREE.Color(1.0, 0.42, 0.08)) {
  m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
  const u = { uCut: { value: -0.2 }, uMinY: { value: b.min.y }, uMaxY: { value: b.max.y }, uEdge: { value: color } };
  const mat = m.material.clone();
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vFsPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFsPos = position;');
    sh.fragmentShader = `uniform float uCut, uMinY, uMaxY; uniform vec3 uEdge; varying vec3 vFsPos;\n${NOISE}\n` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fsK = (vFsPos.y - uMinY) / max(1e-4, uMaxY - uMinY) + (fs_fbm(vFsPos * 9.0) - 0.5) * 0.22;
        if (fsK > uCut) discard;
        float fsEdge = 1.0 - smoothstep(0.0, 0.07, uCut - fsK);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdge * fsEdge * 6.0 + vec3(1.0, 0.85, 0.5) * pow(fsEdge, 6.0) * 6.0;`);
  };
  mat.customProgramCacheKey = () => 'forge_reveal'; mat.side = THREE.DoubleSide; m.material = mat;
  return t => { u.uCut.value = -0.15 + Math.max(0, Math.min(1, t)) * 1.35; if (t >= 1) u.uCut.value = 2; };
}
