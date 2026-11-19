// v0.9.6d 战利品祭坛 3D：说明书「战利品祭坛」中间的符文祭坛 + 深渊 20 层结算自选页共用。
// 独立小 WebGLRenderer（照搬 v0.9.6f raidmap3d 的做法）：打开才渲染、关面板 dispose + forceContextLoss、主场景降频；
// 设置 map3d（off / auto / on）、低画质 / 低内存 / WebGL 失败 / 手机持续掉帧 → 回退 2D 列表（2D 列表始终照画）。
// 画面：符文祭坛石台 + 选中装备真模型（models.makeLootItem，按品质套掉落光效：橙光柱 / 暗金黑焰 / 套装红光 / 太古双螺旋）在上方旋转；
// 其余可掉物品小模型绕圈环绕（点击切换）；祭坛后方首领余烬剪影（raidmap3d.figure + 只留边缘光的 shader）；余烬粒子 ≤ 800（复用 vfx 粒子图集）。
import * as THREE from 'three';
import { makeLootItem, makeRing } from './models';
import { figure } from './raidmap3d';
import { fxAtlas } from './vfx';

export type AltarItem = { key: string; name: string; slot: string; color: string; tier: number; anc?: boolean };
export type AltarData = { id: string; items: AltarItem[]; sel: number; boss: string | null; tint: number };
type Host = { settings: { map3d?: string; quality: string }; isTouch: boolean; toast: (m: string, c?: string) => void };
type Cb = (i: number) => void;

let H: Host | null = null;
let renderer: THREE.WebGLRenderer | null = null, failed = '', slow = false;
let cv: HTMLCanvasElement | null = null, lab: HTMLDivElement | null = null, host: HTMLElement | null = null, panel = '';
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 80);
let root: THREE.Group | null = null, center: THREE.Group | null = null, orbit: THREE.Group | null = null, boss: THREE.Group | null = null, embers: THREE.Points | null = null;
let data: AltarData | null = null, sig = '', selSig = '', active = false, onPick: Cb = () => {};
let W = 400, Hh = 300, tAcc = 0, tAll = 0, renders = 0, slowT = 0, slowN = 0, yaw = 0;
let orbObjs: { obj: THREE.Object3D; i: number }[] = [];
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), tmp = new THREE.Vector3();
export const ALTAR_MAX_PARTICLES = 800;

export function bindAltar3d(h: Host) { H = h; }
/** 设置 + 机器条件：要不要用 3D（规则同 3D 副本地图） */
export function altarWanted(): boolean {
  if (!H) return false;
  const m = H.settings.map3d ?? 'auto';
  if (m === 'off' || failed || slow) return false;
  if (m === 'on') return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (H.settings.quality === 'low') return false;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return false;
  return true;
}
export const altarActive = () => active;

function ensure(h: HTMLElement): boolean {
  if (!cv) {
    cv = document.createElement('canvas'); cv.id = 'alt-cv3';
    lab = document.createElement('div'); lab.id = 'alt3-lab';
    bindInput(cv);
  }
  if (cv.parentElement !== h) h.append(cv, lab!);
  if (!renderer && !failed) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !H!.isTouch, alpha: true, powerPreference: 'low-power' });
      if (!renderer.getContext()) throw new Error('no context');
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(H!.isTouch ? 1.25 : 2, window.devicePixelRatio || 1));
    } catch (e) { failed = String((e as Error)?.message ?? e); renderer = null; }
  }
  return !!renderer;
}
/**
 * 打开 / 更新祭坛：host 是放画布的容器（#dg-stage / #aby-stage），panelId 用来判断面板是否还开着。
 * 返回 3D 是否在用；false 时调用方显示 2D 列表。
 */
