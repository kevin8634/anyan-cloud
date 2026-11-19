// ======================================================================
// 11-16 长副本山体门（Rhett 定稿概念图 03_概念图/07_门_1116b）
//   · 永霜墓穴（霜脊高地 frost (58,-66)）：下沉盆地底部的冰窟门——地形下沉成盆地，陡峭霜崖环绕，石阶下行；
//     崖面开冰洞口，半埋古墓门脸（深色石 + 铜钟）、两尊冰封王像、冰挂 / 蓝冰、蓝色火盆、洞内淡蓝漩涡幕、冷雾外溢、一侧冻结瀑布
//   · 熔心王座（烬落荒原 ember (-22,-104)）：高峰半山腰的火焰山门——身后一座高耸火山峰体，之字形贴崖山路上到门前平台；
//     玄武岩柱 + 黑曜石 / 铜巨门框（王冠纹、铜钟），两侧熔岩瀑布，拱门内橙红火焰漩涡幕，火星余烬、灰烟
//   地形改动（盆地 / 火山 / 平台 / 山路）所有画质一致（寻路、贴地、进副本触发半径都不变）；
//   造景：中 / 高 / 超高全量，低画质简化（少石块、无雾 / 烟 / 粒子、熔岩不流动）。
//   ?off=dungate（或 localStorage darkrock_cine_off 含 dungate）：地形和门都回旧版。
//   坐标：每座门一个局部框架 (a, b)：a = 门朝外方向 u（从门指向来路），b = 垂直方向 v = (-u.z, u.x)；
//   模型局部坐标 x = -b、z = a（组旋转 atan2(u.x, u.z)），y 相对门脚地面。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curQuality, ENV_T, portalMaterial, runePlateMaterial, haloMaterial } from './gfx';
import { cinePatch } from './cine';
import { pbrTex, type PbrOpt } from './pbr_tex';
import { makeVortex } from './vortex_hd';
import { makeIceCluster } from './ice_hd';
import { snowGloss } from './snow_gloss';   // 11-17 霜脊雪：白天降反光
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

let offC: boolean | null = null;
/** 新版山体门开着（地形 + 模型）；?off=dungate 关（读一次缓存，地形函数每次都要问） */
export function dungateOn(): boolean {
  if (offC === null) {
    offC = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offC = `${q},${ls}`.split(',').map(s => s.trim()).includes('dungate');
    } catch { offC = false; }
  }
  return !offC;
}

type Kind = 'frost' | 'ember';
interface Spec { kind: Kind; map: string; gx: number; gz: number; ux: number; uz: number; reach: number }
const spec = (kind: Kind, map: string, gx: number, gz: number, dx: number, dz: number, reach: number): Spec => { const l = Math.hypot(dx, dz); return { kind, map, gx, gz, ux: dx / l, uz: dz / l, reach }; };
const SPECS: Spec[] = [
  spec('frost', 'frost', 58, -66, -0.45, 1, 36),   // 来路：西北（冰晶尖塔方向）
  spec('ember', 'ember', -22, -104, 22, 34, 62),   // 来路：东北（烬火堡垒下来的土路）
];
const specsOf = (map: string) => SPECS.filter(s => s.map === map);
/** 这张图这个坐标是不是新版山体门（给 wild.ts 的 dgate 分支用） */
export function dungateSpec(map: string, gx: number, gz: number): Spec | null {
  if (!dungateOn()) return null;
  return SPECS.find(s => s.map === map && s.gx === gx && s.gz === gz) ?? null;
}
const toAB = (s: Spec, lx: number, lz: number): [number, number] => { const dx = lx - s.gx, dz = lz - s.gz; return [dx * s.ux + dz * s.uz, -dx * s.uz + dz * s.ux]; };
const fromAB = (s: Spec, a: number, b: number): [number, number] => [s.gx + a * s.ux - b * s.uz, s.gz + a * s.uz + b * s.ux];

