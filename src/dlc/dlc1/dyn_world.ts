// ======================================================================
// 11-14 DLC 地图动态（Rhett：吊灯摆、草 / 花 / 树 / 海草 / 旗 / 绳 / 链随风自然摆，角色走过被推开再弹回）
// 全在 GPU：一个共享风场（方向 + 强度 + 时间 + 顺风漂移的阵风 / 滚浪振幅调制），每帧只写十几个 uniform，
//   不逐物体跑 CPU、不加点光源。频率按物体恒定（永远不写 time·f(t)），阵风只调振幅（画质专长包第 22 / 23 / 50 步）。
// 角色推开：uDynAgents[4]（玩家 + 最近 3 个在动的怪 / NPC）给「正在推」，uDynTrail[6]（玩家最近 0.9 秒的足迹）
//   给离开后的闭式阻尼弹回：Σ 冲量·exp(−k·Δt)·sin(ω·Δt)，没有逐帧状态（第 17 / 23 步）。
// 补丁：dynPlant（草 / 灌木 / 海草 / 芦苇 / 花 / 树）、dynHang（吊灯 / 链 / 绳 / 挂布：绕挂点整体旋转，越往下越软）、
//   dynCloth（旗面：固定边不动，沿 x 方向传波）。阴影用同一补丁的 customDepthMaterial（深度通道不用 cameraPosition）。
// 写法沿用 web/cine.ts cineWind：链上原 onBeforeCompile + customProgramCacheKey，字符串替换走 cinePatch（找不到报 patch miss）。
// 代码为本项目自写；思路参考画质专长包（AI Portals flora 阵风前沿 / Stonehenge 草叶弯曲保长，均只借思路，未拷贝代码）。
// ======================================================================
import { treeWindGlsl } from '../../web/tree_wind';   // 11-17 树：主干不动、树冠整体摆
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import { cinePatch, CFX2 } from '../../web/cine';
import { QL_DEMO } from '../../web/map_look';   // 11-17g 专长包 v8 风场（?off=qlwind）
import type { PackCtx, WildBuildApi } from '../../core/ContentPacks';

// ---------------------------------------------------------------- 共享 uniform（所有补丁材质引用同一份对象）
const V4 = () => new THREE.Vector4();
export const DYN_U = {
  /** x, z = 风向（单位向量，风吹向的方向），y… 见下：z = 强度 0..1.5，w = 时间（秒，进图归零） */
  uDynWind: { value: new THREE.Vector4(1, 0, 0.5, 0) },
  /** x, z = 空气漂移量（阵风随风走：采样点 p − air），z = 阵风振幅，w = 滚浪振幅 */
  uDynAir: { value: new THREE.Vector4(0, 0, 0.45, 0.15) },
  /** 每个角色 (x, z, 半径, 速度 m/s)；半径 0 = 空位 */
  uDynAgents: { value: [V4(), V4(), V4(), V4()] },
  /** 4 个角色脚下世界 y（吊挂物判断够不够得着） */
  uDynAgentY: { value: new THREE.Vector4() },
  /** 玩家足迹 (x, z, 距今秒, 强度 0..1)；强度 0 = 空位 */
  uDynTrail: { value: [V4(), V4(), V4(), V4(), V4(), V4()] },
  /** 主镜头位置 xyz，w = 近处叶片颤动开关（深度通道里 cameraPosition 是阴影相机，所以单独传） */
  uDynCam: { value: new THREE.Vector4() },
  /** x = 振幅倍率（画质 / 不在 DLC 图 = 0），y = 角色推开开关，z = 足迹弹回开关，w = 足迹窗口（秒） */
  uDynMisc: { value: new THREE.Vector4(1, 1, 1, 0.9) },
};

// ---------------------------------------------------------------- GLSL（顶点着色器公共部分）
const GLSL_COMMON = /* glsl */ `${QL_DEMO.wind ? '#define DYN_QLWIND\n' : ''}
uniform vec4 uDynWind; uniform vec4 uDynAir; uniform vec4 uDynAgents[4]; uniform vec4 uDynAgentY; uniform vec4 uDynTrail[6]; uniform vec4 uDynCam; uniform vec4 uDynMisc;
float dynH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// 阵风（约 42 米）+ 滚浪（约 11 米），随空气漂移顺风走；只调振幅
float dynVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dynH(i), dynH(i + vec2(1.0, 0.0)), f.x), mix(dynH(i + vec2(0.0, 1.0)), dynH(i + 1.0), f.x), f.y); }
float dynGust(vec2 p){
#ifdef DYN_QLWIND
  // 11-17g 同原野 field_flora：Demo gustAt，阵风图样顺风 3.2 m/s 推进，映射 0.3 + 1.6 g
  vec2 q = p - uDynAir.xy; vec2 wd = uDynWind.xy;
  float g = dynVn(q * 0.03) * 0.6 + dynVn(q * 0.11 + 7.0) * 0.4;
  float roll = sin(dot(p, wd) * 0.45 - uDynWind.w * 2.2 + dynVn(p * 0.06) * 5.0) * 0.5 + 0.5;
  return 0.3 + 1.6 * clamp(g * 0.8 + roll * g * 0.45 - 0.15, 0.0, 1.0);
#else
  vec2 q = p - uDynAir.xy;
  float big = 0.6 * sin(dot(q, vec2(0.80, 0.60)) * 0.1496) + 0.4 * sin(dot(q, vec2(-0.47, 0.88)) * 0.1210 + 1.7);
  float roll = sin(dot(q, vec2(0.71, 0.70)) * 0.5712 + 0.8 * sin(dot(q, vec2(-0.47, 0.88)) * 0.09));
  return clamp(1.0 + uDynAir.z * big + uDynAir.w * roll, 0.15, 1.9);
#endif
}
// 正在推：离角色越近越推开，方向 = 背离角色
vec2 dynPush(vec2 root){
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uDynAgents[i]; if (a.z <= 0.0) continue;
    vec2 d = root - a.xy; float L = length(d), R = clamp(a.z * 2.5, 1.5, 3.0);
    acc += d / max(L, 0.05) * (1.0 - smoothstep(R * 0.35, R, L)) * (0.55 + 0.45 * clamp(a.w / 4.0, 0.0, 1.0));
  }
  return acc * uDynMisc.y;
}
// 离开后的弹回：每个足迹一次冲量，闭式阻尼振荡（sin 起步为 0，不和「正在推」重复）
vec2 dynWobble(vec2 root, float om, float k){
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 s = uDynTrail[i]; if (s.w <= 0.0) continue;
    vec2 d = root - s.xy; float L = length(d);
    float w = (1.0 - smoothstep(0.6, 2.6, L)) * (1.0 - smoothstep(uDynMisc.w * 0.65, uDynMisc.w, s.z));
    acc -= d / max(L, 0.05) * w * s.w * exp(-k * s.z) * sin(om * s.z);
  }
  return acc * uDynMisc.z;
}
`;

