// ======================================================================
// 11-15 本体野外写实草木（画质专长包第 49 / 50 / 83–86 步；思路与参数借鉴 DLC flora_hd.ts / coast_flora.ts / dyn_world.ts，本文件为本体自有实现）
//   · 草：多段弯曲草叶（根粗梢尖、横向圆法线、扭转），成簇成片（fbm 斑块 + 避让区边缘渐稀），根暗梢黄、逆光透光，
//         按 40 米分块成 InstancedMesh（视锥裁剪 + 距离裁剪），远处草叶在着色器里矮下去（不跳变）
//   · 野花：雏菊（11 瓣 + 黄心）/ 虞美人（5 瓣杯形 + 黑心）/ 羽扇豆（约 14 朵四瓣小花往上收尖）/ 毛茛（5 瓣黄）
//   · 树：一张 2×2 叶簇图集（绿椭圆叶 / 白桦金叶 / 红橙枫叶 / 锈色栎叶）+ 针叶刷卡；阔叶 = 递归分枝锥形枝干 + 树冠壳叶卡 + 内层暗填充卡；
//         树种：白桦、枫、栎、阔叶（夏绿）、云杉、雪松（雪原积雪）、枯树（白骨 / 焦黑）、灌丛；每种 2 个变体，按 80 米分块实例化
//   · 风：一个共享风场（阵风 + 滚浪随风漂移，只调振幅，频率按物体恒定），根固定、弯曲 ∝ 高度²；树干倾斜 + 近处叶颤；
//         草 / 花 / 灌丛被玩家（高画质再加最近 3 个在动的怪）推开，离开后闭式阻尼回弹（第 17 / 23 / 50 步）
//   · 每帧驱动：组里一个不可见的「节拍器」网格的 onBeforeRender（只在本图可见时跑），不依赖 main.ts
//   画质：超高 / 高 = 全量；中 = 草花 ×0.4、树叶卡 ×0.6、无叶颤 / 无怪推；低 = 不建（调用方保留旧版）。?off=fieldflora 回旧版。
//   11-16 草木 v3（照搬「秋林逆光 v3」）：透光吃阴影、草法线贴地、梢暖根暗、滚浪阵风、中画质开近处叶颤；实例数不变；?off=flora3 回 11-15 版。
//   11-17 秋林植被分层 / 叶缘透光 / AO（?off=veglayer）：草花近层全密度 → 中层面积守恒稀疏（逐丛缩没、留下的放宽）→ 远层矮下去；草分块远了换 2–3 段低模；
//         逆光叶缘 / 草叶两侧透亮（乘阴影）；草丛根部 + 丛心、树冠下半、树根压暗（顶点 / 高度渐变，无后期 pass）。
//   11-17 草花阴影 / 倒影（?off=vegshadow，中档以上）：草花照旧只接收主阴影、不投射；每丛 / 每朵加贴地假阴影圆片（veg_shadow.ts，近处才画）；
//         离水边 3.5 米内的草花单独分块并标 userData.refl，进现有河面反射图（river_refl 剔除表按它放行），不新增 RT、不改 water2。
// ======================================================================
import { treeWindGlsl } from './tree_wind';   // 11-17 树：主干不动、树冠整体摆
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curQuality } from './gfx';
import { QL_DEMO } from './map_look';   // 11-17g 专长包 v8 风场 / 草密度
import { cinePatch, CFX2, cineSpecClass } from './cine';
import { buildFallingLeaves, LeafRecipe } from './field_leaves';
import { vegLayerOn, vegShadowOn } from './veg_flags';
import { buildDemoTrees, demoTreeCountK, qlMapleOn, qlMapleFullOn, demoLeafAtlas, demoLeafCell, type DemoPal, type DemoKind, type DemoTreePlace } from './demo_trees';   // 11-19 秋林 Demo 树种（?off=demotree）
import { qlLushOn, qlFlowerGeo, qlFlowerTex, qlFlowerField, qlSstep, QL_FLOWER_H, QL_FLOWER_DENS, type LushOpt } from './ql_lush';   // 11-19 花草繁茂（?off=qllush）
import { vegContactShadow } from './veg_shadow';   // 11-17 草花底部假阴影 + 岸边进倒影（?off=vegshadow）   // 11-17 秋林植被分层 / 叶缘透光 / AO（?off=veglayer）

// ---------------------------------------------------------------- 开关
/** 当前画质 / 开关下是否用新版草木（低画质或 ?off=fieldflora → false，调用方保留旧版） */
export function fieldFloraOn(): boolean {
  if (typeof location !== 'undefined' && /[?&]off=[^&]*fieldflora/.test(location.search)) return false;
  if (typeof location !== 'undefined' && /[?&]ffforce/.test(location.search)) return true;   // 自查：低档启动也出写实草木（沙箱中 / 高档启动会 OOM）
  return curQuality !== 'low';
}
/** 11-16 草木 v3（照搬「秋林逆光 v3」：透光走阴影后的太阳、草叶法线贴地、梢暖根暗远处压色、滚浪阵风、中画质也有近处叶颤）；?off=flora3 或 localStorage darkrock_cine_off 含 flora3 → 11-15 版 */
let f3Off: boolean | null = null;
// 11-17 秋林逆光 v3 移植：草色表 GPAL（深绿 → 草绿 → 橄榄 → 枯黄 → 赭），按大块 fbm + 小块噪声 + 随机取色；
//   不干的地图只用到前段（深绿～橄榄），干旱度 L.dry 越高越往枯黄 / 赭走。?off=gpal 回旧版 HSL 取色
const GPAL = ['#1c300c', '#355512', '#62781e', '#93882a', '#a07a34'].map(h => new THREE.Color(h));
function gpal(t: number, k: number): THREE.Color { const f = t * (GPAL.length - 1), i = Math.min(GPAL.length - 2, Math.floor(f)); return GPAL[i].clone().lerp(GPAL[i + 1], f - i).multiplyScalar(k); }
let gpOff: boolean | null = null;
function gpalOn(): boolean {
  if (gpOff === null) { gpOff = false; try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; gpOff = `${q},${ls}`.split(',').map(x => x.trim()).includes('gpal'); } catch { gpOff = false; } }
  return !gpOff;
}
export function flora3On(): boolean {
  if (f3Off === null) {
    f3Off = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      f3Off = `${q},${ls}`.split(',').map(x => x.trim()).includes('flora3');
    } catch { f3Off = false; }
  }
  return !f3Off && curQuality !== 'low';
}
// 11-17g 专长包 v8 档位表（?off=qlgrass 回旧）：草 高 24 万 / 中 14 万 → 中档 = 高档 × 0.583（原 0.4）；花 高 1.0 / 中 0.7；超高沿用 1.25（Demo 没有超高档）。
//   低档本游戏不建草木（保持不变）。各图绝对数量（旱地、冬、灰烬偏少）未改，待 Rhett 定。
const tierK = () => (curQuality === 'ultra' ? 1.25 : curQuality === 'medium' ? (QL_DEMO.grass ? 140 / 240 : 0.4) : 1);
const flowerK = () => (curQuality === 'medium' && QL_DEMO.grass ? 0.7 : tierK());
export const fieldFloraStats: Record<string, { grass: number; flowers: number; reeds: number; trees: number; shrubs: number; kinds: Record<string, number>; draws: number }> = {};

