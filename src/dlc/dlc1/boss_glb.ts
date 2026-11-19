// ======================================================================
// 长副本 A 首领：Lux3D 正式绑骨首领件（v1.2.69-A8，11-02）
// assets_aholo/dlc1/creatures/<id>_boss.glb = 已绑骨（mixamo 52 骨）+ 首领化 + 重绘贴图的成品（tools/rigfine/ferry_boss/，budget.mjs 压到首领预算）。
// 本体 creatures_glb 只取第一块静态网格，所以这里（只在 DLC 内）单独解析：SkeletonUtils 克隆骨架 → 待机姿势（clips.mjs IDLE：手臂放下、右手握拳）→
// 状态机（boss_rig.ts BossProcAnim）给出的模型轴姿势经 BossPoser 换算到每根 mixamo 骨的本地轴写入。刚性件（船篙 / 提灯）已是 RightHand 子节点，跟手走。
// 低画质 / 没有成品件（商用 base 包）/ 解析没完成：调用方回退静态写实件（整体动作兜底）。
// ======================================================================
import * as THREE from 'three';
import { b64ToBuf } from '../../web/b64';   // fix1106 原生 base64 解码
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadTask } from '../../web/loading';
import { withKtx2 } from '../../web/ktx2';   // fix1106 KTX2 贴图
import { propEnv } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import type { BossPoser, BossClipSet, BossClipMeta } from './boss_rig';

type E3 = [number, number, number];
/** 待机姿势（mixamo 本地轴欧拉；与 tools/rigfine/ferry_boss/clips.mjs IDLE 一致，刚性件按它求的握持矩阵） */
const IDLE: Record<string, E3> = { LeftArm: [0, 0, -1.2], RightArm: [0, 0.2, 1.05], LeftForeArm: [0, 0, -0.2], RightForeArm: [0, 0, 0.5], RightHandThumb1: [0, 0.3, 0.2], RightHandThumb2: [0, 0, 0.5] };
for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) IDLE['RightHand' + f + k] = [0, 0, k === 1 ? 1 : 0.9];
/** 状态机关节名 → mixamo 骨 */
const MAP: Record<string, string> = { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
  shR: 'RightArm', elR: 'RightForeArm', haR: 'RightHand', shL: 'LeftArm', elL: 'LeftForeArm', haL: 'LeftHand',
  thR: 'RightUpLeg', knR: 'RightLeg', ftR: 'RightFoot', thL: 'LeftUpLeg', knL: 'LeftLeg', ftL: 'LeftFoot' };

const parsed = new Map<string, { scene: THREE.Group; anims: THREE.AnimationClip[]; meta: Record<string, BossClipMeta> }>();
const failed = new Set<string>();
const tipCache = new Map<string, { a: THREE.Vector3; b: THREE.Vector3 }>();
/** 构建里带了哪些正式绑骨件（<id>_boss） */
// A10 按需加载：比赛版 DLC 构建把 <id>_boss 拆到页面旁 raid/*.js（build-web.mjs ASSET_RAID），进副本（无声钟楼 / 潮渊钟井）时 <script> 注入再解析；
//   加载 / 解析失败或还没到齐 → makeBossGlb 返回 null → 调用方回退静态写实件，不报错。--raid-inline 构建（或 playtest）仍走单页内嵌、开机解析。
declare const __DARKROCK_RAID__: { files: string[]; ids: string[] } | undefined;
const RAID: { files: string[]; ids: string[] } = (() => { try { return typeof __DARKROCK_RAID__ !== 'undefined' && __DARKROCK_RAID__ ? __DARKROCK_RAID__ : { files: [], ids: [] }; } catch { return { files: [], ids: [] }; } })();
const INLINE_IDS = Object.keys(PACK_CREATURE_GLB).filter(k => k.endsWith('_boss')).map(k => k.slice(0, -5));
const LAZY_IDS = RAID.ids.filter(k => k.endsWith('_boss')).map(k => k.slice(0, -5)).filter(k => !INLINE_IDS.includes(k));
export const BOSS_GLB_IDS = [...INLINE_IDS, ...LAZY_IDS];
const lazySt = { state: (LAZY_IDS.length ? 'idle' : 'none') as 'none' | 'idle' | 'loading' | 'done', files: RAID.files.length, got: 0, bad: [] as string[], ms: 0, parseMs: 0, warm: 'no' as 'no' | 'pending' | 'done' | 'fail', warmMs: 0, warmN: 0 };
export const bossGlbHas = (id: string) => BOSS_GLB_IDS.includes(id);
export const bossGlbReady = (id: string) => parsed.has(id);
export const bossGlbInfo = () => ({ ids: [...BOSS_GLB_IDS], ready: [...parsed.keys()], failed: [...failed], lazy: { ids: [...LAZY_IDS], ...lazySt, bad: [...lazySt.bad] } });
/** A9：glTF animations[].extras（zh 中文名 / hit 出手时刻 / dur / loop；tools/rigfine/a9/bake.mjs 写入）——GLTFLoader 不带 extras，这里直接读 JSON 块 */
/** 11-08：非 mixamo 骨的鱼形首领（莫尔维斯，05 交 wl_morvis_rigged → wl_morvis_boss.glb，13 段动画）：片段名换成状态机约定
 *  skill_<招> → <招>（surge/bite/lure/drool/eels/flood）、swim → walk、phase_crash → phase；不套 mixamo IDLE，不走 BossPoser 写骨，动作全由片段驱动 */
