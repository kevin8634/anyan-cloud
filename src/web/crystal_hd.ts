// ======================================================================
// 11-18 水晶 / 冰晶升级（Rhett「星落的紫水晶太简单的面」，概念图 cr_b：陨石坑中央巨大紫晶）
//   程序化多层刻面晶簇：主晶 + 3–8 支子晶（随机倾斜、六棱上下、不规则截顶 / 偏尖），凸包封闭几何 = 平直刻面、无缝无背面露底
//   一簇所有晶体（含地面碎晶）合成一个网格、一次绘制；材质 MeshStandard + onBeforeCompile：
//     菲涅尔边光 + 世界坐标视差内部层（星落 = 星云 + 星点；霜脊 = 气泡 + 裂纹）+ 尖端发光 + 底部光晕；世界坐标噪声，不用贴图不拉伸
//   星落版另加：漂浮碎晶（顶点着色器里公转 / 自转 / 起伏，零 CPU）、星尘点（上升循环）、环绕光弧、坑底陨石碎块
//   霜脊版：冰蓝、半透明、少发光、背光透射；地面冰锥簇保留 1c55650 去缝做法（凸包封闭、贴紧压进雪堆、冰体不接硬阴影）
//   开关：?off=crhd（星落紫晶回旧）/ ?off=icehd（霜脊冰晶 + 冰锥回最旧版；?off=icehd2 冰锥回 11-17 版 ice_hd）
//   画质：低 = 子晶减到 3 支、内部 1 层、无漂浮 / 星尘 / 光弧；中 = 内部 2 层、星尘减半；高 / 超高 = 全量
// ======================================================================
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curQuality, ENV_T, haloMaterial } from './gfx';
import { cinePatch } from './cine';
import { snowGloss } from './snow_gloss';
import { pbrTex } from './pbr_tex';

function offHas(name: string): boolean {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return `${q},${ls}`.split(',').map(s => s.trim()).includes(name);
  } catch { return false; }
}
/** 星落高原紫晶新版（?off=crhd 或 localStorage darkrock_cine_off 含 crhd → 旧八面体） */
export const crHdOn = () => !offHas('crhd');
/** 霜脊冰晶新版（?off=icehd → 旧版；各档都换，低档减量） */
export const iceCrOn = () => !offHas('icehd');
/** 11-18 Rhett「所有地图的这种都换成对应颜色的升级版」：其他地图 / 副本 / 区域事件 / 采集点的旧八面体晶石也换刻面晶簇（?off=crall 回旧） */
export const crAllOn = () => crHdOn() && !offHas('crall');
let crN = 0;
/** 按颜色挑版本：冰蓝 → 冰晶簇，其余 → 星落同款晶簇（调色跟主色走）。size = 旧 makeCrystal 的 size */
export function makeCrystalAny(color: number, size: number, seed = (crN++ * 0.6180339887) % 1 + 0.001): THREE.Group {
  const hsl = { h: 0, s: 0, l: 0 }; new THREE.Color(color).getHSL(hsl);
  const ice = hsl.h > 0.5 && hsl.h < 0.6 && hsl.l > 0.55;
  return ice && iceCrOn() ? makeIceCrystal(color, size / 0.6, seed) : makeStarCrystal(color, size / 0.6, seed, true);
}
/** 霜脊地面冰锥换新版（低档仍走旧锥；?off=icehd 最旧；?off=icehd2 回 11-17 ice_hd 版） */
export const iceSpikeCrOn = () => curQuality !== 'low' && !offHas('icehd') && !offHas('icehd2');

type Tier = 'low' | 'mid' | 'high';
const tierOf = (): Tier => curQuality === 'low' ? 'low' : curQuality === 'medium' ? 'mid' : 'high';

// ---------------------------------------------------------------- 随机
function rng(seed: number) {
  let sd = (Math.floor(Math.abs(seed) * 2147483646) % 2147483646) + 1;
  return () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
}
export const crSeed = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s) + 0.001; };

