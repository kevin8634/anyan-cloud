// 商店 / 强化 / 分解配置（原创内容）。改数字即可调经济节奏
import { ForgeData } from '../core/Forge';

export const FORGE_DATA: ForgeData = {
  stacks: [
    { id: 'mat_dust', name: '魔尘', kind: 'material', quality: 'green', desc: '分解优秀装备获得。强化 +1~+7 的主要材料' },
    { id: 'mat_shard', name: '星辉碎片', kind: 'material', quality: 'blue', desc: '分解精良装备获得。强化 +5 以上需要' },
    { id: 'mat_essence', name: '虚空精华', kind: 'material', quality: 'purple', desc: '分解史诗装备、击败腐根祭司获得。强化 +8 以上需要' },
    { id: 'mat_proof', name: '首领之证', kind: 'material', quality: 'blue', desc: '击败野外首领获得。部位强化突破 +5 需要' },
    { id: 'mat_badge', name: '英雄徽记', kind: 'material', quality: 'purple', desc: '击败副本首领获得。部位强化突破 +10 需要' },
    { id: 'mat_heart', name: '王座之心', kind: 'material', quality: 'orange', desc: '击败长副本首领获得。部位强化突破 +15 需要' },
    { id: 'mat_darkshard', name: '暗金碎片', kind: 'material', quality: 'dark', desc: '长副本首领掉落、每周机制挑战奖励、分解暗金获得。50 片在副本学者处兑换指定暗金；拓印也要用' },
    { id: 'mat_ember', name: '太古余烬', kind: 'material', quality: 'orange', desc: '分解太古装备获得（每件 1 个）。以后用于太古重铸 / 外观，现在先攒着' },
    { id: 'mat_abyss', name: '深渊碎片', kind: 'material', quality: 'purple', desc: '暗岩深渊每清一层获得（越深越多，首领层额外 +5）。20 片在铁匠「淬炼」页重铸暗金：锁定 1 条词条，其余全部重随' },
    { id: 'tok_dark', name: '暗金凭证', kind: 'material', quality: 'dark', desc: '完成长副本故事链获得，在副本学者墨言处免费兑换一件该副本的暗金' },
    // v0.9.3d 世界首领精魄：只在对应世界首领掉；攒满 10 个自动凝成一件该首领的专属橙装（保底）
    { id: 'soul_moss', name: '苔石的精魄', kind: 'material', quality: 'orange', desc: '击败世界首领「苔石」获得。攒满 10 个自动凝成一件苔石专属橙装', source: '世界首领 · 苔石（星落高原 · 古树石环）' },
    { id: 'soul_worm', name: '萨卡尔的精魄', kind: 'material', quality: 'orange', desc: '击败世界首领「萨卡尔」获得。攒满 10 个自动凝成一件萨卡尔专属橙装', source: '世界首领 · 萨卡尔（赤砂裂谷 · 流沙坑）' },
    { id: 'soul_yurg', name: '尤尔格的精魄', kind: 'material', quality: 'orange', desc: '击败世界首领「尤尔格」获得。攒满 10 个自动凝成一件尤尔格专属橙装', source: '世界首领 · 尤尔格（霜脊高地 · 冰湖）' },
    { id: 'soul_ash', name: '炽翼的精魄', kind: 'material', quality: 'orange', desc: '击败世界首领「炽翼」获得。攒满 10 个自动凝成一件炽翼专属橙装', source: '世界首领 · 炽翼（烬落荒原 · 火山口）' },
    { id: 'mat_soul', name: '传说之魂', kind: 'material', quality: 'orange', desc: '分解传说装备获得，极其稀有' },
    // v0.5 C：灰色杂物（怪物掉落，不占背包格子；拜访任何商人自动卖钱，按区域等级越往后越值钱）
    { id: 'junk_fang', name: '断裂的兽牙', kind: 'junk', quality: 'white', price: 2, desc: '灰色杂物。商人会自动收购' },
    { id: 'junk_cloth', name: '破旧的布片', kind: 'junk', quality: 'white', price: 4, desc: '灰色杂物。商人会自动收购' },
    { id: 'junk_trinket', name: '生锈的小饰物', kind: 'junk', quality: 'white', price: 9, desc: '灰色杂物。商人会自动收购' },
    { id: 'junk_ash', name: '焦黑的残骸', kind: 'junk', quality: 'white', price: 14, desc: '灰色杂物。商人会自动收购' },
    // v0.5 C：兑换货币（铁匠「兑换」页）。主线 v0.6.6 起由长副本首领 + 史诗/噩梦普通副本首领掉落（data/exchange.ts RAID_CURRENCY）
    { id: 'cur_ember', name: '熔心余烬', kind: 'currency', quality: 'orange', desc: '兑换货币。熔心王座首领掉落；史诗 / 噩梦难度的火系普通副本首领少量掉落', source: '熔心王座 / 史诗+ 暗岩矿洞 · 沙葬王陵 · 灰烬铸造厂' },
    { id: 'cur_frost', name: '永霜碎晶', kind: 'currency', quality: 'blue', desc: '兑换货币。永霜墓穴首领掉落；史诗 / 噩梦难度的冰 / 沼泽普通副本首领少量掉落', source: '永霜墓穴 / 史诗+ 腐沼神殿 · 巨魔冰窟' },
    { id: 'cur_sigil', name: '暗岩徽记', kind: 'currency', quality: 'purple', desc: '兑换货币。两个长副本所有首领都掉；史诗 / 噩梦普通副本首领也掉', source: '长副本首领 / 史诗+ 普通副本首领' },
    // v0.6.8：技能书
    { id: 'tome_any', name: '自选技能书', kind: 'currency', quality: 'purple', desc: '在技能面板（K）里用来学会任意一个本职业的新技能', source: '10 / 20 / 30 级各 1 本；5 张书页合成' },
    { id: 'tome_page', name: '技能书页', kind: 'currency', quality: 'blue', desc: '5 张在技能面板（K）合成 1 本自选技能书', source: '副本首领 / 长副本首领 / 野外首领 / 稀有首领' },
    // v0.7.4：岩纹（铁匠「岩纹镌刻」镶进武器 / 胸甲的孔；3 个孔按顺序组成纹语）
    { id: 'rs_blaze', name: '炎纹', kind: 'material', quality: 'purple', desc: '岩纹：所有技能伤害 +3%。在铁匠「觉醒 · 岩纹」镶进武器 / 胸甲', source: '副本首领 35% / 野外首领 15% / 长副本首领必掉' },
    { id: 'rs_gale', name: '风纹', kind: 'material', quality: 'purple', desc: '岩纹：技能 1~3 冷却 -3%。在铁匠「觉醒 · 岩纹」镶进武器 / 胸甲', source: '副本首领 35% / 野外首领 15% / 长副本首领必掉' },
    { id: 'rs_vast', name: '广纹', kind: 'material', quality: 'purple', desc: '岩纹：技能范围 +5%。在铁匠「觉醒 · 岩纹」镶进武器 / 胸甲', source: '副本首领 35% / 野外首领 15% / 长副本首领必掉' },
    { id: 'rs_star', name: '星纹', kind: 'material', quality: 'purple', desc: '岩纹：大招伤害 +6%。在铁匠「觉醒 · 岩纹」镶进武器 / 胸甲', source: '副本首领 35% / 野外首领 15% / 长副本首领必掉' },
    { id: 'rs_edge', name: '锋纹', kind: 'material', quality: 'purple', desc: '岩纹：普通攻击伤害 +6%。在铁匠「觉醒 · 岩纹」镶进武器 / 胸甲', source: '副本首领 35% / 野外首领 15% / 长副本首领必掉' },
    { id: 'rs_root', name: '根纹', kind: 'material', quality: 'purple', desc: '岩纹：大招冷却 -4%。在铁匠「觉醒 · 岩纹」镶进武器 / 胸甲', source: '副本首领 35% / 野外首领 15% / 长副本首领必掉' },
    { id: 'potion_s', name: '治疗药水', kind: 'potion', quality: 'white', desc: '立即回复 35% 最大生命（冷却 12 秒）', healPercent: 0.35, cooldown: 12 },
    { id: 'potion_l', name: '强效治疗药水', kind: 'potion', quality: 'green', desc: '立即回复 70% 最大生命（冷却 12 秒）', healPercent: 0.7, cooldown: 12 },
  ],
  // 下标 0 = 升到 +1（v0.6.2：部位强化 +1~+15，不掉级；失败积累祝福值；+5/+10/+15 突破需要对应玩法的材料）
  upgrade: [
    { gold: 40, mats: [{ id: 'mat_dust', count: 1 }], chance: 1 },
    { gold: 60, mats: [{ id: 'mat_dust', count: 2 }], chance: 1 },
    { gold: 90, mats: [{ id: 'mat_dust', count: 3 }], chance: 1 },
    { gold: 130, mats: [{ id: 'mat_dust', count: 4 }], chance: 0.9 },
    { gold: 180, mats: [{ id: 'mat_dust', count: 4 }, { id: 'mat_shard', count: 1 }, { id: 'mat_proof', count: 1 }], chance: 0.8 },
    { gold: 240, mats: [{ id: 'mat_dust', count: 5 }, { id: 'mat_shard', count: 2 }], chance: 0.75 },
    { gold: 310, mats: [{ id: 'mat_dust', count: 6 }, { id: 'mat_shard', count: 2 }], chance: 0.7 },
    { gold: 390, mats: [{ id: 'mat_shard', count: 3 }, { id: 'mat_essence', count: 1 }], chance: 0.65 },
    { gold: 480, mats: [{ id: 'mat_shard', count: 4 }, { id: 'mat_essence', count: 1 }], chance: 0.6 },
    { gold: 600, mats: [{ id: 'mat_shard', count: 4 }, { id: 'mat_essence', count: 2 }, { id: 'mat_badge', count: 1 }], chance: 0.5 },
    { gold: 750, mats: [{ id: 'mat_shard', count: 5 }, { id: 'mat_essence', count: 2 }], chance: 0.5 },
    { gold: 900, mats: [{ id: 'mat_shard', count: 5 }, { id: 'mat_essence', count: 3 }], chance: 0.45 },
    { gold: 1100, mats: [{ id: 'mat_shard', count: 6 }, { id: 'mat_essence', count: 3 }], chance: 0.4 },
    { gold: 1300, mats: [{ id: 'mat_shard', count: 6 }, { id: 'mat_essence', count: 4 }], chance: 0.35 },
    { gold: 1600, mats: [{ id: 'mat_essence', count: 5 }, { id: 'mat_heart', count: 1 }], chance: 0.3 },
  ],
  // 强化伤害加成：双手武器 > 单手 > 副手/首饰（单手 + 副手 ≈ 双手）；每级生命/护甲 +7%
  perLevel: { hpPct: 0.07, hpFlat: 5, armorPct: 0.07, damage: { twoHand: 0.035, oneHand: 0.021, offHand: 0.011, trinket: 0.011, ring: 0.006, neck: 0.006 } },
  slotUpgradeMul: { twoHand: 1.4, ring: 0.8, neck: 0.8, trinket: 0.9, wrist: 0.8, waist: 0.8 },
  salvageSlotBonus: { twoHand: [{ id: 'mat_dust', count: 1 }] },
  salvage: {
    white: [{ id: 'mat_dust', min: 1, max: 1 }],
    green: [{ id: 'mat_dust', min: 1, max: 3 }],
    blue: [{ id: 'mat_dust', min: 2, max: 3 }, { id: 'mat_shard', min: 1, max: 1 }],
    purple: [{ id: 'mat_shard', min: 2, max: 3 }, { id: 'mat_essence', min: 1, max: 1 }],
    orange: [{ id: 'mat_shard', min: 2, max: 3 }, { id: 'mat_essence', min: 2, max: 2 }, { id: 'mat_soul', min: 1, max: 1 }],
    dark: [{ id: 'mat_darkshard', min: 10, max: 10 }, { id: 'mat_essence', min: 3, max: 3 }],
  },
  // 强化过的装备分解时返还一部分材料
  salvageUpgradeBonus: lv => [
    ...(lv > 0 ? [{ id: 'mat_dust', count: Math.ceil(lv * 0.8) }] : []),
    ...(lv >= 5 ? [{ id: 'mat_shard', count: Math.floor((lv - 3) / 2) }] : []),
  ],
  // v0.5 C：分解顺带的金币（装备不能出售了，分解给一点零钱）
  salvageGold: { base: 1, perIlvl: 0.35, quality: { white: 0.5, green: 1, blue: 2, purple: 4, orange: 7, dark: 0 } },
  shop: [
    { kind: 'stack', id: 'potion_s', price: 15 },
    { kind: 'stack', id: 'potion_l', price: 45 },
    { kind: 'stack', id: 'mat_dust', price: 18 },
    // 装备货架（每次打开按等级和职业刷新）：武器、副手、主要护甲部位、首饰
    { kind: 'gear', slot: ['oneHand', 'twoHand'], quality: 'green', priceMul: 3 },
    { kind: 'gear', slot: 'offHand', quality: 'green', priceMul: 3 },
    { kind: 'gear', slot: 'head', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'shoulder', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'chest', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'hands', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'legs', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'feet', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'back', quality: 'white', priceMul: 3 },
    { kind: 'gear', slot: 'ring', quality: 'green', priceMul: 3 },
    { kind: 'gear', slot: 'neck', quality: 'green', priceMul: 3 },
  ],
};
