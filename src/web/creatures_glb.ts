// v0.9.4b：AI 生成（TRELLIS.2，MIT）的怪物模型。启动时从内嵌 base64 解析；
// 无骨骼，用顶点着色器做身体波浪摆动（沿身体长轴横向正弦，头部抬高处幅度减弱），Rig.body 为整体枢轴。
import * as THREE from 'three';
import { b64ToBuf } from './b64';   // fix1106 原生 base64 解码
import { loadTask } from './loading';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { withKtx2 } from './ktx2';   // fix1106 KTX2 贴图
import { CREATURE_GLB } from './assets.gen';
import { HitMap } from './assethit';
import { GAME_VERSION } from './version';
import { toon, blobShadowTexture, curQuality } from './gfx';
import { makeProcSkinned, ProcAnim, type RigTpl } from './procrig';   // v1.2.73 程序化绑骨
import type { Rig } from './models';

interface Src { geo: THREE.BufferGeometry; map: THREE.Texture | null; len: number; h: number; hd?: THREE.MeshStandardMaterial }
/** v1.2.41 高清道具（带法线 / 发光贴图）：保留原材质 */
const hdOf = (m: THREE.Mesh) => { const mt = m.material as THREE.MeshStandardMaterial; return mt && (mt.normalMap || mt.emissiveMap) ? mt : undefined; };
const srcs = new HitMap<string, Src>('CREATURE_GLB');
/** v1.2.23：内容包在启动时登记自带的 GLB（名字 → base64），和本体的一起在 loadCreatures 里解析 */
const extra: Record<string, string> = {};
/** v1.2.40 运行时登记一个 GLB（铸造台生成的武器等）；已登记的同名会覆盖 */
export async function addRuntimeGlb(name: string, buf: ArrayBuffer): Promise<boolean> {
  try {
    await MeshoptDecoder.ready;
    const loader = withKtx2(new GLTFLoader()); loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.parseAsync(buf, '');
    let mesh: THREE.Mesh | null = null; g.scene.traverse(o => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    if (!mesh) return false;
    const m = mesh as THREE.Mesh; m.updateWorldMatrix(true, false);
    const geo = deq(m.geometry.clone()).applyMatrix4(m.matrixWorld); normalize(geo, false);
    const b = geo.boundingBox!; const map = (m.material as THREE.MeshStandardMaterial).map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    srcs.set(name, { geo, map, len: Math.max(b.max.z - b.min.z, b.max.x - b.min.x), h: b.max.y - b.min.y, hd: hdOf(m) });
    return true;
  } catch (e) { console.warn('运行时模型解析失败', name, e); return false; }
}
export const hasGlb = (name: string) => srcs.has(name);
export function registerCreatureGlb(m: Record<string, string>) { Object.assign(extra, m); }


/** 归一化：头（最高处）朝 +Z，水平居中，脚底 y=0 */
const AUTO_FACE = new Set(['sakar']);   // 只有蠕虫类「最高处 = 头」，其余靠 yaw 手调
/** 11-18 Rhett「钟铜法杖模型很怪」（查看窗里多出两根细长尖刺）：meshopt 量化的位置 / 法线是 Int16 归一化（±1），
 *  套节点矩阵后 normalize 把脚底平移到 y=0 → 顶端超过 1 的点写回 Int16 时溢出绕回 -1 → 拉成尖刺。先转浮点再变换。?off=glbdeq 回旧路径 */
const deqOff = (() => { try { return /(?:^|[?&])off=[^&]*\bglbdeq\b/.test(location.search); } catch { return false; } })();
export function deq(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (deqOff) return geo;
  for (const nm of ['position', 'normal']) { const a = geo.getAttribute(nm) as THREE.BufferAttribute | undefined; if (!a || a.array instanceof Float32Array) continue;
    const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
    geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize)); }
  return geo;
}
function normalize(geo: THREE.BufferGeometry, face: boolean) {
  geo.computeBoundingBox(); const b = geo.boundingBox!;
  const pos = geo.attributes.position as THREE.BufferAttribute; const top = b.max.y - (b.max.y - b.min.y) * 0.2;
  let hx = 0, hz = 0, n = 0;
  const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top) { hx += pos.getX(i) - cx; hz += pos.getZ(i) - cz; n++; }
  geo.translate(-cx, -b.min.y, -cz);
  if (n && face) geo.rotateY(-Math.atan2(hx / n, hz / n));
  geo.computeBoundingBox();
}