export function altarShow(h: HTMLElement, panelId: string, d: AltarData, pick: Cb): boolean {
  if (!altarWanted() || !ensure(h)) { altarStop(); return false; }
  active = true; host = h; panel = panelId; onPick = pick;
  W = Math.max(160, h.clientWidth || 420); Hh = Math.max(140, h.clientHeight || 300);
  renderer!.setSize(W, Hh, false); cam.aspect = W / Hh; cam.updateProjectionMatrix();
  cv!.style.display = 'block'; lab!.style.display = 'block';
  const s = JSON.stringify([d.id, d.boss, d.tint, d.items.map(i => [i.key, i.tier, !!i.anc])]);
  data = d;
  if (s !== sig) { sig = s; selSig = ''; build(d); }
  setSel(d.sel); placeCam(tAll);
  return true;
}
/** 关面板 / 回退：停渲染并释放 GPU 资源 */
export function altarStop() {
  if (!active && !renderer) return;
  active = false;
  if (cv) cv.style.display = 'none';
  if (lab) { lab.style.display = 'none'; lab.textContent = ''; }
  clear(); sig = ''; selSig = ''; data = null; host = null;
  if (renderer) { renderer.dispose(); (renderer as THREE.WebGLRenderer & { forceContextLoss?: () => void }).forceContextLoss?.(); renderer = null; }
  cv?.remove(); lab?.remove(); cv = null; lab = null;   // v1.2.73 上下文已丢，画布一起丢，下次重建（否则第二次打开只剩 2D）
}
function disposeTree(o: THREE.Object3D, mats: boolean) {
  o.traverse(x => { const m = x as THREE.Mesh; m.geometry?.dispose?.(); if (mats) { const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(y => y.dispose()); else mt?.dispose?.(); } });
}
function clear() {
  if (root) { scene.remove(root); disposeTree(root, false); }
  root = center = orbit = boss = null; embers = null; orbObjs = [];
}

const RIM_V = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const RIM_F = 'uniform vec3 c; uniform float t; varying vec3 vN; varying vec3 vV; void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = pow(r, 2.2) * (0.75 + 0.25 * sin(t * 2.0)); gl_FragColor = vec4(c * a * 1.6, a); }';
/** 余烬全息剪影：只留边缘光 */
function rimMat(c: number) { return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color(c) }, t: { value: 0 } }, vertexShader: RIM_V, fragmentShader: RIM_F }); }
/** 余烬粒子：vfx 图集第 4 格（火花）/ 第 6 格（光点），一次 draw call */
function emberMat() {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { map: { value: fxAtlas() }, sc: { value: Hh / 2 } },
    vertexShader: 'attribute float cell; attribute vec3 col; varying float vC; varying vec3 vCol; uniform float sc; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vC = cell; vCol = col; gl_PointSize = 0.12 * sc / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vC; varying vec3 vCol; void main(){ vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y); float cx = mod(vC, 4.0), cy = floor(vC / 4.0); vec4 s = texture2D(map, (vec2(cx, 3.0 - cy) + uv) / 4.0); gl_FragColor = vec4(vCol * s.rgb, s.a); }' });
}
const TIER_FX: Record<number, number> = { 0: 0, 1: 0.7, 2: 1.2, 3: 1.2, 4: 2, 5: 2.8 };

