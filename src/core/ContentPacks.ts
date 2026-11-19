// ======================================================================
// v0.9.7 DLC 框架 d1.0：内容包注册表（引擎无关，core 不依赖 data / web）
//
// 规则
// - 本体只认这个注册表。DLC 的全部内容放在 src/dlc/<id>/，由 manifest.ts 描述，
//   由 src/dlc/<id>/boot.ts 在游戏主模块之前调用 installPack() 注册（是否注册由 Entitlement 决定）。
// - 本体在各数据表的定义 / 读取处调用 withPacks / withPackRecord 把包里的数据并进来；
//   没有任何包时这两个函数原样返回传入的表（同一个引用），代码路径和结果与没有框架时完全一样。
// - 数据表大多在模块加载时合并（定义处合并），所以包必须在数据模块求值之前注册；
//   registerPack 发现某个挂载点已经被读取过（已冻结）又有新包往里挂时会抛错，避免「注册太晚、悄悄不生效」。
// - 本文件只放通用词，不能出现任何具体 DLC 的名字 / 文本（本体纯净检查会搜）。
// ======================================================================

/** 区域（并进 data/world_map.ts 的 MAPS；字段同 MapDef，enter 是包自己的进入函数，框架阶段可以不填） */
export interface PackZone {
  id: string; name: string; kind: 'outdoor' | 'dungeon'; levels: string;
  view: { x0: number; z0: number; x1: number; z1: number }; desc: string;
  /** 进入该区域（读档回到这里 / 传送阵）。没有 = 该区域还不能进入，读档时按「未知区域」送回营地 */
  enter?: (at?: { x: number; z: number }) => boolean;
}
/** 传送阵入口（web/travel.ts 传送阵面板「终局」一节后面多一行） */
export interface PackWaypoint { id: string; name: string; desc: string; zone: string; locked?: () => string | null; go: () => void;
  /** v1.2.5：醒目标记（返回文字 = 名字旁边亮一个闪烁标签；null = 不显示） */
  badge?: () => string | null;
  /** v1.2.71（可选）：返回 true = 传送阵面板里暂不列出这个入口（如需要先完成剧情入口）；没有 = 一直列出 */
  hidden?: () => boolean }
/** v1.2.71 本体区域挂点（可选）：包往本体区域放 NPC / 造景 / 交互点。zone = 本体区域 id（目前支持 'world' = 灰石营地）；没有包 = 本体不变 */
export interface PackZoneNpc { id: string; zone: string; x: number; z: number; yaw: number; model: string; tint?: number; tintK?: number;
  /** id 不在本体 NPC 名表里时用这里的名字 / 头衔 */
  name?: string; title?: string }
