import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {MeshoptDecoder} from 'meshoptimizer';import fs from 'fs';
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const d=await io.read(process.argv[2]);const r=d.getRoot();const n=r.listNodes().find(n=>n.getMesh());const M=n.getWorldMatrix();
const p=n.getMesh().listPrimitives()[0];const P=p.getAttribute('POSITION'),U=p.getAttribute('TEXCOORD_0');const c=P.getCount();
const pos=new Float32Array(c*3),uv=new Float32Array(c*2);const t=[0,0,0],u=[0,0];
for(let i=0;i<c;i++){P.getElement(i,t);for(let k=0;k<3;k++)pos[i*3+k]=M[k]*t[0]+M[4+k]*t[1]+M[8+k]*t[2]+M[12+k];U.getElement(i,u);uv[i*2]=u[0];uv[i*2+1]=u[1];}
fs.writeFileSync('m_pos.bin',Buffer.from(pos.buffer));fs.writeFileSync('m_uv.bin',Buffer.from(uv.buffer));fs.writeFileSync('m_idx.bin',Buffer.from(new Uint32Array(p.getIndices().getArray()).buffer));
fs.writeFileSync('m_tex.webp',p.getMaterial().getBaseColorTexture().getImage());console.log(c,p.getIndices().getCount()/3);
