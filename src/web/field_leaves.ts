// ======================================================================
// 11-16 本体野外飘落叶（画质专长包第 86 步 one wind；GPU 实例化，一次绘制）
//   · 每片叶子一个实例，生命周期全在顶点着色器里：从树冠里出生 → 下落（翻转 + 钟摆式左右摆 + 随同一阵风漂移）
//     → 落地平躺停留 → 抖动淡出 → 下一轮换一棵树重新出生（周期 12–17 秒，按实例错开）
//   · 出生的树：CPU 每 0.4 秒挑离镜头最近的 24 棵（槽位稳定，换掉的槽里正在飘的叶子直接隐藏，等下一轮）
//   · 颜色随树种：白桦金黄、枫红橙、栎锈褐、夏阔叶黄绿、枯叶褐；霜脊 = 雪松上抖落的雪粒，烬落 = 焦树飘下的灰
//   · 风 = field_flora 共享风场（风向 / 强度 / 阵风）；逆光时叶片透光
//   画质：低 = 不落（草木本身也不建）；中 = 数量 ×0.5；超高 ×1.25。?off=leaves 关闭。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { cinePatch } from './cine';
import { FF_SHARED, type FieldFloraOpt, type TreeKind } from './field_flora';

/** 叶子种类（着色器调色板序号） */
export const LEAF = { birch: 0, maple: 1, oak: 2, summer: 3, dry: 4, snow: 5, ash: 6 } as const;
export interface LeafRecipe {
  /** 高画质下的实例数（同时在空中的约 1/4，地上约 1/4） */
  count: number;
  /** 哪些树种会落、落什么（LEAF.*） */
  kinds: Partial<Record<TreeKind, number>>;
}
export function fieldLeavesOn(): boolean {
  if (typeof location !== 'undefined' && /[?&]off=[^&]*leaves/.test(location.search)) return false;
  return curQuality !== 'low';
}
export const fieldLeavesStats: Record<string, { count: number; trees: number }> = {};
const SLOTS = 24;

