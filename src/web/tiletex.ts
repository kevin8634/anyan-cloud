// ======================================================================
// fix1106 代码模型无缝贴图（05 交件第 1 批，Rhett 11-06 23:31 批）
//   贴图：资产包 tex_tile/<种>_basecolor.jpg（sRGB）/ _normal.png（OpenGL +Y）/ _roughness.jpg；base 包为空表 → tileMat 返回 null，调用方用原材质
//   做法：MeshStandardMaterial + 世界坐标三向投影（Box / Cylinder / 多面体 / 合批 / InstancedMesh 都不依赖 UV，不拉伸）
//         侧面用 side 种，朝上的面可换 top 种（石墙侧面 + 石板顶面）；原材质颜色当色调（贴图按平均亮度归一后再乘）
//   性能：每张贴图全局只建一份（同种多材质共用），材质按参数缓存；加载画面里 tileLoad 解码 + 上传显存，进图不卡
// ======================================================================
import * as THREE from 'three';
import { TILE_TEX } from './assets.gen';

export type TileKind = 'rock' | 'stonefloor' | 'stonewall' | 'woodcrate' | 'rustiron' | 'mud' | 'coffinwood' | 'chestmetal' | 'bronzebell' | 'bone'
  | 'wellbrick' | 'wellflag' | 'wellcliff' | 'wellarch' | 'welliron' | 'wellwood' | 'wellice' | 'wellbank'
  | 'wellblocks' | 'wellbricks' | 'wellraw' | 'wellmoss' | 'wellhole';   // 11-08 井壁不规则拼块（Rhett 00:31 批 GPT）   // 11-07 钟井 v2（GPT 2048，Rhett 18:46 批）：只在钟井用，进钟井时才解码上传（不进开局加载）   // 1107 第 2 批：泥地 / 棺木 / 宝箱金属 / 青铜钟 / 骨
/** 05 建议的每米重复次数 */
const REPEAT: Record<TileKind, number> = { rock: 0.5, stonefloor: 0.4, stonewall: 0.5, woodcrate: 1.0, rustiron: 1.0, mud: 0.4, coffinwood: 1.0, chestmetal: 1.2, bronzebell: 0.6, bone: 1.0,
  wellbrick: 0.25, wellflag: 0.22, wellcliff: 0.08, wellarch: 0.12, welliron: 0.3, wellwood: 0.3, wellice: 0.1, wellbank: 0.18,
  wellblocks: 0.12, wellbricks: 0.2, wellraw: 0.1, wellmoss: 0.12, wellhole: 0.15 };
/** 不在开局加载画面里解码的种类（只有钟井用，tileLoadKinds 进图时再载） */
const LAZY = new Set<TileKind>(['wellbrick', 'wellflag', 'wellcliff', 'wellarch', 'welliron', 'wellwood', 'wellice', 'wellbank', 'wellblocks', 'wellbricks', 'wellraw', 'wellmoss', 'wellhole']);

interface TileSet { a: THREE.Texture; n: THREE.Texture; r: THREE.Texture; avg: { value: number }; ready: Promise<void> }
const sets = new Map<TileKind, TileSet>();
export const tileAvailable = (k: TileKind = 'woodcrate') => !!TILE_TEX[k + '_basecolor'];

