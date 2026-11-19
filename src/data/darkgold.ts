// v0.6.3：暗金——只做武器和饰品，每件一个改变玩法的固定效果 + 2 条随机词条（可淬炼）
// 来源：长副本最终首领 5%（炼狱 20%，每周首通再翻倍）；50 暗金碎片兑换指定一件；故事链终点送一张暗金凭证
// 分解暗金时自动「拓印」进暗金典藏，之后可以花碎片把效果刻到同部位的装备上
import { ItemDef } from '../core/Loadout';
import { ModifierDef } from '../core/types';
import type { RaidId } from './raid_molten';

/** look：外观主色 / 流光色（浏览器版 gear.ts 的暗金流光 + 符文环，v0.5 B 的暗金外观；不填用默认金色）；since：哪个版本加入 */
export type DarkItem = ItemDef & { baseId: string; affixes: number; raid: RaidId; cls?: string; flavor: string; look?: { main: number; glow: number }; since?: string; from?: string };
const fx = (id: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): ModifierDef => ({ id, name: desc, source: 'equipment', desc, ...m });
const slotOf: Record<string, ItemDef['slot']> = { b_greataxe: 'twoHand', b_staff: 'twoHand', b_sword: 'oneHand', b_wand: 'oneHand', b_ring: 'ring', b_amulet: 'neck', b_idol: 'trinket', b_chakram: 'oneHand', b_flask: 'oneHand' };
const dark = (id: string, name: string, baseId: string, raid: RaidId, flavor: string, mods: ModifierDef[], cls?: string): DarkItem =>
  ({ id, name, baseId, slot: slotOf[baseId], quality: 'dark', modifiers: mods, affixes: 2, raid, cls, flavor });