// ---------------------------------------------------------------- 工具
export function ffRng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function vn(x: number, z: number) {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
export function ffFbm(x: number, z: number) { return vn(x, z) * 0.5 + vn(x * 2.1 + 5, z * 2.1) * 0.3 + vn(x * 4.3, z * 4.3 + 9) * 0.2; }
export const ffSmooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 共享风场 uniform
const V4 = () => new THREE.Vector4();
const FF_U = {
  /** xy = 风向（风吹向），z = 强度，w = 时间（秒） */
  uFfWind: { value: new THREE.Vector4(1, 0, 0.45, 0) },
  /** xy = 空气漂移量，z = 阵风振幅，w = 滚浪振幅 */
  uFfAir: { value: new THREE.Vector4(0, 0, 0.45, 0.15) },
  /** 角色 (x, z, 半径, 速度)；半径 0 = 空位 */
  uFfAgents: { value: [V4(), V4(), V4(), V4()] },
  /** 玩家足迹 (x, z, 距今秒, 强度) */
  uFfTrail: { value: [V4(), V4(), V4(), V4(), V4(), V4()] },
  /** 主镜头位置 xyz，w = 近处叶颤开关（深度通道里 cameraPosition 是阴影相机，所以单独传） */
  uFfCam: { value: new THREE.Vector4() },
  /** x = 振幅倍率，y = 推开开关，z = 回弹开关，w = 草的淡出半径（米） */
  uFfMisc: { value: new THREE.Vector4(1, 1, 1, 70) },
  /** 11-17 分层：x = 中层起点（米），y = 中层终点，z = 远层保留比例（面积守恒稀疏），w 保留 */
  uFfLayer: { value: new THREE.Vector4(16, 46, 1, 0) },
  uFfLayerS: { value: new THREE.Vector4(1e4, 2e4, 1, 0) },   // 11-17g 灌丛整丛稀疏：近 / 远 / 远处保留比例
  uFfLayerT: { value: new THREE.Vector4(1e4, 2e4, 1, 0) },   // 11-17g 树叶卡逐张稀疏：近 / 远 / 远处保留比例
};
const GLSL_COMMON = /* glsl */ `${QL_DEMO.wind ? '#define FF_QLWIND\n' : ''}
uniform vec4 uFfWind; uniform vec4 uFfAir; uniform vec4 uFfAgents[4]; uniform vec4 uFfTrail[6]; uniform vec4 uFfCam; uniform vec4 uFfMisc; uniform vec4 uFfLayer; uniform vec4 uFfLayerS; uniform vec4 uFfLayerT;
float ffH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ffVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ffH(i), ffH(i + vec2(1.0, 0.0)), f.x), mix(ffH(i + vec2(0.0, 1.0)), ffH(i + 1.0), f.x), f.y); }
float ffGust(vec2 p){
#ifdef FF_QLWIND
  // 11-17g 专长包 v8 gustAt（Demo 原式）：阵风图样顺风 3.2 m/s 推进（uFfAir.xy = 风向 × 3.2 × t），大阵风约 33 m、小阵风约 9 m，叠加草浪；
  //   Demo 返回 0–1（直接当弯曲量用），本游戏各件按「倍率、均值约 1」写的，所以映射成 0.3 + 1.6 g（g 均值约 0.4 → 倍率约 0.95）
  vec2 q = p - uFfAir.xy; vec2 wd = uFfWind.xy;
  float g = ffVn(q * 0.03) * 0.6 + ffVn(q * 0.11 + 7.0) * 0.4;
  float roll = sin(dot(p, wd) * 0.45 - uFfWind.w * 2.2 + ffVn(p * 0.06) * 5.0) * 0.5 + 0.5;
  return 0.3 + 1.6 * clamp(g * 0.8 + roll * g * 0.45 - 0.15, 0.0, 1.0);
#else
  vec2 q = p - uFfAir.xy;
  float big = 0.6 * sin(dot(q, vec2(0.80, 0.60)) * 0.1496) + 0.4 * sin(dot(q, vec2(-0.47, 0.88)) * 0.1210 + 1.7);
  float roll = sin(dot(q, vec2(0.71, 0.70)) * 0.5712 + 0.8 * sin(dot(q, vec2(-0.47, 0.88)) * 0.09));
  return clamp(1.0 + uFfAir.z * big + uFfAir.w * roll, 0.15, 1.9);
#endif
}
vec2 ffPush(vec2 root){
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uFfAgents[i]; if (a.z <= 0.0) continue;
    vec2 d = root - a.xy; float L = length(d), R = clamp(a.z * 2.5, 1.5, 3.0);
    acc += d / max(L, 0.05) * (1.0 - smoothstep(R * 0.35, R, L)) * (0.55 + 0.45 * clamp(a.w / 4.0, 0.0, 1.0));
  }
  return acc * uFfMisc.y;
}
vec2 ffWobble(vec2 root, float om, float k){
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 s = uFfTrail[i]; if (s.w <= 0.0) continue;
    vec2 d = root - s.xy; float L = length(d);
    float w = (1.0 - smoothstep(0.6, 2.6, L)) * (1.0 - smoothstep(0.6, 0.9, s.z));
    acc -= d / max(L, 0.05) * w * s.w * exp(-k * s.z) * sin(om * s.z);
  }
  return acc * uFfMisc.z;
}
`;
/** 共享风场给落叶 / 旗帜（field_leaves.ts / field_flags.ts）：同一组 uniform + 阵风函数；lastTick = 节拍器上次运行（秒） */
export const FF_SHARED = { U: FF_U, glsl: GLSL_COMMON, lastTick: -1 };
interface PlantOpt { amp: number; h0: number; push: number; tree: boolean; merged: boolean; fade: boolean; leaf?: boolean; layer?: boolean; layerS?: boolean; layerT?: boolean; /** 11-19 qllush：本层自己的淡出半径（米，常量；不填 = 全局 uFfMisc.w） */ fr?: number }
const TW_FF = { wind: 'uFfWind', cam: 'uFfCam', hash: 'ffH', gust: 'ffGust' };
const plantMain = (o: PlantOpt) => /* glsl */ `
{
  mat4 dM = modelMatrix;
  #ifdef USE_INSTANCING
    dM = modelMatrix * instanceMatrix;
  #endif
  vec3 dO = (dM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  ${o.fade ? `transformed.y *= 1.0 - smoothstep(${o.fr ? (o.fr * 0.62).toFixed(1) : 'uFfMisc.w * 0.62'}, ${o.fr ? o.fr.toFixed(1) : 'uFfMisc.w'}, length(dO.xz - uFfCam.xz));   // 远处草叶矮下去，不在分块边缘跳变` : ''}
  ${o.layer ? `{ // 11-17 分层（专长包第 26 步面积守恒稀疏）：近层全密度；中层按实例哈希逐丛缩没（不跳），留下的丛横向放大 1/sqrt(保留比例)
    float lyD = length(dO.xz - uFfCam.xz), lyK = mix(1.0, uFfLayer.z, smoothstep(uFfLayer.x, uFfLayer.y, lyD));
    float lyV = 1.0 - smoothstep(lyK - 0.07, lyK, ffH(dO.xz + 17.31));
    transformed *= lyV; transformed.xz *= inversesqrt(max(lyK, 0.25)); }` : ''}
  ${o.layerS ? `{ // 11-17g 灌丛：中远处按整丛哈希逐丛缩没，留下的横向放大（面积守恒，最多 1.4 倍）
    float lyD = length(dO.xz - uFfCam.xz), lyK = mix(1.0, uFfLayerS.z, smoothstep(uFfLayerS.x, uFfLayerS.y, lyD));
    float lyV = 1.0 - smoothstep(lyK - 0.08, lyK, ffH(dO.xz + 41.7));
    transformed *= lyV; transformed.xz *= min(inversesqrt(max(lyK, 0.25)), 1.4); }` : ''}
  ${o.layerT ? `{ // 11-17g 树叶卡：中远处逐张缩没（每张卡自带中心 + 哈希 aCard），留下的卡绕自身中心放大，树冠总面积不变（最多 1.5 倍）
    float lyD = length(dO.xz - uFfCam.xz), lyK = mix(1.0, uFfLayerT.z, smoothstep(uFfLayerT.x, uFfLayerT.y, lyD));
    float lyV = 1.0 - smoothstep(lyK - 0.06, lyK, aCard.w);
    transformed = aCard.xyz + (transformed - aCard.xyz) * lyV * min(inversesqrt(max(lyK, 0.25)), 1.5); }` : ''}
  vec3 dW = (dM * vec4(transformed, 1.0)).xyz;
  float dSc = max(length(dM[1].xyz), 0.05);
  float hw = max(dW.y - dO.y, 0.0);
  ${o.merged ? 'vec2 dR = dW.xz; float dPh = dot(dW.xz, vec2(0.37, 0.21)) + 6.2832 * ffH(dO.xz); float dHs = ffH(dO.xz + 3.1);' : 'vec2 dR = dO.xz; float dHs = ffH(dO.xz); float dPh = 6.2832 * ffH(dO.xz + 7.13) + dot(position.xz, vec2(4.1, 3.3));'}
  float t = uFfWind.w, s = uFfWind.z * uFfMisc.x, g = ffGust(dR);
  float dRef = clamp(dSc * ${o.h0.toFixed(4)}, 0.2, 16.0);
  float om = 6.2832 * max(mix(0.15, 0.45, dHs) / sqrt(dRef), 0.06);
  vec2 dDir = uFfWind.xy, dPerp = vec2(-dDir.y, dDir.x);
  float lean = 0.55 * s * s * g;
  float o1 = (0.25 + 0.75 * g) * s * 0.45 * sin(om * t + dPh);
  float o2 = (0.25 + 0.75 * g) * s * 0.30 * sin(1.31 * om * t + dPh * 1.7);
  vec2 off = vec2(0.0);
  ${o.tree
    ? treeWindGlsl(TW_FF, { amp: o.amp, merged: false, leaf: !!o.leaf }).off
    : `float bw = (hw / (hw + ${o.h0.toFixed(4)})) * (hw / (hw + ${o.h0.toFixed(4)})) * hw;
  off = (dDir * (lean + o1) + dPerp * o2) * ${o.amp.toFixed(4)} * bw;
  float hp = hw * hw / (1.0 + hw * hw * 0.5);
  float oms = 6.2832 * clamp(1.4 / sqrt(dRef), 0.6, 3.0);
  off += (ffPush(dR) + 0.8 * ffWobble(dR, oms, 3.5)) * ${o.push.toFixed(4)} * hp;`}
  float offL = length(off), offM = 0.85 * hw;
  if (offL > offM) off *= offM / max(offL, 1e-5);
  vec3 wd = vec3(off.x, -(hw - sqrt(max(hw * hw - dot(off, off), 0.0))), off.y);
  ${o.tree ? treeWindGlsl(TW_FF, { amp: o.amp, merged: false, leaf: !!o.leaf }).flutter : ''}
  transformed += inverse(mat3(dM)) * wd;
}`;
const PATCHED = new WeakMap<THREE.Material, PlantOpt>();
function ffPlant(m: THREE.Material, o: Partial<PlantOpt>): THREE.Material {
  if (PATCHED.has(m)) return m;
  const f: PlantOpt = { amp: 1, h0: 0.5, push: 0.6, tree: false, merged: false, fade: false, ...o };
  PATCHED.set(m, f);
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, FF_U);
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + (f.layerT ? 'attribute vec4 aCard;\n' : '') + GLSL_COMMON, 'ff.common');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\n' + plantMain(f), 'ff.begin_vertex');
  };
  const key = '|ff' + JSON.stringify(f);
  m.customProgramCacheKey = () => prevKey() + key;
  m.needsUpdate = true;
  return m;
}
/** 同一风摆补丁的阴影深度材质 */
function ffDepth(m: THREE.Material): THREE.MeshDepthMaterial {
  const src = m as THREE.MeshStandardMaterial, o = PATCHED.get(m)!;
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: src.side });
  if (src.alphaTest > 0 && src.map) { d.map = src.map; d.alphaTest = src.alphaTest; }
  return ffPlant(d, o) as THREE.MeshDepthMaterial;
}

// ---------------------------------------------------------------- 逆光透光 + 根部压暗 + 梢部变色（太阳 = 场景第一盏方向光）
//   11-17 注意：r170 不再定义 USE_UV，原来 `#ifdef USE_UV vFfH = uv.y` 恒走 else（vFfH ≡ 1）→ 根暗 / 梢色 / 透光高度权重都没生效。
//   veglayer 开时 hg（草 / 花）直接读 uv.y（uv 属性 r170 无条件声明）；树叶的 uv 是图集坐标，不当高度用。
type VegShade = { hg?: boolean; ao?: 'clump' | 'crown'; edge?: number; /** 11-19 qllush Demo 花：uv 是图集坐标，离根高度取 position.y（Demo vT = clamp(position.y, 0, 1)） */ hp?: boolean };
type ShadeOpt = { trans: number; rootDark: number; tip?: THREE.Color; key: string; v3?: { trans: number; gn?: number; warm?: number } } & VegShade;
/** 11-17 顶点段：vFfH（离根高度）+ vFfU（叶宽方向，叶缘 = 0 / 1）+ vFfAo（草丛中心 / 树冠下半压暗） */
function vegVert(o: VegShade, on: boolean): string {
  const h = o.hp ? 'vFfH = clamp(position.y, 0.0, 1.0);' : on && o.hg ? 'vFfH = uv.y;' : '#ifdef USE_UV\nvFfH = uv.y;\n#else\nvFfH = 1.0;\n#endif';
  if (!on) return h + '\nvFfU = 0.5; vFfAo = 1.0;';
  const ao = o.ao === 'clump' ? 'vFfAo = 1.0 - 0.32 * ( 1.0 - smoothstep( 0.03, 0.2, length( position.xz ) ) ) * ( 1.0 - smoothstep( 0.0, 0.6, uv.y ) );'   // 丛心根部（专长包第 24 步 AO 思路）
    : o.ao === 'crown' ? 'vFfAo = mix( 0.6, 1.0, smoothstep( -0.75, 0.55, normal.y ) );'   // 树冠朝下 / 朝内的卡更暗（天光被冠顶挡住）
      : 'vFfAo = 1.0;';
  return h + '\nvFfU = uv.x;\n' + ao;
}
function floraShade(m: THREE.MeshStandardMaterial, o: ShadeOpt) {
  if (o.v3 && flora3On()) return floraShadeV3(m, o as ShadeOpt & { v3: { trans: number; gn?: number; warm?: number } });
  const tip = o.tip ?? new THREE.Color(1, 1, 1), prev = m.onBeforeCompile, vl = vegLayerOn();
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, { uFfTrans: { value: o.trans }, uFfRootDark: { value: o.rootDark }, uFfTip: { value: tip } });
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nvarying float vFfH; varying float vFfU; varying float vFfAo;', 'ffshade.vcommon');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <fog_vertex>', '#include <fog_vertex>\n' + vegVert(o, vl), 'ffshade.fog_vertex');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nvarying float vFfH; varying float vFfU; varying float vFfAo; uniform float uFfTrans; uniform float uFfRootDark; uniform vec3 uFfTip;', 'ffshade.fcommon');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), uFfTip, smoothstep(0.55, 1.0, vFfH));\ndiffuseColor.rgb *= mix(1.0 - uFfRootDark, 1.0, smoothstep(0.0, 0.6, vFfH)) * vFfAo;', 'ffshade.color');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      { vec3 Vv = normalize(vViewPosition); float back = pow(clamp(dot(-Vv, directionalLights[0].direction), 0.0, 1.0), 3.0);
        float wrap = 0.35 + 0.65 * back;
        reflectedLight.indirectDiffuse += min(diffuseColor.rgb * vec3(1.08, 1.02, 0.78) * directionalLights[0].color * 0.47 * uFfTrans * wrap * back * (0.4 + 0.6 * vFfH), vec3(0.6)); }
      #endif`, 'ffshade.lights');
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + '|ffshade' + o.key + (o.hp ? 'hp' : '') + (vl ? `|vl${o.hg ? 1 : 0}${o.ao ?? ''}` : '');
  return m;
}

// ---------------------------------------------------------------- 11-16 草木 v3：透光 / 法线 / 颜色（秋林逆光 v3 的 patchMat trans / gn / tip）
//   · 透光在太阳（第一盏方向光）的光照循环里、乘过阴影之后加：背光面 max(-N·L,0)×1.25 + 前向散射 pow(V·L,4)×3.4，
//     颜色 = 漫反射色 × (1.15, 1, 0.55) 偏暖；树荫里的草 / 叶不再自己发亮（专长包第 30 步，替掉原来不吃阴影的视角项）
//   · 草：法线往上混 gn（贴着坡面受光，一片草地明暗连成片），背面不翻法线；梢部偏暖黄、根部压暗、25–95 米压向暗橄榄色（远草不发灰）
//   · 11-17 叶缘逆光（veglayer）：逆着太阳看时叶缘 / 草叶两侧 / 侧对镜头的薄边额外透亮，同样乘过阴影（树荫里不亮）。
//     叶缘 = 有 alphaTest 的叶卡取 alpha 刚过阈值的一圈；草叶取 uv.x 两侧；再加侧对镜头的轮廓项
function lightsWithTransmit(edge: boolean): string {
  const src = THREE.ShaderChunk.lights_fragment_begin, a = src.indexOf('directionalLight = directionalLights[ i ];');
  const needle = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const b = a < 0 ? -1 : src.indexOf(needle, a);
  if (b < 0) { console.warn('patch miss ff3.lights'); return src; }
  const add = `
		if ( UNROLLED_LOOP_INDEX == 0 ) {
			float ff3Bk = max( - dot( geometryNormal, directLight.direction ), 0.0 );
			float ff3Fw = pow( max( dot( - geometryViewDir, directLight.direction ), 0.0 ), 4.0 );
			vec3 ff3Tc = material.diffuseColor * vec3( 1.15, 1.0, 0.55 ) + vec3( 0.02, 0.014, 0.0 ) * uFf3Trans;
			reflectedLight.directDiffuse += min( directLight.color * ff3Tc * RECIPROCAL_PI * uFf3Trans * ( ff3Bk * 1.25 + ff3Fw * 3.4 ) * ( 0.35 + 0.65 * vFfH ), vec3( 0.7 ) );${edge ? `
			#ifdef USE_ALPHATEST
			float ffEg = 1.0 - smoothstep( alphaTest, min( alphaTest + 0.3, 1.0 ), diffuseColor.a );
			#else
			float ffEg = pow( abs( vFfU * 2.0 - 1.0 ), 2.0 );
			#endif
			ffEg = max( ffEg, 0.5 * pow( 1.0 - abs( dot( geometryNormal, geometryViewDir ) ), 3.0 ) );
			float ffEb = pow( max( dot( - geometryViewDir, directLight.direction ), 0.0 ), 3.0 );
			reflectedLight.directDiffuse += min( directLight.color * ( material.diffuseColor * vec3( 1.25, 1.08, 0.62 ) + vec3( 0.03, 0.02, 0.0 ) ) * uFfEdge * ffEg * ffEb * ( 0.4 + 0.6 * vFfH ), vec3( 0.6 ) );` : ''}
		}`;
  return src.slice(0, b + needle.length) + add + src.slice(b + needle.length);
}
function floraShadeV3(m: THREE.MeshStandardMaterial, o: ShadeOpt & { v3: { trans: number; gn?: number; warm?: number } }) {
  const tip = o.tip ?? new THREE.Color(1, 1, 1), prev = m.onBeforeCompile, gn = o.v3.gn ?? 0, warm = o.v3.warm ?? 0, vl = vegLayerOn(), edge = vl && (o.edge ?? 0) > 0;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, { uFf3Trans: { value: o.v3.trans }, uFfRootDark: { value: o.rootDark }, uFfTip: { value: tip }, uFfEdge: { value: o.edge ?? 0 } });
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nvarying float vFfH; varying float vFfU; varying float vFfAo;\nvarying vec3 vFf3W;', 'ff3.vcommon');
    if (gn > 0) sh.vertexShader = cinePatch(sh.vertexShader, '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      #ifdef USE_INSTANCING
      { mat3 ff3M = mat3( instanceMatrix ); vec3 ff3N = normalize( ff3M * objectNormal ); objectNormal = transpose( ff3M ) * normalize( mix( ff3N, vec3( 0.0, 1.0, 0.0 ), ${gn.toFixed(2)} ) ); }
      #endif`, 'ff3.gn');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <fog_vertex>', '#include <fog_vertex>\n' + vegVert(o, vl) + '\nvFf3W = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz + cameraPosition;', 'ff3.fog_vertex');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nvarying float vFfH; varying float vFfU; varying float vFfAo; varying vec3 vFf3W; uniform float uFf3Trans; uniform float uFfRootDark; uniform vec3 uFfTip; uniform float uFfEdge;', 'ff3.fcommon');
    if (gn > 0) sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''), 'ff3.noflip');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix( vec3( 1.0 ), uFfTip, smoothstep( 0.55, 1.0, vFfH ) );
      ${warm > 0 ? `diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.3, 1.1, 0.5 ) + vec3( 0.02, 0.012, 0.0 ), smoothstep( 0.6, 1.0, vFfH ) * ${warm.toFixed(2)} );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.10, 0.10, 0.03 ), smoothstep( 25.0, 95.0, distance( vFf3W, cameraPosition ) ) * 0.3 );` : ''}
      diffuseColor.rgb *= mix( 1.0 - uFfRootDark, 1.0, smoothstep( 0.0, 0.55, vFfH ) ) * vFfAo;`, 'ff3.color');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_begin>', lightsWithTransmit(edge), 'ff3.lights');
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + '|ff3' + o.key + gn + warm + (o.hp ? 'hp' : '') + (vl ? `|vl${o.hg ? 1 : 0}${o.ao ?? ''}${edge ? 'e' : ''}` : '');
  return m;
}
/** 11-17 树皮根部 AO（veglayer）：物体空间高度渐变（树原点下沉 0.12，根部 / 地面接触处压暗），不加后期 pass */
function barkAo(m: THREE.MeshStandardMaterial, k: number): THREE.MeshStandardMaterial {
  if (!vegLayerOn()) return m;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nvarying float vFfBy;', 'ffbark.vcommon');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <fog_vertex>', '#include <fog_vertex>\nvFfBy = position.y;', 'ffbark.fog_vertex');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nvarying float vFfBy;', 'ffbark.fcommon');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix( 0.42, 1.0, smoothstep( 0.0, ${k.toFixed(2)}, vFfBy ) );`, 'ffbark.color');
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + '|ffbark' + k;
  return m;
}

