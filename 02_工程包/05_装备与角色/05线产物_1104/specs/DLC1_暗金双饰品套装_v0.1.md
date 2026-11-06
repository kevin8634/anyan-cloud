# 《暗岩传说》DLC1 · 通用暗金双饰品套装「朔望」 数据规格 v0.1（初稿）

> 日期：2026-11-04 ｜ 依据：Rhett 11-04 03:18「两件套，暗金品质，有暗金套装效果，六职业通用，套装效果加强各职业的 1 技能」｜ 状态：**规格初稿，未改任何代码**
> 落地位置：建议并入 `src/dlc/dlc1/gear40.ts`（与钟楼套、D40 暗金同文件，写法照抄），或新文件 `src/dlc/dlc1/shuowang.ts` 由 01 接入 manifest。主线代码不动（需 01 新增项见 §5）。
> 所有数值标「初稿」，整体平衡沿用 DLC1 惯例暂缓。

---

## 0. 读过的代码（只读）与约束结论

| 文件 | 关键点 | 对本规格的约束 |
|---|---|---|
| `dlc/dlc1/gear40.ts` | 钟楼套 `set_dlc1_bell2`：`cls: 'dlc1_any'`、`className: '六职业通用'`，2 件 = 项链 `neck` + 腰带 `waist`，每件自带特效，2 件效果拆两条 SetBonus（第二条 `desc: ''`）；D40 双持套 `D40_SETS`：**暗金品质 + setId**（`dark(..., setId)`，`quality: 'dark'`, `affixes: 2`），套装效果用 `stacks scale` 按层；`CondFlags.hitRules.push({ key, slots/skillIds, perTarget, max, dur })` 登记叠层 | 本套照抄 `dark()` + `bonus()` 写法；SetDef `cls: 'dlc1_any'`（`classSet()` 不会把它当成任何职业的主套装）；叠层 key 一律新前缀 `sw_` |
| `core/Loadout.ts` | `ItemSlot` 含 `ring` / `trinket`（各两个穿戴格 ring1/ring2、trinket1/trinket2，见 `Inventory.slotsFor`）；`allModifiers()`：**装备自身修饰器按 `cls` 过滤，套装效果修饰器不按 `cls` 过滤** | 两件放 `ring` + `trinket`，**不与钟楼套（neck + waist）、30/40 级职业套（头肩胸手腿腕）抢槽**；套装里的「职业专属」那几条不能靠 `cls` 限职业 → 用 **`match.skillIds` = 该职业技能 1 的 3 个可选技能** 门控（别的职业身上不存在这些 id，天然不生效） |
| `core/SkillBook.ts remapToSlot` | 装备 / 套装修饰器的 `skillIds`：当前装的是原技能之一 → 原样；某个 id 在本职业技能书里查不到槽 → 原样返回（不换算） | 写全 3 个技能 1 选项 id，换任何一个技能 1 都生效；别职业 `slotOf` 查不到 → 原样 → 不匹配，安全 |
| `core/SkillResolver.ts` | 按 priority 升序（未填 = 100）逐条匹配；`checkConditions` 全部通过后才执行 consume / icd 计时（`later`）；`recentCast` 默认 consume，按修饰器 id 各自消耗；`stacks` 可读 provider 读数（`souls`）；冷却缩减上限 技能 1~4 = 40% | 条件可以放心组合（icd + recentCast 不会白白消耗）；技能 1 的 CDR 叠加注意 40% 上限（§6） |
| `core/types.ts` | op：`add / mul / more / setElement / addElement / setShape / addTag / addEffect / rename`；效果：`dot / elemHit / slow / stun / fear / groundZone / dotStack / knockback / heal / explode / resetCooldown(slot, chance, icd, every) / interrupt / reflect / chain / shield / stackStun / critEvery / aftershock / cdRefund / killHeal`；条件：`recentCast / hpBelow / targetHasEffect / flag / stacks / targetHpAbove / icd` | 本规格主体**只用以上字段** |
| `web/trigfx.ts` L55 | hitRules：技能命中时按 `skillIds` / `slots` 过滤，每次施放 +1 层（`perTarget` 则 + 命中数） | 「每投 N 瓶」「二段冲锋窗口」都用 hitRules 计数 |
| `core/GearView.ts clsFilter` / `core/Loot.ts CLS_TAG` | 多职业首饰特效前缀 **只认【战士】/【法师】**（`CLS_OF = { 战士: 'warrior', 法师: 'mage' }`）；作用于物品行 `★ ❖ ◆` | 六职业前缀要 01 扩表；**套装效果文字（`web/sets_ui.ts` 渲染 `b.desc`）不走 clsFilter** → 需 01 接（§5） |
| `core/Sets.ts setCounts` | 按 `setId` **数件数，不去重** | 两枚同名戒指（ring1 + ring2）会被算成 2 件 → 需 01 加「同部件只算 1 件」（§5） |
| 技能书 `data/skillbook.ts` / `skillbook_v07.ts` / `dlc1/hunter_skills.ts` / `coffin_skills.ts` | 六职业技能 1 见下表；**猎手换形技 `hp_shift_*` 槽位登记为 skill1** | 通用条用 `slots:['skill1'] + tagsAny:['movement','spell']` 排除换形技（换形技标签无这两个）；职业条用 skillIds |

