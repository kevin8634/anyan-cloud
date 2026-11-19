// ======================================================================
// 11-15 海天共用件（本体 + DLC）：同一套天体模型 / 时段色表 / 天空（大气、积云、卷云、星、银河、月、日盘）/ exp-sin 浪
//   · 天体：游戏钟点（hudclock.gameClock，只读）→ 纬度 35° 天球：太阳赤纬 +10°（6:02 日出、18:58 日落），月亮赤纬 −4°、比满月早约 1.9 小时
//     （盈凸月，相位由太阳方向在月面上实际打光），星空按同一时角整体转动
//   · 时段色表：按太阳仰角 7 键（−18 / −9 / −3 / 1.5 / 7 / 20 / 55°）插值天顶 / 朝阳地平线 / 背阳地平线 / 光晕 / 日光 / 云亮暗面 / 云量 / 深橙铺开 / 曝光
//   · 天空 GLSL：ssGLSL(hooks) 生成；风暴云 / 闪电 / 雨幕等天气由调用方以钩子注入（沉钟海岸灯塔暴风雨留在 DLC coast_seasky.ts）
//   · 本体：makeCineSky 的穹顶、daynight 的光色、cineSunOffset 的太阳方向、雾内散射、天空 PMREM、体积光颜色、河 / 沼泽水面都读这里
//   ?off=seasky（或 localStorage darkrock_cine_off 含 seasky）→ 本体与海岸都回旧版
//   代码自写；思路：Rhett 参考视频（exp-sin 叠加波、1/d 光晕、fbm 云）、专长包第 1 / 9 / 10 / 43 / 55 步、Painted Valley 时段表（MIT，仅思路）
// ======================================================================
import * as THREE from 'three';
import { gameClock } from './hudclock';

/** ?off=seasky 回旧版 */
export function seaSkyOn(): boolean {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return !`${q},${ls}`.split(',').map(s => s.trim()).includes('seasky');
  } catch { return true; }
}

const C3 = () => new THREE.Vector3();
/** 天 / 海共用 uniform（按引用共享） */
export const ssU = {
  ssSunD: { value: new THREE.Vector3(0, 1, 0) }, ssMoonD: { value: new THREE.Vector3(0, -1, 0) },
  ssSunC: { value: C3() }, ssGlowC: { value: C3() }, ssZen: { value: C3() }, ssHor: { value: C3() }, ssHorA: { value: C3() },
  ssCLit: { value: C3() }, ssCDk: { value: C3() }, ssMoonC: { value: C3() }, ssAmb: { value: C3() },
  /** x = 星空可见，y = 太阳在地平线上，z = 月亮可见，w = 云量 */
  ssK: { value: new THREE.Vector4(0, 1, 0, 0.5) },
  /** x = 白天程度（水体亮度），y = 海面雾浓度 1/米，z = 风暴，w = 近地平线白雾（海岸礁湾） */
  ssK2: { value: new THREE.Vector4(1, 0.004, 0, 0) },
  ssStarRot: { value: new THREE.Matrix3() }, ssWind: { value: new THREE.Vector2() }, ssT: { value: 0 },
  /** 闪电（天气钩子用；本体恒 0） */
  ssFlash: { value: 0 }, ssFlashD: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
  /** x = 日出 / 黄昏深橙铺开程度，y = 天 / 海曝光倍数，zw 备用 */
  ssK3: { value: new THREE.Vector4(0, 1, 0, 0) },
};

export type SsTier = 'low' | 'medium' | 'high' | 'ultra';
/** 各档：云层数（穹顶 / 水面反射）、星空层数、银河、积云（Worley 圆团，高 / 超高） */
export const SS_TIER = { low: { oct: 3, roct: 0, stars: 1, mw: 0, puffy: 0 }, medium: { oct: 4, roct: 2, stars: 2, mw: 1, puffy: 0 }, high: { oct: 5, roct: 3, stars: 2, mw: 1, puffy: 1 }, ultra: { oct: 5, roct: 4, stars: 2, mw: 1, puffy: 1 } } as const;
/** 积云开关（高 / 超高）：着色器前缀 */
export const ssDefs = (t: SsTier) => (SS_TIER[t].puffy ? '#define SS_PUFFY 1\n' : '');

