// 11-18 野外冰湖（钟井同款冰面）编译 + 有画面（无头小页）：node test/wild_ice_compile.mjs
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'wice_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { makeIceLakeHd } from '${ROOT}src/web/icelake_hd';
(window as any).run = () => {
  const errs: string[] = []; const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv }); r.debug.checkShaderErrors = true;
  r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p)));
  const sc = new THREE.Scene(); sc.add(makeIceLakeHd(12)); sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1)); const L = new THREE.DirectionalLight(0xffffff, 2); L.position.set(5, 10, -5); sc.add(L);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100); cam.position.set(0, 14, 14); cam.lookAt(0, 0, 0);
  r.render(sc, cam); const g = r.getContext(), b = new Uint8Array(4 * 96 * 96); g.readPixels(0, 0, 96, 96, g.RGBA, g.UNSIGNED_BYTE, b);
  let s = 0, mn = 255, mx = 0; for (let i = 0; i < b.length; i += 4) { const v = (b[i] + b[i + 1] + b[i + 2]) / 3; s += v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
  return { mean: s / (96 * 96), mn, mx, errs }; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')] });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + join(d, 'p.html')); await page.waitForTimeout(500);
const r = await page.evaluate(() => window.run()); await b.close();
const ok = !r.errs.length && !errors.length && r.mx - r.mn > 20 && r.mean > 5;
console.log(`${ok ? '✓' : '✗'} 野外冰湖：均值 ${r.mean.toFixed(1)} 范围 ${r.mn.toFixed(0)}–${r.mx.toFixed(0)}`); for (const e of [...r.errs, ...errors]) console.log('  ' + e.slice(0, 300));
process.exitCode = ok ? 0 : 1;
