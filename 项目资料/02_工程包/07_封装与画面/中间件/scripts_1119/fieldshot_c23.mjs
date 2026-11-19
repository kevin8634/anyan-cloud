// C23 自查：本体野外（开局 world）4 朝向，含正对 Demo 太阳。node fieldshot_c23.mjs <html> <out> <query>
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const [html, OUT, QS = '', TAG = 'on'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--disable-dev-shm-usage', '--renderer-process-limit=1', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [], logs = [];
page.on('crash', () => console.log('PAGE CRASH'));
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { const t = m.text(); if (/error|shader|GL_|\[ql|\[demotree/i.test(t)) logs.push(m.type() + ' ' + t.slice(0, 300)); });
const url = 'http://127.0.0.1:8790/index.html' + (QS ? '?' + QS : '');
await page.addInitScript(() => { try { if (!localStorage.getItem('darkrock_settings')) { localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: process.env.Q || 'medium', charModel: 'new' })); } } catch (e) {} });
await page.goto(url, { timeout: 0, waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(6000);
await page.evaluate(m => { const g = window.__game; g.tutFinish?.(); g.progression.level = 20; try { g.ensureWild?.(m); } catch (e) {} g.goMap(m); }, process.env.MAP || 'field');
await page.waitForTimeout(12000);
const info = await page.evaluate(() => { const g = window.__game; g.player.hp = g.player.maxHp = 1e7; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; }); return { zone: g.zone ?? g.currentMap ?? '?', p: [g.player.pos.x, g.player.pos.y, g.player.pos.z] }; });
console.log('info', JSON.stringify(info));
const yaws = [['sun', 0.38], ['side', 0.38 + Math.PI / 2], ['back', 0.38 + Math.PI], ['up_sun', 0.38]];
for (const [n, a] of yaws) {
  await page.evaluate(([n, a]) => { const g = window.__game, p = g.player.pos; if (g.player.rig) g.player.rig.root.visible = false;
    const dx = Math.sin(a), dz = -Math.cos(a), h = n === 'up_sun' ? 1.7 : 6;
    window.__camOv = [p.x - dx * 8, p.y + h, p.z - dz * 8, p.x + dx * 40, p.y + (n === 'up_sun' ? 14 : 2), p.z + dz * 40];
    document.querySelectorAll('body > *:not(canvas)').forEach(e => { if (!e.querySelector('canvas')) e.style.visibility = 'hidden'; }); }, [n, a]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${TAG}_${n}.png` }); console.log('shot', n);
}
writeFileSync(`${OUT}/${TAG}_console.txt`, 'pageerror:\n' + errs.join('\n') + '\n\nconsole:\n' + logs.join('\n'));
console.log('errors', errs.length, 'logs', logs.length);
await b.close();
