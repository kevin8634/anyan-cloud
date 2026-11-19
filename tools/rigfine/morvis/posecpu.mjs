// 调试（不占浏览器）：CPU 线性蒙皮求某动作某时刻的顶点 → <outdir>/pos.bin（配 raster.py 看形变）
// node posecpu.mjs <meshdir> <rig.json> <clip> <t> <outdir>
import * as THREE from 'three';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { CLIPS, poseAt } from './clips.mjs';
const [md, rp, clip, ts, od] = process.argv.slice(2); mkdirSync(od, { recursive: true });
const rig = JSON.parse(readFileSync(rp, 'utf8')); const P = new Float32Array(readFileSync(md + '/pos.bin').buffer.slice(0));
const pose = poseAt(CLIPS[clip], +ts); const O = {}, rest = {};
for (const b of rig.bones) { const o = new THREE.Object3D(); o.name = b.name; const pp = b.parent ? rig.bones.find(x => x.name === b.parent).p : [0, 0, 0];
  o.position.set(b.p[0] - pp[0], b.p[1] - pp[1], b.p[2] - pp[2]); O[b.name] = o; if (b.parent) O[b.parent].add(o); rest[b.name] = b.p; }
for (const [k, v] of Object.entries(pose)) { if (k === '_p') O.body.position.add(new THREE.Vector3(...v)); else if (k === '_lamp') O.lureLamp.scale.setScalar(v); else if (O[k]) O[k].quaternion.setFromEuler(new THREE.Euler(...v, 'XYZ')); }
O.root.updateMatrixWorld(true);
const M = rig.bones.map(b => O[b.name].matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(-b.p[0], -b.p[1], -b.p[2])));
const n = P.length / 3, out = new Float32Array(n * 3), v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3();
for (let i = 0; i < n; i++) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); acc.set(0, 0, 0);
  for (let k = 0; k < 4; k++) { const w = rig.sw[i * 4 + k]; if (!w) continue; tmp.copy(v).applyMatrix4(M[rig.si[i * 4 + k]]).multiplyScalar(w); acc.add(tmp); }
  out.set([acc.x, acc.y, acc.z], i * 3); }
writeFileSync(od + '/pos.bin', Buffer.from(out.buffer)); for (const f of ['uv.bin', 'idx.bin', 'base.png']) copyFileSync(md + '/' + f, od + '/' + f);
console.log(clip, ts, 'ok');
