// ======================================================================
// 11-14 电影感画质（Rhett「画质专长包」webgl-cinematic-look，按其步骤顺序做）
//   核心原则「一个太阳、一套色、一层空气」：天空、雾、环境光、材质都读同一组全局参数（CU，typed array 按引用共享）。
//   内置材质（Toon / Standard / Basic / Lambert / Phong / Points / Sprite）不用逐个 onBeforeCompile：
//   ① 往 ShaderLib 各着色器的 uniforms 里塞 cine* 项（值是 Float32Array → UniformsUtils.clone 不会复制，所有材质共用同一份）
//   ② 改 ShaderChunk 的 fog_* 片段；没绑到 cine* 的自定义 ShaderMaterial 读到 0 → 走原来的雾，不会坏。
//   代码为本项目自写；思路参考 Saltline（无许可，仅思路）、Painted Valley / Worm Rider（MIT，致谢见 credits）。
// ======================================================================
import { LOOK_CUR, QL_DEMO } from './map_look';
import * as THREE from 'three';
import { seaSkyOn, ssU, ssGLSL, SS_TIER, ssDefs, ssBaseTick, ssLightDir, ssDemoFullOn, DEMO_SUN, WAVE_GLSL, type SsTier } from './seasky_core';   // 11-15 海天共用件（?off=seasky 回旧版）
import { curQuality } from './gfx';
import { riverReflU, riverReflUpdate, riverReflMarkWater, riverReflSetSky, riverReflFrame, RIVER_REFL, RIVER_REFL_GLSL } from './river_refl';   // 11-15 河面镜面反射（高 / 超高档，?off=riverrefl）
import { WATER2, W2_GLSL } from './water2';
import { wakeU, WAKE_GLSL, WAKE_VGLSL, wakeOn, wakeMark } from './water_wake';
import { QL } from './ql_water_flags';   // 11-19 秋林 r8 水体复刻开关（qlriver / qlrivspec / qlmirror / qlwake / qlsplash）   // 11-18 r8 尾迹场：玩家涉水涟漪 / V 形波（?off=wake）   // 11-17 水体 v2：河岸泡沫 Beer-Lambert 透明度 + 受光（?off=water2 回旧）
/** 11-15 海天共用件开着（本体野外：天体模型穹顶 / 光色 / 太阳方向 / 水面） */
export const SS_ON = seaSkyOn();
const SS_BASE_GLSL = SS_ON ? ssGLSL() : '';
const ssTierNow = (): SsTier => ((curQuality as string) in SS_TIER ? curQuality : 'high') as SsTier;

/** 全局共享参数（每帧 cineUpdate 写入） */
export const CU = {
  /** xyz = 指向太阳的单位向量，w = 太阳在地平线上（0..1） */
  sun: new Float32Array([0.55, 0.62, 0.55, 1]),
  /** 太阳颜色 × 强度（线性） */
  sunCol: new Float32Array([1, 0.85, 0.6]),
  /** 天顶 / 地平线颜色（线性） */
  zen: new Float32Array([0.05, 0.2, 0.6]),
  hor: new Float32Array([0.55, 0.7, 0.85]),
  /** x = 地面雾浓度（1/米），y = 高度衰减（1/米），z = 雾底高度（米），w = 开关（1 = 用电影感雾） */
  fog: new Float32Array([0.005, 0.11, 0, 0]),
  /** x = 太阳方向内散射强度，y = 远处偏蓝（逐通道消光差），z = 时间（秒），w = 天空日盘开关 */
  fog2: new Float32Array([0.9, 0.12, 0, 1]),
};
/** x = 第 9 步雾取天色（0..1），y = 第 11 步边缘光强度，z = 第 11 步暖色反弹光强度，w = 第 12 步亚像素淡化开关 */
export const CFX = new Float32Array([0.6, 0.35, 0.22, 1]);
/** x = 第 5 步风（0/1），y = 第 7 步三平面（0/1），z = 第 6 步水面（0/1），w 备用 */
export const CFX2 = new Float32Array([1, 1, 1, 0]);
/** 11-14 A 档：x = 第 46 步按材质压镜面（0/1），y = 第 31+55 步雾加限制（0/1），z = 第 55 步飘动雾团（0/1），w = 暗部底色（0/1） */
export const CFX3 = new Float32Array([1, 1, 1, 0]);
/** 11-19 秋林 Demo 光照链路逐项移植（只在 Demo 户外区生效，cineDemoZone 设）：
 *  x = Demo 空气（高度雾 + 太阳内散射，?off=qlair），y = 去掉天空 PMREM 的漫反射环境光（Demo 只有半球光，?off=qlibl），z = 按材质类别镜面（?off=specclass），w 备用 */
export const CDEMO = new Float32Array([0, 0, 0, 0]);
/** rgb = Demo 雾色 uFogCol（白天 (0.50, 0.40, 0.27)，夜里跟场景雾色），a = 雾密度 uFog.x（0.0058） */
export const CDEMO2 = new Float32Array([0.5, 0.4, 0.27, 0.0058]);
/** rgb = Demo 着色器太阳色 uSunCol（= 太阳色 × 3.4），a = 太阳内散射 uFog.z（0.40） */
export const CDEMO3 = new Float32Array([3.4, 2.516, 1.564, 0.4]);
const UNI = { cineSun: CU.sun, cineSunCol: CU.sunCol, cineZen: CU.zen, cineHor: CU.hor, cineFog: CU.fog, cineFog2: CU.fog2, cineFx: CFX, cineFx2: CFX2, cineFx3: CFX3, cineDemo: CDEMO, cineDemo2: CDEMO2, cineDemo3: CDEMO3 };
let demoZone = false;
/** 11-19 qlhalo（?off=qlhalo 回旧）：Demo 户外区天空加 Demo 原式太阳光晕。游戏海天天空在太阳周围只有约 2° 的核超过射线遮罩亮度下限 1.6，
 *  Demo 天空（白核 mix 0.55 到 5.0、uSunCol·pow 瓣）约 10° 内都在 1.6–5 之间 → Demo 射线从整片亮天经叶缝放射，游戏只剩一个小亮点。烘环境光时（uDisc = 0）不加。 */
const QLHALO_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('qlhalo'); } catch { return false; } })();
/** 11-19 当前区域是不是吃 Demo 光的户外区（main.ts setZoneLook：与 Demo 太阳 / 半球光同一条件，且 isOutdoorLook）；室内 / 副本 / 钟井 = false */
export function cineDemoZone(on: boolean) { demoZone = on; }
export const cineIsDemoZone = () => demoZone;
/** 自定义 ShaderMaterial（海面等）要吃同一层空气：把 cine 参数并进它的 uniforms */
export function cineUniforms(): Record<string, THREE.IUniform> { return Object.fromEntries(Object.entries(UNI).map(([k, v]) => [k, { value: v }])); }

/** 各步开关（1–12；6 = 水 / 海，7 = 三平面）。默认全开；自查截图逐步打开对比。改了要调 cineApplyFlags() */
export const CINE = { on: Array.from({ length: 32 }, () => true) as boolean[], tier: 'high' as string };
/** 11-14 A 档 第 21 步：每个效果一个名字，?off=名字,名字 或 localStorage darkrock_cine_off 关掉，方便逐项对比 / 查开销。
 *  13 = 专长第 46 步（按材质压镜面），14 = 第 31+55 步（雾色限幅 + 平方指数），15 = 第 55 步（飘动雾团） */
export const CINE_NAMES: Record<string, number> = { sky: 1, sun: 2, fog: 3, post: 4, wind: 5, water: 6, tri: 7, snap: 8, fogsky: 9, tod: 10, back: 11, mpp: 12, spec: 13, foglim: 14, fogbank: 15, floor: 16, vol: 17, qlgrade: 18, qlflag: 19, qlrays: 20, qlsun: 21, qlwind: 22, qlgrass: 23, fpcam: 24, qlair: 25, qlibl: 26, qlpcss: 27, specclass: 28 };   // 11-19 Demo 光照链路逐项   // 11-17g 专长包 v8 全面移植：射线 / 太阳阴影 / 风场 / 草密度 / 第一人称
export function cineApplyFlags() {
  CFX[0] = CINE.on[9] ? 0.6 : 0; CFX[1] = CINE.on[11] ? 0.35 : 0; CFX[2] = CINE.on[11] ? 0.22 : 0; CFX[3] = CINE.on[12] ? 1 : 0;
  CFX2[0] = CINE.on[5] ? 1 : 0; CFX2[1] = CINE.on[7] ? 1 : 0; CFX2[2] = CINE.on[6] ? 1 : 0;
  CFX3[0] = CINE.on[13] ? 1 : 0; CFX3[1] = CINE.on[14] ? 1 : 0; CFX3[2] = CINE.on[15] ? 1 : 0; CFX3[3] = CINE.on[16] ? 1 : 0;
}
function readOff() {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') : null;
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') : null;
    for (const n of `${q ?? ''},${ls ?? ''}`.split(',')) { const i = CINE_NAMES[n.trim()]; if (i) CINE.on[i] = false; }
  } catch { /* 读不到就全开 */ }
  cineApplyFlags();
}
/** 11-19 specclass：给材质打镜面类别（叶 0.18 / 地 0.35 / 岩 0.4 / 树皮 0.45），只在 Demo 户外区生效 */
export const SPEC_CLASS = { leaf: 0.18, ground: 0.35, rock: 0.4, bark: 0.45 } as const;
export function cineSpecClass<T extends THREE.Material>(m: T, k: keyof typeof SPEC_CLASS): T {
  m.defines = { ...(m.defines ?? {}), CINE_SPEC: SPEC_CLASS[k].toFixed(2) }; m.needsUpdate = true; return m;
}
/** 第 21 步：着色器字符串替换都走这里，找不到原文就报「patch miss」（自查脚本把它算作不合格） */
export function cinePatch(src: string, needle: string, repl: string, key: string): string {
  if (!src.includes(needle)) { console.warn('patch miss', key); return src; }
  return src.replace(needle, repl);
}

/** 天空函数（GLSL，雾与天空球共用）：方向 d 上的天色 */
export const SKY_FN = /* glsl */ `
vec3 cineSky(vec3 d){
  float mu = max(dot(d, cineSun.xyz), 0.0), h = d.y;
  vec3 c = mix(cineHor, cineZen, pow(clamp(h, 0.0, 1.0), 0.45));
  c = mix(c, cineHor * vec3(1.25, 1.02, 0.8) + cineSunCol * 0.08, pow(mu, 3.0) * 0.55 * cineSun.w);   // 太阳那半边地平线发暖
  return c;
}`;