// ---------------------------------------------------------------- 分块实例化
type Inst = { m: THREE.Matrix4; c: THREE.Color };
const TMP = { m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() };
interface Tile { obj: THREE.Object3D; x: number; z: number; r: number; lo?: THREE.Object3D; half?: number; far?: boolean }
/** 11-17 分层：草分块离镜头（分块最近点）超过这个距离换低段数几何；±2 米回差防抖 */
/** 11-17 假阴影圆片淡出半径（米）：中 / 高 / 超高 */
const CS_FADE = () => (curQuality === 'medium' ? 18 : curQuality === 'ultra' ? 32 : 26);
const LOD_D = () => (curQuality === 'medium' ? 16 : curQuality === 'ultra' ? 24 : 20);
function tileKey(x: number, z: number, size: number) { return Math.floor(x / size) + ',' + Math.floor(z / size); }
function emitTiles(root: THREE.Group, tiles: Tile[], name: string, geo: THREE.BufferGeometry, mat: THREE.Material, buckets: Map<string, Inst[]>, size: number, R: number,
  o: { cast?: boolean; depth?: THREE.Material | null; lo?: THREE.BufferGeometry; cs?: { rLocal: number; hLocal: number; k: number } }): number {
  let n = 0;
  for (const [k, list] of buckets) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length); im.name = name;
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere(); if (im.boundingSphere) im.boundingSphere.radius += 2;   // 风摆余量
    im.castShadow = !!o.cast; im.receiveShadow = true; im.frustumCulled = true;
    if (o.depth) im.customDepthMaterial = o.depth;
    im.userData.dynDone = true; im.userData.noBake = true;
    const shore = k.endsWith('|s'), [cx, cz] = k.replace('|s', '').split(',').map(Number);
    if (shore) im.userData.refl = true;   // 11-17 岸边草花：河面倒影放行（river_refl isGrassLike 认 userData.refl）
    const tile: Tile = { obj: im, x: (cx + 0.5) * size, z: (cz + 0.5) * size, r: R + size * 0.71 };
    if (o.lo) {   // 11-17 低段数版本：共用实例矩阵 / 实例色缓冲（不多占显存），由 tick 二选一显示
      const lo = new THREE.InstancedMesh(o.lo, mat, list.length); lo.name = name + '_lo';
      lo.instanceMatrix = im.instanceMatrix; lo.instanceColor = im.instanceColor;
      lo.boundingSphere = im.boundingSphere ? im.boundingSphere.clone() : null;
      lo.castShadow = im.castShadow; lo.receiveShadow = true; lo.frustumCulled = true; lo.visible = false;
      lo.userData.dynDone = true; lo.userData.noBake = true;
      if (shore) lo.userData.refl = true;
      tile.lo = lo; tile.half = size / 2; root.add(lo);
    }
    tiles.push(tile);
    if (o.cs) {   // 11-17 假阴影圆片：共用实例矩阵，只在近处画（分块按淡出半径整块隐藏）
      const fr = CS_FADE();
      const d = vegContactShadow(im, { ...o.cs, cam: FF_U.uFfCam, fadeR: fr });
      tiles.push({ obj: d, x: tile.x, z: tile.z, r: fr + size * 0.71 }); root.add(d);
    }
    root.add(im); n += list.length;
  }
  return n;
}

// ---------------------------------------------------------------- 草叶
/** 一根草叶：高 1，segs 段，根宽 w，前弯 bend，扭转 twist；uv.y = 高度比例；法线横向外倾（第 49 步：半圆柱法线 ±38°） */
function bladeGeo(segs: number, w: number, bend: number, twist: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, hw = i === segs ? 0 : w * 0.5 * Math.pow(1 - t, 0.75) + 0.0015;
    const z = bend * t * t, y = t * (1 - 0.18 * bend * t), a = twist * t, ca = Math.cos(a), sa = Math.sin(a);
    const tz = 2 * bend * t, tl = Math.hypot(tz, 1), fnY = -tz / tl, fnZ = 1 / tl;
    for (const s of [-1, 1]) {
      const x = s * hw; pos.push(x * ca, y, z + x * sa);
      const nx = s * 0.62, n = Math.hypot(nx, fnY, fnZ); nor.push((nx * ca) / n, fnY / n, (fnZ + nx * sa) / n);
      uv.push(s < 0 ? 0 : 1, t);
    }
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
export interface GrassLayer {
  /** 草簇数（每簇 7–16 根） */
  count: number; seed: number; hMin: number; hMax: number;
  /** 0 = 鲜绿，1 = 枯黄 */
  dry: number;
  /** 色相偏移（秋色图 −0.03 偏金） */
  hue?: number;
  /** 铺满（短草：不按斑块取舍） */
  cover?: boolean;
  /** 芦苇等高草：叶形更窄、少弯 */
  reed?: boolean;
  /** 只在这个权重里长（世界坐标，0..1）；默认用 opt.grassW */
  w?: (x: number, z: number) => number;
  /** 11-19 qllush 近层繁茂草（Demo grassNear：不按斑块取舍、丛生 0.22 米、高矮跟 Demo tall 场 0.45–1.2 走），fr = 本层淡出半径（米） */
  lush?: boolean; fr?: number;
}
const GRASS_TILE = 40;
/** 一簇草（成簇实例化：一个实例 = 7–14 根各自朝向 / 高矮 / 明暗不同的草叶，第 85 步 clustered instanced blades） */
function tuftGeo(seed: number, blades: number, radius: number, reed: boolean, cover: boolean, lo = false): THREE.BufferGeometry {
  const R = ffRng(seed), parts: THREE.BufferGeometry[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < blades; i++) {
    const thin = R() < 0.4;
    const g = reed ? bladeGeo(lo ? 3 : 5, thin ? 0.02 : 0.03, 0.12 + R() * 0.2, 0.3) : bladeGeo(lo ? 2 : cover ? 3 : 5, thin ? 0.028 : 0.05, (thin ? 0.45 : 0.28) + R() * 0.25, thin ? 1.0 : 0.5);
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * radius;
    const h = (cover ? 0.5 : 0.55) + R() * (cover ? 0.7 : 0.65);
    e.set((R() - 0.5) * 0.3, a + (R() - 0.5) * 1.2, (R() - 0.5) * 0.3); q.setFromEuler(e);
    m.compose(p.set(Math.cos(a) * rr, -0.02, Math.sin(a) * rr), q, sc.set(0.8 + R() * 0.6, h, h * (0.7 + R() * 0.5)));
    g.applyMatrix4(m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color().setHSL(0.02 * (R() - 0.5), 0, 0);
    const l = 0.78 + R() * 0.4, gs = 1 + (R() - 0.5) * 0.18, dryB = R() < 0.12 ? [1.25, 1.05, 0.7] : [1, 1, 1];
    void c; for (let k = 0; k < n; k++) col.set([l * dryB[0], l * gs * dryB[1], l * dryB[2]], k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}
function grassLayer(root: THREE.Group, tiles: Tile[], L: GrassLayer, area: [number, number, number, number], ground: (x: number, z: number) => number, W: (x: number, z: number) => number, fadeR: number, water?: (x: number, z: number) => number): number {
  const vs = vegShadowOn(), shoreAt = (x: number, z: number) => (vs && water && water(x, z) < 3.5 ? '|s' : '');
  const R = ffRng(L.seed), [x0, z0, x1, z1] = area;
  const nb = L.reed ? 7 : L.lush ? 12 : L.cover ? 12 : 9, rad = L.reed ? 0.22 : L.lush ? 0.22 : L.cover ? 0.34 : 0.2;
  const shapes = [0, 1, 2].map(v => tuftGeo(L.seed * 7 + v, nb + v * 2, rad, !!L.reed, !!L.cover));
  const mat = floraShade(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.66, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.65 }),
    { trans: 0.55, rootDark: 0.6, tip: new THREE.Color(1.1, 1.05, 0.78), key: 'grass', v3: { trans: L.reed ? 0.18 : 0.22, gn: L.reed ? 0.3 : 0.45, warm: L.reed ? 0.15 : 0.22 }, hg: true, ao: 'clump', edge: L.reed ? 0.5 : 0.6 });
  const vl = vegLayerOn();
  ffPlant(mat, { amp: L.reed ? 0.7 : 1, h0: L.reed ? 1.2 : 0.55, push: L.reed ? 0.5 : 0.75, fade: true, layer: vl && !L.lush, fr: L.fr });
  // 11-17 分层 LOD：同一随机序列、同样的叶位，只把每根草叶的段数减到 2–3（秋林远草 2 段）；分块离镜头 > LOD_D 米时换用
  const shapesLo = vl ? [0, 1, 2].map(v => tuftGeo(L.seed * 7 + v, nb + v * 2, rad, !!L.reed, !!L.cover, true)) : null;
  const buckets = shapes.map(() => new Map<string, Inst[]>());
  let i = 0, guard = 0, blades = 0;
  while (i < L.count && guard++ < L.count * 8) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    const w = (L.w ?? W)(x, z); if (w <= 0 || R() > w) continue;   // 避让区边缘渐稀
    const dens = ffFbm(x * 0.16, z * 0.16); if (!L.cover && !L.lush && dens < 0.14 + R() * 0.22) continue;   // 成片（fbm 斑块）
    const hue = 0.2 + (L.hue ?? 0) + R() * 0.04 - L.dry * 0.08 * ffFbm(x * 0.05 + 3, z * 0.05);
    const dryK = Math.min(1, L.dry * (0.45 + ffFbm(x * 0.09 + 11, z * 0.09)));
    const h = L.lush ? (L.hMin + (L.hMax - L.hMin) * R()) * (0.45 + 0.75 * ffFbm(x * 0.08 + 7, z * 0.08 + 3)) * (0.6 + 0.4 * w)   // Demo：rr(hR) × tall(0.45 + 0.75 fbm)，路边渐矮
      : (L.hMin + (L.hMax - L.hMin) * (L.cover ? R() : Math.pow(Math.min(1, dens * 1.2), 1.2)) * (0.55 + 0.45 * w)) * (0.8 + R() * 0.4);
    const v = Math.floor(R() * shapes.length), key = tileKey(x, z, GRASS_TILE) + shoreAt(x, z); let list = buckets[v].get(key); if (!list) buckets[v].set(key, list = []);
    TMP.p.set(x, ground(x, z), z); TMP.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28); const sw = 0.85 + R() * 0.35; TMP.s.set(sw, h, sw);
    const c = gpalOn() && !L.reed ? gpal(Math.min(0.999, Math.max(0, dens * 1.25 - 0.15 + (ffFbm(x * 0.4 + 7, z * 0.4) - 0.5) * 0.35 + (R() - 0.5) * 0.35)) * (0.42 + 0.58 * Math.min(1, L.dry + dryK * 0.5)), 0.75 + R() * 0.45)
      : new THREE.Color().setHSL(hue + 0.02, 0.38 + R() * 0.14 - dryK * 0.14, 0.17 + R() * 0.06 + dryK * 0.08);
    list.push({ m: new THREE.Matrix4().compose(TMP.p, TMP.q, TMP.s), c }); i++; blades += nb + v * 2;
  }
  shapes.forEach((g, v) => emitTiles(root, tiles, L.reed ? 'ff_reed' : L.lush ? 'ff_grass_lush' : 'ff_grass', g, mat, buckets[v], GRASS_TILE, L.fr ?? fadeR, { lo: shapesLo ? shapesLo[v] : undefined, cs: vs && !L.cover && !L.lush ? { rLocal: (L.reed ? 0.22 : 0.2) + 0.12, hLocal: 0.9, k: L.reed ? 0.3 : 0.32 } : undefined }));
  return blades;
}

