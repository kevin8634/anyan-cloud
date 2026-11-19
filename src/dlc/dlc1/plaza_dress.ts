// ======================================================================
// DLC1 镜渊城 · 倒钟广场补完（v1.2.48 待办 4，零积分：只用仓库已有模型 / 程序化几何）
//   1. 地面：程序化石板（全城）+ 鹅卵石（主路 / 营地 / 支路），底色 + 法线 + 粗糙度，大尺度磨损与青苔色斑，接缝柔和过渡
//   2. 营地火焰：原篝火换成 shader 火舌 + 余烬 / 烟粒子；北门两只铁火盆（高画质才点光），南门两只（只自发光）
//   3. 街灯：铸铁灯柱 + 青色灯笼（自发光，无光源）
//   4. 建筑（比赛版，有 Lux3D 场景件时）：无声钟楼主体当城中钟楼、倒挂钟楼翻正当周边塔楼、门架裂钟当长街城门、巨钟当「倒钟」纪念碑
//   5. NPC（比赛版）：卡戎 / 伊奥拉 / 米拉 / 回响居民换写实底座（UBC 男女 + 服装 + 程序化法袍 / 板甲），回响带一点青色自发光
//   商用 base 包：没有场景件 → 第 4 项全部跳过；NPC 钩子返回 null → 经典 KayKit；1–3 项是程序化的，两套构建都有（低画质无法线、无点光）
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { makeGlbScene } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { makeCharacter, hdAvailable, ensureHd, NPC_MODEL_HOOKS, SELECT_SHOW_GEAR } from '../../web/chars';
import { HUNTER_ID } from './hunter_skills';
import { COFFIN_ID } from './coffin_skills';
// fix1106（Rhett 17:09 第 8 条 / 18:57）：选角每职业展示对应暗金一套（双手 1 件或单手 + 副手 2 件；猎手 = 弓，法师 = 回响星盘）
Object.assign(SELECT_SHOW_GEAR, { warrior: ['d40_w_tide'], mage: ['d40_m_astro'], [HUNTER_ID]: ['d40_h_bow'], [COFFIN_ID]: ['d40_c_sleepless'], chrono: ['d40_t_wheel', 'd40_t_glass'], alchemy: ['d40_a_flask', 'd40_a_box'] });
import { HD_MATS, HD_GAIN, wantHd } from '../../web/rig';
import { bindNpcC } from './npc_c';
import type { NpcKit, Rig } from '../../web/models';   // 只取类型：静态 import models 会让游戏数据早于内容包注册加载
import { makeSlate, makeCobble, type StoneSet } from './plaza_tex';
import { realProp } from './camp_real';   // 第四轮：营地帐篷 / 栅栏 / 货箱写实化（比赛版）
import { campBuild, campUpdate, campProp, campStats, campLampPost, campPiece } from './camp_lux';   // 10-28 营地 A 沉船拾荒营（Lux3D 场景件）
import { WILD_PROP_HOOKS } from '../../core/ContentPacks';
import { SEA_COBBLE_LINES, SEA_COBBLE_DISCS, seaBase, seaFloorY } from './seafloor';
import { slabGeometry, type SlabStats } from './seaslabs';
import { seabedBuild, seabedFloorPatch, seabedDebug, seaEnv, seaMound, seaSetSlate } from './seabed';   // 海底地面 / 水景（概念图 seabed_floor）

const HALF = 86;   // 可走平地范围（mirror.ts half 90 − 4）
const hasScenes = () => 'scene_belltower' in PACK_CREATURE_GLB;
const hiQ = () => curQuality === 'ultra' || curQuality === 'high';

