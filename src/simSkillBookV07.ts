// 运行：npm run skillbook7 —— v0.7.4-br.A 新职业技能书数据 + 首饰职业版特效
import { SkillBook } from './core/SkillBook';
import { CLASSES, skillBookData } from './data/classes';
import { SLOT_CHOICES, RUNES, PRESETS } from './data/skillbook';
import { ALC_SINGLE } from './data/skillbook_v07';
import { SHARED_LG_069 } from './data/legendary_v069';
import { DARK_ITEMS } from './data/darkgold';
import { DUNGEON_SET_ITEMS } from './data/dungeon_new';
import { CLASSFX_V07_IDS } from './data/classfx_v07';
import './data/loot';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
for (const id of ['chrono', 'alchemy'] as const) {
  const c = CLASSES[id], ch = SLOT_CHOICES[id];
  console.log(`== ${c.name}`);
  const slots = ['skill1', 'skill2', 'skill3', 'ultimate'] as const;
  check(slots.every(s => ch[s]!.length === 3 && ch[s]![0] === c.loadout[s] && ch[s]!.every(k => c.skills[k]?.slot === s)), '4 槽各 3 选 1，第 1 个是原技能，槽位正确');
  const all = slots.flatMap(s => ch[s]!);
  check(all.every(k => RUNES.filter(r => r.skillId === k).length === 3), `12 个技能每个 3 枚符文（共 ${RUNES.filter(r => all.includes(r.skillId)).length}）`);
  const ps = PRESETS.filter(p => p.cls === id);
  check(ps.length === 3 && ps.every(p => Object.entries(p.skills).every(([s, k]) => ch[s as 'skill1']!.includes(k!)) && Object.values(p.runes).every(r => RUNES.some(x => x.id === r))), '3 张推荐卡，技能 / 符文都存在');
  const b = new SkillBook(skillBookData(c));
  check(b.unlearned().length === 8, `技能书：8 个可学（${b.unlearned().join(',')}）`);
  if (id === 'alchemy') check(['skill1', 'skill2', 'skill3'].every((s, i) => ch[s as 'skill1']!.slice(1).every(k => c.skills[k].tags.includes(`reagent_${'rbg'[i]}`) && !!ALC_SINGLE[k])), '同色替换：新药剂保留颜色标签，并有自己的单投配方');
}
const lines = (mods: { cls?: string }[]) => ['chrono', 'alchemy'].every(k => mods.some(m => m.cls === k));
const lgOk = SHARED_LG_069.filter(l => lines([l.modifier, ...(l.extra ?? [])])).length;
const itOk = [...DARK_ITEMS, ...DUNGEON_SET_ITEMS].filter(i => CLASSFX_V07_IDS.includes(i.id) && lines((i as { modifiers?: { cls?: string }[] }).modifiers ?? [])).length;
check(lgOk === 4 && itOk === 7, `首饰职业版：多职业橙装 ${lgOk}/4，隐藏橙装 + 暗金 ${itOk}/7（共 ${lgOk + itOk} 件 × 2 职业）`);
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
if (fails) process.exitCode = 1;