/** 天气钩子：atmos = ssAtmos 末尾追加（可用 d / y / storm / c）；stormCloud = fbm 云风暴分支（可用 cp / cq / b / b2 / thick / full / col）；post = ssWeatherPost 函数体（d / c / storm） */
export type SsHooks = { atmos?: string; stormCloud?: string; post?: string };
/** 共用 GLSL：天色 / 云 / 星 / 月（穹顶与水面反射都用） */
export function ssGLSL(h: SsHooks = {}): string { return /* glsl */ `
uniform vec3 ssSunD; uniform vec3 ssMoonD; uniform vec3 ssSunC; uniform vec3 ssGlowC; uniform vec3 ssZen; uniform vec3 ssHor; uniform vec3 ssHorA;
uniform vec3 ssCLit; uniform vec3 ssCDk; uniform vec3 ssMoonC; uniform vec3 ssAmb; uniform vec4 ssK; uniform vec4 ssK2;
uniform mat3 ssStarRot; uniform vec2 ssWind; uniform float ssT; uniform float ssFlash; uniform vec3 ssFlashD; uniform vec4 ssK3;
float ssSq(float x){ return x * x; }
// 11-16：非有限数（NaN / Inf）判定走位模式——D3D 快速数学下 isnan() 会被优化掉
bool ssBad(float x){ return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
vec3 ssFinite(vec3 c, vec3 fb){ return (ssBad(c.r) || ssBad(c.g) || ssBad(c.b)) ? fb : min(max(c, vec3(0.0)), vec3(64.0)); }
float ssH3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float ssH2(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ssN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ssH2(i), ssH2(i + vec2(1, 0)), f.x), mix(ssH2(i + vec2(0, 1)), ssH2(i + vec2(1, 1)), f.x), f.y); }
float ssFbm(vec2 p, int oct){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a * ssN(p); n += a; p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 7.7); a *= 0.5; } return s / max(n, 1e-3); }
// 风暴天色（与旧版穹顶同一组色）
vec3 ssStormSky(float y){ return mix(vec3(0.030, 0.034, 0.042), vec3(0.025, 0.03, 0.04), smoothstep(-0.02, 0.55, y)); }
// v3 太阳贴地程度（0 = 高空，1 = 贴地平线）：日盘放大 / 压扁 / 偏橙红、光晕加宽都按它
float ssHz(){ return 1.0 - smoothstep(0.0, 0.16, ssSunD.y); }
// 地平线色（按方位：朝阳暖、背阳粉紫）
vec3 ssHorAt(vec3 d){
  vec2 sh = ssSunD.xz; float sl = length(sh); vec2 dh = d.xz; float dl = length(dh);
  float muH = (sl > 1e-4 && dl > 1e-4) ? dot(dh / dl, sh / sl) : 0.0;
  // 11-16 黑屏修复：D3D（ANGLE）下 normalize / 除长度是近似 rcp，两个单位向量点积可略小于 -1 → pow(负数) = NaN；
  //   主画面里只是背阳方位一两个像素（NaN 修补盖掉），但 SkyEnv 把整球烘进 PMREM 时 NaN 被模糊扩散到整张环境贴图 → 所有 PBR（地面 HD / 草木）全黑，直到下一次重烘（30 游戏分钟 = 现实 30 秒）
  return mix(ssHorA, ssHor, pow(clamp(muH * 0.5 + 0.5, 0.0, 1.0), 3.5));
}
// 天色：按高度排（地平线 → 天顶）+ 太阳光晕 1/d + 米氏 + 月晕；d.y < 0 时给地平线色（海的尽头）
vec3 ssAtmos(vec3 d, float storm){
  float y = d.y, h = max(y, 0.0);
  vec3 hor = ssHorAt(d);
  // v4 日出 / 黄昏：朝阳一侧深橙往上铺得更高（参考 55 / 70 s），背阳一侧仍很快过渡到天顶
  vec2 sxz = ssSunD.xz / max(length(ssSunD.xz), 1e-4), dxz = d.xz / max(length(d.xz), 1e-4);
  float spread = ssK3.x * (0.25 + 0.75 * pow(clamp(dot(sxz, dxz) * 0.5 + 0.5, 0.0, 1.0), 2.0));
  vec3 c = mix(hor, ssZen, pow(smoothstep(0.0, mix(0.5, 1.05, spread), h), mix(0.3, 0.85, spread)));
  // 地平线上方一道更饱和的暖带（视频：橙带在地平线略上）
  c = mix(c, hor * vec3(1.08, 0.86, 0.78), exp(-h * 26.0) * 0.35);
  float dd = length(d - ssSunD), mu = max(dot(d, ssSunD), 0.0);
  float hz = ssHz();
  float glow = 0.045 / (dd + 0.045) - 0.035;
  c += ssGlowC * (max(glow, 0.0) * 1.25 + pow(mu, 24.0) * 0.3) * mix(1.0, 0.55, smoothstep(0.0, 0.5, h));
  // v3 多层光晕：近处强核（高斯 ~2°）+ 宽柔晕（~12°）+ 贴地时沿地平线的横向光带（参考帧 70 / 90 s）
  c += ssGlowC * vec3(1.0, 0.8, 0.6) * (exp(-dd * dd / 0.0012) * mix(0.4, 0.5, hz) + exp(-dd * dd / 0.045) * mix(0.10, 0.22, hz));
  {
    vec2 sh2 = ssSunD.xz / max(length(ssSunD.xz), 1e-4), dh2 = d.xz / max(length(d.xz), 1e-4);
    float az = 1.0 - dot(sh2, dh2), dy = d.y - max(ssSunD.y, 0.0) * 0.6;
    float band = exp(-dy * dy / 0.0011) * (exp(-az / 0.05) * 0.8 + exp(-az / 0.35) * 0.35);
    c += ssGlowC * vec3(1.0, 0.75, 0.55) * band * hz * 0.7;
  }
  c += ssSunC * pow(mu, 900.0) * 0.06 + ssSunC * pow(mu, 3000.0) * 0.12 * hz;   // 紧贴日盘的米氏
  float dm = length(d - ssMoonD);
  c += ssMoonC * (0.0035 / (dm * dm + 0.0012) * 0.0045 + 0.02 / (dm + 0.02) * 0.03) * ssK.z;   // 月晕（紧 + 宽）
  if (y < 0.0) c *= mix(1.0, 0.86, smoothstep(0.0, -0.25, y));
  c = mix(c, ssStormSky(y), storm);
${h.atmos ?? ''}
  c = mix(c, ssHorAt(d) * 1.05 + vec3(0.02), ssK2.w * 0.22 * (1.0 - smoothstep(0.0, 0.35, y)));   // 礁湾：近地平线更白的雾
  return c;
}
// 云 v3：中低层积云（两级 domain warp + 高频侵蚀；背光一侧边缘硬、向光一侧薄边透金）+ 高空卷云薄层；
//   风暴：云底压低、更厚更暗、底部翻滚（随时间流动的扭曲）、闪电时云内部斑块发亮；full = 0 时（海面反射）走便宜版
vec4 ssCloudsFbm(vec3 d, float storm, int oct, int full){
  if (oct <= 0 || d.y <= 0.0) return vec4(0.0);
  float tR = ssT * (0.004 + 0.03 * storm);                        // 翻滚速度
  vec2 cp = d.xz / (d.y + mix(0.085, 0.045, storm)) * mix(0.8, 0.62, storm) + ssWind;
  vec2 w1 = full > 0 ? vec2(ssFbm(cp * 0.55 + vec2(0.0, tR), 3), ssFbm(cp * 0.55 + vec2(5.2, 1.3) - tR, 3)) - 0.5
                     : vec2(ssN(cp * 0.7), ssN(cp * 0.7 + 5.2)) - 0.5;
  cp += w1 * mix(0.5, 1.2, storm);
  vec2 cq = cp * vec2(1.0, 1.6);
  float b = ssFbm(cq, oct);
  if (full > 0) {                                                  // 高频细节：侵蚀边缘（只在阈值附近起作用）
    vec2 w2 = vec2(ssN(cq * 3.1 + 2.0), ssN(cq * 3.1 + 8.0)) - 0.5;
    float det = ssN(cq * 7.3 + w2 * 1.4) * 0.62 + ssN(cq * 15.7 - w2) * 0.38;
    b += (det - 0.5) * 0.2 * (1.0 - 0.7 * smoothstep(0.45, 0.75, b));   // 云心保持实，侵蚀集中在边缘
  }
  float cov = mix(ssK.w, 0.95, storm);
  float th = 0.66 - cov * 0.34;                                   // 云量 → 阈值（fbm 均值约 0.5）
  if (b < th - 0.02 && full <= 0) return vec4(0.0);
  vec3 L = ssSunD.y > -0.2 ? ssSunD : ssMoonD;
  vec2 ld = L.xz; float ll = length(ld); ld = ll > 1e-4 ? ld / ll * (full > 0 ? 0.11 : 0.2) : vec2(0.0);
  float b2 = ssFbm((cp + ld) * vec2(1.0, 1.6), max(oct - 1, 1));
  float lit = clamp(0.5 + (b - b2) * (full > 0 ? 9.0 : 6.5), 0.0, 1.0);
  float c = smoothstep(th, th + (full > 0 ? mix(0.028, 0.10, lit) : 0.14), b);       // 背光（云底）边硬，向光边软
  float dd = length(d - ssSunD), mu = max(dot(d, ssSunD), 0.0);
  float lowSun = 1.0 - smoothstep(0.05, 0.3, ssSunD.y);
  float near = 0.12 / (dd + 0.12);
  vec3 col = mix(ssCDk, ssCLit, lit * lit * mix(1.0, 0.25 + 0.75 * near, lowSun));
  float thick = smoothstep(th + 0.05, th + 0.3, b);
  col *= mix(1.0, 0.55, thick * (1.0 - lit) * mix(0.6, 1.0, lowSun));   // 厚的背光处更暗（层次）
  float edge = 1.0 - c;
  col += ssGlowC * (0.06 / (dd + 0.06)) * (0.35 + 1.4 * edge) * (1.0 - 0.5 * lit) + ssSunC * pow(mu, 40.0) * 0.05 * edge;
  // 金边：向光一侧、刚过阈值的薄带，离太阳越近越亮
  float rim = smoothstep(th - 0.01, th + 0.03, b) * (1.0 - smoothstep(th + 0.04, th + 0.16, b)) * smoothstep(0.35, 0.9, lit);
  col += ssGlowC * rim * (0.22 / (dd + 0.22)) * mix(0.25, 1.6, lowSun) * (full > 0 ? 1.0 : 0.6);
  col += ssHorAt(d) * 0.12 * (1.0 - lit) * (1.0 - smoothstep(-0.05, 0.25, ssSunD.y)) * smoothstep(-0.25, 0.0, ssSunD.y);
  col = mix(col, ssHorAt(d) * 0.8, smoothstep(0.18, 0.0, d.y) * 0.4);   // 远处云融进地平线
  // 风暴云：墨蓝紫黑，底部翻滚（流动扭曲的明暗带），闪电时内部斑块发亮
  if (storm > 0.001) {
${h.stormCloud ?? '    col = mix(col, vec3(0.03, 0.034, 0.045) * mix(0.6, 1.0, smoothstep(0.3, 0.95, b2)), storm);\n'}  }
  float a = c * smoothstep(0.0, 0.07, d.y) * mix(0.96, 0.99, storm);
  return vec4(col, a);
}
// v4 高空卷云薄层（积云之后合成；穹顶全量路径）
vec4 ssCirrus(vec3 d, vec4 cu, float storm){
  if (d.y <= 0.0) return cu;
  float dd = length(d - ssSunD);
  vec2 cc = d.xz / (d.y + 0.3) * 0.55 + ssWind * 1.7;
  cc = mat2(0.8, -0.6, 0.6, 0.8) * cc;
  float ci = ssFbm(vec2(cc.x * 0.5, cc.y * 3.2) + vec2(ssN(cc * 1.3), 0.0) * 0.8, 4);
  float ca = smoothstep(0.52, 0.78, ci) * 0.42 * (1.0 - storm) * smoothstep(0.02, 0.2, d.y);
  vec3 cc3 = mix(ssCLit * 0.85, ssCDk * 1.4, 0.3) + ssGlowC * (0.15 / (dd + 0.15)) * 0.8;
  float A = cu.a + ca * (1.0 - cu.a);
  return vec4((cu.rgb * cu.a + cc3 * ca * (1.0 - cu.a)) / max(A, 1e-4), A);   // 卷云在积云后面（前后合成）
}
// v4 积云（高 / 超高档，SS_PUFFY）：Worley 圆团（3 级）叠在 fbm 云团分布上 → 一团一团、边缘清楚；朝太阳 3 步光线步进求透光，
//   亮边（向光、薄处、近太阳）+ 厚处暗芯；正午头顶的云按仰角缩小、云量减少。full = 0（海面反射）只用云团分布（便宜，位置一致）
float ssWor(vec2 p){
  vec2 i = floor(p), f = fract(p); float md = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), c = i + g;
    vec2 r = g + vec2(ssH2(c), ssH2(c + 19.7)) * 0.86 + 0.07 - f; md = min(md, dot(r, r));
  }
  return sqrt(md);
}
vec2 ssCuP(vec3 d){
  vec2 cp = d.xz / (d.y + 0.085) * 0.8;
  cp *= 1.0 + 1.1 * d.y * d.y;                                  // 头顶的云缩小（平面投影下头顶的云显得最大）
  return cp + ssWind;
}
float ssCuMask(vec2 cp){ return ssFbm(cp * 0.45 + vec2(1.7, 4.1), 3); }
float ssCuTh(vec3 d){
  float cov = ssK.w * mix(1.0, 0.62, smoothstep(0.5, 1.0, d.y) * smoothstep(0.3, 0.8, ssSunD.y));   // 正午头顶云少
  return 0.635 - cov * 0.30;
}
float ssCuDens(vec2 cp, float m, float th, float lod){
  float pf = (1.0 - ssWor(cp * 1.25)) * 0.60 + (1.0 - ssWor(cp * 2.7 + 3.3)) * 0.27 * lod + (1.0 - ssWor(cp * 5.9 + 7.1)) * 0.13 * lod + 0.21 * (1.0 - lod);
  return (m - th) * 3.0 + (pf - 0.60) * 1.6;
}
vec4 ssCloudsPuffy(vec3 d, int full){
  if (d.y <= 0.0) return vec4(0.0);
  vec2 cp = ssCuP(d);
  float th = ssCuTh(d), m = ssCuMask(cp);
  float dd = length(d - ssSunD), mu = max(dot(d, ssSunD), 0.0);
  float lowSun = 1.0 - smoothstep(0.05, 0.3, ssSunD.y);
  float near = 0.12 / (dd + 0.12);
  vec3 L = ssSunD.y > -0.2 ? ssSunD : ssMoonD;
  if (full <= 0) {                                              // 反射：云团分布 + 平均明暗
    float dn = (m - th) * 3.0;
    float a = smoothstep(-0.04, 0.22, dn) * smoothstep(0.0, 0.07, d.y) * 0.95;
    vec3 col = mix(ssCDk, ssCLit, 0.45 + 0.3 * near) + ssGlowC * near * 0.35 * (0.4 + lowSun);
    col = mix(col, ssHorAt(d) * 0.8, smoothstep(0.18, 0.0, d.y) * 0.4);
    return vec4(col, a);
  }
  float fp = length(fwidth(cp));                                // 一个像素跨过的云平面距离：细节小于约 1.5 像素就淡出（地平线不闪）
  float lod = 1.0 - smoothstep(0.06, 0.25, fp);
  float dn = ssCuDens(cp, m, th, lod);
  float ew = 0.03 + fp * 0.8;
  if (dn < -ew) return vec4(0.0);
  // 朝光源 3 步（只用云团分布 + 第 1 级圆团，便宜）
  vec2 ld = L.xz; float ll = length(ld); ld = ll > 1e-4 ? ld / ll : vec2(0.0);
  float step0 = mix(0.10, 0.05, smoothstep(0.1, 0.8, L.y));
  float od = 0.0;
  for (int k = 1; k <= 3; k++) {
    vec2 q = cp + ld * step0 * float(k);
    float mq = ssCuMask(q);
    od += max((mq - th) * 3.0 + ((1.0 - ssWor(q * 1.25)) * 0.60 + 0.24 - 0.60) * 1.6, 0.0);
  }
  float T = exp(-od * mix(2.2, 1.1, smoothstep(0.1, 0.8, L.y)));
  float thin = 1.0 - smoothstep(0.0, 0.45, dn);
  float core = smoothstep(0.1, 0.9, dn);
  vec3 col = mix(ssCDk, ssCLit, T * mix(1.0, 0.35 + 0.65 * near, lowSun));
  col *= mix(1.0, 0.62, core * (1.0 - T));                      // 厚处暗芯（层次）
  col *= mix(0.58, 1.0, exp(-max(dn, 0.0) * 1.8)) * mix(1.0, 1.12, thin);   // 从下往上看：厚的云底灰，薄边亮（正午也有层次）
  col += ssGlowC * near * thin * T * mix(0.35, 1.7, lowSun);   // 向光薄边：近太阳金边
  col += ssGlowC * (0.05 / (dd + 0.05)) * thin * 0.6;           // 贴近日盘的透光
  col += ssSunC * pow(mu, 40.0) * 0.04 * thin;
  col += ssHorAt(d) * 0.18 * (1.0 - T) * lowSun * smoothstep(0.35, 0.0, d.y) * smoothstep(-0.25, 0.0, ssSunD.y);   // 低太阳：近地平线的云底被映暖
  col = mix(col, ssHorAt(d) * 0.8, smoothstep(0.16, 0.0, d.y) * 0.45);
  float a = smoothstep(-ew, ew, dn) * smoothstep(0.0, 0.06, d.y) * 0.97;
  return vec4(col, a);
}
vec4 ssClouds(vec3 d, float storm, int oct, int full){
  if (oct <= 0 || d.y <= 0.0) return vec4(0.0);
  vec4 c;
#ifdef SS_PUFFY
  if (storm < 0.6) {
    c = ssCloudsPuffy(d, full);
    if (storm > 0.001) c = mix(c, ssCloudsFbm(d, storm, oct, full), smoothstep(0.0, 0.6, storm));
  } else c = ssCloudsFbm(d, storm, oct, full);
#else
  c = ssCloudsFbm(d, storm, oct, full);
#endif
  if (full > 0 && oct >= 4) c = ssCirrus(d, c, storm);
  return c;
}
// 天气后处理（海岸风暴雨幕等由调用方给；默认不变）
vec3 ssWeatherPost(vec3 d, vec3 c, float storm){
${h.post ?? '  return c;'}
}
// 一层星：3D 格点，每格至多一颗；按像素定宽（不随距离 / 分辨率碎成点）
vec3 ssStarLayer(vec3 e, float K, float dens, float pix, float bright){
  vec3 g = e * K, c = floor(g);
  float h = ssH3(c);
  if (h > dens) return vec3(0.0);
  vec3 sp = normalize((c + 0.3 + 0.4 * vec3(ssH3(c + 3.1), ssH3(c + 7.7), ssH3(c + 1.3))) / K);
  float a = length(e - sp), r = pix * 0.42;
  float m = pow(ssH3(c + 11.0), 7.0);
  float s = exp(-a * a / (r * r));
  float tw = 1.0 + 0.4 * sin(ssT * (2.0 + 6.0 * ssH3(c + 5.0)) + h * 90.0) * (0.3 + 0.7 * m);
  vec3 tint = mix(vec3(0.75, 0.85, 1.25), vec3(1.25, 0.98, 0.72), ssH3(c + 9.0));
  return tint * s * (0.012 + 2.6 * m) * tw * bright;
}
vec3 ssMilky(vec3 e){
  vec3 n = normalize(vec3(0.32, 0.48, 0.82)), t1 = normalize(cross(n, vec3(0.0, 0.0, 1.0))), t2 = cross(n, t1);
  float b = dot(e, n); vec2 q = vec2(dot(e, t1), dot(e, t2)) * 6.0;
  float band = exp(-b * b / 0.03), core = exp(-b * b / 0.006);
  float f = ssFbm(q, 4), f2 = ssN(q * 3.1 + 5.0);
  float dust = smoothstep(0.5, 0.75, ssFbm(q * 1.7 + 9.0, 3)) * exp(-b * b / 0.0025);
  vec3 c = vec3(0.30, 0.34, 0.48) * band * (0.25 + 0.9 * f) + vec3(0.55, 0.45, 0.35) * core * (0.3 + 0.7 * f2);
  return c * (1.0 - dust * 0.85) * 0.16;
}
vec3 ssStars(vec3 d, float pix, int layers, int mw){
  vec3 e = ssStarRot * d;
  vec3 s = ssStarLayer(e, 95.0, 0.22, pix, 1.0);
  if (layers > 1) s += ssStarLayer(e, 38.0, 0.45, pix * 1.2, 1.4);
  if (mw > 0) { s += ssMilky(e); s += ssStarLayer(e, 170.0, 0.9, pix * 0.8, 0.5) * exp(-ssSq(dot(e, normalize(vec3(0.32, 0.48, 0.82)))) / 0.03); }
  float ext = smoothstep(-0.01, 0.3, d.y);                      // 近地平线消光
  return s * ext * ssK.x;
}
// 月亮：球面按太阳方向打光（月相自然出现）+ 月海斑
vec3 ssMoonDisc(vec3 d, float pix){
  vec3 m = ssMoonD; float cm = dot(d, m); if (cm < 0.99) return vec3(0.0);
  float R = ${MOON_STAGE_OFF ? '0.019' : MOON08_OFF ? '0.05' : '0.04'};   // 11-18 Rhett「月亮缩到 0.8 倍可以」；?off=moon08 回 0.05
  vec3 up = abs(m.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(m, up)), t2 = cross(t1, m);
  vec3 q = d - m * cm; vec2 uv = vec2(dot(q, t1), dot(q, t2)) / R;
  float r = length(uv); float edge = 1.0 - smoothstep(1.0 - 1.5 * pix / R, 1.0, r);
  if (edge <= 0.0) return vec3(0.0);
  float z = sqrt(max(0.0, 1.0 - r * r));
  vec3 n = t1 * uv.x + t2 * uv.y - m * z;
  float lit = smoothstep(-0.03, 0.10, dot(n, ssSunD));
  float mar = ssFbm(uv * 1.9 + 4.0, 3);
  float alb = 0.82 - 0.38 * smoothstep(0.42, 0.62, mar);
  return ssMoonC * (alb * lit * 2.6 + 0.03) * edge * ssK.z;
}
// v3 日盘：高空约 1.3°、贴地平线放大到约 2.4° 并略压扁（大气折射 / 视错觉），颜色偏橙红、亮度降下来不糊成白点；轻微临边昏暗
vec3 ssSunDisc(vec3 d, float pix){
  float mu = dot(d, ssSunD); if (mu < 0.998) return vec3(0.0);
  float hz = ssHz(), R = mix(0.0115, 0.026, hz);
  vec3 t1 = normalize(cross(ssSunD, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, ssSunD);
  vec2 uv = vec2(dot(d, t1), dot(d, t2) / mix(1.0, 0.84, hz)) / R;
  float r = length(uv), aa = max(1.5 * pix / R, 0.03);
  float m = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  float limb = mix(0.7, 1.0, sqrt(max(0.0, 1.0 - r * r)));
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.82, 0.62), hz);
  return ssSunC * tint * m * limb * mix(2.4, 1.1, hz) * smoothstep(-0.015, 0.004, d.y);
}
// 整片天：discs = 画日盘 / 月盘 / 星（穹顶）；海面反射不画（反光带由镜面项给）
vec3 ssSky(vec3 d, float storm, float pix, int oct, int stars, int mw, bool discs){
  vec3 c = ssAtmos(d, storm);
  vec4 cl = ssClouds(d, storm, oct, discs ? 1 : 0);
  if (discs) {
    float clear = (1.0 - cl.a) * (1.0 - storm);
    if (stars > 0) c += ssStars(d, pix, stars, mw) * clear;
    c += ssMoonDisc(d, pix) * (1.0 - cl.a * 0.92) * (1.0 - storm);
    c += ssSunDisc(d, pix) * (1.0 - cl.a * 0.97) * (1.0 - storm);
  }
  return ssWeatherPost(d, mix(c, cl.rgb, cl.a), storm);
}
`; }

