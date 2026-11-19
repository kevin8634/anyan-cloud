// ========== 统一存档（引擎无关） ==========
// 背包、等级、天赋、任务放进一个对象，带版本号；存储后端可换（浏览器 localStorage / 微信 wx.setStorageSync / 云存档）
import { InventorySave, migrateInventoryV3 } from './Inventory';
import { LootData } from './Loot';
import { migrateDurability } from './Durability';
import { LevelSave, TalentSave } from './TalentTree';
import { QuestSave } from './Quest';

export const SAVE_VERSION = 10;   // v10（v0.7.7）：天赋树 2.0，天赋全部返还
// (旧) SAVE_VERSION = 9;   // v9（主线 v0.6.6 = v0.6.6-br.A + v0.5.0-c）：B 的暗金典藏 → A 的暗金（品质 dark）、典藏残片 / 保护符折算、特殊属性标记 ✦→✧、任务链取消；A 分支的 raid / dgx / 部位强化字段本来就是可选的； v8（v0.5 C）：装备锁定、兑换每周限购、兑换货币与强化保护符（堆叠物品）；v7（v0.5 B）：套装保底、典藏任务链；v6（v0.5 A）：装备耐久度、副本最高通关难度   // v2：职业 classId、可堆叠物品（材料/药水）、装备强化等级；v3：16 个穿戴格、双手/副手、护甲类型、二级属性；v4：三系专精天赋（旧天赋全部退点）、满级 20

export interface GameSave {
  version: number;
  savedAt: number;
  inventory: InventorySave;
  level: LevelSave;
  talents: TalentSave;
  quests: QuestSave;
  /** 职业 id（warrior / mage）；v1 存档没有，视为战士 */
  classId?: string;
  /** 待显示的一次性提示（如 v3→v4 天赋重置），游戏读档后显示一次并清空 */
  notices?: string[];
  /** 新手引导进度（第七版）：0~8 = 进行到第几步，-1 = 已完成或跳过；旧存档没有这个字段 */
  tutorial?: number;
  // ---- v5（阶段三）：一个角色一个存档
  /** 角色名 / 外观配色（0~2）/ 累计游戏时长（毫秒） */
  name?: string;
  look?: number;
  playMs?: number;
  /** 所在地图（camp / field / 副本 id）和位置；副本里存档读回来放在营地 */
  map?: string;
  pos?: { x: number; z: number };
  /** 掉落说明书：已获得过的装备（底材 id|品质、固定装备 id、传说特效 id） */
  codex?: string[];
  /** 精英等级（阶段六启用，先占位） */
  elite?: number;
  /** 阶段四：已开通的营地传送阵；仓库里的装备（所有营地连通） */
  waypoints?: string[];
  bank?: import('./Loot').ItemInstance[];
  /** 阶段六（v0.6 分支新增，可选）：长副本记录——通关次数、最快用时、本周首通、已见过的机制提示 */
  raid?: { clears: Record<string, number>; best: Record<string, number>; week: Record<string, number>; seen: string[]; tipsOff?: boolean; hell?: Record<string, number>; chal?: Record<string, number> };
  /** v0.6.4：普通副本各难度的最佳用时 / 最好奖牌（键 `副本id|难度`） */
  dgx?: { best: Record<string, number>; medal: Record<string, string> };
  /** v6（v0.5 A）：每个副本通关过的最高难度（0 普通 / 1 英雄 / 2 史诗 / 3 噩梦）；上次选择的难度。v0.6.6 起难度由 dungeonplus 管，这两个字段只读（说明书显示历史最高） */
  dungeonBest?: Record<string, number>;
  dungeonDiff?: string;
  /** v7（v0.5 B）：套装保底（见过的部件 id、连续多少次 Boss 没出新部件）；典藏任务链进度 */
  setPity?: { dry: number; seen: string[] };
  /** v7（v0.5 B）典藏任务链：v9 起取消（暗金改走 A 的碎片兑换），迁移时删除 */
  relicChain?: { step: number; rounds: number };
  /** v8（v0.5 C）：铁匠兑换的每周限购（ISO 周 + 本周已兑换次数）。兑换货币、强化保护符在 inventory.stacks 里；锁定在每件装备的 locked 上 */
  exchange?: { week: string; used: Record<string, number> };
  /** v0.6.8（可选）：技能书 —— 学会的技能、各槽位装的技能、熟练度、装的符文、已送过自选书的等级 */
  skillbook?: import('./SkillBook').SkillBookSave;
  /** v0.7.4：已发现的纹语 */
  runewords?: string[];
  /** v0.7.7：3 套天赋页（talents = 当前页） */
  talentPages?: Record<string, number>[];
  talentPage?: number;
  /** v0.7.6 英灵传承：每职业一份 */
  spirits?: Record<string, import('./Spirits').SpiritSave>;
  /** v0.6.9：地图图例——野外 / 稀有首领击杀次数、已发现的稀有首领刷新点 */
  mapStats?: { kills?: Record<string, number>; rareSeen?: string[] };
  /** v0.9.3d 世界首领：下次出现的真实时间（毫秒）、每日首杀日期、击杀次数 */
  /** v0.9.3e 探索：登过的瞭望塔、普通宝箱下次刷新（毫秒）、隐藏宝箱开过的周、开过的宝箱、采集次数 */
  ex?: { towers: string[]; chests: Record<string, number>; hidden: Record<string, string>; opened: string[]; gathered: number };
  /** v0.9.3f 区域声望：各区域点数、按周限购记录、一次性兑换 */
  rep?: { pts: Record<string, number>; buys: Record<string, { w: string; n: number }>; once: string[] };
  wboss?: { next: Record<string, number>; day: Record<string, string>; kills: Record<string, number> };
  /** 校验和：除 sum 以外内容的哈希；读到对不上 = 存档损坏 */
  sum?: string;
}