// ---------------------------------------------------------------- 噪声
const fr = (x: number) => x - Math.floor(x);
const h2 = (x: number, z: number) => fr(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
function vn2(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sm = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- 地形
const FR = { cA: 6, R0: 9, D: -6, W: 3, sw: 2.2, sb: 1.4 };   // 盆地中心在门前 6 米；底面半径 9、深 6；崖壁 3 米宽；石阶半宽 2.2
function frostY(a: number, b: number): number {
  const ca = a - FR.cA, r = Math.hypot(ca, b);
  if (r > 34) return 0;
  const bk = r > 1e-3 ? cl(-ca / r) : 0;                                  // 1 = 正后方（冰洞崖）
  const cs = r > 1e-3 ? ca / r : 1, sn = r > 1e-3 ? b / r : 0;
  const n1 = vn2(cs * 1.6 + 5.3, sn * 1.6 + 2.1);                           // 沿圈的起伏（无接缝）
  const rimH = 3 + 10 * bk ** 1.5 + n1 * 3;
  const F = 8 + 10 * bk;
  let y: number;
  if (r < FR.R0) y = FR.D;
  else if (r < FR.R0 + FR.W) y = FR.D + (rimH - FR.D) * sm((r - FR.R0) / FR.W);
  else y = rimH * (1 - sm((r - FR.R0 - FR.W) / F));
  // 石阶：正前方一条下行走廊（14 米降 6 米 ≈ 23°）
  const side = Math.abs(b);
  if (ca > FR.R0 - 3 && ca < FR.R0 + 16 && side < FR.sw + FR.sb) {
    const sy = FR.D * (1 - cl((ca - (FR.R0 - 1)) / 14));
    y = sy + (y - sy) * sm((side - FR.sw) / FR.sb);
  }
  return y;
}
const FROST_STAIR = { a0: FR.cA + FR.R0 - 1, a1: FR.cA + FR.R0 + 13 };

// 熔心王座：火山（正后方升到 ~52 米）+ 半山腰平台（门前 2.5 米为心、半径 7、高 8）+ 三段之字形山路
const EM = { Hp: 8, pa: 2.5, pr: 7, pw: 2.0, pb: 2.4 };   // 11-16b pb 1.3 → 2.4：路肩放缓（寻路会从路肩斜切）
const EM_KEEP: [number, number, number][] = [[2, -110, 8], [-36, -90, 6]];   // 灰烬铸造厂门、焦骨小队刷怪点：保持平地
function emberMtn(s: Spec, a: number, b: number, calm = 1): number {   // calm < 1：靠近山路 / 平台时压低碎岩噪声（11-16b）
  let core = a >= 0 ? 21 * Math.exp(-a / 10) : 21 + 2 * Math.min(-a, 15.5);
  if (a < -26) core *= 1 - sm((-a - 26) / 24);
  const W = (b >= 0 ? 22 : 16) + Math.max(0, -a) * 0.5;
  const env = Math.exp(-((b / W) ** 2) * 1.6);
  const crag = ((vn2(a * 0.17 + 3.1, b * 0.17 + 7.7) - 0.5) * 8 * cl(core / 30) + (vn2(a * 0.45, b * 0.45) - 0.5) * 2 * cl(core / 20)) * (0.2 + 0.8 * calm);
  let m = Math.max(0, (core + crag) * env) * sm((36 - a) / 8) * sm((48 - Math.abs(b)) / 8) * sm((a + 56) / 6);   // 11-16b 外缘渐隐（原在 a=36 / |b|=48 处截断，留下一道坎）
  if (m <= 0) return 0;
  const [lx, lz] = fromAB(s, a, b);
  for (const [kx, kz, kr] of EM_KEEP) m *= sm((Math.hypot(lx - kx, lz - kz) - kr) / 6);
  return m;
}
const EM_PATH: [number, number][] = [[26, 13], [15, -11], [9, 9], [4, 4]];
// 11-16b 修之字山路内角坡度（原 ~40°，超 32° 可走上限）：两段路在拐角内侧重叠，按"离哪段近取哪段"会在角平分线上断出一道陡坎。
//   改为每个拐角一块平台（EM_LAND 半径内路面平、两段都从平台边才开始爬升），平台半径取到两段路面核心（半宽 pw）分开为止。
const EM_LAND = [0, 7.5, 4.5, 0];
let emPathY: number[] | null = null;
function emberPathYs(s: Spec) { if (!emPathY) emPathY = [Math.max(0.2, emberMtn(s, 26, 13)), 4.2, EM.Hp, EM.Hp]; return emPathY; }
/** 到之字山路中线的距离和那里的路面高度 */
function emberPathAt(s: Spec, a: number, b: number): { d: number; y: number; i: number; t: number } {
  const ys = emberPathYs(s); let best = { d: 1e9, y: 0, i: 0, t: 0 };
  for (let i = 0; i < EM_PATH.length - 1; i++) {
    const [a0, b0] = EM_PATH[i], [a1, b1] = EM_PATH[i + 1], da = a1 - a0, db = b1 - b0, L2 = da * da + db * db, L = Math.sqrt(L2);
    const t = cl(((a - a0) * da + (b - b0) * db) / L2), d = Math.hypot(a - a0 - da * t, b - b0 - db * t);
    const s0 = EM_LAND[i], s1 = EM_LAND[i + 1], u = cl((t * L - s0) / Math.max(1, L - s0 - s1)), k = u * 0.75 + sm(u) * 0.25;
    if (d < best.d) best = { d, y: ys[i] + (ys[i + 1] - ys[i]) * k, i, t };
  }
  // 拐角平台：半径内取拐角高度（覆盖两段重叠区）
  for (let i = 1; i < EM_PATH.length - 1; i++) {
    const [ca, cb] = EM_PATH[i], dl = Math.max(0, Math.hypot(a - ca, b - cb) - (EM_LAND[i] - 1.5 - EM.pw));   // 平台核心半径 = EM_LAND - 1.5
    if (dl < best.d) best = { d: dl, y: ys[i], i, t: 0 };
  }
  return best;
}
function emberY(s: Spec, a: number, b: number): number {
  if (a < -56 || a > 36 || Math.abs(b) > 48) return 0;
  const dp = Math.hypot(a - EM.pa, b), p = emberPathAt(s, a, b);
  let y = emberMtn(s, a, b, Math.min(sm((p.d - EM.pw - 1) / 6), sm((dp - EM.pr - 1) / 6)));
  if (dp < EM.pr + 1.4) y = EM.Hp + (y - EM.Hp) * sm((dp - EM.pr) / 1.4);
  if (p.d < EM.pw + EM.pb) y = p.y + (y - p.y) * sm((p.d - EM.pw) / EM.pb);
  return y;
}

/** 叠加到 wildGroundY 上的高度（局部坐标；base = 原地形高度） */
export function dungateY(map: string, lx: number, lz: number, base: number): number {
  if (!dungateOn()) return base;
  for (const s of SPECS) {
    if (s.map !== map || Math.abs(lx - s.gx) > s.reach + 20 || Math.abs(lz - s.gz) > s.reach + 20) continue;
    const [a, b] = toAB(s, lx, lz);
    if (s.kind === 'frost') { if (Math.hypot(a - FR.cA, b) < 34) return base + frostY(a, b); }
    else return base + emberY(s, a, b);
  }
  return base;
}
/** 在门的造景范围内（寻路格按陡坡封、散布物件 / 地面裂纹让开） */
export function dungateZone(map: string, lx: number, lz: number): boolean {
  if (!dungateOn()) return false;
  for (const s of specsOf(map)) {
    const [a, b] = toAB(s, lx, lz);
    if (s.kind === 'frost' ? Math.hypot(a - FR.cA, b) < 34 : (a > -58 && a < 38 && Math.abs(b) < 50)) return true;
  }
  return false;
}
/** 11-16b 寻路封格坡度：火山坡用 28°（留 4° 余量——寻路结果是格心连线，线段中途采样会比格心陡），冰窟盆地照旧 32° */
export function dungateNavSlope(map: string, lx: number, lz: number, def = 32): number {
  for (const s of specsOf(map)) if (s.kind === 'ember') { const [a, b] = toAB(s, lx, lz); if (a > -58 && a < 38 && Math.abs(b) < 50) return 28; }
  return def;
}
/** 散布物件（树、石、冰锥）和地面熔岩裂纹要不要让开：盆地整片 / 火山坡、山路、平台 */
export function dungateSkip(map: string, lx: number, lz: number): boolean {
  if (!dungateOn()) return false;
  for (const s of specsOf(map)) {
    const [a, b] = toAB(s, lx, lz);
    if (s.kind === 'frost') { if (Math.hypot(a - FR.cA, b) < 30 || (a > 0 && a < FROST_STAIR.a1 + 4 && Math.abs(b) < 5)) return true; }
    else if (a > -58 && a < 38 && Math.abs(b) < 50 && (emberY(s, a, b) > 0.15 || emberPathAt(s, a, b).d < 4 || Math.hypot(a - EM.pa, b) < EM.pr + 4)) return true;
  }
  return false;
}
/** 地形上色：门造景范围内按坡度换岩石（返回 0–1） */
export function dungateRock(map: string, lx: number, lz: number, gy: (lx: number, lz: number) => number): number {
  if (!dungateZone(map, lx, lz)) return 0;
  for (const s of specsOf(map)) if (s.kind === 'frost') { const [a, b] = toAB(s, lx, lz); if (Math.hypot(a - FR.cA, b) > FR.R0 + FR.W + 1.2) return 0; }   // 盆地外坡积雪，只有内崖露岩
  const e = 0.6, gx = (gy(lx + e, lz) - gy(lx - e, lz)) / (2 * e), gz = (gy(lx, lz + e) - gy(lx, lz - e)) / (2 * e);
  const deg = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  return sm((deg - 22) / 14);
}

/** 11-16b 地形顶点色修正（wild.ts terrain() 在崖壁上色之后调用）：火山坡原来是 cliff 0x3a3230 × 岩石贴图 → 近乎纯黑；
 *  提亮成暖褐色并按高度 / 噪声分层，坡脚和熔岩槽附近偏橙（像被熔岩照亮）。永霜盆地不动。 */
export function dungateTint(map: string, lx: number, lz: number, c: THREE.Color): void {
  if (!dungateOn()) return;
  for (const s of specsOf(map)) {
    if (s.kind !== 'ember') continue;
    const [a, b] = toAB(s, lx, lz); if (a < -58 || a > 38 || Math.abs(b) > 50) continue;
    const m = emberMtn(s, a, b); if (m < 0.3) continue;
    const k = sm(m / 4);
    const n = vn2(a * 0.12 + 1.3, b * 0.12 + m * 0.05), n2 = vn2(a * 0.5, b * 0.5);
    _tc.setRGB(0.42 + n * 0.12, 0.3 + n * 0.07, 0.25 + n2 * 0.05);                     // 暖褐岩面（贴图再压暗一半左右）
    _tc.lerp(_th, cl(1 - m / 26) * 0.35 + sm((2.8 - Math.abs(Math.abs(b) - 13)) / 2.8) * sm((14 - a) / 6) * 0.45);   // 坡脚 / 熔岩瀑布两侧偏橙
    c.lerp(_tc, k * 0.85);
  }
}
const _tc = new THREE.Color(), _th = new THREE.Color(0.85, 0.42, 0.2);

// ---------------------------------------------------------------- 材质
let matCache: Record<string, THREE.Material> | null = null;
function std(key: string, p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  matCache ??= {}; const hit = matCache[key]; if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial(p); m.userData.outlineParameters = { visible: false }; matCache[key] = m;
  const t = DG_PBR[key]; if (t) pbrTex(m, t[0], t[1]);   // 11-16d 补写实贴图
  return m;
}
/** 11-16d 每个材质用哪张 GPT 写实贴图（s = 每米重复次数） */
const DG_PBR: Record<string, [string, PbrOpt]> = {
  rockF: ['frostrock', { s: 0.32, bump: 1 }], tunnel: ['frostrock', { s: 0.4, k: 0.8 }], fstatue: ['frostrock', { s: 0.9, k: 0.7, bump: 0.5 }],
  fstone: ['masonry', { s: 0.45, bump: 1.2 }], fstone2: ['masonry', { s: 0.45, bump: 1.2 }],
  bronze: ['bronze', { s: 1.2, k: 0.85, bump: 0.4 }], fcrown: ['bronze', { s: 1.5, k: 0.6, bump: 0.3 }], gold: ['bronze', { s: 1.2, k: 0.6, bump: 0.3 }],
  fsword: ['iron', { s: 1.5, k: 0.5, bump: 0.3 }],
  ice: ['ice', { s: 0.4, k: 0.85, bump: 0.5 }], icethick: ['ice', { s: 0.6, k: 0.8, bump: 0.6 }], icevein: ['ice', { s: 0.5, k: 0.85, bump: 0.5 }], iceshell2: ['ice', { s: 0.6, k: 0.7, bump: 0.3 }],
  snowcap: ['snow', { s: 0.35, bump: 0.8 }], snowdrift: ['snow', { s: 0.35, bump: 0.8 }],
  basalt: ['basalt', { s: 0.4, bump: 1 }], slab: ['masonry', { s: 0.5, k: 0.85, bump: 1.2 }],
  obsidian: ['obsidian', { s: 0.5, k: 0.9, bump: 0.6 }],
};

// ---------------------------------------------------------------- 11-16c 写实表面层（画质专长第 12/13/24/28 步）：
//   世界坐标三平面细节（两层尺度，细层按"每像素米数"淡出防闪烁）+ 细节凹凸（导数法扰动法线）+ 陡面竖向水痕 / 烟痕
//   + 朝上面积雪（霜）/ 积灰（火山）+ 低频色斑，粗糙度随之变；中 / 高 / 超高生效，低档与 ?off=dgsurf 关。
let surfOffC: boolean | null = null;
export function surfOn(): boolean {
  if (surfOffC === null) {
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      surfOffC = `${q},${ls}`.split(',').map(x => x.trim()).includes('dgsurf');
    } catch { surfOffC = false; }
  }
  return !surfOffC && curQuality !== 'low';
}
type SurfKind = 'frost' | 'ember';
/** k: 'frost' 积雪 + 融水痕；'ember' 积灰 + 烟痕。amt: 凹凸 / 色斑强度 */
function surf(m: THREE.MeshStandardMaterial, k: SurfKind, amt = 1): THREE.MeshStandardMaterial {
  if (!surfOn() || m.userData.dgSurf) return m;
  m.userData.dgSurf = k;
  const hi = curQuality === 'high' || curQuality === 'ultra';
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vDgW; varying vec3 vDgN;', 'dgsurf.vc');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDgW = (modelMatrix * vec4(transformed, 1.0)).xyz; vDgN = normalize(mat3(modelMatrix) * objectNormal);', 'dgsurf.vw');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', `#include <common>
varying vec3 vDgW; varying vec3 vDgN;
${NOISE_GLSL}
float dgTri(vec3 p, vec3 w, float s){ return dgF(p.zy * s) * w.x + dgF(p.xz * s) * w.y + dgF(p.xy * s) * w.z; }
float dgHgt, dgUp, dgCov;`, 'dgsurf.fc');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
{
  vec3 N = normalize(vDgN); vec3 tw = pow(abs(N), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  float mpp = length(fwidth(vDgW));                                  // 每像素米数
  float coarse = smoothstep(0.2, 0.8, dgTri(vDgW, tw, 0.35));
  float fine = ${hi ? 'dgTri(vDgW, tw, 1.9)' : '0.5'};
  float fineK = 1.0 - smoothstep(0.08, 0.35, mpp);                   // 细层小于 ~1.5 px 前淡到均值
  fine = mix(0.5, fine, fineK);
  dgHgt = (coarse - 0.5) * 0.7 + (fine - 0.5) * 0.3;
  float blot = dgF(vDgW.xz * 0.06 + 11.0);                          // 低频色斑
  vec3 alb = diffuseColor.rgb * (0.55 + 0.9 * coarse) * ${k === 'frost' ? '(0.85 + 0.3 * fine)' : '(0.93 + 0.14 * fine)'} * mix(0.85, 1.12, blot);${k === 'ember' ? '\n  alb *= vec3(1.06, 0.97, 0.9);   // 玄武岩偏暖，压掉天光的紫' : ''}
  float steep = 1.0 - abs(N.y);
  float streak = dgN(vec2(dot(vDgW.xz, vec2(1.7, 1.3)) * 1.1, vDgW.y * 0.07)) * smoothstep(0.35, 0.85, steep);
  ${k === 'frost'
    ? 'alb *= 1.0 - 0.28 * smoothstep(0.55, 0.95, streak); alb = mix(alb, alb * vec3(0.86, 0.95, 1.08), 0.5 * streak);   // 融水痕：深、偏冷'
    : 'alb *= 1.0 - 0.45 * smoothstep(0.5, 0.95, streak);   // 烟熏痕'}
  dgUp = smoothstep(${k === 'frost' ? '0.5, 0.8' : '0.6, 0.9'}, N.y + (coarse - 0.5) * 0.5);
  dgCov = dgUp * ${amt.toFixed(2)};
  alb = mix(alb, ${k === 'frost' ? 'vec3(0.78, 0.83, 0.9)' : 'vec3(0.16, 0.15, 0.145)'}, dgCov * ${k === 'frost' ? '0.85' : '0.6'});
  diffuseColor.rgb = alb;
}`, 'dgsurf.col');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(mix(roughnessFactor * (0.9 + 0.2 * dgHgt), ${k === 'frost' ? '0.92' : '0.97'}, dgCov), 0.04, 1.0);`, 'dgsurf.rough');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float hb = dgHgt * ${(0.09 * amt).toFixed(3)} * (1.0 - dgCov * 0.6);
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
  vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
  float det = dot(sX, R1);
  vec2 dB = vec2(dFdx(hb), dFdy(hb));
  vec3 g = sign(det) * (dB.x * R1 + dB.y * R2);
  vec3 nb = normalize(abs(det) * normal - g);
  normal = (abs(det) > 1e-12 && !any(isnan(nb))) ? nb : normal;   // NaN 防护（暗场景黑块的教训）
}`, 'dgsurf.nrm');
  };
  m.customProgramCacheKey = () => prevKey() + '|dgsurf_' + k + (hi ? 'h' : 'm') + amt.toFixed(2);
  // 不设 needsUpdate：创建时就打补丁，首编前生效（r170 compileAsync 会因此读到空 program）
  return m;
}