// ---------------------------------------------------------------- 野花（第 85 步：花瓣形状的小几何，噪声成团）
export type FlowerKind = 'daisy' | 'poppy' | 'lupine' | 'buttercup' | 'aster';
function petalRing(n: number, len: number, wid: number, cup: number, col: THREE.Color, seg = 7): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const pg = new THREE.CircleGeometry(len * 0.5, seg); pg.scale(wid / len, 1, 1); pg.translate(0, len * 0.5, 0);
    pg.rotateX(-Math.PI / 2 + cup); pg.rotateY(k / n * Math.PI * 2);
    out.push(colorize(pg, col));
  }
  return out;
}
function colorize(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const gg = g.index ? g.toNonIndexed() : g; gg.deleteAttribute('uv');
  const n = gg.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
  const uv = new Float32Array(n * 2).fill(1); gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));   // uv.y = 1：花头算在梢部（透光足）
  return gg;
}
function stemGeo(h: number, bend: number, col: THREE.Color, segs = 4) {
  const s = bladeGeo(segs, 0.012, bend, 0).toNonIndexed(); s.scale(1, h, 1);
  const n = s.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  s.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return s;
}
const C = (h: number) => new THREE.Color(h);
/** 一朵花的几何（高 1 左右，颜色在顶点色里；实例色只做明暗微调） */
/** 11-17g lo = 远处低模（?off=veglayer 不用）：茎 2 段、花瓣数约减半、花瓣 4 段、花心 4×2、鲁冰花 7 朵 × 2 瓣；尺寸 / 颜色 / 高度不变 */
function flowerGeo(kind: FlowerKind, petal: THREE.Color, lo = false): THREE.BufferGeometry {
  const stemC = C(0x4a6a2a), parts: THREE.BufferGeometry[] = [stemGeo(1, 0.1, stemC, lo ? 2 : 4)], ps = lo ? 4 : 7, cs: [number, number] = lo ? [4, 2] : [6, 4];
  const top = (g: THREE.BufferGeometry) => { g.translate(0, 0.98, 0.1); return g; };
  if (kind === 'daisy' || kind === 'aster') {
    for (const g of petalRing(kind === 'daisy' ? (lo ? 6 : 11) : (lo ? 8 : 16), 0.05, lo ? 0.022 : 0.014, 0.12, petal, ps)) parts.push(top(g));
    const core = new THREE.SphereGeometry(0.014, cs[0], cs[1]); core.scale(1, 0.5, 1); parts.push(top(colorize(core, C(kind === 'daisy' ? 0xf0c020 : 0xe8b030))));
  } else if (kind === 'poppy' || kind === 'buttercup') {
    for (const g of petalRing(5, kind === 'poppy' ? 0.055 : 0.03, kind === 'poppy' ? 0.05 : 0.026, kind === 'poppy' ? 0.75 : 0.45, petal, ps)) parts.push(top(g));
    const core = new THREE.SphereGeometry(kind === 'poppy' ? 0.012 : 0.008, cs[0], cs[1]); parts.push(top(colorize(core, C(kind === 'poppy' ? 0x1a1410 : 0xd8a020))));
  } else {   // lupine：约 14 朵四瓣小花沿穗往上收尖
    const nk = lo ? 7 : 14, nj = lo ? 2 : 4, rk = lo ? 1.4 : 1;
    for (let k = 0; k < nk; k++) {
      const f = k / (nk - 1), r = 0.035 * (1 - f * 0.7) * rk;
      for (let j = 0; j < nj; j++) {
        const pg = new THREE.CircleGeometry(r * 0.55, lo ? 4 : 5); pg.translate(0, r * 0.55, 0); pg.rotateX(-0.6); pg.rotateY(j * Math.PI * 2 / nj + k * 0.9);
        pg.translate(0, 0.62 + f * 0.42, 0.06 + f * 0.04);
        parts.push(colorize(pg, petal.clone().offsetHSL(0, 0, 0.12 * f)));
      }
    }
  }
  return mergeGeometries(parts.map(p => { for (const a of Object.keys(p.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) p.deleteAttribute(a); if (!p.attributes.normal) p.computeVertexNormals(); return p.index ? p.toNonIndexed() : p; }))!;
}
export interface FlowerSet { count: number; seed: number; kinds: [FlowerKind, number][]; w?: (x: number, z: number) => number }
function flowerLayer(root: THREE.Group, tiles: Tile[], F: FlowerSet, area: [number, number, number, number], ground: (x: number, z: number) => number, W: (x: number, z: number) => number, fadeR: number, water?: (x: number, z: number) => number): number {
  const vs = vegShadowOn();
  const R = ffRng(F.seed + 99), [x0, z0, x1, z1] = area;
  const mat = floraShade(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.65 }), { trans: 0.9, rootDark: 0.45, key: 'flower', v3: { trans: 0.45 }, hg: true, edge: 0.4 });
  ffPlant(mat, { amp: 0.9, h0: 0.45, push: 0.55, fade: true, layer: vegLayerOn() });
  const PALETTE: Record<FlowerKind, number[]> = { daisy: [0xf6f2ea], poppy: [0xd8321e, 0xe86a1e], lupine: [0x7a62c8, 0x5a7ad8, 0xc070b8], buttercup: [0xf2c81e], aster: [0xa088d8, 0xd8a0c8] };
  const variants: { kind: FlowerKind; geo: THREE.BufferGeometry; lo?: THREE.BufferGeometry; wt: number; b: Map<string, Inst[]> }[] = [];
  for (const [kind, wt] of F.kinds) for (const col of PALETTE[kind]) variants.push({ kind, geo: flowerGeo(kind, C(col)), lo: vegLayerOn() ? flowerGeo(kind, C(col), true) : undefined, wt: wt / PALETTE[kind].length, b: new Map() });
  const tw = variants.reduce((s, v) => s + v.wt, 0);
  let i = 0, guard = 0;
  while (i < F.count && guard++ < F.count * 30) {
    // 成团：先挑团心，再在 2 米内撒一小团同种花
    const cx = x0 + R() * (x1 - x0), cz = z0 + R() * (z1 - z0);
    if (ffFbm(cx * 0.09 + 7, cz * 0.09) < 0.55) continue;
    const w = (F.w ?? W)(cx, cz); if (w <= 0.2 || R() > w) continue;
    let pick = R() * tw, v = variants[0]; for (const vv of variants) { pick -= vv.wt; if (pick <= 0) { v = vv; break; } }
    const nn = 3 + Math.floor(R() * 8), key = tileKey(cx, cz, GRASS_TILE) + (vs && water && water(cx, cz) < 3.5 ? '|s' : ''); let list = v.b.get(key); if (!list) v.b.set(key, list = []);
    for (let k = 0; k < nn && i < F.count; k++) {
      const a = R() * 6.28, rr = Math.sqrt(R()) * 1.8, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if ((F.w ?? W)(x, z) <= 0.1) continue;
      TMP.p.set(x, ground(x, z) - 0.02, z); TMP.q.setFromEuler(TMP.e.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3));
      const h = (v.kind === 'lupine' ? 0.6 : v.kind === 'poppy' ? 0.45 : 0.36) * (0.75 + R() * 0.5); TMP.s.set(h * 1.7, h, h * 1.7);
      list.push({ m: new THREE.Matrix4().compose(TMP.p, TMP.q, TMP.s), c: new THREE.Color().setScalar(0.85 + R() * 0.25) }); i++;
    }
  }
  let n = 0; for (const v of variants) n += emitTiles(root, tiles, 'ff_flower_' + v.kind, v.geo, mat, v.b, GRASS_TILE, fadeR, { lo: v.lo, cs: vs ? { rLocal: 0.08, hLocal: 1.0, k: 0.28 } : undefined });
  return n;
}

// ---------------------------------------------------------------- 11-19 qllush：Demo 花（ql_lush.ts 几何 / 图集 / 分布场），整图按面积铺
/** 11-19 qllush 档位：高 / 超高 = Demo high；中 = Demo medium（草 140 / 240、花 flw 0.7）；低档整个 field_flora 不建（维持原样） */
const lushGrassK = () => (curQuality === 'medium' ? 140 / 240 : 1);
const lushFlowerK = () => (curQuality === 'medium' ? 0.7 : 1);
/** 淡出半径（米）：近层草 Demo grassNear 铺 30 米；花 Demo 铺 60 米 */
const LUSH_GRASS_R = () => (curQuality === 'medium' ? 26 : curQuality === 'ultra' ? 38 : 34);
const LUSH_FLOWER_R = () => (curQuality === 'medium' ? 46 : curQuality === 'ultra' ? 70 : 60);
export const lushStats: Record<string, { usable: number; grassTufts: number; grassBlades: number; flowers: Record<string, number>; flowerTris: number; drawsMax: number }> = {};
/** 可长面积（m²，按 2 米网格对权重积分） */
function usableArea(area: [number, number, number, number], W: (x: number, z: number) => number) {
  const [x0, z0, x1, z1] = area, G = 2; let a = 0;
  for (let x = x0 + 1; x < x1; x += G) for (let z = z0 + 1; z < z1; z += G) a += Math.max(0, Math.min(1, W(x, z)));
  return a * G * G;
}
function lushFlowerLayer(root: THREE.Group, tiles: Tile[], id: string, Lo: LushOpt, area: [number, number, number, number], usable: number, ground: (x: number, z: number) => number, W: (x: number, z: number) => number, water?: (x: number, z: number) => number): { n: Record<string, number>; tris: number } {
  const vs = vegShadowOn(), vl = vegLayerOn(), fr = LUSH_FLOWER_R(), [x0, z0, x1, z1] = area, out: Record<string, number> = {}; let tris = 0;
  const mat = floraShade(new THREE.MeshStandardMaterial({ color: 0xffffff, map: qlFlowerTex(), alphaTest: 0.5, vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, envMapIntensity: 0.65 }),
    { trans: 0.9, rootDark: 0.45, key: 'qlflower', v3: { trans: 0.65, gn: 0.35 }, hp: true, edge: 0.4 });   // Demo 花：trans 0.65 / gn 0.35 / alphaTest 0.5
  ffPlant(mat, { amp: 0.6, h0: 0.45, push: 0.55, fade: true, layer: vl, fr });   // Demo wind 'flower' = 草风 × 0.55
  Lo.flowers.forEach(([kind, pal, mult], ki) => {
    const R = ffRng(Lo.seed * 31 + ki * 977), N = Math.round(QL_FLOWER_DENS[kind] * mult * usable * lushFlowerK()), off = Lo.seed % 97 + ki * 13.7;
    const b = new Map<string, Inst[]>(), [h0, h1] = QL_FLOWER_H[kind]; let n = 0;
    for (let tries = 0; n < N && tries < N * 80; tries++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      let f = qlFlowerField(kind, x, z, off);
      if (kind === 'purple') { const w0 = W(x, z); f = Math.max(f, 0.55 * qlSstep(0.15, 0.4, w0) * (1 - qlSstep(0.8, 0.98, w0)) * qlSstep(0.45, 0.6, qlFbm2(x, z))); }   // Demo 路边紫花带：路 / 物件边缘一侧成带
      if (R() > f) continue;
      const w = W(x, z) * (Lo.w ? Lo.w(x, z) : 1); if (w <= 0.15 || R() > w) continue;
      const h = h0 + (h1 - h0) * R();
      TMP.p.set(x, ground(x, z) - 0.02, z); TMP.q.setFromEuler(TMP.e.set((R() - 0.5) * 0.3, R() * 6.283, (R() - 0.5) * 0.3)); TMP.s.set(h, h, h);
      const key = tileKey(x, z, GRASS_TILE) + (vs && water && water(x, z) < 3.5 ? '|s' : ''); let l = b.get(key); if (!l) b.set(key, l = []);
      l.push({ m: new THREE.Matrix4().compose(TMP.p, TMP.q, TMP.s), c: new THREE.Color().setScalar(0.75 + R() * 0.4) }); n++;
    }
    const geo = qlFlowerGeo(kind, pal, 8000 + ki * 17 + Lo.seed), lo = vl ? qlFlowerGeo(kind, pal, 8000 + ki * 17 + Lo.seed, true) : undefined;
    emitTiles(root, tiles, 'ff_qlflower_' + kind, geo, mat, b, GRASS_TILE, fr, { lo });
    out[kind + ':' + pal] = n; tris += n * (geo.index!.count / 3);
  });
  void id; return { n: out, tris };
}
const qlFbm2 = (x: number, z: number) => ffFbm(x * 0.045 + 13.1, z * 0.045 + 5.7);

// ---------------------------------------------------------------- 贴图：叶簇图集（2×2）、针叶刷、树皮、白桦皮
let _atlas: THREE.CanvasTexture | null = null;
/** 0 = 绿椭圆叶（夏阔叶），1 = 白桦金叶（小圆三角），2 = 红橙枫叶（五裂），3 = 锈色栎叶（波状缘）；颜色画在图里，顶点色只调明暗 */
function leafAtlas(): THREE.CanvasTexture {
  if (_atlas) return _atlas;
  const S = 1024, Q = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!, R = ffRng(42);
  const shapes: ((t: number) => number)[] = [
    t => 1,                                                                                         // 椭圆
    t => 0.85 + 0.15 * Math.cos(t * 2),                                                             // 圆三角
    t => 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(t * 2.5)), 0.6),                                 // 五裂（枫）
    t => 0.82 + 0.18 * Math.cos(t * 7),                                                             // 波状缘（栎）
  ];
  const cols: [number, number, number][][] = [
    [[64, 104, 40], [92, 136, 54], [74, 118, 44]],
    [[200, 160, 56], [224, 188, 80], [168, 132, 44]],
    [[178, 64, 30], [210, 112, 40], [150, 46, 28]],
    [[150, 82, 34], [176, 108, 44], [128, 70, 30]],
  ];
  const elong = [2.3, 1.5, 1.05, 1.9];
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * Q, oy = Math.floor(q / 2) * Q;
    g.save(); g.beginPath(); g.rect(ox, oy, Q, Q); g.clip();
    g.strokeStyle = '#4a3a22'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ox + Q * 0.5, oy + Q * 0.99); g.quadraticCurveTo(ox + Q * 0.47, oy + Q * 0.6, ox + Q * 0.52, oy + Q * 0.14); g.stroke();
    const leaf = (x: number, y: number, ang: number, L: number) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      const pal = cols[q][Math.floor(R() * 3)], l = 0.85 + R() * 0.3;
      const W = L / elong[q];
      const grd = g.createLinearGradient(-W, 0, W, 0);
      grd.addColorStop(0, `rgb(${pal[0] * l * 0.8 | 0},${pal[1] * l * 0.8 | 0},${pal[2] * l * 0.8 | 0})`); grd.addColorStop(0.5, `rgb(${Math.min(255, pal[0] * l * 1.1) | 0},${Math.min(255, pal[1] * l * 1.1) | 0},${pal[2] * l | 0})`); grd.addColorStop(1, `rgb(${pal[0] * l * 0.75 | 0},${pal[1] * l * 0.75 | 0},${pal[2] * l * 0.75 | 0})`);
      g.fillStyle = grd; g.beginPath();
      for (let k = 0; k <= 48; k++) {
        const t = k / 48 * Math.PI * 2, r = shapes[q](t);
        const px = Math.sin(t) * W * r, py = -L * 0.5 - Math.cos(t) * L * 0.5 * (q === 2 ? r : 1) ;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(230,220,160,0.35)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -L * 0.95); g.stroke();
      g.restore();
    };
    const N = q === 1 ? 11 : 9;
    for (let k = 0; k < N; k++) {
      const t = 0.15 + 0.8 * k / N, y = oy + Q * (0.98 - t * 0.86), x = ox + Q * (0.5 - 0.02 * Math.sin(t * 3)), side = k % 2 ? 1 : -1;
      leaf(x, y, side * (0.7 + R() * 0.5) - 0.05, Q * (q === 1 ? 0.16 : q === 2 ? 0.24 : 0.21) * (1 - t * 0.3));
    }
    leaf(ox + Q * 0.52, oy + Q * 0.16, (R() - 0.5) * 0.3, Q * (q === 2 ? 0.24 : 0.2));
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_atlas = t);
}
let _needle: THREE.CanvasTexture | null = null;
/** 针叶刷卡（灰绿中性色，树种颜色 / 积雪走顶点色） */
function needleTexture(): THREE.CanvasTexture {
  if (_needle) return _needle;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!, R = ffRng(77);
  g.lineCap = 'round';
  g.strokeStyle = '#5a4a38'; g.lineWidth = 4; g.beginPath(); g.moveTo(S * 0.5, S * 0.99); g.lineTo(S * 0.5, S * 0.08); g.stroke();
  const twig = (x0: number, y0: number, ang: number, len: number, nN: number) => {
    const ex = x0 + Math.sin(ang) * len, ey = y0 - Math.cos(ang) * len;
    g.strokeStyle = '#584838'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
    for (let k = 0; k < nN; k++) {
      const t = R(), px = x0 + (ex - x0) * t, py = y0 + (ey - y0) * t, side = R() < 0.5 ? -1 : 1, L = S * (0.07 + R() * 0.06) * (1 - t * 0.4), a = ang + side * (0.45 + R() * 0.5);
      const l = 0.62 + R() * 0.45, tip = R() < 0.25 ? 1.2 : 1; g.strokeStyle = `rgb(${190 * l * tip | 0},${206 * l * tip | 0},${190 * l | 0})`; g.lineWidth = 1.5 + R() * 1.6;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(a) * L, py - Math.cos(a) * L); g.stroke();
    }
  };
  twig(S * 0.5, S * 0.99, 0, S * 0.9, 260);
  for (let k = 0; k < 8; k++) { const t = 0.15 + k * 0.09, side = k % 2 ? 1 : -1; twig(S * 0.5, S * (0.99 - t * 0.9), side * (0.6 + R() * 0.3), S * (0.32 - t * 0.18), 70); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_needle = t);
}
const _bark: Record<string, { map: THREE.CanvasTexture; nrm: THREE.CanvasTexture }> = {};
/** 树皮：纵向裂纹（颜色 + 由高度场导出的法线）；birch = 白底横向皮孔黑斑 */
function barkTex(kind: 'bark' | 'birch'): { map: THREE.CanvasTexture; nrm: THREE.CanvasTexture } {
  if (_bark[kind]) return _bark[kind];
  const W = 128, H = 256, h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    if (kind === 'bark') { const ridge = Math.abs(Math.sin((u * 9 + 0.6 * ffFbm(u * 6, v * 3) + 0.25 * Math.sin(v * 12)) * Math.PI)); h[y * W + x] = Math.pow(ridge, 0.6) * 0.75 + 0.25 * ffFbm(u * 24, v * 10); }
    else { const len = ffFbm(u * 3 + 1, v * 22); h[y * W + x] = 0.8 + 0.2 * ffFbm(u * 20, v * 40) - (len > 0.62 ? 0.7 * Math.min(1, (len - 0.62) * 6) : 0); }
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cm = mk(), cn = mk(), gm = cm.getContext('2d')!, gn = cn.getContext('2d')!;
  const im = gm.createImageData(W, H), inn = gn.createImageData(W, H), n = new THREE.Vector3();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = h[i];
    if (kind === 'bark') { const l = 0.35 + 0.65 * v, moss = Math.max(0, ffFbm(x / W * 5, y / H * 3) - 0.6) * 2; im.data.set([(92 * l * (1 - moss) + 70 * moss) | 0, (78 * l * (1 - moss) + 90 * moss) | 0, (64 * l * (1 - moss) + 48 * moss) | 0, 255], i * 4); }
    else { const l = Math.max(0.12, v); im.data.set([226 * l | 0, 222 * l | 0, 210 * l | 0, 255], i * 4); }
    const dx = h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W], dy = h[((y + 1) % H) * W + x] - h[((y - 1 + H) % H) * W + x];
    n.set(-dx * 3, -dy * 3, 1).normalize();
    inn.data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], i * 4);
  }
  gm.putImageData(im, 0, 0); gn.putImageData(inn, 0, 0);
  const map = new THREE.CanvasTexture(cm), nrm = new THREE.CanvasTexture(cn);
  map.colorSpace = THREE.SRGBColorSpace; for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return (_bark[kind] = { map, nrm });
}