/** 字符串哈希（FNV-1a 32 位，够用来发现截断/改坏） */
export function hashText(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const sumOf = (s: GameSave) => { const { sum: _s, ...rest } = s; void _s; return hashText(JSON.stringify(rest)); };

/** 读档结果：none = 没有存档；ok = 正常；recovered = 主存档坏了，从备份读回；corrupt = 主存档和备份都坏了（绝不能自动覆盖） */
export type LoadStatus = 'none' | 'ok' | 'recovered' | 'corrupt';
export interface LoadResult { status: LoadStatus; save: GameSave | null; from?: string; raw?: string; }
/** 备份份数；两份备份之间至少隔多久才轮换（毫秒） */
export const BACKUP_COUNT = 3;
export const BACKUP_SPACING = 5 * 60 * 1000;

export const TALENT_RESET_NOTICE = '天赋已重置，请重新分配';

export interface SaveStorage { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void; /** 可选：列出所有 key（角色列表损坏时用来重建） */ keys?(): string[]; }

export class SaveManager {
  /** lootData：v2→v3 迁移时按新底材给老装备补二级属性（可不传） */
  constructor(private storage: SaveStorage, private key = 'rpg_save', private lootData?: LootData) {}

  /** 每个职业一个存档位：战士沿用旧 key（兼容老存档），其它职业加后缀 */
  static slotKey(base: string, classId: string) { return classId === 'warrior' ? base : `${base}_${classId}`; }

  /** 兼容旧接口：没有存档或读不出来都返回 null（新代码请用 loadResult 区分「没有」和「坏了」） */
  load(): GameSave | null { return this.loadResult().save; }

  /** 解析一份存档文本：JSON 坏了、缺关键字段、校验和对不上都算坏 */
  static parse(raw: string | null): GameSave | null {
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as GameSave;
      if (!s || typeof s !== 'object' || !s.inventory || !s.level) return null;
      if (s.sum && s.sum !== sumOf(s)) return null;
      return s;
    } catch { return null; }
  }

  backupKey(i: number) { return `${this.key}_bak${i}`; }

  loadResult(): LoadResult {
    const raw = this.storage.get(this.key);
    const main = SaveManager.parse(raw);
    if (main) return { status: 'ok', save: this.migrate(main), from: this.key };
    // 主存档没有或坏了：按新旧顺序找备份
    for (let i = 1; i <= BACKUP_COUNT; i++) {
      const b = SaveManager.parse(this.storage.get(this.backupKey(i)));
      if (b) {
        if (raw) this.storage.set(`${this.key}_corrupt`, raw);   // 坏掉的原文另存一份，方便排查
        return { status: 'recovered', save: this.migrate(b), from: this.backupKey(i), raw: raw ?? undefined };
      }
    }
    if (raw) { this.storage.set(`${this.key}_corrupt`, raw); return { status: 'corrupt', save: null, raw }; }
    return { status: 'none', save: null };
  }

  /** 写存档；写之前按间隔把上一份正常的主存档轮换进备份（bak1 最新） */
  save(s: Omit<GameSave, 'version' | 'savedAt'>, now = Date.now()) {
    const prev = SaveManager.parse(this.storage.get(this.key));
    if (prev) {
      const b1 = SaveManager.parse(this.storage.get(this.backupKey(1)));
      if (!b1 || now - (b1.savedAt ?? 0) >= BACKUP_SPACING) {
        for (let i = BACKUP_COUNT; i > 1; i--) { const v = this.storage.get(this.backupKey(i - 1)); if (v) this.storage.set(this.backupKey(i), v); }
        this.storage.set(this.backupKey(1), JSON.stringify(prev));
      }
    }
    const out: GameSave = { ...s, version: SAVE_VERSION, savedAt: now } as GameSave;
    delete out.sum;
    out.sum = sumOf(out);
    const text = JSON.stringify(out);
    this.storage.set(this.key, text);
    return text;
  }

  clear() { this.storage.remove(this.key); for (let i = 1; i <= BACKUP_COUNT; i++) this.storage.remove(this.backupKey(i)); this.storage.remove(`${this.key}_corrupt`); }

  /** 以后存档结构变化时在这里升级旧存档 */
  migrate(s: GameSave): GameSave {
    if (!s.version) s.version = 1;
    if (s.version < 2) {
      s.classId = s.classId ?? 'warrior';
      s.inventory.stacks = s.inventory.stacks ?? {};
      s.version = 2;
    }
    if (s.version < 3) {
      migrateInventoryV3(s.inventory, s.classId ?? 'warrior', this.lootData);
      s.version = 3;
    }
    if (s.version < 4) {
      // 单树天赋 → 三系专精：旧天赋 id 全部作废，点数全退（等级、经验保留，点数 = 等级-1 自动返还）
      const had = Object.values(s.talents ?? {}).some(v => v > 0);
      s.talents = {};
      if (had || (s.level?.level ?? 1) > 1) s.notices = [...(s.notices ?? []), TALENT_RESET_NOTICE];
      s.version = 4;
    }
    if (s.version < 5) {
      // 一个角色一个存档：补角色名、外观、时长、掉落说明书（名字由角色列表迁移时给）
      s.playMs = s.playMs ?? 0;
      s.look = s.look ?? 0;
      s.codex = s.codex ?? [];
      s.elite = s.elite ?? 0;
      s.version = 5;
    }
    if (s.version < 6) {
      // 耐久度：老装备（身上、背包、旧版角色存档里的仓库）全部补成 100
      migrateDurability([...Object.values(s.inventory.equipped ?? {}), ...(s.inventory.bag ?? []), ...(s.bank ?? [])]);
      s.dungeonBest = s.dungeonBest ?? {};
      s.version = 6;
    }
    if (s.version < 7) {
      // 套装保底：老存档里已获得过的套装件（掉落说明书记录 + 身上/背包/仓库）算「见过」；典藏任务链从头开始
      const names = new Set<string>((s.codex ?? []).filter(k => k.startsWith('fixed|')).map(k => k.slice(6)));
      const items = [...Object.values(s.inventory.equipped ?? {}), ...(s.inventory.bag ?? []), ...(s.bank ?? [])].filter(Boolean) as import('./Loot').ItemInstance[];
      items.forEach(i => { if (i.setId) names.add(i.name); });
      const fixed = this.lootData?.fixedItems ?? [];
      for (const i of items) if (i.setId && !i.fixedId) { const f = fixed.find(x => x.name === i.name); if (f) i.fixedId = f.id; }
      s.setPity = s.setPity ?? { dry: 0, seen: fixed.filter(f => names.has(f.name)).map(f => f.id) };
      s.relicChain = s.relicChain ?? { step: 0, rounds: 0 };
      s.version = 7;
    }
    if (s.version < 8) {
      // 铁匠改版：装备不能出售了，老装备的 sellPrice 留着（商店货架定价、分解金币都不读它，缺了补 0 也安全）；
      // 锁定字段只认 true；兑换限购从本周开始；堆叠物品表补齐（兑换货币 / 保护符第一次获得时才出现）
      const items = [...Object.values(s.inventory.equipped ?? {}), ...(s.inventory.bag ?? []), ...(s.bank ?? [])].filter(Boolean) as import('./Loot').ItemInstance[];
      for (const it of items) {
        if (typeof it.sellPrice !== 'number' || !isFinite(it.sellPrice)) it.sellPrice = 0;
        if (it.locked !== true) delete it.locked;
      }
      s.inventory.stacks = s.inventory.stacks ?? {};
      for (const [k, v] of Object.entries(s.inventory.stacks)) if (typeof v !== 'number' || !(v > 0)) delete s.inventory.stacks[k];
      s.exchange = s.exchange ?? { week: '', used: {} };
      s.version = 8;
    }
    if (s.version < 9) {
      // 主线 v0.6.6：两条分支合流。v0.6.x-br.A 的存档版本号还是 5（分支不升版本），上面 v6~v8 已经补了耐久 / 保底 / 锁定；
      // 这里处理 v0.5.0-c 的暗金典藏和被取消的系统
      migrateV9(s, this.lootData);
      s.version = 9;
    }
    if (s.version < 10) {
      // v0.7.7 天赋树 2.0：10 级开放、终极天赋移到第 6 层、资源节点、3 套天赋页 —— 旧加点全部返还
      const had = Object.values(s.talents ?? {}).some(v => v > 0);
      s.talents = {}; delete s.talentPages;
      if (had) s.notices = [...(s.notices ?? []), TALENT2_NOTICE];
      s.version = 10;
    }
    return s;
  }
}

