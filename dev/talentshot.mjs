// v1.2.67 天赋界面多分辨率截图 + 重叠检查：node dev/talentshot.mjs [html] [职业=mage] → shots_talentui/
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index.html'), CLS = process.argv[3] || 'mage', OUT = resolve(ROOT, 'shots_talentui'); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(c => window.__game.startGame(c), CLS); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game, t = g.tree; g.tutFinish?.(); g.progression.level = 40; t.totalPoints = 30; t.reset();
  const fill = (i, z, cap) => { const sp = t.def.specs[i]; let k = 0; for (const n of sp.nodes.filter(n => n.row <= z * 2).sort((a, b) => a.row - b.row || a.col - b.col)) while (k < cap && t.add(n.id)) k++; };
  fill(0, 3, 18); fill(1, 1, 6); fill(2, 1, 6); g.togglePanel('talent', true); g.renderTalents(); });
let bad = 0;
for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720]]) {
  await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => window.__game.renderTalents()); await page.waitForTimeout(700);
  const r = await page.evaluate(() => { const ns = [...document.querySelectorAll('#tal-tree .tnode')].map(e => e.getBoundingClientRect()); let ov = 0;
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], c = ns[j]; if (a.left < c.right - 2 && c.left < a.right - 2 && a.top < c.bottom - 2 && c.top < a.bottom - 2) ov++; }
    const panel = document.getElementById('talent').getBoundingClientRect(); const slot = document.querySelector('#tal-tree .tnode .slot').getBoundingClientRect();
    return { n: ns.length, ov, slot: Math.round(slot.width), panel: [Math.round(panel.width), Math.round(panel.height)], off: panel.right > innerWidth + 1 || panel.left < -1 }; });
  console.log(`${w}x${h}`, JSON.stringify(r)); if (r.ov || r.off) bad++;
  await page.screenshot({ path: `${OUT}/${CLS}_${w}x${h}.png`, timeout: 180000, clip: await page.evaluate(() => { const r = document.getElementById('talent').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(innerWidth, r.width), height: Math.min(innerHeight, r.height) }; }) });
}
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors'); console.log(bad ? `✗ 天赋界面 ${bad} 个分辨率有重叠/越界` : '✓ 天赋界面 3 个分辨率无重叠、无越界');
await b.close();
