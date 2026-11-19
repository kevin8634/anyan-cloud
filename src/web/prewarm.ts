// v1.2.73b 偶发数秒卡顿修复（Rhett 11-02 13:49 实机反馈；0 积分）
// 现象：帧率正常，偶尔卡住几秒后恢复，位置不固定，同一处第二次不卡 → 首次资源未预热：
//   新区域 / 新怪 / 首领 / 技能特效第一次出现时，着色器临时编译 + 大贴图主线程解码上传。
// 做法：
//   1. 长帧探针：>150ms 的帧记下当时区域、最近事件（切图 / 施法 / 分包）、新编译着色器数、新上传贴图数。
//      ?stutter=1 时同时打到控制台；__game.stutter() 读记录。
//   2. 切区域（setZoneLook）：整场景 compileAsync（three r170 的 compile 会遍历隐藏物体，已编译的直接跳过）
//      + 未上传贴图排队；新野外第一次进入时在加载画面里全部做完再撤加载画面。
//   3. 战斗特效材质（红圈 / 传送门 / 光环 / 光束 / 拖尾 / 焦痕 / 符文……）开局在常驻隐藏组里各建一份并预编译，
//      程序常驻（材质不释放），之后施法新建同款材质直接复用已编译程序。
//   4. 平时每帧最多花约 4ms 上传排队贴图（分包怪物贴图、HD 细节层），不在战斗中一次性卡住。
//   5.（v1.2.77）点光源数量固定：three 的着色器按场景点光源个数编译，个数一变（符文灯亮起、首领带灯的模型出现 / 消失、
//      橙装掉落光、武器光）整场材质全部重编 → 卡几秒（熔心王座尾王「王座崩塌」、首领倒下瞬间，Rhett 11-03 22:26 反馈）。
//      做法：场景里常驻一组强度 0 的「占位点光」，每帧补齐到固定个数（切区时 = 实际个数 + 12）；超出才涨一次。
// 不涉及 assets/（冻结）；KTX2 / GLB worker 解码另报批。
import * as THREE from 'three';

type CompileR = THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera, t?: THREE.Scene | null) => Promise<unknown> };
interface Ctx { renderer: CompileR; scene: THREE.Scene; camera: THREE.Camera; zone: () => string; target?: () => THREE.WebGLRenderTarget | null;
  /** 11-18 opt1118B 占位灯余量（?off=padpool 回固定 12）：返回本区域该留几盏余量；null = 照旧 12（副本 / 团本 / 内容包图首领带灯，不动） */
  padPool?: () => number | null }
let C: Ctx | null = null;

export interface StutterRec { at: number; ms: number; zone: string; recent: string[]; programs: number; textures: number }
const LONG_MS = 150, LOG_MAX = 40, EV_MAX = 12, EV_WINDOW = 3000;
const log: StutterRec[] = [];
const events: { t: number; s: string }[] = [];
const LOUD = typeof location !== 'undefined' && /[?&]stutter=1/.test(location.search);
let prevFrame = 0, prevPrograms = 0, prevTextures = 0;
const stat = { kitObjs: 0, kitMs: 0, kitTex: 0, compiles: 0, compileMs: 0, texUploaded: 0, texMs: 0, queued: 0, fxMats: 0, flushes: 0, padTarget: 0, padGrow: 0, padExtra: 0, compileTimeouts: 0 };

export function prewarmInit(ctx: Ctx) { C = ctx; }

/** 记一条事件（切图 / 施法 / 首领登场 / 分包到达），长帧时一起记下 */
/** v1.2.77 CPU 耗时探针：超过 ms 记一条（首领倒下、大招等） */
export function perfMark(what: string, t0: number, ms = 16) { const d = performance.now() - t0; if (d > ms) prewarmNote(`cpu:${what} ${d.toFixed(0)}ms`); return d; }
export function prewarmNote(s: string) {
  const t = performance.now();
  events.push({ t, s }); if (events.length > EV_MAX) events.shift();
}

function progCount(): number { const p = (C?.renderer.info as unknown as { programs?: unknown[] })?.programs; return p ? p.length : 0; }

