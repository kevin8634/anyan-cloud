// ======================================================================
// Rhett 11-18 DLC 选角 HUD 重做（?off=selhud 关）——按 03_概念图/07_DLC欢迎与HUD_1116/H1_mage.jpg（Rhett 11-16 10:27「选角 HUD 就按 H1」）
//   布局（参考魔兽 / 命运 2）：左 = 角色列表（头像、名字、等级 职业）+ 新建；中 = 选中职业的 3D 模型站在该职业背景台上；底中 = 六职业头像条；
//   右 = 职业名 / 难度菱形 / 定位 / 职业简介 / 属性 / 专精 / 招牌技能；底 = 角色名输入 + 进入游戏。文字全部是本体选角面板的真数据（title.ts renderTitle），这里只换布局与配色
//   配色：冷青绿 / 深海蓝黑 / 暗铁 + 少量铜，不用金色基底；边框为代码画的铁框 + 铜铆钉（无付费出图）
//   背景：详情态（B 态）时镜头只拍职业模型（camera layers），身后换成该职业的背景图（07_创角_1116 定稿前的占位图，换图只改 SELUI 键名）+ livebg 动态
//   点「创建角色」直接进当前职业的详情 HUD（不停在 6 人站位）
// 只碰页面 DOM 与本体的选角钩子（web/selectstage selectHook），不改本体选角逻辑
// ======================================================================
import * as THREE from 'three';
import { SELUI } from '../selui.gen';
import { LIVE_FRAG, LiveLook, LOOK_DEF, d1Off } from './livebg';
// 本体选角钩子（web/selectstage.ts SelectHookCtx 同形）：经 window.__drSelHooks 注册，不 import 本体模块（DLC 启动顺序）
interface SelectHookCtx { scene: THREE.Scene; camera: THREE.PerspectiveCamera; focus: boolean; gate: boolean; chosen: string; figs: { id: string; root: THREE.Object3D }[]; player: THREE.Object3D | null; ring: THREE.Object3D | null }
type SelectHook = { prepare?(c: SelectHookCtx): void; tick?(dt: number, c: SelectHookCtx): void; leave?(c: SelectHookCtx): void; focusCam?(c: SelectHookCtx, p: THREE.Vector3, l: THREE.Vector3, fov: number): number | void };
const selectHook = (h: SelectHook) => { const w = window as unknown as { __drSelHooks?: SelectHook[] }; (w.__drSelHooks ??= []).push(h); };

/** 只在这一层画：职业模型 / 玩家模型 / 背景板（灯也挂上，保证灯数不变、不触发重编译） */
const LAYER = 7;
const BG_LOOK: LiveLook = { ...LOOK_DEF, horizon: 0.24, rays: [0.5, -0.05], rip: [0.5, 0.86], ripK: 0, fog: 0.3, raysK: 0.5, motes: d1Off('selmote0') ? 0.55 : 0, zoom0: 1, zoom1: 1 };
/** 各职业背景图（占位：07_创角_1116 六张；定稿后换 SELUI 键即可）与画面微调（pan = 图片 uv 平移，让台面落在脚下） */
const BG: Record<string, { key: string; pan?: [number, number]; tint?: [number, number, number] }> = {
  mage: { key: 'selbg_mage' }, warrior: { key: 'selbg_warrior' }, hunter: { key: 'selbg_hunter' },
  coffin: { key: 'selbg_coffin' }, chrono: { key: 'selbg_chrono' }, alchemy: { key: 'selbg_alchemy' },
};

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = vec2(uv.x, 1.0 - uv.y); gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

let mat: THREE.ShaderMaterial | null = null, mesh: THREE.Mesh | null = null, t = 0, mix = 0, cur = '', want = '', camMask = -1;
const texs: Record<string, THREE.Texture> = {};
const litOn = new Set<THREE.Object3D>(), fxOn = new Set<THREE.Object3D>();
let base0: Set<THREE.Object3D> | null = null;
function tex(key: string): THREE.Texture | null {
  if (texs[key]) return texs[key];
  const src = SELUI[key]; if (!src) return null;
  const im = new Image(); const tx = new THREE.Texture(im); tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false;
  im.onload = () => { tx.needsUpdate = true; tx.userData.w = im.naturalWidth; tx.userData.h = im.naturalHeight; }; im.src = src;
  return (texs[key] = tx);
}
function ensure(c: SelectHookCtx) {
  if (mesh) return;
  const u = (v: unknown) => ({ value: v });
  mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: LIVE_FRAG, depthWrite: false, depthTest: false, toneMapped: false, fog: false, lights: false,
    uniforms: { uTex: u(null), uTex2: u(null), uMix: u(0), uTime: u(0), uZoom: u(1), uFog: u(BG_LOOK.fog), uRays: u(BG_LOOK.raysK), uDof: u(0), uVig: u(0.5), uBright: u(1.0), uFade: u(1),
      uRes: u(new THREE.Vector2(1, 1)), uImg: u(new THREE.Vector2(1600, 1067)), uImg2: u(new THREE.Vector2(1600, 1067)), uPan: u(new THREE.Vector2()), uMouse: u(new THREE.Vector2()),
      uRayPos: u(new THREE.Vector2(...BG_LOOK.rays)), uRipPos: u(new THREE.Vector2(...BG_LOOK.rip)), uHorizon: u(BG_LOOK.horizon), uRip: u(BG_LOOK.ripK), uMotes: u(BG_LOOK.motes),
      uTint: u(new THREE.Vector3(...BG_LOOK.tint)), uMoteCol: u(new THREE.Vector3(...BG_LOOK.mote)) } });
  mat.userData.outlineParameters = { visible: false };   // 描边效果不给背景板描边
  const t0 = tex(BG[c.chosen]?.key ?? 'selbg_mage') ?? tex('selbg_mage');
  mat.uniforms.uTex.value = t0; mat.uniforms.uTex2.value = t0;
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1e6; mesh.visible = false; mesh.name = 'd1SelBackdrop';
  mesh.layers.set(LAYER);
  c.scene.add(mesh);
}
/** 物体（含子物体）加进 / 移出画面层 */
function layerTree(o: THREE.Object3D | null, on: boolean) { if (!o) return; o.traverse(x => { if (on) x.layers.enable(LAYER); else x.layers.disable(LAYER); }); }

