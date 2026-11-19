import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const node = doc.getRoot().listNodes()[0];
const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
const P = []; const el = [0,0,0];
for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, el); P.push(...el); }
const I = []; for (let i = 0; i < idx.getCount(); i++) I.push(idx.getScalar(i));
writeFileSync(process.argv[3], JSON.stringify({ P, I, t: node.getTranslation(), s: node.getScale(), norm: pos.getNormalized(), ctype: pos.getComponentType() }));
console.log(pos.getCount(), idx.getCount(), node.getScale(), pos.getNormalized());
