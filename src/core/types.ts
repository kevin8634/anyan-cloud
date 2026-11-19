// ========== 基础类型：全部是纯数据，可直接从 JSON 配置表加载 ==========

export type Element = 'physical' | 'fire' | 'frost' | 'shadow' | 'holy' | 'nature' | 'arcane' | 'lightning';

/** 技能形状：决定命中判定方式 */
export type Shape = 'single' | 'cone' | 'circle' | 'line' | 'projectile' | 'dash';

/** 技能槽位：普攻 + 3 个一般技能 + 1 个大招 */
export type SlotId = 'basic' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'ultimate';   // v0.7.8：skill4 = 25 级第 4 技能槽（4 键）
export const SLOT_IDS: SlotId[] = ['basic', 'skill1', 'skill2', 'skill3', 'skill4', 'ultimate'];

/** 可被修饰器加/乘的数值属性 */
export type StatKey =
  | 'damage'          // 基础伤害
  | 'cooldown'        // 冷却(秒)
  | 'range'           // 施法距离
  | 'radius'          // 范围半径 / 扇形角度
  | 'projectileCount' // 投射物数量
  | 'castTime'        // 读条时间
  | 'cost';           // 消耗(怒气/法力)

export type Stats = Record<StatKey, number>;

/** 命中后附带的效果 */
export type EffectDef =
  | { type: 'dot'; element: Element; dps: number; duration: number }         // 持续伤害
  | { type: 'elemHit'; element: Element; damagePercent: number }            // v1.2.66 多重元素附加：额外一段独立元素伤害（独立暴击、独立抗性、独立特效）
  | { type: 'slow'; percent: number; duration: number }                      // 减速
  | { type: 'stun'; duration: number }                                       // 眩晕
  | { type: 'fear'; duration: number; bossVuln?: number }                   // v1.2.77 恐惧：小怪逃跑不攻击；首领免疫，改为受伤 +bossVuln（默认 8%）
  | { type: 'groundZone'; element: Element; dps: number; radius: number; duration: number;   // 地面区域(燃烧地面等)
      /** v1.2.73 冰霜区域（暴风雪）：每跳减速 +slowPerTick，最多 slowMax；同一敌人在区域里第 freezeTick 跳冻结 freezeDur 秒（首领只打断）。只对冰霜区域生效 */
      slowPerTick?: number; slowMax?: number; freezeTick?: number; freezeDur?: number }
  | { type: 'dotStack'; element: Element; dpsPerStack: number; max: number; duration: number }   // v1.2.73 叠层持续伤害（剑刃风暴每跳叠流血）：每次命中 +1 层（最多 max），每秒伤害 = 层数 × dpsPerStack，刷新持续
  | { type: 'knockback'; distance: number }
  | { type: 'heal'; percentOfDamage: number; overflowShield?: number }       // 吸血；overflowShield：溢出的治疗转为护盾（上限 = 最大生命 × 该值）
  | { type: 'explode'; radius: number; damagePercent: number }               // 命中后爆炸
  | { type: 'resetCooldown'; slot: SlotId | 'longest'; chance: number; icd?: number; every?: number }   // 概率重置某槽位冷却；v1.2.35：longest = 剩余冷却最长的非大招技能，icd = 内置冷却（同槽位共用），every = 每第 N 次命中必定重置
  | { type: 'interrupt' }                                                    // 打断读条（眩晕也会打断）
  | { type: 'reflect'; reduce: number; percent: number; duration: number }   // 自身增益：受到伤害降低 reduce，并把 percent 反弹给攻击者（盾墙）
  | { type: 'chain'; jumps: number; radius: number; damagePercent: number }  // 连锁：命中后弹向附近敌人 jumps 次，每跳伤害 ×damagePercent，其它效果同样生效
  // v0.6.9 橙装特效
  | { type: 'shield'; percentMaxHp: number; duration: number }                // 自身护盾：吸收最大生命 x% 的伤害
  | { type: 'stackStun'; stacks: number; duration: number; name?: string }   // 叠层：同一目标被命中 stacks 次后眩晕（冻结）duration 秒；首领只打断
  | { type: 'critEvery'; n: number }                                         // 每第 n 次施放必定暴击
  // v1.2.37 觉醒重做
  | { type: 'aftershock'; delay: number; radius: number; damagePercent: number }  // 命中后 delay 秒在命中点再震一次（余震）
  | { type: 'cdRefund'; perHit: number; max: number; slots: SlotId[] }         // 每命中 1 个敌人，slots 冷却 -perHit 秒，单次施放最多 max 秒（余烬回涌）
  | { type: 'killHeal'; percentMaxHp: number };                              // 这次施放击杀敌人：每个回复最大生命 x%（汲血）                                        // 每第 n 次施放必定暴击

