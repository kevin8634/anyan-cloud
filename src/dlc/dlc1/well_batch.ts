// ======================================================================
// 11-18 Rhett「钟井帧数太低」：路灯整组实例化（RPG 场景搭建专长包第 10 章「合批」，自写）
//   一路五十来盏灯柱，每盏 = 木杆 / 横臂 / 斜撑 / 灯笼 GLB 若干网格 / 发光芯 / 地面光池，约 7–10 次绘制，杆子还投影 → 阴影 pass 再翻一倍，
//   整条路 400–800 次绘制，远超中档预算 250。灯柱全是同一模板 → 按「同一模板里的第几个网格」做 InstancedMesh，每种只画 1 次。
//   只合「普通 Mesh」：光晕 Sprite、点光 / 虚拟灯锚点原样留在各自灯柱里。材质沿用第一盏的（同模板材质相同）。
//   ?off=wellbatch 回旧
// ======================================================================
import * as THREE from 'three';

const OFF = (() => { try { return /(?:[?&]off=[^&]*\bwellbatch\b)/.test(location.search); } catch { return false; } })();
export const wellBatchStats = { groups: 0, before: 0, after: 0 };

const meshesOf = (g: THREE.Object3D) => { const out: THREE.Mesh[] = []; g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh) out.push(m); }); return out; };
const sig = (m: THREE.Mesh) => { const mm = m.material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; map?: THREE.Texture | null };
  return [m.geometry.attributes.position?.count ?? 0, m.geometry.index?.count ?? 0, mm.type, mm.color?.getHexString() ?? '', mm.emissive?.getHexString() ?? '', mm.map?.uuid ?? '', mm.transparent, mm.blending].join('|'); };

/** groups：已经放进场景、模板相同的若干组（灯柱）。add：把新 InstancedMesh 放进区域根节点（世界坐标）。返回是否合成 */
export function instanceClones(groups: THREE.Object3D[], add: (o: THREE.Object3D) => void): boolean {
  if (OFF || groups.length < 2) return false;
  // 只合结构相同的组（以第一组的网格签名序列为模板；不一样的组原样保留）
  const tpl = meshesOf(groups[0]), key = tpl.map(sig).join('#');
  const same = groups.filter(g => meshesOf(g).map(sig).join('#') === key);
  if (same.length < 2 || !tpl.length) return false;
  const holder = new THREE.Group(); holder.name = 'well_batch'; add(holder); holder.updateWorldMatrix(true, false);
  const inv = holder.matrixWorld.clone().invert();
  for (const g of same) g.updateWorldMatrix(true, true);
  const lists = same.map(meshesOf);
  for (let i = 0; i < tpl.length; i++) {
    const m0 = tpl[i], im = new THREE.InstancedMesh(m0.geometry, m0.material, same.length);
    lists.forEach((L, j) => im.setMatrixAt(j, new THREE.Matrix4().multiplyMatrices(inv, L[i].matrixWorld)));
    im.castShadow = m0.castShadow; im.receiveShadow = m0.receiveShadow; im.renderOrder = m0.renderOrder; im.frustumCulled = false;
    im.instanceMatrix.needsUpdate = true; holder.add(im);
  }
  for (const L of lists) for (const m of L) m.parent?.remove(m);
  wellBatchStats.groups += same.length; wellBatchStats.before += same.length * tpl.length; wellBatchStats.after += tpl.length;
  return true;
}
