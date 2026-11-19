// v1.2.49 角色选择画面（重做）：实时 3D 背景 + 全部职业弧形站位（A 态）/ 点选后镜头推近、右侧详情面板（B 态）
//   背景：内容包提供 PackManifest.selectStage 时用它（区域 + 机位 + 站位弧线），没有 = 本体灰石营地
//   站位：每个职业一个展示模型；当前选中的职业那一位由玩家模型站（穿着选中角色的配色 / 装备，招牌技能演示也在它身上）
//   名字牌（#class-pick 的子元素）每帧按模型投影摆在脚下；B 态改成底部头像条（CSS 控制）
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CLASSES, ClassId } from '../data/classes';
import { packSelectStage, PackSelectStage } from '../core/ContentPacks';
import * as M from './models';
import { applyGear, updateGear } from './gear';
import { SELECT_SHOW_GEAR } from './chars';
import { gearStowTick } from './weaponstow';
import { curQuality } from './gfx';
import { isWildId, WildId } from '../data/zones_wild';
import { updateWild } from './wild';
import type { Ctx } from './main';
import { selectBgEnter, selectBgLeave, selectBgTick, selectBgPreload } from './selectbg';

type Stage = PackSelectStage & { own: boolean };
/** Rhett 11-18 选角扩展钩子：内容包的选角界面 / 背景（本体不注册 = 行为不变）。
 *  prepare：加载时（selectPrepare 之后、预编译之前）往场景里加东西，会被一起编译；tick：3D 选角每帧（本体摆完站位 / 灯之后）；leave：进游戏前 */
export interface SelectHookCtx { scene: THREE.Scene; camera: THREE.PerspectiveCamera; focus: boolean; gate: boolean; chosen: string; figs: { id: string; root: THREE.Object3D }[]; player: THREE.Object3D | null; ring: THREE.Object3D | null }
export interface SelectHook { prepare?(c: SelectHookCtx): void; tick?(dt: number, c: SelectHookCtx): void; leave?(c: SelectHookCtx): void;
  /** 详情态（B 态）镜头取景：可改写目标机位 p / 看点 l / 视角 fov（返回新 fov 或不返回）；本体算完默认特写后、插值前调用 */
  focusCam?(c: SelectHookCtx, p: THREE.Vector3, l: THREE.Vector3, fov: number): number | void }
/** 注册表挂在 window.__drSelHooks（内容包不用 import 本体模块即可注册，避免改动 DLC 启动顺序） */
const hookList = (): SelectHook[] => { const w = window as unknown as { __drSelHooks?: SelectHook[] }; return (w.__drSelHooks ??= []); };
export function selectHook(h: SelectHook) { hookList().push(h); }
function hookCtx(): SelectHookCtx { return { scene: CX.scene as THREE.Scene, camera: CX.camera, focus: focusOn, gate, chosen: CX.chosen, figs: figs.map(f => ({ id: f.id, root: f.rig.root })), player: CX.player?.rig.root ?? null, ring }; }
function runHooks(k: 'prepare' | 'leave' | 'tick', dt = 0) { const hooks = typeof window === 'undefined' ? [] : hookList(); if (!hooks.length) return; const c = hookCtx(); for (const h of hooks) { try { if (k === 'tick') h.tick?.(dt, c); else h[k]?.(c); } catch (e) { console.error('选角钩子出错', k, e); } } }


/** 本体营地：营火南侧，镜头低一点朝北看营地（营火 + 帐篷 + 传送阵做背景） */
const CAMP_STAGE: PackSelectStage = { map: 'camp', cam: [0.6, 2.4, 12.6, 0, 1.5, 0], arc: { x: 0, z: 7, r: 5, span: 1.2 }, fov: 55, focus: { dist: 4.8, h: 1.4, side: 1.3 } };