const FISH_IDS = new Set(['wl_morvis']);
const fishClipName = (n: string) => n === 'swim' ? 'walk' : n === 'phase_crash' ? 'phase' : n.startsWith('skill_') ? n.slice(6) : n;
function animExtras(buf: ArrayBuffer): Record<string, BossClipMeta> {
  try {
    const dv = new DataView(buf), len = dv.getUint32(12, true), js = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
    const o: Record<string, BossClipMeta> = {};
    for (const a of js.animations ?? []) { const e = a.extras ?? {}; if (a.name) o[a.name] = { dur: +e.dur || 0, hit: typeof e.hit === 'number' ? e.hit : null, loop: !!e.loop, zh: e.zh ?? a.name }; }
    return o;
  } catch { return {}; }
}
async function parseIds(ids: string[], src: (id: string) => string | undefined) {
  await MeshoptDecoder.ready;
  const L = withKtx2(new GLTFLoader()); L.setMeshoptDecoder(MeshoptDecoder);
  for (const id of ids) {
    if (parsed.has(id)) continue;
    const b64 = src(id); if (!b64) { failed.add(id); console.warn('首领绑骨件没有载入，回退静态件', id); continue; }
    try { const buf = b64ToBuf(b64); const g = await L.parseAsync(buf, ''); const anims = g.animations ?? []; if (FISH_IDS.has(id)) for (const c of anims) c.name = fishClipName(c.name); parsed.set(id, { scene: g.scene, anims, meta: animExtras(buf) }); failed.delete(id); }
    catch (e) { failed.add(id); console.warn('首领绑骨件解析失败，回退静态件', id, e); }
  }
}
export const bossGlbLoaded: Promise<void> = INLINE_IDS.length && typeof atob === 'function' ? loadTask('首领模型', 2, parseIds(INLINE_IDS, id => PACK_CREATURE_GLB[id + '_boss'])) : Promise.resolve();

