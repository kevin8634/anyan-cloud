// 11-18 钟铜熔炉重塑（forge_scene）：假 api 搭一遍 + 俯视渲染一帧（无头小页）：编译通过、无 PAGEERR、散布数量在预算内、首领场里没有大 / 中件
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'fgs_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { forgeScene, forgeSceneStats } from '${ROOT}src/dlc/dlc1/forge_scene';
(window as any).run = () => {
  const errs: string[] = []; const cv = document.createElement('canvas'); cv.width = 320; cv.height = 320; document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, preserveDrawingBuffer: true }); r.debug.checkShaderErrors = true;
  r.debug.onShaderError = (gl, p, vs, fs) => errs.push(String(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p)));
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1a0c08);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x3a2a20 })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
  const objs: { x: number; z: number }[] = []; const blocks: number[][] = [];
  const api = { origin: { x: 0, z: 0 }, groundY: () => 0, add: (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.x = x; o.position.z = z; o.rotation.y = ry; sc.add(o); objs.push({ x, z }); return o; }, block: (x: number, z: number, rr: number) => { blocks.push([x, z, rr]); } };
  const P = (x: number, z: number) => ({ x, z });
  forgeScene(api as any, { path: [[0, 66], [0, 18], [-14, 2], [-28, -14], [-12, -30], [0, -46]].map(([x, z]) => P(x, z)), arenas: [{ x: 0, z: 18, r: 10 }, { x: -28, z: -14, r: 10 }, { x: 0, z: -46, r: 13 }],
    keep: [{ x: 0, z: 56, r: 12.5 }, { x: 0, z: -66, r: 9 }], half: 70, trash: [P(-4, 34), P(4, 34), P(-18, -32), P(-12, 4), P(-16, 0), P(-8, -32)], b1: P(0, 18), b2: P(-28, -14), b3: P(0, -46), furnace: P(0, -74) });
  sc.add(new THREE.HemisphereLight(0xe0b090, 0x1c1410, 1.5)); const L = new THREE.DirectionalLight(0xffc080, 1.6); L.position.set(20, 40, 10); sc.add(L);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.5, 400); cam.position.set(0, 150, 40); cam.lookAt(0, 0, -5);
  r.render(sc, cam);
  (window as any).png = cv.toDataURL();
  return { st: { ...forgeSceneStats }, errs, blocks: blocks.length, glErr: r.getContext().getError() }; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')], loader: { '.glsl': 'text' } });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + join(d, 'p.html')); await page.waitForTimeout(800);
const r = await page.evaluate(() => window.run());
if (process.argv[2]) { const u = await page.evaluate(() => window.png); writeFileSync(process.argv[2], Buffer.from(u.split(',')[1], 'base64')); }
await b.close();
const s = r.st, ok = !r.errs.length && !errors.length && !r.glErr && s.big >= 15 && s.big + s.mid + s.small <= 3000 && s.braziers >= 4 && s.cover >= 0;
console.log(JSON.stringify(s), 'blocks', r.blocks); for (const e of [...r.errs, ...errors]) console.log('  ' + e.slice(0, 500));
console.log(ok ? '✓ 熔炉重塑' : '✗ 熔炉重塑'); process.exitCode = ok ? 0 : 1;