// ---------------------------------------------------------------- 1. 地面
/** 鹅卵石区域（局部坐标）：折线 [点…] + 半宽；圆 [x, z, r] */
const COBBLE_LINES = SEA_COBBLE_LINES, COBBLE_DISCS = SEA_COBBLE_DISCS;   // 第五轮：挪到 seafloor（地形高度 / 石板分布共用）
let stoneCache: { q: string; flag: StoneSet; cob: StoneSet } | null = null;
function maskTexture(): THREE.Texture {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const px = (v: number) => (v / (HALF * 2) + 0.5) * S;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.filter = 'blur(3px)'; g.strokeStyle = '#f00'; g.fillStyle = '#f00'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const L of COBBLE_LINES) { g.lineWidth = L.w * 2 / (HALF * 2) * S; g.beginPath(); L.pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z)))); g.stroke(); }
  for (const [x, z, r] of COBBLE_DISCS) { g.beginPath(); g.arc(px(x), px(z), r / (HALF * 2) * S, 0, Math.PI * 2); g.fill(); }
  // G 通道：磨损 / 青苔色斑（大尺度），B 通道：边缘压暗（平台碎边）
  g.filter = 'blur(10px)'; g.globalCompositeOperation = 'lighter';
  let s = 31; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,${Math.floor(60 + r() * 120)},0,1)`; g.beginPath(); g.ellipse(r() * S, r() * S, 6 + r() * 26, 4 + r() * 18, r() * 3, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;   // flipY 关：canvas 行 = 局部 z（之前翻了，营地鹅卵石圆盘落到了 z = −58）
}
function floorMesh(origin: { x: number; z: number }): THREE.Mesh {
  const q = curQuality, detail = q !== 'low', S = q === 'ultra' ? 1024 : q === 'high' ? 1024 : 512;
  if (!stoneCache || stoneCache.q !== q) stoneCache = { q, flag: makeSlate(S, detail), cob: makeCobble(S / 2, detail) };   // 海底：深色湿板岩方砖（1 米一块）
  const { flag, cob } = stoneCache;
  seaSetSlate(flag.map);   // 碎石块顶面用同一套板岩贴图
  const TILE = 5.0, COB = 2.6;   // 板岩一张贴图 5 米（5×5 块），鹅卵石 2.6 米
  // 第五轮：地面跟着地形起伏（seafloor.seaBase）；高 / 超高档上面再铺实体石板，底下这层在石板区只露砂砾（缝 / 缺失格）
  const slabs = slabsOn(), seg = q === 'low' ? 86 : q === 'medium' ? 172 : 344;
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg); geo.rotateX(-Math.PI / 2);
  { const p = geo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setY(i, seaFloorY(p.getX(i), p.getZ(i), slabs)); geo.computeVertexNormals(); }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: flag.map, normalMap: flag.normal ?? undefined, roughnessMap: flag.rough ?? undefined, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(1.1, 1.1) });
  if (q !== 'low') { mat.envMap = seaEnv(); mat.envMapIntensity = 0.35; }   // 湿地面反射夜空 / 月光
  const mask = maskTexture();
  if (slabs) mat.userData.seaSlabBase = true;
  mat.onBeforeCompile = floorPatch(mat, flag, cob, mask, TILE, COB, false);
  mat.customProgramCacheKey = () => 'dlcPlazaFloor5' + (flag.normal ? 'n' : '') + q + (slabs ? 'b' : '');
  mat.userData.outlineParameters = { visible: false };
  const m = new THREE.Mesh(geo, mat); m.position.y = 0.022; m.receiveShadow = true; m.name = 'plaza_floor'; m.renderOrder = -1;
  if (slabs) {
    const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: flag.map, normalMap: flag.normal ?? undefined, roughnessMap: flag.rough ?? undefined, roughness: 1, metalness: 0, vertexColors: true, normalScale: new THREE.Vector2(1.1, 1.1) });
    sm.envMap = seaEnv(); sm.envMapIntensity = 0.35;
    sm.onBeforeCompile = floorPatch(sm, flag, cob, mask, TILE, COB, true);
    sm.customProgramCacheKey = () => 'dlcPlazaSlab5' + (flag.normal ? 'n' : '') + q; sm.userData.outlineParameters = { visible: false };
    const st: SlabStats = { slabs: 0, cracked: 0, raised: 0, sunk: 0, missing: 0, verts: 0 };
    const sl = new THREE.Mesh(slabGeometry(st), sm); sl.position.y = 0.022 - m.position.y; sl.receiveShadow = true; sl.castShadow = false; sl.name = 'sea_slabtops'; sl.frustumCulled = false;   // 投影会让石块 / 碎石自阴影发黑（阴影图精度不够）
    m.add(sl); stats.slabs = st;
  }
  void origin; return m;
}
const slabsOn = () => curQuality === 'ultra' || curQuality === 'high';
function floorPatch(mat: THREE.MeshStandardMaterial, flag: StoneSet, cob: StoneSet, mask: THREE.Texture, TILE: number, COB: number, slab: boolean) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, { cobMap: { value: cob.map }, cobNor: { value: cob.normal ?? flag.map }, cobRou: { value: cob.rough ?? flag.map }, pvMaskT: { value: mask }, pvK: { value: new THREE.Vector3(1 / TILE, 1 / COB, 1 / (HALF * 2)) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPxz; varying vec2 vSlabUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPxz = transformed.xz; vSlabUv = uv;');
    if (slab) sh.fragmentShader = '#define SEA_SLAB\n' + sh.fragmentShader;
    const hasN = !!flag.normal;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vPxz; varying vec2 vSlabUv; uniform sampler2D cobMap; uniform sampler2D cobNor; uniform sampler2D cobRou; uniform sampler2D pvMaskT; uniform vec3 pvK;
float pvH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pvN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pvH(i), pvH(i + vec2(1, 0)), f.x), mix(pvH(i + vec2(0, 1)), pvH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
  vec4 pvM = texture2D(pvMaskT, vPxz * pvK.z + 0.5);
  float pvB = pvN(vPxz * 0.9) * 0.5 + pvN(vPxz * 2.3) * 0.5;               // 路边缘打碎：石板和鹅卵石交错过渡
  float pvC = smoothstep(0.35, 0.65, pvM.r + (pvB - 0.5) * 0.55);
#ifdef SEA_SLAB
  pvC = 0.0;
#endif
  vec2 uvF0 = vPxz * pvK.x, uvC = vPxz * pvK.y;
  // 打破 5 米贴图重复：每张贴图格随机旋转 0/90/180/270°（砖缝在整米处，旋转后仍对齐），textureGrad 用旋转后的导数（格边不出 mip 接缝）
  vec2 pvCell = floor(uvF0); float pvRk = floor(pvH(pvCell + 17.31) * 4.0); vec2 pvF = fract(uvF0);
  vec2 pvDx = dFdx(uvF0), pvDy = dFdy(uvF0); mat2 pvR = mat2(1.0, 0.0, 0.0, 1.0);
  if (pvRk > 2.5) pvR = mat2(0.0, -1.0, 1.0, 0.0); else if (pvRk > 1.5) pvR = mat2(-1.0, 0.0, 0.0, -1.0); else if (pvRk > 0.5) pvR = mat2(0.0, 1.0, -1.0, 0.0);
  if (pvH(pvCell + 5.71) > 0.5) pvR = pvR * mat2(-1.0, 0.0, 0.0, 1.0);   // 第四轮：再加镜像 → 8 种朝向
  vec2 uvF = pvCell + pvR * (pvF - 0.5) + 0.5;
  vec2 pvGx = pvR * pvDx, pvGy = pvR * pvDy;
#ifdef SEA_SLAB
  uvF = vSlabUv; pvR = mat2(1.0, 0.0, 0.0, 1.0); pvGx = dFdx(vSlabUv); pvGy = dFdy(vSlabUv);   // 第五轮：实体石板用自己的 UV（每块一格贴图）
#endif
  vec4 sampledDiffuseColor = mix(textureGrad(map, uvF, pvGx, pvGy), texture2D(cobMap, uvC), pvC);
  // 宏观变化（世界坐标低频噪声）：大片明暗、湿痕
  float pvLo = pvN(vPxz * 0.021 + 3.3) * 0.6 + pvN(vPxz * 0.057 + 8.1) * 0.4;
  float pvMacro = 0.62 + 0.62 * pvLo + 0.12 * pvN(vPxz * 0.23);
  float pvMWet = smoothstep(0.5, 0.78, pvN(vPxz * 0.033 + 21.0) * 0.7 + pvN(vPxz * 0.11) * 0.3);
  float pvWet = max(smoothstep(0.25, 0.75, pvM.g) * 0.35, pvMWet * 0.5);   // 青苔 / 积水色斑 + 大片湿痕
  sampledDiffuseColor.rgb *= mix(vec3(1.0), vec3(0.97, 1.0, 0.96), pvN(vPxz * 0.04 + 40.0));
  sampledDiffuseColor.rgb *= pvMacro;
  // 第四轮：远景去重复 —— 每张贴图格明暗抖动 + 远处叠一层大尺度旋转采样的明暗（只调亮度，不叠第二套砖缝）
  sampledDiffuseColor.rgb *= mix(0.86 + 0.28 * pvH(pvCell + 9.13), 1.0, pvC);
  { float pvDist = length(vViewPosition); float pvW = smoothstep(16.0, 50.0, pvDist) * 0.55 * (1.0 - pvC);
    vec2 pvU2 = mat2(0.81, -0.59, 0.59, 0.81) * vPxz * pvK.x * 0.37 + 0.31;
    float pvL2 = clamp(dot(texture2D(map, pvU2).rgb, vec3(0.333)) / 0.075, 0.55, 1.5);
    sampledDiffuseColor.rgb *= mix(1.0, pvL2, pvW); }
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.62, 0.8, 0.78), pvWet);
  float pvEdge = smoothstep(${(HALF - 6).toFixed(1)}, ${HALF.toFixed(1)}, max(abs(vPxz.x), abs(vPxz.y)) + (pvB - 0.5) * 6.0);
  sampledDiffuseColor.rgb *= 1.0 - pvEdge * 0.75;
  diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = mix(textureGrad(roughnessMap, uvF, pvGx, pvGy), texture2D(cobRou, uvC), pvC); roughnessFactor *= texelRoughness.g;
#endif
  roughnessFactor = mix(roughnessFactor, 0.4, pvWet);`)
      .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 pvNf = textureGrad(normalMap, uvF, pvGx, pvGy).xyz * 2.0 - 1.0; pvNf.xy = pvNf.xy * pvR;   // 旋转 / 镜像回原坐标（Rᵀ·n）
  vec3 mapN = mix(pvNf, texture2D(cobNor, uvC).xyz * 2.0 - 1.0, pvC); mapN.y = -mapN.y;
  mapN.xy *= normalScale; normal = normalize(tbn * mapN);
#endif`);
    void hasN;
    seabedFloorPatch(sh, mat);
  };
}

