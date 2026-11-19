// 10-27 营地 NPC 写实 / 经典排查（由 blackprobe 改）;（结论：envhd 崖脚碎石 envhd_debris 按本体地形撒在海底地面下 / 上，已在 plaza_dress 标 envNoDebris）。经典 / 写实 + 超高画质：列出营地附近网格的材质概况，再数近景近黑像素、逐个隐藏候选网格找来源
//   node dev/blackprobe.mjs <html> [charModel=auto] [quality=ultra]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, CM = 'auto', Q = 'ultra'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(300000); page.setDefaultNavigationTimeout(300000);
await page.addInitScript(([q, cm]) => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: cm })); } }, [Q, CM]);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(4000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; try { g.ensureWild('dlc1_mirror'); } catch (e) {} g.goMap('dlc1_mirror'); });
await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse(o => { if (o.name?.startsWith('luxscene_')) n++; }); return n > 0; }, null, { timeout: 150000, polling: 2000 }).catch(() => console.log('no luxscene'));
await page.waitForTimeout(8000);
console.log('plaza', JSON.stringify(await page.evaluate(() => { const d = window.__dlc1.plaza(); const g = window.__game; let hd = 0, kay = []; g.scene.traverse(o => { if (o.userData?.npcHd) hd++; if (/^(Mage|Rogue|Knight|Barbarian)_Body$/.test(o.name)) { const w = o.getWorldPosition(new o.position.constructor()); kay.push([o.name, +(w.x - 2400).toFixed(1), +(w.z + 2100).toFixed(1)]); } });
  return { pending: d.pending, upgraded: d.upgraded, upErr: d.upErr, hd: d.hd, scenes: d.scenes, q: d.q, npcHdRoots: hd, kay }; })));
await Promise.race([b.close().catch(() => {}), new Promise(r => setTimeout(r, 15000))]); process.exit(0);
