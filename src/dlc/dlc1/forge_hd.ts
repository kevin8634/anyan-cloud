// ========== v1.2.54 铸造品高精度版（展示窗用）==========
// 服务端每件铸造品给两档：游戏版（减面 + 1024 贴图，角色手持，存在通用的 darkrock_glb）/ 高精度版（原始几何不减面 + 2048 贴图）。
// 高精度版只用于展示（成形演出、「我的铸造品」预览 / 大图），单独存 IndexedDB darkrock_forge_hd（不进 localStorage，不进存档导出），
// localStorage 里只记一个很小的索引（key → 字节数）。登记成运行时模型 `<key>__hd`，用时才解析（不拖慢开局）。
// 没有高精度版（旧铸造品 / 武器库 / 下载失败）→ 一律回退游戏版。
import * as THREE from 'three';
import { addRuntimeGlb, hasGlb, makeGlbProp, propEnv } from '../../web/creatures_glb';

const DB = 'darkrock_forge_hd', ST = 'hd', LS_IDX = 'darkrock_forge_hd_idx';
export const HD_SUFFIX = '__hd';
export const hdKey = (key: string) => key + HD_SUFFIX;
let idx: Record<string, number> = {};
try { idx = JSON.parse(localStorage.getItem(LS_IDX) ?? '{}') ?? {}; } catch { idx = {}; }
const saveIdx = () => { try { localStorage.setItem(LS_IDX, JSON.stringify(idx)); } catch { /* 存不下就只在本次 */ } };

function db(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
    catch { res(null); }
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  const d = await db(); if (!d) return null;
  return new Promise(res => { try { const t = d.transaction(ST, mode); const q = f(t.objectStore(ST)); t.oncomplete = () => res(q ? (q.result as T) ?? null : null); t.onerror = () => res(null); } catch { res(null); } });
}

/** 有没有高精度版（看索引；内存里已登记也算） */
export const forgeHdHas = (key: string) => !!idx[key] || hasGlb(hdKey(key));
/** 高精度版字节数（没有 = 0） */
export const forgeHdSize = (key: string) => idx[key] ?? 0;
/** 存高精度版：先解析登记（解析失败不存），再落 IndexedDB；成功返回 true */
export async function forgeHdSave(key: string, buf: ArrayBuffer): Promise<boolean> {
  if (!(await addRuntimeGlb(hdKey(key), buf))) return false;
  await tx('readwrite', s => { s.put(buf.slice(0), key); });
  idx[key] = buf.byteLength; saveIdx(); return true;
}
/** 确保高精度版已登记（懒加载：从 IndexedDB 读出来再解析）；没有 / 失败 = false */
export async function forgeHdEnsure(key: string): Promise<boolean> {
  if (hasGlb(hdKey(key))) return true;
  if (!idx[key]) return false;
  const b = await tx<ArrayBuffer>('readonly', s => s.get(key));
  if (!b) { delete idx[key]; saveIdx(); return false; }
  return addRuntimeGlb(hdKey(key), b);
}
export async function forgeHdDel(key: string) { delete idx[key]; saveIdx(); await tx('readwrite', s => { s.delete(key); }); }

/** 展示用的模型名：有高精度版就用 `<key>__hd`，否则游戏版 key */
export async function forgeShowKey(key: string): Promise<{ key: string; hd: boolean }> {
  return (await forgeHdEnsure(key)) ? { key: hdKey(key), hd: true } : { key, hd: false };
}

/** 后台下载中的高精度版（key → Promise<是否成功>）：成形演出最多等一会儿，晚到也照样存下，不影响游戏版换上 */
export const hdJobs = new Map<string, Promise<boolean>>();
export function forgeHdStart(key: string, get: () => Promise<ArrayBuffer>): Promise<boolean> {
  const p = (async () => { try { return await forgeHdSave(key, await get()); } catch (e) { console.warn('[smithy] 高精度版下载失败（只用游戏版）', key, e); return false; } finally { hdJobs.delete(key); } })();
  hdJobs.set(key, p); return p;
}
/** 等高精度版（最多 ms 毫秒），返回展示用 key */
export async function forgeHdWait(key: string, ms: number): Promise<{ key: string; hd: boolean }> {
  const j = hdJobs.get(key);
  if (j) await Promise.race([j, new Promise(r => setTimeout(r, ms))]);
  return forgeShowKey(key);
}

