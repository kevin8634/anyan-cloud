// raidA 11-02 维尔格首领化组装（0 积分）：node tools/rigfine/virg_boss/build.mjs <rig40k.glb> <out.glb> <texDir>
// rig40k.glb = 原始 29.7 万面件区域压面 4 万（头 1.1 万，UV 接缝保留）+ 烘 2048 法线 + Lux3D 绑骨权重转移（见 run.sh）
// ①首领化体型（骨骼缩放）②身体贴图换 skin.py 输出（底色 2048 / 法线、金属粗糙度、自发光 1024）③寒誓巨剑挂 RightHand、塔盾挂 LeftHand（刚性件）
// ④clips.mjs 逐技能关键帧（腿两骨 IK 踩地、武器朝向约束）烘成 glTF animations ⑤meshopt 压缩
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { readFileSync, statSync } from 'fs';
import sharp from 'sharp';
import { Rig, bake, report } from './anim.mjs';
import { CLIPS, FIST } from './clips.mjs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out, TD] = process.argv.slice(2); const T = f => TD.replace(/\/$/, '') + '/' + f;
const doc = await io.read(inp); await doc.transform(dequantize()); const root = doc.getRoot(); const buf = root.listBuffers()[0];
const skin = root.listSkins()[0]; const joints = skin.listJoints(); const names = joints.map(n => n.getName().replace(/^mixamorig:?/, ''));
const J = {}; joints.forEach((n, i) => J[names[i]] = n);
// ---- 1. 首领化体型：维尔格是最壮的人形首领（游戏 WL_BODY 2.7 倍），胸背 / 肩比摆渡双子标准再宽一档，头颈收
const SC = { Spine1: 1.1, Spine2: 1.12, Neck: 0.9, Head: 0.97, LeftShoulder: 1.06, RightShoulder: 1.06, LeftArm: 0.98, RightArm: 0.98, LeftUpLeg: 1.05, RightUpLeg: 1.05 };
for (const [n, s] of Object.entries(SC)) J[n].setScale([s, s, s]);
// ---- 2. 身体贴图
const wp = (f, q = 90, w) => { let s = sharp(readFileSync(T(f))); if (w) s = s.resize(w, w); return s.webp({ quality: q, effort: 5 }).toBuffer(); };
const tex = async (name, f, q, w) => doc.createTexture(name).setImage(await wp(f, q, w)).setMimeType('image/webp');
{ const m = root.listMaterials().find(x => x.getName() === 'Designer_Logic_PBR') || root.listMaterials()[0]; m.setName('MI_VirgBody');
  m.getBaseColorTexture().setImage(await wp('base_virg.png', 88)).setMimeType('image/webp').setName('T_Virg_D');
  m.getNormalTexture().setImage(await wp('nrm_virg.png', 92)).setMimeType('image/webp').setName('T_Virg_N');
  m.getMetallicRoughnessTexture().setImage(await wp('mr_virg.png', 90)).setMimeType('image/webp').setName('T_Virg_MR');
  m.setEmissiveTexture(await tex('T_Virg_E', 'emi_virg.png', 88)).setEmissiveFactor([1, 1, 1]); m.setMetallicFactor(1).setRoughnessFactor(1); }
// ---- 2b. 11-03 脸部高清（Rhett 18:06 批）：独立 2048 脸（正面投影 → CodeFormer → 亡灵肤色 → Real-ESRGAN x4），幽魂绿眼火写自发光（facehd.py 输出在 <texDir>/fh/）
{ const f = root.listMaterials().find(x => x.getName() === 'MI_GordonFace');
  if (f) { f.setName('MI_VirgFace'); f.setMetallicFactor(0).setRoughnessFactor(1);
    f.getBaseColorTexture().setImage(await wp('fh/face_base.png', 92)).setMimeType('image/webp').setName('T_VirgFace_D');
    f.setNormalTexture(await tex('T_VirgFace_N', 'fh/face_nrm.png', 92, 1024)); f.getNormalTextureInfo().setTexCoord(0);
    f.setEmissiveTexture(await tex('T_VirgFace_E', 'fh/face_emi.png', 88, 1024)).setEmissiveFactor([1, 1, 1]); f.getEmissiveTextureInfo().setTexCoord(0); } }
