// raidA 11-02 莫尔维斯显示件（0 积分，本地）：原始 99196 面 → ~4 万面、贴图 2048、不压缩（便于后续绑骨处理）
// node tools/rigfine/morvis/simplify.mjs <textured.glb> <out.glb> [target=40000]
// 做法同 tools/lux3d.mjs postProcess：weld+dedup → meshoptimizer 1.3 Permissive 减面（误差逐级放宽）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier as Simp13 } from 'meshoptimizer-next';
const MeshoptSimplifier = { ready: Simp13.ready, simplify: (i, p, s, t, e, f = []) => Simp13.simplify(i, p, s, t, e, [...f, 'Permissive']) };
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [src, dst, tg = '40000'] = process.argv.slice(2); const target = +tg;
const doc = await io.read(src);
const tris = () => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
const before = tris();
await doc.transform(dequantize(), weld(), dedup());
for (const error of [0.005, 0.01, 0.03, 0.06]) { const cur = tris(); if (cur <= target * 1.08) break;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / cur), error, lockBorder: false })); }
await doc.transform(prune());
for (const t of doc.getRoot().listTextures()) { const s = t.getSize(); console.log('tex', t.getName(), t.getMimeType(), s); }
await io.write(dst, doc);
console.log('faces', before, '→', tris());
