// ======================================================================
// v1.0.6：职业扩展接口（引擎无关；只放通用词，不出现任何具体内容包的名字 / 文本）
//
// 本体 4 职业的专属表现（模型、头像、选角说明、空格子图标、职业机制）写死在 web/ 各处。
// 内容包职业（PackManifest.classes）没有这些写死的分支，就在 ClassDef.ext 里自带：
// - 外观：rig（用本体的骨骼角色底模 + 染色）+ dress（包自己用 three 程序化建的挂件），looks（创建角色的配色）
// - 界面：role / diff / sig（选角卡）、weaponDesc（角色面板）、silhouette（空格子图标）、icons（图标别名）
// - 资源：res（结构同 data/resources.ts ResDef；empower 自定义强化规则）
// - 技能书：book（每槽可选项 / 槽位名 / 符文 / 推荐配装）
// - 运行时：runtime（每帧、按键、施法、命中、伤害结算钩子；通过 ClassExtApi 碰本体运行时，不 import web 模块）
// 本体 4 职业不填 ext，代码路径和以前完全一样。
// ======================================================================
import type { ModifierDef, ResolvedSkill, SkillDef, SlotId, Element } from './types';

/** 本体骨骼角色底模（web/chars.ts makeCharacter 的参数子集） */
export interface ClassRigSpec { model: string; tex: string; show: string[]; height: number; tint?: number; tintAmount?: number; emissive?: number;
  /** v1.2.19 设置「写实」时用的写实模型（没有 = 一直用上面的经典模型） */
  hd?: ClassHdRigSpec }
