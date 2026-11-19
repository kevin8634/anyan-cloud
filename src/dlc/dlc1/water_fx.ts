// 11-07 水体续：小块水面共用件（潮池等）——圆形软边 alphaMap + 程序化细波纹法线，0 贴图文件
import * as THREE from 'three';
import { WATER2, W2_GLSL, w2Defs, w2Tier, w2ReflUpdate, w2SplashTick } from '../../web/water2';   // 11-17 水体 v2 共享件（?off=water2 回旧版）
import { riverReflU, riverReflMarkWater, RIVER_REFL, RIVER_REFL_GLSL, type RiverReflOpt } from '../../web/river_refl';
import { QL } from '../../web/ql_water_flags';   // 11-19 钟井深渊 r8 开关（wellr8 / qlwellspd / wellmirror / wellalpha / wellfallring）
/** 11-19 r8 skyRefl 原式（src.html 885–890）+ r8 COMMON 噪声；太阳 / 太阳色 / 雾色由调用处给（钟井 = 分区主光 + 场景雾色），内散射 .40 */
const R8SKY_GLSL = /* glsl */ `
float qlH12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float qlVn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(qlH12(i), qlH12(i + vec2(1, 0)), f.x), mix(qlH12(i + vec2(0, 1)), qlH12(i + 1.), f.x), f.y); }
vec3 qlR8Air(vec3 dir, vec3 sd, vec3 sc, vec3 fc){ float sm = dot(dir, sd); float mu = max(sm, 0.); float bk = max(-sm, 0.);
  return fc * mix(vec3(1.), vec3(.80, .90, 1.10), bk * .75) + sc * (pow(mu, 9.) * .40 + mu * mu * .40 * .22); }
vec3 qlR8SkyRefl(vec3 r, vec3 sd, vec3 sc, vec3 fc){ vec3 d = normalize(vec3(r.x, max(r.y, 0.), r.z)); float sm = dot(d, sd); float mu = max(sm, 0.); float h = d.y;
  vec3 hor = qlR8Air(d, sd, sc, fc) * 1.15; vec3 zen = mix(vec3(.36, .43, .54), vec3(.22, .34, .56), smoothstep(-.3, .9, -sm)); vec3 c = mix(hor, zen, pow(smoothstep(0., .7, h), .75) * .62);
  c += sc * (pow(mu, 5.) * .22 + pow(mu, 24.) * .85);
  float az = atan(r.x, r.z); float bank = .12 + .07 * qlVn2(vec2(az * 7., 1.)) + .04 * qlVn2(vec2(az * 23., 3.));
  vec3 bc = mix(vec3(.05, .045, .03), vec3(.17, .10, .05), qlVn2(vec2(az * 40., 0.))) * (1. + 2.5 * pow(mu, 3.));
  return mix(bc, c, smoothstep(-.012, .012, asin(clamp(r.y, -1., 1.)) - bank)); }
`;
import { wakeU, WAKE_GLSL, wakeOn, wakeMark } from '../../web/water_wake';   // 11-18 r8 尾迹场：玩家涉水涟漪（?off=wake）

let _rad: THREE.Texture | null = null, _rip: THREE.DataTexture | null = null;
/** 圆形软边：外 28% 半径内平滑渐隐，边上带一点不规则（不再是硬圆片） */
export function radialFade(): THREE.Texture {
  if (_rad) return _rad;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d')!, img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N * 2 - 1, v = (j + 0.5) / N * 2 - 1, a = Math.atan2(v, u), r = Math.hypot(u, v) / (0.8 + 0.09 * Math.sin(a * 2 + 0.7) + 0.06 * Math.sin(a * 3 + 2.1) + 0.04 * Math.sin(a * 7 + 1.3) + 0.025 * Math.sin(a * 13 + 0.4) + 0.012 * Math.sin(a * 29 + 2.9));   // 11-15 Rhett：液体不要规则边缘 → 多频起伏，像自然水洼
    const e = Math.max(0, Math.min(1, (1 - r) / 0.28)), k = Math.round(e * e * (3 - 2 * e) * 255), o = (j * N + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = k; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return (_rad = new THREE.CanvasTexture(c));
}
/** 细波纹法线（可平铺）；每个用处 clone 后自己设 repeat / offset */
export function rippleNormal(): THREE.DataTexture {
  if (_rip) return _rip;
  const N = 128, d = new Uint8Array(N * N * 4), A = 2 * Math.PI / N;
  const h = (x: number, y: number) => Math.sin(x * A * 3 + Math.sin(y * A * 2) * 1.5) * 0.6 + Math.sin(y * A * 5 + x * A) * 0.4 + Math.sin((x + y) * A * 7) * 0.25;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = new THREE.Vector3(-(h(x + 1, y) - h(x - 1, y)) * 2.2, -(h(x, y + 1) - h(x, y - 1)) * 2.2, 1).normalize(), i = (y * N + x) * 4;
    d[i] = (v.x * 0.5 + 0.5) * 255; d[i + 1] = (v.y * 0.5 + 0.5) * 255; d[i + 2] = (v.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (_rip = t);
}
/** 潮池水面材质：软边 + 流动波纹；mesh 传进来挂 onBeforeRender 推动波纹 */
export function poolWater(mesh: THREE.Mesh, r: number, o: { color: number; emissive?: number; emissiveIntensity?: number; opacity?: number }): THREE.MeshStandardMaterial {
  const nm = rippleNormal().clone(); nm.repeat.set(r / 2.2, r / 2.2); nm.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color: o.color, emissive: o.emissive ?? 0, emissiveIntensity: o.emissiveIntensity ?? 0, transparent: true, opacity: o.opacity ?? 0.8,
    roughness: 0.18, metalness: 0.2, alphaMap: radialFade(), normalMap: nm, normalScale: new THREE.Vector2(0.4, 0.4), depthWrite: false });
  const sp = 0.6 + (r % 1) * 0.5; mesh.onBeforeRender = () => { const t = performance.now() / 1000; nm.offset.set(t * 0.018 * sp, t * 0.026 * sp); };
  waterUp(m, { ql: true, edge: 'alpha', shallow: 0x2a8a84, deep: o.color, sky: 0x9ac0c8, foamW: 0.35, depth: Math.min(0.9, 0.25 + r * 0.08) }); waterBind(mesh);   // 11-07 统一水体六条；11-17 v2：潮池按半径给水深（0.25–0.9 米）
  return m;
}

