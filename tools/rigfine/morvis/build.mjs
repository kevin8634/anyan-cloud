// raidA 11-02 莫尔维斯本地精绑成品组装（0 积分；不用 Lux3D 绑骨 / Mixamo）
// node tools/rigfine/morvis/build.mjs <disp.glb> <rig.json> <emi.png> <out.glb>
//  disp.glb = simplify.mjs 减面显示件；rig.json = rigfine2.py + cfg/morvis.py 输出；emi.png = emi.py 输出（深渊幽魂绿诱饵灯 + 发光脉络）
//  → 24 骨蒙皮 + clips.mjs 全部动作（30fps 采样，LINEAR）+ 自发光 + webp 2048 + meshopt
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { readFileSync, statSync } from 'fs';
import sharp from 'sharp';
import { CLIPS, BONES, poseAt } from './clips.mjs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, rigp, emip, out] = process.argv.slice(2);
const doc = await io.read(inp); await doc.transform(dequantize()); const root = doc.getRoot(); const buf = root.listBuffers()[0];
const rig = JSON.parse(readFileSync(rigp, 'utf8'));
const meshNode = root.listNodes().find(n => n.getMesh()); meshNode.setName('Morvis_Mesh'); meshNode.getMesh().setName('Morvis');
const prim = meshNode.getMesh().listPrimitives()[0]; const nV = prim.getAttribute('POSITION').getCount();
if (rig.si.length !== nV * 4) throw new Error('rig 顶点数不符 ' + rig.si.length / 4 + ' vs ' + nV);
prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(rig.index)).setBuffer(buf));
// ---- 骨骼
const J = {}, Pw = {};
for (const b of rig.bones) { Pw[b.name] = b.p; const n = doc.createNode(b.name); J[b.name] = n;
  const pp = b.parent ? Pw[b.parent] : [0, 0, 0]; n.setTranslation([b.p[0] - pp[0], b.p[1] - pp[1], b.p[2] - pp[2]]);
  if (b.parent) J[b.parent].addChild(n); }
const scene = root.listScenes()[0]; scene.addChild(J.root);
const joints = rig.bones.map(b => J[b.name]);
const ibm = new Float32Array(joints.length * 16);
rig.bones.forEach((b, i) => { const m = new THREE.Matrix4().makeTranslation(-b.p[0], -b.p[1], -b.p[2]); ibm.set(m.elements, i * 16); });
const skin = doc.createSkin('Morvis_Skin').setSkeleton(J.root).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
for (const j of joints) skin.addJoint(j);
meshNode.setSkin(skin);
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(rig.si)).setBuffer(buf));
const sw = new Float32Array(rig.sw); for (let i = 0; i < nV; i++) { let s = 0; for (let k = 0; k < 4; k++) s += sw[i * 4 + k]; for (let k = 0; k < 4; k++) sw[i * 4 + k] /= s; }
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(sw).setBuffer(buf));
// ---- 材质：深渊幽魂绿自发光 + webp
const mat = prim.getMaterial(); mat.setName('MI_MorvisBody');
const wp = async (img, q) => sharp(Buffer.from(img)).webp({ quality: q, effort: 5 }).toBuffer();
mat.getBaseColorTexture().setImage(await wp(mat.getBaseColorTexture().getImage(), 90)).setMimeType('image/webp').setName('T_Morvis_B');
mat.getMetallicRoughnessTexture().setImage(await wp(mat.getMetallicRoughnessTexture().getImage(), 88)).setMimeType('image/webp').setName('T_Morvis_MR');
mat.setEmissiveTexture(doc.createTexture('T_Morvis_E').setImage(await wp(readFileSync(emip), 88)).setMimeType('image/webp')).setEmissiveFactor([1, 1, 1]);
mat.setMetallicFactor(0.15).setRoughnessFactor(0.85);
// ---- 动作
const FPS = 30, e = new THREE.Euler(), q = new THREE.Quaternion();
const restBody = J.body.getTranslation();
// 11-03 落地防穿地：cfg/morvis_ground.json = groundfix.py 量出的每帧身体抬升（30fps，与下方采样同帧）
const GROUND = (() => { try { return JSON.parse(readFileSync(new URL('../cfg/morvis_ground.json', import.meta.url))); } catch { return {}; } })();
for (const [name, clip] of Object.entries(CLIPS)) {
  const anim = doc.createAnimation(name).setExtras({ label: clip.label, loop: !!clip.loop, hold: !!clip.hold });
  const n = Math.round(clip.dur * FPS) + 1; const T = new Float32Array(n); for (let i = 0; i < n; i++) T[i] = Math.min(clip.dur, i / FPS);
  const R = Object.fromEntries(BONES.map(b => [b, new Float32Array(n * 4)])); const Tb = new Float32Array(n * 3), Sl = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const p = poseAt(clip, T[i]);
    for (const b of BONES) { const v = p[b] ?? [0, 0, 0]; e.set(v[0], v[1], v[2], 'XYZ'); q.setFromEuler(e); R[b].set([q.x, q.y, q.z, q.w], i * 4); }
    const d = p._p ?? [0, 0, 0]; Tb.set([restBody[0] + d[0], restBody[1] + d[1] + (GROUND[name]?.[i] ?? 0), restBody[2] + d[2]], i * 3); const s = p._lamp ?? 1; Sl.set([s, s, s], i * 3); }
  const inA = doc.createAccessor().setType('SCALAR').setArray(T).setBuffer(buf);
  const ch = (node, path, arr, type) => { const s = doc.createAnimationSampler().setInput(inA).setOutput(doc.createAccessor().setType(type).setArray(arr).setBuffer(buf)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s)); };
  for (const b of BONES) ch(J[b], 'rotation', R[b], 'VEC4');
  ch(J.body, 'translation', Tb, 'VEC3'); ch(J.lureLamp, 'scale', Sl, 'VEC3');
}
root.getAsset().extras = { ...(root.getAsset().extras || {}), source: 'Lux3D 4513869 原始件；raidA 本地精绑 tools/rigfine/cfg/morvis.py + morvis/（0 积分）' };
await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log('✓', out, (statSync(out).size / 1024 | 0) + ' KB', 'tris', rig.index.length / 3, 'bones', joints.length, 'clips', Object.keys(CLIPS).join(','));
