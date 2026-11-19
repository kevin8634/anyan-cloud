// v0.6.4：普通副本四难度（等级同步）、暗岩誓约、副本遗物、异变房间、计时奖牌 —— 数据
import { ModifierDef } from '../core/types';

export type Diff = 'normal' | 'heroic' | 'epic' | 'nightmare';
export const DIFFS: Diff[] = ['normal', 'heroic', 'epic', 'nightmare'];
/** 英雄起等级同步到 30 级：敌人按 30 级野怪的强度缩放，再乘难度倍率 */
export const DIFF: Record<Diff, { name: string; color: string; ilvl: number; hp: number; dmg: number; desc: string }> = {
  normal: { name: '普通', color: '#c8c8c8', ilvl: 0, hp: 1, dmg: 1, desc: '原版难度（推荐等级见副本）· 满级掉落装等 40' },
  heroic: { name: '英雄', color: '#4a9eff', ilvl: 33, hp: 1, dmg: 1, desc: '等级同步 30 级 · 满级掉落装等 42 · 有遗物和异变房间' },
  epic: { name: '史诗', color: '#a335ee', ilvl: 36, hp: 1.35, dmg: 1.2, desc: '敌人生命 ×1.35、伤害 ×1.2 · 装等 44 · 可立暗岩誓约' },
  nightmare: { name: '噩梦', color: '#ff4040', ilvl: 39, hp: 1.75, dmg: 1.45, desc: '敌人生命 ×1.75、伤害 ×1.45 · 装等 46 · 本周誓约必带' },
};
/** v0.7.4：史诗 / 噩梦的单副本修正（巨魔冰窟、灰烬铸造厂在史诗难度通关偏快，按其它副本的通关时间拉齐） */
export const DIFF_TUNE: Record<string, { hp: number; dmg: number }> = {
  troll_cave: { hp: 1.2, dmg: 1.12 },
  ash_forge: { hp: 1.18, dmg: 1.12 },
};
export const SYNC_LEVEL = 30;
/** 30 级野怪参考值（zones_wild 的 mob() 公式在 30 级的结果） */
export const SYNC_HP = 1800, SYNC_DMG = 96;
/** v1.2.16 同步等级参数化：小副本定义可以自带同步等级和该等级野怪的参考生命 / 伤害（不填 = 30 级这一档） */
export interface SyncSpec { level: number; hp: number; dmg: number }
export const SYNC_30: SyncSpec = { level: SYNC_LEVEL, hp: SYNC_HP, dmg: SYNC_DMG };
/** 副本里的敌人比野怪耐打：小怪 ×1.5，首领 ×3（首领战目标 1.5~2 分钟） */
export const SYNC_TRASH_K = 1.5, SYNC_BOSS_K = 3;

// ---------------------------------------------------------------- 暗岩誓约
export type OathId = 'fury' | 'stone' | 'swift' | 'nopot' | 'clock' | 'iron';
export const OATHS: Record<OathId, { name: string; desc: string }> = {
  fury: { name: '狂怒之誓', desc: '敌人伤害 +25%' },
  stone: { name: '磐石之誓', desc: '敌人生命 +30%' },
  swift: { name: '疾风之誓', desc: '敌人移动速度 +25%' },
  nopot: { name: '断药之誓', desc: '不能使用药水' },
  clock: { name: '沙漏之誓', desc: '首领开打 4 分钟后狂暴（伤害 ×2）' },
  iron: { name: '铁血之誓', desc: '阵亡一次，所有誓约奖励作废' },
};
export const OATH_IDS = Object.keys(OATHS) as OathId[];
export const OATH_MAX = 3;
/** 每条誓约：首领多掉 1 件装备，掉落装等 +1 */
export const OATH_REWARD = '每条誓约：首领多掉 1 件装备（蓝色起），全部掉落装等 +1';