let installed = false;
/** 装补丁：必须在任何材质首次编译之前调用（main.ts 顶部 import 即调用） */
export function installCine() {
  if (installed) return; installed = true;
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = (THREE.ShaderLib as Record<string, { uniforms: Record<string, THREE.IUniform> }>)[k].uniforms;
    if (u && 'fogColor' in u) for (const [n, v] of Object.entries(UNI)) u[n] = { value: v };
  }
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying vec3 vCineWP;
#endif`;
  // 世界坐标：视图矩阵是刚体变换 → world = Rᵀ(mv − t)，不用 modelMatrix（实例化 / 批处理都对）
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vCineWP = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vCineWP;
  uniform vec4 cineSun; uniform vec3 cineSunCol; uniform vec3 cineZen; uniform vec3 cineHor; uniform vec4 cineFog; uniform vec4 cineFog2; uniform vec4 cineFx; uniform vec4 cineFx2; uniform vec4 cineFx3;
  uniform vec4 cineDemo; uniform vec4 cineDemo2; uniform vec4 cineDemo3;
  float cineH21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float cineVN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cineH21(i), cineH21(i + vec2(1, 0)), f.x), mix(cineH21(i + vec2(0, 1)), cineH21(i + vec2(1, 1)), f.x), f.y); }
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
  ${SKY_FN}
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  if ( cineFog.w > 0.5 && cineDemo.x > 0.5 ) {
    // 11-19 秋林 Demo applyFog 原式（?off=qlair）：指数高度雾沿视线解析积分（k 0.04）、镜头高度按离雾底（玩家脚下地面）算、12 米内渐入（0.4→1）、
    //   最大不透明 0.9；雾色 airCol = uFogCol ×（背阳 ×(0.8, 0.9, 1.1)·0.75）+ uSunCol ×（pow(mu, 9)·0.40 + mu²·0.40·0.22）
    vec3 dv = vCineWP - cameraPosition; float dd = length( dv ); vec3 ddir = dv / max( dd, 1e-3 );
    float dk = 0.04, ddy = dv.y * dk, dfh = abs( ddy ) > 1e-3 ? ( 1.0 - exp( - ddy ) ) / ddy : 1.0;
    float dod = cineDemo2.w * exp( - max( cameraPosition.y - cineFog.z, 0.0 ) * dk ) * dd * dfh; dod *= smoothstep( 0.0, 12.0, dd ) * 0.6 + 0.4;
    float dsm = dot( ddir, cineSun.xyz ), dmu = max( dsm, 0.0 ), dbk = max( - dsm, 0.0 );
    vec3 dair = cineDemo2.rgb * mix( vec3( 1.0 ), vec3( 0.80, 0.90, 1.10 ), dbk * 0.75 ) + cineDemo3.rgb * ( pow( dmu, 9.0 ) * cineDemo3.w + dmu * dmu * cineDemo3.w * 0.22 );
    gl_FragColor.rgb = mix( dair, gl_FragColor.rgb, max( exp( - dod ), 1.0 - 0.9 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, dair, fogFactor );   // Demo 没有：保留 THREE.Fog 远端（各图 fogFar）把地图边缘收进雾色
  } else if ( cineFog.w > 0.5 ) {
    vec3 fv = vCineWP - cameraPosition; float fd = length( fv ); vec3 fdir = fv / max( fd, 1e-4 );
    // 解析指数高度雾：浓度随高度指数衰减，沿视线积分（贴地浓、往上淡）
    // 11-14 自查：近景（篝火 / NPC，8–13 米）整片发白、饱和度 0.43→0.32 —— 雾底高于镜头时 exp(-k·ch) 放大好几倍。
    //   改：镜头离雾底至少按 1 米算（雾底不会压到镜头上方），并且 12 米内不起雾（近景保持原色，雾只管中远景层次）
    float k = max( cineFog.y, 1e-4 ), ch = max( cameraPosition.y - cineFog.z, 1.0 ), fdd = max( fd - 12.0, 0.0 ), dy = fdir.y * fdd;
    float hf = abs( k * dy ) > 0.002 ? ( 1.0 - exp( - k * dy ) ) / ( k * dy ) : 1.0;
    float mist = cineFog.x * fdd * exp( - k * ch ) * hf;
    // 11-14 A 档 第 55 步：世界坐标里缓慢飘动的雾团（远处树线 / 建筑一层浓一层淡，不再是均匀一片）
    if ( cineFx3.z > 0.5 ) mist *= mix( 0.7, 1.45, smoothstep( 0.3, 0.75, cineVN( vCineWP.xz * 0.018 + cineFog2.z * 0.006 ) ) );
    // 第 55 步：近似平方指数——光学厚度小（近处）时更清，厚（远处）时最多浓 1.3 倍
    if ( cineFx3.y > 0.5 ) mist *= min( mist / 0.45, 1.3 );
    // 雾色 = 沿视线的天色 + 太阳方向内散射（近暖远冷）
    float sunAmt = pow( max( dot( fdir, cineSun.xyz ), 0.0 ), 8.0 ) * cineSun.w;
    vec3 cSkyc;
    if ( cineFx3.y > 0.5 ) {
      // 第 31 步：雾色加限制——查天色时视线抬到 y≥0.2、去饱和约 40%、亮度不超过背阳天色 2 倍，越浓越接近地平线色（夕阳下近处阴影不再罩一层烟）
      vec3 cLw = vec3( 0.2126, 0.7152, 0.0722 );
      vec3 cSu = cineSky( normalize( vec3( fdir.x, max( fdir.y, 0.2 ), fdir.z ) ) );
      float cSl = dot( cSu, cLw ); cSu = mix( vec3( cSl ), cSu, 0.6 );
      float cCap = 2.0 * dot( cineSky( normalize( vec3( - cineSun.x, 0.2, - cineSun.z ) ) ), cLw ) + 1e-3;
      cSu *= min( 1.0, cCap / max( cSl, 1e-4 ) );
      float cTm = exp( - mist );
      cSkyc = mix( cSu, cineSky( vec3( fdir.x, 0.0, fdir.z ) ), ( 1.0 - cTm ) * ( 1.0 - cTm ) );
    } else cSkyc = cineSky( vec3( fdir.x, max( fdir.y, 0.0 ), fdir.z ) );
    vec3 fc = mix( fogColor, cSkyc, cineFx.x ) + cineSunCol * sunAmt * cineFog2.x * 0.25 * step( 0.01, cineFx.x );
    // 逐通道消光：远处更偏蓝
    float bl = cineFog2.y * step( 0.01, cineFx.x );
    vec3 tr = ( 1.0 - fogFactor ) * exp( - mist * vec3( 1.0 - bl, 1.0, 1.0 + bl ) );
    gl_FragColor.rgb = mix( fc, gl_FragColor.rgb, tr );
  } else {
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif`;
  // 第 11 步：背光三件套（受光侧边缘光 + 暖色地面反弹光；叶片透光在草的风补丁里）。卡通 / 写实材质都走 lights_fragment_end
  C.lights_fragment_end = C.lights_fragment_end + `
#ifdef USE_FOG
  if ( cineFx.y + cineFx.z > 0.001 ) {
    vec3 cVs = normalize( ( viewMatrix * vec4( cineSun.xyz, 0.0 ) ).xyz );
    vec3 cWn = ( vec4( normal, 0.0 ) * viewMatrix ).xyz;
    float cNdv = clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
    float cRim = pow( 1.0 - cNdv, 3.0 ) * smoothstep( -0.2, 0.6, dot( normal, cVs ) ) * cineSun.w;
    float cDown = clamp( 0.5 - 0.5 * cWn.y, 0.0, 1.0 );
    reflectedLight.indirectDiffuse += diffuseColor.rgb * ( cineSunCol * cRim * cineFx.y + cineHor * vec3( 1.15, 0.95, 0.72 ) * cDown * cineFx.z * 0.6 );
  }
  // 11-14 A 档：暗部底色——间接光不低于天光的 8%（带天色），背阳面 / 深阴影里仍看得出材质，不死黑
  if ( cineFx3.w > 0.5 ) reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, diffuseColor.rgb * mix( cineHor, cineZen, 0.5 ) * 0.08 );
#endif`;
  // 11-14 A 档 第 46 步：按材质压镜面。默认 F0 0.04 在低角度太阳下会把岩石 / 地面 / 布料洗成一层银白。
  //   非金属按粗糙度：光滑（≤0.55，木 / 石）×0.45，很粗糙（≥0.95，布 / 叶 / 土）×0.25；金属不动。环境反射同样跟着降。
  // 11-19 秋林 Demo 光照链路·镜面纪律 specclass（专长第 46 步 / Demo 叶卡 specularIntensity 0.2）：打了 CINE_SPEC 类别的材质在 Demo 户外区按类别定镜面强度
  //   （同 three specularIntensity 口径：F0 = 0.04·k、F90 = k，金属不受影响）——叶卡 0.18 / 地面 0.35 / 岩石 0.40 / 树皮 0.45；没打类别的仍按粗糙度 ×0.45–0.25
  C.lights_physical_fragment = C.lights_physical_fragment + `
#ifdef USE_FOG
  #ifdef CINE_SPEC
  if ( cineFx3.x > 0.5 && cineDemo.z > 0.5 ) { material.specularColor = mix( vec3( 0.04 * CINE_SPEC ), diffuseColor.rgb, metalnessFactor ); material.specularF90 = mix( CINE_SPEC, 1.0, metalnessFactor ); } else
  #endif
  if ( cineFx3.x > 0.5 ) { float cSk = mix( 0.45, 0.25, smoothstep( 0.55, 0.95, roughnessFactor ) ), cSm = mix( cSk, 1.0, metalnessFactor );
    material.specularColor *= cSm; material.specularF90 *= cSm; }
#endif`;
  // 11-19 秋林 Demo 光照链路·环境光 qlibl：Demo 没有 scene.environment，环境漫反射只来自半球光 0.62；游戏桌面高 / 超高档另有天空 PMREM（户外 ×0.75）
  //   再叠一层漫反射环境光 → 暗部 / 背光面比 Demo 亮、逆光对比被抹平。Demo 户外区去掉 IBL 漫反射（cineDemo.y = 1），IBL 镜面反射保留（金属 / 湿面）；没绑 cine 参数的材质读到 0 = 原样
  C.lights_fragment_maps = cinePatch(C.lights_fragment_maps, 'iblIrradiance += getIBLIrradiance( geometryNormal );', `#ifdef USE_FOG
		iblIrradiance += getIBLIrradiance( geometryNormal ) * ( 1.0 - cineDemo.y );
	#else
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif`, 'qlibl.lights_fragment_maps');
  readOff();
}
installCine();