function texOf(url: string, srgb: boolean): { t: THREE.Texture; p: Promise<HTMLImageElement | null> } {
  const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  const p = typeof Image === 'undefined' ? Promise.resolve(null) : new Promise<HTMLImageElement | null>(res => {
    const img = new Image(); img.onload = () => { t.image = img; t.needsUpdate = true; res(img); }; img.onerror = () => { console.warn('无缝贴图解码失败', url.slice(0, 40)); res(null); }; img.src = url;
  });
  return { t, p };
}
function lumAvg(img: HTMLImageElement | null): number {
  if (!img || typeof document === 'undefined') return 0.25;
  try { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) { const lin = (x: number) => Math.pow(x / 255, 2.2); s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); } return Math.max(0.02, s / 64); } catch { return 0.25; }
}
function setOf(k: TileKind): TileSet | null {
  const hit = sets.get(k); if (hit) return hit;
  const A = TILE_TEX[k + '_basecolor'], N = TILE_TEX[k + '_normal'], R = TILE_TEX[k + '_roughness'];
  if (!A || !N || !R) return null;
  const a = texOf(A, true), n = texOf(N, false), r = texOf(R, false), avg = { value: 0.25 };
  const ready = Promise.all([a.p, n.p, r.p]).then(([img]) => { avg.value = lumAvg(img); });
  const s: TileSet = { a: a.t, n: n.t, r: r.t, avg, ready }; sets.set(k, s); return s;
}
/** 加载画面里调用：解码全部无缝贴图并上传显存（没有贴图 = 立即完成） */
export async function tileLoad(renderer?: THREE.WebGLRenderer | null): Promise<void> {
  const ks = (Object.keys(REPEAT) as TileKind[]).filter(k => !LAZY.has(k)).map(setOf).filter((s): s is TileSet => !!s);
  await Promise.all(ks.map(s => s.ready));
  if (renderer) for (const s of ks) for (const t of [s.a, s.n, s.r]) if (t.image) renderer.initTexture(t);
}

/** 指定几种贴图：解码 + 上传显存（钟井进图前调用；已载过的立即完成） */
export async function tileLoadKinds(kinds: TileKind[], renderer?: THREE.WebGLRenderer | null): Promise<void> {
  const ks = kinds.map(setOf).filter((s): s is TileSet => !!s);
  await Promise.all(ks.map(s => s.ready));
  if (renderer) for (const s of ks) for (const t of [s.a, s.n, s.r]) if (t.image) renderer.initTexture(t);
}
const VERT_HEAD = `varying vec3 vTlW;\nvarying vec3 vTlN;\n`;
const VERT_BODY = `
  { vec4 tlp = vec4(transformed, 1.0); vec3 tln = objectNormal;
  #ifdef USE_INSTANCING
    tlp = instanceMatrix * tlp; tln = mat3(instanceMatrix) * tln;
  #endif
    vTlW = (modelMatrix * tlp).xyz; vTlN = normalize(mat3(modelMatrix) * tln); }`;
const FRAG_HEAD = `
uniform sampler2D tlA; uniform sampler2D tlN; uniform sampler2D tlR; uniform sampler2D tlA2; uniform sampler2D tlN2; uniform sampler2D tlR2;
uniform vec4 tlS; uniform vec2 tlAvg; varying vec3 vTlW; varying vec3 vTlN;
vec3 tlWn; float tlRo;
`;
// tlS = (侧面每米重复, 顶面每米重复, 法线强度, 粗糙度倍数)；tlAvg = (侧面平均亮度, 顶面平均亮度)
const FRAG_MAIN = `
  {
  vec3 ng = normalize(vTlN);
  vec3 bw = pow(abs(ng), vec3(4.0)); bw /= dot(bw, vec3(1.0));
  float up = step(0.0, ng.y);   // 朝上的面用 top 种，朝下仍用侧面种
  vec2 uX = vTlW.zy * tlS.x, uZ = vTlW.xy * tlS.x, uY = vTlW.xz * mix(tlS.x, tlS.y, up);
  vec4 cX = texture2D(tlA, uX), cZ = texture2D(tlA, uZ), cY = mix(texture2D(tlA, uY), texture2D(tlA2, uY), up);
  vec3 nX = texture2D(tlN, uX).xyz, nZ = texture2D(tlN, uZ).xyz, nY = mix(texture2D(tlN, uY).xyz, texture2D(tlN2, uY).xyz, up);
  float rX = texture2D(tlR, uX).r, rZ = texture2D(tlR, uZ).r, rY = mix(texture2D(tlR, uY).r, texture2D(tlR2, uY).r, up);
  float avgY = mix(tlAvg.x, tlAvg.y, up);
  vec3 col = cX.rgb / tlAvg.x * bw.x + cY.rgb / avgY * bw.y + cZ.rgb / tlAvg.x * bw.z;
  diffuseColor.rgb *= clamp(col, 0.0, 4.0);
  tlRo = rX * bw.x + rY * bw.y + rZ * bw.z;
  vec3 tX = vec3((nX.xy * 2.0 - 1.0) * tlS.z, 1.0), tY = vec3((nY.xy * 2.0 - 1.0) * tlS.z, 1.0), tZ = vec3((nZ.xy * 2.0 - 1.0) * tlS.z, 1.0);
  tX = vec3(tX.xy + ng.zy, abs(tX.z) * ng.x);
  tY = vec3(tY.xy + ng.xz, abs(tY.z) * ng.y);
  tZ = vec3(tZ.xy + ng.xy, abs(tZ.z) * ng.z);
  tlWn = normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z);
  }
`;

