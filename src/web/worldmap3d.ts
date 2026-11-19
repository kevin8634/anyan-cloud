// v0.9.6e 3D 沙盘：世界地图 / 区域地图（M 第一、二级）的立体视图。
// 写法照搬 raidmap3d / altar3d：独立小 WebGLRenderer（叠在 2D 画布 #wm-cv 上的 #wm-cv3 + DOM 标签层 #wm3-lab），
// 面板打开才渲染、关掉即释放（dispose + forceContextLoss）；设置 map3d = off / 低画质 / 低内存 / WebGL 失败 / 手机持续掉帧 → 回退 2D（2D 画布始终照画）。
// 画面：木桌 + 铜框上摆一块沙盘，底图贴在按高度图抬起的网格上；未探索云雾 = 一个 Points（透明度由调用方按 fog.ts 格子给），
// 地点光柱 + 上升粒子（金 = 你在这 / 紫 = 副本 / 红 = 世界首领 / 青 = 传送石），其余兴趣点是 DOM 小图标；悬停放大 + 复用 #wm-tip。
// 粒子（云雾 + 光柱火星）总数 ≤ SAND_MAX_PTS，贴图复用 vfx.fxAtlas()（不 dispose）。
import * as THREE from 'three';
import { fxAtlas } from './vfx';

export const SAND_MAX_PTS = 3000;
export type W3Kind = 'you' | 'dungeon' | 'boss' | 'stone' | 'mark' | 'region';
/** 沙盘上的一个点：u / v = 0..1（底图左上为原点） */
export type W3Poi = { id: string; kind: W3Kind; u: number; v: number; label?: string; sub?: string; tip: string; glyph?: string; color?: string; dim?: boolean; here?: boolean; lock?: boolean; ref?: unknown };
export type W3Cloud = { u: number; v: number; s: number };
export type W3Data = {
  view: 'world' | 'zone'; key: string; title: string; sub: string;
  /** 底图宽 / 高 */
  aspect: number;
  /** 底图（画布 / 图片）；没有（无 2D 环境）就用纯色 */
  base: HTMLCanvasElement | HTMLImageElement | null;
  /** 底图内容签名：变了才重新上传贴图 */
  baseSig: string;
  /** 高度 0..1（u,v）；relief = 最高处占沙盘宽度的比例 */
  height: (u: number, v: number) => number; relief: number;
  /** 顶点染色（高处积雪 / 火山口发红等），返回 null = 不染 */
  tint?: (u: number, v: number, h: number) => [number, number, number] | null;
  ground: number; accent: number;
  pois: W3Poi[];
  clouds: W3Cloud[]; cloudColor: number;
  /** 每朵云的目标浓度 0..1（每次刷新调用；变小 = 散开） */
  cloudAlpha: (i: number) => number;
};
type Host = { settings: { map3d?: string; quality: string }; isTouch: boolean; toast: (m: string, c?: string) => void };
type Cb = { pick: (p: W3Poi) => void };

let H: Host, CB: Cb;
let renderer: THREE.WebGLRenderer | null = null, failed = '', slow = false;
/** v1.2.73 地图上手动切回 3D：清掉上次的失败 / 掉帧标记再试 */
export function wm3dRetry() { failed = ''; slow = false; slowT = 0; slowN = 0; }
let cv: HTMLCanvasElement | null = null, lab: HTMLDivElement | null = null;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 300);
let root: THREE.Group | null = null, surf: THREE.Mesh | null = null, baseTex: THREE.Texture | null = null;
let sig = '', baseSig = '', data: W3Data | null = null, active = false;
let W = 600, Hh = 360, tAcc = 0, tAll = 0, renders = 0, slowT = 0, slowN = 0;
let yaw = 0, zoom = 1, SW = 16, SD = 9, RELIEF = 1, drag: { x: number; y: number; yaw: number; moved: boolean } | null = null;
const center = new THREE.Vector3(), camAim = new THREE.Vector3();
let hf: { n: number; m: number; h: Float32Array } | null = null;
type PObj = { p: W3Poi; pos: THREE.Vector3; grp?: THREE.Group; col?: THREE.Mesh; el?: HTMLElement; s0: number; spark0: number; sparkN: number };
let pobj: PObj[] = [], hover: PObj | null = null;
let cloudPts: THREE.Points | null = null, cloudA: Float32Array | null = null, cloudT: Float32Array | null = null, cloudLift: Float32Array | null = null, cloudBase: Float32Array | null = null;
let sparkPts: THREE.Points | null = null, sparkV: Float32Array | null = null;
/** 过渡：世界 → 区域推近（0.6 秒）/ 区域 → 副本淡出 / 新视图进场 */
let trans: { kind: 'zoom' | 'fade'; t: number; dur: number; to: THREE.Vector3; done: () => void } | null = null;
let intro = 0;
const tmp = new THREE.Vector3();

