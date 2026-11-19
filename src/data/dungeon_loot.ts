// ======================================================================
// v0.9.3h（原计划 v0.9.2d）副本专属掉落：每个副本一套命名物品，只在该副本掉，不进野外随机池
//   每个首领 = 独立掉落 3 件（武器 / 护甲 / 首饰，固定名字 + 1 条副本主题特效 + 随机词条）+ 1 件随机填充
//   全副本共享池（每个首领都可能掉）+ 最终首领副本专属传说 10% + 隐藏首领独立必掉（沿用 HIDDEN_DROP）
//   武器 / 护甲 adapt = 按当前职业换成本职业同部位底材（名字、特效不变），四个职业都能用
//   特效刻意避开野外精英 / 世界首领专属件的组合（simDungeonLoot 校验：同效果同匹配不重复）
// ======================================================================
import type { ItemDef } from '../core/Loadout';
import type { ModifierDef, EffectDef, SlotId, ModCondition } from '../core/types';
import type { LootEntry, LootTable } from '../core/Loot';

export type DungeonItem = ItemDef & { baseId: string; affixes: number; adapt?: boolean; dungeon: string; boss: number | 'shared' | 'final'; desc?: string };
export type DlId = 'darkrock_mine' | 'rotting_temple' | 'sand_tomb' | 'troll_cave' | 'ash_forge' | 'molten_throne' | 'frost_crypt';

const SLOT_OF: Record<string, ItemDef['slot']> = {
  b_sword: 'oneHand', b_greatsword: 'twoHand', b_shield: 'offHand', b_helm: 'head', b_pauldron: 'shoulder', b_chest: 'chest', b_bracer: 'wrist', b_gauntlet: 'hands',
  b_girdle: 'waist', b_legs: 'legs', b_sabaton: 'feet', b_amulet: 'neck', b_necklace: 'neck', b_ring: 'ring', b_idol: 'trinket', b_cloak: 'back',
};
const JEWEL = new Set(['b_amulet', 'b_necklace', 'b_ring', 'b_idol', 'b_cloak']);