// ---------------------------------------------------------------- 第 1 步：程序化天空（天空即光源）
export function makeCineSky(top: number, mid: number, bottom: number) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) },
      cineSun: { value: CU.sun }, cineSunCol: { value: CU.sunCol }, cineZen: { value: CU.zen }, cineHor: { value: CU.hor }, cineFog2: { value: CU.fog2 }, uDisc: { value: 1 }, uS1: { value: CINE.on[1] ? 1 : 0 }, uQlHalo: { value: 0 }, uDemoSky: { value: 0 }, cineDemo3: { value: CDEMO3 },
      ...(SS_ON ? { ...ssU, uSS: { value: 0 } } : {}) },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec4 cineSun; uniform vec3 cineSunCol; uniform vec3 cineZen; uniform vec3 cineHor; uniform vec4 cineFog2; uniform float uDisc; uniform float uS1;
      varying vec3 vP;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      __SS_SKY__
      void main(){
        __SS_MAIN__
        vec3 d = normalize(vP); float h = d.y, mu = max(dot(d, cineSun.xyz), 0.0);
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, min(1.0, -h * 4.0));
        if (uS1 < 0.5) { gl_FragColor = vec4(c, 1.0); return; }        // 第 1 步关：原来的三段渐变
        c = mix(cineHor, c, smoothstep(-0.02, 0.22, abs(h)));          // 地平线收进雾色：远景融进天
        c = mix(c, c * vec3(1.18, 1.0, 0.82) + cineSunCol * 0.06, pow(mu, 3.0) * 0.6 * cineSun.w);   // 太阳那边整体发暖
        c += cineSunCol * (pow(mu, 48.0) * 1.1 + pow(mu, 6.0) * 0.18) * cineSun.w;                     // 光晕：紧的米氏 + 宽的晕
        if (h > 0.0) {                                                   // 淡卷云（投到平面上，太阳背后被照亮）
          vec2 cp = d.xz / (h + 0.12) * 1.3 + vec2(cineFog2.z * 0.006, 0.0);
          float cl = smoothstep(0.55, 0.88, fbm(cp * vec2(1.0, 2.6))) * smoothstep(0.0, 0.2, h);
          vec3 cc = mix(mix(top, vec3(1.0), 0.75), vec3(1.5, 1.0, 0.62) * max(cineSunCol.r, 0.4), pow(mu, 4.0) * cineSun.w);
          c = mix(c, cc, cl * 0.45);
        }
        c += cineSunCol * smoothstep(0.99955, 0.99978, mu) * 14.0 * uDisc * cineSun.w;               // 日盘（只在屏幕上，环境光烘焙时关）
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // 11-15 海天共用件：野外（uSS = 1，cineUpdate 按户外 / 显示切换）走天体模型天空（日月星、银河、时段色表、积云），地平线收进场景雾色；
  //   副本 / 选角（uSS = 0）走原来的三段渐变。按画质档在编译时选云层数 / 积云（setQuality 会让材质重编）
  mat.onBeforeCompile = sh => {
    if (!SS_ON) { sh.fragmentShader = sh.fragmentShader.replace('__SS_SKY__', '').replace('__SS_MAIN__', ''); return; }
    const q = ssTierNow(), T = SS_TIER[q];
    sh.fragmentShader = ssDefs(q) + sh.fragmentShader.replace('__SS_SKY__', `uniform float uSS; uniform float uQlHalo; uniform float uDemoSky; uniform vec4 cineDemo3;\n${SS_BASE_GLSL}`).replace('__SS_MAIN__', `float dmW = uDemoSky * smoothstep(-0.06, 0.10, ssSunD.y);   // 11-19 03:12 夜晚保留：白天 Demo 天空，日落后渐变回海天夜空
        vec3 dmC = vec3(0.0);
        if (uSS > 0.5 && dmW > 0.001) {   // 11-19 qldemosun：秋林逆光 r8 源码天空原式（src.html「天空」段 + COMMON airCol），Demo 常量
          vec3 d = normalize(vP); vec3 SD = ssSunD; const vec3 SC = vec3(1.0, 0.74, 0.46) * 3.4; const vec3 FC = vec3(0.50, 0.40, 0.27);
          float sm = dot(d, SD); float mu = max(sm, 0.0); float bk = max(-sm, 0.0);
          vec3 air = FC * mix(vec3(1.0), vec3(0.80, 0.90, 1.10), bk * 0.75) + SC * (pow(mu, 9.0) * 0.40 + mu * mu * 0.40 * 0.22);
          float h = max(d.y, 0.0); vec3 hor = air * 1.15;
          vec3 zen = mix(vec3(0.36, 0.43, 0.54), vec3(0.22, 0.34, 0.56), smoothstep(-0.3, 0.9, -sm));
          vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.7, h), 0.75) * 0.62);
          c += vec3(0.16, 0.08, 0.05) * bk * exp(-h * 9.0) * (0.6 + 0.4 * bk);
          c += SC * (pow(mu, 5.0) * 0.22 + pow(mu, 24.0) * 0.85 + pow(mu, 110.0) * 2.2 + pow(mu, 1200.0) * 10.0);
          c = mix(c, vec3(1.0, 0.95, 0.86) * 5.0, smoothstep(0.975, 0.9995, mu) * 0.55);
          if (uDisc > 0.5) c += SC * smoothstep(0.99962, 0.99985, mu) * 45.0;   // 日盘（环境光烘焙时关，同原日盘）
          if (d.y < 0.0) c = mix(hor, c, smoothstep(-0.04, 0.0, d.y));
          dmC = ssFinite(c, cineHor);
          if (dmW > 0.999) {
            gl_FragColor = vec4(dmC, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            return;
          }
        }
        if (uSS > 0.5) {
          vec3 sd = normalize(vP); float pix = max(length(fwidth(sd)), 2e-4);
          vec3 sc = ssSky(sd, 0.0, pix, ${T.oct}, uDisc > 0.5 ? ${T.stars} : 0, uDisc > 0.5 ? ${T.mw} : 0, uDisc > 0.5) * ssK3.y;
          if (uQlHalo > 0.5 && uDisc > 0.5) {   // 11-19 qlhalo：Demo 天空的太阳光晕（白核 mix 到 (1,.95,.86)×5 + uSunCol 的 5 / 24 / 110 / 1200 次方瓣），射线遮罩的亮度源
            float hmu = max(dot(sd, ssSunD), 0.0), hv = ssK.y;
            sc = mix(sc, vec3(1.0, 0.95, 0.86) * 5.0, smoothstep(0.975, 0.9995, hmu) * 0.55 * hv);
            sc += cineDemo3.rgb * (pow(hmu, 5.0) * 0.22 + pow(hmu, 24.0) * 0.85 + pow(hmu, 110.0) * 2.2 + pow(hmu, 1200.0) * 10.0) * hv;
          }
          sc = mix(cineHor, sc, smoothstep(-0.03, 0.10, sd.y));      // 地平线收进雾色：远处地形融进天
          sc = ssFinite(sc, cineHor);   // 11-16 黑屏修复
          if (dmW > 0.001) sc = mix(sc, dmC, dmW);   // 11-19 黄昏 / 黎明 Demo 天空 ↔ 海天夜空过渡：天空任何一个像素 NaN / Inf 都会被 SkyEnv 烘进 PMREM 并模糊扩散到整张环境贴图（PBR 地面 / 草木全黑约 30 秒），出口兜底
          gl_FragColor = vec4(sc, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }`);
  };
  mat.customProgramCacheKey = () => 'cinesky|' + (SS_ON ? ssTierNow() : 'off');
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  riverReflSetSky(m);   // 天空不进河面反射 RT（水面着色器自己算天空反射）
  return m;
}

// ---------------------------------------------------------------- 每帧：把太阳 / 天 / 雾写进共享参数
const _v = new THREE.Vector3(), _c = new THREE.Color();
export function cineUpdate(dt: number, o: { sun: THREE.DirectionalLight; sky: THREE.Mesh; scene: THREE.Scene; enabled: boolean; outdoor: boolean; /** 11-19 白天程度 0..1（daynight） */ day?: number }) {
  CU.fog2[2] = (CU.fog2[2] + dt) % 10000;
  riverReflFrame();
  _v.copy(o.sun.position).sub(o.sun.target.position).normalize();
  CU.sun[0] = _v.x; CU.sun[1] = _v.y; CU.sun[2] = _v.z; CU.sun[3] = THREE.MathUtils.smoothstep(_v.y, -0.05, 0.12);
  _c.copy(o.sun.color).multiplyScalar(Math.min(o.sun.intensity, 4) / 2.3);
  CU.sunCol[0] = _c.r; CU.sunCol[1] = _c.g; CU.sunCol[2] = _c.b;
  const u = (o.sky.material as THREE.ShaderMaterial).uniforms;
  if (u?.top) { const t = u.top.value as THREE.Color; CU.zen[0] = t.r; CU.zen[1] = t.g; CU.zen[2] = t.b; }
  const f = o.scene.fog as THREE.Fog | null;
  if (f?.color) { CU.hor[0] = f.color.r; CU.hor[1] = f.color.g; CU.hor[2] = f.color.b; }
  CU.fog[3] = o.enabled && f ? 1 : 0;
  CU.fog[2] = o.sun.target.position.y - 0.5;          // 雾底跟着玩家脚下地面
  // 第 10 步：按太阳仰角查关键表（2° / 11° / 27° / 50°），雾浓度、高度衰减、内散射、远景偏蓝、天空日光色一起插值
  const K = o.outdoor && CINE.on[10] ? TOD : null;
  if (K) {
    const el = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1)));
    let i = 0; while (i < K.length - 2 && el > K[i + 1].el) i++;
    const a = K[i], b = K[i + 1], t = THREE.MathUtils.clamp((el - a.el) / (b.el - a.el), 0, 1), L = (x: number, y: number) => x + (y - x) * t;
    CU.fog[0] = L(a.den, b.den); CU.fog[1] = L(a.k, b.k); CU.fog2[0] = L(a.insc, b.insc); CU.fog2[1] = L(a.blue, b.blue);
    for (let j = 0; j < 3; j++) CU.sunCol[j] *= L(a.tint[j], b.tint[j]);
    CU.fog[0] *= LOOK_CUR.fog; CU.fog2[0] *= LOOK_CUR.insc;   // 11-16 各图空气（map_look.ts）
  } else if (o.outdoor) { CU.fog[0] = 0.005; CU.fog[1] = 0.11; CU.fog2[0] = 0.9; CU.fog2[1] = 0.12; }
  else { CU.fog[0] = 0.007; CU.fog[1] = 0.28; CU.fog2[0] = 0.5; CU.fog2[1] = 0.05; }   // 副本 / 洞穴：贴地薄烟，不起远景蓝雾
  // 11-19 Demo 空气：只在 Demo 户外区；雾色白天 = Demo uFogCol，夜里（daylight→0）过渡到场景雾色（昼夜的夜色）；uSunCol = 当前太阳色 × 强度 × 3.4 / 3.5（白天 = Demo 1.0,0.74,0.46 × 3.4）
  CDEMO[0] = o.outdoor && demoZone && CINE.on[25] ? 1 : 0;
  CDEMO[1] = o.outdoor && demoZone && CINE.on[26] ? 1 : 0;   // qlibl
  CDEMO[2] = o.outdoor && demoZone && CINE.on[28] ? 1 : 0;   // specclass
  if (CDEMO[0]) {
    const dl = o.day ?? 1, fc = f?.color;
    CDEMO2[0] = 0.50 * dl + (fc ? fc.r : 0.5) * (1 - dl); CDEMO2[1] = 0.40 * dl + (fc ? fc.g : 0.4) * (1 - dl); CDEMO2[2] = 0.27 * dl + (fc ? fc.b : 0.27) * (1 - dl);
    CDEMO2[3] = 0.0058 * LOOK_CUR.fog;
    const k = o.sun.intensity * 3.4 / 3.5; CDEMO3[0] = o.sun.color.r * k; CDEMO3[1] = o.sun.color.g * k; CDEMO3[2] = o.sun.color.b * k; CDEMO3[3] = 0.40 * LOOK_CUR.insc;
  }
  // 11-15 海天共用件：野外（天空显示中、海岸没接管）每帧推进天体模型 / 色表；雾内散射 / 背光指向真太阳，夜里不给暖色内散射
  if (SS_ON) {
    const ss = o.outdoor && !!o.sky.parent && o.sky.visible;
    if (u?.uSS) u.uSS.value = ss ? 1 : 0;
    if (u?.uQlHalo) u.uQlHalo.value = ss && demoZone && !QLHALO_OFF ? 1 : 0;   // 11-19 qlhalo
    if (u?.uDemoSky) u.uDemoSky.value = ss && demoZone && ssDemoFullOn() ? 1 : 0;   // 11-19 qldemosun
    if (ss && ssBaseTick(dt, f?.far ?? 170)) {
      const sv = ssU.ssK.value.y, S = ssU.ssSunD.value;
      if (sv > 0.001) { CU.sun[0] = S.x; CU.sun[1] = Math.max(S.y, 0.02); CU.sun[2] = S.z; }
      CU.sun[3] = Math.min(CU.sun[3], sv);
    }
  }
}
/** 时段关键表（思路参考 Painted Valley sky.js，MIT；数值为本项目自调） */
const TOD = [   // 11-14 自查：原浓度近景发白、饱和度 0.43→0.32（发灰），整体减半

  { el: 2, den: 0.008, k: 0.09, insc: 1.4, blue: 0.10, tint: [1.0, 0.62, 0.38] },
  { el: 11, den: 0.0065, k: 0.10, insc: 1.15, blue: 0.12, tint: [1.0, 0.8, 0.58] },
  { el: 27, den: 0.005, k: 0.11, insc: 0.9, blue: 0.14, tint: [1.0, 0.93, 0.82] },
  { el: 50, den: 0.004, k: 0.12, insc: 0.7, blue: 0.15, tint: [1.0, 1.0, 1.0] },
];