// ---------------------------------------------------------------- 2. 火焰（shader 火舌 + 余烬 / 烟，全部 GPU 动画，CPU 只推 uTime）
const fireU = { uTime: { value: 0 } };
const FLAME_VS = `varying vec2 vUv; uniform float uTime;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * sc; gl_Position = projectionMatrix * mv; }`;
const FLAME_FS = `varying vec2 vUv; uniform float uTime; uniform float uSeed; uniform float uK;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return n(p) * 0.55 + n(p * 2.1) * 0.3 + n(p * 4.3) * 0.15; }
void main(){
  float t = uTime * 1.6 + uSeed * 10.0;
  vec2 p = vUv; float y = p.y;
  float w = fbm(vec2(p.x * 3.0 + uSeed, y * 3.5 - t * 1.4));
  float x = (p.x - 0.5 + (w - 0.5) * 0.35 * y) / max(0.06, 0.48 * pow(1.0 - y, 0.75));
  float body = 1.0 - smoothstep(0.35, 1.0, abs(x));
  float tip = smoothstep(1.0, 0.15, y + (w - 0.5) * 0.55);
  float f = clamp(body * tip * (0.75 + 0.5 * w) * smoothstep(0.0, 0.08, y), 0.0, 1.0);
  vec3 c = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.5, 0.1), smoothstep(0.2, 0.7, f));
  c = mix(c, vec3(1.0, 0.85, 0.5), smoothstep(0.85, 1.0, f));
  gl_FragColor = vec4(c * f * uK, f);
}`;
function flame(w: number, h: number, seed: number, k = 1.6): THREE.Mesh {
  const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: fireU.uTime, uSeed: { value: seed }, uK: { value: k } }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  const o = new THREE.Mesh(g, m); o.scale.set(w, h, 1); o.frustumCulled = false; o.renderOrder = 5; return o;
}
const PT_VS = `attribute vec4 seed; uniform float uTime; uniform float uLife; uniform float uRise; uniform float uSize; uniform float uSpread; varying float vA;
void main(){ float t = mod(uTime * seed.w + seed.z * uLife, uLife) / uLife;
  vec3 p = vec3(seed.x * uSpread * (1.0 + t * 1.5) + sin(uTime * 2.0 + seed.z * 9.0) * 0.12 * t, t * uRise, seed.y * uSpread * (1.0 + t * 1.5));
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  vA = sin(t * 3.14159) * (1.0 - t * 0.4); gl_PointSize = uSize * (0.6 + t) * (300.0 / -mv.z); }`;
const EMBER_FS = `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * a * 2.2, a); }`;
const SMOKE_FS = `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.05, d) * vA * 0.28; gl_FragColor = vec4(vec3(0.09, 0.1, 0.11), a); }`;
function particles(n: number, o: { life: number; rise: number; size: number; spread: number; smoke?: boolean }): THREE.Points {
  const g = new THREE.BufferGeometry(), s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()); s.set([Math.cos(a) * r, Math.sin(a) * r, Math.random(), 0.7 + Math.random() * 0.6], i * 4); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 4));
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: fireU.uTime, uLife: { value: o.life }, uRise: { value: o.rise }, uSize: { value: o.size }, uSpread: { value: o.spread } },
    vertexShader: PT_VS, fragmentShader: o.smoke ? SMOKE_FS : EMBER_FS, transparent: true, depthWrite: false, blending: o.smoke ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = o.smoke ? 6 : 7; return p;
}
const lights: { l: THREE.PointLight; base: number; ph: number }[] = [];
export function fireStack(scale: number, withLight: boolean, lightK: number): THREE.Group {   // opt1118D 导出：灰石营地小篝火用
  const g = new THREE.Group();
  g.add(flame(1.0 * scale, 1.9 * scale, 0.13, 0.55), flame(0.7 * scale, 1.45 * scale, 0.71, 0.6), flame(0.36 * scale, 0.85 * scale, 0.37, 0.7));
  const lo = curQuality === 'low' || curQuality === 'medium';
  g.add(particles(lo ? 10 : 22, { life: 1.6, rise: 2.6 * scale, size: 0.09, spread: 0.35 * scale }));
  if (!lo) { const sm = particles(10, { life: 3.2, rise: 4.5 * scale, size: 0.9 * scale, spread: 0.25 * scale, smoke: true }); sm.position.y = 1.2 * scale; g.add(sm); }
  if (withLight) { const l = new THREE.PointLight(0xff8a3a, lightK, 13 * scale + 4, 1.7); l.position.y = 1.1 * scale; g.add(l); lights.push({ l, base: lightK, ph: Math.random() * 9 }); }
  return g;
}
const iron = () => new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.55, metalness: 0.75 });
export function brazier(withLight: boolean): THREE.Group {   // opt1118D 导出：灰石营地北门火把换火盆
  const g = new THREE.Group(), mi = iron();
  const prof = [[0.12, 0], [0.5, 0.08], [0.62, 0.32], [0.58, 0.36], [0.46, 0.14], [0.1, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), mi); bowl.position.y = 0.95; bowl.castShadow = true; g.add(bowl);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.08, 6), mi);
    leg.position.set(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28); g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mi); foot.position.set(Math.cos(a) * 0.44, 0.04, Math.sin(a) * 0.44); g.add(foot);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 5, 16), mi); ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; g.add(ring);
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshStandardMaterial({ color: 0x1a0e08, emissive: 0xc8380c, emissiveIntensity: 0.55, roughness: 1 }));
  coal.rotation.x = -Math.PI / 2; coal.position.y = 1.2; g.add(coal);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.9 })); base.position.y = 0.04; base.receiveShadow = true; g.add(base);
  const f = fireStack(0.55, withLight, 2.2); f.position.y = 1.18; g.add(f);
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !(m as THREE.ShaderMaterial).isShaderMaterial) m.userData.outlineParameters = { visible: false }; });
  return g;
}

// ---------------------------------------------------------------- 3. 街灯
const lampG = { post: new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), arm: new THREE.BoxGeometry(0.06, 0.06, 0.7), cage: new THREE.CylinderGeometry(0.18, 0.14, 0.42, 6), cap: new THREE.ConeGeometry(0.24, 0.22, 6), foot: new THREE.CylinderGeometry(0.2, 0.26, 0.3, 6), glass: new THREE.CylinderGeometry(0.13, 0.11, 0.32, 6) };
let lampM: { iron: THREE.Material; glass: THREE.Material } | null = null;
/** 11-17 Rhett：主路两侧的灯柱换成营地船木灯柱，光色改幽影绿（营地灯件缺失 / 低画质时退回铸铁灯柱，灯罩同样幽影绿） */
export const GHOST_LAMP = 0x6dffb4;
function lamp(): THREE.Group {
  const c = campLampPost({ color: GHOST_LAMP, light: false, halo: true }); if (c) return c;
  lampM ??= { iron: iron(), glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(GHOST_LAMP).multiplyScalar(1.6), toneMapped: false }) };
  const g = new THREE.Group(), add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = m === lampM!.iron; g.add(o); return o; };
  add(lampG.foot, lampM.iron, 0, 0.15, 0); add(lampG.post, lampM.iron, 0, 1.6, 0); add(lampG.arm, lampM.iron, 0, 3.05, 0.3);
  add(lampG.cage, lampM.iron, 0, 2.72, 0.6).scale.set(1, 1, 1); add(lampG.glass, lampM.glass, 0, 2.72, 0.6); add(lampG.cap, lampM.iron, 0, 3.02, 0.6);
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  return g;
}

