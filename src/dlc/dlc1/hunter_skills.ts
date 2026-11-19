// ======================================================================
// DLC1 第 5 职业「灵契猎手」：技能（v1.0.6，d1.5）
// 鸣钟人的猎卫，与兽魂立契。链甲、攻击强度；长柄弯刃（主手）+ 弓（弓栏，鹰契）。
// 所有职业技能带 beast 标签 + 一个「打法类别」标签，三形态（狼 / 熊 / 鹰）按类别改写同一技能（hunter_forms.ts）：
//   f_melee 近身单体 / f_dash 突进 / f_nova 自身范围 / f_proj 投射 / f_target 目标处范围 / f_line 直线
// 只 import core 的类型（见 manifest.ts 约定）。数值初稿，整体平衡暂缓（Rhett 10-22）。
// ======================================================================
import type { SkillDef, EffectDef, Element, SlotId } from '../../core/types';

export type HSkill = SkillDef & { desc: string };
const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
const S = (id: string, name: string, slot: SlotId, element: Element, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string, icon?: string): HSkill =>
  ({ id, name, slot, element, shape, tags, stats: { ...base, ...stats }, effects, desc, ...(icon ? { icon } : {}) });

/** 职业 id（存档 classId） */
export const HUNTER_ID = 'hunter';

