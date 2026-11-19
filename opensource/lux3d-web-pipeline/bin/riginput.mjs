// v1.2.23 绑骨输入件：Lux3D 原始 GLB → 减面到约 1.5 万面 + JPEG 1024 贴图，不加 meshopt / webp（绑骨服务要普通 GLB）。用法：node bin/riginput.mjs 原始.glb 输出.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier as S } from 'meshoptimizer-next';
import sharp from 'sharp';
await S.ready;
const simp = { ready: S.ready, simplify: (i, p, s, t, e, f = []) => S.simplify(i, p, s, t, e, [...f, 'Permissive']) };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
await doc.transform(weld(), dedup());
const tris = () => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
for (const e of [0.01, 0.03, 0.06, 0.12]) { if (tris() <= 17000) break; await doc.transform(simplify({ simplifier: simp, ratio: 15000 / tris(), error: e, lockBorder: false })); }
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 88 }));
await io.write(process.argv[3], doc);
console.log(tris(), (await import('fs')).statSync(process.argv[3]).size);