/** 11-07 水体统一规则（Rhett 11-06 学 Water Pro 后定的六条）：叠加波浪（两层不同方向 / 尺度的流动法线）、按深浅变色（岸边浅青 → 中心墨青）、
 *  菲涅尔（斜看更亮更不透明、反天色）、岸边白沫（岸线内一圈噪声沫带）、浅处焦散（亮纹，低画质关）、水下雾由海底场景另管。
 *  套在任意 MeshStandardMaterial 上（onBeforeCompile 注入，不加贴图文件）。edge = 怎么算「离岸多远」：
 *  'alpha' 用 alphaMap 值；'radial' 圆片 uv 到圆心；'rect' 矩形 uv 四边；'strip' 只算 uv.x 两边（河道）。 */
export type WaterOpt = { edge: 'alpha' | 'radial' | 'rect' | 'strip'; shallow: number; deep: number; sky?: number; foam?: number; foamW?: number; fres?: number; caus?: number; speed?: number;
  /** 11-17 v2：边缘值 1 处的水深（米，默认 1.5）——Beer-Lambert 吸收按它算；murk = 浑浊度（默认 2.6 / depth，即最深处接近 deep 色） */
  depth?: number; murk?: number;
  /** 11-17 v2：中 / 高档接平面倒影（river_refl RT，水面须是水平面；低档 / ?off=riverrefl / ?off=water2 不接） */
  refl?: boolean;
  /** 11-18 Rhett「水体要用秋林逆光里的水体代码」：秋林 v3 河面模型（解析四向波 + 噪声法线、RGB 吸收 + 散射本色、压扁法线菲涅耳、GGX 太阳高光 + 闪烁、竖向拉长多次采样倒影、预乘合成）；?off=qlwater 回 v2 */
  ql?: boolean;
  /** 11-18 Rhett「钟井的水不是技能包里的升级版」：地下 / 暗处水面（钟井）——秋林模式下底材改非金属、关 IBL 金属反射（原来整片发白 + 点光源照出大光斑），
   *  本色按 shallow / deep 走七成（不发秋林绿），细浪闪点仍在。?off=wellcave 回原样 */
  cave?: boolean;
  /** 11-19 Rhett「钟井Raid最下面的水是否复刻源码的水」+ 03:04 拍板「钟井撤回 cave 改法，回 r8 原样」：只给深渊黑水。
   *  开了就：撤回 cave（本色 = r8 scat (.030,.064,.052)·(sunI·.6 + amb)、不压 0.35）、波速回 r8 1.0×（qlwellspd）、skyRefl 用 r8 原式、
   *  接镜面倒影（wellmirror：中档起、每帧、高 6 / 中 4 次竖向采样，RT ×0.42 / ×0.33）、透明预乘（wellalpha）、闪烁格 .05、收阴影。?off=wellr8 整组回 C22 */
  r8?: boolean };
