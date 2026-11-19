// ======================================================================
// 环境高精化（v1.2.49）：山体 / 石头 / 建筑的 PBR 细节层
//   贴图：资产包 textures_hd/<套>_ca.webp（RGB 颜色 + A 环境光遮蔽）+ <套>_nr.jpg（RG 法线 + B 粗糙度）
//         商用 base 包没有这些文件 → 本模块什么都不做（画面与之前一致）
//   画质：低 / 中 = 关；高 = 贴图降到 1K、各向异性 8x；超高 = 2K 原图、各向异性 16x
//   做法：不改造景代码，场景建好后按材质分类替换 / 打补丁（三平面投影，按世界坐标，不拉伸）
//     · 地形（有 splat 属性的网格）→ 崖壁层换高精岩壁（法线 / 粗糙度 / AO + 宏观变化），地面层保持原样
//     · 程序化石头（rock 贴图的卡通材质，合批后也认得）→ 高精石面 + 苔藓 / 湿润 / 边缘磨损
//     · 写实场景件（mesh 名 luxscene_<id>，由内容包登记类别）→ 在原贴图上叠细节：法线、粗糙度变化、
//       污渍流痕、底部脏污、铜锈（铜器）、苔藓 / 藤壶 / 水线湿润（礁石）
// ======================================================================
import * as THREE from 'three';
import { TEXTURES_HD } from './assets.gen';
import { loadTask } from './loading';

export type EnvKind = 'cliff' | 'stone' | 'reef' | 'masonry' | 'bronze' | 'ruin' | 'bell';
export type EnvTier = 'off' | 'high' | 'ultra';

/** 场景件 id → 类别（内容包 / 本体登记；按 mesh 名 luxscene_<id> 匹配） */
const KINDS = new Map<string, EnvKind>();
export function registerEnvKinds(m: Record<string, EnvKind>) { for (const [k, v] of Object.entries(m)) KINDS.set(k, v); }

export function envHdAvailable() { return Object.keys(TEXTURES_HD).length > 0; }
export function envTierFor(q: string): EnvTier { return !envHdAvailable() ? 'off' : q === 'ultra' ? 'ultra' : q === 'high' ? 'high' : 'off'; }

// ---------------------------------------------------------------- 贴图
interface HdSet { ca: THREE.Texture; nr: THREE.Texture; avg: THREE.Vector3 }
let tierLoaded: EnvTier = 'off';
const sets = new Map<string, HdSet>();

