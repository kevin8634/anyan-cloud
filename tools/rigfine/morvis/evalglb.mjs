// 从成品 glb 本身求动作帧（读 skin / IBM / 权重 / animations 采样器，CPU 线性蒙皮），给 cpurender.py 出 GIF —— 浏览器被占用时的验收路径
// node evalglb.mjs <rigged.glb> <outdir> [fps=12] [clip1,clip2]   → outdir/mesh/{uv.bin,idx.bin,base.png,emi.png} + outdir/<clip>.bin（帧×顶点×3 float32）+ clips.json
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [src, od, fpsS = '12', list] = process.argv.slice(2); const fps = +fpsS; mkdirSync(od + '/mesh', { recursive: true });
const doc = await io.read(src); await doc.transform(dequantize()); const root = doc.getRoot();
const mn = root.listNodes().find(n => n.getMesh() && n.getSkin()); const prim = mn.getMesh().listPrimitives()[0]; const skin = mn.getSkin();
const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), J0 = prim.getAttribute('JOINTS_0'), W0 = prim.getAttribute('WEIGHTS_0'); const n = pos.getCount();
const meshM = new THREE.Matrix4().fromArray(mn.getWorldMatrix());
const P = new Float32Array(n * 3), U = new Float32Array(n * 2), JI = new Uint16Array(n * 4), WW = new Float32Array(n * 4), e = [0, 0, 0, 0];
for (let i = 0; i < n; i++) { pos.getElement(i, e); P.set(e.slice(0, 3), i * 3); uv.getElement(i, e); U.set(e.slice(0, 2), i * 2); J0.getElement(i, e); JI.set(e, i * 4); W0.getElement(i, e); WW.set(e, i * 4); }
writeFileSync(od + '/mesh/uv.bin', Buffer.from(U.buffer)); writeFileSync(od + '/mesh/idx.bin', Buffer.from(new Uint32Array(prim.getIndices().getArray()).buffer));
const mat = prim.getMaterial();
await sharp(Buffer.from(mat.getBaseColorTexture().getImage())).png().toFile(od + '/mesh/base.png');
if (mat.getEmissiveTexture()) await sharp(Buffer.from(mat.getEmissiveTexture().getImage())).png().toFile(od + '/mesh/emi.png');
// three 节点镜像
const O = new Map(); const mk = nd => { const o = new THREE.Object3D(); o.name = nd.getName(); o.position.fromArray(nd.getTranslation()); o.quaternion.fromArray(nd.getRotation()); o.scale.fromArray(nd.getScale()); O.set(nd, o); for (const c of nd.listChildren()) o.add(mk(c)); return o; };
const scn = new THREE.Object3D(); for (const nd of root.listScenes()[0].listChildren()) scn.add(mk(nd));
const rest = new Map([...O].map(([k, o]) => [k, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }]));
const joints = skin.listJoints(); const ibmA = skin.getInverseBindMatrices(); const IBM = joints.map((j, i) => new THREE.Matrix4().fromArray(ibmA.getElement(i, [])));
const meshInv = meshM.clone().invert();
{ // 绑定姿势（静止）顶点：量化后位置在 IBM 里，需走一遍蒙皮
  scn.updateMatrixWorld(true); const M = joints.map((j, i) => O.get(j).matrixWorld.clone().multiply(IBM[i])); const R = new Float32Array(n * 3), v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); acc.set(0, 0, 0); for (let q = 0; q < 4; q++) { const w = WW[i * 4 + q]; if (!w) continue; tmp.copy(v).applyMatrix4(M[JI[i * 4 + q]]).multiplyScalar(w); acc.add(tmp); } R.set([acc.x, acc.y, acc.z], i * 3); }
  writeFileSync(od + '/mesh/pos.bin', Buffer.from(R.buffer)); }
const meta = {}; const want = list ? list.split(',') : null;
function sample(s, t) { const inp = s.getInput().getArray(), out = s.getOutput().getArray(), k = s.getOutput().getElementSize();
  let i = 0; while (i < inp.length - 2 && inp[i + 1] < t) i++; const t0 = inp[i], t1 = inp[Math.min(i + 1, inp.length - 1)]; const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a = Array.from(out.slice(i * k, i * k + k)), b = Array.from(out.slice(Math.min(i + 1, inp.length - 1) * k, Math.min(i + 1, inp.length - 1) * k + k)); return { a, b, u }; }
for (const anim of root.listAnimations()) { const name = anim.getName(); if (want && !want.includes(name)) continue;
  const dur = Math.max(...anim.listSamplers().map(s => { const a = s.getInput().getArray(); return a[a.length - 1]; }));
  const nf = Math.round(dur * fps) + 1; const outB = new Float32Array(nf * n * 3);
  for (let f = 0; f < nf; f++) { const t = Math.min(dur, f / fps);
    for (const [k, r] of rest) { const o = O.get(k); o.position.copy(r.p); o.quaternion.copy(r.q); o.scale.copy(r.s); }
    for (const ch of anim.listChannels()) { const o = O.get(ch.getTargetNode()); const { a, b, u } = sample(ch.getSampler(), t); const path = ch.getTargetPath();
      if (path === 'rotation') { o.quaternion.set(...a).slerp(new THREE.Quaternion(...b), u); } else if (path === 'translation') o.position.set(...a.map((v, i) => v + (b[i] - v) * u)); else if (path === 'scale') o.scale.set(...a.map((v, i) => v + (b[i] - v) * u)); }
    scn.updateMatrixWorld(true);
    const M = joints.map((j, i) => meshInv.clone().multiply(O.get(j).matrixWorld).multiply(IBM[i]));
    const v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); acc.set(0, 0, 0);
      for (let q = 0; q < 4; q++) { const w = WW[i * 4 + q]; if (!w) continue; tmp.copy(v).applyMatrix4(M[JI[i * 4 + q]]).multiplyScalar(w); acc.add(tmp); }
      acc.applyMatrix4(meshM); outB.set([acc.x, acc.y, acc.z], (f * n + i) * 3); } }
  writeFileSync(`${od}/${name}.bin`, Buffer.from(outB.buffer)); meta[name] = { frames: nf, dur, label: anim.getExtras()?.label || name }; console.log(name, nf, 'frames'); }
writeFileSync(od + '/clips.json', JSON.stringify({ n, fps, clips: meta }, null, 1));