// ---------------------------------------------------------------- 几何：单支晶体（凸包）
/** 六棱上下（5–7 棱）+ 肩环 + 不规则截顶或偏尖；y 从 -bury 到 h；带 aTip（沿自身轴 0→1）、aSeed */
function crystalGeo(R: () => number, h: number, r: number, trunc: boolean): THREE.BufferGeometry {
  const sides = 5 + Math.floor(R() * 3), a0 = R() * 6.28;
  const lean = new THREE.Vector2((R() - 0.5) * 0.3 * r, (R() - 0.5) * 0.3 * r);
  const pts: THREE.Vector3[] = [];
  const shoulder = h * (0.58 + R() * 0.2);
  for (let i = 0; i < sides; i++) {
    const a = a0 + (i + (R() - 0.5) * 0.35) / sides * Math.PI * 2;
    const rb = r * (0.82 + R() * 0.3), rs = r * (0.88 + R() * 0.22);
    pts.push(new THREE.Vector3(Math.cos(a) * rb, -0.25 * r, Math.sin(a) * rb));
    const ys = shoulder + (R() - 0.5) * h * 0.12;   // 肩环高低错落 → 尖端刻面大小不一
    pts.push(new THREE.Vector3(Math.cos(a) * rs + lean.x * 0.6, ys, Math.sin(a) * rs + lean.y * 0.6));
    if (R() < 0.45) {   // 二级斜切面：部分棱上多一个内收点，刻面更碎更多层次
      const yb = ys + (h - ys) * (0.35 + R() * 0.25), rr = rs * (0.45 + R() * 0.2);
      pts.push(new THREE.Vector3(Math.cos(a + 0.2) * rr + lean.x * 0.8, yb, Math.sin(a + 0.2) * rr + lean.y * 0.8));
    }
  }
  if (trunc) {   // 不规则截顶：斜切小平台
    const k = 3 + Math.floor(R() * 3), td = R() * 6.28, rt = r * (0.22 + R() * 0.2);
    for (let i = 0; i < k; i++) {
      const a = td + (i + (R() - 0.5) * 0.4) / k * Math.PI * 2, x = Math.cos(a) * rt + lean.x, z = Math.sin(a) * rt + lean.y;
      pts.push(new THREE.Vector3(x, h * 0.93 + (Math.cos(a - td) * rt) * 0.5, z));
    }
  } else pts.push(new THREE.Vector3(lean.x * 1.3, h, lean.y * 1.3));
  pts.push(new THREE.Vector3(0, -0.25 * r, 0));
  const g = new ConvexGeometry(pts);   // 天然封闭、凸、平面法线（不出缝、不露背面）
  const p = g.getAttribute('position') as THREE.BufferAttribute, n = p.count;
  const tip = new Float32Array(n);
  for (let i = 0; i < n; i++) tip[i] = Math.max(0, Math.min(1, p.getY(i) / h));
  g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(R()), 1));
  return g;
}
/** 小碎晶 / 碎石：随机点凸包 */
function chipGeo(R: () => number, r: number, tipK: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) pts.push(new THREE.Vector3((R() - 0.5) * 2 * r, (R() - 0.5) * 2 * r * (i < 2 ? 1.8 : 1), (R() - 0.5) * 2 * r));
  pts.push(new THREE.Vector3(0, r * 1.6, 0), new THREE.Vector3(0, -r * 1.2, 0));
  const g = new ConvexGeometry(pts), n = g.getAttribute('position').count;
  g.setAttribute('aTip', new THREE.BufferAttribute(new Float32Array(n).fill(tipK), 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(R()), 1));
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number, sc = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.setScalar(sc)); g.applyMatrix4(_m); return g;
}

// ---------------------------------------------------------------- 材质
const GLSL_COMMON = /* glsl */ `
uniform float crTime;
varying vec3 vCrW; varying vec3 vCrL; varying float vCrT; varying float vCrS;
float crH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float crN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(crH(i), crH(i + vec3(1,0,0)), f.x), mix(crH(i + vec3(0,1,0)), crH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(crH(i + vec3(0,0,1)), crH(i + vec3(1,0,1)), f.x), mix(crH(i + vec3(0,1,1)), crH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float crF(vec3 p) { return crN(p) * 0.55 + crN(p * 2.03 + 5.1) * 0.3 + crN(p * 4.07 + 9.7) * 0.15; }
vec3 crRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
`;
const GLSL_VERT = /* glsl */ `
attribute float aTip; attribute float aSeed;
#ifdef CR_FLOAT
attribute vec3 aCtr; attribute vec4 aOrb;
#endif
`;

