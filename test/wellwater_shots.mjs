// 11-18 钟井水面（cave 模式）无头小页对照：深渊黑水圆片 + 两盏暖点光 + 暗方向光 + 房间 IBL；node test/wellwater_shots.mjs 标签 [query]
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'wws_'));
const TAG = process.argv[2] || 'on', Q = process.argv[3] || '', OUT = process.env.OUT || '/workspace/work/shots/pack1118';
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { presetQuality } from '${ROOT}src/web/gfx';
import { waterUp, rippleNormal } from '${ROOT}src/dlc/dlc1/water_fx';
presetQuality('high' as never);
const errs: string[] = [];
const W = 800, H = 450, cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.style.margin = '0'; document.body.appendChild(cv);
const r = new THREE.WebGLRenderer({ canvas: cv, preserveDrawingBuffer: true }); r.setSize(W, H, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
r.debug.onShaderError = (gl, p, vs, fs) => errs.push('shader: ' + (gl.getProgramInfoLog(p) || '') + (gl.getShaderInfoLog(fs) || ''));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0d12); scene.fog = new THREE.Fog(0x1a2228, 200, 600);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0x8090a0, 0x101418, 0.6)); const dl = new THREE.DirectionalLight(0xc8d8ff, 1.2); dl.position.set(10, 30, 5); scene.add(dl);
for (const [x, z] of [[-6, -4], [8, 6]]) { const p = new THREE.PointLight(0xffb060, 40, 25, 2); p.position.set(x, 4, z); scene.add(p); }
for (const [x, z] of [[-6, -4], [8, 6], [0, 12]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 20, 8), new THREE.MeshStandardMaterial({ color: 0x3a3430 })); c.position.set(x, 4, z); scene.add(c); }
const nm = rippleNormal().clone(); nm.repeat.set(40, 40);
const wm = new THREE.MeshStandardMaterial({ color: 0x03080b, roughness: 0.1, metalness: 0.55, envMapIntensity: 1.1, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35) });
waterUp(wm, { ql: true, cave: true, edge: 'radial', shallow: 0x123034, deep: 0x03080b, sky: 0x6a8898, foamW: 0.05, caus: 0.12, speed: 0.6, depth: 8 });
const water = new THREE.Mesh(new THREE.CircleGeometry(140, 96), wm); water.rotation.x = -Math.PI / 2; water.position.y = -6; scene.add(water);
const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 500); cam.position.set(18, 30, 30); cam.lookAt(0, -6, 0);
(window as any).shot = () => { r.render(scene, cam); return errs; };`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')] });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } }); const E = []; page.on('pageerror', e => E.push(e.message)); page.on('console', m => { if (m.type() === 'error') E.push(m.text().slice(0, 300)); });
await page.goto('file://' + join(d, 'p.html') + (Q ? '?' + Q : ''));
const e2 = await page.evaluate(() => window.shot()); await page.screenshot({ path: `${OUT}/ww_${TAG}.png` });
console.log(TAG, [...E, ...e2].slice(0, 3).join(' | ') || 'OK'); await b.close();
