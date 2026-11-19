// v0.7.6：英灵传承（每职业 6 个；V1.0 前补到 12 个）。效果按阶数 t = 1~3 缩放，只按槽位 / 标签 / 元素 / 职业资源生效
import { ModifierDef, SlotId, Element, EffectDef } from '../core/types';
import { withPacks } from '../core/ContentPacks';

/** 解锁条件：等级 / 副本首领击杀 / 精英击杀 / 长副本首领击杀 / 发现纹语数量 */
export type SpiritStat = 'level' | 'dungeon' | 'elite' | 'raid' | 'runeword' | 'paragon';
export const STAT_NAME: Record<SpiritStat, string> = { level: '达到等级', dungeon: '击败副本首领', elite: '击败精英', raid: '击败长副本首领', runeword: '发现纹语', paragon: '暗岩印记等级' };
/** 职业资源加成（core/Resource.ts 读取） */
export interface ResBonus { gainMul: number; thrAdd: number; maxAdd: number; delayAdd: number; empowerMore: number }
export const NO_BONUS: ResBonus = { gainMul: 0, thrAdd: 0, maxAdd: 0, delayAdd: 0, empowerMore: 0 };

export interface SpiritDef {
  id: string; cls: string; name: string; title: string; icon: string; color: string;
  unlock: { stat: SpiritStat; n: number };
  /** 每阶说明（t = 1~3） */
  desc: (t: number) => string;
  mods: (t: number) => ModifierDef[];
  res?: (t: number) => Partial<ResBonus>;
  lore: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
type Op = ModifierDef['ops'][number];
const mod = (id: string, name: string, match: ModifierDef['match'], ops: Op[], conditions?: ModifierDef['conditions']): ModifierDef =>
  ({ id: `spirit:${id}`, name, desc: '', source: 'buff', match, ops, priority: 30, ...(conditions ? { conditions } : {}) });
const dmg = (v: number): Op => ({ op: 'more', stat: 'damage', value: v });   // 独立乘区：说明写多少就是多少
const cd = (v: number): Op => ({ op: 'mul', stat: 'cooldown', value: -v });
const rad = (v: number): Op => ({ op: 'mul', stat: 'radius', value: v });
const eff = (e: EffectDef): Op => ({ op: 'addEffect', effect: e });
const slots = (...s: SlotId[]) => ({ slots: s });
const els = (...e: Element[]) => ({ elements: e });

const BASE_SPIRITS: SpiritDef[] = [
  // ---------------- 战士 ----------------
  { id: 'w_brann', cls: 'warrior', name: '老铁匠布兰', title: '百锻', icon: 'it_mace', color: '#d0a060', unlock: { stat: 'level', n: 10 },
    desc: t => `所有技能伤害 +${pct(0.04 * t)}`, mods: t => [mod('w_brann', '百锻', {}, [dmg(0.04 * t)])],
    lore: '「好钢要千锤，好兵要百战。」他把第一把剑交给你时这么说。' },
  { id: 'w_troll', cls: 'warrior', name: '冰窟巨魔王', title: '冰封怒涛', icon: 'sk_whirlwind', color: '#8fd8ff', unlock: { stat: 'dungeon', n: 3 },
    desc: t => `技能 2 伤害 +${pct(0.08 * t)}，命中减速 ${20 + 5 * t}% 2 秒`, mods: t => [mod('w_troll', '冰封怒涛', slots('skill2'), [dmg(0.08 * t), eff({ type: 'slow', percent: 20 + 5 * t, duration: 2 })])],
    lore: '巨魔王的怒吼在冰窟里回荡了一百年，终于找到新的主人。' },
  { id: 'w_chief', cls: 'warrior', name: '赤鬃头目', title: '劫掠者', icon: 'it_axe', color: '#ff8040', unlock: { stat: 'elite', n: 5 },
    desc: t => `普攻伤害 +${pct(0.12 * t)}，怒气获取 +${pct(0.1 * t)}`, mods: t => [mod('w_chief', '劫掠者', slots('basic'), [dmg(0.12 * t)])], res: t => ({ gainMul: 0.1 * t }),
    lore: '抢来的东西要用得狠——这是劫掠者唯一的信条。' },
  { id: 'w_oath', cls: 'warrior', name: '亡誓骑士团', title: '不屈誓言', icon: 'it_shield', color: '#c0c0ff', unlock: { stat: 'dungeon', n: 8 },
    desc: t => `受到伤害后 4 秒内所有技能伤害 +${pct(0.12 * t)}，怒气获取 +${pct(0.15 * t)}`, mods: t => [mod('w_oath', '不屈誓言', {}, [dmg(0.12 * t)], [{ type: 'flag', key: 'hurt' }])], res: t => ({ gainMul: 0.15 * t }),
    lore: '誓言没有随骑士团一起死去。' },
  { id: 'w_frost', cls: 'warrior', name: '永霜之王', title: '霜甲', icon: 'it_frost_shield', color: '#a0e8ff', unlock: { stat: 'raid', n: 1 },
    desc: t => `大招附带护盾：最大生命 ${8 * t}%，持续 6 秒`, mods: t => [mod('w_frost', '霜甲', slots('ultimate'), [eff({ type: 'shield', percentMaxHp: 0.08 * t, duration: 6 })])],
    lore: '王冠碎了，王的寒意还在。' },
  { id: 'w_rune', cls: 'warrior', name: '纹语学者', title: '刻痕', icon: 'it_signet', color: '#ffd070', unlock: { stat: 'runeword', n: 3 },
    desc: t => `怒气强化门槛 50 → ${50 - 5 * t}，强化版伤害再 +${pct(0.05 * t)}`, mods: () => [], res: t => ({ thrAdd: -5 * t, empowerMore: 0.05 * t }),
    lore: '每一道刻痕都是一句没说出口的战吼。' },
  // ---------------- 法师 ----------------
  { id: 'm_tutor', cls: 'mage', name: '学院导师', title: '启蒙', icon: 'tl_arcane', color: '#c8a0ff', unlock: { stat: 'level', n: 10 },
    desc: t => `所有技能伤害 +${pct(0.04 * t)}`, mods: t => [mod('m_tutor', '启蒙', {}, [dmg(0.04 * t)])],
    lore: '「先学会控制，再学会毁灭。」' },
  { id: 'm_ember', cls: 'mage', name: '熔炉之心', title: '余烬', icon: 'tl_fireheart', color: '#ff7030', unlock: { stat: 'dungeon', n: 3 },
    desc: t => `火焰技能伤害 +${pct(0.08 * t)}，命中后小范围爆炸（${pct(0.12 * t)} 伤害）`, mods: t => [mod('m_ember', '余烬', els('fire'), [dmg(0.08 * t), eff({ type: 'explode', radius: 2.2, damagePercent: 0.12 * t })])],
    lore: '铸造厂熄火了，余烬却一直没凉。' },
  { id: 'm_wisp', cls: 'mage', name: '沼泽鬼火', title: '分光', icon: 'tl_ghost', color: '#90ffd0', unlock: { stat: 'elite', n: 5 },
    desc: t => `技能 1 伤害 +${pct(0.1 * t)}${t >= 3 ? '，多发射 1 枚' : ''}`, mods: t => [mod('m_wisp', '分光', slots('skill1'), [dmg(0.1 * t), ...(t >= 3 ? [{ op: 'add', stat: 'projectileCount', value: 1 } as Op] : [])])],
    lore: '它总是一分为二，引诱迷路的人。' },
  { id: 'm_lich', cls: 'mage', name: '亡誓骑士团', title: '冥火', icon: 'sk_meteor', color: '#b080ff', unlock: { stat: 'dungeon', n: 8 },
    desc: t => `大招伤害 +${pct(0.12 * t)}，冷却 −${pct(0.05 * t)}`, mods: t => [mod('m_lich', '冥火', slots('ultimate'), [dmg(0.12 * t), cd(0.05 * t)])],
    lore: '骑士团的随军法师，死后仍在念诵最后一段咒文。' },
  { id: 'm_frost', cls: 'mage', name: '永霜之王', title: '冰心', icon: 'sk_frost_ring', color: '#a0e8ff', unlock: { stat: 'raid', n: 1 },
    desc: t => `冰霜技能冷却 −${pct(0.06 * t)}，命中减速 ${15 + 5 * t}%`, mods: t => [mod('m_frost', '冰心', els('frost'), [cd(0.06 * t), eff({ type: 'slow', percent: 15 + 5 * t, duration: 2.5 })])],
    lore: '心冷下来，手才稳。' },
  { id: 'm_rune', cls: 'mage', name: '纹语学者', title: '奥术残响', icon: 'it_signet', color: '#ffd070', unlock: { stat: 'runeword', n: 3 },
    desc: t => `奥能满溢的技能伤害再 +${pct(0.1 * t)}${t >= 3 ? '；奥能只需 3 层' : ''}`, mods: () => [], res: t => ({ empowerMore: 0.1 * t, thrAdd: t >= 3 ? -1 : 0 }),
    lore: '纹语读到第三遍，奥能自己会回答。' },
  // ---------------- 时砂行者 ----------------
  { id: 'c_keeper', cls: 'chrono', name: '时轮守卫学徒', title: '沙漏', icon: 'tl_mark', color: '#ffd060', unlock: { stat: 'level', n: 10 },
    desc: t => `所有技能伤害 +${pct(0.04 * t)}`, mods: t => [mod('c_keeper', '沙漏', {}, [dmg(0.04 * t)])],
    lore: '学徒的第一课：把沙漏倒过来。' },
  { id: 'c_guard', cls: 'chrono', name: '时轮守卫', title: '逆刻', icon: 'sk_rewind', color: '#ffe090', unlock: { stat: 'dungeon', n: 3 },
    desc: t => `连击点断档时间 3 秒 → ${3 + t} 秒，技能 3 冷却 −${pct(0.05 * t)}`, mods: t => [mod('c_guard', '逆刻', slots('skill3'), [cd(0.05 * t)])], res: t => ({ delayAdd: t }),
    lore: '守卫从不追赶时间，他让时间等他。' },
  { id: 'c_storm', cls: 'chrono', name: '荒原沙暴', title: '流沙', icon: 'sk_sand_step', color: '#e0c080', unlock: { stat: 'elite', n: 5 },
    desc: t => `技能 2 伤害 +${pct(0.06 * t)}、范围 +${pct(0.1 * t)}`, mods: t => [mod('c_storm', '流沙', slots('skill2'), [dmg(0.06 * t), rad(0.1 * t)])],
    lore: '沙暴过境，什么都没留下，除了一枚沙漏。' },
  { id: 'c_rift', cls: 'chrono', name: '裂隙行者', title: '叠影', icon: 'sk_time_rift', color: '#c090ff', unlock: { stat: 'dungeon', n: 8 },
    desc: t => `连击点上限 +${t >= 3 ? 2 : 1}，大招伤害 +${pct(0.06 * t)}`, mods: t => [mod('c_rift', '叠影', slots('ultimate'), [dmg(0.06 * t)])], res: t => ({ maxAdd: t >= 3 ? 2 : 1 }),
    lore: '同一刻，他在两个地方。' },
  { id: 'c_frost', cls: 'chrono', name: '永霜之王', title: '凝滞', icon: 'sk_stasis', color: '#a0e8ff', unlock: { stat: 'raid', n: 1 },
    desc: t => `技能 3 冷却 −${pct(0.06 * t)}，命中减速 30% ${2 + t} 秒`, mods: t => [mod('c_frost', '凝滞', slots('skill3'), [cd(0.06 * t), eff({ type: 'slow', percent: 30, duration: 2 + t })])],
    lore: '冰和时停，本来就是一回事。' },
  { id: 'c_rune', cls: 'chrono', name: '纹语学者', title: '时纹', icon: 'it_signet', color: '#ffd070', unlock: { stat: 'runeword', n: 3 },
    desc: t => `消耗连击点的技能伤害再 +${pct(0.1 * t)}`, mods: () => [], res: t => ({ empowerMore: 0.1 * t }),
    lore: '纹路像年轮，一圈一圈记着时间。' },
  // ---------------- 炼金投弹手 ----------------
  { id: 'a_mentor', cls: 'alchemy', name: '炼金师父', title: '试剂学', icon: 'tl_blast', color: '#ff9a40', unlock: { stat: 'level', n: 10 },
    desc: t => `所有技能伤害 +${pct(0.04 * t)}`, mods: t => [mod('a_mentor', '试剂学', {}, [dmg(0.04 * t)])],
    lore: '「先记配比，再谈手感。」' },
  { id: 'a_witch', cls: 'alchemy', name: '沼泽女巫', title: '腐沼秘方', icon: 'tl_plague', color: '#80e060', unlock: { stat: 'dungeon', n: 3 },
    desc: t => `绿色试剂伤害 +${pct(0.1 * t)}，命中减速 ${10 + 5 * t}%`, mods: t => [mod('a_witch', '腐沼秘方', { tagsAny: ['reagent_g'] }, [dmg(0.1 * t), eff({ type: 'slow', percent: 10 + 5 * t, duration: 2 })])],
    lore: '她的锅从来不洗，所以汤底越来越毒。' },
  { id: 'a_bandit', cls: 'alchemy', name: '赤鬃火药匠', title: '火药', icon: 'tl_blast', color: '#ff6030', unlock: { stat: 'elite', n: 5 },
    desc: t => `反应热度获取 +${pct(0.25 * t)}`, mods: () => [], res: t => ({ gainMul: 0.25 * t }),
    lore: '劫掠者营地的爆炸，一半是他弄的。' },
  { id: 'a_forge', cls: 'alchemy', name: '熔炉之心', title: '爆燃', icon: 'sk_thermite', color: '#ff7030', unlock: { stat: 'dungeon', n: 8 },
    desc: t => `红色试剂伤害 +${pct(0.1 * t)}、范围 +${pct(0.06 * t)}`, mods: t => [mod('a_forge', '爆燃', { tagsAny: ['reagent_r'] }, [dmg(0.1 * t), rad(0.06 * t)])],
    lore: '熔炉之心在瓶子里也照样跳动。' },
  { id: 'a_frost', cls: 'alchemy', name: '永霜之王', title: '霜雾', icon: 'sk_frost_ring', color: '#a0e8ff', unlock: { stat: 'raid', n: 1 },
    desc: t => `蓝色试剂冷却 −${pct(0.06 * t)}，命中减速 ${15 + 5 * t}%`, mods: t => [mod('a_frost', '霜雾', { tagsAny: ['reagent_b'] }, [cd(0.06 * t), eff({ type: 'slow', percent: 15 + 5 * t, duration: 2.5 })])],
    lore: '一瓶永不融化的雾。' },
  { id: 'a_rune', cls: 'alchemy', name: '纹语学者', title: '沸点', icon: 'it_signet', color: '#ffd070', unlock: { stat: 'runeword', n: 3 },
    desc: t => `沸腾门槛 100 → ${100 - 10 * t}，沸腾伤害再 +${pct(0.05 * t)}`, mods: () => [], res: t => ({ thrAdd: -10 * t, empowerMore: 0.05 * t }),
    lore: '纹语刻在瓶底，摇一摇就开始沸腾。' },
  // ---------------- v0.7.11：暗岩印记英灵（每职业 6 个，印记 1/5/10/20/35/50 级解锁） ----------------
  { id: 'w_p_banner', cls: 'warrior', name: '守边军团', title: '残旗', icon: 'tl_weapon', color: '#d07050', unlock: { stat: 'paragon', n: 1 },
    desc: t => `技能 1 伤害 +${pct(0.08 * t)}，冷却 −${pct(0.05 * t)}`, mods: t => [mod('w_p_banner', '残旗', slots('skill1'), [dmg(0.08 * t), cd(0.05 * t)])],
    lore: '旗还在，军团就还在。' },
  { id: 'w_p_quake', cls: 'warrior', name: '裂谷石像', title: '震地', icon: 'tl_quake', color: '#c0a070', unlock: { stat: 'paragon', n: 5 },
    desc: t => `技能 3 范围 +${pct(0.08 * t)}，伤害 +${pct(0.06 * t)}`, mods: t => [mod('w_p_quake', '震地', slots('skill3'), [rad(0.08 * t), dmg(0.06 * t)])],
    lore: '它站了一千年，迈出第一步时整个裂谷都在抖。' },
  { id: 'w_p_blade', cls: 'warrior', name: '军团长断刃', title: '剑意', icon: 'it_sword', color: '#ffd0a0', unlock: { stat: 'paragon', n: 10 },
    desc: t => `绝技伤害 +${pct(0.1 * t)}，怒气获取 +${pct(0.08 * t)}`, mods: t => [mod('w_p_blade', '剑意', slots('skill4'), [dmg(0.1 * t)])], res: t => ({ gainMul: 0.08 * t }),
    lore: '剑断了三截，剑意一寸没少。' },
  { id: 'w_p_wall', cls: 'warrior', name: '铁壁哨兵', title: '铁壁', icon: 'tl_iron', color: '#a0b0c0', unlock: { stat: 'paragon', n: 20 },
    desc: t => `技能 2 附带护盾：最大生命 ${4 * t}%，持续 4 秒`, mods: t => [mod('w_p_wall', '铁壁', slots('skill2'), [eff({ type: 'shield', percentMaxHp: 0.04 * t, duration: 4 })])],
    lore: '哨兵从不后退一步，因为身后就是家。' },
  { id: 'w_p_storm', cls: 'warrior', name: '雷鸣山王', title: '雷吼', icon: 'tl_storm', color: '#90c0ff', unlock: { stat: 'paragon', n: 35 },
    desc: t => `大招伤害 +${pct(0.1 * t)}，命中减速 ${15 + 5 * t}% 2 秒`, mods: t => [mod('w_p_storm', '雷吼', slots('ultimate'), [dmg(0.1 * t), eff({ type: 'slow', percent: 15 + 5 * t, duration: 2 })])],
    lore: '山王一吼，连云都要停下来。' },
  { id: 'w_p_dark', cls: 'warrior', name: '暗岩之魂', title: '岩心', icon: 'tl_wrath', color: '#ff6040', unlock: { stat: 'paragon', n: 50 },
    desc: t => `所有技能伤害 +${pct(0.05 * t)}，怒气上限 +${10 * t}`, mods: t => [mod('w_p_dark', '岩心', {}, [dmg(0.05 * t)])], res: t => ({ maxAdd: 10 * t }),
    lore: '暗岩深处有一颗心脏，它认得每一个回来的人。' },
  { id: 'm_p_page', cls: 'mage', name: '星象师残页', title: '星火', icon: 'tl_starfall', color: '#ffe0a0', unlock: { stat: 'paragon', n: 1 },
    desc: t => `技能 1 伤害 +${pct(0.08 * t)}，冷却 −${pct(0.05 * t)}`, mods: t => [mod('m_p_page', '星火', slots('skill1'), [dmg(0.08 * t), cd(0.05 * t)])],
    lore: '墨迹是用星烬写的，夜里会自己发光。' },
  { id: 'm_p_frost', cls: 'mage', name: '霜脊冰灵', title: '寒潮', icon: 'tl_frost', color: '#a0e0ff', unlock: { stat: 'paragon', n: 5 },
    desc: t => `冰霜技能伤害 +${pct(0.08 * t)}，命中减速 ${10 + 5 * t}% 2 秒`, mods: t => [mod('m_p_frost', '寒潮', els('frost'), [dmg(0.08 * t), eff({ type: 'slow', percent: 10 + 5 * t, duration: 2 })])],
    lore: '冰灵不会说话，只会让周围慢下来。' },
  { id: 'm_p_seal', cls: 'mage', name: '手稿封印', title: '解封', icon: 'tl_epiphany', color: '#d0a0ff', unlock: { stat: 'paragon', n: 10 },
    desc: t => `绝技伤害 +${pct(0.1 * t)}，冷却 −${pct(0.04 * t)}`, mods: t => [mod('m_p_seal', '解封', slots('skill4'), [dmg(0.1 * t), cd(0.04 * t)])],
    lore: '「火会熄，星不会。」' },
  { id: 'm_p_ash', cls: 'mage', name: '烬落火灵', title: '焚原', icon: 'tl_wildfire', color: '#ff8040', unlock: { stat: 'paragon', n: 20 },
    desc: t => `火焰技能范围 +${pct(0.08 * t)}，伤害 +${pct(0.05 * t)}`, mods: t => [mod('m_p_ash', '焚原', els('fire'), [rad(0.08 * t), dmg(0.05 * t)])],
    lore: '荒原上的火从没灭过，它只是换了地方烧。' },
  { id: 'm_p_ward', cls: 'mage', name: '学院守护者', title: '屏障', icon: 'tl_barrier', color: '#a0c0ff', unlock: { stat: 'paragon', n: 35 },
    desc: t => `技能 3 附带护盾：最大生命 ${4 * t}%，持续 4 秒`, mods: t => [mod('m_p_ward', '屏障', slots('skill3'), [eff({ type: 'shield', percentMaxHp: 0.04 * t, duration: 4 })])],
    lore: '学院的门从不上锁，因为有它守着。' },
  { id: 'm_p_dark', cls: 'mage', name: '暗岩之魂', title: '岩心', icon: 'tl_arcaneheart', color: '#c060ff', unlock: { stat: 'paragon', n: 50 },
    desc: t => `所有技能伤害 +${pct(0.05 * t)}，奥能充能获取 +${pct(0.08 * t)}`, mods: t => [mod('m_p_dark', '岩心', {}, [dmg(0.05 * t)])], res: t => ({ gainMul: 0.08 * t }),
    lore: '暗岩深处有一颗心脏，它认得每一个回来的人。' },
  { id: 'c_p_gear', cls: 'chrono', name: '钟楼齿轮', title: '走时', icon: 'it_hourglass', color: '#e0c080', unlock: { stat: 'paragon', n: 1 },
    desc: t => `技能 1 伤害 +${pct(0.08 * t)}，冷却 −${pct(0.05 * t)}`, mods: t => [mod('c_p_gear', '走时', slots('skill1'), [dmg(0.08 * t), cd(0.05 * t)])],
    lore: '它一转，周围的时间就跟着转。' },
  { id: 'c_p_sand', cls: 'chrono', name: '流沙之灵', title: '逆沙', icon: 'tl_ghost', color: '#f0d090', unlock: { stat: 'paragon', n: 5 },
    desc: t => `技能 2 伤害 +${pct(0.08 * t)}，命中减速 ${10 + 5 * t}% 2 秒`, mods: t => [mod('c_p_sand', '逆沙', slots('skill2'), [dmg(0.08 * t), eff({ type: 'slow', percent: 10 + 5 * t, duration: 2 })])],
    lore: '沙子往上流的地方，就是它待过的地方。' },
  { id: 'c_p_echo', cls: 'chrono', name: '钟楼守夜人', title: '回响', icon: 'tl_echo', color: '#c0a0ff', unlock: { stat: 'paragon', n: 10 },
    desc: t => `绝技伤害 +${pct(0.1 * t)}，连击点获取 +${pct(0.08 * t)}`, mods: t => [mod('c_p_echo', '回响', slots('skill4'), [dmg(0.1 * t)])], res: t => ({ gainMul: 0.08 * t }),
    lore: '他守着那一刻，守了一百年。' },
  { id: 'c_p_still', cls: 'chrono', name: '停滞之人', title: '凝时', icon: 'sk_stasis', color: '#a0d0ff', unlock: { stat: 'paragon', n: 20 },
    desc: t => `技能 3 附带护盾：最大生命 ${4 * t}%，持续 4 秒`, mods: t => [mod('c_p_still', '凝时', slots('skill3'), [eff({ type: 'shield', percentMaxHp: 0.04 * t, duration: 4 })])],
    lore: '被困在某一刻的人，学会了在那一刻里站稳。' },
  { id: 'c_p_last', cls: 'chrono', name: '最后一刻', title: '终焉', icon: 'sk_final_moment', color: '#ffa0a0', unlock: { stat: 'paragon', n: 35 },
    desc: t => `大招伤害 +${pct(0.1 * t)}，范围 +${pct(0.06 * t)}`, mods: t => [mod('c_p_last', '终焉', slots('ultimate'), [dmg(0.1 * t), rad(0.06 * t)])],
    lore: '钟敲最后一下之前，一切都还来得及。' },
  { id: 'c_p_dark', cls: 'chrono', name: '暗岩之魂', title: '岩心', icon: 'tl_mark', color: '#ff8060', unlock: { stat: 'paragon', n: 50 },
    desc: t => `所有技能伤害 +${pct(0.05 * t)}，连击点上限 +${t}`, mods: t => [mod('c_p_dark', '岩心', {}, [dmg(0.05 * t)])], res: t => ({ maxAdd: t }),
    lore: '暗岩深处有一颗心脏，它认得每一个回来的人。' },
  { id: 'a_p_spore', cls: 'alchemy', name: '腐沼孢母', title: '孢爆', icon: 'tl_plague', color: '#90d070', unlock: { stat: 'paragon', n: 1 },
    desc: t => `技能 1 伤害 +${pct(0.08 * t)}，冷却 −${pct(0.05 * t)}`, mods: t => [mod('a_p_spore', '孢爆', slots('skill1'), [dmg(0.08 * t), cd(0.05 * t)])],
    lore: '一颗孢子就能长出一片沼泽。' },
  { id: 'a_p_salt', cls: 'alchemy', name: '硝石矿灵', title: '硝烟', icon: 'tl_blast', color: '#ffd080', unlock: { stat: 'paragon', n: 5 },
    desc: t => `技能 2 范围 +${pct(0.08 * t)}，伤害 +${pct(0.06 * t)}`, mods: t => [mod('a_p_salt', '硝烟', slots('skill2'), [rad(0.08 * t), dmg(0.06 * t)])],
    lore: '矿工都知道：闻到这股味就快跑。' },
  { id: 'a_p_formula', cls: 'alchemy', name: '最后的配方', title: '一冷一热', icon: 'tl_steam', color: '#a0e0d0', unlock: { stat: 'paragon', n: 10 },
    desc: t => `绝技伤害 +${pct(0.1 * t)}，热度获取 +${pct(0.08 * t)}`, mods: t => [mod('a_p_formula', '一冷一热', slots('skill4'), [dmg(0.1 * t)])], res: t => ({ gainMul: 0.08 * t }),
    lore: '冰晶和硫磺放进同一口锅，答案自己就冒出来了。' },
  { id: 'a_p_flask', cls: 'alchemy', name: '防爆瓶匠', title: '厚瓶', icon: 'it_flask', color: '#c0c0d0', unlock: { stat: 'paragon', n: 20 },
    desc: t => `技能 3 附带护盾：最大生命 ${4 * t}%，持续 4 秒`, mods: t => [mod('a_p_flask', '厚瓶', slots('skill3'), [eff({ type: 'shield', percentMaxHp: 0.04 * t, duration: 4 })])],
    lore: '瓶子够厚，炸的就只是别人。' },
  { id: 'a_p_cauldron', cls: 'alchemy', name: '沸腾大釜', title: '翻滚', icon: 'sk_cauldron', color: '#ff9050', unlock: { stat: 'paragon', n: 35 },
    desc: t => `大招伤害 +${pct(0.1 * t)}，命中减速 ${15 + 5 * t}% 2 秒`, mods: t => [mod('a_p_cauldron', '翻滚', slots('ultimate'), [dmg(0.1 * t), eff({ type: 'slow', percent: 15 + 5 * t, duration: 2 })])],
    lore: '大釜在翻滚的时候，最好别站在它旁边。' },
  { id: 'a_p_dark', cls: 'alchemy', name: '暗岩之魂', title: '岩心', icon: 'it_reagent', color: '#ff7040', unlock: { stat: 'paragon', n: 50 },
    desc: t => `所有技能伤害 +${pct(0.05 * t)}，沸腾门槛 −${5 * t}`, mods: t => [mod('a_p_dark', '岩心', {}, [dmg(0.05 * t)])], res: t => ({ thrAdd: -5 * t }),
    lore: '暗岩深处有一颗心脏，它认得每一个回来的人。' },
];
/** v1.0.6：英灵表 = 本体 + 内容包职业的英灵（没有包 = 本体表原对象） */
export const SPIRITS: SpiritDef[] = withPacks<SpiritDef>(BASE_SPIRITS, 'spirits');
export const spiritDef = (id?: string | null) => SPIRITS.find(s => s.id === id);
/** 传承槽：10 / 15 / 20 / 25 / 30 级各开 1 个 */
export const SPIRIT_SLOT_LEVELS = [10, 15, 20, 25, 30];
/** 升阶：装备时击败首领累计（副本 / 野外首领 1，长副本首领 2） */
export const SPIRIT_TIER_AT = [0, 10, 30];