// ---------------------------------------------------------------- 特效模板（纯数据修饰器）
type Fx = { desc: string; match: ModifierDef['match']; conditions?: ModCondition[]; ops: ModifierDef['ops'] };
const S3: SlotId[] = ['skill1', 'skill2', 'skill3'];
const eff = (desc: string, match: ModifierDef['match'], e: EffectDef, conditions?: ModCondition[]): Fx => ({ desc, match, conditions, ops: [{ op: 'addEffect', effect: e }] });
const mul = (desc: string, match: ModifierDef['match'], stat: 'damage' | 'cooldown' | 'radius', value: number, conditions?: ModCondition[]): Fx => ({ desc, match, conditions, ops: [{ op: 'mul', stat, value }] });
const F = {
  ultZone: (el: 'fire' | 'frost' | 'nature' | 'physical' | 'shadow', name: string, dps: number) => eff(`大招命中留下${name}（4 秒，持续伤害）`, { slots: ['ultimate'] }, { type: 'groundZone', element: el, dps, radius: 3.2, duration: 4 }),
  s2Chain: (j: number, p: number) => eff(`第二个技能命中后弹向附近 ${j} 个敌人（${Math.round(p * 100)}% 伤害）`, { slots: ['skill2'] }, { type: 'chain', jumps: j, radius: 6, damagePercent: p }),
  s3Stun: (d: number) => eff(`第三个技能命中眩晕 ${d} 秒`, { slots: ['skill3'] }, { type: 'stun', duration: d }),
  basicLeech: (p: number, sh: number) => eff(`普通攻击吸血 ${Math.round(p * 100)}%，溢出的治疗转为护盾（最多 ${Math.round(sh * 100)}% 最大生命）`, { slots: ['basic'] }, { type: 'heal', percentOfDamage: p, overflowShield: sh }),
  ultShield: (p: number, d: number) => eff(`第三个技能命中获得护盾（${Math.round(p * 100)}% 最大生命，${d} 秒）`, { slots: ['skill3'] }, { type: 'shield', percentMaxHp: p, duration: d }),   // 原「施放大招护盾」= 灰烬龙鳞披风，改到第三个技能
  s1Shield: (p: number, d: number) => eff(`第一个技能命中获得护盾（${Math.round(p * 100)}% 最大生命，${d} 秒）`, { slots: ['skill1'] }, { type: 'shield', percentMaxHp: p, duration: d }),
  freeze: (n: number, d: number, name: string) => eff(`同一目标被技能命中 ${n} 次后${name} ${d} 秒（首领只打断）`, { slots: S3 }, { type: 'stackStun', stacks: n, duration: d, name }),
  s1Crit: (n: number) => eff(`第一个技能每第 ${n} 次施放必定暴击`, { slots: ['skill1'] }, { type: 'critEvery', n }),
  s3Crit: (n: number) => eff(`第三个技能每第 ${n} 次施放必定暴击`, { slots: ['skill3'] }, { type: 'critEvery', n }),
  s2Knock: (d: number) => eff(`第二个技能命中击退 ${d} 米`, { slots: ['skill2'] }, { type: 'knockback', distance: d }),
  vsDot: (p: number) => mul(`对持续伤害中的敌人伤害 +${Math.round(p * 100)}%`, {}, 'damage', p, [{ type: 'targetHasEffect', effect: 'dot' }]),
  vsStun: (p: number) => mul(`对眩晕中的敌人伤害 +${Math.round(p * 100)}%`, {}, 'damage', p, [{ type: 'targetHasEffect', effect: 'stun' }]),
  el: (els: ('fire' | 'frost' | 'nature' | 'physical' | 'shadow' | 'arcane')[], name: string, p: number) => mul(`${name}范围技能伤害 +${Math.round(p * 100)}%`, { elements: els, tagsAny: ['aoe'] }, 'damage', p),   // 只算范围技能（和世界首领件的「X 系技能伤害」区分）
  ultCd: (p: number) => mul(`大招冷却 -${Math.round(p * 100)}%`, { slots: ['ultimate'] }, 'cooldown', -p),
  s3Cd: (p: number) => mul(`第三个技能冷却 -${Math.round(p * 100)}%`, { slots: ['skill3'] }, 'cooldown', -p),
  aoeR: (p: number) => mul(`范围技能半径 +${Math.round(p * 100)}%`, { tagsAny: ['aoe'] }, 'radius', p),
  s1Dot: (el: 'fire' | 'frost' | 'nature' | 'physical' | 'shadow', name: string, dps: number) => eff(`第一个技能命中使目标${name}（5 秒持续伤害）`, { slots: ['skill1'] }, { type: 'dot', element: el, dps, duration: 5 }),
  s2Dot: (el: 'fire' | 'frost' | 'nature' | 'physical' | 'shadow', name: string, dps: number) => eff(`第二个技能命中使目标${name}（5 秒持续伤害）`, { slots: ['skill2'] }, { type: 'dot', element: el, dps, duration: 5 }),
  s3Reset: (c: number) => eff(`第三个技能命中 ${Math.round(c * 200)}% 几率重置大招冷却（内置冷却 20 秒）`, { slots: ['skill3'] }, { type: 'resetCooldown', slot: 'ultimate', chance: c * 2, icd: 20 }),   // v1.2.35 旧：c 几率重置第二个技能
  s3Boom: (r: number, p: number) => eff(`第三个技能命中后爆炸（半径 ${r}，${Math.round(p * 100)}% 伤害）`, { slots: ['skill3'] }, { type: 'explode', radius: r, damagePercent: p }),
  s1Boom: (r: number, p: number) => eff(`第二个技能命中后爆裂（半径 ${r}，${Math.round(p * 100)}% 伤害）`, { slots: ['skill2'] }, { type: 'explode', radius: r, damagePercent: p }),   // 第一个技能爆炸 = 巨蠕甲晶护符，改到第二个技能
  s2Slow: (p: number) => eff(`第二个技能命中减速 ${Math.round(p * 100)}%（3 秒）`, { slots: ['skill2'] }, { type: 'slow', percent: p, duration: 3 }),
  lowShield: (p: number) => eff(`技能命中获得护盾（${Math.round(p * 100)}% 最大生命，4 秒），每 8 秒最多一次`, { slots: S3 }, { type: 'shield', percentMaxHp: p, duration: 4 }, [{ type: 'icd', sec: 8 }]),   // v1.2.35 旧：生命低于 50% 时
  elUlt: (els: ('fire' | 'frost' | 'nature' | 'physical' | 'shadow' | 'arcane')[], name: string, p: number) => mul(`${name}大招伤害 +${Math.round(p * 100)}%`, { slots: ['ultimate'], elements: els }, 'damage', p),
  ultStun: (d: number) => eff(`大招命中眩晕 ${d} 秒`, { slots: ['ultimate'] }, { type: 'stun', duration: d }),
};