export function bindWorldMap3d(h: Host, cb: Cb) { H = h; CB = cb; }
export function wm3dWanted(): boolean {
  const m = H?.settings.map3d ?? 'auto';
  if (m === 'off' || failed || slow) return false;
  if (m === 'on') return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (H.settings.quality === 'low') return false;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return false;
  return true;
}
export const wm3dActive = () => active;
/** 过渡进行中（调用方此时不要切视图） */
export const wm3dBusy = () => !!trans;

function ensureDom(base: HTMLCanvasElement): boolean {
  if (!cv) {
    cv = document.createElement('canvas'); cv.id = 'wm-cv3';
    lab = document.createElement('div'); lab.id = 'wm3-lab';
    base.after(cv, lab);
    bindInput(cv);
  }
  if (!renderer && !failed) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !H.isTouch, alpha: false, powerPreference: 'low-power' });
      if (!renderer.getContext()) throw new Error('no context');
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(H.isTouch ? 1.25 : 2, window.devicePixelRatio || 1));
    } catch (e) { failed = String((e as Error)?.message ?? e); renderer = null; }
  }
  return !!renderer;
}
function hideLayer() {
  if (cv) { cv.style.display = 'none'; cv.style.opacity = ''; }
  if (lab) { lab.style.display = 'none'; lab.style.opacity = ''; }
  document.getElementById('wm-cv')?.style.removeProperty('visibility');
}

/** 每次 renderWorldMap 调用（约 0.5 秒一次 + 切视图时）。返回 3D 是否在用 */
export function wm3dShow(base: HTMLCanvasElement, d: W3Data, cw: number, ch: number): boolean {
  if (!wm3dWanted() || !ensureDom(base)) { wm3dStop(); return false; }
  active = true; W = cw; Hh = ch;
  cv!.style.display = 'block'; lab!.style.display = 'block';
  for (const el of [cv!, lab!]) { el.style.left = `${base.offsetLeft}px`; el.style.top = `${base.offsetTop}px`; el.style.width = `${cw}px`; el.style.height = `${ch}px`; }
  base.style.visibility = 'hidden';
  renderer!.setSize(cw, ch, false); cam.aspect = cw / ch; cam.updateProjectionMatrix();
  const s = `${d.view}|${d.key}|${d.clouds.length}|${d.pois.map(p => `${p.id}:${p.kind}:${p.u.toFixed(3)}:${p.v.toFixed(3)}:${p.dim ? 1 : 0}:${p.lock ? 1 : 0}`).join(',')}`;
  const viewChanged = !data || data.view !== d.view || data.key !== d.key;
  data = d;
  if (s !== sig) { sig = s; build(d, viewChanged); }
  else for (const o of pobj) { const q = d.pois.find(p => p.id === o.p.id); if (q) o.p = q; }
  if (d.baseSig !== baseSig) { baseSig = d.baseSig; setBase(d); }
  // 云雾目标浓度（fog.ts 格子 / 探索度）
  if (cloudT) for (let i = 0; i < cloudT.length; i++) cloudT[i] = Math.max(0, Math.min(1, d.cloudAlpha(i)));
  placeCam(tAll); placeLabels();
  return true;
}
export function wm3dStop() {
  if (!active && !renderer) return;
  active = false; trans = null; hover = null; hideLayer();
  clearScene(); sig = ''; baseSig = ''; data = null;
  if (renderer) { renderer.dispose(); (renderer as THREE.WebGLRenderer & { forceContextLoss?: () => void }).forceContextLoss?.(); renderer = null; }
  // v1.2.73 画布上下文已强制丢失，同一张画布再建渲染器会拿到丢失的上下文（第二次按 M 只剩 2D）→ 连画布一起丢，下次重建
  cv?.remove(); lab?.remove(); cv = null; lab = null;
}
function clearScene() {
  if (root) { root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose?.(); }); scene.remove(root); }
  baseTex?.dispose(); baseTex = null;
  root = null; surf = null; pobj = []; cloudPts = null; cloudA = cloudT = cloudLift = cloudBase = null; sparkPts = null; sparkV = null; hf = null;
  if (lab) lab.innerHTML = '';
}

