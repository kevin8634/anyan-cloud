// 11-07 BUG#3 相机防穿透（对所有区域生效：野外、内容包、副本、营地室内）
// 做法：从角色胸口朝相机打 3 条平行射线（中 + 左右各 0.35 米，近似球形扫掠），命中不透明的场景静态件就把镜头距离压到「命中距离 − 0.35 米」（下限 1.6 米）。
// 挡住时立刻收到位（不在墙里停留一帧），让开后慢慢退回（2.5/秒），避免抖。候选物每 0.5 秒重筛一次：30 米内、不透明、包围球半径 ≥ 0.6 米的网格；
// 角色 / 怪 / NPC（蒙皮或在单位根节点下）、粒子、线、精灵、透明 / 不写深度的特效、贴花、userData.noCamBlock 的物体都不算。
import * as THREE from 'three';

const RC = new THREE.Raycaster();
let cands: THREE.Object3D[] = [], lastScan = -1, curD = -1, frame = 0, lastLim = Infinity;
const _s = new THREE.Sphere(), _side = new THREE.Vector3(), _o = new THREE.Vector3(), _dir = new THREE.Vector3();
export const camCollideState = { on: true, hit: 0, cands: 0, d: 0, ms: 0, tris: 0, heavy: 0 };
// C19 Rhett 11-19「第一人称帧数很好，第三人称卡」：第一人称不走本文件。第三人称每帧 3 条射线对候选网格逐三角查，C18 合批后单网格变大（碎石 / 后挂件按格合成几万三角）→ CPU 每帧几十毫秒。
// 改：候选单网格三角上限 60000 → 12000、候选总三角上限 150000（近的先收）；单网格一次查超 1.5 ms 记黑名单下次不收；全部射线每 3 帧查一次（中间帧沿用）。?off=camcheap 回旧
const CHEAP = (() => { try { return !/(?:[?&]off=[^&]*\bcamcheap\b)/.test(location.search); } catch { return true; } })();
const MESH_TRI_MAX = CHEAP ? 12000 : 60000, TOTAL_TRI_MAX = CHEAP ? 150000 : Infinity, EVERY = CHEAP ? 3 : 2;
const heavy = new WeakSet<THREE.Object3D>();
let _msAcc = 0, _msN = 0;

function solidMat(m: THREE.Material | THREE.Material[]): boolean {
  const a = Array.isArray(m) ? m : [m];
  return a.some(x => x && x.visible !== false && !(x.transparent && x.opacity < 0.95) && x.depthWrite !== false && x.blending === THREE.NormalBlending);
}

function scan(scene: THREE.Scene, at: THREE.Vector3, skip: Set<THREE.Object3D>) {
  const out: { m: THREE.Object3D; d: number; t: number }[] = [];
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || skip.has(o) || o.userData.noCamBlock || (CHEAP && heavy.has(o))) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && m.geometry && solidMat(m.material)) {
      const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      if (g.boundingSphere) {
        if ((m as THREE.InstancedMesh).isInstancedMesh) { if (!CHEAP || !(m as THREE.InstancedMesh).boundingSphere) (m as THREE.InstancedMesh).computeBoundingSphere?.(); const bs = (m as THREE.InstancedMesh).boundingSphere; if (bs) _s.copy(bs); else _s.copy(g.boundingSphere); }
        else _s.copy(g.boundingSphere);
        _s.applyMatrix4(m.matrixWorld);
        const tris = (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
        const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
        const dd = _s.center.distanceTo(at) - _s.radius;
        if (_s.radius >= 0.6 && tris <= MESH_TRI_MAX && dd < 30) out.push({ m, d: dd, t: tris * inst });   // 超大网格（地形）不逐三角查，手机扛不住
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(scene);
  out.sort((a, b) => a.d - b.d);
  let sum = 0; cands = [];
  for (const c of out) { if (sum + c.t > TOTAL_TRI_MAX && cands.length) break; sum += c.t; cands.push(c.m); }
  camCollideState.tris = sum;
}

/**
 * 每帧调用：tgt = 角色胸口（镜头注视点），want = 期望距离，dirOut = 从注视点指向相机的单位向量。返回实际距离。
 * skipRoots：角色 / 怪 / NPC 的根节点（整棵子树不参与遮挡）
 */
export function camCollide(scene: THREE.Scene, tgt: THREE.Vector3, dirOut: THREE.Vector3, want: number, dt: number, now: number, skipRoots: THREE.Object3D[]): number {
  if (!camCollideState.on || want <= 1.6) { curD = want; return want; }
  if (now - lastScan > (CHEAP ? 1 : 0.5) || lastScan < 0) { lastScan = now; scan(scene, tgt, new Set(skipRoots)); camCollideState.cands = cands.length; }
  let lim = want; const odd = (frame++ % EVERY) !== 0;
  if (odd && lastLim !== Infinity) lim = Math.min(want, lastLim);   // 隔帧查一次，中间帧沿用（无遮挡时每帧查，免得一帧穿墙）
  else if (cands.length) {
    _side.set(-dirOut.z, 0, dirOut.x); if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0); _side.normalize();
    RC.far = want + 0.4; _dir.copy(dirOut);
    for (const k of [0, -0.35, 0.35]) {
      _o.copy(tgt).addScaledVector(_side, k); RC.set(_o, _dir); RC.far = want + 0.4;
      const t0 = performance.now();
      if (CHEAP) {
        for (const c of cands) {
          const a = performance.now(); const h = RC.intersectObject(c, false);
          if (performance.now() - a > 1.5) { heavy.add(c); camCollideState.heavy++; }
          for (const x of h) { if (x.distance < 0.25) continue; lim = Math.min(lim, x.distance - 0.35); break; }
        }
      } else {
        const h = RC.intersectObjects(cands, false);
        for (const x of h) { if (x.distance < 0.25) continue; lim = Math.min(lim, x.distance - 0.35); break; }
      }
      _msAcc += performance.now() - t0;
    }
    _msN++; if (_msN >= 60) { camCollideState.ms = _msAcc / _msN; _msAcc = 0; _msN = 0; }
  }
  lim = Math.max(1.6, Math.min(want, lim)); if (!odd || lastLim === Infinity) lastLim = lim < want ? lim : Infinity;
  camCollideState.hit = lim < want - 0.01 ? 1 : 0;
  if (curD < 0) curD = want;
  // 挡住：直接收到位（不在墙里停留）；让开：慢慢退回
  if (lim < curD) curD = lim; else curD += (lim - curD) * Math.min(1, dt * 2.5);
  if (curD > want) curD = want;
  camCollideState.d = curD;
  return curD;
}
/** 换地图 / 传送时清缓存，镜头直接到位 */
export function camCollideReset() { lastScan = -1; curD = -1; cands = []; lastLim = Infinity; }
// 自测：控制台 __camCollide.on = false 关掉对比；.hit / .cands / .d 看状态
(globalThis as unknown as { __camCollide?: typeof camCollideState }).__camCollide = camCollideState;