/** v0.5.0-c 暗金典藏 id → 主线暗金 id（与 data/darkgold.ts RELIC_TO_DARK 相同；core 不依赖 data，这里抄一份） */
export const TALENT2_NOTICE = '天赋树 2.0：10 级开放天赋，终极天赋移到第 6 层，新增资源天赋和 3 套天赋页。你的天赋点已全部返还，按 N 重新分配。';
export const RELIC_TO_DARK_IDS: Record<string, string> = {
  relic_sunder: 'd_rifter', relic_starember: 'd_oathstaff', relic_bloodoath: 'd_bloodoath', relic_voidscale: 'd_voidscale', relic_abyss: 'd_abyss', relic_frostheart: 'd_icemeteor',
};
/** 折算：1 枚典藏残片 = 8 暗金碎片（B：6 残片 + 300 金换一件；A：50 碎片换一件）；1 枚强化保护符 = 100 金（B 的金币价格） */
export const RELIC_SHARD_TO_DARKSHARD = 8;
export const CHARM_REFUND_GOLD = 100;
export const V9_NOTICE = '版本整合：暗金典藏已并入暗金（可拓印）；典藏残片折成暗金碎片，强化保护符退还金币（强化不再掉级）';

/** 把一件 v0.5.0-c 的装备改成主线格式（暗金典藏 → 暗金；✦ 特殊属性 → ✧） */
export function migrateItemV9(it: import('./Loot').ItemInstance & { relic?: string; rerolls?: number }, lootData?: LootData): boolean {
  let changed = false;
  if ((it.quality as string) === 'darkgold' || it.relic) {
    const darkId = (it.relic && RELIC_TO_DARK_IDS[it.relic]) || it.fixedId;
    const def = lootData?.fixedItems.find(f => f.id === darkId);
    it.quality = 'dark';
    delete it.noSalvage;
    if (def) {
      it.fixedId = def.id; it.name = def.name;
      // 去掉旧的典藏效果修饰器和「◆」行，换成暗金的固定效果（id 规则同 LootGenerator.applyFixed）
      it.modifiers = it.modifiers.filter(m => !(it.relic && m.id.endsWith(`:${it.relic}`)) && !def.modifiers.some(d => m.id === `${it.id}:${d.id}`));
      it.lines = it.lines.filter(l => !l.startsWith('◆'));
      def.modifiers.forEach((m, i) => { it.modifiers.push({ ...m, id: `${it.id}:${m.id}` }); it.lines.splice(i, 0, `❖ ${m.desc}`); });
    }
    delete it.relic;
    changed = true;
  }
  if (it.lines.some(l => l.startsWith('✦ ') && !l.startsWith('✦ 拓印'))) { it.lines = it.lines.map(l => l.startsWith('✦ ') && !l.startsWith('✦ 拓印') ? '✧ ' + l.slice(2) : l); changed = true; }
  delete it.rerolls;
  return changed;
}