async function decode(url: string, size: number, srgb: boolean, renderer: THREE.WebGLRenderer | null, aniso: number) {
  const img = new Image(); img.src = url;
  await img.decode();
  let src: TexImageSource = img; let w = img.naturalWidth;
  // 高档：降到 1K（显存 / 上传时间约 1/4）；颜色通道 alpha 里是 AO，不能预乘
  if (w > size && typeof createImageBitmap === 'function') {
    try { src = await createImageBitmap(img, { resizeWidth: size, resizeHeight: Math.round(size * img.naturalHeight / w), resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); w = size; } catch { /* 不支持缩放：用原图 */ }
  }
  const t = new THREE.Texture(src as never);
  t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  if (renderer) renderer.initTexture(t);   // 立刻上传显存（加载画面期间完成，进图不卡）
  return { t, img };
}
function avgOf(img: HTMLImageElement) {
  const v = new THREE.Vector3(0.18, 0.18, 0.18);
  try { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4, lin = (x: number) => Math.pow(x / n / 255, 2.2); v.set(lin(r), lin(gg), lin(b)); } catch { /* 默认 */ }
  return v;
}

/** 按画质加载（加载画面里调用，每套贴图解码 + 上传计一份进度）；已加载同档直接返回 */
export async function envHdLoad(tier: EnvTier, renderer: THREE.WebGLRenderer | null): Promise<void> {
  if (tier === 'off' || !envHdAvailable() || tierLoaded === tier) return;
  for (const s of sets.values()) { s.ca.dispose(); s.nr.dispose(); }
  sets.clear(); tierLoaded = 'off';
  const names = [...new Set(Object.keys(TEXTURES_HD).map(k => k.replace(/_(ca|nr)$/, '')))];
  const size = tier === 'ultra' ? 4096 : 1024, aniso = Math.min(tier === 'ultra' ? 16 : 8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
  try {
    await Promise.all(names.map(n => loadTask(`高精贴图 · ${n}`, 2, (async () => {
      const ca = TEXTURES_HD[n + '_ca'], nr = TEXTURES_HD[n + '_nr']; if (!ca || !nr) return;
      const [a, b] = await Promise.all([decode(ca, size, true, renderer, aniso), decode(nr, size, false, renderer, aniso)]);
      sets.set(n, { ca: a.t, nr: b.t, avg: avgOf(a.img) });
    })())));
    tierLoaded = tier;
  } catch (e) { console.warn('高精贴图加载失败，保持原画面', e); }
}

// ---------------------------------------------------------------- 着色器补丁
interface HdOpts {
  set: string; scale: number; normalK: number; replace: number; gain: number;
  moss: number; wetY: number; wet: number; barnacle: number;
  wear: number; grime: number; patina: number; macro: number; gloss: number; terrain?: boolean;
  /** 去色：0 = 保留贴图 / 原色色相，1 = 中性灰后乘 tint（冷色墨灰） */ neutral?: number; tint?: [number, number, number];
}
/** 冷色墨灰（石头 / 山体去绿后的色调） */
const COOL: [number, number, number] = [0.9, 0.95, 1.02];
const PRESET: Record<EnvKind, Omit<HdOpts, 'terrain'>> = {
  // 边界山体：岩壁，石面中幅光泽（gloss < 1 = 更光滑），低处少量苔藓
  cliff:   { set: 'cliff',   scale: 0.16, normalK: 1.3, replace: 1, gain: 1.0, moss: 0.1, wetY: 0.35, wet: 0.6, barnacle: 0, wear: 0.5, grime: 0.15, patina: 0, macro: 0.55, gloss: 0.72, neutral: 0.92, tint: COOL },
  // 散布石头 / 碎石：高精石面 + 苔藓 + 水边湿润
  stone:   { set: 'stone',   scale: 0.3, normalK: 1.4, replace: 1, gain: 1.0, moss: 0.14, wetY: 0.4, wet: 0.85, barnacle: 0.06, wear: 0.8, grime: 0.1, patina: 0, macro: 0.5, gloss: 0.8, neutral: 0.95, tint: COOL },
  // 礁石 / 遗迹石块：湿润光泽 + 藤壶 + 苔藓（在原贴图上叠）
  reef:    { set: 'stone',   scale: 0.55, normalK: 1.1, replace: 0.55, gain: 1.0, moss: 0.22, wetY: 0.7, wet: 0.95, barnacle: 0.28, wear: 0.7, grime: 0.2, patina: 0, macro: 0.4, gloss: 0.6, neutral: 0.75, tint: COOL },
  // 建筑：风化石材 + 污渍流痕 + 底部脏污 + 少量铜锈
  masonry: { set: 'masonry', scale: 0.38, normalK: 1.0, replace: 0.45, gain: 1.0, moss: 0.25, wetY: 0.15, wet: 0.5, barnacle: 0, wear: 0.6, grime: 0.9, patina: 0.22, macro: 0.4, gloss: 0.9, neutral: 0.35, tint: [0.97, 0.98, 1.0] },
  // 风化石质遗迹（断柱 / 基座 / 碎石）：风化石材法线 + 边缘磨损 + 少量苔藓，不做水线湿润 / 藤壶（放在地面上的件，世界高度 0.7 米以下整片发黑发亮像没贴图）
  ruin:    { set: 'masonry', scale: 0.5, normalK: 1.25, replace: 0.4, gain: 1.0, moss: 0.16, wetY: 0.05, wet: 0.25, barnacle: 0, wear: 0.85, grime: 0.3, patina: 0.04, macro: 0.45, gloss: 0.95, neutral: 0.45, tint: [0.96, 0.98, 1.0] },
  // 落地的铜钟：青铜金属细节 + 铜锈（凹处 / 朝上面）+ 磨亮的棱，10-27 按图调：反射 0.9 + 光滑时整口钟镜面反射青色环境、像浅青塑料 → 粗糙一些（gloss 1.4）、铜锈 0.7、子件底色暖铜（envhd_kinds）
  bell:    { set: 'bronze',  scale: 0.8, normalK: 0.9, replace: 0.3, gain: 1.0, moss: 0, wetY: 0.05, wet: 0.2, barnacle: 0.08, wear: 1.0, grime: 0.4, patina: 0.7, macro: 0.3, gloss: 1.4 },
  // 铜器（钟 / 镜框 / 锁链）：铜锈（凹处 + 朝上面 + 流痕）+ 金属磨痕
  bronze:  { set: 'bronze',  scale: 0.9, normalK: 0.8, replace: 0.35, gain: 1.0, moss: 0, wetY: 0.2, wet: 0.4, barnacle: 0.25, wear: 0.9, grime: 0.5, patina: 0.85, macro: 0.3, gloss: 0.85 },
};

const VERT_HEAD = `varying vec3 vHdW;\nvarying vec3 vHdN;\n`;
const VERT_BODY = `
  { vec4 hdp = vec4(transformed, 1.0); vec3 hdn = objectNormal;
  #ifdef USE_INSTANCING
    hdp = instanceMatrix * hdp; hdn = mat3(instanceMatrix) * hdn;
  #endif
    vHdW = (modelMatrix * hdp).xyz; vHdN = normalize(mat3(modelMatrix) * hdn); }`;
const FRAG_HEAD = `
uniform sampler2D hdA; uniform sampler2D hdB; uniform sampler2D hdMA; uniform sampler2D hdMB;
uniform vec4 hdS; uniform vec4 hdW; uniform vec4 hdE; uniform vec4 hdG; uniform vec4 hdT; uniform vec3 hdAvg;
varying vec3 vHdW; varying vec3 vHdN;
float hdH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hdN2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hdH(i), hdH(i + vec2(1.0, 0.0)), f.x), mix(hdH(i + vec2(0.0, 1.0)), hdH(i + vec2(1.0, 1.0)), f.x), f.y); }
float hdF(vec2 p){ return hdN2(p) * 0.55 + hdN2(p * 2.13 + 3.1) * 0.3 + hdN2(p * 4.7 + 7.7) * 0.15; }
float hdLum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hdWn; float hdR; float hdAo; float hdMask; float hdWet;
`;
// 主体：颜色阶段之后（map / 顶点色已乘进 diffuseColor）
const FRAG_MAIN = `
  {
  vec3 hdNg = normalize(vHdN);
  vec3 hdBw = pow(abs(hdNg), vec3(4.0)); hdBw /= dot(hdBw, vec3(1.0));
  float hdMac = hdF(vHdW.xz * 0.045 + vHdW.y * 0.031);
  vec3 hdP = vHdW * hdS.x;
  vec2 hdO = vec2(hdMac * 1.7, hdMac * 2.3);
  vec2 uvX = hdP.zy + hdO, uvY = hdP.xz + hdO.yx, uvZ = hdP.xy + hdO;
  vec4 aX = texture2D(hdA, uvX), aY = texture2D(hdA, uvY), aZ = texture2D(hdA, uvZ);
  vec4 bX = texture2D(hdB, uvX), bY = texture2D(hdB, uvY), bZ = texture2D(hdB, uvZ);
  vec4 hdCa = aX * hdBw.x + aY * hdBw.y + aZ * hdBw.z;
  // 第二尺度（约 3.4 倍大）只做明暗：打断平铺重复
  vec3 hdP2 = hdP * 0.29 + 11.0;
  float hdBig = hdLum(texture2D(hdA, hdP2.zy).rgb * hdBw.x + texture2D(hdA, hdP2.xz).rgb * hdBw.y + texture2D(hdA, hdP2.xy).rgb * hdBw.z) / max(hdLum(hdAvg), 0.02);
  hdR = bX.b * hdBw.x + bY.b * hdBw.y + bZ.b * hdBw.z;
  hdAo = hdCa.a;
  // 三平面法线（whiteout 混合）
  vec3 tX = vec3((bX.xy * 2.0 - 1.0) * hdS.y, 1.0), tY = vec3((bY.xy * 2.0 - 1.0) * hdS.y, 1.0), tZ = vec3((bZ.xy * 2.0 - 1.0) * hdS.y, 1.0);
  tX = vec3(tX.xy + hdNg.zy, abs(tX.z) * hdNg.x);
  tY = vec3(tY.xy + hdNg.xz, abs(tY.z) * hdNg.y);
  tZ = vec3(tZ.xy + hdNg.xy, abs(tZ.z) * hdNg.z);
  hdWn = normalize(tX.zyx * hdBw.x + tY.xzy * hdBw.y + tZ.xyz * hdBw.z);
  vec3 hdAlb = hdCa.rgb;
  hdAlb = mix(hdAlb, vec3(hdLum(hdAlb)), hdT.w);   // 去掉贴图自带色相（石面贴图偏黄绿；按亮度去色，不按通道均值除 —— 蓝通道均值很低，除了会放大成蓝色斑点）
  // 颜色：replace = 1 用高精贴图当底色（顶点色 / 原色当色调），0 = 只叠细节明暗
  vec3 hdBase = diffuseColor.rgb;
  #if defined(HD_TERRAIN) && defined(USE_COLOR)
    hdBase = vColor.rgb / max(hdLum(vColor.rgb), 1e-3) * max(hdLum(vColor.rgb), 0.05);   // 地形崖壁：用顶点色（崖壁色）当色调，不再叠原手绘贴图；亮度保底（暗场景里山体不再是纯黑剪影）
  #endif
  hdBase = mix(hdBase, vec3(hdLum(hdBase)) * hdT.rgb, hdT.w);   // 原色 / 顶点色去绿 → 冷色墨灰
  vec3 hdRep = hdAlb / max(hdLum(hdAvg), 0.02) * (hdBase / max(hdLum(hdBase), 1e-3) * max(hdLum(hdBase), hdG.w)) * hdS.w;   // hdG.w = 亮度保底
  vec3 hdDet = hdBase * mix(vec3(1.0), hdAlb / max(mix(hdAvg, vec3(hdLum(hdAvg)), hdT.w), vec3(0.02)), 0.65);
  vec3 col = mix(hdDet, hdRep, hdS.z);
  col *= mix(1.0, clamp(0.55 + 0.45 * hdBig, 0.6, 1.35), hdE.w);
  col *= mix(1.0, 0.72 + 0.56 * hdF(vHdW.xz * 0.11 + vHdW.y * 0.05 + 7.0), hdE.w * 0.6);
  // 边缘磨损：AO 高（凸起）处提亮、略粗糙；凹处压暗
  float hdConvex = smoothstep(0.82, 1.0, hdAo);
  col *= 1.0 + hdE.x * (0.28 * hdConvex - 0.25 * (1.0 - hdAo));
  // 竖面污渍流痕 + 底部脏污
  float hdVert = 1.0 - abs(hdNg.y);
  vec2 hdTg = normalize(vec2(-hdNg.z, hdNg.x) + vec2(1e-4, 0.0));
  float hdHc = dot(vHdW.xz, hdTg);
  float hdSt = hdF(vec2(hdHc * 1.9, vHdW.y * 0.07 + hdMac));
  float hdStreak = smoothstep(0.52, 0.86, hdSt) * hdVert * hdE.y * (0.6 + 0.4 * hdN2(vec2(hdHc * 0.3, 1.0)));
  float hdFoot = (1.0 - smoothstep(hdW.y + 0.1, hdW.y + 3.2, vHdW.y)) * hdE.y;
  col *= 1.0 - 0.42 * hdStreak - 0.3 * hdFoot;
  hdR = clamp(hdR + 0.12 * hdStreak, 0.0, 1.0);
  // 铜锈：凹处 + 朝上面 + 流痕
  float hdPat = clamp(((1.0 - hdAo) * 1.6 + max(hdNg.y, 0.0) * 0.55 + hdStreak * 0.9 + (hdF(vHdW.xz * 1.3 + vHdW.y * 0.7) - 0.5) * 0.9) * hdE.z, 0.0, 1.0);
  col = mix(col, vec3(0.085, 0.2, 0.16) * (0.75 + 0.6 * hdLum(hdAlb) / max(hdLum(hdAvg), 0.02)), hdPat * 0.85);
  hdR = mix(hdR, 0.82, hdPat);
  // 苔藓：朝上面、凹处多，水线附近少
  hdWet = (1.0 - smoothstep(hdW.y - 0.1, hdW.y + 0.9 + 0.5 * hdMac, vHdW.y)) * hdW.z;
  float hdMoss = smoothstep(0.38, 0.8, hdNg.y + (hdF(vHdW.xz * 0.37 + 2.0) - 0.5) * 0.8) * hdW.x * mix(0.25, 1.4, smoothstep(0.93, 0.6, hdAo)) * (1.0 - hdWet * 0.8);
  hdMoss = clamp(hdMoss, 0.0, 1.0);
  vec4 mA = texture2D(hdMA, vHdW.xz * hdS.x * 1.8), mB = texture2D(hdMB, vHdW.xz * hdS.x * 1.8);
  col = mix(col, mix(vec3(hdLum(mA.rgb)), mA.rgb, 0.55) * 0.42 * hdG.y, hdMoss);   // 苔藓压暗、降饱和（暗场景里不跳）
  hdR = mix(hdR, mB.b, hdMoss);
  hdWn = normalize(mix(hdWn, normalize(vec3((mB.x * 2.0 - 1.0), 1.4, (mB.y * 2.0 - 1.0))), hdMoss * 0.7));
  // 藤壶：水线附近一带，成簇的浅色小圆环
  float hdBand = smoothstep(hdW.y - 0.9, hdW.y - 0.1, vHdW.y) * (1.0 - smoothstep(hdW.y + 0.3, hdW.y + 1.3, vHdW.y)) * hdW.w;
  if (hdBand > 0.01) {
    vec2 bu = (hdBw.y > max(hdBw.x, hdBw.z) ? vHdW.xz : (hdBw.x > hdBw.z ? vHdW.zy : vHdW.xy)) * 9.0;
    vec2 bi = floor(bu), bf = fract(bu); float bd = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)); vec2 r = o + vec2(hdH(bi + o), hdH(bi + o + 17.0)) * 0.8 + 0.1 - bf; bd = min(bd, dot(r, r)); }
    float clus = smoothstep(0.66, 0.86, hdN2(bu * 0.15 + 5.0)) * step(0.5, hdH(bi + 3.7));
    float ring = smoothstep(0.1, 0.045, bd) * clus * hdBand;
    float hole = smoothstep(0.012, 0.004, bd) * clus * hdBand;
    col = mix(col, vec3(0.22, 0.22, 0.21) * hdG.y, ring * 0.5); col *= 1.0 - 0.45 * hole;
    hdR = mix(hdR, 0.88, ring); hdAo *= 1.0 - 0.5 * hole;
  }
  // 湿润：水线以下变暗、变光滑、法线变平（积水膜）
  col *= mix(1.0, 0.52, hdWet);
  hdR = mix(hdR * hdG.x, 0.1, hdWet * 0.85);
  hdWn = normalize(mix(hdWn, hdNg, hdWet * 0.45));
  hdMask = hdG.z;
  #ifdef HD_TERRAIN
    hdMask *= clamp(vSplat.z / max(vSplat.x + vSplat.y + vSplat.z, 0.001), 0.0, 1.0);
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, col, hdMask);
  }
`;

let patched = new WeakMap<THREE.Material, THREE.Material | null>();
function black() { const t = new THREE.DataTexture(new Uint8Array([128, 128, 230, 255]), 1, 1); t.needsUpdate = true; return t; }
let _flat: THREE.DataTexture | null = null;

/** 给 MeshStandardMaterial 打补丁（返回同一个材质） */
function patchStandard(m: THREE.MeshStandardMaterial, o: HdOpts) {
  const S = sets.get(o.set), Mo = sets.get('moss');
  if (!S) return m;
  _flat ??= black();
  const U = {
    hdA: { value: S.ca }, hdB: { value: S.nr }, hdMA: { value: Mo?.ca ?? S.ca }, hdMB: { value: Mo?.nr ?? _flat },
    hdS: { value: new THREE.Vector4(o.scale, o.normalK, o.replace, o.gain) },
    hdW: { value: new THREE.Vector4(Mo ? o.moss : 0, o.wetY, o.wet, o.barnacle) },
    hdE: { value: new THREE.Vector4(o.wear, o.grime, o.patina, o.macro) },
    hdG: { value: new THREE.Vector4(o.gloss, 1, 1, o.terrain ? 0.04 : 0.0) },
    hdT: { value: new THREE.Vector4(...(o.tint ?? [1, 1, 1]), o.neutral ?? 0) },
    hdAvg: { value: S.avg },
  };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, max(mix(roughnessFactor * (0.7 + 0.6 * hdR), hdR, hdS.z), 0.34), hdMask);   // 粗糙度下限：细法线 + 太光滑会闪蓝色环境反射亮点')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - hdMask * clamp(hdE.z * 0.6 + hdWet * 0.0, 0.0, 1.0) * (1.0 - hdAo * 0.5);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec3 hdDn = (viewMatrix * vec4(hdWn - normalize(vHdN), 0.0)).xyz; normal = normalize(normal + hdDn * hdMask); }')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n{ float a = mix(1.0, hdAo, 0.85 * hdMask); reflectedLight.indirectDiffuse *= a; reflectedLight.indirectSpecular *= a; reflectedLight.directDiffuse *= mix(1.0, a, 0.35); }');
  };
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|envhd' + (o.terrain ? 'T' : '');
  if (o.terrain) m.defines = { ...(m.defines ?? {}), HD_TERRAIN: '' };
  // 11-19 specclass（cine.ts SPEC_CLASS，Demo 户外区才生效）：地形 0.35、石面（崖壁 / 散石 / 礁石 / 石砌）0.40；铜器不打类别
  if (o.terrain) m.defines = { ...(m.defines ?? {}), CINE_SPEC: '0.35' };
  else if (o.set === 'cliff' || o.set === 'stone' || o.set === 'masonry') m.defines = { ...(m.defines ?? {}), CINE_SPEC: '0.40' };
  m.userData.envHd = o.set;
  m.needsUpdate = true;
  return m;
}

