import { packTalentPointsAt } from './PackTalents';
// ========== 天赋（三系专精）+ 等级（引擎无关，可存档） ==========
// 每个职业 3 棵专精树（如 战士：武器 / 狂怒 / 防护），天赋点可以投到任意一棵树。
// 节点种类：
//   rank   小天赋，可点多级，数值按级数叠加（如 每级普攻伤害 +8%，3 级 = +24%）
//   choice 选择天赋：同一棵树同一层里只能选一个；带 group 的节点跨树也互斥（如几种「武器附魔」只能有一种）
// 层解锁：第 t 层需要在【这棵树】的前面几层投入 tierCost×(t-1) 点（经典三系天赋的规则）
// 终极天赋（capstone）：每棵树最底层一个，把某个技能变成另一种形态（通过修饰器系统）
import { ModifierDef, ModOp } from './types';
import { TalentNode } from './Loadout';
import type { BonusStat } from './Loot';
import { levelCapDelta } from './ContentPacks';

export type TalentStats = { hp: number; armor: number } & Record<BonusStat, number>;
const emptyTalentStats = (): TalentStats => ({ hp: 0, armor: 0, power: 0, crit: 0, critDmg: 0, haste: 0, speed: 0 });

export interface TalentNodeDef {
  id: string;
  name: string;
  row: number;                 // 层，1 开始
  col: number;                 // 树内 UI 列 0~3
  kind: 'rank' | 'choice';
  maxRank: number;             // choice 固定 1
  requires?: string;           // 前置天赋（需点满，同一棵树）
  /** 跨树互斥组：同组节点只能点一个 */
  group?: string;
  /** 终极天赋：技能变形 */
  capstone?: boolean;
  /** 图标 key（assets/icons 里的文件名，不带扩展名） */
  icon?: string;
  /** 技能修饰器：ops 里的 add/mul 数值会乘以当前级数 */
  modifier?: Omit<ModifierDef, 'id' | 'source'>;
  /** 额外修饰器（终极天赋常需要两条：技能变形 + 联动加成），同样按级数缩放 */
  extra?: Omit<ModifierDef, 'id' | 'source'>[];
  /** v0.7.7 天赋树 2.0：资源节点，改职业资源（每级），字段同 data/spirits.ts ResBonus */
  res?: Partial<Record<TalentResKey, number>>;
  resNode?: boolean;
  /** 角色属性（每级）：生命、护甲、强度、暴击率%、暴击伤害%、急速%、移速% */
  stats?: Partial<TalentStats>;
  desc: string;                // 可用 {v} {v2} 表示“每级数值×级数”的显示值
  perRankShown?: number;       // {v} 每级显示多少
  perRankShown2?: number;      // {v2}
  /** v1.2.58 天赋 3.0：改级数后机制天赋按 rank × rankMul 读（满级总值不变） */
  rankMul?: number;
}

export interface TalentSpecDef {
  id: string;
  name: string;                // 武器 / 狂怒 / 防护 …
  icon: string;
  desc: string;                // 一句话定位
  /** v1.2.14：装备分按专精取属性权重（tank = 生命 / 护甲高）；不写 = 查 GearView.GEAR_ROLE_BY_SPEC，再没有 = 输出 */
  gearRole?: 'tank' | 'dps';
  /** v1.2.58 天赋 3.0：主打（显示在系标题下，如「流血 · 物理持续伤害」） */
  focus?: string;
  nodes: TalentNodeDef[];
}

export interface TalentTreeDef { id: string; name: string; tierCost: number; tiers: number; specs: TalentSpecDef[];
  /** v1.2.58 天赋 3.0：三区域规则（行 1-2 = 区域一 普通/关键，3-4 = 区域二，5-6 = 区域三 普通/绝技，区域三只对主系开放） */
  v3?: boolean;
  /** v1.2.77 本树的天赋存档版本（缺省 = V3_SAVE_VER）；关键节点整套重做时加 1，旧档全额返还并提示 */
  saveVer?: number; }

