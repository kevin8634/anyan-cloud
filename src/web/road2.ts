// ======================================================================
// 11-16e 魔兽式主路（Rhett 11-16：主路不规则，类似魔兽的主路；渲染稳定，别变黑）
//   · 只改画面：寻路、碰撞、门的位置、数据层的 pathDist 都不动。
//   · 路面遮罩烘焙成一张贴图（0.5 米 / 像素，局部坐标）：
//       R = 路权重（蜿蜒中心线 + 沿途变宽 2.4–5.2 米 + 草地咬进来的碎边，绕开树和石头等障碍）
//       G = 车辙（两道，离中心 ±0.6 米，断断续续）   B = 积水小洼   A = 到路边的距离（给草木避让）
//   · 地形着色器按像素读遮罩，混 GPT 土路 / 碎石 / 泥地贴图（中 / 高档；低档用原土路贴图，只换形状）。
//   · 防黑：贴图解码前 uRdOn = 0；颜色只做乘法和 mix，结果 clamp 到 [0, 1.5]；遮罩之外原样不动。
//   · ?off=road2（或 localStorage darkrock_cine_off 含 road2）整体回旧路。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { FOREST_DATA } from './forest_tex_data';

type P2 = [number, number];
type Circ = { x: number; z: number; r: number };

let offC: boolean | null = null;
function offHas(name: string): boolean {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return `${q},${ls}`.split(',').map(x => x.trim()).includes(name);
  } catch { return false; }
}
export function road2On(): boolean { if (offC === null) offC = offHas('road2'); return !offC; }
/** GPT 路面贴图：中档以上 */
export function road2TexOn(): boolean { return road2On() && curQuality !== 'low'; }

