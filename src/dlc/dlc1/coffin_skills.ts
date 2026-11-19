// ======================================================================
// DLC1 第 6 职业「负棺人」：技能 + 开棺组合表（v1.0.7，d1.6）
// 不死的送葬者，背着一口铁棺行走。重甲、攻击强度；专属双手武器「葬棺」（铁棺 + 棺链）。
// 所有职业技能带 coffin 标签 + 打法类别（f_melee 近身 / f_sweep 链扫 / f_dash 突进 …），棺态（coffin_runtime.ts）按标签改写：
//   背棺：普攻变链甩横扫（自身范围），链扫技能范围更大，位移冷却更短；立棺：技能从墓碑处再放一次
// 只 import core 的类型（见 manifest.ts 约定）。数值初稿，整体平衡暂缓（Rhett 10-22）。
// ======================================================================
import type { SkillDef, EffectDef, Element, SlotId } from '../../core/types';

export type CSkill = SkillDef & { desc: string };
const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
const S = (id: string, name: string, slot: SlotId, element: Element, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string): CSkill =>
  ({ id, name, slot, element, shape, tags, stats: { ...base, ...stats }, effects, desc });

/** 职业 id（存档 classId） */
export const COFFIN_ID = 'coffin';

export const COFFIN_SKILLS: CSkill[] = [
  // ---- 普攻
  S('cf_swing', '棺击', 'basic', 'physical', 'single', ['melee', 'weapon', 'coffin', 'f_melee'], { damage: 24, cooldown: 0.9, range: 2.8 }, [],
    '用铁棺砸向目标。背棺：改为抡起棺链横扫身边一圈（伤害 -15%）；立棺：0.25 秒后墓碑处再砸一次（60% 伤害）'),
  // ---- 技能 1 位移
  S('cf_drag', '拖棺冲锋', 'skill1', 'physical', 'dash', ['melee', 'movement', 'coffin', 'f_dash'], { damage: 32, cooldown: 8, range: 12 }, [{ type: 'stun', duration: 0.5 }],
    '拖着铁棺冲向目标，撞晕 0.5 秒'),
  S('cf_vault', '棺跃', 'skill1', 'physical', 'dash', ['melee', 'movement', 'leap', 'coffin', 'f_dash'], { damage: 38, cooldown: 10, range: 15 }, [{ type: 'slow', percent: 0.4, duration: 2 }],
    '撑着棺链高高跃起砸向目标，减速 40%'),
  S('cf_shroudstep', '寿衣步', 'skill1', 'shadow', 'circle', ['blink', 'movement', 'aoe', 'coffin', 'f_blink'], { damage: 22, cooldown: 9, range: 9, radius: 3 }, [{ type: 'slow', percent: 0.3, duration: 2 }],
    '裹上寿衣化作一阵阴风向前闪身，落点周围敌人减速 30%'),
  // ---- 技能 2 范围
  S('cf_sweep', '链棺横扫', 'skill2', 'physical', 'circle', ['melee', 'aoe', 'spin', 'coffin', 'f_sweep'], { damage: 46, cooldown: 7, radius: 4.5 }, [{ type: 'knockback', distance: 1.5 }],
    '甩开棺链让铁棺绕身一周，击退 1.5 米。背棺时范围 +25%'),
  S('cf_drop', '落棺', 'skill2', 'physical', 'circle', ['aoe', 'targeted', 'slam', 'coffin', 'f_target'], { damage: 50, cooldown: 8, radius: 4, range: 14 }, [{ type: 'stun', duration: 0.6 }],
    '把铁棺甩到目标处砸下，震晕 0.6 秒'),
  S('cf_chainline', '锁魂链', 'skill2', 'physical', 'line', ['aoe', 'chainline', 'coffin', 'f_line'], { damage: 50, cooldown: 9, range: 10, radius: 2.5 }, [{ type: 'slow', percent: 0.35, duration: 2.5 }],
    '棺链笔直抽出，锁住一线敌人：减速 35%'),
  // ---- 技能 3 控制
  S('cf_toll', '丧钟', 'skill3', 'physical', 'circle', ['aoe', 'control', 'shout', 'coffin', 'f_sweep'], { damage: 28, cooldown: 11, radius: 5 }, [{ type: 'interrupt' }, { type: 'slow', percent: 0.35, duration: 3 }],
    '拳敲棺盖，丧钟一响：打断读条，减速 35%'),
  S('cf_bind', '缚棺链', 'skill3', 'physical', 'single', ['ranged', 'control', 'coffin', 'f_snare'], { damage: 24, cooldown: 12, range: 15 }, [{ type: 'stun', duration: 1.2 }, { type: 'interrupt' }],
    '棺链甩向远处的目标：击晕 1.2 秒并打断'),
  S('cf_shroud', '裹尸布', 'skill3', 'shadow', 'circle', ['aoe', 'control', 'coffin', 'f_sweep'], { damage: 18, cooldown: 14, radius: 4 }, [{ type: 'interrupt' }, { type: 'reflect', reduce: 0.3, percent: 0.1, duration: 6 }],
    '扯出棺里的裹尸布缠身：打断身边敌人，6 秒受到伤害 -30% 并反弹 10%'),
  // ---- 技能 4 绝技（25 级开放；30 级学会第二个）
  S('cf_procession', '送葬行列', 'skill4', 'physical', 'line', ['aoe', 'line', 'coffin', 'f_line', 'skill4'], { damage: 125, cooldown: 15, radius: 3, range: 14 }, [{ type: 'knockback', distance: 2 }, { type: 'slow', percent: 0.3, duration: 2 }],
    '一列虚影抬棺人沿直线走过：击退、减速'),
  S('cf_gravefield', '万冢', 'skill4', 'shadow', 'circle', ['aoe', 'targeted', 'coffin', 'f_target', 'skill4'], { damage: 115, cooldown: 16, radius: 4.5, range: 16 }, [{ type: 'groundZone', element: 'shadow', dps: 14, radius: 4, duration: 5 }],
    '目标处隆起一片坟冢：造成伤害，留下 5 秒墓土'),
  // ---- 大招
  S('cf_requiem', '安魂葬礼', 'ultimate', 'physical', 'circle', ['aoe', 'ultimate', 'coffin', 'f_sweep'], { damage: 160, cooldown: 60, radius: 7 }, [{ type: 'knockback', distance: 2 }, { type: 'heal', percentOfDamage: 0.1 }],
    '为周围的敌人办一场葬礼：大范围重击，按伤害 10% 回复生命'),
  S('cf_hundred', '百棺齐落', 'ultimate', 'physical', 'circle', ['aoe', 'targeted', 'ultimate', 'coffin', 'f_target'], { damage: 170, cooldown: 60, radius: 6, range: 20 }, [{ type: 'stun', duration: 1 }],
    '目标处从天而降上百口棺材：重击并震晕 1 秒'),
  S('cf_ferry', '冥河引魂', 'ultimate', 'shadow', 'circle', ['aoe', 'ultimate', 'coffin', 'f_sweep'], { damage: 140, cooldown: 55, radius: 8 }, [{ type: 'slow', percent: 0.5, duration: 3 }, { type: 'shield', percentMaxHp: 0.2, duration: 6 }],
    '冥河之水漫过脚下：减速 50%，获得最大生命 20% 的护盾'),
];

