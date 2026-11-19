// 画面：卡通材质、描边 + 泛光渲染管线、画质分档、天空、粒子、技能特效用的着色器
import * as THREE from 'three';
import { envHdSetTier, envTierFor } from './envhd';
import { flameDevelopTier } from './fire_develop';   // 11-18 A5
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { QlBloomPass } from './ql_bloom';
const QL_TONE_OFF = (() => { try { return /(?:[?&]off=[^&]*\bqltone\b)/.test(location.search); } catch { return false; } })();   // 11-18 秋林泛光（?off=qlbloom）
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SkyEnv, GodRaysPass, patchOutput, installPCSS } from './fxd';
import { CINE } from './cine';
import { VolLightPass } from './vol_light';
import { QlRaysPass } from './ql_rays';
import { QL_DEMO } from './map_look';
// C19 launch.log stat 行带镜头防穿透耗时：cam=每帧毫秒/候选数/候选三角/黑名单数（第三人称卡顿排查）
const camDiag = () => { const c = (globalThis as unknown as { __camCollide?: { ms: number; cands: number; tris: number; heavy: number } }).__camCollide; return c ? ` cam=${c.ms.toFixed(2)}ms/${c.cands}/${(c.tris / 1e3).toFixed(0)}k/${c.heavy}` : ''; };   // 11-17g 秋林射线（?off=qlrays）

// ---------------------------------------------------------------- 11-11 桌面版（wip/electron1109，阶段二）：只在 Electron 外壳里生效（preload 暴露 __drfs），网页 / 比赛版行为不变
/** 是否在桌面版（Electron）里运行 */
// 11-19 Rhett「超高画质反而树变的很奇怪」：超高才开的 GTAO 用法线覆盖材质重画场景，不认 alphaTest → 叶卡 / 针叶枝片按整张矩形算遮蔽，树冠糊成一片片暗色方块。
//   alphaTest 镂空件（叶卡、枝片、草）与 Demo 树叶不进 AO 法线深度图（树干照常）。?off=gtaoleaf 回旧
const GTAO_LEAF_OFF = (() => { try { return /(?:[?&]off=[^&]*\bgtaoleaf\b)/.test(location.search); } catch { return false; } })();
export const DESKTOP = typeof window !== 'undefined' && !!(window as unknown as { __drfs?: unknown }).__drfs;
// 11-13 桌面版：console.error / warn 前 150 条转写 launch.log（实机问题不用开开发者工具）
if (DESKTOP) { const L = (window as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log; let n = 0;
  if (L) for (const k of ['error', 'warn'] as const) { const o = console[k].bind(console); console[k] = (...a: unknown[]) => { o(...a); if (++n <= 150) { try { L(`${k} ${a.map(x => x instanceof Error ? x.message : typeof x === 'object' ? JSON.stringify(x)?.slice(0, 160) : String(x)).join(' ').slice(0, 380)}`); } catch { /* 循环引用等 */ } } }; }
  window.addEventListener('error', e => L?.(`uncaught ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`)); }
/** 桌面版调试开关（localStorage，Rhett 实测对比用）：darkrock_gtao=0 关环境光遮蔽；darkrock_tonemap=agx 换 AgX 色调映射；darkrock_stats=1 开机就显示帧数 / draw call（F3 切换） */
const dflag = (k: string) => { try { return localStorage.getItem('darkrock_' + k); } catch { return null; } };
// 11-18 opt1118E：秋林逆光后期移植到浏览器版（原来只在桌面版挂）。中 / 高 / 超高走后期链时生效，低档不走后期（不变）。各项单独 ?off= 回旧：
//   wgrade = 调色（饱和 1.22 / 伽马 1.08 / 暗青亮暖 + 纯 ACES 暗角，同桌面 qlgrade/qltone）
const webOff = (k: string) => { try { return new RegExp('(?:[?&]off=[^&]*\\b' + k + '\\b)').test(location.search); } catch { return false; } };
const WEB_GRADE = !DESKTOP && !webOff('wgrade');
//   wrays = 屏幕射线 QlRaysPass（遮罩 + 径向步进，中 36 / 高 56 采样，泛光之前）
const WEB_RAYS = !DESKTOP && !webOff('wrays');
//   wvol  = 阴影贴图体积光 VolLightPass（高 16 步 / 中 8 步；手机中档不开）
const WEB_VOL = !DESKTOP && !webOff('wvol');

// ---------------------------------------------------------------- 卡通着色
let gradient: THREE.DataTexture | null = null;
/** 三档明暗的渐变贴图：暗部 / 中间 / 亮部 */
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
export function toon(color: THREE.ColorRepresentation, opts: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
}
/** 发光材质：泛光会让它亮起来（火、晶石、传送门） */
export function glow(color: THREE.ColorRepresentation, intensity = 2.5, opts: THREE.MeshBasicMaterialParameters = {}) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...opts });
}

// ---------------------------------------------------------------- 画质与渲染管线
/** ultra = 「超高」（唯一的最高档，设置存档键仍是 quality: 'ultra'）：v1.2.42 原名「高质量」（高档 + 更强泛光 + SMAA + 武器流光加强），
 *  v1.2.49 环境高精化并入同一档并改名：阴影 4096 → 6144、高精 PBR 贴图 2K、各向异性 16x。没有单独的第五档；默认 / 自动选档仍是桌面「高」、手机「中」，不会自动进超高 */
export type Quality = 'ultra' | 'high' | 'medium' | 'low';
export const QUALITY_NAME: Record<Quality, string> = { ultra: '超高', high: '高', medium: '中', low: '低' };   // v1.2.49「高质量」改名「超高」（电影档：高精贴图 2K + 各向异性 16x + 6144 阴影）
/** 当前画质（武器流光等通用特效按档调强度） */
export let curQuality: Quality = 'high';
/** 11-16 启动时先按存档设好画质档：scenes.ts 的营地 / 原野在 applySettings 之前就建好，原来建场景时一律按默认「高」判断，低画质简化分支不生效 */
export function presetQuality(q: Quality) { curQuality = q; }

/** fix1107（Rhett 10:20：所有模型都不要描边，旧版 NPC / 旗子等全部去掉）：全局关 OutlineEffect；改回 true 恢复 */
export const OUTLINE_ON = false;
/** 先用描边效果把场景画到缓冲，再接泛光 */
/** 11-16 体积光要读场景深度：记下场景实际画进的那张 RT（它带 depthTexture） */
export let sceneRT: THREE.WebGLRenderTarget | null = null;
class OutlineRenderPass extends Pass {
  constructor(private effect: OutlineEffect, private scene: THREE.Scene, private camera: THREE.Camera) { super(); this.needsSwap = false; }
  render(renderer: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer); sceneRT = readBuffer;
    renderer.clear();
    if (OUTLINE_ON) this.effect.render(this.scene, this.camera); else renderer.render(this.scene, this.camera);
  }
}