// ---------------------------------------------------------------- exp-sin 叠加波（海面 / 河面共用）
export const WAVE_GLSL = /* glsl */ `
float wvLost;
// 返回 (高度 0..1 均值约 0.47, ∂h/∂x, ∂h/∂z)；pix = 一个像素在水面上的米数（> 0 时把短于约 3 像素的波淡出，并把丢掉的坡度方差记进 wvLost）
vec3 wvSum(vec2 p, float t, float drag, int n, float pix){
  float it = 0.0, fr = 0.16, w = 1.0, sw = 0.0, h = 0.0; vec2 g = vec2(0.0); wvLost = 0.0;
  for (int i = 0; i < 40; i++){
    if (i >= n) break;
    vec2 D = normalize(vec2(sin(it), cos(it)) + vec2(0.55, 0.25));
    float x = dot(D, p) * fr + t * sqrt(9.8 * fr) * 0.85 + it;
    float e = exp(sin(x) - 1.0), dx = e * cos(x);
    float fade = pix > 0.0 ? 1.0 - smoothstep(0.22, 0.5, pix * fr * 0.159) : 1.0;
    h += e * w; g += D * (dx * fr * w * fade);
    wvLost += (1.0 - fade) * w * w * fr * fr * 0.25;
    p -= D * (dx * w * drag / 0.16);
    sw += w; w *= 0.8; fr *= 1.18; it += 1232.399963;
  }
  wvLost /= sw * sw;
  return vec3(h, g) / sw;
}
// Beckmann 镜面（a2 = 2·坡度方差），返回反射率 × cos（乘以光源照度即可）
float wvSpec(vec3 n, vec3 V, vec3 L, float a2){
  vec3 Hh = normalize(V + L); float nh = max(dot(n, Hh), 1e-3), nv = max(dot(n, V), 0.05), nl = max(dot(n, L), 0.0);
  float c2 = nh * nh, t2 = (1.0 - c2) / c2;
  float D = exp(-t2 / a2) / (3.14159 * a2 * c2 * c2);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  return D * F / (4.0 * nv) * step(0.0, nl) * smoothstep(0.0, 0.08, L.y + 0.02);
}`;