export interface PackZoneBuildApi { add(obj: unknown, x: number, z: number, ry?: number): unknown; groundY(x: number, z: number): number; block?(x: number, z: number, r: number): void }
export interface PackZoneProp { zone: string; build(api: PackZoneBuildApi): void }
/** 交互点：玩家在 zone 内离 (x, z) 小于 r 时出现交互提示（[E] label），label 返回 null = 不显示 */
export interface PackInteract { zone: string; x: number; z: number; r: number; label(): string | null; act(): void }
/** 剧情钩子：本体在固定时机（at）调用；框架阶段只登记，本体还没有调用点（见 HANDOFF TODO） */
export interface PackStoryHook { id: string; at: string; run: (ctx: unknown) => void }
/** v0.9.9 运行时上下文：本体进入游戏后交给每个包的 bind(ctx)。包只能通过它碰本体运行时（不 import web 模块） */
export interface PackCtx {
  toast(msg: string, color?: string): void;
  level(): number;
  classId(): string;
  /** 当前所在区域 id */
  map(): string;
  /** 回灰石营地（包区域出错时的兜底） */
  toCamp(): void;
  /** 打开本体面板（行囊 / 角色 / 天赋……） */
  openPanel(id: string): void;
  /** 立即存档 */
  save(): void;
  /** v1.0.3：玩家当前世界坐标 */
  playerPos(): { x: number; z: number };
  /** v1.0.3：包给的移动速度倍率（1 = 不影响；包自己负责离开区域时还原） */
  setMoveMul(k: number): void;
  /** v1.0.3：在世界坐标掉一件随机装备（装等按玩家等级），minQuality 最低品质 */
  dropLoot(x: number, z: number, minQuality?: 'green' | 'blue' | 'purple' | 'orange'): void;
  /** v1.2.7：掉一件固定装备（PackManifest.items 里的 id；装等按玩家等级），返回物品名（找不到 = null） */
  dropFixed?(id: string, x: number, z: number, /** 11-18 成为太古的几率（缺省 0） */ anc?: number): string | null;
  /** 11-05（可选）：本职业天赋点数（天赋 id → 有效等级，0 = 没点）；DLC1 40 级套装终极天赋分支读时砂 / 炼金终极天赋用 */
  talentRank?(id: string): number;
  /** v1.0.3：任务状态（locked / available / active / ready / done） */
  questState(id: string): string;
  /** v1.0.5：把玩家移到世界坐标（同一区域内的传送，如镜面通道） */
  teleport(x: number, z: number): void;
  /** v1.0.3：屏幕中央大字提示（区域机制变化用） */
  yell(msg: string): void;
  /** v1.0.2：切换到某个区域（本体或包野外），at = 世界坐标，不填 = 该区域主营地；返回是否成功（等级不够会提示并返回 false） */
  goMap(map: string, at?: { x: number; z: number }, why?: string): boolean;
  /** v1.1.0（以下 6 个可选，老测试桩可以不填）：生成一个带机制的首领（BossBrain：红圈 / 读条 / 召唤 / 毒池 / 阶段，首领框）；同 key 已存在且死亡 = 复活，存活 = 不动。返回是否成功 */
  spawnBoss?(def: PackBossDef): boolean;
  /** v1.1.0：首领状态（none = 没生成 / alive / dead） */
  bossState?(key: string): 'none' | 'alive' | 'dead';
  /** raidA A5（可选）：首领实时信息（世界坐标、生命、正在读的技能名与进度、阶段序号）；没有 / 已死 = null */
  bossInfo?(key: string): { x: number; z: number; hp: number; max: number; cast: string | null; castP: number; phase: number } | null;
  /** raidA A5（可选）：读条免疫判定——首领读条结束时调用 f(技能名, 首领 key)，返回 true 则这次读条的伤害 / 效果不落到玩家身上；null = 取消 */
  castWard?(f: ((cast: string, boss: string) => boolean) | null): void;
  /** raidA A6（可选）：包接管玩家脚下高度（世界 y：升降梯平台 / 高架栈道）；null = 还原贴地。包自己负责离开区域时还原 */
  setLift?(y: number | null): void;
  /** raidA A7（可选）：镜头额外拉远（米，0 / null = 还原；本体限制 0–8）。包自己负责离开区域时还原 */
  camPull?(m: number | null): void;
  /** raidA A7（可选）：敌人打玩家的命中过滤（返回 false = 打不到）；null = 取消 */
  hitGuard?(f: ((src: { x: number; y: number; z: number; boss: boolean }) => boolean) | null): void;
  /** raidA A7（可选）：交互键（E / 交互按钮）提供者：每次本体查询当前可交互物时调用，返回 null = 没有；f 传 null = 取消 */
  interact?(f: (() => PackLiveInteract | null | false | undefined) | null): void;
  /** v1.1.0：移除首领（和它的召唤物） */
  removeBoss?(key: string): void;
  /** v1.1.0：全屏横幅（和稀有掉落同一套横幅组件）；theme 'dual' = 暗红 + 冷青双色；ms 持续毫秒 */
  banner?(o: { big: string; small?: string; line?: string; theme?: 'gold' | 'dual'; ms?: number }): void;
  /** v1.1.0：合成音效接口（同职业扩展 ClassSynthApi） */
  synth?(): import('./ClassExt').ClassSynthApi;
  /** v1.1.0：给经验（剧情奖励等） */
  addXp?(n: number): void;
  /** v1.1.1（以下可选）：金币余额 / 花金币（不够返回 false） */
  gold?(): number;
  spendGold?(n: number): boolean;
  addGold?(n: number): void;
  /** v1.1.1：按最大生命比例回血（0–1） */
  heal?(frac: number): void;
  /** v1.2.39c：给玩家背包加堆叠物品（材料 id 同 data/shop；返回是否成功） */
  addStack?(id: string, n: number): boolean;
  /** v1.2.40（可选，比赛版才有）：武器外观（Lux3D 武器库 / 运行时生成的 GLB 覆盖主手武器的外观，不改属性） */
  weaponSkin?: PackWeaponSkinApi;
  /** v1.2.48（可选）：强制背景音乐主题（如包自己的结局过场 'ending'），null = 取消，回到按场景选曲 */
  musicHold?(theme: 'ending' | null): void;
  /** v1.1.1：以玩家为中心的范围打击（伤害 = 玩家普攻伤害 × dmgK；可打断读条、眩晕普通敌人、施加易伤）；返回命中数 / 打断数 */
  strike?(o: PackStrike): PackStrikeResult;
  /** v1.1.1：推进任务目标（explore = 到达地点类、talk = 对话类），由包在自己的系统里达成条件时调用 */
  questEvent?(type: 'explore' | 'talk', id: string): void;
  /** v1.1.1：特效画笔（同职业扩展 ClassFxApi：粒子 / 光圈 / 法印 / 物体动画 / 震屏） */
  fx?(): import('./ClassExt').ClassFxApi;
  /** v1.1.1：已完成的任务（任务 id） */
  questDone?(id: string): boolean;
  /** v1.1.2（以下可选）：重建角色挂件（包的 dress 内容变了时调用；同换装时的重建） */
  redress?(): void;
  /** v1.1.2：按最大生命比例扣血（不致死，最少留 1 点） */
  drain?(frac: number): void;
  /** v1.1.2：玩家当前 / 最大生命 */
  hp?(): { hp: number; max: number };
  /** v1.2.15（以下可选）：某个技能槽当前的技能伤害（技能书预览，含天赋 / 装备修饰；slot = basic / skill1..4 / ultimate；没有 = 0） */
  skillDamage?(slot: string): number;
  /** v1.2.15：当前目标（世界坐标；没有目标 / 已死亡 = null） */
  target?(): { x: number; z: number; boss: boolean } | null;
  /** v1.2.15：给玩家护盾（最大生命比例，dur 秒） */
  shield?(frac: number, dur: number): void;
  /** v1.2.15：给玩家减伤 + 反弹（同盾墙：受到伤害 -reduce，把 reflect 比例反弹给攻击者，dur 秒） */
  guard?(reduce: number, reflect: number, dur: number): void;
  /** v1.2.15：位移到世界坐标（逐步检查碰撞 / 区域边界，被挡住就停在挡住的地方），返回最终位置 */
  dashTo?(x: number, z: number): { x: number; z: number };
  /** v1.2.37c（以下可选）：限时增益（同 key 覆盖刷新）：dmg = 伤害 +比例、haste = 急速 +比例（仍受急速上限）、speed = 移速 +比例（不受移速上限）；dur 秒 */
  buff?(o: { key: string; name?: string; dmg?: number; haste?: number; speed?: number; dur: number }): void;
  /** v1.2.37c：刷新 slots 里剩余冷却最长的一个，返回刷新的槽位（都没在冷却 = null） */
  refreshLongestCd?(slots: string[]): string | null;
  /** v1.2.37c：当前技能冷却缩减（0–1，已套技能上限，同角色面板「技能」那一项） */
  skillCdr?(): number;
  /** v1.2.37c：接下来 n 次翻滚不进入冷却 */
  freeRoll?(n: number): void;
  /** v1.2.53（可选，快速体验用）：升到 lv 级并给每个部位穿上一件装等 ilvl 的 quality 装备 */
  demoKit?(lv: number, ilvl: number, quality: 'blue' | 'purple' | 'orange'): void;
  /** v1.2.53（可选）：进入拍照模式 */
  photo?(): void;
  /** v1.2.71（可选）：环境声输出 —— ctx = WebAudio AudioContext、out = 环境音总线 AudioNode（受环境音量设置控制）；音频未解锁 = null。
   *  core 不依赖 DOM 类型，所以写成 unknown，包自己断言 */
  ambient?(): { ctx: unknown; out: unknown } | null;
  /** v1.2.71（可选）：按场景压低背景音乐，k = 0.2–1（1 = 还原），与配音压低相乘；包负责离开场景时还原 */
  musicDim?(k: number): void;
}
/** v1.2.40 武器外观接口：type = 武器类型（sword / staff …）；key = 武器模型名（武器库或 load 登记的名字） */
export interface PackWeaponSkinApi {
  /** 当前主手武器类型（没有武器 = null） */
  mainType(): string | null;
  /** 11-05（可选）：职业的远程副手类型（灵契猎手 = 'bow'；没有 = null）——这一类铸造品换到副手（弓位）的外观上 */
  offType?(): string | null;
  /** 武器库：现有的 Lux3D 武器模型（key、默认适用的武器类型） */
  library(): { key: string; type: string }[];
  /** 当前覆盖（type → key） */
  get(type: string): string | null;
  /** 设置 / 清除覆盖并立刻换装；key 必须已登记 */
  set(type: string, key: string | null): boolean;
  /** 运行时登记一个 GLB（ArrayBuffer），成功返回 true */
  load(key: string, buf: ArrayBuffer, meta?: Record<string, unknown>): Promise<boolean>;
  has(key: string): boolean;
  /** v1.2.46（可选）：带元数据登记过的运行时模型（新的在前） */
  list?(): { key: string; meta: Record<string, unknown> }[];
  /** v1.2.46（可选）：删除运行时模型（含持久化数据；正在用的外观退回默认） */
  remove?(key: string): Promise<void>;
}
/** v1.1.1 范围打击参数 */
export interface PackStrike {
  r: number; dmgK: number; el?: import('./types').Element;
  interrupt?: boolean; stun?: number;
  /** 易伤：之后 vulnDur 秒内玩家对其造成的伤害 ×(1 + vuln) */
  vuln?: number; vulnDur?: number;
  /** v1.1.2：只打生命比例 ≤ maxHpFrac 的目标（不填 = 全部） */
  maxHpFrac?: number;
  /** v1.1.2：最多打几个目标（按距离由近到远；不填 = 全部） */
  max?: number;
  /** v1.1.2：处决——非首领目标直接击杀（首领照常按 dmgK 结算） */
  execute?: boolean;
  /** v1.2.15：打击中心（世界坐标；不填 = 玩家位置） */
  at?: { x: number; z: number };
}
/** v1.1.2 范围打击结果：hits 命中、interrupted 打断、killed 击杀（含处决）、elites / bosses 命中的精英 / 首领数 */
export interface PackStrikeResult { hits: number; interrupted: number; killed?: number; elites?: number; bosses?: number }
/** v1.1.2 包挂件（任何职业换装重建时调用，attach 同 ClassDressApi；cls = 当前职业 id） */
export type PackDressApi = import('./ClassExt').ClassDressApi & { cls: string };
/** v1.1.1 扩展按键（第 7 键）：电脑 T 键 + 手机技能区按钮；visible() 为 false 时整个按钮不出现。同一时间只显示第一个可见的 */
export interface PackExtKey {
  id: string;
  name: string;
  /** 图标（data URL / 图片地址）；没有 = 只显示 glyph 文字 */
  icon?: string;
  glyph?: string;
  /** 主色（css） */
  color?: string;
  visible(): boolean;
  /** 充能 0–1（1 = 可用） */
  charge(): number;
  /** 按下：返回是否放出 */
  use(): boolean;
  /** 说明（悬停 / 长按），可带简单 html */
  tip(): string;
}
/** v1.2.15 第 8 技能格（电脑 G 键 + 手机技能区按钮）：默认空且隐藏；包提供可装入的物品，装上后格子里是对应的技能 */
export interface PackSlotSkill {
  /** 技能 id（同装入的物品 id 即可） */
  id: string;
  name: string;
  icon?: string;
  glyph?: string;
  color?: string;
  /** 总冷却（秒） */
  cd: number;
  /** 剩余冷却（秒，0 = 可用） */
  cdLeft(): number;
  /** 按下：返回是否放出 */
  use(): boolean;
  /** 说明（悬停 / 长按），可带简单 html */
  tip(): string;
}
/** 第 8 技能格可装入的物品（行囊里单独一栏） */
export interface PackSlotItem {
  id: string;
  name: string;
  icon?: string;
  glyph?: string;
  color?: string;
  /** 说明（悬停 / 点选），可带简单 html */
  tip: string;
  equipped: boolean;
  /** 当前角色能不能装（不能 = 按钮灰，note 写原因） */
  usable: boolean;
  note?: string;
}
export interface PackSkillSlot {
  /** 当前装在格子里的技能（null = 空：按钮隐藏、G 键无效） */
  current(): PackSlotSkill | null;
  /** 行囊里可装入的物品（空 = 行囊不显示这一栏） */
  items(): PackSlotItem[];
  /** 装入（物品 id）/ 卸下（null）；成功返回 null，失败返回原因 */
  equip(id: string | null): string | null;
  /** 行囊里这一栏的标题（不填 = 「第 8 技能格」） */
  title?: string;
}
/** v1.1.1 战斗事件（本体在固定时机广播给包；没有包 = 不广播） */
export type PackEvent =
  | { type: 'interrupt' }                         // 玩家打断了敌人的读条
  | { type: 'parry' }                             // 玩家无敌帧 / 翻滚挡下一次攻击
  | { type: 'hurt'; amount: number }              // 玩家受到伤害（每次结算）
  | { type: 'deal'; amount: number; boss: boolean } // v1.2.39c 玩家对敌人造成伤害（每次结算）
  | { type: 'kill'; kind: string; elite: boolean; boss: boolean; map: string; x: number; z: number };
