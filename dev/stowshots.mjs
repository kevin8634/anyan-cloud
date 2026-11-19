// v1.2.48 武器收纳截图：每职业 闲置收纳 + 出手（攻击中途）各一张（背后 3/4 视角 + 侧面），打印收纳状态
// 用法：Q=ultra node dev/stowshots.mjs [html] [输出目录] [职业,…] [模型 new|classic]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/stow'; mkdirSync(OUT, { recursive: true });
const CLS = (process.argv[4] || 'warrior,mage,chrono,alchemy,hunter,coffin').split(','), MODEL = process.argv[5] || 'new';
let b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let page = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = [];
const todo = [...CLS], tries = {};
while (todo.length) { const c = todo.shift(); try {
  await b.close().catch(() => {}); b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); page = await b.newPage({ viewport: { width: 900, height: 900 } }); page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(([q, m]) => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: m })); sessionStorage.setItem('__init', '1'); } }, [process.env.Q || 'low', MODEL]);
  await page.goto('file://' + HTML);
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
  await page.evaluate(c => window.__game.startGame(c), c);
  await page.waitForTimeout(+(process.env.WAIT || 6000));
  await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); });
  if (process.env.HIDEFX) await page.evaluate(() => {   // 截图用：隐藏场景里不属于玩家的粒子 / 光点精灵（泛光会把它们放大成亮球挡住人物）
    const g = window.__game, rig = g.player.rig.root, mine = new Set(); rig.traverse(o => mine.add(o));
    let sc = rig; while (sc.parent) sc = sc.parent;
    window.__hideFx = () => sc.traverse(o => { if (!mine.has(o) && (o.isPoints || o.isSprite || (o.isMesh && o.material && o.material.blending === 2))) o.visible = false; });
    window.__hideFx(); setInterval(window.__hideFx, 100);
  });
  const shoot = async (tag, yaw) => {
    await page.evaluate(([y, cd, cpt, cy]) => { const g = window.__game; if (cy !== null) { g.camYawSet(cy); y += cy; } g.player.rig.root.rotation.y = y; g.camSet(cd, cpt); g.camera.fov = 40; g.camera.updateProjectionMatrix(); }, [yaw, +(process.env.CD || 4.2), +(process.env.CP || 0.28), process.env.CAMY ? +process.env.CAMY : null]);
    await page.waitForTimeout(+(process.env.SW || 600));
    const cp = await page.evaluate(() => { const g = window.__game, v = g.player.rig.root.getWorldPosition(new g.player.rig.root.position.constructor()); v.y += 1.2; v.project(g.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
    if (process.env.LOGCAM) console.log('CAM', tag, await page.evaluate(() => { const g = window.__game, c = g.camera.position, p = g.player.rig.root.position; return [Math.atan2(c.x - p.x, c.z - p.z).toFixed(2), g.player.rig.root.rotation.y.toFixed(2)]; }));
    await page.screenshot({ path: `${OUT}/${c}_${tag}.png`, clip: { x: Math.max(0, Math.min(900 - 440, cp.x - 220)), y: Math.max(0, Math.min(900 - 560, cp.y - 300)), width: 440, height: 560 } });
  };
  await page.evaluate(() => window.__game.stow.force('stowed'));
  await page.waitForFunction(() => window.__game.stow.info().k === 1, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const si = await page.evaluate(() => window.__game.stow.info());
  console.log(c, 'STOWED', JSON.stringify(si.items.map(i => [i.spot, i.parent, +(i.dSock ?? -1).toFixed(3), +i.dHand.toFixed(3), +(i.len ?? 0).toFixed(2)])), 'idle=', await page.evaluate(() => window.__game.stow.clip('idle')));
  await shoot('stow_back', 3.14 - 0.6);
  await shoot('stow_side', 3.14 + 1.2);
  await shoot('stow_front', 0.6);   // 正面 3/4：腰前 / 胯前的挂件（负棺人钩链）
  await page.evaluate(() => window.__game.stow.force('drawn'));
  await page.waitForFunction(() => window.__game.stow.info().k === 0, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.player.rig.anim.play('attack1', 0.3));
  await page.waitForTimeout(+(process.env.ATK || 1200));
  const di = await page.evaluate(() => window.__game.stow.info());
  console.log(c, 'DRAWN', JSON.stringify(di.items.map(i => [i.spot, +i.dHand.toFixed(3)])), 'k', di.k);
  await shoot('draw', 0.6);
} catch (e) { tries[c] = (tries[c] || 0) + 1; console.log('RETRY', c, String(e).split('\n')[0]); if (tries[c] < 3) todo.unshift(c); } }
console.log('errors', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