### 六职业技能 1 速查

| 职业 | 技能 1 定位 | 可选技能（id · 名 · 形状 · 关键标签 · 基础） |
|---|---|---|
| 战士 `warrior` | 位移 | `charge` 冲锋（dash，眩晕 1 秒 + 流血，CD 8）· `heroic_leap` 英勇跳跃（dash，`leap`/`slam`，落地 4 米震击，CD 10）· `shield_rush` 盾牌突进（dash，打断 + 4 秒减伤，CD 7） |
| 法师 `mage` | 主攻 | `flame_orb` 烈焰弹（projectile，燃烧 + 2.5 米爆炸，CD 5）· `ice_lance` 冰枪（projectile，减速 40%，CD 4）· `chain_lightning` 闪电链（single，弹射 3 次，CD 6） |
| 时砂 `chrono` | 位移 | `sand_step` 沙影步（circle 3.5 米，`blink`/`echo`/`mark1`，CD 7）· `phase_shift` 相位折跃（瞬移到身后，CD 8）· `backflow_dash` 逆流冲刺（后闪 7 米 + 前甩 3 枚时轮，CD 9）；均耗 1 格时砂 |
| 炼金 `alchemy` | 红瓶（主攻） | `red_flask` 爆燃瓶（lob circle 2.6 米，灼烧）· `thermite` 铝热剂（慢引信大爆 ×1.7）· `napalm` 火油弹（大片火地 ×0.6）；**CD 0.3、`fastcast`、耗 1 试剂** → 冷却类强化对炼金无意义 |
| 灵契猎手 `hunter` | 位移 | `hp_pounce` 契约突袭（dash，晕 0.5，CD 8）· `hp_leap` 兽跃（dash，减速，CD 10）· `hp_glide` 风行契步（blink circle 3 米，CD 9）；另有换形技 `hp_shift_wolf/bear/eagle`（槽位 skill1，不走 tryCast） |
| 负棺人 `coffin` | 位移 | `cf_drag` 拖棺冲锋（dash，晕 0.5，CD 8）· `cf_vault` 棺跃（dash，减速，CD 10）· `cf_shroudstep` 寿衣步（暗影 blink circle 3 米，CD 9）；读数 `souls`（0~3） |

---

## 1. 套装总览

| 项 | 内容 |
|---|---|
| 套装 id | `set_dlc1_shuowang` |
| 名称 | **朔望（套装）**　副标：暗金 · 六职业通用 |
| SetDef | `{ id: 'set_dlc1_shuowang', name: '朔望（套装）', cls: 'dlc1_any', className: '六职业通用', open: true, since: 'v1.2.x', pieces: ['i_sw_ring','i_sw_idol'], pieceNames: ['朔望 · 朔月指环','朔望 · 望潮护符'], bonuses: SW_BONUS }` |
| 主题 | 沉钟之海的潮汐受月相牵引：**朔**（无月之夜，暗）把力量藏进「第一下」之后的那一击；**望**（满月，金）把平时的一下下攒成一次满潮。两件合起来 = 一轮完整的月相，**第一下（技能 1）** 被月潮整个改写。暗 + 金 = 暗金。 |
| 核心节奏 | 普攻攒潮位 → 满潮的技能 1 → 技能 1 之后的那一击「月蚀」；2 件套再把每个职业的技能 1 改成新形态。 |
| 品质 / 词条 | 两件都是 `quality: 'dark'`，`affixes: 2`（同 D40 双持暗金件），可淬炼；装备分按 `FX_COEF.dark` + `SET_TIER_COEF(2)` 自动计入 |

---

## 2. 两件饰品

### 2.1 朔望 · 朔月指环 `i_sw_ring`

| 项 | 内容 |
|---|---|
| 槽位 | `ring`（可进 ring1 / ring2） |
| 底材 | `b_signet` 蓝宝石印戒（hp 18，power 4；DLC 若要专属底材可另建 `b_ring_sw` 同数值） |
| 品质 | 暗金 `dark`，2 条随机词条 |
| 单件暗金特效「月蚀」（初稿） | **施放技能 1 后 3 秒内，下一个技能 2~4 变为「·月蚀」：命中 0.8 秒后在命中处月影合拢再震一次（半径 3.5，70% 伤害），并减速 30%（2 秒）。每 6 秒最多一次。** |
| 设计意图 | 不加数值，改「出手顺序」：技能 1 从单纯的位移 / 起手变成「开窗」，鼓励 技能 1 → 技能 2/3 的连段。六职业都有技能 1，天然通用。 |
| flavor | 「指环里镶的不是宝石，是一小片没有月亮的夜。」 |