// ---- 3. 骨架 FK（含缩放），握点
const rig = new Rig(root, names); rig.snapFootRest(); const H = rig.H;
rig.apply(FIST);
const P = n => rig.wp(n);
const fistC = s => { const p = s === 'L' ? 'LeftHand' : 'RightHand'; return P(p + 'Middle1').lerp(P(p + 'Middle3'), 0.5).lerp(P(p + 'Index2'), 0.25); };
const gripAxis = s => { const p = s === 'L' ? 'LeftHand' : 'RightHand'; return P(p + 'Index1').sub(P(p + 'Pinky1')).normalize(); };
const handDir = s => { const p = s === 'L' ? 'LeftHand' : 'RightHand'; return P(p + 'Middle1').sub(P(p)).normalize(); };
const ac = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
const strip = g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g.index ? g.toNonIndexed() : g; };
const prim = (geos, mat) => { const G = mergeGeometries(geos.map(strip)); const p = doc.createPrimitive().setAttribute('POSITION', ac('VEC3', new Float32Array(G.attributes.position.array))).setAttribute('NORMAL', ac('VEC3', new Float32Array(G.attributes.normal.array)));
  if (G.attributes.uv) p.setAttribute('TEXCOORD_0', ac('VEC2', new Float32Array(G.attributes.uv.array))); return p.setMaterial(mat); };
