import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const d = await io.read(process.argv[2]);
const p = d.getRoot().listMeshes()[0].listPrimitives()[0];
const P = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_0'), I = p.getIndices();
const n=P.getCount(), pos=new Float32Array(n*3), uv=new Float32Array(n*2), v=[0,0,0], u=[0,0];
for(let i=0;i<n;i++){P.getElement(i,v);pos.set(v,i*3);U.getElement(i,u);uv.set(u,i*2);}
const idx=Uint32Array.from(I.getArray());
writeFileSync(process.argv[3]+'.pos', Buffer.from(pos.buffer)); writeFileSync(process.argv[3]+'.uv', Buffer.from(uv.buffer)); writeFileSync(process.argv[3]+'.idx', Buffer.from(idx.buffer));
console.log(n, idx.length/3, 'skin', !!d.getRoot().listSkins().length, 'node', d.getRoot().listNodes().map(x=>x.getName()).slice(0,3));
