import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer'; import sharp from 'sharp';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
async function g(buf){const {data}=await sharp(buf).resize(2048,2048).greyscale().raw().toBuffer({resolveWithObject:true});return data;}
for(const f of process.argv.slice(2)){const d=await io.read(f);const t=d.getRoot().listMaterials()[0].getBaseColorTexture();const b=Buffer.from(t.getImage());
const a=await g(b);const lo=await g(await sharp(b).resize(1024,1024,{kernel:'lanczos3'}).png().toBuffer());
let e=0,v=0,m=0;for(let i=0;i<a.length;i++)m+=a[i];m/=a.length;for(let i=0;i<a.length;i+=3){e+=(a[i]-lo[i])**2;v+=(a[i]-m)**2;}
console.log(f.split('/').pop().padEnd(22),'2048独有细节占比',(100*e/v).toFixed(2)+'%');}