const GLSL = /* glsl */ `
uniform vec4 uLfT[${SLOTS}]; uniform vec4 uLfT2[${SLOTS}]; uniform vec4 uLfK;
attribute vec4 aLf;
varying float vLfA; varying vec3 vLfC;
mat3 lfRot(vec3 a, float t){ float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(c + a.x*a.x*k, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s,
              a.x*a.y*k - a.z*s, c + a.y*a.y*k, a.z*a.y*k + a.x*s,
              a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, c + a.z*a.z*k); }
vec3 lfPal(float kind, float h){
  if (kind < 0.5) return mix(vec3(0.62, 0.42, 0.07), vec3(0.85, 0.62, 0.14), h);          // 白桦金黄
  if (kind < 1.5) return mix(vec3(0.55, 0.09, 0.03), vec3(0.85, 0.32, 0.05), h);          // 枫红橙
  if (kind < 2.5) return mix(vec3(0.34, 0.15, 0.05), vec3(0.55, 0.28, 0.08), h);          // 栎锈褐
  if (kind < 3.5) return mix(vec3(0.30, 0.38, 0.08), vec3(0.62, 0.55, 0.12), h);          // 夏阔叶黄绿（少量）
  if (kind < 4.5) return mix(vec3(0.16, 0.11, 0.05), vec3(0.32, 0.23, 0.11), h);          // 枯叶褐
  if (kind < 5.5) return vec3(0.92, 0.95, 1.0);                                          // 雪粒
  return mix(vec3(0.10, 0.09, 0.09), vec3(0.32, 0.30, 0.29), h);                         // 飞灰
}
mat3 lfR; vec3 lfP; float lfS;
`;
const MAIN = /* glsl */ `
{
  float t = uFfWind.w;
  float P = 12.0 + aLf.x * 5.0, tt = t + aLf.y * P, cyc = floor(tt / P), tau = tt - cyc * P, cs = t - tau;
  float h1 = ffH(vec2(cyc * 0.731 + aLf.z * 91.7, 4.1)), h2 = ffH(vec2(aLf.w * 53.1, cyc + 3.7)), h3 = ffH(vec2(cyc * 1.7 + aLf.x, 9.1)), h4 = ffH(vec2(aLf.z * 17.3, cyc * 0.37 + aLf.w));
  int si = int(min(floor(h1 * uLfK.x), uLfK.x - 1.0));
  vec4 T = uLfT[si], T2 = uLfT2[si];
  float kind = T2.z;
  float sz = kind < 0.5 ? 0.055 : kind < 1.5 ? 0.085 : kind < 2.5 ? 0.075 : kind < 3.5 ? 0.07 : kind < 4.5 ? 0.065 : kind < 5.5 ? 0.024 : 0.034;
  vec2 vr = kind > 5.5 ? vec2(0.35, 0.6) : kind > 4.5 ? vec2(0.7, 1.1) : vec2(0.85, 1.35);
  float rest = kind > 5.5 ? 3.0 : kind > 4.5 ? 0.8 : 6.0 + 3.0 * aLf.w;
  float ang = h2 * 6.2832, rr = sqrt(h3) * T.w, y0 = mix(T2.x, T2.y, h4);
  vec3 S0 = vec3(T.x + cos(ang) * rr, y0, T.y + sin(ang) * rr);
  float v = mix(vr.x, vr.y, aLf.z), Tf = max((y0 - T.z) / v, 0.5), u = min(tau, Tf);
  vec2 d = uFfWind.xy, pp = vec2(-d.y, d.x); float s = uFfWind.z;
  float dr = 0.25 + 0.9 * s, ws = 1.4 + 1.3 * aLf.w, As = (kind > 4.5 ? 0.12 : 0.22) + 0.3 * aLf.x;
  vec2 base = S0.xz + d * dr * u;
  float g = ffGust(base);
  vec2 hz = base + pp * As * sin(ws * u + aLf.y * 6.2832) + d * (g - 1.0) * 0.9 * sin(3.1416 * u / Tf);   // 阵风只在空中推，落地点确定
  float land = smoothstep(Tf - 0.5, Tf, u);
  float y = max(y0 - v * u + 0.06 * cos(2.0 * ws * u) * (1.0 - land), T.z) + 0.02;
  lfP = vec3(hz.x, y, hz.y);
  // 翻转：绕水平轴转 θ（落地前缓到 kπ 平躺）+ 绕竖轴慢转
  float om = 2.0 + 4.0 * h3, thT = floor(om * Tf / 3.1416 + 0.5) * 3.1416;
  float th = mix(om * u, thT, land);
  vec3 ax = vec3(cos(h2 * 9.0), 0.0, sin(h2 * 9.0));
  lfR = lfRot(vec3(0.0, 1.0, 0.0), h4 * 6.2832 + (aLf.x - 0.5) * 2.0 * u) * lfRot(ax, th);
  float a = smoothstep(0.0, 0.4, tau) * (1.0 - smoothstep(Tf + rest - 1.5, Tf + rest, tau));
  a *= 1.0 - smoothstep(uLfK.z * 0.7, uLfK.z, distance(lfP, cameraPosition));
  bool alive = kind > -0.5 && cs >= T2.w && tau < Tf + rest;
  vLfA = alive ? a : 0.0;
  lfS = alive && a > 0.003 ? sz * uLfK.y * (0.75 + 0.5 * aLf.w) : 0.0;
  vLfC = lfPal(kind, fract(aLf.w * 7.31 + h2)) * (0.85 + 0.3 * h4);
  objectNormal = lfR * objectNormal;
}`;

