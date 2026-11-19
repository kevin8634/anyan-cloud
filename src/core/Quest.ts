// ========== 任务系统（引擎无关，可存档） ==========
// 目标类型：击杀某类怪、从怪身上收集任务物品、通关副本、找 NPC 对话、探索某个地点
// 状态：locked(前置未完成/等级不够) → available(可接) → active(进行中) → ready(可交) → done
import { ItemSlot } from './Loadout';
export type Objective =
  | { type: 'kill'; target: string; count: number; label: string }
  | { type: 'collect'; target: string; chance: number; count: number; label: string }   // 杀 target 有概率掉任务物品
  | { type: 'clear'; dungeonId: string; label: string }
  | { type: 'talk'; npc: string; label: string }
  | { type: 'explore'; area: string; label: string };                                     // 走到某个地点（区域 id 见 data/world_map.ts）

/** 目标需要的次数：击杀/收集 = count，其它 = 1 */
export const objectiveMax = (o: Objective) => (o.type === 'kill' || o.type === 'collect' ? o.count : 1);

export interface QuestReward { xp: number; gold: number; item?: { minQuality: 'green' | 'blue' | 'purple' | 'orange'; slots?: ItemSlot[] }; stacks?: { id: string; count: number }[] }

export interface QuestDef {
  id: string;
  name: string;
  giver: string;            // 接任务 NPC
  turnIn: string;           // 交任务 NPC
  minLevel: number;
  requires?: string[];      // 前置任务
  text: string;             // 接任务时 NPC 说的话
  doneText: string;         // 交任务时 NPC 说的话
  objectives: Objective[];
  reward: QuestReward;
  /** 可反复完成（悬赏）：交付后不进已完成列表，马上可以再接 */
  repeatable?: boolean;
  /** v0.7.2-br.A 职业任务：只对这个职业出现（QuestLog.classId） */
  cls?: string;
  /** v1.1.0 额外前置条件（内容包用，如「做过某个选择」）：返回 false = 锁定；只影响还没接的任务 */
  gate?: () => boolean;
  /** v1.1.0 额外的重要任务标识（任务名后面红字「（xx）」，同 data/quest_tags KEY_QUESTS） */
  tags?: string[];
}

export type QuestState = 'locked' | 'available' | 'active' | 'ready' | 'done';
export interface QuestSave { active: Record<string, number[]>; done: string[]; }

export interface QuestEvents {
  onProgress?(q: QuestDef, text: string): void;
  onReady?(q: QuestDef): void;
}

export class QuestLog {
  private progress = new Map<string, number[]>();  // 进行中任务的每个目标进度
  private done = new Set<string>();
  events: QuestEvents = {};
  /** 当前职业：带 cls 的职业任务只对这个职业可见 */
  classId?: string;

  constructor(readonly defs: QuestDef[], private rng: () => number = Math.random) {}

  def(id: string) { return this.defs.find(q => q.id === id)!; }

  state(id: string, level: number): QuestState {
    if (this.done.has(id)) return 'done';
    const p = this.progress.get(id);
    if (p) return this.isComplete(this.def(id), p) ? 'ready' : 'active';
    const q = this.def(id);
    if (q.cls && this.classId && q.cls !== this.classId) return 'locked';
    if (level < q.minLevel || (q.requires ?? []).some(r => !this.done.has(r))) return 'locked';
    if (q.gate && !q.gate()) return 'locked';
    return 'available';
  }

  /** NPC 头顶标记：! 可接，? 可交，灰色 ? 进行中 */
  npcMarker(npc: string, level: number): '!' | '?' | '…' | '' {
    const qs = this.defs;
    if (qs.some(q => q.turnIn === npc && this.state(q.id, level) === 'ready')) return '?';
    if (qs.some(q => q.giver === npc && this.state(q.id, level) === 'available')) return '!';
    if (qs.some(q => q.turnIn === npc && this.state(q.id, level) === 'active')) return '…';
    return '';
  }

  /** 和 NPC 对话时可做的事 */
  npcQuests(npc: string, level: number) {
    return this.defs
      .map(q => ({ q, s: this.state(q.id, level) }))
      .filter(({ q, s }) => (q.giver === npc && s === 'available') || (q.turnIn === npc && (s === 'ready' || s === 'active')));
  }

  accept(id: string, level: number): boolean {
    if (this.state(id, level) !== 'available') return false;
    this.progress.set(id, this.def(id).objectives.map(() => 0));
    return true;
  }

  /** 交任务；返回奖励，由外部发放 */
  turnIn(id: string, level: number): QuestReward | null {
    if (this.state(id, level) !== 'ready') return null;
    this.progress.delete(id);
    if (!this.def(id).repeatable) this.done.add(id);
    return this.def(id).reward;
  }

  abandon(id: string) { this.progress.delete(id); }

  active(): { q: QuestDef; p: number[]; ready: boolean }[] {
    return [...this.progress].map(([id, p]) => ({ q: this.def(id), p, ready: this.isComplete(this.def(id), p) }));
  }

  objectiveText(o: Objective, v: number) {
    const max = objectiveMax(o);
    return `${o.label} ${Math.min(v, max)}/${max}`;
  }

  // ---------- 事件入口 ----------
  onKill(kind: string) {
    this.bump(o => (o.type === 'kill' && o.target === kind) || (o.type === 'collect' && o.target === kind && this.rng() < o.chance));
  }
  onDungeonClear(dungeonId: string) { this.bump(o => o.type === 'clear' && o.dungeonId === dungeonId); }
  onTalk(npc: string) { this.bump(o => o.type === 'talk' && o.npc === npc); }
  onExplore(area: string) { this.bump(o => o.type === 'explore' && o.area === area); }
  /** 进行中任务里还没完成的探索目标（引擎层按位置检测） */
  pendingExplores(): string[] {
    const out: string[] = [];
    for (const [id, p] of this.progress) this.def(id).objectives.forEach((o, i) => { if (o.type === 'explore' && p[i] < 1) out.push(o.area); });
    return out;
  }

  private bump(match: (o: Objective) => boolean) {
    for (const [id, p] of this.progress) {
      const q = this.def(id);
      const wasReady = this.isComplete(q, p);
      q.objectives.forEach((o, i) => {
        const max = objectiveMax(o);
        if (p[i] < max && match(o)) { p[i]++; this.events.onProgress?.(q, this.objectiveText(o, p[i])); }
      });
      if (!wasReady && this.isComplete(q, p)) this.events.onReady?.(q);
    }
  }

  private isComplete(q: QuestDef, p: number[]) {
    return q.objectives.every((o, i) => p[i] >= objectiveMax(o));
  }

  save(): QuestSave { return { active: Object.fromEntries(this.progress), done: [...this.done] }; }
  load(s: QuestSave) {
    this.progress.clear(); this.done.clear();
    for (const [id, p] of Object.entries(s.active ?? {})) if (this.defs.some(q => q.id === id)) this.progress.set(id, p);
    (s.done ?? []).forEach(id => this.done.add(id));
  }
}
