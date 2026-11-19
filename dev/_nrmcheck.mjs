import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
console.log(p.listSemantics(), doc.getRoot().listMaterials().map(m => [m.getName(), m.getMetallicFactor(), m.getRoughnessFactor(), !!m.getMetallicRoughnessTexture(), !!m.getEmissiveTexture(), !!m.getNormalTexture()]));
const pos = p.getAttribute('POSITION'), nrm = p.getAttribute('NORMAL');
let y0 = 1e9, y1 = -1e9; for (let i = 0; i < pos.getCount(); i++) { const y = pos.getElement(i, [])[1]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const map = new Map(); let bad = 0, tot = 0;
for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); if ((v[1] - y0) / (y1 - y0) < 0.84 || v[2] < 0.05) continue; const k = v.map(x => x.toFixed(4)).join(); if (!map.has(k)) map.set(k, []); map.get(k).push(nrm.getElement(i, [])); }
for (const [k, ns] of map) { if (ns.length < 2) continue; tot++; const d = Math.min(...ns.slice(1).map(n => n[0] * ns[0][0] + n[1] * ns[0][1] + n[2] * ns[0][2])); if (d < 0.9) bad++; }
console.log('face seam verts', tot, 'normal-split', bad);
