// 11-05 30 级 HD 显示件权重修正（05 wfix_1104 收口）实机看：CLS=<职业> ANIM=<dash|run|…> node test/wfix_hd_look.mjs [html] [outdir]
//   05 指定看：法师 Roll（动作名 dash）、炼金跑步（run）。正 / 侧 / 背三个角度，各取 4 帧
import { chromium } from 'playwright-core'; import { mkdirSync } from 'fs'; import { resolve } from 'path';
const CLS = process.env.CLS || 'mage', ANIM = process.env.ANIM || 'dash';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || `/workspace/work/shots/wfix1105/${CLS}_${ANIM}`;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(q => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); if (q) localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, process.env.Q || '');   // 11-06：Q=medium/low 画质（沙箱 8 GB 高画质会 OOM）
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(c => window.__game.startGame(c), CLS); await page.waitForTimeout(4000); await page.evaluate(() => window.__game.camDistSet?.(4.2));
const lux = await page.evaluate(() => { let n = 0; window.__game.player.rig.root.traverse(o => { if (o.isSkinnedMesh) n++; }); return n; });
ok(lux > 0, `蒙皮网格 ${lux} 个`);
for (const [k, y] of [['front', 0], ['side', 1.57], ['back', 3.14]]) for (let i = 0; i < 4; i++) {
  await page.evaluate(([a, y]) => { const g = window.__game; g.player.rig.root.rotation.y = y; const an = g.player.rig.anim; if (a === 'run') an?.loop('run'); else an?.play(a, 0.45); }, [ANIM, y]);
  await page.waitForTimeout(ANIM === 'run' ? 900 + i * 230 : 120 + i * 260); await page.screenshot({ path: `${OUT}/${k}_${i}.png` });
}
ok(errors.length === 0, '无页面错误' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));
console.log(`wfix_hd_look ${CLS} ${ANIM} ${pass}/${pass + fail}`); await b.close();
