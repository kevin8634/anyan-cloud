// 真实浏览器冒烟测试：无头 Chromium + SwiftShader（软件 WebGL，无需 GPU）打开 web/index.html
// 检查着色器编译 / 运行时错误，并截取 营地、矿洞、腐沼神殿、Boss 战、界面面板 的截图到 /tmp/shots
// 需要：npm i -D playwright-core && npx playwright-core install chromium
// 用法：node test/browser.mjs [1|2|all] [输出目录] [画质 high|medium|low]   （1=营地/面板/矿洞，2=腐沼神殿/Boss/法师）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const PART = process.argv[2] || 'all';
const OUT = process.argv[3] || '/tmp/shots';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || /Shader Error|WebGL|THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text().slice(0, 400)); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('crash', () => { console.log('💥 页面崩溃'); });
await page.goto('file://' + resolve('web/index.html'));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 60000 });
const wait = ms => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('📸', name); };
await wait(1500);
await shot('01_title');
const quality = process.argv[4] || 'high';
await page.evaluate(q => { localStorage.clear(); const s = JSON.parse(localStorage.getItem('darkrock_settings') || '{}'); s.quality = q; localStorage.setItem('darkrock_settings', JSON.stringify(s)); }, quality);
if (PART === '1' || PART === 'all') {
// 战士开局
await page.evaluate(() => { const g = window.__game; g.startGame('warrior'); g.player.pos.set(2, 0, 8); g.camYawSet(Math.PI * 0.85); });
await wait(2500);
await shot('02_camp');
await page.evaluate(() => { const g = window.__game; g.player.pos.set(1, 0, 10.5); g.camYawSet(Math.PI); });
await wait(1200);
await shot('03_camp_vendor');
// 面板
await page.evaluate(() => { const g = window.__game; g.inventory.addGold(800); g.inventory.addStack('mat_dust', 12); g.inventory.addStack('mat_shard', 3); for (let i = 0; i < 6; i++) g.inventory.add(window.__game.shop.offers.length ? null : null); });
await page.evaluate(() => { const g = window.__game; g.openShop(); });
await wait(600); await shot('04_shop_buy');
await page.evaluate(() => { const g = window.__game; g.shop.buy(3); g.shop.buy(7); const it = g.inventory.bag[0]; if (it) { g.inventory.equip(it.id); g.setShopTab('upgrade', it.id); } });
await wait(500); await shot('05_shop_upgrade');
await page.evaluate(() => { const g = window.__game; document.querySelector('[data-close=shop]').click(); g.progression.addXp(1500); });
await page.keyboard.press('n'); await wait(500); await shot('06_talents');
await page.keyboard.press('n'); await page.keyboard.press('b'); await wait(500); await shot('07_bag');
await page.keyboard.press('b');
// 狼林战斗
await page.evaluate(() => { const g = window.__game; g.player.pos.set(26, 0, 4); g.camYawSet(-Math.PI / 2); });
await wait(800);
for (let i = 0; i < 6; i++) { await page.evaluate(() => { const g = window.__game; g.tryCast('skill2'); g.tryCast('basic'); g.tryCast('skill3'); }); await wait(300); }
await shot('08_wolves_combat');
// 暗岩矿洞
await page.evaluate(() => { const g = window.__game; g.enterDungeon('darkrock_mine'); g.player.pos.set(400, 0, -8); g.camYawSet(0); });
await wait(1500); await shot('09_darkrock');
}
if (PART === '2' || PART === 'all') {
await page.evaluate(() => { const g = window.__game; if (!g.player || document.getElementById('title').style.display !== 'none') g.startGame('warrior'); });
// 腐沼神殿（直接解锁）
await page.evaluate(() => { const g = window.__game; if (g.zone === 'dungeon') g.leaveDungeon(true); g.quests.load({ active: {}, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine'] }); g.openTravel(); });
await wait(500); await shot('10_travel');
await page.evaluate(() => { const g = window.__game; g.enterDungeon('rotting_temple'); g.player.pos.set(-400, 0, 2); g.camYawSet(0); });
await wait(1800); await shot('11_swamp_entrance');
await page.evaluate(() => { const g = window.__game; g.player.pos.set(-400, 0, -8); });
await wait(1500); await shot('12_swamp_causeway');
await page.evaluate(() => { const g = window.__game; g.enemies.filter(e => e.z === 'dungeon' && !e.isBoss).forEach(e => { e.hp = 1; }); g.player.pos.set(-400, 0, -30); });
await wait(300);
await page.evaluate(() => { const g = window.__game; g.enemies.filter(e => e.z === 'dungeon' && !e.isBoss).forEach(e => g.dungeonRun.onUnitDeath(e.uid) || (e.hp = 0)); });
await wait(300);
await page.evaluate(() => { const g = window.__game; g.player.pos.set(-400, 0, -36); g.camYawSet(0); });
await wait(1500); await shot('13_swamp_temple');
// Boss 战：把 Boss 打到二阶段，看毒池/红圈/藤蔓
await page.evaluate(() => { const g = window.__game; g.player.maxHp = 99999; g.player.hp = 99999; g.player.pos.set(-400, 0, -58); });
await wait(2500);
await page.evaluate(() => { const g = window.__game; if (g.boss) g.boss.hp = Math.round(g.boss.maxHp * 0.6); });
await wait(5000); await shot('14_swamp_boss');
await page.evaluate(() => { const g = window.__game; g.camYawSet(Math.PI); });
await wait(2500); await shot('15_swamp_boss2');
// 法师
await page.evaluate(() => { const g = window.__game; g.leaveDungeon(true); document.getElementById('title').style.display = 'flex'; });
await wait(300);
await page.evaluate(() => { const g = window.__game; g.startGame('mage'); g.player.pos.set(26, 0, 4); g.camYawSet(-Math.PI / 2 + 0.4); });
await wait(1000);
for (let i = 0; i < 8; i++) { await page.evaluate(i => { const g = window.__game; g.tryCast('basic'); if (i === 2) g.tryCast('skill1'); if (i === 4) g.tryCast('skill2'); }, i); await wait(250); }
await shot('16_mage_combat');
await page.evaluate(() => { const g = window.__game; g.progression.addXp(99999); g.loadout.resetCooldown('ultimate'); g.tryCast('ultimate'); });
await wait(450); await shot('17_mage_meteor');
}
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('SwiftShader 帧率（软件渲染，仅供参考）:', fps);
console.log(errors.length ? `❌ 错误 ${errors.length}:\n${[...new Set(errors)].slice(0, 10).join('\n')}` : '✅ 浏览器内无错误');
await b.close();