// ---------------------------------------------------------------- v1.2.54 分包加载（build-web --split）
declare const __DARKROCK_LAZY__: string[] | undefined;
const LAZY: string[] = (() => { try { return typeof __DARKROCK_LAZY__ !== 'undefined' ? __DARKROCK_LAZY__ : []; } catch { return []; } })();
let lazyGot = 0, lazyP: Promise<void> | null = null;
/** 延后模型分块全部到齐（没分包 = 立即完成） */
/** fix1106 载入提速：内容包 DLC 怪物（dlc1_*，写实 NPC dlc1_npc_* 除外）不在开机解析，标题出来后在后台解析；
 *  进世界（title.ts startChar → waitLazy）要等它完成，所以游玩中不会现加载。开机时若有人提前要它 → 报「未就绪」 */
const deferQ: [string, string][] = [];
const deferNames = new Set<string>();
/** fix1109b 开机就会刷出的 DLC 怪（内容包选角背景区域的怪，selectPrepare 在 Loading 里就建区刷怪）：不延后，和本体一起在 loadCreatures 里解析。
 *  原因：延后解析在标题之后才跑，这些怪已用程序化替身刷出，之后不会换回（11-09 镜渊城怪全是方块） */
const EAGER = new Set<string>();
export function keepCreatureEager(names: Iterable<string>) { for (const n of names) EAGER.add(n); }
const DEFER_OK = (name: string) => /^dlc\d+_/.test(name) && !/^dlc\d+_npc/.test(name) && !EAGER.has(name);
function missDeferred(name: string) { if (deferNames.has(name)) console.error('怪物模型未就绪（延后解析中被提前使用）', name); }
/** 延后的 DLC 怪物已全部解析（评委快速体验进 DLC 前要等它） */
export const deferDone = () => !deferQ.length && [...deferNames].every(n => srcs.has(n) || failedDefer.has(n));
const failedDefer = new Set<string>();
const deferTotal = () => (deferNames.size ? 1 : 0);
export const lazyInfo = () => ({ total: LAZY.length + deferTotal(), got: lazyGot, done: lazyGot >= LAZY.length + deferTotal() });
/** 页面外壳起来后在后台拉 lazy/*.js（<script> 注入：线上 / file:// 离线都能用），逐块解析登记 */
export function startLazyCreatures(): Promise<void> {
  if (lazyP) return lazyP;
  if ((!LAZY.length && !deferQ.length) || typeof document === 'undefined') return (lazyP = Promise.resolve());
  const W = window as unknown as { __drLazyQ?: Record<string, string>[]; __drLazyPing?: () => void };
  lazyP = (async () => {
    await MeshoptDecoder.ready;
    const loader = withKtx2(new GLTFLoader()); loader.setMeshoptDecoder(MeshoptDecoder);
    if (deferQ.length) {   // fix1106 延后的 DLC 怪物：逐个解析，每个之间让出主线程（标题画面不卡）
      const t0 = performance.now();
      for (const [name, b64] of deferQ.splice(0)) {
        if (!srcs.has(name)) { try { const g = await loader.parseAsync(b64ToBuf(b64), ''); regParsed(name, g.scene); } catch (e) { failedDefer.add(name); console.warn('怪物模型解析失败', name, e); } }
        await new Promise(r => setTimeout(r, 0));
      }
      console.info(`DLC 怪物模型后台解析完成 ${deferNames.size} 个，${Math.round(performance.now() - t0)} ms`);
      lazyGot++;
    }
    for (const f of LAZY) {
      await new Promise<void>(res => { const s = document.createElement('script'); s.src = `lazy/${f}?v=${GAME_VERSION}`; s.async = true; s.onload = () => res(); s.onerror = () => { console.warn('分包加载失败', f); res(); }; document.head.appendChild(s); });
      const q = W.__drLazyQ ?? []; W.__drLazyQ = [];
      for (const part of q) for (const [name, b64] of Object.entries(part)) { if (srcs.has(name)) continue; try { const g = await loader.parseAsync(b64ToBuf(b64), ''); regParsed(name, g.scene); } catch (e) { console.warn('分包模型解析失败', name, e); } }
      lazyGot++;
    }
  })();
  return lazyP;
}
function regParsed(name: string, scene: THREE.Object3D) {
  let mesh: THREE.Mesh | null = null; scene.traverse(o => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) return;
  const m = mesh as THREE.Mesh; m.updateWorldMatrix(true, false);
  const geo = deq(m.geometry.clone()).applyMatrix4(m.matrixWorld); normalize(geo, AUTO_FACE.has(name));
  const b = geo.boundingBox!; const map = (m.material as THREE.MeshStandardMaterial).map ?? null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  srcs.set(name, { geo, map, len: Math.max(b.max.z - b.min.z, b.max.x - b.min.x), h: b.max.y - b.min.y, hd: hdOf(m) });
}

