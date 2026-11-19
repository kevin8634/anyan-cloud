// raidA 11-02 摆渡双子首领化（0 积分）：骨骼体型 + 身体 / 脸部 2048 重绘贴图 + 长袍下摆（蒙皮 Hips/UpLeg/Leg）+ 船篙与提灯刚性件（挂 RightHand，一体，不分离）
// node tools/rigfine/ferry_boss/build.mjs <in_rigged.glb> <out.glb> <texDir> death|life
// texDir：skin.py 输出 base_<mode>.png nrm_<mode>.png emi_<mode>.png；props.py 输出 robe_* / pole_*；face_base.png face_nrm.png face_emi.png（死渡脸，生渡用 face_life_*）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { readFileSync, statSync, existsSync } from 'fs';
import sharp from 'sharp';
import { IDLE } from './clips.mjs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out, TD, MODE = 'death'] = process.argv.slice(2); const T0 = f => TD.replace(/\/$/, '') + '/' + f; const T = f => { for (const s of ['_v3', '_v2']) { const p = T0(f.replace(/\.png$/, s + '.png')); if (existsSync(p)) return p; } return T0(f); };   // A8fix：hood2.py 的 _v3 优先，其次 hood.py 的 _v2
const doc = await io.read(inp); await doc.transform(dequantize()); const root = doc.getRoot(); const buf = root.listBuffers()[0];
const skin = root.listSkins()[0]; const joints = skin.listJoints();
const J = {}; joints.forEach(n => J[n.getName().replace(/^mixamorig:?/, '')] = n);
const E = (k, d) => process.env[k] ? +process.env[k] : d;
const DEATH = MODE === 'death';
// ---- 1. 体型（首领化：胸背加宽、肩略宽，头不跟着变大；整体身高由游戏 WL_BODY 放大）
const SC = { Spine1: 1.08, Spine2: 1.1, Neck: 0.9, Head: 0.98, LeftShoulder: 1.04, RightShoulder: 1.04, LeftArm: 0.97, RightArm: 0.97, LeftUpLeg: 1.04, RightUpLeg: 1.04 };
for (const [n, s] of Object.entries(SC)) if (J[n]) J[n].setScale([s, s, s]);
// ---- 2. 用 three 复刻节点层级，按待机姿势求右手世界矩阵（刚性件在待机时竖直立地）
const O = new Map();
const mk = n => { const o = new THREE.Object3D(); o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); O.set(n, o); for (const c of n.listChildren()) o.add(mk(c)); return o; };
const scn = new THREE.Object3D(); for (const n of root.listScenes()[0].listChildren()) scn.add(mk(n));
scn.updateMatrixWorld(true);
const restW = n => O.get(n).matrixWorld.clone();
const Pw = n => new THREE.Vector3().setFromMatrixPosition(O.get(n).matrixWorld);
const H = Pw(J.Head).y - Pw(J.LeftFoot).y;
const e = new THREE.Euler(), q = new THREE.Quaternion();
for (const [n, v] of Object.entries(IDLE)) if (n[0] !== '_' && J[n]) { const o = O.get(J[n]); e.set(...v); q.setFromEuler(e); o.quaternion.multiply(q); }
scn.updateMatrixWorld(true);
const ground = Math.min(Pw(J.LeftFoot).y, Pw(J.RightFoot).y) - H * 0.075;
const hand = Pw(J.RightHand), mid = J.RightHandMiddle1 ? Pw(J.RightHandMiddle1) : hand.clone();
const m3 = J.RightHandMiddle3 ? Pw(J.RightHandMiddle3) : mid; const i2 = J.RightHandIndex2 ? Pw(J.RightHandIndex2) : mid;
const grip = mid.clone().lerp(m3, 0.5).lerp(i2, 0.25);   // 握在弯曲的指节之间（拳心）
console.log('高度', H.toFixed(3), '地面', ground.toFixed(3), '握点', grip.toArray().map(v => v.toFixed(3)).join(','));
const handPosedInv = O.get(J.RightHand).matrixWorld.clone().invert();
function attachPosed(node, Mworld) { // Mworld = 待机姿势下的世界矩阵
  const L = handPosedInv.clone().multiply(Mworld); const t = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(); L.decompose(t, r, s);
  node.setTranslation(t.toArray()).setRotation(r.toArray()).setScale(s.toArray()); J.RightHand.addChild(node);
}
const wp = async (f, qy = 90) => sharp(readFileSync(T(f))).webp({ quality: qy, effort: 5 }).toBuffer();
const tex = async (name, f, qy) => doc.createTexture(name).setImage(await wp(f, qy)).setMimeType('image/webp');
const GC = DEATH ? [0.31, 1.0, 0.82] : [1.0, 0.97, 0.9];   // 幽魂绿（0x50f0e0 / 0x60ffd0 一带）/ 生渡暖白
const tag = DEATH ? 'Death' : 'Life';
// ---- 3. 身体 / 脸部贴图
{
  const m = root.listMaterials().find(x => x.getName() === 'Designer_Logic_PBR'); m.setName('MI_Ferry' + tag + 'Body');
  m.getBaseColorTexture().setImage(await wp(`base_${MODE}.png`)).setMimeType('image/webp');
  m.getNormalTexture().setImage(await wp(`nrm_${MODE}.png`, 92)).setMimeType('image/webp');
  m.setEmissiveTexture(await tex('T_Ferry' + tag + '_E', `emi_${MODE}.png`, 88)).setEmissiveFactor([1, 1, 1]);
  const f = root.listMaterials().find(x => x.getName() === 'MI_GordonFace'); f.setName('MI_Ferry' + tag + 'Face');
  const fp = DEATH ? 'face_' : 'face_life_';
  f.getBaseColorTexture().setImage(await wp(fp + 'base.png', 92)).setMimeType('image/webp').setName('T_Ferry' + tag + 'Face');
  f.setNormalTexture(await tex('T_Ferry' + tag + 'Face_N', fp + 'nrm.png', 92)); f.getNormalTextureInfo().setTexCoord(0);
  f.setEmissiveTexture(await tex('T_Ferry' + tag + 'Face_E', fp + 'emi.png', 85)).setEmissiveFactor([1, 1, 1]); f.getEmissiveTextureInfo().setTexCoord(0);
  for (const t of root.listTextures()) if (t.getName() === 'gordon_normal') t.setName('T_Ferry' + tag + '_N');
}
// ---- 3.5 A8fix（11-03，待批第 7 条）：兜帽内沿贴脸 2.5 cm 内身体顶点法线平滑（原网格这里是锯齿尖三角，法线 / 法线贴图里的图集碎片让尖角一明一暗，近景像额角碎片）
{
  const prims = root.listMeshes().flatMap(m => m.listPrimitives()); const body = prims.find(p => /Body/.test(p.getMaterial()?.getName() || '')), face = prims.find(p => /Face/.test(p.getMaterial()?.getName() || ''));
  const neckY = (() => { const i = joints.indexOf(J.Neck); return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i, [])).invert()).y; })();
  const bp = body.getAttribute('POSITION'), bn = body.getAttribute('NORMAL'), fpA = face.getAttribute('POSITION'); const v = [], w = [];
  const FV = []; for (let i = 0; i < fpA.getCount(); i++) { fpA.getElement(i, v); FV.push(v.slice()); }
  const D = E('HOOD_NSM_R', 0.025), cell = D, G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  FV.forEach((p, i) => { const k = key(...p); (G.get(k) || G.set(k, []).get(k)).push(i); });
  const nB = bp.getCount(), sel = new Float32Array(nB), P3 = new Float32Array(nB * 3), N3 = new Float32Array(nB * 3);
  for (let i = 0; i < nB; i++) { bp.getElement(i, v); bn.getElement(i, w); P3.set(v, i * 3); N3.set(w, i * 3); if (v[1] < neckY) continue;
    const cx = Math.floor(v[0] / cell), cy = Math.floor(v[1] / cell), cz = Math.floor(v[2] / cell); let best = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of G.get(`${cx + a},${cy + b},${cz + c}`) || []) { const f = FV[j]; best = Math.min(best, Math.hypot(f[0] - v[0], f[1] - v[1], f[2] - v[2])); }
    if (best < D) sel[i] = Math.min(1, (D - best) / (D * 0.5)); }
  // 邻接（按位置焊接 UV 缝重复顶点）
  const weld = new Map(), wid = new Int32Array(nB); for (let i = 0; i < nB; i++) { const k = `${P3[i * 3].toFixed(5)},${P3[i * 3 + 1].toFixed(5)},${P3[i * 3 + 2].toFixed(5)}`; if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
  const nW = weld.size, adj = Array.from({ length: nW }, () => new Set()); const idx = body.getIndices().getArray();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = wid[idx[t + e]], b = wid[idx[t + (e + 1) % 3]]; if (a !== b) { adj[a].add(b); adj[b].add(a); } }
  let WN = new Float32Array(nW * 3), ws = new Float32Array(nW); for (let i = 0; i < nB; i++) { for (let k = 0; k < 3; k++) WN[wid[i] * 3 + k] += N3[i * 3 + k]; ws[wid[i]] = Math.max(ws[wid[i]], sel[i]); }
  const nrmz = A => { for (let i = 0; i < nW; i++) { const l = Math.hypot(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]) || 1; A[i * 3] /= l; A[i * 3 + 1] /= l; A[i * 3 + 2] /= l; } return A; }; nrmz(WN);
  for (let it = 0; it < E('HOOD_NSM_IT', 6); it++) { const O2 = Float32Array.from(WN); for (let i = 0; i < nW; i++) if (ws[i] > 0) for (const j of adj[i]) for (let k = 0; k < 3; k++) O2[i * 3 + k] += WN[j * 3 + k]; WN = nrmz(O2); }
  let n = 0; for (let i = 0; i < nB; i++) if (sel[i] > 0) { const s2 = sel[i]; for (let k = 0; k < 3; k++) N3[i * 3 + k] = N3[i * 3 + k] * (1 - s2) + WN[wid[i] * 3 + k] * s2; const l = Math.hypot(N3[i * 3], N3[i * 3 + 1], N3[i * 3 + 2]); for (let k = 0; k < 3; k++) N3[i * 3 + k] /= l; n++; }
  // 与脸部顶点重合（< 1.5 mm）的身体顶点 = 插在额头上的尖三角顶点：法线直接取重合的脸部顶点法线，明暗与额头连续
  const fnA = face.getAttribute('NORMAL'); let nc = 0;
  for (let i = 0; i < nB; i++) { if (P3[i * 3 + 1] < neckY) continue; const x = P3[i * 3], y = P3[i * 3 + 1], z = P3[i * 3 + 2]; let bj = -1, bd = 0.0015;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of G.get(`${cx + a},${cy + b},${cz + c}`) || []) { const f = FV[j], d = Math.hypot(f[0] - x, f[1] - y, f[2] - z); if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) { fnA.getElement(bj, w); N3.set(w, i * 3); nc++; } }
  bn.setArray(N3); console.log('兜帽内沿法线平滑顶点', n, '取脸部法线', nc);
}
// ---- 4. 长袍下摆：附加蒙皮 primitive（与身体同 skin），腰（藏进皮带下沿）→ 脚踝，破边 alpha
// v2（Rhett 11-02 09:10）：①顶圈逐角度贴身体实际半径（不再按全圈最大值×0.8 托底，修腰线缝/外扩），顶部几圈权重从最近身体顶点转移；
//   ②下摆半径 = 腰往下逐角度身体半径的累计最大值×1.035+余量，整段包住身体自带外套（修外套从下摆戳出 = 生渡穿模），并把被包住的外套顶点再往里收一点防动作穿出
{
  const meshNode = root.listNodes().find(n => n.getMesh() && n.getSkin()); const mesh = meshNode.getMesh(); const body = mesh.listPrimitives()[0];
  const ibm = skin.getInverseBindMatrices(); const bindP = i => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm.getElement(i, [])).invert());
  const ji = n => joints.indexOf(J[n]);
  const pH = bindP(ji('Hips')), pL = bindP(ji('LeftUpLeg')), pK = bindP(ji('LeftLeg')), pF = bindP(ji('LeftFoot'));
  const pos = body.getAttribute('POSITION'); const NA = 64, NY = 22, cx = pH.x, cz = pH.z; const v = [];
  const y0 = pH.y + (pH.y - pK.y) * E('ROBE_TOP', 0.24), y1 = pF.y - (pK.y - pF.y) * 0.08;
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
  // A8fix（11-03）：皮带下沿是锯齿网格，v2 下摆在皮带下 2.2%→6.2% 才张开，锯齿碎片露在下摆上沿 → 下摆上沿提到皮带下沿以内（0.6%）、1.4% 内张开，用下摆的整齐上沿压住锯齿
  const TOPK = E('ROBE_TOPK', 0.95), BELT_T = E('ROBE_BELT', 0.006), MARG = E('ROBE_MARGIN', 0.006), TRANS = E('ROBE_TRANS', 0.014);
  const radius = (t, a, th) => { const flare = (1 + 0.36 * t * t) * (1 + 0.05 * t * Math.sin(th * 7 + 1.3) + 0.03 * t * Math.sin(th * 13));
    const enc = runAt(t, a) * 1.035 + MARG;            // 必须包住外套
    if (t <= BELT_T) return top[a] * TOPK;              // 顶圈藏在皮带里（皮带压住下摆上沿）
    const w = Math.min(1, (t - BELT_T) / TRANS);         // 皮带下沿 → 包络 的过渡
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
  { let moved = 0, wbl = 0; const tmax = E('COAT_TMAX', 0.62), tmin = E('COAT_TMIN', 0.012), LIM = E('COAT_LIM', 0.85), KEEP = E('COAT_KEEP', 0.25);   // A8fix：生渡右胯外套布片动作中仍露 → 收得更深（88%→85% 半径、保留 35%→25%）、上沿从 3% 提到 1.2%
    for (let i = 0; i < nV; i++) { const x = VX[i * 3], y = VX[i * 3 + 1], z = VX[i * 3 + 2]; const t = (y0 - y) / (y0 - y1); if (t < tmin || t > tmax) continue;
      const tt = Math.pow(t, 1 / 1.35) * NY, jr = Math.min(NY - 1, Math.floor(tt)), u = tt - jr; const a = sect(x, z); const rr = RR[jr][1][a] * (1 - u) + RR[jr + 1][1][a] * u;
      const r = Math.hypot(x - cx, z - cz), lim = rr * LIM; if (r <= lim) continue;
      const fade = Math.min(1, (t - tmin) / 0.03, (tmax - t) / 0.08); const nr = r - (r - (lim + (r - lim) * KEEP)) * fade; const s3 = nr / r;
      VX[i * 3] = cx + (x - cx) * s3; VX[i * 3 + 2] = cz + (z - cz) * s3; moved++;
      // 11-03：只收半径不够——后摆腿时下摆随大腿走、外套还挂 Hips，前侧外套从下摆里露出（试动 GIF）→ 被包住的外套权重向同位置下摆权重混合，两层一起动
      const WB = E('COAT_WBLEND', 1) * fade; if (WB > 0) { BJ.getElement(i, jv); BW.getElement(i, wv); const acc = {};
        for (let k = 0; k < 4; k++) if (wv[k] > 0) acc[jv[k]] = (acc[jv[k]] || 0) + wv[k] * (1 - WB);
        for (const [jj, uu] of [[jr, 1 - u], [jr + 1, u]]) { const kk = (jj * (NA + 1) + a) * 4; for (let k = 0; k < 4; k++) if (WT[kk + k] > 0) acc[JN[kk + k]] = (acc[JN[kk + k]] || 0) + WT[kk + k] * uu * WB; }
        const t4 = Object.entries(acc).sort((p2, q2) => q2[1] - p2[1]).slice(0, 4); while (t4.length < 4) t4.push([iH, 0]); const sw = t4.reduce((q2, e2) => q2 + e2[1], 0);
        BJ.setElement(i, t4.map(e2 => +e2[0])); BW.setElement(i, t4.map(e2 => e2[1] / sw)); wbl++; } }
    pos.setArray(VX); console.log('外套收紧顶点', moved, '权重混合', wbl); }
  const ac = (t, arr) => doc.createAccessor().setType(t).setArray(arr).setBuffer(buf);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(IDX); g.computeVertexNormals(); g.computeTangents();
  const prim = doc.createPrimitive().setAttribute('POSITION', ac('VEC3', new Float32Array(P))).setAttribute('NORMAL', ac('VEC3', new Float32Array(g.attributes.normal.array)))
    .setAttribute('TANGENT', ac('VEC4', new Float32Array(g.attributes.tangent.array))).setAttribute('TEXCOORD_0', ac('VEC2', new Float32Array(UV)))
    .setAttribute('JOINTS_0', ac('VEC4', new Uint16Array(JN))).setAttribute('WEIGHTS_0', ac('VEC4', new Float32Array(WT))).setIndices(ac('SCALAR', new Uint32Array(IDX)));
  const m = doc.createMaterial('MI_Ferry' + tag + 'Robe').setDoubleSided(true).setAlphaMode('MASK').setAlphaCutoff(0.5).setRoughnessFactor(0.9).setMetallicFactor(0)
    .setBaseColorTexture(await doc.createTexture('T_Robe' + tag).setImage(await sharp(readFileSync(T(`robe_${MODE}_base.png`))).webp({ quality: 90, alphaQuality: 90 }).toBuffer()).setMimeType('image/webp'))
    .setNormalTexture(await tex('T_Robe_N', 'robe_nrm.png', 90)).setEmissiveTexture(await tex('T_Robe' + tag + '_E', `robe_${MODE}_emi.png`, 85)).setEmissiveFactor([1, 1, 1]);
  prim.setMaterial(m); mesh.addPrimitive(prim); console.log('下摆 三角', IDX.length / 3, '顶圈半径', Math.min(...top).toFixed(3), '-', Math.max(...top).toFixed(3));
}
// ---- 5. 船篙（程序化，木纹贴图 + 铁箍 + 篙尖）+ 提灯（复用 scene_wl_lantern）一体挂右手；待机时竖直立地
{
  const L = H * 1.32, gripT = (grip.y - ground) / L; const geos = [], metal = [];
  const add = (arr, geo, m) => { geo.applyMatrix4(m); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); arr.push(geo.index ? geo.toNonIndexed() : geo); };
  const I = () => new THREE.Matrix4();
  // 局部系：原点 = 握点，+Y 向上
  const shaft = new THREE.CylinderGeometry(H * 0.011, H * 0.014, L, 12, 8); { const p = shaft.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const w = 1 + 0.06 * Math.sin(y / L * 37) * Math.sin(y / L * 11); p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w); } }
  add(geos, shaft, I().setPosition(0, L / 2 - gripT * L, 0));
  for (const [t, r] of [[0.06, 0.017], [0.55, 0.016], [0.93, 0.014]]) add(metal, new THREE.CylinderGeometry(H * r, H * r, H * 0.025, 14), I().setPosition(0, t * L - gripT * L, 0));
  add(metal, new THREE.ConeGeometry(H * 0.016, H * 0.07, 12), I().makeRotationX(Math.PI).setPosition(0, -gripT * L - H * 0.03, 0));   // 篙尖铁钉
  // 灯钩：杆顶向前弯出的铁臂
  const top = L * (1 - gripT);
  const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, top - H * 0.02, 0), new THREE.Vector3(0, top + H * 0.03, H * 0.04), new THREE.Vector3(0, top + H * 0.035, H * 0.1), new THREE.Vector3(0, top + H * 0.005, H * 0.13)]);
  add(metal, new THREE.TubeGeometry(arm, 24, H * 0.006, 8, false), I());
  const mkPrim = (arr, mat) => { const G = mergeGeometries(arr); G.computeVertexNormals(); const ac = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
    const p = doc.createPrimitive().setAttribute('POSITION', ac('VEC3', new Float32Array(G.attributes.position.array))).setAttribute('NORMAL', ac('VEC3', new Float32Array(G.attributes.normal.array)));
    if (G.attributes.uv) p.setAttribute('TEXCOORD_0', ac('VEC2', new Float32Array(G.attributes.uv.array))); return p.setMaterial(mat); };
  const wood = doc.createMaterial('MI_Ferry' + tag + 'Pole').setRoughnessFactor(0.72).setMetallicFactor(0).setBaseColorTexture(await tex('T_Pole' + tag, `pole_${MODE}_base.png`)).setNormalTexture(await tex('T_Pole_N', 'pole_nrm.png'));
  const iron = doc.createMaterial('MI_FerryIron').setBaseColorFactor(DEATH ? [0.16, 0.19, 0.17, 1] : [0.42, 0.42, 0.4, 1]).setMetallicFactor(0.8).setRoughnessFactor(0.55).setEmissiveFactor(DEATH ? [0.01, 0.045, 0.035] : [0, 0, 0]);
  const pm = doc.createMesh('Prop_FerryPole').addPrimitive(mkPrim(geos, wood)).addPrimitive(mkPrim(metal, iron));
  const Mw = new THREE.Matrix4().makeTranslation(grip.x, grip.y, grip.z);
  // 篙杆稍微外倾（不贴身），朝向待机时角色右前方
  Mw.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(E('POLE_X', 0.06), 0, E('POLE_Z', -0.05))));
  attachPosed(doc.createNode('Prop_FerryPole').setMesh(pm), Mw);
  // 提灯：场景件 scene_wl_lantern，按包围盒缩到 0.13H 高，吊在灯钩末端下方
  const ld = await io.read('assets_aholo/dlc1/props/scene_wl_lantern.glb'); await ld.transform(dequantize());
  const ln = ld.getRoot().listNodes().find(n => n.getMesh()); const lp = ln.getMesh().listPrimitives()[0]; const pa = lp.getAttribute('POSITION');
  const M0 = new THREE.Matrix4().fromArray(ln.getWorldMatrix()); const bb = new THREE.Box3(); const tv = new THREE.Vector3(), arr = [];
  for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, arr); bb.expandByPoint(tv.fromArray(arr).applyMatrix4(M0)); }
  const sz = bb.getSize(new THREE.Vector3()); const s = H * 0.13 / sz.y; const hook = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
  const map = mergeDocuments(doc, ld); const lmesh = map.get(ln.getMesh());
  for (const n of ld.getRoot().listNodes()) { const m2 = map.get(n); if (m2) m2.dispose(); }
  for (const sc of ld.getRoot().listScenes()) { const m2 = map.get(sc); if (m2) m2.dispose(); }
  lmesh.setName('Prop_FerryLantern'); const lm = lmesh.listPrimitives()[0].getMaterial(); lm.setName('MI_Ferry' + tag + 'Lantern');
  if (lm.getBaseColorTexture()) { lm.setEmissiveTexture(lm.getBaseColorTexture()); lm.setEmissiveFactor(DEATH ? [0.35, 1.0, 0.75] : [1.0, 0.92, 0.75]); }
  // 灯芯：小球，纯自发光
  const core = new THREE.SphereGeometry(H * 0.014, 16, 12); const cm = doc.createMaterial('MI_Ferry' + tag + 'LanternCore').setBaseColorFactor([...GC, 1]).setEmissiveFactor(GC).setRoughnessFactor(1).setMetallicFactor(0);
  const ac = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
  const cprim = doc.createPrimitive().setAttribute('POSITION', ac('VEC3', new Float32Array(core.toNonIndexed().attributes.position.array))).setAttribute('NORMAL', ac('VEC3', new Float32Array(core.toNonIndexed().attributes.normal.array))).setMaterial(cm);
  const hookEnd = new THREE.Vector3(0, top + H * 0.005, H * 0.13).applyMatrix4(Mw);
  const Ml = new THREE.Matrix4().compose(hookEnd.clone().sub(new THREE.Vector3(0, H * 0.012, 0)), new THREE.Quaternion(), new THREE.Vector3(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-hook.x, -hook.y, -hook.z)).multiply(M0);
  attachPosed(doc.createNode('Prop_FerryLantern').setMesh(lmesh), Ml);
  const lc = bb.getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().compose(hookEnd.clone().sub(new THREE.Vector3(0, H * 0.012, 0)), new THREE.Quaternion(), new THREE.Vector3(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-hook.x, -hook.y, -hook.z)));
  attachPosed(doc.createNode('Prop_FerryLanternCore').setMesh(doc.createMesh('Prop_FerryLanternCore').addPrimitive(cprim)), new THREE.Matrix4().makeTranslation(lc.x, lc.y, lc.z));
  console.log('船篙长', L.toFixed(3), '提灯高', (sz.y * s).toFixed(3), '杆三角', (mergeGeometries(geos).attributes.position.count + mergeGeometries(metal).attributes.position.count) / 3 | 0);
}
{ const [b0, ...bs] = root.listBuffers(); for (const a of root.listAccessors()) a.setBuffer(b0); for (const b of bs) b.dispose(); }
await io.write(out, doc);
console.log('✓', out, (statSync(out).size / 1024 | 0) + ' KB');