let shown = false;
function show(c: SelectHookCtx, on: boolean) {
  if (!mesh || shown === on) return;
  shown = on; mesh.visible = on;
  const cam = c.camera;
  if (on) {
    camMask = cam.layers.mask;
    // 灯全部挂上画面层：three 按「相机层可见的灯」计灯数，少一盏都会全场重编译
    c.scene.traverse(o => { if ((o as THREE.Light).isLight && !o.layers.isEnabled(LAYER)) { o.layers.enable(LAYER); litOn.add(o); } });
    cam.layers.set(LAYER);
    // 特效（粒子系统、之后新加进场景的光环 / 闪光）也进画面层：招牌技能演示要看得见
    base0 = new Set(c.scene.children);
    for (const o of c.scene.children) if ((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) { layerTree(o, true); fxOn.add(o); }
  } else {
    if (camMask >= 0) cam.layers.mask = camMask; camMask = -1;
    for (const o of litOn) o.layers.disable(LAYER); litOn.clear();
    for (const o of fxOn) layerTree(o, false); fxOn.clear(); base0 = null;
    for (const f of c.figs) layerTree(f.root, false); layerTree(c.player, false);
  }
}

const _v = new THREE.Vector3();
function tick(dt: number, c: SelectHookCtx) {
  ensure(c);
  const on = c.focus && !c.gate;
  show(c, on);
  if (!on || !mat) { portraitOff(); return; }
  t += dt;
  // 只拍选中的职业：其它站位藏起来，选中的（玩家模型）进画面层
  for (const f of c.figs) { f.root.visible = false; }
  layerTree(c.player, true);
  if (base0) for (const o of c.scene.children) if (!base0.has(o) && !fxOn.has(o) && !(o as THREE.Light).isLight) { layerTree(o, true); fxOn.add(o); }
  if (c.ring) c.ring.visible = false;
  // 换职业 → 交叉淡入新背景
  want = BG[c.chosen]?.key ?? 'selbg_mage';
  const U = mat.uniforms;
  if (!cur) { cur = want; U.uTex.value = tex(cur); }
  if (want !== cur && mix === 0) { U.uTex2.value = tex(want); mix = 0.0001; }
  if (mix > 0) { mix = Math.min(1, mix + dt / 0.6); if (mix >= 1) { cur = want; U.uTex.value = U.uTex2.value; mix = 0; } }
  U.uMix.value = mix; U.uTime.value = t;
  U.uDof.value = d1Off('seldof') ? 0 : 1.0;   // 选角景深：人物清楚、背景虚（?off=seldof 关）
  U.uVig.value = 0.3;
  const sz = (x: THREE.Texture | null, v: THREE.Vector2) => { if (x?.userData.w) v.set(x.userData.w as number, x.userData.h as number); };
  sz(U.uTex.value, U.uImg.value); sz(U.uTex2.value, U.uImg2.value);
  const p = BG[c.chosen]?.pan ?? [0, 0]; (U.uPan.value as THREE.Vector2).set(p[0], p[1]);
  (U.uRes.value as THREE.Vector2).set(innerWidth, innerHeight);
  // 涟漪中心 = 模型脚下的屏幕位置
  if (c.player) { _v.setFromMatrixPosition(c.player.matrixWorld).project(c.camera); (U.uRipPos.value as THREE.Vector2).set((_v.x + 1) / 2, (1 - _v.y) / 2); }
  portraitTick(dt, c);
}

// ---------------- 11-18 Rhett「人物不要晃动出来，2 秒内渐显」「创角界面没法转动身体」 ----------------
// 进详情 / 换职业：先放该职业立绘（gpt-image-2，port_<职业>）在模型位置 1.2 秒渐显，模型此时不画；再 0.8 秒立绘淡出、3D 模型接上（镜头这段时间对好位置，看不到推拉）。?off=selport 关
// 拖动画面左右转身（只转选中的模型，换职业 / 离开复位）。?off=seldrag 关
const PORT_IN = 1.2, PORT_ALL = 2.0;
let pEl: HTMLImageElement | null = null, pCls = '', pT = 99, yawOff = 0, dragX: number | null = null, dragBound = false;
function portraitOff() { document.documentElement.classList.remove('d1make', 'd1pick'); if (backEl) backEl.style.display = 'none'; if (aEl) aEl.style.display = 'none'; if (aRing) aRing.style.display = 'none'; if (homeEl) homeEl.style.display = 'none'; if (rEl) rEl.style.display = 'none'; if (pEl) pEl.style.opacity = '0'; pCls = ''; yawOff = 0; dragX = null; }
function bindDrag() {
  if (dragBound || d1Off('seldrag')) return; dragBound = true;
  const inB = (e: PointerEvent) => (e.target as HTMLElement | null)?.tagName === 'CANVAS' && !!document.getElementById('title')?.classList.contains('sel-b') && shown;
  addEventListener('pointerdown', e => { if (inB(e) && e.button === 0) dragX = e.clientX; }, true);
  addEventListener('pointermove', e => { if (dragX === null) return; yawOff += (e.clientX - dragX) * 0.012; dragX = e.clientX; });
  addEventListener('pointerup', () => { dragX = null; }); addEventListener('pointercancel', () => { dragX = null; });
}
/** 11-18 Rhett「这个位置加左右旋转的标识」：脚下一条 ⟲ 拖动旋转 ⟳（按住两边箭头也能转；跟着模型脚底的屏幕位置走，不靠 CSS 定位）。?off=selrot 关 */
let rEl: HTMLElement | null = null, rHold = 0;
/** 11-18 Rhett「选择角色和创建角色分开，做成 2 个页面」：按本体当前是不是「新建」态（#cs-create 显示）切两页——
 *  选择角色页 = 左角色列表 + 存档实际穿戴的模型 + 进入；创建角色页 = 底部六职业条 + 右职业详情 + 名字 / 创建，左上一个「返回角色列表」。?off=seltwo 回同页 */
let backEl: HTMLButtonElement | null = null, homeEl: HTMLButtonElement | null = null;
function pageMode() {
  if (d1Off('seltwo')) return;
  const ti = document.getElementById('title'), on = !!ti?.classList.contains('sel-b'), cr = document.getElementById('cs-create'), html = document.documentElement;
  const make = on && !!cr && cr.style.display !== 'none';
  html.classList.toggle('d1make', make); html.classList.toggle('d1pick', on && !make);
  const has = !!document.querySelector('#cs-slots .cslot:not(.empty)');
  if (!backEl && ti) {
    backEl = document.createElement('button'); backEl.id = 'd1-back'; backEl.type = 'button'; backEl.textContent = '‹ 返回角色列表';
    backEl.onclick = e => { e.stopPropagation(); (document.querySelector('#cs-slots .cslot:not(.empty)') as HTMLElement | null)?.click(); };
    ti.appendChild(backEl);
  }
  if (backEl) backEl.style.display = make && has ? '' : 'none';
  // 11-18 Rhett「加一个返回主画面按钮」：右上明显的按钮回登录屏（等同 Esc / 本体 ✕），?off=selhome 关
  if (!homeEl && ti && !d1Off('selhome')) {
    homeEl = document.createElement('button'); homeEl.id = 'd1-home'; homeEl.type = 'button'; homeEl.textContent = '⌂ 返回主画面';
    homeEl.onclick = e => { e.stopPropagation(); const b = document.getElementById('sel-back') as HTMLElement | null;
      if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
    ti.appendChild(homeEl);
  }
  if (homeEl) homeEl.style.display = on ? '' : 'none';
}
/** 11-18 Rhett 选背景氛围 B：月光光束 + 浮尘 + 脚下符文圈（只改透明度/缓慢横移，不往上飘），?off=selamb 关 */
let aEl: HTMLDivElement | null = null, aCv: HTMLCanvasElement | null = null, aRing: HTMLDivElement | null = null, aT = 0;
const dust: { x: number; y: number; r: number; vx: number; vy: number; p: number }[] = [];
function ambB(c: SelectHookCtx) {
  if (d1Off('selamb')) return;
  const ti = document.getElementById('title'), on = !!ti?.classList.contains('sel-b') && shown;
  if (!aEl && on && ti) {
    aEl = document.createElement('div'); aEl.id = 'd1-amb';
    aEl.innerHTML = '<i class="bm b1"></i><i class="bm b2"></i><i class="bm b3"></i><canvas></canvas>';
    aCv = aEl.querySelector('canvas'); ti.insertBefore(aEl, ti.firstChild);
    aRing = document.createElement('div'); aRing.id = 'd1-ring';
    const tk = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return `<line x1="${(100 + Math.cos(a) * 80).toFixed(1)}" y1="${(100 + Math.sin(a) * 80).toFixed(1)}" x2="${(100 + Math.cos(a) * (i % 3 ? 86 : 92)).toFixed(1)}" y2="${(100 + Math.sin(a) * (i % 3 ? 86 : 92)).toFixed(1)}"/>`; }).join('');
    aRing.innerHTML = `<svg viewBox="0 0 200 200"><g class="r1"><circle cx="100" cy="100" r="94"/><circle cx="100" cy="100" r="78" stroke-dasharray="3 7"/>${tk}</g><g class="r2"><circle cx="100" cy="100" r="60"/><polygon points="100,44 148.5,128 51.5,128"/><polygon points="100,156 51.5,72 148.5,72"/></g></svg>`;
    ti.insertBefore(aRing, aEl.nextSibling);
    for (let i = 0; i < 70; i++) dust.push({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.6, vx: (Math.random() - .5) * .006, vy: (Math.random() - .3) * .004, p: Math.random() * 6.28 });
  }
  if (!aEl || !aCv || !aRing) return;
  aEl.style.display = aRing.style.display = on ? '' : 'none'; if (!on) return;
  aT += 1 / 60;
  const W = innerWidth, H = innerHeight;
  if (aCv.width !== W || aCv.height !== H) { aCv.width = W; aCv.height = H; }
  const g = aCv.getContext('2d')!; g.clearRect(0, 0, W, H);
  for (const d of dust) {
    d.x += d.vx / 60; d.y += d.vy / 60; if (d.x < 0) d.x += 1; if (d.x > 1) d.x -= 1; if (d.y < 0) d.y += 1; if (d.y > 1) d.y -= 1;
    const beam = Math.max(0, 1 - Math.abs(d.x - (.32 + d.y * .22)) * 4) + Math.max(0, 1 - Math.abs(d.x - (.62 + d.y * .18)) * 5);
    const a = (.12 + .55 * Math.min(1, beam)) * (.6 + .4 * Math.sin(aT * .9 + d.p));
    g.fillStyle = `rgba(200,236,240,${a.toFixed(3)})`; g.beginPath(); g.arc(d.x * W, d.y * H, d.r, 0, 6.283); g.fill();
  }
  if (c.player) {
    _v.setFromMatrixPosition(c.player.matrixWorld).project(c.camera);
    const sx = (_v.x + 1) / 2 * W, fy = (1 - _v.y) / 2 * H;
    aRing.style.left = `${sx.toFixed(0)}px`; aRing.style.top = `${fy.toFixed(0)}px`;
  }
}
function rotHint(c: SelectHookCtx) {
  pageMode(); ambB(c);
  if (d1Off('selrot') || d1Off('seldrag')) return;
  const ti = document.getElementById('title'), on = !!ti?.classList.contains('sel-b') && shown && !!c.player;
  if (!rEl && on && ti) {
    rEl = document.createElement('div'); rEl.id = 'd1-rot';
    rEl.innerHTML = '<button type="button" data-d="-1" title="向左转">⟲</button><span>拖动旋转角色</span><button type="button" data-d="1" title="向右转">⟳</button>';
    for (const b of rEl.querySelectorAll('button')) {
      const d = +(b as HTMLElement).dataset.d!;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); rHold = d; }); b.addEventListener('click', e => e.stopPropagation());
    }
    addEventListener('pointerup', () => { rHold = 0; }); addEventListener('pointercancel', () => { rHold = 0; });
    ti.appendChild(rEl);
  }
  if (!rEl) return;
  rEl.style.display = on ? '' : 'none'; if (!on || !c.player) return;
  if (rHold) yawOff += rHold * 0.045;
  _v.setFromMatrixPosition(c.player.matrixWorld).project(c.camera);
  const sx = (_v.x + 1) / 2 * innerWidth, fy = (1 - _v.y) / 2 * innerHeight;
  rEl.style.left = `${sx.toFixed(0)}px`; rEl.style.top = `${Math.min(innerHeight - 150, fy + 18).toFixed(0)}px`;
}
function portraitTick(dt: number, c: SelectHookCtx) {
  bindDrag();
  if (c.player && yawOff) c.player.rotation.y += yawOff;
  rotHint(c);
  if (!/(?:[?&]on=[^&]*\bselport\b)/.test(location.search) || !c.player) { if (pEl) pEl.style.opacity = '0'; return; }   // 11-18 Rhett「做不了模型的渐出效果就不要做」：立绘渐显默认关（?on=selport 才开）
  if (!pEl) { pEl = document.createElement('img'); pEl.id = 'd1-port'; pEl.alt = ''; pEl.draggable = false; const ti = document.getElementById('title'); (ti ?? document.body).insertBefore(pEl, ti?.firstChild ?? null); }
  if (c.chosen !== pCls) { pCls = c.chosen; yawOff = 0; const src = SELUI[`port_${pCls}`]; if (src) { pEl.src = src; pT = 0; } else pT = 99; }
  pT += dt;
  if (pT >= PORT_ALL) { pEl.style.opacity = '0'; return; }
  const k = pT < PORT_IN ? pT / PORT_IN : 1 - (pT - PORT_IN) / (PORT_ALL - PORT_IN), e = k * k * (3 - 2 * k);
  pEl.style.opacity = e.toFixed(3);
  if (pT < PORT_IN + 0.1) layerTree(c.player, false);   // 立绘没显完之前模型不画
  // 立绘脚底对模型脚底、水平居中对模型
  _v.setFromMatrixPosition(c.player.matrixWorld).project(c.camera);
  const sx = (_v.x + 1) / 2 * innerWidth, fy = (1 - _v.y) / 2 * innerHeight, h = Math.min(innerHeight * 0.78, fy - innerHeight * 0.06);
  pEl.style.height = `${Math.max(120, h).toFixed(0)}px`; pEl.style.left = `${sx.toFixed(0)}px`; pEl.style.top = `${(fy - Math.max(120, h) * 0.97).toFixed(0)}px`;
}

