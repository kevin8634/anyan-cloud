// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 海面：Gerstner 多层波（顶点）+ 程序化法线细浪（片元）+ 浪尖白沫 + 岸边涌浪上岸 + 拍岸 / 拍栈桥飞溅水花
//   网格跟随镜头（4 米对齐，波形按世界坐标算，不会游移），中心密外圈疏；浪高随离岸距离衰减（浅水变缓、涌上沙滩）
//   风暴：uStorm（0..1）× csStorm(p)（东岸 B 区权重）→ 浪高 / 陡度 / 白沫 / 涌浪全部加大；灯塔光锥扫过海面（uBeam）、闪电照亮（uFlash）
//   档位：low = 64 段网格、2 道波、无法线细浪 / 无飞溅；medium = 160 段、4 道波、单层细浪、飞溅 90 粒；high = 256 段 + 6 道波 + 两层细浪 + 飞溅 200；ultra = 352 段 + 飞溅 320
// ======================================================================
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import { cineUniforms } from '../../web/cine';
import { COAST_GLSL, SEA_Y, PIER, LIGHTHOUSE, ISLET, eastCoast, westCoast, shoreD, stormW } from './coast_layout';
import { seaSkyOn, ssU, SS_GLSL, SS_TIER, ssDefs } from './coast_seasky';   // 11-15 海天 v2（?off=seasky 回旧版）
import { WAVE_GLSL as SS_WAVE } from '../../web/seasky_core';   // 11-15 移植：exp-sin 浪 + Beckmann 镜面在本体共用件
import { WATER2, W2_GLSL } from '../../web/water2';   // 11-17 水体 v2：泡沫 Beer-Lambert 透明度 + 受光（?off=water2 回旧）
/** 11-18 B7 外海换秋林水体（水体水花专题第 93 / 96 步 + 秋林 v3 水体，自写）：RGB 吸收按视线光程（深度 / 视线竖直分量）、秋林散射本色、
 *  逐格重抽的微法线闪点（白天碎金光路、夜里月光碎点，泡沫上不闪）。?off=qlsea 回 11-17 海面原样 */
export const QL_SEA_OFF = (() => { try { return /(?:[?&]off=[^&]*\bqlsea\b)/.test(location.search); } catch { return false; } })();

export const seaU = {
  uTime: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uOrigin: { value: new THREE.Vector2() },
  uSky: { value: new THREE.Color(0x8a9496) }, uSkyTop: { value: new THREE.Color(0x46535a) }, uSun: { value: new THREE.Vector3(0.3, 0.35, -0.88).normalize() }, uSunC: { value: new THREE.Color(0xffe0c0) },
  uBeam: { value: new THREE.Vector4(124, -38, 1, 0) },   // 灯塔 xz（局部）、光束方向（cos, sin）
  uBeamOn: { value: 0 }, uTide: { value: 0 },
  /** 11-16 Rhett「海岸的水走上去要有碰撞感，像镜渊城」：涉水涟漪环（局部 xz、起始 uTime、强度），地面潮池共用 */
  uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) },
  /** 11-18 B7 巡航船尾浪（coast_ship.ts 每帧写）：船尾折线 16 点（局部 xz、沿线距离、有效）、船尾位置 + 朝向、开关 */
  uWk: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uShip: { value: new THREE.Vector4(0, 0, 0, 1) }, uShipOn: { value: 0 },
};
/** 11-18 B7 海面片元用：船尾浪白沫（局部坐标 p）——船身两侧推浪 + 船头浪 + 尾迹中线翻沫 + 开尔文 19.5° 两道斜浪 + 浪间横纹 */
const WAKE_GLSL = `
uniform vec4 uWk[16]; uniform vec4 uShip; uniform float uShipOn;
float wakeF(vec2 p, float t){
  if (uShipOn < 0.5) return 0.0;
  vec2 ds = p - uShip.xy; if (dot(ds, ds) > 5200.0) return 0.0;
  vec2 f = uShip.zw; float u = dot(ds, f), v = dot(ds, vec2(-f.y, f.x));
  float hb = 2.35 * sqrt(clamp(1.0 - pow(max(u - 6.4, 0.0) / 9.9, 2.0), 0.0, 1.0));
  float bow = exp(-pow((abs(v) - hb - 0.35) / 0.55, 2.0)) * smoothstep(-0.5, 1.5, u) * (1.0 - smoothstep(15.5, 17.5, u)) * (0.3 + 0.7 * smoothstep(8.0, 15.0, u));
  bow = max(bow, exp(-pow(length(vec2(u - 16.3, v * 1.6)) / 0.9, 2.0)) * 0.9);
  float best = 1e9, al = 0.0;
  for (int i = 0; i < 15; i++) { vec4 A = uWk[i], B = uWk[i + 1]; if (B.w < 0.5) break;
    vec2 ab = B.xy - A.xy; float l2 = max(dot(ab, ab), 1e-4); float tt = clamp(dot(p - A.xy, ab) / l2, 0.0, 1.0);
    vec2 q = A.xy + ab * tt - p; float d2 = dot(q, q); if (d2 < best) { best = d2; al = mix(A.z, B.z, tt); } }
  float lat = sqrt(best), behind = 1.0 - smoothstep(-0.5, 2.0, u);
  float core = exp(-pow(lat / (1.9 + al * 0.055), 2.0)) * exp(-al / 38.0);
  float armL = 2.4 + al * 0.354, armW = 0.55 + al * 0.045;
  float arm = exp(-pow((lat - armL) / armW, 2.0)) * exp(-al / 30.0) * (0.55 + 0.45 * sin(al * 1.35 - t * 2.6));
  float trans = (1.0 - smoothstep(armL * 0.8, armL, lat)) * smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(al * 1.05 - t * 2.2)) * 0.22 * exp(-al / 22.0);
  float wk = (core * 0.95 + arm * 0.7 + trans) * behind * smoothstep(60.0, 40.0, al);
  return clamp(max(wk, bow * 0.85), 0.0, 1.0);
}
`;
/** 船头溅水（世界坐标；低档无飞溅粒子 → 不做） */
export function seaSprayAt(wx: number, wz: number, k: number) { spray?.kick(wx, wz, k); }
/** 涟漪环法线梯度（局部 xz；波包向外扩、随时间衰减）。思路同秋林逆光 uRip / 镜渊城水滴，自写 */
export const RIP_GLSL = `
uniform vec4 uRip[8];
vec2 ripG(vec2 w, float t){ vec2 g = vec2(0.0);
  for (int i = 0; i < 8; i++){ vec4 r = uRip[i]; float age = t - r.z; if (r.w <= 0.0 || age < 0.0 || age > 3.0) continue;
    vec2 dv = w - r.xy; float rr = length(dv); float x = rr - (0.3 + 1.25 * age);
    g += dv / max(rr, 0.05) * cos(x * 10.0) * exp(-x * x * 5.0) * exp(-age * 1.3) * r.w; }
  return g; }
float ripF(vec2 w, float t){ float f = 0.0;   // 波峰白沫（刚落脚的一圈最亮）
  for (int i = 0; i < 8; i++){ vec4 r = uRip[i]; float age = t - r.z; if (r.w <= 0.0 || age < 0.0 || age > 1.6) continue;
    float x = length(w - r.xy) - (0.3 + 1.25 * age); f += exp(-x * x * 30.0) * exp(-age * 2.5) * r.w; }
  return f; }
`;
let _ripI = 0, _ripAcc = 0; const _ripLast = { x: 1e9, z: 0 };
/** 涉水：玩家在海里 / 潮池里走动时每 0.28 秒落一圈；k = 强度（跑动大） */
export function seaRipple(lx: number, lz: number, k = 1) {
  seaU.uRip.value[_ripI].set(lx, lz, seaU.uTime.value, k); _ripI = (_ripI + 1) % seaU.uRip.value.length;
}
export function seaWade(dt: number, lx: number, lz: number, inWater: boolean, splash = true) {
  const mv = Math.hypot(lx - _ripLast.x, lz - _ripLast.z); _ripLast.x = lx; _ripLast.z = lz; _ripAcc += dt;
  if (!inWater || mv > 3) return false;
  const spd = mv / Math.max(dt, 1e-3);
  if (spd > 0.4 && _ripAcc > 0.28) { _ripAcc = 0; const k = Math.min(1, 0.45 + spd / 10); seaRipple(lx, lz, k); if (splash) spray?.kick(seaU.uOrigin.value.x + lx, seaU.uOrigin.value.y + lz, k); return true; }
  return false;
}
const q = () => curQuality;
/** 11-18 B7 巡航船尾浪（?off=shipwake 关） */
const SHIP_WAKE = (() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return !`${q},${ls}`.split(',').map(x => x.trim()).includes('shipwake'); } catch { return true; } })();