### 2.2 朔望 · 望潮护符 `i_sw_idol`

| 项 | 内容 |
|---|---|
| 槽位 | `trinket`（可进 trinket1 / trinket2） |
| 底材 | `b_idol` 骨雕护符（hp 25，haste 2） |
| 品质 | 暗金 `dark`，2 条随机词条 |
| 单件暗金特效「满潮」（初稿） | **普攻每次命中涨 1 格「潮位」（最多 6 格，12 秒不涨则退潮清空）；满 6 格时，下一次技能 1 消耗潮位变为「·满潮」：必定暴击，落点涌起潮头（半径 4，80% 伤害）并击退 2 米。** |
| 设计意图 | 给普攻一个「攒」的理由，把平 A 和技能 1 串起来；满潮的击退让近战位移技变成「冲进去把怪推开」，远程主攻（法师 / 炼金）变成「打出一发带推的重炮」。 |
| flavor | 「满月那晚，整片海都朝它涨过来。」 |

> 两件单穿都成立：只戴戒指 = 连段奖励；只戴护符 = 普攻循环奖励。两件同戴时本身就首尾相接：普攻 → 满潮技能 1 → 月蚀技能 2/3。

---

## 3. 2 件套装效果「朔望相合」

结构 = **1 条通用（谁穿都有）+ 6 条职业专属（只对本职业技能 1 生效）**。职业条在 UI 上按【职业】前缀只显示当前职业那条（需 01 接，§5）。

### 3.1 通用
**「朔望相合」：技能 1 附加一段 20% 暗影伤害（独立暴击，暗金之潮）；施放技能 1 后 4 秒内，普攻伤害 +15%。**
（附加段走 `addElement`，不改主元素；普攻加成顺带帮护符涨潮位。）

### 3.2 职业专属（2 件，各改写技能 1 的形态 / 用法）

| 前缀 | 名称 | 效果（初稿） | 改变了什么 |
|---|---|---|---|
| 【战士】 | 回潮冲锋 | **技能 1 命中后立刻重置自身冷却（每 8 秒最多一次）→ 可以连冲两段；3 秒内的第二段变「·回潮」：伤害 +40%，落点潮涌（半径 4，60% 伤害）。** | 单次突进 → 「冲进去 + 再冲一段」的二段位移：既能连追两个目标，也能冲进再冲出 |
| 【法师】 | 潮线 | **技能 1 从单体弹体变为贯穿直线（宽 1.6 米，射程不变）「潮线·」，直线上每命中 1 个敌人，技能 1 冷却 -0.3 秒（单次最多 1.5 秒）；伤害 -15%。** | 单体主攻 → 穿透直线：站位决定收益，排成一列的怪越多越快转起来；单体首领反而略亏 |
| 【时砂】 | 沙潮残影 | **技能 1 当下伤害 -30%，命中 1.2 秒后在命中处「沙潮」再爆一次（半径 4，100% 伤害），并减速 40%（2 秒）。** | 闪身即伤 → 「闪身埋雷」：闪进去、闪走，残影替你炸；配停滞之刻 / 沙牢把怪定在雷上 |
| 【炼金】 | 跳潮瓶 | **每投 4 瓶红瓶，下一瓶红瓶变「·跳潮」：落地后再弹向附近敌人 2 次（每跳 70% 伤害，每跳同样挂灼烧 / 火地）。** | 炼金技能 1 无冷却 → 不加冷却，改「第 5 瓶会跳」的投掷节奏；弹跳不是新投掷，不打乱三色顺序 |
| 【灵契猎手】 | 群扑 | **技能 1 命中后兽魂分扑附近 2 个敌人（每扑 60% 伤害，眩晕 / 减速同样生效）；每命中 1 个敌人，技能 1 冷却 -0.5 秒（单次最多 1.5 秒）。不作用于换形技。** | 单体扑击 → 链式扑群：扑进怪堆越多转得越快，适合狼系清场 |
| 【负棺人】 | 押魂 | **技能 1 落点拖出 3 秒墓潮（半径 3，每秒暗影伤害 20）；持有 ≥2 个魂时技能 1 变「押魂·」：落点魂潮炸开（半径 4，90% 伤害）并眩晕 0.5 秒（首领只打断）。不消耗魂。** | 位移 → 「看魂数决定要不要先冲」：攒到 2 魂再冲是一次小开棺，满 3 魂开棺前冲进去把怪聚住 |

