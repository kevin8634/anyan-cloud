// 角色模型：KayKit Adventurers（CC0）带骨骼动画；加载失败时退回方块模型
import * as THREE from 'three';
import { b64ToBuf } from './b64';   // fix1106 原生 base64 解码
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLB, TEX, HD_GLB } from './assets.gen';
import { HitMap } from './assethit';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { withKtx2 } from './ktx2';   // fix1106 KTX2 贴图
import { HD_RIGS, HD_MATS, HD_SKIN_MAT, HD_GAIN, calibrateHd, hdClips as hdPick, wantHd, mergeParts, retargetClips } from './rig';
import { toonGradient, addRim, refineChar, blobShadowTexture } from './gfx';

interface Loaded { scene: THREE.Object3D; height: number }
const loaded = new HitMap<string, Loaded>('MODEL');
/** v1.2.54 Lux3D 自动展 UV 的写实职业模型在 UV 接缝处法线是断开的（脸上接缝 74% 断开）→ 明暗一刀切，看着像脸上的黑条；
 *  同位置顶点的法线按夹角 < 75° 合并平均（保留真正的硬边），并转成浮点（原为 meshopt 量化） */
function weldNormals(root: THREE.Object3D) {
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry, pa = g.getAttribute('position'), na = g.getAttribute('normal'); if (!pa || !na) return;
    const n = pa.count, N = new Float32Array(n * 3), key = new Map<string, number[]>(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.set(na.getX(i), na.getY(i), na.getZ(i)).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z;
      const k = `${Math.round(pa.getX(i) * 4000)},${Math.round(pa.getY(i) * 4000)},${Math.round(pa.getZ(i) * 4000)}`; const l = key.get(k); if (l) l.push(i); else key.set(k, [i]); }
    const out = N.slice(), COS = Math.cos(75 * Math.PI / 180);
    for (const l of key.values()) { if (l.length < 2) continue;
      for (const i of l) { let x = 0, y = 0, z = 0; for (const j of l) { const d = N[i * 3] * N[j * 3] + N[i * 3 + 1] * N[j * 3 + 1] + N[i * 3 + 2] * N[j * 3 + 2]; if (d >= COS) { x += N[j * 3]; y += N[j * 3 + 1]; z += N[j * 3 + 2]; } }
        const L = Math.hypot(x, y, z) || 1; out[i * 3] = x / L; out[i * 3 + 1] = y / L; out[i * 3 + 2] = z / L; } }
    g.setAttribute('normal', new THREE.BufferAttribute(out, 3)); });
}
let clips: THREE.AnimationClip[] = [];
/** 11-06 片段的 glTF extras（hit = 出手时刻，秒） */
const clipExtras = new WeakMap<THREE.AnimationClip, Record<string, unknown>>();
/** v1.2.0-m1 写实模型（每套自己的片段；同模型的几何体 / 片段所有实例共享） */
const hdClips = new Map<string, THREE.AnimationClip[]>();
const textures = new HitMap<string, THREE.Texture>('TEX');