function migrateV9(s: GameSave, lootData?: LootData) {
  const items = [...Object.values(s.inventory.equipped ?? {}), ...(s.inventory.bag ?? []), ...(s.bank ?? [])].filter(Boolean) as import('./Loot').ItemInstance[];
  let touched = false;
  for (const it of items) if (migrateItemV9(it, lootData)) touched = true;
  const st = s.inventory.stacks ?? (s.inventory.stacks = {});
  if (st.mat_relic) { st.mat_darkshard = (st.mat_darkshard ?? 0) + st.mat_relic * RELIC_SHARD_TO_DARKSHARD; delete st.mat_relic; touched = true; }
  if (st.charm_protect) { s.inventory.gold += st.charm_protect * CHARM_REFUND_GOLD; delete st.charm_protect; touched = true; }
  // 掉落说明书：B 的 relic|id 记录改成 A 的暗金记录（A 的写法：dark|id）
  if (s.codex) s.codex = s.codex.map(k => k.startsWith('relic|') && RELIC_TO_DARK_IDS[k.slice(6)] ? `dark|${RELIC_TO_DARK_IDS[k.slice(6)]}` : k);
  if (s.relicChain) { if (s.relicChain.step > 0 || s.relicChain.rounds > 0) touched = true; delete s.relicChain; }
  if (touched) s.notices = [...(s.notices ?? []), V9_NOTICE];
}