/** 每档波数 / 网格段数 */
const TIER = { low: { seg: 64, waves: 2, spray: 0 }, medium: { seg: 160, waves: 4, spray: 90 }, high: { seg: 256, waves: 6, spray: 200 }, ultra: { seg: 352, waves: 6, spray: 320 } } as const;

// 波：方向角、波长、相对振幅、陡度、相速倍率（风暴时整体放大）
const WAVES = [
  [0.15, 46, 1.0, 0.55, 1.0], [-0.35, 31, 0.62, 0.6, 1.05], [0.6, 19, 0.38, 0.65, 1.1], [-0.9, 12.5, 0.22, 0.7, 1.0], [1.2, 8.2, 0.12, 0.7, 0.95], [-1.4, 5.6, 0.07, 0.6, 1.0],
];

const SEA_VS = (nw: number) => `
uniform float uTime; uniform float uStorm; uniform vec2 uOrigin; uniform float uTide;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vShore; varying vec2 vP;
${COAST_GLSL}
#include <common>
#include <fog_pars_vertex>
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz - uOrigin; vP = p;
  float d = csShore(p);
  float st = uStorm * csStorm(p);
  float pier = csPier(p);
  // 振幅：平静 0.22 → 风暴 1.9（米）；浅水衰减，栈桥 / 井台下压低（免得水面穿出甲板）
  float deck = csDeck(p);
  float A = mix(0.22, 1.45, st) * mix(0.25, 1.0, smoothstep(-2.0, 22.0, d)) * (1.0 - 0.7 * smoothstep(-7.0, 0.0, deck));
  float Qk = mix(0.55, 0.82, st);   // 11-07 风暴陡度上限 0.95 → 0.82：原来浪尖挤成尖刺 / 自相交「翻折」
  vec3 P = vec3(w.x, 0.0, w.z); vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  const float g = 9.8;
${WAVES.slice(0, nw).map(([a, L, amp, steep, sp], i) => `  { vec2 D = vec2(${Math.cos(a as number).toFixed(4)}, ${Math.sin(a as number).toFixed(4)}); float k = 6.2831 / ${(L as number).toFixed(2)};
    float c = sqrt(g / k) * ${(sp as number).toFixed(2)};
    // 11-07 Rhett「海浪翻起来不自然」：① 方向不再随风暴权重逐点旋转（原来 D 随位置变，相位在过渡带被扭成漩涡状）；
    // ② 相位用原点局部坐标（世界坐标 ~2700 m 时短波精度差、会抖）；③ 浪群包络：振幅沿传播方向成群起伏、按群速度（相速一半）推进，横向也有起伏，不再整排一样高
    float gph = 0.11 * k * (dot(D, p) - 0.5 * c * uTime) + ${(i * 2.3).toFixed(2)}, xph = dot(vec2(-D.y, D.x), p) * ${(0.013 + i * 0.004).toFixed(3)} + uTime * 0.05 + ${(i * 1.1).toFixed(2)};
    float env = 0.55 + 0.45 * (0.5 + 0.5 * sin(gph)) * (0.65 + 0.35 * sin(xph));
    float a = A * ${(amp as number).toFixed(3)} * env * 1.25; float Q = Qk * ${(steep as number).toFixed(2)} / (k * a * ${nw.toFixed(1)} + 1e-4);
    Q = min(Q, 0.85 / (k * a * ${nw.toFixed(1)} + 1e-4));
    float f = k * dot(D, p) - c * k * uTime + ${(i * 1.7).toFixed(2)}; float cf = cos(f), sf = sin(f);
    P.x += Q * a * D.x * cf; P.z += Q * a * D.y * cf; P.y += a * sf;
    T += vec3(-Q * D.x * D.x * k * a * sf, D.x * k * a * cf, -Q * D.x * D.y * k * a * sf);
    B += vec3(-Q * D.x * D.y * k * a * sf, D.y * k * a * cf, -Q * D.y * D.y * k * a * sf);
    crest += max(0.0, sf) * a * k * Q; }`).join('\n')}
  // 涌浪上岸：水线附近周期性抬高（浪推上沙滩再退回），风暴更高更快
  float surgeA = mix(0.18, 0.75, st);
  float sph = uTime * 0.68 - d * 0.32 + sin(p.y * 0.07) * 1.5 + sin(p.x * 0.031 + uTime * 0.07) * 0.9;   // 11-07 速度固定：原来 uTime × 随风暴变的倍率，风暴涨落 / 过渡带里相位被拉扯，浪线忽快忽慢、扭曲
  float surge = surgeA * pow(max(0.0, sin(sph)), 3.0) * (1.0 - smoothstep(-2.0, 10.0, d)) * smoothstep(-12.0, -6.0, d);
  P.y += surge;
  // 栈桥 / 井台 / 礁堤附近：浪顶压在甲板以下（不漫上甲板）
  P.y = mix(P.y, min(P.y, 0.75), smoothstep(-4.0, -0.5, deck));
  vec3 n = normalize(cross(B, T));
  vN = n; vCrest = crest + surge * 1.2 * smoothstep(-8.0, 2.0, d); vShore = d;
  // 潮汐：水位整体 +0.3 米（岸线往里推几米）；离岸很远的陆地下面把网格压下去（免得穿过潮池洼地）
  vec4 wp = vec4(P.x, ${SEA_Y.toFixed(2)} + P.y + uTide * 0.3 - 5.0 * csS(-10.0, -18.0, d), P.z, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SEA_FS = (tier: string) => `
