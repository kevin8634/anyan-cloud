// 运行：npm run gearview —— v0.6.7 装备基础框架：品质词条数固定（按层）、4 层分类、同一属性只出现一次、装备分、老存档装备直接分层
import { LootGenerator, ItemInstance, QUALITIES, Quality, AFFIX_PLAN, itemColor, SET_COLOR, QUALITY_COLOR } from './core/Loot';
import { gearLayers, gearScore, findAffix, STAT_KEYS } from './core/GearView';
import { LOOT_DATA } from './data/loot';
import { SaveManager, SaveStorage, GameSave } from './core/SaveManager';

declare const process: { exitCode?: number };
declare const require: (m: string) => { readFileSync(p: string, e: string): string };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const kindOf = (it: ItemInstance) => (it.affixLog ?? []).map(a => (a.sp ? LOOT_DATA.specialAffixes ?? [] : LOOT_DATA.affixes).find(x => x.id === a.id)!.kind);

console.log('=== 1. 品质词条数按层固定（每品质每职业 300 件）');
for (const cls of ['warrior', 'mage']) {
  const g = new LootGenerator(LOOT_DATA, seeded(cls === 'warrior' ? 7 : 11)); g.classId = cls;
  for (const q of ['green', 'blue', 'purple', 'orange'] as Quality[]) {
    const P = AFFIX_PLAN[q];
    let ok = true, bad = '', sMin = 9, sMax = 0, eMax = 0;
    for (let i = 0; i < 300; i++) {
      const it = g.generate(20 + (i % 15), q);
      const k = kindOf(it), c = k.filter(x => x === 'char').length, s = k.filter(x => x === 'skill').length, e = k.filter(x => x === 'effect').length;
      sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); eMax = Math.max(eMax, e);
      // 技能池为空的部位用属性补齐：属性 + 技能 = 计划的属性 + 技能
      const sOk = s >= 0 && s <= P.s[1], eOk = e <= P.e[1], total = c + s;
      if (!sOk || !eOk || total < P.c + P.s[0] || total > P.c + P.s[1] || new Set(it.affixLog!.map(a => a.id)).size !== it.affixLog!.length) { ok = false; bad = `${it.name}：${c}/${s}/${e}`; }
      if (q === 'orange' && !it.lines.some(l => l.startsWith('★'))) { ok = false; bad = `${it.name} 没有传说特效`; }
    }
    check(ok, `${cls} ${q}：属性 ${P.c} / 技能 ${P.s.join('~')} / 小特效 ${P.e.join('~')}（实际技能 ${sMin}~${sMax}，小特效 ≤${eMax}）${bad ? ' ← ' + bad : ''}`);
  }
}
{
  const g = new LootGenerator(LOOT_DATA, seeded(5)); g.classId = 'warrior';
  const set = g.generateFixed('i_fury_pauldron', 30)!;
  const k = kindOf(set);
  check(k.filter(x => x === 'char').length === 2 && k.filter(x => x === 'skill').length <= 1 && k.length >= 2, `套装件「${set.name}」：2 属性 + 1 技能（部位没有技能词条时补属性）`);
  check(itemColor(set) === SET_COLOR && itemColor({ quality: 'purple' }) === QUALITY_COLOR.purple && set.quality === 'purple', '套装件名字深翠绿显示（#2ED573），存档里的品质仍是史诗');
  const dk = g.generateFixed('d_bloodoath', 30)!;
  const dkk = kindOf(dk);
  check(dk.quality === 'dark' && dkk.length === 2 && dkk.every(x => x === 'char') && dk.lines.some(l => l.startsWith('❖')), `暗金「${dk.name}」：2 属性 + 固定 ❖ 大特效`);
}