// ---------------------------------------------------------------- v0.9.1 调色：暗部偏冷、亮部偏暖、轻微提饱和 + 暗角
export interface GradePreset { shadow: [number, number, number]; high: [number, number, number]; sat: number; contrast: number; vignette: number; }
export const GRADES: Record<string, GradePreset> = {
  camp:  { shadow: [0.78, 0.92, 1.12], high: [1.03, 0.99, 0.92], sat: 1.04, contrast: 1.08, vignette: 0.42 },
  field: { shadow: [0.85, 0.97, 1.08], high: [1.06, 1.02, 0.90], sat: 1.10, contrast: 1.06, vignette: 0.35 },
  mine:  { shadow: [0.96, 0.93, 1.06], high: [1.06, 1.00, 0.92], sat: 1.06, contrast: 1.0, vignette: 0.32 },
  lava:  { shadow: [1.02, 0.92, 0.95], high: [1.06, 0.99, 0.90], sat: 1.06, contrast: 1.02, vignette: 0.35 },
  none:  { shadow: [1, 1, 1], high: [1, 1, 1], sat: 1, contrast: 1, vignette: 0 },
  frost: { shadow: [0.92, 0.97, 1.08], high: [0.99, 1.01, 1.04], sat: 1.02, contrast: 1.02, vignette: 0.32 },
  // 11-16 各图画风（map_look.ts）：按气候各自一套，不套秋色
  star:      { shadow: [0.84, 0.94, 1.12], high: [1.02, 1.01, 0.97], sat: 1.06, contrast: 1.10, vignette: 0.30 },   // 高原晴空：冷影、通透
  foothill:  { shadow: [0.82, 0.95, 1.08], high: [1.04, 1.01, 0.93], sat: 1.05, contrast: 1.07, vignette: 0.36 },   // 山地林
  marsh:     { shadow: [0.80, 0.98, 0.98], high: [1.00, 1.02, 0.92], sat: 0.94, contrast: 0.98, vignette: 0.40 },   // 湿地：青绿影、低反差
  redsand:   { shadow: [0.98, 0.90, 0.92], high: [1.08, 1.00, 0.86], sat: 1.00, contrast: 1.06, vignette: 0.32 },   // 旱地：尘暖、亮部发烫
  coast:     { shadow: [0.80, 0.96, 1.10], high: [1.03, 1.01, 0.95], sat: 1.06, contrast: 1.05, vignette: 0.30 },   // 海风：青影、干净
  mirror:    { shadow: [0.84, 0.92, 1.14], high: [0.97, 1.00, 1.06], sat: 0.96, contrast: 1.04, vignette: 0.42 },   // 冷雾城
  belltower: { shadow: [0.90, 0.94, 1.04], high: [1.01, 1.00, 0.96], sat: 0.92, contrast: 1.03, vignette: 0.40 },   // 阴天钟楼
};
class GradePass extends Pass {
  private quad: FullScreenQuad;
  readonly mat: THREE.ShaderMaterial;
  constructor() {
    super();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, shadowTint: { value: new THREE.Vector3(...GRADES.camp.shadow) }, highTint: { value: new THREE.Vector3(...GRADES.camp.high) }, sat: { value: GRADES.camp.sat }, contrast: { value: GRADES.camp.contrast }, vignette: { value: GRADES.camp.vignette } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 shadowTint; uniform vec3 highTint; uniform float sat; uniform float contrast; uniform float vignette; varying vec2 vUv;
        void main(){
          vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float w = smoothstep(0.05, 0.9, l);
          c *= mix(shadowTint, highTint, w);
          c = mix(vec3(l), c, sat);
          c = mix(c, (c - 0.18) * contrast + 0.18, smoothstep(0.02, 0.18, l));   // 暗部不压：防止洞穴类场景发黑
          vec2 d = vUv - 0.5; float v = 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.8)) * 1.25);
          gl_FragColor = vec4(max(c, 0.0) * v, t.a);
        }`,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// ---------------------------------------------------------------- v0.9.1 边缘光：角色从背景里"跳"出来
export function addRim(mat: THREE.MeshToonMaterial, color: THREE.ColorRepresentation = 0xffd8a8, strength = 0.28) {
  if (mat.userData.rim) return mat;
  mat.userData.rim = true;
  const rc = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = sh => {
    sh.uniforms.rimColor = { value: rc };
    sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  { float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0); totalEmissiveRadiance += rimColor * smoothstep(0.35, 0.8, rimF); }');
  };
  mat.customProgramCacheKey = () => 'rim91';
  return mat;
}

// ---------------------------------------------------------------- v0.9.1g 角色材质精修（不改模型）
// 在三阶 toon 上叠：手绘笔触噪声（打破 KayKit 平涂色块）、金属部位卡通高光 + 边缘磨损亮边、
// 天光/地光半球环境（体积感）、脚部压暗 / 头肩提亮的高度渐变（假 AO）、边缘光
let blobTex: THREE.Texture | null = null;
export function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (!g) { blobTex = new THREE.CanvasTexture(c); return blobTex; }   // 无 2D canvas（jsdom 自动化测试）
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}
export function refineChar(mat: THREE.MeshToonMaterial, height: number, o: { rim?: THREE.ColorRepresentation; rimK?: number; metal?: number; brush?: number; world?: boolean } = {}) {
  if (mat.userData.refined) return mat;
  mat.userData.refined = true; mat.userData.rim = true;
  const rc = new THREE.Color(o.rim ?? 0xffd8a8).multiplyScalar(o.rimK ?? 0.28);
  // v0.9.1i 溶解（死亡消散）与边缘光颜色可在运行时改：uniform 先建好放 userData
  const U = { rimColor: { value: rc }, dissolve: { value: 0 }, dissolveCol: { value: new THREE.Color(0xb070ff) } };
  mat.userData.U = U;
  const prevCompile = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey.bind(mat);   // v0.9.4b 串联已有着色器钩子（GLB 怪物的波浪 / 熔岩纹）
  mat.onBeforeCompile = (sh, rr) => {
    prevCompile.call(mat, sh, rr);
    sh.uniforms.rimColor = U.rimColor; sh.uniforms.dissolve = U.dissolve; sh.uniforms.dissolveCol = U.dissolveCol;
    sh.uniforms.charH = { value: height };
    sh.uniforms.metalK = { value: o.metal ?? 1 };
    sh.uniforms.brushK = { value: o.brush ?? 1 };
    sh.uniforms.worldK = { value: o.world ? 1 : 0 };
    sh.vertexShader = 'uniform float worldK; varying vec3 vWN; varying vec3 vOP; varying float vHY;\n' + sh.vertexShader
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n  vWN = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  { vec4 wp = modelMatrix * vec4(transformed, 1.0); vOP = transformed; vHY = mix(transformed.y, wp.y, worldK); }');
    sh.fragmentShader = 'uniform float dissolve; uniform vec3 dissolveCol; uniform vec3 rimColor; uniform float charH; uniform float metalK; uniform float brushK; varying vec3 vWN; varying vec3 vOP; varying float vHY;\n'
      + 'float rH(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\n'
      + 'float rN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(rH(i), rH(i + vec3(1,0,0)), f.x), mix(rH(i + vec3(0,1,0)), rH(i + vec3(1,1,0)), f.x), f.y), mix(mix(rH(i + vec3(0,0,1)), rH(i + vec3(1,0,1)), f.x), mix(rH(i + vec3(0,1,1)), rH(i + vec3(1,1,1)), f.x), f.y), f.z); }\n'
      + sh.fragmentShader
      // 11-14d 第 7 步三平面（cineTriplanar）先把 map_fragment 整段换掉了 → 这里找不到锚点，metalM 等未声明 → 海岸地板块（fchunk）编译失败。锚点退到紧随其后的 color_fragment
      .replace(sh.fragmentShader.includes('#include <map_fragment>') ? '#include <map_fragment>' : '#include <color_fragment>', `${sh.fragmentShader.includes('#include <map_fragment>') ? '#include <map_fragment>' : '#include <color_fragment>'}
  float metalM = 0.0; float wearN = 0.0; float dEdge = 0.0;
  if (dissolve > 0.0) {   // v0.9.1i 溶解：噪声低于阈值的片元丢弃，阈值边缘发光
    float dn = rN(vOP * 7.0) * 0.65 + rN(vOP * 19.0) * 0.35;
    if (dn < dissolve) discard;
    dEdge = smoothstep(dissolve + 0.09, dissolve, dn);
  }
  {
    vec3 bc = diffuseColor.rgb; float mx = max(bc.r, max(bc.g, bc.b)), mn = min(bc.r, min(bc.g, bc.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    metalM = smoothstep(0.35, 0.55, mx) * smoothstep(0.28, 0.12, sat) * metalK;          // 灰亮色块 = 金属
    metalM = max(metalM, smoothstep(0.55, 0.7, mx) * smoothstep(0.35, 0.6, sat) * step(bc.b, bc.r * 0.7) * 0.7 * metalK);   // 金黄色块 = 黄铜 / 金饰
    // 手绘笔触：沿竖向拉长的两层噪声，±7% 明度起伏
    vec3 sp = vOP * vec3(14.0, 5.0, 14.0);
    float br = rN(sp) * 0.6 + rN(sp * 2.7 + 3.1) * 0.4;
    diffuseColor.rgb *= 1.0 + (br - 0.5) * 0.26 * brushK;
    wearN = rN(vOP * 22.0);
    // 高度渐变：脚下压暗、头肩略亮（假 AO）
    float hy = charH > 0.0 ? clamp(vHY / charH, 0.0, 1.0) : 0.6;
    diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 0.35, hy)) * mix(1.0, 1.05, smoothstep(0.6, 0.95, hy));
  }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // 半球环境：朝上冷暖天光、朝下压暗的地面反光
    float up = vWN.y * 0.5 + 0.5;
    reflectedLight.indirectDiffuse *= mix(vec3(0.62, 0.58, 0.6), vec3(1.0, 1.02, 1.08), up);
    reflectedLight.directDiffuse *= mix(vec3(0.85, 0.82, 0.86), vec3(1.04, 1.0, 0.96), up);   // 受光面偏暖、背光面偏冷
    #if NUM_DIR_LIGHTS > 0
      vec3 Ld = directionalLights[0].direction; vec3 Hh = normalize(Ld + normalize(vViewPosition));
      float spec = pow(max(dot(normal, Hh), 0.0), 14.0);
      float band = smoothstep(0.3, 0.36, spec) * 0.5 + smoothstep(0.7, 0.76, spec) * 0.7;   // 两阶卡通高光
      reflectedLight.directSpecular += directionalLights[0].color * band * metalM * mix(vec3(1.0), diffuseColor.rgb * 1.4, 0.4);
    #endif
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
    totalEmissiveRadiance += rimColor * smoothstep(0.35, 0.8, rimF);
    // 金属边缘磨损：掠射角 + 噪声斑点的亮边
    float edge = smoothstep(0.55, 0.85, 1.0 - abs(dot(normal, normalize(vViewPosition))));
    totalEmissiveRadiance += diffuseColor.rgb * metalM * edge * smoothstep(0.5, 0.7, wearN) * 0.6;
    totalEmissiveRadiance += dissolveCol * dEdge * 3.0;
  }`);
  };
  mat.customProgramCacheKey = () => 'refine91g|' + prevKey();
  return mat;
}

/** v0.9.1i：给程序拼的敌人 / 道具（toon 原件）也套上精修材质；高度渐变关掉（各零件坐标系不同） */
export function refineRig(root: THREE.Object3D, rim?: THREE.ColorRepresentation) {
  root.traverse(o => { const m = (o as THREE.Mesh).material; if (m instanceof THREE.MeshToonMaterial && !m.userData.refined) refineChar(m, 0, { rim, brush: 0.8 }); });
}
/** 溶解进度 0..1（toon 精修材质走 shader 丢弃，发光零件走透明度） */
/** v0.9.1j：场景道具精修——笔触 + 世界高度假 AO（贴地压暗）+ 冷暖半球光；默认不当金属、边缘光很弱 */
export function refineProp<T extends THREE.Object3D>(root: T, h = 2, metal = 0, brush = 1): T {
  root.traverse(o => { const m = (o as THREE.Mesh).material; if (m instanceof THREE.MeshToonMaterial && !m.userData.refined) refineChar(m, h, { metal, brush, world: true, rimK: 0.1 }); });
  return root;
}
export function setDissolve(root: THREE.Object3D, k: number, color: THREE.ColorRepresentation = 0xb070ff) {
  root.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m) return;
    const U = m.userData.U;
    if (U) { U.dissolve.value = k; U.dissolveCol.value.set(color); return; }
    if (m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshToonMaterial) {
      if (m.userData.op0 === undefined) m.userData.op0 = m.opacity;
      if (k > 0 && !m.transparent) { m.transparent = true; m.needsUpdate = true; }
      m.opacity = m.userData.op0 * (1 - k);
    }
  });
}
/** 精英 / 稀有：改边缘光颜色 */
export function setRimColor(root: THREE.Object3D, color: THREE.ColorRepresentation, strength = 0.5) {
  root.traverse(o => { const U = ((o as THREE.Mesh).material as THREE.Material | undefined)?.userData?.U; if (U) U.rimColor.value.set(color).multiplyScalar(strength); });
}

/** 11-14 镜渊城黑块：场景里偶有像素算出 NaN / Inf（单个像素看不出），进泛光后逐级降采样会扩成一整块屏幕矩形，叠回画面就是大片纯黑。
 *  场景渲染完先过一遍：NaN / Inf 用上下左右邻居的平均补上，亮度上限 64（泛光前钳住），之后泛光 / 体积光 / 调色都拿干净的图。
 *  判 NaN 用位运算（D3D 下 isnan 会被编译器优化掉）。 */
function makeSanitizePass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      bool cBad( float x ) { return ( floatBitsToUint( x ) & 0x7f800000u ) == 0x7f800000u; }
      bool cBad3( vec3 c ) { return cBad( c.r ) || cBad( c.g ) || cBad( c.b ); }
      vec3 cTap( vec2 o, inout float n ) { vec3 c = texture2D( tDiffuse, vUv + o / vec2( textureSize( tDiffuse, 0 ) ) ).rgb; if ( cBad3( c ) ) return vec3( 0.0 ); n += 1.0; return min( c, vec3( 64.0 ) ); }
      void main() {
        vec4 c = texture2D( tDiffuse, vUv );
        if ( cBad3( c.rgb ) ) { float n = 0.0; vec3 s = cTap( vec2( 1, 0 ), n ) + cTap( vec2( -1, 0 ), n ) + cTap( vec2( 0, 1 ), n ) + cTap( vec2( 0, -1 ), n ); c.rgb = n > 0.0 ? s / n : vec3( 0.0 ); }
        if ( cBad( c.a ) ) c.a = 1.0;
        gl_FragColor = vec4( min( c.rgb, vec3( 64.0 ) ), c.a );
      }`,
  });
}