// ---------------------------------------------------------------- 噪声（确定性，和浏览器 / 模拟无关，只用于画面）
const h2 = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vn(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const fbm = (x: number, z: number) => vn(x, z) * 0.55 + vn(x * 2.03 + 5.1, z * 2.03 + 1.7) * 0.3 + vn(x * 4.1 + 9.3, z * 4.1 + 3.1) * 0.15;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface RoadMask {
  /** 遮罩贴图（RGBA8） */
  tex: THREE.DataTexture;
  /** 局部坐标范围 [x0, z0, 宽, 高]；着色器里用世界坐标，需加 origin */
  area: [number, number, number, number];
  origin: P2;
  /** 局部坐标的路权重 0–1 */
  w(lx: number, lz: number): number;
  /** 局部坐标的「等效中心线距离」= 到路边距离 + 1.6（旧路半宽），可直接替换旧 pathDist 做避让 */
  pd(lx: number, lz: number): number;
  /** 局部坐标的车辙 / 积水 */
  rut(lx: number, lz: number): number;
}

export interface RoadOpt {
  seed?: number;
  /** 蜿蜒幅度（米） */
  warp?: number;
  /** 半宽范围（米） */
  halfW?: [number, number];
  /** 路要绕开的障碍（树干、石头、建筑），局部坐标 */
  avoid?: Circ[];
  /** 车辙强度 0–1（荒原 / 雪地可小一点） */
  ruts?: number;
  /** 积水 0–1（赤砂、烬落 = 0） */
  puddles?: number;
  /** 不要蜿蜒的点（门、营地入口）：附近蜿蜒淡出 */
  pins?: P2[];
}

const RES = 0.5;
/** 烘焙主路遮罩。paths 为局部坐标折线，area = [x0, z0, x1, z1]（局部），origin = 世界偏移 */
export function bakeRoad(paths: P2[][], area: [number, number, number, number], origin: P2, o: RoadOpt = {}): RoadMask {
  const seed = (o.seed ?? 1) * 17.3, warp = o.warp ?? 2.2, [hw0, hw1] = o.halfW ?? [1.2, 2.6], ruts = o.ruts ?? 0.8, pud = o.puddles ?? 0.5;
  const avoid = o.avoid ?? [];
  const pins: P2[] = [...(o.pins ?? [])];
  for (const pl of paths) { pins.push(pl[0]); pins.push(pl[pl.length - 1]); }
  const [x0, z0, x1, z1] = area, W = Math.ceil((x1 - x0) / RES), H = Math.ceil((z1 - z0) / RES);
  const data = new Uint8Array(W * H * 4);
  const wArr = new Float32Array(W * H), eArr = new Float32Array(W * H), rArr = new Float32Array(W * H);
  // 线段表 + 包围盒（加速：只算附近的线段）
  const segs: { ax: number; az: number; bx: number; bz: number; L: number; s0: number }[] = [];
  for (const pl of paths) { let acc = 0; for (let i = 0; i < pl.length - 1; i++) { const a = pl[i], b = pl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], L, s0: acc }); acc += L; } }
  const REACH = warp + hw1 + 6;
  // 网格分桶（8 米）
  const G = 8, buckets = new Map<string, number[]>();
  segs.forEach((s, k) => {
    const mnx = Math.min(s.ax, s.bx) - REACH, mxx = Math.max(s.ax, s.bx) + REACH, mnz = Math.min(s.az, s.bz) - REACH, mxz = Math.max(s.az, s.bz) + REACH;
    for (let gx = Math.floor(mnx / G); gx <= Math.floor(mxx / G); gx++) for (let gz = Math.floor(mnz / G); gz <= Math.floor(mxz / G); gz++) { const key = gx + ',' + gz; let l = buckets.get(key); if (!l) buckets.set(key, l = []); l.push(k); }
  });
  const avB = new Map<string, Circ[]>();
  for (const c of avoid) { const R = c.r + 1.2; for (let gx = Math.floor((c.x - R) / G); gx <= Math.floor((c.x + R) / G); gx++) for (let gz = Math.floor((c.z - R) / G); gz <= Math.floor((c.z + R) / G); gz++) { const key = gx + ',' + gz; let l = avB.get(key); if (!l) avB.set(key, l = []); l.push(c); } }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * RES, z = z0 + (j + 0.5) * RES, k = j * W + i;
    const list = buckets.get(Math.floor(x / G) + ',' + Math.floor(z / G));
    if (!list) { eArr[k] = 12; continue; }
    // 蜿蜒：查询点做域扭曲（门 / 端点附近淡出，保证路还接得上门）
    let pinK = 1; for (const p of pins) pinK = Math.min(pinK, sstep(3, 14, Math.hypot(x - p[0], z - p[1])));
    const wx = x + (fbm(x * 0.035 + seed, z * 0.035) - 0.5) * 2 * warp * pinK, wz = z + (fbm(x * 0.035 + 31 + seed, z * 0.035 + 7) - 0.5) * 2 * warp * pinK;
    let d = 1e9, side = 0, sAlong = 0;
    for (const n of list) {
      const s = segs[n], dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((wx - s.ax) * dx + (wz - s.az) * dz) / L2));
      const px = wx - s.ax - dx * t, pz = wz - s.az - dz * t, dd = Math.hypot(px, pz);
      if (dd < d) { d = dd; side = (dx * pz - dz * px) / (s.L || 1); sAlong = s.s0 + t * s.L; }
    }
    const hw = hw0 + (hw1 - hw0) * sstep(0.25, 0.75, fbm(sAlong * 0.045 + seed, 3.7));   // 沿途变宽
    const rag = (fbm(x * 0.55 + seed, z * 0.55) - 0.5) * 1.1 + (vn(x * 1.7, z * 1.7) - 0.5) * 0.35;   // 草咬进路面的碎边
    const edge = hw + rag;
    let w = 1 - sstep(edge - 0.45, edge + 0.2, d);
    const al = avB.get(Math.floor(x / G) + ',' + Math.floor(z / G));
    if (al) for (const c of al) w *= sstep(c.r + 0.15, c.r + 0.9, Math.hypot(x - c.x, z - c.z));   // 绕树根 / 石头
    // 路中间偶尔冒草（魔兽式的中脊）
    const mid = (1 - sstep(0.15, 0.45, Math.abs(side))) * sstep(0.62, 0.8, fbm(sAlong * 0.08 + 11, seed)) * 0.55;
    w *= 1 - mid * sstep(1.6, 2.2, hw);
    const rutB = Math.exp(-Math.pow((Math.abs(side) - 0.62) / 0.17, 2)) * sstep(0.35, 0.6, fbm(sAlong * 0.06 + 5, seed + 2)) * ruts * sstep(1.5, 1.9, hw);
    const pudB = sstep(0.66, 0.74, fbm(x * 0.16 + seed + 3, z * 0.16)) * (1 - sstep(hw - 0.9, hw - 0.3, d)) * pud;
    wArr[k] = w; eArr[k] = Math.max(-4, Math.min(12, d - edge)); rArr[k] = rutB * w;
    data[k * 4] = Math.round(w * 255); data[k * 4 + 1] = Math.round(rutB * w * 255); data[k * 4 + 2] = Math.round(pudB * w * 255);
    data[k * 4 + 3] = Math.round((eArr[k] + 4) / 16 * 255);
  }
  for (let k = 0; k < W * H; k++) if (!data[k * 4 + 3] && eArr[k] === 12) data[k * 4 + 3] = 255;
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const samp = (arr: Float32Array, lx: number, lz: number, def: number) => {
    const fx = (lx - x0) / RES - 0.5, fz = (lz - z0) / RES - 0.5, ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= W - 1 || iz >= H - 1) return def;
    const tx = fx - ix, tz = fz - iz, a = arr[iz * W + ix], b = arr[iz * W + ix + 1], c = arr[(iz + 1) * W + ix], d = arr[(iz + 1) * W + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  return {
    tex, area: [x0, z0, W * RES, H * RES], origin,
    w: (lx, lz) => samp(wArr, lx, lz, 0),
    pd: (lx, lz) => samp(eArr, lx, lz, 12) + 1.6,
    rut: (lx, lz) => samp(rArr, lx, lz, 0),
  };
}