/** v1.2.19 写实模型规格（本体 rig.ts / models.ts 解释；内容包只给数据，不碰 web 代码） */
export interface ClassHdRigSpec {
  /** 写实底座：UBC_Male / UBC_Female */
  model: string;
  /** v1.2.25 比赛版 Lux3D 整体模型名（如 LUX_Hunter；构建里有就优先用，动作表仍用下面的 clips） */
  lux?: string;
  /** 显示哪套服装 GLB（Outfit_Male_Ranger / Outfit_Male_Peasant；不写 = 全部） */
  parts?: string[];
  height?: number;
  /** 原材质名 → 底色（乘在贴图上）；没列的材质默认浅灰 */
  mats?: Record<string, number>;
  /** 逻辑动作 → 片段名（按顺序取第一个存在的；a|b = 随机挑一个）；片段名见 rig.ts（UAL / 合成 / MX_*） */
  clips?: Record<string, string[]>;
  /** 11-05（可选）：比赛版 Lux3D 模型（lux / 40 级身体）也用 clips 里的这几个动作（其余动作照旧走 Lux 默认表）；如猎手 ['shoot'] = 拉弓 */
  luxClips?: string[];
  /** v1.2.20 衣物提亮倍数（只乘衣服 / 板甲材质，不碰皮肤；写实贴图偏暗时用，1 = 不变） */
  gain?: number;
  /** 程序化板甲（肩甲 + 胸甲）的钢色；不写 = 不加 */
  plate?: number;
  /** 职业配色强度倍数（写实模型只染衣服，通常要比经典大一点） */
  tintScale?: number;
}
/** 运行时里的一个战斗单位（敌人 / 玩家）的最小视图 */
export interface ClassExtUnit {
  readonly alive: boolean; readonly isBoss?: boolean; hp: number; maxHp: number;
  getPos(): { x: number; z: number };
}
/** 本体交给职业运行时的能力（web/classext.ts 实现） */
export interface ClassExtApi {
  now(): number;
  toast(msg: string, color?: string): void;
  player(): ClassExtUnit;
  /** 玩家模型根节点（THREE.Object3D；包自己 import three 往上挂东西） */
  playerObj(): unknown;
  target(): ClassExtUnit | null;
  enemiesNear(p: { x: number; z: number }, r: number): ClassExtUnit[];
  /** 直接造成伤害（不走技能），返回实际伤害 */
  damage(t: ClassExtUnit, amount: number, el: Element, crit?: boolean): number;
  heal(amount: number): void;
  /** 立即释放一个技能（不占冷却、不进技能书；走本体技能表现与命中，吃天赋 / 装备修饰器） */
  fire(def: SkillDef): ResolvedSkill | null;
  /** 职业运行时挂的修饰器（形态、增益……）：整组替换 */
  setMods(mods: ModifierDef[]): void;
  /** 技能栏刷新（名字 / 图标随修饰器变化时） */
  refreshBar(): void;
  /** 职业资源 */
  res(): { value: number; max: number };
  resAdd(n: number): void;
  resSpend(n: number): boolean;
  talentRank(id: string): number;
  /** 11-05（可选）：身上是否有这件暗金（含拓印）——DLC 40 级暗金武器机制用 */
  hasDark?(id: string): boolean;
  questDone(id: string): boolean;
  /** 当前武器类型（主手 / 副手） */
  weapons(): { main?: string; off?: string };
  /** 屏幕上的特效圈（颜色 css） */
  ring(p: { x: number; z: number }, r: number, color: string): void;
  playAnim(name: string, speed?: number): void;
  /** 角色等级 */
  level(): number;
  /** v1.0.7（可选）：单位的种类（敌人类型 id、显示名、是否精英 / 首领）——按被击杀敌人的种类做职业机制 */
  unitKind?(t: ClassExtUnit): { kind: string; name: string; elite: boolean };
  /** v1.0.7（可选）：从指定地点释放一个技能（像在那里放了个分身；不能用于位移技能），其余同 fire */
  fireFrom?(def: SkillDef, at: { x: number; z: number }): ResolvedSkill | null;
  /** v1.0.7（可选）：给单位上减速（percent 0–1，秒） */
  slow?(t: ClassExtUnit, percent: number, duration: number): void;
  /** v1.2.77 恐惧：小怪逃跑 duration 秒；首领免疫改为受伤 +bossVuln。返回是否真的恐惧了 */
  fear?(t: ClassExtUnit, duration: number, bossVuln?: number): boolean;
  /** v1.2.77 给玩家加护盾（最大生命 × percent，同 key 叠加到上限 cap × 最大生命） */
  shield?(key: string, percent: number, duration: number, cap?: number): void;
  /** v1.2.77 电弧 / 连线表现（两点之间一道闪电） */
  zap?(from: { x: number; z: number }, to: { x: number; z: number }): void;
  /** v1.2.77 目标身上是否有恐惧 */
  feared?(t: ClassExtUnit): boolean;
}
export interface ClassRuntime {
  bind?(api: ClassExtApi): void;
  /** 切到这个职业 / 换角色时 */
  reset?(): void;
  update?(dt: number): void;
  /** 按键（小写），返回 true = 已处理（本体不再处理这个键） */
  key?(k: string): boolean;
  /** 施法前：false = 不能放 */
  canCast?(s: ResolvedSkill): boolean;
  onCast?(s: ResolvedSkill): void;
  /** 技能命中（结算前，可以改技能） */
  onHits?(s: ResolvedSkill, hits: ClassExtUnit[]): ResolvedSkill;
  /** 伤害结算前（玩家打敌人、敌人打玩家都会进来，用 toPlayer 区分） */
  preDeal?(t: ClassExtUnit, amount: number, el: Element, toPlayer: boolean, tick: boolean, crit?: boolean): number;
  onDealt?(t: ClassExtUnit, dealt: number, el: Element, crit: boolean, tick: boolean): void;
  /** 进游戏后的提示行（技能栏上方的小字），没有 = null */
  status?(): string | null;
  debug?(): unknown;
}
/** 包资源（结构同 data/resources.ts ResDef，kind 用包自己的名字） */
export interface ClassResDef {
  kind: string; name: string; max: number; threshold: number; show: 'dots' | 'arc'; color: string; full: string;
  decayDelay: number; decayPerSec: number; gainBasic?: number; gainSkillHit?: number; desc: string;
  /** 强化规则：返回要临时加的修饰器和消耗（null = 这次不强化） */
  empower?: (value: number, thr: number, slot: SlotId, tags: string[], more: number) => { mods: ModifierDef[]; cost: number; label: string } | null;
}
export interface ClassBook {
  choices: Partial<Record<SlotId, string[]>>;
  roles: Partial<Record<SlotId, string>>;
  runes: { id: string; skillId: string; name: string; desc: string; need: number; element?: Element; modifier: ModifierDef }[];
  presets: { id: string; cls: string; name: string; desc: string; skills: Partial<Record<SlotId, string>>; runes: Record<string, string> }[];
}
export interface ClassDressApi {
  attach(bone: string, obj: unknown, offset?: [number, number, number], rot?: [number, number, number]): boolean;
  eq: Record<string, { weaponType?: string; quality?: string; slot?: string; itemLevel?: number; fixedId?: string } | undefined>;
  H: number;
  /** v1.2.19 当前是写实模型：attach 的偏移 / 尺寸按骨骼比例自动缩小（头 ≈ 0.34、胸 ≈ 0.55），大件（背棺）想保持原尺寸可以自己放大 */
  hd?: boolean;
  /** v1.2.25 比赛版 Lux3D 整体模型：衣甲是模型自带的，dress 只挂武器 / 玩法相关件（背棺魂灯等），别再叠服饰 */
  lux?: boolean;
  /** 11-05（可选）：这类武器的铸造 / 武器库外观覆盖（已登记的模型名；没有 = null），dress 自己用 makeGlbProp 套 */
  skin?(weaponType: string): string | null;
}
// ---------------------------------------------------------------- v1.0.8：职业专属施法表现
/** 施法表现的种类（本体 casting 按技能形状分到这几类；职业 fx.cast 返回 true = 本体不画默认表现，命中 / 伤害照常结算） */
export type ClassFxKind = 'melee' | 'dash' | 'dashHit' | 'nova' | 'spin' | 'slam' | 'ultimate' | 'targeted' | 'cone' | 'line' | 'blink' | 'projectile';
type P2 = { x: number; z: number };
type P3 = { x: number; y: number; z: number };
/** 序列帧粒子参数（同 web/vfx.ts FxOpts） */
export interface ClassFxParticle {
  count: number; color: number | string; color2?: number | string; colorEnd?: number | string;
  speed?: number; spread?: number; up?: number; life?: number; size?: number; sizeEnd?: number; gravity?: number; radius?: number; drag?: number; spin?: number; swirl?: number; ring?: boolean;
}
/** 本体交给职业表现的画笔（web/classext.ts 实现；物体是 THREE.Object3D，包自己 import three 建） */
export interface ClassFxApi {
  /** 把物体放进场景活 dur 秒，每帧 update(k 0→1, dt)，结束自动移除 */
  live(obj: unknown, dur: number, update: (k: number, dt: number) => void): void;
  /** 序列帧粒子：flame / spark / star / dot / streak / smoke / shard / sand / rune / ice */
  fx(kind: 'flame' | 'spark' | 'star' | 'dot' | 'streak' | 'smoke' | 'shard' | 'sand' | 'rune' | 'ice', p: P3, o: ClassFxParticle): void;
  ring(p: P2, r: number, color: string, dur?: number): void;
  sigil(p: P2, r: number, color: number | string, dur?: number): void;
  scorch(p: P2, r: number, color: number | string, dur?: number): void;
  /** 跟随角色的旋转刃环（color = 刃光颜色） */
  whirl(r: number, color: number | string, dur?: number): void;
  lightning(from: P3, to: P3): void;
  /** 顿帧 / 震屏 */
  feel(kind: 'hit' | 'heavy' | 'ultimate' | 'crit', k?: number): void;
  sound(kind: 'swing' | 'whirl' | 'thunder' | 'charge' | 'ultimate' | 'projectile' | 'meteor' | 'frost' | 'element' | 'bolt', el?: Element): void;
  anim(name: string, speed?: number): void;
  /** v1.0.9：合成器（表现里定时出声用，如铁棺落地） */
  synth: ClassSynthApi;
  /** 角色当前位置（实时，可在 update 里每帧读） */
  me(): P3;
  /** 角色朝向（弧度，rotation.y） */
  facing(): number;
  /** 某点地面高度 */
  gy(x: number, z: number): number;
}
// ---------------------------------------------------------------- v1.0.9：职业专属音效
/** 合成音（WebAudio 实时合成；d = 延迟秒，vib = 颤音深度（音分），vibHz = 颤音速度） */
export interface ClassSynthTone { f: number; f2?: number; type?: 'sine' | 'square' | 'sawtooth' | 'triangle'; dur: number; gain: number; a?: number; d?: number; lp?: number; hp?: number; detune?: number; vib?: number; vibHz?: number }
export interface ClassSynthNoise { f: number; f2?: number; type?: 'bandpass' | 'lowpass' | 'highpass'; q?: number; dur: number; gain: number; a?: number; d?: number }
export interface ClassSynthApi {
  tone(o: ClassSynthTone): void;
  noise(o: ClassSynthNoise): void;
  /** 同 key 在 gap 秒内只放一次（群怪 / 多弹体时防爆音）；音频没解锁时返回 false */
  gate(key: string, gap: number): boolean;
}
export interface ClassFx {
  /** v1.0.9 施法音效：返回 true = 本体不放默认音效（挥砍 / 旋风 / 雷鸣 / 天神下凡……）。kind 同 cast（dashHit = 冲锋到位） */
  sfx?(kind: ClassFxKind, s: ResolvedSkill, A: ClassSynthApi): boolean;
  /** 施法表现：at = 施法中心（自身 / 目标处 / 落点），dir = 朝向（单位向量，没有 = null）。返回 true = 本体不画默认表现 */
  cast?(kind: ClassFxKind, s: ResolvedSkill, at: P2, dir: P2 | null, fx: ClassFxApi): boolean;
  /** 非法术弹体的模型（返回 THREE.Object3D；null = 本体默认飞斧）。spin = 飞行中绕 z 自转 */
  projectile?(s: ResolvedSkill, i: number): { obj: unknown; spin?: boolean } | null;
  /** 弹体每帧（拖尾）；返回 true = 本体不再画默认拖尾 */
  trail?(s: ResolvedSkill, p: P3, fx: ClassFxApi): boolean;
  /** 冲锋途中每帧；返回 true = 本体不画默认尘土条纹 */
  dashTrail?(s: ResolvedSkill, p: P3, fx: ClassFxApi): boolean;
}

