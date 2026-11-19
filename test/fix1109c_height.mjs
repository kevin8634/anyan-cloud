// fix1109c #2：六职业（含 40 级整身件）Lux3D 模型实测身高 —— 复刻游戏里的缩放链（rig.ts calibrateHd + chars.ts makeCharacter）：
//   骨骼包围盒高 h0（静止姿势，×1.08 到头顶）→ 缩放 = 职业 height × BODY_SCALE(1.1) / h0；
//   显示身高 = 蒙皮后（绑定姿势）网格顶点包围盒高 × 缩放。NPC 身高按玩家「蒙皮网格包围盒高」比例（npc_c.ts runFit）。
// 用法：node test/fix1109c_height.mjs [height 覆盖 JSON]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const DIR = 'assets_aholo/models_hd/';
// 职业 → [模型, 代码里的 height]（models.ts / hunter.ts / coffin.ts；40 级件沿用本职业 height）
const H = JSON.parse(process.argv[2] || 'null') ?? {
  LUX_Warrior: 2.1, LUX_Warrior40: 2.1, LUX_Mage: 2.0, LUX_Mage40Robe: 2.0, LUX_Chrono: 2.0, LUX_Chrono40: 2.0,
  LUX_Alchemy: 2.0, LUX_Alchemy40: 2.0, LUX_Hunter: 2.05, LUX_Hunter40: 2.05, LUX_Coffin: 2.1, LUX_Coffin40: 2.1,
};
const world = new Map();
const wm = n => { if (world.has(n)) return world.get(n); const m = new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
  const p = n.getParentNode(); if (p) m.premultiply(wm(p)); world.set(n, m); return m; };
const rows = [];
for (const [name, hgt] of Object.entries(H)) {
  world.clear();
  const doc = await io.read(DIR + name + '.glb'); const root = doc.getRoot();
  const joints = new Set(); for (const s of root.listSkins()) for (const j of s.listJoints()) joints.add(j);
  let bl = 1e9, bh = -1e9; for (const j of joints) { const y = new THREE.Vector3().setFromMatrixPosition(wm(j)).y; bl = Math.min(bl, y); bh = Math.max(bh, y); }
  const headJ = [...joints].find(j => /^head$/i.test(j.getName())); const headY = headJ ? new THREE.Vector3().setFromMatrixPosition(wm(headJ)).y : NaN;
  let ml = 1e9, mh = -1e9, fl = 1e9, fh = -1e9; const v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3(), M = new THREE.Matrix4();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const skin = node.getSkin();
    const mats = skin ? skin.listJoints().map((j, i) => { const ibm = skin.getInverseBindMatrices(); const a = []; ibm.getElement(i, a); return wm(j).clone().multiply(new THREE.Matrix4().fromArray(a)); }) : null;
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'); const e = [], je = [], we = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, e); v.fromArray(e);
        if (mats && J && W) { J.getElement(i, je); W.getElement(i, we); acc.set(0, 0, 0); for (let k = 0; k < 4; k++) if (we[k]) acc.addScaledVector(t.copy(v).applyMatrix4(mats[je[k]]), we[k]); }
        else acc.copy(v).applyMatrix4(wm(node));
        ml = Math.min(ml, acc.y); mh = Math.max(mh, acc.y);
        t.copy(v).applyMatrix4(wm(node)); fl = Math.min(fl, t.y); fh = Math.max(fh, t.y);   // npc_c.ts runFit 量法：geometry.boundingBox × matrixWorld（不蒙皮）
      }
    }
  }
  const boneH = bh - bl, h0 = boneH * 1.08, k = hgt * 1.1 / h0, meshH = mh - ml;
  rows.push({ model: name, height: hgt, boneH: +boneH.toFixed(3), meshH: +meshH.toFixed(3), 'mesh/bone': +(meshH / boneH).toFixed(3), display: +(meshH * k).toFixed(3), headBone: +((headY - bl) * k).toFixed(3), fitMeasure: +((fh - fl) * k).toFixed(3) });
}
console.table(rows);
console.log(JSON.stringify(rows));