/** 植物：世界空间弯曲（圆弧近似保长），整株按根部算相位 / 阵风 / 推开 */
const TW_DYN = { wind: 'uDynWind', cam: 'uDynCam', hash: 'dynH', gust: 'dynGust' };
const plantMain = (o: Required<PlantOpt>) => /* glsl */ `
{
  mat4 dM = modelMatrix;
  #ifdef USE_INSTANCING
    dM = modelMatrix * instanceMatrix;
  #endif
  vec3 dO = (dM * vec4(0.0, ${o.baseY.toFixed(4)}, 0.0, 1.0)).xyz;
  vec3 dW = (dM * vec4(transformed, 1.0)).xyz;
  float dSc = max(length(dM[1].xyz), 0.05);
  float hw = max(dW.y - dO.y, 0.0);
  ${o.merged ? 'vec2 dR = dW.xz; float dPh = dot(dW.xz, vec2(0.37, 0.21)); float dHs = 0.5;' : 'vec2 dR = dO.xz; float dHs = dynH(dO.xz); float dPh = 6.2832 * dynH(dO.xz + 7.13);'}
  float t = uDynWind.w, s = uDynWind.z * uDynMisc.x, g = dynGust(dR);
  float dRef = clamp(dSc * ${o.h0.toFixed(4)}, 0.2, 16.0);
  float om = 6.2832 * max(mix(0.15, 0.45, dHs) / sqrt(dRef), 0.06);
  vec2 dDir = uDynWind.xy, dPerp = vec2(-dDir.y, dDir.x);
  float lean = 0.55 * s * s * g;
  float o1 = (0.25 + 0.75 * g) * s * 0.45 * sin(om * t + dPh);
  float o2 = (0.25 + 0.75 * g) * s * 0.30 * sin(1.31 * om * t + dPh * 1.7);
  vec2 off = vec2(0.0);
  ${o.tree
    ? (o.wind ? treeWindGlsl(TW_DYN, { amp: o.amp, merged: o.merged, leaf: o.leaf }).off : '// 已有自带风摆')
    : `float bw = (hw / (hw + ${o.h0.toFixed(4)})) * (hw / (hw + ${o.h0.toFixed(4)})) * hw;
  ${o.wind ? `off = (dDir * (lean + o1) + dPerp * o2) * ${o.amp.toFixed(4)} * bw;` : '// 已有自带风摆：这里只加角色推开'}
  float hp = hw * hw / (1.0 + hw * hw * 0.5);   // 推开 ∝ 高度²（高处封顶）
  float oms = 6.2832 * clamp(1.4 / sqrt(dRef), 0.6, 3.0);
  off += (dynPush(dR) + 0.8 * dynWobble(dR, oms, 3.5)) * ${o.push.toFixed(4)} * hp;`}
  float offL = length(off), offM = 0.85 * hw;
  if (offL > offM) off *= offM / max(offL, 1e-5);
  vec3 wd = vec3(off.x, -(hw - sqrt(max(hw * hw - dot(off, off), 0.0))), off.y);
  ${o.tree && o.wind ? treeWindGlsl(TW_DYN, { amp: o.amp, merged: o.merged, leaf: o.leaf }).flutter : ''}
  transformed += inverse(mat3(dM)) * wd;
}`;

