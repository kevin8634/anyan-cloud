// 11-17f 海岸海面旧着色器（?off=seasky = 旧版 Gerstner 海面）编译验证：无头小页只建材质 + 平面，不加载整个游戏
// 用法：node test/seasky_old_compile.mjs [low,medium,high,ultra]   （SwiftShader 软件 WebGL；默认四档；同时跑 v2 作对照）
// 页面：esbuild 打一个小入口（coast_sea.seaBuild → 取它的 ShaderMaterial → 换到 PlaneGeometry 上），每档 compile + render 1 帧，
//   收 THREE.WebGLProgram 着色器报错 / 控制台 error / pageerror，读 gl LINK_STATUS。不截图。
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'ssc_'));
const TIERS = (process.argv[2] || 'low,medium,high,ultra').split(',');
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { presetQuality } from '${ROOT}src/web/gfx';
import { seaBuild } from '${ROOT}src/dlc/dlc1/coast_sea';
import { seaSkyOn } from '${ROOT}src/dlc/dlc1/coast_seasky';
(window as any).run = (tier: string) => {
  const errs: string[] = [];
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
  r.debug.checkShaderErrors = true;
  r.debug.onShaderError = (gl, prog, vs, fs) => { errs.push('shader: ' + (gl.getProgramInfoLog(prog) || '') + (gl.getShaderInfoLog(vs) || '') + (gl.getShaderInfoLog(fs) || '')); };
  presetQuality(tier as never);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x3e4c52, 40, 175);
  const tmp = new THREE.Group(); seaBuild(tmp, { x: 0, z: 0 });
  const sea = tmp.getObjectByName('coast_sea') as THREE.Mesh;
  const mat = sea.material as THREE.ShaderMaterial;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 64, 64).rotateX(-Math.PI / 2), mat);
  plane.frustumCulled = false; scene.add(plane);
  scene.add(new THREE.HemisphereLight(0xb4c8cc, 0x20282a, 1.35)); const L = new THREE.DirectionalLight(0xe6ecec, 2); L.position.set(20, 30, 10); scene.add(L);
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 700); cam.position.set(0, 6, 18); cam.lookAt(0, 0, 0);
  r.compile(scene, cam); r.render(scene, cam);
  const gl = r.getContext(); let linked = 0, progs = 0;
  for (const p of (r.info.programs || []) as any[]) { progs++; if (gl.getProgramParameter(p.program, gl.LINK_STATUS)) linked++; }
  const res = { tier, v2: seaSkyOn(), vsLen: mat.vertexShader.length, fsLen: mat.fragmentShader.length, fog: mat.fog, progs, linked, errs, glErr: gl.getError() };
  r.dispose(); cv.remove(); return res;
};`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')], loader: { '.glsl': 'text' } });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0;
for (const off of ['seasky', '']) {
  const page = await b.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 600)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + join(d, 'p.html') + (off ? '?off=' + off : ''));
  for (const t of TIERS) {
    const r = await page.evaluate(t => window.run(t), t).catch(e => ({ tier: t, errs: ['eval: ' + e.message] }));
    const bad = (r.errs?.length || 0) + errors.length > 0 || r.linked !== r.progs || r.glErr;
    if (bad) fail++;
    console.log(`${bad ? '✗' : '✓'} ${off ? '旧海面 ?off=seasky' : 'v2 对照'} ${t}: v2=${r.v2} 程序 ${r.linked}/${r.progs} 链接 · VS ${r.vsLen} / FS ${r.fsLen} 字 · fog=${r.fog} · glErr=${r.glErr}`);
    for (const e of [...(r.errs || []), ...errors.splice(0)]) console.log('   ' + e.slice(0, 600));
  }
  await page.close();
}
await b.close();
console.log(`${fail ? '✗' : '✓'} 海岸海面编译 ${fail ? fail + ' 项报错' : '全部通过'}`); process.exitCode = fail ? 1 : 0;
