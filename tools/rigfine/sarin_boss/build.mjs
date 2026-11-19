// raidA 11-02 萨琳首领化组装（0 积分）：node tools/rigfine/sarin_boss/build.mjs <rig40k.glb> <out.glb> <texDir>
// rig40k.glb = 原始 29.7 万面件区域压面 4 万（头 1.1 万，UV 接缝保留）+ 烘 2048 法线 + Lux3D 绑骨权重转移（见 run.sh）
// ①首领化体型（骨骼缩放）②身体贴图换 skin.py 输出（底色 2048 / 法线、金属粗糙度、自发光 1024）③拖地破烂湿长袍下摆（附加蒙皮 primitive，同摆渡双子）④漂流木灯杖 + 鱼油灵魂灯笼（复用 scene_wl_lantern）挂 RightHand（刚性件）
// ④clips.mjs 逐技能关键帧（腿两骨 IK 踩地、武器朝向约束）烘成 glTF animations ⑤meshopt 压缩
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, prune, mergeDocuments } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { readFileSync, statSync } from 'fs';
import sharp from 'sharp';
import { Rig, bake, report } from '../virg_boss/anim.mjs';
import { CLIPS, FIST, IDLE } from './clips.mjs';
const IDLE_FOR_GRIP = {};   // 握点在 T 字 + 握拳下取（与维尔格同）
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out, TD] = process.argv.slice(2); const T = f => TD.replace(/\/$/, '') + '/' + f;
const doc = await io.read(inp); await doc.transform(dequantize()); const root = doc.getRoot(); const buf = root.listBuffers()[0];
const skin = root.listSkins()[0]; const joints = skin.listJoints(); const names = joints.map(n => n.getName().replace(/^mixamorig:?/, ''));
const J = {}; joints.forEach((n, i) => J[names[i]] = n);
const E = (k, d) => process.env[k] ? +process.env[k] : d;
// ---- 1. 首领化体型：摆渡双子标准（Spine1 1.08 / Spine2 1.1 / 肩 1.04 / UpLeg 1.04 / Neck 0.9 / Head 0.98，臂 0.97 抵消肩宽带来的臂长）；身高由游戏 WL_BODY（2.4 倍）放大
const SC = { Spine1: 1.08, Spine2: 1.1, Neck: 0.9, Head: 0.98, LeftShoulder: 1.04, RightShoulder: 1.04, LeftArm: 0.97, RightArm: 0.97, LeftUpLeg: 1.04, RightUpLeg: 1.04 };
for (const [n, s] of Object.entries(SC)) J[n].setScale([s, s, s]);
// ---- 2. 身体贴图
const wp = (f, q = 90, w) => { let s = sharp(readFileSync(T(f))); if (w) s = s.resize(w, w); return s.webp({ quality: q, effort: 5 }).toBuffer(); };
const tex = async (name, f, q, w) => doc.createTexture(name).setImage(await wp(f, q, w)).setMimeType('image/webp');
{ const m = root.listMaterials().find(x => x.getName() === 'Designer_Logic_PBR') || root.listMaterials()[0]; m.setName('MI_SarinBody');
  m.getBaseColorTexture().setImage(await wp('base_sarin.png', 88)).setMimeType('image/webp').setName('T_Sarin_D');
  m.getNormalTexture().setImage(await wp('nrm_sarin.png', 92)).setMimeType('image/webp').setName('T_Sarin_N');
  m.getMetallicRoughnessTexture().setImage(await wp('mr_sarin.png', 90)).setMimeType('image/webp').setName('T_Sarin_MR');
  m.setEmissiveTexture(await tex('T_Sarin_E', 'emi_sarin.png', 88)).setEmissiveFactor([1, 1, 1]); m.setMetallicFactor(1).setRoughnessFactor(1); }