/** 吊挂物：挂点 = 局部原点（几何向下垂），整件绕挂点旋转；越往下越软（flex） */
const hangMain = (o: Required<HangOpt>) => /* glsl */ `
{
  mat4 dM = modelMatrix;
  #ifdef USE_INSTANCING
    dM = modelMatrix * instanceMatrix;
  #endif
  vec3 dP = dM[3].xyz;
  vec3 dW = (dM * vec4(transformed, 1.0)).xyz;
  float dLen = max(uDynLen * length(dM[1].xyz), 0.05);
  float t = uDynWind.w, s = uDynWind.z * uDynMisc.x;
  float h1 = dynH(dP.xz), h2 = dynH(dP.xz + 17.31);
  float om = 6.2832 * clamp(0.5 / sqrt(dLen), 0.15, 0.6) * (0.92 + 0.16 * h1), ph = 6.2832 * h2;
  float g = dynGust(dP.xz + uDynWind.xy * 5.5);   // 顺风 5.5 米取样 ≈ 半秒滞后
  float kl = clamp(sqrt(3.0 / dLen), 0.15, 1.0);
  float a1 = (0.012 * min(uDynMisc.x, 1.0) + 0.07 * s * (0.4 + 0.6 * g)) * kl * ${o.amp.toFixed(4)};
  float lean = 0.10 * s * s * g * kl * ${o.amp.toFixed(4)};
  vec2 tilt = uDynWind.xy * (lean + a1 * sin(om * t + ph)) + vec2(-uDynWind.y, uDynWind.x) * (a1 * 0.6 * sin(1.31 * om * t + ph * 1.7));
  float bot = dP.y - dLen;
  vec2 bump = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uDynAgents[i]; if (a.z <= 0.0) continue;
    float ay = uDynAgentY[i];
    float reach = (1.0 - smoothstep(0.0, 0.6, bot - (ay + 2.0))) * (1.0 - smoothstep(0.0, 0.6, ay - dP.y));
    vec2 d = dP.xz - a.xy; float L = length(d), R = max(a.z * 1.6, 1.2) + 0.4;
    bump += d / max(L, 0.05) * (1.0 - smoothstep(R * 0.4, R, L)) * reach * 0.30 * (0.35 + 0.65 * clamp(a.w / 4.0, 0.0, 1.0));
  }
  bump *= uDynMisc.y;
  { float ay = uDynAgentY.x, reach = (1.0 - smoothstep(0.0, 0.6, bot - (ay + 2.0))) * (1.0 - smoothstep(0.0, 0.6, ay - dP.y));
    vec2 wb = vec2(0.0);
    for (int i = 0; i < 6; i++) {
      vec4 st = uDynTrail[i]; if (st.w <= 0.0) continue;
      vec2 d = dP.xz - st.xy; float L = length(d);
      float w = (1.0 - smoothstep(0.8, 2.4, L)) * (1.0 - smoothstep(uDynMisc.w * 0.65, uDynMisc.w, st.z));
      wb -= d / max(L, 0.05) * w * st.w * exp(-1.4 * st.z) * sin(om * st.z);
    }
    bump += wb * reach * 0.30 * uDynMisc.z; }
  tilt += bump * ${o.amp.toFixed(4)};
  float ang = length(tilt);
  vec3 wd = vec3(0.0);
  if (ang > 1e-5) {
    vec3 k = vec3(-tilt.y, 0.0, tilt.x) / ang;   // 绕 k 转 ang：正下方转向 tilt 方向
    vec3 v = dW - dP;
    float an = ang * (1.0 + ${o.flex.toFixed(4)} * clamp((dP.y - dW.y) / dLen, 0.0, 1.2));
    vec3 vr = v * cos(an) + cross(k, v) * sin(an) + k * dot(k, v) * (1.0 - cos(an));
    wd = vr - v;
  }
  transformed += inverse(mat3(dM)) * wd;
}`;

/** 旗面：局部 x 从固定边（uDynCloth.x）到自由边（宽 uDynCloth.y），沿 x 传波，法线方向（局部 z）摆 */
const clothMain = (o: Required<ClothOpt>) => /* glsl */ `
{
  mat4 dM = modelMatrix;
  #ifdef USE_INSTANCING
    dM = modelMatrix * instanceMatrix;
  #endif
  vec3 dP = dM[3].xyz;
  float u = clamp((transformed.x - uDynCloth.x) / max(uDynCloth.y, 0.01), 0.0, 1.0);
  float t = uDynWind.w, s = uDynWind.z * uDynMisc.x, g = dynGust(dP.xz);
  float h1 = dynH(dP.xz), om = 6.2832 * (1.1 + 0.6 * h1), ph = 6.2832 * dynH(dP.xz + 3.7);
  float A = ${o.amp.toFixed(4)} * (0.15 * min(uDynMisc.x, 1.0) + 0.85 * s * g);
  transformed.z += A * u * (0.8 * sin(om * t - 5.0 * u - 1.6 * transformed.y + ph) + 0.2 * sin(1.31 * om * t - 9.0 * u + ph * 2.1));
}`;

// ---------------------------------------------------------------- 补丁
export interface PlantOpt { amp?: number; h0?: number; push?: number; baseY?: number; wind?: boolean; tree?: boolean; merged?: boolean; leaf?: boolean }
export interface HangOpt { len?: number; amp?: number; flex?: number }
export interface ClothOpt { amp?: number; pinX?: number; width?: number }
type Spec = { kind: 'plant'; o: Required<PlantOpt> } | { kind: 'hang'; o: Required<HangOpt> } | { kind: 'cloth'; o: Required<ClothOpt> };
interface DynState { spec: Spec; local: Record<string, THREE.IUniform>; prevOBC: THREE.Material['onBeforeCompile']; prevKey: () => string }
const STATE = new WeakMap<THREE.Material, DynState>();
export const dynStats = { plant: 0, hang: 0, cloth: 0, depth: 0, hangGroups: 0, applies: 0, lastMap: '', missing: 0 };

