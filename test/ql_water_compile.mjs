// 11-18 秋林水体模式（waterUp ql）编译 + 画面自查（无头小页）：node test/ql_water_compile.mjs
//   low / high × 有无倒影 各一帧，必须编译通过、无 PAGEERR、水面有明暗变化（不是纯色 / 黑屏）
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'qlw_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { waterUp, rippleNormal, radialFade } from '${ROOT}src/dlc/dlc1/water_fx';
(window as any).run = (low: boolean, refl: boolean, ql: boolean) => {
  const errs: string[] = []; const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv }); r.debug.checkShaderErrors = true;
  r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p)));
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x203040);
  const nm = rippleNormal().clone(); nm.repeat.set(4, 4); nm.needsUpdate = true;
  const m = waterUp(new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, normalMap: nm, alphaMap: radialFade(), roughness: 0.1, metalness: 0 }), { edge: 'alpha', shallow: 0x3a5a5c, deep: 0x0e1c24, depth: 2, refl, ql }, low);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(20, 20, 4, 4), m); w.rotation.x = -Math.PI / 2; sc.add(w);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x806040 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1; sc.add(floor);
  sc.add(new THREE.HemisphereLight(0x99aacc, 0x332211, 1)); const L = new THREE.DirectionalLight(0xffeedd, 3); L.position.set(-4, 3, -10); sc.add(L);
  const cam = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100); cam.position.set(0, 7, 12); cam.lookAt(0, 0, 0);
  r.render(sc, cam); const g = r.getContext(), b = new Uint8Array(4 * 128 * 96); g.readPixels(0, 0, 128, 96, g.RGBA, g.UNSIGNED_BYTE, b);
  let s = 0, s2 = 0; for (let i = 0; i < b.length; i += 4) { const v = (b[i] + b[i + 1] + b[i + 2]) / 3; s += v; s2 += v * v; }
  const n = 128 * 96, mean = s / n; const res = { mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), errs, glErr: g.getError() }; r.dispose(); cv.remove(); return res; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')] });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'warning' && /patch miss/.test(m.text())) errors.push(m.text()); });
await page.goto('file://' + join(d, 'p.html')); await page.waitForTimeout(500);
let fail = 0;
for (const [low, refl, ql] of [[true, false, true], [false, false, true], [false, true, true], [false, true, false]]) {
  const r = await page.evaluate(a => window.run(...a), [low, refl, ql]);
  const ok = !r.errs.length && !errors.length && !r.glErr && r.sd > 3;
  if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${low ? 'low' : 'high'} 倒影${refl ? '开' : '关'} ${ql ? '秋林' : 'v2'}：均值 ${r.mean.toFixed(1)} 标准差 ${r.sd.toFixed(1)}`);
  for (const e of [...r.errs, ...errors.splice(0)]) console.log('  ' + e.slice(0, 600));
}
await b.close(); console.log(fail ? `✗ 秋林水体 ${fail} 项失败` : '✓ 秋林水体'); process.exitCode = fail ? 1 : 0;