// ---------------------------------------------------------------- 4. 建筑（比赛版场景件）
function scene(id: string, size: { h?: number; w?: number }, tint?: number, more: { envK?: number; metal?: number } = {}): THREE.Group | null {
  if (!hasScenes() || curQuality === 'low') return null;
  return makeGlbScene(id, size, tint !== undefined ? { tint, ...more } : more);
}
/** 倒挂钟楼翻正：岩基在下、钟在顶（sink = 岩基埋进地里的比例） */
function uprightTower(h: number, sink = 0.12, tint?: number): THREE.Group | null {
  const g = scene('scene_invertedtower', { h }, tint); if (!g) return null;
  const m = g.children[0]; m.rotation.x = Math.PI; m.position.y = h * (1 - sink); return g;
}
/** 门架模型贴地部分（y < 2）的两根门柱：返回相对放置点的圆心 + 半径（已按 ry 旋转）。ry 前调用（o 尚未挂进场景） */
function gateLegs(o: THREE.Object3D, ry: number): { x: number; z: number; r: number }[] {
  o.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), v = new THREE.Vector3();
  const B = [[1e9, -1e9, 1e9, -1e9], [1e9, -1e9, 1e9, -1e9]];
  o.traverse(c => { const m = c as THREE.Mesh, p = m.geometry?.attributes?.position as THREE.BufferAttribute | undefined; if (!m.isMesh || !p) return;
    const step = Math.max(1, Math.floor(p.count / 6000));
    for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); if (v.y > 2 || Math.abs(v.x) < 0.3) continue;
      const b = B[v.x < 0 ? 0 : 1]; b[0] = Math.min(b[0], v.x); b[1] = Math.max(b[1], v.x); b[2] = Math.min(b[2], v.z); b[3] = Math.max(b[3], v.z); } });
  const c = Math.cos(ry), s = Math.sin(ry);
  return B.filter(b => b[1] > b[0]).map(b => { const cx = (b[0] + b[1]) / 2, cz = (b[2] + b[3]) / 2, r = Math.min(1.4, Math.max(b[1] - b[0], b[3] - b[2]) / 2 * 0.95);
    return { x: cx * c + cz * s, z: -cx * s + cz * c, r }; });
}
const RUIN = { envK: 0.35, metal: 0.12 };
function buildings(api: WildBuildApi): number {
  let n = 0;
  // 第四轮：新建筑加碰撞（本体 api.block = 圆形碰撞体，玩家 / 怪物碰撞 + 寻路格）；半径按模型脚印（包围盒短边）× k
  const box = new THREE.Box3(), sz = new THREE.Vector3();
  const foot = (o: THREE.Object3D) => { o.updateMatrixWorld(true); box.setFromObject(o); box.getSize(sz); return sz; };
  const put = (o: THREE.Object3D | null, x: number, z: number, ry = 0, k = 0.36, kind: 'round' | 'gate' = 'round') => { if (!o) return; const s3 = foot(o); api.add(o, x, z, ry); n++;
    if (!api.block) return;
    if (kind === 'gate') {   // 城门：只挡两侧门柱，主路通行。门柱位置从模型贴地顶点（y < 2）算：按 x 正负分两簇取脚印框（包围盒宽度含钟身，比门柱外沿宽）
      const legs = gateLegs(o, ry); if (!legs.length) { const half = s3.x / 2, r = Math.min(1.4, s3.z * 0.35); for (const sx of [-1, 1]) api.block(x + sx * (half - r), z, r); colliders += 2; return; }
      for (const L of legs) { api.block(x + L.x, z + L.z, L.r); colliders++; } }
    else { const r = Math.min(s3.x, s3.z) * k; if (r > 0.3) { api.block(x, z, r); colliders++; } } };
  // 城中钟楼（钟楼区 mr_belltower 东侧，门朝广场）
  put(scene('scene_belltower', { h: 24 }), 62, -12, -Math.PI / 2);
  put(scene('scene_ruins', { w: 7 }, 0x7c827e, RUIN), 54, -24, 0.8); put(scene('scene_ruins', { w: 6 }, 0x7c827e, RUIN), 56, 2, 2.2);   // 10-27：同 mirror.ts 断柱组（石件非金属、钟分件青铜）
  // 长街城门：门架裂钟跨在主路上（回响长街北端）
  put(scene('scene_gatebell', { h: 9.5 }), 0, 38, 0, 0, 'gate');
  // 倒钟纪念碑：营地南门外东侧，落地的巨钟放在石台上
  const bell = scene('scene_bell', { w: 6 });
  // 第三轮：去掉深色圆盘石台 → 钟身半沉进浅水 / 沙里，脚下一圈不规则低矮碎石沙堆（大半没在水下，和地面融在一起）
  if (bell) { bell.children[0].position.y = -0.35; bell.add(seaMound(3.4, 0.32, 72)); }
  put(bell, 17, 72, 0.6);
  // 周边塔楼：倒挂钟楼翻正，围出城市天际线（避开刷怪点 / 领地地块 / 镜子）
  ([[-42, 54, 15, 0.3], [40, 64, 13, 2.1], [-64, 30, 18, 1.2], [66, 30, 16, 4.0], [-66, -16, 20, 0.7], [-20, -78, 17, 2.6], [26, -78, 15, 5.1], [70, -46, 18, 3.3], [-60, 70, 14, 1.9], [62, 74, 15, 0.2]] as const)
    .forEach(([x, z, h, ry]) => put(uprightTower(h, 0.14), x, z, ry));
  return n;
}