export interface TileOpts {
  /** 原材质颜色（色调） */ color?: THREE.ColorRepresentation;
  /** 朝上的面换这一种（石墙侧面 + 石板顶面） */ top?: TileKind;
  roughness?: number; metalness?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number;
  envMap?: THREE.Texture | null; envMapIntensity?: number; vertexColors?: boolean; flatShading?: boolean;
  /** 每米重复倍数（乘 05 建议值） */ scale?: number; normalK?: number; transparent?: boolean; opacity?: number; side?: THREE.Side;
}
const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** 取一个挂无缝贴图的材质；资产包没有这种贴图 → null（调用方用原材质）。同参数共用一份 */
export function tileMat(kind: TileKind, o: TileOpts = {}): THREE.MeshStandardMaterial | null {
  const S = setOf(kind); if (!S) return null;
  const top = o.top ? setOf(o.top) ?? S : S, topK = o.top && top !== S ? o.top : kind;
  const col = new THREE.Color(o.color ?? 0xffffff);
  const key = [kind, topK, col.getHexString(), o.roughness ?? 1, o.metalness ?? 0, o.emissive ?? 0, o.emissiveIntensity ?? 1, o.envMap?.uuid ?? '', o.envMapIntensity ?? 1, !!o.vertexColors, !!o.flatShading, o.scale ?? 1, o.normalK ?? 1, !!o.transparent, o.opacity ?? 1, o.side ?? 0].join('|');
  const hit = matCache.get(key); if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0, emissive: new THREE.Color(o.emissive ?? 0), emissiveIntensity: o.emissiveIntensity ?? 1,
    vertexColors: !!o.vertexColors, flatShading: !!o.flatShading, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide });
  if (o.envMap) { m.envMap = o.envMap; m.envMapIntensity = o.envMapIntensity ?? 1; } else if (o.envMapIntensity !== undefined) m.envMapIntensity = o.envMapIntensity;
  const sc = o.scale ?? 1;
  const U = {
    tlA: { value: S.a }, tlN: { value: S.n }, tlR: { value: S.r }, tlA2: { value: top.a }, tlN2: { value: top.n }, tlR2: { value: top.r },
    tlS: { value: new THREE.Vector4(REPEAT[kind] * sc, REPEAT[topK] * sc, o.normalK ?? 1, 1) },
    tlAvg: { value: new THREE.Vector2(S.avg.value, top.avg.value) },
  };
  void Promise.all([S.ready, top.ready]).then(() => U.tlAvg.value.set(S.avg.value, top.avg.value));
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * tlRo * tlS.w * 1.25, 0.06, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec3 tlDn = (viewMatrix * vec4(tlWn - normalize(vTlN), 0.0)).xyz; normal = normalize(normal + tlDn); }');
  };
  m.customProgramCacheKey = () => 'tiletex';
  m.userData = { tile: kind, tileTop: topK, outlineParameters: { visible: false } };
  matCache.set(key, m);
  return m;
}
export const tileDebug = () => ({ kinds: Object.keys(TILE_TEX).length / 3, sets: [...sets.keys()], mats: matCache.size });
