// 11-17g 植被遗留（含 DLC）（树叶卡逐张稀疏 / 灌丛整丛稀疏 / 远处花低模）编译自查（无头小页，不加载游戏）：node test/veg_layer_compile.mjs
//   中 / 高两档各建一小片原野（草 + 花 + 白桦 / 枫 / 云杉 + 灌丛），开阴影渲两帧：主色 + 阴影深度着色器都必须编译通过；
//   另查树叶几何带 aCard（卡中心 + 哈希），花的远处低模三角数 < 近处的 60%。
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'vgl_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { presetQuality } from '${ROOT}src/web/gfx';
import { buildFieldFlora } from '${ROOT}src/web/field_flora';
import { cineWind } from '${ROOT}src/web/cine';
import { makeGrassHD, makeFlowersHD, makeTreeHD } from '${ROOT}src/dlc/dlc1/flora_hd';
(window as any).run = (q: string) => {
  presetQuality(q as any);
  const errs: string[] = []; const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv }); r.debug.checkShaderErrors = true; r.shadowMap.enabled = true;
  r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(vs) || '') + String(gl.getShaderInfoLog(fs) || '') + String(gl.getProgramInfoLog(p) || ''));
  const sc = new THREE.Scene(); const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(30, 40, 20); sun.castShadow = true; sc.add(sun, new THREE.HemisphereLight());
  const trees = [] as any[]; for (let i = 0; i < 12; i++) trees.push({ x: -60 + i * 10, z: -40 - (i % 3) * 25, kind: (['birch', 'maple', 'spruce'] as const)[i % 3], s: 1, ry: i });
  const g = buildFieldFlora({ id: 't' + q, area: [-60, -120, 60, 0], ground: () => 0, grassW: () => 1,
    grass: [{ count: 3000, seed: 3, hMin: 0.3, hMax: 0.8, dry: 0.3 }], flowers: { count: 800, seed: 5, kinds: [['daisy', 1], ['lupine', 1], ['poppy', 1]] },
    trees, shrubs: { count: 200, seed: 7, w: () => 1 } });
  sc.add(g);
  // DLC 写实草木：叶缘逆光 + 岸边分网格（x < 0 算岸边）
  const dg = makeGrassHD({ count: 4000, area: [-20, -30, 20, -5], ground: () => 0, seed: 9, shore: (x: number) => x < 0 });
  const df = makeFlowersHD({ count: 400, area: [-20, -30, 20, -5], ground: () => 0, seed: 11, shore: (x: number) => x < 0 });
  const dt = makeTreeHD({ seed: 3, height: 7 }); dt.position.set(6, 0, -20); sc.add(dg, df, dt);
  { const bl = new THREE.PlaneGeometry(0.05, 0.5); bl.translate(0, 0.25, 0); const tw = new THREE.InstancedMesh(bl, cineWind(new THREE.MeshToonMaterial({ color: 0x88aa44 }), 0.09), 500);
    const mm = new THREE.Matrix4(); for (let i = 0; i < 500; i++) tw.setMatrixAt(i, mm.makeTranslation((i % 25) - 12, 0, -5 - Math.floor(i / 25))); sc.add(tw); }   // 营地 / 野外 toon 草（cineWind 新风场）
  let shoreN = 0, shoreRefl = 0; for (const o of [...dg.children, ...df.children] as any[]) if (o.name.endsWith('_shore')) { shoreN++; if (o.userData.refl) shoreRefl++; }
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 700); cam.position.set(0, 1.7, 0); cam.lookAt(0, 1.5, -50); cam.updateMatrixWorld();
  r.render(sc, cam); r.render(sc, cam);
  let aCard = 0, leaves = 0, flHi = 0, flLo = 0;
  g.traverse((o: any) => { if (!o.isInstancedMesh) return; const n = o.name as string, tri = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (n.startsWith('ff_tree_leaves_') && !n.endsWith('shrub')) { leaves++; if (o.geometry.attributes.aCard) aCard++; }
    if (n.startsWith('ff_flower_')) { if (n.endsWith('_lo')) flLo += tri; else flHi += tri; } });
  const gl = r.getContext(); const res = { q, errs, glErr: gl.getError(), aCard, leaves, flHi, flLo, progs: r.info.programs?.length ?? 0, shoreN, shoreRefl };
  r.dispose(); cv.remove(); return res; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')], loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' } });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + join(d, 'p.html')); await page.waitForTimeout(500);
let fail = 0;
for (const q of ['medium', 'high']) {
  const r = await page.evaluate(q => window.run(q), q);
  const ok = !r.errs.length && !errors.length && !r.glErr && r.leaves > 0 && r.aCard === r.leaves && r.flLo > 0 && r.flLo < r.flHi * 0.6 && r.shoreN === 4 && r.shoreRefl === 4;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${q}: 树叶网格 ${r.leaves}（带 aCard ${r.aCard}）花三角 近 ${r.flHi} / 远 ${r.flLo}（${(r.flLo / Math.max(1, r.flHi) * 100).toFixed(0)}%）DLC 岸边网格 ${r.shoreN}（放行倒影 ${r.shoreRefl}）程序 ${r.progs} glErr=${r.glErr}`);
  for (const e of [...r.errs, ...errors.splice(0)]) console.log('   ' + e.slice(0, 600));
}
await b.close(); console.log(`${fail ? '✗' : '✓'} 植被遗留（含 DLC） ${fail ? fail + ' 项失败' : '全部通过'}`); process.exitCode = fail ? 1 : 0;