/** 默认配装 + 技能书可选技能（每槽 3 选 1，第 1 个 = 开局就会） */
export const HUNTER_SKILLS: HSkill[] = [
  // ---- 普攻
  S('hp_slash', '契刃斩', 'basic', 'physical', 'single', ['melee', 'weapon', 'beast', 'f_melee'], { damage: 21, cooldown: 0.8, range: 2.6 }, [],
    '挥动契刃斩击目标。狼：附带雷电、叠感电，每 3 下一次撕咬；熊：重掌伤害 +25%；鹰：变成远程羽矢（16 米）'),
  // ---- 技能 1 位移
  S('hp_pounce', '契约突袭', 'skill1', 'physical', 'dash', ['melee', 'movement', 'beast', 'f_dash'], { damage: 30, cooldown: 8, range: 12 }, [{ type: 'stun', duration: 0.5 }],
    '扑向目标并短暂击晕。狼：25% 几率立刻重置；熊：冲撞击退 3 米；鹰：改为射出贯羽，减速 40%'),
  S('hp_leap', '兽跃', 'skill1', 'physical', 'dash', ['melee', 'movement', 'leap', 'beast', 'f_dash'], { damage: 36, cooldown: 10, range: 15 }, [{ type: 'slow', percent: 0.4, duration: 2 }],
    '高高跃起砸向目标，减速 40%。距离更远、伤害更高、冷却更长'),
  S('hp_glide', '风行契步', 'skill1', 'physical', 'circle', ['blink', 'movement', 'aoe', 'beast', 'f_blink'], { damage: 22, cooldown: 9, range: 9, radius: 3 }, [{ type: 'slow', percent: 0.3, duration: 2 }],
    '化作一阵兽风向前闪身，落点周围敌人减速 30%（不需要目标）'),
  // ---- 技能 2 范围
  S('hp_rend', '兽魂旋击', 'skill2', 'physical', 'circle', ['melee', 'aoe', 'spin', 'beast', 'f_nova'], { damage: 44, cooldown: 7, radius: 4.5 }, [],
    '挥舞长刃旋身横扫。狼：范围小一点、伤害更高；熊：范围 +30% 并震晕 0.8 秒；鹰：改为在目标处落下羽暴（16 米）'),
  S('hp_volley', '羽刃齐射', 'skill2', 'physical', 'projectile', ['ranged', 'aoe', 'beast', 'f_proj'], { damage: 26, cooldown: 8, range: 16, projectileCount: 3 }, [],
    '同时射出 3 枚羽刃，各自追向附近的敌人'),
  S('hp_maul', '裂地猛击', 'skill2', 'physical', 'line', ['melee', 'aoe', 'slam', 'beast', 'f_line'], { damage: 52, cooldown: 9, range: 9, radius: 2.5 }, [{ type: 'knockback', distance: 2 }],
    '向前砸出一道裂地波，击退 2 米'),
  // ---- 技能 3 控制
  S('hp_howl', '慑魂嚎', 'skill3', 'physical', 'circle', ['aoe', 'control', 'shout', 'beast', 'f_nova'], { damage: 28, cooldown: 11, radius: 5 }, [{ type: 'interrupt' }, { type: 'slow', percent: 0.35, duration: 3 }],
    '兽魂齐声长嚎：打断读条，减速 35%。熊：额外震晕；鹰：改为在目标处炸响（可远程打断）'),
  S('hp_snare', '缚兽索', 'skill3', 'physical', 'single', ['ranged', 'control', 'beast', 'f_snare'], { damage: 24, cooldown: 12, range: 16 }, [{ type: 'stun', duration: 1.2 }, { type: 'interrupt' }],
    '甩出契约锁链缚住远处的目标：击晕 1.2 秒并打断'),
  S('hp_ward', '兽皮护契', 'skill3', 'physical', 'circle', ['aoe', 'control', 'beast', 'f_nova'], { damage: 18, cooldown: 14, radius: 4 }, [{ type: 'interrupt' }, { type: 'reflect', reduce: 0.3, percent: 0.1, duration: 6 }],
    '披上兽魂之皮：打断身边敌人，6 秒受到伤害 -30% 并反弹 10%'),
  // ---- 技能 4 绝技（25 级开放；30 级学会第二个）
  S('hp_totem', '契印图腾', 'skill4', 'physical', 'circle', ['aoe', 'targeted', 'beast', 'f_target', 'skill4'], { damage: 115, cooldown: 16, radius: 4.5, range: 16 }, [{ type: 'groundZone', element: 'physical', dps: 14, radius: 4, duration: 5 }],
    '在目标处钉下契印图腾：造成伤害并留下 5 秒兽魂之地'),
  S('hp_stampede', '百兽奔袭', 'skill4', 'physical', 'line', ['aoe', 'line', 'beast', 'f_line', 'skill4'], { damage: 125, cooldown: 15, radius: 3, range: 14 }, [{ type: 'knockback', distance: 2 }, { type: 'slow', percent: 0.3, duration: 2 }],
    '召来一群兽魂沿直线奔袭：击退、减速'),
  // ---- 大招
  S('hp_avatar', '万兽归一', 'ultimate', 'physical', 'circle', ['aoe', 'ultimate', 'beast', 'f_nova'], { damage: 155, cooldown: 60, radius: 7 }, [{ type: 'knockback', distance: 2 }, { type: 'heal', percentOfDamage: 0.1 }],
    '三兽之魂同时降临：大范围重击，按伤害 10% 回复生命'),
  S('hp_wildhunt', '狂猎', 'ultimate', 'physical', 'circle', ['aoe', 'targeted', 'ultimate', 'beast', 'f_target'], { damage: 165, cooldown: 60, radius: 6, range: 20 }, [{ type: 'dot', element: 'physical', dps: 20, duration: 5 }],
    '在目标处召唤狂猎：重击并造成 5 秒撕裂'),
  S('hp_spiritbeast', '灵契巨兽', 'ultimate', 'physical', 'circle', ['aoe', 'ultimate', 'beast', 'f_nova'], { damage: 135, cooldown: 55, radius: 8 }, [{ type: 'stun', duration: 1.5 }, { type: 'shield', percentMaxHp: 0.2, duration: 6 }],
    '与巨兽之魂合一：震晕 1.5 秒，获得最大生命 20% 的护盾'),
];