/** 天赋 3.0：各行的解锁门槛（普通节点点数；关键行要求上一行点满门槛；区域三要求主系） */
export const V3_NORMAL_NEED: Record<number, number> = { 1: 4, 3: 4, 5: 9 };
export const V3_SAVE_VER = 3;
/** v1.2.77 某棵树当前的存档版本 */
export const treeSaveVer = (d: TalentTreeDef) => d.saveVer ?? V3_SAVE_VER;

export type TalentSave = Record<string, number>;
export type TalentResKey = 'gainMul' | 'thrAdd' | 'maxAdd' | 'delayAdd' | 'empowerMore';
/** v0.7.7：10 级开放天赋，10~30 级每级 1 点 */
export const TALENT_START_LEVEL = 10;

export class TalentTree {
  private ranks = new Map<string, number>();
  private specOfNode = new Map<string, TalentSpecDef>();
  private byId = new Map<string, TalentNodeDef>();
  /** 所有节点（三棵树摊平） */
  readonly nodes: TalentNodeDef[] = [];
  onChange: (() => void) | null = null;

  constructor(readonly def: TalentTreeDef, public totalPoints = 0) {
    for (const s of def.specs) for (const n of s.nodes) {
      if (this.byId.has(n.id)) throw new Error(`天赋 id 重复：${n.id}`);
      this.byId.set(n.id, n); this.specOfNode.set(n.id, s); this.nodes.push(n);
    }
  }

  rank(id: string) { return this.ranks.get(id) ?? 0; }
  /** 机制天赋读数（天赋 3.0 改过级数的节点按满级总值换算） */
  effRank(id: string) { const r = this.ranks.get(id) ?? 0; return r ? r * (this.byId.get(id)?.rankMul ?? 1) : 0; }
  get spent() { let s = 0; this.ranks.forEach(v => (s += v)); return s; }
  get available() { return this.totalPoints - this.spent; }
  node(id: string) { return this.byId.get(id); }
  specOf(id: string) { return this.specOfNode.get(id); }
  spec(specId: string) { return this.def.specs.find(s => s.id === specId); }

  /** 这棵树投入的点数 */
  spentIn(specId: string, ranks = this.ranks) {
    let s = 0;
    ranks.forEach((v, id) => { if (this.specOfNode.get(id)?.id === specId) s += v; });
    return s;
  }
  /** 主专精：投入最多的树（并列取靠前的）；一点都没投返回 null */
  get mainSpec(): TalentSpecDef | null {
    let best: TalentSpecDef | null = null, bv = 0;
    for (const s of this.def.specs) { const v = this.spentIn(s.id); if (v > bv) { bv = v; best = s; } }
    return best;
  }
  /** 第 row 层需要本树前面投入多少点 */
  tierNeed(row: number) { return this.def.tierCost * (row - 1); }
  /** 本树第 row 层之前（1..row-1 层）投入的点数 */
  private spentBelow(specId: string, row: number, ranks = this.ranks) {
    let s = 0;
    ranks.forEach((v, id) => { const n = this.byId.get(id)!; if (n.row < row && this.specOfNode.get(id)!.id === specId) s += v; });
    return s;
  }
  tierUnlocked(specId: string, row: number, ranks = this.ranks) { return this.def.v3 ? this.v3Open(specId, row, ranks) : this.spentBelow(specId, row, ranks) >= this.tierNeed(row); }
  /** 天赋 3.0：某系某行投入 */
  rowSpent(specId: string, row: number, ranks = this.ranks) { let s = 0; ranks.forEach((v, id) => { const n = this.byId.get(id)!; if (n.row === row && this.specOfNode.get(id)!.id === specId) s += v; }); return s; }
  /** 天赋 3.0：区域三已被别的系占用（只能有一个主系） */
  zone3Owner(ranks = this.ranks): string | null { for (const [id, v] of ranks) { const n = this.byId.get(id)!; if (v > 0 && n.row >= 5) return this.specOfNode.get(id)!.id; } return null; }
  private v3Open(specId: string, row: number, ranks = this.ranks): boolean {
    if (row <= 1) return true;
    if (row === 2 || row === 4 || row === 6) return this.rowSpent(specId, row - 1, ranks) >= V3_NORMAL_NEED[row - 1];
    if (row === 3) return this.rowSpent(specId, 2, ranks) >= 1;
    // row 5：区域二关键已点，且区域三没有被别的系占用
    const own = this.zone3Owner(ranks);
    return this.rowSpent(specId, 4, ranks) >= 1 && (!own || own === specId);
  }
  /** 天赋 3.0：解锁说明（UI） */
  v3Need(sp: TalentSpecDef, row: number): string {
    if (row <= 1) return '';
    if (row === 2 || row === 4 || row === 6) return `在本行上方普通节点投入 ${V3_NORMAL_NEED[row - 1]} 点（当前 ${this.rowSpent(sp.id, row - 1)}）`;
    if (row === 3) return '先点上一区域的关键节点（2 选 1）';
    const own = this.zone3Owner();
    return own && own !== sp.id ? `区域三只对主系开放（已在「${this.spec(own)?.name}」投入）` : '先点区域二的关键节点；区域三只对主系开放';
  }
  /** 天赋 3.0：当前组合（3+1+1 / 3+2 / 2+2+2 …）与关键节点数 */
  v3Combo(): { combo: string; keys: number } {
    const zones = this.def.specs.map(sp => [1, 3, 5].filter(r => this.rowSpent(sp.id, r) > 0).length).filter(z => z > 0).sort((a, b) => b - a);
    let keys = 0; this.ranks.forEach((v, id) => { const n = this.byId.get(id)!; if (v > 0 && (n.kind === 'choice' || n.capstone)) keys++; });
    return { combo: zones.join('+') || '—', keys };
  }