---

## 4. Modifier 草案（只用现有机制）

```ts
// ---------------------------------------------------------------- 朔望：六职业通用暗金双饰品（ring + trinket）
const SW = 'set_dlc1_shuowang';
const SW_LOOK_RING = { main: 0x14161c, glow: 0x7dffb0 };   // 朔：黑底 + DLC1 幽影绿（与 D40 暗金统一）
const SW_LOOK_IDOL = { main: 0x2a2014, glow: 0xf0d080 };   // 望：暗铜底 + 月金
const S1 = { slots: ['skill1'] as SlotId[], tagsAny: ['movement', 'spell'] };   // 技能 1，排除猎手换形技（换形技无这两个标签）
const SK1 = {
  warrior: ['charge', 'heroic_leap', 'shield_rush'],
  mage: ['flame_orb', 'ice_lance', 'chain_lightning'],
  chrono: ['sand_step', 'phase_shift', 'backflow_dash'],
  alchemy: ['red_flask', 'thermite', 'napalm'],
  [HUNTER_ID]: ['hp_pounce', 'hp_leap', 'hp_glide'],
  [COFFIN_ID]: ['cf_drag', 'cf_vault', 'cf_shroudstep'],
};

// ---- 单件特效（物品自身修饰器，不带 cls → 六职业都生效）
const SW_PIECES: Fixed[] = [
  dark('i_sw_ring', '朔望 · 朔月指环', 'ring', 'b_signet', '指环里镶的不是宝石，是一小片没有月亮的夜。', [
    fx('sw_eclipse', '施放技能 1 后 3 秒内，下一个技能 2~4 命中 0.8 秒后月蚀再震（半径 3.5，70% 伤害），减速 30%（每 6 秒最多一次）', {
      match: { slots: ['skill2', 'skill3', 'skill4'] },
      conditions: [{ type: 'icd', sec: 6 }, { type: 'recentCast', tag: 'slot:skill1', within: 3 }],   // recentCast 默认 consume
      ops: [{ op: 'addEffect', effect: { type: 'aftershock', delay: 0.8, radius: 3.5, damagePercent: 0.7 } },
            { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }, { op: 'rename', suffix: '·月蚀' }] }),
  ], SW_LOOK_RING, 2, SW),
  dark('i_sw_idol', '朔望 · 望潮护符', 'trinket', 'b_idol', '满月那晚，整片海都朝它涨过来。', [
    fx('sw_flood', '普攻命中涨潮位（最多 6 格），满 6 格时下一次技能 1 必定暴击，落点潮头（半径 4，80% 伤害）击退 2 米', {
      match: S1, priority: 31,
      conditions: [{ type: 'stacks', key: 'sw_tide', min: 6, consume: true }],
      ops: [{ op: 'addEffect', effect: { type: 'critEvery', n: 1 } },
            { op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.8 } },
            { op: 'addEffect', effect: { type: 'knockback', distance: 2 } }, { op: 'rename', suffix: '·满潮' }] }),
  ], SW_LOOK_IDOL, 2, SW),
];

// ---- 2 件套装效果
const swCls = (key: keyof typeof SK1, tag: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc' | 'match'> & { match?: ModifierDef['match'] }, sub = ''): SetBonus =>
  ({ setId: SW, pieces: 2, desc: `【${tag}】${desc}`,
     modifier: { id: `${SW}_2_${key}${sub}`, name: `「朔望」${tag}`, source: 'equipment', priority: 30, cls: key, desc, match: { skillIds: SK1[key] }, ...m } as ModifierDef });
const swExtra = (key: keyof typeof SK1, sub: string, m: Partial<ModifierDef>): SetBonus =>   // 同档第二条修饰器：desc '' 不单独显示
  ({ setId: SW, pieces: 2, desc: '', modifier: { id: `${SW}_2_${key}_${sub}`, name: '「朔望」', source: 'equipment', priority: 31, cls: key, desc: '', match: { skillIds: SK1[key] }, ops: [], ...m } as ModifierDef });

const SW_BONUS: SetBonus[] = [
  // 通用
  bonus(SW, 2, '「朔望相合」：技能 1 附加 20% 暗影伤害；施放技能 1 后 4 秒内普攻伤害 +15%', {
    match: S1, ops: [{ op: 'addElement', value: 'shadow', damagePercent: 0.2 }] }),
  { setId: SW, pieces: 2, desc: '', modifier: { id: `${SW}_2b`, name: '「朔望相合」普攻', source: 'equipment', priority: 30, desc: '技能 1 后 4 秒内普攻 +15%',
    match: { slots: ['basic'] }, conditions: [{ type: 'recentCast', tag: 'slot:skill1', within: 4, consume: false }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } as ModifierDef } as SetBonus,

  // 【战士】回潮冲锋：命中重置自身（icd 8）；第二段读 sw_w 层
  swCls('warrior', '战士', '回潮冲锋：技能 1 命中后重置自身冷却（每 8 秒最多一次），3 秒内第二段伤害 +40%、落点潮涌（半径 4，60%）', {
    ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 1, icd: 8 } }] }),
  swExtra('warrior', 'b', { conditions: [{ type: 'stacks', key: 'sw_w', min: 1, consume: true }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.4 }, { op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.6 } }, { op: 'rename', suffix: '·回潮' }] }),

  // 【法师】潮线：改直线（priority 10 先改形状），按命中数返还自身冷却
  swCls('mage', '法师', '潮线：技能 1 改为贯穿直线（宽 1.6 米），每命中 1 个敌人技能 1 冷却 -0.3 秒（最多 1.5 秒），伤害 -15%', {
    priority: 10, ops: [{ op: 'setShape', value: 'line' }, { op: 'add', stat: 'radius', value: 1.6 }, { op: 'mul', stat: 'damage', value: -0.15 }, { op: 'rename', prefix: '潮线·' }] }),
  swExtra('mage', 'b', { ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.3, max: 1.5, slots: ['skill1'] } }] }),

  // 【时砂】沙潮残影
  swCls('chrono', '时砂', '沙潮残影：技能 1 当下伤害 -30%，命中 1.2 秒后命中处再爆（半径 4，100%），减速 40%', {
    ops: [{ op: 'mul', stat: 'damage', value: -0.3 }, { op: 'addEffect', effect: { type: 'aftershock', delay: 1.2, radius: 4, damagePercent: 1.0 } },
          { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 2 } }, { op: 'rename', suffix: '·沙潮' }] }),

  // 【炼金】跳潮瓶：每 4 瓶红瓶叠满，下一瓶消耗
  swCls('alchemy', '炼金', '跳潮瓶：每投 4 瓶红瓶，下一瓶落地后再弹 2 次（每跳 70%，同样挂灼烧）', {
    conditions: [{ type: 'stacks', key: 'sw_a', min: 4, consume: true }],
    ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 5, damagePercent: 0.7 } }, { op: 'rename', suffix: '·跳潮' }] }),

  // 【灵契猎手】群扑（skillIds 门控 → 换形技不吃）
  swCls(HUNTER_ID as keyof typeof SK1, '灵契猎手', '群扑：技能 1 命中后兽魂分扑附近 2 个敌人（每扑 60%），每命中 1 个敌人技能 1 冷却 -0.5 秒（最多 1.5 秒）', {
    ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.6 } },
          { op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 1.5, slots: ['skill1'] } }] }),

  // 【负棺人】押魂：常驻墓潮；≥2 魂追加炸开 + 眩晕（不消耗魂）
  swCls(COFFIN_ID as keyof typeof SK1, '负棺人', '押魂：技能 1 落点留 3 秒墓潮（半径 3，每秒 20）；持有 ≥2 魂时落点魂潮炸开（半径 4，90%）并眩晕 0.5 秒', {
    ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'shadow', dps: 20, radius: 3, duration: 3 } }] }),
  swExtra(COFFIN_ID as keyof typeof SK1, 'b', { conditions: [{ type: 'stacks', key: 'souls', min: 2 }],
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.9 } }, { op: 'addEffect', effect: { type: 'stun', duration: 0.5 } }, { op: 'rename', prefix: '押魂·' }] }),
];

// ---- 叠层（与 gear40 同处 push）
CondFlags.hitRules.push(
  { key: 'sw_tide', slots: ['basic'], max: 6, dur: 12 },                      // 望潮护符：普攻每次命中 +1（12 秒不涨清空）
  { key: 'sw_w', skillIds: SK1.warrior, max: 1, dur: 3 },                     // 战士回潮：第一段命中后 3 秒窗口
  { key: 'sw_a', skillIds: SK1.alchemy, max: 4, dur: 10 },                    // 炼金跳潮：红瓶计数（10 秒不投清空）
);

export const SW_SET: SetDef = { id: SW, name: '朔望（套装）', cls: 'dlc1_any', className: '六职业通用', open: true, since: 'v1.2.x',
  pieces: SW_PIECES.map(p => p.id), pieceNames: SW_PIECES.map(p => p.name), bonuses: SW_BONUS };
// 并入：DLC1_SETS_ALL.push(SW_SET)；GEAR40_ITEMS.push(...SW_PIECES)
```

