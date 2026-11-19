// ========== 任务指引（引擎无关） ==========
// 根据任务进度算出“现在该去哪”：第一个没完成的目标所在地点，任务可交时指向交任务的 NPC；
// 目标在别的区域时，沿区域之间的传送点找下一站（广度优先）
import { QuestLog, QuestDef, Objective, objectiveMax } from './Quest';

export interface MapPoint { map: string; x: number; z: number; r?: number }
export interface MapLink { from: string; to: string; x: number; z: number; name: string }

export interface GuideTarget {
  questId: string;
  questName: string;
  label: string;           // 目标文字（「击杀鬃背野猪 3/8」「回去找罗文」）
  point: MapPoint;
  kind: 'objective' | 'turnin';
  objIndex: number;        // -1 = 交任务
}

/** 一个任务当前的指引目标 */
export function questTarget(log: QuestLog, q: QuestDef, p: number[], ready: boolean,
  locate: (o: Objective) => MapPoint | null, npcHome: Record<string, MapPoint>, npcName: (id: string) => string): GuideTarget | null {
  if (ready) {
    const h = npcHome[q.turnIn];
    return h ? { questId: q.id, questName: q.name, label: `回去找${npcName(q.turnIn)}`, point: { ...h, r: 2.5 }, kind: 'turnin', objIndex: -1 } : null;
  }
  for (let i = 0; i < q.objectives.length; i++) {
    const o = q.objectives[i];
    if (p[i] >= objectiveMax(o)) continue;
    const pt = locate(o);
    if (pt) return { questId: q.id, questName: q.name, label: log.objectiveText(o, p[i]), point: pt, kind: 'objective', objIndex: i };
  }
  return null;
}

/** 从 from 区域去 to 区域，下一站走哪个传送点；同区域或到不了返回 null */
export function nextHop(from: string, to: string, links: MapLink[]): MapLink | null {
  if (from === to) return null;
  const prev = new Map<string, MapLink>();
  const seen = new Set([from]); const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const l of links) if (l.from === cur && !seen.has(l.to)) {
      seen.add(l.to); prev.set(l.to, l); q.push(l.to);
      if (l.to === to) {
        let hop = l;
        while (hop.from !== from) hop = prev.get(hop.from)!;
        return hop;
      }
    }
  }
  return null;
}

/** 追踪列表：最多 max 个，保持用户手动追踪的顺序，空位用进行中的任务补齐 */
export function trackedList(activeIds: string[], tracked: string[], max = 3): string[] {
  const out = tracked.filter(id => activeIds.includes(id));
  for (const id of activeIds) { if (out.length >= max) break; if (!out.includes(id)) out.push(id); }
  return out.slice(0, max);
}