  /** 和它互斥、已经点了的节点（同树同层的 choice，或同 group） */
  private conflict(n: TalentNodeDef): TalentNodeDef | undefined {
    const sp = this.specOfNode.get(n.id)!;
    return this.nodes.find(o => o.id !== n.id && this.rank(o.id) > 0 && (
      (n.group && o.group === n.group) ||
      (n.kind === 'choice' && o.kind === 'choice' && o.row === n.row && this.specOfNode.get(o.id) === sp)));
  }

  /** 不能点时返回原因（UI 提示），能点返回 null */
  whyCannotAdd(id: string): string | null {
    const n = this.node(id);
    if (!n) return '天赋不存在';
    if (this.rank(id) >= n.maxRank) return '已点满';
    const sp = this.specOfNode.get(id)!;
    if (this.def.v3) {
      if (!this.v3Open(sp.id, n.row)) return this.v3Need(sp, n.row);
      const cap = V3_NORMAL_NEED[n.row];
      if (cap && this.rowSpent(sp.id, n.row) >= cap) return `这一区域的普通节点最多投入 ${cap} 点`;
    } else if (!this.tierUnlocked(sp.id, n.row)) return `需要在「${sp.name}」投入 ${this.tierNeed(n.row)} 点（当前 ${this.spentBelow(sp.id, n.row)}）`;
    if (n.requires) { const r = this.node(n.requires)!; if (this.rank(r.id) < r.maxRank) return `需要先点满「${r.name}」`; }
    const c = this.conflict(n);
    if (c) return `与「${c.name}」互斥，先取消它`;
    if (this.available <= 0) return '没有天赋点';
    if (this.def.v3 && this.spent >= TALENT_TOTAL) return `天赋 3.0 最多投入 ${TALENT_TOTAL} 点`;
    return null;
  }

  add(id: string): boolean {
    if (this.whyCannotAdd(id)) return false;
    this.ranks.set(id, this.rank(id) + 1);
    this.changed();
    return true;
  }

  /** 退一点：不能让本树后面的层失去解锁条件、不能破坏别人的前置 */
  whyCannotRemove(id: string): string | null {
    const r = this.rank(id);
    if (r <= 0) return '没有投入';
    const n = this.node(id)!;
    const sp = this.specOfNode.get(id)!;
    const dependent = this.nodes.find(o => o.requires === id && this.rank(o.id) > 0);
    if (dependent) return `「${dependent.name}」依赖它`;
    const sim = new Map(this.ranks);
    sim.set(id, r - 1);
    if (this.def.v3) {
      if (r - 1 <= 0) sim.delete(id);
      for (const [oid, v] of sim) { const o = this.node(oid)!; if (v > 0 && !this.v3Open(this.specOfNode.get(oid)!.id, o.row, sim)) return `会导致「${o.name}」失去解锁条件`; }
      return null;
    }
    for (const [oid, v] of sim) {
      const o = this.node(oid)!;
      if (v > 0 && o.row > n.row && this.specOfNode.get(oid) === sp && this.spentBelow(sp.id, o.row, sim) < this.tierNeed(o.row)) return `会导致「${o.name}」失去解锁条件`;
    }
    return null;
  }

