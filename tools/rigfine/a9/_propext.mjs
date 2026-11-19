// 刚性件局部 Y 范围（主轴长度，单位 = 身高 H）：node _propext.mjs <glb> <H>
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder } from 'meshoptimizer'; import { dequantize } from '@gltf-transform/functions';
await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]); await doc.transform(dequantize()); const H = +process.argv[3];
for (const n of doc.getRoot().listNodes()) { if (!/^Prop_/.test(n.getName()) || !n.getMesh()) continue; let lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9]; const s = n.getScale();
  for (const p of n.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { const v = a.getElement(i, []); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k] * s[k]); hi[k] = Math.max(hi[k], v[k] * s[k]); } } }
  console.log(n.getName(), 'x', (lo[0]/H).toFixed(2), (hi[0]/H).toFixed(2), 'y', (lo[1]/H).toFixed(2), (hi[1]/H).toFixed(2), 'z', (lo[2]/H).toFixed(2), (hi[2]/H).toFixed(2), 't', n.getTranslation().map(x=>(x/H).toFixed(2)).join(',')); }