function patch(m: THREE.Material, spec: Spec, local: Record<string, THREE.IUniform>) {
  if (STATE.has(m)) return m;
  const prevOBC = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  STATE.set(m, { spec, local, prevOBC, prevKey });
  const decl = spec.kind === 'hang' ? 'uniform float uDynLen;\n' : spec.kind === 'cloth' ? 'uniform vec2 uDynCloth;\n' : '';
  const body = spec.kind === 'plant' ? plantMain(spec.o) : spec.kind === 'hang' ? hangMain(spec.o) : clothMain(spec.o);
  m.onBeforeCompile = (sh, r) => {
    prevOBC.call(m, sh, r);
    Object.assign(sh.uniforms, DYN_U, local);
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + GLSL_COMMON + decl, 'dyn.common');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\n' + body, 'dyn.begin_vertex.' + spec.kind);
  };
  const key = '|dyn' + spec.kind + JSON.stringify(spec.o);
  m.customProgramCacheKey = () => prevKey() + key;
  m.needsUpdate = true;
  dynStats[spec.kind]++;
  return m;
}
const fill = <T extends object>(o: Partial<T> | undefined, d: T): T => ({ ...d, ...(o ?? {}) });
/** 草 / 灌木 / 海草 / 芦苇 / 花 / 树。amp：风摆倍率；h0：典型高度（米，决定弯曲曲线和频率）；push：被角色推开的幅度（米）；
 *  baseY：根部在几何局部的 y；wind:false = 材质已有自带风摆，只加推开；tree：树（树干倾斜 + 近处叶颤，不被推）；merged：多株合并的网格（逐顶点取根） */
export function dynPlant(mat: THREE.Material, o?: PlantOpt) {
  return patch(mat, { kind: 'plant', o: fill<Required<PlantOpt>>(o, { amp: 1, h0: 0.5, push: 0.6, baseY: 0, wind: true, tree: false, merged: false, leaf: false }) }, {});
}
/** 吊挂物（灯 / 链 / 绳 / 挂布）：几何局部 y = 0 是挂点、向下垂；len = 垂下长度（几何单位，乘物体缩放）；flex：越往下多摆的比例（0 = 刚体） */
export function dynHang(mat: THREE.Material, o?: HangOpt) {
  const f = fill<Required<HangOpt>>(o, { len: 1, amp: 1, flex: 0.4 });
  return patch(mat, { kind: 'hang', o: { ...f, len: 0 } }, { uDynLen: { value: f.len } });   // 长度走材质自己的 uniform：不同长度共用一个着色器程序
}
/** 旗 / 横幅：pinX = 固定边的局部 x，width = 旗宽 */
export function dynCloth(mat: THREE.Material, o?: ClothOpt) {
  const f = fill<Required<ClothOpt>>(o, { amp: 0.12, pinX: -0.5, width: 1 });
  return patch(mat, { kind: 'cloth', o: { amp: f.amp, pinX: 0, width: 0 } }, { uDynCloth: { value: new THREE.Vector2(f.pinX, f.width) } });
}
/** 同一补丁的阴影深度材质（方向光 / 聚光阴影；共享该材质的 uniform 对象） */
export function dynDepth(mat: THREE.Material): THREE.MeshDepthMaterial | null {
  const st = STATE.get(mat); if (!st) return null;
  const src = mat as THREE.MeshStandardMaterial;
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: src.side });
  if (src.alphaTest > 0 && src.map) { d.map = src.map; d.alphaTest = src.alphaTest; }
  patch(d, st.spec, st.local); dynStats[st.spec.kind]--; dynStats.depth++;
  return d;
}
/** 克隆材质但保留它原来的 onBeforeCompile / 程序键（Material.clone 不复制这两个）；已打过 dyn 补丁的取补丁前的版本 */
function cloneMat(m: THREE.Material): THREE.Material {
  const st = STATE.get(m), c = m.clone();
  c.onBeforeCompile = st ? st.prevOBC : m.onBeforeCompile;
  c.customProgramCacheKey = st ? st.prevKey : m.customProgramCacheKey.bind(m);
  return c;
}