  remove(id: string): boolean {
    if (this.whyCannotRemove(id)) return false;
    const v = this.rank(id) - 1;
    if (v > 0) this.ranks.set(id, v); else this.ranks.delete(id);
    this.changed();
    return true;
  }

  /** 洗点：全部退回 */
  reset() { this.ranks.clear(); this.changed(); }

  private scale(m: Omit<ModifierDef, 'id' | 'source'>, r: number): ModOp[] {
    return m.ops.map(op => (op.op === 'add' || op.op === 'mul') ? { ...op, value: op.value * r } : op);
  }

  /** 生成给 Loadout 的天赋修饰器（级数已乘进数值） */
  activeNodes(): TalentNode[] {
    const out: TalentNode[] = [];
    for (const n of this.nodes) {
      const r = this.rank(n.id);
      if (!r) continue;
      if (n.modifier) out.push({ id: n.id, tier: n.row, modifier: { ...n.modifier, id: `talent:${n.id}`, source: 'talent', ops: this.scale(n.modifier, r), desc: this.describe(n, r) } });
      (n.extra ?? []).forEach((m, i) => out.push({ id: `${n.id}#${i}`, tier: n.row, modifier: { ...m, id: `talent:${n.id}#${i}`, source: 'talent', ops: this.scale(m, r), desc: this.describe(n, r) } }));
    }
    return out;
  }

  /** v0.7.7：资源节点的加成（按级数） */
  resBonus(): Partial<Record<TalentResKey, number>> {
    const b: Partial<Record<TalentResKey, number>> = {};
    for (const n of this.nodes) { const r = this.rank(n.id); if (r && n.res) for (const [k, v] of Object.entries(n.res) as [TalentResKey, number][]) b[k] = (b[k] ?? 0) + v * r; }
    return b;
  }

  /** 天赋给的角色属性：生命/护甲 + 二级属性（强度、暴击、暴伤、急速、移速），与装备同口径 */
  charStats(): TalentStats {
    const s = emptyTalentStats();
    for (const n of this.nodes) {
      const r = this.rank(n.id);
      if (!r || !n.stats) continue;
      for (const [k, v] of Object.entries(n.stats) as [keyof TalentStats, number][]) s[k] += v * r;
    }
    return s;
  }

  /** 描述文本：级数为 0 时显示 1 级效果 */
  describe(n: TalentNodeDef, rank = this.rank(n.id)): string {
    const r = Math.max(1, rank);
    const f = (x?: number) => String(+((x ?? 0) * r).toFixed(1));
    return n.desc.split('{v2}').join(f(n.perRankShown2)).split('{v}').join(f(n.perRankShown));
  }

  /** v1.2.58：读到 2.0 旧档被全额返还（UI 弹一次提示后清掉） */
  migrated = false;
  save(): TalentSave { const o: TalentSave = Object.fromEntries(this.ranks); if (this.def.v3) o.__v = treeSaveVer(this.def); return o; }
  load(s: TalentSave) {
    this.ranks.clear();
    if (this.def.v3 && s && (s.__v ?? 0) < treeSaveVer(this.def)) { const had = Object.keys(s).some(k => k !== '__v' && s[k] > 0); if (had) this.migrated = true; this.changed(); return; }
    for (const [id, v] of Object.entries(s ?? {})) { const n = this.node(id); if (n && v > 0) this.ranks.set(id, Math.min(v, n.maxRank)); }
    // 等级降低或配置改动导致点数超出 / 层数条件不满足：直接洗点，避免非法状态
    if (this.spent > this.totalPoints || (this.def.v3 && this.spent > TALENT_TOTAL) || !this.valid()) this.ranks.clear();
    this.changed();
  }