export interface CrPal { body: number; neb1: number; neb2: number; tip: number; rim: number }
const MATS = new Map<string, THREE.MeshStandardMaterial>();
function crMat(ice: boolean, pal: CrPal, tier: Tier, float = false): THREE.MeshStandardMaterial {
  const key = [ice ? 'i' : 's', pal.body, pal.neb1, pal.neb2, pal.tip, pal.rim, tier, float ? 'f' : ''].join('_');
  const hit = MATS.get(key); if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color: pal.body, roughness: ice ? 0.1 : 0.14, metalness: 0, flatShading: true, envMapIntensity: ice ? 0.9 : 0.75 });
  if (ice && tier !== 'low') { m.transparent = true; m.opacity = 0.9; }   // 偏透明（单网格整簇，深度照写，不乱序）
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true;   // 自带 aTip / aSeed，合批会删属性 → 不合批
  const layers = tier === 'low' ? 1 : tier === 'mid' ? 2 : 3;
  m.defines = { CR_LAYERS: layers, ...(ice ? { CR_ICE: 1 } : {}), ...(float ? { CR_FLOAT: 1 } : {}) };
  const v3 = (c: number) => { const k = new THREE.Color(c); return `vec3(${k.r.toFixed(3)}, ${k.g.toFixed(3)}, ${k.b.toFixed(3)})`; };
  m.onBeforeCompile = sh => {
    sh.uniforms.crTime = ENV_T;
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_VERT, 'crhd.vcommon');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
      #ifdef CR_FLOAT
      { // 漂浮碎晶：绕自身中心自转 + 绕晶柱慢公转 + 上下起伏（aOrb = 起伏幅度, 公转速度, 相位, 自转速度）
        vec3 off = crRotY(transformed - aCtr, crTime * aOrb.w + aOrb.z);
        float tl = 0.35 * sin(crTime * 0.7 + aOrb.z); off = vec3(off.x, off.y * cos(tl) - off.z * sin(tl), off.y * sin(tl) + off.z * cos(tl));
        vec3 c = crRotY(aCtr, crTime * aOrb.y + aOrb.z * 0.1); c.y += sin(crTime * 0.9 + aOrb.z * 3.0) * aOrb.x;
        transformed = c + off;
      }
      #endif
      vCrL = transformed; vCrT = aTip; vCrS = aSeed; vCrW = (modelMatrix * vec4(transformed, 1.0)).xyz;`, 'crhd.begin_vertex');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\n' + GLSL_COMMON, 'crhd.fcommon');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 Vw = normalize(cameraPosition - vCrW), Vv = normalize(vViewPosition);
        float ndv = clamp(abs(dot(normal, Vv)), 0.0, 1.0), fres = pow(1.0 - ndv, 3.0);
        float tipK = pow(clamp(vCrT, 0.0, 1.0), 5.0), baseK = 1.0 - smoothstep(0.0, 0.22, vCrT);
        vec3 inner = vec3(0.0);
        for (int i = 0; i < CR_LAYERS; i++) {
          float fi = float(i), dep = 0.18 + fi * 0.42;
          vec3 q = (vCrW - Vw * dep) * (0.55 + fi * 0.45) + vCrS * 11.0;   // 世界坐标视差层：越深越"远"，随视角错动
          #ifdef CR_ICE
          float cn = crF(q * vec3(1.6, 0.7, 1.6));
          float crack = smoothstep(0.03, 0.0, abs(cn - 0.5)) * smoothstep(0.3, 0.6, crN(q * 0.5 + 3.0));   // 裂纹：噪声等值面
          vec3 bc = floor(q * 3.2), bf = fract(q * 3.2) - 0.5;
          float bub = step(0.86, crH(bc)) * smoothstep(0.16, 0.05, length(bf - (vec3(crH(bc + 1.7), crH(bc + 3.1), crH(bc + 5.3)) - 0.5) * 0.5));   // 气泡
          inner += (vec3(0.8, 0.93, 1.0) * (crack * 0.55 + bub * 0.7) + ${v3(pal.neb1)} * cn * 0.18) / (1.0 + fi * 0.8);
          #else
          float n = crF(q), n2 = crN(q * 0.6 + 4.0);
          float neb = smoothstep(0.42, 0.82, n);
          inner += mix(${v3(pal.neb1)}, ${v3(pal.neb2)}, smoothstep(0.35, 0.75, n2)) * neb * 0.9 / (1.0 + fi * 0.7);   // 星云
          vec3 sc = floor(q * 4.0), sf = fract(q * 4.0) - 0.5;
          float st = step(0.9, crH(sc)) * smoothstep(0.1, 0.0, length(sf - (vec3(crH(sc + 1.3), crH(sc + 2.7), crH(sc + 5.1)) - 0.5) * 0.6));
          inner += vec3(0.9, 0.85, 1.0) * st * (0.8 + 0.5 * sin(crTime * 2.0 + crH(sc) * 40.0)) / (1.0 + fi * 0.5);   // 星点（闪）
          #endif
        }
        inner *= 0.35 + 0.65 * ndv;   // 正对视线看得更"深"
        #ifdef CR_ICE
        vec3 deep = ${v3(pal.body)} * 0.6, bright = ${v3(pal.neb1)};
        reflectedLight.indirectDiffuse += mix(deep, bright, clamp(vCrT * 0.6 + fres * 0.4, 0.0, 1.0)) * 0.35 + inner * 0.4;   // 次表面感：内部偏青透光
        reflectedLight.indirectSpecular += ${v3(pal.rim)} * fres * 0.7;   // 边缘高光
        totalEmissiveRadiance += ${v3(pal.tip)} * (tipK * 0.18 + fres * 0.08);
        #if NUM_DIR_LIGHTS > 0
        { float back = pow(clamp(dot(-Vv, directionalLights[0].direction), 0.0, 1.0), 3.0);
          reflectedLight.indirectDiffuse += min(vec3(0.45, 0.85, 1.0) * directionalLights[0].color * back * (0.4 + 0.6 * fres) * 0.55, vec3(0.9)); }   // 背光透射
        #endif
        #else
        totalEmissiveRadiance += inner * 0.75 + ${v3(pal.tip)} * tipK * 1.6 + ${v3(pal.neb1)} * baseK * 0.35;   // 内部星云 + 尖端发亮 + 根部光
        reflectedLight.indirectSpecular += ${v3(pal.rim)} * fres * 0.9;   // 菲涅尔边光
        #endif
      }`, 'crhd.lights');
  };
  m.customProgramCacheKey = () => 'crhd' + key;
  MATS.set(key, m);
  return m;
}

