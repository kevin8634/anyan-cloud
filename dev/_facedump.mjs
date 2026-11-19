import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices();
const P = [], U = [];
for (let i = 0; i < pos.getCount(); i++) { P.push(pos.getElement(i, [])); U.push(uv.getElement(i, [])); }
writeFileSync('/workspace/work/mesh.json', JSON.stringify({ P, U, I: Array.from(idx.getArray()) }));
console.log(pos.getCount(), idx.getCount());
