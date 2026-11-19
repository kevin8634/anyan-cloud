// 11-17g 秋林射线 QlRaysPass 编译 + 数值自查（无头小页，不加载游戏）：node test/ql_rays_compile.mjs
//   三档（56 / 36 / 24 采样）各跑一帧：一张假 HDR 场景图（太阳附近亮到 4），正对太阳 → 合成后太阳附近必须比原图亮、远处不变；背对太阳 → 原样。
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'qlr_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { QlRaysPass } from '${ROOT}src/web/ql_rays';
(window as any).run = (q: string, face: number) => {
  const errs: string[] = []; const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv }); r.debug.checkShaderErrors = true;
  r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p)));
  const W = 256, H = 144, src = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x - W / 2) / H, dy = (y - H * 0.6) / H, k = Math.exp(-(dx * dx + dy * dy) * 40) * 4 + 0.3; const i = (y * W + x) * 4; src[i] = k; src[i + 1] = k * 0.9; src[i + 2] = k * 0.8; src[i + 3] = 1; }
  const tex = new THREE.DataTexture(src, W, H, THREE.RGBAFormat, THREE.FloatType); tex.needsUpdate = true;
  const read = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }); const write = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  const cp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: tex } }, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'uniform sampler2D t; varying vec2 v; void main(){ gl_FragColor = texture2D(t, v); }' }));
  const oc = new THREE.OrthographicCamera(); const sc = new THREE.Scene(); sc.add(cp); r.setRenderTarget(read); r.render(sc, oc);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000); cam.position.set(0, 0, 0);
  const sun = new THREE.DirectionalLight(); sun.position.set(0, 2, face > 0 ? -10 : 10); sun.target.position.set(0, 0, 0);
  cam.lookAt(0, 2, -10); cam.updateMatrixWorld();
  const p = new QlRaysPass(cam, sun, () => null, q); p.setSize(W, H); p.update(true);
  p.render(r, write, read);
  const out = new Float32Array(W * H * 4); r.readRenderTargetPixels(write, 0, 0, W, H, out);
  const at = (x: number, y: number) => out[(y * W + x) * 4], at0 = (x: number, y: number) => src[(y * W + x) * 4];
  const gl = r.getContext(); const res = { q, face, k: p.k, nearGain: at(W / 2, Math.round(H * 0.45)) - at0(W / 2, Math.round(H * 0.45)), farGain: at(4, 4) - at0(4, 4), errs, glErr: gl.getError() };
  r.dispose(); cv.remove(); return res; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')] });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + join(d, 'p.html')); await page.waitForTimeout(2000);   // 海天共用件开机 1.5 秒内会接管方向，等过去
let fail = 0;
for (const q of ['high', 'medium', 'low']) for (const face of [1, -1]) {
  const r = await page.evaluate(([q, f]) => window.run(q, f), [q, face]);
  const ok = !r.errs.length && !errors.length && !r.glErr && (face > 0 ? r.k > 0.5 && r.nearGain > 0.005 && Math.abs(r.farGain) < 1e-3 : r.k === 0 && Math.abs(r.nearGain) < 1e-3);
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${q} ${face > 0 ? '正对太阳' : '背对太阳'}: k=${r.k.toFixed(2)} 太阳附近 +${r.nearGain.toFixed(4)} 远处 ${r.farGain.toFixed(5)} glErr=${r.glErr}`);
  for (const e of [...r.errs, ...errors.splice(0)]) console.log('   ' + e.slice(0, 400));
}
await b.close(); console.log(`${fail ? '✗' : '✓'} 秋林射线 ${fail ? fail + ' 项失败' : '全部通过'}`); process.exitCode = fail ? 1 : 0;
