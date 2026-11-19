// 11-17g 专长包 v8 风场（?off=qlwind）自查：无头小页编译 field_flora 共用 GLSL（FF_QLWIND），在 200×200 m 上取阵风倍率，
//   看范围（0.3–1.9）、均值（约 1）、阵风图样随时间顺风移动（t 秒后，p + 风向×3.2t 处的大尺度阵风 ≈ 原处）。
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'qlw_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { FF_SHARED } from '${ROOT}src/web/field_flora';
(window as any).run = (t: number, shift: number) => {
  const errs: string[] = []; const W = 64, H = 64; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv }); r.debug.checkShaderErrors = true; r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p)));
  const U = FF_SHARED.U as any; const wd = new THREE.Vector2(0.894, 0.447).normalize();
  U.uFfWind.value.set(wd.x, wd.y, 1, t); U.uFfAir.value.set(wd.x * 3.2 * t, wd.y * 3.2 * t, 0, 0);
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: 'varying vec2 vP; void main(){ vP = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: FF_SHARED.glsl + '\\nvarying vec2 vP; uniform float uShift; void main(){ vec2 p = vP * 200.0 + vec2(' + (wd.x * shift).toFixed(4) + ', ' + (wd.y * shift).toFixed(4) + '); gl_FragColor = vec4(ffGust(p), 0.0, 0.0, 1.0); }' });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }); r.setRenderTarget(rt); r.render(sc, new THREE.OrthographicCamera());
  const o = new Float32Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, o); const v: number[] = []; for (let i = 0; i < W * H; i++) v.push(o[i * 4]);
  r.dispose(); cv.remove(); return { v, errs };
};`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')], loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.ktx2': 'dataurl', '.glb': 'dataurl' } });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + join(d, 'p.html'));
const a = await page.evaluate(() => window.run(0, 0)), c = await page.evaluate(() => window.run(5, 16)), e = await page.evaluate(() => window.run(5, 0));
await b.close();
let pass = 0, fail = 0; const ok = (x, m) => { if (x) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
ok(!a.errs.length && !errors.length, '着色器编译 0 报错' + (a.errs[0] ? '：' + a.errs[0].slice(0, 300) : '') + (errors[0] ? errors[0].slice(0, 300) : ''));
const mn = Math.min(...a.v), mx = Math.max(...a.v), avg = a.v.reduce((s, x) => s + x, 0) / a.v.length;
ok(mn >= 0.299 && mx <= 1.901 && mx - mn > 0.6, `阵风倍率范围 ${mn.toFixed(2)}–${mx.toFixed(2)}`);
ok(avg > 0.7 && avg < 1.3, `均值 ${avg.toFixed(2)}（约 1）`);
let diff0 = 0, diff1 = 0; for (let i = 0; i < a.v.length; i++) { diff1 += Math.abs(c.v[i] - a.v[i]); diff0 += Math.abs(e.v[i] - a.v[i]); }
ok(diff1 < diff0 * 0.75, `图样顺风推进：5 秒后顺风 16 m 处与原处差 ${(diff1 / a.v.length).toFixed(3)}，原地差 ${(diff0 / a.v.length).toFixed(3)}`);
console.log(`${fail ? '✗' : '✓'} 风场 ${pass}/${pass + fail}`); process.exitCode = fail ? 1 : 0;
