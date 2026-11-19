// ======================================================================
// 11-18 opt1118B 野外熔岩池（烬落荒原 4 池 + 世界首领竞技场 3 池）：去点光改假光 + 观感升级（审计 map_audit_1118 烬落荒原一行）
//   原来：18 边正圆 MeshBasic 橙色平面 + 正圆黑壳环 + 每池一盏点光（强度 2.2、照距 3r），7 盏真灯让全图每个受光像素多算 7 盏。
//   假光（?off=lavalight 回点光）：岸外一圈叠加混合的「地面受热光晕」贴花（岸线 → 2.3 倍，暗红 → 透明，缓慢呼吸），
//     模拟原点光照在地面上的那圈橙光；不进 forward 灯循环，每池只多 1 次绘制、无灯数变化（不触发重编）。
//   观感（?off=lavahd 回旧圆盘；低画质也用旧圆盘）：做法参考 RPG 场景搭建包第 7 章氛围 / 画质包自发光（emissive 推进泛光阈值）思路，代码自写：
//     1) 不规则岸线（多频正弦 + 1–2 条小流舌），整体收在原半径内（寻路 / 伤害圆不变）；
//     2) 熔岩着色器：漂移的冷却硬壳板块（Voronoi），板缝亮、脉动；岸边壳厚发暗、中心最亮（超 1 进泛光）；带场景线性雾；
//     3) 岸线外冷却黑曜石碎块（实例化，1 次绘制，半埋，暗红余热自发光）；
//     4) 高 / 超高画质：上飘火星（加性点精灵）。
//   不用贴图（0 张生图），全部程序生成；旧版池里的随机岩块照旧（wild.ts 随机序列不变）。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';

const offHas = (k: string) => { try { return new RegExp(`(?:[?&]off=[^&]*\\b${k}\\b)`).test(location.search); } catch { return false; } };
export const lavaFakeOn = () => !offHas('lavalight');
export const lavaHdOn = () => !offHas('lavahd') && curQuality !== 'low';

function rng(seed: number) { let s = (Math.floor(Math.abs(seed)) * 9301 + 49297) % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
export const lavaSeed = (x: number, z: number) => Math.floor((Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * 1e6) + 1;

/** 岸线点列（局部 xz），半径收在 [~0.78r, r] 内 */
export function lavaShore(r: number, seed: number, n = 64): THREE.Vector2[] {
  const R = rng(seed), ph = Array.from({ length: 5 }, () => R() * 6.283);
  const tongues = Array.from({ length: 1 + Math.floor(R() * 2) }, () => ({ a: R() * 6.283, w: 0.22 + R() * 0.25 }));
  const ks: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let k = 0.88 + 0.055 * Math.sin(a * 2 + ph[0]) + 0.035 * Math.sin(a * 3 + ph[1]) + 0.02 * Math.sin(a * 5 + ph[2]) + 0.012 * Math.sin(a * 9 + ph[3]) + 0.006 * Math.sin(a * 17 + ph[4]);
    for (const t of tongues) { const d = Math.abs(((a - t.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / t.w; if (d < 1) k += 0.1 * (1 - d * d) * (1 - d * d); }
    ks.push(k);
  }
  const mx = Math.max(...ks);
  return ks.map((k, i) => { const a = i / n * Math.PI * 2, kk = k / mx; return new THREE.Vector2(Math.cos(a) * r * kk, Math.sin(a) * r * kk); });
}
export const circleShore = (r: number, n = 48) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); });

/** 池面几何：扇形分环，uv.x = 离岸深度（0 岸 → 1 中心） */
function poolGeo(pts: THREE.Vector2[]): THREE.BufferGeometry {
  const rings = 5, n = pts.length, pos: number[] = [0, 0, 0], uv: number[] = [1, 0], idx: number[] = [];
  for (let j = 1; j <= rings; j++) { const t = j / rings; for (let i = 0; i < n; i++) { pos.push(pts[i].x * t, 0, pts[i].y * t); uv.push(1 - t, i / n); } }
  for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
  for (let j = 1; j < rings; j++) { const a0 = 1 + (j - 1) * n, b0 = 1 + j * n; for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** 岸外环带：内圈 = 岸线 × k0，外圈 = 岸线 × k1；uv.x 内 1 → 外 0 */
function ringGeo(pts: THREE.Vector2[], k0: number, k1: number): THREE.BufferGeometry {
  const n = pts.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) { pos.push(pts[i].x * k0, 0, pts[i].y * k0, pts[i].x * k1, 0, pts[i].y * k1); uv.push(1, 0, 0, 0); const i1 = (i + 1) % n; idx.push(i * 2, i1 * 2, i * 2 + 1, i1 * 2, i1 * 2 + 1, i * 2 + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 6).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(idx); return g;
}

const LT = { value: 0 };
let lastT = -1;
const tick = () => { const now = performance.now() / 1000; if (now !== lastT) { lastT = now; LT.value = now % 1000; } };

const VS = `#include <fog_pars_vertex>
varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const NOISE = `float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }`;
const FOG_MUL = `#if defined(USE_FOG) && !defined(FOG_EXP2)
  gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif`;

let poolMat: THREE.ShaderMaterial | null = null, glowMat: THREE.ShaderMaterial | null = null;
function lavaMat(): THREE.ShaderMaterial {
  if (poolMat) return poolMat;
  poolMat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uT: LT }, fog: true,
    vertexShader: VS,
    fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
${NOISE}
vec2 vor(vec2 p){ vec2 ip = floor(p), fp = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)), c = o + 0.5 + 0.4 * sin(uT * 0.15 + 6.283 * vec2(h2(ip + o), h2(ip + o + 7.0))) - fp; float d = dot(c, c); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d1), sqrt(d2)); }
void main(){
  vec2 p = vW.xz * 1.3 + vec2(uT * 0.05, uT * 0.03) + vec2(n2(vW.xz * 0.4 + uT * 0.07), n2(vW.zx * 0.4 - uT * 0.05)) * 1.2;
  vec2 v = vor(p); float seam = 1.0 - smoothstep(0.0, 0.08 + 0.05 * n2(vW.xz * 2.0), v.y - v.x);
  float depth = vUv.x;
  float crust = smoothstep(0.2, 0.8, 1.0 - depth + (n2(vW.xz * 1.1) - 0.5) * 0.55);
  float pulse = 0.72 + 0.28 * sin(uT * 1.7 + n2(vW.xz * 0.6) * 6.0);
  vec3 hot = mix(vec3(1.0, 0.3, 0.035), vec3(1.0, 0.72, 0.24), smoothstep(0.45, 1.0, depth) * 0.75);
  vec3 shell = vec3(0.04, 0.022, 0.016) * (0.5 + 0.9 * n2(vW.xz * 6.0)) + vec3(0.16, 0.03, 0.0) * smoothstep(0.3, 0.0, v.y - v.x);
  float molten = max(seam * pulse, (1.0 - crust) * (0.55 + 0.45 * n2(p * 2.0)));
  vec3 c = mix(shell, hot * (1.15 + 0.9 * depth), molten);
  c += vec3(0.5, 0.08, 0.0) * (1.0 - crust) * 0.3;
  c *= mix(0.3, 1.0, smoothstep(0.0, 0.07, depth));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  poolMat.userData.outlineParameters = { visible: false };
  return poolMat;
}
/** 假光：岸外地面受热光晕（叠加混合；雾里按雾量衰减，不会被雾染成灰） */
function lavaGlowMat(): THREE.ShaderMaterial {
  if (glowMat) return glowMat;
  glowMat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uT: LT }, fog: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: VS,
    fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
${NOISE}
void main(){ float k = vUv.x; float a = k * k * (3.0 - 2.0 * k);
  a *= (0.7 + 0.3 * n2(vW.xz * 1.2)) * (0.86 + 0.14 * sin(uT * 1.7 + vW.x * 0.3));
  vec3 c = mix(vec3(0.55, 0.09, 0.01), vec3(1.0, 0.36, 0.06), k * k) * a * 0.7;
  gl_FragColor = vec4(c, 1.0);
  ${FOG_MUL}
}`,
  });
  glowMat.userData.outlineParameters = { visible: false };
  return glowMat;
}

