// v0.7.6 英灵传承自动测试：npm run spirits
declare const process: { exitCode?: number };
import { Spirits } from './core/Spirits';
import { SPIRITS } from './data/spirits';
import { newRes, resEmpower, resThr } from './core/Resource';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
for (const c of ['warrior', 'mage', 'chrono', 'alchemy']) ok(SPIRITS.filter(s => s.cls === c).length === 12 && SPIRITS.filter(s => s.cls === c && s.unlock.stat === 'paragon').length === 6 && SPIRITS.some(s => s.cls === c && s.unlock.stat === 'level' && s.unlock.n === 10), `${c}：12 个英灵（6 个暗岩印记英灵），10 级送 1 个`);
ok(new Set(SPIRITS.map(s => s.id)).size === SPIRITS.length, 'id 不重复');
let lv = 9; const sp = new Spirits('warrior', () => lv);
ok(sp.slotCount() === 0 && !sp.equip(0, 'w_brann'), '9 级：没有传承槽');
lv = 10; ok(sp.slotCount() === 1 && sp.equip(0, 'w_brann'), '10 级：1 个槽，装上「百锻」');
ok(!sp.equip(0, 'w_troll'), '未解锁的英灵装不上');
ok(!sp.equip(0, 'm_tutor'), '别的职业的英灵装不上');
lv = 24; ok(sp.slotCount() === 3, '24 级：3 个槽'); lv = 30; ok(sp.slotCount() === 5, '30 级：5 个槽');
sp.bump('dungeon', 3); ok(sp.equip(1, 'w_troll'), '击败 3 个副本首领解锁「冰封怒涛」');
ok(sp.equip(2, 'w_troll') && sp.slots[1] === null, '同一英灵只能装一个槽（换槽自动移走）');
ok(sp.tier('w_brann') === 1, '初始 1 阶');
for (let i = 0; i < 4; i++) sp.bump('raid');
ok(sp.tier('w_brann') === 2 && (sp.xp['w_brann'] ?? 0) === 11 && sp.tier('w_troll') === 1, `装备时击败首领升阶：百锻 ${sp.xp['w_brann']} 次（之前装着的 3 次 + 长副本 4×2）→ 2 阶`);
ok(sp.modifiers().length === 2 && sp.modifiers().every(m => m.cls === 'warrior'), '修饰器 2 条（只对战士）');
sp.setStat('runeword', 3); sp.equip(3, 'w_rune');
const b = sp.resBonus(); ok(b.thrAdd === -5 && b.empowerMore > 0, `「刻痕」：怒气门槛 −5（${b.thrAdd}）`);
const r = newRes('warrior'); r.bonus = b; r.value = 45; ok(resThr(r) === 45 && !!resEmpower(r, 'skill1'), '门槛降到 45，45 怒气就能强化');
const sv = sp.save(); const sp2 = new Spirits('warrior', () => 30); sp2.load(sv);
ok(sp2.equipped().length === 3 && sp2.tier('w_brann') === 2, '存档读档：装备和阶数保留');
const c = new Spirits('chrono', () => 30); c.bump('dungeon', 8); c.equip(0, 'c_rift'); const rc = newRes('chrono'); rc.bonus = c.resBonus();
ok(rc.bonus.maxAdd === 1, '「叠影」：连击点上限 +1');
// v0.7.11：暗岩印记英灵
{ let pl = 0; const p = new Spirits('warrior', () => 30); p.paragonLevel = () => pl;
  ok(!p.equip(0, 'w_p_banner'), '印记 0 级：印记英灵未解锁');
  pl = 1; ok(p.equip(0, 'w_p_banner') && !p.equip(1, 'w_p_dark'), '印记 1 级解锁「残旗」，「岩心」要 50 级');
  pl = 50; ok(p.equip(1, 'w_p_dark') && p.resBonus().maxAdd === 10, '印记 50 级：「岩心」怒气上限 +10'); }
for (const d of SPIRITS) { const ms = d.mods(3); ok(Array.isArray(ms) && !!d.desc(3) && !d.desc(3).includes('NaN'), `${d.id}：3 阶说明 ${d.desc(3)}`); }
console.log(fail ? `\n❌ ${fail} 项失败` : '\n✅ 英灵传承 全部通过');
process.exitCode = fail ? 1 : 0;
