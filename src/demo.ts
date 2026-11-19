// 运行：npm run demo   —— 在命令行里演示技能变种，不依赖引擎
import { Loadout } from './core/Loadout';
import { ResolvedSkill, CastContext } from './core/types';
import { SKILLS, TALENTS, ITEMS, SET_BONUSES, COMBOS } from './data/warrior';

const log = (s: ResolvedSkill) => console.log(
  `  ▶ ${s.displayName.padEnd(10)} [${s.element}/${s.shape}] 伤害${s.stats.damage.toFixed(0)} 冷却${s.stats.cooldown.toFixed(1)}s` +
  ` 半径${s.stats.radius.toFixed(1)} 投射物${s.stats.projectileCount}` +
  (s.effects.length ? ` 效果:${s.effects.map(e => e.type).join(',')}` : '') +
  (s.appliedModifiers.length ? `  ← ${s.appliedModifiers.join(', ')}` : ''));

const hero = new Loadout({ execute: () => {} });
hero.equipSkill(SKILLS.slash, 'basic');
hero.equipSkill(SKILLS.charge, 'skill1');
hero.equipSkill(SKILLS.whirlwind, 'skill2');
hero.equipSkill(SKILLS.thunderclap, 'skill3');
hero.equipSkill(SKILLS.avatar, 'ultimate');
hero.setComboModifiers(COMBOS);
hero.setSetBonuses(SET_BONUSES);

let t = 0;
const ctx = (hp = 1): CastContext => ({ now: t, casterHpPercent: hp, targetEffects: [] });
const showAll = (title: string) => {
  console.log(`\n== ${title} ==`);
  hero.equippedSlots.forEach(s => log(hero.preview(s, ctx())!));
};

showAll('1. 裸装');

hero.setTalents([TALENTS[0], TALENTS[1]]);
showAll('2. 天赋：烈焰之刃 + 焦土');

hero.setItems(ITEMS);
showAll('3. 再穿上 寒冰核心 / 风暴战斧 / 狂怒2件套');

console.log('\n== 4. 实战：冲锋 → 旋风斩（触发组合）→ 再旋风斩（组合已消耗）==');
log(hero.tryCast('skill1', ctx())!); t += 1;
log(hero.tryCast('skill2', ctx())!); t += 7;
log(hero.tryCast('skill2', ctx())!);

console.log('\n== 5. 残血 25%：背水一战 ==');
hero.setTalents([TALENTS[0], TALENTS[1], TALENTS[2]]);
t += 1; log(hero.tryCast('skill3', ctx(0.25))!);
log(hero.tryCast('ultimate', ctx(0.25))!);