// ---------------------------------------------------------------- 第 2 步：太阳位置（按钟点：白天东升西落、仰角 14°–58°，夜里月亮 40°）
const BASE_OFF = new THREE.Vector3(25, 40, 18);
const BASE_AZ = Math.atan2(18, 25);
/** 太阳相对玩家的偏移（长度约 54 m）；outdoor = 吃昼夜的户外图，hour = 游戏钟点（0–24） */
export function cineSunOffset(out: THREE.Vector3, outdoor: boolean, hour: number) {
  if (CINE.on[2] && demoZone && ssDemoFullOn() && !outdoor) return out.copy(DEMO_SUN).multiplyScalar(54);   // 11-19 qldemosun：昼夜关时恒为 Demo 太阳；昼夜开走 ssLightDir（白天 Demo SUN、夜里月光）
  if (!CINE.on[2] || !outdoor) return out.copy(BASE_OFF);
  // 11-15 海天共用件：太阳 / 月亮按天体模型（白天太阳低于 6° 按 6° 打，夜里月光不低于 25°），与天空日盘 / 月亮同一方向
  if (SS_ON) return ssLightDir(hour, 6, out).multiplyScalar(54);
  let el: number, az: number;
  if (hour >= 5.5 && hour <= 19.5) {
    const t = (hour - 5.5) / 14;                       // 0 = 日出，1 = 日落
    el = THREE.MathUtils.degToRad(14 + 44 * Math.sin(Math.PI * t));
    az = BASE_AZ + (t - 0.55) * 2.0;                  // 一天扫过约 115°
  } else { el = THREE.MathUtils.degToRad(40); az = BASE_AZ + Math.PI * 0.8; }
  const r = 54;
  return out.set(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
}
// ---------------------------------------------------------------- 第 8 步：阴影相机按纹素对齐（走动时阴影边缘不游动）
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _l = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function cineSnapShadow(sun: THREE.DirectionalLight, center: THREE.Vector3, off: THREE.Vector3) {
  sun.target.position.copy(center);
  if (CINE.on[8]) {
    const cam = sun.shadow.camera, size = sun.shadow.mapSize.x || 1024;
    const tx = (cam.right - cam.left) / size, ty = (cam.top - cam.bottom) / size;
    _m.lookAt(off, _l.set(0, 0, 0), _up); _q.setFromRotationMatrix(_m);      // 光源朝向（世界 → 光空间用逆旋转）
    _l.copy(center).applyQuaternion(_q.clone().invert());
    _l.x = Math.round(_l.x / tx) * tx; _l.y = Math.round(_l.y / ty) * ty;
    sun.target.position.copy(_l.applyQuaternion(_q));
  }
  sun.position.copy(sun.target.position).add(off);
}

// ---------------------------------------------------------------- 第 5 步：风（草 / 花 / 叶，全在顶点着色器）+ 第 11 步叶片透光
/** amp：每米高度的摆幅（草 0.09、花 / 芦苇 0.06、叶 0.012）；thin：透光强度 */
export function cineWind(m: THREE.Material, amp = 0.09, thin = 0.5) {
  if (m.userData.cineWind) return m; m.userData.cineWind = amp;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r);
    sh.uniforms.cineFog2 = { value: CU.fog2 }; sh.uniforms.cineFx2 = { value: CFX2 };
    sh.vertexShader = 'uniform vec4 cineFog2; uniform vec4 cineFx2;\n' + (QL_DEMO.wind ? 'float cwH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat cwVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cwH(i), cwH(i + vec2(1.0, 0.0)), f.x), mix(cwH(i + vec2(0.0, 1.0)), cwH(i + 1.0), f.x), f.y); }\n' : '') + cinePatch(sh.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
      { vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float hgt = max(position.y, 0.0), t = cineFog2.z;
        float ph = t * 1.6 + ip.x * 0.35 + ip.z * 0.27;
        ${QL_DEMO.wind ? `// 11-17g 专长包 v8 风场（?off=qlwind 回旧）：与原野草木同一个 gustAt —— 风向 (0.894, 0.447)、阵风图样顺风 3.2 m/s 推进，
        //   映射 0.3 + 1.6 g；摆动主要顺风（前倾 + 来回），横向只留小幅。时间直接用 cineFog2.z（不依赖原野草木节拍器，营地 / 野外 toon 草也能用）
        vec2 cwD = vec2(0.894, 0.447), cwQ = ip.xz - cwD * 3.2 * t;
        float cwG = cwVn(cwQ * 0.03) * 0.6 + cwVn(cwQ * 0.11 + 7.0) * 0.4;
        float cwR = sin(dot(ip.xz, cwD) * 0.45 - t * 2.2 + cwVn(ip.xz * 0.06) * 5.0) * 0.5 + 0.5;
        float gust = 0.3 + 1.6 * clamp(cwG * 0.8 + cwR * cwG * 0.45 - 0.15, 0.0, 1.0);
        vec2 cwO = cwD * (0.45 * gust + 0.6 * sin(ph) + 0.2 * sin(ph * 2.7)) + vec2(-cwD.y, cwD.x) * 0.35 * cos(ph * 0.8);
        transformed.xz += cwO * ${amp.toFixed(4)} * hgt * gust * cineFx2.x; }` : `float gust = 0.55 + 0.45 * sin(t * 0.45 + ip.x * 0.05 + ip.z * 0.03);
        transformed.x += (sin(ph) + 0.35 * sin(ph * 2.7)) * ${amp.toFixed(4)} * hgt * gust * cineFx2.x;
        transformed.z += cos(ph * 0.8) * ${amp.toFixed(4)} * 0.6 * hgt * gust * cineFx2.x; }`}`, 'wind.begin_vertex');
    if (thin > 0) sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_end>', `#include <lights_fragment_end>
      #ifdef USE_FOG
      { vec3 cVs = normalize((viewMatrix * vec4(cineSun.xyz, 0.0)).xyz);
        float tr = pow(max(dot(-geometryViewDir, cVs), 0.0), 4.0) * ${thin.toFixed(3)} * cineSun.w * step(0.01, cineFx.y);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * cineSunCol * tr; }
      #endif`, 'wind.lights_fragment_end');
  };
  m.customProgramCacheKey = () => prevKey() + '|cw' + amp + (QL_DEMO.wind ? 'q' : '');
  m.needsUpdate = true; return m;
}

// ---------------------------------------------------------------- 第 7 步：三平面映射（平铺贴图的石面 / 岩石 / 地板：世界坐标取样，拉伸条纹消失）
/** k = 每米重复次数（贴图尺度）。只给平铺贴图用（Lux3D 烘焙图集不能三平面） */
export function cineTriplanar(m: THREE.MeshToonMaterial | THREE.MeshStandardMaterial, k = 0.5) {
  if (m.userData.cineTri || !m.map) return m; m.userData.cineTri = k;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r);
    sh.uniforms.cTriF2 = { value: CFX2 }; sh.uniforms.cineFxT = { value: CFX };
    sh.vertexShader = 'varying vec3 vTriP; varying vec3 vTriN;\n' + cinePatch(sh.vertexShader, '#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 tp = vec4(transformed, 1.0); vec3 tn = objectNormal;
        #ifdef USE_INSTANCING
          tp = instanceMatrix * tp; tn = mat3(instanceMatrix) * tn;
        #endif
        vTriP = (modelMatrix * tp).xyz; vTriN = normalize(mat3(modelMatrix) * tn); }`, 'tri.worldpos_vertex');
    sh.fragmentShader = 'varying vec3 vTriP; varying vec3 vTriN; uniform vec4 cTriF2; uniform vec4 cineFxT;\n' + cinePatch(sh.fragmentShader, '#include <map_fragment>', `
      #ifdef USE_MAP
      { vec4 sdc;
        if (cTriF2.y > 0.5) {
          vec3 tw = pow(abs(normalize(vTriN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec3 tp = vTriP * ${k.toFixed(4)};
          sdc = texture2D(map, tp.zy) * tw.x + texture2D(map, tp.xz) * tw.y + texture2D(map, tp.xy) * tw.z;
          // 第 12 步：贴图图案小于约 1.5 像素就淡成平均色（远处不闪、不出摩尔纹）
          if (cineFxT.w > 0.5) { float px = length(fwidth(tp)) * float(textureSize(map, 0).x); sdc = mix(sdc, textureLod(map, vec2(0.5), 20.0), smoothstep(0.6, 1.5, px) * 0.85); }
        } else sdc = texture2D(map, vMapUv);
        diffuseColor *= sdc; }
      #endif`, 'tri.map_fragment');
  };
  m.customProgramCacheKey = () => prevKey() + '|tri' + k;
  m.needsUpdate = true; return m;
}

// ---------------------------------------------------------------- 第 6 步：水面（低粗糙度 PBR + 程序化平铺法线，滚动；天光菲涅尔 + 太阳闪光）
let _wn: THREE.DataTexture | null = null;
export const waterNormTex: THREE.Texture[] = [];
/** 整数频率正弦和 → 无缝平铺的法线贴图 */
const _toonOf = new WeakMap<THREE.Material, THREE.Material>(), _stdOf = new WeakMap<THREE.Material, THREE.Material>();
export function cineWaterNormals(size = 256) {
  if (_wn) return _wn;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const h = new Float32Array(size * size), W: number[][] = [];
  for (let i = 0; i < 28; i++) { const a = rnd() * Math.PI * 2, f = 1 + Math.floor(rnd() * (3 + i * 0.6)); W.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), 1 / (1 + f * 0.9), rnd() * 6.28]); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let v = 0; for (const w of W) v += Math.sin(((x * w[0] + y * w[1]) / size) * 6.2832 + w[3]) * w[2]; h[y * size + x] = v; }
  const d = new Uint8Array(size * size * 4), n = new THREE.Vector3();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], b = h[((y - 1 + size) % size) * size + x], t = h[((y + 1) % size) * size + x];
    n.set((l - r) * 2, (b - t) * 2, 1).normalize(); const i = (y * size + x) * 4;
    d[i] = (n.x * 0.5 + 0.5) * 255; d[i + 1] = (n.y * 0.5 + 0.5) * 255; d[i + 2] = (n.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return (_wn = tex);
}
/** 河 / 池水：返回写实水面材质（老的卡通水面材质留着，第 6 步关时换回） */
export function cineWater(toonMat: THREE.MeshToonMaterial, color: THREE.ColorRepresentation, opacity: number) {
  if (SS_ON) { const m = QL.river ? qlRiverMaterial(color, opacity) : ssWaterMaterial(color, opacity);   // 11-19 qlriver：r8 河面（?off=qlriver 回 C22 海天河水）
     _toonOf.set(m, toonMat); _stdOf.set(toonMat, m); return m as unknown as THREE.MeshStandardMaterial; }
  const nt = cineWaterNormals().clone(); nt.needsUpdate = true; nt.repeat.set(6, 6); waterNormTex.push(nt);
  const c = new THREE.Color(color).multiplyScalar(0.55);
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.07, metalness: 0, normalMap: nt, normalScale: new THREE.Vector2(0.45, 0.45),
    transparent: true, opacity: Math.min(0.94, opacity + 0.04), depthWrite: false, envMapIntensity: 1.25 });
  _toonOf.set(m, toonMat); m.userData.outlineParameters = { visible: false }; _stdOf.set(toonMat, m);   // WeakMap：userData 互指会让 material.clone() 的 JSON 循环报错
  return m;
}
// 11-15 海天共用件：河 / 沼泽水面（v2 河水版，照参考视频的 exp-sin 叠加波，但比海柔得多）
//   · 波在「流向坐标」里算：q = (uv.x·每 u 米数, uv.y·河宽)，沿河连续、无接缝；整体随水流平移（河 0.45 m/s，池塘 0.06 m/s）+ 静态噪声扭曲 + 阵风斑（猫爪纹）调振幅
//   · 法线：小振幅短波长多向 exp-sin（2.2–0.15 米，±70° 扇面）+ 两层滚动细法线贴图；坡度经屏幕导数从 q 空间换回世界 xz
//   · 菲涅耳用压扁法线、反射用完整法线（天 / 云带扭曲，近地平线压成岸色）；太阳 Beckmann 细粗糙度 → 碎闪光（不再有一整块镜面）；月光两瓣保留
//   · 近岸：按横向位置算水深（河床剖面同 fieldGroundY：0.7 米深槽、水面 −0.12）→ 浅水透明透出河底、偏黄绿；最浅处湿暗带 + 碎泡沫线
//   · 片元浪数按画质：低 6 / 中 10 / 高 14 / 超高 18；低档单层细法线、无扭曲
const SS_WATER_N = { low: 6, medium: 10, high: 14, ultra: 18 } as const;
const _wv = new THREE.Vector3(), _wv2 = new THREE.Vector3();
/** 每块水面网格算一次：每 u / 每 v 多少米、是不是长条河（u 跨度 > 1.5） */
function ssWaterGeoK(g: THREE.BufferGeometry, o: THREE.Object3D, out: THREE.Vector4) {
  const P = g.getAttribute('position'), U = g.getAttribute('uv');
  if (!P || !U || P.count < 3) return out.set(10, 10, 0.06, 0);
  const n = Math.min(P.count, 400); let ku = 0, kv = 0, umax = 0;
  const s = new THREE.Vector3(); o.getWorldScale(s);
  for (let j = 1; j < n; j++) {
    const du = Math.abs(U.getX(j) - U.getX(0)), dv = Math.abs(U.getY(j) - U.getY(0));
    _wv.fromBufferAttribute(P, 0).multiply(s); _wv2.fromBufferAttribute(P, j).multiply(s); const d = _wv.distanceTo(_wv2);
    if (!ku && du > 1e-4 && dv < 1e-4) ku = d / du;
    if (!kv && dv > 1e-4 && du < 1e-4) kv = d / dv;
  }
  for (let j = 0; j < U.count; j++) umax = Math.max(umax, U.getX(j));
  const river = umax > 1.5 ? 1 : 0;
  return out.set(ku || 10, kv || 10, river ? 0.45 : 0.06, river);
}
/** 河面反射 RT：只在高 / 超高档，且没被 ?off=riverrefl 关 */
const ssReflOn = () => { const q = ssTierNow(); return !RIVER_REFL.off && (q === 'high' || q === 'ultra'); };
function ssWaterMaterial(color: THREE.ColorRepresentation, opacity: number) {
  const K = new THREE.Vector4(10, 10, 0.06, 0); let kDone = false;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...ssU, ...THREE.UniformsLib.fog, ...cineUniforms(), uColor: { value: new THREE.Color(color) }, uOpacity: { value: Math.min(0.94, opacity + 0.04) },
      uK: { value: K }, uN: { value: cineWaterNormals() }, ...riverReflU, ...wakeU },
    vertexShader: /* glsl */ `varying vec3 vW; varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: '',
  });
  // 河面平均高度（世界）= 镜面；只有长条河（uK.w = 1）在高 / 超高档画反射 RT
  let planeY = 0;
  m.onBeforeRender = (r, s, c, g, o) => {
    if (!kDone) { ssWaterGeoK(g as THREE.BufferGeometry, o, K); const gg = g as THREE.BufferGeometry; if (!gg.boundingBox) gg.computeBoundingBox();
      planeY = gg.boundingBox!.getCenter(_wv).applyMatrix4(o.matrixWorld).y; kDone = true; }
    if (K.w > 0.5 && ssReflOn()) riverReflUpdate(r, s as THREE.Scene, c, planeY, ssU.ssK3.value.y);
    wakeMark(o, g as THREE.BufferGeometry, planeY);
  };
  riverReflMarkWater(m);
  const build = () => {
    const q = ssTierNow(), T = SS_TIER[q], low = q === 'low', refl = ssReflOn();
    return /* glsl */ `${ssDefs(q)}uniform vec3 uColor; uniform float uOpacity; uniform vec4 uK; uniform sampler2D uN; varying vec3 vW; varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      ${SS_BASE_GLSL}
      ${WAVE_GLSL}
      ${refl ? RIVER_REFL_GLSL : ''}
      ${WATER2.off || low ? '' : W2_GLSL}
      ${wakeOn() ? WAKE_GLSL : ''}
      float rvH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rvN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(rvH(i), rvH(i + vec2(1, 0)), f.x), mix(rvH(i + vec2(0, 1)), rvH(i + vec2(1, 1)), f.x), f.y); }
      float rvLost;
      // 各向异性 Beckmann：f = 视线水平方向（拉长轴）、sd = 横向；ax < ay → 太阳 / 月亮反光拉成顺视线的竖光柱
      float rvSpecA(vec3 n, vec3 V, vec3 L, vec3 f, vec3 sd, float ax2, float ay2){
        vec3 Hh = normalize(V + L); float nh = max(dot(n, Hh), 1e-3), nv = max(dot(n, V), 0.05), nl = max(dot(n, L), 0.0);
        float tx = dot(Hh, sd) / nh, ty = dot(Hh, f) / nh;
        float D = exp(-(tx * tx / ax2 + ty * ty / ay2)) / (3.14159 * sqrt(ax2 * ay2) * nh * nh * nh * nh);
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
        return D * F / (4.0 * nv) * step(0.0, nl) * smoothstep(0.0, 0.08, L.y + 0.02);
      }
      // 河面 exp-sin：p = 流向坐标（米，x 顺流）；返回 (高度均值, ∂h/∂x, ∂h/∂z)（单位：每米振幅）
      vec3 rvSum(vec2 p, float t, int n, float pix){
        float it = 0.0, k = 4.4, w = 1.0, sw = 0.0, h = 0.0; vec2 g = vec2(0.0); rvLost = 0.0;   // v2：起始波长 1.4 米（原 2.2），衰减更慢 → 更碎更匀
        for (int i = 0; i < 24; i++){
          if (i >= n) break;
          float an = sin(it) * 1.22; vec2 D = vec2(cos(an), sin(an));
          float x = dot(D, p) * k + t * sqrt(9.8 * k) * 0.55 + it;
          float e = exp(sin(x) - 1.0), dx = e * cos(x);
          float fade = 1.0 - smoothstep(0.22, 0.5, pix * k * 0.159);
          h += e * w; g += D * (dx * k * w * fade);
          rvLost += (1.0 - fade) * w * w * k * k * 0.25;
          p -= D * (dx * w * 0.035 / k);
          sw += w; w *= 0.86; k *= 1.19; it += 1232.399963;
        }
        rvLost /= sw * sw;
        return vec3(h, g) / sw;
      }
      void main(){
        vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
        float t = ssT;
        // 流向坐标 + 屏幕导数求 q → 世界 xz 的雅可比（每三角形精确，曲河只差几度）
        vec2 q = vec2(vUv.x * uK.x, vUv.y * uK.y);
        vec2 qx = dFdx(q), qy = dFdy(q), wx = dFdx(vW.xz), wy = dFdy(vW.xz);
        float det = wx.x * wy.y - wx.y * wy.x; det = abs(det) < 1e-9 ? 1e-9 : det;
        mat2 iW = mat2(wy.y, -wx.y, -wy.x, wx.x) / det;     // inverse([wx wy])
        mat2 J = mat2(qx, qy) * iW;                          // dq/dxz（列 = ∂q/∂x, ∂q/∂z）
        float pix = max(length(fwidth(q)), 1e-3);
        vec2 qa = q - vec2(uK.z * t, 0.0);                    // 随水流平移
        ${low ? '' : 'qa += (vec2(rvN(q * 0.11), rvN(q * 0.11 + 17.3)) - 0.5) * 2.4;   // 静态扭曲：不让纹理排成直线'}
        // 阵风斑（猫爪纹）：低频噪声随风慢漂，调振幅不调频率
        float gust = 0.78 + 0.44 * rvN(q * vec2(0.045, 0.09) - vec2(t * 0.05 + uK.z * t * 0.4, t * 0.02));   // v2：阵风斑收窄（原 0.55–1.45），不再成片明暗
        float A = 0.021 * gust;
        vec3 wv = rvSum(qa, t, ${SS_WATER_N[q]}, pix);
        vec2 sq = wv.yz * A;
        // 两层滚动细法线（贴图 1/1.6 米、1/0.7 米），顺流快慢不同 + 少量横漂
        vec3 t1 = texture2D(uN, qa * 1.05 + vec2(t * 0.11, t * 0.03)).xyz * 2.0 - 1.0;
        sq += t1.xy / max(t1.z, 0.3) * 0.042 * gust;
        ${low ? '' : `vec3 t2 = texture2D(uN, vec2(qa.y, -qa.x) * 2.3 + vec2(-t * 0.05, t * 0.21)).xyz * 2.0 - 1.0;
        sq += t2.xy / max(t2.z, 0.3) * 0.034;`}
        vec2 sw2 = vec2(dot(sq, J[0]), dot(sq, J[1]));   // 链式法则：∂h/∂x_w = Σ ∂h/∂q · ∂q/∂x_w
        float nearK = mix(1.25, 0.7, smoothstep(8.0, 70.0, dist));
        vec3 n = normalize(vec3(-sw2.x * nearK, 1.0, -sw2.y * nearK));
        ${wakeOn() ? 'vec4 wk = wkG(vW.xz); n = normalize(vec3(n.x / n.y - wk.x, 1.0, n.z / n.y - wk.y));   // 11-18 r8 尾迹坡度 → 法线（倒影、高光跟着扰动）' : 'vec4 wk = vec4(0.0);'}
        // 水深（横向剖面：河中 0.58 米，到岸线 0；池塘按两向）
        float halfV = uK.y * 0.5, across = abs(vUv.y - 0.5) * uK.y;
        float shore = (halfV - 0.39) - across;
        if (uK.w < 0.5) shore = min(shore, (uK.x * 0.5 - 0.39) - abs(vUv.x - 0.5) * uK.x);
        float depth = clamp(shore * 0.152, 0.0, 0.6);
        // 菲涅耳（压扁法线）/ 反射（完整法线带扭曲）
        vec3 nF = normalize(vec3(n.x * 0.3, n.y, n.z * 0.3));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nF, V), 0.0), 5.0);
        // 倒影：法线扰动顺视线（屏幕竖向）放大、横向收小 → 倒影拉成竖条、被细波打碎；远处更清楚、近处更碎
        vec3 fw = normalize(vec3(-V.x, 0.0, -V.z) + vec3(1e-4, 0.0, 0.0)), sdv = vec3(-fw.z, 0.0, fw.x);
        float brk = mix(1.1, 0.5, smoothstep(6.0, 80.0, dist));
        vec3 nR = normalize(vec3(0.0, 1.0, 0.0) + fw * dot(n, fw) * 1.5 * brk + sdv * dot(n, sdv) * 0.45 * brk);   // v2：顺视线 2.2→1.5，少把反射压到地平线下（深斑的来源）
        vec3 R = reflect(-V, nR); vec3 Rs = normalize(vec3(R.x, max(R.y, 0.004), R.z));
        vec3 sky = ssSky(Rs, 0.0, 0.0, ${T.roct}, 0, 0, false);
        // 近地平线的反射里是对岸草坡：压成暗岸色（场景没有镜面反射时的兜底）
        // 岸物倒影兜底（野外没有反射 RT / SSR）：近地平线一带 = 远处雾色（远岸空气）→ 下面压成暗岸色（草坡 / 芦苇），
        //   横向用噪声做高低不齐的「剪影」，跟着扰动后的 R 一起被拉长打碎
        float az = atan(R.z, R.x) * 9.0;
        float sil = 0.035 + 0.05 * rvN(vec2(az, 0.5)) + 0.03 * rvN(vec2(az * 4.0, 2.0));
        vec3 bank = (ssAmb * 0.45 + ssSunC * 0.004 * max(ssSunD.y, 0.0)) * vec3(0.26, 0.30, 0.13);
        vec3 haze = ssHorAt(Rs) * 0.85;
        // v2 暗部兜底：反射不低于视线方向的平均天光 × 0.5–0.6（波峰把反射压到地平线下时不再成黑洞）
        vec3 skyAvg = ssHorAt(normalize(vec3(fw.x, 0.3, fw.z))) * 0.9;
        sky = mix(sky, skyAvg, 0.18);                       // 天空反射整体略收对比，细波不出成片斑
        sky = mix(sky, haze, smoothstep(sil + 0.05, sil, R.y) * 0.6);
        ${refl ? `if (uK.w > 0.5 && uReflP.y > 0.5) {
          // 平面镜面反射 RT：法线扰动 uv，顺视线（屏幕竖向）大、横向小；近处碎、远处清
          float dk = mix(1.0, 0.15, smoothstep(4.0, 60.0, dist));
          vec2 ofs = vec2(dot(n, sdv) * 0.05, dot(n, fw) * 0.32) * dk;
          vec4 rf = rrSample(vW, ofs);
          sky = max(sky, skyAvg * 0.6);                     // 天空部分的兜底（物体倒影不受这条限制）
          sky = mix(sky, rf.rgb / max(ssK3.y, 1e-3), rf.a);   // 末尾整体 × ssK3.y，这里先除掉
        } else {
          sky = mix(sky, mix(bank, skyAvg * 0.45, 0.35), smoothstep(sil, sil - 0.02, R.y) * 0.75);
          sky = max(sky, skyAvg * 0.5);
        }` : `sky = mix(sky, mix(bank, skyAvg * 0.45, 0.35), smoothstep(sil, sil - 0.02, R.y) * 0.75);
        sky = max(sky, skyAvg * 0.5);`}
        sky *= 0.84;   // 深色而有光泽：反射整体略收
        // 水体：深处 = 原水色压暗 × 天光；浅处透出河底（透明度随光程），偏黄绿
        vec3 light = ssAmb * 1.6 + ssSunC * 0.006 * max(ssSunD.y, 0.0) + vec3(0.02);
        vec3 body = uColor * 0.22 * light * (0.4 + 0.6 * ssK2.x);
        float path = depth * (1.0 + 1.0 / max(V.y, 0.25));
        float trans = exp(-2.6 * path);                       // 1 = 看得见河底
        body = mix(body, vec3(0.42, 0.40, 0.22) * light * 0.12, trans * 0.6);
        float wet = smoothstep(0.16, 0.0, shore);             // 最浅处湿暗带
        vec3 col = mix(body, sky, fres * 0.92);
        // 太阳：细粗糙度 → 碎闪光；只留很弱的宽瓣做光带底子
        float a2 = 2.0 * (0.0009 + rvLost * A * A * 9.0 + 0.004 * smoothstep(25.0, 200.0, dist)) + 2.0 * dot(fwidth(n.xz), fwidth(n.xz));
        float hz = ssHz();
        // 碎闪光（完整法线、细粗糙度）+ 拉长光柱（各向异性，顺视线 4 倍长）；月亮同理，夜里一条冷色光柱
        vec3 spec = ssSunC * ((0.0014 + 0.0014 * hz) * wvSpec(n, V, ssSunD, a2) + (0.0006 + 0.0012 * hz) * rvSpecA(n, V, ssSunD, fw, sdv, a2 * 0.6 + 0.0015, a2 * 8.0 + 0.03))
                  + ssMoonC * (0.012 * wvSpec(n, V, ssMoonD, a2 * 1.6 + 0.002) + 0.03 * rvSpecA(n, V, ssMoonD, fw, sdv, a2 + 0.002, a2 * 10.0 + 0.04));
        col += min(spec, vec3(40.0)) * (1.0 - wet * 0.7);
        // 岸边碎泡沫线：顺流漂的噪声，断断续续
        ${low ? 'float foam = 0.0;' : `float fn = rvN(qa * vec2(0.9, 2.6)) * 0.65 + rvN(qa * vec2(2.3, 5.1) + 7.0) * 0.35;
        float foam = smoothstep(0.56, 0.8, fn) * smoothstep(0.0, 0.07, shore) * (1.0 - smoothstep(0.12, 0.45, shore)) * 0.55;`}
        ${wakeOn() ? 'foam = max(foam, wkFoam(vW.xz, t, wk.z) * 0.85);' : ''}
        ${WATER2.off || low ? 'col = mix(col, light * 0.75 * vec3(0.95, 0.97, 1.0), foam);' : `foam *= 0.35 + 0.65 * w2FoamOp(foam * 1.8, rvN(qa * 3.1));   // 11-17 v2：泡沫透明度按光学厚度（Beer-Lambert）
        col = mix(col, w2FoamLit(vec3(0.8, 0.86, 0.86), ssSunC * 0.0075 * max(dot(n, ssSunD), 0.0), ssAmb * 1.43, sky, fres), foam);   // 泡沫受光：太阳 Lambert + 天空半球 + 周围反射 + 湿面菲涅耳`}
        col = mix(col, vec3(0.05, 0.045, 0.03) * light, wet * 0.55);
        float alpha = mix(uOpacity, 1.0, fres * 0.6);
        alpha = mix(alpha, 0.18 + fres * 0.5, trans * 0.85);
        alpha = max(alpha, max(foam, wet * 0.5));
        gl_FragColor = vec4(col * ssK3.y, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`;
  };
  m.fragmentShader = build();
  m.onBeforeCompile = sh => { sh.fragmentShader = build(); };
  m.customProgramCacheKey = () => 'sswater2|' + ssTierNow() + (ssReflOn() ? '|refl' : '') + (wakeOn() ? '|wk' : '');
  m.userData.outlineParameters = { visible: false };
  return m;
}
// ---------------------------------------------------------------- 11-19 qlriver：秋林逆光 r8 河面 waterMat 逐式移植（src.html 870–958 行）
//   Rhett 11-19「再检查本体版中的水是否复刻源码的水」；03:04 拍板：保留 0.45 m/s 水流、不加船、中档开镜面。
//   与 r8 的对应：4 向解析波 + 值噪声梯度（×0.010 / ×0.022、距离衰减）→ 压扁法线菲涅耳 → skyRefl 原式（地平线 airCol·1.15、天顶混、太阳瓣、逆光岸林剖面）
//   → 镜面 RT（TAPS 6/4 竖向拉长 + IGN 抖动 + 亮度加权，越界回 skyRefl）→ 水面阴影 4 点 PCF → GGX（a = .010 + .05·|g|）→ RGB 吸收 σ(.8,.27,.36)·1.2 + 散射本色
//   → 翻搅（散射往 (.42,.50,.46) 混、aW = max）→ 预乘合成 col = scat·aW·(1−F) + refl·F + spec、aOut = 1 − (1−aW)(1−F) → 岸沫 shoreV + 尾迹蕾丝泡沫 + 闪烁格 → 泡沫受光 → 雾 → 预乘输出。
//   游戏侧差别（写明）：① 波 / 噪声 / 岸沫在「流向坐标」里算并随水流 0.45 m/s 平移（r8 无水流，Rhett 拍板保留），坡度经屏幕导数换回世界 xz；
//   ② bedDepth 剖面原式，HW = 原野河真实岸线 3.81 米（河床 0.7 米深槽 4.6 米宽、水面 −0.12；r8 HW 8）；池塘（腐沼神殿）按四边算离岸，HW = 短边一半；
//   ③ uSunDir / uSunCol / airCol：Demo 户外区 = r8 常量（与 qldemosun 的 Demo 天空 uDemoSky 同一组：DEMO_SUN、(1,.74,.46)·3.4、雾色 (.50,.40,.27)、内散射 .40）；
//      非 Demo 区（腐沼神殿副本 / ?off=qldemosun）用游戏的太阳方向、太阳色 ×2.23、场景雾色；④ 雾走 cine 的 fog_fragment（Demo 区即 Demo applyFog 原式）。
const QL_RIVER_HW = 4.6 * (1 - 0.12 / 0.7);   // 原野河岸线（fieldGroundY 河床 −0.7·(1 − rv/4.6)，水面 −0.12）
export const QLU = {
  uQlT: { value: 0 }, uQlSun: { value: new THREE.Vector3(0.4, 0.27, -1).normalize() }, uQlSunC: { value: new THREE.Vector3(3.4, 2.516, 1.564) },
  uQlFogC: { value: new THREE.Vector4(0.5, 0.4, 0.27, 0.4) }, tQlShadow: { value: null as THREE.Texture | null }, uQlShM: { value: new THREE.Matrix4() }, uQlHasSh: { value: 0 },
};
export const QLRIVER_STAT = { mats: 0, mirror: 0, shadow: 0, /** Demo 白天权重 0..1 */ demo: 0 };
const _qlTmp = new THREE.Vector3(), _qlTmp4 = new THREE.Vector4();
let _qlSunL: THREE.DirectionalLight | null = null, _qlSunScene: THREE.Object3D | null = null, _qlSunAt = -999, _qlFrame = 0, _qlLogged = false;
const qlTaps = (q: SsTier) => (q === 'low' ? 1 : q === 'medium' ? 4 : 6);
/** 镜面开不开：r8 = 中 / 高 / 超高（?off=qlmirror 回 C22 = 只高 / 超高） */
const qlMirOn = () => { const q = ssTierNow(); return !RIVER_REFL.off && (QL.mirror ? q !== 'low' : (q === 'high' || q === 'ultra')); };
function qlLightTick(scene: THREE.Object3D) {
  _qlFrame++;
  if (scene !== _qlSunScene || _qlFrame - _qlSunAt > 120) {   // 场景主光（投影的平行光）：每 120 帧或换场景重找
    _qlSunL = null; _qlSunScene = scene; _qlSunAt = _qlFrame;
    scene.traverse(o => { const l = o as THREE.DirectionalLight; if (!_qlSunL && l.isDirectionalLight && l.castShadow) _qlSunL = l; });
  }
  const demo = cineIsDemoZone() && ssDemoFullOn();
  // 游戏分支（非 Demo 区；Demo 区入夜 = 月光）：游戏光向 / 光色 ×2.23 / 场景雾色
  QLU.uQlSun.value.set(CU.sun[0], CU.sun[1], CU.sun[2]); QLU.uQlSunC.value.set(CU.sunCol[0], CU.sunCol[1], CU.sunCol[2]).multiplyScalar(2.3 * 3.4 / 3.5);
  QLU.uQlFogC.value.set(CU.hor[0], CU.hor[1], CU.hor[2], 0.4);
  // 11-19 03:12 Rhett「夜晚必须要有，白天是复刻秋林逆光的光源」：Demo 区白天用 r8 常量（= Demo 天空 uDemoSky 同一组），
  //   权重与天空 uDemoSky 渐变同式 smoothstep(−0.06, 0.10, ssSunD.y)，入夜混回游戏分支（月光），不再整夜黄金色
  const sy = (ssU.ssSunD.value as THREE.Vector3).y, wd = demo ? THREE.MathUtils.smoothstep(sy, -0.06, 0.10) : 0;
  if (wd > 0) {
    _qlTmp.copy(ssU.ssSunD.value as THREE.Vector3); QLU.uQlSun.value.lerp(_qlTmp, wd).normalize();
    QLU.uQlSunC.value.lerp(_qlTmp.set(1.0, 0.74, 0.46).multiplyScalar(3.4), wd);
    QLU.uQlFogC.value.lerp(_qlTmp4.set(0.5, 0.4, 0.27, 0.4), wd);
  }
  const L = _qlSunL as THREE.DirectionalLight | null, sm = L?.shadow?.map;
  QLU.uQlHasSh.value = QL.spec && L && sm ? 1 : 0;
  if (L && sm) { QLU.tQlShadow.value = sm.texture; QLU.uQlShM.value.copy(L.shadow.matrix); }
  QLRIVER_STAT.demo = +wd.toFixed(2); QLRIVER_STAT.shadow = QLU.uQlHasSh.value;
}
export function qlRiverTick(dt: number) { QLU.uQlT.value = (QLU.uQlT.value + dt) % 3600; }
/** 11-19 落霞湖 qllake：同一套 r8 waterMat，湖面版（静水 + 风纹、离岸距离走顶点属性 aShore、镜面照开、不接尾迹）；专长包第 96 步闪烁格加强 → 波光粼粼 */
export function qlLakeMaterial() { return qlRiverMaterial(0x6aa0b8, 0.85, true) as unknown as THREE.Material; }
function qlRiverMaterial(_color: THREE.ColorRepresentation, _opacity: number, lake = false) {
  const K = new THREE.Vector4(10, 10, 0.06, 0); let kDone = false;
  const uHW = { value: QL_RIVER_HW }, uHasMir = { value: 0 };
  QLRIVER_STAT.mats++;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, fog: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,   // r8：预乘 One / OneMinusSrcAlpha
    uniforms: { ...THREE.UniformsLib.fog, ...cineUniforms(), ...QLU, uK: { value: K }, uQlHW: uHW, uQlHasMir: uHasMir, ...riverReflU, ...wakeU },
    vertexShader: '', fragmentShader: '',
  });
  let planeY = 0;
  m.onBeforeRender = (r, s, c, g, o) => {
    if (!kDone) { if (!lake) ssWaterGeoK(g as THREE.BufferGeometry, o, K); const gg = g as THREE.BufferGeometry; if (!gg.boundingBox) gg.computeBoundingBox();
      planeY = gg.boundingBox!.getCenter(_wv).applyMatrix4(o.matrixWorld).y; kDone = true;
      uHW.value = lake ? 8 : K.w > 0.5 ? QL_RIVER_HW : Math.max(0.5, Math.min(K.x, K.y) * 0.5);   // 池塘：短边一半；湖 = r8 HW 8 米
      (o as THREE.Mesh).renderOrder = Math.max((o as THREE.Mesh).renderOrder, 1);   // r8 waterMesh.renderOrder = 1
    }
    qlLightTick(s);
    uHasMir.value = 0;
    if ((K.w > 0.5 || lake) && qlMirOn()) {
      const q = ssTierNow();
      riverReflUpdate(r, s as THREE.Scene, c, planeY, 1, QL.mirror ? { scale: q === 'medium' ? 0.33 : 0.42, every: 1, sky: true } : undefined);   // r8：×0.42（高）/ ×0.33（中），每帧，含天空球
      uHasMir.value = riverReflU.uReflP.value.y; QLRIVER_STAT.mirror = uHasMir.value;
    }
    if (!lake) wakeMark(o, g as THREE.BufferGeometry, planeY, 1);
    if (!_qlLogged) { _qlLogged = true; try { console.info(`[qlriver] mats=${QLRIVER_STAT.mats} tier=${ssTierNow()} mirror=${qlMirOn() ? (QL.mirror ? 'r8' : 'c22') : 'off'} taps=${qlTaps(ssTierNow())} spec=${QL.spec ? 1 : 0} wake=${wakeOn() ? (QL.wake ? 'r8' : 'c22') : 'off'} river=${K.w > 0.5 ? 1 : 0} HW=${uHW.value.toFixed(2)} flow=${K.z} demo=${QLRIVER_STAT.demo} shadow=${QLRIVER_STAT.shadow}`); } catch { /* */ } }
  };
  riverReflMarkWater(m);
  const build = () => {
    const q = ssTierNow(), mir = qlMirOn(), wk = wakeOn() && !lake, wkV = wk && QL.wake, taps = qlTaps(q);
    const vs = /* glsl */ `varying vec3 vW; varying vec2 vUv;${lake ? ' attribute float aShore; varying float vShore;' : ''}
      #include <common>
      #include <fog_pars_vertex>
      ${wkV ? WAKE_VGLSL : ''}
      void main(){ vUv = uv; ${lake ? 'vShore = aShore;' : ''} vec4 w = modelMatrix * vec4(position, 1.0);
        ${wkV ? 'w.y += wkHgt(w.xz);   // r8：顶点按尾迹 h 起伏' : ''}
        vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`;
    const fs = /* glsl */ `#define TAPS ${taps}
      ${mir ? '#define QL_MIR\n' : ''}${QL.mirror ? '#define QL_MIR_R8\n' : ''}${wk ? '#define QL_WAKE\n' : ''}${wkV ? '#define QL_CHURN\n' : ''}${QL.spec ? '#define QL_SPEC\n' : ''}${lake ? '#define QL_LAKE\nvarying float vShore;\n' : ''}
      uniform vec4 uK; uniform float uQlT, uQlHW, uQlHasMir, uQlHasSh; uniform vec3 uQlSun, uQlSunC; uniform vec4 uQlFogC; uniform sampler2D tQlShadow; uniform mat4 uQlShM;
      varying vec3 vW; varying vec2 vUv;
      #include <common>
      #include <packing>
      #include <fog_pars_fragment>
      ${mir ? RIVER_REFL_GLSL : ''}
      ${wk ? WAKE_GLSL : ''}
      // ---- r8 COMMON ----
      float qlH12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float qlVn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(qlH12(i), qlH12(i + vec2(1, 0)), f.x), mix(qlH12(i + vec2(0, 1)), qlH12(i + 1.), f.x), f.y); }
      vec3 qlAirCol(vec3 dir){ float sm = dot(dir, uQlSun); float mu = max(sm, 0.); float bk = max(-sm, 0.);
        return uQlFogC.rgb * mix(vec3(1.), vec3(.80, .90, 1.10), bk * .75) + uQlSunC * (pow(mu, 9.) * uQlFogC.w + mu * mu * uQlFogC.w * .22); }
      // ---- r8 waterMat ----
      float qlIgn2(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
      vec2 qlWav(vec2 p, vec2 d, float k, float w){ return d * cos(dot(p, d) * k - uQlT * w) * k; }
      float qlShadowAt(vec3 p){ if (uQlHasSh < .5) return 1.; vec4 sc = uQlShM * vec4(p, 1.); if (sc.x < 0. || sc.x > 1. || sc.y < 0. || sc.y > 1. || sc.z > 1.) return 1.; float s = 0.;
        for (int i = 0; i < 4; i++){ vec2 o = (vec2(float(i - (i / 2) * 2), float(i / 2)) - .5) * .0014; s += step(sc.z - .002, unpackRGBAToDepth(texture2D(tQlShadow, sc.xy + o))); } return s * .25; }
      vec3 qlSkyRefl(vec3 r){ vec3 d = normalize(vec3(r.x, max(r.y, 0.), r.z)); float sm = dot(d, uQlSun); float mu = max(sm, 0.); float h = d.y;
        vec3 hor = qlAirCol(d) * 1.15; vec3 zen = mix(vec3(.36, .43, .54), vec3(.22, .34, .56), smoothstep(-.3, .9, -sm)); vec3 c = mix(hor, zen, pow(smoothstep(0., .7, h), .75) * .62);
        c += uQlSunC * (pow(mu, 5.) * .22 + pow(mu, 24.) * .85);
        float az = atan(r.x, r.z); float bank = .12 + .07 * qlVn2(vec2(az * 7., 1.)) + .04 * qlVn2(vec2(az * 23., 3.));
        vec3 bc = mix(vec3(.05, .045, .03), vec3(.17, .10, .05), qlVn2(vec2(az * 40., 0.))) * (1. + 2.5 * pow(mu, 3.));
        return mix(bc, c, smoothstep(-.012, .012, asin(clamp(r.y, -1., 1.)) - bank)); }
      void main(){
        vec3 V = cameraPosition - vW; float dist = length(V); V /= dist; float t = uQlT; vec2 pw = vW.xz;
        // 流向坐标（米，x 顺流）+ 屏幕导数求 q → 世界 xz 的雅可比；p 随水流平移（Rhett 拍板保留 0.45 m/s）
      #ifdef QL_LAKE
        // 湖：世界坐标即波坐标（雅可比 = 单位阵），无水流、只有极慢风漂；离岸距离 = 顶点属性（r8 bedDepth 的 HW 8 米原式，离岸 > 8 米按满深）
        mat2 J = mat2(1.);
        vec2 p = pw - vec2(.03, .012) * t;
        float eS = vShore, s = clamp(1. - eS / uQlHW, 0., 2.);
      #else
        vec2 q = vec2(vUv.x * uK.x, vUv.y * uK.y);
        vec2 qx = dFdx(q), qy = dFdy(q), wx = dFdx(vW.xz), wy = dFdy(vW.xz);
        float det = wx.x * wy.y - wx.y * wy.x; det = abs(det) < 1e-9 ? 1e-9 : det;
        mat2 J = mat2(qx, qy) * (mat2(wy.y, -wx.y, -wy.x, wx.x) / det);
        vec2 p = q - vec2(uK.z * t, 0.);
        // bedDepth：s = 离中线 / HW（池塘：1 − 离最近边 / HW）
        float across = abs(vUv.y - .5) * uK.y, eS = uQlHW - across, s = across / uQlHW;
        if (uK.w < .5) { eS = min(uK.y * .5 - across, uK.x * .5 - abs(vUv.x - .5) * uK.x); s = 1. - eS / uQlHW; }
      #endif
        float depth = s < 1. ? 1.7 * pow(max(1. - s * s, 0.), .7) : 0.;
        vec2 gq = (qlWav(p, vec2(.8, .6), 1.9, 1.6) + .6 * qlWav(p, vec2(-.5, .86), 3.1, 2.2) + .35 * qlWav(p, vec2(.95, -.3), 5.7, 3.) + .2 * qlWav(p, vec2(-.2, -.98), 9.3, 4.1)) * .010;
        gq += (vec2(qlVn2(p * 4. + t * vec2(.3, .2)), qlVn2(p * 4. + 7. - t * vec2(.2, .3))) - .5) * .022;
        vec2 g = vec2(dot(gq, J[0]), dot(gq, J[1]));
      #ifdef QL_LAKE
        g *= 1.3;   // 开阔湖面风纹略强 → 太阳光路碎成更多亮点（只影响湖）
      #endif
        g *= mix(.45, 1., 1. / (1. + dist * .04));
        float foam = 0., churn = 0., fv = 0.;
      #ifdef QL_WAKE
        { vec4 wk = wkG(pw); g += wk.xy; foam = wk.z; churn = wk.w;
      #ifdef QL_CHURN
          g += (vec2(qlVn2(pw * 7. + t * vec2(1.3, .4)), qlVn2(pw * 7. + 3.1 - t * vec2(.5, 1.1))) - .5) * .30 * min(churn, 1.);
      #else
          churn = 0.;
      #endif
        }
      #endif
        vec3 N = normalize(vec3(-g.x, 1., -g.y)); vec3 Nf = normalize(vec3(N.x * .3, N.y, N.z * .3));
        float F = .02 + .98 * pow(1. - max(dot(Nf, V), 0.), 5.);
        vec3 Rv = reflect(-V, N); vec3 refl = qlSkyRefl(Rv);
      #ifdef QL_MIR
        if (uQlHasMir > .5) {
          vec4 pc = uReflM * vec4(vW.x, uReflP.x, vW.z, 1.); vec2 mm = pc.xy / max(pc.w, 1e-4); vec2 off = g * vec2(1., 1.6) * .30 / (1. + .05 * dist);
      #ifdef QL_MIR_R8
          float sl = min(length(g), 1.); float Ls = (.004 + .045 * sl) * (1. + dist * .012); float j = qlIgn2(gl_FragCoord.xy) - .5; vec4 acc = vec4(0.); float ws = 0.;
          for (int i = 0; i < TAPS; i++){ float tt = (float(i) + .5 + j) / float(TAPS); vec2 qq = mm + off + vec2((qlVn2(vec2(pw.x * 2.5, tt * 7. + t)) - .5) * .03 * sl, (tt - .3) * Ls);
            vec4 cc = texture2D(uRefl, qq); float w = (1. - abs(tt - .3)) * (1. + min(dot(cc.rgb, vec3(.3, .5, .2)), 8.) * .5); acc += cc * w; ws += w; }
          acc /= ws;
          if (!(mm.x < 0. || mm.x > 1. || mm.y < 0. || mm.y > 1.)) refl = mix(refl, acc.rgb, clamp(acc.a, 0., 1.));   // RT 含天空球（alpha 1）；空处回 skyRefl
      #else
          vec4 rf = rrSample(vW, off); refl = mix(refl, rf.rgb, rf.a);   // ?off=qlmirror：C22 单次采样、天空不进 RT
      #endif
        }
      #endif
        float shd = qlShadowAt(vW);
        vec3 Hh = normalize(V + uQlSun); float nh = max(dot(N, Hh), 0.); float Fh = .02 + .98 * pow(1. - max(dot(V, Hh), 0.), 5.);
      #ifdef QL_SPEC
        float a = .010 + .05 * min(length(g), 1.);
      #else
        float a = .012;
      #endif
        float a2 = a * a; float D = a2 / (3.1416 * pow(nh * nh * (a2 - 1.) + 1., 2.)); vec3 spec = uQlSunC * min(D * Fh * .25, 60.) * shd;
        vec3 sunI = uQlSunC * max(uQlSun.y, 0.) * shd; vec3 amb = vec3(.30, .34, .36);
        float path = depth / max(V.y, .22); vec3 ab = exp(-vec3(.8, .27, .36) * path * 1.2);
        float aW = clamp(1. - dot(ab, vec3(.333)), 0., 1.) * smoothstep(0., .05, depth);
        vec3 scat = vec3(.030, .064, .052) * (sunI * .6 + amb);
        float ck = clamp(churn * .85, 0., .85); scat = mix(scat, vec3(.42, .50, .46) * (sunI * .45 + amb * 1.1), ck); aW = max(aW, ck);
        float aOut = 1. - (1. - aW) * (1. - F);
        float shoreV = smoothstep(1.4, .05, eS) * smoothstep(-.3, .1, eS) * smoothstep(.55, .78, qlVn2(p * 3.3 + t * vec2(.12, .05)) * .6 + qlVn2(p * 9.7) * .4) * .45;
        fv = shoreV;
        float nz = qlVn2(pw * 3.1 + t * vec2(.05, .03)) * .45 + qlVn2(pw * 7.7 - t * .04) * .33 + qlVn2(pw * 19.) * .22; float lace = 1. - abs(qlVn2(pw * 9.3 + 3.) * 2. - 1.); nz = mix(nz, lace, .45);
        fv = max(fv, smoothstep(nz - .07, nz + .04, foam * 1.05) * (.78 + .22 * qlVn2(pw * 23. + t * .3))); float fDen = (.55 + .45 * min(foam, 1.)) * (.8 + .35 * qlVn2(pw * 31.));
      #ifdef QL_SPEC
        float cs = .05 * (1. + dist * .05); vec2 ci = floor(pw / cs); float ph = floor(t * 7. + qlH12(ci) * 7.); vec2 rn = vec2(qlH12(ci + ph * 1.37), qlH12(ci.yx + ph * 2.11)) - .5;
        vec3 Nm = normalize(N + vec3(rn.x, 0., rn.y) * .30); float glK = 1.;
      #ifdef QL_LAKE
        glK = 1.6;   // 湖：闪烁格加强（专长包第 96 步，日光路上的粼粼碎闪）
      #endif
        spec += uQlSunC * smoothstep(.9986, .99985, dot(Nm, Hh)) * 16. * Fh * 4. * shd * (1. - fv) * glK;
      #endif
        vec3 col = scat * aW * (1. - F) + refl * F + spec;
        vec3 foamC = fDen * vec3(.86, .88, .87) * (uQlSunC * max(dot(N, uQlSun), 0.) * shd * .9 + amb * 1.6) + uQlSunC * pow(max(dot(-V, uQlSun), 0.), 6.) * .35 * shd;
        col = mix(col, foamC, fv); aOut = mix(aOut, 1., fv);
        gl_FragColor = vec4(col / max(aOut, 1e-3), aOut);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;   // r8：applyFog(col / aOut) · aOut → 预乘输出
      }`;
    return { vs, fs };
  };
  const b0 = build(); m.vertexShader = b0.vs; m.fragmentShader = b0.fs;
  m.onBeforeCompile = sh => { const b = build(); sh.vertexShader = b.vs; sh.fragmentShader = b.fs; };
  m.customProgramCacheKey = () => 'qlriver|' + ssTierNow() + (qlMirOn() ? '|mir' : '') + (wakeOn() && !lake ? '|wk' : '') + (lake ? '|lake' : '');
  m.userData.outlineParameters = { visible: false };
  return m;
}
export function cineWaterTick(dt: number) { qlRiverTick(dt); for (const t of waterNormTex) { t.offset.x += dt * 0.011; t.offset.y += dt * 0.017; } }
/** 第 6 步开关：场景里的水面在写实 / 卡通材质间切换 */
export function cineSwapWater(root: THREE.Object3D) {
  root.traverse(o => { const m = o as THREE.Mesh; const mt = m.material as THREE.Material | undefined; if (!m.isMesh || !mt || Array.isArray(mt)) return;
    const tm = _toonOf.get(mt), sm = _stdOf.get(mt); if (!CINE.on[6] && tm) m.material = tm; else if (CINE.on[6] && sm) m.material = sm; });
}

// ---------------------------------------------------------------- 画质档：按显卡自动选（第一次启动）
export function autoTier(renderer: THREE.WebGLRenderer): 'high' | 'medium' | 'low' {
  let r = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { /* 读不到就按高 */ }
  if (/SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR|Basic Render/i.test(r)) return 'low';
  if (/Intel|UHD|Iris|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d|Apple M1/i.test(r)) return 'medium';
  if (!renderer.capabilities.isWebGL2) return 'low';
  return 'high';
}