/** v1.1.1 包给的全局倍率（1 = 不影响；多个包 / 多个来源相乘） */
export interface PackMods { dealt?: number; taken?: number; takenBoss?: number; xp?: number; gold?: number }
/** v1.1.0 内容包首领：mob 同 WildMob（loot = 掉落表 id），boss 同 core/BossBrain BossDef；x / z 世界坐标；adds = 召唤物 kind → 数值（同 mob） */
export interface PackBossDef {
  key: string; map: string; x: number; z: number;
  mob: Record<string, unknown> & { name: string; level: number; hp: number; model: string; loot?: string };
  boss: import('./BossBrain').BossDef;
  adds?: Record<string, Record<string, unknown> & { name: string; model: string }>;
  /** 机制表现配色 */
  theme?: 'nature' | 'stone' | 'frost' | 'fire';
  yells?: { spawn?: string; death?: string };
  /** 首领死亡时调用（掉落之后） */
  onDeath?: () => void;
  /** v1.2.39b 复活秒数（只给地图显示倒计时用；实际复活由内容包自己管） */
  respawn?: number;
}
/** v1.2.16 内容包小副本：复用本体小副本的四档难度（普通 / 英雄 / 史诗 / 噩梦，英雄起同步）、遗物 / 异变 / 誓约 / 计时奖牌。
 *  坐标都是副本所在区域（map，一张内容包野外）的局部坐标（相对 origin）。入口 = 别的野外 dungeonGates 里同 id 的门。 */
