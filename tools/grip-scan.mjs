// 11-05 暗金武器握柄扫描：按 makeGlbProp 的同样规则立起（最长轴→Y，len<0 翻转），沿 Y 切 40 段，
// 输出每段 XZ 宽度与重心，找最细的连续段 = 握柄。用法：node tools/grip-scan.mjs <glb> [flip]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [file, flip] = process.argv.slice(2);
const doc = await io.read(file);
const pts = [];
const mul = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
for (const node of doc.getRoot().listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
  for (const p of mesh.listPrimitives()) { const a = p.getAttribute('POSITION'); const el = [];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, el); pts.push(mul(W, el)); } } }
const bb = (P) => { const mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9]; for (const p of P) for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],p[k]); mx[k]=Math.max(mx[k],p[k]); } return [mn, mx]; };
let [mn, mx] = bb(pts); const s = [mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]];
let P = pts;
if (s[0] > s[1] && s[0] >= s[2]) P = P.map(([x,y,z]) => [-y, x, z]);          // rotateZ(+90)
else if (s[2] > s[1] && s[2] > s[0]) P = P.map(([x,y,z]) => [x, -z, y]);       // rotateX(-90): y'=y cos - z sin = ... (−90°: y'=z? )
if (flip) P = P.map(([x,y,z]) => [-x, -y, z]);
[mn, mx] = bb(P); const L = mx[1]-mn[1], N = 40;
const bins = Array.from({length:N}, () => ({ n:0, x0:1e9,x1:-1e9,z0:1e9,z1:-1e9, sx:0, sz:0 }));
for (const [x,y,z] of P) { const i = Math.min(N-1, Math.floor((y-mn[1])/L*N)); const b = bins[i]; b.n++; b.x0=Math.min(b.x0,x); b.x1=Math.max(b.x1,x); b.z0=Math.min(b.z0,z); b.z1=Math.max(b.z1,z); b.sx+=x; b.sz+=z; }
console.log(file.split('/').pop(), 'verts', P.length, 'L', L.toFixed(3), 'bboxXZ', (mx[0]-mn[0]).toFixed(3), (mx[2]-mn[2]).toFixed(3), 'bboxCtr', ((mx[0]+mn[0])/2).toFixed(3), ((mx[2]+mn[2])/2).toFixed(3));
bins.forEach((b, i) => { if (!b.n) { console.log(String(i).padStart(2), 'empty'); return; }
  const w = Math.max(b.x1-b.x0, b.z1-b.z0) / L; console.log(String(i).padStart(2), ((i+0.5)/N).toFixed(3), 'w/L', w.toFixed(3), 'cx', (b.sx/b.n).toFixed(3), 'cz', (b.sz/b.n).toFixed(3), 'n', b.n, '#'.repeat(Math.round(w*60))); });
