// v1.2.54 角色高清回填（零积分）：Lux3D G1 原件（约 10 万面，任务结果可按 taskId 免费重下）替换已绑骨游戏件的网格，
// 蒙皮权重从现有绑骨件按最近 4 点反距离传递；骨架 / 骨名 / 材质名 / 贴图沿用游戏件（贴图已是 2048）。
// 起因：游戏件为绑骨减到 3 万面，面部出现碎面 / 缺口（Rhett 10-29：法师脸粗糙）。
// 用法：node tools/lux3d-hdskin.mjs <原件 textured.glb> <游戏件 LUX_X.glb> <输出.glb> [--faces 0(不减)]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, meshopt, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { statSync } from 'fs';
const args = process.argv.slice(2), o = {}, pos = [];
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i]; else pos.push(args[i]);
const [srcHi, srcGame, out] = pos;
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const hiDoc = await io.read(srcHi), game = await io.read(srcGame);
const faces = Number(o.faces || 0);
if (faces) { await hiDoc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, faces / (hiDoc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3)), error: 0.0005, lockBorder: true })); }
const hp = hiDoc.getRoot().listMeshes()[0].listPrimitives()[0];
const gNode = game.getRoot().listNodes().find(n => n.getMesh() && n.getSkin());
const gp = gNode.getMesh().listPrimitives()[0];
const bb = a => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } return { mn, mx }; };
const HP = hp.getAttribute('POSITION'), GP = gp.getAttribute('POSITION');
const hb = bb(HP), gb = bb(GP);
const s = (gb.mx[1] - gb.mn[1]) / (hb.mx[1] - hb.mn[1]);
const hc = hb.mn.map((m, k) => (m + hb.mx[k]) / 2), gc = gb.mn.map((m, k) => (m + gb.mx[k]) / 2);
console.log('缩放', s.toFixed(4), 'x 宽比', (((gb.mx[0] - gb.mn[0]) / (hb.mx[0] - hb.mn[0])) / s).toFixed(3), 'z 深比', (((gb.mx[2] - gb.mn[2]) / (hb.mx[2] - hb.mn[2])) / s).toFixed(3));
// 游戏件顶点 → 网格哈希
const GJ = gp.getAttribute('JOINTS_0'), GW = gp.getAttribute('WEIGHTS_0');
const nG = GP.getCount(), gpos = new Float32Array(nG * 3), v = [0, 0, 0];
for (let i = 0; i < nG; i++) { GP.getElement(i, v); gpos.set(v, i * 3); }
const C = 0.03, key = (x, y, z) => `${Math.floor(x / C)},${Math.floor(y / C)},${Math.floor(z / C)}`, grid = new Map();
for (let i = 0; i < nG; i++) { const k = key(gpos[i * 3], gpos[i * 3 + 1], gpos[i * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
const nH = HP.getCount(), npos = new Float32Array(nH * 3), J = new Uint16Array(nH * 4), W = new Float32Array(nH * 4);
const HN = hp.getAttribute('NORMAL'), nn = HN ? new Float32Array(nH * 3) : null;
const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
let far = 0;
for (let i = 0; i < nH; i++) {
  HP.getElement(i, v); const x = (v[0] - hc[0]) * s + gc[0], y = (v[1] - hc[1]) * s + gc[1], z = (v[2] - hc[2]) * s + gc[2];
  npos.set([x, y, z], i * 3); if (HN) { HN.getElement(i, v); nn.set(v, i * 3); }
  const cx = Math.floor(x / C), cy = Math.floor(y / C), cz = Math.floor(z / C), best = [];
  for (let r = 1; r <= 4 && best.length < 4; r++) { best.length = 0;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) { const l = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!l) continue;
      for (const g of l) { const d = (gpos[g * 3] - x) ** 2 + (gpos[g * 3 + 1] - y) ** 2 + (gpos[g * 3 + 2] - z) ** 2; best.push([d, g]); } } }
  best.sort((p, q) => p[0] - q[0]); const near = best.slice(0, 4); if (near[0] && near[0][0] > 0.0004) far++;
  const acc = new Map();
  for (const [d, g] of near) { const f = 1 / (Math.sqrt(d) + 1e-4); GJ.getElement(g, jj); GW.getElement(g, ww); for (let k = 0; k < 4; k++) if (ww[k] > 0) acc.set(jj[k], (acc.get(jj[k]) || 0) + ww[k] * f); }
  const top = [...acc].sort((p, q) => q[1] - p[1]).slice(0, 4), sum = top.reduce((t, p) => t + p[1], 0) || 1;
  top.forEach(([j, w], k) => { J[i * 4 + k] = j; W[i * 4 + k] = w / sum; });
}
console.log('顶点', nH, '远离游戏件(>2cm)', far);
const acc = (type, arr, n) => game.createAccessor().setType(type).setArray(arr).setBuffer(game.getRoot().listBuffers()[0]);
const HI = hp.getIndices(), idx = new Uint32Array(HI.getCount()); for (let i = 0; i < idx.length; i++) idx[i] = HI.getScalar(i);
const HT = hp.getAttribute('TEXCOORD_0'), uv = new Float32Array(nH * 2), t2 = [0, 0]; for (let i = 0; i < nH; i++) { HT.getElement(i, t2); uv.set(t2, i * 2); }
gp.setIndices(acc('SCALAR', idx)).setAttribute('POSITION', acc('VEC3', npos)).setAttribute('TEXCOORD_0', acc('VEC2', uv))
  .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W));
if (nn) gp.setAttribute('NORMAL', acc('VEC3', nn));
// 贴图：原件与游戏件同一张 UV 图集（均 2048）；用原件贴图，避免游戏件重烘带来的偏差
const hm = hp.getMaterial(), gm = gp.getMaterial();
const copyTex = (getter, setter) => { const t = hm[getter](); if (!t) return; const nt = game.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType()); gm[setter](nt); };
copyTex('getBaseColorTexture', 'setBaseColorTexture'); copyTex('getMetallicRoughnessTexture', 'setMetallicRoughnessTexture'); copyTex('getNormalTexture', 'setNormalTexture');
const { textureCompress } = await import('@gltf-transform/functions'); const sharp = (await import('sharp')).default;
await game.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 88 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, game);
console.log('OK', out, (statSync(out).size / 1024 | 0) + ' KB');
