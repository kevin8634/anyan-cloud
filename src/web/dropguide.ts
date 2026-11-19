// 掉落说明书（阶段三）：直接从掉落表生成，以后加装备、加副本、加掉落表都会自动出现
//   来源 → 能掉的装备（按职业过滤）、可能的品质、掉率档位（常见/少见/稀有/极稀有）
import { LootData, LootTable, Quality, QUALITIES, ItemBase } from '../core/Loot';
import { ItemSlot } from '../core/Loadout';
import { classSet, RAID_SET_CHANCE } from '../data/sets';
import { DL_BOSSES } from '../data/dungeon_loot';
import { RAIDS } from '../data/raids';
import { LOOT_TABLES } from '../data/loot';
/** v0.9.3h 副本首领的说明书来源（每个首领一页，读 dl_* 独立表） */
function DL_SOURCES(): GuideSource[] {
  const out: GuideSource[] = [];
  for (const d of ['sand_tomb', 'troll_cave', 'ash_forge', 'molten_throne', 'frost_crypt'] as const) {
    const r = RAIDS[d], raid = d === 'molten_throne' || d === 'frost_crypt', n = DL_BOSSES[d];
    for (let i = 0; i < n; i++) out.push(raid
      ? { id: `dl_${d}_${i}`, group: '长副本', name: `${r.name} · ${r.bosses[i].name}`, sub: `首领 ${i + 1}/${n}${i === n - 1 ? ' · 最终首领' : ''}`, table: `dlg_${d}_${i}`, raid: true, boss: true,
        desc: `只掉套装和橙装：本职业套装部件 35%（炼狱 90%，带保底）· 本首领独特橙装 18%（炼狱 50%）· 全副本共享橙装 12%（炼狱 36%，2 件随机 1）；三样都没出时保底 1 件套装或共享橙装。${i === n - 1 ? '尾王另有暗金 5%（炼狱 10%，每周首通翻倍）。' : ''}` }
      : { id: `dl_${d}_${i}`, group: '30 级副本', name: `${r.name} · ${r.bosses[i].name}`, sub: `首领 ${i + 1}/${n}${i === n - 1 ? ' · 最终首领' : ''}`, table: `dl_${d}_${i}`, dungeon: true, raid: false, boss: true,
        desc: `专属 3 件各 20%，全副本共享件各 6%${i === n - 1 ? '，副本专属传说 10%' : ''}；另保底 1 件随机史诗；长副本退下来的命名装备各 0.3%。` });
    if (!raid) out.push({ id: `dl_${d}_hidden`, group: '30 级副本', name: `${r.name} · 隐藏首领 ${r.bosses[n]?.name ?? ''}`, sub: '满足条件才出现', table: `dl_${d}_hidden`, dungeon: true, boss: true, desc: '和最终首领同一张表，另外必掉唯一外观件。' });
  }
  return out;
}

