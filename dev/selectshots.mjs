// v1.2.49 选角重做截图：A 态（默认）+ B 态（点选职业）；可选多组 __selTune 调参
//   node dev/selectshots.mjs <html> <输出目录> <前缀> [quality=high] [宽x高=1600x900] [tunes.json] [B 态点第几个职业=0]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync, readFileSync } from 'fs';
const [html, OUT = '/tmp/selshots', PRE = 'sel', Q = 'high', SIZE = '1600x900', TUNES = '', PICK = '0'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const [W, H] = SIZE.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(300000);
// 10-27：CM=new 拍写实角色 / 写实营地（默认 auto = 经典）
await page.addInitScript(([q, cm]) => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify(Object.assign({ quality: q }, cm ? { charModel: cm } : {}))); } }, [Q, process.env.CM || '']);
const t0 = Date.now();
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent !== '加载中…', null, { timeout: 300000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(await page.evaluate(() => window.__game.selectInfo())));
// 开场动画如还在：点掉
await page.evaluate(() => { const s = document.getElementById('intro'); if (s && s.style.display !== 'none') s.click(); });
await page.waitForTimeout(6000);
const tunes = TUNES ? JSON.parse(readFileSync(TUNES, 'utf8')) : [[ 'A', null ]];
for (const [name, tu] of tunes) {
  await page.evaluate(tu => { window.__selTune = tu ?? undefined; }, tu);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${PRE}_${name}.png` });
  console.log('shot', name, JSON.stringify(await page.evaluate(() => window.__game.selectScreens().map(s => [s.id, Math.round(s.x), Math.round(s.y)]))));
}
// B 态：点名字牌
await page.evaluate(i => document.getElementById('class-pick').children[i].click(), +PICK);
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/${PRE}_B.png` });
console.log('shot B', JSON.stringify(await page.evaluate(() => window.__game.selectInfo())));
// 进入游戏：选角背景必须还原（区域 / 模型缩放 / 怪物显示）
await page.evaluate(() => document.getElementById('start').click());
await page.waitForTimeout(6000);
console.log('after start', JSON.stringify(await page.evaluate(() => { const g = window.__game; return { started: document.getElementById('title').style.display === 'none', zone: g.zone, sel: g.selectInfo().active, scale: g.player.rig.root.scale.x, sx: g.player.pos.x.toFixed(1), sz: g.player.pos.z.toFixed(1), fov: g.camera.fov, hiddenMobs: g.enemies.filter(e => !e.rig.root.visible).length }; })));
console.log('errors:', JSON.stringify(errors.slice(0, 10)));
await b.close().catch(() => {});