/** 由主色推出调色 */
function palStar(color: number, generic = false): CrPal {
  const c = new THREE.Color(color);
  if (generic) {   // 11-18 其他地图：内部第二层 / 边光都跟主色走（橙晶不发蓝紫）
    const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); const n2 = new THREE.Color().setHSL((hsl.h + 0.06) % 1, Math.min(1, hsl.s * 0.9), Math.min(0.75, hsl.l + 0.12));
    return { body: new THREE.Color(0x08060c).lerp(c, 0.2).getHex(), neb1: c.clone().multiplyScalar(0.9).getHex(), neb2: n2.getHex(),
      tip: c.clone().lerp(new THREE.Color(0xffffff), 0.45).getHex(), rim: c.clone().lerp(new THREE.Color(0xffffff), 0.4).getHex() };
  }
  return { body: new THREE.Color(0x0a0620).lerp(c, 0.18).getHex(), neb1: c.clone().multiplyScalar(0.9).getHex(), neb2: 0x3a7cff,
    tip: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex(), rim: new THREE.Color(color).lerp(new THREE.Color(0xc8b8ff), 0.5).getHex() };
}
function palIce(color: number): CrPal {
  return { body: new THREE.Color(color).lerp(new THREE.Color(0x14557e), 0.75).getHex(), neb1: new THREE.Color(color).lerp(new THREE.Color(0x5fa8d0), 0.4).getHex(), neb2: 0xffffff,
    tip: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5).getHex(), rim: 0xd8f0ff };
}

