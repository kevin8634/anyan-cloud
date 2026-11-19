// ======================================================================
// v1.0.1：内容包扩展天赋层（引擎无关；只放通用词，不出现具体 DLC 的名字 / 文本）
//
// 规则（Rhett 2026-10-22 定）
// - 31–40 级共 5 个扩展天赋点：32 / 34 / 36 / 38 / 40 级各 1 点（PACK_TALENT_LEVELS）。
// - 扩展天赋层分 5 层，每层只能选 1 个，1 个天赋 = 1 点；第 k 层需要 k 点、且第 k−1 层已选。
// - 每层的候选数由包决定（DLC1：1 / 2 / 1 / 2 / 3）；最后一层是「终极天赋」，给一个新技能（skill 字段）。
// - 和本体天赋页独立：只有 1 套（不随天赋页切换），存档放在 dlc.<包 id>.talents。
// ======================================================================
import type { ModifierDef } from './types';
import type { TalentStats } from './TalentTree';
import type { TalentNode } from './Loadout';

/** 扩展天赋点的发放等级（第 n 个点在 PACK_TALENT_LEVELS[n-1] 级给） */
export const PACK_TALENT_LEVELS = [32, 34, 36, 38, 40];
export const packTalentPointsAt = (level: number) => PACK_TALENT_LEVELS.filter(l => level >= l).length;

export interface PackTalentNodeDef {
  id: string;
  name: string;
  desc: string;
  icon?: string;
  /** 角色属性（同本体天赋口径：生命 / 护甲 / 强度 / 暴击率% / 暴击伤害% / 急速% / 移速%） */
  stats?: Partial<TalentStats>;
  /** 技能修饰器（同本体天赋，source = talent） */
  modifier?: Omit<ModifierDef, 'id' | 'source'>;
  extra?: Omit<ModifierDef, 'id' | 'source'>[];
  /** 终极天赋：选中后学会这个技能（技能定义由包的 skills 挂载提供），放进技能书对应槽位的可选项 */
  skill?: string;
}
/** 扩展天赋层（某个职业的一棵）：layers[k] = 第 k+1 层的候选 */
export interface PackTalentTierDef {
  id: string;
  /** 页签上的名字（包自己起，例如「xx 专属天赋」） */
  name: string;
  /** 适用职业 */
  cls: string;
  /** 一句话简介 */
  desc?: string;
  layers: PackTalentNodeDef[][];
}
/** 存档：层序号 → 选中的节点 id（null = 没选） */
export type PackTalentSave = (string | null)[];

export class PackTalentState {
  picks: (string | null)[];
  constructor(readonly def: PackTalentTierDef, public points = 0) { this.picks = def.layers.map(() => null); }
  get spent() { return this.picks.filter(Boolean).length; }
  get available() { return Math.max(0, this.points - this.spent); }
  layerOf(id: string) { return this.def.layers.findIndex(l => l.some(n => n.id === id)); }
  node(id: string) { return this.def.layers.flat().find(n => n.id === id) ?? null; }
  picked(id: string) { return this.picks.includes(id); }
  /** 第 k 层（0 起）需要的点数 */
  need(k: number) { return k + 1; }
  layerOpen(k: number) { return this.points >= this.need(k) && (k === 0 || !!this.picks[k - 1]); }
  whyCannotPick(id: string): string | null {
    const k = this.layerOf(id);
    if (k < 0) return '没有这个天赋';
    if (this.picks[k] === id) return '已选';
    if (this.points < this.need(k)) return `需要 ${this.need(k)} 个扩展天赋点（${PACK_TALENT_LEVELS[k]} 级）`;
    if (k > 0 && !this.picks[k - 1]) return '先选上一层';
    // 换选同层另一个不额外花点；新选要有剩余点数
    if (!this.picks[k] && this.available <= 0) return '没有扩展天赋点';
    return null;
  }
  /** 选中（同层已选的会被替换） */
  pick(id: string): boolean {
    if (this.whyCannotPick(id)) return false;
    this.picks[this.layerOf(id)] = id; return true;
  }
  whyCannotUnpick(k: number): string | null {
    if (!this.picks[k]) return '这一层没选';
    if (this.picks.slice(k + 1).some(Boolean)) return '先退掉下面几层';
    return null;
  }
  unpick(k: number): boolean { if (this.whyCannotUnpick(k)) return false; this.picks[k] = null; return true; }
  reset() { this.picks = this.def.layers.map(() => null); }
  /** 点数变少（读档等级被夹 / 换构建）时从最下层开始退 */
  clamp() { for (let k = this.picks.length - 1; k >= 0; k--) if (this.picks[k] && (this.points < this.need(k) || (k > 0 && !this.picks[k - 1]))) this.picks[k] = null; }
  nodes(): PackTalentNodeDef[] { return this.picks.map(id => (id ? this.node(id) : null)).filter((n): n is PackTalentNodeDef => !!n); }
  /** 给 Loadout 的修饰器（和本体天赋同格式，层号 = 本体层数 + k） */
  activeNodes(baseTier = 7): TalentNode[] {
    const out: TalentNode[] = [];
    this.picks.forEach((id, k) => {
      const n = id ? this.node(id) : null; if (!n) return;
      if (n.modifier) out.push({ id: n.id, tier: baseTier + k, modifier: { ...n.modifier, id: `ptalent:${n.id}`, source: 'talent', desc: n.desc } as ModifierDef });
      (n.extra ?? []).forEach((m, i) => out.push({ id: `${n.id}#${i}`, tier: baseTier + k, modifier: { ...m, id: `ptalent:${n.id}#${i}`, source: 'talent', desc: n.desc } as ModifierDef }));
    });
    return out;
  }
  charStats(): Partial<TalentStats> {
    const s: Partial<TalentStats> = {};
    for (const n of this.nodes()) for (const [k, v] of Object.entries(n.stats ?? {}) as [keyof TalentStats, number][]) s[k] = (s[k] ?? 0) + v;
    return s;
  }
  /** 选中的终极天赋给的技能 */
  skills(): string[] { return this.nodes().map(n => n.skill).filter((x): x is string => !!x); }
  /** 所有终极天赋能给的技能（没选的要从技能书里拿掉） */
  allSkills(): string[] { return this.def.layers.flat().map(n => n.skill).filter((x): x is string => !!x); }
  save(): PackTalentSave { return [...this.picks]; }
  load(s: unknown) {
    this.reset();
    if (!Array.isArray(s)) return;
    s.forEach((id, k) => { if (k < this.picks.length && typeof id === 'string' && this.def.layers[k].some(n => n.id === id)) this.picks[k] = id; });
    this.clamp();
  }
}
