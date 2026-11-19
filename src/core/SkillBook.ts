// ========== v0.6.8：技能书 + 符文 + 熟练度（引擎无关） ==========
// - 每个技能槽 3 选 1：原技能开局就会，另外两个要学技能书（指定书 / 自选书 / 5 张书页合成自选书）
// - 熟练度：每次施放 +max(1, round(冷却/5))；100 / 300 / 600 解锁该技能的 3 枚符文
// - 每个技能同一时间装 1 枚符文；换技能、换符文只能在营地（非战斗）进行，由界面判断
// 存档：GameSave.skillbook（可选字段；老存档没有 = 只会原技能、熟练度 0）
import { SkillDef, SlotId, ModifierDef, Element } from './types';
import { RuneDef, PresetDef } from '../data/skillbook';

export interface SkillBookSave { learned: string[]; equip: Partial<Record<SlotId, string>>; mastery: Record<string, number>; rune: Record<string, string>; tomesGiven?: number[] }

export interface SkillBookData {
  /** 职业的全部技能（原技能 + 新技能） */
  skills: Record<string, SkillDef>;
  /** 原来的配装（开局就会） */
  defaults: Record<SlotId, string>;
  choices: Partial<Record<SlotId, string[]>>;
  runes: RuneDef[];
  presets: PresetDef[];
  /** v1.0.1：只能由扩展天赋学会的技能（不进「未学会」列表、技能书不能学、存档里的不读，按天赋重新学） */
  talentOnly?: ReadonlySet<string>;
}

export const masteryGain = (s: SkillDef) => Math.max(1, Math.round(s.stats.cooldown / 5));

export class SkillBook {
  learned = new Set<string>();
  equip: Partial<Record<SlotId, string>> = {};
  mastery: Record<string, number> = {};
  rune: Record<string, string> = {};
  tomesGiven: number[] = [];
  /** v1.0.1：存档里装着、但要等扩展天赋重新学会的技能 */
  pendingEquip: Partial<Record<SlotId, string>> = {};
  constructor(readonly data: SkillBookData) { this.reset(); }

  reset() {
    this.learned = new Set(Object.values(this.data.defaults));
    this.equip = { ...this.data.defaults };
    this.mastery = {}; this.rune = {}; this.tomesGiven = [];
  }

  /** 某槽位的 3 个选项 */
  options(slot: SlotId): SkillDef[] { return (this.data.choices[slot] ?? [this.data.defaults[slot]]).map(id => this.data.skills[id]).filter(Boolean); }
  /** v1.0.1：忘掉一个技能（扩展天赋退掉终极天赋时）；装着的话换回该槽默认技能。返回是否原来装着 */
  forget(id: string): boolean {
    this.learned.delete(id);
    const sl = (Object.keys(this.equip) as SlotId[]).find(k => this.equip[k] === id);
    if (sl) this.equip[sl] = this.data.defaults[sl];
    return !!sl;
  }
  /** 当前装在某槽位的技能 */
  skillAt(slot: SlotId): SkillDef { return this.data.skills[this.equip[slot] ?? this.data.defaults[slot]] ?? this.data.skills[this.data.defaults[slot]]; }
  slotOf(skillId: string): SlotId | undefined { return (Object.keys(this.data.choices) as SlotId[]).find(s => this.data.choices[s]!.includes(skillId)); }
  /**
   * v0.9.1l：装备 / 套装 / 橙装 / 暗金里按技能 ID 写的修饰器，换成同槽的新技能后仍然生效（改成按槽位匹配）。
   * 符文绑定单个技能，不改。改形态的整名重命名（如「熔岩旋风斩」）在当前不是原技能时改成前缀（「熔岩·顺劈斩」）。
   */
  remapToSlot(m: ModifierDef): ModifierDef {
    const ids = m.match.skillIds;
    if (!ids?.length || m.source === 'rune') return m;
    const slots = ids.map(id => this.slotOf(id));
    if (slots.some(s => !s)) return m;
    const uniq = [...new Set(slots as SlotId[])];
    const cur = uniq.map(s => this.skillAt(s)?.id);
    if (cur.every(id => id && ids.includes(id))) return m;   // 当前装的就是原技能：原样
    const key = m.id + '|' + cur.join(',');
    const hit = this.remapCache.get(key);
    if (hit) return hit;
    const { skillIds: _drop, ...rest } = m.match;
    const orig = ids.map(id => this.data.skills[id]?.name ?? '').filter(Boolean);
    const ops = m.ops.map(op => {
      if (op.op !== 'rename' || !op.name) return op;
      const n = op.name;
      let pre = n.includes('·') ? n.split('·')[0] : (orig.find(o => n.endsWith(o)) ? n.slice(0, n.length - orig.find(o => n.endsWith(o))!.length) : n.slice(0, 2));
      if (!pre) pre = n.slice(0, 2);
      return { ...op, name: undefined, prefix: (op.prefix ?? '') + pre + '·' };
    });
    const out: ModifierDef = { ...m, match: { ...rest, slots: uniq }, ops: ops as ModifierDef['ops'] };
    this.remapCache.set(key, out);
    return out;
  }
  private remapCache = new Map<string, ModifierDef>();
  isLearned(id: string) { return this.learned.has(id); }
  /** 还没学会的新技能 */
  unlearned(): string[] { return (Object.values(this.data.choices).flat() as string[]).filter(id => !this.learned.has(id) && !this.data.talentOnly?.has(id)); }

