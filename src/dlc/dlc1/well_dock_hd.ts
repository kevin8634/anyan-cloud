// ======================================================================
// 潮渊钟井 · 井口码头 场景改造样板（11-03，0 积分）
// 全部程序化：湿木板 / 湿石 PBR（底色 + 法线 + 粗糙度，运行时 canvas 生成 512²，比赛版上限 1024 以内，不占资产包体积）、
// 倒角 + 平滑法线（RoundedBox）、桩入水 AO + 潮痕、鱼油灯暖点光对井口冷天光、程序化 IBL（PMREM）、
// 本区调色（进区插值）、分层高度雾片、水面反射（中档 = 环境假反射，高 / 极高 = 平面反射）、缆绳 / 木箱 / 渔网实例化。
// 开关：URL ?scene=old 看旧码头，?scene=new（默认）看改造后。
// ======================================================================
import * as THREE from 'three';
import { tileMat } from '../../web/tiletex';   // fix1106 无缝贴图（木箱）
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { waterUp, waterBind, rippleNormal } from './water_fx';   // 11-07 统一水体六条

type Q = 'low' | 'medium' | 'high' | 'ultra';
export function sceneMode(): 'old' | 'new' {
  try { const q = new URLSearchParams(location.search).get('scene'); if (q === 'old') return 'old'; } catch { /* 无 location */ }
  return 'new';
}
export function quality(): Q {
  try { const s = JSON.parse(localStorage.getItem('darkrock_settings') ?? '{}'); if (['low', 'medium', 'high', 'ultra'].includes(s.quality)) return s.quality; } catch { /* 默认 */ }
  return 'high';
}