uniform float uTime; uniform float uStorm; uniform float uFlash; uniform vec3 uSky; uniform vec3 uSkyTop; uniform vec3 uSun; uniform vec3 uSunC; uniform vec4 uBeam; uniform float uBeamOn;
uniform sampler2D uNor; uniform vec2 uOrigin;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vShore; varying vec2 vP;
${COAST_GLSL}
#include <common>
#include <fog_pars_fragment>
float sh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
${RIP_GLSL}
${WATER2.off ? '' : W2_GLSL}
void main(){
  vec2 p = vP; float st = uStorm * csStorm(p); float d = vShore;
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW); float dist = length(cameraPosition - vW);
  float far = smoothstep(40.0, 200.0, dist);
${tier !== 'low' ? `  // 法线细浪：两张滚动法线（风暴更粗更乱）
  vec2 uv1 = vW.xz * 0.045 + vec2(uTime * 0.018, uTime * 0.011) * (1.0 + st);
  vec3 n1 = texture2D(uNor, uv1).xyz * 2.0 - 1.0;
${tier !== 'medium' ? `  vec2 uv2 = vW.xz * 0.13 + vec2(-uTime * 0.03, uTime * 0.024) * (1.0 + st * 1.5);
  vec3 n2 = texture2D(uNor, uv2).xyz * 2.0 - 1.0; n1 = n1 + n2 * 0.7;` : ''}
  float nk = mix(0.32, 0.6, st) * (1.0 - far * 0.75);
  n = normalize(n + vec3(n1.x, 0.0, n1.y) * nk);` : ''}
  { vec2 rg = ripG(vP, uTime); n = normalize(n + vec3(rg.x, 0.0, rg.y) * 0.55); }   // 11-16 涉水涟漪
  // 11-14d 水与海 C：反射「多少」跟平均水面走、「反射什么」跟细浪走（专长包第 43 步思路，自写）：
  //   菲涅耳用压扁的法线（xz × 0.3）→ 掠射角不会被细浪打成满屏雪花；reflect() 仍用完整法线
  vec3 nF = normalize(vec3(n.x * 0.3, n.y, n.z * 0.3));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nF, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  // 天空反射：地平线色 → 天顶色；风暴压暗
  vec3 sky = mix(uSky, uSkyTop, smoothstep(0.0, 0.6, R.y));
  #ifdef USE_FOG
  if (cineFx2.z > 0.5) sky = mix(sky, cineSky(normalize(vec3(R.x, max(R.y, 0.02), R.z))), 0.45 * (1.0 - uStorm));   // 11-14 电影感第 6 步：海面反射同一片天（风暴时退回海岸自己的阴天）
  #endif
  sky *= mix(1.0, 0.5, smoothstep(0.04, -0.12, R.y));   // 11-14d 反射线指向水平面以下（浪背）= 照到的是海不是天：压暗，远海不再一片发白
  sky *= 1.0 + uFlash * 2.2;
  // 水体：深处墨青，浅处 / 浪背透出青绿（次表面）
  vec3 deep = mix(vec3(0.010, 0.040, 0.050), vec3(0.006, 0.020, 0.028), st);
  vec3 shallow = mix(vec3(0.05, 0.20, 0.19), vec3(0.03, 0.12, 0.13), st);
  // fix1107 水体：Beer-Lambert 吸收（估算水深 = 离岸距离 × 坡度；红光最先被吸收 → 浅处青绿、深处墨青）+ 浅水焦散
  float wDep = max(0.0, d + 2.0) * 0.6;
  vec3 trans = exp(-vec3(0.6, 0.2, 0.14) * wDep * mix(1.0, 1.6, st));
  float shK = 1.0 - smoothstep(-2.0, 14.0, d);