**实现要点 / 已按现有引擎验证过的写法：**
- `cls` 字段照写（未来 01 若给套装修饰器加 cls 过滤即自动更稳），**但当前真正的职业门控靠 `skillIds`**：别职业技能书里查不到这些 id → `remapToSlot` 原样返回 → `matches` 不通过。
- 战士回潮：第一段施放时 `sw_w` = 0 → 不吃 +40%；命中后 hitRules 记 1 层 + `resetCooldown` 重置；第二段解析时读到 1 层 → 吃 +40% / 潮涌并消耗。第二段命中会再记 1 层，但 `resetCooldown` 的 icd 8 挡住第三段，3 秒后层数过期，不会漏到下一轮。
- 炼金跳潮：hitRules 在**命中后**加层 → 第 1~4 瓶攒 4 层，**第 5 瓶**跳（文案写「每投 4 瓶，下一瓶」）。
- 法师潮线：`setShape` 放 priority 10（types 注释：改形状放前面），伤害 / 冷却返还在其后。
- `SkillResolver.checkConditions` 所有条件通过后才 consume / 记 icd → 月蚀的 `icd + recentCast` 组合不会出现「icd 没好却把窗口吃掉」。

---

## 5. 「需 01 新增」与「需 01 确认」

### 5.1 需 01 新增（主体效果不依赖新引擎机制，以下是接入 / 显示 / 规则类）
1. **六职业前缀显示**：`core/GearView.ts` 的 `CLS_OF` / 正则 `【(战士|法师)】` 只认两职业 → 扩为 `战士 / 法师 / 时砂 / 炼金 / 灵契猎手 / 负棺人`（对应 `warrior / mage / chrono / alchemy / hunter / coffin`）；`core/Loot.ts CLS_TAG` 同步（目前 `void` 未用，可只改 GearView）。
2. **套装效果文字按职业过滤**：`web/sets_ui.ts`（L38 / L59 两处 `set.bonuses.filter(b => b.desc !== '')`）直接显示 `b.desc`，不走 clsFilter → 需对 SetBonus.desc 也套一次 `clsFilter(desc, classId)`（显示通用 + 本职业那条；无职业时全显示）。装备提示框里的套装段落若另有渲染，同样处理。
3. **同部件只算 1 件**：`core/Sets.ts setCounts` 与 `Loadout.allModifiers` 内的 `setCount` 都按 `setId` 计数，不去重 → 戒指 / 饰品各有两个格子，**戴两枚朔月指环就能凑出 2 件套**。需改为按部件定义 id 去重（钟楼套 neck / waist 单格，不受影响；本体 30 级套无重复格，也不受影响）。备选：给这两件加「唯一装备」规则（不能同时戴两枚同名件）。
4. **掉落钩子 + 保底存档**：见 §7（`forge.ts onBossDown` 尾王分支、`belltower.ts btDrops` 沉眠者分支、暗金碎片兑换表；独立 `SetPityState` 存进 DLC1 包存档，如 `S.swPity`）。
5. **（可选）`rollSetPiece` 传入保底阈值**：现阈值硬编码 `PITY_BIAS 3 / PITY_FORCE 6`，对暗金掉率偏松（2 件最坏 14 次击杀集齐）。如要更稀有，需加可选参数 `{ bias, force }`；不改则接受「暗金套装但保底同套装件」。
6. **（可选，替代案）时砂「真·回溯」**：若想把时砂改成「技能 1 后 3 秒内再按一次回到起点并在起点爆」，需新效果 `{ type: 'recall', within, ... }`（记录起点 + 二次施放判定），现有机制做不到；本规格主案用 `aftershock`，不依赖它。

