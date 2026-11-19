import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder } from 'meshoptimizer'; import * as THREE from 'three';
await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const d = await io.read(process.argv[2]); const r = d.getRoot(); const sk = r.listSkins()[0]; const js = sk.listJoints(); const ibm = sk.getInverseBindMatrices();
const bp = n => { const i = js.findIndex(j => j.getName().replace(/^mixamorig:?/, '') === n); return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm.getElement(i, [])).invert()); };
const pH = bp('Hips'), pK = bp('LeftLeg'), pF = bp('LeftFoot'), pS = bp('Spine');
const prims = r.listMeshes()[0].listPrimitives(); const body = prims[0], robe = prims[2];
const NA = 16; const prof = (prim, y, band) => { const p = prim.getAttribute('POSITION'), v = []; const o = new Array(NA).fill(0); for (let i = 0; i < p.getCount(); i++) { p.getElement(i, v); if (Math.abs(v[1] - y) > band) continue; const a = Math.floor(((Math.atan2(v[2] - pH.z, v[0] - pH.x) + Math.PI) / (2 * Math.PI)) * NA) % NA; o[a] = Math.max(o[a], Math.hypot(v[0] - pH.x, v[2] - pH.z)); } return o.map(x => x.toFixed(3)).join(' '); };
console.log('Hips', pH.y.toFixed(3), 'Spine', pS.y.toFixed(3), 'knee', pK.y.toFixed(3), 'foot', pF.y.toFixed(3));
const rp = robe.getAttribute('POSITION'); let ymax = -9; const v = []; for (let i = 0; i < rp.getCount(); i++) { rp.getElement(i, v); ymax = Math.max(ymax, v[1]); } console.log('robe top y', ymax.toFixed(3));
for (const t of [-0.1, 0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) { const y = ymax - t * (ymax - pF.y); console.log('t', t, 'y', y.toFixed(3), '\n body', prof(body, y, 0.012), '\n robe', prof(robe, y, 0.04)); }