${tier === 'low' ? '  float caus = 0.0;' : `  vec2 cq = vW.xz * 0.55 + n.xz * 1.6; float c1 = sn(cq + vec2(uTime * 0.21, uTime * 0.13)), c2 = sn(cq * 1.37 - vec2(uTime * 0.17, -uTime * 0.11) + 3.7);
  float caus = pow(1.0 - abs(c1 - c2), 9.0) * (1.0 - st * 0.8) * smoothstep(0.02, 0.35, trans.g);`}
  vec3 body = mix(deep, shallow + vec3(0.10, 0.20, 0.17) * caus, max(shK * 0.6, trans.g * 0.85));
  body = mix(body, body * vec3(0.55, 0.9, 0.92), 1.0 - trans.r);
  float sss = pow(max(0.0, dot(V, -uSun) * 0.5 + 0.5), 3.0) * clamp(vCrest * 1.6, 0.0, 1.0);
  body += vec3(0.03, 0.16, 0.14) * sss * (1.0 - st * 0.5) + vec3(0.02, 0.1, 0.1) * clamp(vCrest, 0.0, 1.0) * st;
  vec3 col = mix(body, sky, fres * mix(0.85, 0.65, st));
  // 太阳高光（阴天柔和，风暴几乎没有）
  // 11-14d 高光抗闪烁（第 28 步思路）：远处一个像素盖住多道细浪 → 高光变宽变弱，不再逐帧闪白点
  float spP = mix(220.0, 70.0, far);
  float spec = pow(max(dot(R, uSun), 0.0), spP) * 3.0 * mix(1.0, 0.45, far) + pow(max(dot(R, uSun), 0.0), 24.0) * 0.18;
  col += uSunC * spec * (1.0 - st * 0.9);
  // 白沫：浪尖（Gerstner 尖度）+ 岸边碎浪线 + 栈桥 / 礁石周围
  float fn = sn(vW.xz * 0.7 + uTime * 0.3) * 0.6 + sn(vW.xz * 2.3 - uTime * 0.5) * 0.4;
  float crestF = smoothstep(mix(0.55, 0.42, st), mix(0.95, 0.85, st), vCrest + (fn - 0.5) * 0.45);
  float shoreF = (1.0 - smoothstep(-1.5, mix(2.5, 4.0, st), d + (fn - 0.5) * 2.5)) * smoothstep(-9.0, -3.0, d);
  shoreF *= 0.55 + 0.45 * sin(uTime * 0.68 - d * 0.32 + sin(p.y * 0.07) * 1.5 + sin(p.x * 0.031 + uTime * 0.07) * 0.9 + 1.2);   // 11-07 与涌浪同相（固定速度）
  float pier = csPier(p);
  float pierF = smoothstep(-2.6, 0.0, pier) * (0.4 + st * 0.6) * fn;
  float isl = 1.0 - smoothstep(${ISLET.r.toFixed(1)}, ${(ISLET.r + 5).toFixed(1)}, length(p - vec2(${ISLET.x.toFixed(1)}, ${ISLET.z.toFixed(1)})));
  float foam = clamp(max(max(crestF * mix(0.55, 1.0, st), shoreF), max(pierF, isl * fn * (0.3 + st * 0.7))), 0.0, 1.0);
  foam *= smoothstep(0.3, 0.75, fn + foam * 0.3);
  foam = max(foam, clamp(ripF(vP, uTime), 0.0, 1.0) * 0.55);   // 11-16 涉水：落脚一圈白沫
  ${WATER2.off ? '' : 'foam *= 0.35 + 0.65 * w2FoamOp(foam, fn);   // 11-17 v2：泡沫透明度按光学厚度（新沫实、老沫只剩一层气泡）'}
  col = mix(col, vec3(0.74, 0.80, 0.80) * (0.9 + uFlash * 1.5), foam * 0.72);
  // 灯塔光锥扫过海面：离光束中线的距离（水平投影）
  if (uBeamOn > 0.01) {
    vec2 bp = p - uBeam.xy; vec2 bd = uBeam.zw;
    float along = abs(dot(bp, bd)); float side = abs(bp.x * bd.y - bp.y * bd.x);
    float wdt = 2.0 + along * 0.11;
    float beam = step(6.0, along) * exp(-side * side / (wdt * wdt)) * exp(-along / 140.0) * smoothstep(6.0, 30.0, along);
    col += vec3(0.75, 0.88, 1.0) * beam * uBeamOn * (0.35 + 0.65 * foam + 0.5 * fres);
  }
  col *= 1.0 + uFlash * 0.6;
  // 浅水边缘透明：贴近水线时淡出，看见下面的湿沙
  float alpha = mix(0.55, 1.0, smoothstep(-8.0, 3.0, d)) ;
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ---------------------------------------------------------------- 11-15 海面 v2（Rhett 参考视频）：多向 exp-sin 叠加波（顶点 + 逐像素法线）、菲涅耳、反射同一片天（coast_seasky）、
//   太阳 / 月亮反光带（Beckmann 镜面，远处丢掉的细浪坡度方差并进粗糙度 → 沿太阳方向拉长的金色光路）、远处融进同方向地平线色
//   波：每道方向伪随机（略偏向主风向），频率 ×1.18、权重 ×0.8，相速 √(g·k)；后一道在前一道的「拖拽」坐标上算（视频 / afl 海面思路，自写）
//   低档：顶点 6 道 + 片元 10 道、反射不带云；中 11 + 20、反射 2 层云；高 14 + 28、3 层；超高 16 + 34、4 层
const WAVE_N = { low: [6, 10], medium: [11, 20], high: [14, 28], ultra: [16, 34] } as const;
/** v4 近处细节浪（片元，0–70 米）道数 */
const NEAR_N = { low: 0, medium: 0, high: 12, ultra: 14 } as const;
const WAVE_GLSL = /* glsl */ `${SS_WAVE}
// v3 长涌（大波长 swell）：3 道 31–72 m 的尖峰缓谷波（sin x − 0.22·cos 2x：峰窄而高、谷宽而平），返回 (高度 ≈ −0.8..1.2, ∂h/∂x, ∂h/∂z)，单位振幅
vec3 wvSwell(vec2 p, float t){
  vec3 r = vec3(0.0);
  const vec3 SW0 = vec3(-0.94, 0.34, 72.0), SW1 = vec3(-0.80, -0.60, 47.0), SW2 = vec3(-0.99, 0.12, 31.0);
  for (int i = 0; i < 3; i++){
    vec3 s = i == 0 ? SW0 : i == 1 ? SW1 : SW2; float A = i == 0 ? 0.55 : i == 1 ? 0.30 : 0.17;
    vec2 D = normalize(s.xy); float k = 6.2831 / s.z, w = sqrt(9.8 * k);
    float x = k * dot(D, p) - w * t + float(i) * 2.1;
    r.x += A * (sin(x) - 0.22 * cos(2.0 * x));
    r.yz += D * (A * k * (cos(x) + 0.44 * sin(2.0 * x)));
  }
  return r;
}`;
const SEA_VS2 = (nv: number) => `
uniform float uTime; uniform float uStorm; uniform vec2 uOrigin; uniform float uTide;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vShore; varying vec2 vP; varying float vAmp; varying float vSwell; varying float vSwA;
${COAST_GLSL}
${WAVE_GLSL}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz - uOrigin; vP = p;
  float d = csShore(p), st = uStorm * csStorm(p), deck = csDeck(p);
  // 浪高（米，波峰到波谷约 1.1 倍）：平静 0.85 → 风暴 3.0；浅水衰减，栈桥 / 井台下压低
  float H = mix(0.85, 3.0, st) * mix(0.25, 1.0, smoothstep(-2.0, 22.0, d)) * (1.0 - 0.7 * smoothstep(-7.0, 0.0, deck));
  vec3 wv = wvSum(p, uTime, mix(0.26, 0.42, st), ${nv}, 0.0);
  float y = H * (wv.x - 0.47);
  // v3 长涌：平静约 ±0.9 米（近处看得出明显起伏），风暴 ±2.2 米；浅水 / 栈桥下同样衰减
  float shal = mix(0.15, 1.0, smoothstep(0.0, 30.0, d)) * (1.0 - 0.8 * smoothstep(-7.0, 0.0, deck));
  float swA = mix(1.2, 2.1, st) * shal;
  vec3 sw = wvSwell(p, uTime);
  y += swA * sw.x; vSwell = sw.x; vSwA = swA;
  float surgeA = mix(0.18, 0.75, st);
  float sph = uTime * 0.68 - d * 0.32 + sin(p.y * 0.07) * 1.5 + sin(p.x * 0.031 + uTime * 0.07) * 0.9;
  float surge = surgeA * pow(max(0.0, sin(sph)), 3.0) * (1.0 - smoothstep(-2.0, 10.0, d)) * smoothstep(-12.0, -6.0, d);
  y += surge;
  y = mix(y, min(y, 0.75), smoothstep(-4.0, -0.5, deck));
  vN = normalize(vec3(-wv.y * H - sw.y * swA, 1.0, -wv.z * H - sw.z * swA)); vAmp = H; vShore = d;
  vCrest = smoothstep(0.5, 0.9, wv.x) * mix(0.55, 1.25, st) + smoothstep(0.55, 1.1, sw.x) * st * 0.6 + surge * 1.2 * smoothstep(-8.0, 2.0, d);
  vec4 wp = vec4(w.x, ${SEA_Y.toFixed(2)} + y + uTide * 0.3 - 5.0 * csS(-10.0, -18.0, d), w.z, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * (viewMatrix * wp);
}`;
const SEA_FS2 = (tier: keyof typeof WAVE_N) => {
  const nf = WAVE_N[tier][1], roct = SS_TIER[tier].roct;
  return `${ssDefs(tier)}
uniform float uTime; uniform float uStorm; uniform vec4 uBeam; uniform float uBeamOn; uniform float uFlash;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vShore; varying vec2 vP; varying float vAmp; varying float vSwell; varying float vSwA;
${COAST_GLSL}
${SS_GLSL}
${WAVE_GLSL}
float sh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
${RIP_GLSL}
${SHIP_WAKE ? WAKE_GLSL : ''}
${WATER2.off ? '' : W2_GLSL}
void main(){
  vec2 p = vP; float st = uStorm * csStorm(p); float d = vShore;
  vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
  float pix = max(length(fwidth(vP)), 1e-3);
  vec3 wv = wvSum(vP, uTime, mix(0.26, 0.42, st), ${nf}, pix);
  float H = vAmp;
  float Hn = H * mix(3.2, 1.8, smoothstep(8.0, 140.0, dist));   // v3 近处细浪坡度加大（起伏读得出），远处维持 v2   // 法线比高度更陡一点（细浪读得出来，反光带更宽更碎）
  // v3 长涌坡度（近处全量，远处减半：远海留给细碎闪光）
  vec3 sw = wvSwell(vP, uTime);
  float swK = vSwA * (1.0 - 0.55 * smoothstep(60.0, 380.0, dist));
  vec3 n = normalize(vec3(-wv.y * Hn - sw.y * swK, 1.0, -wv.z * Hn - sw.z * swK));
  float nearK = 1.0 - smoothstep(14.0, 75.0, dist);
${NEAR_N[tier] > 0 ? `  // v4 近处细节浪：更短的 exp-sin 波组（3.1 倍频、自己的方向序列），只在 75 米内叠进法线 → 迎着太阳的大涌浪面不再是一整块平滑暗坡
  if (nearK > 0.001) {
    const mat2 NR = mat2(0.42, 0.91, -0.91, 0.42);             // 转 65°：和主波组交叉，近处是交错的细碎浪纹而不是顺着视线的长条
    vec3 wd = wvSum(NR * vP * 4.4 + vec2(17.0, 5.0), uTime * 2.1, 0.12, ${NEAR_N[tier]}, pix * 4.4);
    vec2 gd = (wd.yz * NR) * 4.4 * mix(0.8, 1.2, st) * nearK * ${NEAR_N[tier] < 10 ? "0.6" : "1.0"};
    n = normalize(n + vec3(-gd.x, 0.0, -gd.y));
  }` : ''}
  { vec2 rg = ripG(vP, uTime); n = normalize(n + vec3(rg.x, 0.0, rg.y) * 0.55); }   // 11-16 涉水涟漪
  float hz = ssHz();
  float var = 0.005 + wvLost * Hn * Hn + st * 0.004 + 0.014 * smoothstep(20.0, 300.0, dist) + 0.010 * hz;   // 太阳贴地时反光带更宽   // 远处一个像素盖住很多细浪：坡度方差变大 → 反光带拉宽拉长
  // 菲涅耳用压扁的法线（专长第 43 步）：掠射角不被细浪打成满屏雪花；reflect() 用完整法线
  float kF = mix(0.3, 0.6, nearK);   // v4 近处菲涅耳少压扁一点：细节浪的明暗读得出
  vec3 nF = normalize(vec3(n.x * kF, n.y, n.z * kF));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nF, V), 0.0), 5.0);
  // 远处反射方向用压扁一些的法线：一个像素里很多细浪，反射的天 / 云不该逐像素乱跳（远海不起噪点）
  float kR = mix(1.0, 0.4, smoothstep(40.0, 300.0, dist));
  vec3 R = reflect(-V, normalize(vec3(n.x * kR, n.y, n.z * kR)));
  vec3 Rs = normalize(vec3(R.x, max(R.y, 0.004), R.z));
  float wSt = max(st, uStorm);   // 天色 / 雾按全局天气（玩家看到的是同一片风暴天），浪高 / 白沫按本地权重 st
  vec3 sky = ssSky(Rs, wSt, 0.0, ${roct}, 0, 0, false);
  sky *= mix(1.0, 0.55, smoothstep(0.03, -0.12, R.y));   // 反射线朝下 = 看到的是浪背
  // 水体：深处墨青，浅处 / 浪背透青绿；亮度跟天光（夜里暗，但浪纹靠天色 / 月光反射仍看得见）
  float dayK = ssK2.x;
  vec3 deep = mix(vec3(0.010, 0.040, 0.050), vec3(0.006, 0.020, 0.028), st);
  vec3 shallow = mix(vec3(0.05, 0.20, 0.19), vec3(0.03, 0.12, 0.13), st);
  float wDep = max(0.0, d + 2.0) * 0.6;
${QL_SEA_OFF ? `  vec3 trans = exp(-vec3(0.6, 0.2, 0.14) * wDep * mix(1.0, 1.6, st));` : `  // 11-18 B7 秋林：光程 = 深度 / 视线竖直分量（掠射看浅水也显得深），σ 偏红 (0.8, 0.27, 0.36) × 1.2；深处墨青换成秋林散射本色（压一半，夜里跟 dayK 走）
  vec3 trans = exp(-vec3(0.8, 0.27, 0.36) * 1.2 * wDep / max(V.y, 0.22) * mix(1.0, 1.6, st));
  deep = mix(deep, vec3(0.030, 0.064, 0.052) * 1.6 * 0.55, 0.5 * (1.0 - st));`}
  float shK = 1.0 - smoothstep(-2.0, 14.0, d);
${tier === 'low' ? '  float caus = 0.0;' : `  vec2 cq = vW.xz * 0.55 + n.xz * 1.6; float c1 = sn(cq + vec2(uTime * 0.21, uTime * 0.13)), c2 = sn(cq * 1.37 - vec2(uTime * 0.17, -uTime * 0.11) + 3.7);
  float caus = pow(1.0 - abs(c1 - c2), 9.0) * (1.0 - st * 0.8) * smoothstep(0.02, 0.35, trans.g) * ssK.y;`}
  vec3 body = mix(deep, shallow + vec3(0.10, 0.20, 0.17) * caus, max(shK * 0.6, trans.g * 0.85));
  body = mix(body, body * vec3(0.55, 0.9, 0.92), 1.0 - trans.r);
  vec3 sunTint = ssSunC / max(max(ssSunC.r, max(ssSunC.g, ssSunC.b)), 1e-3);
  body *= dayK * mix(vec3(1.0), sunTint * 0.6 + 0.4, 0.35 * ssK.y);
  // 浪尖透光（逆光看浪背发青绿）
  float sss = pow(max(0.0, dot(V, -ssSunD) * 0.5 + 0.5), 3.0) * clamp(vCrest * 1.6, 0.0, 1.0) * ssK.y;
  body += vec3(0.03, 0.16, 0.14) * sss * (1.0 - st * 0.5) * dayK + vec3(0.02, 0.1, 0.1) * clamp(vCrest, 0.0, 1.0) * st * dayK;
  // v3 长涌明暗：波谷压暗，波峰逆光透绿（迎着太阳看浪背最明显），远处淡掉
  float swNear = 1.0 - smoothstep(80.0, 320.0, dist);
  float swH = smoothstep(-0.7, 1.0, vSwell);
  body *= mix(1.0, mix(0.74, 1.15, swH), swNear);
  // v4 次表面透光：迎着太阳看，大涌浪上半段（薄）透出被太阳染色的青绿 / 橙褐；浪面再加一层水体散射的天光，暗坡不死黑
  { vec2 vh = -V.xz / max(length(V.xz), 1e-4), lh = ssSunD.xz / max(length(ssSunD.xz), 1e-4);
    float toward = pow(max(dot(vh, lh), 0.0), 2.0) * smoothstep(-0.06, 0.04, ssSunD.y) * (1.0 - smoothstep(0.35, 0.8, ssSunD.y));
    float thinW = smoothstep(-0.35, 0.85, vSwell) * (1.0 - 0.5 * smoothstep(0.9, 1.3, vSwell));
    vec3 tr = sunTint * vec3(0.16, 0.42, 0.30) + vec3(0.02, 0.08, 0.07);
    body += tr * toward * thinW * swNear * (0.10 + 0.14 * nearK) * dayK * (1.0 - 0.6 * st);
    body += ssAmb * vec3(0.10, 0.20, 0.20) * thinW * swNear * (1.0 - 0.5 * st); }
  float back = pow(max(0.0, dot(V, -ssSunD) * 0.5 + 0.5), 4.0);
  body += vec3(0.02, 0.15, 0.11) * back * smoothstep(0.35, 1.05, vSwell) * swNear * dayK * ssK.y * mix(1.4, 0.7, st);
  vec3 col = mix(body, sky, fres * mix(1.0, 0.7, st) * mix(1.0, mix(0.85, 1.05, swH), swNear));   // 波谷反射也弱一点（看到的是对面浪背）
  // 太阳 / 月亮反光带（v3：贴地时再加一层宽光泽，金色光路更宽更亮）
  float a2 = 2.0 * var;
  vec3 spec = ssSunC * ((0.0011 + 0.0019 * hz) * wvSpec(n, V, ssSunD, a2) + 0.0032 * hz * wvSpec(n, V, ssSunD, a2 * 3.0 + 0.01)
                         + 0.005 * hz * wvSpec(normalize(vec3(n.x * 0.45, n.y, n.z * 0.45)), V, ssSunD, a2 * 2.0 + 0.02))   // 连续的金色光柱（压扁法线，不被近处细浪打散） * (1.0 - wSt * 0.95)
            + ssMoonC * (0.012 * wvSpec(n, V, ssMoonD, a2 * 1.3) + 0.014 * wvSpec(n, V, ssMoonD, a2 * 6.0 + 0.05)) * (1.0 - wSt);   // 月光：窄光路 + 一层宽的月光光泽（夜里整片浪纹读得出）
  // v3 闪电：海面瞬间反光（朝闪电方向的宽镜面 + 整体菲涅耳提亮）
  // v4 闪电：只在闪电方向的海面上反光（镜面 + 朝闪电方向的菲涅耳），不再整片提亮
  spec += vec3(0.72, 0.74, 1.0) * ssFlash * wSt * (0.06 * wvSpec(n, V, ssFlashD, a2 * 3.0 + 0.03) + 0.5 * fres * pow(max(dot(R, ssFlashD), 0.0), 18.0));
${QL_SEA_OFF ? '' : `  // 11-18 B7 闪点（专题第 96 步）：世界格 0.05·(1+0.05·距离) 米，每格每秒重抽 7 次微法线（±0.30），落在半程向量 3° 内就闪一下
  { float cs = 0.05 * (1.0 + 0.05 * dist); vec2 cid = floor(vW.xz / cs); float ph = sh(cid + 7.3);
    float tk = floor(uTime * 7.0 + ph * 7.0); vec2 jr = vec2(sh(cid + tk * 1.91), sh(cid.yx + tk * 2.37 + 4.1)) * 2.0 - 1.0;
    vec3 nm = normalize(n + vec3(jr.x, 0.0, jr.y) * 0.30);
    float gl = (1.0 - wSt) * (1.0 - smoothstep(60.0, 260.0, dist)) * fres;
    spec += ssSunC * 0.0011 * 16.0 * smoothstep(0.9986, 0.99985, dot(nm, normalize(V + ssSunD))) * gl * step(0.0, ssSunD.y)
          + ssMoonC * 0.012 * 16.0 * smoothstep(0.9986, 0.99985, dot(nm, normalize(V + ssMoonD))) * gl * step(0.0, ssMoonD.y); }`}
  spec = min(spec, vec3(60.0));
  // 白沫：浪尖 + 岸边碎浪线 + 栈桥 / 礁石周围（与旧版同规则）
  float fn = sn(vW.xz * 0.7 + uTime * 0.3) * 0.6 + sn(vW.xz * 2.3 - uTime * 0.5) * 0.4;
  float crestF = smoothstep(mix(0.55, 0.42, st), mix(0.95, 0.85, st), vCrest + (fn - 0.5) * 0.45);
  float shoreF = (1.0 - smoothstep(-1.5, mix(2.5, 4.0, st), d + (fn - 0.5) * 2.5)) * smoothstep(-9.0, -3.0, d);
  shoreF *= 0.55 + 0.45 * sin(uTime * 0.68 - d * 0.32 + sin(p.y * 0.07) * 1.5 + sin(p.x * 0.031 + uTime * 0.07) * 0.9 + 1.2);
  float pierF = smoothstep(-2.6, 0.0, csPier(p)) * (0.4 + st * 0.6) * fn;
  float isl = 1.0 - smoothstep(${ISLET.r.toFixed(1)}, ${(ISLET.r + 5).toFixed(1)}, length(p - vec2(${ISLET.x.toFixed(1)}, ${ISLET.z.toFixed(1)})));
  float swF = smoothstep(0.75, 1.15, vSwell + (fn - 0.5) * 0.5) * st * (1.0 - smoothstep(80.0, 260.0, dist));   // v3 风暴：长涌浪顶成片白沫
  float foam = clamp(max(max(max(crestF * mix(0.4, 1.0, st), swF) * (1.0 - smoothstep(50.0, 220.0, dist)), shoreF), max(pierF, isl * fn * (0.3 + st * 0.7))), 0.0, 1.0);
  foam *= smoothstep(0.3, 0.75, fn + foam * 0.3);
  foam = max(foam, clamp(ripF(vP, uTime), 0.0, 1.0) * 0.55);   // 11-16 涉水：落脚一圈白沫
${SHIP_WAKE ? '  { float wf = wakeF(vP, uTime); foam = max(foam, wf * smoothstep(0.15, 0.6, fn + wf * 0.45)); }   // 11-18 B7 船尾浪' : ''}
  ${WATER2.off ? `vec3 foamC = vec3(0.85, 0.9, 0.9) * (ssAmb * 1.25 + ssSunC * 0.022 * max(ssSunD.y, 0.0) + ssMoonC * 0.05 * max(ssMoonD.y, 0.0));`
  : `foam *= 0.35 + 0.65 * w2FoamOp(foam, fn);   // 11-17 v2：泡沫透明度按光学厚度（Beer-Lambert），老沫透出底下的水和倒影
  vec3 foamC = w2FoamLit(vec3(0.85, 0.9, 0.9), ssSunC * 0.029 * max(dot(n, ssSunD), 0.0), ssAmb * 1.19, sky, fres) + vec3(0.85, 0.9, 0.9) * ssMoonC * 0.05 * max(ssMoonD.y, 0.0);   // 泡沫受光：太阳 Lambert（按浪面法线）+ 天空半球 + 周围反射 + 湿面菲涅耳`}
  col = mix(col, foamC * (1.0 + uFlash * 0.3), foam * 0.72);
  spec *= 1.0 - foam;
  if (uBeamOn > 0.01) {
    vec2 bp = p - uBeam.xy; vec2 bd = uBeam.zw;
    float along = abs(dot(bp, bd)); float side = abs(bp.x * bd.y - bp.y * bd.x);
    float wdt = 2.0 + along * 0.11;
    float beam = step(6.0, along) * exp(-side * side / (wdt * wdt)) * exp(-along / 140.0) * smoothstep(6.0, 30.0, along);
    col += vec3(0.75, 0.88, 1.0) * beam * uBeamOn * (0.35 + 0.65 * foam + 0.5 * fres);
  }
  // 远处：平方指数雾，雾色 = 同方向地平线天色（朝太阳金、背阳粉紫），与穹顶地平线以下同色 → 海天线无缝
  float fK = 1.0 - exp(-pow(dist * ssK2.y, 2.0));
  vec3 fogC = ssAtmos(normalize(vec3(-V.x, 0.0, -V.z)), wSt);
  col = (mix(col, fogC, fK) + spec * (1.0 - 0.6 * fK)) * ssK3.y;
  float alpha = mix(0.55, 1.0, smoothstep(-8.0, 3.0, d));
  alpha = max(alpha, max(foam, fK));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
};