// ---------------------------------------------------------------- 树几何
interface Branch { pts: THREE.Vector3[]; r0: number; r1: number; depth: number }
function tube(b: Branch, radial: number, flare: number, R: () => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(b.pts), L = curve.getLength(), segs = Math.max(2, Math.round(L * (b.depth === 0 ? 2.5 : 1.6)));
  const frames = curve.computeFrenetFrames(segs, false), pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const lobes = R() * 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    let r = b.r0 + (b.r1 - b.r0) * Math.pow(t, 0.8); if (flare > 0) r *= 1 + flare * Math.pow(Math.max(0, 1 - t * 6), 2);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, wob = 1 + 0.08 * Math.sin(a * 3 + lobes) + (flare > 0 ? 0.25 * Math.max(0, 1 - t * 6) * Math.sin(a * 5 + lobes) : 0);
      const ca = Math.cos(a), sa = Math.sin(a), nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
      pos.push(c.x + nx * r * wob, c.y + ny * r * wob, c.z + nz * r * wob); nor.push(nx, ny, nz); uv.push(j / radial * Math.max(1, Math.round(r * 10)), t * L * 0.9);
    }
    if (i < segs) for (let j = 0; j < radial; j++) { const a0 = i * (radial + 1) + j, a1 = a0 + radial + 1; idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
interface Cards { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[]; cc: number[] }
const newCards = (): Cards => ({ pos: [], nor: [], uv: [], col: [], idx: [], cc: [] });
function pushCard(cd: Cards, base: THREE.Vector3, side: THREE.Vector3, fwd: THREE.Vector3, s: number, w: number, n: THREE.Vector3, col: THREE.Color, q: number) {
  const ctr = base.clone().addScaledVector(fwd, 0.5 * s), hk = ((Math.sin(ctr.x * 12.9898 + ctr.y * 78.233 + ctr.z * 37.719 + cd.idx.length * 0.618) * 43758.5453) % 1 + 1) % 1;   // 11-17g 卡中心 + 哈希（稀疏用）
  const b0 = cd.pos.length / 3, u0 = q < 0 ? 0 : (q % 2) * 0.5, v0 = q < 0 ? 0 : Math.floor(q / 2) * 0.5, us = q < 0 ? 1 : 0.5;
  for (const [u, v] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
    const p = base.clone().addScaledVector(side, u * s * w).addScaledVector(fwd, v * s);
    cd.pos.push(p.x, p.y, p.z); cd.nor.push(n.x, n.y, n.z); cd.uv.push(u0 + (u + 0.5) * us, 1 - (v0 + (1 - v) * us)); cd.col.push(col.r, col.g, col.b); cd.cc.push(ctr.x, ctr.y, ctr.z, hk);
  }
  cd.idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
}
function cardsGeo(cd: Cards) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(cd.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(cd.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(cd.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cd.col, 3)); g.setAttribute('aCard', new THREE.Float32BufferAttribute(cd.cc, 4)); g.setIndex(cd.idx);
  return g;
}
export type TreeKind = 'birch' | 'maple' | 'oak' | 'broadleaf' | 'spruce' | 'snowcedar' | 'dead' | 'charred' | 'shrub';
interface TreeSrc { bark: THREE.BufferGeometry | null; leaves: THREE.BufferGeometry | null; barkKind: 'bark' | 'birch'; barkTint: THREE.Color; needle: boolean; H: number; cards: number; tris: number }
interface BroadOpt { H: number; spread: number; lean: number; leafDensity: number; leafSize: number; quad: number; tint: [number, number, number]; kids0: number; twigs: boolean; trunkK?: number; upK?: number; }
/** 阔叶：树干 + 3 级分枝，末梢挂叶簇卡（树冠壳）+ 内层暗填充卡；叶卡法线 = 压扁椭球树冠法线（第 84 步） */
function broadleaf(seed: number, o: BroadOpt, dens: number): { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null; cards: number } {
  const R = ffRng(seed), H = o.H;
  const branches: Branch[] = [], tips: { p: THREE.Vector3; d: THREE.Vector3; w: number }[] = [];
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number) => {
    const pts = [from.clone()], d = dir.clone().normalize(), p = from.clone(), n = depth === 0 ? 5 : 3;
    for (let k = 1; k <= n; k++) {
      d.add(new THREE.Vector3((R() - 0.5) * 0.35, (R() - 0.3) * 0.18 + (depth > 1 ? -0.05 : 0.04), (R() - 0.5) * 0.35)).normalize();
      if (depth === 0) d.lerp(new THREE.Vector3(o.lean, 1, 0).normalize(), 0.4).normalize();
      p.addScaledVector(d, len / n); pts.push(p.clone());
    }
    const r1 = r0 * (depth === 0 ? 0.45 : 0.3);
    if (depth < 3 || o.twigs) branches.push({ pts, r0, r1, depth });
    if (depth >= 3) { tips.push({ p: p.clone(), d: d.clone(), w: 1 }); return; }
    const kids = depth === 0 ? o.kids0 + Math.floor(R() * 3) : depth === 1 ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 2);
    const curve = new THREE.CatmullRomCurve3(pts);
    for (let k = 0; k < kids; k++) {
      const t = depth === 0 ? (o.trunkK ?? 0.38) + (0.96 - (o.trunkK ?? 0.38)) * (k / kids) + R() * 0.05 : 0.35 + 0.6 * R();
      const at = curve.getPointAt(Math.min(1, t)), tan = curve.getTangentAt(Math.min(1, t));
      const az = k * 2.4 + R() * 0.8, up = (depth === 0 ? 0.55 + R() * 0.3 : 0.25 + R() * 0.3) * (o.upK ?? 1);
      const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const nd = tan.clone().multiplyScalar(0.4).add(side.multiplyScalar(o.spread)).add(new THREE.Vector3(0, up, 0)).normalize();
      grow(at, nd, len * (depth === 0 ? 0.55 - 0.25 * t : 0.55 + R() * 0.15), (r0 + (r1 - r0) * t) * (0.55 + R() * 0.15), depth + 1);
      if (depth >= 1 && R() < 0.6) tips.push({ p: at.clone(), d: nd.clone(), w: 0.6 });
    }
    if (depth >= 1) tips.push({ p: p.clone(), d: d.clone(), w: 0.8 });
  };
  grow(new THREE.Vector3(0, -0.15, 0), new THREE.Vector3(0, 1, 0), H * 0.55, 0.2 * H / 7.5, 0);
  const bark = mergeGeometries(branches.map(b => tube(b, b.depth === 0 ? 10 : b.depth === 1 ? 6 : 4, b.depth === 0 ? 0.8 : 0, R)))!;
  if (o.leafDensity <= 0) return { bark, leaves: null, cards: 0 };
  const crown = new THREE.Vector3(); tips.forEach(t => crown.add(t.p)); crown.divideScalar(Math.max(1, tips.length));
  const box = new THREE.Box3(); tips.forEach(t => box.expandByPoint(t.p));
  const csz = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(1, 1, 1)); csz.y *= 0.8;   // 压扁椭球
  const cd = newCards(), per = Math.max(1, Math.round(9 * o.leafDensity * dens)), sz = o.leafSize * H / 7.5, c = new THREE.Color();
  const [tr, tg, tb] = o.tint;
  for (const tp of tips) for (let k = 0; k < per * tp.w; k++) {
    const ctr = tp.p.clone().add(new THREE.Vector3((R() - 0.5) * 1.1, (R() - 0.35) * 0.8, (R() - 0.5) * 1.1).multiplyScalar(sz * 1.3));
    const fwd = tp.d.clone().add(new THREE.Vector3((R() - 0.5) * 1.4, (R() - 0.5) * 0.9 - 0.25, (R() - 0.5) * 1.4)).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(R() - 0.5, 1, R() - 0.5).normalize()).normalize();
    const s = sz * (0.75 + R() * 0.5), base = ctr.clone().addScaledVector(fwd, -s * 0.45);
    const sph = ctr.clone().sub(crown).divide(csz).normalize(); sph.y += 0.25; sph.normalize();
    const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, (ctr.y - box.min.y) / (box.max.y - box.min.y + 0.01))) * Math.min(1, 0.55 + 0.45 * ctr.clone().sub(crown).divide(csz).length());   // 内层 / 下层更暗
    const l = ao * (0.9 + R() * 0.25); c.setRGB(tr * l, tg * l, tb * l);
    pushCard(cd, base, side, fwd, s, 1, sph, c, o.quad);
  }
  // 内层大号暗填充卡：树冠不透光、不显空心
  const fill = Math.round(tips.length * 0.25 * dens);
  for (let k = 0; k < fill; k++) {
    const dir = new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.6, R() - 0.5).normalize();
    const ctr = crown.clone().add(dir.clone().multiply(csz).multiplyScalar(0.45 + R() * 0.2));
    const fwd = new THREE.Vector3(R() - 0.5, 0.3 + R() * 0.5, R() - 0.5).normalize(), side = new THREE.Vector3().crossVectors(fwd, dir).normalize();
    const s = sz * (1.6 + R() * 0.6); c.setRGB(tr * 0.42, tg * 0.42, tb * 0.42);
    pushCard(cd, ctr.clone().addScaledVector(fwd, -s * 0.5), side, fwd, s, 1, dir.clone().setY(dir.y + 0.2).normalize(), c, o.quad);
  }
  return { bark, leaves: cardsGeo(cd), cards: cd.idx.length / 6 };
}
/** 针叶：锥形分层，每枝两张交叉针叶刷卡（第 83 步）；snow = 上表面积雪 */
function conifer(seed: number, H: number, snow: boolean, dens: number): { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry; cards: number } {
  const R = ffRng(seed), bendX = (y: number) => 0.02 * H * Math.pow(Math.max(0, y) / H, 1.7);
  const trunk = new THREE.CylinderGeometry(0.03 * H / 8, 0.034 * H, H, 8, 8, true); trunk.translate(0, H / 2 - 0.15, 0);
  { const p = trunk.attributes.position as THREE.BufferAttribute, uv = trunk.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), fl = 1 + 0.35 * Math.max(0, 1 - y / (0.08 * H)) ** 2; p.setX(i, p.getX(i) * fl + bendX(y)); p.setZ(i, p.getZ(i) * fl); uv.setXY(i, uv.getX(i) * 2, y * 0.9); } trunk.computeVertexNormals(); }
  const limbs: THREE.BufferGeometry[] = [trunk], cd = newCards(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const card = (o: THREE.Vector3, fwd: THREE.Vector3, s: number, shade: number) => {
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize()).normalize();
    const n = new THREE.Vector3(o.x - bendX(o.y), 0, o.z).normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.6, 0)).normalize();
    c.setHSL(0.38 + (R() - 0.5) * 0.05, 0.36 + R() * 0.1, 0.17 + R() * 0.05).multiplyScalar(shade * 1.25);
    if (snow && (fwd.y > -0.05 || R() < 0.35) && R() < 0.62) c.setRGB(0.86, 0.9, 0.98).multiplyScalar(0.8 + 0.2 * shade);   // 积雪：枝上表面
    pushCard(cd, o, side, fwd, s, 1.1, n, c, -1);
  };
  const tiers = 9 + Math.floor(R() * 3), y0 = 0.22 * H;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = y0 + (H * 0.97 - y0) * f + (R() - 0.5) * 0.2, n = 5 + Math.floor(R() * 3), ph = R() * 6.28;
    for (let b = 0; b < n; b++) {
      const az = ph + b / n * 6.28 + (R() - 0.5) * 0.4, dx = Math.cos(az), dz = Math.sin(az);
      const L = (0.1 + 0.26 * Math.pow(1 - f, 0.85)) * H * (0.8 + R() * 0.35);
      const o = new THREE.Vector3(bendX(y), y, 0), dir = new THREE.Vector3(dx, -0.14 - 0.15 * (1 - f) + (R() - 0.5) * 0.1, dz).normalize();
      const tip = o.clone().addScaledVector(dir, L);
      const br = new THREE.CylinderGeometry(0.012 * H / 8, 0.03 * H / 8 * (1 - f * 0.6), L, 3, 1, true); br.translate(0, L / 2, 0);
      br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir)); br.translate(o.x, o.y, o.z); limbs.push(br);
      const m = Math.max(2, Math.round((3 + L * 1.6) * dens));
      for (let k = 0; k < m; k++) {
        const s = (1.0 + R() * 0.5) * H / 9 * (1.25 - f * 0.45), at = o.clone().lerp(tip, 0.25 + 0.75 * (k + R()) / m);
        at.y += (R() - 0.3) * 0.25;
        const fwd = dir.clone().add(new THREE.Vector3((R() - 0.5) * 0.9, (R() - 0.4) * 0.5, (R() - 0.5) * 0.9)).normalize();
        card(at.addScaledVector(fwd, -s * 0.3), fwd, s, 0.55 + 0.45 * f + 0.15 * R());
      }
    }
  }
  for (let k = 0; k < 4; k++) card(new THREE.Vector3(bendX(H * 0.92), H * 0.88, 0), new THREE.Vector3((R() - 0.5) * 0.5, 1, (R() - 0.5) * 0.5).normalize(), 0.9 * H / 9, 1);
  const lim = limbs.map(g => { const ng = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(a)) ng.deleteAttribute(a); return ng; });
  return { bark: mergeGeometries(lim)!, leaves: cardsGeo(cd), cards: cd.idx.length / 6 };
}
const BASE_H: Record<TreeKind, number> = { birch: 7, maple: 6.5, oak: 7, broadleaf: 7, spruce: 8.5, snowcedar: 8.5, dead: 5.5, charred: 5, shrub: 1.5 };
const TREE_CACHE = new Map<string, TreeSrc>();
function treeSrc(kind: TreeKind, v: number): TreeSrc {
  const dens = curQuality === 'medium' ? 0.6 : 1, key = kind + v + '|' + dens;
  const hit = TREE_CACHE.get(key); if (hit) return hit;
  const seed = 900 + v * 37 + kind.length * 131, H = BASE_H[kind];
  let r: { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null; cards: number }, barkKind: 'bark' | 'birch' = 'bark', tint = new THREE.Color(1, 1, 1), needle = false;
  switch (kind) {
    case 'birch': r = broadleaf(seed, { H, spread: 0.75, lean: 0.06, leafDensity: 1.0, leafSize: 0.62, quad: 1, tint: v ? [1.0, 0.95, 0.8] : [0.95, 1.0, 0.72], kids0: 7, twigs: false, trunkK: 0.45, upK: 1.3 }, dens); barkKind = 'birch'; break;
    case 'maple': r = broadleaf(seed, { H, spread: 1.15, lean: 0.05, leafDensity: 1.15, leafSize: 0.8, quad: 2, tint: v ? [1.0, 0.9, 0.85] : [1.05, 1.0, 0.9], kids0: 6, twigs: false }, dens); break;
    case 'oak': r = broadleaf(seed, { H, spread: 1.3, lean: 0.08, leafDensity: 1.2, leafSize: 0.85, quad: 3, tint: v ? [1.0, 0.92, 0.85] : [1.05, 1.0, 0.9], kids0: 7, twigs: false, trunkK: 0.32, upK: 0.75 }, dens); tint = new THREE.Color(0.85, 0.8, 0.75); break;
    case 'broadleaf': r = broadleaf(seed, { H, spread: 1.05, lean: 0.06, leafDensity: 1.2, leafSize: 0.8, quad: 0, tint: v ? [0.92, 1.0, 0.9] : [1.0, 1.0, 0.85], kids0: 6, twigs: false }, dens); break;
    case 'shrub': r = broadleaf(seed, { H, spread: 1.9, lean: 0.1, leafDensity: 1.7, leafSize: 0.75, quad: 0, tint: v % 2 ? [0.8, 0.88, 0.75] : [1.05, 0.98, 0.72], kids0: 5, twigs: false, trunkK: 0.1, upK: 0.9 }, dens); break;
    case 'dead': r = broadleaf(seed, { H, spread: 1.25, lean: 0.12, leafDensity: 0, leafSize: 0.6, quad: 3, tint: [1, 1, 1], kids0: 5, twigs: true }, dens); tint = new THREE.Color(1.7, 1.68, 1.6); break;
    case 'charred': r = broadleaf(seed, { H, spread: 1.1, lean: 0.15, leafDensity: 0, leafSize: 0.6, quad: 3, tint: [1, 1, 1], kids0: 4, twigs: true }, dens); tint = new THREE.Color(0.32, 0.27, 0.25); break;
    case 'spruce': r = conifer(seed, H, false, dens); needle = true; tint = new THREE.Color(1.1, 0.95, 0.85); break;
    case 'snowcedar': default: r = conifer(seed, H, true, dens); needle = true; tint = new THREE.Color(1.1, 0.95, 0.85); break;
  }
  const tris = (r.bark.index ? r.bark.index.count : r.bark.attributes.position.count) / 3 + r.cards * 2;
  const src: TreeSrc = { bark: r.bark, leaves: r.leaves, barkKind, barkTint: tint, needle, H, cards: r.cards, tris: Math.round(tris) };
  TREE_CACHE.set(key, src);
  return src;
}
const MAT_CACHE = new Map<string, { m: THREE.Material; d: THREE.Material }>();
function treeMats(src: TreeSrc, shrub: boolean) {
  const kb = 'b' + src.barkKind + src.barkTint.getHexString() + shrub + vegLayerOn(), kl = (src.needle ? 'n' : 'l') + shrub + (flora3On() ? '3' : '') + vegLayerOn();
  const vl = vegLayerOn();   // 11-17g 灌丛整丛稀疏 / 树叶卡逐张稀疏（?off=veglayer）
  const opt = shrub ? { amp: 0.45, h0: 1.2, push: 0.45, tree: false, merged: false, layerS: vl } : { amp: 0.05, h0: src.H, tree: true, merged: true };
  let b = MAT_CACHE.get(kb);
  if (!b) {
    const t = barkTex(src.barkKind);
    const m = barkAo(new THREE.MeshStandardMaterial({ color: src.barkTint, map: t.map, normalMap: t.nrm, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.92, envMapIntensity: 0.55 }), shrub ? 0.35 : 1.4);
    ffPlant(m, opt); cineSpecClass(m, 'bark'); b = { m, d: ffDepth(m) }; MAT_CACHE.set(kb, b);   // 11-19 specclass 树皮 0.45
  }
  let l = MAT_CACHE.get(kl);
  if (!l) {
    const m = floraShade(new THREE.MeshStandardMaterial({ map: src.needle ? needleTexture() : leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, envMapIntensity: 0.6 }),
      { trans: src.needle ? 0.35 : 0.5, rootDark: 0, key: src.needle ? 'needle' : 'leaf', v3: { trans: src.needle ? 0.35 : 0.7 }, ao: 'crown', edge: src.needle ? 0.45 : 0.8 });
    ffPlant(m, { ...opt, leaf: true, layerT: vl && !shrub && !!src.leaves?.attributes.aCard }); cineSpecClass(m, 'leaf'); l = { m, d: ffDepth(m) }; MAT_CACHE.set(kl, l);   // 11-19 specclass 叶卡 0.18   // 11-17 叶颤只在叶片上
  }
  return { bark: b, leaf: l };
}