/** 一片叶：两半沿中脉往上折的小叶形（法线 +y），长 1；从叶柄扇形铺到叶尖 */
function leafGeo(): THREE.InstancedBufferGeometry {
  const pos: number[] = [0, 0, -0.5, 0, 0, 0.5], nor: number[] = [0, 1, 0, 0, 1, 0], idx: number[] = [], N = 7;
  for (const side of [-1, 1]) {
    const b = pos.length / 3, n = new THREE.Vector3(-side * 0.25, 1, 0).normalize();
    for (let i = 1; i < N; i++) {
      const tz = i / N, w = 0.36 * Math.sin(Math.PI * Math.pow(tz, 0.8));
      pos.push(side * w, 0.25 * w, tz - 0.5); nor.push(n.x, n.y, n.z);
    }
    const ring = [...Array(N - 1).keys()].map(i => b + i).concat([1]);
    for (let i = 0; i < ring.length - 1; i++) if (side < 0) idx.push(0, ring[i + 1], ring[i]); else idx.push(0, ring[i], ring[i + 1]);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

export function buildFallingLeaves(o: FieldFloraOpt, rc: LeafRecipe, baseH: Record<TreeKind, number>): THREE.Mesh | null {
  if (!fieldLeavesOn()) return null;
  type Cand = { x: number; z: number; gy: number; R: number; y0: number; y1: number; k: number };
  const cand: Cand[] = [];
  for (const t of o.trees) {
    const k = rc.kinds[t.kind]; if (k === undefined) continue;
    const H = baseH[t.kind] * t.s, gy = o.ground(t.x, t.z);
    const conifer = t.kind === 'snowcedar' || t.kind === 'spruce';
    cand.push({ x: t.x, z: t.z, gy, R: H * (conifer ? 0.22 : 0.28), y0: gy + H * (conifer ? 0.3 : 0.45), y1: gy + H * (conifer ? 0.8 : 0.9), k });
  }
  if (!cand.length) return null;
  const n = Math.round(rc.count * (curQuality === 'ultra' ? 1.25 : curQuality === 'medium' ? 0.5 : 1));
  const geo = leafGeo(), R = (() => { let s = 1234 + n; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const a = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) a[i] = R();
  geo.setAttribute('aLf', new THREE.InstancedBufferAttribute(a, 4)); geo.instanceCount = n;
  const T = Array.from({ length: SLOTS }, () => new THREE.Vector4()), T2 = Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 0, -1, -1e9));
  const K = new THREE.Vector4(0, 2.0, curQuality === 'medium' ? 45 : 60, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, FF_SHARED.U, { uLfT: { value: T }, uLfT2: { value: T2 }, uLfK: { value: K } });
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + FF_SHARED.glsl + GLSL, 'leaves.common');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + MAIN, 'leaves.beginnormal');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\ntransformed = lfP + lfR * (position * lfS);', 'leaves.begin_vertex');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nvarying float vLfA; varying vec3 vLfC;', 'leaves.fcommon');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
      if (vLfA < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;   // 抖动淡出
      diffuseColor.rgb *= vLfC;`, 'leaves.color');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      { vec3 Vv = normalize(vViewPosition); float back = pow(clamp(dot(-Vv, directionalLights[0].direction), 0.0, 1.0), 3.0);
        reflectedLight.indirectDiffuse += min(diffuseColor.rgb * vec3(1.08, 1.0, 0.75) * directionalLights[0].color * 0.6 * back, vec3(0.6)); }   // 逆光透光
      #endif`, 'leaves.trans');
  };
  mat.customProgramCacheKey = () => 'fieldLeaves1';
  mat.userData.noBake = true;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'ff_leaves_' + o.id;
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.noBake = true; mesh.userData.dynDone = true;
  // 每 0.4 秒挑最近的树（槽位稳定）
  const slotTree: number[] = new Array(SLOTS).fill(-1);
  let lastSel = -1, lastT = -1, first = true; const lastCam = new THREE.Vector3(1e9, 0, 0);
  mesh.onBeforeRender = (_r, _s, cam) => {
    const now = performance.now() / 1000, t = FF_SHARED.U.uFfWind.value.w;
    if (t < lastT - 0.01) for (const v of T2) v.w = -1e9;   // 时间倒回（重进本图 / 样片）：不隐藏
    lastT = t;
    if (now - lastSel < 0.4 && cam.position.distanceToSquared(lastCam) < 64) return;
    lastSel = now; lastCam.copy(cam.position);
    const cx = cam.position.x, cz = cam.position.z;
    const near = cand.map((c, i) => ({ i, d: (c.x - cx) ** 2 + (c.z - cz) ** 2 })).filter(e => e.d < 80 * 80).sort((p, q) => p.d - q.d).slice(0, SLOTS);
    const want = new Set(near.map(e => e.i)), used = new Set<number>();
    for (let s = 0; s < SLOTS; s++) if (slotTree[s] >= 0 && want.has(slotTree[s])) used.add(slotTree[s]); else if (slotTree[s] >= 0) { slotTree[s] = -1; T2[s].z = -1; }
    const todo = near.filter(e => !used.has(e.i));
    for (let s = 0; s < SLOTS && todo.length; s++) {
      if (slotTree[s] >= 0) continue;
      const e = todo.shift()!, c = cand[e.i]; slotTree[s] = e.i;
      T[s].set(c.x, c.z, c.gy, c.R); T2[s].set(c.y0, c.y1, c.k, first ? -1e9 : t);   // 新换上的树：正在半空的旧叶子隐藏，等下一轮
    }
    first = false;
    K.x = SLOTS;
  };
  fieldLeavesStats[o.id] = { count: n, trees: cand.length };
  return mesh;
}