// fix1106：原 6 秒超时 → 慢机器上写实 NPC / DLC 怪没解析完就进世界（NPC 先给 Q 版、进场后才换装 = 游玩中现加载）。
//   规则：模型在 Loading 内全部解析完再进世界；超时放宽到 120 秒，超时要报错（不静默）
export async function loadCreatures(timeoutMs = 120000) {
  // v1.2.23：支持 meshopt（Lux3D 后处理产物）；单个文件失败只跳过它，不拖垮整批
  await MeshoptDecoder.ready;
  const loader = withKtx2(new GLTFLoader()); loader.setMeshoptDecoder(MeshoptDecoder);
  const all = Object.entries({ ...CREATURE_GLB, ...extra }).filter(([name, b64]) => { if (name in extra && DEFER_OK(name) && !srcs.has(name)) { deferQ.push([name, b64]); deferNames.add(name); return false; } return true; });
  const work = Promise.all(all.map(async ([name, b64]) => {
    let g; try { g = await loader.parseAsync(b64ToBuf(b64), ''); } catch (e) { console.warn('怪物模型解析失败', name, e); return; }
    let mesh: THREE.Mesh | null = null; g.scene.traverse(o => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    if (!mesh) return;
    const m = mesh as THREE.Mesh; m.updateWorldMatrix(true, false);
    const geo = deq(m.geometry.clone()).applyMatrix4(m.matrixWorld); normalize(geo, AUTO_FACE.has(name));
    const b = geo.boundingBox!; const map = (m.material as THREE.MeshStandardMaterial).map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    srcs.set(name, { geo, map, len: Math.max(b.max.z - b.min.z, b.max.x - b.min.x), h: b.max.y - b.min.y, hd: hdOf(m) });
  }));
  let late = false;
  try { await Promise.race([work, new Promise(r => setTimeout(() => { late = true; r(0); }, timeoutMs))]); } catch (e) { console.warn('怪物模型加载出错', e); }
  if (late) console.error(`怪物模型 ${timeoutMs / 1000} 秒内没解析完，剩余模型进世界后才到`);
}
export const creatureReady = (name: string) => srcs.has(name);
/** 11-04 已解析的道具 / 怪物模型名（预载用） */
export const glbNames = (): string[] => [...srcs.keys()];

export function makeGlbCreature(name: string, o: { length?: number; height?: number; wave: number; yaw?: number; bob?: number; selfGlow?: number; /** v1.2.73 体型模板：有就自动绑骨 + 程序化动作（低画质不绑） */ rig?: RigTpl; pbr?: { keepMaps?: boolean; roughness?: number; metalness?: number; emissive?: number; emissiveK?: number } }): Rig | null {
  const s = srcs.get(name); if (!s) { missDeferred(name); return null; }
  const k = o.height ? o.height / s.h : (o.length ?? s.len) / s.len;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // pbr：写实模型（Lux3D）用标准材质保留质感；否则卡通材质（TRELLIS 怪物）
  const mat: THREE.MeshToonMaterial = o.pbr
    ? new THREE.MeshStandardMaterial({ map: s.map ?? undefined, roughness: o.pbr.roughness ?? 0.75, metalness: o.pbr.metalness ?? 0.1,
        emissive: new THREE.Color(o.pbr.emissive ?? 0), emissiveMap: s.map ?? undefined, emissiveIntensity: o.pbr.emissiveK ?? 1 }) as unknown as THREE.MeshToonMaterial
    : toon(0xffffff, { map: s.map ?? undefined });
  // 11-16c 伊奥拉对照原件：原件带法线 + 金属粗糙度贴图，这里只拷了底色 → 衣褶 / 五官压平。pbr.keepMaps 时把原件的法线 / 粗糙 / 金属贴图带上
  if (o.pbr?.keepMaps && s.hd) { const sm = mat as unknown as THREE.MeshStandardMaterial;
    if (s.hd.normalMap) { sm.normalMap = s.hd.normalMap; sm.normalScale = s.hd.normalScale.clone(); }
    if (s.hd.roughnessMap) sm.roughnessMap = s.hd.roughnessMap; if (s.hd.metalnessMap) sm.metalnessMap = s.hd.metalnessMap; }
  if (o.pbr) { mat.userData.baseEmissive = o.pbr.emissive ?? 0; mat.userData.outlineParameters = { visible: false }; }   // 10-27：写实怪物（Lux3D）同写实角色 / 场景件不套卡通描边（暗场景里一圈浅紫轮廓；描边排查 dev/outlineprobe.mjs 查到海岸 / 镜渊城怪群）
  const U = { uT: { value: 0 }, uAmp: { value: 0.3 }, uK: { value: 0.9 / k }, uH: { value: s.h }, uGlow: { value: o.selfGlow ?? 0 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uT,uAmp,uK,uH;\nvarying vec3 vPO;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      vPO = position;
      float lowW = 1.0 - smoothstep(0.25, 0.75, position.y / uH);
      transformed.x += sin(position.z * uK * 6.0 - uT) * uAmp * ${o.wave.toFixed(3)} * uH * lowW;
      transformed.y += max(0.0, sin(position.z * uK * 6.0 - uT + 1.2)) * uAmp * 0.04 * uH * lowW;`);
    // 程序化熔岩裂纹（TRELLIS 去光照后贴图里的熔岩纹几乎没了）：物体空间 3D Voronoi 边缘发光，越靠下（胸腹）越亮，缓慢呼吸
    sh.fragmentShader = 'uniform float uT,uH,uGlow;\nvarying vec3 vPO;\n' +
      `vec3 h3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453); }
      float vEdge(vec3 x){ vec3 i=floor(x), f=fract(x); float d1=8.0, d2=8.0;
        for(int a=-1;a<=1;a++) for(int b=-1;b<=1;b++) for(int c=-1;c<=1;c++){ vec3 g=vec3(a,b,c); vec3 r=g+h3(i+g)-f; float d=dot(r,r); if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; }
        return sqrt(d2)-sqrt(d1); }\n` + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if (uGlow > 0.0) {
        float e = vEdge(vPO / uH * 8.0);
        float crack = 1.0 - smoothstep(0.012, 0.05, e);
        float big = 1.0 - smoothstep(0.05, 0.3, vEdge(vPO / uH * 2.2 + 3.7));   // 大裂缝区域才有细纹，避免满身网格
        float low = 0.1 + 0.9 * smoothstep(0.8, 0.1, vPO.y / uH);
        float pulse = 0.8 + 0.2 * sin(uT * 0.6 + vPO.y * 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.3, 0.04) * crack * big * low * pulse * uGlow;
      }`);
  };
  mat.customProgramCacheKey = () => 'glbwave';
  // v1.2.73：有体型模板 → 自动绑骨（yaw 烘进几何体，骨架按头朝 +Z 生成）；顶点波浪关掉，动作全交给 ProcAnim
  const rigged = o.rig && curQuality !== 'low' ? makeProcSkinned(name, s.geo, o.rig, o.yaw ?? 0, mat, k) : null;
  if (rigged) { o = { ...o, wave: 0 }; mat.customProgramCacheKey = () => 'glbwave0'; }
  const mesh = rigged ? rigged.mesh : new THREE.Mesh(s.geo, mat);
  if (!rigged) { mesh.castShadow = true; mesh.scale.setScalar(k); mesh.rotation.y = o.yaw ?? 0; }   // yaw：让嘴朝 +Z（模型朝向手调）
  body.add(mesh);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
  blob.material.userData.outlineParameters = { visible: false };
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.025; blob.scale.set(s.len * k * 0.6, s.len * k, 1); blob.name = 'blob'; root.add(blob);
  let t = 0, amp = 0.3;
  if (rigged) {
    root.userData.procRig = rigged.info;
    const anim = new ProcAnim(rigged, root, dt => { t += dt * 1.5; U.uT.value = t; });
    return { root, body, legs: [], scale: 1, flash: [mat], anim: anim as unknown as Rig['anim'] };
  }
  return {
    root, body, legs: [], scale: 1, flash: [mat],
    tick: (dt, moving) => { amp += ((moving ? 1 : 0.3) - amp) * Math.min(1, dt * 3); t += dt * (1.5 + amp * 4); U.uT.value = t; U.uAmp.value = amp; if (o.bob) body.position.y = Math.sin(t * 0.5) * o.bob * s.h * k; },
  };
}