const _waterMats = new Set<{ uT: { value: number } }>();
// 11-15 水面涟漪：钟声 / 首领砸地 / 滴水在所有 waterUp 水面上扩出一圈圈波纹（世界坐标，12 个槽轮换）
const RIP = { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -999, 0)) }; let _ripI = 0;
export function waterRipple(x: number, z: number, amp = 1) { RIP.value[_ripI].set(x, z, performance.now() / 1000, amp); _ripI = (_ripI + 1) % RIP.value.length; }
export const rippleInfo = () => RIP.value.filter(v => performance.now() / 1000 - v.z < 6).length;
let _wT = 0;
/** 每帧推一次（主循环里 / 任一水面 onBeforeRender 调用都行；同一帧多次调用只算一次） */
export function waterTick() { const t = performance.now() / 1000; if (t === _wT) return; _wT = t; for (const u of _waterMats) u.uT.value = t; w2SplashTick(); }
/** 统一水体入口：默认 v2（11-17），?off=water2 → 11-16 旧版 waterUpV1（原样保留） */
export function waterUp<M extends THREE.MeshStandardMaterial>(m: M, o: WaterOpt, low = false): M { return WATER2.off ? waterUpV1(m, o, low) : waterUpV2(m, o, low); }
function waterUpV1<M extends THREE.MeshStandardMaterial>(m: M, o: WaterOpt, low = false): M {
  const U = { uT: { value: 0 }, uSh: { value: new THREE.Color(o.shallow) }, uDp: { value: new THREE.Color(o.deep) }, uSky: { value: new THREE.Color(o.sky ?? 0x8ab0c0) },
    uFoam: { value: new THREE.Color(o.foam ?? 0xdfeff0) }, uFoamW: { value: o.foamW ?? 0.22 }, uFres: { value: o.fres ?? 0.55 }, uCaus: { value: low ? 0 : (o.caus ?? 0.35) }, uSp: { value: o.speed ?? 1 }, uRip: RIP };
  _waterMats.add(U);
  const EDGE = { alpha: 'texture2D( alphaMap, vAlphaMapUv ).g', radial: 'clamp( 1.0 - length( vWUv - 0.5 ) * 2.0, 0.0, 1.0 )', rect: 'clamp( min( min( vWUv.x, 1.0 - vWUv.x ), min( vWUv.y, 1.0 - vWUv.y ) ) * 2.0, 0.0, 1.0 )', strip: 'clamp( 1.0 - abs( vWUv.x * 2.0 - 1.0 ), 0.0, 1.0 )' }[o.edge === 'alpha' && !m.alphaMap ? 'rect' : o.edge];   // 没有 alphaMap 时退回矩形边，免得着色器编译失败
  m.customProgramCacheKey = () => `waterUp_${o.edge}_${low ? 1 : 0}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWUv;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWUv = uv;\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vWUv; varying vec3 vWPos;
uniform float uT, uFoamW, uFres, uCaus, uSp; uniform vec3 uSh, uDp, uSky, uFoam; uniform vec4 uRip[12]; float wRC = 0.0;
float wN( vec2 p ) { return sin( p.x * 1.7 + sin( p.y * 1.3 + uT * 0.7 * uSp ) * 1.6 ) * sin( p.y * 1.9 - uT * 0.55 * uSp + sin( p.x * 0.8 ) ); }
#define wEdge() ( ${EDGE} )`)   // 宏：在使用处展开（alphaMap 的声明在 common 之后）
      .replace('#include <color_fragment>', `#include <color_fragment>
float wE = wEdge();
diffuseColor.rgb = mix( uSh, uDp, smoothstep( 0.05, 0.85, wE ) );`)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 0.47 + vec2( uT * -0.011, uT * 0.017 ) * uSp ).xyz * 2.0 - 1.0;
mapN = normalize( vec3( mapN.xy + mapN2.xy * 0.8, mapN.z * mapN2.z ) );
vec2 wRG = vec2( 0.0 );
for ( int i = 0; i < 12; i ++ ) { vec4 R = uRip[ i ]; float age = uT - R.z; if ( age < 0.0 || age > 7.0 ) continue;
  vec2 d = vWPos.xz - R.xy; float r = length( d ) + 1e-3, rad = age * ( 2.6 + R.w * 2.4 ), x = r - rad;
  float env = exp( - x * x * 0.35 / ( 0.4 + R.w ) ) * exp( - age * 0.55 ) * R.w / ( 1.0 + r * 0.06 ) * smoothstep( 0.0, 0.3, age );
  float k = 3.2 / ( 0.6 + R.w * 0.4 ); wRG += d / r * sin( x * k ) * env; wRC += max( 0.0, cos( x * k ) ) * env; }
