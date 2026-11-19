// 导出网格（世界坐标，已乘节点矩阵）：pos.bin uv.bin idx.bin + 贴图 → <dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync, mkdirSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [src, dir] = process.argv.slice(2); mkdirSync(dir, { recursive: true });
const doc = await io.read(src); const root = doc.getRoot();
const node = root.listNodes().find(n => n.getMesh()); const M = node.getWorldMatrix();
const prims = node.getMesh().listPrimitives(); console.log('prims', prims.length, 'nodes', root.listNodes().length, 'M', M.map(v => +v.toFixed(3)).join(','));
const p = prims[0]; const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices(); const n = pos.getCount();
const P = new Float32Array(n * 3), U = new Float32Array(n * 2), e = [0, 0, 0];
for (let i = 0; i < n; i++) { pos.getElement(i, e); const [x, y, z] = e; P[i*3] = M[0]*x+M[4]*y+M[8]*z+M[12]; P[i*3+1] = M[1]*x+M[5]*y+M[9]*z+M[13]; P[i*3+2] = M[2]*x+M[6]*y+M[10]*z+M[14]; uv.getElement(i, e); U[i*2] = e[0]; U[i*2+1] = e[1]; }
writeFileSync(dir + '/pos.bin', Buffer.from(P.buffer)); writeFileSync(dir + '/uv.bin', Buffer.from(U.buffer)); writeFileSync(dir + '/idx.bin', Buffer.from(new Uint32Array(idx.getArray()).buffer));
const m = p.getMaterial(); const t = { base: m.getBaseColorTexture(), nrm: m.getNormalTexture(), mr: m.getMetallicRoughnessTexture(), emi: m.getEmissiveTexture() };
for (const [k, tx] of Object.entries(t)) if (tx) { writeFileSync(`${dir}/${k}.png`, tx.getImage()); console.log('tex', k); }
console.log('verts', n, 'tris', idx.getCount() / 3, 'mat', m.getName(), 'rough', m.getRoughnessFactor(), 'metal', m.getMetallicFactor(), 'emi', m.getEmissiveFactor());