function attach(s, node, ax, nr, origin) {   // 局部系：+Y = 主轴 ax，+Z = 法线 nr，原点 = origin（均为当前姿势世界量）
  const hand = s === 'L' ? 'LeftHand' : 'RightHand'; const z = nr.clone().addScaledVector(ax, -nr.dot(ax)).normalize(); const x = ax.clone().cross(z).normalize();
  const Mw = new THREE.Matrix4().makeBasis(x, ax, z).setPosition(origin); const L = rig.B[hand].matrixWorld.clone().invert().multiply(Mw);
  const t = new THREE.Vector3(), r = new THREE.Quaternion(), sc = new THREE.Vector3(); L.decompose(t, r, sc); node.setTranslation(t.toArray()).setRotation(r.toArray()).setScale(sc.toArray()); J[hand].addChild(node);
  const qh = rig.wq(hand).invert(); rig.props[s] = { axis: ax.clone().applyQuaternion(qh), nrm: z.clone().applyQuaternion(qh) };
}
// ---- 4. 寒誓巨剑（右手）：局部 +Y 剑尖方向，+X 刃口，+Z 剑面法线
const steel = doc.createMaterial('MI_VirgBlade').setMetallicFactor(0.85).setRoughnessFactor(0.32).setBaseColorTexture(await tex('T_VirgBlade_D', 'blade_base.png', 90, 512)).setNormalTexture(await tex('T_VirgBlade_N', 'blade_nrm.png', 90)).setEmissiveTexture(await tex('T_VirgBlade_E', 'blade_emi.png', 88)).setEmissiveFactor([1, 1, 1]);
const iron = doc.createMaterial('MI_VirgIron').setBaseColorFactor([0.2, 0.22, 0.22, 1]).setMetallicFactor(0.9).setRoughnessFactor(0.45).setEmissiveFactor([0.01, 0.04, 0.035]);
const leather = doc.createMaterial('MI_VirgGrip').setMetallicFactor(0).setRoughnessFactor(0.75).setBaseColorTexture(await tex('T_VirgGrip_D', 'grip_base.png', 85));
let swordLen;
{ const BL = H * 0.66, BW = H * 0.045, BT = H * 0.008, GL = H * 0.17; swordLen = BL;
  // 剑身：菱形截面（刃 ±BW，脊 ±BT），沿长度收窄到剑尖；u 横跨刃宽，v 剑根 → 剑尖
  const NS = 24, pos = [], uv = [], idx = []; const y0 = H * 0.05;   // 剑根在护手上方
  for (let i = 0; i <= NS; i++) { const t = i / NS, y = y0 + BL * t, w = BW * (t < 0.82 ? 1 - 0.18 * t : (1 - 0.18 * 0.82) * (1 - (t - 0.82) / 0.18)) + 1e-5, th = BT * (1 - 0.6 * t) + 1e-5;
    for (const [x, z, u] of [[-w, 0, 0], [0, th, 0.5], [w, 0, 1], [0, -th, 0.5]]) { pos.push(x, y, z); uv.push(u, t); } }
  for (let i = 0; i < NS; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4; idx.push(a, b, d, a, d, c); }
  const blade = new THREE.BufferGeometry(); blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); blade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); blade.setIndex(idx);
  const guard = new THREE.BoxGeometry(H * 0.2, H * 0.024, H * 0.04, 6, 1, 1); { const p = guard.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / (H * 0.1), 2) * H * 0.02); } }
  guard.translate(0, y0 - H * 0.01, 0);
  const grip = new THREE.CylinderGeometry(H * 0.016, H * 0.018, GL, 12, 1); grip.translate(0, y0 - H * 0.02 - GL / 2, 0);
  const pommel = new THREE.OctahedronGeometry(H * 0.03, 1); pommel.scale(1, 1.3, 0.8); pommel.translate(0, y0 - H * 0.02 - GL - H * 0.02, 0);
  const gem = new THREE.OctahedronGeometry(H * 0.016, 0); gem.translate(0, y0 - H * 0.01, H * 0.022);
  const gemM = doc.createMaterial('MI_VirgOathGem').setBaseColorFactor([0.3, 1, 0.8, 1]).setEmissiveFactor([0.31, 1.0, 0.82]).setRoughnessFactor(0.2).setMetallicFactor(0);
  const mesh = doc.createMesh('Prop_VirgSword').addPrimitive(prim([blade], steel)).addPrimitive(prim([guard, pommel], iron)).addPrimitive(prim([grip], leather)).addPrimitive(prim([gem], gemM));
  // 握点：拳心偏上（握在剑柄上段），剑柄 = 局部 y 在 [y0-0.02H-GL, y0-0.02H]
  const ax = gripAxis('R'), edge = handDir('R'); const nr = edge.clone().cross(ax).normalize();   // 剑面法线 ⟂ 刃口
  const origin = fistC('R').addScaledVector(ax, -(y0 - H * 0.02 - GL * 0.3));
  attach('R', doc.createNode('Prop_VirgSword').setMesh(mesh), ax, nr, origin);
}
// ---- 5. 塔盾（左手）：局部 +Y 盾高方向（= 握把方向），+Z 盾面朝外；盾面略弧
const shieldM = doc.createMaterial('MI_VirgShield').setMetallicFactor(0.75).setRoughnessFactor(0.5).setBaseColorTexture(await tex('T_VirgShield_D', 'shield_base.png', 88)).setNormalTexture(await tex('T_VirgShield_N', 'shield_nrm.png', 90)).setEmissiveTexture(await tex('T_VirgShield_E', 'shield_emi.png', 88)).setEmissiveFactor([1, 1, 1]);
{ const SW = H * 0.34, SH = H * 0.54, TH = H * 0.018, OFF = H * 0.055, CUR = H * 0.05, NX = 16, NY = 20;
  const face = (sgn) => { const pos = [], uv = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const u = i / NX, v = j / NY; let x = (u - 0.5) * SW, y = (v - 0.5) * SH;
      const taper = v < 0.18 ? 1 - Math.pow((0.18 - v) / 0.18, 2) * 0.35 : 1; x *= taper;   // 下端收成钝尖
      const z = OFF + CUR * (1 - Math.pow((u - 0.5) * 2, 2)) + (sgn < 0 ? -TH : 0); pos.push(x, y, z); uv.push(u, 1 - v); }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; if (sgn > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g; };
  // 盾沿：沿外轮廓的管
  const ring = []; const edgeP = (u, v) => { let x = (u - 0.5) * SW, y = (v - 0.5) * SH; const taper = v < 0.18 ? 1 - Math.pow((0.18 - v) / 0.18, 2) * 0.35 : 1; x *= taper; return new THREE.Vector3(x, y, OFF + CUR * (1 - Math.pow((u - 0.5) * 2, 2)) - TH / 2); };
  for (let i = 0; i <= NX; i++) ring.push(edgeP(i / NX, 1)); for (let j = NY; j >= 0; j--) ring.push(edgeP(1, j / NY)); for (let i = NX; i >= 0; i--) ring.push(edgeP(i / NX, 0)); for (let j = 0; j <= NY; j++) ring.push(edgeP(0, j / NY));
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 160, H * 0.012, 6, true);
  const handle = new THREE.CylinderGeometry(H * 0.012, H * 0.012, H * 0.14, 8); const strap = new THREE.BoxGeometry(H * 0.015, H * 0.03, OFF); strap.translate(0, H * 0.07, OFF / 2); const strap2 = strap.clone().translate(0, -H * 0.14, 0);
  const mesh = doc.createMesh('Prop_VirgShield').addPrimitive(prim([face(1)], shieldM)).addPrimitive(prim([face(-1), rim, handle, strap, strap2], iron));
  const ax = gripAxis('L'); const back = new THREE.Vector3(0, 1, 0);   // T 字绑定：掌心朝下 → 手背朝上 = 盾面朝外
  attach('L', doc.createNode('Prop_VirgShield').setMesh(mesh), ax, back, fistC('L'));
}
// ---- 6. 动画
const tips = { 剑尖: () => { const p = rig.props.R; return rig.wp('RightHand').add(p.axis.clone().applyQuaternion(rig.wq('RightHand')).multiplyScalar(swordLen * 0.9)).sub(new THREE.Vector3(0, Math.min(rig.foot0.L.y, rig.foot0.R.y), 0)); } };
if (process.env.REPORT) for (const l of report(rig, CLIPS, tips)) console.log(l);
for (const l of bake(doc, rig, CLIPS)) console.log('动画', l);
{ const [b0, ...bs] = root.listBuffers(); for (const a of root.listAccessors()) a.setBuffer(b0); for (const b of bs) b.dispose(); }
await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
console.log('✓', out, (statSync(out).size / 1024 | 0) + ' KB', '三角', tris, '骨', joints.length, '动画', root.listAnimations().length);