// ---------------------------------------------------------------- JS 镜像（CPU 吊灯 / 点光源跟着摆；数值哈希与 GPU 不逐位相同，模型 / 频率 / 阵风一致）
const fract = (x: number) => x - Math.floor(x);
const hashJ = (x: number, z: number) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const vnJ = (x: number, z: number) => { const i = Math.floor(x), j = Math.floor(z); let u = x - i, v = z - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hashJ(i, j), b = hashJ(i + 1, j), c = hashJ(i, j + 1), d = hashJ(i + 1, j + 1); return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v; };
export function dynGustAt(x: number, z: number): number {
  const A = DYN_U.uDynAir.value, qx = x - A.x, qz = z - A.y;
  if (QL_DEMO.wind) {   // 11-17g 与 GLSL DYN_QLWIND 同式
    const W = DYN_U.uDynWind.value, g = vnJ(qx * 0.03, qz * 0.03) * 0.6 + vnJ(qx * 0.11 + 7, qz * 0.11 + 7) * 0.4;
    const roll = Math.sin((x * W.x + z * W.y) * 0.45 - W.w * 2.2 + vnJ(x * 0.06, z * 0.06) * 5) * 0.5 + 0.5;
    return 0.3 + 1.6 * Math.min(1, Math.max(0, g * 0.8 + roll * g * 0.45 - 0.15));
  }
  const big = 0.6 * Math.sin((qx * 0.8 + qz * 0.6) * 0.1496) + 0.4 * Math.sin((-qx * 0.47 + qz * 0.88) * 0.121 + 1.7);
  const roll = Math.sin((qx * 0.71 + qz * 0.7) * 0.5712 + 0.8 * Math.sin((-qx * 0.47 + qz * 0.88) * 0.09));
  return Math.min(1.9, Math.max(0.15, 1 + A.z * big + A.w * roll));
}
/** 吊挂物在 (x, y, z) 挂点、垂下 len 米时的倾斜向量：方向 = 下端被推向的水平方向，长度 = 角度（弧度）。与 hangMain 同一套公式 */
export function dynHangAngle(x: number, z: number, t = dynTime(), y = 0, len = 1, amp = 1): { x: number; z: number; ang: number } {
  const W = DYN_U.uDynWind.value, Mi = DYN_U.uDynMisc.value, s = W.z * Mi.x;
  const L = Math.max(len, 0.05), h1 = hashJ(x, z), h2 = hashJ(x + 17.31, z + 17.31);
  const om = 6.2832 * Math.min(0.6, Math.max(0.15, 0.5 / Math.sqrt(L))) * (0.92 + 0.16 * h1), ph = 6.2832 * h2;
  const g = dynGustAt(x + W.x * 5.5, z + W.y * 5.5), kl = Math.min(1, Math.max(0.15, Math.sqrt(3 / L)));
  const a1 = (0.012 * Math.min(Mi.x, 1) + 0.07 * s * (0.4 + 0.6 * g)) * kl * amp, lean = 0.1 * s * s * g * kl * amp;
  const c1 = lean + a1 * Math.sin(om * t + ph), c2 = a1 * 0.6 * Math.sin(1.31 * om * t + ph * 1.7);
  let tx = W.x * c1 - W.y * c2, tz = W.y * c1 + W.x * c2;
  const bot = y - L, AY = DYN_U.uDynAgentY.value, ays = [AY.x, AY.y, AY.z, AY.w];
  const reachOf = (ay: number) => (1 - ss(0, 0.6, bot - (ay + 2))) * (1 - ss(0, 0.6, ay - y));
  let bx = 0, bz = 0;
  DYN_U.uDynAgents.value.forEach((a, i) => {
    if (a.z <= 0) return; const dx = x - a.x, dz = z - a.y, d = Math.hypot(dx, dz), R = Math.max(a.z * 1.6, 1.2) + 0.4;
    const w = (1 - ss(R * 0.4, R, d)) * reachOf(ays[i]) * 0.3 * (0.35 + 0.65 * Math.min(1, Math.max(0, a.w / 4))) / Math.max(d, 0.05);
    bx += dx * w; bz += dz * w;
  });
  bx *= Mi.y; bz *= Mi.y;
  const r0 = reachOf(AY.x);
  for (const st of DYN_U.uDynTrail.value) {
    if (st.w <= 0) continue; const dx = x - st.x, dz = z - st.y, d = Math.hypot(dx, dz);
    const w = (1 - ss(0.8, 2.4, d)) * (1 - ss(Mi.w * 0.65, Mi.w, st.z)) * st.w * Math.exp(-1.4 * st.z) * Math.sin(om * st.z) * r0 * 0.3 * Mi.z / Math.max(d, 0.05);
    bx -= dx * w; bz -= dz * w;
  }
  tx += bx * amp; tz += bz * amp;
  return { x: tx, z: tz, ang: Math.hypot(tx, tz) };
}
const _ax = new THREE.Vector3();
/** 同上，直接给世界空间旋转（四元数）：q 作用在「挂点 → 物体」的向量上 */
export function dynHangQuat(q: THREE.Quaternion, x: number, y: number, z: number, len = 1, amp = 1): THREE.Quaternion {
  const a = dynHangAngle(x, z, dynTime(), y, len, amp);
  if (a.ang < 1e-6) return q.identity();
  return q.setFromAxisAngle(_ax.set(-a.z / a.ang, 0, a.x / a.ang), a.ang);
}

// ---------------------------------------------------------------- 自动套用（地图建好后遍历）
const PLANT_RE = /kelp|seaweed|grass|reed|flower|weed|bush|fern|shrub|tree|海草|草|花|树/i;
const CLOTH_RE = /banner|flag|pennant|旗/i;
const NOT_PLANT_RE = /ground|floor|terrain|tile|road|path|地面/i;
type MeshLike = THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
const isMesh = (o: THREE.Object3D): o is MeshLike => (o as THREE.Mesh).isMesh === true && !(o as MeshLike).isSkinnedMesh;
const mats = (m: MeshLike): THREE.Material[] => Array.isArray(m.material) ? m.material : [m.material];
const builtIn = (m: THREE.Material) => !(m as THREE.ShaderMaterial).isShaderMaterial && !(m as THREE.RawShaderMaterial).isRawShaderMaterial && !(m as THREE.PointsMaterial).isPointsMaterial;
/** 材质已有自带风摆（cineWind / 海岸 windPatch / 海底 swayPatch）：只加推开，不叠第二层风 */
function hasWind(m: THREE.Material): boolean {
  if (m.userData?.cineWind) return true;
  try { const k = m.customProgramCacheKey(); return k.length < 240 && /cwind|seaSway|\|cw/.test(k); } catch { return false; }   // 只认显式短键（默认键是函数源码，可能误中）
}
function plantKind(name: string): PlantOpt {
  const n = name.toLowerCase();
  if (/tree|树/.test(n)) return { tree: true, amp: 0.05, h0: 8 };
  if (/bush|shrub|fern/.test(n)) return { amp: 0.35, h0: 0.8, push: 0.35 };
  if (/kelp|seaweed|weed|海草/.test(n)) return { amp: 0.9, h0: 0.6, push: 0.6 };
  if (/reed|flower|花/.test(n)) return { amp: 0.8, h0: 0.5, push: 0.5 };
  return { amp: 1, h0: 0.4, push: 0.7 };   // 草
}
/** 量化 / 交错的顶点属性（GLB 的 KHR_mesh_quantization、meshopt）转成普通 Float32：烘变换和吊挂着色器在 Int16 归一化坐标上会拉出长条（11-14 样片实测） */
function toF32(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) {
    const at = g.attributes[k] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    if (!(at as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && at.array instanceof Float32Array && !at.normalized) continue;
    const n = at.count, sz = at.itemSize, arr = new Float32Array(n * sz);
    for (let i = 0; i < n; i++) for (let j = 0; j < sz; j++) arr[i * sz + j] = at.getComponent(i, j);
    g.setAttribute(k, new THREE.BufferAttribute(arr, sz));
  }
  return g;
}
function geoBox(g: THREE.BufferGeometry): THREE.Box3 { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox!; }
function setDepth(mesh: MeshLike, m: THREE.Material) { if (!mesh.castShadow || mesh.customDepthMaterial) return; const d = dynDepth(m); if (d) mesh.customDepthMaterial = d; }