export class Pipeline {
  quality: Quality = 'high';
  private outline: OutlineEffect;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private vol: VolLightPass | null = null;
  private nanFix: ShaderPass | null = null;
  private grade = new GradePass();
  private smaa: SMAAPass;
  /** 桌面版超高档：GTAO 环境光遮蔽（多画一遍法线 + 深度，2060 1080p 预计 1–2 ms） */
  private gtao: GTAOPass | null = null;
  /** 桌面版 F3：帧数 / draw call / 三角形 / 贴图数（2060 基准实测用） */
  private stats: HTMLDivElement | null = null; private statT = 0; private statN = 0; private fps = 0;
  // 11-13 桌面画质（fxd.ts）：天空 PMREM、体积光、ACES/AgX 混合 + 颗粒、PCSS、动态分辨率
  private gradeName = 'camp'; private skyEnv: SkyEnv | null = null; private rays: GodRaysPass | null = null; private qlRays: QlRaysPass | null = null; private outU: ReturnType<typeof patchOutput> | null = null;
  /** 动态分辨率：渲染像素比 = 基准 × dyn（0.6–1）；按帧时自动调，保持约 50 帧 */
  private dyn = 1; private dynAcc = 0; private dynN = 0; private dynHold = 0; private lastT = 0; private basePr = 1;
  setSky(sky: THREE.Mesh) { if (DESKTOP && dflag('skyenv') !== '0') { this.skyEnv = new SkyEnv(this.renderer, this.scene, sky); this.skyEnv.enabled = this.quality === 'high' || this.quality === 'ultra'; } }
  setGrade(name: string) { this.gradeName = name; const g = GRADES[name] ?? GRADES.camp; const u = this.grade.mat.uniforms; u.shadowTint.value.set(...g.shadow); u.highTint.value.set(...g.high); u.sat.value = g.sat; u.contrast.value = g.contrast; u.vignette.value = Math.max(g.vignette, this.selVig); }
  /** Rhett 11-18 选角暗角（?off=seldof 关）：3D 选角期间暗角至少 k，离开传 0 还原 */
  private selVig = 0;
  setSelVignette(k: number) { if (k === this.selVig) return; this.selVig = k; this.setGrade(this.gradeName); }
  /** 11-16 各图画风：体积光强度 / 秋林调色强度（map_look.ts） */
  setLook(l: { vol: number; ql: number }) { if (this.vol) this.vol.k = l.vol; this.qlK = l.ql; }
  private qlK = 1; private expBase = 1.05; private qlBloom: QlBloomPass | null = null;
  /** mobile：手机/平板 → 像素比上限 1.5（低画质 1.0）、阴影贴图减半、泛光半分辨率、描边变细 */
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private sun: THREE.DirectionalLight, readonly mobile = false) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.outline = new OutlineEffect(renderer, { defaultThickness: mobile ? 0.0034 : 0.0042, defaultColor: [0.05, 0.04, 0.06], defaultAlpha: 0.9 });
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new OutlineRenderPass(this.outline, scene, camera));
    if (DESKTOP && dflag('gtao') !== '0') {
      this.gtao = new GTAOPass(scene, camera, 256, 256);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      this.gtao.blendIntensity = 0.85; this.gtao.enabled = false; this.composer.addPass(this.gtao);
      // GTAO 自己会再画一遍场景（法线 + 深度），three 每次 render 都会重画阴影贴图 → 实测 draw 409→1075、三角 0.42M→1.57M；这里让它复用本帧阴影
      const g = this.gtao, orig = g.render.bind(g);
      // 透明 / 不写深度的东西（地面光圈、技能特效、水面、粒子精灵）不进 AO 的法线深度图，否则光圈下会糊出一块黑影（11-11 自检截图）
      const gx = g as unknown as { _visibilityCache: Map<THREE.Object3D, boolean>; overrideVisibility(): void };
      gx.overrideVisibility = () => { const c = gx._visibilityCache; scene.traverse(o => { c.set(o, o.visible);
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined, ms = m ? (Array.isArray(m) ? m : [m]) : [];
        if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || ms.some(x => x.transparent || !x.depthWrite || x.blending === THREE.AdditiveBlending || (!GTAO_LEAF_OFF && (x.alphaTest > 0 || (x.userData?.demoTree && x.userData.demoTree !== 'trunk'))))) o.visible = false; }); };
      g.render = (...a: Parameters<GTAOPass['render']>) => { const sm = renderer.shadowMap; const au = sm.autoUpdate; sm.autoUpdate = false; try { orig(...a); } finally { sm.autoUpdate = au; } };
    }
    if (dflag('nanfix') !== '0') { this.nanFix = makeSanitizePass(); this.composer.addPass(this.nanFix); }
    // 11-16 秋林逆光移植第 1 步：阴影贴图体积光（高 16 步 / 中 8 步），在泛光之前（线性 HDR）
    if (((DESKTOP && dflag('vol') !== '0') || WEB_VOL) && CINE.on[17]) {
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (!rt.depthTexture) { rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height, THREE.UnsignedIntType); rt.depthBuffer = true; }
      this.vol = new VolLightPass(camera, sun, this.composer.renderTarget1.depthTexture!, 16, () => sceneRT?.depthTexture ?? null); this.composer.addPass(this.vol);
    }
    // 11-17g 秋林射线（专长包 v8：遮罩 + 径向步进，高 56 / 中 36 / 低 24 采样，泛光之前）；?off=qlrays 回旧 GodRaysPass（泛光之后、仅高档以上）
    if (WEB_RAYS && CINE.on[20]) for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (!rt.depthTexture) { rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height, THREE.UnsignedIntType); rt.depthBuffer = true; }   // 射线遮罩要天空深度
    if (((DESKTOP && dflag('rays') !== '0') || WEB_RAYS) && CINE.on[20]) { this.qlRays = new QlRaysPass(camera, sun, () => sceneRT?.depthTexture ?? null, this.quality, () => sceneRT?.texture ?? null); this.composer.addPass(this.qlRays); }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.65, 0.5, 1.05);
    this.composer.addPass(this.bloom);
    // 11-18 秋林移植：户外秋林调色开着时用 Demo 泛光（0.07 软阈值）替换 UnrealBloom；?off=qlbloom 回旧
    if (DESKTOP && !/(?:[?&]off=[^&]*\bqlbloom\b)/.test(location.search)) { this.qlBloom = new QlBloomPass(); this.qlBloom.enabled = false; this.composer.addPass(this.qlBloom); }
    if (DESKTOP && dflag('rays') !== '0' && !CINE.on[20]) { this.rays = new GodRaysPass(camera, sun); this.composer.addPass(this.rays); }
    this.composer.addPass(this.grade);
    const op = new OutputPass(); this.composer.addPass(op);
    if ((DESKTOP && dflag('grain') !== '0') || WEB_GRADE) this.outU = patchOutput((op as unknown as { material: THREE.RawShaderMaterial }).material);
    if ((DESKTOP && dflag('pcss') !== '0') || (CINE.on[27] && !mobile)) installPCSS();   // 11-19 qlpcss：浏览器版（非手机）也装，Demo 户外区才用
    this.smaa = new SMAAPass(256, 256); this.smaa.enabled = false; this.composer.addPass(this.smaa);   // v1.2.42 高质量档才开（输出后做，sRGB 空间边缘检测）
    if (DESKTOP) {
      if (dflag('tonemap') === 'agx') renderer.toneMapping = THREE.AgXToneMapping;
      window.addEventListener('keydown', e => { if (e.key === 'F3') { e.preventDefault(); this.toggleStats(); } else if (e.key === 'F4') { e.preventDefault(); this.drawBreakdown(); } });
      if (dflag('stats') === '1') this.toggleStats();
    }
  }
  /** 11-13 I15：F4 = 当前画面 draw call / 三角面按场景顶层分组统计（视锥内可见网格；InstancedMesh 记 1 次），前 12 组显示在左上并写进 launch.log，定减面 / 合批先做哪块 */
  drawBreakdown() {
    const cam = this.camera; cam.updateMatrixWorld(); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const g = new Map<string, { d: number; t: number; sh: number }>(), sp = new THREE.Sphere();
    const keyOf = (o: THREE.Object3D) => { let a = o; while (a.parent && a.parent !== this.scene) a = a.parent; const c = a.name || a.type; let b = o; while (b.parent && b.parent !== a) b = b.parent; return b !== a && b.name ? `${c}/${b.name}` : c; };
    this.scene.traverseVisible(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.geometry) return;
      if (m.frustumCulled !== false) { const gg = m.geometry; if (!gg.boundingSphere) gg.computeBoundingSphere(); if (gg.boundingSphere) { sp.copy(gg.boundingSphere).applyMatrix4(m.matrixWorld); if (!(m as THREE.InstancedMesh).isInstancedMesh && !fr.intersectsSphere(sp)) return; } }
      const ix = m.geometry.index, n = (ix ? ix.count : (m.geometry.attributes.position?.count ?? 0)) / 3, inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
      const mats = Array.isArray(m.material) ? m.material.length : 1, k = keyOf(o), e = g.get(k) ?? { d: 0, t: 0, sh: 0 };
      e.d += mats; e.t += n * inst; if (m.castShadow) e.sh += mats; g.set(k, e);
    });
    const rows = [...g.entries()].sort((a, b) => b[1].d - a[1].d), tot = rows.reduce((a, [, e]) => ({ d: a.d + e.d, t: a.t + e.t, sh: a.sh + e.sh }), { d: 0, t: 0, sh: 0 });
    const lines = [`F4 可见 draw ${tot.d}（投影 ${tot.sh}）tri ${(tot.t / 1e6).toFixed(2)}M  组 ${rows.length}`, ...rows.slice(0, 12).map(([k, e]) => `${k.slice(0, 34)}  d${e.d} sh${e.sh} ${(e.t / 1e3).toFixed(0)}k`)];
    const drfs = (window as unknown as { __drfs?: { mark(s: string): void } }).__drfs; for (const l of lines) drfs?.mark(l);
    console.log(lines.join('\n'));
    document.getElementById('f4-draws')?.remove(); const box = document.createElement('pre'); box.id = 'f4-draws';
    box.style.cssText = 'position:fixed;left:6px;top:64px;z-index:99999;margin:0;padding:4px 8px;font:11px/1.35 monospace;color:#fe9;background:rgba(0,0,0,.6);pointer-events:none'; box.textContent = lines.join('\n');
    document.body.appendChild(box); setTimeout(() => box.remove(), 20000);
  }
  toggleStats() {
    if (this.stats) { this.stats.remove(); this.stats = null; this.renderer.info.autoReset = true; return; }
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;padding:4px 8px;font:12px/1.4 monospace;color:#cfe;background:rgba(0,0,0,.6);pointer-events:none;white-space:pre';
    document.body.appendChild(d); this.stats = d; this.renderer.info.autoReset = false; this.statT = performance.now(); this.statN = 0;
  }
  private statTick() {
    const i = this.renderer.info, now = performance.now(); this.statN++;
    if (now - this.statT >= 500) { this.fps = this.statN * 1000 / (now - this.statT); this.statT = now; this.statN = 0;
      const gl = this.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info'), gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      this.stats!.textContent = `${this.fps.toFixed(0)} fps  ${QUALITY_NAME[this.quality]}  ${this.renderer.domElement.width}×${this.renderer.domElement.height}\ndraw ${i.render.calls}  tri ${(i.render.triangles / 1e6).toFixed(2)}M  tex ${i.memory.textures}  geo ${i.memory.geometries}${this.gtao?.enabled ? '  GTAO' : ''}${this.smaa.enabled ? '  SMAA' : ''}${this.dyn < 0.999 ? '  dyn ' + (this.dyn * 100).toFixed(0) + '%' : ''}${this.sun.shadow.radius >= 3 ? '  PCSS' : ''}\n${gpu.slice(0, 60)}`; }
  }
  // 11-19 秋林 Demo 光照链路·阴影 qlpcss：Demo 户外区（setDemoShadow）中 / 高 / 超高档改用 Demo PCSS 原式（fxd dmPCSS，过滤 中 8 / 高 16 点；radius = 10 + 点数）；
  //   低档无阴影不变；手机不开；室内 / 副本 / 钟井仍走原 drPCSS / PCF。阴影框 ±48、far 320、bias −5e-4 / normalBias 0.06、贴图 2048 已与 Demo 相同（11-17g）。?off=qlpcss 回旧
  private demoSh = false;
  setDemoShadow(on: boolean) { if (on === this.demoSh) return; this.demoSh = on; this.sun.shadow.radius = this.shadowRadius(this.quality); }
  private shadowRadius(q: Quality) {
    const u = q === 'ultra';
    if (this.demoSh && CINE.on[27] && CINE.on[2] && q !== 'low' && (DESKTOP || !this.mobile)) return 10 + (q === 'medium' ? 8 : 16);
    return DESKTOP && dflag('pcss') !== '0' && CINE.on[2] ? (u ? 5 : q === 'high' ? 4 : q === 'medium' ? 3 : 1) : DESKTOP && u && dflag('pcss') !== '0' ? 4 : 1;
  }
  setQuality(q: Quality) {
    this.quality = q; curQuality = q;
    const u = q === 'ultra';   // v1.2.42 高质量：泛光更亮更开、阈值更低（发光部位真正晕开），SMAA，曝光略提
    this.bloom.strength = u ? 0.9 : q === 'medium' ? 0.5 : 0.65; this.bloom.radius = u ? 0.62 : 0.5; this.bloom.threshold = u ? 0.9 : 1.05;
    this.smaa.enabled = u || (DESKTOP && q === 'high'); this.expBase = u ? 1.1 : 1.05; this.renderer.toneMappingExposure = this.expBase;   // 桌面版：高档也开 SMAA（2060 起步，代价 <1 ms）
    if (this.gtao) this.gtao.enabled = u;
    if (this.vol) { this.vol.enabled = u || q === 'high' || (CINE.on[20] && q === 'medium' && (DESKTOP || !this.mobile)); if (CINE.on[20]) this.vol.setSteps(q === 'medium' ? 8 : 16); }   // 11-17g 专长包档位表：中档也开体积光 8 步（?off=qlrays 回只高档）   // 11-16 体积光：高 / 超高
    // 11-14 电影感第 2 步：PCSS 软阴影下放——超高 20 采样、高 12、中 8（radius ≥ 3 = PCSS，数值即档位，见 fxd.ts）；低档无阴影
    this.sun.shadow.radius = this.shadowRadius(q);
    if (this.skyEnv) this.skyEnv.enabled = CINE.on[1] || u || q === 'high';   // 11-14 电影感第 1 步：天空烘成的环境光只在天色变时重烘（≈0 开销），四档都开
    if (this.qlRays) this.qlRays.setQuality(q);   // 11-17g 各档都开，采样按档
    if (this.rays) { this.rays.enabled = u || q === 'high'; this.rays.strength = u ? 0.55 : 0.4; }
    this.dyn = 1;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const sm = (q === 'ultra' ? 6144 : q === 'high' || (q === 'medium' && QL_DEMO.sun) ? 2048 : 1024) / (this.mobile ? 2 : 1);   // 11-17g Demo 档位表：中档阴影 2048   // v1.2.49 超高 4096 → 6144
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.map?.dispose(); (this.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    flameDevelopTier(this.prewarmTarget() !== null);   // 11-18 A5 火焰保色压缩：走后期 / 直接画屏幕两组参数
    this.resize();
    void envHdSetTier(envTierFor(q), this.renderer);   // v1.2.49 环境高精化：高 / 超高加载 PBR 贴图并升级山体 / 石头 / 建筑（base 包无贴图 → 不动）
  }
  resize() {
    const fx = (window as unknown as { __recSize?: number[] }).__recSize;   // v1.2.38c 录制模式：固定 1920×1080 画布
    if (fx) {
      this.renderer.setPixelRatio(1); this.renderer.setSize(fx[0], fx[1], false);
      this.composer.setPixelRatio(1); this.composer.setSize(fx[0], fx[1]);
      this.gtao?.setSize(fx[0], fx[1]);
      this.camera.aspect = fx[0] / fx[1]; this.camera.updateProjectionMatrix();
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const cap = this.mobile ? (this.quality === 'low' ? 1 : 1.5) : (this.quality === 'ultra' ? 2 : this.quality === 'high' || this.quality === 'medium' ? 1.5 : 1);   // 11-16 秋林逆光：高档像素比上限 1.5（2K/4K 屏省约 44% 像素）
    this.basePr = Math.min(window.devicePixelRatio || 1, cap);
    const pr = this.basePr * this.dyn;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    { const st = this.renderer.domElement.style; st.width = w + 'px'; st.height = h + 'px'; }   // I01/忽大忽小：画布 CSS 尺寸钉死在窗口，不随像素比（DPR 缩放、动态分辨率）变
    this.composer.setPixelRatio(this.mobile ? Math.min(pr, 1) : pr);   // 手机：泛光管线按 1 倍像素算
    this.composer.setSize(w, h);
    if (this.gtao) { const k = this.mobile ? Math.min(pr, 1) : pr; this.gtao.setSize(Math.round(w * k), Math.round(h * k)); }
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  /** 动态分辨率：每 1 秒看平均帧时；低于 45 帧降 10%（最低 0.6），高于 57 帧回升 5%；改动后冷却 2 秒 */
  private dynTick(dt: number) {
    // 11-14 电影感：四档都开；每 1.5 秒量一次帧数，<45 降 10%（最低 55%）、>58 回升 5%，两次调整至少隔 2.5 秒——先降像素、不砍效果
    if (!DESKTOP || dflag('dynres') === '0' || (window as unknown as { __recSize?: number[] }).__recSize) return;
    if (dt > 0.25) return;   // 切图 / 卡顿尖峰不算
    this.dynAcc += dt; this.dynN++; this.dynHold -= dt;
    if (this.dynAcc < 1.5) return;
    const fps = this.dynN / this.dynAcc; this.dynAcc = 0; this.dynN = 0;
    if (this.dynHold > 0) return;
    let k = this.dyn;
    // 11-14 Rhett「副本里最高画质也糊」：高 / 超高最低只降到 80%（原 55% 在副本特效多时直接糊），中 70%、低 60%；<40 帧才降
    const floor = this.quality === 'ultra' || this.quality === 'high' ? 0.8 : this.quality === 'medium' ? 0.7 : 0.6;
    if (fps < 45) k = Math.max(floor, k - 0.1); else if (fps > 58 && k < 1) k = Math.min(1, k + 0.05);   // 11-16 Rhett 同意：<45 降、>58 升（保底 80/70/60% 不变）
    if (Math.abs(k - this.dyn) > 0.01) { this.dyn = k; this.dynHold = 2.5; this.resize(); }
  }
  get dynScale() { return this.dyn; }
  /** 11-14 切区域：动态分辨率回到 100% 重新测（切图时的卡顿不该把新区域一直压在低分辨率），并把场景贴图的各向异性补到画质档位 */
  zoneReset(root: THREE.Object3D) {
    this.dynAcc = 0; this.dynN = 0; this.dynHold = 3; if (this.dyn !== 1) { this.dyn = 1; this.resize(); }
    const want = Math.min(this.quality === 'ultra' ? 16 : this.quality === 'high' ? 8 : this.quality === 'medium' ? 4 : 1, this.renderer.capabilities.getMaxAnisotropy());
    if (want <= 1) return;
    root.traverse(o => { const mm = (o as THREE.Mesh).material; if (!mm) return; for (const m of (Array.isArray(mm) ? mm : [mm]) as unknown as Record<string, unknown>[])
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) { const t = m[k] as THREE.Texture | null | undefined; if (t?.isTexture && t.anisotropy < want && t.image && !(t as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) { t.anisotropy = want; t.needsUpdate = true; } } });
  }
  render() {
    const now = performance.now(), dt = this.lastT ? (now - this.lastT) / 1000 : 0.016; this.lastT = now;
    this.dynTick(dt);
    const outdoor = this.gradeName !== 'mine' && this.gradeName !== 'lava';
    this.skyEnv?.tick(dt, this.gradeName);
    if (this.rays?.enabled) { const c = this.renderer.domElement; this.rays.update(outdoor, c.width, c.height); }
    this.qlRays?.update(outdoor);
    if (this.qlBloom) { const on = outdoor && this.qlK > 0 && QL_DEMO.grade && !!CINE.on[18]; this.qlBloom.enabled = on; this.bloom.enabled = !on; }
    if (QL_DEMO.grade && CINE.on[18]) this.renderer.toneMappingExposure = outdoor && this.qlK > 0 ? 1.35 * 0.6 : this.expBase;   // 11-17g Demo 曝光 1.35（Hill ACES 口径）= three ACESFilmic 的 0.81（three 内含 ÷0.6）；室内不变
    if (this.outU && !DESKTOP) { const o = this.outU, ql = CINE.on[18] ? this.qlK : 0; o.uTime.value = (now / 1000) % 1000; o.uAgx.value = 0;   // 浏览器版：保持纯 ACES（不混 AgX），只加秋林调色 / 暗角
      o.uQl.value = WEB_GRADE ? ql : 0; o.uQlTone.value = WEB_GRADE && outdoor && !QL_TONE_OFF ? ql : 0; o.uGrain.value = 0; }
    else if (this.outU) { this.outU.uTime.value = (now / 1000) % 1000; this.outU.uQl.value = CINE.on[18] ? this.qlK : 0; this.outU.uQlTone.value = CINE.on[18] && outdoor && !QL_TONE_OFF ? this.qlK : 0; this.outU.uGrain.value = CINE.on[18] ? 0.018 : this.quality === 'ultra' ? 0.035 : 0.025; }   // 11-16 秋林逆光：颗粒降到 Demo 同等（标准差 ≈0.005，原来约 3 倍）
    const diag = DESKTOP && this.diagDue(dt);
    if (this.stats || diag) { this.renderer.info.autoReset = false; this.renderer.info.reset(); }
    this.render0();
    if (this.stats) this.statTick();
    if (diag) this.diagLog();
    if (diag && !this.stats) this.renderer.info.autoReset = true;
  }
  /** 11-13 桌面版自动诊断：前 5 分钟每 10 秒、之后每 60 秒往 launch.log 记一行帧数 / draw / 三角面 / 分辨率 / 动态分辨率（不用 Rhett 手抄 F3） */
  private diagT = 0; private diagAll = 0; private diagF = 0; private diagS = 0;
  private diagDue(dt: number) { this.diagAll += dt; this.diagT += dt; this.diagF++; this.diagS += dt; const iv = this.diagAll < 300 ? 10 : 60; if (this.diagT < iv) return false; this.diagT = 0; return true; }
  private diagLog() {
    const i = this.renderer.info, c = this.renderer.domElement, fps = this.diagF / Math.max(1e-3, this.diagS); this.diagF = 0; this.diagS = 0;
    const L = (window as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log;
    L?.(`stat t=${this.diagAll.toFixed(0)}s fps=${fps.toFixed(1)} q=${this.quality} draw=${i.render.calls} tri=${(i.render.triangles / 1e6).toFixed(2)}M res=${c.width}x${c.height} css=${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio} dyn=${(this.dyn * 100).toFixed(0)}% tex=${i.memory.textures} geo=${i.memory.geometries} grade=${this.gradeName}${camDiag()}`);
  }
  /** 11-18 永霜墓穴首领倒下卡顿：预编译要按真实渲染去向算程序 key——走后期（composer）时场景画进离屏渲染目标，
   *  three 会按「输出线性色彩空间 + 不做色调映射」编程序；直接 renderer.compile（当前目标为屏幕）编出来的是 sRGB + ACES 版，实际用不上。
   *  这里返回与 render0 同一判断下的离屏目标（直接画屏幕时为 null），给 prewarm 编译前临时设上。 */
  prewarmTarget(): THREE.WebGLRenderTarget | null {
    if (this.quality === 'high' || this.quality === 'ultra' || (this.quality === 'medium' && CINE.on[4])) return this.composer.readBuffer;
    return null;
  }
  private render0() {
    if (this.quality === 'high' || this.quality === 'ultra' || (this.quality === 'medium' && CINE.on[4])) this.composer.render();   // 11-14 第 4 步：中档走轻量后期（描边 + 泛光 + 调色 + 输出；不开 AO / 体积光 / SMAA）
    else if (this.quality === 'medium' && OUTLINE_ON) this.outline.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------- 天空（渐变球）
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d7fd6) }, mid: { value: new THREE.Color(0xa9d4f5) }, bottom: { value: new THREE.Color(0xf3e2c0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- 粒子
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

export interface EmitOpts {
  count: number; color: THREE.ColorRepresentation; color2?: THREE.ColorRepresentation;
  speed?: number; spread?: number; up?: number; life?: number; size?: number; gravity?: number; radius?: number; drag?: number;
}

/** 一个 Points 对象跑全部粒子（加法混合），每帧更新缓冲 */
// v0.9.3a 地形起伏：特效 / 粒子的「离地高度」统一加上脚下地面高度（字面量坐标 = 相对地面；Vector3 = 已是绝对坐标）
let groundFn: (x: number, z: number) => number = () => 0;
export function setGroundFn(f: (x: number, z: number) => number) { groundFn = f; }
export function gy(x: number, z: number) { return groundFn(x, z); }
export function lift(v: { x: number; z: number }, h: number) { return new THREE.Vector3(v.x, groundFn(v.x, v.z) + h, v.z); }
export function gyRel(p: { x: number; y: number; z: number }) { return (p as THREE.Vector3).isVector3 ? 0 : groundFn(p.x, p.z); }
export class Particles {
  readonly points: THREE.Points;
  private max: number;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;
  private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array; private size0: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private cursor = 0;
  constructor(max = 2500) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size0 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { map: { value: softDot() }, scale: { value: window.innerHeight / 2 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * 1.6, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(p: { x: number; y: number; z: number }, o: EmitOpts) {
    const by = gyRel(p);
    const c1 = new THREE.Color(o.color), c2 = new THREE.Color(o.color2 ?? o.color), tmp = new THREE.Color();
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2, r = (o.radius ?? 0) * Math.sqrt(Math.random());
      this.pos[i * 3] = p.x + Math.cos(a) * r; this.pos[i * 3 + 1] = p.y + by; this.pos[i * 3 + 2] = p.z + Math.sin(a) * r;
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8), sa = Math.random() * Math.PI * 2, spread = o.spread ?? 1;
      this.vel[i * 3] = Math.cos(sa) * sp * spread; this.vel[i * 3 + 2] = Math.sin(sa) * sp * spread;
      this.vel[i * 3 + 1] = (o.up ?? 1) * sp * (0.5 + Math.random() * 0.8);
      tmp.copy(c1).lerp(c2, Math.random());
      this.col[i * 3] = tmp.r; this.col[i * 3 + 1] = tmp.g; this.col[i * 3 + 2] = tmp.b;
      this.maxLife[i] = this.life[i] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.8);
      this.size0[i] = (o.size ?? 0.35) * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 1.5;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, k * 2.2);
      this.size[i] = this.size0[i] * (0.4 + k * 0.6);
    }
    const g = this.points.geometry;
    (['position', 'color', 'size', 'alpha'] as const).forEach(n => { g.getAttribute(n).needsUpdate = true; });
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = window.innerHeight / 2;
  }
}

// ---------------------------------------------------------------- Boss 红圈着色器：边缘亮环 + 由内向外填充 + 波纹
export function telegraphMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { progress: { value: 0 }, time: { value: 0 }, color: { value: new THREE.Color(1.0, 0.15, 0.1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // 阶段三：外圈深色描边（亮地面上也看得清）+ 填充前沿亮线（色弱也能看出还剩多久）+ 外圈倒计时弧
    fragmentShader: `uniform float progress; uniform float time; uniform vec3 color; varying vec2 vUv;
      void main(){
        vec2 d = vUv - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float outline = smoothstep(0.93, 0.955, r);
        float edge = smoothstep(0.86, 0.92, r) * (1.0 - smoothstep(0.92, 0.95, r));
        float fill = step(r, progress) * 0.38;
        float front = smoothstep(0.035, 0.0, abs(r - progress)) * step(0.02, progress);
        float wave = 0.12 * smoothstep(0.0, 0.05, 0.05 - abs(fract(r * 3.0 - time * 1.5) - 0.5) * 0.1);
        float ang = atan(d.x, d.y) / 6.28318 + 0.5;
        float timer = step(ang, 1.0 - progress) * smoothstep(0.80, 0.83, r) * (1.0 - smoothstep(0.85, 0.87, r));
        // v0.9.1：填充区里的地裂纹 + 外圈符文刻度，红圈更有"要落下来了"的分量
        float cr = abs(fract(atan(d.x, d.y) * 1.909 + sin(r * 9.0) * 0.35) - 0.5);
        float crack = smoothstep(0.035, 0.0, cr) * step(r, progress) * smoothstep(0.1, 0.3, r) * (0.6 + 0.4 * sin(time * 8.0));
        float tick = step(0.82, fract(ang * 36.0)) * smoothstep(0.955, 0.965, r) * (1.0 - smoothstep(0.985, 0.995, r));
        vec3 c = color * (1.0 + edge * 1.5 + crack * 2.5) + vec3(1.0, 0.95, 0.8) * (front * 1.6 + timer * 0.9 + crack * 0.6);
        c = mix(c, vec3(0.04, 0.0, 0.0), outline);
        float a = 0.16 + fill + edge * 1.2 + wave + front * 0.8 + timer * 0.6 + outline * 0.85 + crack * 0.7;
        c = mix(c, vec3(1.0, 0.75, 0.55), tick); a += tick * 0.6;
        gl_FragColor = vec4(c, min(a, 1.0));
      }`,
  });
}

/** 刀光：沿弧线淡出的带子 */
export function makeSlashArc(color: THREE.ColorRepresentation, radius = 1.4, arc = Math.PI * 0.9) {
  const g = new THREE.RingGeometry(radius * 0.55, radius, 24, 1, -arc / 2, arc);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const posA = g.getAttribute('position') as THREE.BufferAttribute;
  const alpha = new Float32Array(posA.count);
  for (let i = 0; i < posA.count; i++) {
    const ang = Math.atan2(posA.getY(i), posA.getX(i));
    alpha[i] = 1 - (ang + arc / 2) / arc;
  }
  g.setAttribute('a', new THREE.BufferAttribute(alpha, 1));
  void uv;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { color: { value: new THREE.Color(color).multiplyScalar(2) }, fade: { value: 1 } },
    vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float fade; varying float vA; void main(){ gl_FragColor = vec4(color, pow(vA, 1.5) * fade); }',
  });
  return new THREE.Mesh(g, mat);
}

/** 闪电：锯齿折线 */
export function makeLightning(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation = 0xbfe6ff) {
  const pts: THREE.Vector3[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const p = from.clone().lerp(to, i / n);
    if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
    pts.push(p);
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, toneMapped: false }));
}