// ---------------------------------------------------------------- 11-19 qlmaplemix 老树种约一半换 Demo 枫叶
//   Rhett 11-19「穿插不一定都要，各一半吧」：原有老树种（枫 / 栎 / 白桦 / 阔叶，含林团几百棵 + 原散布树）按树位置哈希约一半改挂 Demo 枫叶，
//   另一半保留原叶簇图集；确定性、逐棵穿插（不成片）。树干 / 枝条 / 叶卡位置朝向全不变（同一原型、同一实例矩阵），分布、数量、落点、寻路都不动。
//   叶：复用 demo_trees 的叶簇图集（同调色板与 Demo 树共用一张，秋林原野 = Demo 秋色红橙黄枫，其它区 = 31139f8 夏绿枫；霜脊老树只有云杉 / 雪松 / 枯树，不受影响），
//   每张原叶卡改采 Demo 格（枫 A 红橙 / 栎 C 锈褐 / 白桦 B 金黄 / 阔叶 D 黄绿为主，每卡按哈希掺第二格）；Demo 格是一整团放射叶，
//   卡以中心放大 ×1.3、只取格中 80%（单片叶约 10–14 cm，接近 Demo 树），顶点色去色只留明暗（颜色由图集给，与 31139f8 一致）。
//   灌丛、针叶、枯树不改。?off=qlmaplemix（也认 localStorage darkrock_cine_off）恢复全部旧叶。
let _qmmOff: boolean | null = null;
export function qlMapleMixOn(): boolean {
  if (_qmmOff === null) {
    _qmmOff = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      _qmmOff = `${q},${ls}`.split(',').map(x => x.trim()).includes('qlmaplemix');
    } catch { _qmmOff = false; }
  }
  return !_qmmOff;
}
type DCell = 'A' | 'B' | 'C' | 'D';
/** 老树种 → Demo 图集主格 / 掺色格 / 掺色比例（?off=qlmaple 时图集只有 A / B 两格是枫叶形，C → A、D → B） */
const QMM_CELLS: Partial<Record<TreeKind, [DCell, DCell, number]>> = { maple: ['A', 'C', 0.35], oak: ['C', 'A', 0.3], birch: ['B', 'A', 0.25], broadleaf: ['D', 'B', 0.3] };
const QMM_SCALE = 1.3, QMM_WIN = 0.8;
/** 这棵老树挂不挂 Demo 枫叶：位置哈希（与亮度色差哈希不同频），约 50% */
const qmmPick = (x: number, z: number) => { const h = Math.sin(x * 269.5 + z * 183.3) * 43758.5453; return h - Math.floor(h) < 0.5; };
const QMM_GEO = new Map<string, THREE.BufferGeometry>();
/** 原叶卡几何 → Demo 枫叶版：每卡 4 顶点（pushCard 顺序 底左 / 底右 / 顶右 / 顶左），uv 改到 Demo 格，卡绕中心放大，顶点色去色 */
function qmmLeafGeo(src: TreeSrc, kind: TreeKind, v: number): THREE.BufferGeometry | null {
  const cells = QMM_CELLS[kind]; if (!src.leaves || !cells) return null;
  const key = kind + v + '|' + src.cards + (qlMapleOn() ? '' : '|ab'); const hit = QMM_GEO.get(key); if (hit) return hit;
  const g = src.leaves.clone(), P = g.attributes.position as THREE.BufferAttribute, UV = g.attributes.uv as THREE.BufferAttribute,
    C = g.attributes.color as THREE.BufferAttribute, A = g.attributes.aCard as THREE.BufferAttribute;
  const fix = (c: DCell): DCell => (qlMapleOn() ? c : c === 'C' ? 'A' : c === 'D' ? 'B' : c);
  const c1 = demoLeafCell(fix(cells[0])), c2 = demoLeafCell(fix(cells[1])), CU4: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const lo = (1 - QMM_WIN) / 2;
  for (let i = 0; i < P.count; i++) {
    const card = i >> 2, ch = Math.sin(card * 12.9898 + v * 78.233 + kind.length * 3.7) * 43758.5453, cell = ch - Math.floor(ch) < cells[2] ? c2 : c1;
    const [cu, cv] = CU4[i & 3];
    UV.setXY(i, cell[0] + (lo + cu * QMM_WIN) * 0.5, cell[1] + (lo + cv * QMM_WIN) * 0.5);
    const cx = A.getX(i), cy = A.getY(i), cz = A.getZ(i);
    P.setXYZ(i, cx + (P.getX(i) - cx) * QMM_SCALE, cy + (P.getY(i) - cy) * QMM_SCALE, cz + (P.getZ(i) - cz) * QMM_SCALE);
    const r = C.getX(i), gg = C.getY(i), b = C.getZ(i), y = 0.2126 * r + 0.7152 * gg + 0.0722 * b; C.setXYZ(i, y, y, y);
  }
  g.computeBoundingSphere(); g.computeBoundingBox();
  QMM_GEO.set(key, g); return g;
}
/** Demo 枫叶版叶材质：与原叶同一套 floraShade / ffPlant（风、透光、叶缘、稀疏、镜面类别），只换贴图 */
function qmmLeafMat(orig: THREE.Material, pal: DemoPal) {
  const vl = vegLayerOn(), kl = 'qmm|' + pal + (flora3On() ? '3' : '') + vl + (qlMapleOn() ? '' : '|ab');
  let l = MAT_CACHE.get(kl);
  if (!l) {
    const m = floraShade(new THREE.MeshStandardMaterial({ map: demoLeafAtlas(pal) ?? leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, envMapIntensity: 0.6 }),
      { trans: 0.5, rootDark: 0, key: 'leaf', v3: { trans: 0.7 }, ao: 'crown', edge: 0.8 });
    ffPlant(m, { ...PATCHED.get(orig) }); cineSpecClass(m, 'leaf'); l = { m, d: ffDepth(m) }; MAT_CACHE.set(kl, l);
  }
  return l;
}

