import { SkillDef } from './types';

interface CastRecord { skillId: string; tags: string[]; time: number; consumed: Set<string>; }

/** 记录最近释放的技能，用来判断「技能组合」类修饰器 */
export class ComboTracker {
  private history: CastRecord[] = [];
  constructor(private keepSeconds = 10) {}

  record(skill: { baseId: string; tags: string[] } | SkillDef, now: number) {
    const id = 'baseId' in skill ? skill.baseId : skill.id;
    this.history.push({ skillId: id, tags: [...skill.tags], time: now, consumed: new Set() });
    this.history = this.history.filter(r => now - r.time <= this.keepSeconds);
  }

  /** 查找满足条件、且未被该修饰器消耗过的最近一次释放 */
  find(now: number, within: number, modId: string, skillId?: string, tag?: string): CastRecord | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const r = this.history[i];
      if (now - r.time > within) break;
      if (r.consumed.has(modId)) continue;
      if (skillId && r.skillId !== skillId) continue;
      if (tag && !r.tags.includes(tag)) continue;
      return r;
    }
    return undefined;
  }

  consume(record: CastRecord, modId: string) { record.consumed.add(modId); }
}