function build(d: AltarData) {
  clear();
  root = new THREE.Group(); scene.add(root); scene.background = null; scene.fog = new THREE.Fog(0x0a0604, 9, 22);
  root.add(new THREE.HemisphereLight(0xfff0d8, 0x2a1a10, 1.6));
  const key = new THREE.DirectionalLight(0xffe8c8, 2); key.position.set(3, 6, 5); root.add(key);
  const fire = new THREE.PointLight(d.tint, 18, 10); fire.position.set(0, 0.6, 0.8); root.add(fire);
  // 祭坛：三层石台 + 发光符文环
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.9, flatShading: true });
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.3, 8), stone); s1.position.y = -0.95;
  const s2 = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.3, 8), stone); s2.position.y = -0.65;
  const s3 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.4, 8), stone); s3.position.y = -0.3;
  root.add(s1, s2, s3);
  for (const [r, y, c] of [[1.55, -0.79, d.tint], [0.85, -0.09, 0xffc860]] as const) { const ring = makeRing(c, 0.8); ring.scale.setScalar(r); ring.position.y = y; ring.userData.spin = r > 1 ? -0.3 : 0.6; root.add(ring); }
  // 首领余烬剪影（祭坛后方）
  if (d.boss) {
    boss = figure(d.boss, 0, 0, 0);
    const rm = rimMat(d.tint); boss.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = rm; });
    boss.scale.setScalar(3.6); boss.position.set(0, -1.1, -3.2); root.add(boss);
  }
  // 环绕物品（选中的那件在中间放大，环上留空位）
  orbit = new THREE.Group(); root.add(orbit);
  const n = d.items.length;
  d.items.forEach((it, i) => {
    const o = makeLootItem(it.slot, it.color, 0, false); o.scale.setScalar(0.55);
    const a = i / Math.max(1, n) * Math.PI * 2; o.position.set(Math.cos(a) * 2.25, -0.45 + Math.sin(a * 3) * 0.08, Math.sin(a) * 2.25);
    o.userData.i = i; orbit!.add(o); orbObjs.push({ obj: o, i });
  });
  center = new THREE.Group(); center.position.y = 0.05; root.add(center);
  // 余烬粒子
  const N = Math.min(ALTAR_MAX_PARTICLES, H?.isTouch ? 160 : 320);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), cell = new Float32Array(N), cc = new THREE.Color(d.tint), gold = new THREE.Color(0xffc860);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 3.2; pos.set([Math.cos(a) * r, -1 + Math.random() * 4, Math.sin(a) * r - 0.8], i * 3); const c = Math.random() < 0.6 ? cc : gold; col.set([c.r, c.g, c.b], i * 3); cell[i] = Math.random() < 0.5 ? 4 : 6; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('col', new THREE.BufferAttribute(col, 3)); g.setAttribute('cell', new THREE.BufferAttribute(cell, 1));
  embers = new THREE.Points(g, emberMat()); embers.frustumCulled = false; root.add(embers);
}
function setSel(i: number) {
  if (!data || !center) return;
  const it = data.items[i];
  const s = it ? `${it.key}|${it.tier}|${!!it.anc}` : '';
  if (s === selSig) return;
  selSig = s;
  center.children.slice().forEach(c => { center!.remove(c); disposeTree(c, false); });
  for (const o of orbObjs) o.obj.visible = o.i !== i;
  if (lab) lab.textContent = it ? it.name : '';
  if (!it) return;
  const anc = !!it.anc, tall = anc ? 3 : TIER_FX[it.tier] ?? 0;
  const obj = makeLootItem(it.slot, anc ? '#ff2a2a' : it.color, tall, anc); obj.scale.setScalar(1.25); obj.position.y = -0.12;
  center.add(obj);
}