/** 每帧调用（渲染之前）：测上一帧间隔，>150ms 记一条 */
export function stutterFrame(nowMs: number) {
  if (!C) return;
  const programs = progCount(), textures = C.renderer.info?.memory?.textures ?? 0;   // v1.2.73 无 GPU 试玩（jsdom 假渲染器）没有 info.memory
  const geos = C.renderer.info?.memory?.geometries ?? 0;
  if (prevFrame && nowMs - prevFrame > LONG_MS && !document.hidden) {
    const rec: StutterRec = { at: Math.round(nowMs), ms: Math.round(nowMs - prevFrame), zone: C.zone(),
      recent: events.filter(e => nowMs - e.t < EV_WINDOW).map(e => e.s), programs: programs - prevPrograms, textures: textures - prevTextures };
    log.push(rec); if (log.length > LOG_MAX) log.shift();
    if (LOUD) console.warn('[卡顿]', rec);
    hitchToLaunchLog(rec, geos - prevGeos);
  }
  prevFrame = nowMs; prevPrograms = programs; prevTextures = textures; prevGeos = geos;
}
// 11-19 C21 stutterlog：长帧（>150ms）写进 launch.log（桌面版），带前 3 秒事件（cast: / cpu: / feel:）、新编着色器数、新贴图数、新几何数。
//   Rhett 00:54「放技能、命中怪物也会卡」：之前长帧只存在内存里，实机看不到。每次启动最多 120 条。?off=stutterlog 关。
let prevGeos = 0, hitchLines = 0;
const HITCH_LOG_ON = (() => { try { return !/(?:[?&]off=[^&]*\bstutterlog\b)/.test(location.search); } catch { return true; } })();
function hitchToLaunchLog(r: StutterRec, geo: number) {
  if (!HITCH_LOG_ON || hitchLines >= 120) return;
  const L = (globalThis as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log; if (!L) return;
  hitchLines++;
  try { L(`hitch ms=${r.ms} zone=${r.zone} prog+${r.programs} tex+${r.textures} geo+${geo} ev=${r.recent.join('|').slice(0, 300)}`); } catch { /* 忽略 */ }
}
/** 页面从后台回来：不把后台时间当成卡顿 */
export function stutterReset() { prevFrame = 0; }

// ---------------------------------------------------------------- 贴图上传队列
const done = new WeakSet<THREE.Texture>();
const queue: THREE.Texture[] = [];
const queued = new WeakSet<THREE.Texture>();
const TEX_KEYS = ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap', 'specularMap', 'envMap', 'clearcoatNormalMap'] as const;

function texReady(t: THREE.Texture): boolean {
  if ((t as THREE.CubeTexture).isCubeTexture || (t as unknown as { isRenderTargetTexture?: boolean }).isRenderTargetTexture) return false;
  const img = t.image as { width?: number; complete?: boolean; data?: unknown } | undefined;
  if (!img) return false;
  if ((img as HTMLImageElement).complete === false) return false;
  return true;
}
function enqueueTex(t: THREE.Texture | null | undefined) {
  if (!t || done.has(t) || queued.has(t)) return;
  queued.add(t); queue.push(t); stat.queued++;
}
function enqueueMat(m: THREE.Material) {
  const r = m as unknown as Record<string, unknown>;
  for (const k of TEX_KEYS) { const t = r[k] as THREE.Texture | undefined; if (t && (t as THREE.Texture).isTexture) enqueueTex(t); }
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const v of Object.values(u)) { const t = v?.value as THREE.Texture | undefined; if (t && (t as THREE.Texture).isTexture) enqueueTex(t); }
}
/** 把一个物体（含隐藏子物体）里所有没上传的贴图排进队列 */
export function prewarmTextures(obj: THREE.Object3D) {
  obj.traverse(o => { const m = (o as THREE.Mesh).material; if (!m) return; if (Array.isArray(m)) m.forEach(enqueueMat); else enqueueMat(m); });
}
export function prewarmTexture(t: THREE.Texture | null | undefined) { enqueueTex(t); }

function uploadOne(): boolean {
  while (queue.length) {
    const t = queue.shift()!; queued.delete(t);
    if (done.has(t)) continue;
    if (!texReady(t)) { if (queue.length < 4000) { /* 图片还没解码完：稍后再试 */ setTimeout(() => enqueueTex(t), 500); } return false; }
    const t0 = performance.now();
    try { C!.renderer.initTexture(t); } catch { /* 个别贴图（视频 / 渲染目标）不能预上传：跳过 */ }
    done.add(t); stat.texUploaded++; stat.texMs += performance.now() - t0;
    return true;
  }
  return false;
}

