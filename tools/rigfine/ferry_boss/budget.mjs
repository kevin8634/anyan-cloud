// raidA A8（11-02）摆渡双子首领件压到首领预算再进构建（0 积分）
// node tools/rigfine/ferry_boss/budget.mjs <in.glb> <out.glb>
// 首领预算（01_交接/首领面数预算.md）：本体 30k–50k 面 + 2048 贴图。质量硬标准：近看不能明显糊 →
//   保留 2 张 2048：身体底色、脸部底色（脸 = 戈尔顿 v4 标准的独立 2048 脸）；
//   法线（身体 / 脸 / 下摆）降 1024（webp q92，细节法线 K=0.6 本身是低频起伏，1024 在 4 米首领上近景看不出差别，见对照图）；
//   自发光 1024（Rhett 11-03 18:06 第 8 条：法线 / 自发光 1024、底色 2048）；金属粗糙度 1024 → 512（低频遮罩）；提灯（2960 三角的小件）底色 / 自发光 512、粗糙度 256。
//   几何：meshopt 量化（位置 14 位 / 法线 10 位 / UV 12 位，蒙皮权重 8 位）+ EXT_meshopt_compression。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp), root = doc.getRoot();
const SLOT = [['base', 'getBaseColorTexture'], ['nrm', 'getNormalTexture'], ['emi', 'getEmissiveTexture'], ['mr', 'getMetallicRoughnessTexture']];
/** 每张贴图的目标边长 / 质量（按用到它的材质槽决定，取最大需求） */
function target(slots) {
  let size = 0, q = 90;
  for (const s of slots) {
    const [mat, k] = s.split(':'); const lantern = /Lantern/.test(mat);
    let z;
    if (lantern) z = k === 'mr' ? 256 : 512;
    else if (k === 'base' && /Body|Face/.test(mat)) { z = 2048; q = 92; }
    else if (k === 'nrm') { z = 1024; q = Math.max(q, 92); }
    else if (k === 'emi') z = 1024;   // Rhett 11-03 18:06 待批第 8 条：法线 / 自发光 1024、底色 2048
    else if (k === 'mr') z = 512;
    else z = 1024;
    size = Math.max(size, z);
  }
  return { size, q };
}
let before = 0, after = 0;
for (const t of root.listTextures()) {
  const slots = []; for (const m of root.listMaterials()) for (const [k, f] of SLOT) if (m[f]() === t) slots.push(m.getName() + ':' + k);
  const img = Buffer.from(t.getImage()), md = await sharp(img).metadata(), { size, q } = target(slots);
  const z = Math.min(md.width, size);
  const nb = z === md.width && /base/.test(slots.join()) && z === 2048 ? img : await sharp(img).resize(z, z, { kernel: 'lanczos3' }).webp({ quality: q, effort: 6, ...(md.hasAlpha ? { alphaQuality: 92 } : {}) }).toBuffer();
  const use = nb.length < img.length || z < md.width ? nb : img;
  before += img.length; after += use.length; t.setImage(use).setMimeType('image/webp');
  console.log(`${slots.join(',')}  ${md.width} → ${z}  ${(img.length / 1024).toFixed(0)} → ${(use.length / 1024).toFixed(0)} KB`);
}
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
let tri = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tri += (p.getIndices()?.getCount() ?? 0) / 3;
console.log(`贴图 ${(before / 1024).toFixed(0)} → ${(after / 1024).toFixed(0)} KB；三角 ${tri}；文件 ${(statSync(inp).size / 1024).toFixed(0)} → ${(statSync(out).size / 1024).toFixed(0)} KB`);
