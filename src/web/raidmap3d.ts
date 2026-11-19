// v0.9.6f 3D 副本浮岛：副本地图（M 第三级 / 传送阵打开）里的立体视图。
// 独立小 WebGLRenderer（叠在 2D 画布 #rm-cv 上的 #rm-cv3），面板打开才渲染、关掉即释放；
// 低配 / 设置关闭 / WebGL 失败 / 手机持续掉帧 → 自动回退原 2D 路线图（2D 画布始终照画，测试和回退都靠它）。
// 一座悬浮岛：入口传送门、路线节点石台、首领台座 + 剪影小模型、宝箱、隐藏首领问号；节点间光路 + 流动光点；云雾、光柱。
// 文字标签用 DOM（#rm3-lab），清晰且可被测试读取。
import * as THREE from 'three';

export type I3Node = { id: string; kind: string; name: string; x: number; z: number; r: number; h?: number; boss?: number; dead?: boolean; hidden?: boolean; unknown?: boolean; cp?: boolean; fog?: boolean; tip: string; tp?: string };
export type I3Edge = { a: string; b: string; open: boolean; kind?: string };
export type I3Data = { raid: string; name: string; theme: string; nodes: I3Node[]; edges: I3Edge[]; chests: { x: number; z: number; tip: string }[]; sel: number; path: string[] | null; player: { x: number; z: number; h?: number } | null; view?: import('../core/ContentPacks').PackDungeonMapView };
type Host = { settings: { map3d?: string; quality: string }; isTouch: boolean; isMobile: boolean; toast: (m: string, c?: string) => void };
type Cb = { pick: (n: I3Node) => void };

const PAL: Record<string, { top: number; side: number; acc: number; fog: number; bg: number; path: number }> = {
  molten: { top: 0x4a2a1e, side: 0x24120c, acc: 0xff5a1a, fog: 0x3a1408, bg: 0x140604, path: 0xffc040 },
  forge: { top: 0x3e3028, side: 0x1e1612, acc: 0xff7a2a, fog: 0x2a1a10, bg: 0x100806, path: 0xffc040 },
  frost: { top: 0x8aa8c0, side: 0x2a3e52, acc: 0x7ad8ff, fog: 0x9ac8e8, bg: 0x08121e, path: 0xbfe8ff },
  troll: { top: 0x7a98a8, side: 0x26384a, acc: 0x9ae0ff, fog: 0x8ab8d8, bg: 0x081420, path: 0xd8f0ff },
  sand: { top: 0xb08850, side: 0x5a3e22, acc: 0xffb040, fog: 0x7a5a30, bg: 0x1a1006, path: 0xffd060 },
  mine: { top: 0x5a4a3a, side: 0x2a2018, acc: 0xffa040, fog: 0x3a3028, bg: 0x0e0a08, path: 0xffc860 },
  swamp: { top: 0x3e5a32, side: 0x1e2a18, acc: 0x8aff6a, fog: 0x2e4a2a, bg: 0x08100a, path: 0xd0ff80 },
};

let H: Host, CB: Cb;
let renderer: THREE.WebGLRenderer | null = null, failed = '', slow = false;
/** v1.2.73 地图上手动切回 3D：清掉上次的失败 / 掉帧标记再试 */
let declutter = false;   // 11-07 只在内容包竖井视图里做标签避让，原副本 3D 图不变
export function rm3dRetry() { failed = ''; slow = false; slowT = 0; slowN = 0; }
let cv: HTMLCanvasElement | null = null, lab: HTMLDivElement | null = null;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
let root: THREE.Group | null = null;
let sig = '', data: I3Data | null = null, active = false;
let W = 600, Hh = 360, tAcc = 0, tAll = 0, renders = 0, slowT = 0, slowN = 0;
let yaw = 0, zoom = 1, R = 8, drag: { x: number; y: number; yaw: number; moved: boolean } | null = null;
const center = new THREE.Vector3();
let picks: THREE.Object3D[] = [], nodeObj: Record<string, { pos: THREE.Vector3; ring?: THREE.Mesh; col?: THREE.Mesh; fig?: THREE.Group; n: I3Node; el?: HTMLElement }> = {};
let flow: { pts: THREE.Points; curves: { c: THREE.Curve<THREE.Vector3>; n: number; sp: number }[] } | null = null;
let clouds: THREE.Points | null = null;
let glowTex: THREE.DataTexture | null = null;
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), tmp = new THREE.Vector3();

export function bindRaidMap3d(h: Host, cb: Cb) { H = h; CB = cb; }
/** 设置 + 机器条件：要不要用 3D（不含 WebGL 是否真能起） */
export function rm3dWanted(): boolean {
  const m = H?.settings.map3d ?? 'auto';
  if (m === 'off' || failed || slow) return false;
  if (m === 'on') return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (H.settings.quality === 'low') return false;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return false;
  return true;
}
export const rm3dActive = () => active;

