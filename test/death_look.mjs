// 11-06 死亡动作 1.5 秒观感（玩家）：Q=medium CLS=<职业> node test/death_look.mjs [html] [outdir] → 0.5 / 1.0 / 1.5 / 2.5 秒各一帧
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const CLS = process.env.CLS || 'warrior';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/death_look';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(q => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); if (q) localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, process.env.Q || '');
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(c => window.__game.startGame(c), CLS); await page.waitForTimeout(4000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.player.pos.z += 4; g.camDistSet?.(5); }); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const A = window.__game.player.rig.anim; const a = A.pick?.('death'); const c = a?.getClip?.(); return c ? { clip: c.name, dur: +c.duration.toFixed(2) } : null; });
console.log(CLS, 'death', JSON.stringify(info));
let t = 0;
for (const at of [0.5, 1.0, 1.5, 2.5]) {
  await page.evaluate(([from, to]) => { const g = window.__game, A = g.player.rig.anim; if (from === 0) { A.loop('idle'); A.play('death'); } for (let i = 0; i < Math.round((to - from) * 30); i++) A.update(1 / 30); g.rec && (g.rec.freezeAI = true); }, [t, at]); t = at;
  await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${CLS}_${at.toFixed(1)}s.png` });
}
console.log('页面错误', errors.length, JSON.stringify(errors.slice(0, 2))); await b.close(); process.exitCode = errors.length ? 1 : 0;