const NOISE_GLSL = `float dgH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dgN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dgH(i), dgH(i + vec2(1,0)), f.x), mix(dgH(i + vec2(0,1)), dgH(i + vec2(1,1)), f.x), f.y); }
float dgF(vec2 p){ return dgN(p) * 0.55 + dgN(p * 2.1 + 3.1) * 0.3 + dgN(p * 4.3 + 7.7) * 0.15; }`;
const VS_UV = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
function shader(key: string, frag: string, o: Partial<THREE.ShaderMaterialParameters> = {}, uni: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
  matCache ??= {}; const hit = matCache[key]; if (hit) return hit as THREE.ShaderMaterial;
  const m = new THREE.ShaderMaterial({ uniforms: { time: ENV_T, ...uni }, vertexShader: VS_UV, fragmentShader: NOISE_GLSL + frag, toneMapped: false, ...o });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true; matCache[key] = m; return m;
}
/** 熔岩流（沿 uv.y 向下流）；动 = 中 / 高 / 超高 */
const lavaMat = (anim: boolean) => shader('lava' + (anim ? 'a' : 's'), `uniform float time; varying vec2 vUv; varying vec3 vW;
  void main(){ float t = ${anim ? 'time' : '0.0'};
    float v = vUv.y * 5.0 - t * 0.55,   /* 11-17 Rhett「熔岩流向错了，应该向下」：uv.y 沿流向（坡上→坡下）递增，花纹随时间往大 uv.y 走 */ n = dgF(vec2(vUv.x * 3.0, v)), n2 = dgF(vec2(vUv.x * 7.0 + 4.0, v * 1.8 + t * 0.3));
    float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    float heat = clamp(n * 1.25 - 0.2 + edge * 0.45 - (1.0 - edge) * 0.4, 0.0, 1.0);
    vec3 c = mix(vec3(0.06, 0.015, 0.01), vec3(1.0, 0.28, 0.03), smoothstep(0.28, 0.62, heat));
    c = mix(c, vec3(1.0, 0.62, 0.22), smoothstep(0.8, 1.0, heat * (0.7 + n2 * 0.5)) * 0.8);
    gl_FragColor = vec4(min(c * 1.15, vec3(1.25, 0.75, 0.4)), 1.0); }`, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
/** 火盆火焰（十字面片，加色）；蓝 = 永霜 */
const flameMat = (blue: boolean) => shader('flame' + (blue ? 'b' : 'r'), `uniform float time; varying vec2 vUv;
  void main(){ float x = (vUv.x - 0.5) * 2.0, y = vUv.y; float n = dgN(vec2(x * 2.5 + 7.0, y * 3.5 - time * 3.2));
    float w = (1.0 - y) * 0.95; float m = smoothstep(w, w * 0.25, abs(x + (n - 0.5) * 0.5 * y)) * smoothstep(1.0, 0.35, y + n * 0.35);
    vec3 core = ${blue ? 'vec3(0.85, 0.95, 1.0)' : 'vec3(1.0, 0.92, 0.6)'}, outer = ${blue ? 'vec3(0.15, 0.45, 1.0)' : 'vec3(1.0, 0.32, 0.04)'};
    vec3 c = mix(outer, core, smoothstep(0.5, 1.0, m) * (1.0 - y));
    gl_FragColor = vec4(c * m * 2.2, m); }`, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
/** 冷雾（水平面片，缓慢漂移） */
const mistMat = () => shader('mist', `uniform float time; varying vec2 vUv; varying vec3 vW;
  void main(){ float r = length(vUv - 0.5) * 2.0; float n = dgF(vW.xz * 0.16 + vec2(time * 0.05, -time * 0.035)); float n2 = dgF(vW.xz * 0.4 - vec2(time * 0.09, 0.0));
    float a = smoothstep(1.0, 0.35, r) * smoothstep(0.35, 0.8, n * 0.7 + n2 * 0.4) * 0.42;
    gl_FragColor = vec4(vec3(0.78, 0.9, 1.0) * a, a); }`, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
/** 洞口内深处（暗蓝 / 暗红径向） */
const caveMat = (col: number) => shader('cave' + col.toString(16), `uniform vec3 col; varying vec2 vUv;
  void main(){ vec2 d = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 0.8); float r = length(d) * 2.0; vec3 c = mix(col * 0.55, vec3(0.005), smoothstep(0.0, 1.1, r)); gl_FragColor = vec4(c, 1.0); }`, {}, { col: { value: new THREE.Color(col) } });
/** 冻结瀑布：竖向冰流纹（静止，微微闪） */
const frozenFallMat = () => shader('frozenfall', `uniform float time; varying vec2 vUv; varying vec3 vW;
  void main(){ float s = dgF(vec2(vUv.x * 14.0, vUv.y * 1.3)); float s2 = dgN(vec2(vUv.x * 40.0, vUv.y * 3.0));
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    vec3 deep = vec3(0.12, 0.32, 0.5), lite = vec3(0.72, 0.9, 1.0);
    vec3 c = mix(deep, lite, smoothstep(0.35, 0.8, s) * 0.8 + s2 * 0.15) + vec3(0.6, 0.85, 1.0) * pow(s2, 8.0) * (0.6 + 0.4 * sin(time * 1.3 + vUv.y * 9.0));
    float a = edge * (0.82 + 0.18 * s);
    gl_FragColor = vec4(c * 0.95, a); }`, { transparent: true, side: THREE.DoubleSide });

/** 烟 / 火星：点精灵，位置由时间在着色器里算（不占 CPU） */
function particles(n: number, box: [number, number, number], kind: 'smoke' | 'ember' | 'snowmist', rise: number, seed: number): THREE.Points {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), sd = new Float32Array(n);
  let s = seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) { pos.set([(R() - 0.5) * box[0], R() * box[1], (R() - 0.5) * box[2]], i * 3); sd[i] = R(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
  const smoke = kind === 'smoke', ember = kind === 'ember';
  const m = new THREE.ShaderMaterial({
    uniforms: { time: ENV_T, rise: { value: rise } }, transparent: true, depthWrite: false, toneMapped: false,
    blending: ember ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute float seed; uniform float time; uniform float rise; varying float vA; varying float vT;
      void main(){ float sp = ${smoke ? '0.035' : ember ? '0.22' : '0.06'}; float t = fract(time * sp * (0.7 + seed * 0.6) + seed);
        vec3 p = position; p.y += t * rise;
        p.x += sin(seed * 40.0 + time * 0.4) * t * ${smoke ? '7.0' : ember ? '1.6' : '3.0'}; p.z += cos(seed * 31.0 + time * 0.3) * t * ${smoke ? '5.0' : ember ? '1.6' : '3.0'};
        vT = t; vA = sin(t * 3.14159);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = ${smoke ? '(5.0 + t * 26.0)' : ember ? '(0.16 + 0.1 * seed)' : '(2.5 + t * 4.0)'} * 420.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vT;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        ${smoke ? 'float a = (1.0 - r) * (1.0 - r) * vA * 0.42; gl_FragColor = vec4(mix(vec3(0.16, 0.12, 0.11), vec3(0.32, 0.27, 0.25), vT), a);'
        : ember ? 'float a = smoothstep(1.0, 0.0, r) * vA; gl_FragColor = vec4(vec3(1.0, 0.45, 0.08) * 2.2 * a, a);'
        : 'float a = (1.0 - r) * vA * 0.16; gl_FragColor = vec4(vec3(0.82, 0.92, 1.0), a);'} }`,
  });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true;
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

// ---------------------------------------------------------------- 岩块：噪声顶点位移 + 顶点色（朝上积雪 / 熔岩缝），一座门一批合并
//   11-16b：霜岩改平滑着色 + 三层噪声（降低低多边形感），顶点色分层：岩 → 蓝冰（陡面竖纹）→ 积雪（朝上、带噪声边）；
//           玄武岩提亮偏暖，另带 heat 属性（朝下 / 低处的熔岩缝），材质里当自发光
type RockStyle = 'frost' | 'basalt';
function rockGeo(R: () => number, sx: number, sy: number, sz: number, det: number, style: RockStyle, m4: THREE.Matrix4): THREE.BufferGeometry {
  const g0 = new THREE.IcosahedronGeometry(1, det);
  const g = style === 'frost' ? mergeVertsLite(g0) : g0;
  const p = g.getAttribute('position') as THREE.BufferAttribute, o1 = R() * 50, o2 = R() * 50;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vn2(v.x * 1.7 + o1, v.y * 1.7 + v.z * 1.3 + o2) * 0.55 + vn2(v.x * 4.1 + o2, v.z * 4.1 + v.y * 2 + o1) * 0.2 + (style === 'frost' ? vn2(v.x * 9 + o1, v.z * 9 - v.y * 7) * 0.08 : 0);
    v.multiplyScalar(0.6 + n * 1.25);
    if (style === 'basalt') v.y = Math.round(v.y * 3) / 3 * 0.35 + v.y * 0.65;   // 层状节理
    else v.y = Math.round(v.y * 4) / 4 * 0.18 + v.y * 0.82;                       // 霜岩：浅层理，积雪能挂在台阶上
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.applyMatrix4(m4); g.computeVertexNormals();
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute, col = new Float32Array(p.count * 3), heat = new Float32Array(p.count);
  const rockA = style === 'frost' ? new THREE.Color(0x4a5566) : new THREE.Color(0x3a2a24), rockB = style === 'frost' ? new THREE.Color(0x6e7c8e) : new THREE.Color(0x5a4234);
  const snow = new THREE.Color(0xf2f7ff), iceC = new THREE.Color(0x8fc4e8), hot = new THREE.Color(0xb8400e), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const ny = nrm.getY(i), wy = p.getY(i), wx = p.getX(i), wz = p.getZ(i);
    c.copy(rockA).lerp(rockB, style === 'frost' ? vn2(wx * 0.9 + wy * 0.7, wz * 0.9) : h2(Math.floor(i / 3), 1.7));
    if (style === 'frost') {
      const st = vn2(wx * 2.2 + wz * 0.4, wy * 0.35 + 3.3);                      // 陡面竖向冰纹
      c.lerp(iceC, sm((0.35 - Math.abs(ny)) / 0.3) * sm((st - 0.55) / 0.2) * 0.75);
      c.lerp(snow, sm((ny - 0.38 + (vn2(wx * 1.3, wz * 1.3) - 0.5) * 0.35) / 0.18));
    } else {
      const hk = sm((-ny - 0.35) / 0.4) * sm((3 - wy) / 5) + sm((vn2(wx * 0.8, wz * 0.8 + wy * 0.5) - 0.78) / 0.08) * 0.5;
      heat[i] = cl(hk); c.lerp(hot, heat[i] * 0.55);
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (style === 'basalt') g.setAttribute('heat', new THREE.BufferAttribute(heat, 1));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
/** 二十面体是非索引的（每面独立顶点 → 位移后会裂、平滑不了）：按位置焊接成索引几何 */
function mergeVertsLite(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute, map = new Map<string, number>(), pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  g.dispose();
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); return o;
}
/** 岩块材质：霜 = 平滑；玄武岩 = 平面 + heat 自发光（熔岩缝），带一点暖色底光 */
function rockMat(style: RockStyle): THREE.MeshStandardMaterial {
  if (style === 'frost') return snowGloss(surf(std('rockF', { vertexColors: true, roughness: 0.78, metalness: 0 }), 'frost'));   // 11-17 顶面积雪白天反光太强
  matCache ??= {}; const hit = matCache.rockE; if (hit) return hit as THREE.MeshStandardMaterial;
  const m = std('rockE', { vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0, emissive: 0x2a0d04, emissiveIntensity: 0.35 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float heat; varying float vHeat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = heat;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHeat;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * smoothstep(0.25, 1.0, vHeat) * 1.6;');
  };
  m.customProgramCacheKey = () => 'dg_rockE';
  pbrTex(m, 'basalt', { s: 0.35, bump: 1 });   // 11-16d 放在自身钩子之后（std 里自动加的会被上面覆盖，所以 rockE 不进 DG_PBR）
  return surf(m, 'ember', 0.6);
}

// ---------------------------------------------------------------- 小部件
const BELL_PROF = [[0.62, 0], [0.58, 0.07], [0.5, 0.2], [0.42, 0.46], [0.39, 0.78], [0.37, 1.02], [0.32, 1.2], [0.2, 1.31], [0.04, 1.35]].map(([r, y]) => new THREE.Vector2(r, y));
function bell(s: number, bronze: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.LatheGeometry(BELL_PROF, 18), bronze); b.position.y = -1.35; b.castShadow = true; g.add(b);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.04, 5, 18), bronze); lip.rotation.x = Math.PI / 2; lip.position.y = -1.33; g.add(lip);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10), bronze); ring.position.y = 0.06; g.add(ring);
  const cl2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bronze); cl2.position.y = -1.2; g.add(cl2);
  g.scale.setScalar(s); return g;
}
function brazier(blue: boolean, hd: boolean, stone: THREE.Material, metal: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), stone); ped.position.y = 0.55; ped.castShadow = true; g.add(ped);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), metal); cap.position.y = 1.15; g.add(cap);
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.12, 0], [0.42, 0.1], [0.62, 0.32], [0.68, 0.44], [0.62, 0.46]].map(([r, y]) => new THREE.Vector2(r, y)), 14), metal); bowl.position.y = 1.2; g.add(bowl);
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.58, 14), new THREE.MeshBasicMaterial({ color: blue ? 0x6ab8ff : 0xff6a20, toneMapped: false })); coal.rotation.x = -Math.PI / 2; coal.position.y = 1.6; coal.material.userData.noBake = true; g.add(coal);
  const fm = flameMat(blue);
  for (let i = 0; i < (hd ? 3 : 2); i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.7), fm); f.position.y = 2.45; f.rotation.y = i * Math.PI / (hd ? 3 : 2); g.add(f); }
  return g;
}

// ---------------------------------------------------------------- 造型
export interface DungateBuild { obj: THREE.Object3D; blocks: { x: number; z: number; r: number }[] }
/** 建一座山体门。groundY = 这张图的地形高度（局部坐标，已含本模块的地形改动）；ds = 原门尺寸倍数（触发半径 4×ds 不变） */
export function makeDungate(s: Spec, color: number, ds: number, groundY: (lx: number, lz: number) => number): DungateBuild {
  const outer = new THREE.Group(); outer.userData.dportal = { color }; outer.userData.dungate = s.kind;
  const root = new THREE.Group(); root.scale.setScalar(1 / ds); root.rotation.y = Math.atan2(s.ux, s.uz); outer.add(root);
  const y0 = groundY(s.gx, s.gz);
  const gy = (a: number, b: number) => { const [lx, lz] = fromAB(s, a, b); return groundY(lx, lz) - y0; };
  const at = (o: THREE.Object3D, a: number, b: number, dy = 0) => { o.position.set(-b, gy(a, b) + dy, a); root.add(o); return o; };
  const blocks: DungateBuild['blocks'] = [];
  const block = (a: number, b: number, r: number) => { const [lx, lz] = fromAB(s, a, b); blocks.push({ x: lx, z: lz, r }); };
  const hd = curQuality !== 'low', hi = curQuality === 'high' || curQuality === 'ultra';
  let sd = s.kind === 'frost' ? 9157 : 4423;
  const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const rocks: THREE.BufferGeometry[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const addRock = (a: number, b: number, dy: number, sx: number, sy: number, sz: number, style: RockStyle) => {
    m4.compose(v3.set(-b, gy(a, b) + dy, a), q.setFromEuler(e.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3)), sc);
    rocks.push(rockGeo(R, sx, sy, sz, hi ? 2 : hd ? 1 : 0, style, m4));   // 11-16b 中档也细分
  };
  if (s.kind === 'frost') buildFrost(); else buildEmber();
  if (rocks.length) {
    const g = mergeGeometries(rocks, false); rocks.forEach(r => r.dispose());
    if (g) { const m = new THREE.Mesh(g, rockMat(s.kind === 'frost' ? 'frost' : 'basalt')); m.receiveShadow = true; m.castShadow = hd; m.name = 'dg_rocks'; root.add(m); }
  }
  return { obj: outer, blocks };

  // ============================================================ 永霜墓穴：冰窟门
  function buildFrost() {
    const stone = surf(std('fstone', { color: 0x46505c, roughness: 0.85, metalness: 0.05 }), 'frost', 0.7);
    const stone2 = surf(std('fstone2', { color: 0x3d434c, roughness: 0.8 }), 'frost', 0.7);
    const bronze = std('bronze', { color: 0x9a7434, roughness: 0.38, metalness: 0.85 });
    const ice = std('ice', { color: 0x9cd4f8, roughness: 0.05, metalness: 0.1, emissive: 0x124a74, emissiveIntensity: 0.6, transparent: true, opacity: 0.86, flatShading: true });   // 11-16b 更亮更滑（冰体高光）
    const snowM = snowGloss(std('snowcap', { color: 0xf2f6ff, roughness: 0.9 }));   // 11-17 白天降反光（底色不变）
    // ---- 崖壁岩块：贴着盆地崖壁一圈竖岩（顶不超过崖沿太多），让开石阶口和门脸；正后方叠高 = 冰洞所在的霜崖
    const N = hd ? 54 : 22;
    for (let i = 0; i < N; i++) {
      const ang = (i + R() * 0.7) / N * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
      if (cs > 0.8) continue;                                          // 石阶口
      const bk = cl(-cs), r = FR.R0 + FR.W * (0.3 + R() * 0.4), a = FR.cA + cs * r, b = sn * r;
      if (bk > 0.9 && Math.abs(b) < 4.4) continue;                     // 门脸正后方留给门
      const top = gy(FR.cA + cs * (FR.R0 + FR.W), sn * (FR.R0 + FR.W)), bot = 0, hh = Math.max(1.5, (top - bot) * 0.55);
      m4.compose(v3.set(-b, (top + bot) / 2 - 0.3, a), q.setFromEuler(e.set((R() - 0.5) * 0.25, -ang + (R() - 0.5) * 0.6, (R() - 0.5) * 0.25)), sc);
      rocks.push(rockGeo(R, 1.1 + R() * 0.9, hh, 1.3 + R() * 0.8, hi ? 2 : hd ? 1 : 0, 'frost', m4));
    }
    // 霜崖：门脸后方两侧叠两层竖岩，崖沿再压几块
    for (let i = 0; i < (hd ? 14 : 6); i++) {
      const sx2 = i % 2 ? 1 : -1, b = sx2 * (4.6 + R() * 5), a = -3.6 - R() * 2.5, base = gy(a, b);
      m4.compose(v3.set(-b, base + 1.5 + R() * 3, a), q.setFromEuler(e.set((R() - 0.5) * 0.2, R() * 6.28, (R() - 0.5) * 0.2)), sc);
      rocks.push(rockGeo(R, 1.4 + R() * 1.1, 3 + R() * 3, 1.3 + R(), hi ? 2 : hd ? 1 : 0, 'frost', m4));
    }
    for (let i = 0; i < (hd ? 26 : 8); i++) {
      const ang = R() * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); if (cs > 0.72) continue;
      const r = FR.R0 + FR.W + 0.5 + R() * 7, a = FR.cA + cs * r, b = sn * r;
      addRock(a, b, -0.3, 0.6 + R() * 1.1, 0.5 + R() * 0.9 + cl(-cs) * 1.5, 0.6 + R() * 1.1, 'frost');
    }
    // 门脸上方的崖顶（盖住门楣后面）
    addRock(-4.5, 0, 9.5, 5.5, 3.2, 2.6, 'frost');
    // 11-16b 积雪层次 + 冰体：崖沿一圈雪檐（平滑、压扁的雪堆，沿崖沿起伏）、崖面两层雪台、陡面竖向蓝冰片（高光 + 自发光边）
    {
      const snowG: THREE.BufferGeometry[] = [], iceG: THREE.BufferGeometry[] = [];
      const sph = new THREE.SphereGeometry(1, hd ? 14 : 7, hd ? 8 : 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const put = (arr: THREE.BufferGeometry[], src: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx2: number, sy2: number, sz2: number) => {
        const g2 = src.clone(); g2.applyMatrix4(m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(sx2, sy2, sz2))); arr.push(g2); };
      const NS = hd ? 40 : 16;
      for (let i = 0; i < NS; i++) {
        const ang = (i + R() * 0.5) / NS * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); if (cs > 0.8) continue;
        const bk = cl(-cs); if (bk > 0.9 && Math.abs(sn * (FR.R0 + FR.W)) < 4.6) continue;
        const r = FR.R0 + FR.W + 0.2 + R() * 0.8, a = FR.cA + cs * r, b = sn * r;
        put(snowG, sph, -b, gy(a, b) - 0.15, a, 0, -ang, 0, 1.6 + R() * 1.4, 0.35 + R() * 0.35, 1.0 + R() * 0.6);          // 崖沿雪檐
        for (const t of [0.35, 0.7]) {                                                                                  // 崖面两层雪台
          if (R() < 0.35) continue;
          const rr = FR.R0 + FR.W * t, aa = FR.cA + cs * rr, bb = sn * rr;
          put(snowG, sph, -bb, gy(aa, bb) - 0.05, aa, 0, -ang, 0, 0.9 + R() * 0.9, 0.18 + R() * 0.12, 0.45 + R() * 0.3);
        }
        if (i % 4 === 0 && bk > 0.15) {   // 冰帘挂在崖面上半段，细一点（11-16b 初版太宽，像整片蓝刀）                                                                                 // 竖向冰片（贴崖面、上窄下宽）
          const rr = FR.R0 + 0.5, aa = FR.cA + cs * rr, bb = sn * rr, top = gy(FR.cA + cs * (FR.R0 + FR.W), sn * (FR.R0 + FR.W)), hh = Math.max(2, top - 0.5);
          put(iceG, new THREE.ConeGeometry(0.7, 1, 5), -bb, top - hh * 0.3 - 0.2, aa, Math.PI, -ang + (R() - 0.5) * 0.4, (R() - 0.5) * 0.15, 0.45 + R() * 0.35, hh * 0.6, 0.25 + R() * 0.15);
        }
      }
      sph.dispose();
      const sg2 = mergeGeometries(snowG, false); snowG.forEach(x => x.dispose());
      if (sg2) { const m = new THREE.Mesh(sg2, snowGloss(std('snowdrift', { color: 0xf4f8ff, roughness: 0.82, emissive: 0x14202e, emissiveIntensity: 0.25 }))); m.receiveShadow = true; root.add(m); }
      const ig = iceG.length ? mergeGeometries(iceG.map(x => x.index ? x.toNonIndexed() : x), false) : null; iceG.forEach(x => x.dispose());
      if (ig) { ig.computeVertexNormals(); root.add(new THREE.Mesh(ig, std('icevein', { color: 0x9ad4ff, roughness: 0.04, metalness: 0.1, emissive: 0x1a5a8a, emissiveIntensity: 0.55, transparent: true, opacity: 0.82, flatShading: true }))); }
    }
    // ---- 冰洞口：洞内深处 + 冰拱 + 漩涡幕（dp_beam：激活才显示）
    const back = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24, 0, Math.PI), caveMat(0x2a6aa0)); back.position.set(0, 0.05, -3.1); root.add(back);
    const backL = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.4), caveMat(0x2a6aa0)); backL.position.set(0, -1.1, -3.1); root.add(backL);
    const tun = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 3.2, 20, 1, true, -Math.PI / 2, Math.PI), std('tunnel', { color: 0x16324a, roughness: 0.4, emissive: 0x061a2c, side: THREE.BackSide }));
    tun.rotation.x = -Math.PI / 2; tun.position.set(0, 0.05, -1.6); root.add(tun);
    const swirl = makeVortex(new THREE.Color(color).multiplyScalar(0.72), 4.8, 4.8);   // 11-16 魔法动效   // 浅蓝本色太亮（泛白），压一点
    swirl.position.set(0, 2.3, -2.0); swirl.name = 'dp_beam'; root.add(swirl);   // 11-16b 修：这行之前被并进了注释，冰窟漩涡幕一直没加进场景
    // 11-17 Rhett「挡住漩涡魔法光效，把弧形拱去掉」：冰拱 / 石拱 / 铜拱圈 + 拱沿冰锥都去掉，漩涡幕整面露出
    // ---- 古墓门脸：双塔柱 + 门楣 + 石拱 + 铜饰 + 铜钟（半埋在雪里：柱脚压进地面）
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.3, 8.4, 1.4), stone); col.position.set(sx * 3.75, 3.6, -1.4); col.castShadow = true; root.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.7), stone2); cap.position.set(sx * 3.75, 8.0, -1.4); root.add(cap);
      const merl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), stone2); merl.position.set(sx * 3.75, 8.65, -1.4); root.add(merl);
      for (const yy of [1.6, 4.4, 6.9]) { const band = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 1.46), bronze); band.position.set(sx * 3.75, yy, -1.4); root.add(band); }
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.6, 0.06), bronze); strip.position.set(sx * 3.75, 4.6, -0.68); root.add(strip);
      const rune = new THREE.Mesh(new THREE.CircleGeometry(0.16, 4), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, toneMapped: false })); rune.position.set(sx * 3.75, 5.5, -0.64); rune.material.userData.noBake = true; root.add(rune);
      // 侧钟（挂在柱头伸出的铜臂上）
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.16), bronze); arm.position.set(sx * 2.85, 6.55, -0.9); root.add(arm);
      const sb = bell(0.62, bronze); sb.position.set(sx * 2.45, 6.45, -0.9); root.add(sb);
      block(-1.4, -sx * 3.75 * 1, 0.9);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.0, 1.2, 1.6), stone); lintel.position.set(0, 7.2, -1.4); lintel.castShadow = true; root.add(lintel);
    const lintel2 = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.22, 1.8), bronze); lintel2.position.set(0, 6.55, -1.4); root.add(lintel2);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 1.2), stone2); ped.position.set(0, 8.4, -1.5); root.add(ped);
    const emb = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), bronze); emb.scale.set(0.8, 1.2, 0.3); emb.position.set(0, 8.45, -0.85); root.add(emb);
    const embG = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, toneMapped: false })); embG.position.set(0, 8.45, -0.7); embG.material.userData.noBake = true; root.add(embG);
    const big = bell(1.0, bronze); big.position.set(0, 6.5, -0.95); root.add(big);
    // 积雪压顶
    const snowTop = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.35, 1.9), snowM); snowTop.position.set(0, 7.95, -1.35); snowTop.scale.y = 0.8; root.add(snowTop);
    // ---- 冰挂：门楣 / 拱下沿垂下的冰锥
    const iciG = new THREE.ConeGeometry(1, 1, 5); iciG.rotateX(Math.PI); iciG.translate(0, -0.5, 0);
    const icis: THREE.BufferGeometry[] = [];
    const ici = (x: number, y: number, z: number, r: number, h: number) => { const g = iciG.clone(); g.applyMatrix4(new THREE.Matrix4().compose(v3.set(x, y, z), q.identity(), new THREE.Vector3(r, h, r))); icis.push(g); };
    for (let i = 0; i < (hd ? 30 : 12); i++) { const x = -4.4 + R() * 8.8; ici(x, 6.6, -0.62 - R() * 0.2, 0.1 + R() * 0.12, 0.5 + R() * (Math.abs(x) < 2.6 ? 1.0 : 1.9)); }
    if (false) for (let i = 0; i < (hd ? 16 : 6); i++) { const a = R() * Math.PI, rr = 2.75; ici(Math.cos(a) * rr, 0.05 + Math.sin(a) * rr - 0.2, -0.75, 0.08 + R() * 0.08, 0.4 + R() * 0.9); }
    if (icis.length) { const g = mergeGeometries(icis, false); icis.forEach(x => x.dispose()); if (g) root.add(new THREE.Mesh(g, ice)); }
    iciG.dispose();
    // 门两侧蓝冰簇
    for (const [a, b, sz] of [[-2.0, 8.6, 1.4], [-1.8, -8.4, 1.3], [2.6, 8.4, 0.9], [2.4, -8.2, 1.0], [-2.2, 2.2, 0.9], [-2.0, -2.4, 0.8]] as const) {   // 11-16b 让开王像正面
      const c = makeIceCluster(sz * 1.3, 0x9adcff, (a * 7.3 + b * 3.1 + 50) % 1); at(c, a, b, -0.1); }
    // ---- 两尊冰封王像（11-16b 重做：远看要读得出是人像——宽肩 + 披风 + 双手拄巨剑 + 金冠；冰只封到腰，上半身石像露出，冰壳半透）
    const statStone = std('fstatue', { color: 0x9aa6b4, roughness: 0.62, metalness: 0.05 });
    const statDark = std('fstatue2', { color: 0x5d6876, roughness: 0.7 });
    const crownM = std('fcrown', { color: 0xd6a944, roughness: 0.28, metalness: 0.95, emissive: 0x3a2200, emissiveIntensity: 0.35 });
    const swordM = std('fsword', { color: 0xc8dcf0, roughness: 0.18, metalness: 0.9, emissive: 0x0c2a44, emissiveIntensity: 0.4 });
    const iceShell = std('iceshell2', { color: 0xb8e4ff, roughness: 0.05, emissive: 0x0e3a60, emissiveIntensity: 0.35, transparent: true, opacity: 0.38, flatShading: true, depthWrite: false });
    const iceShellS = std('iceshell3', { color: 0xb8e4ff, roughness: 0.08, emissive: 0x0e3a60, emissiveIntensity: 0.35, transparent: true, opacity: 0.38, depthWrite: false });
    const L = (pts: number[][], seg: number, mat: THREE.Material) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.4), statDark); base.position.y = 0.5; g.add(base);
      const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 2.0), statStone); base2.position.y = 1.15; g.add(base2);
      // 长袍下摆 → 腰 → 胸甲（上宽下窄的倒梯形躯干）
      const robe = L([[0.95, 0], [0.9, 0.6], [0.72, 1.6], [0.6, 2.2], [0.62, 2.35]], hd ? 14 : 8, statStone); robe.position.y = 1.3; robe.castShadow = true; g.add(robe);
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.16, hd ? 14 : 8), crownM); belt.position.y = 3.62; g.add(belt);
      const torso = L([[0.6, 0], [0.72, 0.5], [0.98, 1.15], [1.02, 1.3], [0.5, 1.5], [0.01, 1.52]], hd ? 14 : 8, statStone); torso.scale.z = 0.72; torso.position.y = 3.65; torso.castShadow = true; g.add(torso);
      // 肩甲
      for (const k of [-1, 1]) {
        const pa = new THREE.Mesh(new THREE.SphereGeometry(0.42, hd ? 12 : 7, hd ? 8 : 5, 0, Math.PI * 2, 0, Math.PI * 0.55), statStone); pa.scale.set(1.1, 0.8, 1); pa.position.set(k * 0.98, 4.85, 0); g.add(pa);
        // 手臂：上臂垂下 → 前臂向前合到剑柄
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 1.15, 7), statStone); up.position.set(k * 1.02, 4.25, 0.08); up.rotation.x = 0.18; up.rotation.z = k * 0.06; g.add(up);
        const fo = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 1.05, 7), statStone); fo.position.set(k * 0.55, 3.75, 0.52); fo.rotation.set(1.1, 0, k * -1.0); g.add(fo);
      }
      // 披风（背后一片略弯的面）
      const cape = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 3.7, 10, 1, true, Math.PI * 0.62, Math.PI * 0.76), statDark); cape.position.set(0, 3.05, -0.08); cape.scale.z = 0.7; (cape.material as THREE.Material).side = THREE.DoubleSide; g.add(cape);
      // 头 + 脖子 + 胡须 + 金冠（尖齿）
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 8), statStone); neck.position.y = 5.25; g.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, hd ? 14 : 8, hd ? 10 : 6), statStone); head.scale.set(0.92, 1.12, 0.98); head.position.y = 5.72; g.add(head);
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 7), statStone); beard.rotation.x = Math.PI + 0.25; beard.position.set(0, 5.28, 0.26); g.add(beard);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.4, 0.26, 10, 1, true), crownM); crown.position.y = 6.08; (crown.material as THREE.Material).side = THREE.DoubleSide; g.add(crown);
      for (let k = 0; k < 7; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, k % 2 ? 0.28 : 0.46, 4), crownM); const a = k / 7 * Math.PI * 2 + Math.PI / 2; t.position.set(Math.cos(a) * 0.41, 6.3 + (k % 2 ? 0 : 0.08), Math.sin(a) * 0.41); g.add(t); }
      const gemC = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, toneMapped: false })); gemC.position.set(0, 6.12, 0.43); gemC.material.userData.noBake = true; g.add(gemC);
      // 巨剑：剑尖插进底座，双手按在剑柄（剑身亮钢色，远处一眼看出）
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.0, 0.08), swordM); blade.position.set(0, 2.55, 0.95); g.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 4), swordM); tip.rotation.x = Math.PI; tip.scale.z = 0.25; tip.position.set(0, 0.85, 0.95); g.add(tip);
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.1), statDark); fuller.position.set(0, 2.6, 0.95); g.add(fuller);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 0.18), crownM); guard.position.set(0, 4.1, 0.95); g.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6), statDark); grip.position.set(0, 4.42, 0.95); g.add(grip);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), crownM); pommel.position.set(0, 4.75, 0.95); g.add(pommel);
      const hands = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), statStone); hands.scale.set(1.4, 0.9, 0.9); hands.position.set(0, 4.45, 0.92); g.add(hands);
      // 冰封：腰以下罩冰壳（半透、硬边），肩上几簇冰晶
      if (hd) {
        const shell = L([[1.35, 0], [1.3, 0.9], [1.15, 1.9], [0.98, 2.5], [0.6, 2.7], [0.01, 2.72]], 20, iceShellS);   // 11-17 冰壳 9 → 20 段平滑着色，竖向棱不再读成缝 shell.position.y = 1.15; shell.rotation.y = 0.4; g.add(shell);
        for (const k of [-1, 1]) { const ic = makeIceCluster(0.55, 0xbfe8ff, (k + 2) * 0.31 + (sx + 2) * 0.17); ic.position.set(k * 0.95, 5.0, -0.1); g.add(ic); }
      } else { const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 2.2, 7), iceShell); shell.position.y = 2.2; g.add(shell); }
      g.rotation.y = -sx * 0.25; g.scale.setScalar(1.45);   // 11-16b 放大，远处也读得出人形
      at(g, -0.6, -sx * 6.3, -0.05); block(-0.6, -sx * 6.3, 1.5);
    }
    // ---- 蓝色火盆：石阶口两侧 + 门前两侧
    for (const [a, b] of [[FROST_STAIR.a0 - 0.5, 3.4], [FROST_STAIR.a0 - 0.5, -3.4], [2.2, 3.3], [2.2, -3.3]] as const) { at(brazier(true, hd, stone, bronze), a, b); block(a, b, 0.6); }
    // ---- 石阶（11-16c Rhett 批「倒角石阶、雪堆地面、厚冰体」）：每级倒角石块，宽窄 / 偏转 / 高低各有一点差；两端压雪；两侧矮墙柱也倒角
    const steps: THREE.BufferGeometry[] = [], walls: THREE.BufferGeometry[] = [], stepSnow: THREE.BufferGeometry[] = [];
    const stepG = new RoundedBoxGeometry(1, 1, 1, hd ? 2 : 1, 0.07), postG = new RoundedBoxGeometry(1, 1, 1, hd ? 2 : 1, 0.12);
    const lumpG = new THREE.IcosahedronGeometry(1, hd ? 2 : 1);
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = FROST_STAIR.a0 + (FROST_STAIR.a1 - FROST_STAIR.a0) * i / n, y = gy(a, 0) + 0.06, w = 4.2 + R() * 0.4, off = (R() - 0.5) * 0.18;
      const g = stepG.clone(); g.applyMatrix4(new THREE.Matrix4().compose(v3.set(off, y - 0.45 + (R() - 0.5) * 0.03, a), q.setFromEuler(e.set((R() - 0.5) * 0.02, (R() - 0.5) * 0.05, (R() - 0.5) * 0.025)), new THREE.Vector3(w, 0.9, 0.84))); steps.push(g);
      for (const sx of [-1, 1]) if (R() < 0.8) {   // 台阶两端积雪：压扁的雪团，贴着矮墙
        const sg0 = lumpG.clone(); sg0.applyMatrix4(new THREE.Matrix4().compose(v3.set(sx * (w / 2 - 0.25 - R() * 0.2) + off, y + 0.02, a + (R() - 0.5) * 0.2), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(0.45 + R() * 0.35, 0.12 + R() * 0.1, 0.4 + R() * 0.15))); stepSnow.push(sg0); }
      if (i % 3 === 0) for (const sx of [-1, 1]) { const pg = postG.clone(); pg.applyMatrix4(new THREE.Matrix4().compose(v3.set(sx * 2.55, Math.max(gy(a, sx * 2.55), y) + 0.35, a), q.setFromEuler(e.set(0, (R() - 0.5) * 0.2, 0)), new THREE.Vector3(0.6, 1.6, 0.6))); walls.push(pg);
        const cap = lumpG.clone(); cap.applyMatrix4(new THREE.Matrix4().compose(v3.set(sx * 2.55, Math.max(gy(a, sx * 2.55), y) + 1.16, a), q.identity(), new THREE.Vector3(0.36, 0.1, 0.36))); stepSnow.push(cap); }
    }
    stepG.dispose(); postG.dispose();
    const sg = mergeGeometries(steps, false), wg = mergeGeometries(walls, false); steps.forEach(x => x.dispose()); walls.forEach(x => x.dispose());
    if (sg) { const m = new THREE.Mesh(sg, stone2); m.receiveShadow = true; m.castShadow = hd; root.add(m); }
    if (wg) { const m = new THREE.Mesh(wg, stone); m.castShadow = true; root.add(m); }
    // ---- 盆底雪堆：沿崖脚、柱脚、石阶两侧堆起的平滑雪丘（压扁的多面球合成一个网格，矮于 0.7 米，不挡路）
    {
      const put = (a: number, b: number, rx: number, ry: number, rz: number, yaw: number) => { const g = lumpG.clone();
        const pp = g.getAttribute('position') as THREE.BufferAttribute; for (let k = 0; k < pp.count; k++) { const yy = pp.getY(k); if (yy < 0) pp.setY(k, yy * 0.15); }   // 底面压平，贴地
        g.applyMatrix4(new THREE.Matrix4().compose(v3.set(-b, gy(a, b) - 0.05, a), q.setFromEuler(e.set(0, yaw, 0)), new THREE.Vector3(rx, ry, rz))); stepSnow.push(g); };
      const M = hd ? 46 : 18;
      for (let i = 0; i < M; i++) {   // 崖脚一圈
        const ang = R() * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); if (cs > 0.75) continue;
        const r = FR.R0 - 0.6 - R() * 1.6, a = FR.cA + cs * r, b = sn * r; if (Math.abs(b) < 2.6 && a < 3) continue;   // 让开门洞
        put(a, b, 1.4 + R() * 1.8, 0.35 + R() * 0.35, 0.9 + R() * 1.0, -ang + Math.PI / 2);
      }
      for (const sx of [-1, 1]) { put(-0.6, sx * 3.75, 1.3, 0.55, 1.1, 0.3 * sx); put(0.6, sx * 4.9, 1.1, 0.4, 0.9, -0.5 * sx); }   // 柱脚
      for (let i = 0; i < (hd ? 10 : 4); i++) { const sx = i % 2 ? 1 : -1, a = FROST_STAIR.a0 + R() * (FROST_STAIR.a1 - FROST_STAIR.a0); put(a, sx * (3.3 + R() * 0.8), 1.0 + R() * 0.8, 0.3 + R() * 0.3, 0.9 + R() * 0.6, R() * 6.28); }   // 石阶外侧
      const g = mergeGeometries(stepSnow, false); stepSnow.forEach(x => x.dispose());
      if (g) { g.computeVertexNormals(); const m = new THREE.Mesh(g, snowGloss(std('snowdrift', { color: 0xf4f8ff, roughness: 0.82, emissive: 0x14202e, emissiveIntensity: 0.25 }))); m.receiveShadow = true; m.name = 'fr_snowpile'; root.add(m); }
    }
    lumpG.dispose();
    // ---- 厚冰体：冰拱两侧和柱脚冻着的大块蓝冰（棱角分明的厚冰，内部更深、边缘透亮），门洞下沿一道冰坎
    {
      const thick = std('icethick', { color: 0x7fb8e0, roughness: 0.06, metalness: 0.05, emissive: 0x0c3456, emissiveIntensity: 0.55, transparent: true, opacity: 0.9, flatShading: true });
      const chunks: THREE.BufferGeometry[] = [];
      const chunk = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number) => { const g = new THREE.IcosahedronGeometry(1, 0);
        const pp = g.getAttribute('position') as THREE.BufferAttribute; for (let k = 0; k < pp.count; k++) pp.setXYZ(k, pp.getX(k) * (0.85 + R() * 0.3), pp.getY(k) * (0.85 + R() * 0.3), pp.getZ(k) * (0.85 + R() * 0.3));
        g.applyMatrix4(new THREE.Matrix4().compose(v3.set(x, y, z), q.setFromEuler(e.set((R() - 0.5) * 0.3, ry, (R() - 0.5) * 0.3)), new THREE.Vector3(sx, sy, sz))); chunks.push(g.index ? g.toNonIndexed() : g); };
      for (const sx of [-1, 1]) {
        chunk(sx * 3.75, 1.3, -1.0, 1.25, 1.9, 1.1, R());            // 柱脚冰封（到 3 米高）
        chunk(sx * 3.2, 3.0, -1.05, 0.8, 1.3, 0.75, R());
        chunk(sx * 2.85, 0.6, -0.8, 0.9, 1.0, 0.8, R());             // 拱脚
        chunk(sx * 4.8, 0.7, -0.6, 1.0, 1.1, 0.9, R());
        chunk(sx * 1.9, 4.4, -1.15, 0.7, 0.55, 0.6, R());            // 拱肩
      }
      chunk(0, 0.12, -0.55, 2.6, 0.26, 0.5, 0);                      // 门洞下沿冰坎（低，不挡路）
      const g = mergeGeometries(chunks, false); chunks.forEach(x => x.dispose());
      if (g) { g.computeVertexNormals(); const m = new THREE.Mesh(g, thick); m.castShadow = true; m.name = 'fr_icethick'; root.add(m); }
    }
    // ---- 底面：符文圆盘（dp_glow）+ 光池（dp_pool）+ 铺地石板
    const pave = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.4, 0.2, 8), stone2); pave.position.set(0, 0.0, 4.2); pave.receiveShadow = true; root.add(pave);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.13, 4.2); plate.name = 'dp_glow'; root.add(plate);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), haloMaterial(color, 0.35)); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.15, 2.5); pool.name = 'dp_pool'; root.add(pool);
    // ---- 冻结瀑布：盆地侧后方（b>0 一侧）从崖顶垂到底，底部冰堆
    {
      const ang = 2.15, r = FR.R0 + 1.1, a = FR.cA + Math.cos(ang) * r, b = Math.sin(ang) * r;
      const topY = gy(FR.cA + Math.cos(ang) * (FR.R0 + 5), Math.sin(ang) * (FR.R0 + 5)) + 1.5, botY = gy(a, b) - 0.3, H = Math.max(6, topY - botY);
      const fall = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.1, H, 14, 6, true, -1.0, 2.0), frozenFallMat());
      const pp = fall.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) pp.setX(i, pp.getX(i) + Math.sin(pp.getY(i) * 0.9 + i) * 0.12);
      fall.geometry.computeVertexNormals();
      const fa = a + Math.cos(ang) * 2.7, fb = b + Math.sin(ang) * 2.7; fall.position.set(-fb, botY + H / 2, fa); fall.rotation.y = Math.PI - ang; root.add(fall);
      for (let k = 0; k < (hd ? 4 : 2); k++) at(makeIceCluster(1.4 + R(), 0xbfe8ff, R()), a - Math.cos(ang) * (1 + R()), b - Math.sin(ang) * (1 + R()) + (R() - 0.5) * 2, -0.2);
    }
    // ---- 冷雾（底面 + 洞口外溢），中档起
    if (hd) {
      const mm = mistMat();
      for (const [a, b, sz, dy] of [[4, 0, 17, 0.35], [1, 2, 11, 0.9], [-0.5, 0, 7, 0.55], [8, -3, 12, 1.4]] as const) { const p = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), mm); p.rotation.x = -Math.PI / 2; at(p, a, b, dy); }
      const mist = particles(hi ? 70 : 36, [5, 0.8, 3], 'snowmist', 1.6, 77); mist.position.set(0, 0.2, -0.8); root.add(mist);
    }
    // ---- 灯：洞口蓝光（dp_light，激活才亮）+ 常亮的火盆蓝光
    const l = new THREE.PointLight(color, 3.5, 16, 1.6); l.position.set(0, 2.4, 0.6); l.name = 'dp_light'; root.add(l);
    const l2 = new THREE.PointLight(0x5aa8ff, 2.2, 14, 1.6); l2.position.set(0, 2.4, FROST_STAIR.a0 - 1); root.add(l2);
  }

  // ============================================================ 熔心王座：火焰山门
  function buildEmber() {
    const basalt = surf(std('basalt', { color: 0x46362e, roughness: 0.82, metalness: 0.08, flatShading: true, emissive: 0x2a0c04, emissiveIntensity: 0.4 }), 'ember', 0.6);   // 11-16b 提亮偏暖（原 0x221c1c 正面一片黑）
    const obsid = std('obsidian', { color: 0x120e12, roughness: 0.25, metalness: 0.35 });
    const bronze = std('bronze', { color: 0x9a7434, roughness: 0.38, metalness: 0.85 });
    const gold = std('gold', { color: 0xc89a3a, roughness: 0.3, metalness: 0.95, emissive: 0x3a1800, emissiveIntensity: 0.4 });
    const slab = surf(std('slab', { color: 0x3a302c, roughness: 0.9 }), 'ember', 0.6);
    // ---- 火山坡上的岩块与黑曜石尖峰（让开平台和山路）
    const mtnPts = (n: number, sx: [number, number], sy: [number, number], minH: number) => {
      for (let i = 0, k = 0; i < n * 8 && k < n; i++) {
        const a = -48 + R() * 70, b = (R() - 0.5) * 70;
        const yy = emberY(s, a, b); if (yy < minH) continue;
        if (emberPathAt(s, a, b).d < 4.2 || Math.hypot(a - EM.pa, b) < EM.pr + 2.5) continue;
        if (Math.abs(Math.abs(b) - 13) < 2.6 && a > -10 && a < 15) continue;    // 熔岩瀑布槽
        const w = sx[0] + R() * (sx[1] - sx[0]);
        addRock(a, b, -w * 0.3, w, sy[0] + R() * (sy[1] - sy[0]), w * (0.8 + R() * 0.4), 'basalt'); k++;
      }
    };
    mtnPts(hd ? 46 : 16, [1.6, 3.6], [1.5, 4], 2);
    mtnPts(hd ? 22 : 8, [1.4, 2.4], [3.5, 7], 10);       // 山脊尖峰 → 锯齿剪影
    for (let i = 0; i < (hd ? 14 : 5); i++) { const a = -4.8 - R() * 5, b = (R() - 0.5) * 13; addRock(a, b, -0.8, 1.3 + R() * 1.2, 1.2 + R() * 2, 1.2 + R(), 'basalt'); }   // 门后崖面：碎岩起伏，不是一整块黑面
    // ---- 平台：铺地 + 熔岩缝圈 + 符文盘
    const pave = new THREE.Mesh(new THREE.CylinderGeometry(EM.pr + 0.2, EM.pr + 0.6, 0.6, 10), slab); pave.position.set(0, -0.22, EM.pa); pave.receiveShadow = true; root.add(pave);
    const seam = new THREE.Mesh(new THREE.RingGeometry(EM.pr - 0.9, EM.pr - 0.6, 40), lavaMat(hd)); seam.rotation.x = -Math.PI / 2; seam.position.set(0, 0.09, EM.pa); root.add(seam);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.11, EM.pa + 0.5); plate.name = 'dp_glow'; root.add(plate);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), haloMaterial(color, 0.35)); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.12, EM.pa); pool.name = 'dp_pool'; root.add(pool);
    // ---- 门：拱内深处 + 火焰漩涡幕（dp_beam）
    const back = new THREE.Mesh(new THREE.PlaneGeometry(5, 8), caveMat(0x8a2006)); back.position.set(0, 3.6, -3.4); root.add(back);
    const swirl = makeVortex(color, 4.3, 6.9, true); swirl.position.set(0, 3.45, -2.7); swirl.name = 'dp_beam'; root.add(swirl);   // 11-16 魔法动效
    // 黑曜石门框：外矩形里挖尖拱（挤出）
    {
      const sh = new THREE.Shape(); sh.moveTo(-4.1, 0); sh.lineTo(4.1, 0); sh.lineTo(4.1, 10.2); sh.lineTo(-4.1, 10.2); sh.lineTo(-4.1, 0);
      const hole = new THREE.Path(); hole.moveTo(-2.25, 0); hole.lineTo(-2.25, 4.6); hole.quadraticCurveTo(-2.25, 6.6, 0, 7.4); hole.quadraticCurveTo(2.25, 6.6, 2.25, 4.6); hole.lineTo(2.25, 0); hole.lineTo(-2.25, 0);
      sh.holes.push(hole);
      const fg = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1, curveSegments: 10 });
      const frame = new THREE.Mesh(fg, obsid); frame.position.set(0, -0.1, -3.6); frame.castShadow = true; root.add(frame);
      // 铜内框：沿尖拱的管
      const pts = [new THREE.Vector3(-2.35, 0, 0), new THREE.Vector3(-2.35, 4.6, 0), new THREE.Vector3(-1.5, 6.6, 0), new THREE.Vector3(0, 7.5, 0), new THREE.Vector3(1.5, 6.6, 0), new THREE.Vector3(2.35, 4.6, 0), new THREE.Vector3(2.35, 0, 0)];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), 40, 0.16, 6), bronze); tube.position.set(0, -0.1, -1.92); root.add(tube);
      const tube2 = tube.clone(); tube2.scale.set(1.16, 1.06, 1); tube2.position.z = -1.95; root.add(tube2);
    }
    // 两侧塔楼（玄武岩 + 铜箍 + 王冠顶）与铜钟
    for (const sx of [-1, 1]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 11.5, 8), basalt); tw.position.set(sx * 5.0, 5.3, -2.9); tw.castShadow = true; root.add(tw);
      for (const yy of [1.2, 4.6, 8.2, 10.6]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.32 - yy * 0.004, 1.5 - yy * 0.016, 0.24, 8), bronze); band.position.set(sx * 5.0, yy, -2.9); root.add(band); }
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.3, 0.5, 8), bronze); rim.position.set(sx * 5.0, 11.2, -2.9); root.add(rim);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 4), gold); t.position.set(sx * 5.0 + Math.cos(a) * 1.25, 11.85, -2.9 + Math.sin(a) * 1.25); root.add(t); }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 8), obsid); spire.position.set(sx * 5.0, 12.9, -2.9); root.add(spire);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.22), bronze); arm.position.set(sx * 6.4, 7.6, -2.0); root.add(arm);
      const b1 = bell(0.85, bronze); b1.position.set(sx * 7.0, 7.5, -2.0); root.add(b1);
      const b2 = bell(0.55, bronze); b2.position.set(sx * 3.75, 4.4, -1.6); root.add(b2);
      const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.16), bronze); arm2.position.set(sx * 4.05, 4.5, -1.6); root.add(arm2);
      block(-2.9, -sx * 5.0, 1.6);
    }
    // 门楣王冠纹（金）
    {
      const cg = new THREE.Group(); cg.position.set(0, 8.7, -1.9);
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 12), gold); disk.rotation.x = Math.PI / 2; cg.add(disk);
      for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.33; const t = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5 - Math.abs(k - 3) * 0.2, 4), gold); t.position.set(Math.sin(a) * 1.25, Math.cos(a) * 1.25, 0); t.rotation.z = -a; cg.add(t); }
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20, Math.PI), gold); band.rotation.z = 0; cg.add(band);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: 0xff5a10, toneMapped: false })); gem.position.z = 0.22; gem.material.userData.noBake = true; cg.add(gem);
      root.add(cg);
    }
    // 门两侧 / 平台后缘的玄武岩柱群
    const cols: THREE.BufferGeometry[] = [];
    const hexG = new THREE.CylinderGeometry(1, 1, 1, 6);
    const colAt = (a: number, b: number, r: number, h: number) => { const g = hexG.clone(); g.applyMatrix4(new THREE.Matrix4().compose(v3.set(-b, gy(a, b) + h / 2 - 0.4, a), q.setFromEuler(e.set(0, R(), 0)), new THREE.Vector3(r, h, r))); cols.push(g); };
    for (const sx of [-1, 1]) for (let k = 0; k < (hd ? 9 : 4); k++) { const a = -4.5 + R() * 3.2, b = -sx * (7 + R() * 3.2); colAt(a, b, 0.45 + R() * 0.35, 5 + R() * 8); }
    for (let k = 0; k < (hd ? 8 : 3); k++) { const t = R(); const a = -5.5 - R() * 2, b = (t - 0.5) * 18; if (Math.abs(b) < 6) continue; colAt(a, b, 0.5 + R() * 0.4, 9 + R() * 7); }
    hexG.dispose();
    if (cols.length) { const g = mergeGeometries(cols, false); cols.forEach(x => x.dispose()); if (g) { const m = new THREE.Mesh(g, basalt); m.castShadow = true; m.receiveShadow = true; root.add(m); } }
    // ---- 火盆（平台前缘两侧）
    for (const [a, b] of [[EM.pa + 4.8, 3.6], [EM.pa + 4.8, -3.6]] as const) { at(brazier(false, hd, basalt, bronze), a, b); block(a, b, 0.6); }
    // ---- 之字山路：石板路面 + 低侧挡土墙 + 外沿立柱
    const slabs: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = [], wallG: THREE.BufferGeometry[] = [], lampG: THREE.BufferGeometry[] = [];
    const bx = new THREE.BoxGeometry(1, 1, 1);
    const box = (arr: THREE.BufferGeometry[], a: number, b: number, y: number, w: number, h: number, d: number, ry: number) => { const g = bx.clone(); g.applyMatrix4(new THREE.Matrix4().compose(v3.set(-b, y, a), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(w, h, d))); arr.push(g); };
    for (let i = 0; i < EM_PATH.length - 1; i++) {
      const [a0, b0] = EM_PATH[i], [a1, b1] = EM_PATH[i + 1], L = Math.hypot(a1 - a0, b1 - b0), n = Math.ceil(L / 1.1);
      const ta = (a1 - a0) / L, tb = (b1 - b0) / L, ry = Math.atan2(-tb, ta);   // 局部 (x=-b, z=a) 里沿路方向
      for (let k = 0; k <= n; k++) {
        const t = k / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t, y = gy(a, b);
        if (Math.hypot(a - EM.pa, b) < EM.pr - 0.4) continue;
        box(slabs, a, b, y - 0.16, 3.9, 0.36, 1.2, ry);
        for (const sd2 of [-1, 1]) {
          const ea = a + -tb * sd2 * 2.35, eb = b + ta * sd2 * 2.35, gyE = gy(ea, eb);
          if (gyE < y - 0.7) { const hh = y - gyE + 0.6; box(wallG, ea, eb, y - hh / 2, 0.7, hh, 1.2, ry); if (k % 3 === 0) { box(posts, ea, eb, y + 0.55, 0.32, 1.3, 0.32, ry); box(lampG, ea, eb, y + 1.27, 0.24, 0.16, 0.24, ry); } }   // 11-17 柱顶暖色自发光灯帽（夜里认路）
        }
      }
    }
    bx.dispose();
    if (lampG.length) { const g = mergeGeometries(lampG, false); lampG.forEach(x => x.dispose()); if (g) { const m = new THREE.Mesh(g, std('emlamp', { color: 0x3a1a0c, roughness: 0.6, emissive: 0xff7a30, emissiveIntensity: 0.9 })); m.name = 'dg_pathlamp'; root.add(m); } }   // 11-17 Rhett「晚上看不见路」：路缘灯帽（不加点光，低档也有）
    for (const [arr, mat] of [[slabs, slab], [wallG, basalt], [posts, obsid]] as const) { if (!arr.length) continue; const g = mergeGeometries(arr, false); arr.forEach(x => x.dispose()); if (g) { const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = mat !== slab; root.add(m); } }
    // ---- 熔岩瀑布：平台两侧沿坡面流下（贴地带状网格，uv.y 沿流向）
    const lm = lavaMat(hd);
    // 11-17 Rhett「两边熔岩瀑布都要修：流在不符合物理的位置；底下是规则圆，改不规则像湖泊」：
    //   不再按固定直线（a 从 -12 到 14、b≈±13）硬铺 → 从两侧坡上源头沿地面最陡下降方向逐步流（带少量蜿蜒），
    //   遇到平地 / 洼底 / 玩家走的路就停，终点按实际地面铺一汪不规则熔岩湖（贴地扇面，岸线噪声起伏）；
    //   带子横向 6 格逐点贴地（取周围最高地面再抬 0.3 米）+ 深度偏移，防穿模
    const gyMax = (a: number, b: number) => Math.max(gy(a, b), gy(a + 0.6, b), gy(a - 0.6, b), gy(a, b + 0.6), gy(a, b - 0.6));
    const lakeAt = (ca: number, cb: number, r: number, seed: number) => {
      const n = 48, rings = 5, pos: number[] = [], uv: number[] = [], idx: number[] = [], rad: number[] = [];
      for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; rad.push(r * (0.72 + 0.2 * Math.sin(t * 2 + seed) + 0.12 * Math.sin(t * 5 + seed * 1.7) + 0.08 * (vn2(Math.cos(t) * 2 + seed, Math.sin(t) * 2) - 0.5) * 2)); }
      pos.push(-cb, gyMax(ca, cb) + 0.3, ca); uv.push(0.5, 0.5);
      for (let j = 1; j <= rings; j++) for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, rr = rad[i] * j / rings, a = ca + Math.cos(t) * rr, b = cb + Math.sin(t) * rr;
        pos.push(-b, gyMax(a, b) + 0.3, a); uv.push(0.5 + 0.5 * (j / rings) * Math.cos(t), 0.5 + 0.5 * (j / rings) * Math.sin(t)); }
      for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
      for (let j = 1; j < rings; j++) { const a0 = 1 + (j - 1) * n, b0 = 1 + j * n; for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, lm); m.renderOrder = 2; m.name = 'dg_lavalake'; root.add(m);
    };
    for (const [aS, bS, seed] of [[-12, 13, 1], [-12, -14, 2]] as const) {
      const pts: [number, number][] = []; let a: number = aS, b: number = bS, still = 0;
      for (let k = 0; k < 160; k++) {
        pts.push([a, b]);
        const e2 = 0.6, ga = gy(a + e2, b) - gy(a - e2, b), gb = gy(a, b + e2) - gy(a, b - e2), gl = Math.hypot(ga, gb);
        if (gl < 0.08) { if (++still > 3) break; } else still = 0;                          // 平地：熔岩停下成湖
        const j = (vn2(a * 0.35 + seed * 9, b * 0.35) - 0.5) * 0.9, da = -ga / (gl || 1), db = -gb / (gl || 1);
        const na = a + (da * Math.cos(j) - db * Math.sin(j)) * 0.5, nb = b + (da * Math.sin(j) + db * Math.cos(j)) * 0.5;
        if (gy(na, nb) > gy(a, b) + 0.02) break;                                              // 洼底：再走就往上了
        if (emberPathAt(s, na, nb).d < EM.pw + 1.6 || Math.hypot(na - EM.pa, nb) < EM.pr + 1.5) break;   // 不流上玩家走的路 / 门前平台
        a = na; b = nb;
      }
      if (pts.length < 8) continue;
      const N = pts.length - 1, M = 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let k = 0; k <= N; k++) {
        const [pa, pb] = pts[k], [a2, b2] = pts[Math.min(k + 1, N)], [a1, b1] = pts[Math.max(k - 1, 0)];
        let ta = a2 - a1, tb = b2 - b1; const l = Math.hypot(ta, tb) || 1; ta /= l; tb /= l;
        const t = k / N, w = (1.6 + 1.4 * Math.min(1, t * 3)) * (0.85 + 0.3 * vn2(pa * 0.5, pb * 0.5 + seed));   // 源头窄、往下变宽，宽度微微起伏
        for (let m = 0; m <= M; m++) { const u = m / M, o = (u - 0.5) * w, ea = pa - tb * o, eb = pb + ta * o; pos.push(-eb, gyMax(ea, eb) + 0.3, ea); uv.push(u, k * 0.5 / 6.5); }
        if (k < N) for (let m = 0; m < M; m++) { const o = k * (M + 1) + m, o2 = o + M + 1; idx.push(o, o2, o + 1, o + 1, o2, o2 + 1); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const fall = new THREE.Mesh(g, lm); fall.renderOrder = 2; fall.name = 'dg_lavafall'; root.add(fall);
      const [ea, eb] = pts[N]; lakeAt(ea, eb, 3.2 + R() * 1.2, seed * 3.7);
    }
    // ---- 火山口：峰顶熔岩 + 灰烟 + 火星
    {
      let ta = -16, tb = 0, ty = -1e9;
      for (let a = -30; a <= -8; a += 2) for (let b = -8; b <= 8; b += 2) { const yy = gy(a, b); if (yy > ty) { ty = yy; ta = a; tb = b; } }
      const crater = new THREE.Mesh(new THREE.CircleGeometry(3.4, 18), lm); crater.rotation.x = -Math.PI / 2; crater.position.set(-tb, ty - 0.6, ta); root.add(crater);
      for (let k = 0; k < (hd ? 10 : 5); k++) { const a = k / (hd ? 10 : 5) * Math.PI * 2; addRock(ta + Math.cos(a) * 4, tb + Math.sin(a) * 4, -0.5, 1.6, 2.4 + R() * 1.5, 1.6, 'basalt'); }
      if (hd) {
        const smoke = particles(hi ? 60 : 30, [6, 2, 6], 'smoke', 34, 311); smoke.position.set(-tb, ty, ta); root.add(smoke);
        const emb = particles(hi ? 120 : 60, [16, 4, 10], 'ember', 9, 521); emb.position.set(0, 0.5, 1); root.add(emb);
        for (const sx of [-1, 1]) { const e2 = particles(hi ? 50 : 24, [3, 10, 10], 'ember', 6, 600 + sx); e2.position.set(-sx * 13, gy(4, sx * 13), 4); root.add(e2); }
      }
      const cl3 = new THREE.PointLight(0xff5a10, 3, 30, 1.4); cl3.position.set(-tb, ty + 3, ta); root.add(cl3);
    }
    // ---- 11-16b 火山正面：熔岩裂缝（沿坡向下蜿蜒的自发光细带）+ 两侧宽光晕（加色，假装岩面被熔岩照亮）
    {
      const crackM = lavaMat(hd), haloM = shader('lavahalo', `uniform float time; varying vec2 vUv;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0; float a = pow(1.0 - x, 2.2) * (0.5 + 0.12 * sin(time * 1.3 + vUv.y * 3.0)) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(vec3(1.0, 0.36, 0.08) * a * 0.55, a); }`, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const cpos: number[] = [], cuv: number[] = [], cidx: number[] = [], hpos: number[] = [], huv: number[] = [], hidx: number[] = [];
      const ribbon = (pts: [number, number, number][], w0: number, pos: number[], uv: number[], idx: number[], lift: number) => {
        const base = pos.length / 3;
        for (let k = 0; k < pts.length; k++) {
          const [a, b, y] = pts[k], [a2, b2] = pts[Math.min(k + 1, pts.length - 1)], [a1, b1] = pts[Math.max(k - 1, 0)];
          let ta = a2 - a1, tb = b2 - b1; const l = Math.hypot(ta, tb) || 1; ta /= l; tb /= l;
          const t = k / (pts.length - 1), w = w0 * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
          for (const sd2 of [-1, 1]) { const ea = a - tb * sd2 * w, eb = b + ta * sd2 * w; pos.push(-eb, Math.max(y, gy(ea, eb)) + lift, ea); uv.push(sd2 < 0 ? 0 : 1, t * 3); }
          if (k < pts.length - 1) { const o = base + k * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
        }
      };
      const NC = hd ? 16 : 7;
      for (let c = 0, tries = 0; c < NC && tries < 400; tries++) {
        let a = -30 + R() * 46, b = (R() - 0.5) * 52; const y0c = gy(a, b);
        if (emberY(s, a, b) < 6 || emberPathAt(s, a, b).d < 4.5 || Math.hypot(a - EM.pa, b) < EM.pr + 3) continue;
        const pts: [number, number, number][] = []; let ok = true;
        for (let k = 0; k < 40; k++) {
          const y = gy(a, b); pts.push([a, b, y]);
          const e2 = 0.6, ga = gy(a + e2, b) - gy(a - e2, b), gb = gy(a, b + e2) - gy(a, b - e2), gl = Math.hypot(ga, gb) || 1;
          const j = (vn2(a * 0.4 + c * 7, b * 0.4) - 0.5) * 1.6;                       // 蜿蜒
          const da = -ga / gl, db = -gb / gl; a += (da * Math.cos(j) - db * Math.sin(j)) * 0.9; b += (da * Math.sin(j) + db * Math.cos(j)) * 0.9;
          if (emberPathAt(s, a, b).d < EM.pw + 1.2 || Math.hypot(a - EM.pa, b) < EM.pr + 1 || gy(a, b) < 0.6) break;
        }
        if (pts.length < 6 || !ok || y0c < 2) continue;
        ribbon(pts, 0.22 + R() * 0.22, cpos, cuv, cidx, 0.1); ribbon(pts, 1.8 + R() * 0.8, hpos, huv, hidx, 0.16); c++;
      }
      for (const [pos, uv, idx, mat] of [[cpos, cuv, cidx, crackM], [hpos, huv, hidx, haloM]] as const) {
        if (!idx.length || (mat === haloM && !hd)) continue;
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat); m.name = mat === crackM ? 'dg_cracks' : 'dg_crackglow'; m.renderOrder = 2; root.add(m);
      }
      // 熔岩瀑布 / 裂缝的光晕：一盏大范围暖色补光照正面岩坡（低画质也开：只多一盏灯）
      const fill = new THREE.PointLight(0xff6a2a, hi ? 5 : 4, 70, 1.1); fill.position.set(0, 18, 22); fill.name = 'dg_fill'; root.add(fill);
    }
    // ---- 11-16b 拐角平台铺地（之字路两个拐角，平台高度见 EM_LAND）
    for (let i = 1; i < EM_PATH.length - 1; i++) {
      const [ca, cb] = EM_PATH[i], rr = EM_LAND[i] - 1.5;
      const pv = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr + 0.3, 0.5, 9), slab); pv.receiveShadow = true; at(pv, ca, cb, -0.2);
    }
    // ---- 11-17 Rhett「烬落晚上看不见路，特别是副本山体」：之字山路沿途 3 盏暖色低强度补光（中档起；低档只有路缘灯帽）
    if (hd) for (const [a, b] of [[(EM_PATH[0][0] + EM_PATH[1][0]) / 2, (EM_PATH[0][1] + EM_PATH[1][1]) / 2], EM_PATH[1], EM_PATH[2]] as const) {
      const pl = new THREE.PointLight(0xff8a48, 3.5, 15, 1.5); pl.position.set(-b, gy(a, b) + 2.6, a); pl.name = 'dg_pathlight'; root.add(pl);
    }
    // ---- 灯：门内火光（dp_light，激活才亮）
    const l = new THREE.PointLight(color, 4, 18, 1.5); l.position.set(0, 3.2, 0.8); l.name = 'dp_light'; root.add(l);
  }
}