/** 程序化法线贴图（可平铺，多层正弦 + 噪声 → 高度 → 法线） */
let norTex: THREE.DataTexture | null = null;
function seaNormal(): THREE.DataTexture {
  if (norTex) return norTex;
  const S = 256, h = new Float32Array(S * S);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const comps: [number, number, number, number][] = [];
  for (let i = 0; i < 28; i++) { const kx = Math.round((r() - 0.5) * 2 * (2 + i * 0.6)), kz = Math.round((r() - 0.5) * 2 * (2 + i * 0.6)); if (!kx && !kz) continue; comps.push([kx, kz, 1 / (1 + Math.hypot(kx, kz) * 0.55), r() * 6.28]); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let v = 0; for (const [kx, kz, a, ph] of comps) v += a * Math.sin((kx * x + kz * y) / S * 6.2832 + ph); h[y * S + x] = v; }
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)], hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -hx * 0.9, ny = -hy * 0.9, nz = 1, L = Math.hypot(nx, ny, nz), i = (y * S + x) * 4;
    d[i] = (nx / L * 0.5 + 0.5) * 255; d[i + 1] = (ny / L * 0.5 + 0.5) * 255; d[i + 2] = (nz / L * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (norTex = t);
}

/** 中心密外圈疏的网格（边长 2·R，段数 seg）：u ∈ [-1,1] → x = R·(0.3u + 0.7u³) */
function seaGeometry(seg: number, R: number): THREE.BufferGeometry {
  const n = seg + 1, pos = new Float32Array(n * n * 3), idx: number[] = [];
  const m = (u: number) => R * (0.3 * u + 0.7 * u * u * u);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const u = i / seg * 2 - 1, v = j / seg * 2 - 1; pos.set([m(u), 0, m(v)], (j * n + i) * 3); }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.5);
  return g;
}