/** 技能定义（配置表中的一行） */
export interface SkillDef {
  id: string;
  name: string;
  slot: SlotId;          // 只能装到哪类槽位
  element: Element;
  shape: Shape;
  tags: string[];        // 如 ['melee','aoe','spin']，修饰器靠标签匹配
  stats: Stats;
  effects: EffectDef[];
  icon?: string;
}

/** 修饰器操作：同样是纯数据 */
export type ModOp =
  | { op: 'add'; stat: StatKey; value: number }
  | { op: 'mul'; stat: StatKey; value: number }      // 0.2 表示 +20%，-0.4 表示 -40%
  | { op: 'more'; stat: StatKey; value: number }     // v0.7.5：独立乘区（职业资源强化），不和 mul 相加
  | { op: 'setElement'; value: Element }
  | { op: 'addElement'; value: Element; damagePercent: number }   // v1.2.66 附加元素：不改主元素，追加一段独立元素伤害
  | { op: 'setShape'; value: Shape }
  | { op: 'addTag'; value: string }
  | { op: 'addEffect'; effect: EffectDef }
  | { op: 'rename'; prefix?: string; suffix?: string; name?: string }; // 变种名称，如「冰霜·」「·爆裂」；name = 整个换名（终极天赋：英勇打击 → 致死打击）

/** 修饰器生效条件 */
export type ModCondition =
  | { type: 'recentCast'; skillId?: string; tag?: string; within: number; consume?: boolean } // 技能组合
  | { type: 'hpBelow'; percent: number }
  | { type: 'targetHasEffect'; effect: EffectDef['type'] }
  // v1.2.35：主动可控的触发（替代「生命低于 X%」），状态由 core/CondFlags 维护（表现层写入）
  | { type: 'flag'; key: string; consume?: boolean }                                   // 计时状态存在（立誓 / 击杀后 / 护盾存在…）
  | { type: 'stacks'; key: string; min?: number; scale?: boolean; consume?: boolean }  // 层数 ≥ min；scale = 数值 × 层数
  | { type: 'targetHpAbove'; percent: number }                                         // 目标生命高于
  | { type: 'icd'; sec: number };                                                      // 内置冷却（每 sec 秒最多生效一次）

export type ModSource = 'talent' | 'equipment' | 'combo' | 'buff' | 'rune';

export interface ModifierDef {
  id: string;
  name: string;
  desc: string;
  source: ModSource;
  /** v0.6.9：只对某个职业生效（多职业首饰按职业显示不同特效）；不填 = 所有职业 */
  cls?: string;
  /** 匹配规则：都不填表示对所有技能生效；多个字段同时填表示“且” */
  match: {
    skillIds?: string[];
    slots?: SlotId[];
    tagsAll?: string[];   // 必须同时拥有
    tagsAny?: string[];   // 拥有其一
    elements?: Element[];
    /** v1.2.66 槽位继承：elements 不符时，技能在这些槽位（原技能是该元素）也算匹配 */
    elementSlots?: SlotId[];
    /** v1.2.66 元素转译：原元素；附加的持续伤害 / 地面区域随当前技能元素改变，变种名里的元素词按命名表换 */
    adaptFrom?: Element[];
    /** v1.2.66 整名重命名只给这些原技能；同槽换了别的技能时改成前缀 */
    renameFor?: string[];
  };
  conditions?: ModCondition[];
  ops: ModOp[];
  priority?: number;      // 越小越先应用；改元素/形状的建议放前面
}

/** 解析后真正释放的技能 */
export interface ResolvedSkill {
  baseId: string;
  displayName: string;
  slot: SlotId;
  element: Element;
  shape: Shape;
  tags: string[];
  stats: Stats;
  effects: EffectDef[];
  /** v1.2.66 技能身上的全部元素（主元素 + 附加元素），UI / 命名 / 元素共鸣用 */
  elements?: Element[];
  appliedModifiers: string[];  // 用于 UI 展示“受哪些天赋/装备影响”
  /** v1.2.37 冷却缩减：raw = 修饰器加总的冷却减少（0~1，未封顶），cap = 该槽位上限；普攻没有 */
  cdr?: { raw: number; cap: number };
  /** v1.2.73 范围加成被封顶时：原始 Σ范围加成、上限、换算的伤害加成 */
  radCap?: { raw: number; cap: number; dmg: number };
  /** v1.2.73 范围倍率 = 实际半径 / 技能原始半径（含封顶后的范围加成）；持续地面区域半径按它一起放大（审计 G5） */
  radScale?: number;
}

/** 解析时的战斗上下文 */
export interface CastContext {
  now: number;                // 秒
  casterHpPercent: number;    // 0~1
  targetEffects: EffectDef['type'][];
  targetHpPercent?: number;   // v1.2.35 目标生命比例（targetHpAbove）
}