// ---------------------------------------------------------------- 主入口
export interface FloraTree { x: number; z: number; kind: TreeKind; s: number; ry: number; v?: number }
export interface FieldFloraOpt {
  id: string;
  /** 世界坐标范围 [x0, z0, x1, z1] */
  area: [number, number, number, number];
  /** 世界坐标地面高度 */
  ground: (x: number, z: number) => number;
  /** 草 / 花默认权重（世界坐标，0 = 不长，0..1 = 边缘渐稀） */
  grassW: (x: number, z: number) => number;
  grass: GrassLayer[];
  flowers?: FlowerSet;
  trees: FloraTree[];
  /** 不挡路的灌丛：数量 + 权重 */
  shrubs?: { count: number; seed: number; w: (x: number, z: number) => number };
  /** 这张图的风：强度 0..1.5，风向（弧度，0 = +x） */
  wind?: { s: number; h: number };
  /** 11-17 到水边的距离（米，水里为负）；离水 3.5 米内的草花进河面倒影（?off=vegshadow 关）；不填 = 没有水 */
  water?: (x: number, z: number) => number;
  /** 11-16 飘落叶 / 雪粒 / 飞灰（field_leaves.ts）；不填 = 不落 */
  leaves?: LeafRecipe;
  /** 11-18 专长包 v9 林团（秋林式高密度成片林）；不填 = 没有 */
  grove?: GroveOpt;
  /** 11-19 秋林 Demo 树种（demo_trees.ts，混种进本图，不替换原树种）；不填 = 没有 */
  demo?: DemoTreeOpt;
  /** 11-19 花草繁茂（ql_lush.ts，Demo 近层繁茂草 + Demo 四种花，?off=qllush 关）；不填 = 没有 */
  lush?: LushOpt;
}
/** 11-19 Demo 树：pal = 叶簇图集配色（秋林暖黄红 / 夏绿），kinds = Demo 规格（mid / gold / yg 阔叶、conifer 针叶）权重，count = 高档棵数（中档 ×0.5） */
export interface DemoTreeOpt { pal: DemoPal; count: number; seed: number; kinds: [DemoKind, number][]; s?: [number, number]; w?: (x: number, z: number) => number }
export const demoTreeOn = () => !offHas('demotree');
export const demoTreeStats: Record<string, { trees: number; protos: number; draws: number; shadowDraws: number; tris: number }> = {};
/** Demo 树落点：靠林团掩码（林缘 / 林中混种，阈值比林团低 0.06），离原散布树 / 林团树 ≥ 4 米、彼此 ≥ 5 米，离路 / 物件 2.5 米 */
function demoPlan(o: FieldFloraOpt, others: { x: number; z: number }[]): DemoTreePlace[] {
  const d = o.demo!, R = ffRng(d.seed), [x0, z0, x1, z1] = o.area, f = o.grove?.freq ?? 0.022, thr = (o.grove?.thr ?? 0.56) - 0.06;
  const [s0, s1] = d.s ?? [0.9, 1.25], w = d.w ?? o.grove?.w ?? o.grassW;
  const want = Math.round(d.count * demoTreeCountK() * (curQuality === 'medium' ? 0.5 : 1));   // 11-19 qlmaple ×1.75
  const C = 6, grid = new Map<string, { x: number; z: number; r: number }[]>();
  const put = (x: number, z: number, r: number) => { const k = Math.floor(x / C) + ',' + Math.floor(z / C); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push({ x, z, r }); };
  const near = (x: number, z: number, r: number) => { const gx = Math.floor(x / C), gz = Math.floor(z / C); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const l = grid.get((gx + i) + ',' + (gz + j)); if (l) for (const p of l) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (r + p.r) ** 2) return true; } return false; };
  for (const t of others) put(t.x, t.z, 1.5);
  const pick = (h: number) => { let a = 0; for (const [k, p] of d.kinds) { a += p; if (h < a) return k; } return d.kinds[d.kinds.length - 1][0]; };
  const out: DemoTreePlace[] = [];
  for (let guard = 0; out.length < want && guard < want * 80; guard++) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    if (o.grove && ffFbm(x * f + 7.3, z * f + 1.9) < thr) continue;
    if (w(x, z) < 0.9) continue;
    if ([[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([dx, dz]) => w(x + dx, z + dz) < 0.6)) continue;
    if (near(x, z, 2.5)) continue;
    const s = s0 + R() * (s1 - s0);
    put(x, z, 2.5); out.push({ x, y: o.ground(x, z), z, kind: pick(R()), v: R() > 0.5 ? 1 : 0, s, ry: R() * 6.28 });
  }
  return out;
}
// ---------------------------------------------------------------- 11-18 林团（专长包 v9 example 布局：fbm 林团 + 林间空地 + 间距采样 + 林下灌木贴树根）
//   林团外保持原散布不变；林缘按掩码渐稀；树干进寻路障碍（groveNav 登记，建图前后都可）。?off=grove 关；?off=understory 只关林下灌木。
//   季节由各图 kinds 决定（夏绿图只给夏绿树种），不改色表。超高 / 高全量，中档 ×0.5，低档不建（低档整个 field_flora 不建）。
export interface GroveOpt {
  seed: number; count: number; kinds: [TreeKind, number][];
  /** 林团掩码频率（默认 0.022 ≈ 45 米一片）与阈值（越高林团越少，默认 0.56） */
  freq?: number; thr?: number;
  /** 树的缩放范围（默认 0.85–1.35） */
  s?: [number, number];
  /** 林团可长权重（世界坐标；默认用 grassW），要求 ≥0.9 且四周 2.5 米也 ≥0.6 */
  w?: (x: number, z: number) => number;
  /** 每棵树带的林下灌木期望数（默认 1.3） */
  under?: number;
}
const offHas = (k: string) => typeof location !== 'undefined' && new RegExp('[?&]off=[^&]*\\b' + k + '\\b').test(location.search);
export const groveOn = () => !offHas('grove');
type Circ_ = { x: number; z: number; r: number };
const GROVE_Q = new Map<string, { nav: { addCircle(c: Circ_): void } | null; pend: Circ_[] }>();
/** 寻路网格登记：林团树干作为圆形障碍加进该图的 NavGrid（先建图后建林、或反过来都行） */
export function groveNav(id: string, nav: { addCircle(c: Circ_): void }) {
  let e = GROVE_Q.get(id); if (!e) GROVE_Q.set(id, e = { nav: null, pend: [] });
  e.nav = nav; for (const c of e.pend) nav.addCircle(c); e.pend.length = 0;
}
function groveBlock(id: string, c: Circ_) {
  let e = GROVE_Q.get(id); if (!e) GROVE_Q.set(id, e = { nav: null, pend: [] });
  if (e.nav) e.nav.addCircle(c); else e.pend.push(c);
}
export const groveStats: Record<string, { trees: number; under: number }> = {};
function grovePlan(o: FieldFloraOpt): { trees: FloraTree[]; under: FloraTree[] } {
  const g = o.grove!, R = ffRng(g.seed), [x0, z0, x1, z1] = o.area, f = g.freq ?? 0.022, thr = g.thr ?? 0.56;
  const [s0, s1] = g.s ?? [0.85, 1.35], w = g.w ?? o.grassW;
  const want = Math.round(g.count * (curQuality === 'medium' ? 0.5 : 1));
  const C = 4, grid = new Map<string, { x: number; z: number; r: number }[]>();
  const put = (x: number, z: number, r: number) => { const k = Math.floor(x / C) + ',' + Math.floor(z / C); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push({ x, z, r }); };
  const near = (x: number, z: number, r: number) => { const gx = Math.floor(x / C), gz = Math.floor(z / C); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const l = grid.get((gx + i) + ',' + (gz + j)); if (l) for (const p of l) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (r + p.r) ** 2) return true; } return false; };
  for (const t of o.trees) put(t.x, t.z, 2.0);   // 原散布树：离它 ≥3.7 米
  const trees: FloraTree[] = [], under: FloraTree[] = [];
  const pick = (h: number) => { let a = 0; for (const [k, p] of g.kinds) { a += p; if (h < a) return k; } return g.kinds[g.kinds.length - 1][0]; };
  for (let guard = 0; trees.length < want && guard < want * 60; guard++) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    const m = ffFbm(x * f + 7.3, z * f + 1.9);
    if (m < thr || R() > ffSmooth(thr, thr + 0.1, m)) continue;                 // 林团掩码，林缘渐稀
    if (ffFbm(x * 0.085 + 3.1, z * 0.085 + 11.7) < 0.3) continue;               // 林间空地
    if (w(x, z) < 0.9) continue;
    if ([[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([dx, dz]) => w(x + dx, z + dz) < 0.6)) continue;   // 离路 / 物件留 2.5 米
    if (near(x, z, 1.5)) continue;                                              // 林团树间距 ≈3 米
    const s = s0 + R() * (s1 - s0);
    put(x, z, 1.5); trees.push({ x, z, kind: pick(R()), s, ry: R() * 6.28, v: R() > 0.5 ? 1 : 0 });
  }
  if (!offHas('understory')) {
    const per = (g.under ?? 1.3) * (curQuality === 'medium' ? 0.6 : 1);
    for (const t of trees) {
      let n = Math.floor(per) + (R() < per % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = R() * 6.28, r = (1.5 + R() * 3.5) * Math.max(0.8, t.s), x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
        if (w(x, z) < 0.8) continue;
        under.push({ x, z, kind: 'shrub', s: 0.55 + R() * 0.75, ry: R() * 6.28, v: R() > 0.5 ? 1 : 0 });
      }
    }
  }
  return { trees, under };
}
const TREE_TILE = 80;
export function buildFieldFlora(o: FieldFloraOpt): THREE.Group {
  const root = new THREE.Group(); root.name = 'field_flora_' + o.id; root.userData.noBake = true;
  const tiles: Tile[] = [], k = tierK(), fadeR = curQuality === 'medium' ? 52 : curQuality === 'ultra' ? 85 : 72, treeR = curQuality === 'medium' ? 140 : 190;
  const st = { grass: 0, flowers: 0, reeds: 0, trees: 0, shrubs: 0, kinds: {} as Record<string, number>, draws: 0 };
  // 11-18 林团：先排好位置，草在树干 1.2 米内让开（不穿树），树干登记寻路障碍
  const gp = o.grove && groveOn() ? grovePlan(o) : null;
  if (gp && gp.trees.length) {
    const G = 4, gg = new Map<string, FloraTree[]>();
    for (const t of gp.trees) { const kk = Math.floor(t.x / G) + ',' + Math.floor(t.z / G); let l = gg.get(kk); if (!l) gg.set(kk, l = []); l.push(t); }
    const W0 = o.grassW;
    o = { ...o, grassW: (x, z) => { const w0 = W0(x, z); if (w0 <= 0) return 0; const l = gg.get(Math.floor(x / G) + ',' + Math.floor(z / G)); if (l) for (const t of l) { const d = Math.hypot(x - t.x, z - t.z); if (d < 1.2 * t.s) return w0 * ffSmooth(0.35 * t.s, 1.2 * t.s, d); } return w0; } };
    for (const t of gp.trees) groveBlock(o.id, { x: t.x, z: t.z, r: 0.45 * t.s });
    groveStats[o.id] = { trees: gp.trees.length, under: gp.under.length };
    console.info('[grove]', o.id, 'trees', gp.trees.length, 'under', gp.under.length);
    ((globalThis as unknown as { __grove?: Record<string, { x: number; z: number }[]> }).__grove ??= {})[o.id] = gp.trees.map(t => ({ x: t.x, z: t.z }));   // 自查取景用
  }
  // 11-19 Demo 树：林团之后排位置（避开原散布树 + 林团树），草在树干 1.2 米内让开，树干登记寻路障碍
  const dp = o.demo && demoTreeOn() ? demoPlan(o, [...o.trees, ...(gp?.trees ?? [])]) : null;
  // 11-19 qlmaplefull：原有阔叶老树（枫 / 栎 / 白桦 / 阔叶，原散布树 + 林团树）整棵换成 Demo 枫树（同位置、同朝向，树干寻路圆沿用原树），
  //   针叶 / 枯树 / 灌丛不动；每棵按位置哈希挑秋色或夏绿叶：秋林原野 62% 秋色 / 38% 夏绿，夏绿图 88% 夏绿 / 12% 早红。?off=qlmaplefull 回 C22
  const mfOn = !!o.demo && demoTreeOn() && qlMapleOn() && qlMapleFullOn();
  const mfSet = new Set<FloraTree>(), mfPlaces: (DemoTreePlace & { pal: DemoPal })[] = [];
  if (mfOn) {
    const zp = o.demo!.pal, alt: DemoPal = zp === 'autumn' ? 'summer' : 'autumn', altK = zp === 'autumn' ? 0.38 : 0.12;
    for (const t of [...o.trees, ...(gp?.trees ?? [])]) {
      if (!QMM_CELLS[t.kind]) continue;
      const h = Math.sin(t.x * 41.7 + t.z * 289.3) * 43758.5453, hf = h - Math.floor(h), h2 = Math.sin(t.x * 91.3 + t.z * 17.9) * 24634.6345, hf2 = h2 - Math.floor(h2);
      const kind: DemoKind = t.kind === 'birch' ? 'gold' : t.kind === 'broadleaf' ? (hf2 < 0.45 ? 'yg' : 'mid') : 'mid';
      mfSet.add(t);
      mfPlaces.push({ x: t.x, y: o.ground(t.x, t.z), z: t.z, kind, v: hf2 > 0.5 ? 1 : 0, s: Math.min(1.35, Math.max(0.8, t.s * 0.9)), ry: t.ry, pal: hf < altK ? alt : zp });
    }
  }
  if (dp && dp.length) {
    const G = 4, gg = new Map<string, DemoTreePlace[]>();
    for (const t of dp) { const kk = Math.floor(t.x / G) + ',' + Math.floor(t.z / G); let l = gg.get(kk); if (!l) gg.set(kk, l = []); l.push(t); }
    const W0 = o.grassW;
    o = { ...o, grassW: (x, z) => { const w0 = W0(x, z); if (w0 <= 0) return 0; const l = gg.get(Math.floor(x / G) + ',' + Math.floor(z / G)); if (l) for (const t of l) { const d = Math.hypot(x - t.x, z - t.z); if (d < 1.2 * t.s) return w0 * ffSmooth(0.35 * t.s, 1.2 * t.s, d); } return w0; } };
    for (const t of dp) groveBlock(o.id, { x: t.x, z: t.z, r: 0.45 * t.s });
  }
  const lu = o.lush && qlLushOn() && o.grass.length ? o.lush : null;   // 11-19 qllush（没草的图不铺）
  const t0 = lu ? tiles.length : 0;
  for (const L of o.grass) { const n = grassLayer(root, tiles, { ...L, count: Math.round(L.count * k * (lu && !L.reed ? lu.oldGrassK ?? 1 : 1)) }, o.area, o.ground, o.grassW, fadeR, o.water); if (L.reed) st.reeds += n; else st.grass += n; }
  if (o.flowers) st.flowers = flowerLayer(root, tiles, { ...o.flowers, count: Math.round(o.flowers.count * flowerK() * (lu ? lu.oldFlowerK ?? 0.6 : 1)) }, o.area, o.ground, o.grassW, fadeR, o.water);
  if (lu) {   // 11-19 花草繁茂：Demo 近层繁茂草（整图按面积，近处 34 米内画）+ Demo 四种花（整图按面积，60 米内画）
    const Wl = lu.w ? (x: number, z: number) => o.grassW(x, z) * lu.w!(x, z) : o.grassW, usable = usableArea(o.area, Wl);
    const want = Math.round(lu.grass * usable * lushGrassK()), t1 = tiles.length;
    const gb = grassLayer(root, tiles, { count: want, seed: lu.seed, hMin: lu.h[0], hMax: lu.h[1], dry: lu.dry, lush: true, fr: LUSH_GRASS_R(), w: Wl }, o.area, o.ground, o.grassW, fadeR, o.water);
    st.grass += gb;
    const t2 = tiles.length, fl = lushFlowerLayer(root, tiles, o.id, lu, o.area, usable, o.ground, o.grassW, o.water);
    let nf = 0; for (const v of Object.values(fl.n)) nf += v; st.flowers += nf;
    lushStats[o.id] = { usable: Math.round(usable), grassTufts: want, grassBlades: gb, flowers: fl.n, flowerTris: Math.round(fl.tris), drawsMax: tiles.length - t1 };
    console.info('[qllush]', o.id, lushStats[o.id], 'tiles', t2 - t1, tiles.length - t2, 'prev', t1 - t0);
  }
  // 树 + 灌丛：每个（树种, 变体）按 80 米分块实例化
  //   11-19 qlmaplemix：bark = 全部实例（树干分块与绘制不变）；lf = 挂原叶的实例；lm = 挂 Demo 枫叶的实例（同分块，叶子多一个 InstancedMesh）
  const qmmPal: DemoPal | null = o.demo && qlMapleMixOn() ? o.demo.pal : null;
  const groups = new Map<string, { kind: TreeKind; v: number; b: Map<string, Inst[]>; lf: Map<string, Inst[]>; lm: Map<string, Inst[]> }>();
  let qmmN = 0, qmmAll = 0;
  const add = (t: FloraTree) => {
    if (mfSet.has(t)) return;   // 11-19 qlmaplefull：整棵换成 Demo 枫树
    const v = t.v ?? 0, gk = t.kind + v; let gg = groups.get(gk); if (!gg) groups.set(gk, gg = { kind: t.kind, v, b: new Map(), lf: new Map(), lm: new Map() });
    const key = tileKey(t.x, t.z, TREE_TILE); let list = gg.b.get(key); if (!list) gg.b.set(key, list = []);
    const qm = !!qmmPal && !!QMM_CELLS[t.kind]; if (qm) qmmAll++;
    const lb = qm && qmmPick(t.x, t.z) ? (qmmN++, gg.lm) : gg.lf; let ll = lb.get(key); if (!ll) lb.set(key, ll = []);
    const sc = t.s, y = o.ground(t.x, t.z) - 0.12 * sc;
    TMP.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.ry); TMP.p.set(t.x, y, t.z); TMP.s.set(t.kind === 'shrub' ? sc * 1.2 : sc, sc, t.kind === 'shrub' ? sc * 1.2 : sc);
    const hv = (Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1;
    const it = { m: new THREE.Matrix4().compose(TMP.p, TMP.q, TMP.s), c: new THREE.Color().setScalar(0.88 + 0.22 * Math.abs(hv)) }; list.push(it); ll.push(it);
    st.kinds[t.kind] = (st.kinds[t.kind] ?? 0) + 1;
  };
  for (const t of o.trees) add(t);
  st.trees = o.trees.length;
  if (gp) { for (const t of gp.trees) add(t); for (const t of gp.under) add(t); st.trees += gp.trees.length; st.shrubs += gp.under.length; }
  if (o.shrubs) {
    const R = ffRng(o.shrubs.seed), [x0, z0, x1, z1] = o.area, want = Math.round(o.shrubs.count * (curQuality === 'medium' ? 0.5 : 1));
    for (let i = 0, guard = 0; i < want && guard++ < want * 40;) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), w = o.shrubs.w(x, z);
      if (w <= 0 || R() > w || ffFbm(x * 0.05 + 2, z * 0.05) < 0.5) continue;
      add({ x, z, kind: 'shrub', s: 0.6 + R() * 0.7, ry: R() * 6.28, v: Math.floor(R() * 2) }); i++; st.shrubs++;
    }
  }
  for (const gg of groups.values()) {
    const src = treeSrc(gg.kind, gg.v), shrub = gg.kind === 'shrub', mats = treeMats(src, shrub);
    if (src.bark) emitTiles(root, tiles, 'ff_tree_bark_' + gg.kind, src.bark, mats.bark.m, gg.b, TREE_TILE, treeR, { cast: true, depth: mats.bark.d });
    if (src.leaves) emitTiles(root, tiles, 'ff_tree_leaves_' + gg.kind, src.leaves, mats.leaf.m, gg.lf, TREE_TILE, treeR, { cast: !shrub || curQuality !== 'medium', depth: mats.leaf.d });
    const qg = qmmPal && gg.lm.size ? qmmLeafGeo(src, gg.kind, gg.v) : null;   // 11-19 qlmaplemix
    if (qg) { const qm = qmmLeafMat(mats.leaf.m, qmmPal!); emitTiles(root, tiles, 'ff_tree_leaves_qmm_' + gg.kind, qg, qm.m, gg.lm, TREE_TILE, treeR, { cast: true, depth: qm.d }); }
    else if (src.leaves && gg.lm.size) emitTiles(root, tiles, 'ff_tree_leaves_' + gg.kind, src.leaves, mats.leaf.m, gg.lm, TREE_TILE, treeR, { cast: !shrub || curQuality !== 'medium', depth: mats.leaf.d });
  }
  if (qmmPal) { st.kinds.qlmaplemix = qmmN; console.info('[qlmaplemix]', o.id, qmmPal, 'maple', qmmN, '/', qmmAll); }
  if (!mfOn && dp && dp.length) {   // Demo 叶卡 ×0.8（中档，Demo tiers.leaves）
    const r = buildDemoTrees(dp, o.demo!.pal, curQuality === 'medium' ? 0.8 : 1);
    root.add(r.group); st.trees += r.stats.trees; st.kinds.demo = r.stats.trees;
    demoTreeStats[o.id] = { trees: r.stats.trees, protos: r.stats.protos, draws: r.stats.draws, shadowDraws: r.stats.shadowDraws, tris: r.stats.tris };
    console.info('[demotree]', o.id, demoTreeStats[o.id]);
  }
  if (mfOn) {   // 11-19 qlmaplefull：Demo 树（新增的 + 老树换来的）按（调色, 80 米块）分块实例化，随树的显示半径整块隐藏（原 Demo 树整图一个网格，换满后三角太多）
    const all: (DemoTreePlace & { pal: DemoPal })[] = [...(dp ?? []).map(p => { const h = Math.sin(p.x * 41.7 + p.z * 289.3) * 43758.5453, hf = h - Math.floor(h), zp = o.demo!.pal;
      return { ...p, pal: (p.kind !== 'conifer' && hf < (zp === 'autumn' ? 0.38 : 0.12) ? (zp === 'autumn' ? 'summer' : 'autumn') : zp) as DemoPal }; }), ...mfPlaces];
    const bk = new Map<string, (DemoTreePlace & { pal: DemoPal })[]>();
    for (const p of all) { const k = p.pal + '|' + tileKey(p.x, p.z, TREE_TILE); let l = bk.get(k); if (!l) bk.set(k, l = []); l.push(p); }
    const tot = { trees: 0, draws: 0, tris: 0, autumn: 0, summer: 0, swapped: mfPlaces.length, added: dp?.length ?? 0 };
    for (const [k, list] of bk) {
      const [pal, tk] = k.split('|'), [cx, cz] = tk.split(',').map(Number);
      const r = buildDemoTrees(list, pal as DemoPal, curQuality === 'medium' ? 0.8 : 1);
      root.add(r.group); tiles.push({ obj: r.group, x: (cx + 0.5) * TREE_TILE, z: (cz + 0.5) * TREE_TILE, r: treeR + TREE_TILE * 0.71 });
      tot.trees += r.stats.trees; tot.draws += r.stats.draws; tot.tris += r.stats.tris; tot[pal as DemoPal] += r.stats.trees;
    }
    st.trees += tot.trees - mfPlaces.length; st.kinds.demo = tot.trees; st.kinds.qlmaplefull = mfPlaces.length;
    demoTreeStats[o.id] = { trees: tot.trees, protos: bk.size, draws: tot.draws, shadowDraws: tot.draws, tris: tot.tris };
    console.info('[qlmaplefull]', o.id, tot);
  }
  st.draws = tiles.length;
  // 11-18 林团变密后镜头老被树叶 / 灌丛 / 草挡得贴脸：写实草木只有树干挡镜头（叶卡、灌丛、草花不算），射线也少算几十万实例。?off=ffcam 回旧
  if (!offHas('ffcam')) root.traverse(c => { if ((c as THREE.Mesh).isMesh && !/^ff_tree_bark_(?!shrub)/.test(c.name)) c.userData.noCamBlock = true; });
  if (o.leaves) { const lv = buildFallingLeaves(o, o.leaves, BASE_H); if (lv) root.add(lv); }
  // 节拍器：本图可见时每帧驱动风场 / 推开 / 距离裁剪（不画任何像素）
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const ticker = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  ticker.frustumCulled = false; ticker.name = 'ff_ticker'; ticker.renderOrder = -1000; ticker.userData.noBake = true; ticker.userData.dynDone = true;
  const wind = o.wind ?? { s: 0.45, h: 0.8 };
  ticker.onBeforeRender = (_r, _s, cam) => tick(cam, tiles, wind, o.id);
  root.add(ticker);
  fieldFloraStats[o.id] = st;
  root.userData.ffTiles = tiles;
  return root;
}

