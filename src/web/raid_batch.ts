// opt1118A 副本碎石合批（RPG 场景搭建专长包 v0.9.2 第 10 章「合批」；代码自写）。
// 原来：raid.ts 的走廊两侧 / 首领场地外圈碎石每块一个 Mesh（熔心王座≈400、永霜墓穴≈250、三座普通副本各≈90），
//   每块一次绘制，开阴影再多一次；整座副本从没进 bakeStatic。
// 现在：只收 raid.ts 用 raidRock() 建、userData.raidRock 标过的碎石（静态、不透明、普通 Toon 材质，建好后从不移动 / 隐藏），
//   按「材质外观签名（类型 / 贴图 / 着色器缓存键 / 透明 / 面向 / 描边）+ 顶点属性集合 + 投 / 收阴影 + 所在 60 m 格」分桶，每桶 ≥ 2 块才合；
//   颜色不进签名，写进顶点色（材质色改白、开 vertexColors）；原有顶点属性全部带上（第 10 章第 1 轮的坑：丢顶点色石头发黑）。
//   合并后的材质直接复用桶里第一块的材质对象（它的着色器钩子 = 三平面贴图 + refineChar 都是闭包，clone 会丢）。
//   按 60 m 格分桶 → 合并网格仍能被视锥剔除 / 阴影相机剔除。三平面贴图和 refineChar(world) 本来就按世界坐标采样，副本组在原点不变换，合前合后外观一致。
// ?off=raidrockbatch 回每块一个 Mesh。
import * as THREE from 'three';

export const RAID_ROCK_BATCH_OFF = (() => { try { return /(?:[?&]off=[^&]*\braidrockbatch\b)/.test(location.search); } catch { return false; } })();

const CELL = 60;

export function batchRaidRocks(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.MeshToonMaterial; list: THREE.Mesh[]; names: { n: string; k: number }[]; cast: boolean; recv: boolean }>();
  let before = 0;
  const tmp = new THREE.Vector3();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.raidRock === undefined) return;
    const mat = m.material as THREE.MeshToonMaterial;
    if (Array.isArray(mat) || mat.transparent || !m.visible || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    before++;
    const g = m.geometry;
    const names = Object.keys(g.attributes).filter(n => n !== 'color').sort().map(n => ({ n, k: g.attributes[n].itemSize }));
    m.getWorldPosition(tmp);
    const cell = `${Math.floor(tmp.x / CELL)},${Math.floor(tmp.z / CELL)}`;
    const ol = (mat.userData.outlineParameters as { visible?: boolean } | undefined)?.visible === false ? 'no' : 'ol';
    const key = [mat.type, mat.map?.uuid ?? '', mat.customProgramCacheKey(), mat.side, ol, names.map(q => q.n + q.k).join(','), m.castShadow, m.receiveShadow, cell].join('|');
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { mat, list: [], names, cast: m.castShadow, recv: m.receiveShadow });
    b.list.push(m);
  });
  let after = before;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), M4 = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    let nv = 0, ni = 0;
    for (const o of b.list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const A: Record<string, Float32Array> = {};
    for (const q of b.names) A[q.n] = new Float32Array(nv * q.k);
    const col = new Float32Array(nv * 3);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const o of b.list) {
      const g = o.geometry, c = g.attributes.position.count;
      M4.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(M4);
      const mc = (o.material as THREE.MeshToonMaterial).color ?? new THREE.Color(1, 1, 1);
      const vc = g.getAttribute('color') as THREE.BufferAttribute | undefined;
      for (let i = 0; i < c; i++) {
        for (const q of b.names) {
          const S = g.attributes[q.n] as THREE.BufferAttribute, off = (vo + i) * q.k;
          if (q.n === 'position') { v.fromBufferAttribute(S, i).applyMatrix4(M4); A.position[off] = v.x; A.position[off + 1] = v.y; A.position[off + 2] = v.z; }
          else if (q.n === 'normal') { v.fromBufferAttribute(S, i).applyMatrix3(nm).normalize(); A.normal[off] = v.x; A.normal[off + 1] = v.y; A.normal[off + 2] = v.z; }
          else for (let e = 0; e < q.k; e++) A[q.n][off + e] = S.getComponent(i, e);
        }
        // 材质色 × 原顶点色（若有）→ 顶点色
        const r = vc ? vc.getX(i) : 1, gg = vc ? vc.getY(i) : 1, bb = vc ? vc.getZ(i) : 1;
        col[(vo + i) * 3] = mc.r * r; col[(vo + i) * 3 + 1] = mc.g * gg; col[(vo + i) * 3 + 2] = mc.b * bb;
      }
      if (g.index) for (let j = 0; j < g.index.count; j++) idx[io + j] = g.index.getX(j) + vo;
      else for (let j = 0; j < c; j++) idx[io + j] = vo + j;
      io += g.index ? g.index.count : c; vo += c;
    }
    const G2 = new THREE.BufferGeometry();
    for (const q of b.names) G2.setAttribute(q.n, new THREE.BufferAttribute(A[q.n], q.k));
    G2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    G2.setIndex(new THREE.BufferAttribute(idx, 1)); G2.computeBoundingSphere(); G2.computeBoundingBox();
    const mat = b.mat; mat.color.setRGB(1, 1, 1); mat.vertexColors = true; mat.needsUpdate = true;
    const mesh = new THREE.Mesh(G2, mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.name = 'raidRockBatch'; mesh.userData.batch = b.list.length;
    for (const o of b.list) { o.parent?.remove(o); if (o.material !== mat) (o.material as THREE.Material).dispose(); o.geometry.dispose(); }
    root.add(mesh);
    after -= b.list.length - 1;
  }
  return { before, after };
}