### 5.2 需 01 确认（不新增，但实现假设要验）
- `aftershock` / `explode` / `chain` 的追加命中是否回流 trigfx（是否再触发 hitRules、钟楼 2 件「余音」、cdRefund）。**若回流**：法师潮线 + 钟楼余音会在直线每个命中点都爆一次，需把潮线伤害惩罚 -15% 调到 -25%。
- `setShape: 'line'` 对 `projectile`（烈焰弹 / 冰枪）与 `single`（闪电链）的执行器支持；闪电链改直线后 `chain` 是否从每个直线命中点各弹一次（若是，闪电链版需单独 `projectileCount`/`chain.jumps` 降为 1，或 `SK1.mage` 里去掉 `chain_lightning` 另写一条）。
- `resetCooldown` 的 `icd`「同槽位共用」（`web/resetfx.ts doReset`）：战士回潮的 icd 8 会与狂怒战魂 4 件「旋风斩命中 3 次重置冲锋」、天神下凡类重置共用 → 可能互相挡。若不希望互挡，改用修饰器条件 `{ type: 'icd', sec: 8 }`（按修饰器 id 计）+ 无 icd 的 `resetCooldown`。**推荐改用条件 icd 写法**，草案里两种都可，01 选。
- `stacks key: 'souls'` 在负棺技能 1 解析时可读（`lg40_c_drownedmask` 已在用，应成立）。
- `knockback` 在 dash 技能上的方向（满潮的击退以落点为中心向外）。
- 炼金跳潮的弹跳不计入「三色顺序」与赤青碧 2 件的瓶子计数（预期：不是新投掷 → 不计）。

