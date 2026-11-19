// v1.2.52 拍照模式（玩家可用，P 键 / 设置里的按钮）：隐藏全部界面，镜头绕角色自由环绕，一键保存带水印的 PNG。
// 通用工具，不含任何内容包专属逻辑。
//   左键拖动 = 环绕；右键拖动 / 方向键 = 平移焦点高度；滚轮 = 远近；[ ] = 视角（FOV）；H = 隐藏 / 显示提示条；Enter / 按钮 = 保存；P / Esc = 退出
import * as THREE from 'three';
import { GAME_NAME } from './version';

export const photo = { on: false, yaw: 0, pitch: 0.25, dist: 5, h: 1.2, fov: 50, hint: true, shots: 0, last: '' };
let cam!: THREE.PerspectiveCamera, canvas!: HTMLCanvasElement, bar: HTMLElement | null = null;
let focus: () => THREE.Vector3 = () => new THREE.Vector3();
let fov0 = 50, want = false, drag = 0, lx = 0, ly = 0;

function css() {
  if (document.getElementById('photo-css')) return;
  const st = document.createElement('style'); st.id = 'photo-css';
  st.textContent = `body.photo-on>*:not(#game):not(#photo-bar):not(script):not(style){visibility:hidden!important}
body.photo-on .floater,body.photo-on [class*="float"]{visibility:hidden!important}
#photo-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99998;background:rgba(10,8,6,.78);color:#e8dcc0;font:13px/1.6 serif;padding:8px 14px;border:1px solid #8a6a30;border-radius:8px;display:flex;gap:12px;align-items:center;white-space:nowrap}
#photo-bar button{background:#3a2a14;color:#ffd890;border:1px solid #c8a040;border-radius:5px;padding:3px 12px;font:600 13px serif;cursor:pointer}
#photo-bar .ph-msg{color:#ffd060}`;
  document.head.appendChild(st);
}

function renderBar() {
  if (!bar) return;
  bar.style.display = photo.on && photo.hint ? 'flex' : 'none';
  bar.innerHTML = `<b>拍照模式</b><span>左键拖动环绕 · 右键拖动升降 · 滚轮远近 · [ ] 视角 ${Math.round(photo.fov)}° · H 隐藏提示</span>`
    + `<button data-ph="save">保存图片（Enter）</button><button data-ph="exit">退出（P）</button>${photo.last ? `<span class="ph-msg">${photo.last}</span>` : ''}`;
  bar.querySelectorAll<HTMLButtonElement>('[data-ph]').forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.ph === 'save') photoSave(); else photoToggle(false); });
}

export function initPhotoMode(o: { camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement; focus: () => THREE.Vector3 }) {
  cam = o.camera; canvas = o.canvas; focus = o.focus; css();
  bar = document.createElement('div'); bar.id = 'photo-bar'; bar.style.display = 'none'; document.body.appendChild(bar);
  ['mousedown', 'pointerdown', 'click', 'touchstart'].forEach(k => bar!.addEventListener(k, e => e.stopPropagation()));
  const cap = { capture: true } as const;
  canvas.addEventListener('mousedown', e => { if (!photo.on) return; e.stopImmediatePropagation(); e.preventDefault(); drag = e.button === 2 ? 2 : 1; lx = e.clientX; ly = e.clientY; }, cap);
  canvas.addEventListener('contextmenu', e => { if (photo.on) e.preventDefault(); }, cap);
  window.addEventListener('mouseup', () => { drag = 0; }, cap);
  window.addEventListener('mousemove', e => {
    if (!photo.on || !drag) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    if (drag === 1) { photo.yaw -= dx * 0.006; photo.pitch = THREE.MathUtils.clamp(photo.pitch + dy * 0.004, -0.35, 1.45); }
    else photo.h = THREE.MathUtils.clamp(photo.h - dy * 0.01, 0.1, 4);
  }, cap);
  canvas.addEventListener('wheel', e => { if (!photo.on) return; e.stopImmediatePropagation(); e.preventDefault(); photo.dist = THREE.MathUtils.clamp(photo.dist * (1 + e.deltaY * 0.0012), 1.4, 30); }, { capture: true, passive: false });
  // 触屏：单指环绕、双指缩放
  let t0: Touch[] = [], d0 = 0, dist0 = 5;
  canvas.addEventListener('touchstart', e => { if (!photo.on) return; e.stopImmediatePropagation(); t0 = Array.from(e.touches); if (t0.length === 2) { d0 = Math.hypot(t0[0].clientX - t0[1].clientX, t0[0].clientY - t0[1].clientY); dist0 = photo.dist; } }, { capture: true, passive: true });
  canvas.addEventListener('touchmove', e => { if (!photo.on) return; e.stopImmediatePropagation(); const t = Array.from(e.touches);
    if (t.length === 1 && t0.length === 1) { photo.yaw -= (t[0].clientX - t0[0].clientX) * 0.008; photo.pitch = THREE.MathUtils.clamp(photo.pitch + (t[0].clientY - t0[0].clientY) * 0.005, -0.35, 1.45); }
    if (t.length === 2 && d0) photo.dist = THREE.MathUtils.clamp(dist0 * d0 / Math.max(10, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)), 1.4, 30);
    if (t.length === 1) t0 = t; }, { capture: true, passive: true });
}

