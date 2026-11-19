// 11-18 夜间怪物轮廓光：Toon / Standard / Phong 打补丁后编译 + 夜里比白天亮（无头小页）：node test/night_rim_compile.mjs
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'nrim_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { nightRimTick, nightRimStats } from '${ROOT}src/web/night_rim';
(window as any).run = (kind: string) => {
  const errs: string[] = []; const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, preserveDrawingBuffer: true }); r.debug.checkShaderErrors = true;
  r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p)));
  const m = kind === 'toon' ? new THREE.MeshToonMaterial({ color: 0x406080 }) : kind === 'std' ? new THREE.MeshStandardMaterial({ color: 0x406080 }) : new THREE.MeshPhongMaterial({ color: 0x406080 });
  const sc = new THREE.Scene(); const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m); sc.add(mesh); sc.add(new THREE.AmbientLight(0xffffff, 0.05));
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10); cam.position.set(0, 0, 3);
  const root = new THREE.Group(); root.add(mesh); sc.add(root);
  const px = () => { r.render(sc, cam); const g = r.getContext(), b = new Uint8Array(4 * 64 * 64); g.readPixels(0, 0, 64, 64, g.RGBA, g.UNSIGNED_BYTE, b); let s = 0; for (let i = 0; i < b.length; i += 4) s += b[i] + b[i + 1] + b[i + 2]; return s; };
  nightRimTick(1, 0, [{ rig: { root } }]); const day = px();
  nightRimTick(1, 1, [{ rig: { root } }]); const night = px();
  nightRimTick(1, 0, [{ rig: { root } }]); const day2 = px();
  const res = { kind, day, night, day2, patched: nightRimStats.patched, errs }; r.dispose(); cv.remove(); return res; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')] });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + join(d, 'p.html')); await page.waitForTimeout(500);
let fail = 0;
for (const k of ['toon', 'std', 'phong']) { const r = await page.evaluate(k => window.run(k), k);
  const ok = !r.errs.length && !errors.length && r.night > r.day * 1.15 && Math.abs(r.day2 - r.day) < r.day * 0.01;
  if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${k}: 白天 ${r.day} 深夜 ${r.night} 回白天 ${r.day2}`); for (const e of [...r.errs, ...errors.splice(0)]) console.log('  ' + e.slice(0, 300)); }
await b.close(); console.log(fail ? `✗ 夜间轮廓光 ${fail} 项失败` : '✓ 夜间轮廓光'); process.exitCode = fail ? 1 : 0;