export interface PackDungeonBoss {
  key: string; name: string; x: number; z: number;
  /** 首领数值（普通难度倍率之前的基准；同 PackBossDef.mob / boss / adds） */
  mob: PackBossDef['mob']; boss: import('./BossBrain').BossDef; adds?: PackBossDef['adds'];
  theme?: PackBossDef['theme']; yells?: PackBossDef['yells'];
  /** 攻略一句话 */
  tip?: string;
  /** 机制门槛：在 diffs 难度下，血量降到 at 里的比例时首领进入「不可破」并读条团灭技；time 秒内打碎全部核心才解除，否则团灭技落下 */
  gate?: PackDungeonGate;
}
export interface PackDungeonGate {
  diffs: string[]; at: number[]; time: number; name: string; tip: string;
  /** 核心：n 个，生命 = 同步参考生命 × hpK × 难度倍率，围着首领 r 米 */
  core: { name: string; model: string; n: number; hpK: number; r: number; tint?: number; scale?: number };
}
export interface PackDungeonTrash { kind: string; mob: Record<string, unknown> & { name: string; model: string; hp: number; dmg: number }; at: { x: number; z: number }[] }
export interface PackDungeonDropRow { name: string; quality?: string; chance: string; tip?: string }
export interface PackDungeonDef {
  id: string; name: string; desc: string;
  /** 副本地图配色（fire / frost / stone…） */
  theme?: string;
  /** 副本所在区域（内容包野外 id）、它的原点、进副本的落点、离开后回到哪里（世界坐标） */
  map: string; origin: { x: number; z: number }; start: { x: number; z: number }; exit: { map: string; x: number; z: number };
  /** 进入等级 */
  minLevel: number;
  /** 同步等级与该等级野怪的参考生命 / 伤害（英雄起敌人按这一档显示等级；宝藏怪、核心按参考生命算） */
  syncLevel: number; syncHp: number; syncDmg: number;
  /** 四档（普通 / 英雄 / 史诗 / 噩梦）首领掉落装等，小怪 -3 */
  ilvl: [number, number, number, number];
  /** 四档敌人生命 / 伤害倍率（乘在 mob / boss 的基准上；誓约再乘） */
  mul: [number, number, number, number];
  bosses: PackDungeonBoss[];
  trash?: PackDungeonTrash[];
  /** 诅咒宝箱放出来的守卫用哪种小怪（trash 的 kind；不填 = 第一种） */
  guard?: string;
  /** 副本地图掉落列表（按难度）：每组一个小标题 + 若干行 */
  drops?: (diff: string, ilvl: number) => { title: string; rows: PackDungeonDropRow[] }[];
  /** 首领倒下（本体通用掉落之后）：i = 第几个首领，last = 尾王 */
  onBossDown?: (i: number, last: boolean, diff: string) => void;
  /** 通关：week = 本周编号（每周首通用） */
  onComplete?: (o: { diff: string; sec: number; week: number }) => void;
  /** fix1107（Rhett 11-07 10:28）：长副本规则——入口只给「标准」（英雄档数值）/「炼狱」（噩梦档数值）两档、无誓约；lock(d) 返回不能选的原因（如炼狱需先通关标准）；tip 写在选档面板顶部 */
  long?: { tip: string; lock?: (diff: string) => string | null };
  /** 11-07 BUG#18：攻略页（副本地图「攻略」）补充说明。首领机制由 bosses 自动生成（阶段 / 技能 / 门槛）；
   *  notes = 整个副本的区域机制，boss[key] = 某个首领额外的几条（如炼狱借用） */
  guide?: { notes?: string[]; boss?: Record<string, string[]> };
  /** 11-07 副本地图（M）定制：主路折线 + 分段类型 + 地标 + 竖井 / 水面 / 悬钟。给了就按真实路线画 2D，并把 3D 换成剖开的竖井立体图；不给 = 原来的首领直线图 / 浮岛 */
  mapView?: PackDungeonMapView;
}
/** 副本地图定制（局部坐标，米；h = 高度） */
export interface PackDungeonMapView {
  path: { x: number; z: number; h: number; k: string }[];
  /** 段类型 → 图例名 + 颜色（#rrggbb）+ 是否虚线 */
  kinds: Record<string, { name: string; color: string; dash?: boolean }>;
  /** 区域名 */
  marks?: { x: number; z: number; h: number; name: string }[];
  /** 竖井（3D 画成剖开的砖砌井筒）：圆心、半径、井口 / 井底高度 */
  shaft?: { x: number; z: number; r: number; top: number; bottom: number };
  /** 水面：圆（r）或矩形（w × d），高度 h */
  waters?: { x: number; z: number; h: number; r?: number; w?: number; d?: number; color: string }[];
  /** 悬钟：位置与高度（链子拉到井口） */
  bell?: { x: number; z: number; h: number };
}
/** 扩展天赋层：每职业一棵，结构见 core/PackTalents.ts PackTalentTierDef（v1.0.1：5 层，每层选 1） */
export type PackTalentTier = import('./PackTalents').PackTalentTierDef;
/** UI 面板：包自己的界面入口（框架阶段只登记，本体菜单还没有渲染点） */
export interface PackUiPanel { id: string; title: string; open: () => void }

/** 内容包清单。数据挂载钩子全部可选；类型用 unknown，具体结构以本体对应数据表的类型为准（读取处断言） */
/** v1.2.3 内容包追加的玩法介绍章节（PackManifest.introChapters → web/guideintro.ts） */
export interface PackIntroChapter { id: string; name: string; glyph: string; minLevel: number; lines: (cls: string) => string[]; go?: [string, string] }