function rnd(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hash(t: string) { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const glowMat = (c: number, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
function beamMat(c: number) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(c) }, t: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float t; varying vec2 vU; void main(){ float a = (1.0 - vU.y) * (0.55 + 0.25 * sin(t * 3.0 + vU.y * 9.0)); gl_FragColor = vec4(c * a, a); }' });
}
/** 图集点精灵：每点 cell（图集格）+ col + a（透明度）+ sz（大小） */
function atlasMat(additive: boolean, gain = 1) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { map: { value: fxAtlas() }, sc: { value: Hh / 2 }, gain: { value: gain } },
    vertexShader: 'attribute float cell; attribute float a; attribute float sz; attribute vec3 col; varying float vC; varying float vA; varying vec3 vCol; uniform float sc; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vC = cell; vA = a; vCol = col; gl_PointSize = sz * sc / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; uniform float gain; varying float vC; varying float vA; varying vec3 vCol; void main(){ if (vA < 0.01) discard; vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y); float cx = mod(vC, 4.0), cy = floor(vC / 4.0); vec4 s = texture2D(map, (vec2(cx, 3.0 - cy) + uv) / 4.0); gl_FragColor = vec4(vCol * mix(s.rgb, vec3(1.0), gain - 1.0), min(1.0, s.a * vA * gain)); }' });
}

/** u,v → 沙盘上的世界坐标（含地形高度） */
function at(u: number, v: number, out = new THREE.Vector3()) { return out.set((u - 0.5) * SW, hAt(u, v) + 0.06, (v - 0.5) * SD); }
function hAt(u: number, v: number) {
  if (!hf) return 0;
  const fx = Math.max(0, Math.min(1, u)) * (hf.n - 1), fz = Math.max(0, Math.min(1, v)) * (hf.m - 1);
  const i = Math.min(hf.n - 2, Math.floor(fx)), j = Math.min(hf.m - 2, Math.floor(fz)), a = fx - i, b = fz - j, n = hf.n;
  const h00 = hf.h[j * n + i], h10 = hf.h[j * n + i + 1], h01 = hf.h[(j + 1) * n + i], h11 = hf.h[(j + 1) * n + i + 1];
  return (h00 * (1 - a) + h10 * a) * (1 - b) + (h01 * (1 - a) + h11 * a) * b;
}

const COL: Record<string, number> = { you: 0xffc840, dungeon: 0xb060ff, boss: 0xff3a24, stone: 0x40f0e0 };

