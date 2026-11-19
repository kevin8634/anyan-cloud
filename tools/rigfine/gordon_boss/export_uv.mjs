// 导出身体 primitive 的 UV / 绑定姿势坐标 / 主骨骼，及身体三张贴图，给 skin.py 在 UV 空间画伤疤、血污、缠绳、湿皮
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inp, dir] = process.argv.slice(2);
const doc = await io.read(inp); const r = doc.getRoot();
const prim = r.listMeshes()[0].listPrimitives().find(p => p.getMaterial().getName() === 'Designer_Logic_PBR');
const joints = r.listSkins()[0].listJoints().map(n => n.getName().replace(/^mixamorig:?/, ''));
const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), JN = prim.getAttribute('JOINTS_0'), WT = prim.getAttribute('WEIGHTS_0');
const n = P.getCount(), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), jn = new Int32Array(n), a = [], b = [], c = [];
for (let i = 0; i < n; i++) { P.getElement(i, a); pos.set(a, i * 3); UV.getElement(i, b); uv.set(b, i * 2); JN.getElement(i, c); const w = WT.getElement(i, []); let k = 0; for (let j = 1; j < 4; j++) if (w[j] > w[k]) k = j; jn[i] = c[k]; }
writeFileSync(dir + '/pos.bin', Buffer.from(pos.buffer)); writeFileSync(dir + '/uv.bin', Buffer.from(uv.buffer)); writeFileSync(dir + '/jn.bin', Buffer.from(jn.buffer));
writeFileSync(dir + '/idx.bin', Buffer.from(new Uint32Array(prim.getIndices().getArray()).buffer));
writeFileSync(dir + '/joints.json', JSON.stringify(joints));
const m = prim.getMaterial();
writeFileSync(dir + '/base.webp', m.getBaseColorTexture().getImage()); writeFileSync(dir + '/nrm.webp', m.getNormalTexture().getImage()); writeFileSync(dir + '/mr.webp', m.getMetallicRoughnessTexture().getImage());
console.log('verts', n, 'tris', prim.getIndices().getCount() / 3, 'MR factors', m.getRoughnessFactor(), m.getMetallicFactor());