mapN = normalize( vec3( mapN.xy + vec2( wRG.x, - wRG.y ) * 0.7, mapN.z ) );`))   // 11-15 修：原先直接替换未展开的 chunk 文本，从 11-07 起一直 patch miss
      .replace('#include <opaque_fragment>', `{
  vec3 wV = normalize( vViewPosition );
  // 11-14d 水与海 C 同步：菲涅耳用压扁法线（几何法线为主，掠射处不再满屏雪花），反射线指向水下时压暗天空色
  vec3 wG = normalize( vNormal ) * faceDirection;
  vec3 wNF = normalize( mix( wG, normal, 0.3 ) );
  float wF = pow( 1.0 - clamp( abs( dot( wNF, wV ) ), 0.0, 1.0 ), 4.0 ) * uFres;
  float wRy = dot( reflect( -wV, normal ), wG );
  outgoingLight = mix( outgoingLight, uSky * 0.55 * mix( 1.0, 0.5, smoothstep( 0.04, -0.12, wRy ) ), wF );
  outgoingLight += uSky * clamp( wRC, 0.0, 1.5 ) * 0.22;
  diffuseColor.a = mix( diffuseColor.a, 1.0, wF * 0.6 );
  float wn = wN( vWPos.xz * 0.9 ) * 0.5 + wN( vWPos.zx * 2.3 + 3.1 ) * 0.35 + 0.5;
  float band = smoothstep( 0.0, 0.08, wE ) * ( 1.0 - smoothstep( uFoamW * 0.45, uFoamW, wE ) );
  float wFo = band * smoothstep( 0.55, 0.9, wn + ( 1.0 - wE / max( uFoamW, 0.01 ) ) * 0.3 );
  outgoingLight = mix( outgoingLight, uFoam * 0.8, wFo * 0.75 );
  diffuseColor.a = max( diffuseColor.a, wFo * 0.8 * smoothstep( 0.0, 0.06, wE ) );
  float cz = abs( wN( vWPos.xz * 0.55 + 7.0 ) + wN( vWPos.zx * 0.7 - 2.0 ) );
  outgoingLight += uSh * pow( 1.0 - clamp( cz, 0.0, 1.0 ), 6.0 ) * uCaus * ( 1.0 - smoothstep( 0.2, 0.7, wE ) );
}
#include <opaque_fragment>`);
    if (!sh.fragmentShader.includes('wRG')) console.warn('patch miss', 'waterUp.normal');
  };
  m.needsUpdate = true;
  return m;
}
/** 挂在水面 mesh 上推动 waterUp 的时间（保留原有 onBeforeRender） */
export function waterBind(mesh: THREE.Object3D) { const prev = mesh.onBeforeRender; mesh.onBeforeRender = function (...a: Parameters<THREE.Object3D['onBeforeRender']>) {
  waterTick();
  const mt = (mesh as THREE.Mesh).material as THREE.Material | undefined;
  { const g = (mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined; if (g && mt && !Array.isArray(mt) && mt.userData.w2Wake) wakeMark(mesh, g, mesh.matrixWorld.elements[13]); }   // 11-18 尾迹：登记水面
  if (mt && !Array.isArray(mt) && mt.userData.w2Refl) w2ReflUpdate(a[0], a[1] as THREE.Scene, a[2], mesh.matrixWorld.elements[13], mt.userData.w2ReflOpt as RiverReflOpt | undefined);   // 11-19 wellmirror：按材质传 RT 比例 / 隔帧（不再改全局）   // 11-17 v2：中 / 高档平面倒影（镜面 = 水面世界高度）
  prev.apply(this, a); }; }

/** 11-17 水体 v2（秋林逆光 v3 水的思路，自写）：在 v1 六条之上
 *  ① 深浅 = RGB Beer-Lambert 吸收（σ 偏红，光程随视角变长；浅处透出湖底、深处实）；② 菲涅耳 F0 0.02 压扁法线，反射线压到地平线下换暗岸色；
 *  ③ 细浪法线随距离收（远处不闪雪花）；④ 岸沫 = 蕾丝噪声网 × Beer-Lambert 不透明度，泡沫进漫反射 → 太阳 Lambert + 天空半球自动受光、阴影里变暗，再叠湿表面菲涅耳反射；
 *  ⑤ 焦散乘进反照率（阴影里自然消失，只在 0.03–0.9 米浅处）；⑥ 中 / 高档平面倒影（river_refl RT，高档 2 次竖向采样拉长）+ 太阳闪烁。
 *  低档：无倒影 RT、无焦散 / 闪烁、泡沫用单层噪声。材质创建时挂补丁（onBeforeCompile），customProgramCacheKey 按档区分。 */
const CAVE_OFF = (() => { try { return /(?:[?&]off=[^&]*\bwellcave\b)/.test(location.search); } catch { return false; } })();
const QL_OFF = (() => { try { return /(?:[?&]off=[^&]*\bqlwater\b)/.test(location.search); } catch { return false; } })();
export const WELLR8_STAT = { mats: 0, mirror: 0, alpha: 0, spd: 0 };
function waterUpV2<M extends THREE.MeshStandardMaterial>(m: M, o: WaterOpt, low = false): M {
  const tier = low ? 'low' : w2Tier(), lo = tier === 'low', ql = !!o.ql && !QL_OFF, r8 = ql && !!o.r8 && QL.wellR8, cave = ql && !!o.cave && !CAVE_OFF && !r8;
  if (cave) { m.metalness = 0; m.roughness = 0.2; m.envMapIntensity = 0.3; }
  if (r8) { m.metalness = 0; m.roughness = 0.2; m.envMapIntensity = 0.3; }   // r8 合成不读 PBR 本体光，只用 directDiffuse 反推阴影可见度 → 非金属底材
  const r8mir = r8 && QL.wellMirror, r8a = r8 && QL.wellAlpha, r8spd = r8 && QL.wellSpd;
  const depth = o.depth ?? 1.5, refl = (!!o.refl || r8mir) && !lo && !RIVER_REFL.off;
  if (r8) { WELLR8_STAT.mats++; WELLR8_STAT.mirror = refl ? 1 : 0; WELLR8_STAT.alpha = r8a ? 1 : 0; WELLR8_STAT.spd = r8spd ? 1 : 0;
    try { console.info(`[qlwell] r8=1 tier=${tier} mirror=${refl ? (tier === 'high' ? 'taps6' : 'taps4') : 'off'} alpha=${r8a ? 'premul' : 'opaque'} spd=${r8spd ? '1.0x' : 'uSp'} cave=0`); } catch { /* */ } }
  if (r8a) { m.transparent = true; m.premultipliedAlpha = true; m.depthWrite = true; }   // r8：transparent + depthWrite + 预乘 One / OneMinusSrcAlpha
  if (r8mir && refl) m.userData.w2ReflOpt = { scale: tier === 'mid' ? 0.33 : 0.42, every: 1 };   // r8 镜面：×0.42 / ×0.33、每帧
  const wk = !lo && wakeOn(); if (wk) m.userData.w2Wake = true;   // 11-18 r8 尾迹场（低档 / ?off=wake 不接）
  const U = { uT: { value: 0 }, uSh: { value: new THREE.Color(o.shallow) }, uDp: { value: new THREE.Color(o.deep) }, uSky: { value: new THREE.Color(o.sky ?? 0x8ab0c0) },
    uFoam: { value: new THREE.Color(o.foam ?? 0xdfeff0) }, uFoamW: { value: o.foamW ?? 0.22 }, uFres: { value: o.fres ?? 0.55 }, uCaus: { value: lo ? 0 : (o.caus ?? 0.35) }, uSp: { value: o.speed ?? 1 }, uRip: RIP,
    uDepth: { value: depth }, uMurk: { value: o.murk ?? 2.6 / Math.max(depth, 0.05) } };
  _waterMats.add(U);
  const EDGE = { alpha: 'texture2D( alphaMap, vAlphaMapUv ).g', radial: 'clamp( 1.0 - length( vWUv - 0.5 ) * 2.0, 0.0, 1.0 )', rect: 'clamp( min( min( vWUv.x, 1.0 - vWUv.x ), min( vWUv.y, 1.0 - vWUv.y ) ) * 2.0, 0.0, 1.0 )', strip: 'clamp( 1.0 - abs( vWUv.x * 2.0 - 1.0 ), 0.0, 1.0 )' }[o.edge === 'alpha' && !m.alphaMap ? 'rect' : o.edge];
  m.customProgramCacheKey = () => `waterUp2_${o.edge}_${tier}_${refl ? 1 : 0}_${ql ? 'ql' : ''}${cave ? 'cv' : ''}${wk ? 'wk' : ''}${r8 ? `r8${r8mir ? 'm' : ''}${r8a ? 'a' : ''}${r8spd ? 's' : ''}` : ''}`;
  if (refl) { m.userData.w2Refl = true; riverReflMarkWater(m); }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, refl ? riverReflU : {}, wk ? wakeU : {});
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWUv;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWUv = uv;\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
${w2Defs(tier)}${wk ? '#define W2_WAKE\n' + WAKE_GLSL : ''}${refl ? '#define W2_REFL\n' : ''}${ql ? '#define W2_QL\n' : ''}${cave ? '#define W2_CAVE\n' : ''}${r8 ? '#define W2_R8\n' : ''}${r8spd ? '#define W2_R8SPD\n' : ''}#define W2_TAPS ${r8mir ? (tier === 'high' ? 6 : 4) : (tier === 'high' ? 4 : 1)}
varying vec2 vWUv; varying vec3 vWPos;
vec2 wQg = vec2(0.0); float wQa = 1.0;
vec2 qlWav(vec2 p, vec2 d, float k, float w, float t){ return d * cos(dot(p, d) * k - t * w) * k; }
uniform float uT, uFoamW, uFres, uCaus, uSp, uDepth, uMurk; uniform vec3 uSh, uDp, uSky, uFoam; uniform vec4 uRip[12];
float wRC = 0.0, wE = 0.0, wFo = 0.0; vec4 wWk = vec4( 0.0 );
float wN( vec2 p ) { return sin( p.x * 1.7 + sin( p.y * 1.3 + uT * 0.7 * uSp ) * 1.6 ) * sin( p.y * 1.9 - uT * 0.55 * uSp + sin( p.x * 0.8 ) ); }
${W2_GLSL}
${refl ? RIVER_REFL_GLSL : ''}
${r8 ? R8SKY_GLSL : ''}
#define wEdge() ( ${EDGE} )`)
      .replace('#include <color_fragment>', `#include <color_fragment>
wE = wEdge();
{ float wDep = wE * uDepth; vec3 wVw = normalize( cameraPosition - vWPos );
  vec3 wTr = w2Absorb( wDep, abs( wVw.y ), uMurk );
  diffuseColor.rgb = w2Body( uSh, uDp, wTr );
  diffuseColor.a *= mix( 0.4, 1.0, w2BodyA( wTr ) );
#ifdef W2_QL
  { vec3 qAb = exp( - vec3( 0.8, 0.27, 0.36 ) * ( wDep / max( wVw.y, 0.22 ) ) * 1.2 );   // 秋林：光程 = 深度 / 视线竖直分量，σ × 1.2
    wQa = clamp( 1.0 - dot( qAb, vec3( 0.333 ) ), 0.0, 1.0 ) * smoothstep( 0.0, 0.05, wDep );
#ifdef W2_CAVE
    diffuseColor.rgb = mix( vec3( 0.030, 0.064, 0.052 ) * 1.6, diffuseColor.rgb * 0.8, 0.7 );   // 地下水：本色七成
#else
    diffuseColor.rgb = mix( vec3( 0.030, 0.064, 0.052 ) * 1.6, diffuseColor.rgb * 0.45, 0.3 );   // 秋林散射本色（保留三成本图色调）
#endif
    diffuseColor.a = 1.0; }
#endif
#ifndef W2_LOW
  diffuseColor.rgb *= 1.0 + 1.3 * uCaus * w2Caus( vWPos.xz * 0.9, uT * uSp ) * smoothstep( 0.03, 0.3, wDep ) * exp( - 1.6 * wDep );
#endif
  float band = smoothstep( 0.0, 0.08, wE ) * ( 1.0 - smoothstep( uFoamW * 0.45, uFoamW, wE ) );
  float fA = band * clamp( 1.25 - wE / max( uFoamW, 0.01 ), 0.0, 1.0 );   // 越贴岸越「新」越厚
#ifdef W2_LOW
  float wn = wN( vWPos.xz * 0.9 ) * 0.5 + wN( vWPos.zx * 2.3 + 3.1 ) * 0.35 + 0.5;
  wFo = band * smoothstep( 0.55, 0.9, wn + ( 1.0 - wE / max( uFoamW, 0.01 ) ) * 0.3 ) * w2FoamOp( fA + 0.3, 0.6 );
#else
  wFo = w2FoamLace( vWPos.xz, uT * uSp, fA ) * w2FoamOp( fA, w2Vn( vWPos.xz * 1.7 + uT * 0.2 ) ) * ( 0.78 + 0.22 * w2Vn( vWPos.xz * 23.0 + uT * 0.3 ) );
#endif
#ifdef W2_WAKE
  wFo = max( wFo, wkFoam( vWPos.xz, uT, wWk.z ) * 0.85 );   // 11-18 r8 尾迹泡沫（网状）
#endif
  diffuseColor.rgb = mix( diffuseColor.rgb, uFoam * 0.8, wFo );   // 泡沫进漫反射：由场景灯光照亮（太阳 Lambert + 天空半球），阴影里自然变暗
}`)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 0.47 + vec2( uT * -0.011, uT * 0.017 ) * uSp ).xyz * 2.0 - 1.0;
mapN = normalize( vec3( ( mapN.xy + mapN2.xy * 0.8 ) * mix( 0.45, 1.0, 1.0 / ( 1.0 + length( vViewPosition ) * 0.04 ) ), mapN.z * mapN2.z ) );
vec2 wRG = vec2( 0.0 );
for ( int i = 0; i < 12; i ++ ) { vec4 R = uRip[ i ]; float age = uT - R.z; if ( age < 0.0 || age > 7.0 ) continue;
  vec2 d = vWPos.xz - R.xy; float r = length( d ) + 1e-3, rad = age * ( 2.6 + R.w * 2.4 ), x = r - rad;
  float env = exp( - x * x * 0.35 / ( 0.4 + R.w ) ) * exp( - age * 0.55 ) * R.w / ( 1.0 + r * 0.06 ) * smoothstep( 0.0, 0.3, age );
  float k = 3.2 / ( 0.6 + R.w * 0.4 ); wRG += d / r * sin( x * k ) * env; wRC += max( 0.0, cos( x * k ) ) * env; }