function build(d: W3Data, viewChanged: boolean) {
  clearScene();
  const rn = rnd(hash(d.key));
  root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(0x150d07); scene.fog = null;
  root.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2a1a, 1.35));
  const sun = new THREE.DirectionalLight(0xffe6c0, 2.0); sun.position.set(-6, 14, 7); root.add(sun);
  const warm = new THREE.PointLight(0xffa050, 25, 40); warm.position.set(0, 6, 9); root.add(warm);
  // ---- 沙盘尺寸：世界 16 宽；区域按 12 的正方形量级
  const big = d.view === 'world' ? 16 : 12;
  if (d.aspect >= 1) { SW = big; SD = big / d.aspect; } else { SD = big; SW = big * d.aspect; }
  RELIEF = d.relief * SW;
  // ---- 高度图网格
  const n = d.view === 'world' ? (H.isTouch ? 96 : 128) : (H.isTouch ? 64 : 96), m = Math.max(16, Math.round(n * SD / SW));
  const hs = new Float32Array(n * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const u = i / (n - 1), v = j / (m - 1), edge = Math.min(u, v, 1 - u, 1 - v);
    hs[j * n + i] = Math.max(0, d.height(u, v)) * RELIEF * Math.min(1, edge / 0.03);   // 边上收到 0，贴住铜框
  }
  hf = { n, m, h: hs };
  const g = new THREE.PlaneGeometry(SW, SD, n - 1, m - 1); g.rotateX(-Math.PI / 2);
  const pa = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pa.count * 3);
  for (let k = 0; k < pa.count; k++) {
    const u = pa.getX(k) / SW + 0.5, v = pa.getZ(k) / SD + 0.5;
    const i = Math.round(u * (n - 1)), j = Math.round(v * (m - 1)), h = hs[j * n + i];
    pa.setY(k, h);
    const t = d.tint?.(u, v, RELIEF > 0 ? h / RELIEF : 0) ?? null;
    cols.set(t ?? [1, 1, 1], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  surf = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: d.base ? 0xffffff : d.ground, vertexColors: true, roughness: 0.92, metalness: 0 }));
  surf.position.y = 0.02; root.add(surf);
  // ---- 木桌 + 铜框
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(SW + 5, 0.7, SD + 5), wood); table.position.y = -0.36; root.add(table);
  const leg = new THREE.BoxGeometry(0.6, 6, 0.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(leg, wood); l.position.set(sx * (SW / 2 + 1.8), -3.7, sz * (SD / 2 + 1.8)); root.add(l); }
  const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.75, roughness: 0.32, emissive: 0x3a1a08, emissiveIntensity: 0.4 });
  const fw = 0.32, fh = 0.34;
  for (const [w, dd, x, z] of [[SW + fw * 2, fw, 0, -SD / 2 - fw / 2], [SW + fw * 2, fw, 0, SD / 2 + fw / 2], [fw, SD, -SW / 2 - fw / 2, 0], [fw, SD, SW / 2 + fw / 2, 0]] as number[][]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, fh, dd), copper); b.position.set(x, fh / 2 - 0.02, z); root.add(b);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), copper); k.position.set(sx * (SW / 2 + fw / 2), fh, sz * (SD / 2 + fw / 2)); root.add(k); }
  // ---- 光柱（金 / 紫 / 红 / 青）+ DOM 标签
  const pillars = d.pois.filter(p => p.kind in COL);
  const sparkBudget = Math.min(H.isTouch ? 260 : 560, SAND_MAX_PTS - Math.min(d.clouds.length, SAND_MAX_PTS));
  const perP = pillars.length ? Math.max(0, Math.min(36, Math.floor(sparkBudget / pillars.length))) : 0;
  let spk = 0;
  for (const p of d.pois) {
    const pos = at(p.u, p.v), o: PObj = { p, pos, s0: 1, spark0: 0, sparkN: 0 };
    if (p.kind in COL) {
      const c = COL[p.kind], grp = new THREE.Group(); grp.position.copy(pos); root.add(grp);
      const hgt = p.kind === 'you' ? 3.4 : p.kind === 'boss' ? 3 : p.kind === 'dungeon' ? 2.6 : 1.9, rad = p.kind === 'stone' ? 0.1 : 0.15;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, hgt, 10, 1, true), beamMat(c)); col.position.y = hgt / 2; grp.add(col);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 5, 24), glowMat(c, p.dim ? 0.35 : 0.85)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; grp.add(ring);
      const gem = p.kind === 'you' ? new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 4), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 }))
        : new THREE.Mesh(new THREE.OctahedronGeometry(p.kind === 'stone' ? 0.12 : 0.16, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: p.dim ? 0.25 : 0.9, flatShading: true }));
      if (p.kind === 'you') gem.rotation.x = Math.PI;
      gem.position.y = 0.55; gem.userData.spin = 1; grp.add(gem);
      if (p.dim) (col.material as THREE.ShaderMaterial).uniforms.c.value = new THREE.Color(c).multiplyScalar(0.35);
      o.grp = grp; o.col = col; o.s0 = d.view === 'world' ? 0.8 : 1;
      grp.scale.setScalar(o.s0);
      o.spark0 = spk; o.sparkN = p.dim ? Math.floor(perP / 3) : perP; spk += o.sparkN;
    }
    pobj.push(o);
  }
  // 上升火星（所有光柱共用一个 Points）
  if (spk) {
    const pos = new Float32Array(spk * 3), col = new Float32Array(spk * 3), cell = new Float32Array(spk), a = new Float32Array(spk), sz = new Float32Array(spk);
    sparkV = new Float32Array(spk);
    const cc = new THREE.Color();
    for (const o of pobj) for (let i = 0; i < o.sparkN; i++) {
      const k = o.spark0 + i, ang = rn() * Math.PI * 2, r = rn() * 0.3;
      pos.set([o.pos.x + Math.cos(ang) * r, o.pos.y + rn() * 2.4, o.pos.z + Math.sin(ang) * r], k * 3);
      cc.set(COL[o.p.kind]).lerp(new THREE.Color(0xffffff), rn() * 0.4); col.set([cc.r, cc.g, cc.b], k * 3);
      cell[k] = rn() < 0.5 ? 6 : 4; a[k] = 0.9; sz[k] = 0.1 + rn() * 0.1; sparkV[k] = 0.5 + rn() * 0.8;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('col', new THREE.BufferAttribute(col, 3)); sg.setAttribute('cell', new THREE.BufferAttribute(cell, 1)); sg.setAttribute('a', new THREE.BufferAttribute(a, 1)); sg.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
    sparkPts = new THREE.Points(sg, atlasMat(true)); sparkPts.frustumCulled = false; root.add(sparkPts);
  }
  // ---- 未探索云雾：一个 Points（烟雾格，正常混合）
  const NC = Math.min(d.clouds.length, SAND_MAX_PTS - spk);
  if (NC > 0) {
    const pos = new Float32Array(NC * 3), col = new Float32Array(NC * 3), cell = new Float32Array(NC), sz = new Float32Array(NC);
    cloudA = new Float32Array(NC); cloudT = new Float32Array(NC); cloudLift = new Float32Array(NC); cloudBase = new Float32Array(NC * 3);
    const cc = new THREE.Color(d.cloudColor);
    for (let i = 0; i < NC; i++) {
      const c = d.clouds[i]; at(c.u, c.v, tmp); tmp.y = Math.max(tmp.y, 0) + 0.35 + rn() * 0.5;
      cloudBase.set([tmp.x, tmp.y, tmp.z], i * 3); pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      const l = 0.85 + rn() * 0.25; col.set([cc.r * l, cc.g * l, cc.b * l], i * 3);
      cell[i] = 8 + Math.floor(rn() * 2); sz[i] = c.s * SW * (1.1 + rn() * 0.6);   // 烟雾序列前两帧（最浓）
      const t = Math.max(0, Math.min(1, d.cloudAlpha(i))); cloudT[i] = t; cloudA[i] = viewChanged && d.view === 'zone' ? 0 : t;   // 进区域时云从无到有淡入
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); cg.setAttribute('col', new THREE.BufferAttribute(col, 3)); cg.setAttribute('cell', new THREE.BufferAttribute(cell, 1)); cg.setAttribute('a', new THREE.BufferAttribute(new Float32Array(NC), 1)); cg.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
    cloudPts = new THREE.Points(cg, atlasMat(false, 1.7)); cloudPts.frustumCulled = false; cloudPts.renderOrder = 5; root.add(cloudPts);
    syncClouds(0);
  }
  // ---- DOM 标签
  if (lab) {
    lab.innerHTML = d.pois.map((p, i) => {
      if (p.kind === 'region') return `<div class="w3r${p.here ? ' here' : ''}${p.lock ? ' lock' : ''}" data-i="${i}">${p.here ? '<em>▼ 你在这里</em>' : ''}<b>${p.label}</b><small>${p.sub ?? ''}</small></div>`;
      if (p.kind === 'mark') return `<div class="w3m${p.dim ? ' dim' : ''}${p.id.startsWith('bd:') ? ' bd' : ''}" data-i="${i}" style="--c:${p.color ?? '#c9a060'}">${p.glyph ?? '•'}</div>`;
      return `<div class="w3p k-${p.kind}${p.dim ? ' dim' : ''}" data-i="${i}">${p.label ?? ''}</div>`;
    }).join('') + `<div class="w3t"><b>${d.title}</b><small>${d.sub}</small></div>`;
    lab.querySelectorAll<HTMLElement>('[data-i]').forEach(el => { const o = pobj[+el.dataset.i!]; if (o) o.el = el; });
    labSz = new Map();
  }
  if (viewChanged) { yaw = 0; zoom = 1; center.set(0, 0, 0); intro = 1; }
  (scene.userData as { pts?: number }).pts = NC + spk;
}
function setBase(d: W3Data) {
  if (!surf) return;
  const mat = surf.material as THREE.MeshStandardMaterial;
  baseTex?.dispose(); baseTex = null;
  if (d.base) {
    baseTex = d.base instanceof HTMLCanvasElement ? new THREE.CanvasTexture(d.base) : new THREE.Texture(d.base);
    baseTex.colorSpace = THREE.SRGBColorSpace; baseTex.anisotropy = 4; baseTex.needsUpdate = true;
    mat.map = baseTex; mat.color.set(0xffffff);
  } else { mat.map = null; mat.color.set(d.ground); }
  mat.needsUpdate = true;
}
/** 云：当前浓度 → 透明度；散开时往上飘、往外扩 */
function syncClouds(dt: number) {
  if (!cloudPts || !cloudA || !cloudT || !cloudLift || !cloudBase) return;
  const g = cloudPts.geometry, pa = g.attributes.position as THREE.BufferAttribute, aa = g.attributes.a as THREE.BufferAttribute;
  const k = Math.min(1, dt * 1.8);
  for (let i = 0; i < cloudA.length; i++) {
    const tgt = trans?.kind === 'zoom' ? 0 : cloudT[i];
    const was = cloudA[i];
    cloudA[i] += (tgt - was) * (tgt < was ? Math.min(1, dt * 2.4) : k);
    // 散开：浓度下降时抬升 + 外扩（回升时慢慢落回）
    cloudLift[i] = tgt < was - 0.01 ? Math.min(1.6, cloudLift[i] + dt * 2.2) : Math.max(0, cloudLift[i] - dt * 0.6);
    const bx = cloudBase[i * 3], by = cloudBase[i * 3 + 1], bz = cloudBase[i * 3 + 2], L = cloudLift[i];
    pa.setXYZ(i, bx * (1 + L * 0.06), by + L * 0.9, bz * (1 + L * 0.06));
    aa.setX(i, cloudA[i] * 0.92);
  }
  pa.needsUpdate = true; aa.needsUpdate = true;
}

