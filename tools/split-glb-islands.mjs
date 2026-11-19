// 11-05 把一件 GLB 按网格连通岛拆成两件（例：05 交付的 w40_hunter_bow = 弓 + 箭袋同网格）。0 积分，纯几何，不涉及绑骨。
// 用法：node tools/split-glb-islands.mjs in.glb outA.glb outB.glb   —— A = 第二大岛（细长，弓），B = 最大岛（箭袋 + 箭）；小岛按最近大岛包围盒归属
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, compactPrimitive, prune, meshopt } from '@gltf-transform/functions'; import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, outA, outB] = process.argv.slice(2); const src = await io.read(inp);
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION'), I = prim.getIndices().getArray(), n = pos.getCount();
const kid = new Map(), rep = new Int32Array(n); for (let i = 0; i < n; i++) { const k = pos.getElement(i, []).map(v => v.toFixed(4)).join(','); if (!kid.has(k)) kid.set(k, i); rep[i] = kid.get(k); }
const par = Int32Array.from({ length: n }, (_, i) => i); const f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
for (let t = 0; t < I.length; t += 3) { const a = f(rep[I[t]]); par[f(rep[I[t + 1]])] = a; par[f(rep[I[t + 2]])] = a; }
const isl = new Map(); for (let t = 0; t < I.length; t += 3) { const r = f(rep[I[t]]); const c = isl.get(r) ?? { tris: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; c.tris.push(t);
  for (let k = 0; k < 3; k++) { const v = pos.getElement(I[t + k], []); for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], v[d]); c.max[d] = Math.max(c.max[d], v[d]); } } isl.set(r, c); }
const arr = [...isl.values()].sort((a, b) => b.tris.length - a.tris.length); const [B, A] = arr;
const dist = (c, box) => { const m = c.min.map((v, d) => (v + c.max[d]) / 2); return Math.hypot(...m.map((v, d) => Math.max(box.min[d] - v, 0, v - box.max[d]))); };
const ga = [...A.tris], gb = [...B.tris]; for (const c of arr.slice(2)) (dist(c, A) < dist(c, B) ? ga : gb).push(...c.tris);
console.log(`islands ${arr.length}; A ${ga.length} tris, B ${gb.length} tris`);
for (const [tris, out] of [[ga, outA], [gb, outB]]) {
  const d = cloneDocument(src); const p = d.getRoot().listMeshes()[0].listPrimitives()[0];
  const ix = new Uint32Array(tris.length * 3); tris.forEach((t, j) => { ix[j * 3] = I[t]; ix[j * 3 + 1] = I[t + 1]; ix[j * 3 + 2] = I[t + 2]; });
  p.getIndices().setArray(ix); compactPrimitive(p); await d.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' })); await io.write(out, d);
}