export const DARK_ITEMS: DarkItem[] = [
  // ---------------- 阶段七 v0.7.2-br.A：新职业暗金武器（机制在 web/chrono.ts / web/alchemy.ts，用 hasDark(id) 读取）
  { ...dark('d_aeon_wheel', '永劫之轮', 'b_chakram', 'molten_throne', '它转过的每一圈，都会在别的时间里再转一次。', [
    fx('aeon', '回声不再减伤（100% 伤害），回声的时轮也会叠时痕', { match: { skillIds: ['__none'] }, ops: [] }),
    fx('aeon2', '时轮投掷伤害 +20%', { match: { skillIds: ['chrono_throw'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
  ], 'chrono'), look: { main: 0x1a2a4a, glow: 0xffd070 }, since: 'v0.7.2' },
  { ...dark('d_chaos_tincture', '混沌原液', 'b_flask', 'frost_crypt', '瓶子里的颜色从来没有重复过。', [
    fx('chaos', '每次投出红 / 蓝 / 绿时，随机变成一种混合药剂，伤害 +35%（不用再连按调配）', { match: { skillIds: ['__none'] }, ops: [] }),
  ], 'alchemy'), look: { main: 0x2a1a3a, glow: 0x9aff3a }, since: 'v0.7.2' },

  // ---------------- 熔心王座
  dark('d_rifter', '裂地者', 'b_greataxe', 'molten_throne', '戈拉克用它劈开了第一道地裂。', [
    fx('rift', '雷霆一击留下 4 秒熔岩裂缝（持续火焰伤害）', { match: { skillIds: ['thunderclap'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 60, radius: 3.2, duration: 4 } }] }),
    fx('rift2', '雷霆一击伤害 +30%', { match: { skillIds: ['thunderclap'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] }),
  ], 'warrior'),
  dark('d_oathstaff', '炎誓法杖', 'b_staff', 'molten_throne', '大祭司的誓言还在杖里燃烧。', [
    fx('oath', '烈焰弹命中后弹射 2 次（每跳 60% 伤害）', { match: { skillIds: ['flame_orb'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.6 } }] }),
  ], 'mage'),
  dark('d_throne_ember', '王座余烬', 'b_ring', 'molten_throne', '瓦尔卡兹王冠上掉下的一粒火星。', [
    fx('ember', '技能命中 10% 几率重置大招冷却（内置冷却 20 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'ultimate', chance: 0.1, icd: 20 } }] }),
    { ...fx('ember_w', '大招命中时获得护盾（最大生命 15%，8 秒）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 8 } }] }), cls: 'warrior' },   // v0.6.9 职业版
    { ...fx('ember_m', '大招冷却 -12%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.12 }] }), cls: 'mage' },
  ]),
  dark('d_molten_heart', '熔心护符', 'b_amulet', 'molten_throne', '握在手里，能听见王座深处的心跳。', [
    fx('molten', '所有技能变为火焰伤害，火焰伤害 +15%', { match: {}, priority: -10, ops: [{ op: 'setElement', value: 'fire' }] }),
    fx('molten2', '火焰伤害 +15%', { match: { elements: ['fire'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
    { ...fx('molten_w', '旋风斩留下燃烧地面（3 秒）', { match: { skillIds: ['whirlwind'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 90, radius: 3.5, duration: 3 } }] }), cls: 'warrior' },
    { ...fx('molten_m', '烈焰弹命中后爆炸（半径 3，40% 伤害）', { match: { skillIds: ['flame_orb'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.4 } }] }), cls: 'mage' },
  ]),
  // ---------------- 永霜墓穴
  dark('d_spine', '寒脊之骨', 'b_sword', 'frost_crypt', '骨龙脊椎磨成的剑，握柄冰得发烫。', [
    fx('spine', '冲锋命中眩晕 1.5 秒，并使周围敌人减速 40%', { match: { skillIds: ['charge'] }, ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 1.5 } }, { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 3 } }] }),
  ], 'warrior'),
  dark('d_frostheart', '霜心', 'b_wand', 'frost_crypt', '维瑟拉的镜子碎成的魔杖，里面还有一个她在笑。', [
    fx('heart', '奥能弹变为冰霜伤害，命中减速 40% 并弹向 1 个敌人', { match: { skillIds: ['arcane_bolt'] }, priority: -10, ops: [{ op: 'setElement', value: 'frost' }, { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 2 } }, { op: 'addEffect', effect: { type: 'chain', jumps: 1, radius: 5, damagePercent: 0.7 } }] }),
  ], 'mage'),
  dark('d_warden_chain', '墓守锁链', 'b_amulet', 'frost_crypt', '莫戈斯锁住过上千个灵魂，现在它锁住你的。', [
    fx('chain', '技能命中给目标套上「锁链」6 秒：你对它的伤害 +15%；锁链目标死亡时回复 3% 最大生命', { match: { skillIds: ['__none'] }, ops: [] }),
    { ...fx('chain_w', '冲锋命中锁链目标时返还 50% 冷却', { match: { skillIds: ['__none'] }, ops: [] }), cls: 'warrior' },
    { ...fx('chain_m', '霜环冻结锁链目标 1.5 秒（同一目标 10 秒一次）', { match: { skillIds: ['__none'] }, ops: [] }), cls: 'mage' },
  ]),
  dark('d_oath_ring', '骑士誓戒', 'b_idol', 'frost_crypt', '三位骑士的誓言，刻在同一枚徽章上。', [
    fx('oathr', '技能冷却 -10%，技能命中 10% 几率重置剩余冷却最长的技能（不含大招，内置冷却 8 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.1 }, { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'longest', chance: 0.1, icd: 8 } }] }),
    { ...fx('oathr_w', '雷霆一击伤害 +20%', { match: { skillIds: ['thunderclap'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }), cls: 'warrior' },
    { ...fx('oathr_m', '奥术禁锢冷却 -20%', { match: { skillIds: ['arcane_bind'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }] }), cls: 'mage' },
  ]),

  // ---------------- v0.6.6 主线：并入 v0.5 B（账号 B）的 4 件暗金典藏（与上面 8 件主题不重复的；断岳 ≈ 裂地者、星烬 ≈ 炎誓法杖 / 霜心 的弹射，未并入）
  //   修饰器原样保留（priority 25，带 fx_* 标签给 casting.ts 的专属特效）；B 的「霜心」与本表魔杖同名，改名「冰陨之心」
  { ...dark('d_bloodoath', '血誓', 'b_sword', 'molten_throne', '立誓者的血在剑脊里流动，从不干涸。', [
    { id: 'relic_bloodoath', name: '血誓', source: 'equipment', priority: 25,
      desc: '英勇打击变为「血誓斩」：暗影伤害，命中后弹向附近 2 个敌人（每跳 70%），造成伤害的 10% 转化为生命', match: { skillIds: ['slash'] },
      ops: [{ op: 'setElement', value: 'shadow' }, { op: 'addTag', value: 'fx_blood' },
            { op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 5, damagePercent: 0.7 } },
            { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.1 } }, { op: 'rename', name: '血誓斩' }] },
  ], 'warrior'), look: { main: 0x4a0a10, glow: 0xff3040 }, since: 'v0.6.6', from: 'relic_bloodoath' },
  { ...dark('d_voidscale', '虚衡', 'b_wand', 'molten_throne', '一端是虚空，一端是秩序，魔杖本身就是那根秤杆。', [
    { id: 'relic_voidscale', name: '虚衡', source: 'equipment', priority: 25,
      desc: '奥术禁锢变为「虚衡裂隙」：冷却 -25%，命中时在目标处爆裂（4 米，80% 伤害），并立刻重置霜环', match: { skillIds: ['arcane_bind'] },
      ops: [{ op: 'addTag', value: 'fx_voidscale' }, { op: 'mul', stat: 'cooldown', value: -0.25 },
            { op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.8 } },
            { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill2', chance: 1 } }, { op: 'rename', name: '虚衡裂隙' }] },
  ], 'mage'), look: { main: 0x101a2a, glow: 0x60a0ff }, since: 'v0.6.6', from: 'relic_voidscale' },
  { ...dark('d_abyss', '渊吼', 'b_idol', 'frost_crypt', '一块会自己低吼的骨片，握紧它时听得见深渊。', [
    { id: 'relic_abyss', name: '渊吼', source: 'equipment', priority: 25,
      desc: '天神下凡变为「渊吼降临」：冷却 -35%，释放后 8 秒内受到的伤害 -40%，并把 60% 反弹给攻击者', match: { skillIds: ['avatar'] },
      ops: [{ op: 'addTag', value: 'fx_abyss' }, { op: 'mul', stat: 'cooldown', value: -0.35 },
            { op: 'addEffect', effect: { type: 'reflect', reduce: 0.4, percent: 0.6, duration: 8 } }, { op: 'rename', name: '渊吼降临' }] },
  ], 'warrior'), look: { main: 0x2a1a30, glow: 0xff7a20 }, since: 'v0.6.6', from: 'relic_abyss' },
  { ...dark('d_icemeteor', '冰陨之心', 'b_idol', 'frost_crypt', '永不融化的一颗心，靠近的人会听见冰层下的心跳。', [
    { id: 'relic_frostheart', name: '冰陨之心', source: 'equipment', priority: 25,
      desc: '陨星坠落变为「冰陨坠落」：冰霜伤害，冷却 -30%，冻结命中的敌人 2 秒并减速 60%', match: { skillIds: ['meteor'] },
      ops: [{ op: 'setElement', value: 'frost' }, { op: 'addTag', value: 'frost' }, { op: 'addTag', value: 'fx_frostheart' }, { op: 'mul', stat: 'cooldown', value: -0.3 },
            { op: 'addEffect', effect: { type: 'stun', duration: 2 } }, { op: 'addEffect', effect: { type: 'slow', percent: 0.6, duration: 4 } }, { op: 'rename', name: '冰陨坠落' }] },
  ], 'mage'), look: { main: 0x1a3a5a, glow: 0x9fe8ff }, since: 'v0.6.6', from: 'relic_frostheart' },
];

export const darkFor = (raid: RaidId, cls: string) => DARK_ITEMS.filter(d => d.raid === raid && (!d.cls || d.cls === cls));
/** 拓印能刻到哪类部位：武器（单手 / 双手）互通，饰品按原部位 */
export const engraveFits = (darkSlot: ItemDef['slot'], slot: ItemDef['slot']) =>
  (darkSlot === 'oneHand' || darkSlot === 'twoHand') ? (slot === 'oneHand' || slot === 'twoHand') : darkSlot === slot;
export const DARK_EXCHANGE = 50;

/** v0.5.0-c 存档迁移：B 的暗金典藏 id → 主线暗金 id（断岳 → 裂地者、星烬 → 炎誓法杖：同部位同职业、主题相近） */
export const RELIC_TO_DARK: Record<string, string> = {
  relic_sunder: 'd_rifter', relic_starember: 'd_oathstaff', relic_bloodoath: 'd_bloodoath', relic_voidscale: 'd_voidscale', relic_abyss: 'd_abyss', relic_frostheart: 'd_icemeteor',
};