// ================================================================ v0.9.1d 环境：传送门漩涡、地面符文盘、熔岩、晶石光晕
/** 所有环境着色器共享的时间（主循环每帧写一次） */
export const ENV_T = { value: 0 };

/**
 * 传送门漩涡面：向内卷的螺旋 + 噪声云 + 亮边缘 + 中心深洞
 * rift = true：深渊裂隙（竖向撕裂的边缘、暗紫核心）
 */
export function portalMaterial(color: THREE.ColorRepresentation, rift = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) }, rift: { value: rift ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float rift; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ return n(p) * 0.55 + n(p * 2.1 + 3.1) * 0.3 + n(p * 4.3 + 7.7) * 0.15; }
      void main(){
        vec2 d = (vUv - 0.5) * 2.0;
        // 裂隙：横向压窄 + 边缘被噪声撕开
        vec2 q = rift > 0.5 ? vec2(d.x * 1.9, d.y) : d;
        float r = length(q), a = atan(q.y, q.x);
        float edgeN = rift > 0.5 ? 0.18 * (fbm(vec2(a * 2.0, time * 0.6)) - 0.5) + 0.06 * sin(d.y * 14.0 + time * 3.0) : 0.03 * sin(a * 7.0 + time * 2.0);
        float R = 0.97 + edgeN;
        if (r > R) discard;
        float sw = a + 3.2 / (r + 0.25) - time * 1.6;             // 螺旋坐标
        float cloud = fbm(vec2(sw * 1.3, r * 3.0 - time * 0.8));
        float arms = 0.5 + 0.5 * sin(sw * 3.0 + cloud * 3.0);
        float core = smoothstep(0.38, 0.0, r);                        // 中心深洞
        float rim = smoothstep(R - 0.16, R - 0.01, r);
        vec3 deep = color * 0.12;
        vec3 c = mix(deep, color * (0.7 + cloud), arms * smoothstep(0.1, 0.6, r));
        c += vec3(1.0, 0.95, 0.9) * pow(arms * cloud, 3.0) * 0.8;
        c = mix(c, color * 0.03, core * 0.85);
        c += mix(color, vec3(1.0), 0.35) * rim * 2.2;
        float alpha = mix(0.82, 1.0, rim) * smoothstep(R, R - 0.02, r);
        gl_FragColor = vec4(c, alpha);
      }`,
  });
}

/** 地面符文盘（传送门底座）：缓慢旋转的双环刻文，常亮 */
export function runePlateMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
      float ring(float r, float c, float w){ return smoothstep(w, 0.0, abs(r - c)); }
      void main(){
        vec2 d = vUv - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float a = atan(d.y, d.x);
        float a1 = a + time * 0.25, a2 = a - time * 0.4;
        float rings = ring(r, 0.96, 0.02) + ring(r, 0.84, 0.012) + ring(r, 0.62, 0.012);
        float glyph = step(0.5, fract(a1 * 16.0 / 6.2832)) * step(0.25, fract(a1 * 48.0 / 6.2832)) * step(0.86, r) * step(r, 0.94);
        float spokes = smoothstep(0.03, 0.0, abs(fract(a2 * 8.0 / 6.2832) - 0.5) - 0.47) * step(0.62, r) * step(r, 0.84) * 0.6;
        float pulse = 0.75 + 0.25 * sin(time * 2.0 - r * 6.0);
        float glow = smoothstep(1.0, 0.3, r) * 0.18;
        gl_FragColor = vec4(color * 2.0, min(1.0, (rings * 1.3 + glyph + spokes + glow * 2.0) * pulse));
      }`,
  });
}