// fix1106：原 8 秒超时 → 慢机器上写实职业 / NPC / 套装件没解析完就进世界（之后现换装 = 游玩中现加载）。Loading 内必须解析完，放宽到 120 秒，超时报错
export async function loadCharacters(timeoutMs = 120000): Promise<boolean> {
  const loader = withKtx2(new GLTFLoader());
  const tl = new THREE.TextureLoader();
  for (const [k, url] of Object.entries(TEX)) {
    const t = tl.load(url); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter; textures.set(k, t);
  }
  const work = Promise.all(Object.entries(GLB).map(([name, b64]) => new Promise<void>((res, rej) => {
    loader.parse(b64ToBuf(b64), '', gltf => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      loaded.set(name, { scene: gltf.scene, height: box.max.y - box.min.y || 2.4 });
      if (gltf.animations.length) clips = gltf.animations;
      res();
    }, rej);
  })));
  const timeout = new Promise<'timeout'>(r => setTimeout(() => r('timeout'), timeoutMs));
  let ok = false;
  try { ok = (await Promise.race([work, timeout])) !== 'timeout' && loaded.size > 0; } catch (e) { console.warn('模型加载出错', e); return false; }
  if (ok && wantHd()) await ensureHd(timeoutMs);   // v1.2.4：写实模型按需加载（设置不是「写实」就不解析，省启动时间）
  return ok;
}
let hdP: Promise<void> | null = null;
/** 写实模型只加载一次；切到「写实」时调用 */
export function ensureHd(timeoutMs = 8000) { return hdP ??= loadHd(timeoutMs); }
/** v1.2.0-m1 写实模型：meshopt 解码 + 校准（失败只打日志，游戏继续用经典模型） */
async function loadHd(timeoutMs: number) {
  const entries = Object.entries(HD_GLB ?? {}); if (!entries.length) return;
  try {
    await MeshoptDecoder.ready;
    const loader = withKtx2(new GLTFLoader()); loader.setMeshoptDecoder(MeshoptDecoder);
    const ref = loaded.get('Knight');
    // v1.2.4：先全部解析（部件 GLB 没有 HD_RIGS 条目），再按「借动作 → 并部件 → 校准」处理；借动作要在源模型校准前做（原始坐标）
    const raw = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>();
    const parse = Promise.all(entries.map(([name, b64]) => new Promise<void>(res => {
      loader.parse(b64ToBuf(b64), '', gltf => { if (name.startsWith('LUX_')) weldNormals(gltf.scene);
        const ja = (gltf.parser?.json?.animations ?? []) as { extras?: Record<string, unknown> }[]; gltf.animations.forEach((c, i) => { if (ja[i]?.extras) clipExtras.set(c, ja[i].extras!); });   // 11-06 extras.hit 等
        raw.set(name, gltf); res(); }, e => { console.warn('写实模型解析失败', name, e); res(); });
    })));
    const work = parse.then(() => {
      const anims = new Map<string, THREE.AnimationClip[]>();
      for (const [name, g] of raw) {
        const rig = HD_RIGS[name]; if (!rig) continue;
        try {
          if (rig.parts) { const ps = rig.parts.filter(p => raw.has(p)); mergeParts(g.scene, ps.map(p => raw.get(p)!.scene), ps); }
          const src = rig.animFrom ? raw.get(rig.animFrom) : undefined;
          const an = src && rig.boneMap ? retargetClips(g.scene, src.scene, src.animations, rig.boneMap, HD_RIGS[rig.animFrom!]?.tpose, 30, rig.variants, !!rig.alignFrom) : g.animations;
          for (const x of rig.extraAnims ?? []) {   // v1.2.17 第二套动作库（Mixamo）
            const xs = raw.get(x.from); if (!xs) continue;
            try { an.push(...retargetClips(g.scene, xs.scene, xs.animations, x.boneMap, undefined, 30, x.variants ?? [], !!x.align)); } catch (e) { console.warn('动作库重定向失败', x.from, e); }
          }
          if (rig.ownClips && an !== g.animations) an.push(...g.animations.filter(c => rig.ownClips!.test(c.name)));   // 11-06 自带片段（团长逐招）
          anims.set(name, an);
        } catch (e) { console.warn('写实模型准备失败', name, e); }
      }
      for (const [name, g] of raw) {
        const rig = HD_RIGS[name], an = anims.get(name); if (!rig || !an) continue;
        try {
          const h = calibrateHd(g.scene, rig, an, ref?.scene ?? null, ref?.height ?? 2.4);
          loaded.set(name, { scene: g.scene, height: h }); hdClips.set(name, an);
        } catch (e) { console.warn('写实模型校准失败', name, e); }
      }
    });
    let late = false;
    await Promise.race([work, new Promise(r => setTimeout(() => { late = true; r(0); }, timeoutMs))]);
    if (late) console.error(`写实模型 ${timeoutMs / 1000} 秒内没解析完，剩余模型进世界后才到`);
  } catch (e) { console.warn('写实模型加载出错', e); }
}
/** 写实模型可用（设置允许 + 加载成功） */
export const useHd = (model: string) => wantHd() && hdClips.has(model) && loaded.has(model);
/** v1.2.36 写实模型已加载（不看设置；救援 NPC 用，配合 ensureHd 预加载） */
/** v1.2.48 内容包给 NPC 换模型的钩子表（models.ts makeNpcModel 读；放在 chars 里是因为它不依赖游戏数据，包注册时可以静态 import） */
/** 11-04 职业身体覆盖：内容包按身上装备决定换整套身体模型（例：DLC1 法师穿 40 级「潮汐长袍」→ LUX_Mage40Robe）；模型没加载时 models.ts 回落默认 */
export const CLASS_BODY_HOOKS: Array<(cls: string, equipped: Record<string, { lgId?: string; fixedId?: string; id?: string } | null | undefined>) => string | null> = [];
const bodyOverride: Record<string, string | null> = {};
/** 11-04 内容包登记各职业可能换上的身体（加载画面预载用） */
export const CLASS_BODY_VARIANTS: Record<string, string[]> = {};
export function setClassBody(cls: string, model: string | null) { bodyOverride[cls] = model; }
export function classBodyOf(cls: string) { return bodyOverride[cls] ?? null; }
/** fix1106（Rhett 17:09 第 8 条 / 18:57）：选角展示件每职业挂的固定装备 id（内容包登记，selectstage 读；mainHand / offHand 按物品槽位自动放） */
export const SELECT_SHOW_GEAR: Record<string, string[]> = {};
export const NPC_MODEL_HOOKS: Record<string, (kit: unknown, tint?: number, k?: number, base?: string) => unknown> = {};
export const hdAvailable = (model: string) => hdClips.has(model) && loaded.has(model);
export const charactersReady = () => loaded.size > 0 && clips.length > 0;
/** v1.2.17 这个模型是写实模型（已加载、有自己的片段） */
export const isHdModel = (model: string) => hdClips.has(model);