export interface PackManifest {
  id: string;
  name: string;
  /** 等级上限增量（本体 30 + 各包之和） */
  levelCapDelta?: number;
  /** 区域 → MAPS */
  zones?: PackZone[];
  /** v1.0.2：野外区域（结构同 data/zones_wild.ts WildDef，可多填 worldNode / sandIcon）→ 并进 WILD / WILD_IDS，
   *  本体野外的建场景、刷怪、NPC、营地传送阵、石门、寻路、小地图、世界地图、沙盘、读档回到原地全部自动支持 */
  wilds?: unknown[];
  /** 传送阵入口 */
  waypoints?: PackWaypoint[];
  /** 任务 → data/quests.ts QUESTS（QuestDef[]） */
  quests?: unknown[];
  /** 固定装备 / 套装件 / 暗金 → LOOT_DATA.fixedItems（自动打上 pack 标记） */
  items?: unknown[];
  /** v1.2.8 套装 → data/sets.ts SETS / ALL_SET_BONUSES（SetDef，bonuses 里带修饰器；部件放 items）。cls 是职业 id 时成为该职业的长副本职业套装（classSet） */
  sets?: unknown[];
  /** 传说特效（橙装）→ LEGENDARIES / LOOT_DATA.legendaries（自动打上 pack 标记） */
  legendaries?: unknown[];
  /** 职业 → data/classes.ts CLASSES（Record<id, ClassDef>）。v1.0.6：ClassDef.ext（core/ClassExt.ts）自带模型 / 界面 / 资源 / 技能书 / 运行时 */
  classes?: Record<string, unknown>;
  /** v1.0.6：装备底材 → LOOT_DATA.bases（结构同 core/Loot.ts ItemBase，自动打上 pack 标记，生成的物品也带） */
  bases?: unknown[];
  /** v1.0.6：英灵 → data/spirits.ts SPIRITS（SpiritDef[]，cls = 包职业 id） */
  spirits?: unknown[];
  /** v1.0.6：职业任务 → data/class_quests.ts CLASS_QUESTS（QuestDef[]，必须带 cls；可多填 perk = 任务面板里的奖励说明；完成后同本体职业任务 +1 天赋点） */
  classQuests?: unknown[];
  /** v1.2.3：玩法介绍追加章节 → web/guideintro.ts CHAPTERS（PackIntroChapter[]：id / name / glyph / minLevel / lines / go） */
  introChapters?: unknown[];
  /** 长副本（TODO：本体 raids 表还没接挂载点） */
  raids?: unknown[];
  /** v1.2.9 成就读的包内状态：stat 用 `pk_` 开头的键（AchDef.stat），每次检查成就时调用 */
  achStats?: () => Record<string, number>;
  /** 成就 → data/achievements.ts ACHIEVEMENTS（AchDef[]） */
  achievements?: unknown[];
  storyHooks?: PackStoryHook[];
  ui?: PackUiPanel[];
  /** 包自己的存档数据：写存档时调用，结果放进存档 dlc.<包 id>；读档时把 dlc.<包 id> 交给 loadData（没有 = undefined） */
  /** v0.9.9：进入游戏后调用一次（读档、建角色之后），拿到运行时上下文；区域 enter / 传送阵 go / 剧情钩子都可以用它 */
  bind?: (ctx: PackCtx) => void;
  /** v0.9.9：扩展天赋层（v1.0.1 定结构） */
  talentTier?: PackTalentTier[];
  /** v1.0.4：新怪物模型（模型 id → 建模函数，返回本体 Rig 结构）；和本体重名时本体优先 */
  models?: Record<string, () => unknown>;
  /** v1.0.3：每帧调用（进入游戏后，dt 秒）；单个包报错只记一次日志 */
  update?: (dt: number) => void;
  /** v1.0.1：包技能（SkillDef + cls + desc），并进技能书对应槽位的可选项；只能由扩展天赋的终极天赋学会 */
  skills?: unknown[];
  saveData?: () => unknown;
  loadData?: (d: unknown) => void;
  /** v1.1.1：扩展按键（第 7 键） */
  extKey?: PackExtKey | PackExtKey[];   // v1.1.2 可给数组：显示第一个 visible() 为真的（互斥按键按条件分发）
  /** v1.2.15：第 8 技能格（G 键）：可装入的物品 + 装上后的技能 */
  skillSlot?: PackSkillSlot;
  /** v1.1.2 角色挂件：换装重建时对任何职业调用（包按自己的条件决定挂什么） */
  dress?: (d: PackDressApi) => void;
  /** v1.2.16：小副本（四档难度 + 同步等级，见 PackDungeonDef） */
  dungeons?: PackDungeonDef[];
  /** v1.1.1：战斗事件 */
  onEvent?: (ev: PackEvent) => void;
  /** v1.2.71（可选）本体区域挂点：NPC / 造景 / 交互点 */
  zoneNpcs?: PackZoneNpc[];
  zoneProps?: PackZoneProp[];
  interacts?: PackInteract[];
  /** v1.1.1：全局倍率（造成伤害 / 承受伤害 / 承受首领伤害 / 击杀经验 / 击杀金币），每次结算时读取 */
  mods?: () => PackMods;
  /** v1.2.40：NPC 对话框里的额外按钮（npc id → 按钮列表；每次打开对话时读取） */
  npcActs?: () => Record<string, { label: string; run: () => void }[]>;
  /** v1.2.48：音频（配音 / 曲目），见 PackAudio；资产缺失（普通版构建）时包返回空即可，本体回退程序化音乐与原有喊话 */
  audio?: PackAudio;
  /** v1.2.53：标题画面的「快速体验」入口（评审 / 展示用）：点击 = 用独立角色（name + classId）进游戏，直接拉到 level 级并穿满装备，然后调 enter() 交给包接管 */
  demo?: PackDemo;
  /** 角色选择画面的实时 3D 背景（区域 + 机位 + 职业站位弧线）；没有包提供 = 本体营地 */
  selectStage?: PackSelectStage;
}

/** 角色选择背景：map = 区域 id（野外区域会先生成场景），坐标都是世界坐标。
 *  cam = [相机 x, y, z, 看向 x, y, z]；arc = 职业站位弧线（x, z = 弧线正中那个站位，r = 弧半径，span = 张角弧度，凸向镜头）；
 *  fov = 选角时的视角；focus = 选中职业后镜头离角色的距离 / 高度 / 侧移（角色偏左，给右侧详情面板让位） */