/** v1.2.26 比赛版 Lux3D 道具（武器 / 副手 / 背棺）：最长轴转到 +Y，握点（沿长轴 anchor 比例处）放在原点，长轴缩放到 len；标准 PBR 材质。没有这个模型 → null */
/** 横躺生成、自动立起后头尾颠倒的 Lux 道具 */
const PROP_FLIP = new Set(['weapon_rock_dagger', 'weapon_bell_sword']);   // v1.2.42 钟格长剑原件剑首朝 +Y（截面分析：护手在 60–80% 处），一直是倒握，翻正
/** v1.2.41 道具环境反射：程序生成的等距柱状渐变（上冷青天光、中间暖色地平线、下暗地），金属才有高光层次 */
let _env: THREE.Texture | null = null;
export function propEnv() {
  if (_env) return _env;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#9fd8e8'); g.addColorStop(0.42, '#e8f4ff'); g.addColorStop(0.5, '#ffd9a0'); g.addColorStop(0.58, '#5a4a3a'); g.addColorStop(1, '#141210');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 3; i++) { const r = x.createRadialGradient(40 + i * 85, 30, 0, 40 + i * 85, 30, 26); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 256, 128); }
  _env = new THREE.CanvasTexture(c); _env.mapping = THREE.EquirectangularReflectionMapping; _env.colorSpace = THREE.SRGBColorSpace; return _env;
}
export function makeGlbProp(name: string, len: number, anchor = 0.5, o: { roughness?: number; metalness?: number; emissive?: number; emissiveK?: number; /** 11-06 居中后沿 x 再平移（模型单位，缩放前），握点对准手心用 */ offX?: number } = {}): THREE.Mesh | null {
  const s = srcs.get(name); if (!s) { missDeferred(name); return null; }
  const geo = s.geo.clone();
  // meshopt 量化过的属性（Int16 / Int8 归一化）先转成浮点，否则旋转 / 平移 / 缩放会溢出 → 拉丝
  for (const nm of ['position', 'normal']) { const a = geo.getAttribute(nm) as THREE.BufferAttribute | undefined; if (!a || a.array instanceof Float32Array) continue;
    const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
    geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize)); }
  geo.computeBoundingBox(); let b = geo.boundingBox!;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  if (sx > sy && sx >= sz) geo.rotateZ(Math.PI / 2); else if (sz > sy && sz > sx) geo.rotateX(-Math.PI / 2);
  if (PROP_FLIP.has(name) || len < 0) geo.rotateZ(Math.PI);   // v1.2.31 自动立起后握柄朝上的道具：翻转 180°（11-05：len 传负数 = 调用方要求翻转，内容包挂点表用）
  len = Math.abs(len);
  geo.computeBoundingBox(); b = geo.boundingBox!;
  const L = b.max.y - b.min.y, k = len / L;
  geo.translate(-(b.max.x + b.min.x) / 2 + (o.offX ?? 0), -(b.min.y + L * anchor), -(b.max.z + b.min.z) / 2); geo.scale(k, k, k);
  let mat: THREE.MeshStandardMaterial;
  if (s.hd) {   // v1.2.41 高清：原贴图全套（底色 / 金属粗糙度 / 法线 / 发光）+ 共享环境反射
    // fix1107（Rhett：选角暗金武器整把发白光）：只有带发光贴图的模型才把 emissive 设白（按贴图发光）；Lux3D 暗金 w40_* 只有底色 / 法线 / 金属粗糙度，
    //   没有发光贴图时 emissive 白 ×1.8 = 整把纯白，看不到贴图 → 没发光贴图就不自发光（光效交给 weaponfx 光晕 / 拖尾）
    const em = s.hd.emissiveMap ? 0xffffff : 0;
    mat = s.hd.clone(); mat.envMap = propEnv(); mat.envMapIntensity = 1.35; mat.emissive.setHex(em); mat.emissiveIntensity = 1.8;
    if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace; mat.userData.baseEmissive = em; mat.userData.hd = true;
  } else {
    mat = new THREE.MeshStandardMaterial({ map: s.map ?? undefined, roughness: o.roughness ?? 0.5, metalness: o.metalness ?? 0.45,
      emissive: new THREE.Color(o.emissive ?? 0), emissiveMap: s.map ?? undefined, emissiveIntensity: o.emissiveK ?? 0.4 });
    mat.userData.baseEmissive = o.emissive ?? 0;
  }
  mat.userData.outlineParameters = { visible: false };   // v1.2.54 Rhett：武器模型不要描边（暗场景里是一圈浅紫轮廓）
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.name = 'lux_' + name; m.userData.luxKey = name; return m;   // 11-05 职业挂件会改名（h_glaive 等），模型键另存
}

