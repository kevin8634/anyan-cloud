// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 造景工具：材质（按画质分档）、程序几何（钟 / 锥形骨管 / 锚）、实例化收集器（锁链 / 柱 / 散布件）、风摆补丁
//   low = Lambert 无环境反射无凹凸；medium = Standard + 环境反射；high / ultra = + 噪声凹凸
// ======================================================================
import { tileMat, tileAvailable, type TileKind } from '../../web/tiletex';   // fix1106 无缝贴图
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import { coastEnv } from './coast_floor';

/** 全局：时间 / 风（0..1，风暴时大）—— 风摆、挂灯、升降笼共用 */
export const kitU = { uTime: { value: 0 }, uWind: { value: 0.15 } };
const q = () => curQuality;
export const isLow = () => q() === 'low';
export const isHi = () => q() === 'high' || q() === 'ultra';
/** 按画质取数量 [low, medium, high, ultra] */
export const tierN = (n: [number, number, number, number]) => n[['low', 'medium', 'high', 'ultra'].indexOf(q())] ?? n[1];

let seed = 9137;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const reseed = (s: number) => { seed = s; };

// ---------------------------------------------------------------- 噪声凹凸贴图（可平铺）
let nTex: THREE.CanvasTexture | null = null;
export function noiseTex(): THREE.CanvasTexture {
  if (nTex) return nTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const img = g.createImageData(S, S), d = img.data;
  const L = [8, 16, 32, 64], grids = L.map(n => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5;
    L.forEach((n, k) => { const fx = x / S * n, fy = y / S * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, G = grids[k];
      const at = (i: number, j: number) => G[((j + n) % n) * n + ((i + n) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      v += amp * (at(ix, iy) * (1 - sx) * (1 - sy) + at(ix + 1, iy) * sx * (1 - sy) + at(ix, iy + 1) * (1 - sx) * sy + at(ix + 1, iy + 1) * sx * sy); amp *= 0.5; });
    const i = (y * S + x) * 4, b = Math.max(0, Math.min(255, v * 255 * 1.05)); d[i] = d[i + 1] = d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return (nTex = t);
}

// ---------------------------------------------------------------- 材质
type Kind = 'wood' | 'woodDark' | 'rust' | 'bronze' | 'basalt' | 'stone' | 'bone' | 'rope' | 'lamp' | 'glass' | 'cyan' | 'shaft' | 'kelp' | 'barnacle';
const SPEC: Record<Kind, { c: number; r: number; m: number; e?: number; ei?: number; env?: number; bump?: number; flat?: boolean; vc?: boolean }> = {
  wood: { c: 0x4a3626, r: 0.78, m: 0, env: 0.35, bump: 0.05, vc: true },
  woodDark: { c: 0x2c2119, r: 0.85, m: 0, env: 0.25, bump: 0.06, vc: true },
  rust: { c: 0x5c3420, r: 0.72, m: 0.55, env: 0.5, bump: 0.03, vc: true },
  bronze: { c: 0x557a62, r: 0.48, m: 0.6, e: 0x0a2a24, ei: 0.35, env: 0.8, bump: 0.02, vc: true },
  basalt: { c: 0x50575a, r: 0.78, m: 0, env: 0.45, bump: 0.08, flat: true, vc: true },
  stone: { c: 0x666a66, r: 0.86, m: 0, env: 0.35, bump: 0.1, flat: true, vc: true },
  bone: { c: 0xc9bfa4, r: 0.66, m: 0, env: 0.3, bump: 0.06, vc: true },
  rope: { c: 0x6a5434, r: 0.95, m: 0 },
  lamp: { c: 0xffb050, r: 1, m: 0, e: 0xffa040, ei: 2.6 },
  glass: { c: 0xbfe8ff, r: 0.2, m: 0, e: 0xcfeaff, ei: 3.2 },
  cyan: { c: 0x40fff0, r: 1, m: 0, e: 0x30ffe8, ei: 2.2 },
  shaft: { c: 0x0a0e10, r: 1, m: 0 },
  kelp: { c: 0x3a5a2a, r: 0.45, m: 0, env: 0.6, vc: true },
  barnacle: { c: 0x8a8a7c, r: 0.9, m: 0, flat: true, vc: true },
};
const cache = new Map<string, THREE.Material>();
/** fix1106 哪些材质挂无缝贴图（lift = 原色提亮倍数；原色是按无贴图调的暗色） */
const TILE_OF: Partial<Record<Kind, { k: TileKind; top?: TileKind; lift: number }>> = {
  wood: { k: 'woodcrate', lift: 1.9 }, woodDark: { k: 'woodcrate', lift: 1.7 }, rust: { k: 'rustiron', lift: 1.8 },
  stone: { k: 'stonewall', top: 'stonefloor', lift: 1.6 }, basalt: { k: 'rock', lift: 1.6 },
  bronze: { k: 'bronzebell', lift: 1.5 }, bone: { k: 'bone', lift: 1.0 },   // 1107 05 第 2 批
};
export function mat(kind: Kind): THREE.Material {
  const key = kind + q(); const hit = cache.get(key); if (hit) return hit;
  const s = SPEC[kind]; let m: THREE.Material;
  if (kind === 'lamp' || kind === 'cyan' || kind === 'glass') {
    const em = new THREE.Color(s.e!).multiplyScalar(s.ei!);
    m = new THREE.MeshBasicMaterial({ color: em, toneMapped: false, fog: true });
  } else if (isLow()) {
    m = new THREE.MeshLambertMaterial({ color: s.c, flatShading: s.flat, vertexColors: !!s.vc, emissive: s.e ?? 0, emissiveIntensity: s.ei ?? 1 });
  } else if (TILE_OF[kind] && tileAvailable(TILE_OF[kind]!.k)) {
    // fix1106 无缝贴图（05 第 1 批）：木件 / 锈铁 / 石件 / 玄武岩换成三向投影的贴图材质，原色当色调（提亮补贴图归一），环境反射沿用
    const T = TILE_OF[kind]!;
    m = tileMat(T.k, { color: new THREE.Color(s.c).multiplyScalar(T.lift), top: T.top, roughness: Math.min(1, s.r + 0.1), metalness: s.m, vertexColors: !!s.vc, emissive: s.e ?? 0, emissiveIntensity: s.ei ?? 1, envMap: s.env ? coastEnv() : null, envMapIntensity: s.env })!;
  } else {
    const sm = new THREE.MeshStandardMaterial({ color: s.c, roughness: s.r, metalness: s.m, flatShading: s.flat, vertexColors: !!s.vc, emissive: s.e ?? 0, emissiveIntensity: s.ei ?? 1 });
    if (s.env) { sm.envMap = coastEnv(); sm.envMapIntensity = s.env; }
    if (isHi() && s.bump) { sm.bumpMap = noiseTex(); sm.bumpScale = s.bump * 10; }
    m = sm;
  }
  if (kind === 'kelp') { m.side = THREE.DoubleSide; windPatch(m, 0.35, 'kelp'); }
  m.userData.outlineParameters = { visible: false };
  cache.set(key, m); return m;
}
/** instanced 用的顶点色白底：InstancedMesh 用 instanceColor 着色，材质本身 vertexColors 会要求几何有 color 属性 → 给几何补白色 */
export function whiteColors(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.getAttribute('color')) return g;
  const n = g.getAttribute('position').count, c = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

/** 风摆：按几何本地高度（transformed.y）摆动，风越大摆越大；instanced 兼容 */
export function windPatch(m: THREE.Material, amp: number, key: string) {
  m.onBeforeCompile = sh => {
    sh.uniforms.kTime = kitU.uTime; sh.uniforms.kWind = kitU.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float kTime; uniform float kWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
    #endif
    float ph = dot(ip.xz, vec2(0.37, 0.21));
    float h = max(0.0, transformed.y); h *= h;
    float a = ${amp.toFixed(3)} * (0.35 + kWind * 1.8);
    transformed.x += (sin(kTime * (1.1 + kWind * 2.0) + ph) * 0.7 + sin(kTime * 2.7 + ph * 2.3) * 0.3) * a * h;
    transformed.z += (cos(kTime * 0.9 + ph * 1.3) * 0.5 + 0.35 * kWind) * a * h;
  }`);
  };
  m.customProgramCacheKey = () => 'cwind' + key + q();
}

// ---------------------------------------------------------------- 几何
/** 钟：喇叭口 + 唇边 + 肩部，开口朝下，顶端在 y = h，口沿 y = 0 */
export function bellGeo(seg = 28, h = 1.6): THREE.BufferGeometry {
  const pr: THREE.Vector2[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) { const t = i / N; const r = 0.42 + 0.14 * Math.sin(t * Math.PI * 0.5) + 0.42 * Math.pow(t, 2.6) + (t > 0.9 ? 0.07 * (t - 0.9) / 0.1 : 0); pr.push(new THREE.Vector2(r, h * (1 - t))); }
  pr.push(new THREE.Vector2(0.96, -0.04), new THREE.Vector2(0.86, 0.06));   // 唇边
  pr.unshift(new THREE.Vector2(0.001, h + 0.06), new THREE.Vector2(0.3, h + 0.04));   // 顶盖
  const g = new THREE.LatheGeometry(pr, seg); g.computeVertexNormals(); return g;
}
/** 一口完整的钟（钟体 + 钟纽 + 两道箍 + 钟舌），用于地标 / 挂钟 */
export function bellMesh(s: number, seg = 28): THREE.Group {
  const g = new THREE.Group(), m = mat('bronze');
  const body = new THREE.Mesh(whiteColors(bellGeo(seg)), m); (body.material as THREE.Material).side = THREE.DoubleSide; body.castShadow = true; g.add(body);
  const crown = new THREE.Mesh(whiteColors(new THREE.TorusGeometry(0.22, 0.07, 6, 14)), m); crown.position.y = 1.78; g.add(crown);
  for (const [y, r] of [[0.22, 0.93], [1.05, 0.62]]) { const b = new THREE.Mesh(whiteColors(new THREE.TorusGeometry(r, 0.035, 5, seg)), m); b.rotation.x = Math.PI / 2; b.position.y = y; g.add(b); }
  const cl = new THREE.Mesh(whiteColors(new THREE.SphereGeometry(0.18, 8, 6)), mat('rust')); cl.position.y = 0.2; g.add(cl);
  g.scale.setScalar(s); return g;
}
/** 沿折线的锥形管（骨头、肋骨、木梁）：pts 世界 / 本地点，r0 → r1 线性变细 */
export function taperTube(pts: THREE.Vector3[], segs: number, radial: number, r0: number, r1: number, knob = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts), frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    const r = (r0 + (r1 - r0) * t) * (1 + knob * Math.exp(-t * 18) + knob * 0.6 * Math.exp(-(1 - t) * 18));
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      const nx = N.x * cx + B.x * sy, ny = N.y * cx + B.y * sy, nz = N.z * cx + B.z * sy;
      pos.push(P.x + nx * r, P.y + ny * r * 0.86, P.z + nz * r); nor.push(nx, ny, nz); uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return whiteColors(g);
}
/** 船锚（高 ≈ 3.4 × s）：锚杆、横杆、锚冠弧、两片锚爪、锚环；原点 = 锚冠底 */
export function anchorMesh(s: number): THREE.Group {
  const g = new THREE.Group(), m = mat('rust'), wg = (x: THREE.BufferGeometry) => whiteColors(x);
  const shank = new THREE.Mesh(wg(new THREE.CylinderGeometry(0.11, 0.16, 3.0, 8)), m); shank.position.y = 1.7; g.add(shank);
  const stock = new THREE.Mesh(wg(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6)), m); stock.rotation.z = Math.PI / 2; stock.rotation.y = Math.PI / 2; stock.position.y = 2.85; g.add(stock);
  const ring = new THREE.Mesh(wg(new THREE.TorusGeometry(0.26, 0.06, 6, 14)), m); ring.position.y = 3.42; g.add(ring);
  const crown = new THREE.Mesh(wg(new THREE.TorusGeometry(0.95, 0.12, 6, 20, Math.PI)), m); crown.rotation.z = Math.PI; crown.position.y = 0.95; g.add(crown);
  for (const sd of [-1, 1]) {
    const fl = new THREE.Mesh(wg(new THREE.ConeGeometry(0.32, 0.8, 4)), m); fl.scale.set(1, 1, 0.35); fl.position.set(sd * 0.98, 1.15, 0); fl.rotation.z = -sd * 0.55; g.add(fl);
  }
  g.traverse(o => { (o as THREE.Mesh).castShadow = true; });
  g.scale.setScalar(s); return g;
}

// ---------------------------------------------------------------- 实例化收集器
const _o = new THREE.Object3D(), _c = new THREE.Color();
export class Inst {
  mats: THREE.Matrix4[] = []; cols: THREE.Color[] = [];
  constructor(public geo: THREE.BufferGeometry, public m: THREE.Material, public name: string) { whiteColors(geo); }
  add(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, col?: number | THREE.Color, k = 1) {
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mats.push(_o.matrix.clone());
    const c = col === undefined ? _c.setRGB(1, 1, 1) : typeof col === 'number' ? _c.setHex(col) : _c.copy(col);
    this.cols.push(c.clone().multiplyScalar(k));
  }
  addM(m4: THREE.Matrix4, k = 1) { this.mats.push(m4.clone()); this.cols.push(new THREE.Color(k, k, k)); }
  build(cast = false): THREE.InstancedMesh | null {
    if (!this.mats.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.m, this.mats.length);
    this.mats.forEach((m4, i) => { im.setMatrixAt(i, m4); im.setColorAt(i, this.cols[i]); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = true; im.name = this.name; im.computeBoundingSphere();
    im.userData.outlineParameters = { visible: false };
    return im;
  }
}
/** 锁链：链环交替旋转 90°，沿悬链线（两端点 + 下垂量） */
export class Chains {
  inst: Inst;
  constructor(linkR = 0.13) { this.inst = new Inst(new THREE.TorusGeometry(linkR, linkR * 0.28, 4, 8), mat('rust'), 'coast_chains'); this.inst.geo.scale(1, 1.55, 1); }
  /** a → b（世界坐标），sag = 中点下垂米数；lie = 躺在地上（y 用 gy 贴地） */
  add(a: THREE.Vector3, b: THREE.Vector3, sag: number, s = 1, gy?: (x: number, z: number) => number) {
    const L = a.distanceTo(b), step = 0.24 * s, n = Math.max(2, Math.floor(L / step)), prev = new THREE.Vector3(), cur = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = i / n; cur.lerpVectors(a, b, t); cur.y -= sag * 4 * t * (1 - t);
      if (gy) cur.y = gy(cur.x, cur.z) + 0.06 * s;
      if (i) {
        dir.subVectors(cur, prev).normalize(); const mid = prev.clone().add(cur).multiplyScalar(0.5);
        _o.position.copy(mid); _o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); _o.rotateY(i % 2 ? Math.PI / 2 : 0);
        if (gy) _o.rotateY(0.3 * (rnd() - 0.5));
        _o.scale.setScalar(s); _o.updateMatrix(); this.inst.addM(_o.matrix, 0.75 + rnd() * 0.4);
      }
      prev.copy(cur);
    }
  }
  /** 地上一堆乱链（绕圈） */
  pile(x: number, z: number, r: number, gy: (x: number, z: number) => number, s = 1) {
    let a = rnd() * 6.28; const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 9; i++) { a += 0.9 + rnd() * 0.8; const rr = r * (0.3 + rnd() * 0.7); pts.push(new THREE.Vector3(x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr)); }
    for (let i = 0; i < pts.length - 1; i++) this.add(pts[i], pts[i + 1], 0, s, (X, Z) => gy(X, Z) + 0.05 * i);
  }
}