// ---------------------------------------------------------------- 天球：钟点 → 太阳 / 月亮 / 星空方向
const LAT = THREE.MathUtils.degToRad(35), DEC_SUN = THREE.MathUtils.degToRad(10), DEC_MOON = THREE.MathUtils.degToRad(-4), NOON = 12.5;
/** 局部方向（x 东、y 上、z 南）：赤纬 dec、时角 H（0 = 正南中天，向西增大） */
function celestial(dec: number, H: number, out: THREE.Vector3) {
  const ex = Math.cos(dec) * Math.cos(H), ey = Math.cos(dec) * Math.sin(H), ez = Math.sin(dec);
  return out.set(-ey, Math.cos(LAT) * ex + Math.sin(LAT) * ez, Math.sin(LAT) * ex - Math.cos(LAT) * ez);
}
/** active = 海岸（DLC）正在接管（本体每帧那份就不写）；baseT = 本体最近一次 tick 的时间（秒） */
export const ssState = { hour: 8, override: null as number | null, moonLag: 0.5, sunEl: 0, moonEl: 0, night: 0, lightEl: 0, palIdx: 0, hooked: false, active: false, renders: 0, baseTicks: 0, baseT: -1 };
/** 当前钟点（调试定住时用定住值） */
export function seaSkyHour(): number { return ssState.override ?? gameClock().frac * 24; }

