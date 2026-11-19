// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 地面：把本体地形网格的材质换成「退潮黑沙海床」着色器（几何 = 本体按 groundAdd 生成的高度，寻路 / 贴地完全一致）
//   黑色火山沙 + 两向沙纹（颜色 + 法线）· 岸边湿沙带（低粗糙度 + 环境反射，涌浪线随时间进退）· 崖壁 / 陡坡换玄武岩
//   C 区碎石礁盘 · B 区码头泥地，风暴时雨水打湿（整片变亮面）· 潮池（解析椭圆遮罩：青色积水映天光 + 细涟漪 + 焦散）
//   档位：low = 只有底色 / 湿沙 / 潮池色（无法线、无焦散、无环境反射）；medium = + 沙纹法线 + 环境反射 + 单层焦散；high / ultra = 全开
// ======================================================================
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import { A_POOLS, COAST_GLSL, POOL_Y, COAST_HALF } from './coast_layout';
import { COAST_TEX } from './coast_tex_data';
import { seaU, RIP_GLSL } from './coast_sea';   // 11-16 涉水涟漪（潮池 / 湿沙共用海面的涟漪环）

// 11-16f Rhett「海滩沙子不像」：沙面换 gpt-image-2 实拍质感贴图（干沙 / 潮线湿沙，coast_tex_data.ts），两尺度采样防重复；?off=coastsand 回旧版程序化黑沙
const sandOn = () => { try { return !/[?&]off=[^&]*\bcoastsand\b/.test(location.search); } catch { return true; } };
const _ct: Record<string, THREE.Texture> = {};
function coastTex(k: string): THREE.Texture {
  if (_ct[k]) return _ct[k];
  const t = new THREE.TextureLoader().load(COAST_TEX[k]); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_ct[k] = t);
}

export const floorU = { csTime: { value: 0 }, csWet: { value: 0 }, csFlash: { value: 0 }, csSurge: { value: 0 }, csTide: { value: 0 },
  csBeam: { value: new THREE.Vector4(124, -38, 1, 0) }, csBeamOn: { value: 0 }, uRip: seaU.uRip };
let envTex: THREE.Texture | null = null;
/** 海岸天空环境贴图（阴天：灰蓝天顶、地平线一道暖色亮带、下半海面暗青） */
export function coastEnv(): THREE.Texture {
  if (envTex) return envTex;
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#46535a'); gr.addColorStop(0.32, '#7a858a'); gr.addColorStop(0.47, '#b4b8b0'); gr.addColorStop(0.5, '#8a9494'); gr.addColorStop(0.53, '#2a3a3e'); gr.addColorStop(1, '#0a1416');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 地平线暖色破口（概念图 A 远处的夕光）
  const wx = W * 0.62, wy = H * 0.46; const rg = g.createRadialGradient(wx, wy, 0, wx, wy, 120); rg.addColorStop(0, 'rgba(255,214,160,0.75)'); rg.addColorStop(1, 'rgba(255,214,160,0)'); g.fillStyle = rg; g.fillRect(wx - 120, wy - 60, 240, 90);
  let s = 71; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) { const x = r() * W, y = 8 + r() * 100, rr = 20 + r() * 40; const cg = g.createRadialGradient(x, y, 0, x, y, rr); cg.addColorStop(0, 'rgba(40,48,54,0.35)'); cg.addColorStop(1, 'rgba(40,48,54,0)'); g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return (envTex = t);
}

const NOISE_GLSL = `
float csH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float csN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(csH(i), csH(i + vec2(1, 0)), f.x), mix(csH(i + vec2(0, 1)), csH(i + vec2(1, 1)), f.x), f.y); }
vec2 csH2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float csVor(vec2 p, float t){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = csH2(i + g); o = 0.5 + 0.45 * sin(t + 6.2831 * o);
    vec2 r = g + o - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return sqrt(d2) - sqrt(d1); }
float csCaus(vec2 p, float t){ vec2 w = p + 0.6 * vec2(csN(p * 0.4 + t * 0.05), csN(p * 0.4 + 7.0 - t * 0.04));
  float e = csVor(w, t); float aa = min(fwidth(e), 0.06); float x = e / (0.08 + aa); return exp(-x * x * 1.6) * 0.7 + exp(-x * 0.6) * 0.25; }
// 鹅卵 / 碎石：Voronoi 中心距离 → 圆润石块高度
float csPeb(vec2 p, out float id){ vec2 i = floor(p), f = fract(p); float d1 = 8.0; id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = csH2(i + g) * 0.8 + 0.1; vec2 r = g + o - f; float d = dot(r, r); if (d < d1) { d1 = d; id = csH(i + g + 3.1); } }
  return 1.0 - sqrt(d1); }
`;

