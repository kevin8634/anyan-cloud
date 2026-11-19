// v0.7.1-br.A 炼金投弹手截图：node test/snap.mjs test/v071-shots.mjs → /tmp/v071_*.png
export default async page => {
  const ev = f => page.evaluate(f);
  await ev(() => { document.getElementById('class-pick').children[3].click(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v071_title.png' });
  await ev(() => { document.getElementById('start').click(); });
  await page.waitForTimeout(1500);
  await ev(() => {
    const g = window.__game, inv = g.inventory; g.gen.classId = 'alchemy';
    for (const sl of ['shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet']) { const it = g.gen.generate(20, 'purple', [sl]); inv.add(it); inv.equip(it.id); }
    const a = g.gen.generate(20, 'purple', ['oneHand']), b = g.gen.generate(20, 'blue', ['offHand']);
    inv.add(a); inv.add(b); inv.equip(a.id, 'mainHand'); inv.equip(b.id, 'offHand');
    g.player.pos.set(14, 0, 8); g.player.rig.root.rotation.y = 0.9; g.camYawSet(0.4); g.camSet(4.2, 0.2); g.player.rig.anim?.loop('idle');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v071_gear.png' });
  await ev(() => {
    const g = window.__game;
    const w = g.enemies.find(e => e.kind === 'wolf' && e.alive);
    g.player.pos.set(w.pos.x - 8, 0, w.pos.z); g.target = w; g.camYawSet(-Math.PI / 2); g.camSet(13, 0.75);
    w.maxHp = w.hp = 99999; w.status.add({ key: 'tst', kind: 'stun', remaining: 6, source: null });
    g.tryCast('skill3');
  });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: '/tmp/v071_pool.png' });
  await ev(() => { const g = window.__game; g.tryCast('skill1'); setTimeout(() => g.tryCast('skill3'), 200); });
  await page.waitForTimeout(1250);
  await page.screenshot({ path: '/tmp/v071_boom.png' });
  await ev(() => { const g = window.__game; g.loadout.resetCooldown('ultimate'); g.tryCast('ultimate'); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/v071_pot.png' });
};