/** v1.2.45 比赛版场景件（Lux3D 图生 3D：巨钟 / 沉船 / 钟楼…）：保持原朝向，脚底 y=0、水平居中；按高度 h 或最长水平边 w 缩放。
 *  单独解析（meshopt 量化属性先转浮点再套节点矩阵，避免怪物通道的归一化整型溢出把模型拉长）；同名几何体只处理一次，实例共用。
 *  没有这个模型 / 还没解析完 → null（调用方回退程序化造景） */
const sceneGeo = new HitMap<string, { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; h: number; w: number; parts: { suffix: string; geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }[] }>('SCENE');
/** 场景件分件：一个 Lux3D 模型里混着不同材质的部分（如断柱组里的铜钟），按包围盒归一化坐标（各轴 -1..1）把三角面划成子件，
 *  子件挂在主网格下、名字 luxscene_<id>.<suffix>、材质单独一份（高精细节层可按子件登记不同类别）。内容包在模型解析前登记 */
export type ScenePart = { suffix: string; test: (x: number, y: number, z: number) => boolean; /** 子件金属度系数 / 环境反射（不随调用方的 metal / envK 走；铜钟要反射才不发黑） */ metal?: number; envK?: number; /** 子件底色（乘贴图；不随调用方 tint，铜钟保留暖铜色） */ color?: number };
const SCENE_PARTS = new Map<string, ScenePart[]>();
export function registerSceneParts(id: string, parts: ScenePart[]) { SCENE_PARTS.set(id, parts); }
function splitScene(geo: THREE.BufferGeometry, parts: ScenePart[]): { rest: THREE.BufferGeometry; out: { suffix: string; geo: THREE.BufferGeometry }[] } {
  const src = geo.index ? geo.toNonIndexed() : geo, pos = src.getAttribute('position'), b = src.boundingBox ?? (src.computeBoundingBox(), src.boundingBox!);
  const cx = (b.max.x + b.min.x) / 2, cy = (b.max.y + b.min.y) / 2, cz = (b.max.z + b.min.z) / 2, hx = (b.max.x - b.min.x) / 2 || 1, hy = (b.max.y - b.min.y) / 2 || 1, hz = (b.max.z - b.min.z) / 2 || 1;
  const nTri = pos.count / 3, owner = new Int16Array(nTri).fill(-1);
  for (let t = 0; t < nTri; t++) {
    let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { x += pos.getX(t * 3 + k); y += pos.getY(t * 3 + k); z += pos.getZ(t * 3 + k); }
    x = (x / 3 - cx) / hx; y = (y / 3 - cy) / hy; z = (z / 3 - cz) / hz;
    for (let p = 0; p < parts.length; p++) if (parts[p].test(x, y, z)) { owner[t] = p; break; }
  }
  const pick = (want: number) => { const g = new THREE.BufferGeometry(); let n = 0; for (let t = 0; t < nTri; t++) if (owner[t] === want) n++;
    for (const nm of Object.keys(src.attributes)) { const a = src.getAttribute(nm) as THREE.BufferAttribute, isz = a.itemSize, arr = new Float32Array(n * 3 * isz); let o = 0;
      for (let t = 0; t < nTri; t++) if (owner[t] === want) for (let k = 0; k < 3; k++) for (let j = 0; j < isz; j++) arr[o++] = a.getComponent(t * 3 + k, j);
      g.setAttribute(nm, new THREE.BufferAttribute(arr, isz)); }
    g.computeBoundingBox(); g.computeBoundingSphere(); return g; };
  return { rest: pick(-1), out: parts.map((p, i) => ({ suffix: p.suffix, geo: pick(i) })) };
}
const toFloat = (geo: THREE.BufferGeometry) => { for (const nm of Object.keys(geo.attributes)) { const a = geo.getAttribute(nm) as THREE.BufferAttribute; if (a.array instanceof Float32Array && !(a as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
  const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = j === 0 ? a.getX(i) : j === 1 ? a.getY(i) : j === 2 ? a.getZ(i) : a.getW(i);
  geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize)); } };