type Key = { el: number; zen: number[]; hor: number[]; horA: number[]; glow: number[]; sun: number[]; cLit: number[]; cDk: number[]; day: number; cov: number; warm: number; ex: number };
// 时段关键表（线性 HDR；按太阳仰角插值）。数值本项目自调，对照视频 50–100 s 的日出帧
//   v4（参考 55 / 70 s）：−3° / 1.5° / 7° 三键改成更饱和的深橙（地平线红橙、云底橙红、暗面紫褐），warm = 朝阳一侧深橙往上铺开的程度；夜里两键（−18° / −9°）不变
const KEYS: Key[] = [
  { el: -18, zen: [0.0028, 0.0042, 0.012], hor: [0.014, 0.019, 0.038], horA: [0.011, 0.015, 0.031], glow: [0, 0, 0], sun: [0, 0, 0], cLit: [0.012, 0.014, 0.022], cDk: [0.004, 0.005, 0.009], day: 0.06, cov: 0.42, warm: 0, ex: 1 },
  { el: -9, zen: [0.007, 0.010, 0.032], hor: [0.05, 0.035, 0.065], horA: [0.02, 0.022, 0.045], glow: [0.08, 0.03, 0.04], sun: [0, 0, 0], cLit: [0.04, 0.028, 0.05], cDk: [0.010, 0.010, 0.022], day: 0.1, cov: 0.46, warm: 0, ex: 1 },
  { el: -3, zen: [0.016, 0.016, 0.052], hor: [0.62, 0.10, 0.022], horA: [0.06, 0.040, 0.075], glow: [0.95, 0.17, 0.025], sun: [0, 0, 0], cLit: [0.48, 0.11, 0.05], cDk: [0.032, 0.018, 0.032], day: 0.2, cov: 0.48, warm: 0.65, ex: 1.05 },
  { el: 1.5, zen: [0.05, 0.026, 0.062], hor: [1.65, 0.25, 0.018], horA: [0.13, 0.072, 0.10], glow: [1.8, 0.36, 0.03], sun: [28, 8.5, 1.5], cLit: [1.35, 0.42, 0.12], cDk: [0.065, 0.028, 0.034], day: 0.42, cov: 0.5, warm: 1, ex: 1.05 },
  { el: 7, zen: [0.05, 0.068, 0.19], hor: [1.35, 0.42, 0.06], horA: [0.26, 0.21, 0.30], glow: [1.4, 0.58, 0.13], sun: [30, 16, 5.5], cLit: [1.4, 0.74, 0.36], cDk: [0.11, 0.072, 0.10], day: 0.72, cov: 0.5, warm: 0.55, ex: 1 },
  { el: 20, zen: [0.04, 0.13, 0.40], hor: [0.50, 0.60, 0.72], horA: [0.40, 0.50, 0.66], glow: [0.55, 0.48, 0.36], sun: [34, 28, 21], cLit: [1.15, 1.08, 1.0], cDk: [0.30, 0.33, 0.40], day: 1, cov: 0.46, warm: 0, ex: 1 },
  { el: 55, zen: [0.025, 0.11, 0.40], hor: [0.44, 0.58, 0.76], horA: [0.38, 0.52, 0.72], glow: [0.4, 0.4, 0.36], sun: [36, 34, 30], cLit: [1.2, 1.2, 1.18], cDk: [0.38, 0.42, 0.50], day: 1, cov: 0.42, warm: 0, ex: 1 },
];
const MOON_C = new THREE.Vector3(0.62, 0.68, 0.82);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _L = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Vector3();
const lerp3 = (o: THREE.Vector3, a: number[], b: number[], t: number) => o.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** 雾 / 本体光用：当前地平线平均色（线性） */
export const ssFog = new THREE.Color();