console.log('\n=== 2. 4 层分类 + 同一属性只出现一次');
{
  const g = new LootGenerator(LOOT_DATA, seeded(42)); g.classId = 'warrior';
  let once = true, sums = true, cover = true, bad = '';
  const seen = { base: 0, attrs: 0, skills: 0, effects: 0, elems: 0 };
  for (let i = 0; i < 600; i++) {
    const it = g.generate(10 + (i % 25), QUALITIES[1 + (i % 4)]);
    const L = gearLayers(it, LOOT_DATA);
    const keys = [...L.base, ...L.attrs].map(x => x.k);
    if (new Set(keys).size !== keys.length) { once = false; bad = it.name; }
    for (const k of STAT_KEYS) { const v = k === 'hp' ? it.hp : k === 'armor' ? it.armor : it.bonus?.[k] ?? 0; const shown = [...L.base, ...L.attrs].find(x => x.k === k)?.v ?? 0; if (v !== shown) { sums = false; bad = `${it.name} ${k}`; } }
    // 每行词条都归到某一层（属性行并进数值，不单独显示）
    const nonChar = it.lines.filter(l => { const a = findAffix(LOOT_DATA, l.replace(/^✧ /, '').replace(/^〔.〕/, '')); return !a || a.kind !== 'char'; }).length;
    if (nonChar !== L.skills.length + L.effects.length) { cover = false; bad = it.name; }
    for (const k of Object.keys(seen) as (keyof typeof seen)[]) if ((L[k] as unknown[]).length) seen[k]++;
  }
  check(once, '同一属性只出现一次（基础和属性层不重复）' + (once ? '' : ' ← ' + bad));
  check(sums, '显示的数值 = 装备总属性（词条加的同名属性并进基础）' + (sums ? '' : ' ← ' + bad));
  check(cover, '技能 / 特效行一条不丢' + (cover ? '' : ' ← ' + bad));
  check(Object.values(seen).every(n => n > 20), `四层都出现过：基础 ${seen.base} / 属性 ${seen.attrs} / 技能 ${seen.skills} / 特效 ${seen.effects} 件；带元素 ${seen.elems} 件`);
  const axe = g.generate(30, 'purple', ['twoHand']);
  const L = gearLayers(axe, LOOT_DATA);
  check(L.base.some(x => x.k === 'power') && !L.attrs.some(x => x.k === 'power'), `双手武器「${axe.name}」：强度在基础层（底材固有）`);
}

console.log('\n=== 3. 装备分');
{
  const g = new LootGenerator(LOOT_DATA, seeded(9)); g.classId = 'mage';
  const avg = (q: Quality) => { let s = 0; for (let i = 0; i < 200; i++) s += gearScore(g.generate(30, q, ['chest']), LOOT_DATA); return Math.round(s / 200); };
  const a = QUALITIES.slice(1, 5).map(q => avg(q as Quality));
  check(a.every((v, i) => i === 0 || v > a[i - 1]), `同部位同装等，品质越高平均装备分越高：${a.join(' < ')}`);
  const lo = gearScore(g.generate(10, 'blue', ['chest']), LOOT_DATA), hi = gearScore(g.generate(35, 'blue', ['chest']), LOOT_DATA);
  check(hi > lo, `装等越高分越高：装等 10 → ${lo}，装等 35 → ${hi}`);
  const it = g.generate(30, 'purple', ['chest']); const s0 = gearScore(it, LOOT_DATA); it.durability = 0;
  check(s0 > 0 && gearScore(it, LOOT_DATA) === 0, '已损坏的装备 0 分（属性失效）');
}

console.log('\n=== 4. 老存档的装备直接分层（不迁移、不改存档）');
{
  const fs = require('fs');
  const mem = (): SaveStorage => { const m = new Map<string, string>(); return { get: k => m.get(k) ?? null, set: (k, v) => { m.set(k, v); }, remove: k => { m.delete(k); } }; };
  for (const f of ['v0.4.1', 'v0.5.0-c', 'v0.6.6-br.A']) {
    const raw = fs.readFileSync(`test/saves/${f}.json`, 'utf8'), s = mem(); s.set('k', raw);
    const g = new SaveManager(s, 'k', LOOT_DATA).loadResult().save as GameSave;
    const items = [...Object.values(g.inventory.equipped), ...g.inventory.bag].filter(Boolean) as ItemInstance[];
    const before = JSON.stringify(items);
    let ok = true, n = 0;
    for (const it of items) { try { const L = gearLayers(it, LOOT_DATA); n += L.base.length + L.attrs.length + L.skills.length + L.effects.length; if (!(gearScore(it, LOOT_DATA) >= 0)) ok = false; } catch { ok = false; } }
    check(ok && n > 0 && JSON.stringify(items) === before, `${f}：${items.length} 件装备分层显示正常（${n} 行），存档数据不变`);
  }
}

console.log(fails ? `\n✗ ${fails} 项失败` : '\n✅ 装备基础框架全部通过');
if (fails) process.exitCode = 1;