const NP = A_POOLS.length;
/** 本体地形网格换材质（返回新材质；找不到网格 = null） */
export function coastFloorMaterial(): THREE.MeshStandardMaterial {
  const q = curQuality, low = q === 'low', mid = q === 'medium';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  if (!low) { mat.envMap = coastEnv(); mat.envMapIntensity = 0.55; }
  const SAND = sandOn();
  const pools = A_POOLS.map(p => new THREE.Vector4(p[0], p[1], p[2], p[3]));
  const rots = A_POOLS.map(p => p[4]);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, floorU, SAND ? { csSandT: { value: coastTex('sand') }, csWetT: { value: coastTex('sandwet') } } : {}, { csPools: { value: pools }, csPoolR: { value: rots }, csPoolY: { value: POOL_Y }, csHalf: { value: COAST_HALF } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCsP; varying vec3 vCsN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCsP = position; vCsN = normal;');
    sh.fragmentShader = (SAND ? '#define CS_SAND\nuniform sampler2D csSandT; uniform sampler2D csWetT;\n' : '') + (low ? '#define CS_LOW\n' : '') + (mid ? '#define CS_MID\n' : '') + sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCsP; varying vec3 vCsN;
uniform float csTime; uniform float csWet; uniform float csFlash; uniform float csSurge; uniform float csTide; uniform vec4 csBeam; uniform float csBeamOn; uniform vec4 csPools[${NP}]; uniform float csPoolR[${NP}]; uniform float csPoolY; uniform float csHalf;
${COAST_GLSL}
${RIP_GLSL}
${NOISE_GLSL}
float csPoolK(vec2 p){ float k = 0.0; for (int i = 0; i < ${NP}; i++) { vec4 P = csPools[i]; vec2 d = p - P.xy; if (abs(d.x) > P.z + 2.0 && abs(d.y) > P.z + 2.0) continue;
  float c = cos(csPoolR[i]), s = sin(csPoolR[i]); vec2 u = vec2((d.x * c + d.y * s) / P.z, (-d.x * s + d.y * c) / P.w);
  float e = length(u) + (csN(p * 0.9 + P.x) - 0.5) * 0.35; k = max(k, 1.0 - csS(0.75, 1.05, e)); } return k; }
float csRock; float csWetK; float csPool; float csShoreD; vec2 csGrad; float csStone;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 p = vCsP.xz;
  csShoreD = csShore(p);
  float pier = csPier(p);
  // 栈桥 / 井台下面的地形条（2 米网格的锯齿）由木栈桥 / 石井台模型盖住：海里那段挖掉
  if ((pier > -0.7 && csShoreD > -1.2) || (csShoreD > 0.0 && abs(length(p - vec2(112.0, -5.5)) - 6.0) < 2.7)) discard;
  float n1 = csN(p * 0.07 + 3.0), n2 = csN(p * 0.31), n3 = csN(p * 1.7);
  // 黑色火山沙
  vec3 sand = vec3(0.050, 0.051, 0.054) * (0.78 + 0.34 * n1 + 0.16 * n2 + 0.08 * n3);
  sand = mix(sand, vec3(0.072, 0.066, 0.058), smoothstep(0.62, 0.8, n1 * 0.7 + n2 * 0.3) * 0.6);   // 偏棕的沙斑
#ifdef CS_SAND
  // 实拍沙：3.2 米一块 + 11 米一块的大尺度变化（色差 / 走向），压到阴天海岸的亮度（干沙反照率约 0.3）
  vec3 sT = texture2D(csSandT, p / 3.2).rgb, sT2 = texture2D(csSandT, p / 11.0 + vec2(0.37, 0.61)).rgb;
  sand = mix(sT, sT2, 0.35) * vec3(0.62, 0.6, 0.58) * (0.85 + 0.3 * n1);
  sand = mix(sand, sand * vec3(0.82, 0.8, 0.78), smoothstep(0.55, 0.85, n2) * 0.5);   // 大块的沙色深浅
#endif
  // 两向沙纹（低频噪声定走向）
  csGrad = vec2(0.0);
#ifndef CS_LOW
  float ra = (csN(p * 0.04 + 5.0) - 0.5) * 3.0 + (csN(p * 0.15) - 0.5) * 0.6 + 0.6;
  vec2 d1 = vec2(cos(ra), sin(ra)), d2 = vec2(cos(ra + 1.2), sin(ra + 1.2));
  float ph1 = dot(p, d1) * 4.6 + csN(p * 0.5) * 5.0, ph2 = dot(p, d2) * 9.0 + csN(p * 1.2 + 4.0) * 4.0;
  float fade = 1.0 - smoothstep(18.0, 60.0, length(vViewPosition));
  float rw = 0.35 + 0.35 * csN(p * 0.09 + 9.0);
  float rip = (sin(ph1) * (1.0 - rw * 0.5) + sin(ph2) * rw * 0.5) * fade;
#ifdef CS_SAND
  sand *= 0.97 + 0.04 * rip;   // 贴图本身有风纹：程序化沙纹只留一点
#else
  sand *= 0.94 + 0.09 * rip;
#endif
  csGrad = (d1 * cos(ph1) * (1.0 - rw * 0.5) * 0.55 + d2 * cos(ph2) * rw * 0.35) * fade;
#endif
  vec3 col = sand;
  // 崖壁 / 陡坡：玄武岩（层理 + 竖向节理）
  csRock = smoothstep(0.82, 0.62, vCsN.y);
  float strata = csN(vec2(vCsP.y * 1.6, (p.x + p.y) * 0.08)) * 0.6 + csN(p * 0.5 + vCsP.y) * 0.4;
  vec3 rock = vec3(0.075, 0.08, 0.085) * (0.6 + 0.6 * strata);
  col = mix(col, rock, csRock);
  // C 区碎石礁盘（圆润碎石 + 石缝里的沙）
  float pid; float peb = csPeb(p * 1.3, pid);
  csStone = csReef(p) * smoothstep(0.42, 0.62, csN(p * 0.06 + 13.0) * 0.6 + csN(p * 0.2) * 0.4) * (1.0 - csRock);
  vec3 stone = vec3(0.10, 0.105, 0.11) * (0.55 + 0.6 * pid) * smoothstep(0.15, 0.45, peb);
  col = mix(col, mix(sand * 0.6, stone, smoothstep(0.18, 0.3, peb)), csStone);
  // 湿沙：水线附近（d -9..0），涌浪线随时间进退；B 区风暴雨水打湿整片
  float swash = csSurge * (0.5 + 0.5 * sin(csTime * 0.55 + p.y * 0.05));
  float wetBand = smoothstep(-10.0 - swash * 4.0 - csTide * 7.0, -1.5, csShoreD);
  csWetK = max(wetBand, csStorm(p) * csWet * (0.65 + 0.35 * n2));
  // 潮池
  csPool = csPoolK(p) * (1.0 - csRock);
  csWetK = max(csWetK, clamp(csPool * 1.6, 0.0, 1.0) * 0.8);
#ifdef CS_SAND
  { vec3 wT = mix(texture2D(csWetT, p / 3.6).rgb, texture2D(csWetT, p / 13.0 + vec2(0.21, 0.83)).rgb, 0.3) * vec3(0.5, 0.52, 0.54);
    float wk = csWetK * (1.0 - csRock) * (1.0 - csStone);
    col = mix(col, wT, wk); col *= mix(1.0, 0.9, csWetK); }
#else
  col *= mix(1.0, 0.52, csWetK);
  col = mix(col, col * vec3(0.85, 0.97, 1.0), csWetK);
#endif
  // 潮池水：青色、透底
  // 11-07 水体六条：按深浅变色（边缘浅、透沙底 → 中心深青黑）+ 岸边白沫带（池缘一圈、随噪声断续流动）
  vec3 poolC = mix(vec3(0.05, 0.15, 0.13) + sand * 0.3, vec3(0.008, 0.04, 0.046), smoothstep(0.5, 1.0, csPool));
  col = mix(col, poolC, smoothstep(0.35, 0.8, csPool));
  float pFoam = smoothstep(0.26, 0.36, csPool) * (1.0 - smoothstep(0.4, 0.54, csPool)) * smoothstep(0.35, 0.65, csN(p * 4.2 + vec2(csTime * 0.35, -csTime * 0.22)));
  col = mix(col, vec3(0.72, 0.8, 0.78), pFoam * 0.6);
  diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.94, 0.62, csRock * 0.4);
  roughnessFactor = mix(roughnessFactor, 0.16, csWetK);
  roughnessFactor = mix(roughnessFactor, 0.04, smoothstep(0.35, 0.8, csPool));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifndef CS_LOW
  {
    vec2 g = csGrad * (1.0 - csWetK * 0.7) * (1.0 - csStone) * (1.0 - csRock);
    float pk = smoothstep(0.35, 0.8, csPool);
    // 潮池 / 湿面细涟漪
    vec2 rp = vec2(csN(p * 3.1 + vec2(csTime * 0.6, 0.0)) - 0.5, csN(p * 3.1 + vec2(0.0, csTime * 0.5) + 5.0) - 0.5) * 0.18;
    g = mix(g, rp * 0.6, pk);
    g += ripG(p, csTime) * 0.5 * max(pk, csWetK);   // 11-16 涉水涟漪：潮池与湿沙上走过带出一圈圈
    vec3 nw = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 nv = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
    normal = normalize(mix(normal, nv, (1.0 - csRock) * 0.9));
  }
#endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  reflectedLight.indirectSpecular *= mix(0.25, 1.0, csWetK) * (1.0 - 0.65 * smoothstep(0.35, 0.8, csPool));
  reflectedLight.directSpecular *= mix(0.35, 1.0, csWetK);
  reflectedLight.indirectDiffuse *= 1.0 + csFlash * 2.5;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float pk = smoothstep(0.3, 0.85, csPool);
    // 潮池：青色天光 + 菲涅尔边亮（概念图 A：潮池映天光，发出青色亮光）
    totalEmissiveRadiance += vec3(0.02, 0.12, 0.11) * pk * (0.55 + 0.25 * csN(p * 0.6 + csTime * 0.1) + 0.35 * csTide) * (1.0 - csWet * 0.4);
    // 11-07 水体六条：菲涅尔（掠射角映天光）+ 浅处水底焦散（低画质关）
    float pFr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 4.0);
    totalEmissiveRadiance += vec3(0.16, 0.24, 0.27) * pk * pFr * 0.55;
