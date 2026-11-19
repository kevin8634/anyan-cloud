// raidA 11-03：脸部三角重选后的权重“原样搬运”（替代再跑一次 lux3d-weightxfer 的最近三角插值）。
// 原绑骨件（/workspace/work/tpose/<boss>/rigged.glb）沙箱重置后已不在；直接用同一几何的旧蒙皮件（rig40k.glb，权重来自原绑骨件）当源，
// 每个顶点按位置找源里最近的顶点（网格哈希），JOINTS_0 / WEIGHTS_0 原样复制 → 骨骼、权重、动画与之前逐位一致。
// 用法：node tools/rigfine/facehd/wcopy.mjs 源蒙皮件.glb 目标.glb 输出.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const [srcP, dstP, outP] = process.argv.slice(2);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const S = await io.read(srcP); await S.transform(dequantize());
const sn = S.getRoot().listNodes().find(n => n.getSkin()), names = sn.getSkin().listJoints().map(j => j.getName());
const SP = [], SJ = [], SW = []; const a = [], b = [], c = [];
for (const q of sn.getMesh().listPrimitives()) { const P = q.getAttribute('POSITION'), J = q.getAttribute('JOINTS_0'), W = q.getAttribute('WEIGHTS_0');
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, a); J.getElement(i, b); W.getElement(i, c); SP.push([...a]); SJ.push(b.map(k => names[k])); SW.push([...c]); } }
const G = 0.004, key = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`, grid = new Map();
SP.forEach((p, i) => { const k = key(...p); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
const D = await io.read(dstP); await D.transform(dequantize());
const dn = D.getRoot().listNodes().find(n => n.getSkin()), dj = dn.getSkin().listJoints().map(j => j.getName());
if (JSON.stringify(dj) !== JSON.stringify(names)) throw new Error('骨骼表不一致');
let n = 0, far = 0, mxd = 0;
for (const q of dn.getMesh().listPrimitives()) { const P = q.getAttribute('POSITION'), J = q.getAttribute('JOINTS_0'), W = q.getAttribute('WEIGHTS_0');
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, a); let best = -1, bd = 1e9; const [gx, gy, gz] = a.map(v => Math.floor(v / G));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const s of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) || []) {
      const d = (SP[s][0] - a[0]) ** 2 + (SP[s][1] - a[1]) ** 2 + (SP[s][2] - a[2]) ** 2; if (d < bd) { bd = d; best = s; } }
    if (best < 0) { far++; continue; } mxd = Math.max(mxd, Math.sqrt(bd));
    J.setElement(i, SJ[best].map(nm => dj.indexOf(nm))); W.setElement(i, SW[best]); n++; } }
console.log('copied', n, 'no-match', far, 'max dist', mxd.toExponential(2));
if (far) throw new Error('有顶点找不到源顶点');
await io.write(outP, D); console.log('✓', outP);
