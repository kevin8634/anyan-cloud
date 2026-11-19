import { chromium } from '/workspace/projects/05bff4bf-a78d-4962-9eec-1218dd871bdc/dev/main/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'fs';
const [OUT, GLB, RIG, wire, CLIPS, NAME] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 480 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:8765/view.html?glb=${GLB}&rig=${RIG}${wire === '1' ? '&wire=1' : ''}${CLIPS ? '&clips=' + CLIPS : ''}`);
await p.waitForFunction(() => window.ready, null, { timeout: 120000 }).catch(() => {});
if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
if (NAME) { const dur = await p.evaluate(n => fetch(new URLSearchParams(location.search).get('clips')).then(r => r.json()).then(j => j[n].dur), NAME); let f = 0; for (let t = 0; t <= dur + 1e-6; t += 0.1) { await p.evaluate(([n, t]) => window.clip(n, t), [NAME, t]); await p.screenshot({ path: `${OUT}/f${String(f++).padStart(3, '0')}.png` }); } console.log('frames', f); await b.close(); process.exit(0); }
const SEQ = [['idle', 6, 0.1], ['walk', 22, 0.1], ['atk', 14, 0.1], ['idle', 3, 0.1], ['death', 13, 0.1]];
let f = 0;
for (const [ph, n, dt] of SEQ) for (let k = 0; k < n; k++) { await p.evaluate(([ph, t]) => window.pose(ph, t), [ph, k * dt]); await p.screenshot({ path: `${OUT}/f${String(f++).padStart(3, '0')}.png` }); }
for (let k = 0; k < 6; k++) await p.screenshot({ path: `${OUT}/f${String(f++).padStart(3, '0')}.png` });
console.log('frames', f); await b.close();