let seq = 0;
const mk = (dungeon: DlId, boss: DungeonItem['boss'], id: string, name: string, baseId: string, fx: Fx, quality: 'purple' | 'orange' = 'purple', extra?: Fx): DungeonItem => {
  const m = (f: Fx, k: string): ModifierDef => ({ id: `dl_${id}${k}`, name, desc: f.desc, source: 'equipment', match: f.match, conditions: f.conditions, ops: f.ops });
  seq++;
  return { id: `dl_${id}`, name, baseId, slot: SLOT_OF[baseId], quality, modifiers: extra ? [m(fx, ''), m(extra, '_2')] : [m(fx, '')], affixes: quality === 'orange' ? 2 : 3,
    adapt: !JEWEL.has(baseId), dungeon, boss };
};

// ---------------------------------------------------------------- 物品表
export const DUNGEON_ITEMS: DungeonItem[] = [
  // ===== 暗岩矿洞 4~8 · 矿道工头巴克（v0.9.3j 前置首领）/ 监工格罗克
  mk('darkrock_mine', 0, 'buck_lamp', '工头的风灯', 'b_idol', F.vsStun(0.12)),
  mk('darkrock_mine', 0, 'buck_vest', '巴克的皮护肩', 'b_pauldron', F.basicLeech(0.03, 0.05)),
  mk('darkrock_mine', 0, 'buck_mattock', '断柄十字镐', 'b_sword', F.s3Crit(4)),
  mk('darkrock_mine', 1, 'grok_pick', '监工的鹤嘴锄', 'b_greatsword', F.s3Stun(0.6)),
  mk('darkrock_mine', 1, 'grok_helm', '矿灯铁盔', 'b_helm', F.s1Shield(0.06, 3)),
  mk('darkrock_mine', 1, 'grok_chain', '工头的铜哨链', 'b_amulet', F.s2Knock(2.5)),
  mk('darkrock_mine', 'shared', 'mine_gloves', '矿工的厚手套', 'b_gauntlet', F.s1Shield(0.05, 3)),
  mk('darkrock_mine', 'shared', 'mine_ring', '暗岩原石戒', 'b_ring', F.el(['physical'], '物理', 0.08)),
  mk('darkrock_mine', 'final', 'mine_heart', '矿脉之心', 'b_idol', F.s1Boom(2.2, 0.3), 'orange', F.vsStun(0.15)),
  // ===== 腐沼神殿 8~12 · 腐根祭司
  mk('rotting_temple', 0, 'rot_staff', '腐根祭司的弯杖', 'b_greatsword', F.s2Dot('nature', '中腐毒', 40)),
  mk('rotting_temple', 0, 'rot_robe', '苔痕祭袍', 'b_chest', F.vsDot(0.12)),
  mk('rotting_temple', 0, 'rot_charm', '沼泽眼护符', 'b_amulet', F.s2Slow(0.25)),
  mk('rotting_temple', 'shared', 'rot_boots', '泥沼长靴', 'b_sabaton', F.lowShield(0.05)),
  mk('rotting_temple', 'shared', 'rot_ring', '藤蔓指环', 'b_ring', F.el(['nature'], '自然', 0.1)),
  mk('rotting_temple', 'final', 'rot_seed', '腐根之种', 'b_idol', F.ultZone('nature', '腐沼', 60), 'orange', F.vsDot(0.15)),
  // ===== 沙葬王陵 30 · 蝎后 / 沙匪头目 / 沙葬法老
  mk('sand_tomb', 0, 'kas_blade', '蝎后的尾刺剑', 'b_sword', F.s1Dot('nature', '中蝎毒', 160)),
  mk('sand_tomb', 0, 'kas_plate', '甲壳胸铠', 'b_chest', F.lowShield(0.08)),
  mk('sand_tomb', 0, 'kas_ring', '蝎卵琥珀戒', 'b_ring', F.vsDot(0.16)),
  mk('sand_tomb', 1, 'ras_axe', '拉希德的弯刀', 'b_greatsword', F.s3Crit(3)),
  mk('sand_tomb', 1, 'ras_belt', '沙匪的弹药腰带', 'b_girdle', F.s2Knock(3)),
  mk('sand_tomb', 1, 'ras_cloak', '头目的沙色斗篷', 'b_cloak', F.s3Cd(0.12)),
  mk('sand_tomb', 2, 'set_crook', '法老的连枷权杖', 'b_greatsword', F.ultStun(1.2)),
  mk('sand_tomb', 2, 'set_crown', '塞特赫的金冠', 'b_helm', F.ultCd(0.12)),
  mk('sand_tomb', 2, 'set_eye', '荷鲁斯之眼', 'b_amulet', F.s3Boom(3, 0.4)),
  mk('sand_tomb', 'shared', 'tomb_wraps', '裹尸布护腕', 'b_bracer', F.basicLeech(0.04, 0.08)),
  mk('sand_tomb', 'shared', 'tomb_sandals', '王陵沙履', 'b_sabaton', F.aoeR(0.15)),
  mk('sand_tomb', 'shared', 'tomb_scarab', '圣甲虫坠饰', 'b_necklace', F.el(['physical'], '物理', 0.12)),
  mk('sand_tomb', 'final', 'tomb_ankh', '永生安卡', 'b_idol', F.ultShield(0.18, 5), 'orange', F.ultCd(0.15)),
  // ===== 巨魔冰窟 30 · 巨魔双子 / 冰窟萨满 / 雪原巨人
  mk('troll_cave', 0, 'twin_club', '格鲁的狼牙棒', 'b_greatsword', F.s3Stun(0.8)),
  mk('troll_cave', 0, 'twin_shield', '莫格的树盾', 'b_shield', F.lowShield(0.08)),
  mk('troll_cave', 0, 'twin_tusk', '双子獠牙项链', 'b_necklace', F.vsStun(0.2)),
  mk('troll_cave', 1, 'ulg_totem', '乌尔嘎的冰图腾', 'b_sword', F.s2Chain(2, 0.5)),
  mk('troll_cave', 1, 'ulg_mantle', '萨满羽肩', 'b_pauldron', F.el(['frost'], '冰霜', 0.15)),
  mk('troll_cave', 1, 'ulg_fetish', '冰封巫毒偶', 'b_idol', F.s2Slow(0.3)),
  mk('troll_cave', 2, 'hol_maul', '霍尔格的冰川巨锤', 'b_greatsword', F.ultZone('frost', '冰川碎片', 220)),
  mk('troll_cave', 2, 'hol_legs', '巨人毛皮护腿', 'b_legs', F.s1Shield(0.08, 3)),
  mk('troll_cave', 2, 'hol_ring', '雪原巨人的指节', 'b_ring', F.s3Crit(4)),
  mk('troll_cave', 'shared', 'troll_fur', '冰窟毛靴', 'b_sabaton', F.basicLeech(0.04, 0.08)),
  mk('troll_cave', 'shared', 'troll_bracer', '冻骨护腕', 'b_bracer', F.s3Cd(0.1)),
  mk('troll_cave', 'shared', 'troll_cloak2', '霜纹披风', 'b_cloak', F.aoeR(0.15)),
  mk('troll_cave', 'final', 'troll_crown', '永冻王冠', 'b_amulet', F.freeze(7, 1.5, '冻结'), 'orange', F.el(['frost'], '冰霜', 0.15)),
  // ===== 灰烬铸造厂 30 · 铸造监工 / 锻炉傀儡 / 熔铸大师
  mk('ash_forge', 0, 'gren_hammer', '葛伦的监工锤', 'b_sword', F.s2Knock(3)),
  mk('ash_forge', 0, 'gren_apron', '防火皮围裙', 'b_chest', F.lowShield(0.08)),
  mk('ash_forge', 0, 'gren_whistle', '监工的铁哨', 'b_amulet', F.s3Reset(0.12)),
  mk('ash_forge', 1, 'golem_fist', '傀儡铁拳', 'b_gauntlet', F.s1Boom(2.6, 0.35)),
  mk('ash_forge', 1, 'golem_core2', '炉心齿轮', 'b_idol', F.s1Crit(4)),
  mk('ash_forge', 1, 'golem_plate', '锻炉肩甲', 'b_pauldron', F.aoeR(0.18)),
  mk('ash_forge', 2, 'vic_tongs', '维克多的大师钳', 'b_greatsword', F.ultZone('fire', '铁水', 240)),
  mk('ash_forge', 2, 'vic_goggles', '大师的护目镜', 'b_helm', F.s3Crit(3)),
  mk('ash_forge', 2, 'vic_ring', '熔铸印戒', 'b_ring', F.elUlt(['fire'], '火焰', 0.25)),
  mk('ash_forge', 'shared', 'forge_gloves', '铸工皮手套', 'b_gauntlet', F.s1Dot('fire', '灼烧', 150)),
  mk('ash_forge', 'shared', 'forge_belt', '铁砧腰带', 'b_girdle', F.ultCd(0.1)),
  mk('ash_forge', 'shared', 'forge_chain', '铁水滴坠', 'b_necklace', F.vsDot(0.15)),
  mk('ash_forge', 'final', 'forge_mold', '最后的模子', 'b_idol', F.s1Boom(3, 0.45), 'orange', F.s1Crit(3)),
  // ===== 熔心王座（长副本）· 5 个首领
  mk('molten_throne', 0, 'gor_hammer', '戈拉克的熔铸锤', 'b_greatsword', F.s3Boom(3.2, 0.45)),
  mk('molten_throne', 0, 'gor_gaunt', '熔铸者护手', 'b_gauntlet', F.s1Shield(0.09, 3)),
  mk('molten_throne', 0, 'gor_ring', '熔渣指环', 'b_ring', F.elUlt(['fire'], '火焰', 0.25)),
  mk('molten_throne', 1, 'twin_flame', '伊格的焰刃', 'b_sword', F.s2Chain(2, 0.55)),
  mk('molten_throne', 1, 'twin_veil', '妮丝的焰纱', 'b_pauldron', F.s2Dot('fire', '燃烧', 200)),
  mk('molten_throne', 1, 'twin_locket', '双生焰坠', 'b_amulet', F.vsDot(0.18)),
  mk('molten_throne', 2, 'sam_scale', '萨穆尔的岩鳞铠', 'b_chest', F.lowShield(0.1)),
  mk('molten_throne', 2, 'sam_claw', '巨蜥利爪', 'b_greatsword', F.s1Dot('physical', '撕裂', 220)),
  mk('molten_throne', 2, 'sam_cloak', '岩鳞披风', 'b_cloak', F.s2Knock(3.5)),
  mk('molten_throne', 3, 'kas_censer', '卡萨的焚香炉', 'b_sword', F.ultZone('fire', '圣焰', 280)),
  mk('molten_throne', 3, 'kas_hood', '炎誓兜帽', 'b_helm', F.ultCd(0.14)),
  mk('molten_throne', 3, 'kas_idol', '炎誓圣像', 'b_idol', F.s3Reset(0.14)),
  mk('molten_throne', 4, 'val_blade', '瓦尔卡兹的王座之刃', 'b_greatsword', F.ultStun(1.5)),
  mk('molten_throne', 4, 'val_legs', '熔心王铠护腿', 'b_legs', F.ultShield(0.15, 5)),
  mk('molten_throne', 4, 'val_signet', '熔心君王印戒', 'b_ring', F.s3Crit(3)),
  mk('molten_throne', 'shared', 'mol_boots', '熔岩行者靴', 'b_sabaton', F.basicLeech(0.05, 0.1)),
  mk('molten_throne', 'shared', 'mol_bracer', '火山玻璃护腕', 'b_bracer', F.aoeR(0.2)),
  mk('molten_throne', 'shared', 'mol_chain', '王座余烬坠', 'b_necklace', F.vsStun(0.22)),
  mk('molten_throne', 'final', 'mol_crown', '熔心王冠', 'b_amulet', F.ultZone('fire', '熔心之火', 320), 'orange', F.ultShield(0.15, 4)),
  // ===== 永霜墓穴（长副本）· 5 个首领
  mk('frost_crypt', 0, 'mog_key', '莫戈斯的墓门钥', 'b_sword', F.s3Stun(1)),
  mk('frost_crypt', 0, 'mog_plate', '守门人霜铠', 'b_chest', F.s1Shield(0.09, 3)),
  mk('frost_crypt', 0, 'mog_lantern', '墓穴魂灯', 'b_idol', F.vsStun(0.2)),
  mk('frost_crypt', 1, 'ves_wand', '维瑟拉的霜语杖', 'b_greatsword', F.s2Chain(3, 0.45)),
  mk('frost_crypt', 1, 'ves_shawl', '女巫的冰丝披肩', 'b_pauldron', F.s2Slow(0.35)),
  mk('frost_crypt', 1, 'ves_ring', '霜语指环', 'b_ring', F.el(['frost'], '冰霜', 0.16)),
  mk('frost_crypt', 2, 'wyrm_spine', '寒脊骨刃', 'b_sword', F.s1Crit(3)),
  mk('frost_crypt', 2, 'wyrm_helm', '骨龙颅盔', 'b_helm', F.ultZone('frost', '霜息', 280)),
  mk('frost_crypt', 2, 'wyrm_cloak', '骨翼披风', 'b_cloak', F.s3Cd(0.14)),
  mk('frost_crypt', 3, 'kn_lance', '亡誓骑枪', 'b_greatsword', F.s2Knock(4)),
  mk('frost_crypt', 3, 'kn_legs', '骑士团腿甲', 'b_legs', F.lowShield(0.1)),
  mk('frost_crypt', 3, 'kn_badge', '亡誓徽章', 'b_amulet', F.s3Reset(0.14)),
  mk('frost_crypt', 4, 'ith_sword', '伊瑟兰的永冬之刃', 'b_greatsword', F.freeze(6, 1.5, '冰封')),
  mk('frost_crypt', 4, 'ith_crown', '永冬王冠', 'b_helm', F.ultCd(0.15)),
  mk('frost_crypt', 4, 'ith_ring', '永冬之王的指环', 'b_ring', F.ultShield(0.16, 5)),
  mk('frost_crypt', 'shared', 'cry_boots', '墓穴冰靴', 'b_sabaton', F.basicLeech(0.05, 0.1)),
  mk('frost_crypt', 'shared', 'cry_belt', '冻棺腰带', 'b_girdle', F.aoeR(0.2)),
  mk('frost_crypt', 'shared', 'cry_shard', '永霜碎片坠', 'b_necklace', F.vsStun(0.22)),
  mk('frost_crypt', 'final', 'cry_heart', '永冬之心', 'b_idol', F.freeze(5, 2, '冰封'), 'orange', F.el(['frost'], '冰霜', 0.18)),
];

