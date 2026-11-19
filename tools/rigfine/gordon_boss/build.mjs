// raidA 11-01 戈尔顿首领化（0 积分）：骨骼体型放大 + 右手巨锚（复用 scene_wl_anchor）+ 左手锚链铁钩（程序化）
// node tools/rigfine/gordon_boss/build.mjs <in.glb> <out.glb> [skinTexDir]
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { statSync, readFileSync, existsSync } from 'fs';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp); const root = doc.getRoot();
const J = {}; for (const n of root.listSkins()[0].listJoints()) J[n.getName().replace(/^mixamorig:?/, '')] = n;
const E = (k, d) => process.env[k] ? +process.env[k] : d;
// ---- 1. 体型：上身加宽加厚，头不跟着变大（缩放沿骨骼链继承）
const SC = { Spine1: E('S_SP1', 1.12), Spine2: E('S_SP2', 1.1), Neck: E('S_NECK', 0.85), Head: E('S_HEAD', 0.95),
  LeftArm: E('S_ARM', 0.97), RightArm: E('S_ARM', 0.97), LeftHand: E('S_HAND', 1.05), RightHand: E('S_HAND', 1.05),
  LeftUpLeg: E('S_LEG', 1.1), RightUpLeg: E('S_LEG', 1.1) };
for (const [n, s] of Object.entries(SC)) J[n].setScale([s, s, s]);
const W = n => new THREE.Matrix4().fromArray(n.getWorldMatrix());
const P = n => new THREE.Vector3().setFromMatrixPosition(W(n));
// 把世界矩阵 M 挂到骨骼 bone 下
function attach(bone, node, Mw) {
  const L = W(bone).invert().multiply(Mw); const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); L.decompose(t, q, s);
  node.setTranslation(t.toArray()).setRotation(q.toArray()).setScale(s.toArray()); bone.addChild(node);
}
// 手臂方向（T 字下沿手臂向外）与握点（手掌中心：腕 → 中指根 的 60%）
function grip(side) {
  const hand = P(J[side + 'Hand']), fore = P(J[side + 'ForeArm']), mid = J[side + 'HandMiddle1'] ? P(J[side + 'HandMiddle1']) : hand.clone().add(hand.clone().sub(fore).setLength(0.05));
  return { at: hand.clone().lerp(mid, 0.6), dir: hand.clone().sub(fore).normalize() };
}
const H = P(J.Head).y - P(J.LeftFoot).y;   // 头到脚高度（世界单位）
console.log('高度(头-脚)', H.toFixed(3));
// ---- 2. 右手巨锚：复用场景锚（锚杆沿主轴，环端在手里，垂臂时拖地）
{
  const ad = await io.read('assets_aholo/dlc1/props/scene_wl_anchor.glb');
  const an = ad.getRoot().listNodes().find(n => n.getMesh());
  // 在锚的世界空间求 PCA 主轴
  const pr = an.getMesh().listPrimitives()[0], pa = pr.getAttribute('POSITION'), M0 = new THREE.Matrix4().fromArray(an.getWorldMatrix());
  const pts = []; const v = new THREE.Vector3(); for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, v.toArray()); const a = pa.getElement(i, []); pts.push(new THREE.Vector3(...a).applyMatrix4(M0)); }
  const c = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const cov = [[0,0,0],[0,0,0],[0,0,0]]; for (const p of pts) { const d = p.clone().sub(c).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
  let ax = new THREE.Vector3(1, 1, 0).normalize(); for (let k = 0; k < 50; k++) { const a = ax.toArray(); ax = new THREE.Vector3(...cov.map(r => r[0]*a[0]+r[1]*a[1]+r[2]*a[2])).normalize(); }
  if (ax.y < 0) ax.negate();   // 指向环端（上方）
  let lo = 1e9, hi = -1e9; for (const p of pts) { const t = p.clone().sub(c).dot(ax); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const len = hi - lo, ring = c.clone().addScaledVector(ax, hi);
  const want = H * E('ANCHOR_LEN', 0.62), s = want / len;
  const g = grip('Right');
  // 锚杆 -ax 对齐手臂方向（环端朝肩，锚爪朝外）；握在离环端 12% 处
  const q = new THREE.Quaternion().setFromUnitVectors(ax.clone().negate(), g.dir);
  // 绕锚杆转，让锚爪平面朝前后（侧面看得到爪）
  const qr = new THREE.Quaternion().setFromAxisAngle(g.dir, E('ANCHOR_ROLL', 0) * Math.PI / 180);
  const gripLocal = ring.clone().addScaledVector(ax, -len * 0.12);
  const Mw = new THREE.Matrix4().compose(new THREE.Vector3(), qr.multiply(q), new THREE.Vector3(s, s, s));
  const off = gripLocal.clone().applyMatrix4(Mw); Mw.setPosition(g.at.clone().sub(off));
  Mw.multiply(M0);   // 锚原节点的量化缩放
  const map = mergeDocuments(doc, ad);
  const mesh = map.get(an.getMesh());
  for (const sc of root.listScenes()) for (const n of [...sc.listChildren()]) if (map.get(an) === n || !n.listChildren && false) {}
  // 合并进来的场景/节点删掉，只保留网格
  for (const n of ad.getRoot().listNodes()) { const m2 = map.get(n); if (m2) m2.dispose(); }
  for (const sc of ad.getRoot().listScenes()) { const m2 = map.get(sc); if (m2) m2.dispose(); }
  const node = doc.createNode('Prop_Anchor').setMesh(mesh); mesh.setName('Prop_Anchor');
  attach(J.RightHand, node, Mw);
  console.log('锚 长', (len * s).toFixed(3), '缩放', s.toFixed(3));
}
// ---- 3. 左手：木柄 + 锚链 + 铁钩（程序化）
{
  const geos = [];
  const add = (geo, m) => { geo.applyMatrix4(m); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); geos.push(geo.index ? geo.toNonIndexed() : geo); };
  const u = H / 1.0;   // 尺寸以 1 高度为基准
  const I = () => new THREE.Matrix4();
  // 局部系：+Y 沿手臂向外（链条方向），握柄在原点
  add(new THREE.CylinderGeometry(0.012 * u, 0.014 * u, 0.07 * u, 10), I());
  const linkR = 0.022 * u, tube = 0.0068 * u, N = E('CHAIN_N', 11);
  let y = 0.04 * u;
  for (let i = 0; i < N; i++) { const g = new THREE.TorusGeometry(linkR, tube, 6, 14); g.scale(0.75, 1.25, 1);
    const m = new THREE.Matrix4().makeRotationY(i % 2 ? Math.PI / 2 : 0).setPosition(0, y + linkR * 1.1, 0); add(g, m); y += linkR * 1.8; }
  // 钩：沿 J 形曲线的锥管
  const hk = 0.1 * u;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, hk * 0.9, 0), new THREE.Vector3(0, hk * 1.45, hk * 0.25),
    new THREE.Vector3(0, hk * 1.55, hk * 0.75), new THREE.Vector3(0, hk * 1.2, hk * 1.05), new THREE.Vector3(0, hk * 0.8, hk * 0.95)]);
  const tg = new THREE.TubeGeometry(curve, 40, 0.012 * u, 8, false);
  { const p = tg.attributes.position, segs = 41; for (let i = 0; i < p.count; i++) { const k = Math.floor(i / 9) / (segs - 1); const c = curve.getPointAt(Math.min(1, k));
      const r = 1 - 0.85 * Math.pow(k, 2.2); p.setXYZ(i, c.x + (p.getX(i) - c.x) * r, c.y + (p.getY(i) - c.y) * r, c.z + (p.getZ(i) - c.z) * r); } tg.computeVertexNormals(); }
  add(tg, I().setPosition(0, y + 0.01 * u, 0));
  const eye = new THREE.TorusGeometry(0.017 * u, 0.007 * u, 6, 14); add(eye, I().makeRotationY(Math.PI / 2).setPosition(0, y, 0));
  const G = mergeGeometries(geos); G.computeVertexNormals();
  const pos = G.attributes.position.array, nor = G.attributes.normal.array;
  const buf = root.listBuffers()[0];
  const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buf));
  const mat = doc.createMaterial('MI_RustHook').setBaseColorFactor([0.33, 0.17, 0.09, 1]).setMetallicFactor(0.45).setRoughnessFactor(0.7)
    .setEmissiveFactor([0.012, 0.05, 0.036]);
  prim.setMaterial(mat);
  const mesh = doc.createMesh('Prop_HookChain').addPrimitive(prim);
  const g = grip('Left');
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), g.dir);
  const Mw = new THREE.Matrix4().compose(g.at, q, new THREE.Vector3(1, 1, 1));
  attach(J.LeftHand, doc.createNode('Prop_HookChain').setMesh(mesh), Mw);
  console.log('钩链 三角', pos.length / 9);
}
// ---- 4. 身体贴图（skin.py 输出：伤疤/血污/缠绳/湿皮）
if (process.argv[4]) { const d = process.argv[4] + '/'; const m = root.listMaterials().find(x => x.getName() === 'Designer_Logic_PBR');
  const wp = (f, q) => sharp(readFileSync(d + f)).webp({ quality: q, effort: 6 }).toBuffer();
  m.getBaseColorTexture().setImage(await wp('base2.png', 90)).setMimeType('image/webp');
  m.getNormalTexture().setImage(await wp('nrm2.png', 92)).setMimeType('image/webp');
  m.getMetallicRoughnessTexture().setImage(await wp('mr2.png', 90)).setMimeType('image/webp');
  if (existsSync(d + 'emi2.png')) { m.setEmissiveTexture(doc.createTexture('T_Gordon_E').setImage(await wp('emi2.png', 88)).setMimeType('image/webp')).setEmissiveFactor([1, 1, 1]); }
  console.log('身体贴图已替换'); }