/** 卡通石头 → 写实石面材质（保留顶点色 / 颜色当色调） */
function stoneFromToon(src: THREE.Material, kind: EnvKind): THREE.Material {
  const t = src as THREE.MeshToonMaterial;
  const m = new THREE.MeshStandardMaterial({ color: t.color?.clone() ?? new THREE.Color(1, 1, 1), vertexColors: t.vertexColors, roughness: 0.86, metalness: 0, flatShading: false, side: t.side, envMapIntensity: 0.3 });
  m.userData = { ...t.userData, envHdFrom: 'toon', outlineParameters: { visible: false } };   // 10-27：写实石面不套卡通描边（原来抄了卡通材质的 userData，岩块 / 山体留浅紫描边）
  return patchStandard(m, { ...PRESET[kind], gain: 0.3 });
}

/** 程序化岩块（12 面体等低面数多面体）→ 圆润不规则岩体：焊接顶点 → Hermite 中点细分（平面不鼓、凸面变圆）→ 沿法线两层噪声位移 → 平滑法线
 *  合批后的大网格也适用（每块石头各自焊接、互不相连）；levels：超高 2（×16 面）、高 1（×4 面） */
const roundCache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
function vnoise(x: number, y: number, z: number) {
  const h = (i: number, j: number, k: number) => { const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
export function roundRockGeometry(src: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
  let byLv = roundCache.get(src); if (!byLv) roundCache.set(src, byLv = new Map());
  const hit = byLv.get(levels); if (hit) return hit;
  const sp = src.getAttribute('position'), sc = src.getAttribute('color'), si = src.getIndex();
  const P: number[] = [], C: number[] = [], key = new Map<string, number>(), tri: number[] = [];
  const nIdx = si ? si.count : sp.count;
  for (let t = 0; t < nIdx; t++) {
    const i = si ? si.getX(t) : t;
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), k = `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
    let id = key.get(k);
    if (id === undefined) { id = P.length / 3; key.set(k, id); P.push(x, y, z); if (sc) C.push(sc.getX(i), sc.getY(i), sc.getZ(i)); }
    tri.push(id);
  }
  // 顶点法线（面积加权）+ 局部尺度（相邻边平均长）
  const nrm = (P: number[], T: number[]) => { const N = new Float32Array(P.length); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < T.length; t += 3) { const [i, j, k] = [T[t], T[t + 1], T[t + 2]]; a.fromArray(P, i * 3); b.fromArray(P, j * 3).sub(a); c.fromArray(P, k * 3).sub(a); b.cross(c);
      for (const v of [i, j, k]) { N[v * 3] += b.x; N[v * 3 + 1] += b.y; N[v * 3 + 2] += b.z; } }
    for (let v = 0; v < N.length; v += 3) { const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; } return N; };
  const S = new Float32Array(P.length / 3), Sc = new Float32Array(P.length / 3);
  for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) { const i = tri[t + e], j = tri[t + (e + 1) % 3]; const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]); S[i] += d; Sc[i]++; S[j] += d; Sc[j]++; }
  let scale = Array.from(S, (v, i) => v / Math.max(Sc[i], 1));
  let N = nrm(P, tri), T = tri;
  for (let lv = 0; lv < levels; lv++) {
    const mid = new Map<number, number>(), T2: number[] = [], NN = Array.from(N);
    const half = (i: number, j: number) => {
      const k = i < j ? i * 4194304 + j : j * 4194304 + i; let m = mid.get(k); if (m !== undefined) return m;
      const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2];
      const di = NN[i * 3] * dx + NN[i * 3 + 1] * dy + NN[i * 3 + 2] * dz, dj = NN[j * 3] * dx + NN[j * 3 + 1] * dy + NN[j * 3 + 2] * dz;
      m = P.length / 3; mid.set(k, m);
      for (let c = 0; c < 3; c++) P.push((P[i * 3 + c] + P[j * 3 + c]) / 2 + (NN[j * 3 + c] * dj - NN[i * 3 + c] * di) / 8);
      const nx = NN[i * 3] + NN[j * 3], ny = NN[i * 3 + 1] + NN[j * 3 + 1], nz = NN[i * 3 + 2] + NN[j * 3 + 2], l = Math.hypot(nx, ny, nz) || 1; NN.push(nx / l, ny / l, nz / l);
      if (C.length) for (let c = 0; c < 3; c++) C.push((C[i * 3 + c] + C[j * 3 + c]) / 2);
      scale.push((scale[i] + scale[j]) / 2);
      return m;
    };
    for (let t = 0; t < T.length; t += 3) { const a = T[t], b = T[t + 1], c = T[t + 2], ab = half(a, b), bc = half(b, c), ca = half(c, a); T2.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
    T = T2; N = new Float32Array(NN);
  }
  // 噪声位移：大块起伏 + 细碎崩面，幅度按局部尺度（原多面体边长）
  for (let v = 0; v < P.length / 3; v++) {
    const s = scale[v] || 1, f = 0.9 / s, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const d = ((vnoise(x * f, y * f, z * f) - 0.5) * 0.22 + (vnoise(x * f * 3.1 + 5, y * f * 3.1, z * f * 3.1) - 0.5) * 0.07) * s;
    P[v * 3] += N[v * 3] * d; P[v * 3 + 1] += N[v * 3 + 1] * d; P[v * 3 + 2] += N[v * 3 + 2] * d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (C.length) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  g.setIndex(T); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  byLv.set(levels, g);
  return g;
}

/** 地形：splat 材质换成写实版（地面两层沿用原贴图与降噪处理，崖壁层 = 高精岩壁） */
function terrainHd(src: THREE.Material): THREE.Material | null {
  const sm = src as THREE.MeshToonMaterial & { onBeforeCompile: THREE.Material['onBeforeCompile'] };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.4 });
  m.userData = { ...src.userData };
  // 先跑原 splat 补丁（地面混合、降噪、退后），再接高精层；toon 着色器块名与 standard 共用 common / map_fragment / begin_vertex
  const base = sm.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { base.call(sm, sh, r); };
  m.customProgramCacheKey = () => 'splatHd:' + (sm.customProgramCacheKey?.() ?? '');
  patchStandard(m, { ...PRESET.cliff, terrain: true, gain: 0.6 });
  return m;
}

/** 崖脚碎石（更多实例）：在地形崖壁与地面交界处撒小石块（高 600 / 超高 1600），用高精石面材质；挂在地形网格下 */
function cliffDebris(terrain: THREE.Mesh, tier: EnvTier): THREE.InstancedMesh | null {
  const g = terrain.geometry, pos = g.getAttribute('position'), sp = g.getAttribute('splat'), nor = g.getAttribute('normal');
  if (!pos || !sp) return null;
  const cand: number[] = [];
  for (let i = 0; i < pos.count; i++) { const r = sp.getZ(i) / Math.max(sp.getX(i) + sp.getY(i) + sp.getZ(i), 1e-3); if (r > 0.12 && r < 0.75 && (!nor || nor.getY(i) > 0.55)) cand.push(i); }
  if (!cand.length) return null;
  const want = Math.min(tier === 'ultra' ? 1600 : 600, cand.length * 3);
  const geo = new THREE.DodecahedronGeometry(1, 1); const gp = geo.getAttribute('position');
  let sd = 9137; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < gp.count; i++) { const k = 0.78 + rnd() * 0.4; gp.setXYZ(i, gp.getX(i) * k, gp.getY(i) * k * 0.62, gp.getZ(i) * k); }
  geo.computeVertexNormals();
  const mat = patchStandard(new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.9 }), { ...PRESET.stone, scale: 0.9, moss: 0.2, gain: 0.45 });
  const im = new THREE.InstancedMesh(geo, mat, want); im.name = 'envhd_debris'; im.castShadow = false; im.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  const col = new THREE.Color();
  for (let k = 0; k < want; k++) {
    const i = cand[Math.floor(rnd() * cand.length)];
    v.set(pos.getX(i) + (rnd() - 0.5) * 2.2, pos.getY(i), pos.getZ(i) + (rnd() - 0.5) * 2.2);
    const s = 0.08 + Math.pow(rnd(), 3) * 0.75;
    v.y += s * 0.15 - 0.05;
    im.setMatrixAt(k, m4.compose(v, q.setFromEuler(e.set(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6)), sc.set(s, s, s)));
    // 顶点色：沿用地形当地颜色（崖壁色），明暗随机
    const c = g.getAttribute('color'); if (c) col.setRGB(c.getX(i), c.getY(i), c.getZ(i)).multiplyScalar(1.4 + rnd() * 0.8); else col.setRGB(0.3, 0.3, 0.3);
    im.setColorAt(k, col);
  }
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.userData.envHdDebris = true; im.userData.outlineParameters = { visible: false }; mat.userData.outlineParameters = { visible: false };
  return im;
}

function kindOf(mesh: THREE.Mesh): EnvKind | null {
  const ud = (mesh.material as THREE.Material).userData;
  if (ud?.envKind) return ud.envKind as EnvKind;
  if (mesh.name.startsWith('luxscene_')) return KINDS.get(mesh.name.slice(9)) ?? null;
  return null;
}

/** 场景建好后调用：按材质分类升级；tier = off 时恢复原材质。可重复调用（画质切换） */
export function envHdApply(root: THREE.Object3D, tier: EnvTier, renderer?: THREE.WebGLRenderer) {
  const on = tier !== 'off' && sets.size > 0;
  const aniso = Math.min(tier === 'ultra' ? 16 : tier === 'high' ? 8 : 4, renderer?.capabilities?.getMaxAnisotropy?.() ?? 16);
  let n = 0;
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(mesh.material)) return;
    const orig = (mesh.userData.hdOrig as THREE.Material | undefined) ?? mesh.material as THREE.Material;
    if (!on) { if (mesh.userData.hdOrig) { mesh.material = orig; delete mesh.userData.hdOrig; } if (mesh.userData.hdOrigGeo) { mesh.geometry = mesh.userData.hdOrigGeo; delete mesh.userData.hdOrigGeo; } return; }
    // 超高：所有贴图各向异性拉满（远处地面 / 墙面斜看不糊）
    const mm = orig as THREE.MeshStandardMaterial;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap'] as const) { const t = mm[k] as THREE.Texture | null | undefined; if (t && t.anisotropy < aniso) { t.anisotropy = aniso; t.needsUpdate = true; } }
    if (mesh.userData.hdOrig) return;   // 已升级
    let next: THREE.Material | null | undefined = patched.get(orig);
    if (next === undefined) {
      next = null;
      if (mesh.geometry.getAttribute('splat') && (orig as THREE.MeshToonMaterial).isMeshToonMaterial) next = terrainHd(orig);
      else {
        const k = kindOf(mesh);
        const mapName = ((orig as THREE.MeshToonMaterial).map as THREE.Texture | null)?.userData?.texName;
        if ((orig as THREE.MeshToonMaterial).isMeshToonMaterial && (mapName === 'rock' || k === 'stone' || k === 'cliff')) next = stoneFromToon(orig, k ?? 'stone');
        else if (k && (orig as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(orig as THREE.ShaderMaterial).isShaderMaterial) {
          const c = (orig as THREE.MeshStandardMaterial).clone(); c.userData = { ...orig.userData, outlineParameters: { visible: false } };
          if (k === 'reef' || k === 'stone' || k === 'cliff' || k === 'ruin') c.envMapIntensity = Math.min(c.envMapIntensity, 0.45);   // 石面不反射蓝色环境
          next = patchStandard(c, { ...PRESET[k] });
        }
      }
      patched.set(orig, next);
    }
    if (next) {
      mesh.userData.hdOrig = orig; mesh.material = next; n++;
      // 程序化岩块：低面数多面体 → 细分 + 噪声位移的圆润岩体（棱面不再明显）
      if (next.userData.envHdFrom === 'toon' && !mesh.geometry.getAttribute('splat')) {
        const tris = (mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count) / 3;
        const lv = tier === 'ultra' ? (tris < 40000 ? 2 : 1) : 1;
        if (tris < 160000) { mesh.userData.hdOrigGeo = mesh.geometry; mesh.geometry = roundRockGeometry(mesh.geometry, lv); }
      }
      if (mesh.geometry.getAttribute('splat') && !mesh.userData.envNoDebris) { const d = cliffDebris(mesh, tier); if (d) mesh.add(d); }   // 内容包自己铺了地面的区域（userData.envNoDebris）不撒碎石：碎石按本体地形高度放，会从包的地面里冒出来
    }
  });
  if (!on) { const rm: THREE.Object3D[] = []; root.traverse(o => { if (o.userData.envHdDebris) rm.push(o); }); for (const o of rm) { o.removeFromParent(); (o as THREE.InstancedMesh).dispose(); } }
  return n;
}

/** 已登记的场景根（画质切换时重新应用） */
const roots = new Set<THREE.Object3D>();
let curTier: EnvTier = 'off';
export function envHdTrack(root: THREE.Object3D, renderer?: THREE.WebGLRenderer) { roots.add(root); return envHdApply(root, curTier, renderer); }
/** 画质切换：加载对应贴图后重新应用到所有已登记场景（切到低 / 中立即恢复原材质）；多次调用排队，只执行最后一次的档位 */
let chain: Promise<void> = Promise.resolve(); let wantTier: EnvTier = 'off';
export function envHdSetTier(tier: EnvTier, renderer: THREE.WebGLRenderer): Promise<void> {
  wantTier = tier;
  chain = chain.then(async () => {
    if (wantTier !== tier) return;   // 已被更新的设置取代
    if (tier === curTier && (tier === 'off' || tierLoaded === tier)) return;
    for (const r of roots) envHdApply(r, 'off');
    if (tier !== 'off') { await envHdLoad(tier, renderer); patched = new WeakMap(); }   // 新分辨率的贴图 → 补丁材质全部重建
    curTier = tier !== 'off' && tierLoaded === tier ? tier : 'off';
    if (curTier !== 'off') for (const r of roots) envHdApply(r, curTier, renderer);
  }).catch(e => console.warn('环境高精化切换失败', e));
  return chain;
}
/** 等当前排队的画质切换（含贴图加载）完成 */
export function envHdReady() { return chain; }
export function envHdTier() { return curTier; }
export function envHdDebug() { let n = 0; for (const r of roots) r.traverse(o => { if (o.userData.hdOrig) n++; }); return { tier: curTier, loaded: tierLoaded, sets: [...sets.keys()], upgraded: n, roots: roots.size }; }