export type AnimName = 'idle' | 'run' | 'walk' | 'attack1' | 'attack2' | 'attack3' | 'spin' | 'heavy' | 'death' | 'hit' | 'cast' | 'castLong' | 'dash' | 'cheer' | 'punch' | 'interact' | 'shoot' | 'channel';
const CLIP: Record<AnimName, string> = {
  idle: 'Idle', run: 'Running_A', walk: 'Walking_A', attack1: '1H_Melee_Attack_Chop', attack2: '1H_Melee_Attack_Slice_Diagonal',
  attack3: '1H_Melee_Attack_Slice_Horizontal', spin: '2H_Melee_Attack_Spin', heavy: '2H_Melee_Attack_Chop', death: 'Death_A',
  hit: 'Hit_A', cast: 'Spellcast_Raise', castLong: 'Spellcast_Long', dash: 'Dodge_Forward', cheer: 'Cheer', punch: 'Unarmed_Melee_Attack_Punch_A', interact: 'Interact', shoot: 'Spellcast_Shoot', channel: 'Spellcasting',
};

/** v1.2.48 出手类动作（播放即视为「在战斗」：武器从收纳挂点取出，见 gear.ts gearStowTick） */
const COMBAT_ANIMS = new Set<AnimName>(['attack1', 'attack2', 'attack3', 'spin', 'heavy', 'cast', 'castLong', 'shoot', 'channel', 'punch', 'hit']);
/** 动画控制：循环层（待机/跑）+ 一次性动作（攻击/受击/死亡） */
export class CharAnim {
  mixer: THREE.AnimationMixer;
  /** v1.2.17：一个逻辑动作可有多个候选片段（受击随机挑一个） */
  private actions = new Map<AnimName, THREE.AnimationAction[]>();
  /** v1.2.48 原始动作表（武器握法覆盖前） */
  private baseActions = new Map<AnimName, THREE.AnimationAction[]>();
  /** v1.2.48 可选片段池（KayKit 共用 / 写实模型自己的） */
  private pool: THREE.AnimationClip[];
  private loopName: AnimName | null = null;
  private loopA: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;
  /** v1.2.48 武器收起时的放松待机（写实：UAL Idle_Loop；没有就用原待机） */
  private relaxIdle: THREE.AnimationAction | null = null;
  private relaxed = false;
  /** v1.2.48 动画自己的时钟（随 update 的 dt 走，暂停 / 顿帧一致）和最近一次出手动作的时刻 */
  clock = 0; actAt = -99; lastAct: AnimName | null = null;
  dead = false;
  constructor(root: THREE.Object3D, model?: string, clipSet?: string) {
    this.mixer = new THREE.AnimationMixer(root);
    const hc = model ? hdClips.get(model) : undefined, hr = model ? HD_RIGS[model] : undefined;
    this.pool = hc && hr ? hc : clips;
    for (const [k, n] of Object.entries(CLIP) as [AnimName, string][]) {
      const cs = hc && hr ? hdPick(hr, hc, k, clipSet) : clips.filter(x => x.name === n);
      if (cs.length) this.actions.set(k, cs.map(c => this.mixer.clipAction(c)));
    }
    this.baseActions = new Map(this.actions);
    if (hc && hr) { const r = hc.find(c => c.name === 'Idle_Loop'), cur = this.actions.get('idle')?.[0]; if (r && cur && cur.getClip() !== r) this.relaxIdle = this.mixer.clipAction(r); }
    this.mixer.addEventListener('finished', e => {
      if ((e as unknown as { action: THREE.AnimationAction }).action === this.oneShot && !this.dead) {
        this.oneShot.fadeOut(0.15); this.oneShot = null;
        const l = this.loopAct(); l?.reset().fadeIn(0.15).play(); this.loopA = l;
      }
    });
  }
  private pick(name: AnimName) { const l = this.actions.get(name); return l ? l[l.length > 1 ? Math.floor(Math.random() * l.length) : 0] : undefined; }
  private loopAct() { if (!this.loopName) return null; if (this.loopName === 'idle' && this.relaxed && this.relaxIdle) return this.relaxIdle; return this.actions.get(this.loopName)?.[0] ?? null; }
  /** 当前逻辑动作对应的片段名（测试用） */
  clipName(name: AnimName) { if (name === 'idle' && this.relaxed && this.relaxIdle) return this.relaxIdle.getClip().name; return (this.actions.get(name) ?? []).map(a => a.getClip().name).join('|'); }
  /** v1.2.48 距最近一次出手动作的秒数 */
  get actAge() { return this.clock - this.actAt; }
  /** v1.2.48 武器收起（放松待机）/ 取出（战斗待机）；循环层正在待机时淡入切换 */
  setRelaxed(v: boolean) {
    if (this.relaxed === v) return;
    this.relaxed = v;
    if (this.loopName !== 'idle' || this.oneShot || this.dead) return;
    const n = this.loopAct(); if (!n || n === this.loopA) return;
    n.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play(); this.loopA?.fadeOut(0.3); this.loopA = n;
  }
  /**
   * v1.2.48 按武器握法覆盖动作（双手巨剑 / 巨斧用双手劈砍）：names[动作] = 候选片段名（按顺序取第一个存在的，a|b = 随机）；
   * 不传 = 恢复职业原动作表
   */
  setWeaponClips(names?: Partial<Record<AnimName, string[]>>) {
    this.actions = new Map(this.baseActions);
    if (!names) return;
    for (const [k, list] of Object.entries(names) as [AnimName, string[]][]) {
      for (const n of list) {
        const cs = n.split('|').map(x => this.pool.find(c => c.name === x)).filter((c): c is THREE.AnimationClip => !!c);
        if (cs.length) { this.actions.set(k, cs.map(c => this.mixer.clipAction(c))); break; }
      }
    }
  }
  loop(name: AnimName, timeScale = 1) {
    if (this.dead) return;
    const prevName = this.loopName; this.loopName = name;
    const a = this.loopAct(); if (!a) { this.loopName = prevName; return; }
    a.timeScale = timeScale;
    if (prevName === name && a === this.loopA) return;
    const prev = this.loopA;
    if (this.oneShot) return;           // 动作播完再接
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.18).play();
    if (prev !== a) prev?.fadeOut(0.18);
    this.loopA = a;
  }
  play(name: AnimName, timeScale = 1) {
    if (this.dead && name !== 'death') return;
    const a = this.pick(name); if (!a) return;
    if (COMBAT_ANIMS.has(name)) { this.actAt = this.clock; this.lastAct = name; }
    this.oneShot?.stop();
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = timeScale;
    // 11-05 精英绑骨显示件实测：Mixamo 死亡 MX_Death 4.4 秒，敌人 1.2 秒起溶解 → 只放到半蹲；死亡动作统一压到 1.5 秒内倒地
    if (name === 'death') { const d = a.getClip().duration; if (d > 1.5) a.timeScale = Math.max(timeScale, d / 1.5); }
    a.fadeIn(0.06).play();
    this.loopA?.fadeOut(0.06);
    this.oneShot = a;
    if (name === 'death') this.dead = true;
  }
  /** 11-06 按片段名播一次（模型自带片段，如 SC_cleave）；返回片段时长，没有返回 0 */
  playClip(clipName: string, timeScale = 1): number {
    if (this.dead) return 0;
    const c = this.pool.find(x => x.name === clipName); if (!c) return 0;
    const a = this.mixer.clipAction(c);
    this.actAt = this.clock; this.lastAct = 'heavy';
    if (this.oneShot && this.oneShot !== a) this.oneShot.stop();
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = timeScale;
    a.fadeIn(0.1).play(); this.loopA?.fadeOut(0.1); this.oneShot = a;
    return c.duration / timeScale;
  }
  /** 11-06 自带片段的元数据（glTF extras，如 hit） */
  clipInfo(clipName: string) { const c = this.pool.find(x => x.name === clipName); return c ? { duration: c.duration, ...(clipExtras.get(c) as { hit?: number } | undefined) } : null; }
  /** 11-06 某个逻辑动作改用自带片段（含原始表，换武器不丢）；片段不存在返回 false */
  useClip(name: AnimName, clipName: string) { const c = this.pool.find(x => x.name === clipName); if (!c) return false; const l = [this.mixer.clipAction(c)]; this.actions.set(name, l); this.baseActions.set(name, l); return true; }
  revive() { this.dead = false; this.mixer.stopAllAction(); this.oneShot = null; this.loopA = null; const n = this.loopName ?? 'idle'; this.loopName = null; this.loop(n); }
  update(dt: number) { this.clock += dt; this.mixer.update(dt); }
}