/** 世界 → 区域：相机推近目标点 + 云散开（0.6 秒），结束调 done */
export function wm3dZoomTo(u: number, v: number, done: () => void): boolean {
  if (!active || !root) return false;
  trans = { kind: 'zoom', t: 0, dur: 0.6, to: at(u, v), done };
  return true;
}
/** 区域 → 副本：沙盘淡出（0.35 秒）后 done（打开副本浮岛） */
export function wm3dFadeOut(done: () => void): boolean {
  if (!active || !root) return false;
  trans = { kind: 'fade', t: 0, dur: 0.35, to: center.clone(), done };
  return true;
}

export function wm3dFrame(dt: number, open: boolean) {
  if (!active) return;
  if (!open) { wm3dStop(); return; }
  if (!renderer || !root) return;
  if (H.isTouch) { slowT += dt; slowN++; if (slowT > 3) { if (slowT / slowN > 0.07) { slow = true; wm3dStop(); H.toast('3D 沙盘太卡，已切回 2D 地图（设置里可改）', '#ffb080'); return; } slowT = 0; slowN = 0; } }
  // 过渡按真实时间推进（不受限帧影响）
  if (trans) {
    trans.t += dt;
    const k = Math.min(1, trans.t / trans.dur), e = k * k * (3 - 2 * k);
    if (trans.kind === 'fade') { if (cv) cv.style.opacity = String(1 - e); if (lab) lab.style.opacity = String(1 - e); }
    if (k >= 1) { const t = trans; trans = null; if (cv) cv.style.opacity = ''; if (lab) lab.style.opacity = ''; t.done(); if (!active || !root) return; }
  }
  if (intro > 0) intro = Math.max(0, intro - dt / 0.45);
  tAcc += dt; tAll += dt;
  const minDt = H.isTouch ? 1 / 30 - 0.004 : 1 / 60 - 0.004;
  if (tAcc < minDt) return;
  const fdt = tAcc, t = tAll; tAcc = 0;
  placeCam(t);
  root.traverse(o => {
    if (o.userData.spin) { o.rotation.y = t * 1.6; o.position.y = 0.55 + Math.sin(t * 2 + o.parent!.position.x) * 0.06; }
    const sm = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (sm?.uniforms?.t) sm.uniforms.t.value = t;
  });
  for (const o of pobj) if (o.grp) { const s = o.s0 * (o === hover ? 1.55 : 1); o.grp.scale.lerp(tmp.set(s, s, s), Math.min(1, fdt * 10)); }
  if (sparkPts && sparkV) {
    const pa = sparkPts.geometry.attributes.position as THREE.BufferAttribute, aa = sparkPts.geometry.attributes.a as THREE.BufferAttribute;
    for (const o of pobj) for (let i = 0; i < o.sparkN; i++) {
      const k = o.spark0 + i; let y = pa.getY(k) + fdt * sparkV[k] * (o === hover ? 1.8 : 1); const top = o.pos.y + (o.p.kind === 'you' ? 3 : 2.4);
      if (y > top) { y = o.pos.y; const ang = Math.random() * Math.PI * 2, r = Math.random() * 0.3; pa.setX(k, o.pos.x + Math.cos(ang) * r); pa.setZ(k, o.pos.z + Math.sin(ang) * r); }
      pa.setY(k, y); aa.setX(k, (1 - (y - o.pos.y) / (top - o.pos.y)) * (o.p.dim ? 0.4 : 0.95));
    }
    pa.needsUpdate = true; aa.needsUpdate = true;
  }
  syncClouds(fdt);
  for (const p of [cloudPts, sparkPts]) if (p) ((p.material as THREE.ShaderMaterial).uniforms.sc.value = Hh / 2 / Math.tan(cam.fov * Math.PI / 360) * (renderer.getPixelRatio?.() ?? 1));   // 点大小 = 世界单位（透视换算）
  renderer.render(scene, cam); renders++;
  placeLabels();
}
/** 镜头：约 45° 俯视，拖动 ±25°，滚轮缩放；过渡时推近目标点 */
function placeCam(t: number) {
  // 1106 取景重做：沙盘铺满画布（横向留 6%、纵向按俯角投影留 10%），不再留大片桌面空白
  const pitch = 0.95, vHalf = cam.fov * Math.PI / 360, hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
  const fitW = (SW * 0.5 + 0.4) / Math.tan(hHalf) * 1.06, fitD = ((SD * 0.5 + 0.4) * Math.sin(pitch) + RELIEF * 0.5 * Math.cos(pitch)) / Math.tan(vHalf) * 1.1;
  let dist = Math.max(fitW, fitD) * zoom;
  camAim.copy(center);
  if (trans?.kind === 'zoom') { const k = Math.min(1, trans.t / trans.dur), e = k * k * (3 - 2 * k); camAim.lerpVectors(center, trans.to, e); dist *= 1 - 0.68 * e; }
  if (intro > 0) dist *= 1 - 0.3 * intro * intro;
  const y = yaw + (drag ? 0 : Math.sin(t * 0.22) * 0.04);
  cam.position.set(camAim.x + Math.sin(y) * Math.cos(pitch) * dist, camAim.y + Math.sin(pitch) * dist, camAim.z + Math.cos(y) * Math.cos(pitch) * dist);
  cam.lookAt(camAim.x, camAim.y + RELIEF * 0.15, camAim.z); cam.updateMatrixWorld();
}
function project(p: THREE.Vector3, dy: number) { tmp.copy(p); tmp.y += dy; tmp.project(cam); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * Hh, vis: tmp.z < 1 && tmp.x > -1.1 && tmp.x < 1.1 && tmp.y > -1.1 && tmp.y < 1.1 }; }
const labDy = (o: PObj) => o.p.kind === 'region' ? 0.25 : o.p.kind === 'mark' ? 0.1 : (o.grp ? 0.9 * o.s0 : 0.4);
/** 1106 标签避让：按优先级（你在这里 > 区域名 > 首领 > 副本 > 其他 > 小图标）逐个放，撞了就上下挪，小标签挪不开就藏 */
const LAB_PRI: Record<string, number> = { region: 0, you: 1, boss: 2, dungeon: 3, stone: 4, mark: 6 };
let labSz: Map<HTMLElement, [number, number]> = new Map();
export let labHidden = 0;
function placeLabels() {
  const items: { o: PObj; x: number; y: number; w: number; h: number; pri: number; mark: boolean }[] = [];
  for (const o of pobj) {
    if (!o.el) continue;
    const s = project(o.pos, labDy(o));
    if (!s.vis) { o.el.style.visibility = 'hidden'; continue; }
    let sz = labSz.get(o.el); if (!sz || !sz[0]) { sz = [o.el.offsetWidth, o.el.offsetHeight]; labSz.set(o.el, sz); }
    const pri = o.p.here ? -1 : (LAB_PRI[o.p.kind] ?? 5) + (o.p.dim ? 0.5 : 0);
    items.push({ o, x: s.x, y: s.y, w: sz[0] + 4, h: sz[1] + (o.p.here ? 17 : 0) + 2, pri, mark: o.p.kind === 'mark' });
  }
  items.sort((a, b) => a.pri - b.pri);
  const placed: number[][] = [];
  const tt = lab?.querySelector<HTMLElement>('.w3t'); if (tt) { const w = tt.offsetWidth + 8; placed.push([W / 2 - w / 2, 0, W / 2 + w / 2, tt.offsetHeight + 10]); }
  const hit = (l: number, t: number, w: number, h: number) => placed.some(r => l < r[2] && r[0] < l + w && t < r[3] && r[1] < t + h);
  labHidden = 0;
  for (const it of items) {
    const big = it.o.p.kind === 'region' || it.o.p.here;
    const l = it.x - it.w / 2, t0 = it.mark ? it.y - it.h / 2 : it.y - it.h;
    const tries = big ? [0, 1, -1, 2, -2, 3, -3] : it.mark ? [0] : [0, 1, -1];
    let dy: number | null = null;
    for (const k of tries) { const d = k * (it.h * 0.55 + 2); if (!hit(l, t0 + d, it.w, it.h)) { dy = d; break; } }
    if (dy === null && !big) { it.o.el!.style.visibility = 'hidden'; labHidden++; continue; }
    dy ??= 0;
    placed.push([l, t0 + dy, l + it.w, t0 + dy + it.h]);
    it.o.el!.style.transform = `translate(${Math.round(it.x)}px,${Math.round(it.y + dy)}px) translate(-50%,${it.mark ? '-50%' : '-100%'})${it.o === hover ? ' scale(1.18)' : ''}`;
    it.o.el!.style.visibility = 'visible';
    it.o.el!.classList.toggle('hov', it.o === hover);
  }
}
function pickAt(x: number, y: number): PObj | null {
  if (!root) return null;
  cam.updateMatrixWorld();
  let best: PObj | null = null, bd = 1e9;
  for (const o of pobj) {
    const r = o.p.kind === 'region' ? 46 : o.grp ? 24 : 14;
    // 光柱：柱脚和柱身都算
    const s0 = project(o.pos, o.p.kind === 'region' ? 0.2 : 0.05);
    let dd = Math.hypot(s0.x - x, s0.y - y);
    if (o.grp) { const s1 = project(o.pos, 1.2 * o.s0); dd = Math.min(dd, Math.hypot(s1.x - x, s1.y - y)); }
    const w = o.p.kind === 'region' ? dd * 1.6 + 8 : o.grp ? dd * 0.7 : dd + 4;   // 同时在范围内时：光柱 > 小图标 > 区域名牌
    if (dd < r && w < bd) { bd = w; best = o; }
  }
  return best;
}
let upBound = false;
function bindInput(c: HTMLCanvasElement) {
  const xy = (e: { clientX: number; clientY: number }) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const tip = () => document.getElementById('wm-tip');
  c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw, moved: false }; });
  c.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x; if (Math.abs(dx) > 4 || Math.abs(e.clientY - drag.y) > 4) drag.moved = true; yaw = Math.max(-0.44, Math.min(0.44, drag.yaw - dx * 0.006)); }
    const p = xy(e), o = pickAt(p.x, p.y); hover = o;
    const t = tip(); if (!t || H.isTouch) return;
    if (!o) { t.style.display = 'none'; return; }
    t.innerHTML = o.p.tip; t.style.display = 'block'; t.style.left = `${Math.min(p.x + 14, W - 200)}px`; t.style.top = `${Math.min(p.y + 12, Hh - 80)}px`;
  });
  c.addEventListener('pointerleave', () => { hover = null; const t = tip(); if (t) t.style.display = 'none'; });
  c.addEventListener('wheel', e => { zoom = Math.max(0.55, Math.min(1.5, zoom * (e.deltaY > 0 ? 1.08 : 0.92))); e.preventDefault(); }, { passive: false });
  // v1.2.76 修：画布关面板即丢弃重建，window 上的 pointerup 只挂一次、对照当前画布（同副本浮岛，旧监听会先清空 drag）
  if (upBound) return; upBound = true;
  window.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (!d || d.moved || !cv || e.target !== cv || trans) return;
    const r = cv.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top }, o = pickAt(p.x, p.y); if (o) CB.pick(o.p);
  });
}