// 11-18 Rhett「如果可以晚上做个月亮出来」：俯视镜头下真实月亮常在身后 / 太低看不见。
//   夜里（太阳低于 −6° 起渐入，−14° 全到位）把月亮挪到默认镜头正前方（北偏东 15°）、高 24°，镜头稍抬就能看到；月盘放大到约 2.6 倍 + 光晕。
//   夜光方向随之从北边来（逆光感，与秋林一致）。白天仍是天文位置。?off=moonstage 回旧。
const MOON08_OFF = (() => { try { return /(?:[?&]off=[^&]*\bmoon08\b)/.test(location.search); } catch { return false; } })();
const MOON_STAGE_OFF = (() => { try { return /(?:[?&]off=[^&]*\bmoonstage\b)/.test(location.search); } catch { return false; } })();
const STAGE = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(15)) * Math.cos(THREE.MathUtils.degToRad(24)), Math.sin(THREE.MathUtils.degToRad(24)), -Math.cos(THREE.MathUtils.degToRad(15)) * Math.cos(THREE.MathUtils.degToRad(24)));
function stageMoon(sun: THREE.Vector3, moon: THREE.Vector3) {
  const el = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, sun.y))));
  const t = Math.max(0, Math.min(1, (-6 - el) / 8)), k = t * t * (3 - 2 * t);
  if (k > 0) moon.lerp(STAGE, k).normalize();
}
/** 某钟点的太阳 / 月亮方向（不写 uniform） */
export function ssDirs(hour: number, sun: THREE.Vector3, moon: THREE.Vector3) {
  const Hs = (hour - NOON) / 24 * Math.PI * 2;
  celestial(DEC_SUN, Hs, sun); celestial(DEC_MOON, Hs - Math.PI + ssState.moonLag, moon);
  if (!MOON_STAGE_OFF) stageMoon(sun, moon);
  if (demoFull || demoSunOn) lockDemoSun(sun);   // 11-19 qldemosun（Rhett 03:12「夜晚必须要有，白天是复刻秋林逆光的光源」）：白天恒为 Demo SUN，日落后照常入夜（月亮 / 星空 / 月光） else if (sunLock.el > 0) lockSun(sun);   // 11-19 qlsunlock
  return Hs;
}
// ---------------------------------------------------------------- 11-17 秋林移植：太阳盘基本固定 + 低角（按图，map_look.sunEl；?off=sunlock 关）
//   白天太阳不再从东扫到正南再到西：方位压到下午那一侧（约 40° 范围），高度软封顶在 sunEl（tanh）；日出 / 日落时刻、夜里月光不变，
//   方位在太阳位于地平线下 15°–9° 时转过去（看不见日盘），所以清晨的霞光也在下午那一侧（风格化取舍，待 Rhett 看）。
//   天空日盘、平行光、调色板（按太阳高度选暖色）都从这里取方向，所以一起变低、变暖，不会对不上。
export const sunLock = { el: 0, off: (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('sunlock'); } catch { return false; } })() };
const _lk = new THREE.Vector3();
let lkAzFix = NaN, lkAzNoon = 0;
const LK_LO = THREE.MathUtils.degToRad(-15), LK_HI = THREE.MathUtils.degToRad(-9);   // 平行光在太阳 −8° 以下完全是月光，转向在这之下完成
const azOf = (v: THREE.Vector3) => Math.atan2(v.z, v.x);
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** 设当前图的太阳封顶高度（度，0 = 不封顶）；切图时调 */
export function ssSetSunLock(elDeg: number) { sunLock.el = sunLock.off ? 0 : Math.max(0, Math.min(60, elDeg || 0)); }
function lockSun(sun: THREE.Vector3) {
  if (Number.isNaN(lkAzFix)) {   // 下午 16 点那一侧作为固定方位，正午方位作为压缩中心
    celestial(DEC_SUN, (16 - NOON) / 24 * Math.PI * 2, _lk); lkAzFix = azOf(_lk);
    celestial(DEC_SUN, 0, _lk); lkAzNoon = azOf(_lk);
  }
  const el = Math.asin(Math.max(-1, Math.min(1, sun.y)));
  if (el <= LK_LO) return;                              // 深夜不动：月光 / 星空 / 昼夜时序不变
  const cap = THREE.MathUtils.degToRad(sunLock.el);
  const el2 = el > 0 ? cap * Math.tanh(el / cap) : el;  // 软封顶：低处几乎不变，越高越压向 cap；地平线以下高度不改（日出 / 日落时刻不变）
  const t = Math.min(1, (el - LK_LO) / (LK_HI - LK_LO)), k = t * t * (3 - 2 * t);   // 方位在地平线下 15°→9° 之间转过去（日盘看不见、平行光全是月光），出地平线时已在下午那侧
  const az0 = azOf(sun), az2 = lkAzFix + wrapPi(az0 - lkAzNoon) * 0.22;
  const az = az0 + wrapPi(az2 - az0) * k;
  sun.set(Math.cos(el2) * Math.cos(az), Math.sin(el2), Math.cos(el2) * Math.sin(az));
}
// ---------------------------------------------------------------- 11-19 qlsunlock：Demo 户外区白天太阳锁成秋林 Demo 的低角逆光（Rhett 录屏「你看他的光线是会动的」）
//   原 lockSun 把白天太阳压在下午 16 点那一侧（默认镜头朝 −z 时方位在左后方 −84°…−125°，镜头正前方几乎没有太阳 → 射线 facing≈0、树冠不逆光），
//   方位还随钟点漂约 40°。Demo：SUN = normalize(0.40, 0.27, −1)（默认镜头前方偏右 22°、仰角 14.1°），全天不动。
//   这里：太阳高于地平线后仰角在真实 0°→10° 之间升到 14.1°，此后整个白天定在 Demo 方向；方位在地平线下 15°→9° 时转到 Demo 方位（同 lockSun，看不见日盘时转）；
//   深夜（< −15°）不动 → 月光 / 星空 / 常夜图不变。天空日盘、平行光、调色板（按仰角 14° 选黄金时刻色）、射线、体积光都从这里取方向，一起锁。
//   main.ts setZoneLook 按 Demo 户外区开关（ssSetDemoSun）；?off=qlsunlock 回旧（各图 sunEl 软封顶 + 下午方位）。
export const DEMO_SUN = new THREE.Vector3(0.40, 0.27, -1).normalize();
const QLSUNLOCK_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('qlsunlock'); } catch { return false; } })();
let demoSunOn = false;
/** 切图时调：on = 当前是 Demo 户外区（常夜图 / 室内 / 副本 / 钟井传 false） */
export function ssSetDemoSun(on: boolean) { demoSunOn = on && !QLSUNLOCK_OFF; }
export const ssDemoSunOn = () => demoSunOn || demoFull;
// ---------------------------------------------------------------- 11-19 qldemosun（Rhett 11-19 02:42「不要现有太阳，要源码中的光源，100% 复刻他的光源以及带来的光效」）
//   11-19 03:12 改：夜晚保留——白天（真实太阳出地平线 ~10° 后）太阳恒为 Demo SUN、天空为 Demo 天空；日落后照常入夜，天空按太阳高度渐变回海天夜空（月亮 / 星空）。
//   Demo 户外区（营地 / 翠风原野 / 本体野外，非常夜图）：白天太阳方向恒为 Demo SUN = normalize(0.40, 0.27, −1)（仰角 14.1°，不随游戏钟点走，没有日出日落 / 夜晚 / 月光）；
//   天空整个换成 Demo 天空着色器原式（cine makeCineSky 的 uDemoSky 分支，Demo 常量 uSunCol = (1, .74, .46) × 3.4、uFogCol = (.50, .40, .27)、uFog.z = .40，日盘 45×），
//   不再画海天的日盘 / 月亮 / 星空 / 积云；平行光、半球光、雾、体积光、射线、浮尘、调色都按白天满值（色表仰角 14.1° → day 归一到 1）。
//   副本 / 室内 / 钟井 / 常夜图 / DLC 海岸不受影响。?off=qldemosun 回 C22（qlsunlock 白天锁方向，夜里照旧）
const QLDEMOSUN_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('qldemosun'); } catch { return false; } })();
let demoFull = false;
export function ssSetDemoFull(on: boolean) { demoFull = on && !QLDEMOSUN_OFF; }
export const ssDemoFullOn = () => demoFull;
/** 色表「白天程度」在某仰角（度）的值（daynight 用：Demo 锁定仰角 14.1° 时 day≈0.87，按它归一，白天日光 / 天光强度回到 Demo 满值） */
export function ssDayAtEl(elDeg: number) { let i = 0; while (i < KEYS.length - 2 && elDeg > KEYS[i + 1].el) i++; const A = KEYS[i], B = KEYS[i + 1], t = Math.max(0, Math.min(1, (elDeg - A.el) / (B.el - A.el))); return mix(A.day, B.day, t); }
export const DEMO_EL_DEG = THREE.MathUtils.radToDeg(Math.asin(DEMO_SUN.y));
const DEMO_EL = Math.asin(DEMO_SUN.y), DEMO_AZ = Math.atan2(DEMO_SUN.z, DEMO_SUN.x), DEMO_RISE = THREE.MathUtils.degToRad(10);
function lockDemoSun(sun: THREE.Vector3) {
  const el = Math.asin(Math.max(-1, Math.min(1, sun.y)));
  if (el <= LK_LO) return;                              // 深夜不动
  const r = el > 0 ? Math.min(1, el / DEMO_RISE) : 0, kr = r * r * (3 - 2 * r);
  const el2 = el > 0 ? el + (DEMO_EL - el) * kr : el;   // 日出后约 10° 真实仰角内升到 Demo 14.1°，日落对称降回（地平线时刻不变）
  const t = Math.min(1, (el - LK_LO) / (LK_HI - LK_LO)), k = t * t * (3 - 2 * t);
  const az0 = azOf(sun), az = az0 + wrapPi(DEMO_AZ - az0) * k;
  sun.set(Math.cos(el2) * Math.cos(az), Math.sin(el2), Math.cos(el2) * Math.sin(az));
}
function flatten(v: THREE.Vector3, minDeg: number) {
  const m = Math.sin(THREE.MathUtils.degToRad(minDeg));
  if (v.y >= m) return v.normalize();
  const hl = Math.hypot(v.x, v.z) || 1; const c = Math.cos(THREE.MathUtils.degToRad(minDeg));
  return v.set(v.x / hl * c, m, v.z / hl * c);
}
/** 场景平行光方向：白天 = 太阳（低于 minSun° 按 minSun° 打），夜里 = 月亮（低于 25° 按 25°；月亮在地平线下时用背日方向），太阳在 −2°…−8° 之间过渡 */
export function ssLightDir(hour: number, minSun: number, out: THREE.Vector3) {
  ssDirs(hour, _s, _m);
  const el = THREE.MathUtils.radToDeg(Math.asin(_s.y));
  const sunL = flatten(_a.copy(_s), minSun), moonL = flatten(_b.copy(_m.y > -0.05 ? _m : _b.set(-_s.x, 0.6, -_s.z)), 25);
  return out.copy(sunL).lerp(moonL, sstep(-2, -8, el)).normalize();
}
/** 某钟点的调色板（本体 daynight 用，不写 uniform）：sunC 日光色（线性 HDR，夜里 0）、zen / hor / horA、day、night、warm、el */
export function ssPalette(hour: number) {
  ssDirs(hour, _s, _m);
  const el = THREE.MathUtils.radToDeg(Math.asin(_s.y));
  let i = 0; while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = Math.max(0, Math.min(1, (el - A.el) / (B.el - A.el)));
  const v = () => new THREE.Vector3();
  return { el, t, i, sunC: lerp3(v(), A.sun, B.sun, t), zen: lerp3(v(), A.zen, B.zen, t), hor: lerp3(v(), A.hor, B.hor, t), horA: lerp3(v(), A.horA, B.horA, t),
    day: mix(A.day, B.day, t), night: 1 - sstep(-13, -4, el), warm: mix(A.warm, B.warm, t), moonUp: sstep(-0.02, 0.06, _m.y) };
}