export interface PackSelectStage {
  map: string;
  cam: [number, number, number, number, number, number];
  arc: { x: number; z: number; r: number; span: number; scale?: number };
  fov?: number;
  /** 选角时环境半球光提亮的比例（0.5 = 亮 50%；背景很暗时让角色看得清；默认 0） */
  fill?: number;
  focus?: { dist: number; h: number; side: number };
  /** 画质为「低」或触屏时用不用这个背景（false = 退回本体营地，省内存）；默认 false */
  lowOk?: boolean;
  /** v1.2.75 画面背景：一张 16:9 底图（data URI / 相对 URL）。给了就不生成 map 区域，选角时只画底图 + 程序动态，角色照常 3D；低画质 / 触屏也能用 */
  bg?: string;
  /** v1.2.75 动态背景：无缝循环视频（按顺序试；data URI 或同源 URL——离线 file:// 下外部视频不能当贴图，须内嵌）；放不了 / 缺文件时退回 bg 静态图 + 程序动态 */
  bgVideo?: string[];
  /** 11-18 只站选中的那一位：不摆六人弧形站位（旧 A 态选角删掉，选职业在包自己的界面里做）；其余职业模型不显示、点不中 */
  solo?: boolean;
}
/** 第一个提供选角背景的包 */
export function packSelectStage(): PackSelectStage | null {
  for (const p of REG) if (p.selectStage) return p.selectStage;
  return null;
}

/** v1.2.48 一句配音：src = 音频（data URI 或相对 URL），text = 字幕，who = 说话人（字幕前缀，不填 = 首领名） */
export interface PackVoiceLine { src: string; text: string; who?: string }
/** v1.2.48 选曲时的场景：theme = 本体程序化主题，zone = 区域 id（标题画面 = 'title'），boss = 正在交战的首领 key（没有 = null） */
export interface MusicScene { theme: string; zone: string; boss: string | null }
export interface PackAudio {
  /** 首领配音：ev = spawn 登场 / phase 转阶段（last = 最后一个阶段）/ death 倒下；没有 = null（走原有喊话） */
  bossVoice?: (key: string, ev: 'spawn' | 'phase' | 'death', phase?: { name: string; index: number; last: boolean }) => PackVoiceLine | null;
  /** 开场旁白（开场动画结束、首次交互后播一次） */
  opening?: () => PackVoiceLine | null;
  /** 选曲：返回曲目名（tracks 里的 key 或本体通用曲目名）；null = 交给本体默认规则 */
  musicFor?: (s: MusicScene) => string | null;
  /** 包自带曲目：曲目名 → 音频地址（相对 URL，按需加载；不内联进页面） */
  tracks?: () => Record<string, string>;
}
const audioOf = () => REG.map(p => p.audio).filter((a): a is PackAudio => !!a);
/** v1.2.48：首领配音（第一个给出结果的包） */
export function packBossVoice(key: string, ev: 'spawn' | 'phase' | 'death', phase?: { name: string; index: number; last: boolean }): PackVoiceLine | null {
  for (const a of audioOf()) { try { const v = a.bossVoice?.(key, ev, phase); if (v && v.src) return v; } catch (e) { console.error('内容包配音出错', e); } }
  return null;
}
export function packOpeningVoice(): PackVoiceLine | null {
  for (const a of audioOf()) { try { const v = a.opening?.(); if (v && v.src) return v; } catch { /* 包出错不影响本体 */ } }
  return null;
}
export function packMusicFor(s: MusicScene): string | null {
  for (const a of audioOf()) { try { const v = a.musicFor?.(s); if (v) return v; } catch { /* 包出错不影响本体 */ } }
  return null;
}
export function packTracks(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const a of audioOf()) { try { Object.assign(o, a.tracks?.() ?? {}); } catch { /* 包出错不影响本体 */ } }
  return o;
}

type ListKey = 'zones' | 'wilds' | 'waypoints' | 'quests' | 'items' | 'legendaries' | 'raids' | 'achievements' | 'storyHooks' | 'ui' | 'talentTier' | 'skills' | 'bases' | 'spirits' | 'classQuests' | 'introChapters' | 'sets' | 'dungeons';
type RecKey = 'classes';
export type MountKey = ListKey | RecKey;
/** 会给每条数据打上 pack: <包 id> 标记的挂载点（物品类：存档里据此判断要不要封存） */
const TAGGED: ReadonlySet<MountKey> = new Set<MountKey>(['items', 'legendaries', 'bases']);

const REG: PackManifest[] = [];
/** 已经被读取过（合并过）的挂载点；之后再注册往这里挂数据的包 = 注册太晚 */
const frozen = new Set<MountKey>();

/** 注册一个内容包（同 id 重复注册忽略）。通常不直接调用，走 installPack（先查授权） */
export function registerPack(m: PackManifest): boolean {
  if (!m || !m.id) throw new Error('内容包缺少 id');
  if (REG.some(p => p.id === m.id)) return false;
  for (const k of frozen) {
    const v = (m as unknown as Record<string, unknown>)[k];
    if (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0)
      throw new Error(`内容包 ${m.id} 注册太晚：挂载点 ${k} 已经被读取过（包必须在游戏数据模块加载前注册）`);
  }
  REG.push(m);
  return true;
}
/** 已注册的包（按注册顺序） */
export const packs = (): readonly PackManifest[] => REG;
export const hasPack = (id: string | undefined | null): boolean => !!id && REG.some(p => p.id === id);
export const packById = (id: string) => REG.find(p => p.id === id) ?? null;
/** 等级上限增量之和（没有包 = 0） */
export const levelCapDelta = (): number => REG.reduce((s, p) => s + Math.max(0, p.levelCapDelta ?? 0), 0);

/** 某挂载点上所有包的数据（打标记的挂载点会复制一份并加 pack 字段，不改包里的原对象） */
export function packList<T = unknown>(key: ListKey): T[] {
  const out: T[] = [];
  for (const p of REG) {
    const v = p[key] as unknown[] | undefined;
    if (!v?.length) continue;
    for (const x of v) out.push((TAGGED.has(key) && x && typeof x === 'object' ? { ...(x as object), pack: p.id } : x) as T);
  }
  return out;
}

/** 列表型数据表合并：没有包往这里挂 → 原样返回 base（同一个引用） */
export function withPacks<T>(base: T[], key: ListKey): T[] {
  frozen.add(key);
  const add = packList<T>(key);
  return add.length ? [...base, ...add] : base;
}
/** 字典型数据表合并（职业）：没有包 → 原样返回 base；包里的 id 和本体重复时本体优先（包不能覆盖本体） */
export function withPackRecord<T>(base: Record<string, T>, key: RecKey): Record<string, T> {
  frozen.add(key);
  let out: Record<string, T> | null = null;
  for (const p of REG) {
    const v = p[key] as Record<string, T> | undefined;
    if (!v) continue;
    for (const [id, def] of Object.entries(v)) {
      if (id in base) continue;
      (out ??= { ...base })[id] = def;
    }
  }
  return out ?? base;
}