let CX!: Ctx;
let stage: Stage | null = null;
let figs: { id: ClassId; rig: M.Rig; x: number; z: number; y: number; yaw: number; tx: number; tz: number }[] = [];
/** fix1107 每个职业选角展示的暗金（玩家模型站上去时也穿这套，Rhett：点击后武器变回原来的） */
const figEq: Partial<Record<ClassId, Record<string, unknown>>> = {};
let laidFor: ClassId | null = null, snap = true;
let keyL: THREE.SpotLight | null = null, rimL: THREE.SpotLight | null = null, fillL: THREE.PointLight | null = null;
// 11-08 05（Rhett 18:14「都做出来」）选角三点布光 + 环境贴图：主光（斜前上 45°，暖白，投影）/ 补光（另一侧，冷色，约主光 35%，不投影）/ 轮廓光（后上方，强，勾头发与肩甲边）；
//   半球光压低出明暗；scene.environment = RoomEnvironment PMREM（金属甲片才有反光），选角期间曝光 0.95 防脸过曝，离开全部还原。边缘光只靠轮廓灯（不改材质）。
let selRenderer: THREE.WebGLRenderer | null = null, envTex: THREE.Texture | null = null, env0: THREE.Texture | null = null, envI0 = 1, exp0 = -1;
export function setSelRenderer(r: THREE.WebGLRenderer) { selRenderer = r; }
/** Rhett 11-18 选角暗角（?off=seldof 关）：main 交进来的回调（Pipeline.setSelVignette） */
let selVig: ((k: number) => void) | null = null;
export function setSelVignette(f: (k: number) => void) { selVig = f; }
const SEL_VIG = 0.62;
function selEnvOn() {
  const sc = CX.scene as THREE.Scene;
  if (!envTex && selRenderer) { try { const pm = new THREE.PMREMGenerator(selRenderer); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch (e) { console.warn('选角环境贴图', e); } }
  if (envTex && sc.environment !== envTex) { env0 = sc.environment; envI0 = sc.environmentIntensity ?? 1; sc.environment = envTex; sc.environmentIntensity = 0.5; }
  if (selRenderer && exp0 < 0) { exp0 = selRenderer.toneMappingExposure; selRenderer.toneMappingExposure = 0.95; }
}
/** 选角三盏灯（亮度 0 起步）：11-14 预热时就加进场景，点「创建角色」不再因灯数变化让全场材质重编译 */
function ensureSelLights() {
  if (keyL) return;
  keyL = new THREE.SpotLight(0xfff0dc, 0, 14, 0.62, 0.65, 1.4); rimL = new THREE.SpotLight(0xe8f2ff, 0, 12, 0.7, 0.7, 1.4); fillL = new THREE.PointLight(0x9cb8ff, 0, 10, 1.6);
  keyL.castShadow = curQuality !== 'low'; keyL.shadow.mapSize.set(1024, 1024); keyL.shadow.bias = -0.0004; keyL.shadow.normalBias = 0.02; rimL.castShadow = false;
  CX.scene.add(keyL, keyL.target, rimL, rimL.target, fillL);
}
/** ?off=<名> 或 localStorage darkrock_cine_off 含该名 → 关掉对应改动（逐项对比用） */
export function selOff(k: string) {
  try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').some(n => n.trim() === k); } catch { return false; }
}
/** 11-14（Rhett「创建角色按钮点击后进去很慢」）：加载画面里预热 3D 选角。
 *  Rhett 11-18 修（?off=selprewarm 回旧）：11-14 写好的预热从没被调用过；且首屏（gate）时场景雾被置空、其余物体全藏（藏起来的组里的灯不计数），
 *  加载时的整场景编译按「无雾 + 少灯」生成程序 → 点「创建角色」时 selectBgLeave 还原雾、setZoneLook 显出镜渊城组（带灯）、再加选角三盏灯 + RoomEnvironment PMREM，
 *  灯数 / 雾 / 环境贴图三项都变 → 全场材质在点击那一帧同步重编译。
 *  现在 main 在「预编译着色器」前调用 selectWarm(true)：把场景摆成 3D 选角第一帧的状态（雾、区域、灯、环境贴图、职业模型可见），编译完 selectWarm(false) 还原首屏；
 *  three 按材质缓存多份程序，点按钮时只是切换已编译好的程序 */
let warmed = false, warmZone: string | null = null;
export function selectWarm(on: boolean) {
  if (!active || !stage || /[?&]nowarm\b/.test(location.search) || selOff('selprewarm')) return;
  if (on) {
    if (gate) { warmZone = String(CX.zone); selectBgLeave(CX.scene); enterStage(); warmed = true; }
    ensureSelLights(); selEnvOn();
    for (const f of figs) f.rig.root.visible = !stage?.solo;
    if (selRenderer) { const seen = new Set<THREE.Texture>();
      const roots = figs.map(f => f.rig.root as THREE.Object3D);
      if (warmed && stage.map !== 'camp' && isWildId(stage.map) && !selOff('selprewarm')) { const w = CX.wilds[stage.map as WildId]; if (w) roots.push(w.group); }   // Rhett 11-18：首屏时选角区域从没画过，贴图也没上传——一并上传
      for (const r of roots) r.traverse(o => { const ms = (o as THREE.Mesh).material; if (!ms) return;
        for (const m of (Array.isArray(ms) ? ms : [ms]) as unknown as Record<string, unknown>[]) for (const v of Object.values(m)) if (v instanceof THREE.Texture && !seen.has(v)) { seen.add(v); try { selRenderer!.initTexture(v); } catch { /* 视频 / 画布贴图跳过 */ } } }); }
  } else {
    if (!warmed) return;   // 非首屏（本体营地）：已经在 3D 选角里，保持
    warmed = false;
    leaveStage();
    if (warmZone) { CX.setZoneLook(warmZone as never); warmZone = null; }
    selEnvOff();
    for (const f of figs) f.rig.root.visible = false;
    selectBgEnter(CX.scene, bgSrc!.bg, bgSrc!.video, () => false);
  }
}
function selEnvOff() {
  const sc = CX.scene as THREE.Scene;
  if (envTex && sc.environment === envTex) { sc.environment = env0; sc.environmentIntensity = envI0; env0 = null; }
  if (selRenderer && exp0 >= 0) { selRenderer.toneMappingExposure = exp0; exp0 = -1; }
}
let active = false, focusOn = false, hover: ClassId | null = null;
let t = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camInit = { v: false };
let ring: THREE.Mesh | null = null;
let hemi0 = -1;
let lastMs = 0;
const hidden: THREE.Object3D[] = [];
let fov0 = 55;
/** v1.2.76 首屏（Rhett 11-03 14:04）：内容包给了画面背景时，先只放循环背景 + 前景举火把的剪影人 + 「创建角色」按钮；
 *  点按钮才进实时 3D 选角（职业站位），且 3D 选角里的 NPC 全部藏起来（挡人、难看） */
let gate = false;
let bgSrc: { bg: string; video?: string[] } | null = null;
const hidNpc: THREE.Object3D[] = [];
export const selectGated = () => gate && active;

/** 调试 / 截图调参：window.__selTune = { cam, arc, fov, focus } 覆盖当前背景参数（下一帧生效） */
type Tune = Partial<PackSelectStage>;
const tune = () => (window as unknown as { __selTune?: Tune }).__selTune;

function pickStage(): Stage {
  const p = packSelectStage();
  const lowDevice = curQuality === 'low' || CX.isTouch;
  bgSrc = p?.bg ? { bg: p.bg, video: p.bgVideo } : null;
  if (bgSrc) selectBgPreload(bgSrc.bg, bgSrc.video);   // fix1106：载入画面期间就解码好视频，选角进来直接是视频第一帧
  // v1.2.76 画面背景只做首屏；3D 选角照常用包的区域（低画质 / 触屏退回营地）
  if (p && (!lowDevice || p.lowOk) && (p.map === 'camp' || isWildId(p.map))) return { ...p, own: false };
  return { ...CAMP_STAGE, own: true };
}
const S = (): PackSelectStage => ({ ...stage!, ...(tune() ?? {}) });

export function bindSelect(ctx: Ctx) { CX = ctx; }
export const selectActive = () => active;
export const selectFocused = () => focusOn;
export function selectInfo() { return { active, gate, npcVis: CX.npcs.filter(n => n.rig.root.visible).length, focus: focusOn, map: stage?.map ?? null, own: stage?.own ?? null, figs: figs.map(f => f.id), hover }; }

/** 加载阶段调用：生成背景区域（计进加载进度之前的同步段）、职业展示模型 */
export function selectPrepare() {
  stage = pickStage();
  const map = stage.map;
  if (map !== 'camp' && isWildId(map)) {
    try { CX.ensureWild(map as WildId); } catch (e) { console.warn('选角背景生成失败，退回营地', e); stage = { ...CAMP_STAGE, own: true }; }
  }
  for (const f of figs) CX.scene.remove(f.rig.root);
  figs = [];
  for (const c of Object.values(CLASSES)) {
    let rig: M.Rig;
    try { rig = M.makeClassRig(c.id, 0); } catch (e) { console.warn('职业展示模型失败', c.id, e); continue; }
    rig.root.userData.cls = c.id; rig.root.userData.selFig = true;
    const eq: Record<string, unknown> = {};   // fix1106：展示内容包登记的暗金（双手 1 件 / 单手 + 副手 2 件）；生成失败要报
    for (const fid of SELECT_SHOW_GEAR[c.id] ?? []) { try { const it = CX.gen.generateFixed(fid, 95) as { slot?: string } | null; if (!it) { console.error('选角暗金生成失败', c.id, fid); continue; } eq[it.slot === 'offHand' ? 'offHand' : 'mainHand'] = it; } catch (e) { console.error('选角暗金生成失败', c.id, fid, e); } }
    figEq[c.id] = eq;
    try { applyGear(rig, c.id, eq as Parameters<typeof applyGear>[2]); } catch { /* 没有武器挂点就不挂 */ }
    rig.anim?.loop('idle');
    CX.scene.add(rig.root);
    figs.push({ id: c.id, rig, x: 0, z: 0, y: 0, yaw: 0, tx: 0, tz: 0 });
  }
  if (!ring) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');   // v1.2.49 无 2D 画布的环境（无头测试）跳过光圈渐变，不让选角初始化崩掉
    if (g) { const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,170,60,0.9)'); gr.addColorStop(0.45, 'rgba(255,130,30,0.45)'); gr.addColorStop(0.8, 'rgba(255,110,20,0.12)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2;
    CX.scene.add(ring);
  }
  enter();
  runHooks('prepare');
}