export interface GuideSource { id: string; group: string; name: string; sub: string; table: string; desc?: string; /** v0.5：普通副本（等级同步 + 四档难度掉落规则） */ dungeon?: boolean; /** 主线 v0.6.6：长副本首领（职业套装部件） */ raid?: boolean; /** v0.5 B：副本 Boss（套装部件 / 暗金典藏的来源） */ boss?: boolean; }
/** 来源列表：分组 → 来源 → 掉落表 id。新地图 / 新副本加一行即可 */
export const GUIDE_SOURCES: GuideSource[] = [
  { id: 'camp', group: '野外', name: '灰石营地 · 狼林', sub: '1~6 级野怪', table: 'trash' },
  { id: 'field', group: '野外', name: '翠风原野', sub: '9~16 级野怪', table: 'trash_field', desc: '小怪偶尔掉肩甲、披风、护腕、腰带和首饰。' },
  { id: 'field_elite', group: '野外', name: '精英「赤鬃 · 劫掠头目」', sub: '劫掠者营地巡逻', table: 'elite_field', desc: '保底一件精良 + 一件史诗，10% 传说；专属特效件：赤鬃獠牙项链 / 劫掠者披风 / 头目的战利品戒指。' },
  { id: 'field_rare', group: '野外', name: '稀有「金鬃野猪」', sub: '三个刷新点随机出现', table: 'rare_field', desc: '保底史诗首饰或披风，20% 传说。' },
  { id: 'star', group: '野外', name: '星落高原', sub: '16~20 级野怪', table: 'trash_star' },
  { id: 'star_elite', group: '野外', name: '精英「坠星者 · 欧兰」', sub: '星落高原中央游荡', table: 'elite_star', desc: '保底精良 + 史诗，10% 传说。' },
  { id: 'star_rare', group: '野外', name: '稀有「星辉麋鹿」', sub: '星落高原三处随机出现', table: 'rare_star' },
  { id: 'wb_moss', group: '野外', name: '世界首领「苔石」', sub: '星落高原 · 古树石环 · 30 分钟', table: 'wb_moss', desc: '专属橙装：苔石之种 / 古树根须披风；精魄 10 个保底一件。' },
  { id: 'wb_worm', group: '野外', name: '世界首领「萨卡尔」', sub: '赤砂裂谷 · 流沙坑 · 45 分钟', table: 'wb_worm', desc: '专属橙装：巨蠕甲晶护符 / 流沙之握；精魄 10 个保底一件。' },
  { id: 'wb_yurg', group: '野外', name: '世界首领「尤尔格」', sub: '霜脊高地 · 冰湖 · 45 分钟', table: 'wb_yurg', desc: '专属橙装：骨猛犸号角 / 尤尔格的冰柱图腾；精魄 10 个保底一件。' },
  { id: 'wb_ash', group: '野外', name: '世界首领「炽翼」', sub: '烬落荒原 · 火山口 · 60 分钟', table: 'wb_ash', desc: '专属橙装：炽翼之心 / 灰烬龙鳞披风；熔岩喷发平息后必刷。' },
  { id: 'redsand', group: '野外', name: '赤砂裂谷', sub: '20~23 级野怪', table: 'trash_redsand' },
  { id: 'redsand_elite', group: '野外', name: '精英「沙暴之主 · 卡鲁」', sub: '赤砂裂谷中央游荡', table: 'elite_redsand', desc: '保底精良 + 史诗，12% 传说；专属特效件：卡鲁的沙漏 / 沙暴斗篷 / 蝎尾指环。' },
  { id: 'redsand_rare', group: '野外', name: '稀有「琥珀蝎王」', sub: '赤砂裂谷三处随机出现', table: 'rare_redsand' },
  { id: 'frost', group: '野外', name: '霜脊高地', sub: '22~25 级野怪', table: 'trash_frost' },
  { id: 'frost_elite', group: '野外', name: '精英「霜牙 · 狼王」', sub: '霜脊高地中央游荡', table: 'elite_frost', desc: '保底精良 + 史诗，13% 传说；专属特效件：狼王之牙 / 霜鬃披风 / 狼群图腾。' },
  { id: 'frost_rare', group: '野外', name: '稀有「白鬃巨猪」', sub: '霜脊高地三处随机出现', table: 'rare_frost' },
  { id: 'ember', group: '烬落荒原', name: '荒原野怪', sub: '25~30 级', table: 'trash_ember' },
  { id: 'ember_elite', group: '烬落荒原', name: '精英「熔核巨像 · 炽心」', sub: '烬落荒原游荡', table: 'elite_ember', desc: '保底精良 + 史诗，16% 传说；专属特效件：熔核 / 炽心护符 / 巨像碎片戒指。' },
  { id: 'ember_elite2', group: '烬落荒原', name: '精英「灰烬祭司长 · 赛勒」', sub: '烬落荒原', table: 'elite_ember2', desc: '保底精良 + 史诗，16% 传说；专属特效件：灰烬祷言 / 祭司长的余烬 / 灰烬之袍。' },
  { id: 'ember_rare', group: '烬落荒原', name: '稀有「黑曜蝎王」', sub: '荒原边缘随机出现', table: 'rare_ember' },
  { id: 'ember_event', group: '烬落荒原', name: '世界事件「熔岩喷发」', sub: '熔岩裂谷，约 5 分钟一次', table: 'event_ember', desc: '三波全部击杀：保底史诗，10% 传说。' },
  { id: 'mine_trash', group: '暗岩矿洞', name: '矿洞小怪', sub: '暗岩矿洞 · 等级同步', table: 'trash', dungeon: true, desc: '30 级起可选英雄 / 史诗 / 噩梦（等级同步，满级装等 普通 40 · 英雄 42 · 史诗 44 · 噩梦 46）。' },
  { id: 'mine_foreman', group: '暗岩矿洞', name: '前置首领 矿道工头 · 巴克', sub: '暗岩矿洞 · 塌方隧道', table: 'boss_foreman', dungeon: true, boss: true, desc: '保底精良；专属 3 件各 20%：工头的风灯 / 巴克的皮护肩 / 断柄十字镐。' },
  { id: 'mine_boss', group: '暗岩矿洞', name: 'Boss 监工格罗克', sub: '暗岩矿洞最终首领', table: 'boss_grok', dungeon: true, boss: true, desc: '保底精良 + 史诗；专属 3 件各 20%、共享 2 件各 6%、专属传说「矿脉之心」10%；史诗 / 噩梦首领掉兑换货币（暗岩徽记 + 余烬或碎晶）。' },
  { id: 'swamp_trash', group: '腐沼神殿', name: '神殿小怪', sub: '腐沼神殿 · 等级同步', table: 'trash_swamp', dungeon: true, desc: '30 级起可选英雄 / 史诗 / 噩梦（等级同步，满级装等 普通 40 · 英雄 42 · 史诗 44 · 噩梦 46）。' },
  { id: 'swamp_boss', group: '腐沼神殿', name: 'Boss 腐根祭司', sub: '腐沼神殿最终首领', table: 'boss_rotroot', dungeon: true, boss: true, desc: '保底两件史诗，15% 传说；专属 3 件各 20%、共享 2 件各 6%、专属传说「腐根之种」10%；史诗 / 噩梦首领掉兑换货币（暗岩徽记 + 余烬或碎晶）。' },
  { id: 'raid_boss', group: '长副本', name: '熔心王座 / 永霜墓穴 · 路线宝箱', sub: '30 级长副本（满级装等 普通 50 · 炼狱 60）', table: 'raid_boss', desc: '路线上的宝箱按这张表开。首领只掉套装和橙装，见下面每个首领；首领另给熔心余烬 / 永霜碎晶 + 暗岩徽记、暗金碎片。' },
  // v0.8.1.1：补上 30 级三座普通副本、长副本最终首领和暗岩深渊
  { id: 'dg3_trash', group: '30 级副本', name: '沙葬王陵 / 巨魔冰窟 / 灰烬铸造厂 小怪', sub: '30 级普通副本 · 四档难度', table: 'dg_trash', dungeon: true, desc: '满级装等：普通 40 · 英雄 42 · 史诗 44 · 噩梦 46。' },
  // v0.9.3h 副本专属掉落：每个首领一张独立表（专属 3 件 + 全副本共享 + 最终首领传说 10%）
  ...DL_SOURCES(),
  { id: 'abyss', group: '终局', name: '暗岩深渊 · 5 / 10 / 15 层首领', sub: '30 级 · 任意传送阵 → 终局', table: 'aby_boss_g', desc: '深渊不再掉紫装：普通层只给金币、魔尘 / 星辉碎片 / 精魄和深渊碎片；5 / 10 / 15 层首领必掉 3 件不重复的深渊橙装（本职业 6 件池）+ 暗金碎片 3 / 6 / 9。装等每 5 层一档：40 · 45 · 50 · 55。深渊碎片 20 片可在铁匠「淬炼」页重铸暗金。' },
  { id: 'abyss_top', group: '终局', name: '暗岩深渊 · 20 层尾王', sub: '通关 20 层', table: 'aby_top_g', desc: '必掉 3 件顶级橙装（本职业 4 件池里不重复抽 3）+ 暗金碎片 12；结算页从本职业全部暗金里自选 1 件；第 10 层另有一次结算，从本职业套装部件里自选 1 件（都可重复领取）。' },
];

