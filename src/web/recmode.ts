// v1.2.38c 录制模式（宣传片用）：网址带 ?rec=1 才启用，普通玩家看不到。
// 通用工具，不含任何内容包专属逻辑。
//   `  (反引号)  自由相机 开 / 关（脱离角色，WASD 平移、Q/E 降 / 升、按住右键或点画面锁定鼠标转视角）
//   \  (反斜杠)  隐藏 / 显示全部界面（血条、技能栏、伤害数字、小地图、提示、指引线、目标圈）
//   自由相机里：Shift 加速 ×4、C 减速 ×0.2、滚轮调速度；G 冻结 / 解冻怪物；Z / X 时间缩放 −/+（0.25–1）
//               1 记起点、2 记终点、P 播放 / 停止路径、L 匀速 / 缓动、[ ] 时长 −/+、数字面板选存档槽
// 锁 60 帧、画布固定 1920×1080（窗口小时等比缩放留黑边）。
import * as THREE from 'three';

export interface CamPose { p: [number, number, number]; q: [number, number, number, number]; fov: number }
interface RecPath { a?: CamPose; b?: CamPose; dur: number; ease: boolean }

const LS_KEY = 'anyan_rec_paths_v1';
const SCALES = [0.25, 0.5, 0.75, 1];

export const rec = {
  on: false,          // ?rec=1
  noUI: false,        // 隐藏界面
  free: false,        // 自由相机
  freezeAI: false,    // 冻结怪物 / 首领 / 弹幕 / 红圈
  timeScale: 1,
  speed: 6,           // 自由相机移动速度（米 / 秒）
  playing: false,     // 正在播放路径
};

export function recEnabled(): boolean {
  try { return new URLSearchParams(location.search).get('rec') === '1'; } catch { return false; }
}

let cam!: THREE.PerspectiveCamera;
let canvas!: HTMLCanvasElement;
let onSize: () => void = () => {};
let panel: HTMLDivElement | null = null;
const pos = new THREE.Vector3();
let yaw = 0, pitch = 0;
const held = new Set<string>();
let dragging = false;
let slot = 0;
let paths: RecPath[] = [];
let playT = 0;
let msg = '', msgT = 0;

function loadPaths() {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); if (Array.isArray(v)) paths = v; } catch { paths = []; }
  for (let i = 0; i < 5; i++) if (!paths[i]) paths[i] = { dur: 8, ease: true };
}
function savePaths() { try { localStorage.setItem(LS_KEY, JSON.stringify(paths)); } catch { /* 无痕模式 */ } }
const cur = () => paths[slot];
function note(s: string) { msg = s; msgT = 2.5; renderPanel(); }

function poseNow(): CamPose {
  const q = cam.quaternion;
  return { p: [+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3)], q: [q.x, q.y, q.z, q.w], fov: cam.fov };
}
function applyYawPitch() {
  cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}
function setFromPose(c: CamPose) {
  pos.set(c.p[0], c.p[1], c.p[2]);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(c.q[0], c.q[1], c.q[2], c.q[3]), 'YXZ');
  yaw = e.y; pitch = e.x;
}

/** 缓动：正弦慢入慢出 */
export const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1));
/** 路径插值（导出给测试用） */
export function lerpPose(a: CamPose, b: CamPose, t: number, ease: boolean): { p: THREE.Vector3; q: THREE.Quaternion; fov: number } {
  const k = ease ? easeInOut(t) : THREE.MathUtils.clamp(t, 0, 1);
  const p = new THREE.Vector3(...a.p).lerp(new THREE.Vector3(...b.p), k);
  const q = new THREE.Quaternion(...a.q).slerp(new THREE.Quaternion(...b.q), k);
  return { p, q, fov: a.fov + (b.fov - a.fov) * k };
}

function enterFree() {
  rec.free = true;
  pos.copy(cam.position);
  const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); yaw = e.y; pitch = e.x;
  note('自由相机：开');
}
function exitFree() {
  rec.free = false; rec.playing = false; held.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  note('自由相机：关（回到角色）');
}
function togglePlay() {
  const p = cur();
  if (rec.playing) { rec.playing = false; note('路径：停止'); return; }
  if (!p.a || !p.b) { note('先按 1 记起点、2 记终点'); return; }
  if (!rec.free) enterFree();
  rec.playing = true; playT = 0; setFromPose(p.a); note(`路径播放 ${p.dur}s ${p.ease ? '缓动' : '匀速'}`);
}