#ifndef CS_LOW
    { float c1 = csN(p * 2.6 + vec2(csTime * 0.35, 0.0)), c2 = csN(p * 3.4 + vec2(0.0, csTime * 0.3) + 3.0);
      float cs = pow(clamp(1.0 - abs(c1 - c2) * 2.2, 0.0, 1.0), 8.0) * pk * (1.0 - smoothstep(0.6, 0.95, csPool));
      totalEmissiveRadiance += vec3(0.14, 0.38, 0.33) * cs * 0.3 * (1.0 - csWet * 0.5); }
#endif
    // C 区礁盘：青色生物荧光斑点（石缝 / 礁石脚下，缓慢呼吸）
    {
      vec2 gp = p * 2.2; vec2 gi = floor(gp); vec2 gf = fract(gp) - 0.5 - (csH2(gi) - 0.5) * 0.6; float hh = csH(gi + 7.7);
      float dk = smoothstep(0.13, 0.0, length(gf)) * step(0.8, hh) * csReef(p) * (0.35 + 0.65 * max(csStone, csRock)) * smoothstep(0.42, 0.62, csN(p * 0.15 + 2.0));
      totalEmissiveRadiance += vec3(0.08, 0.95, 0.85) * dk * (0.65 + 0.35 * sin(csTime * 1.3 + hh * 30.0)) * 1.4;
    }
    // 灯塔光束扫过湿地（B 区）
    if (csBeamOn > 0.01) {
      vec2 bp = p - csBeam.xy; float along = abs(dot(bp, csBeam.zw)); float side = abs(bp.x * csBeam.w - bp.y * csBeam.z);
      float wdt = 2.0 + along * 0.11;
      float bm = step(6.0, along) * exp(-side * side / (wdt * wdt)) * exp(-along / 140.0) * smoothstep(6.0, 30.0, along);
      totalEmissiveRadiance += vec3(0.55, 0.66, 0.78) * bm * csBeamOn * (0.25 + 0.75 * csWetK) * 0.6;
    }