/** v1.2.77 天赋方案 B：天赋放出的技能（不占槽、不带 coffin 标签 = 不触发墓碑回响 / 背棺修饰，吃其余修饰器） */
export const SOUL_BURST = S('cf_t_soulburst', '魂爆', 'skill2', 'shadow', 'circle', ['aoe', 'talent', 'shadow'], { damage: 34, radius: 3 }, [], '送葬者·魂爆：开棺时每个魂化为一次暗影爆炸');
export const GHOST_HIT = S('cf_t_ghost', '追魂幽影', 'skill1', 'shadow', 'circle', ['aoe', 'talent', 'shadow'], { damage: 9, radius: 1.6 }, [], '百鬼夜行：追击幽魂穿过敌人');
export const BLOOD_BURST = S('cf_t_bloodburst', '血棺爆', 'skill2', 'shadow', 'circle', ['aoe', 'talent', 'shadow', 'blood'], { damage: 30, radius: 4 }, [], '血棺：消耗的生命化为暗影爆炸');

export const COFFIN_CHOICES: Partial<Record<SlotId, string[]>> = {
  skill1: ['cf_drag', 'cf_vault', 'cf_shroudstep'],
  skill2: ['cf_sweep', 'cf_drop', 'cf_chainline'],
  skill3: ['cf_toll', 'cf_bind', 'cf_shroud'],
  skill4: ['cf_procession', 'cf_gravefield'],
  ultimate: ['cf_requiem', 'cf_hundred', 'cf_ferry'],
};
export const COFFIN_ROLES: Partial<Record<SlotId, string>> = { skill1: '位移', skill2: '范围', skill3: '控制', skill4: '绝技', ultimate: '大招' };
export const COFFIN_LOADOUT: Record<SlotId, string> = { basic: 'cf_swing', skill1: 'cf_drag', skill2: 'cf_sweep', skill3: 'cf_toll', skill4: 'cf_procession', ultimate: 'cf_requiem' };

