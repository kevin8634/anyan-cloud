// raidA 11-01 戈尔顿脸部 v4：替换已绑骨 GLB 的脸部贴图 / 加脸部细节法线 / 金属粗糙度降分辨率
// node tools/rigfine/facehd/retex.mjs <in.glb> <out.glb> <脸底色.png> [脸法线.png] [MR边长=512] [法线强度=1]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, statSync } from 'fs';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out, baseP, nrmP, mrS = '512', nS = '1'] = process.argv.slice(2);
const doc = await io.read(inp);
const mats = doc.getRoot().listMaterials(); const face = mats.find(m => /Face/.test(m.getName()));
const webp = async (p, q, lossless = false) => sharp(readFileSync(p)).webp({ quality: q, lossless, effort: 6 }).toBuffer();
face.getBaseColorTexture().setImage(await webp(baseP, 92)).setMimeType('image/webp');
if (nrmP) {
  const t = doc.createTexture('T_GordonFace_N').setImage(await webp(nrmP, 95)).setMimeType('image/webp');
  face.setNormalTexture(t); face.getNormalTextureInfo().setTexCoord(0); face.setNormalScale(+nS);
}
const done = new Set();
for (const m of mats) { const t = m.getMetallicRoughnessTexture(); if (!t || done.has(t)) continue; done.add(t);
  const img = await sharp(t.getImage()).resize(+mrS, +mrS).webp({ quality: 90 }).toBuffer(); t.setImage(img).setMimeType('image/webp'); }
await io.write(out, doc);
for (const t of doc.getRoot().listTextures()) console.log(t.getName() || '-', t.getSize()?.join('x'), (t.getImage().length / 1024 | 0) + ' KB');
console.log('✓', out, (statSync(out).size / 1024 | 0) + ' KB');