---

## 6. 与钟楼套、30 / 40 级职业套装的叠加关系（避免无脑最优）

### 6.1 槽位：三者互不抢格
| 套装 | 占用 | 能否同穿 |
|---|---|---|
| 30 级职业套 / 万兽盟约 / 长夜送葬 | 头 肩 胸 手 腕 腿（6） | 与 40 级职业套**互斥**（同 6 格） |
| 40 级职业套（`set40_*`） | 头 肩 胸 手 腕 腿（6） | 同上 |
| 无声钟楼（橙） | 项链 + 腰带 | 可与本套同穿 |
| **朔望（暗金）** | **戒指 1 格 + 饰品 1 格** | 可与以上任意同穿；剩 ring2 / trinket2 各 1 格 |

→ 理论上「40 级 6 件 + 钟楼 2 件 + 朔望 2 件」可同时生效，所以**防无脑最优不能靠槽位，要靠「各套喂不同的技能槽 + 机会成本」**：

### 6.2 各套作用的技能槽刻意错开
| 套装 | 主要作用对象 | 朔望与它的关系 |
|---|---|---|
| 30 级职业套 | 技能 2 改形态 + 职业 DoT / 资源 + 大招 | 不碰技能 2、不碰流血 / 燃烧 / 切割 / 三色；**有意的联动**只有两处：狂怒 4 件重置冲锋、霜誓 4 件重置烈焰弹 → 与战士回潮 / 法师潮线互相喂，但受 40% CDR 上限与回潮 icd 8 约束 |
| 40 级职业套 | 技能 4（绝技）× 大招；时砂 40 级 4/6 件会喂技能 1（返还冷却、技能 1 叠摆幅） | 时砂：朔望不给技能 1 加冷却（沙潮残影是延迟爆），避免与 40 级 4 件「返还技能 1 冷却」+ 暗金逆潮主手叠穿 CDR 上限；猎手 40 级套只吃换形技，朔望用 skillIds 不吃换形技 → 互不重叠 |
| 无声钟楼 | 普攻（腰带）、大招（项链）、技能 1~3 余音 + 大招冷却（2 件） | 钟楼腰带也奖励普攻 → 和望潮护符同为「普攻流」，但钟楼重置的是**最长冷却技能**（通常技能 2/3），朔望给的是**技能 1**，不同；钟楼 2 件余音会对技能 1 生效 → 同穿时技能 1 多一段 30% 爆，属可接受的叠加，§5.2 已列回流风险 |
| 40 级暗金武器 | 各职业武器位 | 猎手「潮汐祖灵」：形态技能连锁 → 若技能 1 在形态中带 `wolf/bear/eagle` 标签，会与群扑的连锁**叠成 4 跳**，平衡时留意（建议群扑在 `tagsAny` 形态时 jumps 降为 1，或接受） |

### 6.3 机会成本（让「戴不戴朔望」是个选择）
- 朔望占掉 **ring1 + trinket1**，与这些候选直接竞争：本体暗金首饰（王座余烬 ring、骑士誓戒 trinket 等）、猎手橙装「盟约指环 / 万兽护符」、负棺橙装「摆渡人之戒 / 未亡者护符」、40 级随机橙首饰。它们多数强化**技能 3 / 绝技 / 大招**；朔望只强化**技能 1 + 起手节奏**。
- 单件价值 ≈ 一件暗金首饰（装备分 `dark 40%`），2 件套额外价值定在 **30 级 2 件 ~ 40 级 2 件之间**（不高于 30 级 4 件），所以「为技能 1 放弃两件强大招首饰」只在技能 1 是核心的配装里划算：
  - **划算**：战士冲锋流、法师烈焰弹主攻、时砂闪身流、炼金红瓶流、猎手狼系、负棺送葬者（拖棺冲锋）。
  - **不划算**：战士铁壁（盾牌突进只当打断）、法师冰霜控场（冰枪是填充）、猎手巨熊站桩、负棺守墓人（立棺不爱位移）——这些配装戴大招 / 绝技首饰更强。
- 职业条自带取舍：法师潮线单体 -15%（打首领亏、清怪赚）；时砂沙潮当下 -30%（打移动目标亏、配控制赚）；负棺押魂要 ≥2 魂（与「攒满 3 魂开棺」节奏冲突，需要玩家决定什么时候冲）。

### 6.4 叠层 key 独立
`sw_tide / sw_w / sw_a` 全是新 key，不与 30 级、40 级（`s40*`）、D40 暗金（`d40*`）、橙装共享，不会被别的装备偷消耗；负棺 `souls` 只读不消耗。