  /** 当前加点是否满足全部规则（读档校验用） */
  valid(): boolean {
    for (const [id, v] of this.ranks) {
      const n = this.node(id)!;
      const sp = this.specOfNode.get(id)!;
      if (v > n.maxRank) return false;
      if (this.def.v3) { if (!this.v3Open(sp.id, n.row) || (V3_NORMAL_NEED[n.row] && this.rowSpent(sp.id, n.row) > V3_NORMAL_NEED[n.row])) return false; }
      else if (this.spentBelow(sp.id, n.row) < this.tierNeed(n.row)) return false;
      if (n.requires && this.rank(n.requires) < this.node(n.requires)!.maxRank) return false;
      if (this.conflict(n)) return false;
    }
    return true;
  }

  private changed() { this.onChange?.(); }
}

// ---------- 等级 ----------
/** v1.2.58 天赋 3.0 点数表（本体只算到 30 级）：等级给 28 点（10~30 级每级 1 + 15/20/25 级各多 2 + 30 级多 1），
 *  两个职业试炼各 1 点，合计 30；巅峰等级给的天赋点在 3.0 下超出 30 的部分不能使用（加点上限 TALENT_TOTAL） */
export const TALENT_BONUS_LEVELS = [15, 20, 25];
export const TALENT_TOTAL = 30;
export function talentPointsAt(level: number): number {
  const lv = Math.min(level, ENDGAME_LEVEL);
  if (lv < TALENT_START_LEVEL) return 0;
  return lv - TALENT_START_LEVEL + 1 + 2 * TALENT_BONUS_LEVELS.filter(l => lv >= l).length + (lv >= ENDGAME_LEVEL ? 1 : 0);
}
export interface LevelSave { level: number; xp: number; }

/** 满级 30（阶段四）：1 级 0 点，之后每级 1 点，共 29 点（一棵树点到终极 13 点，三棵树全点满要更多，仍然需要取舍）
 *  v0.9.7：MAX_LEVEL 固定表示「本体满级 = 本体终局门槛」（30），不随内容包变化；
 *  终局规则（长副本首领金币 RAID_BOSS_GOLD_MUL、EndgameIlvl 30 级起固定装等等）继续用它。
 *  真正的等级上限用 maxLevel()（= 30 + 已注册内容包 levelCapDelta 之和）。 */
export const MAX_LEVEL = 30;
/** 本体终局门槛（同 MAX_LEVEL，新代码写这个名字更清楚） */
export const ENDGAME_LEVEL = MAX_LEVEL;
/** v0.9.7 当前等级上限：本体 30；内容包 levelCapDelta 叠加（例：+10 → 40） */
export const maxLevel = (): number => MAX_LEVEL + levelCapDelta();

export class Progression {
  level = 1;
  xp = 0;
  onLevelUp: ((level: number) => void) | null = null;
  /** v0.9.7：读档时等级超过当前上限（例：装过内容包练到 35 级，再用本体打开）→ 运行时按上限生效，原值放这里；
   *  写存档时原样写回（本体到了上限不会再涨经验，所以只要没被重置就一直是原值） */
  held: LevelSave | null = null;
  /** cap 不传 = 跟随 maxLevel()（内容包注册后自动变化）；传了 = 固定上限（测试 / 旧调用） */
  constructor(private readonly cap?: number) {}
  get maxLevel(): number { return this.cap ?? maxLevel(); }

  /** 升到下一级需要的经验：前 10 级线性（100, 140, 180 …），10 级以后加二次项，后期新区域补足 */
  /** v0.9.9：30 级以前原公式不变；30 级起（只有内容包把上限抬高时才用得到）= 原公式 × (1.2 + 0.05 × (等级 − 30))，取整到 10 */
  xpToNext(level = this.level) { const b = 60 + 40 * level + 20 * Math.max(0, level - 10) ** 2; return level < ENDGAME_LEVEL ? b : Math.round(b * (1.2 + 0.05 * (level - ENDGAME_LEVEL)) / 10) * 10; }
  /** 从 1 级升到 lv 级累计需要的经验 */
  totalXpFor(lv: number) { let s = 0; for (let l = 1; l < lv; l++) s += this.xpToNext(l); return s; }
  /** v0.7.7 天赋树 2.0：1~9 级 0 点，10 级起每级 1 点（30 级 21 点） */
  /** v0.9.9：本体天赋点只算到本体终局门槛（30 级 = 21 点），31 级以上不再给本体天赋点（避免本体天赋树越点越满） */
  /** v1.2.58 天赋 3.0：等级部分 28 点（另有职业试炼 2 点，合计 30） */
  get talentPoints() { return talentPointsAt(this.level); }
  /** v0.9.9 扩展天赋点（v1.0.1 改为 5 点，见 core/PackTalents.ts） */
  get packTalentPoints() { return packTalentPointsAt(this.level); }   // v1.0.1：32/34/36/38/40 级各 1 点，共 5 点