/** 吊挂组：把子网格的相对变换烘进几何（克隆），子网格直接挂在组下、变换归零 → 每个网格的局部原点 = 挂点，
 *  同一件吊挂物所有材质共用一个相位（相位从 modelMatrix[3].xz 取）。材质按组克隆（共享材质不会让别处跟着摆） */
function applyHang(g: THREE.Object3D) {
  const raw = g.userData.dynHang, o: HangOpt = raw && typeof raw === 'object' ? raw as HangOpt : {};
  const flexDef = o.flex ?? 0.4;
  if (g.userData.dynHangDone) {   // 补套用：材质被别的代码（异步 PBR 细节层等）换掉了 → 按记下的长度重新打补丁
    const len = g.userData.dynHangLen as number | undefined; if (!len) return;
    g.traverse(c => { if (!isMesh(c)) return; const ms = mats(c); if (ms.every(m => STATE.has(m))) return;
      const sw = (m: THREE.Material) => STATE.has(m) || !builtIn(m) ? m : dynHang(cloneMat(m), { ...o, len, flex: flexDef });
      c.material = Array.isArray(c.material) ? c.material.map(sw) : sw(c.material); c.customDepthMaterial = undefined; mats(c).forEach(x => setDepth(c, x)); });
    return;
  }
  g.userData.dynHangDone = true;
  if (isMesh(g)) {   // 单个网格 / 实例化（如井壁垂链）：几何本来就从原点向下
    g.geometry = toF32(g.geometry.clone());
    const box = geoBox(g.geometry), len = o.len ?? Math.max(0.05, -box.min.y); g.userData.dynHangLen = len;
    const sw1 = (m: THREE.Material) => builtIn(m) ? dynHang(cloneMat(m), { ...o, len, flex: flexDef }) : m;
    g.material = Array.isArray(g.material) ? g.material.map(sw1) : sw1(g.material);
    mats(g).forEach(m => setDepth(g, m)); dynStats.hangGroups++; return;
  }
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), list: MeshLike[] = [];
  g.traverse(c => { if (c !== g && isMesh(c) && !c.isInstancedMesh) list.push(c); });
  if (!list.length) return;
  let minY = 0; const rel = new THREE.Matrix4();
  for (const m of list) {
    rel.multiplyMatrices(inv, m.matrixWorld);
    const geo = toF32(m.geometry.clone()); geo.applyMatrix4(rel); geo.computeBoundingBox(); minY = Math.min(minY, geo.boundingBox!.min.y);
    m.geometry = geo; g.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.updateMatrix();
    m.userData.dynDone = true;
  }
  const len = o.len ?? Math.max(0.05, -minY), cache = new Map<THREE.Material, THREE.Material>(); g.userData.dynHangLen = len;
  const sw = (m: THREE.Material) => { if (!builtIn(m)) return m; let c = cache.get(m); if (!c) { c = dynHang(cloneMat(m), { ...o, len, flex: flexDef }); cache.set(m, c); } return c; };
  for (const m of list) { m.material = Array.isArray(m.material) ? m.material.map(sw) : sw(m.material); mats(m).forEach(x => setDepth(m, x)); }
  g.updateMatrixWorld(true); dynStats.hangGroups++;
}
/** 11-17 叶片材质（叶颤只加在这类上）：镂空 / 半透明 / 名字带叶 */
const leafy = (m: THREE.Material) => (m as THREE.MeshStandardMaterial).alphaTest > 0 || m.transparent || /leaf|leaves|foliage|canopy|叶/i.test(m.name);
function applyPlant(mesh: MeshLike, o: PlantOpt) {
  const baseY = o.baseY ?? geoBox(mesh.geometry).min.y;
  for (const m of mats(mesh)) { if (!builtIn(m) || STATE.has(m)) continue; dynPlant(m, { ...o, baseY, wind: o.wind ?? !hasWind(m), leaf: o.leaf ?? leafy(m) }); setDepth(mesh, m); }
  mesh.userData.dynDone = true;
}
function applyCloth(mesh: MeshLike, o: ClothOpt) {
  const b = geoBox(mesh.geometry);
  for (const m of mats(mesh)) { if (!builtIn(m) || STATE.has(m)) continue; dynCloth(m, { pinX: b.min.x, width: Math.max(0.05, b.max.x - b.min.x), ...o }); setDepth(mesh, m); }
  mesh.userData.dynDone = true;
}
/** 遍历一张地图（或一件刚放进地图的物体），按标记 / 名字自动套补丁；可重复调用（已处理的跳过）。
 *  显式标记优先：userData.dynHang（true 或 {len, amp, flex}）、userData.dynPlant（true 或 PlantOpt）、userData.dynCloth、userData.dynSkip */