export interface ClassExt {
  role: string;
  diff: number;
  sig: { slot: SlotId; anim: string; color: string; ring: number }[];
  looks: { name: string; tint?: number; k?: number; swatch: string }[];
  rig: ClassRigSpec;
  /** 程序化挂件（换装时由本体重建）：d.attach(骨骼名, 物体, 相对骨骼的偏移[模型空间：脚底原点、y 向上、面朝 +z], 旋转) 把物体挂到骨骼上；
   *  骨骼名同 KayKit：head / chest / hips / handslotr / handslotl；d.eq = 当前装备（只读）；d.H = 模型高度（模型单位） */
  dress?: (d: ClassDressApi) => void;
  portrait?: string;
  weaponDesc: string;
  upgradeColor?: number;
  /** 空格子图标：部位 → 底材 id */
  silhouette?: Record<string, string>;
  /** 图标别名：技能 / 底材 id → 图标 key（没有专属图标时借用本体图标） */
  icons?: Record<string, string>;
  res?: ClassResDef;
  /** v1.2.2：职业专属引导。fight = 新手引导「攻击训练假人」一步追加的说明（HTML）；lessons = 10 / 25 / 30 级教学追加的行（等级 → 行）；first = 第一次进游戏弹出的职业要点（标题 + 行） */
  guide?: { fight?: string; lessons?: Record<number, string[]>; first?: { title: string; lines: string[] } };
  book?: ClassBook;
  runtime?: ClassRuntime;
  /** v1.0.8：职业专属施法表现（没有 = 本体默认，也就是战士式的旋风 / 雷霆 / 天神下凡） */
  fx?: ClassFx;
  /** v1.0.8：职业自带图标（图标 key → data URL，key 同本体 assets/icons 文件名，如 sk_<技能 id>），优先于 icons 别名 */
  art?: Record<string, string>;
}
