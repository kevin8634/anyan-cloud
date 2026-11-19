// 职业注册表：开局选择职业，每个职业独立存档（技能、天赋树、组合、基础属性）
import { SKILL4 } from './skills_v078';
import { talentTree2 } from './talents2';   // v0.7.7 天赋树 2.0
import { talentTree3, SPEC_V3 } from './talents3';   // v1.2.58 天赋 3.0
import { SkillDef, ModifierDef, SlotId } from '../core/types';
import { TalentTreeDef } from '../core/TalentTree';
import { SKILLS, COMBOS } from './warrior';
import { WARRIOR_TREE } from './talents_warrior';
import { MAGE_SKILLS, MAGE_COMBOS } from './mage';
import { MAGE_TREE } from './talents_mage';
import { CHRONO_SKILLS, CHRONO_COMBOS } from './chrono';
import { CHRONO_TREE } from './talents_chrono';
import { ALCHEMY_SKILLS, ALCHEMY_COMBOS } from './alchemy';
import { ALCHEMY_TREE } from './talents_alchemy';
import { EquipRules } from '../core/Inventory';
import { ALT_SKILLS, SLOT_CHOICES, RUNES, PRESETS, TALENT_ONLY_SKILLS } from './skillbook';
import { SkillBookData } from '../core/SkillBook';
import { withPackRecord } from '../core/ContentPacks';
import type { ClassExt } from '../core/ClassExt';

const withAlt = (base: Record<string, SkillDef>, cls: 'warrior' | 'mage' | 'chrono' | 'alchemy') => ({ ...base, ...Object.fromEntries(ALT_SKILLS[cls].map(s => [s.id, s])) });

export type ClassId = 'warrior' | 'mage' | 'chrono' | 'alchemy';

export interface ClassDef {
  id: ClassId;
  name: string;
  desc: string;
  /** v0.6.8：原技能 + 技能书新技能 */
  skills: Record<string, SkillDef>;
  loadout: Record<SlotId, string>;     // 槽位 → 技能 id
  tree: TalentTreeDef;
  combos: ModifierDef[];
  baseHp: number;
  hpPerLevel: number;
  critChance: number;
  ranged: boolean;                      // 远程职业：机器人/AI 保持距离
  /** 打断读条用的槽位（UI 提示、AI 用） */
  interruptSlot: SlotId;
  keyHelp: string;
  /** 穿戴规则：护甲类型、可用武器、能否双持（单手武器进副手） */
  equip: EquipRules;
  /** 强度名：攻击强度 / 法术强度 */
  powerName: string;
  /** v1.0.6：内容包职业自带的外观 / 界面 / 资源 / 技能书 / 运行时（core/ClassExt.ts）；本体 4 职业不填 */
  ext?: ClassExt;
}

/** v1.2.58：天赋树 2.0 原样（规则引擎旧路径的自检 simTalent2 / simMage 用） */
export const LEGACY_TREES = { warrior: talentTree2(WARRIOR_TREE), mage: talentTree2(MAGE_TREE), chrono: talentTree2(CHRONO_TREE), alchemy: talentTree2(ALCHEMY_TREE) };