  learn(id: string, viaTalent = false): boolean {
    if (!this.data.skills[id] || this.learned.has(id) || !this.slotOf(id)) return false;
    if (this.data.talentOnly?.has(id) && !viaTalent) return false;
    this.learned.add(id);
    const ps = (Object.keys(this.pendingEquip) as SlotId[]).find(k => this.pendingEquip[k] === id);
    if (ps) { this.equip[ps] = id; delete this.pendingEquip[ps]; }
    return true;
  }
  /** 换技能：必须学会、必须是这个槽位的选项 */
  setSkill(slot: SlotId, id: string): string | null {
    if (!(this.data.choices[slot] ?? []).includes(id)) return '这个技能不能放进这个槽位';
    if (!this.learned.has(id)) return '还没学会（需要技能书）';
    this.equip[slot] = id; return null;
  }

  // ---- 熟练度 / 符文
  runesOf(id: string): RuneDef[] { return this.data.runes.filter(r => r.skillId === id); }
  runeUnlocked(r: RuneDef) { return (this.mastery[r.skillId] ?? 0) >= r.need; }
  /** 施放一次：加熟练度，返回这次新解锁的符文 */
  addCast(id: string): RuneDef[] {
    const def = this.data.skills[id];
    if (!def || def.slot === 'basic') return [];
    const before = this.mastery[id] ?? 0, after = before + masteryGain(def);
    this.mastery[id] = after;
    return this.runesOf(id).filter(r => before < r.need && after >= r.need);
  }
  setRune(skillId: string, runeId: string | null): string | null {
    if (runeId === null) { delete this.rune[skillId]; return null; }
    const r = this.data.runes.find(x => x.id === runeId && x.skillId === skillId);
    if (!r) return '没有这枚符文';
    if (!this.runeUnlocked(r)) return `熟练度不足（${this.mastery[skillId] ?? 0}/${r.need}）`;
    this.rune[skillId] = runeId; return null;
  }
  /** 装着的技能上生效的符文修饰器 */
  activeRuneMods(): ModifierDef[] {
    const out: ModifierDef[] = [];
    for (const slot of Object.keys(this.data.choices) as SlotId[]) {
      const id = this.skillAt(slot).id, rid = this.rune[id];
      const r = rid && this.data.runes.find(x => x.id === rid);
      if (r && this.runeUnlocked(r)) out.push(r.modifier);
    }
    return out;
  }
  /** 装着的符文带的元素（计入元素流派） */
  runeElements(): Element[] {
    return this.activeRuneMods().map(m => this.data.runes.find(r => r.id === m.id)?.element).filter(Boolean) as Element[];
  }

  /** 流派推荐卡：能套的都套上，返回跳过的说明 */
  applyPreset(p: PresetDef): string[] {
    const skipped: string[] = [];
    for (const [slot, id] of Object.entries(p.skills) as [SlotId, string][]) {
      const why = this.setSkill(slot, id);
      if (why) skipped.push(`${this.data.skills[id]?.name ?? id}：${why}`);
    }
    for (const [sid, rid] of Object.entries(p.runes)) {
      if (!this.learned.has(sid)) continue;
      const why = this.setRune(sid, rid);
      if (why) skipped.push(`${this.data.runes.find(r => r.id === rid)?.name ?? rid}：${why}`);
    }
    return skipped;
  }

  /** 到达 10/20/30 级：返回这次该送的自选书数量（每个等级只送一次） */
  tomesForLevel(level: number, levels: number[]): number {
    let n = 0;
    for (const lv of levels) if (level >= lv && !this.tomesGiven.includes(lv)) { this.tomesGiven.push(lv); n++; }
    return n;
  }

  save(): SkillBookSave { return { learned: [...this.learned], equip: { ...this.equip, ...this.pendingEquip }, mastery: { ...this.mastery }, rune: { ...this.rune }, tomesGiven: [...this.tomesGiven] }; }
  load(s?: SkillBookSave) {
    this.reset();
    if (!s) return;
    for (const id of s.learned ?? []) if (this.data.skills[id] && !this.data.talentOnly?.has(id)) this.learned.add(id);
    this.pendingEquip = {};
    for (const [slot, id] of Object.entries(s.equip ?? {}) as [SlotId, string][]) {
      if (this.learned.has(id) && (this.data.choices[slot] ?? []).includes(id)) this.equip[slot] = id;
      else if (this.data.talentOnly?.has(id) && (this.data.choices[slot] ?? []).includes(id)) this.pendingEquip[slot] = id;   // v1.0.1：等天赋重新学会后再装回去
    }
    for (const [id, v] of Object.entries(s.mastery ?? {})) if (this.data.skills[id] && typeof v === 'number' && v >= 0) this.mastery[id] = Math.floor(v);
    for (const [id, rid] of Object.entries(s.rune ?? {})) this.setRune(id, rid);
    this.tomesGiven = [...(s.tomesGiven ?? [])];
  }
}

/** v1.2.66 槽位继承：原配技能的元素（天赋 / 元素关键按槽位继承用） */
export function slotOrigin(sb: SkillBook) {
  const slotElements: Partial<Record<SlotId, import('./types').Element>> = {};
  for (const [s, id] of Object.entries(sb.data.defaults) as [SlotId, string][]) { const e = sb.data.skills[id]?.element; if (e) slotElements[s] = e; }
  return { elementOf: (id: string) => sb.data.skills[id]?.element, slotElements };
}
/** v1.2.66：当前装备里「原技能是 el 元素」的槽位上的技能元素（炽燃 / 爆燃等按元素判定的关键也跟着换上的技能走） */
export function inheritedElements(sb: SkillBook, el: import('./types').Element): Set<string> {
  const out = new Set<string>([el]);
  for (const [s, id] of Object.entries(sb.data.defaults) as [SlotId, string][]) {
    if (sb.data.skills[id]?.element !== el) continue;
    const cur = sb.skillAt(s); if (cur) out.add(cur.element);
  }
  return out;
}