/** v1.2.55 体型 +10%：所有人形角色（玩家 / NPC / 人形怪）统一放大，武器挂在骨骼上一起放大；非人形怪在 Enemy 构造里放大 */
export const BODY_SCALE = 1.1;
export interface CharOpts { model: string; tex: string; show: string[]; height: number; tint?: number; tintAmount?: number; emissive?: number; /** 写实模型：按原材质名配色（rig.ts HD_MATS） */ mats?: string; /** 写实模型：隐藏底座的这些网格 */ hideBase?: string[]; /** v1.2.17 写实模型：按职业的动作表（rig.ts HdRig.clipSets） */ clipSet?: string; /** v1.2.18 写实模型：只显示这些服装 GLB 的网格（不写 = 全显示） */ parts?: string[]; /** v1.2.36 不看「角色模型」设置，写实已加载就用（副本救援 NPC） */ forceHd?: boolean }

/** 生成一个角色实例（每个实例自己的材质，受击闪白互不影响） */
/** v1.2.37e 写实（Lux3D）材质：整件模型只有一张烘焙贴图 → 不再叠职业染色 / 灰底色（会把脸一起压暗）；
 *  片元里把贴图暗部按亮度抬一点（烘焙进贴图的眼窝 / 鼻翼 / 发际阴影在俯视镜头下会变成黑块），亮部不动 */