const BASE_CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: '战士', desc: '近战重甲，冲锋切入、旋风斩清场，生命和护甲最高。上手简单。',
    skills: withAlt(SKILLS, 'warrior'), loadout: { basic: 'slash', skill1: 'charge', skill2: 'whirlwind', skill3: 'thunderclap', skill4: SKILL4.warrior[0].id, ultimate: 'avatar' },
    tree: talentTree3(talentTree2(WARRIOR_TREE), SPEC_V3), combos: COMBOS, baseHp: 1000, hpPerLevel: 60, critChance: 0.12, ranged: false, interruptSlot: 'skill1',
    keyHelp: '空格/J 普攻 · 1 冲锋（可打断） · 2 旋风斩 · 3 雷霆一击 · R 天神下凡',
    // 战士：重甲；单手（剑/斧/锤）+ 盾牌或第二把单手，或双手（巨剑/巨斧）
    equip: { armorType: 'plate', weapons: ['sword', 'axe', 'mace', 'greatsword', 'greataxe', 'shield'], dualWield: true }, powerName: '攻击强度',
  },
  mage: {
    id: 'mage', name: '法师', desc: '远程施法，火焰、冰霜、奥术三系。霜环冻结近身敌人，奥术禁锢打断读条，陨星坠落毁天灭地。',
    skills: withAlt(MAGE_SKILLS, 'mage'), loadout: { basic: 'arcane_bolt', skill1: 'flame_orb', skill2: 'frost_ring', skill3: 'arcane_bind', skill4: SKILL4.mage[0].id, ultimate: 'meteor' },
    tree: talentTree3(talentTree2(MAGE_TREE), SPEC_V3), combos: MAGE_COMBOS, baseHp: 820, hpPerLevel: 50, critChance: 0.15, ranged: true, interruptSlot: 'skill3',
    keyHelp: '空格/J 奥能弹 · 1 烈焰弹 · 2 霜环 · 3 奥术禁锢（可打断） · R 陨星坠落',
    // 法师：布甲；法杖（双手），或魔杖/匕首（单手）+ 典籍/法球（副手）
    equip: { armorType: 'cloth', weapons: ['staff', 'wand', 'dagger', 'tome', 'orb'], dualWield: false }, powerName: '法术强度',
  },
  // v0.7.0-br.A 阶段七：时砂行者（机制在 web/chrono.ts）
  chrono: {
    id: 'chrono', name: '时砂行者', desc: '物理远程刺客。扔出会飞回来的时轮叠「时痕」，伤害先存在敌人身上再一刻引爆；技能 2 秒后被回声重放，危险时按 F 回溯到 3 秒前。',
    skills: withAlt(CHRONO_SKILLS, 'chrono'), loadout: { basic: 'chrono_throw', skill1: 'sand_step', skill2: 'blade_spin', skill3: 'stasis', skill4: SKILL4.chrono[0].id, ultimate: 'final_moment' },
    tree: talentTree3(talentTree2(CHRONO_TREE), SPEC_V3), combos: CHRONO_COMBOS, baseHp: 860, hpPerLevel: 52, critChance: 0.18, ranged: true, interruptSlot: 'skill3',
    keyHelp: '空格/J 时轮投掷 · 1 沙影步 · 2 千刃回旋 · 3 停滞之刻（可打断） · R 终刻 · F 回溯',
    // 时砂行者：皮甲；时轮（单手，可双持）或 时轮 + 沙漏（副手）
    equip: { armorType: 'leather', weapons: ['chakram', 'hourglass'], dualWield: true }, powerName: '攻击强度',
  },
  // v0.7.1-br.A 阶段七：炼金投弹手（机制在 web/alchemy.ts）
  alchemy: {
    id: 'alchemy', name: '炼金投弹手', desc: '法系远程药剂师。红、蓝、绿三色试剂两两调配，扔出 9 种药剂；药剂落地会和地上已有的药剂起反应：火点毒池会爆燃，冰浇火地会冒蒸汽。',
    skills: withAlt(ALCHEMY_SKILLS, 'alchemy'), loadout: { basic: 'reagent_shot', skill1: 'red_flask', skill2: 'blue_flask', skill3: 'green_flask', skill4: SKILL4.alchemy[0].id, ultimate: 'cauldron' },
    tree: talentTree3(talentTree2(ALCHEMY_TREE), SPEC_V3), combos: ALCHEMY_COMBOS, baseHp: 800, hpPerLevel: 48, critChance: 0.14, ranged: true, interruptSlot: 'skill2',
    keyHelp: '空格/J 试剂弹 · 1 红 · 2 蓝 · 3 绿（两色快速连按 = 混合，蓝+蓝 冰封可打断） · R 大釜炮台 · F 推进烟雾（25 级）',
    // 炼金投弹手：布甲；药瓶（单手）+ 试剂匣（副手）
    equip: { armorType: 'cloth', weapons: ['flask', 'reagent'], dualWield: false }, powerName: '法术强度',
  },
};
/** v0.9.7：职业表 = 本体 + 内容包职业（没有包 = 本体表原对象）。包职业的 id 不在 ClassId 联合类型里，读取处用 isClassAvailable 判断 */
export const CLASSES: Record<ClassId, ClassDef> = withPackRecord<ClassDef>(BASE_CLASSES, 'classes') as Record<ClassId, ClassDef>;
/** 存档里的职业在当前构建里能不能玩（本体打开 DLC 职业角色 = false → 角色列表锁定，数据原样保留） */
export const isClassAvailable = (id: string | undefined | null): boolean => !!id && Object.prototype.hasOwnProperty.call(CLASSES, id);

/** v0.6.8：某职业的技能书数据（core/SkillBook 用） */
export function skillBookData(c: ClassDef): SkillBookData {
  const b = c.ext?.book;   // v1.0.6 内容包职业：技能书数据自带
  return { skills: c.skills, defaults: c.loadout, choices: b?.choices ?? (SLOT_CHOICES as Partial<Record<string, SkillBookData['choices']>>)[c.id] ?? {}, runes: b ? [...b.runes, ...RUNES.filter(r => c.skills[r.skillId])] : RUNES.filter(r => c.skills[r.skillId]), presets: b ? b.presets : PRESETS.filter(p => p.cls === c.id), talentOnly: TALENT_ONLY_SKILLS };
}
