// ======================================================================
// 11-18 Rhett「钟井帧数太低」：钟井点光源池（RPG 场景搭建专长包 v0.9.2 第 10 章「光源池」，自写）
//   原来：路灯每 5 盏一盏实时点光（最多 10）+ 每段石阶一盏（最多 8）= 最多 18 盏点光常驻，forward 渲染下每个像素都要逐盏算；
//         而且路灯是 GLB 解析好后按秒补放的 → 每补一盏点光，全场景材质的灯数变了，着色器整批重编译（进井前几十秒一卡一卡）。
//   现在：这些灯只登记成「虚拟灯」（位置 / 颜色 / 亮度 / 距离），场景里只放固定 N 盏真点光（中档 4、高档 6，开局一次放好，灯数不再变 → 不重编译）。
//         每 0.25 秒按「(照亮半径 / 到相机距离，封顶 1)² × √亮度，不在视锥 ×0.01」挑分数最高的 N 盏，真点光移过去，按 4/秒淡入淡出。
//   ?off=welllpool 回旧（每盏灯都是真点光）
// ======================================================================
import * as THREE from 'three';

const OFF = (() => { try { return /(?:[?&]off=[^&]*\bwelllpool\b)/.test(location.search); } catch { return false; } })();
type V = { a: THREE.Object3D; col: THREE.Color; I: number; dist: number; decay: number; w: THREE.Vector3; ok: boolean };
const VS: V[] = [];
type Slot = { L: THREE.PointLight; v: V | null; next: V | null; k: number };
let slots: Slot[] = [], holder: THREE.Group | null = null, acc = 1;
export const lightPoolStats = { virt: 0, real: 0, picks: 0 };
export const lightPoolOn = () => !OFF;

/** 代替 parent.add(pointLight)：登记一盏虚拟灯（位置跟 parent 走）。返回 false = 池子关着，调用方照旧 add 真灯 */
export function poolLight(parent: THREE.Object3D, L: THREE.PointLight): boolean {
  if (OFF) return false;
  const a = new THREE.Object3D(); a.position.copy(L.position); a.userData.poolAnchor = true; parent.add(a);
  VS.push({ a, col: L.color.clone(), I: L.intensity, dist: L.distance || 16, decay: L.decay, w: new THREE.Vector3(), ok: false });
  lightPoolStats.virt = VS.length; return true;
}

const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
function pick(cam: THREE.Camera) {
  pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
  const cp = cam.getWorldPosition(new THREE.Vector3());
  const sc: [number, V][] = [];
  for (const v of VS) {
    if (!v.a.parent) continue;   // 灯被移出场景（换图）
    if (!v.ok) { v.a.updateWorldMatrix(true, false); v.w.setFromMatrixPosition(v.a.matrixWorld); v.ok = true; }
    const d = Math.max(0.5, v.w.distanceTo(cp)), r = Math.min(1, v.dist / d);
    let s = r * r * Math.sqrt(v.I);
    if (!fr.intersectsSphere(sph.set(v.w, v.dist))) s *= 0.01;
    sc.push([s, v]);
  }
  sc.sort((x, y) => y[0] - x[0]);
  const want = new Set(sc.slice(0, slots.length).map(x => x[1]));
  // 已在池里且仍被选中的不动（不闪）；其余槽位换成新选中的
  for (const s of slots) if (s.v && want.has(s.v)) { want.delete(s.v); s.next = s.v; } else s.next = null;
  for (const s of slots) if (!s.next) { const v = want.values().next().value as V | undefined; if (v) { want.delete(v); s.next = v; lightPoolStats.picks++; } }
}

/** 建图末尾调用一次：放 N 盏真点光 + 一个每帧驱动的空网格（拿相机）。add = 把对象放进本区域根节点（世界坐标） */
export function lightPoolInstall(add: (o: THREE.Object3D) => void, n: number) {
  if (OFF || n <= 0) return;
  holder = new THREE.Group(); holder.name = 'well_lightpool';
  slots = [];
  for (let i = 0; i < n; i++) { const L = new THREE.PointLight(0xffffff, 0, 16, 1.4); L.castShadow = false; holder.add(L); slots.push({ L, v: null, next: null, k: 0 }); }
  // 驱动：1 个三角形、不写颜色不写深度、不剔除 → 每帧都会走 onBeforeRender，拿到当前相机
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, -9999, 0, 0.001, -9999, 0, 0, -9999, 0.001], 3));
  const drv = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  drv.frustumCulled = false; drv.renderOrder = -999; (drv.material as THREE.Material).userData.outlineParameters = { visible: false };
  let last = performance.now();
  drv.onBeforeRender = (_r, _s, cam) => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt; if (acc >= 0.25) { acc = 0; pick(cam); }
    for (const s of slots) {
      if (s.next !== s.v) { s.k = Math.max(0, s.k - dt * 4); if (s.k <= 0) { s.v = s.next; if (s.v) { s.L.color.copy(s.v.col); s.L.distance = s.v.dist; s.L.decay = s.v.decay; s.L.position.copy(s.v.w); holder!.worldToLocal(s.L.position); } } }
      else if (s.v) s.k = Math.min(1, s.k + dt * 4);
      s.L.intensity = s.v ? s.v.I * s.k : 0;
    }
  };
  holder.add(drv);
  add(holder);
  lightPoolStats.real = n;
}
/** 换图 / 重建时清空 */
export function lightPoolReset() { VS.length = 0; slots = []; holder = null; acc = 1; Object.assign(lightPoolStats, { virt: 0, real: 0, picks: 0 }); }