function tex(): THREE.DataTexture {
  if (glowTex) return glowTex;
  const N = 32, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2), a = Math.max(0, 1 - r); const i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(255 * a * a); }
  glowTex = new THREE.DataTexture(d, N, N); glowTex.needsUpdate = true; return glowTex;
}
function ensureDom(base: HTMLCanvasElement): boolean {
  if (!cv) {
    cv = document.createElement('canvas'); cv.id = 'rm-cv3';
    lab = document.createElement('div'); lab.id = 'rm3-lab';
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
/** 渲染器起不来 / 关闭：藏掉 3D 层，2D 画布重新可见 */
function hideLayer(base?: HTMLElement | null) {
  if (cv) cv.style.display = 'none';
  if (lab) lab.style.display = 'none';
  (base ?? document.getElementById('rm-cv'))?.style.removeProperty('visibility');
}
/** 每次 renderRaidMap 调用：数据没变只更新选中；变了重建。返回 3D 是否在用 */
export function rm3dShow(base: HTMLCanvasElement, d: I3Data, cw: number, ch: number): boolean {
  if (!rm3dWanted() || !ensureDom(base)) { rm3dStop(); return false; }
  active = true;
  W = cw; Hh = ch;
  cv!.style.display = 'block'; lab!.style.display = 'block';
  for (const el of [cv!, lab!]) { el.style.left = `${base.offsetLeft}px`; el.style.top = `${base.offsetTop}px`; el.style.width = `${cw}px`; el.style.height = `${ch}px`; }
  base.style.visibility = 'hidden';
  renderer!.setSize(cw, ch, false); cam.aspect = cw / ch; cam.updateProjectionMatrix();
  const s = JSON.stringify([d.raid, d.theme, d.nodes.map(n => [n.id, n.x, n.z, n.dead, n.unknown, n.fog, n.cp]), d.edges, d.chests.length, d.path]);
  const raidChanged = data?.raid !== d.raid;
  data = d;
  if (s !== sig) { sig = s; build(d); if (raidChanged) { yaw = 0; zoom = 1; } }
  for (const k in nodeObj) nodeObj[k].n = d.nodes.find(n => n.id === k) ?? nodeObj[k].n;
  setSel(d.sel);
  placeCam(tAll); placeLabels();
  return true;
}
/** 关面板 / 回退：停渲染并释放 GPU 资源 */
export function rm3dStop() {
  if (!active && !renderer) return;
  active = false; hideLayer();
  clearScene(); sig = ''; data = null;
  if (renderer) { renderer.dispose(); (renderer as THREE.WebGLRenderer & { forceContextLoss?: () => void }).forceContextLoss?.(); renderer = null; }
  cv?.remove(); lab?.remove(); cv = null; lab = null;   // v1.2.73 上下文已丢，画布一起丢，下次重建（否则第二次打开只剩 2D）
}
function clearScene() {
  if (root) { root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose?.(); }); scene.remove(root); }
  root = null; picks = []; nodeObj = {}; flow = null; clouds = null;
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

/** 11-07 内容包副本定制 3D：剖开的砖砌竖井 + 按真实高度盘下去的主路（分段配色发光管 + 流动光点）+ 各层水面 + 井心悬钟 + 首领台 + 区域名 */
function brickTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')!;
  x.fillStyle = '#2a2420'; x.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 8; r++) for (let i = 0; i < 9; i++) { const off = r % 2 ? 16 : 0, v = 70 + ((r * 37 + i * 53) % 40); x.fillStyle = `rgb(${v},${Math.round(v * 0.86)},${Math.round(v * 0.72)})`; x.fillRect(i * 32 - off + 1, r * 16 + 1, 30, 14); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildShaft(d: I3Data, v: NonNullable<I3Data['view']>) {
  const P = PAL[d.theme] ?? PAL.frost;
  root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(0x05090d); scene.fog = new THREE.Fog(0x05090d, 26, 70);
  root.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a1410, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6); sun.position.set(-6, 16, 10); root.add(sun);
  const S = v.shaft ?? { x: 0, z: 0, r: Math.max(...v.path.map(p => Math.hypot(p.x, p.z))) + 10, top: Math.max(...v.path.map(p => p.h)) + 10, bottom: Math.min(...v.path.map(p => p.h)) - 6 };
  const k = 8 / S.r, kv = k * 2.1;
  const W3 = (x: number, h: number, z: number) => new THREE.Vector3((x - S.x) * k, h * kv, (z - S.z) * k);
  const yTop = S.top * kv, yBot = S.bottom * kv, Hh3 = yTop - yBot;
  R = 8; center.set(0, (yTop + yBot) / 2 + 1.2, 0);
  // 井筒：BackSide 只画远半边内壁（近半边自动剖开），砖纹 + 越深越暗
  const bt = brickTex(); bt.repeat.set(10, Math.max(2, Math.round(Hh3 / 1.6)));
  const wallG = new THREE.CylinderGeometry(8.15, 8.15, Hh3, 72, 10, true);
  const cols: number[] = []; const pa = wallG.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) { const t = (pa.getY(i) + Hh3 / 2) / Hh3, c = 0.25 + 0.75 * t; cols.push(c, c, c * 1.05); }
  wallG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const wall = new THREE.Mesh(wallG, new THREE.MeshStandardMaterial({ map: bt, vertexColors: true, side: THREE.BackSide, roughness: 0.95 }));
  wall.position.y = (yTop + yBot) / 2; root.add(wall);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.16, 6, 72), new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 })); lip.rotation.x = Math.PI / 2; lip.position.y = yTop; root.add(lip);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8.25, 0.035, 4, 72), glowMat(P.acc, 0.6)); rim.rotation.x = Math.PI / 2; rim.position.y = yTop + 0.12; root.add(rim);
  for (let y = yTop - 2.5; y > yBot + 0.5; y -= 2.5) { const r = new THREE.Mesh(new THREE.TorusGeometry(8.1, 0.02, 3, 72, Math.PI), glowMat(0x7a9ab0, 0.18)); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI; r.position.y = y; root.add(r); }   // 远半边深度刻度环
  // 井底水
  // 11-07 Rhett「井底水偏大」：井底整圈改暗色深渊底（不发光），只在悬钟下方画一片不规则的井底水（约 30 米）；没有悬钟的副本照旧整圈水
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8.1, 64), new THREE.MeshStandardMaterial({ color: v.bell ? 0x07090b : 0x062028, emissive: v.bell ? 0x000000 : 0x0a5060, emissiveIntensity: 0.6, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = yBot + 0.02; root.add(floor);
  const pc = v.bell ? W3(v.bell.x, S.bottom, v.bell.z) : new THREE.Vector3(0, yBot, 0);
  if (v.bell) { const sh = new THREE.Shape(), rn = rnd(hash('pool')), pr = 30 * k; for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, r = pr * (0.8 + rn() * 0.35); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const pool = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: 0x062028, emissive: 0x0a5060, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3 })); pool.rotation.x = -Math.PI / 2; pool.position.set(pc.x, yBot + 0.04, pc.z); root.add(pool); }
  const accL = new THREE.PointLight(0x40e0d0, v.bell ? 14 : 40, v.bell ? 8 : 18); accL.position.set(pc.x, yBot + 1.5, pc.z); root.add(accL);
  for (const w of v.waters ?? []) {
    const m = new THREE.Mesh(w.r ? new THREE.CircleGeometry(w.r * k, 40) : new THREE.PlaneGeometry((w.w ?? 10) * k, (w.d ?? 10) * k), new THREE.MeshBasicMaterial({ color: new THREE.Color(w.color), transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(W3(w.x, w.h, w.z)); m.position.y += 0.03; root.add(m);
  }
  // 悬钟 + 链
  if (v.bell) {
    const b = W3(v.bell.x, v.bell.h, v.bell.z), pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.12 + Math.pow(t, 1.8) * 0.75 + (t > 0.9 ? 0.08 : 0), 1.2 - t * 1.2)); }
    const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 0.8, roughness: 0.35, emissive: 0x3a2a08, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
    bell.position.copy(b); root.add(bell);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, yTop - b.y - 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x5a5048, metalness: 0.7, roughness: 0.5 }));
    chain.position.set(b.x, (yTop + b.y + 1.2) / 2, b.z); root.add(chain);
    const bl = new THREE.PointLight(0xffc060, 12, 6); bl.position.set(b.x, b.y + 0.4, b.z); root.add(bl);
  }
  // 主路：按段类型分组的发光管 + 每个路点下一根细支柱（看出高低层次）
  const Pt = v.path, segK = (i: number) => { const a = Pt[i].k, b = Pt[i + 1].k, f = (q: string) => q === 'boss' || q === 'start'; return f(b) ? (f(a) ? 'path' : a) : b; };
  const all = Pt.map(p => W3(p.x, p.h, p.z).setY(p.h * kv + 0.08));
  const curves: { c: THREE.Curve<THREE.Vector3>; n: number; sp: number }[] = [];
  let i0 = 0;
  for (let i = 1; i <= Pt.length - 1; i++) {
    if (i < Pt.length - 1 && segK(i) === segK(i0)) continue;
    const pts = all.slice(i0, i + 1), kd = v.kinds[segK(i0)] ?? v.kinds.path, col = new THREE.Color(kd?.color ?? '#c9a060').getHex();
    const c = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
    const seg = Math.max(8, pts.length * 10);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(c, seg, 0.13, 6, false), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.6 })));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(c, seg, 0.22, 6, false), glowMat(col, kd?.dash ? 0.12 : 0.2)));
    curves.push({ c, n: Math.max(2, Math.round(pts.length * 1.5)), sp: 0.12 });
    // 11-07 Rhett「台阶段断口」：段与段（换类型 / 陡台阶）接头处管子是开口的，拐急弯露缝 → 接头补一颗同色球
    for (const q of [pts[0], pts[pts.length - 1]]) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.6 })); j.position.copy(q); root.add(j); }
    i0 = i;
  }
  const stM = new THREE.MeshBasicMaterial({ color: 0x8a7a6a, transparent: true, opacity: 0.35 });
  for (const p of all) { const h = p.y - yBot; if (h < 0.4) continue; const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 4), stM); st.position.set(p.x, yBot + h / 2, p.z); root.add(st); }
  const nFlow = curves.reduce((a, c) => a + c.n, 0);
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nFlow * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff0c0, size: 0.34, map: tex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); root.add(pts); flow = { pts, curves }; }
  // 节点：首领台 / 入口（高度取主路最近点）
  const ns = d.nodes;
  for (const n of ns) {
    const p = W3(n.x, n.h ?? 0, n.z); p.y = (n.h ?? 0) * kv + 0.02;
    const grp = new THREE.Group(); grp.position.copy(p); root.add(grp);
    const o: typeof nodeObj[string] = { pos: p.clone(), n };
    if (n.boss !== undefined) {
      const rn = rnd(hash(n.id)), shape = new THREE.Shape();
      for (let i = 0; i <= 9; i++) { const a = i / 9 * Math.PI * 2, r = 0.62 + rn() * 0.22; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }   // 不规则石台（不是正圆）
      const pg = new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false }); pg.rotateX(-Math.PI / 2);
      const ped = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: n.dead ? 0x4a4a4a : 0x3a3430, roughness: 0.85, flatShading: true })); grp.add(ped);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.04, 6, 32), glowMat(n.dead ? 0x666666 : 0xff4020, n.dead ? 0.35 : 0.9)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.28; grp.add(ring); o.ring = ring;
      const fig = figure(n.name, n.dead ? 0x6a6a6a : 0x1a0e0a, n.dead ? 0x000000 : P.acc, n.dead ? 0 : 0.55); fig.position.y = 0.34; grp.add(fig); o.fig = fig;
      fig.traverse(c => { if ((c as THREE.Mesh).isMesh) { picks.push(c); c.userData.node = n.id; } });
      if (!n.dead) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 12, 1, true), beamMat(0xff3a18)); col.position.y = 1.9; grp.add(col); o.col = col; }
      ped.userData.node = n.id; picks.push(ped);
    } else {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.16, n.cp ? 4 : 8), new THREE.MeshStandardMaterial({ color: n.cp ? 0x2a5a9a : 0x3a6a3a, emissive: 0x2a6a3a, emissiveIntensity: 0.4 }));
      plate.position.y = 0.08; grp.add(plate); plate.userData.node = n.id; picks.push(plate);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3, 10, 1, true), beamMat(0xffc040)); col.position.y = 1.6; grp.add(col); o.col = col;
    }
    nodeObj[n.id] = o;
  }
  // 区域名（DOM 标签，挂成不可点的节点）
  const marks = (v.marks ?? []).map((m, i) => { const id = `mk${i}`, p = W3(m.x, m.h, m.z); p.y = m.h * kv; nodeObj[id] = { pos: p, n: { id, kind: 'mark', name: m.name, x: m.x, z: m.z, r: 1, tip: `<b>${m.name}</b><div class="st">${m.h > 0 ? '+' : ''}${Math.round(m.h)} 米</div>` } }; return { id, m }; });
  if (d.player) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xff3a20, emissive: 0xff3a20, emissiveIntensity: 0.9 })); m.rotation.x = Math.PI; m.position.copy(W3(d.player.x, d.player.h ?? 0, d.player.z)); m.position.y += 0.7; m.userData.bob = 0; root.add(m); }
  // 井里浮尘（一次 draw call）
  const NE = H.isTouch ? 70 : 160, eg = new Float32Array(NE * 3), rn2 = rnd(hash(d.raid));
  for (let i = 0; i < NE; i++) { const a = rn2() * Math.PI * 2, r = Math.sqrt(rn2()) * 7.6; eg[i * 3] = Math.cos(a) * r; eg[i * 3 + 1] = yBot + rn2() * Hh3; eg[i * 3 + 2] = Math.sin(a) * r; }
  const egeo = new THREE.BufferGeometry(); egeo.setAttribute('position', new THREE.BufferAttribute(eg, 3));
  const emb = new THREE.Points(egeo, new THREE.PointsMaterial({ color: 0x9ad8e8, size: 0.1, map: tex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); emb.userData.embersY = [yBot, yTop]; root.add(emb);
  if (lab) lab.innerHTML = ns.map(n => n.boss !== undefined ? `<div class="r3l b${n.dead ? ' dead' : ''}" data-n="${n.id}"><i>${n.dead ? '✓' : n.boss + 1}</i><span>${n.name.split(' ').pop()}</span></div>` : `<div class="r3l s" data-n="${n.id}"><span>${n.name}</span></div>`).join('')
    + marks.map(({ id, m }) => `<div class="r3l s" style="color:#cfeaff;background:rgba(4,18,28,.72);font-size:11px" data-n="${id}"><span>${m.name} ${m.h > 0 ? '+' : ''}${Math.round(m.h)}m</span></div>`).join('') + `<div class="r3t">${d.name}</div>`;
  if (lab) lab.querySelectorAll<HTMLElement>('[data-n]').forEach(el => { const o = nodeObj[el.dataset.n!]; if (o) o.el = el; });
}
function build(d: I3Data) {
  clearScene();
  declutter = !!d.view;
  if (d.view) { buildShaft(d, d.view); return; }
  const P = PAL[d.theme] ?? PAL.molten, rn = rnd(hash(d.raid));
  root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(P.bg); scene.fog = new THREE.Fog(P.bg, 18, 48);
  root.add(new THREE.HemisphereLight(0xfff0d8, P.side, 1.5));
  const sun = new THREE.DirectionalLight(0xffe8c8, 1.8); sun.position.set(6, 12, 8); root.add(sun);
  const accL = new THREE.PointLight(P.acc, 30, 30); accL.position.set(0, -3, 0); root.add(accL);
  // ---- 坐标：路线米 → 岛上单位；一条直线的副本（x 全相同）左右错开成蜿蜒小路
  const ns = d.nodes;
  const straight = ns.every(n => Math.abs(n.x - ns[0].x) < 1);
  const raw = ns.map((n, i) => ({ x: straight ? (i === 0 ? 0 : (i % 2 ? 1 : -1) * 14) : n.x, z: n.z }));
  const xs = raw.map(p => p.x), zs = raw.map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const ext = Math.max(30, (Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...zs) - Math.min(...zs)) / 2);
  const k = 8 / ext;
  const pos: Record<string, THREE.Vector3> = {};
  ns.forEach((n, i) => { pos[n.id] = new THREE.Vector3((raw[i].x - cx) * k, 0, (raw[i].z - cz) * k); });
  const hx = Math.max(...ns.map(n => Math.abs(pos[n.id].x))), hz = Math.max(...ns.map(n => Math.abs(pos[n.id].z)));
  const rz = hz + 2.4, rx = Math.max(hx + 2.4, rz * 0.5);
  R = Math.max(rx, rz); center.set(0, 0, 0);
  // ---- 主岛：顶面 + 倒锥岩底（顶点抖动出岩石感）
  const topG = new THREE.CylinderGeometry(1, 0.94, 0.7, 48, 2); topG.scale(rx, 1, rz); topG.translate(0, -0.35, 0);
  jitter(topG, rn, 0.12, true);
  const top = new THREE.Mesh(topG, new THREE.MeshStandardMaterial({ color: P.top, roughness: 0.95, flatShading: true }));
  const botG = new THREE.ConeGeometry(1, 1, 40, 4); botG.rotateX(Math.PI); botG.scale(rx * 0.94, Math.max(3, R * 0.7), rz * 0.94); botG.translate(0, -0.7 - Math.max(3, R * 0.7) / 2, 0);
  jitter(botG, rn, 0.5, false);
  const bot = new THREE.Mesh(botG, new THREE.MeshStandardMaterial({ color: P.side, roughness: 1, flatShading: true, emissive: P.acc, emissiveIntensity: 0.06 }));
  root.add(top, bot);
  // 岛边发光裂缝环 + 周围小碎岛
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 4, 64), glowMat(P.acc, 0.5)); rim.rotation.x = Math.PI / 2; rim.scale.set(rx * 0.97, rz * 0.97, 1); rim.position.y = -0.02; root.add(rim);
  for (let i = 0; i < 7; i++) {
    const a = rn() * Math.PI * 2, s = 0.4 + rn() * 0.9, g = new THREE.DodecahedronGeometry(s, 0); g.scale(1, 0.6, 1);
    const m = new THREE.Mesh(g, top.material); m.position.set(Math.cos(a) * (rx + 2 + rn() * 3), -1 - rn() * 3, Math.sin(a) * (rz + 2 + rn() * 3)); m.userData.bob = rn() * 6; root.add(m);
  }
  // ---- 光路（边）：拱起的管 + 流动光点
  const onPath = new Set<string>(); if (d.path) for (let i = 1; i < d.path.length; i++) { onPath.add(`${d.path[i - 1]}|${d.path[i]}`); onPath.add(`${d.path[i]}|${d.path[i - 1]}`); }
  const curves: { c: THREE.Curve<THREE.Vector3>; n: number; sp: number }[] = [];
  for (const e of d.edges) {
    const A = pos[e.a], B = pos[e.b]; if (!A || !B) continue;
    const mid = A.clone().add(B).multiplyScalar(0.5); mid.y = 0.12 + A.distanceTo(B) * 0.06;
    const c = new THREE.QuadraticBezierCurve3(A.clone().setY(0.1), mid, B.clone().setY(0.1));
    const col = e.kind === 'secret' ? 0xb07aff : e.kind === 'shortcut' ? 0x6ac8ff : e.open ? P.path : 0xa03020;
    const hot = onPath.has(`${e.a}|${e.b}`);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 16, hot ? 0.09 : 0.06, 5, false), glowMat(col, e.open ? (hot ? 0.95 : 0.6) : 0.25));
    root.add(tube);
    if (e.open) curves.push({ c, n: hot ? 8 : 4, sp: hot ? 0.45 : 0.25 });
  }
  const nFlow = curves.reduce((s, c) => s + c.n, 0);
  if (nFlow) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nFlow * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: P.path, size: 0.32, map: tex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    root.add(pts); flow = { pts, curves };
  }
  // ---- 节点
  for (const n of ns) {
    const p = pos[n.id], grp = new THREE.Group(); grp.position.copy(p); root.add(grp);
    const o: typeof nodeObj[string] = { pos: p.clone(), n };
    const alpha = n.fog ? 0.45 : 1;
    if (n.boss !== undefined) {
      // 首领台座：六角石台 + 发光环 + 剪影（死了变灰熄火）
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.34, 6), new THREE.MeshStandardMaterial({ color: n.dead ? 0x4a4a4a : n.unknown ? 0x3a1a50 : 0x3a2a24, roughness: 0.8, flatShading: true, transparent: alpha < 1, opacity: alpha }));
      ped.position.y = 0.17; grp.add(ped);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 32), glowMat(n.dead ? 0x666666 : n.unknown ? 0xb070ff : 0xff4020, n.dead ? 0.35 : 0.9)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.36; grp.add(ring); o.ring = ring;
      if (n.unknown) {
        const q = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0x5a2a8a, emissive: 0xb070ff, emissiveIntensity: 1.2, flatShading: true }));
        q.position.y = 1.0; q.userData.spin = 1; grp.add(q); picks.push(q); q.userData.node = n.id;
      } else {
        const fig = figure(n.name, n.dead ? 0x6a6a6a : 0x1a0e0a, n.dead ? 0x000000 : P.acc, n.dead ? 0 : 0.55); fig.position.y = 0.34; grp.add(fig); o.fig = fig;
        fig.traverse(c => { if ((c as THREE.Mesh).isMesh) { picks.push(c); c.userData.node = n.id; } });
      }
      if (!n.dead) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 7, 12, 1, true), beamMat(n.unknown ? 0x9a50ff : 0xff3a18)); col.position.y = 3.6; grp.add(col); o.col = col; }
      ped.userData.node = n.id; picks.push(ped);
    } else {
      const entry = n.kind === 'entry' || n.kind === 'hub';
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, n.cp ? 4 : 8), new THREE.MeshStandardMaterial({ color: n.cp ? 0x2a5a9a : entry ? 0x3a6a3a : n.kind === 'secret' ? 0x5a2a7a : n.kind === 'gate' ? 0x6a3a1a : 0x5a4a34, emissive: n.cp ? 0x3a9aff : 0x000000, emissiveIntensity: n.cp ? 0.4 : 0, flatShading: true, transparent: alpha < 1, opacity: alpha }));
      plate.position.y = 0.09; grp.add(plate); plate.userData.node = n.id; picks.push(plate);
      if (entry) {   // 入口传送门：石拱 + 金色光柱
        const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, emissive: 0xffc040, emissiveIntensity: 0.5 }));
        arch.position.y = 0.18; grp.add(arch);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20, 0, Math.PI), glowMat(0x7aff9a, 0.5)); disc.position.y = 0.18; grp.add(disc);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 5, 10, 1, true), beamMat(0xffc040)); col.position.y = 2.6; grp.add(col); o.col = col;
      }
    }
    nodeObj[n.id] = o;
  }
  // ---- 宝箱
  for (const c of d.chests) {
    const p = new THREE.Vector3((c.x - cx) * k, 0, (c.z - cz) * k);
    const g = new THREE.Group(); g.position.copy(p); root.add(g);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.26), new THREE.MeshStandardMaterial({ color: 0x8a5a20, emissive: 0xffb030, emissiveIntensity: 0.35 }));
    box.position.y = 0.12; g.add(box);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 8, 1, false, 0, Math.PI), box.material); lid.rotation.z = Math.PI / 2; lid.position.y = 0.24; g.add(lid);
    const id = `chest${picks.length}`; box.userData.node = id; picks.push(box);
    nodeObj[id] = { pos: p, n: { id, kind: 'chest', name: '宝箱', x: c.x, z: c.z, r: 1, tip: c.tip } };
  }
  // ---- 玩家
  if (d.player) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xff3a20, emissive: 0xff3a20, emissiveIntensity: 0.8 }));
    m.rotation.x = Math.PI; m.position.set((d.player.x - cx) * k, 0.9, (d.player.z - cz) * k); m.userData.bob = 0; root.add(m);
  }
  // ---- 云雾：岛下方和四周大粒子（一次 draw call）
  const NC = H.isTouch ? 120 : 260, cg = new Float32Array(NC * 3);
  for (let i = 0; i < NC; i++) { const a = rn() * Math.PI * 2, r = 0.6 + rn() * 1.1; cg[i * 3] = Math.cos(a) * rx * r * 1.3; cg[i * 3 + 1] = -1.5 - rn() * 6; cg[i * 3 + 2] = Math.sin(a) * rz * r * 1.3; }
  const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute('position', new THREE.BufferAttribute(cg, 3));
  clouds = new THREE.Points(cgeo, new THREE.PointsMaterial({ color: P.fog, size: 3.2, map: tex(), transparent: true, opacity: 0.35, depthWrite: false })); root.add(clouds);
  // 余烬 / 雪花上升粒子
  const NE = H.isTouch ? 50 : 110, eg = new Float32Array(NE * 3);
  for (let i = 0; i < NE; i++) { eg[i * 3] = (rn() - 0.5) * rx * 2.4; eg[i * 3 + 1] = rn() * 6 - 2; eg[i * 3 + 2] = (rn() - 0.5) * rz * 2.4; }
  const egeo = new THREE.BufferGeometry(); egeo.setAttribute('position', new THREE.BufferAttribute(eg, 3));
  const emb = new THREE.Points(egeo, new THREE.PointsMaterial({ color: P.acc, size: 0.14, map: tex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); emb.userData.embers = 1; root.add(emb);
  // ---- DOM 标签
  if (lab) lab.innerHTML = ns.map(n => {
    if (n.boss !== undefined) return `<div class="r3l b${n.dead ? ' dead' : ''}${n.unknown ? ' unk' : ''}" data-n="${n.id}"><i>${n.dead ? '✓' : n.unknown ? '?' : n.boss + 1}</i><span>${n.unknown ? '？？？' : n.name.split(' ').pop()}</span></div>`;
    if (n.kind === 'entry' || n.kind === 'hub' || n.cp || n.kind === 'secret' || n.kind === 'gate') return `<div class="r3l s${n.fog ? ' fog' : ''}" data-n="${n.id}"><span>${n.name}</span></div>`;
    return '';
  }).join('') + `<div class="r3t">${d.name}</div>`;
  if (lab) lab.querySelectorAll<HTMLElement>('[data-n]').forEach(el => { const o = nodeObj[el.dataset.n!]; if (o) o.el = el; });
}
function jitter(g: THREE.BufferGeometry, rn: () => number, amt: number, keepTop: boolean) {
  const p = g.attributes.position as THREE.BufferAttribute, seen = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let d = seen.get(key); if (!d) { d = [(rn() - 0.5) * amt, (rn() - 0.5) * amt, (rn() - 0.5) * amt]; seen.set(key, d); }
    if (keepTop && y > -0.01) continue;
    p.setXYZ(i, x + d[0], y + d[1] * (keepTop ? 0.3 : 1), z + d[2]);
  }
  g.computeVertexNormals();
}
/** 首领剪影：身体 + 头 + 肩，按名字哈希加角 / 翅 / 武器（暗色 + 余烬边光） */
export function figure(name: string, col: number, em: number, ei: number): THREE.Group {
  const h = hash(name), g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: ei, roughness: 0.6, flatShading: true });
  const big = h % 3 === 0 ? 1.25 : 1;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * big, 0.3 * big, 0.62 * big, 7), m); body.position.y = 0.31 * big; g.add(body);
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.52 * big, 0.14, 0.22), m); sh.position.y = 0.6 * big; g.add(sh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * big, 8, 6), m); head.position.y = 0.76 * big; g.add(head);
  if (h & 1) for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), m); horn.position.set(s * 0.09 * big, 0.9 * big, 0); horn.rotation.z = -s * 0.5; g.add(horn); }
  if (h & 2) for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 3), m); wing.scale.z = 0.15; wing.position.set(s * 0.34 * big, 0.68 * big, -0.08); wing.rotation.z = -s * 1.1; g.add(wing); }
  if (h & 4) { const wpn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), m); wpn.position.set(0.32 * big, 0.45 * big, 0.06); wpn.rotation.z = -0.25; g.add(wpn); }
  g.userData.bob = (h % 100) / 16;
  return g;
}
function setSel(i: number) {
  for (const k in nodeObj) {
    const o = nodeObj[k], on = o.n.boss !== undefined && o.n.boss === i;
    if (o.ring) { (o.ring.material as THREE.MeshBasicMaterial).color.set(on ? 0xffb020 : o.n.dead ? 0x666666 : o.n.unknown ? 0xb070ff : 0xff4020); o.ring.scale.setScalar(on ? 1.22 : 1); }
    if (o.col) ((o.col.material as THREE.ShaderMaterial).uniforms.c.value as THREE.Color).set(on ? 0xffb020 : o.n.kind === 'entry' || o.n.kind === 'hub' ? 0xffc040 : o.n.unknown ? 0x9a50ff : 0xff3a18);
    if (o.el) o.el.classList.toggle('sel', on);
  }
}

