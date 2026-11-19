// raidA 11-02 莫尔维斯验收截图 / GIF（本地 chromium swiftshader；串行使用浏览器）
//  对照：node tools/rigfine/morvis/shoot.mjs cmp <原件.glb> <成品.glb> <out.png>
//  动作：node tools/rigfine/morvis/shoot.mjs gif <成品.glb> <帧目录> [clip1,clip2...] [fps=15]   → <帧目录>/<clip>/f000.png …（再用 ffmpeg 合 GIF）
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
const [mode, ...A] = process.argv.slice(2);
const EXE = process.env.CHROME || '/workspace/work/.pw/chromium-1140/chrome-linux/chrome';
const js = (await build({ bundle: true, write: false, format: 'iife', target: 'es2020', stdin: { resolveDir: resolve('.'), loader: 'js', contents: `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function stage(W, H) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  document.body.appendChild(r.domElement); return r;
}
function scene() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x10181c); s.fog = new THREE.Fog(0x10181c, 4, 9);
  s.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a2a2a, 1.5)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 3); s.add(d);
  const d2 = new THREE.DirectionalLight(0x60ffd0, 0.8); d2.position.set(-3, 1, -2); s.add(d2);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: 0x1d2a2e, roughness: 0.9 })); fl.rotation.x = -Math.PI / 2; fl.position.y = -0.364; s.add(fl);
  const grid = new THREE.PolarGridHelper(1.5, 8, 6, 48, 0x2f4a4a, 0x2f4a4a); grid.position.y = -0.362; s.add(grid); return s;
}
const cam = (az, el, dist, tgt) => { const c = new THREE.PerspectiveCamera(32, 1, 0.01, 50); c.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az)); c.lookAt(tgt); return c; };
window.cmp = async (urls, S, labels) => {
  const views = [[0.75, 0.22], [Math.PI / 2, 0.05], [0, 0.12], [-2.4, 0.3]];
  const r = stage(S * views.length, S * urls.length); r.setScissorTest(true); const tgt = new THREE.Vector3(0, 0, 0);
  for (let row = 0; row < urls.length; row++) {
    const g = await loader.loadAsync(urls[row]); const s = scene(); s.add(g.scene);
    if (g.animations.length) { const mx = new THREE.AnimationMixer(g.scene); const a = mx.clipAction(g.animations.find(c => c.name === 'idle')); a.play(); mx.setTime(0.0001); }
    views.forEach(([az, el], i) => { const c = cam(az, el, 2.45, tgt); c.aspect = 1; c.updateProjectionMatrix(); const y = (urls.length - 1 - row) * S; r.setViewport(i * S, y, S, S); r.setScissor(i * S, y, S, S); r.render(s, c); });
  }
  return true;
};
let R, Sc, C, MX, G, ACT = {};
window.gifInit = async (url, S) => {
  R = stage(S, S); Sc = scene(); G = await loader.loadAsync(url); Sc.add(G.scene); MX = new THREE.AnimationMixer(G.scene);
  for (const c of G.animations) ACT[c.name] = { a: MX.clipAction(c), dur: c.duration };
  C = cam(0.8, 0.18, 2.9, new THREE.Vector3(0, 0.07, 0.06)); return G.animations.map(c => [c.name, c.duration]);
};
window.gifFrame = (name, t) => { for (const k in ACT) ACT[k].a.stop(); const a = ACT[name].a; a.play(); a.time = Math.min(t, ACT[name].dur - 1e-4); MX.update(0); R.render(Sc, C); return true; };
` } })).outputFiles[0].text;
const WAITN = +(process.env.WAITN || 9); for (let i = 0; i < WAITN; i++) { // 串行：等别的 chromium 退出且内存 ≥4G
  const { execSync } = await import('child_process');
  const busy = execSync("pgrep -f '[c]hrome-linux/chrome|[c]hromium|[h]eadless_shell' || true").toString().trim();
  const avail = +execSync("free -g | awk '/Mem/{print $7}'").toString().trim();
  if (!busy && avail >= 4) break; if (i === WAITN - 1) { console.log('等待浏览器超时'); process.exit(2); } console.log('等待浏览器空闲…', busy.split('\n').length, 'avail', avail); await new Promise(r => setTimeout(r, 10000));
}
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=3072'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const files = {};
await page.route('http://glb.local/**', r => { const f = files[r.request().url()]; if (!f) return r.fulfill({ body: '<html><body style="margin:0;background:#10181c"></body></html>', contentType: 'text/html' }); r.fulfill({ body: readFileSync(f), contentType: 'model/gltf-binary' }); });
await page.goto('http://glb.local/index.html');
await page.addScriptTag({ content: js });
try {
  if (mode === 'cmp') {
    const [a, c, out] = A; files['http://glb.local/a.glb'] = a; files['http://glb.local/b.glb'] = c;
    const S = 360; await page.setViewportSize({ width: S * 4, height: S * 2 });
    await page.evaluate(([S]) => window.cmp(['http://glb.local/a.glb', 'http://glb.local/b.glb'], S), [S]);
    await page.locator('canvas').screenshot({ path: out }); console.log('cmp →', out);
  } else if (mode === 'gif') {
    const [g, dir, list, fps = '15'] = A; files['http://glb.local/m.glb'] = g; const S = 420; await page.setViewportSize({ width: S, height: S });
    const clips = await page.evaluate(([S]) => window.gifInit('http://glb.local/m.glb', S), [S]);
    const want = list ? list.split(',') : clips.map(c => c[0]);
    for (const [name, dur] of clips) { if (!want.includes(name)) continue; const d = `${dir}/${name}`; mkdirSync(d, { recursive: true });
      const n = Math.round(dur * +fps) + 1; const t0 = Date.now();
      for (let i = 0; i < n; i++) { await page.evaluate(([nm, t]) => window.gifFrame(nm, t), [name, i / +fps]); await page.locator('canvas').screenshot({ path: `${d}/f${String(i).padStart(3, '0')}.png` }); }
      console.log(name, n, 'frames', ((Date.now() - t0) / 1000).toFixed(1) + 's'); }
  }
} finally { if (errs.length) console.log('页面错误:\n' + errs.slice(0, 8).join('\n')); await b.close(); }