export type RateTier = 1 | 2 | 3 | 4;
export const RATE_NAME: Record<RateTier, string> = { 1: '常见', 2: '少见', 3: '稀有', 4: '极稀有' };
/** 单件的期望掉率 → 档位 */
export function rateTier(p: number): RateTier { return p >= 0.15 ? 1 : p >= 0.05 ? 2 : p >= 0.015 ? 3 : 4; }

export interface GuideItem {
  key: string;                 // 收集用的 key（底材 id / fixed|名字 / lg|名字）
  kind: 'base' | 'fixed' | 'legendary' | 'set';
  name: string; slot: ItemSlot; baseId: string;
  qualities: Quality[];        // 这个来源能出的品质
  p: number;                   // 每次击杀掉这一件（任意品质）的大致概率
  rate: RateTier;
  setId?: string; desc?: string; since?: string;
  /** v0.5 B：套装名 */
  setName?: string;
}

const forClass = <T extends { cls?: string }>(xs: T[], cls: string) => xs.filter(x => !(x as { noDrop?: boolean }).noDrop && (!x.cls || x.cls === cls));   // 11-05 退役底材不列

/** 某个掉落表对某职业能掉什么 */
export function guideItems(table: LootTable, data: LootData, cls: string): GuideItem[] {
  const out = new Map<string, GuideItem>();
  const bases = forClass(data.bases, cls) as ItemBase[];
  const weights = data.qualityWeights;
  for (const e of table.entries) {
    if (e.kind === 'lg') {   // v0.9.6a 指定橙装
      const lg = data.legendaries.find(l => l.id === e.lgId); if (!lg || (lg.cls && lg.cls !== cls)) continue;
      const k = `lg|${lg.name}`, prev = out.get(k), b = bases.find(x => lg.slots.includes(x.slot));
      out.set(k, { key: k, kind: 'legendary', name: lg.name, slot: lg.slots[0], baseId: b?.id ?? '', qualities: ['orange'], p: (prev?.p ?? 0) + e.chance, rate: 1, desc: [lg.modifier, ...(lg.extra ?? [])].filter(m => !m.cls || m.cls === cls).map(m => m.desc).join('；') });
      continue;
    }
    if (e.kind === 'fixed') {
      const def = data.fixedItems.find(f => f.id === e.itemId); if (!def) continue;
      const base = data.bases.find(b => b.id === def.baseId);
      if (base?.cls && base.cls !== cls && !def.adapt) continue;   // v0.9.3h 副本专属件按职业换底材，四职业都列
      const k = `fixed|${def.name}`;
      const prev = out.get(k);
      out.set(k, { key: k, kind: 'fixed', name: def.name, slot: def.slot, baseId: def.baseId, qualities: [def.quality], p: (prev?.p ?? 0) + e.chance, rate: 1, setId: def.setId, desc: def.modifiers.map(m => m.desc).filter(Boolean).join('；') });
      continue;
    }
    const pool = bases.filter(b => !e.slots || e.slots.includes(b.slot));
    if (!pool.length) continue;
    const minI = QUALITIES.indexOf(e.minQuality ?? 'green');
    const qs = QUALITIES.filter((q, i) => i >= minI && (weights[q] ?? 0) > 0);
    for (const b of pool) {
      const k = b.id;
      const prev = out.get(k);
      const qset = new Set([...(prev?.qualities ?? []), ...qs]);
      out.set(k, { key: k, kind: 'base', name: b.name, slot: b.slot, baseId: b.id, qualities: QUALITIES.filter(q => qset.has(q)), p: (prev?.p ?? 0) + e.chance / pool.length, rate: 1, since: b.since });
    }
    // 能出橙装：列出这个职业能出现的传说特效
    if (qs.includes('orange')) {
      const tot = qs.reduce((a, q) => a + (weights[q] ?? 0), 0);
      const pOrange = e.chance * ((weights.orange ?? 0) / tot);
      for (const lg of forClass(data.legendaries, cls)) {
        if (!lg.slots.some(s => pool.some(b => b.slot === s))) continue;
        const k = `lg|${lg.name}`;
        const prev = out.get(k);
        const n = forClass(data.legendaries, cls).length;
        out.set(k, { key: k, kind: 'legendary', name: lg.name, slot: lg.slots[0], baseId: pool.find(b => lg.slots.includes(b.slot))?.id ?? pool[0].id, qualities: ['orange'], p: (prev?.p ?? 0) + pOrange / n, rate: 1, desc: `${lg.kind ? `〔${lg.kind}〕` : ''}${[lg.modifier, ...(lg.extra ?? [])].filter(m => !m.cls || m.cls === cls).map(m => m.desc).join('；')}${lg.cls ? '' : '（多职业：按职业生效）'}` });
      }
    }
  }
  const list = [...out.values()];
  list.forEach(i => { i.rate = i.kind === 'fixed' ? rateTier(i.p * 0.6) : rateTier(i.p); });
  const kindOrder = { legendary: 1, set: 2, fixed: 2, base: 3 };
  return list.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.rate - b.rate || a.name.localeCompare(b.name));
}

