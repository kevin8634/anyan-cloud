import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
root.listTextures().forEach((t, i) => { writeFileSync(`/workspace/work/tex_${i}.${t.getMimeType().split('/')[1]}`, t.getImage()); console.log('tex', i, t.getMimeType(), t.getSize()); });
for (const m of root.listMaterials()) console.log('mat', m.getName(), m.getBaseColorTexture() && root.listTextures().indexOf(m.getBaseColorTexture()), m.getNormalTexture() && root.listTextures().indexOf(m.getNormalTexture()));
// head front vertices → UV
const out = [];
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), nrm = p.getAttribute('NORMAL'); if (!pos || !uv) continue;
  let ymin = 1e9, ymax = -1e9; for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); ymin = Math.min(ymin, v[1]); ymax = Math.max(ymax, v[1]); }
  console.log('prim', mesh.getName(), pos.getCount(), 'y', ymin.toFixed(2), ymax.toFixed(2), pos.getNormalized?.());
  for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []), u = uv.getElement(i, []), n = nrm ? nrm.getElement(i, []) : [0,0,1];
    const h = (v[1] - ymin) / (ymax - ymin); if (h > 0.84 && h < 0.95) out.push([v[0], v[1], v[2], n[0], n[1], n[2], u[0], u[1], h]); }
}
writeFileSync('/workspace/work/headuv.json', JSON.stringify(out));
console.log('head verts', out.length);