/** v1.0.6：内容包职业的某个字段（如 ext.res）→ { 职业 id: 值 }；本体职业 id 跳过。读取即冻结 classes 挂载点 */
export function packClassField<T>(pick: (def: Record<string, unknown>) => T | undefined, baseIds: readonly string[]): Record<string, T> {
  frozen.add('classes');
  const out: Record<string, T> = {};
  for (const p of REG) for (const [id, def] of Object.entries(p.classes ?? {})) {
    if (baseIds.includes(id) || id in out) continue;
    const v = pick(def as Record<string, unknown>);
    if (v !== undefined) out[id] = v;
  }
  return out;
}

/** 堆叠物品（材料）的包归属：约定 DLC 堆叠物品 id 写成「@<包 id>:xxx」（本体 id 不以 @ 开头，本体已有 set:xxx 这种带冒号的 id）→ 否则 null */
export const stackPack = (stackId: string): string | null => { if (stackId[0] !== '@') return null; const i = stackId.indexOf(':'); return i > 1 ? stackId.slice(1, i) : null; };

// ---------------------------------------------------------------------- v0.9.9 运行时钩子
let boundCtx: PackCtx | null = null;
const boundIds = new Set<string>();
/** 进入游戏后调用：每个包的 bind 只调一次（换角色再进也不重复）；单个包报错不影响本体和其它包 */
export function bindPacks(ctx: PackCtx): number {
  boundCtx = ctx; let n = 0;
  for (const p of REG) {
    if (boundIds.has(p.id)) continue;
    boundIds.add(p.id);
    try { p.bind?.(ctx); n++; } catch (e) { console.error(`内容包 ${p.id} bind 出错`, e); }
  }
  return n;
}
/** v1.0.4 包的怪物模型（没有包 = 空对象） */
export function packModels(): Record<string, () => unknown> {
  const out: Record<string, () => unknown> = {};
  for (const p of REG) for (const [k, f] of Object.entries(p.models ?? {})) if (!(k in out)) out[k] = f;
  return out;
}
/** v1.0.3 每帧更新（没有包 = 空循环） */
const updErr = new Set<string>();
export function updatePacks(dt: number) {
  for (const p of REG) { if (!p.update || updErr.has(p.id)) continue; try { p.update(dt); } catch (e) { updErr.add(p.id); liftY = null; camPull = 0; hitGuard = null; interactF = null; console.error(`内容包 ${p.id} update 出错（之后不再调用）`, e, (e as Error)?.stack); } }
}
/** v1.0.3 包给的移动速度倍率 */
let moveK = 1;
export const packMoveMul = () => moveK;
export const setPackMoveMul = (k: number) => { moveK = Number.isFinite(k) ? Math.max(0.2, Math.min(2, k)) : 1; };
/** raidA A6 包接管的玩家脚下高度（null = 贴地，默认） */
let liftY: number | null = null;
export const packLift = () => liftY;
export const setPackLift = (y: number | null) => { liftY = y === null || !Number.isFinite(y) ? null : y; };
/** raidA A7 包给的镜头额外拉远（米，0 = 不影响；大型首领战用），上限 8 */
let camPull = 0;
export const packCamPull = () => camPull;
export const setPackCamPull = (m: number | null) => { camPull = m === null || !Number.isFinite(m) ? 0 : Math.max(0, Math.min(8, m)); };
/** raidA A7 包给的命中过滤：敌人对玩家的伤害结算前调用，返回 false = 这次打不到（如玩家在高架栈道上、地面小怪够不着）；null = 不过滤 */
export type PackHitGuard = (src: { x: number; y: number; z: number; boss: boolean }) => boolean;
let hitGuard: PackHitGuard | null = null;
export const packHitGuard = () => hitGuard;
export const setPackHitGuard = (f: PackHitGuard | null) => { hitGuard = typeof f === 'function' ? f : null; };
/** raidA A7 包给的交互项（本体交互键 / 交互按钮显示 label，按下调用 act；x/z 世界坐标，可省略 = 玩家位置） */
export interface PackLiveInteract { label: string; act: () => void; x?: number; z?: number }
let interactF: (() => PackLiveInteract | null | false | undefined) | null = null;
export const setPackInteract = (f: typeof interactF) => { interactF = typeof f === 'function' ? f : null; };
/** 本体查询：包当前提供的交互项（包出错 = 当作没有） */
export const packInteract = (): PackLiveInteract | null => { if (!interactF) return null; try { const r = interactF(); return r && typeof r.label === 'string' && typeof r.act === 'function' ? r : null; } catch { return null; } };
/** v1.0.3 野外区域的自定义造景：WildDef.build(api) 在本体生成场景时调用（three 对象由包自己 import three 创建） */
export interface WildBuildApi {
  /** 放一个 THREE.Object3D 到区域里（局部坐标，自动贴地，y 在原 position.y 上叠加地面高度） */
  add(obj: unknown, lx: number, lz: number, ry?: number): unknown;
  /** 局部坐标的地面高度 */
  groundY(lx: number, lz: number): number;
  origin: { x: number; z: number };
  /** v1.2.49 圆形碰撞体（局部坐标；玩家 / 怪物碰撞 + 寻路格都会避开）。旧本体没有这个字段 → 包自己判空 */
  block?(lx: number, lz: number, r: number): void;
}
/** v1.2.49 野外造景模型替换钩子：WILD_PROP_HOOKS[区域 id](种类, 值, 尺寸) → THREE.Object3D 或 null（null = 本体默认模型）。
 *  种类：'stake'（营地栅栏桩，值 = 绕营地的角度，尺寸 = 桩高）、'tent'（值 = 颜色）、'crate'、'stall'、'anvil'、'board' */
export const WILD_PROP_HOOKS: Record<string, (kind: string, v?: number, s?: number) => unknown> = {};
/** 11-18 野外区域追加造景钩子：WILD_BUILD_HOOKS[区域 id](api) 在区域本体造景（含 def.build）之后调用；内容包借它改本体区域（如营地换包内模型） */
export const WILD_BUILD_HOOKS: Record<string, (api: WildBuildApi) => void> = {};
/** 11-18 Rhett「本体营地没有用 DLC 营地模型」：灰石营地（scenes.ts 主营地，不是野外区域）造景替换钩子。
 *  本体加载期（模型就绪后、选角 / 预编译之前）调用一次；items = 营地里本体件（kind：fire / tent / lamp / fence / crate / barrel），钩子可藏掉换包内模型。不注册 = 行为不变 */