/** 主循环每帧调用：面板没开 / 容器被替换就停；开着按 30 / 60 帧渲染 */
export function altarFrame(dt: number, isOpen: (id: string) => boolean) {
  if (!active) return;
  if (!isOpen(panel) || !host?.isConnected || cv?.parentElement !== host) { altarStop(); return; }
  if (!renderer || !root) return;
  if (H!.isTouch) { slowT += dt; slowN++; if (slowT > 3) { if (slowT / slowN > 0.07) { slow = true; altarStop(); H!.toast('3D 祭坛太卡，已切回列表（设置「3D 副本地图」可改）', '#ffb080'); return; } slowT = 0; slowN = 0; } }
  tAcc += dt; tAll += dt;
  if (tAcc < (H!.isTouch ? 1 / 30 - 0.004 : 1 / 60 - 0.004)) return;
  const t = tAll; tAcc = 0;
  placeCam(t);
  root.traverse(o => {
    if (o.userData.spin) o.rotation.z += o.userData.spin * dt;
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (m?.uniforms?.t) m.uniforms.t.value = t;
  });
  if (orbit) { orbit.rotation.y = t * 0.25; for (const o of orbObjs) { const it = o.obj.getObjectByName('item'); if (it) it.rotation.y = t * 1.2 + o.i; } }
  if (center) for (const c of center.children) {
    const it = c.getObjectByName('item'); if (it) { it.rotation.y = t * 0.9; it.position.y = 0.55 + Math.sin(t * 2) * 0.08; }
    const ar = c.getObjectByName('ancRing'); if (ar) ar.rotation.y = t * 0.6;
    const ob = c.getObjectByName('orbit'); if (ob) ob.rotation.y = -t * 1.4;
  }
  if (boss) boss.position.y = -1.1 + Math.sin(t * 0.8) * 0.06;
  if (embers) { const a = embers.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) { let yy = a.getY(i) + dt * (0.3 + (i % 7) * 0.06); if (yy > 3.2) yy = -1; a.setY(i, yy); } a.needsUpdate = true; }
  renderer.render(scene, cam); renders++;
}
/** 镜头：正面略俯视，拖动左右 ±0.6，空闲轻摇；竖屏拉远 */
function placeCam(t: number) { const y = yaw + Math.sin(t * 0.2) * 0.12, d = cam.aspect < 1.2 ? 7.6 : 6.2; cam.position.set(Math.sin(y) * d, 1.9, Math.cos(y) * d); cam.lookAt(0, 0.1, 0); cam.updateMatrixWorld(); }
function project(o: THREE.Object3D) { o.getWorldPosition(tmp); tmp.project(cam); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * Hh }; }
function pickAt(x: number, y: number): number {
  if (!root) return -1;
  root.updateMatrixWorld(true); cam.updateMatrixWorld();
  v2.set(x / W * 2 - 1, -(y / Hh) * 2 + 1); ray.setFromCamera(v2, cam);
  const vis = orbObjs.filter(o => o.obj.visible);
  const hit = ray.intersectObjects(vis.map(o => o.obj), true)[0];
  if (hit) { let o: THREE.Object3D | null = hit.object; while (o && o.userData.i === undefined) o = o.parent; if (o) return o.userData.i; }
  let best = -1, bd = 34;   // 手机手指粗：屏幕 34px 内最近的一件
  for (const o of vis) { const s = project(o.obj), d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = o.i; } }
  return best;
}
function bindInput(c: HTMLCanvasElement) {
  let down: { x: number; y: number; yaw: number; moved: boolean } | null = null;
  const xy = (e: { clientX: number; clientY: number }) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  c.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, yaw, moved: false }; });
  c.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 5) down.moved = true; yaw = Math.max(-0.6, Math.min(0.6, down.yaw - dx * 0.006)); });
  c.addEventListener('pointerup', e => { const d = down; down = null; if (!d || d.moved) return; const p = xy(e), i = pickAt(p.x, p.y); if (i >= 0) onPick(i); });
  c.addEventListener('pointerleave', () => { down = null; });
}

/** 调试 / 测试钩子 */
export function altarDebug() {
  return {
    wanted: altarWanted(), active, failed, slow, renders, panel, id: data?.id ?? null, sel: data?.sel ?? -1,
    canvas: !!cv && cv.style.display === 'block' && !!cv.parentElement, host: host?.id ?? null,
    orbit: orbObjs.length, center: center?.children.length ?? 0, boss: !!boss, label: lab?.textContent ?? '',
    particles: embers ? (embers.geometry.attributes.position as THREE.BufferAttribute).count : 0,
    centerAnc: !!center?.children[0]?.getObjectByName('ancRing'), centerTier: data ? (data.items[data.sel]?.tier ?? -1) : -1,
    /** 环绕物品 i 的屏幕坐标 */
    screen(i: number) { const o = orbObjs.find(x => x.i === i); if (!o || !root) return null; root.updateMatrixWorld(true); cam.updateMatrixWorld(); return project(o.obj); },
    /** 模拟在画布 (x,y) 点击（走真实射线拾取） */
    clickAt(x: number, y: number) { const i = pickAt(x, y); if (i >= 0) onPick(i); return i; },
    setFailed(v: string) { failed = v; if (v) altarStop(); },
    setSlow(v: boolean) { slow = v; },
  };
}
