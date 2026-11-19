// 11-18 B7 外海秋林水体（?off=qlsea 对照）截图 + 单帧耗时：无头小页只建海面 + 海天穹顶材质，不进 DLC 游戏（沙箱软件渲染进 DLC 会 OOM）
//   node test/qlsea_shots.mjs [标签] [额外 query，如 off=qlsea]   环境变量：QUAL（默认 low）、VW（默认 960）、OUT
//   镜头在沉钟海岸东岸外 30 米、海面上 2.6 米；16 点三个朝向（迎太阳 / 侧向 / 背太阳）+ 22 点迎月亮；uTime 固定，开 / 关两次同一波形
//   耗时 = 9 次 render + readPixels 同步取中位，SwiftShader 沙盒估算，实机另测
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'qls_'));
const TAG = process.argv[2] || 'on', Q = process.argv[3] || '';
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960), VH = Math.round(VW * 9 / 16), OUT = process.env.OUT || '/workspace/work/shots/pack1118';
mkdirSync(OUT, { recursive: true });
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { presetQuality } from '${ROOT}src/web/gfx';
import { seaBuild, seaU } from '${ROOT}src/dlc/dlc1/coast_sea';
import { ssState, ssU, seaSkyTick, seaSkyDomeMaterial } from '${ROOT}src/dlc/dlc1/coast_seasky';
import { eastCoast, SEA_Y } from '${ROOT}src/dlc/dlc1/coast_layout';
const W = ${VW}, H = ${VH};
presetQuality('${QUAL}' as never);
const errs: string[] = [];
const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.style.margin = '0'; document.body.appendChild(cv);
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true });
r.setSize(W, H, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
r.debug.checkShaderErrors = true;
r.debug.onShaderError = (gl, p, vs, fs) => errs.push('shader: ' + (gl.getProgramInfoLog(p) || '') + (gl.getShaderInfoLog(fs) || ''));
const scene = new THREE.Scene();
const root = new THREE.Group(); scene.add(root); seaBuild(root, { x: 0, z: 0 });
const dome = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), seaSkyDomeMaterial({ uStorm: { value: 0 } })); dome.frustumCulled = false; dome.renderOrder = -0.5; scene.add(dome);
const cam = new THREE.PerspectiveCamera(55, W / H, 0.1, 700);
const Z = 10, P = new THREE.Vector3(eastCoast(Z) + 30, SEA_Y + 2.6, Z);
(window as any).shot = (hour: number, aim: string) => {
  ssState.override = hour; for (let i = 0; i < 4; i++) seaSkyTick(0.016, 0, 0, 0.3, 175);
  seaU.uTime.value = 12.3; seaU.uStorm.value = 0;
  const S = aim === 'moon' ? ssU.ssMoonD.value : ssU.ssSunD.value;
  const base = Math.atan2(S.x, S.z), yaw = base + (aim === 'side' ? Math.PI / 2 : aim === 'away' ? Math.PI : 0);
  cam.position.copy(P); dome.position.copy(P);
  cam.lookAt(P.x + Math.sin(yaw), P.y - 0.12, P.z + Math.cos(yaw)); cam.updateMatrixWorld();
  r.render(scene, cam);
  const gl = r.getContext(), px = new Uint8Array(4), ts: number[] = [];
  for (let i = 0; i < 9; i++) { const t = performance.now(); r.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b);
  return { yaw: +yaw.toFixed(3), sun: ssU.ssSunD.value.toArray().map(v => +v.toFixed(3)), moon: ssU.ssMoonD.value.toArray().map(v => +v.toFixed(3)), renderMs: +ts[4].toFixed(1), minMs: +ts[0].toFixed(1), errs: errs.splice(0), glErr: gl.getError() };
};`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(d, 'e.js'), logLevel: 'error', nodePaths: [join(ROOT, 'node_modules')], loader: { '.glsl': 'text' } });
writeFileSync(join(d, 'p.html'), '<!doctype html><meta charset="utf-8"><body><script src="e.js"></script></body>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: VW, height: VH } });
const errors = []; page.on('pageerror', e => errors.push('PAGEERR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
await page.goto('file://' + join(d, 'p.html') + (Q ? '?' + Q : ''));
const SHOTS = [{ n: 'sun', hour: 16, aim: 'sun' }, { n: 'side', hour: 16, aim: 'side' }, { n: 'away', hour: 16, aim: 'away' }, { n: 'moon', hour: 22, aim: 'moon' }];
const rows = [];
for (const s of SHOTS) {
  const r = await page.evaluate(s => window.shot(s.hour, s.aim), s);
  await page.screenshot({ path: `${OUT}/b7_${TAG}_${s.n}.png` });
  rows.push({ shot: s.n, hour: s.hour, ...r }); console.log(TAG, s.n, JSON.stringify(r));
}
const all = [...errors, ...rows.flatMap(r => r.errs)];
writeFileSync(`${OUT}/b7_${TAG}.json`, JSON.stringify({ tag: TAG, qual: QUAL, query: Q, size: [VW, VH], rows, errors: all.slice(0, 5) }, null, 1));
console.log(TAG, all.length ? 'ERRORS ' + all.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close(); process.exitCode = all.length ? 1 : 0;