export const seaStats = { seg: 0, waves: 0, spray: 0, splashes: 0, maxAmp: 0, v2: false, fragWaves: 0 };
let sea: THREE.Mesh | null = null, origin = { x: 0, z: 0 };
/** 上一帧渲染用的镜头位置（世界） */
export const camPos = new THREE.Vector3();
let spray: Spray | null = null;
export function seaBuild(root: THREE.Object3D, O: { x: number; z: number }) {
  const T = TIER[q()]; origin = O;
  seaU.uOrigin.value.set(O.x, O.z);
  const v2 = seaSkyOn();   // 11-15 海天 v2；?off=seasky = 旧版 Gerstner 海面
  const mat = v2 ? new THREE.ShaderMaterial({
    uniforms: { ...seaU, ...ssU },
    vertexShader: SEA_VS2(WAVE_N[q()][0]), fragmentShader: SEA_FS2(q()), transparent: true, depthWrite: true, fog: false,
  }) : new THREE.ShaderMaterial({
    uniforms: { ...seaU, uNor: { value: seaNormal() }, ...THREE.UniformsLib.fog, ...cineUniforms() },   // 11-14 第 3 / 6 / 9 步：海面吃同一层高度雾 / 天色
    vertexShader: SEA_VS(T.waves), fragmentShader: SEA_FS(q()), transparent: true, depthWrite: true, fog: true,
  });
  sea = new THREE.Mesh(seaGeometry(T.seg, 520), mat); sea.name = 'coast_sea'; sea.frustumCulled = false; sea.renderOrder = 2;
  // 跟随镜头（4 米对齐）：在渲染前取真实镜头位置（不依赖本体更新顺序）
  sea.onBeforeRender = (_r, _s, cam) => { if (!sea) return; camPos.setFromMatrixPosition(cam.matrixWorld); const p = camPos; sea.position.set(Math.round(p.x / 4) * 4, 0, Math.round(p.z / 4) * 4); sea.updateMatrixWorld(); };
  sea.userData.outlineParameters = { visible: false };
  root.add(sea);
  Object.assign(seaStats, { seg: T.seg, waves: v2 ? WAVE_N[q()][0] : T.waves, spray: T.spray, v2, fragWaves: v2 ? WAVE_N[q()][1] : 0 });
  if (T.spray > 0) { spray = new Spray(T.spray); root.add(spray.points); }
}
export function seaLeave() { /* 网格留在区域组里，随组隐藏 */ }

