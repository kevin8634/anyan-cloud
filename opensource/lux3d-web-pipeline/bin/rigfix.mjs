// v1.2.23 Lux3D 绑骨结果 → 游戏写实模型：mixamorig 骨名改成 UBC（UE）骨名，这样直接复用 UBC_Male 的动作表 / 重定向 / 挂点；
// 再把贴图转 webp 1024 + meshopt 压缩，材质统一命名 MI_Lux（rig.ts HD_MATS 用）。
// 用法：node bin/rigfix.mjs rigged.glb assets/chars/hero.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, meshopt, textureCompress, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier as Simp13 } from 'meshoptimizer-next';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'fs';
const [src, out] = process.argv.slice(2);
// UE → mixamo（与 src/web/rig.ts mixamoBoneMap 一致），这里反过来用
const ue2mx = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head' };
for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) {
  Object.assign(ue2mx, { [`clavicle_${s}`]: `${S}Shoulder`, [`upperarm_${s}`]: `${S}Arm`, [`lowerarm_${s}`]: `${S}ForeArm`, [`hand_${s}`]: `${S}Hand`,
    [`thigh_${s}`]: `${S}UpLeg`, [`calf_${s}`]: `${S}Leg`, [`foot_${s}`]: `${S}Foot`, [`ball_${s}`]: `${S}ToeBase` });
  for (const [f, F] of [['index', 'Index'], ['middle', 'Middle'], ['pinky', 'Pinky'], ['ring', 'Ring'], ['thumb', 'Thumb']]) for (const i of [1, 2, 3]) ue2mx[`${f}_0${i}_${s}`] = `${S}Hand${F}${i}`;
}
const mx2ue = Object.fromEntries(Object.entries(ue2mx).map(([u, m]) => [m, u]));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
let n = 0, miss = [];
for (const node of doc.getRoot().listNodes()) {
  const m = node.getName().match(/^mixamorig:?(.+)$/); if (!m) continue;
  if (mx2ue[m[1]]) { node.setName(mx2ue[m[1]]); n++; } else miss.push(m[1]);
}
// Lux3D 模型以包围盒中心为原点（脚底 y=-1）：抬骨架根节点让脚底落在 y=0（蒙皮网格跟骨骼走），否则进游戏半身埋进地里
{ const p = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION'); let lo = Infinity; const v = [];
  for (let i = 0; i < p.getCount(); i++) { p.getElement(i, v); lo = Math.min(lo, v[1]); }
  const arm = doc.getRoot().listScenes()[0].listChildren().find(nd => !nd.getMesh() && nd.listChildren().some(c => c.getName() === 'pelvis'));
  if (arm && lo < -1e-3) { const t = arm.getTranslation(); arm.setTranslation([t[0], t[1] - lo, t[2]]); console.log(`骨架根节点上移 ${(-lo).toFixed(3)}`); } }
doc.getRoot().listMaterials().forEach((mt, i) => mt.setName(i ? `MI_Lux${i}` : 'MI_Lux'));
// v1.2.25 绑骨输入用的是 Lux3D 原始高模（10 万面，上传绑骨输入件经常超时）：这里减到约 1.5 万面（蒙皮权重按顶点属性一起保留）
{ let tri = 0; for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) tri += (pr.getIndices()?.getCount() ?? 0) / 3;
  // v1.2.26：不再用 Permissive（它会跨 UV 接缝塌边 → 贴图拉丝、白色碎纹），目标面数提到 3 万（LUX_TRI 可调）
  const TGT = +(process.env.LUX_TRI || 30000);
  if (tri > TGT * 1.3) { await Simp13.ready;
    await doc.transform(weld(), simplify({ simplifier: Simp13, ratio: TGT / tri, error: 0.005 })); console.log(`减面 ${tri} → 目标 ${TGT}`); } }
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+(process.env.LUX_TEX || 2048), +(process.env.LUX_TEX || 2048)], quality: 90 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log(`改名 ${n} 根骨${miss.length ? '，未映射：' + miss.join(',') : ''}；${(statSync(src).size / 1024).toFixed(0)}→${(statSync(out).size / 1024).toFixed(0)} KB → ${out}`);