/** 主循环每帧调用：面板没开就停；开着按 30 / 60 帧渲染 */
export function rm3dFrame(dt: number, open: boolean) {
  if (!active) return;
  if (!open) { rm3dStop(); return; }
  if (!renderer || !root) return;
  // 手机持续掉帧（< 14 帧）→ 本次会话回退 2D
  if (H.isTouch) { slowT += dt; slowN++; if (slowT > 3) { if (slowT / slowN > 0.07) { slow = true; rm3dStop(); H.toast('3D 副本地图太卡，已切回 2D 路线图（设置里可改）', '#ffb080'); return; } slowT = 0; slowN = 0; } }
  tAcc += dt; tAll += dt;
  const minDt = H.isTouch ? 1 / 30 - 0.004 : 1 / 60 - 0.004;
  if (tAcc < minDt) return;
  const t = tAll; tAcc = 0;
  placeCam(t);
  // 动画
  root.traverse(o => {
    if (o.userData.bob !== undefined && !(o as THREE.Group).isGroup) o.position.y += Math.sin(t * 0.8 + o.userData.bob) * 0.002;
    if (o.userData.spin) o.rotation.y = t * 1.4;
    if (o.userData.embersY) { const [y0, y1] = o.userData.embersY as number[], a = (o as THREE.Points).geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) { let yy = a.getY(i) + dt * 0.25; if (yy > y1) yy = y0; a.setY(i, yy); } a.needsUpdate = true; }
    if (o.userData.embers) { const a = (o as THREE.Points).geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) { let yy = a.getY(i) + dt * 0.5; if (yy > 4) yy = -2; a.setY(i, yy); } a.needsUpdate = true; }
    const sm = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (sm?.uniforms?.t) sm.uniforms.t.value = t;
  });
  for (const k in nodeObj) { const o = nodeObj[k]; if (o.fig) { o.fig.rotation.y = t * 0.5; o.fig.position.y = 0.34 + Math.sin(t * 1.6 + (o.fig.userData.bob ?? 0)) * 0.04; } if (o.ring && o.n.boss === data?.sel) o.ring.scale.setScalar(1.18 + Math.sin(t * 5) * 0.06); }
  if (flow) { const a = flow.pts.geometry.attributes.position as THREE.BufferAttribute; let j = 0; for (const c of flow.curves) for (let i = 0; i < c.n; i++) { c.c.getPoint(((t * c.sp) + i / c.n) % 1, tmp); a.setXYZ(j++, tmp.x, tmp.y + 0.06, tmp.z); } a.needsUpdate = true; }
  if (clouds) clouds.rotation.y = t * 0.02;
  renderer.render(scene, cam); renders++;
  placeLabels();
}
/** 镜头：45° 俯视，拖动 ±25°，空闲时轻轻摇摆 */
function placeCam(t: number) {
  const y = yaw + (drag ? 0 : Math.sin(t * 0.25) * 0.06), dist = (R * 2.15 + 5) * zoom * (cam.aspect < 1.1 ? 1.25 : 1), pitch = 0.8;
  cam.position.set(center.x + Math.sin(y) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(y) * Math.cos(pitch) * dist);
  cam.lookAt(center.x, center.y - 0.6, center.z + 0.4); cam.updateMatrixWorld();
}
function project(p: THREE.Vector3, dy: number) { tmp.copy(p); tmp.y += dy; tmp.project(cam); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * Hh, vis: tmp.z < 1 }; }
function placeLabels() {
  const L: { o: typeof nodeObj[string]; x: number; y: number; w: number; h: number; b: boolean }[] = [];
  for (const k in nodeObj) {
    const o = nodeObj[k]; if (!o.el) continue;
    const s = project(o.pos, o.n.boss !== undefined ? 1.45 : 0.55);
    o.el.style.transform = `translate(${Math.round(s.x)}px,${Math.round(s.y)}px) translate(-50%,-100%)`;
    o.el.style.visibility = s.vis ? 'visible' : 'hidden';
    if (declutter && s.vis) { const el = o.el as HTMLElement & { _wh?: [number, number] }; if (!el._wh || !el._wh[0]) el._wh = [el.offsetWidth, el.offsetHeight];   // 尺寸只量一次，免得每帧回流
      L.push({ o, x: s.x, y: s.y, w: el._wh[0] || 60, h: el._wh[1] || 18, b: o.n.boss !== undefined }); }
  }
  if (!declutter || L.length < 2) return;
  // 11-07 标签避让：竖井俯视下上下层的首领会投影到同一处（如 1 号与 5 号），重叠的就沿竖直方向推开，首领标签优先占原位
  L.sort((a, b) => Number(b.b) - Number(a.b) || a.y - b.y);
  for (let it = 0; it < 4; it++) for (let i = 0; i < L.length; i++) for (let j = 0; j < i; j++) {
    const A = L[j], B = L[i]; if (Math.abs(A.x - B.x) * 2 >= (A.w + B.w) || Math.abs(A.y - B.y) * 2 >= (A.h + B.h)) continue;
    B.y = B.y >= A.y ? A.y + (A.h + B.h) / 2 + 2 : A.y - (A.h + B.h) / 2 - 2;
  }
  for (const l of L) l.o.el!.style.transform = `translate(${Math.round(l.x)}px,${Math.round(l.y)}px) translate(-50%,-100%)`;
}
function pickAt(x: number, y: number): I3Node | null {
  if (!root) return null;
  cam.updateMatrixWorld();
  v2.set(x / W * 2 - 1, -(y / Hh) * 2 + 1); ray.setFromCamera(v2, cam);
  const hit = ray.intersectObjects(picks, false)[0];
  if (hit) return nodeObj[hit.object.userData.node]?.n ?? null;
  // 没直接点中：取屏幕上 26px 内最近的首领 / 节点（手机手指粗）
  let best: I3Node | null = null, bd = 26;
  for (const k in nodeObj) { const o = nodeObj[k], s = project(o.pos, o.n.boss !== undefined ? 0.6 : 0.1), d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = o.n; } }
  return best;
}
let upBound = false;
function bindInput(c: HTMLCanvasElement) {
  const xy = (e: { clientX: number; clientY: number }) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const tip = () => document.getElementById('rm-tip');
  c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw, moved: false }; });
  c.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x; if (Math.abs(dx) > 4 || Math.abs(e.clientY - drag.y) > 4) drag.moved = true; yaw = Math.max(-0.44, Math.min(0.44, drag.yaw - dx * 0.006)); }
    const t = tip(); if (!t || H.isTouch) return;
    const p = xy(e), n = pickAt(p.x, p.y);
    if (!n) { t.style.display = 'none'; return; }
    t.innerHTML = n.tip; t.style.display = 'block'; t.style.left = `${Math.min(p.x + 14, W - 200)}px`; t.style.top = `${Math.min(p.y + 10, Hh - 80)}px`;
  });
  c.addEventListener('pointerleave', () => { const t = tip(); if (t) t.style.display = 'none'; });
  c.addEventListener('wheel', e => { zoom = Math.max(0.65, Math.min(1.45, zoom * (e.deltaY > 0 ? 1.08 : 0.92))); e.preventDefault(); }, { passive: false });
  // v1.2.76 修：画布每次关面板都会丢弃重建，window 上的 pointerup 只挂一次、对照当前画布。
  // 之前每建一次画布挂一个，旧监听先跑把 drag 清空，导致第二次打开起点击传送 / 选首领全失效（2D 正常）
  if (upBound) return; upBound = true;
  window.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (!d || d.moved || !cv || e.target !== cv) return;
    const r = cv.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top }, n = pickAt(p.x, p.y); if (n) CB.pick(n);
  });
}