function ground(x: number, z: number) {
  const map = stage!.map;
  if (map !== 'camp' && isWildId(map)) { const w = CX.wilds[map as WildId]; if (w) return w.hf.at(x, z); }
  return 0;
}

/** 摆站位：弧线凸向镜头，每位面向镜头。
 *  fix1107（Rhett：点中的角色要站到正中间）：选中的职业站弧线正中 arc.(x,z)，其余按原顺序排在两边（前一半左、后一半右，间距不变）；
 *  换选中时各自走到新位置（selectTick 里平滑过去），首次 / 进 3D 选角时直接摆好 */
function layout() {
  const s = S(), [cx, , cz] = s.cam, A = s.arc;
  const to = new THREE.Vector2(cx - A.x, cz - A.z).normalize();
  const ox = A.x - to.x * A.r, oz = A.z - to.y * A.r;   // 圆心在站位后面
  const n = figs.length, step = n > 1 ? A.span / (n - 1) : 0;
  const sel = figs.findIndex(f => f.id === CX.chosen);
  const rest = figs.filter((_, i) => i !== sel), nl = Math.floor(rest.length / 2);
  const thOf = new Map<typeof figs[number], number>();
  // 11-08 Rhett：不要人闪过来，站位固定原顺序，改成镜头移到选中角色正中（selectCamera）
  if (s.solo) figs.forEach(f => thOf.set(f, 0));   // 11-18 solo：只站选中的那一位，摆在弧线正中
  else if (false && sel >= 0) { thOf.set(figs[sel], 0); rest.forEach((f, j) => thOf.set(f, j < nl ? (nl - j) * step : -(j - nl + 1) * step)); }   // th > 0 = 画面左边
  else figs.forEach((f, i) => thOf.set(f, n > 1 ? (0.5 - i / (n - 1)) * A.span : 0));
  figs.forEach(f => {
    const th = thOf.get(f) ?? 0;
    const c = Math.cos(th), sn = Math.sin(th);
    const dx = to.x * c - to.y * sn, dz = to.x * sn + to.y * c;
    f.tx = ox + dx * A.r; f.tz = oz + dz * A.r;
    if (snap) { f.x = f.tx; f.z = f.tz; }
    f.y = ground(f.x, f.z);
    f.yaw = Math.atan2(cx - f.x, cz - f.z);
  });
  laidFor = CX.chosen; snap = false;
}
/** fix1107 换位：走向目标位置（约 0.5 秒），边走边贴地、面向镜头 */
function glide(dt: number) {
  const s = S(), [cx, , cz] = s.cam, k = 1 - Math.exp(-Math.min(0.1, dt) * 7);
  for (const f of figs) {
    if (Math.abs(f.tx - f.x) + Math.abs(f.tz - f.z) < 1e-3) continue;
    f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k; f.y = ground(f.x, f.z); f.yaw = Math.atan2(cx - f.x, cz - f.z);
  }
}