mapN = normalize( vec3( mapN.xy + vec2( wRG.x, - wRG.y ) * 0.7, mapN.z ) );
#ifdef W2_WAKE
wWk = wkG( vWPos.xz ); mapN = normalize( vec3( mapN.xy + vec2( - wWk.x, wWk.y ) * 0.6, mapN.z ) );
#endif`) + `
#ifdef W2_QL
{ vec2 qp = vWPos.xz;
#ifdef W2_R8SPD
  float qt = uT;   // 11-19 qlwellspd：r8 波速 1.0×（原 uT·uSp，深渊 0.6×）
#else
  float qt = uT * uSp;
#endif
  vec2 qg = ( qlWav( qp, vec2( 0.8, 0.6 ), 1.9, 1.6, qt ) + 0.6 * qlWav( qp, vec2( -0.5, 0.86 ), 3.1, 2.2, qt ) + 0.35 * qlWav( qp, vec2( 0.95, -0.3 ), 5.7, 3.0, qt ) + 0.2 * qlWav( qp, vec2( -0.2, -0.98 ), 9.3, 4.1, qt ) ) * 0.010;
  qg += ( vec2( w2Vn( qp * 4.0 + qt * vec2( 0.3, 0.2 ) ), w2Vn( qp * 4.0 + 7.0 - qt * vec2( 0.2, 0.3 ) ) ) - 0.5 ) * 0.022;
  qg *= mix( 0.45, 1.0, 1.0 / ( 1.0 + length( vViewPosition ) * 0.04 ) );
  qg += wRG * 0.08;   // 钟声 / 涉水涟漪环
#ifdef W2_WAKE
  wWk = wkG( vWPos.xz ); qg += wWk.xy;   // 11-18 r8 尾迹坡度
#endif
  wQg = qg;
  normal = normalize( ( viewMatrix * vec4( normalize( vec3( - qg.x, 1.0, - qg.y ) ), 0.0 ) ).xyz );
}
#endif`)
      .replace('#include <opaque_fragment>', `{
  vec3 wV = normalize( vViewPosition );
  vec3 wG = normalize( vNormal ) * faceDirection;
  vec3 wNF = normalize( mix( wG, normal, 0.3 ) );   // 压扁法线：反射多少跟平均水面走
  float wF = ( 0.02 + 0.98 * pow( 1.0 - clamp( abs( dot( wNF, wV ) ), 0.0, 1.0 ), 5.0 ) ) * clamp( uFres * 1.8, 0.0, 1.0 );
  vec3 wNw = inverseTransformDirection( normal, viewMatrix ), wVw = normalize( cameraPosition - vWPos );
  vec3 wR = reflect( - wVw, normalize( vec3( wNw.x * 0.55, max( wNw.y, 0.2 ), wNw.z * 0.55 ) ) );   // 反射什么跟细浪走
  vec3 wRefl = w2SkyRefl( wR, uSky * 0.6, uDp * 0.6 + uSh * 0.08 );
#ifdef W2_REFL
  { float dk = mix( 1.0, 0.2, smoothstep( 4.0, 60.0, length( vViewPosition ) ) );
    vec2 ofs = ( normal.xy - wG.xy ) * vec2( 0.06, 0.16 ) * dk;
    vec4 rf = rrSample( vWPos, ofs );
#ifdef W2_HIGH
    rf = rf * 0.6 + rrSample( vWPos, ofs + vec2( 0.0, 0.01 * dk ) ) * 0.4;   // 竖向拉长倒影（两次采样，只在高档）
#endif
    wRefl = mix( wRefl, rf.rgb, rf.a ); }
#endif
#ifdef W2_QL
  { // 秋林 v3 合成：col = 本色·aW·(1−F) + 倒影·F + 高光，预乘 → 除 aOut 给普通混合
    vec3 qNw = normalize( vec3( - wQg.x, 1.0, - wQg.y ) ), qNf = normalize( vec3( qNw.x * 0.3, qNw.y, qNw.z * 0.3 ) );
    float qF = 0.02 + 0.98 * pow( 1.0 - max( dot( qNf, wVw ), 0.0 ), 5.0 );
    float qD = length( vViewPosition );
#ifdef W2_R8
    vec3 qSd = vec3( 0.0, 1.0, 0.0 ), qSc = vec3( 0.0 );
#if NUM_DIR_LIGHTS > 0
    qSd = normalize( inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix ) ); qSc = directionalLights[ 0 ].color;
#endif
#ifdef USE_FOG
    vec3 qFc = fogColor;
#else
    vec3 qFc = vec3( 0.50, 0.40, 0.27 );
#endif
    vec3 qR = qlR8SkyRefl( reflect( - wVw, qNw ), qSd, qSc, qFc );   // 11-19 r8 skyRefl 原式（太阳 = 钟井分区主光，雾色 = 场景雾色）
#else
    vec3 qR = w2SkyRefl( reflect( - wVw, qNw ), uSky * 0.6, uDp * 0.6 + uSh * 0.08 );
#endif
#ifdef W2_REFL
    { vec2 off = wQg * vec2( 1.0, 1.6 ) * 0.30 / ( 1.0 + 0.05 * qD ); float sl = min( length( wQg ), 1.0 );
#if W2_TAPS > 1
      float Ls = ( 0.004 + 0.045 * sl ) * ( 1.0 + qD * 0.012 ); float jj = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5;
      vec4 acc = vec4( 0.0 ); float ws = 0.0;
      for ( int i = 0; i < W2_TAPS; i ++ ) { float t = ( float( i ) + 0.5 + jj ) / float( W2_TAPS ); vec4 c = rrSample( vWPos, off + vec2( ( w2Vn( vec2( vWPos.x * 2.5, t * 7.0 + uT ) ) - 0.5 ) * 0.03 * sl, ( t - 0.3 ) * Ls ) );
        float w = ( 1.0 - abs( t - 0.3 ) ) * ( 1.0 + min( dot( c.rgb, vec3( 0.3, 0.5, 0.2 ) ), 8.0 ) * 0.5 ); acc += c * w; ws += w; }
      vec4 rf = acc / ws;
#else
      vec4 rf = rrSample( vWPos, off );
#endif
      qR = mix( qR, rf.rgb, rf.a ); }
#endif
    vec3 qSpec = vec3( 0.0 );
    vec3 qR8sunI = vec3( 0.0 ), qR8Lc = vec3( 0.0 ); float qR8sh = 1.0, qR8Ndl = 0.0, qR8back = 0.0;
#if NUM_DIR_LIGHTS > 0
    { vec3 qL = directionalLights[ 0 ].direction, qLc = directionalLights[ 0 ].color;
      vec3 qLw = normalize( inverseTransformDirection( qL, viewMatrix ) );
      float qVis = clamp( dot( reflectedLight.directDiffuse, vec3( 1.0 ) ) / max( dot( material.diffuseColor * qLc, vec3( 1.0 ) ) * RECIPROCAL_PI * max( dot( normal, qL ), 0.05 ), 1e-4 ), 0.0, 1.0 );
      vec3 qH = normalize( wVw + qLw ); float nh = max( dot( qNw, qH ), 0.0 ), Fh = 0.02 + 0.98 * pow( 1.0 - max( dot( wVw, qH ), 0.0 ), 5.0 );
      float a = 0.010 + 0.05 * min( length( wQg ), 1.0 ), a2 = a * a, D = a2 / ( 3.1416 * pow( nh * nh * ( a2 - 1.0 ) + 1.0, 2.0 ) );
      qSpec = qLc * min( D * Fh * 0.25, 60.0 ) * qVis * smoothstep( -0.02, 0.06, qLw.y );
#ifdef W2_R8
      { float cs = .05 * ( 1. + qD * .05 ); vec2 ci = floor( vWPos.xz / cs ); float ph = floor( uT * 7. + qlH12( ci ) * 7. ); vec2 rn = vec2( qlH12( ci + ph * 1.37 ), qlH12( ci.yx + ph * 2.11 ) ) - .5;   // r8 闪烁格 .05
        qSpec += qLc * smoothstep( .9986, .99985, dot( normalize( qNw + vec3( rn.x, 0., rn.y ) * .30 ), qH ) ) * 16. * Fh * 4. * qVis * ( 1. - wFo ); }
      qR8sunI = qLc * max( qLw.y, 0.0 ) * qVis; qR8sh = qVis; qR8Ndl = max( dot( qNw, qLw ), 0.0 ); qR8back = pow( max( dot( - wVw, qLw ), 0.0 ), 6.0 ); qR8Lc = qLc;
#else
#ifndef W2_LOW
      qSpec += qLc * w2Glint( vWPos.xz, qD, uT, qNw, qH ) * 16.0 * Fh * 4.0 * qVis * ( 1.0 - wFo );
#endif
#endif
    }
#endif
#ifdef W2_CAVE
    outgoingLight *= 0.35;   // 地下水：本体受光压暗，留反射 / 高光读水面
#endif
    float qOut = 1.0 - ( 1.0 - wQa ) * ( 1.0 - qF );
#ifdef W2_R8
    // 11-19 r8 原样：本色 scat = (.030,.064,.052)·(sunI·.6 + amb)，不走 PBR、不压 0.35；泡沫 foamC = (.86,.88,.87)·(太阳 Lambert·阴影·.9 + amb·1.6) + 逆光 pow6·.35
    vec3 qAmb = vec3( 0.30, 0.34, 0.36 ), qScat = vec3( 0.030, 0.064, 0.052 ) * ( qR8sunI * 0.6 + qAmb );
    vec3 qCol = qScat * wQa * ( 1.0 - qF ) + qR * qF + qSpec;
    vec3 qFoamC = vec3( 0.86, 0.88, 0.87 ) * ( qR8Lc * qR8Ndl * qR8sh * 0.9 + qAmb * 1.6 ) + qR8Lc * qR8back * 0.35 * qR8sh;
    qCol = mix( qCol, qFoamC, wFo ); qOut = mix( qOut, 1.0, wFo );
#else
    vec3 qCol = outgoingLight * wQa * ( 1.0 - qF ) + qR * qF + qSpec;
    qCol = mix( qCol, outgoingLight + qR * qF * 0.5, wFo ); qOut = mix( qOut, 1.0, wFo );   // 泡沫：受光漫反射 + 湿表面反射
#endif
    outgoingLight = qCol / max( qOut, 1e-3 ) + uSky * clamp( wRC, 0.0, 1.5 ) * 0.22;
    diffuseColor.a = max( qOut * smoothstep( 0.0, 0.05, wE ), wFo * 0.85 * smoothstep( 0.0, 0.06, wE ) );   // 岸线外（遮罩 0）不画，菲涅耳不能把整块矩形描出来
  }
#else
  float wK = wF * ( 1.0 - wFo * 0.5 );   // 泡沫上仍有一半湿表面反射
  outgoingLight = outgoingLight * ( 1.0 - wK ) + wRefl * wK;
  outgoingLight += uSky * clamp( wRC, 0.0, 1.5 ) * 0.22;
#if !defined( W2_LOW ) && NUM_DIR_LIGHTS > 0
  { vec3 wL = directionalLights[ 0 ].direction; vec3 wLc = directionalLights[ 0 ].color;
    float wvis = clamp( dot( reflectedLight.directDiffuse, vec3( 1.0 ) ) / max( dot( material.diffuseColor * wLc, vec3( 1.0 ) ) * RECIPROCAL_PI * max( dot( normal, wL ), 0.05 ), 1e-4 ), 0.0, 1.0 );   // 太阳可见度（阴影）
    float wFh = 0.02 + 0.98 * pow( 1.0 - max( dot( wV, normalize( wV + wL ) ), 0.0 ), 5.0 );
    outgoingLight += wLc * w2Glint( vWPos.xz, length( vViewPosition ), uT, normal, normalize( wV + wL ) ) * wFh * 6.0 * wvis * ( 1.0 - wFo ); }
#endif
  diffuseColor.a = 1.0 - ( 1.0 - diffuseColor.a ) * ( 1.0 - wF * 0.6 );
  diffuseColor.a = max( diffuseColor.a, wFo * 0.85 * smoothstep( 0.0, 0.06, wE ) );
#endif
}
#include <opaque_fragment>`);
    if (!sh.fragmentShader.includes('wRG') || !sh.fragmentShader.includes('w2Body( uSh') || !sh.fragmentShader.includes('wK = wF')) console.warn('patch miss', 'waterUp2');
  };
  m.needsUpdate = true;
  return m;
}
