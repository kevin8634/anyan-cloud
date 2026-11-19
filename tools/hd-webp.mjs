// v1.2.18：写实模型贴图转 webp（512，EXT_texture_webp；three GLTFLoader 原生支持）——UBC_Female / Outfit_Male_Peasant 入嵌入前压一遍
// 用法：node tools/hd-webp.mjs UBC_Female Outfit_Male_Peasant
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (const n of process.argv.slice(2)) {
  const f = `assets/models_hd/${n}.glb`, a = fs.statSync(f).size;
  const doc = await io.read(f);
  console.log(n, doc.getRoot().listTextures().map(t => t.getMimeType() + ' ' + (t.getImage()?.byteLength / 1024).toFixed(0) + 'KB').join(', '));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }));
  await io.write(f, doc);
  console.log(' →', (a / 1024).toFixed(0), 'KB →', (fs.statSync(f).size / 1024).toFixed(0), 'KB');
}
