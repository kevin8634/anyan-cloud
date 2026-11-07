import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import fs from 'fs';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';await MeshoptDecoder.ready;await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const [src,img,out]=process.argv.slice(2);const doc=await io.read(src);
const tex=doc.getRoot().listTextures();const t=tex[5];console.log(tex.length,t.getSize());
t.setImage(new Uint8Array(fs.readFileSync(img)));t.setMimeType('image/webp');await io.write(out,doc);
