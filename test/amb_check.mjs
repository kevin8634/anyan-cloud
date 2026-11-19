// 11-18 环境音接入自测（amb_sfx.ts，?off=ambsfx）：无头进世界 → 点一下解锁音频 → 营地白天 → 翠风原野夜间，读 __dbg.ambDebug()：
//   该放的层（amb_camp_day → amb_forest_night）在放、只解码了用到的条目、狼嚎倒计时在走、页面无报错。
// node test/amb_check.mjs [html，默认比赛版]   比赛版需带 assets_aholo/audio/amb（可用 AHOLO_ASSETS_DIR 只放环境音的临时目录构建）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = process.argv[2] || 'web/index_比赛版.html';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); localStorage.setItem('darkrock_intro_seen', '1'); } catch (e) {} });
const errors = [], warns = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (/环境音/.test(m.text())) warns.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(900000);
await page.goto('file://' + resolve(HTML) + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && window.__dbg && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.mouse.click(480, 270);
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
await page.mouse.click(480, 270);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.setGameHour?.(12); try { g.progression.level = 70; } catch (e) {} });
await page.waitForTimeout(6000);
const camp = await page.evaluate(() => window.__dbg.ambDebug());
console.log('camp 12:00', JSON.stringify(camp));
await page.evaluate(() => { window.__game.setGameHour?.(23); window.__game.goMap('field'); });
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && window.__game.currentMap() === 'field', null, { timeout: 600000 });
await page.waitForTimeout(8000);
const field = await page.evaluate(() => window.__dbg.ambDebug());
console.log('field 23:00', JSON.stringify(field));
const ok = camp.layers.some(l => l.name === 'amb_camp_day' && l.playing) && field.layers.some(l => l.name === 'amb_forest_night' && l.playing && !l.stopping) && field.howlIn > 0
  && !field.decoded.includes('amb_rift') && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL', 'errors=' + JSON.stringify(errors.slice(0, 5)), 'warns=' + JSON.stringify(warns.slice(0, 5)));
await b.close();