/** 主循环的按键入口：返回 true 表示录制模式吃掉了这个键 */
export function recKey(e: KeyboardEvent, down: boolean): boolean {
  if (!rec.on) return false;
  const k = e.key.toLowerCase();
  if (down && (k === '`' || e.code === 'Backquote')) { rec.free ? exitFree() : enterFree(); e.preventDefault(); return true; }
  if (down && (k === '\\' || e.code === 'Backslash')) { setNoUI(!rec.noUI); e.preventDefault(); return true; }
  if (!rec.free) return false;
  // 自由相机里：所有键都归录制模式（角色不动）
  if (!down) { held.delete(k); return true; }
  held.add(k);
  const p = cur();
  if (k === 'g') { rec.freezeAI = !rec.freezeAI; note(rec.freezeAI ? '怪物：冻结' : '怪物：解冻'); }
  else if (k === 'z' || k === 'x') { const i = SCALES.indexOf(rec.timeScale); rec.timeScale = SCALES[THREE.MathUtils.clamp((i < 0 ? 3 : i) + (k === 'z' ? -1 : 1), 0, SCALES.length - 1)]; note(`时间 ×${rec.timeScale}`); }
  else if (k === '1') { p.a = poseNow(); savePaths(); note(`槽 ${slot + 1} 起点已记`); }
  else if (k === '2') { p.b = poseNow(); savePaths(); note(`槽 ${slot + 1} 终点已记`); }
  else if (k === 'p') togglePlay();
  else if (k === 'l') { p.ease = !p.ease; savePaths(); note(p.ease ? '缓动' : '匀速'); }
  else if (k === '[' || k === ']') { p.dur = THREE.MathUtils.clamp(p.dur + (k === '[' ? -1 : 1) * (p.dur >= 20 ? 5 : 1), 1, 120); savePaths(); note(`时长 ${p.dur}s`); }
  else if (k === 'h') { setNoUI(!rec.noUI); }
  e.preventDefault();
  return true;
}

export function setNoUI(v: boolean) {
  rec.noUI = v;
  document.body.classList.toggle('rec-noui', v);
  renderPanel();
}

/** 每帧（用真实时间，不受时间缩放影响）。返回 true = 本帧相机归录制模式管 */
export function recUpdate(realDt: number): boolean {
  if (!rec.on) return false;
  if (msgT > 0) { msgT -= realDt; if (msgT <= 0) { msg = ''; renderPanel(); } }
  if (!rec.free) return false;
  if (rec.playing) {
    const p = cur(); playT += realDt;
    if (p.a && p.b) {
      const r = lerpPose(p.a, p.b, playT / p.dur, p.ease);
      pos.copy(r.p); cam.position.copy(r.p); cam.quaternion.copy(r.q);
      if (Math.abs(cam.fov - r.fov) > 0.01) { cam.fov = r.fov; cam.updateProjectionMatrix(); }
      const e = new THREE.Euler().setFromQuaternion(r.q, 'YXZ'); yaw = e.y; pitch = e.x;
    }
    if (playT >= p.dur) { rec.playing = false; note('路径：结束'); }
    return true;
  }
  let sp = rec.speed;
  if (held.has('shift')) sp *= 4;
  if (held.has('c')) sp *= 0.2;   // v1.2.39 原 Ctrl 会触发浏览器快捷键（Ctrl+W 关页）
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const mv = new THREE.Vector3();
  if (held.has('w')) mv.add(fwd); if (held.has('s')) mv.sub(fwd);
  if (held.has('d')) mv.add(right); if (held.has('a')) mv.sub(right);
  if (held.has('e')) mv.y += 1; if (held.has('q')) mv.y -= 1;
  if (mv.lengthSq() > 0) pos.addScaledVector(mv.normalize(), sp * realDt);
  applyYawPitch();
  cam.position.copy(pos);
  return true;
}

function look(dx: number, dy: number) {
  yaw -= dx * 0.0025; pitch = THREE.MathUtils.clamp(pitch - dy * 0.0025, -1.5, 1.5);
}