// ---------------------------------------------------------------- 路面贴图（GPT：土路 / 碎石 / 泥地）
const texCache: Record<string, { t: THREE.Texture; on: { value: number } }> = {};
export function forestTex(name: string, repeat = true): { t: THREE.Texture; on: { value: number } } | null {
  const hit = texCache[name]; if (hit) return hit;
  const src = FOREST_DATA[name]; if (!src || typeof Image === 'undefined') return null;
  const img = new Image(), t = new THREE.Texture(img), on = { value: 0 };
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  img.onload = () => { t.needsUpdate = true; on.value = 1; };
  img.src = src;
  return texCache[name] = { t, on };
}

/** 道路着色参数（每图一套） */
export interface RoadLook {
  /** 土路颜色乘子（线性） */
  tint?: [number, number, number];
  /** 碎石比例 0–1 */
  gravel?: number;
  /** 泥地（车辙 / 湿处）比例 0–1 */
  mud?: number;
}
/** splatMaterial 用：返回要加的 uniforms 和 GLSL 片段（片段里用 vWPos、sw、splatColor） */
export function roadShader(mask: RoadMask, look: RoadLook = {}): { uniforms: Record<string, THREE.IUniform>; head: string; body: string; key: string } {
  const useTex = road2TexOn();
  const D = useTex ? forestTex('dirt') : null, Gv = useTex ? forestTex('gravel') : null, Md = useTex ? forestTex('mud') : null;
  const on = { value: 0 };
  // 三张都解码完才打开（不会闪一帧黑）
  const tick = () => { if (!D || !Gv || !Md) { on.value = 1; return; } if (D.on.value && Gv.on.value && Md.on.value) on.value = 1; else setTimeout(tick, 100); };
  tick();
  const [ax, az, aw, ah] = mask.area, tint = look.tint ?? [1, 1, 1];
  const uniforms: Record<string, THREE.IUniform> = {
    uRdM: { value: mask.tex },
    uRdA: { value: new THREE.Vector4(ax + mask.origin[0], az + mask.origin[1], aw, ah) },
    uRdOn: on,
    uRdT: { value: new THREE.Vector3(...tint) },
    uRdK: { value: new THREE.Vector2(look.gravel ?? 0.55, look.mud ?? 0.7) },
  };
  if (useTex) { uniforms.uRdD = { value: D!.t }; uniforms.uRdG = { value: Gv!.t }; uniforms.uRdMu = { value: Md!.t }; }
  const head = `uniform sampler2D uRdM; uniform vec4 uRdA; uniform float uRdOn; uniform vec3 uRdT; uniform vec2 uRdK;
${useTex ? 'uniform sampler2D uRdD; uniform sampler2D uRdG; uniform sampler2D uRdMu;' : ''}
float rdH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rdN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rdH(i), rdH(i + vec2(1,0)), f.x), mix(rdH(i + vec2(0,1)), rdH(i + vec2(1,1)), f.x), f.y); }`;
  const body = `{   // 11-16e 魔兽式主路（road2）
  vec2 ruv = (vWPos.xz - uRdA.xy) / uRdA.zw;
  vec4 rm = (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0 && uRdOn > 0.5) ? texture2D(uRdM, ruv) : vec4(0.0);
  float rw = rm.r * (1.0 - sw.z);
  if (rw > 0.003) {
    vec2 P = vWPos.xz;
${useTex ? `    float px = length(fwidth(P * 0.3)) * 512.0;
    float fine = 1.0 - smoothstep(1.2, 4.0, px);   // 小于约 1.5 像素后淡到平均色（不闪）
    vec3 dA = texture2D(uRdD, P * 0.3).rgb, gA = texture2D(uRdG, P * 0.36 + 0.4).rgb, mA = texture2D(uRdMu, P * 0.28 + 0.7).rgb;
    vec3 dF = textureLod(uRdD, vec2(0.5), 9.0).rgb, gF = textureLod(uRdG, vec2(0.5), 9.0).rgb, mF = textureLod(uRdMu, vec2(0.5), 9.0).rgb;
    dA = mix(dF, dA, fine); gA = mix(gF, gA, fine); mA = mix(mF, mA, fine);
    float gm = smoothstep(0.42, 0.68, rdN(P * 0.11 + 3.0)) * uRdK.x + (1.0 - rm.r) * 0.35 * uRdK.x;   // 碎石成片，路边更多
    vec3 rc = mix(dA, gA, clamp(gm, 0.0, 1.0));
    rc = mix(rc, mA, clamp(rm.g * uRdK.y + rm.b * 0.6, 0.0, 1.0));` : `    vec3 rc = cB.rgb;   // 低档：沿用地形土路贴图（splat 第 2 层），只换形状
    rc *= mix(1.0, 0.72, rm.g);`}
    rc *= uRdT * (0.85 + 0.3 * rdN(P * 0.05 + 9.0));   // 大色斑
    rc *= mix(1.0, 0.55, rm.b);                          // 积水压暗
    rc = clamp(rc, vec3(0.0), vec3(1.5));
    splatColor.rgb = mix(splatColor.rgb, rc, rw);
  }
}`;
  return { uniforms, head, body, key: 'rd2' + (useTex ? 't' : 'l') };
}