/** 开 / 关；startYaw = 当前游戏镜头朝向（进入时从游戏镜头的位置平滑接过来） */
export function photoToggle(v = !photo.on, startYaw?: number, startPitch?: number, startDist?: number) {
  if (v === photo.on || !cam) return;
  photo.on = v; photo.last = '';
  if (v) { photo.yaw = startYaw ?? photo.yaw; photo.pitch = startPitch ?? 0.3; photo.dist = Math.min(14, startDist ?? 6); photo.h = 1.2; fov0 = cam.fov; photo.fov = cam.fov; photo.hint = true; }
  else { cam.fov = fov0; cam.updateProjectionMatrix(); drag = 0; }
  document.body.classList.toggle('photo-on', v); renderBar();
}

/** 按键：返回 true = 拍照模式吃掉了这个键（拍照时角色不动、不放技能） */
export function photoKey(e: KeyboardEvent, down: boolean): boolean {
  if (!photo.on) return false;
  const k = e.key.toLowerCase();
  if (down) {
    if (k === 'p' || k === 'escape') photoToggle(false);
    else if (k === 'enter') photoSave();
    else if (k === 'h') { photo.hint = !photo.hint; renderBar(); }
    else if (k === '[' || k === ']') { photo.fov = THREE.MathUtils.clamp(photo.fov + (k === '[' ? -5 : 5), 20, 85); renderBar(); }
    else if (k === 'arrowup' || k === 'arrowdown') photo.h = THREE.MathUtils.clamp(photo.h + (k === 'arrowup' ? 0.15 : -0.15), 0.1, 4);
    else if (k === 'arrowleft' || k === 'arrowright') photo.yaw += k === 'arrowleft' ? 0.08 : -0.08;
  }
  e.preventDefault();
  return true;
}

/** 每帧在游戏镜头更新之后调用：返回 true = 本帧镜头归拍照模式 */
export function photoUpdate(): boolean {
  if (!photo.on) return false;
  const f = focus(), c = Math.cos(photo.pitch);
  cam.position.set(f.x + Math.sin(photo.yaw) * c * photo.dist, f.y + photo.h + Math.sin(photo.pitch) * photo.dist, f.z + Math.cos(photo.yaw) * c * photo.dist);
  cam.lookAt(f.x, f.y + photo.h, f.z);
  if (Math.abs(cam.fov - photo.fov) > 0.01) { cam.fov = photo.fov; cam.updateProjectionMatrix(); }
  return true;
}

export function photoSave() { if (photo.on) want = true; }

/** 主循环 render 之后立刻调用（同一任务里读画布，不需要 preserveDrawingBuffer） */
export function photoAfterRender() {
  if (!want) return; want = false;
  try {
    const w = canvas.width, h = canvas.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d')!; x.drawImage(canvas, 0, 0);
    const s = Math.max(14, Math.round(h * 0.024));
    x.font = `600 ${s}px serif`; x.textAlign = 'right'; x.textBaseline = 'bottom';
    x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = s * 0.4; x.fillStyle = 'rgba(255,226,170,.9)';
    x.fillText(GAME_NAME, w - s, h - s * 0.9);
    const url = c.toDataURL('image/png');
    const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0');
    const a = document.createElement('a'); a.href = url; a.download = `暗岩传说_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    photo.shots++; photo.last = '已保存';
  } catch { photo.last = '保存失败（浏览器不允许读取画面）'; }
  renderBar();
}