let lazyP: Promise<void> | null = null;
const lazyParts = new Map<string, string[]>();
/** 11-07：按需包里的非首领件（tex:<贴图键>）——bossGlbEnsure 完成后可取；没拆包 / 缺片返回 undefined */
export const raidLazyHas = (k: string) => RAID.ids.includes(k);
export const raidLazyGet = (k: string) => { const a = lazyParts.get(k); return a && a.every(x => x) ? a.join('') : undefined; };
/** A10：长副本首领绑骨件按需加载（幂等；没拆包 = 立即完成）。每块 <script> 注入，单块 40 秒超时 / 出错只记下跳过 */
export function bossGlbEnsure(): Promise<void> {
  if (lazyP) return lazyP;
  if (!LAZY_IDS.length || typeof document === 'undefined' || typeof atob !== 'function') return (lazyP = Promise.resolve());
  const W = window as unknown as { __drRaidQ?: [string, number, number, string][] };
  lazySt.state = 'loading'; const t0 = performance.now();
  lazyP = (async () => {
    const parts = lazyParts;
    for (const f of RAID.files) {
      const ok = await new Promise<boolean>(res => { const s = document.createElement('script'); let done = false; const fin = (v: boolean) => { if (!done) { done = true; res(v); } };
        s.src = `raid/${f}`; s.async = true; s.onload = () => fin(true); s.onerror = () => fin(false); setTimeout(() => fin(false), 90000); document.head.appendChild(s); });
      if (!ok) { lazySt.bad.push(f); console.warn('长副本资源分块加载失败（首领回退静态件）', f); }
      for (const [k, i, n, v] of W.__drRaidQ ?? []) { const a = parts.get(k) ?? new Array<string>(n).fill(''); a[i] = v; parts.set(k, a); }
      W.__drRaidQ = []; lazySt.got++;
    }
    // 超时的块可能稍后才执行完：缺片时再等一会儿（最多 30 秒）把迟到的队列收进来
    for (let w = 0; w < 30 && LAZY_IDS.some(id => { const a = parts.get(id + '_boss'); return !a || !a.every(x => x); }); w++) {
      await new Promise(r => setTimeout(r, 1000));
      for (const [k, i, n, v] of W.__drRaidQ ?? []) { const a = parts.get(k) ?? new Array<string>(n).fill(''); a[i] = v; parts.set(k, a); }
      W.__drRaidQ = [];
    }
    lazySt.ms = Math.round(performance.now() - t0); const t1 = performance.now();
    await parseIds(LAZY_IDS, id => { const a = parts.get(id + '_boss'); return a && a.every(x => x) ? a.join('') : undefined; });
    lazySt.parseMs = Math.round(performance.now() - t1); lazySt.state = 'done'; lazySt.warm = parsed.size ? 'pending' : 'no';
  })().catch(e => { lazySt.state = 'done'; console.warn('长副本资源加载出错（首领回退静态件）', e); });
  return lazyP;
}
/** A10 进副本预热：每位已解析首领建一个实例放进当前场景（视野外），compileAsync 预编译着色器 + 上传贴图，再移走——避免首次出场卡顿 */
export async function bossGlbWarm(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): Promise<void> {
  if (lazySt.warm !== 'pending' && !(lazySt.state === 'none' && parsed.size && lazySt.warm === 'no')) return;
  lazySt.warm = 'done'; const t0 = performance.now();
  const tmp = new THREE.Group(); tmp.name = 'wl_boss_warm';
  try {
    for (const id of parsed.keys()) { const g = makeBossGlb(id, 4); if (!g) continue; g.root.position.set(0, -400, 0); tmp.add(g.root); lazySt.warmN++; }
    scene.add(tmp); tmp.updateMatrixWorld(true);
    const rc = r as unknown as { compileAsync?: (s: THREE.Object3D, c: THREE.Camera, t?: THREE.Scene) => Promise<unknown> };
    if (rc.compileAsync) await rc.compileAsync(tmp, cam, scene); else r.compile(scene, cam);
    tmp.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const x of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) for (const t of [x.map, x.normalMap, x.emissiveMap, x.roughnessMap, x.metalnessMap]) if (t) r.initTexture(t); });
  } catch (e) { lazySt.warm = 'fail'; console.warn('首领预热失败（不影响游戏）', e); }
  scene.remove(tmp); lazySt.warmMs = Math.round(performance.now() - t0);
}