// ---------------------------------------------------------------- 程序化贴图
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function canvas(n: number) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')!] as const; }
/** 高度图 → 法线贴图 */
function normalFrom(h: Float32Array, n: number, k: number) {
  const [c, x] = canvas(n), img = x.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const L = h[j * n + (i + n - 1) % n], R = h[j * n + (i + 1) % n], U = h[((j + n - 1) % n) * n + i], D = h[((j + 1) % n) * n + i];
    let nx = (L - R) * k, ny = (U - D) * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (j * n + i) * 4; img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = nz * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
function tex(c: HTMLCanvasElement, srgb: boolean, rep: [number, number]) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 湿木板：顺纹 + 木节 + 板缝发黑 + 水渍（越湿越光滑） */
function wetWoodMaps(n = 512) {
  seed = 11; const h = new Float32Array(n * n), wet = new Float32Array(n * n);
  const knots = Array.from({ length: 5 }, () => [rnd() * n, rnd() * n, 6 + rnd() * 10]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = j / n; let g = Math.sin((v * 38 + Math.sin(i / n * 6.28 * 2 + v * 9) * 0.6) * 6.28) * 0.5 + 0.5;
    g = g * 0.6 + Math.sin(v * 420 + i * 0.05) * 0.15 + 0.25;
    for (const [kx, ky, kr] of knots) { const d = Math.hypot(i - kx, (j - ky) * 2); if (d < kr * 2.5) g += Math.sin(d * 1.3) * 0.3 * (1 - d / (kr * 2.5)); }
    const edge = Math.min(v, 1 - v) * n; if (edge < 4) g -= (4 - edge) * 0.35;
    h[j * n + i] = g; wet[j * n + i] = 0.5 + 0.5 * Math.sin(i / n * 6.28 * 3 + Math.sin(v * 12)) * Math.cos(v * 5.1);
  }
  const [cc, cx] = canvas(n), ci = cx.createImageData(n, n), [rc, rx] = canvas(n), ri = rx.createImageData(n, n);
  for (let p = 0; p < n * n; p++) {
    const g = h[p], w = wet[p], o = p * 4, dark = 0.55 + g * 0.45 - w * 0.18;
    ci.data[o] = 74 * dark; ci.data[o + 1] = 56 * dark; ci.data[o + 2] = 40 * dark; ci.data[o + 3] = 255;
    const r = Math.max(0.18, 0.72 - w * 0.5 - (g < 0.1 ? 0.1 : 0)) * 255; ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = r; ri.data[o + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0);
  return { map: cc, normal: normalFrom(h, n, 2.2), rough: rc };
}
/** 湿石：多层噪点 + 裂缝 + 苔斑 */
function wetStoneMaps(n = 512) {
  seed = 23; const h = new Float32Array(n * n); const N = 6, grid: number[][] = [];
  for (let o = 0; o < N; o++) { const s = 4 << o; grid.push(Array.from({ length: s * s }, rnd)); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = 0, a = 0.5;
    for (let o = 0; o < N; o++) { const s = 4 << o, fx = i / n * s, fy = j / n * s, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, G = grid[o];
      const q = (x: number, y: number) => G[((y % s + s) % s) * s + ((x % s + s) % s)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      v += a * ((q(x0, y0) * (1 - sx) + q(x0 + 1, y0) * sx) * (1 - sy) + (q(x0, y0 + 1) * (1 - sx) + q(x0 + 1, y0 + 1) * sx) * sy); a *= 0.5; }
    h[j * n + i] = v;
  }
  const [cc, cx] = canvas(n), ci = cx.createImageData(n, n), [rc, rx] = canvas(n), ri = rx.createImageData(n, n);
  for (let p = 0; p < n * n; p++) { const v = h[p], o = p * 4, moss = v > 0.62 ? (v - 0.62) * 3 : 0, crack = v < 0.3 ? 0.5 : 1;
    ci.data[o] = (52 + v * 40) * crack * (1 - moss * 0.3); ci.data[o + 1] = (58 + v * 42 + moss * 30) * crack; ci.data[o + 2] = (60 + v * 40) * crack * (1 - moss * 0.4); ci.data[o + 3] = 255;
    ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = (0.35 + (1 - v) * 0.35 + moss * 0.3) * 255; ri.data[o + 3] = 255; }
  cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0);
  return { map: cc, normal: normalFrom(h, n, 3), rough: rc };
}
let woodM: THREE.MeshStandardMaterial | null = null, stoneM: THREE.MeshStandardMaterial | null = null;
export function wetWood(rep: [number, number] = [1, 1]) {
  if (!woodM) { const m = wetWoodMaps(); woodM = new THREE.MeshStandardMaterial({ map: tex(m.map, true, [1, 1]), normalMap: tex(m.normal, false, [1, 1]), roughnessMap: tex(m.rough, false, [1, 1]), roughness: 1, metalness: 0, envMapIntensity: 0.9, normalScale: new THREE.Vector2(0.9, 0.9) }); }
  if (rep[0] === 1 && rep[1] === 1) return woodM;
  const m = woodM.clone(); for (const k of ['map', 'normalMap', 'roughnessMap'] as const) { const t = m[k]!.clone(); t.repeat.set(rep[0], rep[1]); t.needsUpdate = true; m[k] = t; } return m;
}
export function wetStone() {
  if (!stoneM) { const m = wetStoneMaps(); stoneM = new THREE.MeshStandardMaterial({ map: tex(m.map, true, [2, 2]), normalMap: tex(m.normal, false, [2, 2]), roughnessMap: tex(m.rough, false, [2, 2]), roughness: 1, metalness: 0, envMapIntensity: 0.8 }); }
  return stoneM;
}
/** 桩入水：底部 AO 发黑 + 一道浅色潮痕 + 上方湿痕渐淡（透明叠加的圆筒带） */
function tideBandTex() {
  const [c, x] = canvas(128); const g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(4,8,10,0.92)'); g.addColorStop(0.32, 'rgba(8,14,16,0.6)'); g.addColorStop(0.42, 'rgba(170,190,180,0.55)'); g.addColorStop(0.47, 'rgba(120,140,130,0.25)'); g.addColorStop(0.75, 'rgba(10,16,18,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function radialTex() {
  const [c, x] = canvas(128), g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#bbb'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function fogTex() {
  const n = 256, [c, x] = canvas(n); seed = 91;
  for (let k = 0; k < 90; k++) { const px = rnd() * n, py = rnd() * n, r = 20 + rnd() * 50, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g;
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) { x.save(); x.translate(dx, dy); x.fillRect(px - r, py - r, r * 2, r * 2); x.restore(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function netTex() {
  const [c, x] = canvas(128); x.strokeStyle = 'rgba(70,64,50,1)'; x.lineWidth = 2;
  for (let k = 0; k <= 128; k += 16) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 6, 128); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(128, k + 5); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- 程序化 IBL：井口冷天光（11-07 BUG#14：原为井口一大块亮区，镜面黑水映成大方块 → 改小圆月 + 软光晕） + 四周深色湿岩 + 码头鱼油灯暖光斑
let envRT: THREE.WebGLRenderTarget | null = null;
function wellEnv(r: THREE.WebGLRenderer) {
  if (envRT) return envRT.texture;
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float y = vP.y; vec3 top = vec3(0.55,0.78,0.9)*1.6; vec3 mid = vec3(0.07,0.12,0.14); vec3 bot = vec3(0.02,0.03,0.035);' +
      ' vec3 c = y > 0.0 ? mix(mid, top, pow(y, 1.6)) : mix(mid, bot, -y); c += vec3(3.0,3.4,3.6) * smoothstep(0.9965, 0.9985, y) + vec3(0.35,0.45,0.55) * pow(max(y, 0.0), 40.0); gl_FragColor = vec4(c,1.0); }' }));
  s.add(sky);
  for (const a of [0.4, 2.2, 4.1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.9) })); b.position.set(Math.cos(a) * 7, -0.6, Math.sin(a) * 7); s.add(b); }
  const pm = new THREE.PMREMGenerator(r); envRT = pm.fromScene(s, 0.02); pm.dispose();
  return envRT.texture;
}

// ---------------------------------------------------------------- 本区调色 + 雾：靠近码头插值过渡，离开 / 出图恢复
// 11-03 v2：v1 实拍整片发白（IBL 强度 1 + 曝光 1.18 + 56 米雾片 0.55 不透明盖住全场），且 SwiftShader 帧耗时为旧版 2–25 倍 → 压暗、雾片收圆、灯光按档与进区开关
const GRADE = { fog: new THREE.Color(0x1c2c33), exposure: 1.04, fogFar: 120, envI: 0.45, r0: 22, r1: 42 };
const zone = { cx: 0, cz: 0, w: 0, saved: null as null | { fog: THREE.Color | null; far: number; exp: number; env: THREE.Texture | null; envI: number }, scene: null as THREE.Scene | null, renderer: null as THREE.WebGLRenderer | null, fogs: [] as THREE.Mesh[], t: 0, lights: [] as THREE.Light[], rf: null as THREE.Object3D | null, lit: false };
let wellCam: THREE.Camera | null = null;
/** A10：井图渲染器 / 场景 / 相机（首领预热用；没进过井图 = null） */
export const wellRC = () => (zone.renderer && zone.scene && wellCam ? { r: zone.renderer, s: zone.scene, c: wellCam } : null);
export const dockGradeInfo = () => ({ w: zone.w, on: !!zone.saved, mode: sceneMode(), q: quality() });
/** 每帧（在井图内）调用：px/pz 为玩家世界坐标 */
export function dockGradeTick(dt: number, inMap: boolean, px: number, pz: number) {
  const S = zone.scene, R = zone.renderer;
  if (!S || !R) return;
  if (!inMap) { restore(); return; }
  if (!zone.saved) { const f = S.fog as THREE.Fog | null; zone.saved = { fog: f ? f.color.clone() : null, far: f && 'far' in f ? f.far : 0, exp: R.toneMappingExposure, env: S.environment, envI: S.environment ? S.environmentIntensity : 0 }; S.environment = wellEnv(R); }
  const d = Math.hypot(px - zone.cx, pz - zone.cz), target = d < GRADE.r0 ? 1 : d > GRADE.r1 ? 0 : 1 - (d - GRADE.r0) / (GRADE.r1 - GRADE.r0);
  zone.w += (target - zone.w) * Math.min(1, dt * 1.5); zone.t += dt;
  const sv = zone.saved!; const f = S.fog as THREE.Fog | null;
  if (f && sv.fog) { f.color.copy(sv.fog).lerp(GRADE.fog, zone.w); if ('far' in f) f.far = sv.far + (GRADE.fogFar - sv.far) * zone.w; }
  R.toneMappingExposure = sv.exp + (GRADE.exposure - sv.exp) * zone.w;
  S.environmentIntensity = sv.envI + (GRADE.envI - sv.envI) * zone.w;
  // 灯光 / 平面反射只在进区后开（光源数变化会让全场材质重编译一次，带回差防抖）
  const want = zone.lit ? zone.w > 0.03 : zone.w > 0.08;
  if (want !== zone.lit) { zone.lit = want; zone.lights.forEach(l => (l.visible = want)); }
  if (zone.rf) zone.rf.visible = zone.w > 0.3;
  zone.fogs.forEach((m, i) => { const t = (m.material as THREE.MeshBasicMaterial).map!; t.offset.x = zone.t * (0.004 + i * 0.003); t.offset.y = zone.t * 0.002 * (i % 2 ? 1 : -1); });
}
function restore() {
  const S = zone.scene, R = zone.renderer, sv = zone.saved; if (!S || !R || !sv) return;
  // 雾色 / 雾距不回写：换图时主程序按新图 palette 重设，回写会污染新图
  R.toneMappingExposure = sv.exp; S.environment = sv.env; S.environmentIntensity = sv.envI || 1; zone.saved = null; zone.w = 0;
  if (zone.lit) { zone.lit = false; zone.lights.forEach(l => (l.visible = false)); }
}
/** 隐形钩子：第一次被渲染时拿到主场景 / 渲染器，挂 IBL 并记下原值 */
function hook(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  m.frustumCulled = false;
  m.onBeforeRender = (r, s, c) => {
    wellCam = c;
    if (zone.scene !== s) { zone.scene = s as THREE.Scene; zone.renderer = r; zone.saved = null; }   // 只记引用；PMREM 在 tick 里（渲染外）生成
  };
  return m;
}

// ---------------------------------------------------------------- 改造后的码头
/** 断码头：甲板东西分界（码头局部 x，米）；东半边对象（塌落动画用） */
export const DOCK_SPLIT = 1.6;
export const DOCK_EAST: { obj: THREE.Group | null } = { obj: null };
export function dockHd(cx: number, cz: number): THREE.Group {
  const q = quality(), g = new THREE.Group(); zone.cx = cx; zone.cz = cz; zone.fogs = []; zone.t = 0; zone.lights = []; zone.rf = null; zone.lit = false;
  g.add(hook());
  // 木板：倒角 + 平滑法线，每块随机微旋 / 微高差 / 纹理偏移
  // v2：甲板扩到 24×23 米，盖住整个战斗圈（r11.6），玩家不再踩在水面上
  // v3：16 块合并成 1 个几何 + 1 个材质（UV 偏移烘进几何），省 15 次 draw call
  // 11-07 v2：甲板分东西两半（x = DOCK_SPLIT 断开）——戈尔顿 50%「断码头」时东半边塌进水里（raid_well.ts dockBreakTick）
  const east = new THREE.Group(); east.name = 'spin'; g.add(east); DOCK_EAST.obj = east;   // 'spin' = 本体 bakeStatic 不合批（要做塌落动画）
  for (const [x0, x1, host] of [[-12, DOCK_SPLIT, g], [DOCK_SPLIT, 12, east]] as const) {
    const plank = new RoundedBoxGeometry(x1 - x0, 0.22, 1.36, 2, 0.06), parts: THREE.BufferGeometry[] = [], po = new THREE.Object3D();
    for (let i = 0; i < 16; i++) {
      const pg = plank.clone(); po.position.set((x0 + x1) / 2 + (host === east ? ((i * 7) % 5 - 2) * 0.12 : 0), -0.09 + (i % 2) * 0.012, -10.9 + i * 1.45); po.rotation.set(0, (i % 3 - 1) * 0.012, (i % 4 - 1.5) * 0.002); po.updateMatrix(); pg.applyMatrix4(po.matrix);
      const uv = pg.getAttribute('uv') as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 4 * (x1 - x0) / 24 + i * 0.37 + x0 / 24, uv.getY(k) + i * 0.21);
      parts.push(pg);
    }
    const deck = new THREE.Mesh(mergeGeometries(parts), wetWood([1, 1])); deck.receiveShadow = true; deck.castShadow = true; host.add(deck);
    plank.dispose(); parts.forEach(x => x.dispose());
  }
  // 横梁 + 木桩（入水），桩脚 AO + 潮痕带
  const beamG = new RoundedBoxGeometry(0.4, 0.35, 23, 2, 0.08), wood = wetWood([1, 5]);
  for (const x of [-11.6, -5.8, 0, 5.8, 11.6]) { const b = new THREE.Mesh(beamG, wood); b.position.set(x, -0.38, 0); b.castShadow = true; (x > DOCK_SPLIT ? east : g).add(b); }
  const pileG = new THREE.CylinderGeometry(0.32, 0.38, 3.2, 20, 1), band = new THREE.MeshBasicMaterial({ map: tideBandTex(), transparent: true, depthWrite: false });
  const bandG = new THREE.CylinderGeometry(0.4, 0.42, 1.4, 20, 1, true);
  // v3：内圈桩（x ±5.8）桩头压到横梁下（顶 -0.25），不再从甲板中间冒出；外圈桩移到甲板外沿（±12.4）当护桩露出
  const pileWood = wetWood([1, 2]);
  for (const x of [-12.4, -5.8, 5.8, 12.4]) for (const z of [-11, 0, 11]) {
    const inner = Math.abs(x) < 6, y = inner ? -1.85 : -1.2;
    const p = new THREE.Mesh(pileG, pileWood); p.position.set(x, y, z); p.castShadow = !inner; (x > DOCK_SPLIT ? east : g).add(p);
    const bd = new THREE.Mesh(bandG, band); bd.position.set(x, -0.75, z); bd.renderOrder = 2; (x > DOCK_SPLIT ? east : g).add(bd);
  }
  // 系船柱：倒角石墩 + 圆铁帽（平滑法线）
  for (const [x, z] of [[-11.4, -10.6], [11.4, -10.6], [-11.4, 10.6], [11.4, 10.6]]) {
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.5, 0.9, 3, 0.12), wetStone()); base.position.set(x, 0.25, z); base.castShadow = base.receiveShadow = true; (x > DOCK_SPLIT ? east : g).add(base);
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.1, 24), new THREE.MeshStandardMaterial({ color: 0x3a2a22, metalness: 0.7, roughness: 0.45 })); bol.position.set(x, 1.05, z); bol.castShadow = true; (x > DOCK_SPLIT ? east : g).add(bol);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bol.material); cap.position.set(x, 1.6, z); (x > DOCK_SPLIT ? east : g).add(cap);
  }
  // 水面：中档 = 环境假反射（光滑 + IBL），高 / 极高 = 平面反射
  const W = 45;   // v3：竖井地形下码头四周是一圈水池（岩唇半径 22.5），水面改圆形，不再露出方形边
  // v2：平面反射要把整张图再画一遍，SwiftShader 实测拖垮帧耗时 → 只留极高档，且进区才开；其余档 = 黑水 + IBL 假反射
  if (q === 'ultra') {
    const rf = new Reflector(new THREE.CircleGeometry(W / 2, 64), { textureWidth: 512, textureHeight: 512, color: 0x3a4a50, clipBias: 0.003 });
    rf.rotation.x = -Math.PI / 2; rf.position.y = -0.62; rf.visible = false; g.add(rf); zone.rf = rf;
    const tint = new THREE.Mesh(new THREE.CircleGeometry(W / 2, 64), new THREE.MeshStandardMaterial({ color: 0x050d10, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.6, depthWrite: false })); tint.rotation.x = -Math.PI / 2; tint.position.y = -0.6; g.add(tint);
  } else {
    const nm = rippleNormal().clone(); nm.repeat.set(W / 4.5, W / 4.5); nm.needsUpdate = true;
    const wmM = new THREE.MeshStandardMaterial({ color: 0x050d10, roughness: 0.14, metalness: 0.5, envMapIntensity: 1.2, normalMap: nm, normalScale: new THREE.Vector2(0.4, 0.4) });
    const wm = new THREE.Mesh(new THREE.CircleGeometry(W / 2, 64), waterUp(wmM, { ql: true, cave: true, edge: 'radial', shallow: 0x1c3a3e, deep: 0x050d10, sky: 0x7a98a8, foamW: 0.12, caus: q === 'low' ? 0 : 0.2, depth: 4 })); wm.rotation.x = -Math.PI / 2; wm.position.y = -0.6; g.add(wm);
    wm.onBeforeRender = () => { const t = performance.now() / 1000; nm.offset.set(t * 0.012, -t * 0.02); }; waterBind(wm);   // 11-07 统一水体
  }
  // 鱼油灯：暖色点光（不投影），玻璃罩 + 火苗；和井口冷天光对比
  const lampGlass = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a40, emissiveIntensity: 2.4, roughness: 0.3 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.8, roughness: 0.4 });
  const nLit = q === 'ultra' ? 4 : q === 'low' ? 0 : 2;   // v2：点光按档（低档只留发光灯罩）
  [[-11.4, -3], [11.4, 3], [-11.4, 5.5], [11.4, -5.5]].forEach(([x, z], li) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 12), iron); post.position.set(x, 1.2, z); g.add(post);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.36, 16), lampGlass); gl.position.set(x, 2.45, z); g.add(gl);
    if (li < nLit) { const pl = new THREE.PointLight(0xff9c48, 6, 12, 1.7); pl.position.set(x, 2.5, z); pl.visible = false; g.add(pl); zone.lights.push(pl); }
  });
  // 井口冷天光：一束冷色聚光从上往下打（不投影，阴影交给主光 + AO）
  if (q === 'high' || q === 'ultra') { const sky = new THREE.SpotLight(0xa8dcf0, 40, 70, 0.5, 0.8, 1.4); sky.position.set(3, 40, -4); sky.target.position.set(0, 0, 0); sky.visible = false; g.add(sky, sky.target); zone.lights.push(sky); }
  // 散布：木箱 / 缆绳卷（实例化）、渔网
  const crates = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.06), tileMat('woodcrate', { color: 0xc8b8a4, roughness: 0.95, envMapIntensity: 0.6 }) ?? wetWood(), 7), o = new THREE.Object3D();
  [[6.5, -5.8, 0.9, 0.2], [7.4, -5.6, 0.7, 0.9], [6.9, -5.7, 0.6, 0.5, 0.75], [-7, 6, 0.8, 1.2], [-6.2, 6.3, 0.6, 0.4], [7.6, 5.6, 0.75, 2.1], [-7.4, -1.2, 0.55, 0.3]].forEach((c, i) => {
    const s = c[2], y = c[4] !== undefined ? c[4] + s / 2 + 0.03 : s / 2 + 0.03; o.position.set(c[0] * 1.3, y, c[1] * 1.3); o.rotation.set(0, c[3], 0); o.scale.setScalar(s); o.updateMatrix(); crates.setMatrixAt(i, o.matrix);
  });
  crates.castShadow = crates.receiveShadow = true; g.add(crates);
  const rope = new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.95 });
  const coils = new THREE.InstancedMesh(new THREE.TorusGeometry(0.42, 0.07, 8, 28), rope, 9);
  [[-5.5, 5.4], [5.2, -6], [-7.8, -6.2]].forEach(([x, z], k) => { for (let l = 0; l < 3; l++) { o.position.set(x * 1.3, 0.07 + l * 0.12, z * 1.3); o.rotation.set(-Math.PI / 2, 0, l * 0.7); o.scale.setScalar(1 - l * 0.12); o.updateMatrix(); coils.setMatrixAt(k * 3 + l, o.matrix); } });
  coils.castShadow = true; g.add(coils);
  // 系船缆：系船柱垂到水里（下垂曲线）
  for (const [x, z, dx] of [[-11.4, -10.6, -1], [11.4, 10.6, 1]]) {
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 1.4, z), new THREE.Vector3(x + dx * 1.6, 0.2, z + 0.4), new THREE.Vector3(x + dx * 3.6, -0.7, z + 1)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 24, 0.045, 6), rope));
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4, 8, 6), new THREE.MeshStandardMaterial({ map: netTex(), alphaTest: 0.4, transparent: true, side: THREE.DoubleSide, roughness: 0.9 }));
  const np = net.geometry.attributes.position as THREE.BufferAttribute; for (let k = 0; k < np.count; k++) np.setZ(k, Math.sin(np.getX(k) * 2.1) * 0.12 + Math.cos(np.getY(k) * 3) * 0.08); net.geometry.computeVertexNormals();
  net.rotation.x = -Math.PI / 2 + 0.06; net.position.set(6.2, 0.08, 8.2); g.add(net);
  // 分层高度雾：低层贴水浓、上层淡，噪声流动（低画质只留一层）
  // v2：雾片收成圆形软边（alphaMap 径向渐隐）、压低不透明度与亮度，只贴水面和脚踝高度，不再把整场盖白
  const layers = q === 'low' ? [[0.08, 0.12]] : [[0.06, 0.18], [0.7, 0.07]], soft = radialTex();
  for (const [y, a] of layers) {
    const t = fogTex(); t.repeat.set(2, 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: t, alphaMap: soft, color: 0x5d7c85, transparent: true, opacity: a, depthWrite: false, fog: true }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 3; g.add(m); zone.fogs.push(m);
  }
  return g;
}