function leave(c: SelectHookCtx) { show(c, false); }

// ---------------- 详情态取景（11-18c）：按模型包围盒高度统一取景，六职业都完整入画 ----------------
// 本体特写按固定距离拍，灵契猎手（武器高过头顶）等高个模型会顶出画面上沿。这里按选中模型实际高度算镜头距离：
// 脚统一落在 NDC FIT_BOT（职业头像条上沿附近）；模型高到头顶超过 FIT_TOP 时拉远镜头，矮的保持本体特写距离；镜头水平看。每职业记最高的一次（动作 / 演示不来回推拉）
const FIT_TOP = 0.70, FIT_BOT = -0.50;
const fitH: Record<string, { lo: number; hi: number }> = {};
let fitT = 0;
const _b = new THREE.Box3(), _mb = new THREE.Box3(), _fp = new THREE.Vector3();
function measure(o: THREE.Object3D): { lo: number; hi: number } | null {
  _b.makeEmpty(); o.updateMatrixWorld(true);
  o.traverseVisible(x => {
    const m = x as THREE.Mesh; if (!m.isMesh || !m.geometry) return;
    const mt = m.material as THREE.Material; if (mt && !Array.isArray(mt) && mt.transparent && mt.blending === THREE.AdditiveBlending) return;   // 发光 / 光晕片不算身高
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _mb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld); _b.union(_mb);
  });
  if (_b.isEmpty()) return null;
  // 脚底按模型根节点高度算：模型下面挂的地面阴影 / 贴花等（实测战士包围盒底比脚低近 1 米）不算，免得人物被抬高缩小
  const foot = o.getWorldPosition(_fp).y;
  return { lo: Math.max(_b.min.y, foot - 0.05), hi: _b.max.y };
}
function focusCam(c: SelectHookCtx, p: THREE.Vector3, l: THREE.Vector3, fov: number): number | void {
  if (!c.player || d1Off('selhud')) return;
  const now = performance.now();
  if (!fitH[c.chosen] || now - fitT > 300) {
    fitT = now; const m = measure(c.player);
    if (m && m.hi - m.lo > 0.2) { const o = fitH[c.chosen]; fitH[c.chosen] = o ? { lo: Math.min(o.lo, m.lo), hi: Math.max(o.hi, m.hi) } : m; }
  }
  const f = fitH[c.chosen]; if (!f) return;
  const T = Math.tan(THREE.MathUtils.degToRad(fov) / 2), h = f.hi - f.lo;
  let dx = p.x - l.x, dz = p.z - l.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  // 只往后拉、不往前推：矮的职业保持本体特写距离（否则会被放得很大），高的按包围盒拉远到头顶落在 FIT_TOP；脚统一落在 FIT_BOT
  const D = Math.max(h / ((FIT_TOP - FIT_BOT) * T), L), yc = f.lo - FIT_BOT * D * T;
  l.y = yc; p.set(l.x + dx * D, yc, l.z + dz * D);
}