/** 调试 / 测试钩子 */
export function rm3dDebug() {
  return {
    wanted: H ? rm3dWanted() : false, active, failed, slow, renders, sig: !!sig, raid: data?.raid ?? null, sel: data?.sel ?? -1, yaw, zoom,
    canvas: !!cv && cv.style.display === 'block',
    nodes: Object.values(nodeObj).map(o => ({ id: o.n.id, kind: o.n.kind, tp: o.n.tp ?? null, boss: o.n.boss, dead: !!o.n.dead, unknown: !!o.n.unknown, label: o.el?.textContent ?? '', sel: !!o.el?.classList.contains('sel') })),
    flow: flow?.curves.length ?? 0, picks: picks.length, objects: root ? root.children.length : 0,
    /** 节点在 3D 画布上的屏幕坐标（截图 / 点击测试用） */
    screen(id: string) { const o = nodeObj[id]; return o ? project(o.pos, o.n.boss !== undefined ? 0.6 : 0.1) : null; },
    /** (x,y) 处拾取到哪个节点（不触发点击） */
    pickId(x: number, y: number) { cam.updateMatrixWorld(); return pickAt(x, y)?.id ?? null; },
    /** 模拟在 3D 画布 (x,y) 处点击（走真实射线拾取） */
    clickAt(x: number, y: number) { cam.updateMatrixWorld(); const n = pickAt(x, y); if (n) CB.pick(n); return n?.id ?? null; },
    setFailed(v: string) { failed = v; if (v) rm3dStop(); },
    setSlow(v: boolean) { slow = v; },
  };
}