// ---------------------------------------------------------------- 灰石营地（世界坐标 = 局部坐标）
/** 营地外的几条路（和 models.isPath 的直路一一对应；营地内的环路 / 篝火空地照旧用 isPath） */
const CAMP_PATHS: P2[][] = (() => {
  const north: P2[] = [], east: P2[] = [], south: P2[] = [];
  for (let z = -4; z >= -36; z -= 2) north.push([-Math.sin(z * 0.15) * 1.2, z]);
  for (let x = 10; x <= 30; x += 2) east.push([x, 4 + Math.sin(x * 0.2)]);
  for (let z = 14; z <= 42; z += 2) south.push([Math.sin(z * 0.2) * 0.8, z]);
  return [north, east, south, [[7, -2], [28, -6], [52, -30]], [[-7, 9], [-28, 16], [-52, 34]]];
})();
const campCore = (x: number, z: number) => Math.abs(Math.hypot(x, z - 4) - 9) < 1.6 || Math.hypot(x, z - 4) < 4.5;
let CAMP: RoadMask | null | undefined;
/** 营地主路遮罩：第一次调用时烘焙（avoid = 树 / 石头碰撞圆，路绕开它们） */
export function campRoad(avoid: Circ[] = [], pins: P2[] = []): RoadMask | null {
  if (CAMP !== undefined) return CAMP;
  if (!road2On()) return CAMP = null;
  const av = avoid.filter(c => c.r < 2 && Math.hypot(c.x, c.z - 4) > 17);
  try { CAMP = bakeRoad(CAMP_PATHS, [-70, -50, 70, 56], [0, 0], { seed: 7, warp: 1.5, halfW: [1.2, 2.4], avoid: av, pins: [[0, 4 - 16], [16, 4], [0, 20], ...pins], ruts: 0.8, puddles: 0.45 }); }
  catch (e) { console.warn('road2 营地烘焙失败，回旧路', e); CAMP = null; }
  return CAMP;
}
/** 营地画面用的「是不是路」：营地内环路照旧，营地外换成新路形 */
export function campIsPathV(x: number, z: number, isPathOld: (x: number, z: number) => boolean): boolean {
  const m = CAMP; if (!m) return isPathOld(x, z);
  return campCore(x, z) || m.w(x, z) > 0.35;
}
export function campPathDistV(x: number, z: number): number { const m = CAMP; return m ? (campCore(x, z) ? 0 : m.pd(x, z)) : 1e9; }

// ---------------------------------------------------------------- 翠风原野（局部坐标，origin = FIELD_ORIGIN）
let FIELD: RoadMask | null | undefined;
export function fieldRoad(paths: P2[][], origin: P2, half: number, avoid: Circ[], pins: P2[]): RoadMask | null {
  if (FIELD !== undefined) return FIELD;
  if (!road2On()) return FIELD = null;
  try { FIELD = bakeRoad(paths, [-half - 4, -half - 4, half + 4, half + 4], origin, { seed: 23, warp: 2.0, halfW: [1.2, 2.6], avoid, pins, ruts: 0.85, puddles: 0.4 }); }
  catch (e) { console.warn('road2 原野烘焙失败，回旧路', e); FIELD = null; }
  return FIELD;
}
/** 原野画面避让用的路距离（局部坐标） */
export function fieldPathDistV(lx: number, lz: number, old: (lx: number, lz: number) => number): number { const m = FIELD; return m ? Math.min(m.pd(lx, lz), old(lx, lz) + 0.8) : old(lx, lz); }