// ---- 5. 锚贴图重绘（hd 目录：anchor_base_hd.png / anchor_nrm.png / anchor_emi.png）
if (process.argv[5]) { const d = process.argv[5] + '/'; const m = root.listMeshes().find(x => x.getName() === 'Prop_Anchor').listPrimitives()[0].getMaterial(); m.setName('MI_GordonAnchor');
  const wp = (f, q) => sharp(readFileSync(d + f)).webp({ quality: q, effort: 6 }).toBuffer();
  m.getBaseColorTexture().setImage(await wp('anchor_base_hd.png', 90)).setMimeType('image/webp');
  m.setNormalTexture(doc.createTexture('T_Anchor_N').setImage(await wp('anchor_nrm.png', 92)).setMimeType('image/webp'));
  m.setEmissiveTexture(doc.createTexture('T_Anchor_E').setImage(await wp('anchor_emi.png', 88)).setMimeType('image/webp')).setEmissiveFactor([1, 1, 1]);
  console.log('锚贴图已替换'); }
{ const [b0, ...bs] = root.listBuffers(); for (const a of root.listAccessors()) a.setBuffer(b0); for (const b of bs) b.dispose(); }
await io.write(out, doc);
console.log('✓', out, (statSync(out).size / 1024 | 0) + ' KB');