/** 借用本体图标（没有专属图标前） */
export const COFFIN_ICONS: Record<string, string> = {
  cf_swing: 'sk_slash', cf_drag: 'sk_charge', cf_vault: 'sk_heroic_leap', cf_shroudstep: 'sk_sand_step', cf_sweep: 'sk_whirlwind', cf_drop: 'sk_quake', cf_chainline: 'sk_shockwave',
  cf_toll: 'sk_battle_shout', cf_bind: 'sk_stasis', cf_shroud: 'sk_shield_rush', cf_procession: 'sk_shockwave', cf_gravefield: 'sk_war_banner', cf_requiem: 'sk_avatar', cf_hundred: 'sk_meteor', cf_ferry: 'sk_frost_ring',
  cf_open: 'sk_thunderclap', cf_u_mountain: 'sk_quake', cf_u_warden: 'sk_war_banner', cf_u_ferryman: 'sk_bladestorm',
};

// ---------------------------------------------------------------- 收魂 + 开棺组合
/** 四类魂：野兽（快）/ 人形（巧）/ 巨躯（重）/ 异类（法） */
export type Soul = 'beast' | 'man' | 'giant' | 'eldritch';
export const SOULS: Soul[] = ['beast', 'man', 'giant', 'eldritch'];
export const SOUL_NAME: Record<Soul, string> = { beast: '野兽', man: '人形', giant: '巨躯', eldritch: '异类' };
export const SOUL_CHAR: Record<Soul, string> = { beast: '兽', man: '人', giant: '巨', eldritch: '异' };
export const SOUL_COLOR: Record<Soul, number> = { beast: 0xe0a050, man: 0xd8e0f0, giant: 0xa07848, eldritch: 0x9a70ff };
const KEY: Record<Soul, string> = { beast: 'B', man: 'H', giant: 'G', eldritch: 'A' };

/** 按被杀敌人种类判定魂（kind = 敌人类型 id，name = 显示名；首领 / 精英没有命中其它规则时算巨躯） */
export function soulOf(kind: string, name: string, big = false): Soul {
  const s = `${kind} ${name}`.toLowerCase();
  if (/elemental|ghost|wraith|spirit|shade|vine|slime|echo|mirror|abyss|wisp|specter|元素|幽|灵|魂|影|藤|渊|镜|回响|噬/.test(s)) return 'eldritch';
  if (/golem|giant|ogre|troll|treant|colossus|behemoth|titan|巨|魔像|树人|石像|傀儡|泰坦/.test(s)) return 'giant';
  if (/wolf|boar|spider|toad|bear|crab|bat|rat|hound|serpent|eel|shark|scorp|beetle|gull|狼|猪|蛛|蟾|熊|蟹|蝠|鼠|犬|蛇|鳗|鲨|蝎|甲虫|鸥|兽|鱼/.test(s)) return 'beast';
  return big ? 'giant' : 'man';
}

