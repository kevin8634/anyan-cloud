// v1.2.80 评委路线实机（合并 raidA 后）：首屏「⚡ 评委快速体验」→ 三步 + 长副本 A 尾王，每步等加载画面撤掉、截图、查页面错误
// node test/judge80_e2e.mjs [目录含 index.html] [输出目录]
import { chromium } from 'playwright-core'; import { mkdirSync } from 'fs';
const DIR = process.argv[2] || '/tmp/opt', OUT = process.argv[3] || '/workspace/work/shots/judge80'; mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const VW = +(process.env.JVW || 1280); const page = await b.newPage({ viewport: { width: VW, height: Math.round(VW * 9 / 16) } }); page.setDefaultTimeout(600000);   // JVW=800 省内存（沙箱 swiftshader）
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__j')) { sessionStorage.setItem('__j', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + DIR + '/index.html', { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start'), null, { timeout: 600000 });
const loaded = () => page.waitForFunction(() => document.getElementById('loading')?.style.display !== 'flex', null, { timeout: 600000 });
const jb = page.getByText('评委快速体验').first(); await jb.waitFor({ state: 'visible', timeout: 600000 }); await jb.click();
await page.waitForFunction(() => window.__game?.player && document.getElementById('d1-judge'), null, { timeout: 600000 }).catch(() => {});
await loaded(); await page.waitForTimeout(3000);
let st = await page.evaluate(() => ({ cls: window.__game?.player?.classId ?? window.__game?.classId, lv: window.__game?.progression?.level, zone: window.__game?.zone, panel: !!document.querySelector('[data-j="0"]') }));
console.log(JSON.stringify(st)); ok(st.lv === 40 && st.panel, `评委开局：40 级、三步面板在（${st.zone}）`);
await page.screenshot({ path: `${OUT}/j_start.png` });
for (const j of (process.env.JSTEPS || '0,1,3').split(',').map(Number)) {   // JSTEPS=3 只跑长副本 A 尾王（防 OOM）
  const z0 = await page.evaluate(() => window.__game.zone);
  await page.evaluate(j => { document.querySelectorAll('.panel').forEach(p => { if (p.id !== 'd1-judge') p.style.display = 'none'; }); document.querySelector(`[data-j="${j}"]`)?.click(); }, j);
  await page.waitForTimeout(2500); await loaded(); await page.waitForTimeout(4000);
  const s = await page.evaluate(() => ({ zone: window.__game.zone, boss: document.getElementById('cb-name')?.textContent ?? '', hud: getComputedStyle(document.getElementById('raid-hud') ?? document.body).display }));
  console.log('step', j, JSON.stringify(s)); await page.screenshot({ path: `${OUT}/j_step${j}.png` });
  ok(errors.length === 0, `第 ${j === 3 ? 'A' : j + 1} 步（${z0} → ${s.zone}）无页面错误${errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''}`);
}
console.log(`judge80 ${pass}/${pass + fail}`); await b.close(); process.exitCode = fail ? 1 : 0;