/** 整本说明书里这个职业能收集的条目（去重）：用于「收集进度」 */
export function allCollectibles(tables: Record<string, LootTable>, data: LootData, cls: string): Set<string> {
  const s = new Set<string>();
  for (const src of GUIDE_SOURCES) { const t = tables[src.table]; if (t) guideItems(t, data, cls).forEach(i => s.add(i.key)); if (src.raid) raidSetExtras(src, cls, data).forEach(i => s.add(i.key)); }
  return s;
}
/** 收集判定：底材任意品质拿到过就算；固定装备 / 传说按名字 */
export function collected(codex: Set<string>, key: string): Quality[] | boolean {
  if (key.startsWith('fixed|') || key.startsWith('lg|')) return codex.has(key);
  return QUALITIES.filter(q => codex.has(`${key}|${q}`));
}

/** v0.5：普通副本的掉落表按难度规则显示——随机装备至少精良（蓝） */
export function dungeonGuideTable(t: LootTable): LootTable {
  const blue = QUALITIES.indexOf('blue');
  return { ...t, entries: t.entries.map(e => e.kind === 'random' ? { ...e, minQuality: QUALITIES[Math.max(blue, QUALITIES.indexOf(e.minQuality ?? 'green'))] } : e) };
}
/** 说明书顶部的副本难度 / 耐久度说明 */
export const DUNGEON_GUIDE_NOTE = '30 级以后进副本先选难度：英雄起等级同步到 30 级，满级掉落装等 普通 40 · 英雄 42 · 史诗 44 · 噩梦 46（30 级起所有掉落装等固定，暗金一律 70）；史诗 / 噩梦可立暗岩誓约；噩梦难度格罗克、腐根祭司各多一个机制。职业套装改在长副本首领掉落。';
export const DURABILITY_GUIDE_NOTE = '装备耐久：阵亡时身上每件装备 -10%，耐久 0 =「已损坏」（不会消失，但属性全部失效），任何铁匠或补给商都能修理。';