---

## 7. 掉落来源建议

| 来源 | 难度 | 掉率（初稿，每次首领击杀判定一次） | 说明 |
|---|---|---|---|
| 钟铜熔炉 · 尾王「钟母」 | 英雄 / 史诗 / 噩梦 | 3% / 6% / 12% | 主来源；每周首通翻倍（同本体暗金规则） |
| 沉眠者 A / B（无声钟楼地窖） | — | 4% | 次来源；与 8% 本职业暗金武器**独立判定**，同一次击杀最多出 1 件朔望 |
| 钟楼五层守钟者 | — | 不掉 | 已有 25% 钟楼套，避免同一处同时喂两套首饰 |
| 钟铜熔炉首领 1 / 2、普通难度 | — | 不掉 | 暗金只在尾王 |
| 暗金碎片兑换 | — | 指定一件，建议 60 碎片 | 本体暗金兑换 50 碎片；套装件 +10 |

- **保底**：`rollSetPiece(SW_SET.pieces, chance, S.swPity, rng)`，独立 `SetPityState`（§5.1 第 4 / 5 条）。只在上表有掉率的击杀上调用，避免普通首领把 dry 刷满。
- **职业**：六职业通用，不按职业挑件（掉落时不查 classId）。
- **装等**：`generateFixed(id, 首领装等)`，与该首领其它 40 级掉落同步。

---

## 8. 外观简述（供之后独立出图；本轮不生成）

| 件 | 外观 | 主色 / 辉光 |
|---|---|---|
| 朔月指环 | 黑铁细戒，戒面是一枚**内凹的黑色圆盘**（无月之夜），边缘一圈极细的幽影绿月牙光；戒臂刻潮纹，转动时月牙沿边缘缓慢游走 | 主色 黑铁 `#14161c`；辉光 幽影绿 `#7dffb0`（与 D40 暗金统一） |
| 望潮护符 | 暗铜圆坠，正面**满月浮雕**（微凸的月金圆面），月面下压着一道浪；背面是同一轮月的阴面（暗）；底部垂一粒水滴形盐晶 | 主色 暗铜 `#2a2014`；辉光 月金 `#f0d080` |
| 2 件齐 | 角色身侧（腰后 / 手腕）浮现半透明的**一明一暗双月**缓慢相绕；技能 1 施放时双月交叠一下（朔望交替），满潮时地面闪一圈潮线 | 双色并用：绿暗面 + 金亮面 = 「暗金」 |
| 技能变种视觉 | 「·满潮」落点一圈白浪；「·月蚀」余震是一枚黑月合拢；战士「·回潮」第二段身后拖浪；法师「潮线·」直线弹道带浪尖；时砂「·沙潮」残影是沙色月牙；炼金「·跳潮」瓶子弹跳轨迹带水花；猎手群扑兽魂带浪纹；负棺「押魂·」魂潮是苍白水雾 | — |

---

## 9. 一页摘要

| 项 | 内容 |
|---|---|
| 套装 | **朔望** `set_dlc1_shuowang`（暗金 · 六职业通用 · 2 件，`cls: 'dlc1_any'`） |
| 朔月指环 `i_sw_ring`（ring，`b_signet`） | 「月蚀」：技能 1 后 3 秒内下一个技能 2~4 命中 0.8 秒后再震（3.5 米 70%）+ 减速（6 秒一次） |
| 望潮护符 `i_sw_idol`（trinket，`b_idol`） | 「满潮」：普攻涨 6 格潮位，满后技能 1 必暴 + 潮头（4 米 80%）+ 击退 |
| 2 件通用 | 技能 1 附加 20% 暗影；技能 1 后 4 秒普攻 +15% |
| 【战士】回潮冲锋 | 命中重置，可连冲两段；第二段 +40% 并潮涌 |
| 【法师】潮线 | 技能 1 改贯穿直线，按命中数返还冷却；伤害 -15% |
| 【时砂】沙潮残影 | 当下 -30%，1.2 秒后命中处再爆 100% + 减速（闪身埋雷） |
| 【炼金】跳潮瓶 | 每 4 瓶红瓶，下一瓶弹跳 2 次（70%） |
| 【灵契猎手】群扑 | 命中后兽魂分扑 2 个（60%），按命中数返还冷却；不吃换形技 |
| 【负棺人】押魂 | 落点墓潮 3 秒；≥2 魂时魂潮炸开 90% + 眩晕 |
| 需 01 新增 | ① 六职业【前缀】显示 ② 套装效果文字按职业过滤 ③ 同部件只算 1 件（防双戒凑套）④ 掉落钩子 + 独立保底 ⑤（可选）保底阈值参数 ⑥（可选）时砂回溯新效果 |
