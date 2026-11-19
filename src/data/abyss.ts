// v0.8.0 暗岩深渊：常量 / 畸变 / 岔路；v0.8.1 扩到 20 层 + 12 畸变 + 深渊碎片 / 暗金重铸
export const ABYSS = {
  unlock: 30,                 // 30 级解锁
  maxFloor: 20,               // v0.8.1：1–20 层（每 5 层换一座副本场地，15 层最终首领、20 层隐藏首领）
  perFloor: 0.08,             // 每层生命 / 伤害 +8%（复利）
  baseHp: 1.0, baseDmg: 1.0, baseHz: 0.75, hzCap: 1.4,   // 第 1 层 ≈ 英雄难度普通副本
  ilvlBase: 34,               // 旧版（v0.9.1p 以前）：34 + 层数；v0.9.1q 起掉落装等见 core/EndgameIlvl（1-5 层 40 … 16-20 层 55）
  ilvlMobCap: 44, ilvlBossCap: 48,
  shardBase: 1, shardBoss: 5,  // 深渊碎片：每层 1 + 层/5，首领层再 +5（×奖励倍率）
  recastShards: 20, recastGold: 300,   // 暗金重铸：锁 1 条词条、重随其余
  mobsBase: 4,                // 普通层怪数 = 4 + 层数/2
  goldBase: 60, goldPerFloor: 25,
  paragonPerFloor: 120,
  goldMul: 2, goldBossMul: 6,   // v0.9.1p 满级金币起飞：每层金币 ×2，首领层（5/10/15/20）×6
  dungeons: ['sand_tomb', 'troll_cave', 'ash_forge'],    // 借用三首领普通副本的场地和首领
} as const;

export type MutId = 'tough' | 'fury' | 'swift' | 'burst' | 'horde' | 'ember' | 'regen' | 'thorns' | 'stone' | 'frenzy' | 'dark' | 'meteor';
export const MUTS: Record<MutId, { name: string; desc: string; value: number; color: string }> = {
  tough: { name: '坚韧', desc: '敌人生命 +30%', value: 1.3, color: '#c0a080' },
  fury: { name: '狂暴', desc: '敌人伤害 +25%', value: 1.25, color: '#ff6040' },
  swift: { name: '迅捷', desc: '敌人移动速度 +30%', value: 1.3, color: '#80e0ff' },
  burst: { name: '爆裂', desc: '小怪死亡时留下熔岩（3 秒）', value: 3, color: '#ff9030' },
  horde: { name: '增援', desc: '每层小怪数量 +50%', value: 1.5, color: '#c080ff' },
  ember: { name: '灼地', desc: '每 8 秒在你脚下落一个红圈', value: 8, color: '#ff4060' },
  // v0.8.1 新增 6 种（11 层起才会出现）
  regen: { name: '再生', desc: '敌人每秒回复 1.5% 生命', value: 0.015, color: '#60e080' },
  thorns: { name: '荆棘', desc: '击中敌人时受到少量反伤（每 0.4 秒最多一次）', value: 0.006, color: '#c0e060' },
  stone: { name: '石肤', desc: '敌人受到的伤害 -20%', value: 0.8, color: '#a0a0b0' },
  frenzy: { name: '狂热', desc: '敌人生命低于 40% 时攻速、移速大幅提升', value: 0.4, color: '#ff3080' },
  dark: { name: '晦暗', desc: '视野缩小，只看得清身边', value: 1, color: '#6060a0' },
  meteor: { name: '陨落', desc: '每 12 秒在你周围落下 3 个红圈', value: 12, color: '#ffb040' },
};

export type PathKind = 'elite' | 'chest' | 'mutate' | 'rest';
export const PATHS: Record<PathKind, { name: string; desc: string; icon: string; bonus: number }> = {
  elite: { name: '精英之路', desc: '下一层出现一只精英（生命 ×3），本层奖励 ×1.5', icon: 'abyss_elite', bonus: 1.5 },
  chest: { name: '遗落宝箱', desc: '立刻获得一个宝箱（金币 + 2 件装备）', icon: 'abyss_chest', bonus: 1 },
  mutate: { name: '畸变裂隙', desc: '本趟多一个畸变，之后每层奖励 +25%', icon: 'abyss_mutate', bonus: 0.25 },
  rest: { name: '篝火', desc: '回满生命，移除最近一个畸变（奖励 -25%）', icon: 'abyss_rest', bonus: 1 },
};
/** 前 10 层只出 v0.8.0 的 6 种畸变，11 层起 12 种都可能 */
export const MUTS_EARLY: MutId[] = ['tough', 'fury', 'swift', 'burst', 'horde', 'ember'];
