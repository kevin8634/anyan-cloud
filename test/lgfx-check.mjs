// v0.9.1r 橙装钩子冒烟（chromium）：直接调伤害结算 / 施法，看统计和数值
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = 'file://' + resolve(process.argv[2] || 'web/index.html');   // 11-04：原写死 /workspace/work/proj/web/index.html（目录已不存在）
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
let fail = 0;
async function run(clsIdx, body) {
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(HTML, { timeout: 600000 });
  await p.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 600000 });
  await p.evaluate(i => { document.getElementById('class-pick').children[i].click(); document.getElementById('start').click(); }, clsIdx);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.load({ level: 30, xp: 0 });
    window.eq = (id, slot) => { const it = g.gen.generate(30, 'purple', [slot]); it.lgId = id; g.inventory.add(it); return g.inventory.equip(it.id); };
    window.tgt = () => g.enemies.find(e => e.alive && e.type.name === '训练假人') ?? g.enemies.find(e => e.alive);
    window.dot = (e, el, dps, dur) => e.status.add({ key: 't:' + el, kind: 'dot', remaining: dur, dps, element: el, source: g.player, interval: 1 });
  });
  let res; try { res = await body(p); } catch (x) { console.log('❌ 异常', x.message.split('\n')[0], errs.slice(0, 3)); fail++; await p.close(); return; }
  for (const [ok, m] of res) { console.log(`${ok ? '✅' : '❌'} ${m}`); if (!ok) fail++; }
  if (errs.length) { console.log('❌ 页面错误', errs.slice(0, 3)); fail++; }
  await p.close();
}
// 战士
await run(0, async p => {
  const r = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    const e = tgt(); const ok = [eq('lg91_warrior_05', 'offHand'), eq('lg91_warrior_09', 'neck'), eq('lg91_warrior_24', 'trinket'), eq('lg91_warrior_12', 'back'), eq('lg91_warrior_21', 'ring'), eq('lg91_warrior_15', 'waist')];
    out.push([ok.every(Boolean), `装备 6 件战士橙装：${ok}`]);
    // 09：生命低于 50% 流血翻倍
    P.hp = P.maxHp; let h0 = e.hp; g.fx.dealDamage(e, 100, 'physical', P, false, false, true); const full = h0 - e.hp;
    P.hp = P.maxHp * 0.4; h0 = e.hp; g.fx.dealDamage(e, 100, 'physical', P, false, false, true); const low = h0 - e.hp; P.hp = P.maxHp;
    out.push([low >= full * 1.9, `09 半血流血翻倍：${full} → ${low}`]);
    // 05：流血每跳回血
    P.hp = P.maxHp * 0.5; const hp0 = P.hp; g.fx.dealDamage(e, 500, 'physical', P, false, false, true); out.push([P.hp > hp0 && g.lgfx().stats.w05 > 0, `05 流血回血：${hp0} → ${P.hp}`]);
    // 21：近战伤害反弹流血
    const m = g.enemies.find(x => x.alive && x !== e) ?? e; m.pos?.copy?.(P.pos);
    g.fx.dealDamage(P, 50, 'physical', m, false, false, false); out.push([g.lgfx().stats.w21 > 0 && m.status.dots().some(d => d.key.startsWith('lg:w21')), '21 近战反弹流血']);
    // 24：护盾被打破
    P.status.addShield('t', 40, 10, 999, P); window.__step = true; return out; });
  await p.waitForTimeout(200);
  const r2 = await p.evaluate(() => { const g = window.__game, P = g.player; const m = g.enemies.find(x => x.alive);
    g.fx.dealDamage(P, 200, 'arcane', m, false, false, false); return true; });
  await p.waitForTimeout(400);
  const r3 = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    out.push([g.lgfx().stats.w24 > 0, `24 护盾破裂流血：${g.lgfx().stats.w24}`]);
    // 12：大招期间减伤 + 结束化作流血
    g.loadout.resetCooldown('ultimate'); g.tryCast('ultimate'); const u = g.lgfx().ultUntil > g.T;
    const h0 = P.hp; const m = g.enemies.find(x => x.alive); g.fx.dealDamage(P, 100, 'arcane', m, false, false, false);
    out.push([u && h0 - P.hp <= 81, `12 大招期间受伤 -20%：受到 ${h0 - P.hp}`]); return out; });
  await p.evaluate(() => { const g = window.__game; const e = tgt(); e.pos.copy(g.player.pos); e.pos.x += 1; });
  await p.waitForFunction(() => window.__game.T > window.__game.lgfx().ultUntil + 0.5, null, { timeout: 400000 });
  const r4 = await p.evaluate(() => [[window.__game.lgfx().stats.w12 > 0, '12 大招结束：受到伤害化作流血']]);
  return [...r, ...r3, ...r4];
});
// 法师
await run(1, async p => {
  const r = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    const e = tgt(); const ok = [eq('lg91_mage_27', 'offHand'), eq('lg91_mage_43', 'ring'), eq('lg91_mage_47', 'trinket'), eq('lg91_mage_35', 'back'), eq('lg91_mage_38', 'waist'), eq('lg91_mage_41', 'feet')];
    out.push([ok.every(Boolean), `装备 6 件法师橙装：${ok}`]);
    // 29 / 44 用 ring / neck 位以外：换 44 到戒指测暴伤
    dot(e, 'fire', 10, 30);
    for (let i = 0; i < 200; i++) g.fx.dealDamage(e, 10, 'fire', P, true, false, true);
    out.push([g.lgfx().stats.m27 > 0, `27 燃烧暴击多烧一跳：${g.lgfx().stats.m27} 次`]);
    out.push([g.lgfx().stats.m43 > 0, `43 燃烧每跳 2% 重置技能 1：200 跳触发 ${g.lgfx().stats.m43} 次`]);
    return out; });
  await p.evaluate(() => { const g = window.__game, P = g.player; g.fx.zones.push({ pos: { x: P.pos.x, z: P.pos.z }, radius: 4, dps: 1, element: 'frost', ticksLeft: 5, tickTimer: 1, interval: 1, owner: P }); });
  await p.waitForTimeout(600);
  const r2 = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    const z = g.fx.activeZones.filter(z => z.owner === P && z.element === 'frost');
    out.push([z.length > 0 && z[0].ticksLeft >= 6 && g.lgfx().stats.m47 > 0, `47 冰原 +3 秒：冰原 ${z.length} 个，延长 ${g.lgfx().stats.m47}`]);
    const h0 = P.hp; g.fx.dealDamage(P, 100, 'arcane', g.enemies.find(x => x.alive), false, false, false);
    out.push([h0 - P.hp <= 86, `35 站在冰原里受伤 -15%：受到 ${h0 - P.hp}`]);
    // 41：移动留下冰霜路径
    for (let i = 0; i < 6; i++) P.pos.x += 0.5;
    return out; });
  await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => { const g = window.__game, P = g.player; P.pos.x += 1; return []; });
  await p.waitForTimeout(500);
  const r4 = await p.evaluate(() => [[window.__game.lgfx().trail > 0, `41 冰霜路径：${window.__game.lgfx().trail} 段`]]);
  // 46 / 44 / 29：换装
  const r5 = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    eq('lg91_mage_44', 'ring'); eq('lg91_mage_29', 'offHand');
    const e = tgt(); e.status.add({ key: 'sl', kind: 'slow', remaining: 30, percent: 0.3, source: P }); dot(e, 'fire', 1, 30);
    let h0 = e.hp; g.fx.dealDamage(e, 100, 'arcane', P, false, false, false); const a = h0 - e.hp;
    h0 = e.hp; g.fx.dealDamage(e, 100, 'arcane', P, true, false, false); const c = h0 - e.hp;
    out.push([a >= 114 && a <= 116, `29 燃烧 + 减速的目标受伤 +15%：100 → ${a}`]);
    const cm = P.critMult ?? 1.5, want = 115 * (cm + 0.3) / cm; out.push([Math.abs(c - want) <= 2, `44 对减速目标暴伤 +30%（暴伤 ×${cm}）：暴击 100 → ${c}，应为 ${Math.round(want)}`]);
    return out; });
  return [...r, ...r2, ...r4, ...r5];
});
// 时砂
await run(2, async p => {
  const r = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    const ok = [eq('lg91_chrono_61', 'waist'), eq('lg91_chrono_70', 'trinket'), eq('lg91_chrono_53', 'offHand'), eq('lg91_chrono_57', 'neck'), eq('lg91_chrono_67', 'ring')];
    out.push([ok.every(Boolean), `装备 5 件时砂橙装：${ok}`]);
    const e = tgt(); const d0 = g.chronoDebug().stats?.detonations ?? g.chrono.stats.detonations;
    for (let i = 0; i < 5; i++) g.chronoMark(e, 1);
    const d5 = g.chrono.stats.detonations; g.chronoMark(e, 1); const d6 = g.chrono.stats.detonations;
    out.push([d5 === d0 && d6 === d0 + 1, `61 时痕上限 +1：5 层未引爆、6 层引爆（${d0}/${d5}/${d6}）`]);
    out.push([g.lgfx().stats2.c53 > 0 && e.status.dots().some(d => d.key.startsWith('lg:c53')), '53 引爆附带切割']);
    g.chrono.sand = 99; let h0 = e.hp; g.fx.dealDamage(e, 100, 'physical', P, false, false, true); const a = h0 - e.hp;
    out.push([a === 125, `57 时砂满切割 +25%：100 → ${a}`]);
    for (let i = 0; i < 200; i++) g.fx.dealDamage(e, 1, 'physical', P, false, false, true);
    out.push([g.lgfx().stats2.c67 > 0, `67 切割叠时痕：200 跳 ${g.lgfx().stats2.c67} 次`]);
    eq('lg91_chrono_66', 'feet'); g.loadout.resetCooldown('skill1'); g.chrono.sand = 99; g.tryCast('skill1');
    out.push([g.lgfx().stats2.c66 > 0, '66 技能 1 起点留下回声']);
    return out; });
  return r;
});
// 炼金
await run(3, async p => {
  const r = await p.evaluate(() => { const g = window.__game, P = g.player, out = [];
    const ok = [eq('lg91_alchemy_95', 'trinket'), eq('lg91_alchemy_92', 'ring'), eq('lg91_alchemy_85', 'waist')];
    out.push([ok.every(Boolean), `装备 3 件炼金橙装：${ok}`]);
    const e = tgt();
    for (let i = 0; i < 12; i++) g.fx.dealDamage(e, 1, 'nature', P, false, false, true);
    let h0 = e.hp; g.fx.dealDamage(e, 100, 'arcane', P, false, false, false); const a = h0 - e.hp;
    out.push([a === 110, `95 腐蚀易伤叠到 10%：100 → ${a}`]);
    const o = g.enemies.find(x => x.alive && x !== e && !x.isDummy);
    if (o) { o.pos.copy(e.pos); o.pos.x += 1; dot(o, 'nature', 5, 10); g.fx.dealDamage(o, o.hp + 10, 'arcane', P, false, false, false); }
    out.push([!o || g.lgfx().stats2.a92 > 0, `92 腐蚀死亡传染：${o ? g.lgfx().stats2.a92 : '没有可杀的敌人，跳过'}`]);
    // 图标：套装 + 暗金
    const s1 = g.gen.generate(30, 'purple', ['chest']); s1.setId = 'set_alchemy'; g.inventory.add(s1);
    const s2 = g.gen.generate(30, 'purple', ['legs']); s2.quality = 'dark'; g.inventory.add(s2);
    g.togglePanel('bag', true);
    return out; });
  await p.waitForTimeout(800);
  const n = await p.evaluate(() => [document.querySelectorAll('.slot.is-set .spk').length, document.querySelectorAll('.slot.q-dark .spk').length]);
  const el = await p.$('.slot.is-set');
  if (el) { const box = await el.boundingBox(); await p.screenshot({ path: '/tmp/icons.png', clip: { x: Math.max(0, box.x - 120), y: Math.max(0, box.y - 60), width: 360, height: 160 } }); }
  return [...r, [n[0] > 0 && n[1] > 0, `图标：套装绿框+粒子 ${n[0]} 个，暗金粒子 ${n[1]} 个`]];
});
console.log(fail ? `❌ ${fail} 项失败` : '✅ 橙装钩子冒烟全部通过');
await b.close();
process.exitCode = fail ? 1 : 0;
