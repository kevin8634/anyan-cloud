// raidA A9（11-04）首领逐招骨骼动作烘焙 + 压预算（0 积分，纯本地）
// node tools/rigfine/a9/bake.mjs <gordon|sarin|virg|ferry_death|ferry_life> [--report] [--pilot-out <path>]
//   输入：assets_aholo/dlc1/creatures_pilot/wl_<id>_boss.glb（Lux3D 正式绑骨 mixamo 52 骨 + 首领化 + 刚性件母版）
//   关键帧：tools/rigfine/a9/clips_<id>.mjs（CLIPS / PROPS；约定见 ../virg_boss/anim.mjs 文件头：骨局部 = 绑定 × 欧拉偏移、_hip 胯部位移、_lf/_rf 脚踝 IK、_R/_L 道具朝向）
//   输出：assets_aholo/dlc1/creatures/wl_<id>_boss.glb —— 旧动画全部删掉重烘；贴图按首领预算（Rhett 11-03 第 8 条：底色 2048（身体 / 脸）、法线 / 自发光 1024、金属粗糙度 512）；meshopt 量化压缩
//   片段 extras：{ zh 中文名, hit 出手（伤害结算）时刻, dur, loop }，游戏 boss_glb.ts 读 extras 把 hit 对齐到红圈 / 读条结束那一帧
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, reorder, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import sharp from 'sharp';
import { statSync, writeFileSync } from 'fs';
import { Rig, bake, report } from '../virg_boss/anim.mjs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const id = process.argv[2]; const REPORT = process.argv.includes('--report'); const po = process.argv.indexOf('--pilot-out');
const inp = `assets_aholo/dlc1/creatures_pilot/wl_${id}_boss.glb`, out = process.env.OUT || `assets_aholo/dlc1/creatures/wl_${id}_boss.glb`;
const { CLIPS, PROPS = {} } = await import(`./clips_${id}.mjs`);
const doc = await io.read(inp); await doc.transform(dequantize()); const root = doc.getRoot();
for (const a of root.listAnimations()) { for (const s of a.listSamplers()) { s.getInput()?.dispose?.(); } a.dispose(); }
const skin = root.listSkins()[0], joints = skin.listJoints(), names = joints.map(n => n.getName().replace(/^mixamorig:?/, ''));
const rig = new Rig(root, names); rig.snapFootRest();
// 刚性件主轴：挂在手骨下的 Prop_* 节点，局部 +Y = 主轴、+Z = 法线（virg / sarin / gordon build.mjs attach 约定；摆渡同）
for (const n of root.listNodes()) {
  const nm = n.getName(); if (!/^Prop_/.test(nm)) continue;
  const par = joints.find(j => j.listChildren().includes(n)); if (!par) continue;
  const pn = par.getName().replace(/^mixamorig:?/, ''), s = pn === 'RightHand' ? 'R' : pn === 'LeftHand' ? 'L' : null; if (!s) continue;
  if (PROPS[s] && PROPS[s] !== nm) continue; if (rig.props[s] && !PROPS[s]) continue;
  const q = new THREE.Quaternion().fromArray(n.getRotation());
  rig.props[s] = { axis: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(), nrm: new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize(), node: nm, t: new THREE.Vector3().fromArray(n.getTranslation()) };
}
// 摆渡：提灯与船篙同挂右手 → _R.n 用「提灯偏离篙轴的方向」，关键帧里直接指定提灯在篙的哪一侧（待批第 9 条：突刺预备提灯别贴右胯）
for (const s of ['R', 'L']) { const nn = PROPS['nrm' + s]; if (!nn || !rig.props[s]) continue; const a = root.listNodes().find(n => n.getName() === nn), b = root.listNodes().find(n => n.getName() === rig.props[s].node);
  const d = new THREE.Vector3().fromArray(a.getTranslation()).sub(new THREE.Vector3().fromArray(b.getTranslation())); const ax = rig.props[s].axis; d.addScaledVector(ax, -d.dot(ax)).normalize(); rig.props[s].nrm = d; }
// 戈尔顿：锚 / 钩链是 T 字时沿手臂方向挂上的（gordon_boss/build.mjs grip().dir），主轴 = 绑定姿势下 前臂→手 方向
for (const s of ['R', 'L']) if (PROPS['arm' + s]) { const P = s === 'R' ? 'Right' : 'Left'; rig.rest(); const qh = rig.wq(P + 'Hand').invert();
  const dir = rig.wp(P + 'Hand').sub(rig.wp(P + 'ForeArm')).normalize(); rig.props[s] = { axis: dir.applyQuaternion(qh), nrm: new THREE.Vector3(0, 0, 1).applyQuaternion(qh), node: PROPS['arm' + s] }; }