// ---------------------------------------------------------------- 5. NPC 写实模型（比赛版；没加载 / 低画质 → null 用经典）
type Look = { base: 'm' | 'f'; outfit?: 'Outfit_Male_Ranger' | 'Outfit_Male_Peasant'; robe?: number; trim?: number; hood?: boolean; plate?: number; h?: number; echo?: boolean; cloth?: number; hair?: number };
const LOOKS: Record<string, Look> = {
  charon: { base: 'm', outfit: 'Outfit_Male_Peasant', robe: 0x1c2a44, trim: 0x8a9ab0, hood: true, cloth: 0x2a3446, h: 2.1 },   // fix1107 回退件也与玩家同高（2.1×1.1）
  iola: { base: 'f', robe: 0x3e5272, trim: 0xd8e4f0, hood: false, echo: true, h: 2.1 },
  mira: { base: 'f', robe: 0x1e3a3c, trim: 0xb09050, hood: true, echo: true },
  ouf: { base: 'f', robe: 0x7a5a3a, trim: 0xe0d0b0, hood: false, echo: true },
  brun: { base: 'm', outfit: 'Outfit_Male_Ranger', plate: 0x3a4a5a, echo: true, cloth: 0x8a96a4 },
  tisha: { base: 'f', robe: 0x5a6280, trim: 0xf0e8d0, hood: false, h: 1.35, echo: true },
  hans: { base: 'm', outfit: 'Outfit_Male_Peasant', echo: true, cloth: 0x6a7a7a, hair: 0x9a9a98 },
  melo: { base: 'm', outfit: 'Outfit_Male_Peasant', robe: 0x4a4434, trim: 0xb0a070, hood: false, echo: true, cloth: 0x5a5444 },
  goz: { base: 'm', outfit: 'Outfit_Male_Peasant', echo: true, cloth: 0x6a4a36, h: 2.1 },
  lian: { base: 'f', robe: 0xb8b8c4, trim: 0xe8d8a0, hood: true, echo: true },
  pike: { base: 'm', outfit: 'Outfit_Male_Ranger', echo: true, cloth: 0x6a80a8, h: 1.85 },
  sein: { base: 'm', outfit: 'Outfit_Male_Ranger', plate: 0x2a3a4a, echo: true, cloth: 0x7a8696 },
  otta: { base: 'f', robe: 0x4a4a54, trim: 0xa0a0b0, hood: true, h: 1.8, echo: true },
  // fix1107（Rhett 10:16：DLC 地图还没换模型的 NPC 全换）：钟楼补给商仁（回响）、潮痕营地补给商维克 → 同营地通用写实 NPC（30 级炼金件按身份染色）
  ren: { base: 'm', outfit: 'Outfit_Male_Peasant', echo: true, cloth: 0x3a3a4a },
  vik: { base: 'm', outfit: 'Outfit_Male_Peasant', cloth: 0x3a4a4a, h: 2.1 },
};
// 第四轮：13 个写实 NPC 按身份差异化 —— 体型（横向缩放）、手持物（按身份）、待机动画速度 / 相位
type Held = 'book' | 'staff' | 'bell' | 'lantern' | 'basket' | 'spear' | 'doll' | 'rod' | 'scroll' | 'quill' | 'hammer' | 'bouquet' | 'mallet' | 'sword' | 'cane';
const KIT: Record<string, { w?: number; ts?: number; r?: Held; l?: Held }> = {
  charon: { r: 'staff', l: 'book', ts: 0.85 }, iola: { r: 'bell', ts: 1.0 }, mira: { r: 'lantern', w: 1.04, ts: 1.12 }, ouf: { l: 'basket', w: 1.14, ts: 1.05 },
  brun: { r: 'spear', w: 1.1, ts: 0.9 }, tisha: { l: 'doll', ts: 1.3 }, hans: { r: 'rod', w: 1.13, ts: 0.8 }, melo: { l: 'scroll', r: 'quill', w: 0.92, ts: 0.95 },
  goz: { r: 'hammer', w: 1.2, ts: 0.88 }, lian: { l: 'bouquet', w: 0.95, ts: 1.08 }, pike: { r: 'mallet', w: 0.94, ts: 1.2 }, sein: { r: 'sword', w: 1.08, ts: 0.92 }, otta: { r: 'cane', w: 1.06, ts: 0.68 },
  ren: { l: 'basket', w: 1.02, ts: 0.9 }, vik: { r: 'hammer', w: 1.15, ts: 0.95 },
};
const heldM: Record<string, THREE.MeshStandardMaterial> = {};
const hm = (k: string, c: number, r = 0.8, m = 0, e = 0) => (heldM[k] ??= (() => { const x = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e }); x.userData.outlineParameters = { visible: false }; return x; })());
/** 手持物：L = 沿前臂方向的长度（长件顺着前臂，垂手待机时竖着） */
function heldMesh(h: Held): THREE.Group {
  const g = new THREE.Group(), wood = hm('wood', 0x4a3a2a, 0.85), iron = hm('iron', 0x3a3a3c, 0.45, 0.8), brass = hm('brass', 0x8a6a34, 0.4, 0.8);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  switch (h) {   // 局部 +y = 沿前臂往手外
    case 'book': add(new THREE.BoxGeometry(0.2, 0.26, 0.05), hm('leather', 0x4a2a1e, 0.9)); add(new THREE.BoxGeometry(0.19, 0.25, 0.042), hm('paper', 0xc8bca0, 0.95), 0.008, 0, 0); break;
    case 'staff': add(new THREE.CylinderGeometry(0.022, 0.028, 1.9, 7), wood, 0, 0.35, 0); add(new THREE.SphereGeometry(0.06, 10, 8), hm('glowc', 0x8ff0e0, 0.3, 0, 0x2a8a80), 0, 1.32, 0); break;
    case 'bell': add(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), wood, 0, 0.08, 0); add(new THREE.CylinderGeometry(0.05, 0.11, 0.14, 14, 1, true), brass, 0, 0.22, 0).rotation.z = Math.PI; break;
    case 'lantern': add(new THREE.TorusGeometry(0.04, 0.008, 5, 10), iron, 0, 0.05, 0); add(new THREE.CylinderGeometry(0.07, 0.08, 0.18, 6), hm('lglow', 0xffd890, 0.4, 0, 0xc88a30), 0, 0.2, 0); add(new THREE.ConeGeometry(0.09, 0.07, 6), iron, 0, 0.32, 0).rotation.z = Math.PI; break;
    case 'basket': add(new THREE.CylinderGeometry(0.17, 0.13, 0.14, 12, 1, true), hm('wicker', 0x7a5a34, 0.95), 0, 0.12, 0).material.side = THREE.DoubleSide; for (let i = 0; i < 3; i++) add(new THREE.CapsuleGeometry(0.04, 0.12, 3, 8), hm('bread', 0xa86a30, 0.9), -0.06 + i * 0.06, 0.17, 0).rotation.z = Math.PI / 2; break;
    case 'spear': add(new THREE.CylinderGeometry(0.02, 0.024, 2.3, 7), wood, 0, 0.5, 0); add(new THREE.ConeGeometry(0.04, 0.24, 4), iron, 0, 1.77, 0); break;
    case 'doll': add(new THREE.SphereGeometry(0.05, 8, 6), hm('cloth1', 0xd8c8b0, 0.95), 0, 0.12, 0); add(new THREE.CylinderGeometry(0.03, 0.06, 0.13, 8), hm('cloth2', 0x8a3a3a, 0.95), 0, 0.03, 0); break;
    case 'rod': add(new THREE.CylinderGeometry(0.008, 0.02, 2.4, 6), wood, 0, 0.9, 0).rotation.x = 0.25; break;
    case 'scroll': add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), hm('paper', 0xc8bca0, 0.95), 0, 0.05, 0).rotation.z = Math.PI / 2; break;
    case 'quill': add(new THREE.ConeGeometry(0.018, 0.26, 4), hm('feather', 0xe0dcd0, 0.9), 0, 0.12, 0); break;
    case 'hammer': add(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 6), wood, 0, 0.1, 0); add(new THREE.BoxGeometry(0.16, 0.08, 0.08), iron, 0, 0.36, 0); break;
    case 'bouquet': for (let i = 0; i < 7; i++) { const a = i * 0.9; add(new THREE.SphereGeometry(0.04, 7, 5), hm('flower' + (i % 2), i % 2 ? 0xe8e4f0 : 0xb8c8e8, 0.8, 0, 0x101418), Math.cos(a) * 0.05, 0.16 + (i % 3) * 0.02, Math.sin(a) * 0.05); } add(new THREE.CylinderGeometry(0.02, 0.012, 0.16, 6), hm('stem', 0x3a5a30, 0.9), 0, 0.06, 0); break;
    case 'mallet': add(new THREE.CylinderGeometry(0.018, 0.02, 0.55, 6), wood, 0, 0.12, 0); add(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10), hm('felt', 0x5a3a2a, 1), 0, 0.42, 0).rotation.z = Math.PI / 2; break;
    case 'sword': add(new THREE.BoxGeometry(0.05, 1.0, 0.012), hm('steel', 0x9aa2aa, 0.3, 0.9), 0, 0.62, 0); add(new THREE.BoxGeometry(0.2, 0.03, 0.04), brass, 0, 0.1, 0); add(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), hm('leather', 0x4a2a1e, 0.9), 0, 0.0, 0); break;
    case 'cane': add(new THREE.CylinderGeometry(0.018, 0.022, 1.0, 7), wood, 0, 0.42, 0); add(new THREE.TorusGeometry(0.05, 0.016, 5, 10, Math.PI), wood, 0.05, -0.05, 0); break;
  }
  return g;
}
/** 长杆类（法杖 / 长矛 / 手杖）：不顺前臂，竖着拄地，底端贴地，每帧跟着手的水平位置走（绑定姿势里前臂是平的，顺前臂会变成横端着） */
const UPRIGHT: Partial<Record<Held, true>> = { staff: true, spear: true, cane: true };
function uprightMesh(h: Held): THREE.Group {
  const g = new THREE.Group(), wood = hm('wood', 0x4a3a2a, 0.85), iron = hm('iron', 0x3a3a3c, 0.45, 0.8);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (h === 'staff') { add(new THREE.CylinderGeometry(0.024, 0.03, 1.95, 7), wood, 0, 0.975, 0); add(new THREE.SphereGeometry(0.06, 10, 8), hm('glowc', 0x8ff0e0, 0.3, 0, 0x2a8a80), 0, 2.0, 0); }
  else if (h === 'spear') { add(new THREE.CylinderGeometry(0.02, 0.025, 2.25, 7), wood, 0, 1.125, 0); add(new THREE.ConeGeometry(0.04, 0.24, 4), iron, 0, 2.37, 0); }
  else { add(new THREE.CylinderGeometry(0.018, 0.02, 0.92, 7), wood, 0, 0.46, 0); add(new THREE.TorusGeometry(0.05, 0.016, 5, 10, Math.PI), wood, 0.05, 0.92, 0); }
  return g;
}
const uprights: { o: THREE.Object3D; hand: THREE.Object3D; root: THREE.Object3D }[] = [];
const _hv = new THREE.Vector3();
function uprightUpdate() {
  for (let i = uprights.length - 1; i >= 0; i--) { const u = uprights[i]; if (!u.o.parent) { uprights.splice(i, 1); continue; } if (!u.root.visible) continue;
    u.hand.getWorldPosition(_hv); u.root.worldToLocal(_hv); u.o.position.set(_hv.x, 0, _hv.z); }
}
function npcKit(c: NonNullable<ReturnType<typeof makeCharacter>>, tag: string) {
  const k = KIT[tag]; if (!k) return;
  const root = c.root; root.updateMatrixWorld(true);
  if (k.w) { const body = root.children[0]; body.scale.x *= k.w; body.scale.z *= k.w; root.updateMatrixWorld(true); }   // 体型：横向胖瘦
  for (const side of ['r', 'l'] as const) {
    const h = side === 'r' ? k.r : k.l; if (!h) continue;
    const hand = root.getObjectByName('hand_' + side), fore = root.getObjectByName('lowerarm_' + side); if (!hand || !fore) continue;
    if (UPRIGHT[h]) { const o = uprightMesh(h); o.name = 'npc_held_' + h; o.rotation.z = side === 'r' ? -0.05 : 0.05; o.scale.setScalar(1 / Math.max(1e-3, root.scale.x)); root.add(o); uprights.push({ o, hand, root }); continue; }   // root 等比缩放：杆件按 1/scale 保持世界尺寸
    const hp = hand.getWorldPosition(new THREE.Vector3()), dir = hp.clone().sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
    const o = heldMesh(h); o.position.copy(hp).addScaledVector(dir, 0.06); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    o.scale.multiplyScalar(1 / Math.max(1e-3, root.scale.x)); o.name = 'npc_held_' + h;
    root.add(o); o.updateMatrixWorld(true); hand.attach(o);
  }
  const an = c.anim as unknown as { mixer: THREE.AnimationMixer; loop: (n: string, ...r: unknown[]) => unknown; loopA?: THREE.AnimationAction | null };
  an.mixer.timeScale = k.ts ?? 1;
  const ph = (tag.charCodeAt(0) * 0.37 + tag.length * 0.91) % 3, orig = an.loop.bind(an);
  an.loop = (n: string, ...r: unknown[]) => { const A0 = an.loopA; const res = orig(n, ...r); try { const A = an.loopA; if (A && A !== A0) A.time = ph % Math.max(0.1, A.getClip().duration); } catch { /* 动作不存在 */ } return res; };   // 待机相位错开
  root.userData.npcKit = (k.r ?? '') + '/' + (k.l ?? '') + '/' + (k.w ?? 1);
}
function npcRig(K: NpcKit, tag: string): Rig | null {
  const L = LOOKS[tag]; if (!L || !hasScenes() || curQuality === 'low') return null;
  { const cm = L.base === 'm' ? 'LUX_Alchemy' : 'LUX_Hunter';   // fix1106（Rhett 17:57 选型、20:07 改用选角原 30 级件）：营地通用 NPC 男 = 炼金、女 = 猎手
    if (hdAvailable(cm)) {   // fix1106：营地通用写实 NPC；按身份色染衣服（与玩家炼金 / 猎手区分），身高按 LOOKS.h（默认 2.0，与玩家同标准）
      const c = makeCharacter({ model: cm, tex: '', show: [], mats: 'lux', clipSet: L.base === 'f' ? 'hunter' : 'alchemy', height: L.h ?? 2.0, tint: L.robe ?? L.cloth ?? L.plate, tintAmount: 0.38 });
      if (c) {
        if (L.echo) for (const m of c.mats) { m.emissive?.setHex(0x0a2a2e); m.userData.baseEmissive = 0x0a2a2e; }
        c.root.userData.npcHd = tag; c.root.userData.npcCamp = cm;
        try { npcKit(c, tag); } catch (e) { console.error('NPC 差异化出错', tag, e); }
        return K.fromChar(c);
      }
    }
  }
  const model = L.base === 'm' ? 'UBC_Male' : 'UBC_Female'; if (!hdAvailable(model)) return null;
  const mats = 'npc_m_' + tag;
  if (L.base === 'm') { HD_MATS[mats] = { MI_Ranger: L.cloth ?? 0xc4ccd8, MI_Peasant: L.cloth ?? 0x8a7a6a, MI_Regular_Male: 0xffffff, MI_Superhero_Male: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_1: L.hair ?? 0xffffff }; HD_GAIN[mats] = 1.25; }
  else HD_MATS[mats] = { MI_Superhero_Female: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_2: 0xffffff };
  const c = makeCharacter({ model, tex: '', show: [], mats, clipSet: L.base === 'f' ? 'mage' : 'warrior', parts: L.outfit ? [L.outfit] : undefined, hideBase: L.outfit === 'Outfit_Male_Ranger' ? ['Male_Ranger_Head_Hood'] : undefined, height: L.h ?? (L.base === 'f' ? 1.95 : 2.05), forceHd: true });
  if (!c) return null;
  if (L.robe !== undefined) K.ubcRobe(c, new THREE.Color(L.robe), L.trim ?? 0xd8b060, L.hood ?? true);
  if (L.plate !== undefined) K.ubcPlate(c, L.plate, 0.5);
  if (L.base === 'm' && !L.robe) K.ubcHair(c, L.hair ?? 0x3a2a1e);
  if (L.echo) for (const m of c.mats) { m.emissive?.setHex(0x0c3a40); m.userData.baseEmissive = 0x0c3a40; }   // 回响：一层冷青色微光
  c.root.userData.npcHd = tag;
  try { npcKit(c, tag); } catch (e) { console.error('NPC 差异化出错', tag, e); }
  return K.fromChar(c);
}
/** 写实还没解析完时先给经典模型，包一层；写实就绪后（plazaUpdate 轮询）原地换成写实，Rig 对象不变（NPC 表里存的是同一个） */
const pending: { rig: Rig; tag: string; K: NpcKit }[] = [];
function npcWrap(K: NpcKit, tag: string, base: string, tint?: number, k?: number): Rig | null {
  if (!hasScenes() || curQuality === 'low' || !wantHd()) return null;   // 10-27：只在「写实」模式换底座；经典模式保持 KayKit（钩子现在模块加载就注册，不再靠选角先建 NPC 碰巧躲开）
  const hd = npcRig(K, tag); if (hd) return hd;
  const c = K.classic(base, tint, k), root = new THREE.Group(); root.add(c.root);
  const rig: Rig = { ...c, root }; pending.push({ rig, tag, K }); kickPoll(); return rig;
}
// 10-27：选角背景不跑 mirrorUpdate → 待换 NPC 靠自己的计时器轮询（有待换才开，换完即停）
let pollTimer: ReturnType<typeof setInterval> | null = null;
function kickPoll() { if (pollTimer) return; pollTimer = setInterval(() => { upgradePending(0); if (!pending.length && pollTimer) { clearInterval(pollTimer); pollTimer = null; } }, 800); }
let pollT = 0, upgraded = 0, upErr = '';
function upgradePending(dt: number) {
  void dt; const now = performance.now(); if (!pending.length || now - pollT < 700) return; pollT = now;   // 墙钟轮询：卡顿时 dt 被夹小也照样换
  if (!hdAvailable('UBC_Male') || !hdAvailable('UBC_Female')) return;
  for (const p of pending.splice(0)) {
    let hd: Rig | null = null; try { hd = npcRig(p.K, p.tag); } catch (e) { upErr = String(e); } if (!hd) { upErr ||= 'null ' + p.tag; continue; } upgraded++;
    p.rig.root.clear(); p.rig.root.add(hd.root);
    Object.assign(p.rig, { body: hd.body, legs: hd.legs, flash: hd.flash, anim: hd.anim, scale: hd.scale }); hd.anim?.loop('idle');
  }
}
let hooksOn = false;
export function plazaBind() {
  if (hooksOn) return; hooksOn = true;
  WILD_PROP_HOOKS.dlc1_mirror = (kind, v, sz) => (hasScenes() && curQuality !== 'low' ? (campProp(kind) ?? realProp(kind, v, sz)) : null);   // 比赛版换写实程序件；商用包 / 低画质 → null = 本体 Q 版
  for (const k of Object.keys(LOOKS)) NPC_MODEL_HOOKS['mr_' + k] = (kit, tint, kk, base) => npcWrap(kit as NpcKit, k, base ?? 'Mage', tint, kk);
  bindNpcC();   // v1.2.73 C 组 NPC 写实件（伊奥拉 / 卡戎）套在回响装扮外层
  if (hasScenes()) setTimeout(() => { if (curQuality !== 'low' && wantHd()) void ensureHd(20000); }, 2500);   // 比赛版：写实底座提前解析（进镜渊城时 NPC 直接用）
}

