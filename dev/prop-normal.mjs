// 11-04 raidA 地标件（零积分）：由底色亮度生成细节法线（Sobel，K=S），已有法线就跳过；贴图统一 1024 webp
// 用法：node dev/prop-normal.mjs a.glb b.glb ... [--k 1.6]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const args = process.argv.slice(2), ki = args.indexOf('--k'), S = ki >= 0 ? Number(args.splice(ki, 2)[1]) : 1.6;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
for (const f of args) {
  const doc = await io.read(f);
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getNormalTexture()) { console.log(f, mat.getName(), '已有法线，跳过'); continue; }
    const base = mat.getBaseColorTexture(); if (!base) continue;
    const { data, info } = await sharp(Buffer.from(base.getImage())).resize(1024, 1024).blur(0.8).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels, N = W * H, lum = new Float32Array(N);
    for (let i = 0; i < N; i++) lum[i] = (0.3 * data[i * C] + 0.59 * data[i * C + 1] + 0.11 * data[i * C + 2]) / 255;
    const at = (x, y) => lum[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))], nrm = Buffer.alloc(N * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * S, ny = -dy * S, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * W + x) * 3; nrm[o] = (nx * 0.5 + 0.5) * 255; nrm[o + 1] = (ny * 0.5 + 0.5) * 255; nrm[o + 2] = (nz * 0.5 + 0.5) * 255;
    }
    const t = doc.createTexture('normal').setMimeType('image/png').setImage(await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
    const bi = mat.getBaseColorTextureInfo(); mat.setNormalTexture(t).setNormalScale(1); mat.getNormalTextureInfo().setTexCoord(bi.getTexCoord());
    console.log(f, mat.getName() || '(mat)', '法线已生成 K=' + S);
  }
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }));
  await io.write(f, doc);
}