function enter() {
  if (!stage) return;
  active = true; focusOn = false; camInit.v = false;
  fov0 = CX.camera.fov;
  hemi0 = CX.hemi.intensity;
  gate = !!bgSrc;
  if (gate) {   // 首屏：整个场景藏起来，只画背景（含剪影人）
    for (const f of figs) f.rig.root.visible = false;
    if (ring) ring.visible = false;
    selectBgEnter(CX.scene, bgSrc!.bg, bgSrc!.video, () => false);
  } else enterStage();
  document.documentElement.classList.add('selui');
  document.documentElement.classList.toggle('selgate', gate);
}

/** 实时 3D 选角：区域 / 站位 / 藏怪和 NPC */
function enterStage() {
  const map = stage!.map, z = map === 'camp' ? 'world' : map;
  CX.setZoneLook(z as never);
  hidden.length = 0;
  for (const e of CX.enemies) if (e.z === z && e.rig.root.visible) { e.rig.root.visible = false; hidden.push(e.rig.root); }
  hidNpc.length = 0;
  for (const n of CX.npcs) if (n.rig.root.visible) { n.rig.root.visible = false; hidNpc.push(n.rig.root); if (n.plate) n.plate.style.visibility = 'hidden'; }
  for (const f of figs) f.rig.root.visible = !stage?.solo;
  camInit.v = false;
  snap = true; layout();
}