/** 换形技：换形瞬间自动释放（不占技能槽，不受形态改写；吃天赋 / 装备修饰器） */
export const SHIFT_SKILLS: Record<'wolf' | 'bear' | 'eagle', HSkill> = {
  wolf: S('hp_shift_wolf', '奔雷扑袭', 'skill1', 'lightning', 'circle', ['aoe', 'spin', 'shift', 'wolf', 'lightning'], { damage: 40, radius: 4 }, [{ type: 'dot', element: 'lightning', dps: 6, duration: 4 }],
    '化狼瞬间，雷狼之魂扑咬身边敌人：雷电伤害并感电灼烧 4 秒'),
  bear: S('hp_shift_bear', '震地咆哮', 'skill1', 'physical', 'circle', ['aoe', 'slam', 'shift', 'bear', 'sunder'], { damage: 45, radius: 5 }, [{ type: 'stun', duration: 1 }],
    '化熊瞬间，重重踏地：震晕 1 秒并叠加破甲'),
  eagle: S('hp_shift_eagle', '苍鹰俯冲', 'skill1', 'physical', 'projectile', ['ranged', 'shift', 'eagle', 'mark'], { damage: 30, range: 18, projectileCount: 3 }, [{ type: 'slow', percent: 0.3, duration: 2 }],
    '化鹰瞬间，三只鹰魂俯冲附近的敌人：减速并标记'),
};

/** v1.2.77 天赋方案 B：天赋放出的技能（不占槽，吃修饰器） */
export const PACK_BITE = S('hp_t_packbite', '雷狼影', 'skill1', 'lightning', 'circle', ['aoe', 'talent', 'lightning'], { damage: 14, radius: 1.6 }, [], '群狼天赋：雷狼影扑咬');
export const BEAR_QUAKE = S('hp_t_quake', '巨熊之怒·震地', 'skill2', 'physical', 'circle', ['aoe', 'slam', 'talent', 'bear', 'sunder'], { damage: 30, radius: 5 }, [{ type: 'slow', percent: 0.3, duration: 1.5 }], '巨熊之怒：连续震地');
export const BEAR_TRAMPLE = S('hp_t_trample', '践踏', 'skill1', 'physical', 'circle', ['aoe', 'talent', 'bear'], { damage: 12, radius: 1.8 }, [{ type: 'knockback', distance: 2 }, { type: 'slow', percent: 0.3, duration: 1 }], '践踏：熊形移动撞开小怪');

/** 技能书：每槽可选项 / 槽位名 */
export const HUNTER_CHOICES: Partial<Record<SlotId, string[]>> = {
  skill1: ['hp_pounce', 'hp_leap', 'hp_glide'],
  skill2: ['hp_rend', 'hp_volley', 'hp_maul'],
  skill3: ['hp_howl', 'hp_snare', 'hp_ward'],
  skill4: ['hp_totem', 'hp_stampede'],
  ultimate: ['hp_avatar', 'hp_wildhunt', 'hp_spiritbeast'],
};
export const HUNTER_ROLES: Partial<Record<SlotId, string>> = { skill1: '位移', skill2: '范围', skill3: '控制', skill4: '绝技', ultimate: '大招' };
export const HUNTER_LOADOUT: Record<SlotId, string> = { basic: 'hp_slash', skill1: 'hp_pounce', skill2: 'hp_rend', skill3: 'hp_howl', skill4: 'hp_totem', ultimate: 'hp_avatar' };

/** 借用本体图标（没有专属图标前）：技能 id → 图标 key */
export const HUNTER_ICONS: Record<string, string> = {
  hp_slash: 'sk_slash', hp_pounce: 'sk_charge', hp_leap: 'sk_heroic_leap', hp_glide: 'sk_sand_step', hp_rend: 'sk_whirlwind', hp_volley: 'sk_blade_spin', hp_maul: 'sk_quake',
  hp_howl: 'sk_battle_shout', hp_snare: 'sk_stasis', hp_ward: 'sk_shield_rush', hp_totem: 'sk_war_banner', hp_stampede: 'sk_shockwave', hp_avatar: 'sk_avatar', hp_wildhunt: 'sk_bladestorm', hp_spiritbeast: 'sk_thunderclap',
  hp_shift_wolf: 'sk_whirlwind', hp_shift_bear: 'sk_thunderclap', hp_shift_eagle: 'sk_blade_spin',
  hp_u_packlord: 'sk_bladestorm', hp_u_earthshaker: 'sk_quake', hp_u_skyhunt: 'sk_meteor',
};