/** 熔岩 / 冰海面：流动的明亮裂缝 + 暗色硬壳块（frost 时变成冷色冰面） */
export function lavaMaterial(color: THREE.ColorRepresentation, frost = false) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) }, frost: { value: frost ? 1 : 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float frost; varying vec3 vW;
      vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // Voronoi：返回到最近边界的距离（裂缝）
      float vor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 o = h2(i + g); o = 0.5 + 0.4 * sin(time * 0.4 + 6.2831 * o); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return d2 - d1; }
      void main(){
        vec2 p = vW.xz * 0.16 + vec2(time * 0.03, time * 0.05);
        float e = vor(p), e2 = vor(p * 2.3 + 5.0);
        float crack = smoothstep(0.16, 0.0, e) + smoothstep(0.08, 0.0, e2) * 0.5;
        float heat = 0.6 + 0.4 * sin(time * 1.2 + vW.x * 0.3 + vW.z * 0.2);
        vec3 crust = frost > 0.5 ? color * 0.55 + vec3(0.05, 0.08, 0.12) : vec3(0.09, 0.04, 0.03);
        vec3 hot = frost > 0.5 ? mix(color, vec3(0.85, 0.95, 1.0), 0.5) * 1.3 : mix(color * 1.6, vec3(1.6, 1.25, 0.6), smoothstep(0.6, 1.2, crack));
        vec3 c = mix(crust, hot * heat, clamp(crack, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** 柔光晕（贴地或竖直的加法圆盘）：晶石、灯火周围的光池 */
export function haloMaterial(color: THREE.ColorRepresentation, strength = 0.7) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) }, k: { value: strength }, ph: { value: Math.random() * 6.28 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float k; uniform float ph; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 2.2) * k * (0.85 + 0.15 * sin(time * 1.7 + ph)); gl_FragColor = vec4(color, a); }`,
  });
}

/** 光柱（开口圆柱）：底部亮、向上渐隐，竖向流动的光丝 */
/** v0.9.1g 暗金：黑色烟焰柱（正常混合，压暗背景，向上翻涌） */
export function darkFlameMaterial(color: THREE.ColorRepresentation = 0x0a0310, k = 1.15) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) }, k: { value: k } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float k; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x * 8.0, vUv.y * 3.0 - time * 0.9);
        float t = n(p) * 0.6 + n(p * 2.3 + 4.0) * 0.4;
        float fall = pow(1.0 - vUv.y, 1.4);
        float a = k * fall * smoothstep(0.25, 0.75, t + fall * 0.35);
        vec3 c = mix(color, vec3(0.55, 0.36, 0.08), smoothstep(0.62, 0.7, t) * fall * 0.6);   // 烟焰边缘一丝暗金
        gl_FragColor = vec4(c, a);
      }`,
  });
}
/** v0.9.1g 暗金：缠绕上升的两股金色螺旋纹（加法） */
export function helixMaterial(color: THREE.ColorRepresentation = 0xffd06a, k = 1.6) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) }, k: { value: k } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float k; varying vec2 vUv;
      void main(){
        float s = fract(vUv.x * 2.0 + vUv.y * 2.6 - time * 0.45);
        float line = smoothstep(0.06, 0.0, abs(s - 0.5));
        float dash = step(0.35, fract(vUv.y * 14.0 - time * 1.8));
        float fall = pow(1.0 - vUv.y, 1.8);
        gl_FragColor = vec4(color * 1.6, min(1.0, k * fall * line * (0.45 + 0.55 * dash)));
      }`,
  });
}
/** v0.9.6b 太古：两股反向缠绕的深红螺旋，边缘金色（与套装的红光柱 / 暗金的金螺旋拉开） */
export function ancientHelixMaterial(k = 1.7) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { time: ENV_T, k: { value: k } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform float k; varying vec2 vUv;
      void main(){
        float y = vUv.y;
        float d1 = abs(fract(vUv.x * 2.0 + y * 2.4 - time * 0.5) - 0.5);
        float d2 = abs(fract(-vUv.x * 2.0 + y * 2.4 - time * 0.5) - 0.5);
        float d = min(d1, d2);
        float core = smoothstep(0.05, 0.0, d);
        float edge = smoothstep(0.1, 0.055, d) - core;
        float fall = pow(1.0 - y, 1.5);
        float flick = 0.75 + 0.25 * sin(time * 9.0 + y * 30.0);
        vec3 col = vec3(1.0, 0.08, 0.06) * 1.8 * core + vec3(1.0, 0.75, 0.3) * 1.6 * edge;
        gl_FragColor = vec4(col, min(1.0, k * fall * (core + edge) * flick));
      }`,
  });
}
export function beamMaterial(color: THREE.ColorRepresentation, k = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { time: ENV_T, color: { value: new THREE.Color(color) }, k: { value: k } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float k; varying vec2 vUv;
      void main(){
        float fall = pow(1.0 - vUv.y, 2.0);
        float strands = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 9.0 + sin(vUv.y * 5.0 - time * 2.0) * 1.5);
        float flow = 0.6 + 0.4 * sin(vUv.y * 18.0 - time * 4.0 + vUv.x * 30.0);
        gl_FragColor = vec4(color * 1.3, min(1.0, k * pow(1.0 - vUv.y, k > 1.5 ? 1.6 : 3.0) * (0.08 + 0.32 * strands * flow)));
      }`,
  });
}