export function dynApply(root: THREE.Object3D, mapId = ''): number {
  const hangs: THREE.Object3D[] = [], meshes: MeshLike[] = [];
  const skip = new Set<THREE.Object3D>();
  root.traverse(o => {
    if (o.userData.dynSkip) { o.traverse(c => skip.add(c)); return; }
    if (o.userData.dynHang && !skip.has(o)) { hangs.push(o); o.traverse(c => skip.add(c)); }
  });
  root.traverse(o => { if (!skip.has(o) && isMesh(o) && !o.userData.dynDone) meshes.push(o); });
  let n = 0;
  for (const h of hangs) { applyHang(h); n++; }
  for (const m of meshes) {
    const nm = `${m.name} ${m.parent?.name ?? ''}`, ud = m.userData;
    if (ud.dynCloth || m.name === 'cloth' || CLOTH_RE.test(m.name)) { applyCloth(m, typeof ud.dynCloth === 'object' ? ud.dynCloth as ClothOpt : m.name === 'cloth' ? { amp: 0.08 } : {}); n++; continue; }
    if (ud.dynPlant) { applyPlant(m, { ...plantKind(nm), ...(typeof ud.dynPlant === 'object' ? ud.dynPlant as PlantOpt : {}) }); n++; continue; }
    if ((PLANT_RE.test(nm) && !NOT_PLANT_RE.test(nm)) || mats(m).some(hasWind)) { applyPlant(m, { ...plantKind(nm), merged: !m.isInstancedMesh && m.geometry.attributes.position.count > 4000 }); n++; }
  }
  dynStats.applies++; dynStats.lastMap = mapId;
  return n;
}
/** 包野外的 build(api) 外面套一层：api.add 放进去的每件物体在 build 结束后 dynApply（不依赖调试全局） */
export function dynWrapBuild(w: { id: string; build?: (api: WildBuildApi) => void }) {
  const b = w.build; if (!b || (b as unknown as { dynWrapped?: boolean }).dynWrapped) return;
  const nb = (api: WildBuildApi) => {
    const added: THREE.Object3D[] = []; let done = false;
    const later = (o: THREE.Object3D) => { try { dynApply(o, w.id); } catch (e) { console.error('dyn_world 套用出错', e); } };
    b({ ...api, add: (o: unknown, lx: number, lz: number, ry?: number) => {
      const r = api.add(o, lx, lz, ry);
      if (o && (o as THREE.Object3D).isObject3D) { if (done) later(o as THREE.Object3D); else added.push(o as THREE.Object3D); }   // build 之后异步放进来的（GLB 晚到）当场套
      return r; } });
    done = true; for (const o of added) later(o);
  };
  (nb as unknown as { dynWrapped?: boolean }).dynWrapped = true; w.build = nb;
}

// ---------------------------------------------------------------- 每帧
type Unit_ = { pos?: THREE.Vector3; alive?: boolean; rig?: { root?: THREE.Object3D } };
type G_ = { scene?: THREE.Scene; camera?: THREE.Camera; player?: Unit_; enemies?: Unit_[]; npcs?: Unit_[] };
/** 各图基础风：强度、风向（弧度，0 = +x） */
const MAP_WIND: Record<string, { s: number; h: number }> = {
  dlc1_coast: { s: 0.55, h: 2.2 }, dlc1_mirror: { s: 0.3, h: 1.1 }, dlc1_belltower: { s: 0.7, h: -0.6 }, dlc1_forge: { s: 0.25, h: 0.4 }, dlc1_well: { s: 0.35, h: 3.0 },
};
let mapIds = new Set<string>(Object.keys(MAP_WIND));
let curMap = '', T = 0, sinceEnter = 0, applyIdx = 0, strength = 0.5, hint = -1, hintAge = 99, force: number | null = null;
const APPLY_AT = [0.3, 1.5, 5, 12];
const pl = { x: 0, z: 0, y: 0, spd: 0, ok: false };
let trailClock = 0;
const trail: { x: number; z: number; age: number; k: number }[] = [];
const lastPos = new WeakMap<object, { x: number; z: number; t: number }>();
let picked: Unit_[] = [], pickClock = 0;
export const dynTime = () => T;
/** 登记 DLC 地图 id（manifest 传 wild id 列表） */
export function dynSetMaps(ids: string[]) { mapIds = new Set([...Object.keys(MAP_WIND), ...ids]); }
/** 场景代码（如海岸风暴）给风强度提示（每帧调用；1 秒没再调就回到地图基础值） */
export function dynWindHint(s: number) { hint = s; hintAge = 0; }

