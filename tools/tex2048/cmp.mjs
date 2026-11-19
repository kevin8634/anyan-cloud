import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp'; import fs from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const cls=['Warrior','Mage','Hunter','Chrono','Alchemy','Coffin']; const tiles=[];
for (const c of cls){
  const f=`assets_aholo/models_hd/LUX_${c}.glb`; const bk=`/workspace/work/tex2048/orig/LUX_${c}.glb`;
  if(!fs.existsSync(bk)) fs.copyFileSync(f,bk);
  const doc=await io.read(bk); const img=doc.getRoot().listMaterials()[0].getBaseColorTexture().getImage();
  const r={left:640,top:640,width:512,height:512};
  const a=await sharp(Buffer.from(img)).resize(2048,2048).extract(r).png().toBuffer();
  const b=await sharp(`/workspace/work/tex2048/${c}_bc2048.png`).resize(2048,2048).extract(r).png().toBuffer();
  tiles.push({input:a,left:0,top:tiles.length/2*512},{input:b,left:520,top:(tiles.length/2)*512});
}
await sharp({create:{width:1032,height:512*6,channels:3,background:'#222'}}).composite(tiles).jpeg({quality:82}).toFile('/workspace/work/tex2048/cmp_all.jpg');
console.log('ok');