  addXp(n: number): number {
    if (this.level >= this.maxLevel) return 0;
    this.xp += n;
    let gained = 0;
    while (this.level < this.maxLevel && this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      gained++;
      this.onLevelUp?.(this.level);
    }
    if (this.level >= this.maxLevel) this.xp = 0;
    return gained;
  }

  save(): LevelSave {
    // 被压到上限的原等级：只要还在上限（没被重置成更低等级），就写回原值，不丢等级和经验
    if (this.held && this.level >= this.maxLevel) return { ...this.held };
    return { level: this.level, xp: this.xp };
  }
  load(s: LevelSave) {
    const lv = Math.max(1, s.level);
    // v0.9.7：超过当前上限的不再丢弃，原样记住（xp 也原样，不做 |0 / 夹取，写回时完全一致）
    this.held = lv > this.maxLevel ? { level: s.level, xp: s.xp } : null;
    this.level = Math.min(this.maxLevel, lv); this.xp = this.level >= this.maxLevel ? 0 : Math.max(0, s.xp | 0);
  }
  /** 存档里的真实等级（被上限压住时是原值） */
  get savedLevel(): number { return this.held && this.level >= this.maxLevel ? this.held.level : this.level; }
}

/**
 * v0.7.4：天赋按技能槽位强化——点名某个技能的天赋（match.skillIds）改成作用于该技能所在的槽位，
 * 技能书换成同槽位的其他技能后天赋照样生效。slotOf 找不到槽位（普通攻击以外的特殊技能）时保持原样。
 */
export function slotTalents<T extends { modifier: import('./types').ModifierDef }>(nodes: T[], slotOf: (skillId: string) => import('./types').SlotId | undefined, origin?: { elementOf: (skillId: string) => import('./types').Element | undefined; slotElements: Partial<Record<import('./types').SlotId, import('./types').Element>> }): T[] {
  type M = import('./types').ModifierDef['match'];
  return nodes.map(n => {
    const mt = n.modifier.match;
    const fx = n.modifier.ops.some(o => (o.op === 'addEffect' && 'element' in o.effect) || o.op === 'rename');
    // v1.2.66 槽位继承：本系元素天赋也作用于「原技能是该元素」的槽位（换了闪电链照样吃火焰天赋）
    if (mt.elements?.length && !mt.skillIds?.length && origin) {
      const es = (Object.keys(origin.slotElements) as import('./types').SlotId[]).filter(s => mt.elements!.includes(origin.slotElements[s]!) && (!mt.slots || mt.slots.includes(s)));
      const m2: M = { ...mt, ...(es.length ? { elementSlots: es } : {}), ...(fx ? { adaptFrom: mt.elements } : {}) };
      return { ...n, modifier: { ...n.modifier, match: m2 } };
    }
    const ids = mt.skillIds;
    if (!ids?.length) return n;
    const slots = ids.map(slotOf);
    if (slots.some(s => !s)) return n;
    const { skillIds: _drop, ...rest } = mt;
    const src = origin ? [...new Set(ids.map(origin.elementOf).filter(Boolean))] as import('./types').Element[] : [];
    const m2: M = { ...rest, slots: [...new Set(slots as import('./types').SlotId[])], ...(fx && src.length ? { adaptFrom: src } : {}), ...(n.modifier.ops.some(o => o.op === 'rename' && o.name) ? { renameFor: ids } : {}) };
    return { ...n, modifier: { ...n.modifier, match: m2 } };
  });
}