// ---------------------------------------------------------------- 入口
let colliders = 0;
const stats = { floor: false, fires: 0, lamps: 0, buildings: 0, lights: 0, hiddenCones: 0, colliders: 0, slabs: null as SlabStats | null };
export function plazaBuild(api: WildBuildApi, camp: { x: number; z: number; r?: number }) {
  lights.length = 0;
  const floor = floorMesh(api.origin); api.add(floor, 0, 0); floor.position.y = 0.022; stats.floor = true;   // 第五轮：api.add 会叠加原点地面高度，放完复位
  // 10-27：本体地形在这里被海底地面盖住，环境高精的崖脚碎石（按本体地形高度 + 地形顶点色撒）会从石板地里冒出黑色碎块 → 标记本体地形不撒
  for (const c of floor.parent?.children ?? []) { const m = c as THREE.Mesh; if (m.isMesh && m.geometry?.getAttribute('splat')) m.userData.envNoDebris = true; }
  // 篝火：藏掉原来的锥体火苗（石圈 / 木柴保留），换 shader 火舌 + 粒子；原点光保留
  const fire = fireStack(1, false, 0); api.add(fire, camp.x, camp.z); fire.position.y += 0.18;
  const grp = fire.parent; stats.hiddenCones = 0;
  grp?.traverse(o => { if (o.name === 'fire' && Math.hypot(o.getWorldPosition(new THREE.Vector3()).x - (api.origin.x + camp.x), o.getWorldPosition(new THREE.Vector3()).z - (api.origin.z + camp.z)) < 2) { o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.visible = false; stats.hiddenCones++; } }); } });
  // 火盆：北门两只点光（高画质），南门两只只自发光
  const hq = hiQ(); stats.fires = 5;
  for (const sx of [-1, 1]) { api.add(brazier(hq), camp.x + sx * 3.2, camp.z - 13.6); api.add(brazier(false), camp.x + sx * 3.2, camp.z + 13.6); }
  // 街灯：主路两侧 + 回响长街
  let nl = 0; for (let z = 66; z >= -34; z -= 10) { if (Math.abs(z - 38) < 3 || Math.abs(z - camp.z) < 14) continue; for (const sx of [-1, 1]) { api.add(lamp(), sx * 3.6, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2); nl++; } }
  for (const [x, z, ry] of [[-12, 9.5, 0], [12, -1.2, Math.PI], [36, -11, Math.PI], [-36, 4.6, 0]] as const) { api.add(lamp(), x, z, ry); nl++; }
  stats.lamps = nl; stats.lights = lights.length;
  colliders = 0; stats.buildings = buildings(api); stats.colliders = colliders;
  try { seabedBuild(api); } catch (e) { console.error('海底水景出错', e); }
  try { campBuild(api, camp); } catch (e) { console.error('营地布置出错', e); }
}
export function plazaUpdate(dt: number) {
  fireU.uTime.value += dt; upgradePending(dt); uprightUpdate();
  const t = fireU.uTime.value;
  campUpdate(t);
  for (const L of lights) L.l.intensity = L.base * (0.85 + 0.1 * Math.sin(t * 9 + L.ph) + 0.06 * Math.sin(t * 23 + L.ph * 2));
}
export const plazaDebug = () => ({ ...stats, camp: { ...campStats }, sea: seabedDebug(), pending: pending.length, upgraded, upErr, t: +fireU.uTime.value.toFixed(1), hdF: hdAvailable('UBC_Female'), hd: hdAvailable('UBC_Male'), scenes: hasScenes(), q: curQuality });

