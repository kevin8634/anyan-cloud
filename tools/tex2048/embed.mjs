// fix1106 ④：把 tools/tex2048/esrgan.py 出的 2048 底色贴图写回 assets_aholo/models_hd/LUX_<职业>.glb（只换底色贴图字节，网格 / 骨架 / 其它贴图原样）
// 用法：node tools/tex2048/embed.mjs Mage [quality=90]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp'; import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const cls = process.argv[2], q = +(process.argv[3] || 90), f = `assets_aholo/models_hd/LUX_${cls}.glb`, png = `/workspace/work/tex2048/${cls}_bc2048.png`;
const a = fs.statSync(f).size, doc = await io.read(f);
const tex = doc.getRoot().listMaterials()[0].getBaseColorTexture();
tex.setImage(await sharp(png).webp({ quality: q, effort: 6 }).toBuffer()).setMimeType('image/webp');
await io.write(f, doc);
console.log(cls, `${(a / 1024) | 0} KB → ${(fs.statSync(f).size / 1024) | 0} KB`);
