// raidA 11-02 维尔格 / 萨琳：导出显示件原贴图（底色 / 金属粗糙度）为 png。node tools/rigfine/virg_boss/exttex.mjs <glb> <outDir> → base0.png mr0.png
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inp, out] = process.argv.slice(2); const m = (await io.read(inp)).getRoot().listMaterials()[0];
await sharp(Buffer.from(m.getBaseColorTexture().getImage())).png().toFile(out + '/base0.png');
await sharp(Buffer.from(m.getMetallicRoughnessTexture().getImage())).png().toFile(out + '/mr0.png');
console.log('✓ base0.png mr0.png');