/** Rhett 11-18：enterStage 的反操作（预热后回首屏用）：怪 / NPC / 名字牌还原 */
function leaveStage() {
  for (const o of hidden) o.visible = true; hidden.length = 0;
  for (const o of hidNpc) o.visible = true; hidNpc.length = 0;
  for (const n of CX.npcs) if (n.plate) n.plate.style.visibility = '';
}

/** 首屏「创建角色」→ 进 3D 选角 */
let openT = 0, openN = 0;
/** 11-14：点「创建角色」到 3D 选角第一帧画完的耗时 → 控制台 + 桌面版 launch.log（selopen 行） */
function openLog() {
  if (!openT || ++openN < 2) return;
  const ms = Math.round(performance.now() - openT); openT = 0;
  console.info(`selopen ${ms}ms`); try { (window as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log?.(`selopen ${ms}ms`); } catch { /* 网页版无日志 */ }
}
export function selectOpenStage() {
  if (!active || !gate) return;
  gate = false; openT = performance.now(); openN = 0;
  selectBgLeave(CX.scene);
  enterStage();
  document.documentElement.classList.remove('selgate');
}

/** 展示放大：记住模型原本的缩放，按倍数放大（离开时还原） */
function scaleRig(r: M.Rig, k: number) {
  const ud = r.root.userData; if (ud.selBase === undefined) ud.selBase = r.root.scale.x;
  const want = (ud.selBase as number) * k; if (Math.abs(r.root.scale.x - want) > 1e-4) r.root.scale.setScalar(want);
}

/** 进入游戏前：还原区域、镜头、玩家模型（startChar 之后自己摆位置） */
export function selectLeave() {
  selectBgLeave(CX.scene);   // v1.2.88 首屏直接开局（没进 3D 选角）时也要还原背景 / 雾，否则换图抛错卡加载画面
  selVig?.(0);
  if (!active) return;
  runHooks('leave');
  active = false; focusOn = false;
  selectBgLeave(CX.scene);
  for (const f of figs) f.rig.root.visible = false;
  for (const o of hidden) o.visible = true; hidden.length = 0;
  for (const o of hidNpc) o.visible = true; hidNpc.length = 0;
  for (const n of CX.npcs) if (n.plate) n.plate.style.visibility = '';
  gate = false; document.documentElement.classList.remove('selgate');
  if (ring) ring.visible = false;
  if (keyL) { CX.scene.remove(keyL, keyL.target, rimL!, rimL!.target, fillL!); keyL = rimL = fillL = null; }   // 进游戏后不留额外灯（每个材质都要多算三盏灯）
  selEnvOff();
  if (hemi0 >= 0) { CX.hemi.intensity = hemi0; hemi0 = -1; }
  if (CX.player) { const r = CX.player.rig.root; r.visible = true; delete r.userData.selFx; if (r.userData.selBase !== undefined) { r.scale.setScalar(r.userData.selBase as number); delete r.userData.selBase; } }
  if (stage && stage.map !== 'camp') CX.setZoneLook('world');
  CX.camera.fov = fov0; CX.camera.updateProjectionMatrix();
  document.documentElement.classList.remove('selui');
}

export function selectFocus(on: boolean) { focusOn = on && active; }
/** 11-18 Rhett：包要求只站一位（solo）时，旧 A 态选人画面整个删除——没进详情前主场景不渲染（main 直接清屏） */
export const selectBlank = () => active && !gate && !focusOn && !!stage?.solo;

/** 每帧（标题画面）：站位、动画、名字牌位置、镜头目标 */
export function selectTick(dt: number) {
  if (!active || !stage || !CX.player) return;
  t += dt;
  if (gate) { CX.player.rig.root.visible = false; selectBgTick(CX.scene, dt); return; }
  openLog();
  if (selVig && !selOff('seldof')) selVig(SEL_VIG);
  if (tune() || laidFor !== CX.chosen) layout();
  glide(dt);
  const P = CX.player, pc = (P.rig.root.userData.cls as ClassId) ?? CX.chosen;
  const s = S(), sc = s.arc.scale ?? 1;
  for (const f of figs) {
    const mine = f.id === pc;
    f.rig.root.visible = !mine && !s.solo;
    if (mine) {
      P.pos.set(f.x, f.y, f.z); P.rig.root.rotation.y = f.yaw; P.rig.root.visible = true; scaleRig(P.rig, sc);
      // fix1107：玩家模型站上来时也穿这个职业的展示暗金（titleModel / refreshGear 换回存档装备后，下一帧再套回来）；进游戏时 startChar 会 refreshGear(true) 还原
      // Rhett 11-18：选中的是存档里的角色时，站上来的就是它实际穿戴（套装 / 武器 / 铸造台换过的武器模型由 titleModel → applyGear 按存档挂上），不再套展示暗金。?off=selsavegear 回旧
      const saved = !selOff('selsavegear') && CX.roster?.slots?.[CX.selSlot]?.classId === f.id;
      const eq = saved ? undefined : figEq[f.id], ud = P.rig.root.userData;
      if (eq && Object.keys(eq).length && (ud.selFx === undefined || ud.selFx !== ud.gearFx)) { try { applyGear(P.rig, f.id, eq as Parameters<typeof applyGear>[2]); } catch (e) { console.error('选角暗金套到玩家模型失败', f.id, e); } ud.selFx = ud.gearFx; }
    }
    else {
      f.rig.root.position.set(f.x, f.y, f.z); f.rig.root.rotation.y = f.yaw; scaleRig(f.rig, sc);
      f.rig.anim?.update(dt); updateGear(f.rig, dt); gearStowTick(f.rig, dt, false);
    }
  }
  const sel = figs.find(f => f.id === CX.chosen);
  if (ring && sel) { ring.visible = true; ring.position.set(sel.x, sel.y + 0.06, sel.z); const k = 1 + Math.sin(t * 2.2) * 0.06; ring.scale.set(k, k, k); (ring.material as THREE.MeshBasicMaterial).opacity = focusOn ? 0.7 : 0.5; }
  // v1.2.54 选角打光：选中职业补一盏暖色主光（脸看得清）+ 背后青色轮廓光；B 态更亮。离开时关掉
  ensureSelLights();
  selEnvOn();
  if (!keyL) return;
  if (sel) {
    const sc = s.arc.scale ?? 1, dx = s.cam[0] - sel.x, dz = s.cam[2] - sel.z, L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L, rx = fz, rz = -fx;   // f = 朝镜头，r = 屏幕右
    const H = 1.9 * sc;
    keyL.position.set(sel.x + (fx * 2.4 + rx * 2.4) * sc, sel.y + H + 1.6 * sc, sel.z + (fz * 2.4 + rz * 2.4) * sc);   // 斜前上 45°（镜头右前）
    fillL!.position.set(sel.x + (fx * 2.6 - rx * 2.8) * sc, sel.y + H * 0.7, sel.z + (fz * 2.6 - rz * 2.8) * sc);     // 另一侧，偏低
    rimL!.position.set(sel.x - fx * 2.2 * sc + rx * 0.6 * sc, sel.y + H + 1.2 * sc, sel.z - fz * 2.2 * sc + rz * 0.6 * sc);   // 后上方
    keyL.target.position.set(sel.x, sel.y + H * 0.62, sel.z); rimL!.target.position.set(sel.x, sel.y + H * 0.8, sel.z);
    const k = focusOn ? 9 : 6;
    keyL.intensity = k; fillL!.intensity = k * 0.35; rimL!.intensity = k * 1.3;
  }
  if (hemi0 >= 0) CX.hemi.intensity = hemi0 * (1 + (s.fill ?? 0)) * 0.6;   // 11-08 三点布光：半球光压到 60% 出明暗；背景很暗时：半球光按倍数提亮（离开时还原）
  const map = stage.map;
  if (map !== 'camp' && isWildId(map)) { const w = CX.wilds[map as WildId]; if (w) updateWild(w, dt, t, P.pos.x, P.pos.z); }
  selectBgTick(CX.scene, dt);
  placeLabels();
  runHooks('tick', dt);
}

/** 镜头：A = 背景机位（轻微呼吸）；B = 推到选中职业前方，角色偏左 */
export function selectCamera(cam: THREE.PerspectiveCamera, dt: number): boolean {
  if (!active || !stage) return false;
  if (gate) return true;   // 首屏：画面全是背景，镜头不动
  const s = S(), c = s.cam;
  const wantP = new THREE.Vector3(c[0] + Math.sin(t * 0.25) * 0.25, c[1] + Math.sin(t * 0.33) * 0.08, c[2]);
  const wantL = new THREE.Vector3(c[3], c[4], c[5]);
  let fov = s.fov ?? 55;
  const sel = figs.find(f => f.id === CX.chosen);
  if (sel) { const ox = sel.x - s.arc.x, oz = sel.z - s.arc.z; wantP.x += ox; wantP.z += oz; wantL.x += ox; wantL.z += oz; }   // 11-08 镜头平移到选中角色正中
  if (focusOn && sel) {
    const F = s.focus ?? { dist: 4.8, h: 1.4, side: 1.3 };
    const d = new THREE.Vector2(c[0] - sel.x, c[2] - sel.z).normalize();
    const rx = d.y, rz = -d.x;   // 屏幕右方向
    const sc = s.arc.scale ?? 1, fd = F.dist * sc, fs = 0;   // 11-08 特写也居中（原 F.side 角色偏左）
    wantP.set(sel.x + d.x * fd + rx * fs, sel.y + (F.h + 0.25) * sc, sel.z + d.y * fd + rz * fs);
    wantL.set(sel.x + rx * fs, sel.y + 1.05 * sc, sel.z + rz * fs);
    fov = 45;
    const hooks = typeof window === 'undefined' ? [] : hookList();
    if (hooks.length) { const hc = hookCtx(); for (const h of hooks) { if (!h.focusCam) continue; try { const f = h.focusCam(hc, wantP, wantL, fov); if (typeof f === 'number') fov = f; } catch (e) { console.error('选角钩子出错', 'focusCam', e); } } }
  }
  const now = performance.now(), rdt = lastMs ? Math.min(0.5, (now - lastMs) / 1000) : dt; lastMs = now;   // 真实时间（低帧率下镜头也按秒推进）
  const k = camInit.v ? 1 - Math.exp(-rdt * 3.2) : 1; camInit.v = true;
  camPos.lerp(wantP, k); camLook.lerp(wantL, k);
  cam.position.copy(camPos); cam.lookAt(camLook);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * k; cam.updateProjectionMatrix(); }
  return true;
}