/** 每帧调用：最多花 budgetMs 上传排队贴图（至少一张） */
export function prewarmTick(budgetMs = 4) {
  if (!C || !queue.length) return;
  const t0 = performance.now();
  do { if (!uploadOne() && !queue.length) break; } while (queue.length && performance.now() - t0 < budgetMs);
}

// ---------------------------------------------------------------- 着色器预编译
// 11-18 永霜墓穴首领倒下卡顿：实测尾王倒下一帧新编 7 个程序（传送门 / 光柱 / 螺旋 / 符文贴花 / 粒子 / 焦痕 / groundfx），
// 同源旧程序都在，只差 outputColorSpace（srgb ↔ srgb-linear）和 toneMapping（ACES ↔ 无）：渲染走后期时场景画进离屏目标，
// 而 renderer.compile 在屏幕目标下算 key，预编译的程序一个都对不上。编译前临时切到管线的离屏目标再编；?off=prewarmrt 回旧。
const RT_MATCH = (() => { try { return !/(?:[?&]off=[^&]*\bprewarmrt\b)/.test(location.search); } catch { return true; } })();
function withTarget<R>(f: () => R): R {
  const r = C!.renderer, t = RT_MATCH && C!.target ? C!.target() : null;
  if (!t) return f();
  const prev = r.getRenderTarget(), ac = r.getActiveCubeFace(), am = r.getActiveMipmapLevel();
  r.setRenderTarget(t);
  try { return f(); } finally { r.setRenderTarget(prev, ac, am); }
}
async function compile(obj: THREE.Object3D): Promise<void> {
  if (!C) return;
  const t0 = performance.now();
  try {
    // v1.2.88 保险：compileAsync 偶尔不 resolve（DLC 沉钟海岸实测加载画面卡死 8 分钟），最多等 12 秒，没编完的留给首帧
    if (C.renderer.compileAsync) { const ca = C.renderer.compileAsync.bind(C.renderer); let to = 0; const ok = await Promise.race([withTarget(() => ca(obj, C!.camera, C!.scene)).then(() => true), new Promise<boolean>(r => { to = window.setTimeout(() => r(false), 12000); })]); clearTimeout(to); if (!ok) { stat.compileTimeouts++; console.warn('预编译超时，跳过', obj.name || obj.type); } }
    else withTarget(() => C!.renderer.compile(obj, C!.camera, C!.scene));
  } catch (e) { console.warn('预编译失败', e); }
  stat.compiles++; stat.compileMs += performance.now() - t0;
}

/** 切区域：整场景预编译（隐藏物体也编译）+ 贴图排队；返回编译完成的 Promise */
export function prewarmZone(why: string): Promise<void> {
  if (!C) return Promise.resolve();
  prewarmNote('zone:' + why);
  lightPadFrame();   // v1.2.77 按当前固定点光个数编译（战斗中切光效不改目标个数，免得反而触发重编）
  prewarmTextures(C.scene);
  const p = compile(C.scene);
  // 11-18 永霜墓穴首领倒下卡顿：战斗特效样本（fxKeep）只在开局按营地点光个数（实测 10）编过一次，程序 key 带点光个数，
  // 进永霜墓穴（固定 75 个）后光柱 / 符文 / 粒子 / 焦痕全得重编，正好落在首领倒下那一帧。点光目标个数一变就把样本按新个数再编一遍；?off=fxrezone 回旧。
  if (FX_REZONE && fxKeep.children.length && padTarget !== fxPadAt) { fxPadAt = padTarget; return Promise.all([p, compile(fxKeep)]).then(() => undefined); }
  return p;
}
const FX_REZONE = (() => { try { return !/(?:[?&]off=[^&]*\bfxrezone\b)/.test(location.search); } catch { return true; } })();
let fxPadAt = -2;
const FX_DRAW = (() => { try { return !/(?:[?&]off=[^&]*\bfxdraw\b)/.test(location.search); } catch { return true; } })();