// ---- 2b. 11-03 脸部高清（Rhett 18:06 批）：独立 2048 脸（正面投影 → CodeFormer → 亡灵肤色 → Real-ESRGAN x4），幽魂绿眼火写自发光（facehd.py 输出在 <texDir>/fh/）
{ const f = root.listMaterials().find(x => x.getName() === 'MI_GordonFace');
  if (f) { f.setName('MI_SarinFace'); f.setMetallicFactor(0).setRoughnessFactor(1);
    f.getBaseColorTexture().setImage(await wp('fh/face_base.png', 92)).setMimeType('image/webp').setName('T_SarinFace_D');
    f.setNormalTexture(await tex('T_SarinFace_N', 'fh/face_nrm.png', 92, 1024)); f.getNormalTextureInfo().setTexCoord(0);
    f.setEmissiveTexture(await tex('T_SarinFace_E', 'fh/face_emi.png', 88, 1024)).setEmissiveFactor([1, 1, 1]); f.getEmissiveTextureInfo().setTexCoord(0); } }
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
// ---- 4. 拖地长袍下摆：附加蒙皮 primitive（与身体同 skin），腰（藏进皮带下沿）→ 脚踝，破边 alpha
// 摆渡双子 v2 同法（tools/rigfine/ferry_boss/build.mjs 第 4 段）：①顶圈逐角度贴身体实际半径（不再按全圈最大值×0.8 托底，修腰线缝/外扩），顶部几圈权重从最近身体顶点转移；
//   ②下摆半径 = 腰往下逐角度身体半径的累计最大值×1.035+余量，整段包住身体自带外套（修外套从下摆戳出 = 生渡穿模），并把被包住的外套顶点再往里收一点防动作穿出
{
  const meshNode = root.listNodes().find(n => n.getMesh() && n.getSkin()); const mesh = meshNode.getMesh(); const body = mesh.listPrimitives()[0];
  const ibm = skin.getInverseBindMatrices(); const bindP = i => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm.getElement(i, [])).invert());
  const ji = n => joints.indexOf(J[n]);
  const pH = bindP(ji('Hips')), pL = bindP(ji('LeftUpLeg')), pK = bindP(ji('LeftLeg')), pF = bindP(ji('LeftFoot'));
  const pos = body.getAttribute('POSITION'); const NA = 64, NY = 22, cx = pH.x, cz = pH.z; const v = [];
  const y0 = pH.y + (pH.y - pK.y) * E('ROBE_TOP', 0.2), y1 = pF.y - (pK.y - pF.y) * E('ROBE_DRAG', 0.32);   // 拖地：下摆比脚踝再低三成小腿长
  const nV = pos.getCount(); const VX = new Float32Array(nV * 3); for (let i = 0; i < nV; i++) { pos.getElement(i, v); VX.set(v, i * 3); }
  const sect = (x, z) => Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * NA) % NA;
  // 身体半径表：高度分 NB 层 × NA 角度（0 = 该格无顶点）
  const NB = 80, yb = k => y0 + (y1 - y0) * k / (NB - 1), bandH = (y0 - y1) / (NB - 1);
  const RB = Array.from({ length: NB }, () => new Float32Array(NA));
  for (let i = 0; i < nV; i++) { const x = VX[i * 3], y = VX[i * 3 + 1], z = VX[i * 3 + 2]; const k = Math.round((y0 - y) / (y0 - y1) * (NB - 1)); if (k < -1 || k > NB - 1) continue; const kk = Math.max(0, k); const a = sect(x, z); RB[kk][a] = Math.max(RB[kk][a], Math.hypot(x - cx, z - cz)); }
  const smoothA = r => { const o = new Float32Array(NA); for (let a = 0; a < NA; a++) { let m = 0; for (let d = -1; d <= 1; d++) m = Math.max(m, r[(a + d + NA) % NA]); o[a] = m; } return o; };
  // 顶圈：腰部实际轮廓（空格用相邻角度插值）
  const top = smoothA(RB[0]); for (let a = 0; a < NA; a++) if (!top[a]) { let l = 1; while (!top[(a - l + NA) % NA] && l < NA) l++; let r = 1; while (!top[(a + r) % NA] && r < NA) r++; top[a] = (top[(a - l + NA) % NA] * r + top[(a + r) % NA] * l) / (l + r); }
  // 累计最大值（从腰往下）
  const RUN = []; { let cur = Float32Array.from(top); for (let k = 0; k < NB; k++) { const s2 = smoothA(RB[k]); cur = cur.map((c, a) => Math.max(c, s2[a])); RUN.push(Float32Array.from(cur)); } }
  const runAt = (t, a) => { const f = t * (NB - 1), k = Math.min(NB - 2, Math.floor(f)), u = f - k; return RUN[k][a] * (1 - u) + RUN[k + 1][a] * u; };
  const TOPK = E('ROBE_TOPK', 0.95), BELT_T = E('ROBE_BELT', 0.022), MARG = E('ROBE_MARGIN', 0.006);
  const radius = (t, a, th) => { const flare = (1 + 0.36 * t * t) * (1 + 0.05 * t * Math.sin(th * 7 + 1.3) + 0.03 * t * Math.sin(th * 13));
    const enc = runAt(t, a) * 1.035 + MARG;            // 必须包住外套
    if (t <= BELT_T) return top[a] * TOPK;              // 顶圈藏在皮带里（皮带压住下摆上沿）
    const w = Math.min(1, (t - BELT_T) / 0.04);         // 皮带下沿 → 包络 的过渡
    const r = top[a] * TOPK * (1 - w) + w * Math.max(enc, enc * flare);
    return Math.max(r, runAt(t, a) * 1.012 + 0.002); };   // 过渡段也不让皮带下沿 / 外套戳出
  const iH = ji('Hips'), iL = ji('LeftUpLeg'), iR = ji('RightUpLeg'), iLL = ji('LeftLeg'), iRL = ji('RightLeg');
  const BJ = body.getAttribute('JOINTS_0'), BW = body.getAttribute('WEIGHTS_0'); const jv = [], wv = [];
  const P = [], UV = [], JN = [], WT = [], IDX = []; const leftIsPlusX = pL.x > pH.x;
  // 顶部权重转移：最近身体顶点（只在腰带附近找）
  const nearIdx = []; for (let i = 0; i < nV; i++) if (Math.abs(VX[i * 3 + 1] - y0) < (y0 - y1) * 0.12) nearIdx.push(i);
  const xferW = (x, y, z) => { const best = []; for (const i of nearIdx) { const d = (VX[i * 3] - x) ** 2 + (VX[i * 3 + 1] - y) ** 2 + (VX[i * 3 + 2] - z) ** 2; if (best.length < 4 || d < best[3][0]) { best.push([d, i]); best.sort((p, q) => p[0] - q[0]); if (best.length > 4) best.pop(); } }
    const acc = {}; let ws = 0; for (const [d, i] of best) { const w = 1 / (Math.sqrt(d) + 1e-4); ws += w; BJ.getElement(i, jv); BW.getElement(i, wv); for (let k = 0; k < 4; k++) if (wv[k] > 0) acc[jv[k]] = (acc[jv[k]] || 0) + wv[k] * w; } for (const k in acc) acc[k] /= ws; return acc; };
  const RR = []; // 每行每角半径（给外套收紧用）
  for (let j = 0; j <= NY; j++) { const t = Math.pow(j / NY, 1.35), y = y0 + (y1 - y0) * t; const row = new Float32Array(NA + 1); for (let a = 0; a <= NA; a++) { const th = (a % NA + 0.5) / NA * 2 * Math.PI - Math.PI;
    const r = radius(t, a % NA, th); row[a] = r;
    const px = cx + Math.cos(th) * r, pz = cz + Math.sin(th) * r; P.push(px, y, pz); UV.push(a / NA, t * 0.995);
    const sx = Math.cos(th); const side = THREE.MathUtils.clamp(0.5 + 0.9 * sx, 0, 1); const lp = leftIsPlusX ? side : 1 - side;
    const wl = Math.min(1, t * 1.1), wh = 1 - wl * 0.85, kn = Math.max(0, t - 0.55) * 0.5; const wu = (1 - wh) * (1 - kn);
    const acc = {}; const addw = (jj, w) => { if (w > 0) acc[jj] = (acc[jj] || 0) + w; };
    addw(iH, wh); addw(iL, wu * lp); addw(iR, wu * (1 - lp)); addw(lp > 0.5 ? iLL : iRL, (1 - wh) * kn);
    const bx = THREE.MathUtils.clamp(1 - t / E('ROBE_XFER', 0.22), 0, 1);   // 顶部转移权重占比
    if (bx > 0) { const tw = xferW(px, y, pz); for (const k in acc) acc[k] *= 1 - bx; for (const k in tw) acc[k] = (acc[k] || 0) + tw[k] * bx; }
    const top4 = Object.entries(acc).sort((p, q) => q[1] - p[1]).slice(0, 4); while (top4.length < 4) top4.push([iH, 0]); const s2 = top4.reduce((u, e2) => u + e2[1], 0);
    for (const [jj, w] of top4) { JN.push(+jj); WT.push(w / s2); } } RR.push([t, row]); }
  for (let j = 0; j < NY; j++) for (let a = 0; a < NA; a++) { const k = j * (NA + 1) + a; IDX.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2); }
  // 被下摆包住的外套顶点往腿轴收：只动腰下 3% 到 t=0.6、且半径超过下摆 88% 的顶点（动作时不戳出；看不见的部分）
  { let moved = 0; const tmax = E('COAT_TMAX', 0.6);
    for (let i = 0; i < nV; i++) { const x = VX[i * 3], y = VX[i * 3 + 1], z = VX[i * 3 + 2]; const t = (y0 - y) / (y0 - y1); if (t < 0.03 || t > tmax) continue;
      const tt = Math.pow(t, 1 / 1.35) * NY, jr = Math.min(NY - 1, Math.floor(tt)), u = tt - jr; const a = sect(x, z); const rr = RR[jr][1][a] * (1 - u) + RR[jr + 1][1][a] * u;
      const r = Math.hypot(x - cx, z - cz), lim = rr * 0.88; if (r <= lim) continue;
      const fade = Math.min(1, (t - 0.03) / 0.05, (tmax - t) / 0.08); const nr = r - (r - (lim + (r - lim) * 0.35)) * fade; const s3 = nr / r;
      VX[i * 3] = cx + (x - cx) * s3; VX[i * 3 + 2] = cz + (z - cz) * s3; moved++; }
    pos.setArray(VX); console.log('外套收紧顶点', moved); }
  const ac = (t, arr) => doc.createAccessor().setType(t).setArray(arr).setBuffer(buf);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(IDX); g.computeVertexNormals(); g.computeTangents();
  const prim = doc.createPrimitive().setAttribute('POSITION', ac('VEC3', new Float32Array(P))).setAttribute('NORMAL', ac('VEC3', new Float32Array(g.attributes.normal.array)))
    .setAttribute('TANGENT', ac('VEC4', new Float32Array(g.attributes.tangent.array))).setAttribute('TEXCOORD_0', ac('VEC2', new Float32Array(UV)))
    .setAttribute('JOINTS_0', ac('VEC4', new Uint16Array(JN))).setAttribute('WEIGHTS_0', ac('VEC4', new Float32Array(WT))).setIndices(ac('SCALAR', new Uint32Array(IDX)));
  const m = doc.createMaterial('MI_SarinRobe').setDoubleSided(true).setAlphaMode('MASK').setAlphaCutoff(0.5).setRoughnessFactor(0.38).setMetallicFactor(0)   // 湿布：粗糙度低
    .setBaseColorTexture(doc.createTexture('T_SarinRobe_D').setImage(await sharp(readFileSync(T('robe_base.png'))).webp({ quality: 88, alphaQuality: 90 }).toBuffer()).setMimeType('image/webp'))
    .setNormalTexture(await tex('T_SarinRobe_N', 'robe_nrm.png', 90)).setEmissiveTexture(await tex('T_SarinRobe_E', 'robe_emi.png', 85)).setEmissiveFactor([1, 1, 1]);
  prim.setMaterial(m); mesh.addPrimitive(prim); console.log('下摆 三角', IDX.length / 3, '顶圈半径', Math.min(...top).toFixed(3), '-', Math.max(...top).toFixed(3));
}
// ---- 5. 漂流木灯杖（右手）：局部 +Y 杖头方向，+Z 灯钩朝向；杖头弯钩吊鱼油灵魂灯笼（scene_wl_lantern，与副本灵魂灯笼同款）+ 幽魂绿灯芯
let staffLen;
{ const L = H * 1.22; staffLen = L; const geos = [];
  rig.apply(Object.assign({}, FIST, IDLE_FOR_GRIP)); const gripW = fistC('R'), ax = gripAxis('R');
  const gripT = E('STAFF_GRIP', 0.6);   // 握点在杖长 6 成处（待机时杖底贴地：REPORT=1 自检杖底 ≈ 脚踝下 0.08H）
  const shaft = new THREE.CylinderGeometry(H * 0.018, H * 0.026, L, 10, 24); { const p = shaft.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / L; const w = 1 + 0.12 * Math.sin(y * 41) * Math.sin(y * 13 + 1) + 0.08 * Math.sin(y * 97); const bend = Math.sin(y * Math.PI * 2.2) * H * 0.012; p.setX(i, p.getX(i) * w + bend); p.setZ(i, p.getZ(i) * w + Math.sin(y * 7) * H * 0.006); } }
  shaft.translate(0, L / 2 - gripT * L, 0); geos.push(shaft);
  const top = L * (1 - gripT);
  const crook = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, top - H * 0.02, 0), new THREE.Vector3(0, top + H * 0.05, H * 0.02), new THREE.Vector3(0, top + H * 0.07, H * 0.08), new THREE.Vector3(0, top + H * 0.035, H * 0.13)]), 20, H * 0.011, 8, false); geos.push(crook);
  for (const [yy, ang] of [[0.62, 0.9], [0.8, -1.1]]) { const br = new THREE.CylinderGeometry(H * 0.004, H * 0.008, H * 0.07, 6); br.rotateZ(ang); br.translate(Math.sin(ang) * -H * 0.03, yy * L - gripT * L, 0); geos.push(br); }   // 断枝
  const wood = doc.createMaterial('MI_SarinStaff').setRoughnessFactor(0.62).setMetallicFactor(0).setBaseColorTexture(await tex('T_SarinStaff_D', 'staff_base.png', 88)).setNormalTexture(await tex('T_SarinStaff_N', 'staff_nrm.png', 88));
  const staffNode = doc.createNode('Prop_SarinStaff').setMesh(doc.createMesh('Prop_SarinStaff').addPrimitive(prim(geos, wood)));
  const fwd = new THREE.Vector3(0, 0, 1);
  attach('R', staffNode, ax, fwd.clone().addScaledVector(ax, -fwd.dot(ax)), gripW);
  // 灯笼：缩到 0.15H 高，吊在灯钩末端下方；作为灯杖子节点（随杖走，不分离）
  const ld = await io.read('assets_aholo/dlc1/props/scene_wl_lantern.glb'); await ld.transform(dequantize());
  const ln = ld.getRoot().listNodes().find(n => n.getMesh()); const lp = ln.getMesh().listPrimitives()[0]; const pa = lp.getAttribute('POSITION');
  const M0 = new THREE.Matrix4().fromArray(ln.getWorldMatrix()); const bb = new THREE.Box3(); const tv = new THREE.Vector3(), arr = [];
  for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, arr); bb.expandByPoint(tv.fromArray(arr).applyMatrix4(M0)); }
  const sz = bb.getSize(new THREE.Vector3()); const s = H * 0.15 / sz.y; const hook = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
  const map = mergeDocuments(doc, ld); const lmesh = map.get(ln.getMesh());
  for (const n of ld.getRoot().listNodes()) { const m2 = map.get(n); if (m2) m2.dispose(); }
  for (const sc of ld.getRoot().listScenes()) { const m2 = map.get(sc); if (m2) m2.dispose(); }
  lmesh.setName('Prop_SarinLantern'); const lm = lmesh.listPrimitives()[0].getMaterial(); lm.setName('MI_SarinLantern');
  if (lm.getBaseColorTexture()) { lm.setEmissiveTexture(lm.getBaseColorTexture()); lm.setEmissiveFactor([0.3, 0.95, 0.75]); }
  const hookEnd = new THREE.Vector3(0, top + H * 0.035 - H * 0.012, H * 0.13);   // 灯杖局部
  const Ml = new THREE.Matrix4().compose(hookEnd, new THREE.Quaternion(), new THREE.Vector3(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-hook.x, -hook.y, -hook.z)).multiply(M0);
  const put = (node, M) => { const t = new THREE.Vector3(), r = new THREE.Quaternion(), sc = new THREE.Vector3(); M.decompose(t, r, sc); node.setTranslation(t.toArray()).setRotation(r.toArray()).setScale(sc.toArray()); staffNode.addChild(node); };
  put(doc.createNode('Prop_SarinLantern').setMesh(lmesh), Ml);
  const core = new THREE.SphereGeometry(H * 0.016, 16, 12); const GC = [0.31, 1.0, 0.82];
  const cm = doc.createMaterial('MI_SarinLanternCore').setBaseColorFactor([...GC, 1]).setEmissiveFactor(GC).setRoughnessFactor(1).setMetallicFactor(0);
  const lc = bb.getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().compose(hookEnd, new THREE.Quaternion(), new THREE.Vector3(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-hook.x, -hook.y, -hook.z)));
  put(doc.createNode('Prop_SarinLanternCore').setMesh(doc.createMesh('Prop_SarinLanternCore').addPrimitive(prim([core], cm))), new THREE.Matrix4().makeTranslation(lc.x, lc.y, lc.z));
  rig.apply(FIST); console.log('灯杖长', (L / H).toFixed(2), 'H，灯笼高', (sz.y * s / H).toFixed(2), 'H');
}
// ---- 6. 动画
const tips = { 杖底: () => { const p = rig.props.R; return rig.wp('RightHand').add(p.axis.clone().applyQuaternion(rig.wq('RightHand')).multiplyScalar(-staffLen * E('STAFF_GRIP', 0.6))).sub(new THREE.Vector3(0, Math.min(rig.foot0.L.y, rig.foot0.R.y), 0)); } };
if (process.env.REPORT) for (const l of report(rig, CLIPS, tips)) console.log(l);
for (const l of bake(doc, rig, CLIPS)) console.log('动画', l);
{ const [b0, ...bs] = root.listBuffers(); for (const a of root.listAccessors()) a.setBuffer(b0); for (const b of bs) b.dispose(); }
await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
console.log('✓', out, (statSync(out).size / 1024 | 0) + ' KB', '三角', tris, '骨', joints.length, '动画', root.listAnimations().length);
