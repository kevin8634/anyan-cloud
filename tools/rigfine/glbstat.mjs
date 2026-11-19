import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f), r = doc.getRoot();
  let tris = 0; const prims = [];
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { const t = (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; tris += t; prims.push(`${p.getMaterial()?.getName()}:${t}`); }
  const tex = []; for (const t of r.listTextures()) { const im = t.getImage(); const md = await sharp(Buffer.from(im)).metadata(); tex.push(`${t.getName()||'?'} ${md.width}x${md.height} ${t.getMimeType()}`); }
  console.log(f.split('/').pop(), 'tris', tris, 'skins', r.listSkins().length, 'joints', r.listSkins()[0]?.listJoints().length, '|', prims.join(' '), '|', tex.join('; '));
}