export interface Combo { key: string; name: string; desc: string; color: string; skill: CSkill }
const C = (souls: string, name: string, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string, color: string, element: Element = 'physical'): Combo => {
  const key = souls.split('').sort((a, b) => 'BHGA'.indexOf(a) - 'BHGA'.indexOf(b)).join('');
  return { key, name, desc, color, skill: S(`cf_open_${key}`, name, 'ultimate', element, shape, ['aoe', 'opencoffin', `open${key.length}`, ...tags], { cooldown: 0, ...stats }, effects, desc) };
};
/** 3 魂开棺：4 类魂可重复取 3 个 = 20 种组合（顺序无关）。表现按形状共用：直线 / 投射 / 自身范围 / 目标处范围 */
export const COMBOS: Combo[] = [
  C('BBB', '万兽踏棺', 'line', ['line'], { damage: 160, range: 14, radius: 3 }, [{ type: 'knockback', distance: 2.5 }, { type: 'slow', percent: 0.4, duration: 2 }], '三只兽魂冲出棺材踏平一条线：击退、减速', '#e0a050'),
  C('HHH', '千刃送行', 'projectile', ['ranged'], { damage: 48, range: 16, projectileCount: 6 }, [{ type: 'dot', element: 'physical', dps: 8, duration: 4 }], '三个亡者各掷出两把送行刀：6 枚飞刃追向附近的敌人，流血', '#d8e0f0'),
  C('GGG', '葬山', 'circle', ['slam'], { damage: 230, radius: 7 }, [{ type: 'stun', duration: 1.5 }, { type: 'knockback', distance: 3 }], '三个巨躯之魂合力把铁棺砸进地里：大范围震晕 1.5 秒、击退', '#a07848'),
  C('AAA', '幽冥开道', 'circle', ['targeted'], { damage: 175, radius: 6, range: 18 }, [{ type: 'dot', element: 'shadow', dps: 30, duration: 5 }], '目标处裂开一道幽冥之门：5 秒暗影侵蚀', '#9a70ff', 'shadow'),
  C('BBH', '猎犬押解', 'circle', ['spin'], { damage: 155, radius: 4.5 }, [{ type: 'dot', element: 'physical', dps: 14, duration: 4 }, { type: 'resetCooldown', slot: 'skill1', chance: 0.5 }], '两只猎犬押着亡者绕身撕咬：流血，50% 重置技能 1', '#e0b070'),
  C('BBG', '兽潮崩岸', 'line', ['line'], { damage: 185, range: 15, radius: 3.5 }, [{ type: 'knockback', distance: 3 }, { type: 'stun', duration: 0.8 }], '兽群驮着巨躯冲出：直线击退 3 米、震晕', '#c89050'),
  C('BBA', '噬魂兽群', 'projectile', ['ranged'], { damage: 55, range: 16, projectileCount: 4 }, [{ type: 'dot', element: 'shadow', dps: 12, duration: 4 }], '4 只半透明的噬魂兽扑向附近的敌人：暗影侵蚀', '#c080d0', 'shadow'),
  C('BHH', '围猎', 'circle', ['spin'], { damage: 165, radius: 5 }, [{ type: 'slow', percent: 0.5, duration: 3 }], '两个猎人带着猎犬围住你身边的敌人：减速 50%', '#e8d0a0'),
  C('HHG', '抬棺力士', 'circle', ['slam'], { damage: 195, radius: 5.5 }, [{ type: 'stun', duration: 1 }, { type: 'shield', percentMaxHp: 0.15, duration: 6 }], '两个亡者扛着巨躯的棺砸下：震晕 1 秒，你获得最大生命 15% 护盾', '#c0b090'),
  C('HHA', '夜巡灯', 'circle', ['targeted'], { damage: 165, radius: 5, range: 16 }, [{ type: 'interrupt' }, { type: 'groundZone', element: 'shadow', dps: 16, radius: 4.5, duration: 5 }], '巡夜人提灯走到目标处：打断，留下 5 秒鬼火地', '#b0a0e0', 'shadow'),
  C('BGG', '巨兽崩山', 'circle', ['slam'], { damage: 215, radius: 6.5 }, [{ type: 'knockback', distance: 4 }], '巨兽之魂撞碎地面：大范围击退 4 米', '#b08048'),
  C('HGG', '守陵石卫', 'circle', ['slam'], { damage: 175, radius: 5 }, [{ type: 'stun', duration: 1 }, { type: 'reflect', reduce: 0.3, percent: 0.2, duration: 6 }], '两尊石卫护在棺旁：震晕 1 秒，6 秒受到伤害 -30% 并反弹 20%', '#a09080'),
  C('GGA', '镇魂碑', 'circle', ['targeted'], { damage: 205, radius: 6, range: 16 }, [{ type: 'groundZone', element: 'shadow', dps: 20, radius: 5, duration: 6 }, { type: 'slow', percent: 0.3, duration: 3 }], '一块镇魂碑砸在目标处：留下 6 秒镇魂地', '#8a70b0', 'shadow'),
  C('BAA', '渊犬噬月', 'projectile', ['ranged'], { damage: 62, range: 16, projectileCount: 3 }, [{ type: 'chain', jumps: 3, radius: 6, damagePercent: 0.6 }], '三条渊犬扑出，咬中后在敌人之间连跳 3 次', '#a070e0', 'shadow'),
  C('HAA', '引魂幡', 'circle', ['spin'], { damage: 155, radius: 6 }, [{ type: 'heal', percentOfDamage: 0.25 }], '亡者举起引魂幡绕身一圈：按伤害 25% 回复生命', '#c0a8f0', 'shadow'),
  C('GAA', '沉渊巨口', 'circle', ['targeted'], { damage: 215, radius: 7, range: 16 }, [{ type: 'slow', percent: 0.6, duration: 3 }], '目标处张开一张深渊巨口：大范围减速 60%', '#7050c0', 'shadow'),
  C('BHG', '送葬队列', 'line', ['line'], { damage: 195, range: 16, radius: 3 }, [{ type: 'knockback', distance: 2 }, { type: 'stun', duration: 0.6 }], '兽、人、巨躯排成送葬队列走过一条线：击退并震晕', '#d0b080'),
  C('BHA', '百鬼送葬', 'circle', ['spin'], { damage: 205, radius: 8 }, [{ type: 'dot', element: 'shadow', dps: 25, duration: 6 }, { type: 'slow', percent: 0.4, duration: 3 }], '棺盖大开，百鬼夜行绕你一周：超大范围暗影侵蚀、减速', '#b090e0', 'shadow'),
  C('BGA', '兽冢', 'circle', ['slam'], { damage: 200, radius: 6 }, [{ type: 'groundZone', element: 'physical', dps: 22, radius: 5, duration: 5 }], '兽骨与巨骨堆成一座坟冢：留下 5 秒碎骨地', '#a08870'),
  C('HGA', '三司会审', 'circle', ['targeted'], { damage: 200, radius: 6, range: 18 }, [{ type: 'stun', duration: 1.2 }, { type: 'explode', radius: 3, damagePercent: 0.5 }], '人、巨、异三魂在目标处审判：震晕 1.2 秒，再爆一次 50% 伤害', '#c8b0ff', 'shadow'),
];
export const COMBO_BY_KEY: Record<string, Combo> = Object.fromEntries(COMBOS.map(c => [c.key, c]));
/** 1–2 魂开棺：「残魂出棺」（伤害按魂数） */
export function partialCombo(souls: Soul[]): Combo {
  const n = souls.length, el: Element = souls.includes('eldritch') ? 'shadow' : 'physical';
  return { key: souls.map(s => KEY[s]).join(''), name: `残魂出棺·${n}`, desc: `放出 ${n} 个魂`, color: '#c8c0b0',
    skill: S(`cf_open_p${n}`, `残魂出棺（${souls.map(s => SOUL_CHAR[s]).join('')}）`, 'ultimate', el, 'circle', ['aoe', 'opencoffin', 'spin'], { damage: 70 * n, radius: 4 + n }, [{ type: 'slow', percent: 0.3, duration: 2 }], '') };
}
/** 魂 → 组合（3 魂查表；不足 3 魂 = 残魂出棺） */
export function comboOf(souls: Soul[]): Combo {
  if (souls.length >= 3) return COMBO_BY_KEY[souls.slice(0, 3).map(s => KEY[s]).sort((a, b) => 'BHGA'.indexOf(a) - 'BHGA'.indexOf(b)).join('')];
  return partialCombo(souls);
}