export interface BossGlbBuilt { root: THREE.Group; body: THREE.Group; poseG: THREE.Group; poser: BossPoser; clips: BossClipSet | null; mats: THREE.MeshStandardMaterial[]; fade: (k: number) => void; info: { bones: number; tris: number; height: number; clips: string[] } }
/** 构建里某首领件带了哪些骨骼动作（A9 逐招） */
export const bossGlbClips = (id: string) => { const p = parsed.get(id); return p ? p.anims.map(a => a.name) : []; };
/** 建一个实例：height = 本地显示身高（游戏再乘 mob.scale × 1.1）。没有 / 没解析完 = null */
export function makeBossGlb(id: string, height: number): BossGlbBuilt | null {
  const P = parsed.get(id); if (!P) return null;
  const src = P.scene;
  const scn = skClone(src) as THREE.Group;
  const B: Record<string, THREE.Bone> = {}, mats: THREE.MeshStandardMaterial[] = []; let skinned: THREE.SkinnedMesh | null = null, tris = 0;
  scn.traverse(o => {
    if ((o as THREE.Bone).isBone) B[o.name.replace(/^mixamorig:?/, '')] = o as THREE.Bone;
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    m.frustumCulled = false; m.castShadow = true;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = m as THREE.SkinnedMesh;
    tris += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
    const arr = (Array.isArray(m.material) ? m.material : [m.material]).map(x => { const c = (x as THREE.MeshStandardMaterial).clone(); c.envMap = propEnv(); c.envMapIntensity = 0.45; c.userData.outlineParameters = { visible: false }; c.userData.baseEmissive = 0; mats.push(c); return c; });
    m.material = Array.isArray(m.material) ? arr : arr[0];
  });
  const fish = FISH_IDS.has(id);
  if (!skinned || (!B.Hips && !fish)) return null;
  // 待机姿势 → 记下每根映射骨的本地 / 模型空间旋转
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  if (!fish) for (const [n, v] of Object.entries(IDLE)) { const b = B[n]; if (b) { e.set(v[0], v[1], v[2]); b.quaternion.multiply(q.setFromEuler(e)); } }
  scn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(skinned, true), H = box.max.y - box.min.y;
  const k = height / Math.max(1e-3, H);
  const L0 = new Map<THREE.Bone, THREE.Quaternion>(), W0 = new Map<THREE.Bone, { w: THREE.Quaternion; wi: THREE.Quaternion }>(), bones: [string, THREE.Bone][] = [];
  const sInv = scn.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const [n, mn] of Object.entries(MAP)) { const b = B[mn]; if (!b) continue; bones.push([n, b]); L0.set(b, b.quaternion.clone()); const w = sInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())); W0.set(b, { w, wi: w.clone().invert() }); }
  // A9：武器尖端（特效拖尾 / 出手点）：手骨下第一个非提灯刚性件，离挂点最远的顶点 = tip，离 tip 最远的顶点 = tail（几何按 id 缓存）
  const tips: Record<string, { o: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3 }> = {};
  for (const side of ['R', 'L'] as const) {
    const hand = B[side === 'R' ? 'RightHand' : 'LeftHand']; if (!hand) continue;
    const pm = hand.children.find(c => /^Prop_/.test(c.name) && !/Lantern/.test(c.name) && (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined; if (!pm) continue;
    const ck = id + ':' + pm.name; let tp = tipCache.get(ck);
    if (!tp) { const pa = pm.geometry.getAttribute('position'), v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(); let best = -1;
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const d = v.lengthSq(); if (d > best) { best = d; a.copy(v); } }
      best = -1; for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const d = v.distanceToSquared(a); if (d > best) { best = d; b.copy(v); } }
      tp = { a, b }; tipCache.set(ck, tp); }
    tips['tip' + side] = { o: pm, a: tp.a, b: tp.b };
  }
  const r = new THREE.Quaternion(), t = new THREE.Quaternion();
  const poser: BossPoser = {
    // 局部 = 待机局部 × (W⁻¹ · r · W)：r 是模型轴旋转，W = 该骨待机时的模型空间朝向（推导见 docs/长副本分支状态.md A8 段）
    apply(pose) { for (const [n, b] of bones) { const v = pose[n], l = L0.get(b)!; if (!v || (v[0] === 0 && v[1] === 0 && v[2] === 0)) { b.quaternion.copy(l); continue; } const W = W0.get(b)!; r.setFromEuler(e.set(v[0], v[1], v[2])); t.copy(W.wi).multiply(r).multiply(W.w); b.quaternion.copy(l).multiply(t); } },
    worldOf(n) {
      const tk = n.startsWith('tail') ? 'tip' + n.slice(4) : n, tp = tips[tk];
      if (tp) { tp.o.updateWorldMatrix(true, false); return tp.o.localToWorld((n.startsWith('tail') ? tp.b : tp.a).clone()); }
      const b = B[MAP[n] ?? n]; return b ? b.getWorldPosition(new THREE.Vector3()) : null; },
  };
  const scaleG = new THREE.Group(); scaleG.name = 'wl_boss_scale'; scaleG.scale.setScalar(k); scaleG.position.y = -box.min.y * k; scaleG.add(scn);
  const poseG = new THREE.Group(); poseG.name = 'wl_pose'; poseG.add(scaleG);
  const body = new THREE.Group(); body.add(poseG);
  const root = new THREE.Group(); root.name = 'wl_boss_' + id; root.add(body);
  // A10 预热钩子：这个首领第一次被渲染时拿到渲染器 / 场景 / 相机，把其余已解析首领预热（不依赖码头场景件；中 / 低画质也有效）
  if (lazySt.warm !== 'done' && lazySt.warm !== 'fail') { const hk = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); hk.frustumCulled = false;
    hk.onBeforeRender = (r, sc, c) => { hk.onBeforeRender = () => {}; if (lazySt.warm === 'pending') setTimeout(() => void bossGlbWarm(r, sc as THREE.Scene, c), 0); }; root.add(hk); }
  const fade = (f: number) => { for (const m of mats) { if (m.userData.op0 === undefined) { m.userData.op0 = m.opacity; m.userData.tr0 = m.transparent; } const tr = f < 1 || !!m.userData.tr0; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = m.userData.op0 * f; m.depthWrite = f > 0.6 || !m.userData.tr0; } };
  // A9：逐招骨骼动作（烘焙在 glb 里的 glTF animations）→ AnimationMixer，由 BossProcAnim 按红圈 / 读条剩余时间逐帧给时间与权重
  let clips: BossClipSet | null = null;
  if (P.anims.length) {
    const mixer = new THREE.AnimationMixer(scn), actions: Record<string, THREE.AnimationAction> = {}, meta: Record<string, BossClipMeta> = {};
    for (const c of P.anims) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; a.weight = 0; a.play(); actions[c.name] = a; const m = P.meta[c.name]; meta[c.name] = { dur: m?.dur || c.duration, hit: m?.hit ?? null, loop: !!m?.loop, zh: m?.zh ?? c.name }; }
    clips = { mixer, actions, meta };
  }
  return { root, body, poseG, poser, clips, mats, fade, info: { bones: Object.keys(B).length, tris: Math.round(tris), height, clips: P.anims.map(a => a.name) } };
}