// ---------------- v0.5 B：职业套装部件（主线 v0.6.6 起从长副本首领掉落） ----------------
/** 长副本首领额外能掉的本职业套装部件（每件 ≈ 套装掉率 / 件数；不算保底）。数据直接读 data/sets.ts */
export function raidSetExtras(src: GuideSource, cls: string, data?: LootData): GuideItem[] {
  if (!src.raid) return [];
  const out: GuideItem[] = [];
  const set = classSet(cls);
  if (set) set.pieces.forEach((id, k) => {
    const def = data?.fixedItems.find(f => f.id === id);
    const p = RAID_SET_CHANCE.normal / set.pieces.length;
    out.push({ key: `fixed|${set.pieceNames[k]}`, kind: 'set', name: set.pieceNames[k], slot: def?.slot ?? 'chest', baseId: def?.baseId ?? '', qualities: ['purple'], p, rate: rateTier(p),
      setId: set.id, setName: set.name, since: def?.since ?? set.since, desc: `每个首领 ${Math.round(RAID_SET_CHANCE.normal * 100)}%（炼狱 ${Math.round(RAID_SET_CHANCE.hell * 100)}%）掉 1 件，含保底` });
  });
  return out;
}

// ---------------- v0.9.6d 战利品祭坛：来源物品缓存 / 反查 / 太古几率 / 地图定位 ----------------
let srcCache: { cls: string; m: Map<string, GuideItem[]> } | null = null;
/** 某来源对某职业的全部可掉物品（长副本首领含职业套装部件）；按职业缓存 */
export function srcItems(src: GuideSource, data: LootData, cls: string, tables: Record<string, LootTable> = LOOT_TABLES): GuideItem[] {
  if (!srcCache || srcCache.cls !== cls) srcCache = { cls, m: new Map() };
  let v = srcCache.m.get(src.id);
  if (!v) { const t = tables[src.table]; v = t ? guideItems(t, data, cls) : []; if (src.raid) v = [...raidSetExtras(src, cls, data), ...v]; srcCache.m.set(src.id, v); }
  return v;
}
/** 来源的太古几率（v0.9.6b：长副本炼狱每件 4%、深渊 20 层顶级橙装 6%、20 层结算自选 10%）；普通来源 null */
export function srcAncient(src: GuideSource): { p: number; note: string } | null {
  if (/^dl_(molten_throne|frost_crypt)_/.test(src.id)) return { p: 0.04, note: '炼狱难度每件 4%' };
  if (src.id === 'abyss_top') return { p: 0.06, note: '顶级橙装每件 6% · 结算自选 10%' };
  return null;
}
/** 单件物品在该来源的太古几率（只有橙装 / 套装 / 特效件能太古，随机底材不算） */
export function itemAncient(src: GuideSource, gi: GuideItem): number { const a = srcAncient(src); return a && gi.kind !== 'base' ? a.p : 0; }
/** 「这件在哪掉」反查：全部来源按掉率从高到低 */
export function whereDrops(key: string, data: LootData, cls: string): { src: GuideSource; gi: GuideItem }[] {
  const out: { src: GuideSource; gi: GuideItem }[] = [];
  for (const s of GUIDE_SOURCES) { const gi = srcItems(s, data, cls).find(i => i.key === key); if (gi) out.push({ src: s, gi }); }
  return out.sort((a, b) => b.gi.p - a.gi.p);
}
export type SrcLoc = { raid: string; boss: number } | { map: string } | null;
const WILD_LOC: [RegExp, string][] = [[/^camp/, 'camp'], [/^field/, 'field'], [/^(star|wb_moss)/, 'star'], [/^(redsand|wb_worm)/, 'redsand'], [/^(frost|wb_yurg)/, 'frost'], [/^(ember|wb_ash)/, 'ember']];
/** 来源 → 地图位置：副本首领 = 副本地图 + 选中首领；野外 = 区域地图；深渊没有固定位置 */
export function srcLocation(src: GuideSource): SrcLoc {
  const m = /^dl_(\w+?)_(\d+|hidden)$/.exec(src.id);
  if (m) { const r = RAIDS[m[1] as keyof typeof RAIDS]; return { raid: m[1], boss: m[2] === 'hidden' ? (r?.hidden?.room ?? DL_BOSSES[m[1] as keyof typeof DL_BOSSES]) : +m[2] }; }
  if (src.id === 'mine_foreman') return { raid: 'darkrock_mine', boss: 0 };
  if (src.id === 'mine_boss' || src.id === 'mine_trash') return { raid: 'darkrock_mine', boss: src.id === 'mine_boss' ? 1 : -1 };
  if (src.id.startsWith('swamp')) return { raid: 'rotting_temple', boss: src.id === 'swamp_boss' ? 0 : -1 };
  if (src.id === 'raid_boss') return { raid: 'molten_throne', boss: -1 };
  if (src.id === 'dg3_trash') return { raid: 'sand_tomb', boss: -1 };
  for (const [re, map] of WILD_LOC) if (re.test(src.id)) return { map };
  return null;
}
/** 副本地图里的首领 → 说明书来源 id（找不到返回 null） */
export function srcOfBoss(raid: string, boss: number): string | null {
  const hit = GUIDE_SOURCES.find(s => { const l = srcLocation(s); return !!l && 'raid' in l && l.raid === raid && l.boss === boss; });
  if (hit) return hit.id;
  return GUIDE_SOURCES.find(s => { const l = srcLocation(s); return !!l && 'raid' in l && l.raid === raid; })?.id ?? null;
}