console.log('刚性件', Object.entries(rig.props).map(([s, p]) => `${s}:${p.node}`).join(' '), '身高(模型单位)', rig.H.toFixed(3));
if (REPORT) {
  const tip = (s, len) => () => { const p = rig.props[s]; const hand = s === 'R' ? 'RightHand' : 'LeftHand'; return rig.wp(hand).add(p.axis.clone().applyQuaternion(rig.wq(hand)).multiplyScalar(len * rig.H)).sub(new THREE.Vector3(0, Math.min(rig.foot0.L.y, rig.foot0.R.y), 0)); };
  const tips = {}; for (const [s, p] of Object.entries(rig.props)) { tips[p.node + '+'] = tip(s, PROPS['len' + s] ?? 0.5); tips[p.node + '-'] = tip(s, -(PROPS['back' + s] ?? 0.2)); }
  for (const n of root.listNodes()) { const nm = n.getName(); if (!/^Prop_.*(Lantern|Core)$/.test(nm) || /Core/.test(nm)) continue; const par = joints.find(j => j.listChildren().includes(n)); if (!par) continue;
    const hb = rig.B[par.getName().replace(/^mixamorig:?/, '')], T = new THREE.Vector3().fromArray(n.getTranslation()); tips[nm.replace('Prop_', '')] = () => hb.localToWorld(T.clone()).sub(new THREE.Vector3(0, Math.min(rig.foot0.L.y, rig.foot0.R.y), 0)); }
  for (const l of report(rig, CLIPS, tips)) console.log(l);
}
const lines = bake(doc, rig, CLIPS); for (const l of lines) console.log('动画', l);
if (po > 0) { await io.write(process.argv[po + 1], doc); }
// ---- 首领预算（与 tools/rigfine/ferry_boss/budget.mjs 同口径，材质名放宽到戈尔顿的 Designer_Logic_PBR / MI_GordonFace）
const SLOT = [['base', 'getBaseColorTexture'], ['nrm', 'getNormalTexture'], ['emi', 'getEmissiveTexture'], ['mr', 'getMetallicRoughnessTexture']];
function target(slots) {
  let size = 0, q = 90;
  for (const s of slots) {
    const [mat, k] = s.split(':'); let z;
    if (/Lantern/.test(mat)) z = k === 'mr' ? 256 : 512;
    else if (k === 'base' && /Body|Face|Designer_Logic_PBR/.test(mat)) { z = 2048; q = 92; }
    else if (k === 'nrm') { z = 1024; q = Math.max(q, 92); }
    else if (k === 'emi') z = 1024;
    else if (k === 'mr') z = 512;
    else z = 1024;
    size = Math.max(size, z);
  }
  return { size, q };
}
let before = 0, after = 0; const texLog = [];
for (const t of root.listTextures()) {
  const slots = []; for (const m of root.listMaterials()) for (const [k, f] of SLOT) if (m[f]() === t) slots.push(m.getName() + ':' + k);
  if (!slots.length) continue;
  const img = Buffer.from(t.getImage()), md = await sharp(img).metadata(), { size, q } = target(slots); const z = Math.min(md.width, size);
  const nb = z === md.width ? img : await sharp(img).resize(z, Math.round(z * md.height / md.width), { kernel: 'lanczos3' }).webp({ quality: q, effort: 6, ...(md.hasAlpha ? { alphaQuality: 92 } : {}) }).toBuffer();
  before += img.length; after += nb.length; if (nb !== img) t.setImage(nb).setMimeType('image/webp');
  texLog.push(`${slots.join(',')} ${md.width}→${z}`);
}
await doc.transform(prune(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
let tri = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tri += (p.getIndices()?.getCount() ?? 0) / 3;
console.log(texLog.join('\n'));
console.log(`✓ ${out} 贴图 ${(before / 1024) | 0}→${(after / 1024) | 0} KB；三角 ${tri}；${root.listAnimations().length} 段动画；文件 ${(statSync(inp).size / 1024) | 0}→${(statSync(out).size / 1024) | 0} KB`);
writeFileSync(`tools/rigfine/a9/out_${id}.json`, JSON.stringify({ clips: Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, { zh: c.name, hit: c.hit ?? null, dur: c.k.at(-1)[0], loop: !!c.loop }])), tex: texLog, tri, kb: (statSync(out).size / 1024) | 0 }, null, 1));