/** 每帧：算方向 + 调色板，写进 ssU；返回场景平行光方向。storm / haze（近地平线白雾）/ cover（额外云量）由调用方给 */
export function ssTick(dt: number, o: { storm?: number; haze?: number; cover?: number; wind?: number; fogFar?: number; minSun?: number } = {}) {
  const storm = o.storm ?? 0, haze = o.haze ?? 0, wind = o.wind ?? 0.15, fogFar = o.fogFar ?? 175;
  const h = seaSkyHour(); ssState.hour = h;
  const Hs = ssDirs(h, ssU.ssSunD.value, ssU.ssMoonD.value);
  const sun = ssU.ssSunD.value, moon = ssU.ssMoonD.value;
  const el = THREE.MathUtils.radToDeg(Math.asin(sun.y)); ssState.sunEl = el; ssState.moonEl = THREE.MathUtils.radToDeg(Math.asin(moon.y));
  // 星空：本地 ← 赤道（恒星时 = 太阳时角 + 常数）；着色器要 赤道 ← 本地 = 转置
  const lst = Hs + 1.3, c = Math.cos(lst), s = Math.sin(lst), cL = Math.cos(LAT), sL = Math.sin(LAT);
  // M（hour 框 → 本地）× Q（固定赤道 → hour 框），见 celestial()
  const Q = new THREE.Matrix3().set(c, s, 0, s, -c, 0, 0, 0, 1);
  const M = new THREE.Matrix3().set(0, -1, 0, cL, 0, sL, sL, 0, -cL);
  ssU.ssStarRot.value.multiplyMatrices(M, Q).transpose();
  // 调色板
  let i = 0; while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = Math.max(0, Math.min(1, (el - A.el) / (B.el - A.el)));
  ssState.palIdx = i + t;
  lerp3(ssU.ssZen.value, A.zen, B.zen, t); lerp3(ssU.ssHor.value, A.hor, B.hor, t); lerp3(ssU.ssHorA.value, A.horA, B.horA, t);
  lerp3(ssU.ssGlowC.value, A.glow, B.glow, t); lerp3(ssU.ssSunC.value, A.sun, B.sun, t);
  lerp3(ssU.ssCLit.value, A.cLit, B.cLit, t); lerp3(ssU.ssCDk.value, A.cDk, B.cDk, t);
  const day = A.day + (B.day - A.day) * t, cov = A.cov + (B.cov - A.cov) * t;
  ssU.ssK3.value.set(A.warm + (B.warm - A.warm) * t, A.ex + (B.ex - A.ex) * t, 0, 0);
  const night = 1 - sstep(-13, -4, el); ssState.night = night;
  const moonUp = sstep(-0.02, 0.06, moon.y);
  // 月亮亮度：夜里全亮，白天淡到 20%
  ssU.ssMoonC.value.copy(MOON_C).multiplyScalar(mix(1, 0.2, 1 - night) * moonUp);
  // 月光把夜里的天和云提亮一点
  const mk = night * moonUp * 0.6;
  ssU.ssZen.value.addScaledVector(_a.set(0.004, 0.007, 0.018), mk); ssU.ssHor.value.addScaledVector(_a.set(0.006, 0.009, 0.02), mk); ssU.ssHorA.value.addScaledVector(_a.set(0.006, 0.009, 0.02), mk);
  ssU.ssCLit.value.addScaledVector(_a.set(0.05, 0.055, 0.07), mk);
  ssU.ssK.value.set(night * (1 - 0.35 * mk), sstep(-0.03, 0.02, sun.y), moonUp, Math.min(0.9, cov + (o.cover ?? 0)));
  // 环境（水体）亮度
  ssU.ssAmb.value.copy(ssU.ssZen.value).multiplyScalar(0.6).addScaledVector(_a.set(ssU.ssHor.value.x + ssU.ssHorA.value.x, ssU.ssHor.value.y + ssU.ssHorA.value.y, ssU.ssHor.value.z + ssU.ssHorA.value.z), 0.2);
  // 水面雾：50% 约在 1.55 × 场景雾远端（海面开阔，比陆上雾淡）
  ssU.ssK2.value.set(day, 1 / Math.max(60, fogFar * 1.9), storm, haze);
  ssU.ssT.value += dt;
  ssU.ssWind.value.x += dt * (0.0035 + 0.02 * wind); ssU.ssWind.value.y += dt * 0.0012;
  // 雾色：地平线平均（朝阳 / 背阳各半），略压暗（雾在近处，不是天边最亮那一圈）
  ssFog.setRGB((ssU.ssHor.value.x + ssU.ssHorA.value.x) * 0.5, (ssU.ssHor.value.y + ssU.ssHorA.value.y) * 0.5, (ssU.ssHor.value.z + ssU.ssHorA.value.z) * 0.5).multiplyScalar(0.8);
  ssLightDir(h, o.minSun ?? 2.5, _L); ssState.lightEl = THREE.MathUtils.radToDeg(Math.asin(_L.y));
  return _L;
}

