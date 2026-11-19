// 运行：npm run skillbook —— v0.6.8 技能书：每槽 3 选 1、学书、熟练度解锁符文、符文改技能、流派推荐卡、存档往返、16 个新技能都能打出伤害
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction } from './core/Combat';
import { Loadout } from './core/Loadout';
import { SlotId, ResolvedSkill, SLOT_IDS } from './core/types';
import { SkillBook, masteryGain } from './core/SkillBook';
import { CLASSES, skillBookData } from './data/classes';
import { ALT_SKILLS, SLOT_CHOICES, RUNES, PRESETS, RUNE_NEED, TOME_LEVELS } from './data/skillbook';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number; healed = 0; dmg = 0;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number) { this.dmg += n; }
  onHealed(n: number) { this.healed += n; }
}
const noop = { execute: (_s: ResolvedSkill) => {} };
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };

for (const cls of ['warrior', 'mage'] as const) {
  const c = CLASSES[cls];
  console.log(`\n=== ${c.name} ===`);
  const book = new SkillBook(skillBookData(c));
  // 数据完整
  const slots = ['skill1', 'skill2', 'skill3', 'ultimate'] as SlotId[];
  check(slots.every(s => SLOT_CHOICES[cls][s]!.length === 3 && SLOT_CHOICES[cls][s]![0] === c.loadout[s] && SLOT_CHOICES[cls][s]!.every(id => c.skills[id]?.slot === s)), '4 个槽位各 3 选 1，第 1 个是原技能，新技能槽位正确');
  const all = slots.flatMap(s => SLOT_CHOICES[cls][s]!);
  check(all.every(id => RUNES.filter(r => r.skillId === id).length === 3 && RUNES.filter(r => r.skillId === id).map(r => r.need).join() === RUNE_NEED.join()), `${all.length} 个技能各 3 枚符文（熟练度 ${RUNE_NEED.join(' / ')}）`);
  check(new Set(RUNES.map(r => r.id)).size === RUNES.length, '符文 id 不重复');
  // 开局
  check(slots.every(s => book.skillAt(s).id === c.loadout[s]) && book.unlearned().length === 8, '开局：只会原技能，8 个新技能待学');
  const alt = ALT_SKILLS[cls][0];
  check(book.setSkill('skill1', alt.id) !== null, `没学「${alt.name}」不能装`);
  check(book.learn(alt.id) && book.setSkill('skill1', alt.id) === null && book.skillAt('skill1').id === alt.id, `学会「${alt.name}」后可以装进技能 1`);
  check(book.setSkill('skill2', alt.id) !== null, '不能放进别的槽位');
  // 熟练度 → 符文
  const g = masteryGain(alt), runes = book.runesOf(alt.id);
  check(book.setRune(alt.id, runes[0].id) !== null, '熟练度不够不能装符文');
  let unlocked: string[] = [];
  for (let i = 0; i < Math.ceil(600 / g); i++) unlocked.push(...book.addCast(alt.id).map(r => r.name));
  check(unlocked.length === 3 && book.mastery[alt.id] >= 600, `施放 ${Math.ceil(600 / g)} 次（每次 +${g}）依次解锁：${unlocked.join(' → ')}`);
  const ult = book.skillAt('ultimate');
  check(masteryGain(ult) >= 9, `大招每次熟练度 +${masteryGain(ult)}（冷却 ${ult.stats.cooldown} 秒，不会练到天荒地老）`);
  // 符文改技能
  const lo = new Loadout(noop);
  SLOT_IDS.forEach(s => lo.equipSkill(s === 'basic' ? c.skills[c.loadout.basic] : book.skillAt(s), s));
  const plain = lo.preview('skill1', ctx)!;
  const elRune = runes.find(r => r.element)!;
  book.setRune(alt.id, elRune.id); lo.setComboModifiers(book.activeRuneMods());
  const withRune = lo.preview('skill1', ctx)!;
  check(withRune.element === elRune.element && withRune.element !== plain.element && withRune.displayName !== plain.displayName && book.runeElements().includes(elRune.element!), `元素符文「${elRune.name}」：${plain.displayName}（${plain.element}）→ ${withRune.displayName}（${withRune.element}），计入元素流派`);
  book.setSkill('skill1', c.loadout.skill1);
  check(book.activeRuneMods().length === 0, '换回原技能后，新技能的符文不生效');
  // 推荐卡
  const p = PRESETS.filter(x => x.cls === cls)[2];
  const skipped = book.applyPreset(p);
  check(skipped.length > 0 && book.skillAt('skill1').id === c.loadout.skill1, `推荐卡「${p.name}」：没学会的跳过并提示（${skipped.length} 条）`);
  p && Object.values(p.skills).forEach(id => book.learn(id!));
  Object.keys(p.runes).forEach(id => { for (let i = 0; i < 700; i++) book.addCast(id); });
  check(book.applyPreset(p).length === 0 && Object.entries(p.skills).every(([s, id]) => book.skillAt(s as SlotId).id === id), `全学会后一键套用「${p.name}」`);
  // 自选书按等级
  check(book.tomesForLevel(9, TOME_LEVELS) === 0 && book.tomesForLevel(25, TOME_LEVELS) === 2 && book.tomesForLevel(30, TOME_LEVELS) === 1 && book.tomesForLevel(30, TOME_LEVELS) === 0, '10 / 20 / 30 级各送 1 本自选书，只送一次');
  // 存档往返
  const sv = JSON.parse(JSON.stringify(book.save()));
  const b2 = new SkillBook(skillBookData(c)); b2.load(sv);
  check(JSON.stringify(b2.save()) === JSON.stringify(book.save()), '存档往返一致');
  const b3 = new SkillBook(skillBookData(c)); b3.load({ learned: ['nope'], equip: { skill1: alt.id }, mastery: { [alt.id]: -5 }, rune: { [alt.id]: 'r_x' } });
  check(b3.skillAt('skill1').id === c.loadout.skill1 && !b3.mastery[alt.id] && !b3.rune[alt.id], '坏存档：没学会的技能 / 负熟练度 / 不存在的符文都被丢弃');
  const b4 = new SkillBook(skillBookData(c)); b4.load(undefined);
  check(slots.every(s => b4.skillAt(s).id === c.loadout[s]), '老存档没有技能书字段：原技能');
  // 16 个新技能 + 全部符文都能打出伤害
  let okAll = true, bad = '';
  for (const id of all) {
    const def = c.skills[id], slot = def.slot;
    for (const rid of [null, ...RUNES.filter(r => r.skillId === id).map(r => r.id)]) {
      const L = new Loadout(noop); SLOT_IDS.forEach(s => L.equipSkill(s === slot ? def : s === 'basic' ? c.skills[c.loadout.basic] : c.skills[c.loadout[s]], s));
      if (rid) L.setComboModifiers([RUNES.find(r => r.id === rid)!.modifier]);
      const sk = L.preview(slot, ctx)!;
      const caster = new Dummy('P', 'player', 1000, { x: 0, z: 0 }); caster.hp = 500;
      const foes = [0, 1, 2, 3].map(i => new Dummy(`E${i}`, 'enemy', 5000, { x: 3 + i * 2, z: 0 }));
      const world: CombatWorld = { units: () => [caster, ...foes], resetCooldown: () => {} };
      new EffectSystem(world, () => 0.5).applySkill(sk, caster, [foes[0]]);
      if (!(foes[0].dmg > 0) || !(sk.stats.cooldown > 0) || !isFinite(sk.stats.damage)) { okAll = false; bad = `${def.name} ${rid ?? ''}`; }
    }
  }
  check(okAll, `${all.length} 个技能 × (无符文 + 3 枚符文) 都能造成伤害${bad ? ' ← ' + bad : ''}`);
}

console.log(fails ? `\n✗ ${fails} 项失败` : '\n✅ 技能书全部通过');
if (fails) process.exitCode = 1;
