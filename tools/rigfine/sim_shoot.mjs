import { chromium } from '/workspace/projects/05bff4bf-a78d-4962-9eec-1218dd871bdc/dev/main/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'fs';
const [OUT, SC, DUR, STEP = '0.1', ONLY] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 720, height: 450 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:8765/sim.html?glb=wl_ferry_death.glb&rig=ferry_rig.json&clips=fd_clips.json');
await p.waitForFunction(() => window.ready, null, { timeout: 180000 }).catch(() => {});
if (errs.length) { console.log(errs.join('\n')); await b.close(); process.exit(1); }
const ts = ONLY ? ONLY.split(',').map(Number) : []; if (!ONLY) for (let t = 0; t <= +DUR + 1e-6; t += +STEP) ts.push(t);
let f = 0; for (const t of ts) { await p.evaluate(([s, t]) => window.sim(s, t), [SC, t]); await p.screenshot({ path: `${OUT}/f${String(f++).padStart(3, '0')}.png` }); }
if (errs.length) console.log(errs.join('\n'));
console.log('frames', f); await b.close();