export interface GrayCampApi extends WildBuildApi { items: { kind: string; obj: unknown; x: number; z: number; ry: number }[] }
export const GRAY_CAMP_HOOKS: Array<(api: GrayCampApi) => void> = [];
/** 当前运行时上下文（还没进游戏 = null） */
export const packCtx = (): PackCtx | null => boundCtx;
/** 本体在固定时机调用剧情钩子（at：'enterGame' / 'ending' / 'levelUp' ……）；返回执行了几条 */
export function runStoryHooks(at: string, arg?: unknown): number {
  let n = 0;
  for (const h of packList<PackStoryHook>('storyHooks')) {
    if (h.at !== at) continue;
    try { h.run(arg ?? boundCtx); n++; } catch (e) { console.error(`剧情钩子 ${h.id} 出错`, e); }
  }
  return n;
}

/** v1.2.53 快速体验入口 */
export interface PackDemo { label: string; sub?: string; name: string; classId: string; level: number;
  /** 11-08：可选职业（有 = 点按钮先选职业）；kit = 该职业出生直接穿上的固定装备 id（套装件 / 暗金武器）；ilvl = 其余部位补装等级；talents = 自动点满天赋 */
  classes?: string[]; kit?: (cls: string) => string[]; ilvl?: number; talents?: boolean; /** 升级 / 发装备之前（关掉升级剧情提示等） */ prepare?: () => void; enter: () => void }
export function packDemo(): PackDemo | null { for (const p of REG) if (p.demo) return p.demo; return null; }

// ---------------------------------------------------------------------- v1.1.1 扩展按键 / 战斗事件 / 全局倍率
/** 当前可见的扩展按键（没有包 / 都不可见 = null） */
/** v1.2.40 某个 NPC 对话框里所有包给的按钮 */
export function packNpcActs(npc: string): { label: string; run: () => void }[] {
  const out: { label: string; run: () => void }[] = [];
  for (const p of REG) { if (!p.npcActs) continue; try { out.push(...(p.npcActs()[npc] ?? [])); } catch { /* 包出错跳过 */ } }
  return out;
}
export function packExtKey(): PackExtKey | null {
  for (const p of REG) { if (!p.extKey) continue; for (const k of Array.isArray(p.extKey) ? p.extKey : [p.extKey]) { try { if (k.visible()) return k; } catch { /* 包出错当不可见 */ } } }
  return null;
}
/** v1.2.15 第 8 技能格：当前装着的技能（没有包 / 都没装 = null） */
export function packSlotSkill(): PackSlotSkill | null {
  for (const p of REG) { if (!p.skillSlot) continue; try { const s = p.skillSlot.current(); if (s) return s; } catch { /* 包出错当空 */ } }
  return null;
}
/** v1.2.15 第 8 技能格：所有包可装入的物品（带包 id） */
export function packSlotItems(): { pack: string; title: string; item: PackSlotItem }[] {
  const out: { pack: string; title: string; item: PackSlotItem }[] = [];
  for (const p of REG) { if (!p.skillSlot) continue; try { for (const it of p.skillSlot.items()) out.push({ pack: p.id, title: p.skillSlot.title ?? '第 8 技能格', item: it }); } catch (e) { console.error(`内容包 ${p.id} 技能格物品出错`, e); } }
  return out;
}
/** v1.2.15 第 8 技能格：装入（id）/ 卸下（null）。装入某个包的物品时先卸下其他包装着的（格子只有一个） */
export function packSlotEquip(pack: string, id: string | null): string | null {
  const m = REG.find(p => p.id === pack)?.skillSlot; if (!m) return '没有这个技能格物品';
  if (id) for (const p of REG) if (p.id !== pack && p.skillSlot) { try { if (p.skillSlot.current()) p.skillSlot.equip(null); } catch { /* 忽略 */ } }
  try { return m.equip(id); } catch (e) { console.error(`内容包 ${pack} 技能格装入出错`, e); return '装入失败'; }
}
/** v1.1.2 包挂件（没有包 = 什么都不做；返回调用了几个包） */
export function packDress(d: PackDressApi): number {
  let n = 0;
  for (const p of REG) { if (!p.dress) continue; try { p.dress(d); n++; } catch (e) { console.error(`内容包 ${p.id} 挂件出错`, e); } }
  return n;
}
/** 广播战斗事件（没有包 = 直接返回） */
export function emitPackEvent(ev: PackEvent) {
  for (const p of REG) { if (!p.onEvent) continue; try { p.onEvent(ev); } catch (e) { console.error(`内容包 ${p.id} onEvent 出错`, e); } }
}
/** 全局倍率之积（没有包 = 1） */
export function packMul(k: keyof PackMods): number {
  let m = 1;
  for (const p of REG) { if (!p.mods) continue; try { const v = p.mods()[k]; if (typeof v === 'number' && Number.isFinite(v) && v > 0) m *= v; } catch { /* 忽略 */ } }
  return m;
}

/** v1.2.71 本体区域挂点（没有包 = 空数组 / null） */
export const packZoneNpcs = (zone: string): PackZoneNpc[] => REG.flatMap(p => (p.zoneNpcs ?? []).filter(n => n.zone === zone));
export const packZoneProps = (zone: string): PackZoneProp[] => REG.flatMap(p => (p.zoneProps ?? []).filter(n => n.zone === zone));
export function packInteractAt(zone: string, x: number, z: number): { label: string; act: () => void; x: number; z: number } | null {
  for (const p of REG) for (const it of p.interacts ?? []) {
    if (it.zone !== zone || Math.hypot(x - it.x, z - it.z) > it.r) continue;
    try { const label = it.label(); if (label) return { label, act: () => { try { it.act(); } catch (e) { console.error(`内容包 ${p.id} 交互出错`, e); } }, x: it.x, z: it.z }; } catch { /* 包出错当不可交互 */ }
  }
  return null;
}
/** 只给测试用：清空注册表和冻结记录 */
export function _resetPacksForTest() { REG.length = 0; frozen.clear(); boundCtx = null; boundIds.clear(); updErr.clear(); moveK = 1; }

/** v1.2.9 所有包的成就状态合并（没有包 = {}） */
export const packAchStats = (): Record<string, number> => { const o: Record<string, number> = {}; for (const p of REG) { try { Object.assign(o, p.achStats?.() ?? {}); } catch { /* 包读状态失败不影响本体 */ } } return o; };
