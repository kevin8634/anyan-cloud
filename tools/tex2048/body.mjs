// fix1106 ④ 身体：ESRGAN 2048 底色（webp q90）+ 由底色生成 2048 细节法线（Sobel，K）；源件取 /workspace/work/tex2048/orig/（原件备份）
// 用法：node tools/tex2048/body.mjs Mage [K=1.0]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp'; import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const cls = process.argv[2], S = +(process.argv[3] || 1.0);
const src = `/workspace/work/tex2048/orig/LUX_${cls}.glb`, out = `assets_aholo/models_hd/LUX_${cls}.glb`, png = `/workspace/work/tex2048/${cls}_bc2048.png`;
const doc = await io.read(src), mat = doc.getRoot().listMaterials()[0];
mat.getBaseColorTexture().setImage(await sharp(png).webp({ quality: 90, effort: 6 }).toBuffer()).setMimeType('image/webp');
const { data, info } = await sharp(png).resize(2048, 2048, { kernel: 'lanczos3' }).blur(0.6).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels, N = W * H, lum = new Float32Array(N);
for (let i = 0; i < N; i++) lum[i] = (0.3 * data[i * C] + 0.59 * data[i * C + 1] + 0.11 * data[i * C + 2]) / 255;
const at = (x, y) => lum[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))], nrm = Buffer.alloc(N * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
  const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
  let nx = -dx * S, ny = -dy * S, nz = 1; const l = Math.hypot(nx, ny, nz);
  const o = (y * W + x) * 3; nrm[o] = (nx / l * 0.5 + 0.5) * 255; nrm[o + 1] = (ny / l * 0.5 + 0.5) * 255; nrm[o + 2] = (nz / l * 0.5 + 0.5) * 255;
}
const t = doc.createTexture('detail_normal').setMimeType('image/webp').setImage(await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 92 }).toBuffer());
const bi = mat.getBaseColorTextureInfo(); mat.setNormalTexture(t).setNormalScale(1); mat.getNormalTextureInfo().setTexCoord(bi.getTexCoord());
await io.write(out, doc);
console.log(cls, `${(fs.statSync(src).size / 1024) | 0} KB → ${(fs.statSync(out).size / 1024) | 0} KB`, 'K=' + S);