export function preloadScenes(m: Record<string, string>) {
  if (!Object.keys(m).some(k => k.startsWith('scene_'))) return Promise.resolve();
  return loadTask('场景模型', 3, preloadScenesRun(m));   // v1.2.49 计入加载画面进度
}
async function preloadScenesRun(m: Record<string, string>) {
  await MeshoptDecoder.ready;
  const loader = withKtx2(new GLTFLoader()); loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.entries(m).filter(([k]) => k.startsWith('scene_')).map(async ([name, b64]) => {
    try {
      const g = await loader.parseAsync(b64ToBuf(b64), '');
      let mesh: THREE.Mesh | null = null; g.scene.traverse(o => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
      if (!mesh) return; const me = mesh as THREE.Mesh; me.updateWorldMatrix(true, false);
      const geo = me.geometry.clone(); toFloat(geo); geo.applyMatrix4(me.matrixWorld);
      geo.computeBoundingBox(); const b = geo.boundingBox!;
      geo.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2); geo.computeBoundingBox(); geo.computeBoundingSphere();
      const src = me.material as THREE.MeshStandardMaterial;
      const mat = src.clone(); if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) { mat.emissiveMap.colorSpace = THREE.SRGBColorSpace; mat.emissive.setHex(0xffffff); }
      mat.envMap = propEnv(); mat.envMapIntensity = 0.45; mat.userData.scene = true;
      mat.userData.outlineParameters = { visible: false };   // 写实场景件不套卡通描边（描边 pass 在暗场景里成一圈浅紫轮廓）
      const bb = geo.boundingBox!, h = bb.max.y - bb.min.y, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const pl = SCENE_PARTS.get(name); let main = geo, parts: { suffix: string; geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }[] = [];
      if (pl?.length) { const sp = splitScene(geo, pl); main = sp.rest; parts = sp.out.filter(o => o.geo.getAttribute('position').count > 0).map((o, i) => { const pm = mat.clone(), def = pl.find(p => p.suffix === o.suffix) ?? pl[i]; if (def?.metal !== undefined) pm.metalness = def.metal; if (def?.envK !== undefined) pm.envMapIntensity = def.envK; if (def?.color !== undefined) pm.color.setHex(def.color); pm.userData.partFixed = { metal: def?.metal, envK: def?.envK, color: def?.color }; return { ...o, mat: pm }; }); }
      sceneGeo.set(name, { geo: main, mat, h, w, parts });
    } catch (e) { console.warn('场景模型解析失败', name, e); }
  }));
}
export function makeGlbScene(name: string, size: { h?: number; w?: number }, o: { envK?: number; emissiveK?: number; tint?: number; metal?: number } = {}): THREE.Group | null {
  const c = sceneGeo.get(name); if (!c) return null;
  let mat = c.mat;
  if (o.envK !== undefined || o.emissiveK !== undefined || o.tint !== undefined || o.metal !== undefined) { mat = c.mat.clone(); if (o.metal !== undefined) mat.metalness = o.metal; if (o.envK !== undefined) mat.envMapIntensity = o.envK; if (o.emissiveK !== undefined && mat.emissiveMap) mat.emissiveIntensity = o.emissiveK; if (o.tint !== undefined) mat.color.setHex(o.tint); }
  const k = size.h ? size.h / c.h : size.w ? size.w / c.w : 1;
  const m = new THREE.Mesh(c.geo, mat); m.scale.setScalar(k); m.castShadow = true; m.receiveShadow = true; m.name = 'luxscene_' + name;
  for (const p of c.parts) {   // 子件挂在主网格下（同缩放 / 同变换；调用方改 children[0] 的位置 / 旋转一起带走）
    let pm = p.mat; if (mat !== c.mat) { const fx = p.mat.userData.partFixed ?? {}; pm = p.mat.clone(); if (fx.envK === undefined) pm.envMapIntensity = mat.envMapIntensity; if (fx.metal === undefined) pm.metalness = mat.metalness; pm.emissiveIntensity = mat.emissiveIntensity; if (fx.color === undefined) pm.color.copy(mat.color); }
    const pc = new THREE.Mesh(p.geo, pm); pc.castShadow = true; pc.receiveShadow = true; pc.name = 'luxscene_' + name + '.' + p.suffix; m.add(pc);
  }
  const g = new THREE.Group(); g.add(m); g.userData.luxScene = name; return g;
}

/** v1.2.73b 卡顿修复：已解析怪物模型的贴图（含分包），供 prewarm.ts 分帧预上传 */
export function creatureTextures(): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (const v of srcs.values()) { if (v.map) out.push(v.map); const h = v.hd as unknown as Record<string, unknown> | undefined;
    if (h) for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap']) { const t = h[k] as THREE.Texture | undefined; if (t && t.isTexture) out.push(t); } }
  return out;
}