// ---- 大图查看（11-17 改全窗口：左键拖动旋转、滚轮缩放、右键拖动平移、显示面数；三点布光；标注「高精度预览」/「游戏版预览」；
//   没有高精度版时可带 fetchHd：查看窗里给「取回高精度版」按钮，取回后自动重开）
export const hdViewerState = { open: false, key: '', hd: false, len: 0 };
export function openHdViewer(showKey: string, name: string, hd: boolean, fetchHd?: (prog: (t: string) => void) => Promise<string>): boolean {
  closeHdViewer();
  let r: THREE.WebGLRenderer;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); } catch { return false; }
  const m = makeGlbProp(showKey, 2.2, 0.5); if (!m) { r.dispose(); return false; }   // 11-17 2.6 → 2.2：长兵器两头不再被裁出画面
  const wrap = document.createElement('div'); wrap.id = 'd1-hdview';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:75;background:radial-gradient(#1e3440,#05090c);display:flex;align-items:center;justify-content:center';
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(window.innerWidth, window.innerHeight); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  r.setClearColor(0x000000, 0); r.domElement.style.cursor = 'grab';
  const scene = new THREE.Scene(); scene.environment = propEnv();
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x201810, 0.9));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(2.5, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fd8ff, 1.6); rim.position.set(-3, 1.5, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffc890, 0.6); fill.position.set(-2, -1, 3); scene.add(fill);
  const cam = new THREE.PerspectiveCamera(30, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 50); cam.position.set(0, 0, 5.4);
  const holder = new THREE.Group(); m.rotation.z = 0.2; holder.add(m); scene.add(holder);
  let tris = 0; m.traverse(o => { const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined; if (g) tris += (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3; });
  const tag = document.createElement('div');
  tag.textContent = `${hd ? '高精度预览 · 原始面数 · 2048 贴图' : '游戏版预览（这件没有高精度版）'} · ${Math.round(tris).toLocaleString()} 面`;
  tag.style.cssText = `position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:4px 14px;border-radius:12px;font:600 14px/1.6 sans-serif;${hd ? 'color:#1a1206;background:#ffd070' : 'color:#cfe;background:#24424a'}`;
  const nm = document.createElement('div'); nm.textContent = name;
  nm.style.cssText = 'position:absolute;bottom:22px;left:0;right:0;text-align:center;color:#ffe9a8;font:700 22px/1.4 serif;letter-spacing:4px;text-shadow:0 0 10px #000';
  const tip = document.createElement('div'); tip.textContent = '左键拖动旋转 · 滚轮缩放 · 右键拖动平移 · Esc 关闭';
  tip.style.cssText = 'position:absolute;bottom:4px;left:0;right:0;text-align:center;color:#8fb8b8;font:12px sans-serif';
  const x = document.createElement('div'); x.textContent = '×'; x.dataset.a = 'hdx';
  x.style.cssText = 'position:absolute;top:8px;right:18px;color:#cfe;font:32px sans-serif;cursor:pointer';
  wrap.append(r.domElement, tag, nm, tip, x);
  if (!hd && fetchHd) {
    const fb = document.createElement('button'); fb.textContent = '取回高精度版（不扣积分）';
    fb.style.cssText = 'position:absolute;top:52px;left:50%;transform:translateX(-50%);padding:6px 16px;border-radius:14px;border:1px solid #c8a050;background:#3a2a10;color:#ffe0a0;font:600 14px sans-serif;cursor:pointer';
    fb.addEventListener('click', async () => { fb.disabled = true; fb.textContent = '取回中……'; const err = await fetchHd(t => { fb.textContent = t; }); if (err) { fb.disabled = false; fb.textContent = `取回失败：${err}（点此重试）`; } });
    wrap.append(fb);
  }
  document.body.appendChild(wrap);
  let rx = 0, ry = 0.6, drag: { x: number; y: number; pan: boolean } | null = null, auto = true, raf = 0, zoom = 5.4;
  const el = r.domElement; const pan = { x: 0, y: 0 };
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 }; auto = false; el.style.cursor = 'grabbing'; el.setPointerCapture?.(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.pan) { const k = cam.position.z * 0.53 / window.innerHeight; pan.x += (e.clientX - drag.x) * k; pan.y -= (e.clientY - drag.y) * k; }
    else { ry += (e.clientX - drag.x) * 0.01; rx = Math.max(-1.2, Math.min(1.2, rx + (e.clientY - drag.y) * 0.01)); }
    drag = { x: e.clientX, y: e.clientY, pan: drag.pan };
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerup', () => { drag = null; el.style.cursor = 'grab'; });
  el.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.8, Math.min(12, zoom * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  const stopEv = (e: Event) => e.stopPropagation();
  ['mousedown', 'mousemove', 'touchstart', 'touchmove', 'pointerdown', 'pointermove', 'wheel', 'contextmenu', 'keydown', 'keyup', 'click'].forEach(k => wrap.addEventListener(k, stopEv));
  x.addEventListener('click', () => closeHdViewer());
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeHdViewer(); } };
  window.addEventListener('keydown', onKey, true);
  const onResize = () => { r.setSize(window.innerWidth, window.innerHeight); cam.aspect = window.innerWidth / Math.max(1, window.innerHeight); cam.updateProjectionMatrix(); }; window.addEventListener('resize', onResize);
  const tick = () => { if (auto) ry += 0.008; holder.rotation.set(rx, ry, 0); holder.position.set(pan.x, pan.y, 0); cam.position.z += (zoom - cam.position.z) * 0.2; r.render(scene, cam); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox!;
  Object.assign(hdViewerState, { open: true, key: showKey, hd, len: b.max.y - b.min.y });
  viewer = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); m.geometry.dispose(); (m.material as THREE.Material).dispose(); r.dispose(); r.forceContextLoss?.(); wrap.remove(); hdViewerState.open = false; };
  return true;
}
let viewer: (() => void) | null = null;
export function closeHdViewer() { viewer?.(); viewer = null; }