export function dynWorldUpdate(dt: number, ctx: PackCtx | null) {
  dt = Math.min(Math.max(dt, 0), 0.1);
  const map = ctx?.map() ?? '', on = mapIds.has(map), G = (globalThis as unknown as { __game?: G_ }).__game;
  const U = DYN_U, W = U.uDynWind.value, Mi = U.uDynMisc.value, Air = U.uDynAir.value;
  if (map !== curMap) {   // 进新图：时间 / 空气 / 足迹归零（换图时看不到跳变），安排几次补套用（GLB 场景件异步加载）
    curMap = map; T = 0; sinceEnter = 0; applyIdx = 0; Air.x = Air.y = 0; trail.length = 0; picked = [];
    const b = MAP_WIND[map]; strength = b?.s ?? 0.4;
  }
  if (!on) { Mi.x = 0; Mi.y = Mi.z = 0; return; }
  T += dt; sinceEnter += dt; hintAge += dt;
  if (applyIdx < APPLY_AT.length && sinceEnter >= APPLY_AT[applyIdx]) {
    applyIdx++;
    const grp = G?.scene?.getObjectByName(`wild_${map}`);
    if (grp) { try { dynApply(grp, map); } catch (e) { console.error('dyn_world 套用出错', e); } } else dynStats.missing++;
  }
  // 画质：低 = 只有风、半幅；中 = 风 + 玩家；高 / 超高 = 全部 + 近处叶颤
  const q = curQuality, low = q === 'low', mid = q === 'medium';
  const base = MAP_WIND[map] ?? { s: 0.4, h: 0.8 };
  const target = force ?? (hintAge < 1 && hint >= 0 ? hint : base.s);
  strength += (target - strength) * Math.min(1, dt * (force !== null ? 8 : 0.6));
  // 11-17g 专长包 v8 风场（?off=qlwind）：风向固定 (0.894, 0.447)、阵风图样顺风 3.2 m/s；各图风力（MAP_WIND）保留——海底 / 镜渊城不该和地面一样大风
  const qw = QL_DEMO.wind && !String(map).startsWith('dlc1_mirror');
  const head = qw ? Math.atan2(0.447, 0.894) : base.h + 0.35 * Math.sin(T * 0.013) + 0.2 * Math.sin(T * 0.031 + 1.3);   // 风向缓慢偏转（只改方向，不改频率）
  W.set(Math.cos(head), Math.sin(head), strength, T);
  const adv = qw ? 3.2 : 2.2 + 3 * strength;
  Air.x += W.x * adv * dt; Air.y += W.y * adv * dt;   // 阵风随风漂移
  Mi.set((low ? 0.5 : 1) * (CFX2[0] > 0.5 ? 1 : 0), low ? 0 : 1, low ? 0 : 1, 0.9);
  const cam = G?.camera; U.uDynCam.value.set(cam?.position.x ?? 0, cam?.position.y ?? 0, cam?.position.z ?? 0, low || mid ? 0 : 1);
  // 玩家
  const A = U.uDynAgents.value, AY = U.uDynAgentY.value;
  const p = ctx!.playerPos(), py = G?.player?.pos?.y ?? 0;
  if (pl.ok && dt > 0) { const v = Math.hypot(p.x - pl.x, p.z - pl.z) / dt; pl.spd += (Math.min(v, 20) - pl.spd) * Math.min(1, dt * 10); }
  pl.x = p.x; pl.z = p.z; pl.y = py; pl.ok = true;
  for (const a of A) a.set(0, 0, 0, 0);
  if (!low) { A[0].set(pl.x, pl.z, 0.6, pl.spd); AY.x = pl.y; }
  // 最近 3 个在动的怪 / NPC（25 米内，每 0.2 秒挑一次；只在高 / 超高）
  if (!low && !mid && G) {
    pickClock -= dt;
    if (pickClock <= 0) {
      pickClock = 0.2; const cand: { u: Unit_; d: number }[] = [];
      for (const u of [...(G.enemies ?? []), ...(G.npcs ?? [])]) {
        const pos = u.pos ?? u.rig?.root?.position; if (!pos || u.alive === false) continue;
        const d = Math.hypot(pos.x - pl.x, pos.z - pl.z); if (d > 25) continue;
        const lp = lastPos.get(u); lastPos.set(u, { x: pos.x, z: pos.z, t: T });
        const v = lp && T > lp.t ? Math.hypot(pos.x - lp.x, pos.z - lp.z) / (T - lp.t) : 0;
        if (v > 0.3) cand.push({ u, d });
      }
      picked = cand.sort((a, b) => a.d - b.d).slice(0, 3).map(c => c.u);
    }
    picked.forEach((u, i) => {
      const pos = u.pos ?? u.rig?.root?.position; if (!pos) return;
      const lp = lastPos.get(u), v = lp && T > lp.t ? Math.hypot(pos.x - lp.x, pos.z - lp.z) / (T - lp.t) : 2;
      const sc = u.rig?.root?.scale.x ?? 1;
      A[i + 1].set(pos.x, pos.z, Math.min(1.5, 0.6 * sc), Math.min(v, 12));
      if (i === 0) AY.y = pos.y; else if (i === 1) AY.z = pos.y; else AY.w = pos.y;
    });
  }
  // 足迹：每 0.15 秒记一次（只在走动时有冲量）
  for (const s of trail) s.age += dt;
  while (trail.length && trail[0].age > 0.9) trail.shift();
  trailClock -= dt;
  if (!low && trailClock <= 0) { trailClock = 0.15; trail.push({ x: pl.x, z: pl.z, age: 0, k: pl.spd > 0.3 ? Math.min(1, pl.spd / 5) : 0 }); while (trail.length > 6) trail.shift(); }
  const TR = U.uDynTrail.value;
  for (let i = 0; i < 6; i++) { const s = trail[i]; if (s && !low) TR[i].set(s.x, s.z, s.age, s.k); else TR[i].set(0, 0, 0, 0); }
}

/** 调试 / 截图自查：__dlc1.dyn */
export const dynDebug = {
  /** 强制风强度（0..1.5；null = 恢复地图默认） */
  setWind: (s: number | null) => { force = s; return s; },
  /** 读当前 uniform（纯数值） */
  uniforms: () => ({ wind: DYN_U.uDynWind.value.toArray(), air: DYN_U.uDynAir.value.toArray(), misc: DYN_U.uDynMisc.value.toArray(), cam: DYN_U.uDynCam.value.toArray(),
    agents: DYN_U.uDynAgents.value.map(v => v.toArray()), agentY: DYN_U.uDynAgentY.value.toArray(), trail: DYN_U.uDynTrail.value.map(v => v.toArray()) }),
  stats: () => ({ ...dynStats, map: curMap, t: T, strength, quality: curQuality }),
  /** 手动再套一遍当前地图（或传入物体） */
  apply: (o?: THREE.Object3D) => { const G = (globalThis as unknown as { __game?: G_ }).__game; const r = o ?? G?.scene?.getObjectByName(`wild_${curMap}`); return r ? dynApply(r, curMap) : -1; },
  hangAngle: (x: number, z: number, y = 0, len = 1) => dynHangAngle(x, z, T, y, len),
};
