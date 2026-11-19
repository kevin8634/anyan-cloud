// v0.7.0-br.A 时砂行者截图：node test/snap.mjs test/v070-shots.mjs → /tmp/v070_*.png
export default async page => {
  const ev = f => page.evaluate(f);
  await ev(() => { document.getElementById('class-pick').children[2].click(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v070_title.png' });
  await ev(() => { document.getElementById('start').click(); });
  await page.waitForTimeout(1500);
  await ev(() => {
    const g = window.__game, inv = g.inventory; g.gen.classId = 'chrono';
    for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back']) { const it = g.gen.generate(20, 'purple', [sl]); inv.add(it); inv.equip(it.id); }
    const a = g.gen.generate(20, 'orange', ['oneHand']), b = g.gen.generate(20, 'purple', ['oneHand']);
    inv.add(a); inv.add(b); inv.equip(a.id, 'mainHand'); inv.equip(b.id, 'offHand');
    g.player.pos.set(-6, 0, 10); g.player.rig.root.rotation.y = 0; g.camYawSet(0); g.camSet(4.2, 0.2); g.player.rig.anim?.loop('idle');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v070_gear.png' });
  // 原野狼群：千刃回旋 + 时痕
  await ev(() => {
    const g = window.__game;
    const w = g.enemies.find(e => e.kind === 'wolf' && e.alive);
    g.player.pos.set(w.pos.x - 6, 0, w.pos.z); g.target = w; g.camYawSet(-Math.PI / 2); g.camSet(13, 0.7);
    g.chrono.sand = 6; g.tryCast('skill2');
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/v070_spin.png' });
  await page.waitForTimeout(1900);
  await page.screenshot({ path: '/tmp/v070_echo.png' });
  await ev(() => { const g = window.__game; g.loadout.resetCooldown('ultimate'); g.tryCast('ultimate'); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/v070_stop.png' });
};