export function luxStd(map: THREE.Texture | null) {
  const m = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.74, metalness: 0.05 });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float lu = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float k = 1.0 - smoothstep(0.04, 0.38, lu);
        diffuseColor.rgb = mix(diffuseColor.rgb, sqrt(diffuseColor.rgb) * 0.62 + diffuseColor.rgb * 0.38, k * 0.65) + vec3(0.02) * k; }`);
  };
  m.customProgramCacheKey = () => 'luxStd1';
  m.userData.lux = true;
  return m;
}
export function makeCharacter(o: CharOpts): { root: THREE.Group; anim: CharAnim; mats: THREE.MeshToonMaterial[] } | null {
  const src = loaded.get(o.model);
  if (!src || !clips.length) return null;
  if (hdClips.has(o.model) && !wantHd() && !o.forceHd) return null;
  const inst = SkeletonUtils.clone(src.scene) as THREE.Object3D;
  const mats: THREE.MeshToonMaterial[] = [];
  const hd = hdClips.has(o.model);
  const map = hd ? null : textures.get(o.tex) ?? null;
  const hdCol = hd ? HD_MATS[o.mats ?? 'warrior'] ?? {} : {};
  let faceN = 0;   // 11-08 05 选角脸 v2：MI_LuxFace 多层共面透明图元按图元顺序画，后画的盖前面
  inst.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    if (hd && o.hideBase?.includes(m.name)) { m.visible = false; return; }   // v1.2.18：底座和服装网格都可按名字藏
    if (hd && typeof m.userData.part === 'string' && o.parts && !o.parts.includes(m.userData.part)) { m.visible = false; return; }
    const isBody = hd || /_(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight)$/.test(m.name);
    m.visible = isBody || o.show.includes(m.name);
    m.castShadow = true;
    const srcName = ((m.material as THREE.Material | undefined)?.name) ?? '';
    const color = new THREE.Color(hd ? hdCol[srcName] ?? 0xb0b0b0 : 0xffffff);
    if (o.tint !== undefined && !(hd && HD_SKIN_MAT.test(srcName))) color.lerp(new THREE.Color(o.tint), o.tintAmount ?? 0.35);   // v1.2.18 写实：职业染色只染衣服
    if (hd && !HD_SKIN_MAT.test(srcName)) color.multiplyScalar(HD_GAIN[o.mats ?? ''] ?? 1);   // v1.2.20 写实衣物提亮
    const hmap = hd ? ((m.material as THREE.MeshStandardMaterial | undefined)?.map ?? null) : map;   // v1.2.4 UBC / Outfits 带贴图
    // v1.2.26 比赛版 Lux3D 模型：烘焙的写实贴图走标准 PBR（卡通两段明暗 + 描边会把写实贴图切成色块和白边）
    const luxMat = hd && /(^|_)lux$/.test(o.mats ?? '');
    if (luxMat && hmap) { hmap.anisotropy = 8; hmap.needsUpdate = true; }
    const mat = luxMat
      ? luxStd(hmap) as unknown as THREE.MeshToonMaterial
      : new THREE.MeshToonMaterial({ map: hmap, color, gradientMap: toonGradient() });
    if (luxMat) {   // 11-08 05 选角 PBR 版：沿用 GLB 自带的金属度 / 粗糙度贴图与顶点 AO（COLOR_0）
      const om = m.material as THREE.MeshStandardMaterial | undefined, sm = mat as unknown as THREE.MeshStandardMaterial;
      if (om && (om.metalnessMap || om.roughnessMap)) { sm.metalnessMap = om.metalnessMap; sm.roughnessMap = om.roughnessMap; sm.metalness = om.metalness; sm.roughness = om.roughness; }
      if (m.geometry.getAttribute('color')) sm.vertexColors = true;
    }
    if (luxMat && srcName === 'MI_LuxFace') {   // v1.2.54 脸部高清贴花层：半透明叠在原脸上（边缘羽化），不写深度、往前偏移防闪
      mat.transparent = true; mat.depthWrite = false; mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
      m.renderOrder = 2 + faceN++ * 0.01; m.castShadow = false; m.receiveShadow = false;
    }
    if (o.emissive) mat.emissive.setHex(o.emissive);
    mat.userData.baseEmissive = o.emissive ?? 0;
    if (!luxMat) refineChar(mat, src.height);   // v0.9.1g 材质精修（含 v0.9.1 边缘光）
    mat.userData.outlineParameters = luxMat ? { visible: false } : { thickness: 0.0046, color: [0.09, 0.05, 0.04], alpha: 0.95 };   // 暖褐描边，比纯黑柔和
    m.material = mat; mats.push(mat);
    m.frustumCulled = false;
  });
  const root = new THREE.Group();
  const s = o.height * BODY_SCALE / src.height;
  inst.scale.setScalar(s);
  root.add(inst);
  // v0.9.1g 贴地接触阴影：2.5D 俯角下让角色「站」在地上（阴影贴图关闭的低画质也有）
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
  blob.material.userData.outlineParameters = { visible: false };
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.025; blob.scale.setScalar(o.height * BODY_SCALE * 0.42); blob.renderOrder = 1; blob.name = 'blob';
  root.add(blob);
  root.userData.bodyScaled = true;
  root.userData.model = o.model; root.userData.tex = o.tex; root.userData.tint = o.tint; root.userData.tintAmount = o.tintAmount;
  return { root, anim: new CharAnim(inst, o.model, o.clipSet), mats };
}

// ---------------------------------------------------------------- 装备外观用：跨模型取道具网格、绑定姿势
/** 原始（未动画、未缩放）模型场景：用来算骨骼的绑定姿势 */
export function sourceScene(model: string): THREE.Object3D | null { return loaded.get(model)?.scene ?? null; }
export function modelHeight(model: string) { return loaded.get(model)?.height ?? 2.4; }
const PROP_TEX: Record<string, string> = { Knight: 'knight', Barbarian: 'barbarian', Mage: 'mage', Rogue: 'rogue', Rogue_Hooded: 'rogue' };
/** 从某个模型里克隆一件道具网格（武器、盾、头盔…），带它自己的贴图；返回网格和它在原模型里挂的骨骼名 */
export function propClone(model: string, mesh: string): { mesh: THREE.Mesh; bone: string; mat: THREE.MeshToonMaterial } | null {
  const src = loaded.get(model); if (!src) return null;
  const m = src.scene.getObjectByName(mesh) as THREE.Mesh | undefined;
  if (!m || !(m as THREE.Mesh).isMesh) return null;
  const c = m.clone() as THREE.Mesh;
  const mat = new THREE.MeshToonMaterial({ map: textures.get(PROP_TEX[model] ?? 'knight') ?? null, color: 0xffffff, gradientMap: toonGradient() });
  refineChar(mat, 0);   // v0.9.1g 武器 / 盾：金属高光与磨损亮边
  mat.userData.baseEmissive = 0;
  c.material = mat; c.visible = true; c.castShadow = true; c.frustumCulled = false;
  return { mesh: c, bone: m.parent?.name ?? 'handslot.r', mat };
}
/** v1.2.17 调试 / 截图脚本用：写实模型的全部片段（dev/modelshots.mjs、dev/probe.mjs） */
(globalThis as unknown as Record<string, unknown>).__hdClips = hdClips;