// ---------------------------------------------------------------- 星尘点 / 光弧（星落版）
function dustPoints(R: () => number, n: number, rad: number, hgt: number, color: number): THREE.Points {
  const pos = new Float32Array(n * 3), d = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, r = rad * (0.25 + Math.sqrt(R()) * 0.9);
    pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
    d.set([R(), 0.25 + R() * 0.5, R(), 0.5 + R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aD', new THREE.BufferAttribute(d, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, hgt * 0.5, 0), rad * 1.2 + hgt * 0.5);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { crTime: ENV_T, uCol: { value: new THREE.Color(color) }, uH: { value: hgt }, uSz: { value: 0.09 * rad } },
    vertexShader: /* glsl */ `uniform float crTime; uniform float uH; uniform float uSz; attribute vec4 aD; varying float vA;
      void main(){ float t = fract(aD.x + crTime * aD.y * 0.08); vec3 p = position;
        float a = crTime * 0.12 * (0.5 + aD.z); float c = cos(a), s = sin(a); p.xz = vec2(c * p.x + s * p.z, -s * p.x + c * p.z);
        p.y = t * uH; p.xz *= 1.0 - t * 0.35; vA = sin(t * 3.14159) * (0.6 + 0.4 * sin(crTime * 3.0 + aD.x * 50.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(uSz * aD.w * 300.0 / max(-mv.z, 0.5), 1.0, 18.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float k = (1.0 - r) * (1.0 - r);
        gl_FragColor = vec4(mix(uCol, vec3(1.0), k * 0.5) * k * vA * 0.9, 1.0); }`,
  });
  const p = new THREE.Points(g, m); p.name = 'cr_dust'; return p;
}
function swirlRing(R: () => number, rad: number, y: number, color: number): THREE.Mesh {
  const g = new THREE.RingGeometry(rad * 0.94, rad * 1.06, 96, 1);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { crTime: ENV_T, uCol: { value: new THREE.Color(color) }, uR: { value: rad }, uPh: { value: R() * 6.28 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float crTime; uniform vec3 uCol; uniform float uR; uniform float uPh; varying vec2 vP;
      void main(){ float ang = atan(vP.y, vP.x), rr = length(vP) / uR;
        float band = 1.0 - smoothstep(0.0, 0.06, abs(rr - 1.0));
        float arc = pow(0.5 + 0.5 * sin(ang * 2.0 - crTime * 0.5 + uPh), 4.0);   // 两段光弧沿环流动
        float a = band * arc * 0.55; if (a < 0.004) discard;
        gl_FragColor = vec4(mix(uCol, vec3(1.0), band * arc * 0.4) * a, 1.0); }`,
  });
  const ring = new THREE.Mesh(g, m); ring.rotation.set(-Math.PI / 2 + (R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3); ring.position.y = y; ring.name = 'cr_ring';
  return ring;
}

// ---------------------------------------------------------------- 组装
let ROCK: THREE.MeshStandardMaterial | null = null;
const rockMat = () => ROCK ??= new THREE.MeshStandardMaterial({ color: 0x2c2638, roughness: 0.88, metalness: 0, flatShading: true });
let SNOW: THREE.MeshStandardMaterial | null = null;
const snowMat = () => SNOW ??= snowGloss(pbrTex(new THREE.MeshStandardMaterial({ color: 0xf2f6fc, roughness: 0.9, metalness: 0, flatShading: true }), 'snow', { s: 0.6, bump: 0.6 }));

/** 主晶 + 子晶 + 地面碎晶 → 一个几何。fp = 占地半径（碰撞圆），h = 主晶高 */
function clusterGeo(R: () => number, h: number, fp: number, nSub: number, nChip: number, ice: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r0 = fp * (ice ? 0.36 : 0.34);
  parts.push(place(crystalGeo(R, h, r0, R() < 0.35), 0, -0.1, 0, (R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12));
  for (let i = 0; i < nSub; i++) {
    const a = i / nSub * 6.28 + (R() - 0.5) * 0.9, k = 0.25 + R() * 0.45, hh = h * k, rr = r0 * (0.4 + k * 0.6) * (0.8 + R() * 0.3);
    const d = r0 * 0.55 + fp * (0.1 + R() * 0.35) * (ice ? 0.7 : 1);   // 冰：外围贴近主晶，簇内不留缝
    const tilt = 0.18 + R() * 0.45;   // 向外倾
    parts.push(place(crystalGeo(R, hh, rr, R() < 0.5), Math.cos(a) * d, -0.12 - rr * tilt * 0.5, Math.sin(a) * d, Math.sin(a) * tilt, R() * 6.28, -Math.cos(a) * tilt));
  }
  for (let i = 0; i < nChip; i++) {
    const a = R() * 6.28, d = fp * (0.7 + R() * 0.5), s = fp * (0.035 + R() * 0.05);
    parts.push(place(chipGeo(R, s, 0.35), Math.cos(a) * d, s * 0.3, Math.sin(a) * d, R() * 6, R() * 6, R() * 6));
  }
  const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose());
  return g;
}

/** 星落高原紫晶簇（替代 decor 'crystal'）。s = 原 decor 尺寸（碰撞半径 0.8·s 由调用方照旧） */
export function makeStarCrystal(color: number, s: number, seed: number, generic = false): THREE.Group {
  const R = rng(seed), tier = tierOf(), big = s >= 2.5;
  const g = new THREE.Group(), fp = 0.8 * s, h = 2.3 * s * (big ? 1.05 : 0.9);
  const pal = palStar(color, generic);
  const nSub = tier === 'low' ? 3 : big ? 8 : 4 + Math.floor(R() * 3), nChip = tier === 'low' ? 3 : big ? 12 : 6;
  const body = new THREE.Mesh(clusterGeo(R, h, fp, nSub, nChip, false), crMat(false, pal, tier));
  body.castShadow = true; body.receiveShadow = false; body.name = 'cr_body'; g.add(body);
  // 坑底陨石碎块（普通材质，可合批）
  const nRock = tier === 'low' ? 3 : big ? 9 : 5, rocks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < nRock; i++) {
    const a = i / nRock * 6.28 + R() * 0.6, d = fp * (0.8 + R() * 0.45), rs = fp * (0.07 + R() * 0.09);
    const c = chipGeo(R, rs, 0); c.deleteAttribute('aTip'); c.deleteAttribute('aSeed');
    rocks.push(place(c, Math.cos(a) * d, rs * 0.2, Math.sin(a) * d, R() * 0.6, R() * 6, R() * 0.6, 1));
  }
  const rm = new THREE.Mesh(mergeGeometries(rocks, false)!, rockMat()); rocks.forEach(r => r.dispose()); rm.castShadow = tier !== 'low'; rm.receiveShadow = true; g.add(rm);
  // 底部光晕（同旧版光池尺寸）
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(fp * 4.5, fp * 4.5), haloMaterial(color, big ? 0.75 : 0.55)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; g.add(pool);
  if (tier !== 'low') {
    // 漂浮碎晶：顶点着色器里动，CPU 不碰
    const nf = big ? (tier === 'high' ? 10 : 7) : (tier === 'high' ? 4 : 3), fl: THREE.BufferGeometry[] = [];
    for (let i = 0; i < nf; i++) {
      const a = R() * 6.28, d = fp * (big ? 1.1 + R() * 0.9 : 0.9 + R() * 0.5), y = h * (0.35 + R() * 0.65), sz = fp * (big ? 0.05 + R() * 0.06 : 0.06 + R() * 0.05);
      const c = chipGeo(R, sz, 0.75), cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      place(c, cx, y, cz, 0, R() * 6, 0);
      const n = c.getAttribute('position').count, ctr = new Float32Array(n * 3), orb = new Float32Array(n * 4);
      const o = [0.15 + R() * 0.25, (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.08), R() * 6.28, 0.3 + R() * 0.6];
      for (let k = 0; k < n; k++) { ctr.set([cx, y, cz], k * 3); orb.set(o, k * 4); }
      c.setAttribute('aCtr', new THREE.BufferAttribute(ctr, 3)); c.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4));
      fl.push(c);
    }
    const fg = mergeGeometries(fl, false)!; fl.forEach(f => f.dispose());
    fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.6, 0), fp * 2.4 + h * 0.6);
    const fm = new THREE.Mesh(fg, crMat(false, pal, tier, true)); fm.castShadow = false; fm.receiveShadow = false; fm.name = 'cr_float'; g.add(fm);
    g.add(dustPoints(R, Math.round((big ? 140 : 50) * (tier === 'high' ? 1 : 0.5)), fp * (big ? 1.6 : 1.2), h * 1.1, new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3).getHex()));
    if (big) { g.add(swirlRing(R, fp * 1.9, h * 0.55, color)); if (tier === 'high') g.add(swirlRing(R, fp * 1.45, h * 0.3, generic ? pal.neb2 : 0x7aa8ff)); }
  }
  g.userData.crystal = color;   // 环境特效（main.ts updateEnvFx 闪光点）照旧认
  return g;
}

/** 霜脊冰晶簇（替代 decor 'crystal'：冰晶尖塔、世界首领冰湖环） */
export function makeIceCrystal(color: number, s: number, seed: number): THREE.Group {
  const R = rng(seed), tier = tierOf();
  const g = new THREE.Group(), fp = 0.8 * s, h = 2.1 * s;
  const nSub = tier === 'low' ? 3 : 5 + Math.floor(R() * 4), nChip = tier === 'low' ? 4 : 10;
  const body = new THREE.Mesh(clusterGeo(R, h, fp, nSub, nChip, true), crMat(true, palIce(color), tier));
  body.castShadow = true; body.receiveShadow = false; body.name = 'cr_body'; g.add(body);   // 1c55650：冰体不接硬阴影（棱边黑楔）
  g.add(snowMound(R, fp * 1.05));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(fp * 3.6, fp * 3.6), haloMaterial(color, 0.3)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; g.add(pool);
  g.userData.crystal = color;
  return g;
}

function snowMound(R: () => number, rad: number): THREE.Mesh {
  const mound = new THREE.IcosahedronGeometry(rad, 1), p = mound.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + R() * 0.35; p.setXYZ(i, p.getX(i) * k * 1.25, Math.max(-0.1 * rad, p.getY(i)) * k * 0.32, p.getZ(i) * k * 1.25); }
  mound.computeVertexNormals();
  const sm = new THREE.Mesh(mound, snowMat()); sm.position.y = -0.05; sm.receiveShadow = true; return sm;
}

/** 霜脊地面冰锥簇新版（替代 wild.ts scatter 'icespike'）：同一冰晶材质，主锥 + 2–6 支子锥压进雪堆，碎冰一圈 */
export function makeIceSpikeHd(s: number, color: number, seed: number): THREE.Group {
  const R = rng(seed), tier = tierOf();
  const g = new THREE.Group();
  const geo = clusterGeo(R, 2.4 + R() * 1.3, 0.95, 2 + Math.floor(R() * 5), tier === 'high' ? 6 : 4, true);
  const body = new THREE.Mesh(geo, crMat(true, palIce(color), tier)); body.castShadow = true; body.receiveShadow = false; g.add(body);
  g.add(snowMound(R, 0.75));
  g.scale.setScalar(s);
  return g;
}
/** 11-18 对照用：霜脊冰晶材质（视差气泡 + 裂纹 + 背光透射）给平面冰盘试看 */
export const iceCrMatFor = (color = 0xa8e0ff) => crMat(true, palIce(color), 'high');