/** 调试 / 测试钩子 */
export function wm3dDebug() {
  const cl = cloudA ? Array.from(cloudA) : [];
  return {
    wanted: H ? wm3dWanted() : false, active, failed, slow, renders, view: data?.view ?? null, key: data?.key ?? null, yaw, zoom, labHidden,
    canvas: !!cv && cv.style.display === 'block', busy: !!trans, trans: trans?.kind ?? null,
    pois: pobj.map(o => ({ id: o.p.id, kind: o.p.kind, dim: !!o.p.dim, label: o.el?.textContent ?? '', hover: o === hover })),
    pillars: pobj.filter(o => o.grp).length, sparks: sparkV?.length ?? 0, clouds: cl.length,
    /** 云的平均浓度 / 目标浓度（散开测试用） */
    cloudMean: cl.length ? cl.reduce((a, b) => a + b, 0) / cl.length : 0,
    cloudTarget: cloudT && cloudT.length ? Array.from(cloudT).reduce((a, b) => a + b, 0) / cloudT.length : 0,
    points: (cloudA?.length ?? 0) + (sparkV?.length ?? 0), maxPoints: SAND_MAX_PTS,
    relief: RELIEF, size: [SW, SD], grid: hf ? [hf.n, hf.m] : null, maxH: hf ? Math.max(...hf.h) : 0, textured: !!baseTex,
    screen(id: string) { const o = pobj.find(q => q.p.id === id); return o ? project(o.pos, o.p.kind === 'region' ? 0.2 : 0.05) : null; },
    clickAt(x: number, y: number) { if (trans) return null; const o = pickAt(x, y); if (o) CB.pick(o.p); return o?.p.id ?? null; },
    hoverAt(x: number, y: number) { hover = pickAt(x, y); placeLabels(); return hover?.p.id ?? null; },
    drag(dx: number) { yaw = Math.max(-0.44, Math.min(0.44, yaw - dx * 0.006)); return yaw; },
    wheel(dy: number) { zoom = Math.max(0.55, Math.min(1.5, zoom * (dy > 0 ? 1.08 : 0.92))); return zoom; },
    setFailed(v: string) { failed = v; if (v) wm3dStop(); },
    setSlow(v: boolean) { slow = v; },
  };
}