/** 某点（局部）当前的大致浪高系数（飞溅 / 音效用；与 shader 同一套振幅规则，只取主波） */
export function seaAmpAt(lx: number, lz: number): number {
  const st = seaU.uStorm.value * stormW(lx, lz); return 0.22 + (1.45 - 0.22) * st;
}

/** 每帧：网格跟随镜头（4 米对齐），飞溅粒子 */
export function seaUpdate(dt: number, cam: THREE.Vector3) {
  if (!sea) return;
  seaStats.maxAmp = +(0.22 + (1.45 - 0.22) * seaU.uStorm.value).toFixed(2);
  spray?.update(dt, cam);
}

// ---------------------------------------------------------------- 飞溅水花（拍岸 / 拍栈桥 / 礁石）：GPU 点精灵（圆形柔边，按距离缩放）
const BREAKS: [number, number, number][] = (() => {   // [x, z, 强度]：岸线采样 + 栈桥桩 + 灯塔礁 + 沉船龙骨
  const out: [number, number, number][] = [];
  for (let z = -100; z <= 90; z += 7) { out.push([eastCoast(z) + 1.5, z, 0.7]); out.push([westCoast(z) - 1.5, z, 0.5]); }
  for (const s of PIER) { const L = Math.hypot(s.bx - s.ax, s.bz - s.az); for (let t = 0; t <= L; t += 6) { const x = s.ax + (s.bx - s.ax) * t / L, z = s.az + (s.bz - s.az) * t / L; if (shoreD(x, z) > 1) { out.push([x + (s.bz - s.az) / L * s.hw, z - (s.bx - s.ax) / L * s.hw, 1]); out.push([x - (s.bz - s.az) / L * s.hw, z + (s.bx - s.ax) / L * s.hw, 1]); } } }
  for (let a = 0; a < 6.28; a += 0.6) out.push([ISLET.x + Math.cos(a) * (ISLET.r + 1), ISLET.z + Math.sin(a) * (ISLET.r + 1), 1.2]);
  out.push([LIGHTHOUSE.x + 4, LIGHTHOUSE.z, 1]);
  return out;
})();
class Spray {
  points: THREE.Points; private pos: Float32Array; private vel: Float32Array; private life: Float32Array; private size: Float32Array; private n: number; private acc = 0; private next = 0;
  constructor(n: number) {
    this.n = n; this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n).fill(-1); this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uFlash: seaU.uFlash, uScale: { value: 600 } },
      vertexShader: `attribute float aLife; attribute float aSize; varying float vL; uniform float uScale;
        varying float vNear; void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vNear = smoothstep(3.0, 9.0, -mv.z); gl_PointSize = aLife < 0.0 ? 0.0 : min(48.0, aSize * uScale * 0.6 / max(1.0, -mv.z)); }`,
      fragmentShader: `varying float vL; varying float vNear; uniform float uFlash; void main(){ if (vL < 0.0 || vNear < 0.01) discard; vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.1, r) * min(1.0, vL * 3.0) * 0.5 * vNear; gl_FragColor = vec4(vec3(0.82, 0.88, 0.9) * (0.75 + uFlash * 1.2), a); }` });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.name = 'coast_spray'; this.points.renderOrder = 3;
  }
  private emit(x: number, y: number, z: number, k: number) {
    for (let c = 0; c < this.n; c++) { const i = (this.next + c) % this.n; if (this.life[i] < 0) { this.next = i + 1;
      this.pos.set([x + (Math.random() - 0.5) * 1.6, y, z + (Math.random() - 0.5) * 1.6], i * 3);
      const up = (2.5 + Math.random() * 5) * k; this.vel.set([(Math.random() - 0.5) * 3 * k, up, (Math.random() - 0.5) * 3 * k], i * 3);
      this.life[i] = 0.9 + Math.random() * 0.8 * k; this.size[i] = 0.5 + Math.random() * 0.9 * k; return; } }
  }
  /** 11-16 涉水溅水：落脚处一小撮低矮水花（世界坐标） */
  kick(x: number, z: number, k: number) {
    for (let j = 0; j < 5; j++) { const i = this.next % this.n; this.next = i + 1;
      this.pos.set([x + (Math.random() - 0.5) * 0.5, SEA_Y + 0.1, z + (Math.random() - 0.5) * 0.5], i * 3);
      this.vel.set([(Math.random() - 0.5) * 1.2, (1.2 + Math.random() * 1.6) * k, (Math.random() - 0.5) * 1.2], i * 3);
      this.life[i] = 0.45 + Math.random() * 0.3; this.size[i] = 0.18 + Math.random() * 0.22; }
  }
  update(dt: number, cam: THREE.Vector3) {
    const st = seaU.uStorm.value; this.acc += dt;
    // 发射：离镜头 70 米内的拍岸点，按浪强度随机成团
    if (this.acc > 0.08) {
      const tick = this.acc; this.acc = 0;
      for (const [x, z, k0] of BREAKS) {
        const wx = origin.x + x, wz = origin.z + z; if (Math.abs(wx - cam.x) > 70 || Math.abs(wz - cam.z) > 70) continue;
        const k = k0 * (0.25 + stormW(x, z) * st * 1.4);
        if (Math.random() < tick * 0.18 * k) { const m = Math.round(4 + 10 * k); for (let j = 0; j < m; j++) this.emit(wx, SEA_Y + 0.3, wz, Math.min(1.6, 0.5 + k)); seaStats.splashes++; }
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] < 0) continue;
      this.life[i] -= dt; if (this.life[i] <= 0) { this.life[i] = -1; continue; }
      const o = i * 3; this.vel[o + 1] -= 9.8 * dt * 0.8; this.vel[o] += 3 * st * dt;   // 风把水沫往西吹
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
    }
    const g = this.points.geometry; (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true; (g.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true; (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }
}