// ---------------------------------------------------------------- fix1107 其他 DLC 营地套倒钟广场样式
// Rhett 11-07 10:22：火堆、道具、地板等，DLC 所有营地都换成倒钟广场的样子。
//   潮痕营地 / 钟楼脚下 / 熔炉入口 / 井口：板岩地坪圆盘（贴地起伏、边缘淡出）+ shader 火舌篝火（Lux3D 石圈）+ 南北门火盆 + 沉船拾荒营同款场景件（campBuild）
//   帐篷 / 货箱 / 栅栏桩：WILD_PROP_HOOKS 同镜渊城（campProp → realProp）。商用 base 包 / 低画质：全部跳过（本体 Q 版）
let campSlate: StoneSet | null = null;
function campFloor(api: WildBuildApi, cx: number, cz: number, R: number): THREE.Mesh {
  const q = curQuality, S = q === 'ultra' || q === 'high' ? 1024 : 512;
  campSlate ??= makeSlate(S, true);
  for (const t of [campSlate.map, campSlate.normal, campSlate.rough]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  const geo = new THREE.RingGeometry(0.01, R, 72, 24); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute, fade = new Float32Array(p.count);
  const y0 = api.groundY(cx, cz);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    p.setY(i, api.groundY(cx + x, cz + z) - y0 + 0.035); uv.setXY(i, x / 5, z / 5);
    fade[i] = 1 - THREE.MathUtils.smoothstep(r, R - 3.2, R) * (0.85 + 0.15 * Math.sin(Math.atan2(z, x) * 7)); }
  geo.setAttribute('fade', new THREE.BufferAttribute(fade, 1)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8ccc8, map: campSlate.map, normalMap: campSlate.normal ?? undefined, roughnessMap: campSlate.rough ?? undefined, roughness: 1, metalness: 0, transparent: true, depthWrite: false, normalScale: new THREE.Vector2(1.1, 1.1) });
  if (q !== 'low') { mat.envMap = seaEnv(); mat.envMapIntensity = 0.3; }
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float fade; varying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFade = fade;');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a *= clamp(vFade, 0.0, 1.0);');
  };
  mat.customProgramCacheKey = () => 'dlcCampFloor1';
  mat.userData.outlineParameters = { visible: false };
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.renderOrder = -1; m.name = 'camp_floor'; m.userData.envNoDebris = true;
  return m;
}
const dressed = new Set<string>();
/** 其他 DLC 区域营地：在该区域 build 里调用；avoid = 营地局部坐标里让开的点（传送阵 / NPC） */
export function campDressBuild(api: WildBuildApi, camp: { x: number; z: number; r: number }, avoid: { x: number; z: number; r: number }[] = [], noBrazier = false, fireAt?: { x: number; z: number }, fireRedo = false) {   // 11-18 fireAt：本体营地篝火不在营地中心时，shader 火舌放到本体篝火上
  if (!hasScenes() || curQuality === 'low') return;
  dressed.add(api.origin.x + ',' + api.origin.z);
  api.add(campFloor(api, camp.x, camp.z, camp.r + 5), camp.x, camp.z);
  // 篝火：藏本体锥体火苗，换 shader 火舌 + 粒子（原点光保留）
  const fx = fireAt?.x ?? camp.x, fz = fireAt?.z ?? camp.z;
  if (fireRedo) {   // 11-18 21:10 Rhett「删掉无声钟楼的营地篝火包括它上面的光，重新放一个，用 DLC 篝火模型」：不叠火舌 / 不藏锥体，整个篝火删掉重放
    campFireRedo(api, fx, fz, camp.r + 4);
    const hq0 = hiQ(), gz0 = camp.r + 1.6;
    if (!noBrazier) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = camp.x + sx * 3.2, z = camp.z + sz * gz0; if (avoid.some(a => Math.hypot(x - camp.x - a.x, z - camp.z - a.z) < a.r + 0.8)) continue; api.add(brazier(hq0 && sz < 0), x, z); }
    try { campBuild(api, camp, avoid, { x: fx - camp.x, z: fz - camp.z }, true); } catch (e) { console.error('营地布置出错', e); }
    return;
  }
  const fire = fireStack(1, false, 0); api.add(fire, fx, fz); fire.position.y += 0.18;
  // 11-18 Rhett「无声钟楼篝火上面这个还没去掉」：本体篝火不在营地中心 / 被盆地地面抬高时，它的锥体火苗离 shader 火舌超过 2 m、悬在半空成一团亮块 → 营地半径内的本体锥体火苗都藏（?off=campcone 回 2 m）
  const coneR = /(?:[?&]off=[^&]*\bcampcone\b)/.test(location.search) ? 2 : Math.max(2, camp.r + 4);
  // 11-18 二次（Rhett 15:55「钟楼篝火上面的光为什么没修复」）：只遍历 fire.parent 够不着本体区域组里的火苗 → 从场景根找；造景后 0.3 / 1.5 秒再扫一遍（晚加的也藏）；?off=campcone2 回上一版
  const cx = api.origin.x + fx, cz = api.origin.z + fz, mx = api.origin.x + camp.x, mz = api.origin.z + camp.z, W = new THREE.Vector3();
  const hideCones = () => {
    let r: THREE.Object3D = fire; if (!/(?:[?&]off=[^&]*\bcampcone2\b)/.test(location.search)) while (r.parent) r = r.parent; else r = fire.parent ?? fire;
    r.traverse(o => { if (o.name !== 'fire' || o === fire) return; o.getWorldPosition(W); const d = Math.min(Math.hypot(W.x - cx, W.z - cz), Math.hypot(W.x - mx, W.z - mz) + (coneR > 2 ? 0 : 99)); if (d < coneR) o.traverse(c => { if ((c as THREE.Mesh).isMesh) c.visible = false; }); });
  };
  hideCones(); setTimeout(hideCones, 300); setTimeout(hideCones, 1500);
  // 火盆：南北门两侧
  const hq = hiQ(), gz = camp.r + 1.6;
  if (!noBrazier) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = camp.x + sx * 3.2, z = camp.z + sz * gz; if (avoid.some(a => Math.hypot(x - camp.x - a.x, z - camp.z - a.z) < a.r + 0.8)) continue; api.add(brazier(hq && sz < 0), x, z); }
  try { campBuild(api, camp, avoid, { x: fx - camp.x, z: fz - camp.z }); } catch (e) { console.error('营地布置出错', e); }
}
/** 11-18 21:10 营地篝火整个重放：半径 r 内的本体篝火（石圈 + 木柴 + 锥体火苗 + 点光，含其它件挂上的 fire 组 / 篝火点光）从场景里删掉，
 *  再放 DLC 篝火：Lux3D 石圈 scene_camp_firering + shader 火舌 / 火星 / 烟 + 一盏贴近火堆的暖点光（1.1 米高，不再有悬空亮块）。造景后 0.3 / 1.5 秒再删一遍晚加的 */
