// 11-11 I13（07 桌面版）：Lux3D 场景件 / 怪物批量「锁 UV 接缝」重减面（tools/lux3d-reseam.mjs 的批量版）
//   根因同 fix1109 #3：tools/lux3d.mjs postProcess 的 Permissive 减面允许跨 UV 接缝塌边 → 三角形 UV 横跨多个图集碎岛 → 贴图拉丝 / 撕裂。
//   这里：原件（/workspace/work/lux3d_raw/<任务>/*.glb，只取件 0 积分）→ weld + dedup → 锁接缝减面到现有件同面数
//         → 贴图缩到现有件同尺寸（不增加显存）webp q90 → meshopt；包围盒与现有件对比（>3% 不替换，列出来人工看）。
//   指标 uvBad：UV 面积 / 3D 面积 > 10× 中位数的三角形占 3D 面积的百分比（已修的 scene_camp_wreckwall = 0%）。
//   node tools/lux3d-reseam-batch.mjs <taskmap.json> <输出目录> [--only=正则] [--apply]
//     --apply：通过检查的直接写回 assets_aholo/<rel>（不加则只写输出目录）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, meshopt, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier } from 'meshoptimizer-next';
import sharp from 'sharp';
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const [mapFile, outDir] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const apply = process.argv.includes('--apply');
const RAW = process.env.LUX3D_RAW_DIR || '/workspace/work/lux3d_raw';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const tris = d => d.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
export function uvBad(doc) {
  const ks = []; let A = 0; const a = [], b = [], c = [], ua = [], ub = [], uc = [];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const P = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_0'), I = p.getIndices(); if (!U) continue;
    const n = I ? I.getCount() : P.getCount();
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = I ? I.getScalar(i) : i, i1 = I ? I.getScalar(i + 1) : i + 1, i2 = I ? I.getScalar(i + 2) : i + 2;
      P.getElement(i0, a); P.getElement(i1, b); P.getElement(i2, c); U.getElement(i0, ua); U.getElement(i1, ub); U.getElement(i2, uc);
      const ex = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ey = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ar = Math.hypot(ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]) / 2;
      const uvA = Math.abs((ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1])) / 2;
      if (ar > 0) { ks.push([uvA / ar, ar]); A += ar; }
    }
  }
  const s = ks.map(x => x[0]).sort((x, y) => x - y), med = s[s.length >> 1] || 1; let bad = 0;
  for (const [k, ar] of ks) if (k > 10 * med) bad += ar;
  return A ? +(100 * bad / A).toFixed(1) : 0;
}
const texMax = async d => { let m = 0; for (const t of d.getRoot().listTextures()) { const s = t.getSize(); if (s) m = Math.max(m, s[0], s[1]); else { try { const i = await sharp(Buffer.from(t.getImage())).metadata(); m = Math.max(m, i.width, i.height); } catch {} } } return m || 1024; };
const bbox = d => { const sc = d.getRoot().getDefaultScene() ?? d.getRoot().listScenes()[0]; const b = getBounds(sc); return b.max.map((x, i) => x - b.min[i]); };

const map = JSON.parse(readFileSync(mapFile, 'utf8')); const report = [];
for (const [rel, idss] of Object.entries(map)) {
  if (only && !new RegExp(only).test(rel)) continue;
  let ids = [...new Set(idss.flat())]; if (rel === 'dlc1/props/scene_wl_ferry_boat.glb') ids = ['4631407'];
  if (ids.length !== 1 || !(rel.startsWith('creatures/') || rel.startsWith('dlc1/props/') || rel.startsWith('dlc1/creatures/')) || rel === 'dlc1/props/scene_camp_wreckwall.glb') continue;
  const dir = join(RAW, ids[0]); const raw = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.glb')).map(f => join(dir, f))[0] : null;
  if (!raw) { report.push({ rel, task: ids[0], status: '无原件' }); continue; }
  try {
    const cur = await io.read(join('assets_aholo', rel)); const target = Math.round(tris(cur)), tex = await texMax(cur), curBad = uvBad(cur), cb = bbox(cur);
    const doc = await io.read(raw); const before = Math.round(tris(doc));
    await doc.transform(weld(), dedup());
    for (const error of [0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2, 0.3]) {
      const n = tris(doc); if (n <= target * 1.1) break;
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / n), error, lockBorder: false }));
    }
    await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 90 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const out = join(outDir, rel); mkdirSync(dirname(out), { recursive: true }); await io.write(out, doc);
    const nb = bbox(doc), dev = Math.max(...nb.map((x, i) => Math.abs(x - cb[i]) / Math.max(1e-6, Math.max(...cb))));
    const newBad = uvBad(await io.read(out)), after = Math.round(tris(doc));
    const ok = dev < 0.03 && newBad < Math.min(curBad, 3) && after <= target * 1.5;
    if (ok && apply) copyFileSync(out, join('assets_aholo', rel));
    report.push({ rel, task: ids[0], status: ok ? (apply ? '已替换' : '通过') : '待看', raw: before, cur: target, after, tex, bboxDev: +(dev * 100).toFixed(1), uvBadOld: curBad, uvBadNew: newBad, kbOld: Math.round(statSync(join('assets_aholo', rel)).size / 1024), kbNew: Math.round(statSync(out).size / 1024) });
  } catch (e) { report.push({ rel, task: ids[0], status: '出错 ' + String(e.message).slice(0, 80) }); }
  console.log(JSON.stringify(report.at(-1)));
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
