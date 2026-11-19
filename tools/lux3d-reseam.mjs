// fix1109 #3：Lux3D 原件重新后处理（不跨 UV 接缝减面 + 贴图保持原 2048）
//   原因：tools/lux3d.mjs postProcess 用 meshoptimizer 1.3 Permissive 减面（允许跨 UV 接缝塌边），Lux3D 图集碎岛多 →
//   减面后大量三角形的 UV 横跨好几个岛（scene_camp_wreckwall：59% 面积的三角形 UV 边 > 图集 5%，原件 0%），贴图被拉成条纹 / 错位（Rhett 11-09「撕裂感」）；
//   另外贴图被压到 1024（原件 2048）。
//   这里：weld + dedup → 普通（锁 UV 接缝）减面，误差逐步放宽到目标面数 → 贴图 webp q90 保持原尺寸 → meshopt
//   --alignx：长条件（围墙段）按水平主轴转到 x 轴、弧形外凸面朝 -z（原件斜放约 43°，按 x 轴摆会朝向不对），旋转烘进顶点
//   node tools/lux3d-reseam.mjs <原件 textured.glb> <输出.glb> [--target=16000] [--maxerr=0.05] [--alignx]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, meshopt, textureCompress, transformMesh } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier } from 'meshoptimizer-next';
import sharp from 'sharp';
import { statSync } from 'fs';
const [src, dst] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
const target = arg('target', 16000), maxErr = arg('maxerr', 0.05);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const tris = d => d.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const doc = await io.read(src); const before = tris(doc);
await doc.transform(weld(), dedup());
for (const error of [0.005, 0.01, 0.02, 0.03, 0.05, 0.08].filter(e => e <= maxErr)) {
  const cur = tris(doc); if (cur <= target * 1.15) break;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / cur), error, lockBorder: false }));
  console.log(`  error ${error} → ${Math.round(tris(doc))} 面`);
}
if (process.argv.includes('--alignx')) {
  const P = []; const e = [];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); P.push([e[0], e[2]]); } }
  const n = P.length, mx = P.reduce((s, p) => s + p[0], 0) / n, mz = P.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of P) { sxx += (x - mx) ** 2; szz += (z - mz) ** 2; sxz += (x - mx) * (z - mz); }
  let th = 0.5 * Math.atan2(2 * sxz, sxx - szz); const c = Math.cos(th), s = Math.sin(th);
  const U = P.map(([x, z]) => (x - mx) * c + (z - mz) * s), V = P.map(([x, z]) => -(x - mx) * s + (z - mz) * c), L = Math.max(...U) - Math.min(...U);
  const mid = V.filter((_, i) => Math.abs(U[i]) < 0.1 * L), end = V.filter((_, i) => Math.abs(U[i]) > 0.42 * L);
  const sag = mid.reduce((a, b) => a + b, 0) / mid.length - end.reduce((a, b) => a + b, 0) / end.length;
  if (sag > 0) th += Math.PI;   // 外凸面（弧中段）转到 -z
  const C = Math.cos(th), S = Math.sin(th);
  // 绕 y 转 th：x' = x cos + z sin, z' = -x sin + z cos（列主序 4x4）
  const M = [C, 0, -S, 0, 0, 1, 0, 0, S, 0, C, 0, 0, 0, 0, 1];
  for (const m of doc.getRoot().listMeshes()) transformMesh(m, M);
  console.log(`  alignx：主轴 ${(Math.atan2(s, c) * 180 / Math.PI).toFixed(1)}°，弧高 ${Math.abs(sag).toFixed(3)} / 长 ${L.toFixed(3)}，转 ${(th * 180 / Math.PI).toFixed(1)}°`);
}
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
console.log(`${src} → ${dst}  ${before}→${Math.round(tris(doc))} 面  ${(statSync(src).size / 1024).toFixed(0)}→${(statSync(dst).size / 1024).toFixed(0)} KB`);