/** 加载画面里调用：编译 + 队列里的贴图全部上传完（新野外第一次进入） */
export async function prewarmFlush(why: string): Promise<void> {
  if (!C) return;
  stat.flushes++;
  lightPadReset();   // v1.2.77 只在加载画面里重定点光个数
  await prewarmZone(why);
  // v1.2.89 compile() 不编阴影深度通道（MeshDepthMaterial 变体，镜湖实测 35 个），加载画面下先实渲一帧把阴影图画出来
  // 11-19 C21 fxdraw：Rhett「副本里放技能头几下卡得最厉害」——compileAsync 进副本常超时（launch.log「预编译超时，跳过 Scene」），
  //   特效样本只发了编译没真正画过，第一次放技能时驱动才补链接。加载画面这一帧把特效样本（0.01 m 小片）一起放进场景实画一次。?off=fxdraw 回旧
  const fxIn = FX_DRAW && fxKeep.children.length > 0 && !fxKeep.parent; if (fxIn) C.scene.add(fxKeep);
  try { const t0 = performance.now(); C.renderer.shadowMap.needsUpdate = true; withTarget(() => C!.renderer.render(C!.scene, C!.camera)); stat.compileMs += performance.now() - t0; } catch (e) { console.warn('预渲染失败', e); }
  if (fxIn) C.scene.remove(fxKeep);
  let n = 0;
  while (queue.length && n++ < 20000) uploadOne();
}

/** 某个新物体（首领模型、分包怪物模板）单独预热 */
export function prewarmObject(obj: THREE.Object3D, why: string): Promise<void> {
  prewarmNote('obj:' + why);
  prewarmTextures(obj);
  return compile(obj);
}

// ---------------------------------------------------------------- 11-04 角色 / 套装身体 / 武器预载（Rhett 15:34 ④：换装、切场景、进副本不现加载）
/** 加载画面里调用：kit 里是各职业写实身体（含 40 级套装整身）+ 全部武器道具的样本。
 *  放进场景（关视锥剔除、点光摘掉免得改点光个数）→ 预编译（含蒙皮变体）→ 实渲一帧（阴影深度变体）→ 贴图全部上传 → 拿出场景。
 *  材质和贴图不释放（程序与显存常驻，之后同款材质 / 同一贴图直接复用）；武器道具的几何是克隆的，释放。 */
export async function prewarmKit(kit: THREE.Object3D, at?: THREE.Vector3, disposeGeo: (o: THREE.Object3D) => boolean = () => false): Promise<void> {
  if (!C) return;
  const t0 = performance.now();
  const lights: THREE.Object3D[] = []; kit.traverse(o => { if ((o as THREE.Light).isLight) lights.push(o); else o.frustumCulled = false; });
  for (const l of lights) l.parent?.remove(l);
  if (at) kit.position.copy(at);
  C.scene.add(kit); kit.updateMatrixWorld(true);
  prewarmTextures(kit);
  try {
    await compile(kit);
    C.renderer.shadowMap.needsUpdate = true; withTarget(() => C!.renderer.render(C!.scene, C!.camera));
  } catch (e) { console.warn('角色预载失败', e); }
  let n = 0; while (queue.length && n++ < 20000) { if (uploadOne()) stat.kitTex++; }
  C.scene.remove(kit);
  kit.traverse(o => { stat.kitObjs++; if (disposeGeo(o)) (o as THREE.Mesh).geometry?.dispose(); });
  stat.kitMs += performance.now() - t0;
  prewarmNote('kit');
}