/** 1920×1080 画布：窗口小时等比缩放 + 黑边 */
function fitCanvas() {
  const W = 1920, H = 1080, s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const w = Math.round(W * s), h = Math.round(H * s);
  Object.assign(canvas.style, { width: w + 'px', height: h + 'px', left: Math.round((window.innerWidth - w) / 2) + 'px', top: Math.round((window.innerHeight - h) / 2) + 'px', right: 'auto', bottom: 'auto' });
}

function renderPanel() {
  if (!panel) return;
  panel.style.display = rec.noUI ? 'none' : 'block';
  const p = cur();
  panel.innerHTML = `<b>录制模式</b> <span style="opacity:.7">1920×1080 · 60 帧</span><br>`
    + `<span>\` 自由相机：<b>${rec.free ? '开' : '关'}</b></span> · <span>\\ 或 H 隐藏界面</span> · WASD / QE 移动，Shift 加速，C 减速<br>`
    + `速度 ${rec.speed.toFixed(2)} 米/秒（滚轮）· 时间 ×${rec.timeScale}（Z/X）· 怪物 ${rec.freezeAI ? '冻结' : '活动'}（G）<br>`
    + `路径槽 ${[0, 1, 2, 3, 4].map(i => `<a data-slot="${i}" style="cursor:pointer;padding:0 3px;${i === slot ? 'background:#c8a040;color:#000' : ''}">${i + 1}</a>`).join('')}`
    + ` 起点 ${p.a ? '✓' : '—'} 终点 ${p.b ? '✓' : '—'} · ${p.dur}s（[ ]）· ${p.ease ? '缓动' : '匀速'}（L）· P 播放${rec.playing ? '中' : ''}`
    + (msg ? `<br><span style="color:#ffd060">${msg}</span>` : '');
  panel.querySelectorAll<HTMLElement>('[data-slot]').forEach(a => a.onclick = () => { slot = +a.dataset.slot!; rec.playing = false; renderPanel(); });
}

export function initRecMode(o: { camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement; resize: () => void }) {
  if (!recEnabled()) return;
  rec.on = true; cam = o.camera; canvas = o.canvas; onSize = o.resize;
  (window as unknown as { __recSize?: number[] }).__recSize = [1920, 1080];
  loadPaths();
  const st = document.createElement('style');
  st.textContent = `body.rec-noui>*:not(#game):not(script):not(style){visibility:hidden!important}
body.rec-noui .floater,body.rec-noui [class*="float"]{visibility:hidden!important}
body.rec-on{background:#000}
#recpanel{position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(0,0,0,.72);color:#eee;font:12px/1.6 sans-serif;padding:6px 10px;border:1px solid #c8a040;border-radius:6px;pointer-events:auto;max-width:560px}`;
  document.head.appendChild(st);
  document.body.classList.add('rec-on');
  panel = document.createElement('div'); panel.id = 'recpanel'; document.body.appendChild(panel);
  const resize = () => { fitCanvas(); onSize(); };
  window.addEventListener('resize', resize); resize();
  // 自由相机里拦下鼠标，不让游戏拿去转视角 / 点怪
  const cap = { capture: true } as const;
  canvas.addEventListener('mousedown', e => {
    if (!rec.free) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.button === 2) dragging = true; else if (e.button === 0 && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  }, cap);
  window.addEventListener('mouseup', () => { dragging = false; }, cap);
  window.addEventListener('mousemove', e => {
    if (!rec.free || rec.playing) return;
    if (document.pointerLockElement === canvas || dragging) { look(e.movementX, e.movementY); e.stopImmediatePropagation(); }
  }, cap);
  canvas.addEventListener('wheel', e => {
    if (!rec.free) return;
    e.stopImmediatePropagation(); e.preventDefault();
    rec.speed = THREE.MathUtils.clamp(rec.speed * (e.deltaY > 0 ? 0.8 : 1.25), 0.05, 60); renderPanel();
  }, { capture: true, passive: false });
  canvas.addEventListener('contextmenu', e => { if (rec.free) e.preventDefault(); }, cap);
  canvas.addEventListener('pointerdown', e => { if (rec.free) e.stopImmediatePropagation(); }, cap);
  window.addEventListener('blur', () => held.clear());
  renderPanel();
  // 给自动化脚本 / 截图用
  (window as unknown as { __rec?: unknown }).__rec = { rec, enterFree, exitFree, setNoUI, togglePlay, poseNow, setPose: (c: CamPose) => setFromPose(c), paths: () => paths, setSlot: (i: number) => { slot = i; renderPanel(); } };
}