export function campFireRedo(api: WildBuildApi, fx: number, fz: number, r: number) {
  const anchor = api.add(new THREE.Group(), fx, fz) as THREE.Object3D;
  const keep = new Set<THREE.Object3D>();
  const ring = campPiece('firering', { w: 2.6 }); if (ring) { api.add(ring, fx, fz, 0.4); keep.add(ring); }
  const fire = fireStack(1, true, 3.2); api.add(fire, fx, fz); fire.position.y += 0.18; keep.add(fire);
  const cx = api.origin.x + fx, cz = api.origin.z + fz, W = new THREE.Vector3();
  const near = (o: THREE.Object3D) => { o.getWorldPosition(W); return Math.hypot(W.x - cx, W.z - cz) < r; };
  const mine = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (keep.has(p)) return true; return false; };
  const wipe = () => {
    let root: THREE.Object3D = anchor; while (root.parent) root = root.parent;
    const kill: THREE.Object3D[] = [];
    root.traverse(o => { if (mine(o)) return;
      if (o.name === 'fire' && near(o)) kill.push(o.parent && o.parent !== root && o.parent.children.length <= 16 ? o.parent : o);   // 本体 makeCampfire：整组（石圈 + 木柴 + 火苗 + fireLight）
      else if ((o.name === 'fireLight' || o.name === 'campfire') && near(o)) kill.push(o); });
    for (const o of kill) { o.parent?.remove(o); campStats.fireRedo++; }
  };
  wipe(); setTimeout(wipe, 300); setTimeout(wipe, 1500);
  dressed.add('redo:' + cx + ',' + cz);
  return fire;
}
/** 11-18 灰石营地（本体主营地）篝火换 shader 火舌：藏本体锥体火苗，原点光保留；成功返回 true（camp_gray 用） */
export function campFireDress(api: WildBuildApi, fx: number, fz: number): boolean {
  if (!hasScenes() || curQuality === 'low') return false;
  dressed.add('gray:' + fx + ',' + fz);
  const fire = fireStack(1, false, 0); api.add(fire, fx, fz); fire.position.y += 0.18;
  const W = new THREE.Vector3(), v = new THREE.Vector3(api.origin.x + fx, 0, api.origin.z + fz);
  fire.parent?.traverse(o => { if (o.name === 'fire' && o.getWorldPosition(W).setY(0).distanceTo(v) < 2) o.traverse(c => { if ((c as THREE.Mesh).isMesh) c.visible = false; }); });
  return true;
}
/** 镜渊城以外的营地也要火舌动画：manifest.update 每帧调（镜渊城里由 plazaUpdate 推进，这里不重复） */
export function campDressUpdate(dt: number, inMirror: boolean) {
  if (inMirror || !dressed.size) return;
  fireU.uTime.value += dt; const t = fireU.uTime.value; campUpdate(t);
  for (const L of lights) L.l.intensity = L.base * (0.85 + 0.1 * Math.sin(t * 9 + L.ph) + 0.06 * Math.sin(t * 23 + L.ph * 2));
}
/** 其他营地区域的造景替换钩子（同镜渊城）：模块加载即注册 */
export function campDressBind(ids: string[]) {
  for (const id of ids) WILD_PROP_HOOKS[id] ??= (kind, v, sz) => (hasScenes() && curQuality !== 'low' ? (campProp(kind) ?? realProp(kind, v, sz)) : null);
}
/** 按区域定义自动取营地 / 传送阵 / NPC 让位点 */
export function campDressFor(api: WildBuildApi, def: { camps: { x: number; z: number; r: number; waypoint: { x: number; z: number } }[]; npcs?: { x: number; z: number }[] }, o: { noBrazier?: boolean; fireRedo?: boolean } = {}) {
  for (const C of def.camps) {
    const avoid = [{ x: C.waypoint.x - C.x, z: C.waypoint.z - C.z, r: 2.8 }, ...(def.npcs ?? []).filter(n => Math.hypot(n.x - C.x, n.z - C.z) < C.r + 6).map(n => ({ x: n.x - C.x, z: n.z - C.z, r: 1.3 }))];
    try { campDressBuild(api, C, avoid, !!o.noBrazier, undefined, !!o.fireRedo); } catch (e) { console.error('营地换装出错', e); }
  }
}