#ifndef CS_LOW
    float cs = csCaus(p * 0.9, csTime * 0.45);
    float shallow = smoothstep(-3.0, -0.5, csShoreD) * (1.0 - smoothstep(1.0, 6.0, csShoreD));
    float k = max(pk * 0.08, shallow * 0.5) * (1.0 - 0.8 * smoothstep(16.0, 55.0, length(vViewPosition)));
#ifdef CS_MID
    k *= 0.6;
#endif
    totalEmissiveRadiance += vec3(0.30, 0.95, 0.80) * cs * k * 0.13;
#endif
  }`);
  };
  mat.customProgramCacheKey = () => 'dlcCoastFloor71' + q + (SAND ? 's' : '');
  mat.userData.outlineParameters = { visible: false };
  return mat;
}

/** 找到本体给这片野外生成的地形网格（PlaneGeometry，边长 (half + 34) × 2）并换材质 */
export function swapTerrain(group: THREE.Object3D, half: number): THREE.Mesh | null {
  let hit: THREE.Mesh | null = null; const W = (half + 34) * 2;
  group.traverse(o => { const m = o as THREE.Mesh; if (!hit && m.isMesh && (m.geometry as THREE.PlaneGeometry).parameters?.width === W) hit = m; });
  if (!hit) return null;
  const m = hit as THREE.Mesh; m.material = coastFloorMaterial(); m.receiveShadow = true; m.name = 'coast_floor';
  return m;
}