/** 副本 → 首领数（不含隐藏首领）；矿洞 2 个（v0.9.3j 前置首领矿道工头 + 监工格罗克）、腐沼 1 个 */
export const DL_BOSSES: Record<DlId, number> = { darkrock_mine: 2, rotting_temple: 1, sand_tomb: 3, troll_cave: 3, ash_forge: 3, molten_throne: 5, frost_crypt: 5 };
/** v0.9.3j 营地副本区副本的前置首领（在某个小怪房里，打完才开门） */
export const LAYOUT_PREBOSS: Record<string, { enc: string; name: string; kind: string; table: string }> = { darkrock_mine: { enc: 'tunnel', name: '矿道工头 · 巴克', kind: 'mine_foreman', table: 'boss_foreman' } };
export const DL_IDS = Object.keys(DL_BOSSES) as DlId[];
export const DL_CHANCE = { boss: 0.2, shared: 0.06, final: 0.1 } as const;

/** 首领 i 的掉落项（专属 3 件 20% + 全副本共享各 6% + 最终首领传说 10%） */
export function dlEntries(d: DlId, boss: number, final: boolean): LootEntry[] {
  const own = DUNGEON_ITEMS.filter(x => x.dungeon === d && x.boss === boss).map(x => ({ kind: 'fixed', chance: DL_CHANCE.boss, itemId: x.id }) as LootEntry);
  const shared = DUNGEON_ITEMS.filter(x => x.dungeon === d && x.boss === 'shared').map(x => ({ kind: 'fixed', chance: DL_CHANCE.shared, itemId: x.id }) as LootEntry);
  const lg = final ? DUNGEON_ITEMS.filter(x => x.dungeon === d && x.boss === 'final').map(x => ({ kind: 'fixed', chance: DL_CHANCE.final, itemId: x.id }) as LootEntry) : [];
  return [...own, ...shared, ...lg];
}
/** v0.9.6a 从长副本退下来的命名装备（30 件紫装 + 2 件王冠类橙装） */
export const RAID_RETIRED = () => DUNGEON_ITEMS.filter(x => x.dungeon === 'molten_throne' || x.dungeon === 'frost_crypt');
/** 30 级副本 / 长副本：每个首领的独立掉落表（随机装备降为「填充」：保底 1 件史诗随机） */
export const DL_TABLES: Record<string, LootTable> = {};
for (const d of ['sand_tomb', 'troll_cave', 'ash_forge', 'molten_throne', 'frost_crypt'] as DlId[]) {
  const raid = d === 'molten_throne' || d === 'frost_crypt', n = DL_BOSSES[d];
  for (let i = 0; i < n; i++) {
    const final = i === n - 1;
    const gold: [number, number] = raid ? (final ? [1500, 2200] : [600, 900]) : final ? [500, 800] : [250, 400];
    // v0.9.6a 长副本首领：怪物表只剩金币 / 材料，套装 + 橙装在 raid.ts raidBossRewards 里发（带保底）；说明书读 dlg_ 展示表
    // 30 级普通副本：原长副本命名紫装 / 王冠类橙装搬进来，作为每个首领每件 0.3% 的稀有额外掉落
    DL_TABLES[`dl_${d}_${i}`] = { id: `dl_${d}_${i}`, gold, entries: raid ? [] : [
      { kind: 'random', chance: 1, minQuality: 'purple' },
      { kind: 'random', chance: final ? 0.3 : 0.12, minQuality: 'orange' },
      ...dlEntries(d, i, final),
      ...RAID_RETIRED().map(x => ({ kind: 'fixed', chance: 0.003, itemId: x.id }) as LootEntry),
    ], stacks: raid ? [{ id: 'mat_essence', chance: 1, min: final ? 5 : 2, max: final ? 8 : 4 }, { id: 'mat_shard', chance: 1, min: 3, max: 5 }] : [{ id: 'mat_essence', chance: 1, min: 1, max: final ? 4 : 2 }, { id: 'mat_shard', chance: 1, min: 2, max: 3 }] };
  }
  // 隐藏首领：和最终首领同一张表（另外必掉 HIDDEN_DROP 的外观件，raid.ts 里发）
  if (!raid) DL_TABLES[`dl_${d}_hidden`] = { ...DL_TABLES[`dl_${d}_${n - 1}`], id: `dl_${d}_hidden` };
}
export const dlTableId = (d: string, room: number, hidden = false) => hidden ? `dl_${d}_hidden` : `dl_${d}_${room}`;
export const isDungeonItem = (id?: string) => !!id && id.startsWith('dl_');