// ---------------------------------------------------------------- 副本遗物（本趟生效）
export type RelicFam = 'fire' | 'frost' | 'shadow' | 'stone';
export const FAM_NAME: Record<RelicFam, string> = { fire: '火', frost: '霜', shadow: '影', stone: '岩' };
export const FAM_COLOR: Record<RelicFam, string> = { fire: '#ff7040', frost: '#7fd7ff', shadow: '#b080ff', stone: '#d0b080' };
export interface Relic { id: string; name: string; fam: RelicFam; desc: string; mods?: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>[]; hpPct?: number }
const R = (id: string, name: string, fam: RelicFam, desc: string, o: Partial<Relic>): Relic => ({ id, name, fam, desc, ...o });
export const RELICS: Relic[] = [
  R('r_flame', '炽焰护符', 'fire', '所有伤害 +8%', { mods: [{ match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] }] }),
  R('r_scorch', '灼热余烬', 'fire', '技能命中附带灼烧（3 秒）', { mods: [{ match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'fire', dps: 90, duration: 3 } }] }] }),
  R('r_volcano', '火山碎片', 'fire', '大招伤害 +30%', { mods: [{ match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] }] }),
  R('r_rime', '霜晶', 'frost', '技能冷却 -8%', { mods: [{ match: { slots: ['skill1', 'skill2', 'skill3', 'ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.08 }] }] }),
  R('r_chill', '寒息', 'frost', '技能命中减速 40%', { mods: [{ match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 2.5 } }] }] }),
  R('r_icicle', '冰棱', 'frost', '普攻弹射 1 次（60% 伤害）', { mods: [{ match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 1, radius: 6, damagePercent: 0.6 } }] }] }),
  R('r_blood', '血契', 'shadow', '吸血 6%', { mods: [{ match: {}, ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.06 } }] }] }),
  R('r_step', '影步', 'shadow', '技能 2、3 命中 20% 几率重置剩余冷却最长的技能（不含大招，内置冷却 8 秒）', { mods: [{ match: { slots: ['skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'longest', chance: 0.2, icd: 8 } }] }] }),
  R('r_edge', '暗刃', 'shadow', '对生命高于 80% 的敌人伤害 +25%', { mods: [{ match: {}, conditions: [{ type: 'targetHpAbove', percent: 0.8 }], ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] }] }),
  R('r_core', '岩心', 'stone', '生命 +12%', { hpPct: 0.12 }),
  R('r_skin', '石肤', 'stone', '生命 +8%，所有伤害 +3%', { hpPct: 0.08, mods: [{ match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.03 }] }] }),
  R('r_peak', '山岳', 'stone', '普攻伤害 +25%', { mods: [{ match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] }] }),
];
/** 同系遗物 2 件 → 共振 */
export const RELIC_RES: Record<RelicFam, { desc: string; mods?: Relic['mods']; hpPct?: number }> = {
  fire: { desc: '火之共振：所有伤害再 +8%', mods: [{ match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] }] },
  frost: { desc: '霜之共振：技能冷却再 -8%', mods: [{ match: { slots: ['skill1', 'skill2', 'skill3', 'ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.08 }] }] },
  shadow: { desc: '影之共振：吸血再 +5%', mods: [{ match: {}, ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.05 } }] }] },
  stone: { desc: '岩之共振：生命再 +10%', hpPct: 0.1 },
};

// ---------------------------------------------------------------- 异变房间
export type AnomalyKind = 'captive' | 'cursed' | 'trap' | 'goblin' | 'well' | 'merchant';
export const ANOMALY: Record<AnomalyKind, { name: string; label: string; desc: string }> = {
  captive: { name: '受困的冒险者', label: '解救冒险者', desc: '放他出来，他会跟着你一起打到最后' },
  cursed: { name: '诅咒宝箱', label: '打开诅咒宝箱', desc: '打开会放出 3 只精英守卫，打完才能拿宝箱里的东西' },
  trap: { name: '机关密室', label: '拉动机关', desc: '15 秒的落石红圈，躲得越干净奖励越好' },
  goblin: { name: '宝藏怪', label: '', desc: '背着一大袋金币，看到你就跑——20 秒内打倒它' },
  well: { name: '祈愿池', label: '投 300 金币许愿', desc: '投金币换一件随机遗物' },
  merchant: { name: '游荡商人', label: '和商人交易', desc: '花金币买遗物' },
};
export const ANOMALY_KINDS = Object.keys(ANOMALY) as AnomalyKind[];
export const WELL_COST = 300, RELIC_PRICE = 400;

/** 计时奖牌：只跟自己的最佳成绩比 */
export function medalOf(sec: number, best: number | undefined): 'gold' | 'silver' | 'bronze' {
  if (best === undefined || sec <= best) return 'gold';
  return sec <= best * 1.15 ? 'silver' : 'bronze';
}
export const MEDAL_NAME = { gold: '金牌', silver: '银牌', bronze: '铜牌' } as const;
export const MEDAL_COLOR = { gold: '#ffd060', silver: '#d8e0e8', bronze: '#d08a50' } as const;

// ---------------- 主线 v0.6.6：并入 v0.5 A（账号 B）的「噩梦 Boss 新机制」（老副本格罗克 / 腐根祭司在噩梦难度多一个技能）
import type { BossDef, BossAbility } from '../core/BossBrain';
export interface NightmareMechanic { ability: BossAbility; desc: string }
/** 加一个技能到 Boss 所有阶段（深拷贝，不改原定义） */
export function applyNightmareMechanic(def: BossDef, m: NightmareMechanic): BossDef {
  const out: BossDef = JSON.parse(JSON.stringify(def));
  out.abilities.push(JSON.parse(JSON.stringify(m.ability)));
  out.phases.forEach(p => { if (!p.abilities.includes(m.ability.id)) p.abilities.push(m.ability.id); });
  return out;
}