/** 假光贴花：pts = 岸线（旧圆盘传 circleShore(r)）；从岸线内 0.92 → 外 2.3 倍 */
export function makeLavaGlow(pts: THREE.Vector2[]): THREE.Mesh {
  const m = new THREE.Mesh(ringGeo(pts, 0.92, 2.3), lavaGlowMat());
  m.position.y = 0.07; m.renderOrder = 2; m.name = 'lavaGlow'; m.frustumCulled = true;
  m.onBeforeRender = tick; m.userData.noCamBlock = true;
  return m;
}

let rockMat: THREE.MeshStandardMaterial | null = null;
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
/** 新版熔岩池（局部原点 = 池心，贴地）；不含点光 / 假光（由调用方按开关加） */
export function makeLavaPoolHd(r: number, seed: number, pts = lavaShore(r, seed)): THREE.Group {
  const g = new THREE.Group(); g.name = 'lavaPoolHd';
  const hi = curQuality === 'high' || curQuality === 'ultra';
  const lava = new THREE.Mesh(poolGeo(pts), lavaMat()); lava.position.y = 0.06; lava.onBeforeRender = tick; lava.name = 'lavaSurface'; lava.userData.noCamBlock = true; g.add(lava);
  // 冷却黑曜石碎块：沿岸线内外，大小不一，半埋
  rockMat ??= new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.85, metalness: 0.05, emissive: 0x3a0800, emissiveIntensity: 0.45, flatShading: true });
  rockMat.userData.outlineParameters = { visible: false };
  const R = rng(seed + 11), n = pts.length, N = Math.round(r * (hi ? 14 : 9));
  const im = new THREE.InstancedMesh(rockGeo, rockMat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const p = pts[Math.floor(R() * n)], k = 0.95 + R() * 0.28, s = 0.14 + Math.pow(R(), 2) * 0.55;
    e.set(R() * 6, R() * 6, R() * 6); q.setFromEuler(e);
    im.setMatrixAt(i, m4.compose(v.set(p.x * k, s * 0.15, p.y * k), q, sc.set(s * (1 + R() * 0.6), s * 0.6, s)));
  }
  im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.castShadow = hi; im.name = 'lavaRim'; g.add(im);
  // 火星（高 / 超高）
  if (hi) {
    const M = Math.round(r * 6), base = new Float32Array(M * 3), ph = new Float32Array(M);
    for (let i = 0; i < M; i++) { const p = pts[Math.floor(R() * n)], t = R() * 0.8; base[i * 3] = p.x * t; base[i * 3 + 2] = p.y * t; ph[i] = R(); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(M * 3), 3));
    const sp = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.frustumCulled = false; sp.name = 'lavaEmbers';
    const a = pg.getAttribute('position') as THREE.BufferAttribute;
    sp.onBeforeRender = () => { tick(); const t = LT.value; for (let i = 0; i < M; i++) { const life = (t * 0.35 + ph[i]) % 1; a.setXYZ(i, base[i * 3] + Math.sin(t + i) * 0.3 * life, life * 4.5, base[i * 3 + 2] + Math.cos(t * 0.8 + i) * 0.3 * life); } a.needsUpdate = true; };
    g.add(sp);
  }
  return g;
}