// ---------------------------------------------------------------- 战斗特效材质常驻预编译
const fxKeep = new THREE.Group();
fxKeep.name = 'prewarm-fx';
/** mats：各类战斗特效材质的样本（同一着色器源码 + 同样开关 → 复用同一个已编译程序）。材质不释放，程序常驻 */
export function prewarmFx(mats: (THREE.Material | null | undefined)[], points: THREE.Material[] = []): Promise<void> {
  if (!C) return Promise.resolve();
  const geo = new THREE.PlaneGeometry(0.01, 0.01);
  for (const m of mats) if (m) { const me = new THREE.Mesh(geo, m); me.frustumCulled = false; fxKeep.add(me); stat.fxMats++; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  for (const m of points) { fxKeep.add(new THREE.Points(pg, m)); stat.fxMats++; }
  prewarmTextures(fxKeep);
  prewarmNote('fx');
  fxPadAt = padTarget;   // 11-18 记下样本按几个点光编的（永霜墓穴首领倒下卡顿）
  return compile(fxKeep);
}

// ---------------------------------------------------------------- v1.2.77 点光源数量固定
const PAD_EXTRA = 12;   // 首领带灯模型 + 召唤物 + 符文 / 掉落光的余量（熔心王座实测 6 不够）
const pads: THREE.PointLight[] = [];
let padTarget = -1;
function realPointLights(): number {
  let n = 0;
  C!.scene.traverseVisible(o => { if ((o as THREE.PointLight).isPointLight && !o.userData.lightPad) n++; });
  return n;
}
/** 每帧渲染前调用：占位点光补齐，让场景点光源总数不变 */
export function lightPadFrame() {
  if (!C) return;
  const real = realPointLights();
  if (padTarget < 0) padTarget = real + PAD_EXTRA;
  if (real > padTarget) { padTarget = real; stat.padGrow++; prewarmNote('lights+' + real); }
  const need = padTarget - real;
  while (pads.length < need) {
    const l = new THREE.PointLight(0x000000, 0, 0.01); l.userData.lightPad = true; l.position.set(0, -5000, 0); l.castShadow = false;
    C.scene.add(l); pads.push(l);
  }
  for (let i = 0; i < pads.length; i++) pads[i].visible = i < need;
  stat.padTarget = padTarget;
}
// 11-18 opt1118B（审计第 2 条）：固定 +12 盏强度 0 的占位灯，每个受光像素都要把这 12 盏也算一遍（three 不会跳过 0 强度的灯）。
//   12 是给熔心王座首领 / 召唤物留的（实测 6 不够）；本体野外 / 原野 / 营地里会冒出来的灯只有：
//   ① 激活集外被摘出场景的怪身上的灯（邪教徒绿光、法师法球等）——由 main 按本区域场外怪的点光数报上来，逐盏算进余量；
//   ② 换武器光、掉落 / 杂项——按光源池大小（同 dung_lightpool POOL_SIZE：低 3 / 中 7 / 高 9）留。
//   余量 = 池大小 + ①，封顶仍为 12（不会比原来多）；副本 / 团本 / 内容包图（首领带灯）main 返回 null，仍是 12。
//   超出时照旧涨一次（stat.padGrow / 'lights+N' 事件可查）；预编译（prewarmZone）按新目标编，战斗特效样本随目标变化重编（fxrezone），关系不变。
const PAD_POOL_ON = (() => { try { return !/(?:[?&]off=[^&]*\bpadpool\b)/.test(location.search); } catch { return true; } })();
function padExtra(): number {
  if (!PAD_POOL_ON || !C?.padPool) return PAD_EXTRA;
  let v: number | null = null; try { v = C.padPool(); } catch { v = null; }
  return v == null || !isFinite(v) ? PAD_EXTRA : Math.max(0, Math.min(PAD_EXTRA, Math.ceil(v)));
}
/** 切区域（加载画面 / 预编译之前）：目标个数 = 新区域实际点光 + 余量 */
export function lightPadReset(extra?: number) {
  if (!C) return;
  extra ??= padExtra(); stat.padExtra = extra;
  padTarget = realPointLights() + extra;
  lightPadFrame();
}

export function stutterLog(): StutterRec[] { return log.slice(); }
export function prewarmDebug(names = false) { return { ...stat, ...(names && C ? { names: ((C.renderer.info as unknown as { programs: { name: string; cacheKey: string }[] }).programs ?? []).map(p => p.name + '#' + p.cacheKey.length + '#' + p.cacheKey) } : {}), queue: queue.length, longFrames: log.length, programs: progCount(), events: events.slice(-40).map(e => e.s) }; }

/** 11-16d 保险：r170 compileAsync 轮询时若材质中途被释放（properties 里没有 currentProgram）会抛
 *  "Cannot read properties of undefined (reading 'isReady')"，Promise 永不 resolve → 加载卡 12 秒。
 *  换成同样逻辑但跳过空 program 的版本（KHR_parallel_shader_compile 不支持时 isReady 直接为真）。 */
export function installSafeCompileAsync(r: THREE.WebGLRenderer): void {
  const rr = r as unknown as { compileAsync?: unknown; properties: { get(m: THREE.Material): { currentProgram?: { isReady?: () => boolean } } } };
  if (!rr.compileAsync) return;
  rr.compileAsync = (scene: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene | null = null): Promise<THREE.Object3D> => {
    const mats = r.compile(scene, camera, target) as unknown as Set<THREE.Material>;
    return new Promise(resolve => {
      const check = () => {
        mats.forEach(m => { const p = rr.properties.get(m).currentProgram; if (!p || !p.isReady || p.isReady()) mats.delete(m); });
        if (mats.size === 0) { resolve(scene); return; }
        setTimeout(check, 10);
      };
      check();
    });
  };
}
