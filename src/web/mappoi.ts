// v0.6.9：地图图例（兴趣点）——营地 / 传送阵、普通副本、三首领副本、长副本、野外首领、稀有首领、世界事件、任务
// 大地图（世界 / 区域）、小地图边缘箭头、悬停说明共用；野外首领刷新倒计时、稀有首领「发现后显示」、击杀次数（存档 mapStats，可选字段）
import type { Ctx } from './main';
import { MAPS, MapId, MAP_LINKS, AREAS } from '../data/world_map';
import { WILD, isWildId } from '../data/zones_wild';
import { RAIDS } from '../data/raids';
import { CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN, FIELD_MOBS } from '../data/zone_field';
import { worldEvents } from './travel';
import { allTargets } from './shopmap';
import { wbPois } from './worldboss';
import { exPois } from './explore';
import { dynPois } from './regional';

let CX!: Ctx;
export type PoiKind = 'camp' | 'portal' | 'dungeon' | 'dungeon3' | 'raid' | 'wildboss' | 'rare' | 'event' | 'quest' | 'cquest' | 'tower' | 'chest' | 'waystone';
export const POI_STYLE: Record<PoiKind, { name: string; color: string; glyph: string }> = {
  camp: { name: '营地', color: '#2a6aa8', glyph: '⌂' },
  portal: { name: '传送阵', color: '#9a4dff', glyph: '◎' },
  dungeon: { name: '普通副本', color: '#b03020', glyph: '◉' },
  dungeon3: { name: '三首领副本', color: '#d05a10', glyph: '♜' },
  raid: { name: '长副本', color: '#6a1a8a', glyph: '♛' },
  wildboss: { name: '野外首领', color: '#e07000', glyph: '☠' },
  rare: { name: '稀有首领', color: '#a060e0', glyph: '✦' },
  event: { name: '世界事件', color: '#e04010', glyph: '✸' },
  quest: { name: '任务', color: '#e0a000', glyph: '◆' },
  cquest: { name: '职业任务', color: '#2a6ad0', glyph: '✧' },   // v0.7.4-br.A 第 10 类
  tower: { name: '瞭望塔', color: '#4a8ab0', glyph: '♖' },   // v0.9.3e
  chest: { name: '宝箱', color: '#c89020', glyph: '▣' },
  waystone: { name: '传送石', color: '#1a9a90', glyph: '⟡' },   // v0.9.5a
};
/** 图例顺序（营地和传送阵合在一格） */
export const LEGEND_ORDER: PoiKind[] = ['camp', 'portal', 'dungeon', 'dungeon3', 'raid', 'wildboss', 'rare', 'event', 'quest', 'cquest', 'tower', 'chest', 'waystone'];

export interface Poi { kind: PoiKind; name: string; x: number; z: number; sub?: string; state?: string; live?: boolean; dim?: boolean; key?: string; /** v0.9.3i 副本入口：点击打开副本地图 */ did?: string }

/** 存档：野外 / 稀有首领击杀次数、已发现的稀有首领刷新点 */
export const mapStats: { kills: Record<string, number>; rareSeen: string[] } = { kills: {}, rareSeen: [] };
export function mapStatsSave() { return { kills: { ...mapStats.kills }, rareSeen: [...mapStats.rareSeen] }; }
export function mapStatsLoad(s?: { kills?: Record<string, number>; rareSeen?: string[] }) { mapStats.kills = { ...(s?.kills ?? {}) }; mapStats.rareSeen = [...(s?.rareSeen ?? [])]; }