const _v = new THREE.Vector3();
function screenOf(x: number, y: number, z: number) {
  _v.set(x, y, z).project(CX.camera);
  return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, front: _v.z < 1 };
}
/** A 态名字牌：脚下；B 态交给 CSS（底部头像条） */
function placeLabels() {
  const box = document.getElementById('class-pick'); if (!box) return;
  const kids = box.children;
  figs.forEach((f, i) => {
    const el = kids[i] as HTMLElement | undefined; if (!el) return;
    if (focusOn) { if (el.style.left) { el.style.left = ''; el.style.top = ''; } return; }
    const p = screenOf(f.x, f.y, f.z);
    el.style.left = `${Math.round(p.x)}px`; el.style.top = `${Math.round(p.y + 10)}px`;
    el.classList.toggle('hov', hover === f.id);
  });
}

/** 屏幕坐标 → 点中的职业（按模型投影的竖条矩形判断，比蒙皮网格射线稳） */
export function selectHit(sx: number, sy: number): ClassId | null {
  if (!active || gate) return null;
  let best: ClassId | null = null, bd = 1e9;
  for (const f of figs) {
    if (S().solo && f.id !== CX.chosen) continue;   // 11-18 solo：别的职业不在场
    const a = screenOf(f.x, f.y, f.z), b = screenOf(f.x, f.y + 2.0 * (S().arc.scale ?? 1), f.z);
    if (!a.front) continue;
    const h = Math.abs(a.y - b.y), w = h * 0.42;
    if (sx > a.x - w / 2 && sx < a.x + w / 2 && sy > b.y && sy < a.y + 8) { const d = Math.abs(sx - a.x); if (d < bd) { bd = d; best = f.id; } }
  }
  return best;
}
export function selectHover(id: ClassId | null) { hover = id; }
/** 测试 / 截图：站位的屏幕坐标 */
export function selectScreens() { return figs.map(f => ({ id: f.id, ...screenOf(f.x, f.y + 1, f.z) })); }
