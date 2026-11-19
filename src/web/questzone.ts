import { isMainQuest } from '../data/quest_tags';
// ========== v1.2.68 任务区域标注（任务日志绿色小字 + 当前地图任务置顶 + 怪物悬停任务进度） ==========
// 区域来源（按顺序）：
//   1. 副本 / 长副本首领（raidboss_<id>）→ 所在副本名（「沙葬王陵 · 副本」）；剧情最终战 → 暗岩深渊
//   2. 任务目标在大地图上的地点（world_map.locateObjective）→ 地图名
//   3. 任务自带的 zone 字段（内容包 / 资料片任务可以直接写）
//   4. 按任务名 / 目标文字里的关键词兜底（爬塔、深渊、暗金、副本名……）
// 可交付的任务标交付 NPC 所在地。
import { QuestDef, Objective, objectiveMax } from '../core/Quest';
import { locateObjective, NPC_HOME } from '../data/world_map';
import { RAIDS } from '../data/raids';
import { MAP_NAME } from './title';
import { inRaid, raidName, inAbyss } from './raid';

export interface QZone { key: string; name: string; kind: 'map' | 'dungeon' | 'raid' | 'abyss' | 'tower' | 'other' }

let bossZone: Map<string, QZone> | null = null;
function bossTable(): Map<string, QZone> {
  if (bossZone) return bossZone;
  bossZone = new Map();
  for (const r of Object.values(RAIDS)) {
    const kind = r.kind === 'dungeon' ? 'dungeon' : 'raid';
    const z: QZone = { key: 'raid:' + r.name, name: `${r.name} · ${kind === 'dungeon' ? '副本' : '长副本'}`, kind };
    for (const b of r.bosses) bossZone.set('raidboss_' + b.id, z);
    for (const m of Object.keys(r.mobs ?? {})) if (!bossZone.has(m)) bossZone.set(m, z);
  }
  bossZone.set('story_heart', ABYSS);
  return bossZone;
}
const ABYSS: QZone = { key: 'raid:暗岩深渊', name: '暗岩深渊', kind: 'abyss' };
const mapZone = (m: string): QZone => ({ key: 'map:' + m, name: MAP_NAME(m), kind: 'map' });

/** 关键词兜底：没写地点的副本 / 爬塔 / 暗金任务 */
const KEYWORDS: [RegExp, () => QZone][] = [
  [/深渊|暗岩之心|爬塔|第\s*\d+\s*层/, () => ABYSS],
  [/瞭望塔|登塔/, () => ({ key: 'tower', name: '野外瞭望塔', kind: 'tower' })],
  [/暗金|典藏/, () => ({ key: 'map:camp', name: '灰石营地 · 暗金典藏', kind: 'other' })],
];
function byKeyword(text: string): QZone | null {
  for (const r of Object.values(RAIDS)) if (text.includes(r.name)) return bossTable().get('raidboss_' + r.bosses[0].id) ?? null;
  for (const [re, f] of KEYWORDS) if (re.test(text)) return f();
  return null;
}

/** 一个目标所在区域（找不到返回 null） */
export function objectiveZone(o: Objective): QZone | null {
  if (o.type === 'kill' || o.type === 'collect') { const z = bossTable().get(o.target); if (z) return z; }
  const pt = locateObjective(o);
  if (pt) return mapZone(pt.map);
  return byKeyword(o.label ?? '');
}

/** 任务当前所在区域：可交付 → 交付 NPC；否则所有没完成目标的区域（去重） */
export function questZones(q: QuestDef & { zone?: string }, p: number[], ready: boolean): QZone[] {
  if (ready) { const h = NPC_HOME[q.turnIn]; if (h) return [mapZone(h.map)]; }
  const out: QZone[] = [];
  q.objectives.forEach((o, i) => {
    if ((p[i] ?? 0) >= objectiveMax(o)) return;
    const z = objectiveZone(o); if (z && !out.some(x => x.key === z.key)) out.push(z);
  });
  if (!out.length && q.zone) out.push({ key: 'custom:' + q.zone, name: q.zone, kind: 'other' });
  if (!out.length) { const z = byKeyword(q.name + ' ' + q.objectives.map(o => o.label).join(' ')); if (z) out.push(z); }
  return out;
}

/** 区域文字（多个区域用「 / 」连，最多 2 个） */
export function zoneText(zs: QZone[]): string {
  if (!zs.length) return '各地';
  if (zs.length === 1) return zs[0].name;
  const short = zs.map(z => z.name.replace(/ · (长)?副本$/, ''));
  const kind = zs.every(z => z.kind === 'dungeon') ? '副本' : zs.every(z => z.kind === 'raid') ? '长副本' : '';
  return zs.length === 2 ? short.join(' / ') + (kind ? ` · ${kind}` : '') : `${short[0]} 等 ${zs.length} 处${kind ? kind : ''}`;
}
/** 排序权重：0 = 就在当前地图 / 副本里；1 = 当前地图上的副本入口；2 = 其它 */
export function zoneRank(zs: QZone[], curMap: string, curRaid: string | null): number {
  if (zs.some(z => (curRaid && z.key === 'raid:' + curRaid) || (!curRaid && z.key === 'map:' + curMap))) return 0;
  if (!curRaid) for (const z of zs) if (z.kind === 'dungeon' || z.kind === 'raid') {
    const r = Object.values(RAIDS).find(x => 'raid:' + x.name === z.key);
    if (r && (r.wild ?? 'ember') === curMap) return 1;
  }
  return 2;
}

/** 某种怪关联的进行中任务进度（怪物悬停提示用）：kind 可以是多个（金鬃也算野猪） */
export function questProgressFor(active: { q: QuestDef; p: number[]; ready: boolean }[], kinds: string[], text: (o: Objective, v: number) => string) {
  const out: { quest: string; text: string; done: boolean }[] = [];
  for (const { q, p } of active) q.objectives.forEach((o, i) => {
    if ((o.type === 'kill' || o.type === 'collect') && kinds.includes(o.target)) out.push({ quest: q.name, text: text(o, p[i] ?? 0), done: (p[i] ?? 0) >= objectiveMax(o) });
  });
  return out;
}

/** 玩家现在在哪：curRaid = 所在副本 / 长副本 / 深渊名（不在副本里为 null） */
export function hereNow(curMap: string): { curMap: string; curRaid: string | null } {
  let curRaid: string | null = null;
  try { if (inAbyss()) curRaid = '暗岩深渊'; else if (inRaid()) curRaid = raidName(); } catch { /* 副本模块没加载 */ }
  return { curMap, curRaid };
}
/** 任务按「当前地图优先」排序（稳定排序，同组保持原顺序） */
export function sortByHere<T extends { q: QuestDef; p: number[]; ready: boolean }>(act: T[], curMap: string): (T & { zones: QZone[]; rank: number })[] {
  const h = hereNow(curMap);
  return act.map((a, i) => { const zones = questZones(a.q, a.p, a.ready); return { ...a, zones, rank: zoneRank(zones, h.curMap, h.curRaid), i }; })
    .sort((a, b) => a.rank - b.rank || +isMainQuest(b.q) - +isMainQuest(a.q) || a.i - b.i);   // v1.2.76 同区域主线置顶
}
/** 绿色区域小字 HTML */
export const zoneTag = (zs: QZone[], rank: number) => `<span class="qzone${rank === 0 ? ' here' : ''}">${rank === 0 ? '◉ 当前区域 · ' : '◎ '}${zoneText(zs)}</span>`;