const fmt = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒` : `${Math.max(0, Math.round(sec))} 秒`;
const live = (kind: string, map: string) => CX.enemies.find(e => e.kind === kind && e.z === map);

/** 一个区域的全部兴趣点（世界坐标） */
export function poisFor(id: MapId): Poi[] {
  const out: Poi[] = [];
  // 传送点 / 门
  const seen = new Set<string>();
  for (const l of MAP_LINKS) if (l.from === id) { const k = `${Math.round(l.x)},${Math.round(l.z)}`; if (seen.has(k)) continue; seen.add(k); out.push({ kind: 'portal', name: l.name, x: l.x, z: l.z, sub: `通往 ${MAPS[l.to as MapId].name}${MAP_LINKS.filter(m => m.from === id && Math.round(m.x) === Math.round(l.x) && Math.round(m.z) === Math.round(l.z) && m.to !== l.to).map(m => ' / ' + MAPS[m.to as MapId].name).join('')}` }); }
  if (id === 'camp') {
    out.push({ kind: 'camp', name: '灰石营地', x: 0, z: 4, sub: '新手营地 · 杂货铺 / 铁匠 / 仓库' });
    // v0.9.2b 暗岩矿洞 / 腐沼神殿搬进副本区：营地里只剩路口（传送点里已有）
  }
  if (id === 'field') {
    out.push({ kind: 'camp', name: '翠风前哨', x: AREAS.outpost.x, z: AREAS.outpost.z, sub: '营地 · 补给 / 铁匠 / 仓库' });
    out.push(bossPoi('chief', 'field', FIELD_MOBS.chief.name, CHIEF_ROUTE[0].x, CHIEF_ROUTE[0].z, CHIEF_RESPAWN, FIELD_MOBS.chief.level));
    out.push(...wbPois('field'));   // v0.9.3d
    out.push(...rarePois('goldboar', 'field', FIELD_MOBS.goldboar.name, RARE_SPOTS.map(p => [p.x, p.z] as [number, number]), RARE_RESPAWN, FIELD_MOBS.goldboar.level));
  }
  if (isWildId(id)) {
    const w = WILD[id], O = w.origin;
    for (const c of w.camps) out.push({ kind: 'camp', name: c.name, x: O.x + c.x, z: O.z + c.z, sub: CX.waypoints.has(c.id) ? '营地 · 传送阵已激活' : '营地 · 传送阵未激活（走过去点亮）' });
    for (const d of w.dungeonGates ?? []) {
      const r = RAIDS[d.id as keyof typeof RAIDS];
      const on = CX.waypoints.has(`dp:${d.id}`);
      out.push({ kind: r ? (r.kind === 'dungeon' ? 'dungeon3' : 'raid') : 'dungeon', name: d.name, did: d.id, x: O.x + d.x, z: O.z + d.z, sub: `${d.desc} · ${on ? '副本传送阵已激活' : '副本传送阵未激活（走到门口点亮）'}` });
    }
    if (w.elite) { const m = w.mobs[w.elite.kind]; out.push(bossPoi(w.elite.kind, id, m.name, O.x + w.elite.route[0][0], O.z + w.elite.route[0][1], w.elite.respawn, m.level)); }
    // 刷在怪群里的精英（如灰烬祭司长）也算野外首领
    for (const pk of w.packs) for (const k of new Set(pk.kinds)) { const m = w.mobs[k]; if (m?.elite && k !== w.elite?.kind) out.push(bossPoi(k, id, m.name, O.x + pk.x, O.z + pk.z, pk.respawn ?? 30, m.level)); }
    for (const b of w.mapBosses?.() ?? []) out.push({ kind: 'wildboss', name: b.name, x: O.x + b.x, z: O.z + b.z, sub: `${b.level} 级 · ${b.state}`, state: b.state, live: false, key: 'mb:' + b.name });   // v1.2.39b
    out.push(...wbPois(id));   // v0.9.3d 世界首领（在「代码里单独刷的精英」之前，避免重复）
    // 代码里单独刷的精英（灰烬祭司长）：地图已加载时按实际怪物补上
    for (const e of CX.enemies) if (e.z === id && e.type.elite && !e.isBoss && !out.some(p => p.key === e.kind)) out.push(bossPoi(e.kind, id, e.type.name, e.spawn.x, e.spawn.z, (e as unknown as { pbRespawn?: number }).pbRespawn ?? e.respawn, e.type.level ?? 0));
    if (w.rare) { const m = w.mobs[w.rare.kind]; out.push(...rarePois(w.rare.kind, id, m.name, w.rare.spots.map(([x, z]) => [O.x + x, O.z + z] as [number, number]), w.rare.respawn, m.level)); }
    for (const ev of worldEvents.filter(e => e.map === id)) {
      const sp = w.spots[ev.def.spot];
      out.push({ kind: 'event', name: ev.def.name, x: O.x + sp.x, z: O.z + sp.z, live: ev.active, state: ev.active ? `进行中（${ev.killed}/${ev.total}）` : CX.zone === id ? `${fmt(ev.next)}后开始` : '每隔一段时间发生', sub: sp.name });
    }
  }
  if (id === 'field' || isWildId(id)) out.push(...exPois(id), ...dynPois(id));   // v0.9.3e 瞭望塔 / 宝箱；v0.9.3f 动态事件
  // 任务目标
  for (const x of allTargets()) if (x.t.point.map === id) out.push({ kind: CX.quests.def(x.id)?.cls ? 'cquest' : 'quest', name: x.t.questName, x: x.t.point.x, z: x.t.point.z, sub: x.t.label, live: x.id === CX.focusId });
  return out;
}

function bossPoi(kind: string, map: string, name: string, x: number, z: number, respawn: number, level: number): Poi {
  const e = live(kind, map);
  const kills = mapStats.kills[kind] ?? 0;
  let state = '固定刷新', isLive = false;
  if (e) {
    if (e.alive) { state = '存活'; isLive = true; x = e.pos.x; z = e.pos.z; }
    else state = respawn >= 1e8 ? '已击败' : `${fmt(Math.max(0, respawn - (CX.T - e.deadAt)))}后刷新`;   // v1.2.39b 1e9 = 由别处管复活，不显示天文数字
  }
  return { kind: 'wildboss', name, x, z, sub: `${level} 级 · ${respawn >= 1e8 ? '' : `刷新 ${fmt(respawn)} · `}已击杀 ${kills} 次`, state, live: isLive, key: kind };
}
function rarePois(kind: string, map: string, name: string, spots: [number, number][], respawn: number, level: number): Poi[] {
  const e = live(kind, map), kills = mapStats.kills[kind] ?? 0;
  return spots.map(([x, z], i) => {
    const k = `${map}:${kind}:${i}`, found = mapStats.rareSeen.includes(k);
    const here = !!e && e.alive && Math.hypot(e.spawn.x - x, e.spawn.z - z) < 3;
    const seenNow = here && found;
    return { kind: 'rare' as PoiKind, name: found ? name : '稀有首领 · 未发现', x, z, sub: found ? `${level} 级 · 3 个刷新点之一 · 刷新 ${fmt(respawn)} · 已击杀 ${kills} 次` : '在附近见过它之后，这里会显示', state: seenNow ? '就在这里！' : found ? (e && !e.alive ? `${fmt(respawn - (CX.T - e.deadAt))}后在随机刷新点出现` : '不在这里') : '未发现', live: seenNow, dim: !found, key: k };
  });
}

/** 小地图用：每 0.5 秒重算一次 */
let cache: { id: string; t: number; pois: Poi[] } | null = null;
export function poisCached(id: MapId) { const now = performance.now(); if (!cache || cache.id !== id || now - cache.t > 500) cache = { id, t: now, pois: poisFor(id) }; return cache.pois; }

/** 每秒调用：靠近存活的稀有首领 → 记下它所在的刷新点 */
export function noteRareSightings() {
  if (!CX.started) return;
  for (const e of CX.enemies) {
    if (!e.alive || e.z !== CX.zone || !e.type.rare || !e.spots) continue;
    if (Math.hypot(e.pos.x - CX.player.pos.x, e.pos.z - CX.player.pos.z) > 32) continue;
    const i = e.spots.findIndex(s => Math.hypot(s.x - e.spawn.x, s.z - e.spawn.z) < 3);
    const k = `${e.z}:${e.kind}:${i}`;
    if (i >= 0 && !mapStats.rareSeen.includes(k)) { mapStats.rareSeen.push(k); CX.toast(`发现稀有首领「${e.type.name.split(' ')[0]}」的刷新点（已标在地图上）`, '#d0a0ff'); }
  }
}
export function noteBossKill(kind: string) { mapStats.kills[kind] = (mapStats.kills[kind] ?? 0) + 1; }

/** 画一个图例图标（圆底 + 符号） */
export function drawPoiIcon(g: CanvasRenderingContext2D, kind: PoiKind, x: number, y: number, r: number, opts: { live?: boolean; dim?: boolean } = {}) {
  const st = POI_STYLE[kind];
  g.save();
  g.globalAlpha = opts.dim ? 0.5 : 1;
  if (opts.live) { g.fillStyle = 'rgba(255,230,120,.45)'; g.beginPath(); g.arc(x, y, r * 1.6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = opts.dim ? '#8a8070' : st.color; g.strokeStyle = '#fff6dc'; g.lineWidth = Math.max(1.5, r * 0.18);
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(r * 1.25)}px "Segoe UI Symbol","Noto Sans Symbols2","PingFang SC",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(opts.dim ? '?' : st.glyph, x, y + r * 0.06);
  g.restore();
}

/** 图例 HTML（区域地图：本区域每类数量；世界地图：全部） */
export function legendHtml(pois: Poi[]) {
  return `<div class="wleg">${LEGEND_ORDER.map(k => { const n = pois.filter(p => p.kind === k).length; const st = POI_STYLE[k]; return `<span class="wlg${n ? '' : ' none'}"><i style="background:${st.color}">${st.glyph}</i>${st.name}${n ? ` ${n}` : ''}</span>`; }).join('')}</div>`;
}

/** 悬停说明 */
export function poiTip(p: Poi) {
  const st = POI_STYLE[p.kind];
  return `<b style="color:${st.color}">${st.glyph} ${CX.escHtml(p.name)}</b><small>${st.name}</small>${p.sub ? `<div>${CX.escHtml(p.sub)}</div>` : ''}${p.state ? `<div class="st${p.live ? ' on' : ''}">${CX.escHtml(p.state)}</div>` : ''}`;
}

export function bindMapPoi(ctx: Ctx) { CX = ctx; }