// ---------------- HUD（DOM + CSS，读写本体选角面板的节点） ----------------
const CSS = `
html.d1hud #title.sel{--d1a:#7fe6da;--d1b:#3fa9a0;--d1cu:#c27a48;--d1ink:#d9efec;--d1dim:#8fb3ae;--d1bg:rgba(5,16,20,.80);--d1bg2:rgba(8,24,28,.88)}
html.d1hud #title.sel.sel-b{background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 40%,rgba(1,6,8,.55) 100%)}
html.d1hud #title.sel.sel-b .sel-rule,html.d1hud #title.sel.sel-b .sel-logo{display:none}
/* 铁框 + 铜铆钉（通用面板皮） */
html.d1hud .d1-frame{position:absolute;pointer-events:none;border:1px solid rgba(127,230,218,.55);border-radius:4px;background:linear-gradient(180deg,var(--d1bg),var(--d1bg2));
  box-shadow:inset 0 0 0 4px rgba(3,10,12,.85),inset 0 0 0 5px rgba(90,110,112,.55),0 0 0 2px rgba(2,8,10,.9),0 14px 40px rgba(0,0,0,.6),0 0 18px rgba(80,210,200,.12)}
html.d1hud .d1-frame i{position:absolute;width:7px;height:7px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f0b48a,#c27a48 45%,#5a3016);box-shadow:0 0 4px rgba(0,0,0,.8)}
html.d1hud .d1-frame i:nth-child(1){left:-4px;top:-4px}html.d1hud .d1-frame i:nth-child(2){right:-4px;top:-4px}html.d1hud .d1-frame i:nth-child(3){left:-4px;bottom:-4px}html.d1hud .d1-frame i:nth-child(4){right:-4px;bottom:-4px}
html.d1hud .d1-frame b{position:absolute;left:0;right:0;top:12px;text-align:center;font:600 clamp(16px,1.35vw,21px)/1.2 "STKaiti","KaiTi","Kaiti SC",serif;letter-spacing:.3em;color:#bff3ec;text-shadow:0 0 10px rgba(80,220,200,.4)}
html.d1hud .d1-frame b:after{content:'';display:block;height:1px;margin:10px 14px 0;background:linear-gradient(90deg,transparent,rgba(127,230,218,.6),transparent)}
html.d1hud .d1-frame small{position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:11px;letter-spacing:.15em;color:#6f9893}
html.d1hud #d1-hud{display:none}
html.d1hud #title.sel.sel-b #d1-hud{display:block}
#d1-hud .d1-left{left:clamp(10px,2.4vw,40px);top:clamp(60px,10vh,110px);bottom:clamp(110px,15vh,150px);width:clamp(220px,20vw,300px)}
#d1-hud .d1-right{right:clamp(10px,2.4vw,40px);top:clamp(60px,10vh,110px);bottom:clamp(110px,15vh,150px);width:clamp(240px,21vw,330px)}
#d1-hud .d1-strip{left:50%;transform:translateX(-50%);bottom:clamp(64px,9vh,92px);height:clamp(76px,10.5vh,96px);width:min(46vw,620px)}
#d1-hud .d1-bar{left:50%;transform:translateX(-50%);bottom:clamp(10px,1.8vh,20px);height:clamp(46px,6.4vh,58px);width:min(70vw,980px);background:linear-gradient(180deg,rgba(4,14,18,.86),rgba(2,8,10,.92))}
/* 本体面板拆开摆位：#cs 本身只当容器 */
html.d1hud #title.sel.sel-b #cs{position:absolute;inset:0;width:auto;top:0;bottom:0;right:0;padding:0;background:none;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;overflow:visible;display:block;pointer-events:none;animation:none}
html.d1hud #title.sel.sel-b #cs>*{position:absolute;pointer-events:auto}
html.d1hud #title.sel.sel-b #sel-back{right:calc(clamp(10px,2.4vw,40px) + 6px);top:calc(clamp(60px,10vh,110px) + 6px);color:#7fb8b1;z-index:2}
html.d1hud #title.sel.sel-b #sel-back:hover{color:var(--d1a)}
/* 右：职业介绍 */
html.d1hud #title.sel.sel-b #cs-info{right:calc(clamp(10px,2.4vw,40px) + 18px);top:calc(clamp(60px,10vh,110px) + 16px);bottom:calc(clamp(110px,15vh,150px) + 12px);width:calc(clamp(240px,21vw,330px) - 36px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(127,230,218,.4) transparent;color:var(--d1ink);font-size:13px;line-height:1.6}
html.d1hud #title.sel .si-name{background:linear-gradient(180deg,#e8fffb,#7fe6da 60%,#2f9b92);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:.5em;filter:drop-shadow(0 0 8px rgba(80,220,200,.35))}
html.d1hud #title.sel .si-role{order:2;text-align:left;color:var(--d1ink);letter-spacing:.08em;font-size:13px;margin:0}
html.d1hud #title.sel .si-role:before{content:'定位';display:block;color:var(--d1cu);font-weight:600;letter-spacing:.15em;margin:4px 0 0}
html.d1hud #title.sel .si-rule{background:linear-gradient(90deg,transparent,rgba(127,230,218,.7),transparent)}
html.d1hud #title.sel .si-rule:after{background:var(--d1cu)}
html.d1hud #title.sel #cs-info{display:flex;flex-direction:column}
html.d1hud #title.sel .si-diff{order:1;justify-content:flex-start;color:var(--d1ink);letter-spacing:.2em;font-size:13px;margin:2px 0 6px;gap:8px}
html.d1hud #title.sel .si-diff i{width:11px;height:11px;transform:rotate(45deg);border-radius:1px;border:1px solid rgba(127,230,218,.6);background:rgba(127,230,218,.06)}
html.d1hud #title.sel .si-diff i.on{background:linear-gradient(135deg,#d8fffa,#5fd6c9);box-shadow:0 0 8px rgba(110,240,220,.7)}
html.d1hud #title.sel .si-name,html.d1hud #title.sel .si-rule{order:0}
html.d1hud #title.sel .si-desc{order:3;text-align:left;color:var(--d1ink);font-size:13px}
html.d1hud #title.sel .si-desc:before{content:'职业简介';display:block;color:var(--d1cu);font-weight:600;letter-spacing:.15em;margin:6px 0 2px}
html.d1hud #title.sel .si-stats{order:4;margin:4px 0 2px}
html.d1hud #title.sel .si-stats div{border-color:rgba(127,230,218,.2);background:rgba(127,230,218,.04)}
html.d1hud #title.sel .si-stats small{color:var(--d1dim)}html.d1hud #title.sel .si-stats b{color:#cffaf4}
html.d1hud #title.sel .si-h{order:5;color:var(--d1cu);font-weight:600;letter-spacing:.15em}
html.d1hud #title.sel #cs-info .trees{order:6;flex-direction:column}
html.d1hud #title.sel #cs-info .trees div{border-color:rgba(127,230,218,.18);background:rgba(127,230,218,.03)}
html.d1hud #title.sel #cs-info .trees b{color:#bff3ec}html.d1hud #title.sel #cs-info .trees b:before{content:'◆ ';color:var(--d1a);font-size:11px}
html.d1hud #title.sel #cs-info .trees small{color:var(--d1dim)}
html.d1hud #title.sel #cs-info .trees + .si-h{order:7}
html.d1hud #title.sel #cs-info .sigs{order:8;justify-content:space-between;margin-top:8px}
html.d1hud #title.sel #cs-info .sig{color:var(--d1dim)}
html.d1hud #title.sel #cs-info .sig>:first-child{border-radius:3px!important;border:1px solid rgba(127,230,218,.7)!important;box-shadow:0 0 0 3px rgba(3,10,12,.85),0 0 0 4px rgba(194,122,72,.45)!important;width:54px!important;height:54px!important}
html.d1hud #title.sel #cs-info .sig:hover>:first-child{box-shadow:0 0 0 3px rgba(3,10,12,.85),0 0 16px rgba(110,240,220,.7)!important}
html.d1pick #title.sel.sel-b #class-pick,html.d1pick #title.sel.sel-b #cs-info,html.d1pick #title.sel.sel-b #cs-create{display:none!important}
html.d1make #title.sel.sel-b #cs-slots,html.d1make #title.sel.sel-b .cs-head{display:none!important}
#d1-back{position:fixed;z-index:31;left:clamp(14px,2.4vw,40px);top:clamp(60px,10vh,110px);padding:10px 20px;cursor:pointer;color:#bff3ec;font:600 15px/1 "STKaiti","KaiTi","Kaiti SC",serif;letter-spacing:.2em;background:linear-gradient(180deg,rgba(14,34,38,.85),rgba(6,18,22,.92));border:1px solid rgba(127,230,218,.55);border-radius:3px}
#d1-home{position:fixed;z-index:31;right:clamp(64px,6vw,96px);top:clamp(14px,2.4vh,26px);padding:10px 20px;cursor:pointer;color:#f1d9a6;font:600 15px/1 "STKaiti","KaiTi","Kaiti SC",serif;letter-spacing:.2em;background:linear-gradient(180deg,rgba(30,24,14,.88),rgba(12,9,5,.94));border:1px solid rgba(214,170,96,.6);border-radius:3px}
#title>#d1-home,#title>#d1-back{position:fixed!important;z-index:31!important}   /* 11-18 本体 #title>*{position:relative} 盖掉 fixed → 按钮被拉成全屏横条 */
#d1-home:hover{box-shadow:0 0 12px rgba(240,190,110,.5);color:#fff}
#d1-amb{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;mix-blend-mode:screen}
#d1-amb canvas{position:absolute;inset:0;width:100%;height:100%}
#d1-amb .bm{position:absolute;top:-10%;height:125%;transform-origin:50% 0;background:linear-gradient(180deg,rgba(190,230,240,.20),rgba(150,210,225,.07) 55%,rgba(150,210,225,0));filter:blur(14px);animation:d1bm 11s ease-in-out infinite alternate}
#d1-amb .b1{left:26%;width:9vw;transform:rotate(-14deg)}#d1-amb .b2{left:52%;width:14vw;transform:rotate(-11deg);animation-delay:-4s;animation-duration:14s}#d1-amb .b3{left:70%;width:6vw;transform:rotate(-16deg);animation-delay:-7s}
@keyframes d1bm{0%{opacity:.35}50%{opacity:.85}100%{opacity:.5}}
#d1-ring{position:fixed;z-index:2;pointer-events:none;width:min(30vw,420px);height:min(30vw,420px);transform:translate(-50%,-50%) scaleY(.26);mix-blend-mode:screen}
#d1-ring svg{width:100%;height:100%;fill:none;stroke:rgba(127,230,218,.55);stroke-width:1.2;filter:drop-shadow(0 0 6px rgba(110,240,220,.8))}
#d1-ring .r1{transform-origin:100px 100px;animation:d1rr 40s linear infinite}#d1-ring .r2{transform-origin:100px 100px;animation:d1rr 26s linear infinite reverse;opacity:.7}
#d1-ring{animation:d1rp 5s ease-in-out infinite alternate}@keyframes d1rp{0%{opacity:.45}100%{opacity:.9}}@keyframes d1rr{to{transform:rotate(360deg)}}
#d1-back:hover{box-shadow:0 0 12px rgba(110,240,220,.55);color:#fff}
#d1-rot{position:fixed;z-index:31;transform:translateX(-50%);display:flex;align-items:center;gap:12px;pointer-events:auto;user-select:none;color:#bff3ec;font:600 13px/1 "STKaiti","KaiTi","Kaiti SC",serif;letter-spacing:.25em;text-shadow:0 1px 4px #000,0 0 10px rgba(80,220,200,.35);opacity:.85}
#d1-rot button{width:34px;height:34px;border-radius:50%;border:1px solid rgba(127,230,218,.6);background:radial-gradient(circle at 40% 35%,rgba(20,46,48,.9),rgba(3,10,12,.92));color:#bff3ec;font-size:18px;line-height:1;cursor:pointer;padding:0}
#d1-rot button:hover{box-shadow:0 0 12px rgba(110,240,220,.6);color:#fff}
#d1-rot span{padding:4px 2px;background:linear-gradient(90deg,transparent,rgba(3,10,12,.6),transparent)}
#d1-port{position:fixed;z-index:0;transform:translateX(-50%);width:auto;pointer-events:none;opacity:0;-webkit-mask-image:radial-gradient(ellipse 46% 50% at 50% 52%,#000 62%,transparent 100%);mask-image:radial-gradient(ellipse 46% 50% at 50% 52%,#000 62%,transparent 100%)}
/* 左：角色列表 */
html.d1hud #title.sel.sel-b .cs-head{left:calc(clamp(10px,2.4vw,40px) + 16px);bottom:calc(clamp(110px,15vh,150px) + 8px);width:calc(clamp(220px,20vw,300px) - 32px);border:0;margin:0;padding:0;justify-content:center;color:#6f9893;font-size:11px}
html.d1hud #title.sel.sel-b .cs-head b{display:none}
html.d1hud #title.sel.sel-b #cs-slots{left:calc(clamp(10px,2.4vw,40px) + 14px);top:calc(clamp(60px,10vh,110px) + 58px);bottom:calc(clamp(110px,15vh,150px) + 30px);width:calc(clamp(220px,20vw,300px) - 28px);overflow-y:auto;gap:8px;scrollbar-width:thin;scrollbar-color:rgba(127,230,218,.4) transparent}
html.d1hud #title.sel #cs-slots .cslot.hide:not(.empty){display:flex}
html.d1hud #title.sel #cs-slots .cslot{min-height:64px;padding:8px 10px;gap:10px;align-items:center;background:linear-gradient(180deg,rgba(14,34,38,.75),rgba(6,18,22,.85));border:1px solid rgba(110,170,166,.35);border-radius:3px;box-shadow:inset 0 0 0 3px rgba(3,10,12,.6)}
html.d1hud #title.sel #cs-slots .cslot.on{border-color:var(--d1a);background:linear-gradient(180deg,rgba(24,64,66,.8),rgba(8,26,30,.9));box-shadow:inset 0 0 0 3px rgba(3,10,12,.6),0 0 14px rgba(110,240,220,.25)}
html.d1hud #title.sel #cs-slots .cslot .portrait,html.d1hud #title.sel #cs-slots .cslot .plus{width:48px;height:48px;border-radius:50%;border:2px solid rgba(127,230,218,.45);box-shadow:0 0 0 3px rgba(3,10,12,.85);color:var(--d1a)}
html.d1hud #title.sel #cs-slots .cslot.on .portrait{border-color:var(--d1a);box-shadow:0 0 0 3px rgba(3,10,12,.85),0 0 12px rgba(110,240,220,.6)}
html.d1hud #title.sel #cs-slots .cslot b{color:#e2fbf7;font-size:15px}html.d1hud #title.sel #cs-slots .cslot small{color:var(--d1b);font-size:12px}html.d1hud #title.sel #cs-slots .cslot i{color:#6f9893;font-size:11px}
html.d1hud #title.sel #cs-slots .cslot.empty{justify-content:center}html.d1hud #title.sel #cs-slots .cslot.empty .plus{border:0;box-shadow:none;width:auto}
/* 底中：职业头像条 */
html.d1hud #title.sel.sel-b #class-pick{inset:auto 0 calc(clamp(64px,9vh,92px) + 6px) 0;gap:clamp(8px,1.4vw,22px)}
html.d1hud #title.sel.sel-b #class-pick .ccard .portrait{width:clamp(44px,4.4vw,58px);height:clamp(44px,4.4vw,58px);border:2px solid rgba(110,170,166,.45);filter:saturate(.55) brightness(.8)}
html.d1hud #title.sel.sel-b #class-pick .ccard.on .portrait{border-color:var(--d1a);box-shadow:0 0 0 3px rgba(3,10,12,.85),0 0 18px rgba(110,240,220,.75);filter:none}
html.d1hud #title.sel.sel-b #class-pick .ccard b{color:#9cc8c2;font-family:inherit}
html.d1hud #title.sel.sel-b #class-pick .ccard.on b{color:#e2fbf7;text-shadow:0 0 10px rgba(110,240,220,.6)}
/* 底：角色名 + 进入游戏 */
html.d1hud #title.sel.sel-b #cs-create,html.d1hud #title.sel.sel-b #cs-detail{left:calc(50% - min(35vw,490px) + 18px);bottom:clamp(10px,1.8vh,20px);height:clamp(46px,6.4vh,58px);width:calc(min(70vw,980px) - min(19vw,250px) - 40px);justify-content:center;gap:0}
html.d1hud #title.sel.sel-b .cs-form{color:var(--d1dim);font-size:14px;gap:10px;flex-wrap:nowrap}
html.d1hud #title.sel.sel-b .cs-form label{color:#cdeee9;letter-spacing:.2em}
html.d1hud #title.sel.sel-b .cs-form input{width:clamp(120px,14vw,220px);font-size:16px;background:rgba(0,0,0,.4);border:1px solid rgba(127,230,218,.45);color:#e8fffb}
html.d1hud #title.sel.sel-b .cs-form .btn{border-color:rgba(127,230,218,.35);color:var(--d1dim)}
html.d1hud #title.sel.sel-b #cs-looks .sw.on{border-color:var(--d1a);box-shadow:0 0 8px rgba(110,240,220,.7)}
html.d1hud #title.sel.sel-b #cs-detail{display:flex;align-items:center;overflow:hidden;font-size:12px;color:var(--d1dim)}
html.d1hud #title.sel.sel-b #cs-detail-info .row{display:inline;margin-right:10px}
html.d1hud #title.sel.sel-b .cs-go{right:calc(50% - min(35vw,490px) + 10px);bottom:calc(clamp(10px,1.8vh,20px) + 5px);height:calc(clamp(46px,6.4vh,58px) - 10px);width:min(19vw,250px)}
html.d1hud #title.sel.sel-b #start{width:100%;height:100%;font-size:clamp(17px,1.5vw,23px);letter-spacing:.4em;color:#effffc;background:linear-gradient(180deg,rgba(30,86,86,.95),rgba(8,32,36,.98));border:1px solid var(--d1a);box-shadow:inset 0 0 0 3px rgba(3,10,12,.85),inset 0 0 0 4px rgba(194,122,72,.6),0 0 22px rgba(80,220,200,.35)}
html.d1hud #title.sel.sel-b #start:hover{box-shadow:inset 0 0 0 3px rgba(3,10,12,.85),inset 0 0 0 4px rgba(224,150,90,.85),0 0 30px rgba(100,240,220,.6)}
html.d1hud #title.sel.sel-b .cs-io{left:calc(clamp(10px,2.4vw,40px));bottom:calc(clamp(10px,1.8vh,20px) + 64px);display:none}
html.d1hud #title.sel.sel-b #cs-warn{left:50%;bottom:calc(clamp(64px,9vh,92px) + clamp(76px,10.5vh,96px) + 8px);transform:translateX(-50%)}
html.d1hud #title.sel.sel-b .tbtns{display:none}
html.d1hud #title.sel.sel-b #cs-name-err{position:absolute;left:0;right:0;top:-22px;text-align:center}
/* 11-18c 右面板：加高到底栏上沿（头像条收窄避开）；属性 2×2、标签与数值同一行不折行 */
#d1-hud .d1-strip{width:min(44vw,620px)}
#d1-hud .d1-right{bottom:calc(clamp(10px,1.8vh,20px) + clamp(46px,6.4vh,58px) + 8px)}
html.d1hud #title.sel.sel-b #cs-info{bottom:calc(clamp(10px,1.8vh,20px) + clamp(46px,6.4vh,58px) + 18px)}
html.d1hud #title.sel .si-stats{grid-template-columns:1fr 1fr;gap:4px}
html.d1hud #title.sel .si-stats div{display:flex;justify-content:space-between;align-items:baseline;gap:6px;padding:3px 8px;white-space:nowrap}
html.d1hud #title.sel .si-stats small{display:inline;letter-spacing:.05em}html.d1hud #title.sel .si-stats b{display:inline;font-size:14px}
/* 矮屏（≤820 高，含 960×540 / 1280×720）：收紧行距，定位 / 简介标签与正文同行，专精三项横排只显示名字（说明在悬停提示里），招牌技能图标缩小 → 不滚动也能看到专精与招牌技能 */
@media (max-height:820px){
html.d1hud #title.sel.sel-b #cs-info{font-size:12px;line-height:1.5}
html.d1hud #title.sel .si-name{font-size:24px;letter-spacing:.4em}
html.d1hud #title.sel .si-rule{margin:4px 10% 6px}
html.d1hud #title.sel .si-diff{font-size:12px;margin:0 0 4px}
html.d1hud #title.sel .si-role,html.d1hud #title.sel .si-desc{font-size:12px}
html.d1hud #title.sel .si-role:before,html.d1hud #title.sel .si-desc:before{display:inline;margin:0 .6em 0 0}
html.d1hud #title.sel .si-h{margin:6px 0 3px;font-size:12px}
html.d1hud #title.sel #cs-info .trees{flex-direction:row;gap:4px}
html.d1hud #title.sel #cs-info .trees div{padding:2px 4px;text-align:center;min-width:0}
html.d1hud #title.sel #cs-info .trees b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}html.d1hud #title.sel #cs-info .trees b:before{display:none}
html.d1hud #title.sel #cs-info .trees small{display:none}
html.d1hud #title.sel #cs-info .sigs{margin-top:2px}
html.d1hud #title.sel #cs-info .sig{font-size:11px;gap:2px}
html.d1hud #title.sel #cs-info .sig>:first-child{width:40px!important;height:40px!important}
}
`;

