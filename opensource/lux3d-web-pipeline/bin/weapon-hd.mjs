// v1.2.41 武器高清化（零积分）：Lux3D 原始件 → 2–3 万面 + 2048 webp 底色 / 金属粗糙度 + 由底色生成法线贴图 + 冷青色发光遮罩（emissive）
// 用法：node bin/weapon-hd.mjs <原始.glb> <输出.glb> [--target 24000] [--tex 2048] [--glow cyan|orange|none]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier as Simp13 } from 'meshoptimizer-next';   // v1.2.43 Permissive：允许跨 UV 接缝减面（时轮刃之前卡在 5 万面）
const MeshoptSimplifier = { ready: Simp13.ready, simplify: (i, p, s, t, e, f = []) => Simp13.simplify(i, p, s, t, e, [...f, 'Permissive']) };
import sharp from 'sharp';
import { statSync } from 'fs';
const [src, dst] = process.argv.slice(2), opt = {};
for (let i = 4; i < process.argv.length; i += 2) opt[process.argv[i].slice(2)] = process.argv[i + 1];
const target = Number(opt.target || 24000), tex = Number(opt.tex || 2048), glow = opt.glow || 'cyan';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const tris = () => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
const before = tris();
await doc.transform(weld(), dedup());
for (const error of [0.005, 0.01, 0.03, 0.06, 0.12, 0.25]) { const c = tris(); if (c <= target * 1.15) break; await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / c, error, lockBorder: false })); }
const mat = doc.getRoot().listMaterials()[0], base = mat.getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(base.getImage())).resize(tex, tex).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels, N = W * H;
// 高度 = 亮度（模糊一下去噪）→ Sobel → 切线空间法线
const lum = new Float32Array(N); for (let i = 0; i < N; i++) lum[i] = (0.3 * data[i * C] + 0.59 * data[i * C + 1] + 0.11 * data[i * C + 2]) / 255;
const nrm = Buffer.alloc(N * 3), S = 2.2, at = (x, y) => lum[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
  const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
  let nx = -dx * S, ny = -dy * S, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  const o = (y * W + x) * 3; nrm[o] = (nx * 0.5 + 0.5) * 255; nrm[o + 1] = (ny * 0.5 + 0.5) * 255; nrm[o + 2] = (nz * 0.5 + 0.5) * 255;
}
const nTex = doc.createTexture('normal').setMimeType('image/png').setImage(await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).blur(0.6).png().toBuffer());
mat.setNormalTexture(nTex).setNormalScale(1);
// 发光遮罩：底色里高饱和、偏冷青（或橙）的亮块 = 水晶 / 魂光
let glowPx = 0;
if (glow !== 'none') {
  const em = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const r = data[i * C] / 255, g = data[i * C + 1] / 255, b = data[i * C + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    const hit = glow === 'cyan' ? (b > 0.55 && g > 0.5 && r < 0.6 * Math.min(g, b) + 0.12 && sat > 0.35) : (r > 0.6 && g > 0.25 && b < 0.35 && sat > 0.5);
    const k = hit ? Math.min(1, (mx - 0.5) * 2.4) : 0;
    if (k > 0) glowPx++; em[i * 3] = r * 255 * k; em[i * 3 + 1] = g * 255 * k; em[i * 3 + 2] = b * 255 * k;
  }
  const eTex = doc.createTexture('emissive').setMimeType('image/png').setImage(await sharp(em, { raw: { width: W, height: H, channels: 3 } }).blur(1.5).png().toBuffer());
  mat.setEmissiveTexture(eTex).setEmissiveFactor([1, 1, 1]);
}
mat.setRoughnessFactor(1).setMetallicFactor(1);
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 86 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
console.log(`${dst}  ${before}→${tris()} 面  ${(statSync(dst).size / 1024).toFixed(0)} KB  发光像素 ${(glowPx / N * 100).toFixed(1)}%`);