// ---------------------------------------------------------------- 本体（野外图）每帧：海岸没接管时由 cine.cineUpdate 调用
export function ssBaseTick(dt: number, fogFar: number) {
  if (ssState.active) return false;
  ssTick(dt, { fogFar, minSun: 6 });
  ssState.baseTicks++; ssState.baseT = performance.now() / 1000;
  return true;
}
/** 体积光：方向 + 颜色随时段（白天日光色偏暖，夜里月光偏冷、变弱）；返回强度倍数，0 = 不画；null = 共用件没在跑（用旧逻辑） */
const RAY_NIGHT = new THREE.Color(0.55, 0.68, 1.0), RAY_WARM = new THREE.Color(1.0, 0.8, 0.55);
export function ssRays(dir: THREE.Vector3, tint: THREE.Color): number | null {
  if (!seaSkyOn() || !(ssState.active || performance.now() / 1000 - ssState.baseT < 1.5)) return null;
  const sv = ssU.ssK.value.y;
  if (sv > 0.01) {
    dir.copy(ssU.ssSunD.value);
    const c = ssU.ssSunC.value, m = Math.max(c.x, c.y, c.z, 1e-3);
    tint.setRGB(c.x / m, c.y / m, c.z / m).lerp(RAY_WARM, 0.35);
    return sv;
  }
  const mv = ssU.ssK.value.z * ssU.ssK.value.x;
  if (mv > 0.01) { dir.copy(ssU.ssMoonD.value); tint.copy(RAY_NIGHT); return 0.55 * mv; }
  return 0;
}