const BTN_SEL = ['#title.sel .sel-btn', '#title.sel .btn', '#title.sel #sel-back', '#d1-back', '#d1-home', '#d1-wc .bt:not(.go)', '#d1-wc .snd', '#d1-rot button'];
const BTN_CSS = `
html.d1btn :is(${BTN_SEL.join(',')}){border-style:solid!important;border-color:transparent!important;border-width:clamp(9px,1.5vh,13px) clamp(16px,2.4vh,24px)!important;border-image:var(--d1btn) 62 104 62 104 fill / clamp(9px,1.5vh,13px) clamp(16px,2.4vh,24px) / 0 stretch!important;background:none!important;box-shadow:none!important;border-radius:0!important;color:#f1e2b8!important;text-shadow:0 1px 3px #000,0 0 10px rgba(255,200,120,.3)!important;font-family:"STKaiti","KaiTi","Kaiti SC",serif!important;letter-spacing:.18em;padding:2px 10px!important;min-height:0;transition:filter .15s}
html.d1btn :is(${BTN_SEL.join(',')}):hover{filter:brightness(1.25) drop-shadow(0 0 8px rgba(255,205,130,.55))!important;color:#fff6dc!important}
html.d1btn :is(${BTN_SEL.join(',')}):active{filter:brightness(.92)!important}
html.d1btn #title.sel .sel-btn.hot,html.d1btn #title.sel #start{font-size:clamp(16px,1.4vw,21px)!important;letter-spacing:.4em;padding:6px 22px!important;color:#fff6dc!important}
html.d1btn #title.sel #sel-back,html.d1btn #d1-wc .snd,html.d1btn #d1-rot button{border-width:8px 12px!important;border-image-width:8px 12px!important;padding:2px 4px!important;letter-spacing:0}
`;
function install() {
  if (typeof document === 'undefined') return;
  const st = document.createElement('style'); st.id = 'd1-hud-css'; st.textContent = CSS; document.head.appendChild(st);
  document.documentElement.classList.add('d1hud');
  // 11-18 Rhett「按钮的 HUD 也升级，用之前的概念图」：选角 / 创角 / 登录屏所有按钮换成概念图鎏金石牌（wc_btn，九宫格拉伸不压花纹），?off=selbtn 回旧
  if (SELUI.wc_btn && !d1Off('selbtn')) {
    document.documentElement.style.setProperty('--d1btn', `url("${SELUI.wc_btn}")`); document.documentElement.classList.add('d1btn');
    const bs = document.createElement('style'); bs.id = 'd1-btn-css'; bs.textContent = BTN_CSS; document.head.appendChild(bs);
  }
  const go = () => {
    const ti = document.getElementById('title'); if (!ti) return void setTimeout(go, 200);
    const hud = document.createElement('div'); hud.id = 'd1-hud';
    const fr = (cls: string, head = '', foot = '') => `<div class="d1-frame ${cls}"><i></i><i></i><i></i><i></i>${head ? `<b>${head}</b>` : ''}${foot ? `<small>${foot}</small>` : ''}</div>`;
    // 11-18 Rhett「那些框很奇怪」：四块装饰底框（列表 / 详情 / 头像条 / 名字栏）和实际内容对不齐、空着浮在中间 → 去掉（?off=selnoframe 回）
    hud.innerHTML = d1Off('selnoframe') ? fr('d1-left', '角色列表') + fr('d1-right') + fr('d1-strip') + fr('d1-bar') : '';
    ti.insertBefore(hud, ti.firstChild);
    // 点「创建角色」→ 直接进当前职业的详情 HUD（等 3D 选角开起来再点当前职业牌）
    document.getElementById('sel-create')?.addEventListener('click', () => setTimeout(() => {
      if (ti.classList.contains('sel-b')) return;
      (document.querySelector('#class-pick .ccard.on') as HTMLElement | null ?? document.querySelector('#class-pick .ccard') as HTMLElement | null)?.click();
    }, 30));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
}

export function installSelHud() {
  if (d1Off('selhud')) return;
  install();
  selectHook({ prepare: c => ensure(c), tick, leave, focusCam });
  (window as unknown as { __d1Hud?: unknown }).__d1Hud = () => ({ shown, cur, want, mix, layer: LAYER, fit: fitH });
}
