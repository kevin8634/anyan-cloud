// v1.2.4：写实模型瘦身（进离线 HTML 前）：游戏只用底色贴图（MeshToon），去掉法线 / ORM / 粗糙度贴图，底色转 JPEG（无透明的），原地覆盖
// 用法：node tools/slim-hd.mjs UBC_Male Outfit_Male_Ranger
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (const name of process.argv.slice(2)) {
  const f = `assets/models_hd/${name}.glb`, b0 = fs.statSync(f).size;
  const doc = await io.read(f);
  for (const m of doc.getRoot().listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null); }
  await doc.transform(prune());
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage(); if (!img) continue;
    const meta = await sharp(img).metadata();
    if (meta.hasAlpha) { const st = await sharp(img).stats(); if (!st.isOpaque) continue; }
    t.setImage(new Uint8Array(await sharp(img).removeAlpha().jpeg({ quality: 82 }).toBuffer())); t.setMimeType('image/jpeg');
    t.setURI(t.getURI().replace(/\.png$/i, '.jpg'));
  }
  await io.write(f, doc);
  console.log(name, (b0 / 1024).toFixed(0), '→', (fs.statSync(f).size / 1024).toFixed(0), 'KB, tex', doc.getRoot().listTextures().map(t => t.getName() || t.getURI()).join(','));
}