// ---------------------------------------------------------------- 每帧
type Unit_ = { pos?: THREE.Vector3; alive?: boolean; rig?: { root?: THREE.Object3D } };
type G_ = { player?: Unit_; enemies?: Unit_[] };
const S = { T: 0, last: -1, frameCam: null as THREE.Camera | null, lastFrame: -1, map: '', pl: { x: 0, z: 0, spd: 0, ok: false }, trailClock: 0, trail: [] as { x: number; z: number; age: number; k: number }[], pick: 0, picked: [] as Unit_[], lastPos: new WeakMap<object, { x: number; z: number; t: number }>() };
/** 调试 / 样片：强制时间（null = 实时） */
export const fieldFloraDebug = { forceT: null as number | null, forceWind: null as number | null, player: null as { x: number; z: number } | null, stats: () => fieldFloraStats, uniforms: () => ({ wind: FF_U.uFfWind.value.toArray(), misc: FF_U.uFfMisc.value.toArray(), cam: FF_U.uFfCam.value.toArray() }) };
function tick(cam: THREE.Camera, tiles: Tile[], wind: { s: number; h: number }, id: string) {
  const now = performance.now() / 1000;
  FF_SHARED.lastTick = now;
  if (now === S.last && S.map === id) return;   // 同一帧多次（多个视口）只跑一次
  let dt = S.last < 0 ? 0 : Math.min(0.1, Math.max(0, now - S.last)); S.last = now;
  if (S.map !== id) { S.map = id; S.T = 0; dt = 0; S.trail.length = 0; S.pl.ok = false; FF_U.uFfAir.value.x = FF_U.uFfAir.value.y = 0; }
  S.T += dt;
  const T = fieldFloraDebug.forceT ?? S.T, U = FF_U, W = U.uFfWind.value, Air = U.uFfAir.value, Mi = U.uFfMisc.value;
  const qw = QL_DEMO.wind;   // 11-17g 专长包 v8 风场：全场一个风向 (0.894, 0.447)、强度 1、阵风顺风 3.2 m/s（?off=qlwind 回各图风向 / 风速）
  const strength = fieldFloraDebug.forceWind ?? (qw ? 1 : wind.s), head = qw ? Math.atan2(0.447, 0.894) : wind.h + 0.35 * Math.sin(T * 0.013) + 0.2 * Math.sin(T * 0.031 + 1.3);
  W.set(Math.cos(head), Math.sin(head), strength, T);
  const adv = qw ? 3.2 : 2.2 + 3 * strength;
  if (fieldFloraDebug.forceT !== null) { Air.x = W.x * adv * T; Air.y = W.y * adv * T; }
  else { Air.x += W.x * adv * dt; Air.y += W.y * adv * dt; }
  const mid = curQuality === 'medium';
  Mi.set(CFX2[0] > 0.5 ? 1 : 0, 1, 1, mid ? 52 : curQuality === 'ultra' ? 85 : 72);
  const f3 = flora3On();
  if (f3) { Air.z = 0.55; Air.w = 0.3; } else { Air.z = 0.45; Air.w = 0.15; }   // 11-16 v3：阵风 + 看得见的滚浪（草浪顺风推过去）
  const cp = cam.position; U.uFfCam.value.set(cp.x, cp.y, cp.z, mid && !f3 ? 0 : 1);   // v3：中画质也开近处叶颤（只在顶点里算）
  // 距离裁剪（分块）
  const lodD = LOD_D(), ly = U.uFfLayer.value;
  if (vegLayerOn()) ly.set(mid ? 12 : curQuality === 'ultra' ? 20 : 16, mid ? 34 : curQuality === 'ultra' ? 56 : 46, mid ? 0.35 : curQuality === 'ultra' ? 0.5 : 0.45, 0); else ly.set(16, 46, 1, 0);
  if (vegLayerOn()) {   // 11-17g 灌丛：中 18–48 留 0.5；高 24–64 留 0.6；超高 30–80 留 0.65。树叶卡：中 30–80 留 0.5；高 40–110 留 0.6；超高 50–140 留 0.65
    U.uFfLayerS.value.set(mid ? 18 : curQuality === 'ultra' ? 30 : 24, mid ? 48 : curQuality === 'ultra' ? 80 : 64, mid ? 0.5 : curQuality === 'ultra' ? 0.65 : 0.6, 0);
    U.uFfLayerT.value.set(mid ? 30 : curQuality === 'ultra' ? 50 : 40, mid ? 80 : curQuality === 'ultra' ? 140 : 110, mid ? 0.5 : curQuality === 'ultra' ? 0.65 : 0.6, 0);
  } else { U.uFfLayerS.value.set(1e4, 2e4, 1, 0); U.uFfLayerT.value.set(1e4, 2e4, 1, 0); }
  for (const t of tiles) {
    const vis = Math.hypot(t.x - cp.x, t.z - cp.z) < t.r;
    if (!t.lo) { t.obj.visible = vis; continue; }
    const h = t.half ?? 0, bd = Math.hypot(Math.max(0, Math.abs(t.x - cp.x) - h), Math.max(0, Math.abs(t.z - cp.z) - h));   // 到分块最近点
    t.far = t.far ? bd > lodD - 2 : bd > lodD + 2;
    t.obj.visible = vis && !t.far; t.lo.visible = vis && t.far;
  }
  // 玩家 + 足迹
  const G = (globalThis as unknown as { __game?: G_ }).__game, A = U.uFfAgents.value;
  const pp = fieldFloraDebug.player ?? (G?.player?.pos ? { x: G.player.pos.x, z: G.player.pos.z } : null);
  for (const a of A) a.set(0, 0, 0, 0);
  if (pp) {
    if (S.pl.ok && dt > 0) { const v = Math.hypot(pp.x - S.pl.x, pp.z - S.pl.z) / dt; S.pl.spd += (Math.min(v, 20) - S.pl.spd) * Math.min(1, dt * 10); }
    S.pl.x = pp.x; S.pl.z = pp.z; S.pl.ok = true; A[0].set(pp.x, pp.z, 0.6, S.pl.spd);
  }
  if (!mid && G?.enemies && pp) {   // 高 / 超高：最近 3 个在动的怪也推草
    S.pick -= dt;
    if (S.pick <= 0) {
      S.pick = 0.2; const cand: { u: Unit_; d: number }[] = [];
      for (const u of G.enemies) {
        const pos = u.pos ?? u.rig?.root?.position; if (!pos || u.alive === false) continue;
        const d = Math.hypot(pos.x - pp.x, pos.z - pp.z); if (d > 25) continue;
        const lp = S.lastPos.get(u); S.lastPos.set(u, { x: pos.x, z: pos.z, t: S.T });
        if (lp && S.T > lp.t && Math.hypot(pos.x - lp.x, pos.z - lp.z) / (S.T - lp.t) > 0.3) cand.push({ u, d });
      }
      S.picked = cand.sort((a, b) => a.d - b.d).slice(0, 3).map(c => c.u);
    }
    S.picked.forEach((u, i) => { const pos = u.pos ?? u.rig?.root?.position; if (pos) A[i + 1].set(pos.x, pos.z, Math.min(1.5, 0.6 * (u.rig?.root?.scale.x ?? 1)), 3); });
  }
  for (const s of S.trail) s.age += dt;
  while (S.trail.length && S.trail[0].age > 0.9) S.trail.shift();
  S.trailClock -= dt;
  if (pp && S.trailClock <= 0) { S.trailClock = 0.15; S.trail.push({ x: S.pl.x, z: S.pl.z, age: 0, k: S.pl.spd > 0.3 ? Math.min(1, S.pl.spd / 5) : 0 }); while (S.trail.length > 6) S.trail.shift(); }
  const TR = U.uFfTrail.value;
  for (let i = 0; i < 6; i++) { const s = S.trail[i]; if (s) TR[i].set(s.x, s.z, s.age, s.k); else TR[i].set(0, 0, 0, 0); }
}
/** 树的平均三角形数（自查用） */
export function fieldFloraTreeInfo() { return [...TREE_CACHE.entries()].map(([k, v]) => ({ k, tris: v.tris, cards: v.cards })); }
