// raidA 11-02 维尔格 / 萨琳动作自检（不开浏览器）：按 clips 约定（骨局部四元数 = 绑定 × 欧拉偏移）做正向运动学，打印关节世界坐标（身高归一，脚底 = 0）
// node tools/rigfine/virg_boss/fk.mjs <glb> '<pose JSON>' [骨1,骨2…]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
await MeshoptDecoder.ready;
export async function rigOf(path) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path); const root = doc.getRoot(); const O = {}; const Q0 = {}; const P0 = {};
  const mk = n => { const o = new THREE.Object3D(); o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); const k = n.getName().replace(/^mixamorig:?/, ''); O[k] = o; Q0[k] = o.quaternion.clone(); P0[k] = o.position.clone(); for (const c of n.listChildren()) o.add(mk(c)); return o; };
  const scn = new THREE.Object3D(); for (const n of root.listScenes()[0].listChildren()) scn.add(mk(n)); scn.updateMatrixWorld(true);
  const W = k => new THREE.Vector3().setFromMatrixPosition(O[k].matrixWorld);
  const foot = Math.min(W('LeftFoot').y, W('RightFoot').y), H = W('Head').y - foot;
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  const pose = p => { for (const k in O) { O[k].quaternion.copy(Q0[k]); O[k].position.copy(P0[k]); } for (const [k, v] of Object.entries(p)) if (O[k] && k[0] !== '_') { e.set(...v); q.setFromEuler(e); O[k].quaternion.multiply(q); } scn.updateMatrixWorld(true); };
  const at = k => { const v = W(k); return [(v.x) / H, (v.y - foot) / H, v.z / H]; };
  return { O, Q0, P0, H, foot, pose, at, scn };
}
if (process.argv[1].endsWith('fk.mjs') && process.argv[2]) {
  const r = await rigOf(process.argv[2]); r.pose(JSON.parse(process.argv[3] || '{}'));
  for (const k of (process.argv[4] || 'Head,LeftHand,RightHand,LeftForeArm,RightForeArm,LeftFoot,RightFoot').split(',')) console.log(k.padEnd(14), r.at(k).map(x => x.toFixed(3)).join(' '));
}
