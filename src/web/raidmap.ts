// v0.6.10 副本地图（副本里按 M / 手机 ≡ → 地图）：俯视轮廓 + 节点（首领 / 存档点 / 支线 / 封门 / 机关）、迷雾、已杀首领灰掉、
// 存档点互传（战斗中不可用）、环境倒计时、路线建议 + 自动寻路；入口预览（攻略面板里的「路线图」，不含隐藏点）；三首领普通副本用简化版
import { raidBossPool } from '../data/endgame_tables';
import { LOOT_DATA } from '../data/loot';
import { RAID_LG_CHANCE } from '../data/endgame_pools';
import { classSet, RAID_SET_CHANCE } from '../data/sets';
import type { Ctx } from './main';
import { RAIDS } from '../data/raids';
import { RAID_ROUTES } from '../data/raid_routes';
import { RouteDef, RouteNode, evalCond, condText, newRouteState, nextGoal, shortestPath, node as rnode } from '../core/RaidRoute';
import { raidRouteInfo, raidTeleport, raidBotGoal, inRaid, raidDebug, abyssMapInfo, openRaidGuide } from './raid';
import { autoPath, raidAuto, inCombatNow } from './guideui';
import { DUNGEON_ITEMS, DL_BOSSES, DL_CHANCE, DlId, LAYOUT_PREBOSS } from '../data/dungeon_loot';
import { SET_OF, HIDDEN_DROP, SET_CHANCE, DUNGEON_SET_ITEMS, DUNGEON_SET_DROP } from '../data/dungeon_new';
import { SLOT_NAME } from '../core/Inventory';
import { WILD, WILD_IDS, WildId } from '../data/zones_wild';
import { MAPS, MapId } from '../data/world_map';
import { raidRec } from './raid';
import { DUNGEON_SCALE as DGS } from './dgscale';   // 11-18 副本 ×1.5：路线图是设计坐标，玩家世界坐标 ÷ DGS（内容包副本不放大）
import { weekKey } from '../data/raid_molten';
import { dgxBestOf } from './dungeonplus';
import { allDungeonPortals, goMap } from './travel';
import { openWorldMap, syncM3sw } from './shopmap';
import { openAltarFromMap } from './panels';
import { bindRaidMap3d, rm3dShow, rm3dStop, I3Node, I3Edge } from './raidmap3d';
import { packDungeonDef, packDungeonHere, packDungeonDead, packDungeonIlvl } from './packdungeon';   // v1.2.16 内容包小副本

let CX!: Ctx;
type View = { raid: string; preview: boolean };
let view: View | null = null;
let hits: { x: number; y: number; r: number; tip: string; tp?: string; boss?: number }[] = [];
// ---------------------------------------------------------------- v0.9.3i 副本地图升级：三级地图 / 首领选中 / 难度页签 / 掉落列表
let sel = -1;                                   // 当前选中的首领（地图橙圈 + 掉落列表高亮）
let diffSel: Record<string, string> = {};       // 每个副本的难度页签
const DIFFS_DG = [['normal', '普通', 40], ['heroic', '英雄', 42], ['epic', '史诗', 44], ['nightmare', '噩梦', 46]] as const;
const DIFFS_RAID = [['normal', '标准', 50], ['hell', '炼狱', 60]] as const;
/** 1107 内容包长副本（packDungeon long）：只两档，标准 = heroic、炼狱 = nightmare（装等取副本定义） */
const isLongPack = (id: string) => !!packDungeonDef(id)?.long;
const dfOf = (id: string) => diffSel[id] ?? (isLongPack(id) ? 'heroic' : 'normal');
const diffList = (d: DmDef) => d.kind === 'raid' ? DIFFS_RAID : isLongPack(d.id) ? ([['heroic', '标准', 0], ['nightmare', '炼狱', 0]] as const) : DIFFS_DG;
type DmDef = { id: string; name: string; kind: 'dungeon' | 'raid' | 'layout' | 'pack'; theme: string; bosses: { name: string }[]; hidden?: { room: number; hint: string }; desc: string; level: number };
/** 副本定义（RAIDS 里的 30 级副本 / 长副本 + 营地副本区的暗岩矿洞 / 腐沼神殿） */
export function dmDef(id: string): DmDef | null {
  const r = RAIDS[id as keyof typeof RAIDS];
  if (r) return { id, name: r.name, kind: r.kind === 'dungeon' ? 'dungeon' : 'raid', theme: r.theme, bosses: r.bosses, hidden: r.hidden, desc: r.desc, level: r.level };
  const pd = packDungeonDef(id);   // v1.2.16 内容包小副本：四档难度页签 + 按难度切换的掉落列表
  if (pd) return { id, name: pd.name, kind: 'pack', theme: pd.theme ?? 'fire', bosses: pd.bosses.map(b => ({ name: b.name })), desc: pd.desc, level: pd.minLevel };
  const L = CX.LAYOUTS[id]; if (!L) return null;
  return { id, name: L.def.name, kind: 'layout', theme: id === 'rotting_temple' ? 'swamp' : 'mine', bosses: [...(LAYOUT_PREBOSS[id] ? [{ name: LAYOUT_PREBOSS[id].name }] : []), ...L.def.encounters.filter(e => e.kind === 'boss').map(e => ({ name: e.name }))], desc: `${MAPS[id as MapId]?.levels ?? ''} 级普通副本 · ${L.def.encounters.map(e => e.name).join(' → ')}`, level: L.rec };
}
/** 副本入口在哪张野外图 */
export function dmMapOf(id: string): WildId | null { for (const m of WILD_IDS) if ((WILD[m].dungeonGates ?? []).some(d => d.id === id)) return m; return null; }
/** 营地副本区副本的简化路线：入口 → 小怪房 → 首领 */
function layoutRoute(id: string): RouteDef {
  const L = CX.LAYOUTS[id], encs = L.def.encounters;
  const zs = [-15, -36, (L.boss.z - L.origin.z) / L.s];   // 11-18 副本 ×1.5：这张简化路线图按设计坐标画
  const nodes: RouteNode[] = [{ id: 'entry', kind: 'entry', name: '入口', x: 0, z: 0, r: 6, checkpoint: true }];
  let bi = 0;
  const pre = LAYOUT_PREBOSS[id];
  encs.forEach((e, i) => nodes.push(e.kind === 'boss' ? { id: `b${bi}`, kind: 'boss', name: e.name, x: 0, z: zs[Math.min(i, 2)], r: 10, boss: bi++ }
    : pre?.enc === e.id ? { id: `b${bi}`, kind: 'boss', name: pre.name, x: 0, z: zs[Math.min(i, 2)], r: 7, boss: bi++, desc: `${e.name}里的前置首领` }   // v0.9.3j
    : { id: `t${i}`, kind: 'branch', name: e.name, x: 0, z: zs[Math.min(i, 2)], r: 5 }));
  const edges = nodes.slice(1).map((n, i) => ({ a: nodes[i].id, b: n.id }));
  return { raid: id, name: L.def.name, nodes, edges, props: [], final: 0, order: [0], approach: {} } as RouteDef;
}
const QCLS: Record<string, string> = { purple: 'q-purple', orange: 'q-orange', blue: 'q-blue' };
function itemRow(name: string, quality: string, chance: string, tip: string) {
  const have = CX.codex.has(`fixed|${name}`);
  return `<div class="dli" title="${tip.replace(/"/g, '&quot;')}"><span class="${QCLS[quality] ?? ''}">${have ? '<b class="ck">✓</b> ' : '○ '}${name}</span><small>${chance}</small></div>`;
}
/** 掉落列表：全副本共享 / 每个首领 / 最终奖励 / 隐藏首领（数据直接读 data/dungeon_loot.ts，和说明书同源） */
/** v1.2.16 内容包小副本的掉落列表（包按难度给分组） */
function packDropHtml(id: string, ilvl: number): string {
  const pd = packDungeonDef(id); if (!pd) return '';
  const diff = dfOf(id), groups = pd.drops?.(diff, ilvl) ?? [];
  let h = `<div class="rm-k" id="rmd-pack" data-diff="${diff}">首领掉落装等 <b>${ilvl}</b>（小怪 ${ilvl - 3}）</div>`;
  groups.forEach((g, gi) => {
    const bi = pd.bosses.findIndex(b => b.name === g.title || g.title.includes(b.name));
    h += `<div class="dl-h${bi >= 0 && sel === bi ? ' sel' : ''}"${bi >= 0 ? ` id="rmd-b${bi}"` : gi === groups.length - 1 ? ' id="rmd-final"' : ''}>${g.title}</div>` + g.rows.map(r => itemRow(r.name, r.quality ?? '', r.chance, r.tip ?? '')).join('');
  });
  return h;
}
export function dropListHtml(id: string, ilvl: number): string {
  const d = dmDef(id); if (d?.kind === 'pack') return packDropHtml(id, ilvl);
  if (!d || !(id in DL_BOSSES)) return '';
  if (d.kind === 'raid') return raidDropHtml(d, id, ilvl);
  const items = DUNGEON_ITEMS.filter(x => x.dungeon === id), pct = (p: number) => `${Math.round(p * 100)}%`;
  const tipOf = (x: typeof items[number]) => `${SLOT_NAME[x.slot]}${x.adapt ? '（按职业换底材）' : ''} · 装等 ${ilvl}\n${x.modifiers.map(m => m.desc).join('\n')}\n+${x.affixes} 条随机词条`;
  const n = DL_BOSSES[id as DlId];
  const got = items.filter(x => CX.codex.has(`fixed|${x.name}`)).length;
  let h = `<div class="rm-k">专属掉落 <b>${got}/${items.length}</b> 已收集 · 装等 ${ilvl}${d.kind === 'layout' ? '（等级同步，满级）' : ''}</div>`;
  h += `<div class="dl-h">全副本共享</div>` + items.filter(x => x.boss === 'shared').map(x => itemRow(x.name, x.quality, pct(DL_CHANCE.shared), tipOf(x))).join('');
  if (d.kind === 'dungeon' && DUNGEON_SET_DROP) for (const sid of SET_OF[id] ?? []) { const f = DUNGEON_SET_ITEMS.find(x => x.id === sid); if (f) h += itemRow(f.name, 'purple', `小套 ${pct(SET_CHANCE.normal)}`, `${SLOT_NAME[f.slot]} · 副本小套部件`); }
  if (d.kind === 'dungeon') h += `<div class="dli"><span>暗岩徽记 · 余烬 / 碎晶</span><small>史诗 / 噩梦</small></div>`;
  for (let i = 0; i < n; i++) {
    h += `<div class="dl-h${sel === i ? ' sel' : ''}" id="rmd-b${i}">首领 ${i + 1} · ${d.bosses[i]?.name ?? ''}</div>` + items.filter(x => x.boss === i).map(x => itemRow(x.name, x.quality, pct(DL_CHANCE.boss), tipOf(x))).join('');
    h += `<div class="dli"><span>随机史诗（填充）</span><small>保底 1 件</small></div>`;
  }
  h += `<div class="dl-h" id="rmd-final">最终奖励（${d.bosses[n - 1]?.name ?? ''}）</div>` + items.filter(x => x.boss === 'final').map(x => itemRow(x.name, x.quality, pct(DL_CHANCE.final), tipOf(x))).join('');
  if (d.hidden) {
    const done = !!raidRec.clears[`hidden|${id}`], hid = DUNGEON_SET_ITEMS.find(x => x.id === HIDDEN_DROP[id]);
    h += `<div class="dl-h${sel === d.hidden.room ? ' sel' : ''}" id="rmd-b${d.hidden.room}">隐藏首领 · ${done ? d.bosses[d.hidden.room]?.name : '？？？'}</div>`;
    h += done && hid ? itemRow(hid.name, 'orange', '必掉', `${SLOT_NAME[hid.slot]} · 唯一外观件\n${hid.modifiers.filter(m => !m.cls).map(m => m.desc).join('\n')}`) : `<div class="dli"><span>唯一外观件（击败后揭晓）</span><small>必掉</small></div><div class="rm-tip">条件：${d.hidden.hint}</div>`;
  }
  return h;
}
/** v0.9.6a 长副本：只掉套装 + 橙装（本职业）；首领独特 / 全副本共享 / 尾王暗金 */
function raidDropHtml(d: DmDef, id: string, ilvl: number): string {
  const hell = diffSel[id] === 'hell', k = hell ? 1 : 0, pct = (p: number) => `${Math.round(p * 100)}%`, cls = CX.cls.id;
  const lgOf = (lid: string | null) => lid ? LOOT_DATA.legendaries.find(l => l.id === lid) : undefined;
  const row = (lid: string | null, ch: string) => { const lg = lgOf(lid); if (!lg) return ''; const have = CX.codex.has(`lg|${lg.name}`); return `<div class="dli" title="${[lg.modifier, ...(lg.extra ?? [])].filter(m => !m.cls || m.cls === cls).map(m => m.desc).join('\n').replace(/"/g, '&quot;')}"><span class="q-orange">${have ? '<b class="ck">✓</b> ' : '○ '}${lg.name}</span><small>${ch}</small></div>`; };
  const n = DL_BOSSES[id as DlId], P0 = raidBossPool(id, 0, cls), set = classSet(cls);
  const all = [...Array(n).keys()].map(i => raidBossPool(id, i, cls).unique).concat(P0.shared).map(lgOf).filter(Boolean);
  const got = all.filter(l => CX.codex.has(`lg|${l!.name}`)).length;
  let h = `<div class="rm-k">只掉套装和橙装 · 本职业橙装 <b>${got}/${all.length}</b> 已收集 · 装等 ${ilvl}</div>`;
  h += `<div class="dl-h">每个首领</div><div class="dli"><span style="color:#2ED573">本职业套装「${set?.name ?? '—'}」部件</span><small>${pct(RAID_SET_CHANCE[hell ? 'hell' : 'normal'])} · 带保底</small></div><div class="dli"><span>三样都没出</span><small>保底 1 件</small></div>`;
  h += `<div class="dl-h">全副本共享橙装（2 选 1）</div>` + P0.shared.map(x => row(x, pct(RAID_LG_CHANCE.shared[k]))).join('');
  for (let i = 0; i < n; i++) h += `<div class="dl-h${sel === i ? ' sel' : ''}" id="rmd-b${i}">首领 ${i + 1} · ${d.bosses[i]?.name ?? ''}</div>` + row(raidBossPool(id, i, cls).unique, `独特 ${pct(RAID_LG_CHANCE.unique[k])}`);
  h += `<div class="dl-h" id="rmd-final">尾王额外</div><div class="dli"><span class="q-orange">暗金装备</span><small>${hell ? '10%' : '5%'} · 每周首通翻倍</small></div>`;
  return h;
}
function weekLine(d: DmDef): string {
  const fmt = (t: number) => `${Math.floor(t / 60)}分${String(Math.round(t % 60)).padStart(2, '0')}秒`;
  if (d.kind === 'layout' || d.kind === 'pack') { const b = dgxBestOf(d.id); return `<div class="rm-k">最快 ${b ? fmt(b) : '—'}</div>`; }
  const wk = raidRec.week[d.id], cl = raidRec.clears[d.id] ?? 0, best = raidRec.best[d.id];
  return `<div class="rm-k">本周 ${wk === weekKey(Date.now()) ? '<b class="ok">已通关 ✓</b>' : '<span class="no">未通关</span>'}　累计 ${cl} 次　最快 ${best ? fmt(best) : '—'}</div>`;
}
function curIlvl(d: DmDef) { if (d.kind === 'pack') return packDungeonIlvl(d.id, dfOf(d.id)); const list = d.kind === 'raid' ? DIFFS_RAID : DIFFS_DG; const k = dfOf(d.id); return (list as readonly (readonly [string, string, number])[]).find(x => x[0] === k)?.[2] ?? list[0][2]; }
/** 世界 / 区域 / 副本 页签 + 面包屑 + 难度页签 */
function renderRmHead(d: DmDef) {
  const m = dmMapOf(d.id);
  const crumb = `<a data-rmv="world">世界</a> › ${m ? `<a data-rmv="zone">${MAPS[m].name}</a> › ` : ''}<b>${d.name}</b>`;
  const list = diffList(d), k = dfOf(d.id);
  const dh = (list as readonly (readonly [string, string, number])[]).map(([id, nm]) => `<span class="dt${id === k ? ' on' : ''}" data-df="${id}">${nm}</span>`).join('');
  { const gb = CX.$('rm-guide') as HTMLElement | null;   // v1.2.15 攻略页签（G 键改给第 8 技能格）：有攻略的副本才显示
    if (gb) { const pk = d.kind === 'pack' && !!packDungeonDef(d.id)?.bosses.length, has = d.id in RAIDS || pk; gb.style.display = has ? '' : 'none'; gb.onclick = has ? () => { CX.togglePanel('raidmap', false); if (pk) openPackGuide(d.id); else openRaidGuide(d.id as keyof typeof RAIDS); } : null; } }
  const html = crumb + '|' + dh;
  if (CX.textCache.get('rm-head') === html) return;
  CX.textCache.set('rm-head', html);
  CX.$('rm-crumb').innerHTML = crumb; CX.$('rm-diff').innerHTML = dh;
  CX.$('rm-diff').querySelectorAll('[data-df]').forEach(x => (x as HTMLElement).onclick = () => { diffSel[d.id] = (x as HTMLElement).dataset.df!; CX.textCache.delete('rm-side'); renderRaidMap(); });
  CX.$('raidmap').querySelectorAll('[data-rmv]').forEach(x => (x as HTMLElement).onclick = () => rmGo((x as HTMLElement).dataset.rmv as 'world' | 'zone' | 'dungeon'));
}
function rmGo(v: 'world' | 'zone' | 'dungeon') {
  if (v === 'dungeon' || !view) return;
  const m = dmMapOf(view.raid);
  CX.togglePanel('raidmap', false);
  openWorldMap(v, v === 'zone' ? (m ?? undefined) : undefined);
}
/** 传送到副本入口（副本传送阵已激活、不在战斗、不在副本里） */
export function dmTeleport(id: string): string | null {
  const p = allDungeonPortals().find(x => x.id === id);
  if (!p) return '没有这个副本的传送阵';
  if (!p.on) return '副本传送阵还没激活：先走到门口一次';
  if (CX.zone === 'raid' || CX.zone === 'dungeon') return '副本里不能传送';
  if (inCombatNow()) return '战斗中不能传送';
  CX.togglePanel('raidmap', false); CX.togglePanel('worldmap', false);
  goMap(p.map, { x: p.x, z: p.z + 6 }, '传送');
  return null;
}
export const dmView = () => view ? { ...view, sel, diff: dfOf(view.raid) } : null;
export function dmSelect(i: number) { sel = i; CX.textCache.delete('rm-side'); renderRaidMap(); document.getElementById(`rmd-b${i}`)?.scrollIntoView?.({ block: 'start' }); }

/** v1.2.16 内容包小副本的路线图：入口 → 首领依次（坐标取包定义的局部坐标） */
function packRoute(id: string): RouteDef {
  const def = packDungeonDef(id)!;
  const nodes: RouteNode[] = [{ id: 'entry', kind: 'entry', name: '入口', x: def.start.x, z: def.start.z, r: 8, checkpoint: true }];
  def.bosses.forEach((b, i) => nodes.push({ id: `b${i}`, kind: 'boss', name: b.name, x: b.x, z: b.z, r: 10, boss: i, desc: b.tip }));
  const edges = nodes.slice(1).map((n, i) => ({ a: nodes[i].id, b: n.id, cond: i > 0 ? { bossDead: [i - 1] } : undefined }));
  return { raid: id, name: def.name, nodes, edges, props: [], final: def.bosses.length - 1, order: def.bosses.map((_, i) => i), approach: {} };
}
/** 普通副本（一条线）的简化路线图：入口 → 首领 1 → 2 → 3（→ 隐藏 ?） */
function simpleRoute(id: string): RouteDef {
  const def = RAIDS[id as keyof typeof RAIDS];
  const nodes: RouteNode[] = [{ id: 'entry', kind: 'entry', name: '入口', x: 0, z: 0, r: 8, checkpoint: true }];
  def.bosses.forEach((b, i) => nodes.push({ id: `b${i}`, kind: 'boss', name: b.name, x: 0, z: def.rooms[i].arena.z, r: def.rooms[i].arena.r, boss: i, hidden: !!def.hidden && i === def.hidden.room }));
  const edges = nodes.slice(1).map((n, i) => ({ a: nodes[i].id, b: n.id, cond: i > 0 ? { bossDead: [i - 1] } : undefined }));
  return { raid: id, name: def.name, nodes, edges, props: [], final: def.hidden ? def.hidden.room - 1 : def.bosses.length - 1, order: def.bosses.map((_, i) => i), approach: {} };
}

export function openRaidMap(raid?: string, preview = false) {
  const id = raid ?? raidDebug()?.id ?? (CX.zone === 'dungeon' ? CX.layout.id : undefined) ?? packDungeonHere() ?? undefined;
  if (!id || !dmDef(id)) return;
  if (view?.raid !== id) sel = -1;
  view = { raid: id, preview };
  CX.togglePanel('worldmap', false);
  CX.togglePanel('raidmap', true);
  renderRaidMap();
}
export function toggleRaidMap() { if (CX.$('raidmap').style.display === 'flex') CX.togglePanel('raidmap', false); else openRaidMap(); }

export function renderRaidMap() {
  queueMicrotask(syncM3sw);
  if (!view || CX.$('raidmap').style.display !== 'flex') return;
  const ab = !view.preview && inRaid() ? abyssMapInfo() : null;
  if (ab) { renderAbyssMap(ab); return; }   // v0.8.1.1：深渊里 M 键显示 20 层进度 + 本层敌人
  const dm = dmDef(view.raid)!, layout = dm.kind === 'layout';
  const pdef = dm.kind === 'pack' ? packDungeonDef(view.raid) : null;
  const mv = pdef?.mapView ?? null;   // 11-07 内容包副本定制地图（真实主路 / 分层 / 竖井）
  const def = (RAIDS[view.raid as keyof typeof RAIDS] ?? { name: dm.name, bosses: dm.bosses, theme: dm.theme, desc: dm.desc, kind: 'dungeon', origin: pdef ? pdef.origin : CX.LAYOUTS[view.raid].origin }) as typeof RAIDS[keyof typeof RAIDS];
  const info = !view.preview && inRaid() ? raidRouteInfo() : null;
  const route = pdef ? packRoute(view.raid) : layout ? layoutRoute(view.raid) : RAID_ROUTES[view.raid] && def.kind !== 'dungeon' ? RAID_ROUTES[view.raid] : simpleRoute(view.raid);
  const rd = !view.preview && inRaid() ? raidDebug() : null;
  const inLayout = layout && CX.zone === 'dungeon' && CX.layout.id === view.raid;
  const rs = info?.rs ?? (() => { const s = newRouteState(def.bosses.length); if (pdef) packDungeonDead(view!.raid).forEach((d, i) => { s.dead[i] = d; }); if (rd && !info) for (let i = 0; i < rd.killed; i++) s.dead[i] = true; if (inLayout) { const pre = LAYOUT_PREBOSS[view.raid]; if (pre && CX.enemies.some(e => e.kind === pre.kind && e.z === 'dungeon' && !e.alive)) s.dead[0] = true; if (CX.dungeonRun?.completed) s.dead[def.bosses.length - 1] = true; } return s; })();
  CX.$('rm-title').textContent = `${view.preview ? '副本地图（预览）' : '副本地图'} · ${def.name}`;
  renderRmHead(dm);
  // ---- 画布
  const cv = CX.$('rm-cv') as HTMLCanvasElement, g = cv.getContext?.('2d') ?? null;
  hits = [];
  if (g) {
    // 画布尺寸跟着父容器算（canvas 自己的 clientHeight 会被像素尺寸撑大，越画越小）
    const par = cv.parentElement!, side = CX.$('rm-side'), narrow = par.clientWidth < 640;
    const cw = Math.max(200, (par.clientWidth || 600) - (narrow ? 0 : (side.offsetWidth || 230) + 24)), ch = Math.max(160, (par.clientHeight || 360) - (narrow ? 150 : 14)), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frost = def.theme === 'frost' || def.theme === 'troll';
    const bg = g.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, frost ? '#0e1a28' : '#1e0c08'); bg.addColorStop(1, frost ? '#06101a' : '#0e0604');
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    const visited0 = new Set([...(info?.visited ?? []), ...(info?.fog ?? [])]);
    const known0 = (n: RouteNode) => view!.preview || !info ? !n.hidden : visited0.has(n.id) || (!n.hidden && route.edges.some(e => (e.a === n.id && visited0.has(e.b)) || (e.b === n.id && visited0.has(e.a))));
    // 迷雾里的部分不占地方：只按已知节点取景（至少 120 米高，免得开局太大）
    const kn = route.nodes.filter(known0), xs = kn.map(n => n.x), zs = kn.map(n => n.z);
    let x0 = Math.min(...xs, -40) - 20, x1 = Math.max(...xs, 40) + 20, z1 = Math.max(...zs) + 14, z0 = Math.min(Math.min(...zs) - 20, z1 - 140);
    if (mv) { const px = mv.path.map(p => p.x), pz = mv.path.map(p => p.z), S = mv.shaft; x0 = Math.min(...px, S ? S.x - S.r : Infinity) - 8; x1 = Math.max(...px, S ? S.x + S.r : -Infinity) + 8; z0 = Math.min(...pz, S ? S.z - S.r : Infinity) - 8; z1 = Math.max(...pz, S ? S.z + S.r : -Infinity) + 8; }
    const TOP = 30, sc = Math.min((cw - 20) / (x1 - x0), (ch - TOP - 10) / (z1 - z0));
    const ox = (cw - (x1 - x0) * sc) / 2, oz = TOP + (ch - TOP - (z1 - z0) * sc) / 2;
    const X = (x: number) => ox + (x - x0) * sc, Z = (z: number) => oz + (z - z0) * sc;
    const visited = new Set([...(info?.visited ?? []), ...(info?.fog ?? [])]);
    const known = (n: RouteNode) => view!.preview ? !n.hidden : !info ? !n.hidden || rs.dead[n.boss ?? -1] : visited.has(n.id) || (!n.hidden && route.edges.some(e => (e.a === n.id && visited.has(e.b)) || (e.b === n.id && visited.has(e.a))));
    const seen = (n: RouteNode) => view!.preview || !info || visited.has(n.id);
    // 走廊
    if (mv) drawMapView(g, mv, X, Z, sc, cw, ch, frost);
    route.edges.forEach((e, i) => {
      const A = rnode(route, e.a), B = rnode(route, e.b);
      if (mv || !known(A) || !known(B)) return;
      const open = evalCond(e.cond, rs), half = e.half ?? 5.5;
      g.lineCap = 'round';
      g.strokeStyle = e.kind === 'secret' ? (open ? '#8a5ac0' : 'rgba(138,90,192,.45)') : e.kind === 'shortcut' ? (open ? '#5ab0e0' : 'rgba(90,176,224,.4)') : open ? (frost ? '#5a7088' : '#6a4a34') : 'rgba(120,60,40,.6)';
      g.lineWidth = Math.max(3, half * 2 * sc * 0.8);
      g.setLineDash?.(open ? [] : [6, 5]);
      if (!seen(A) && !seen(B)) g.globalAlpha = 0.45;
      g.beginPath(); g.moveTo(X(A.x), Z(A.z)); g.lineTo(X(B.x), Z(B.z)); g.stroke();
      g.globalAlpha = 1; g.setLineDash?.([]);
      // 环境：颜色 + 倒计时
      const env = info?.env.find(s => s.id === e.env);
      if (e.env) {
        const mx = (X(A.x) + X(B.x)) / 2, my = (Z(A.z) + Z(B.z)) / 2;
        if (env && env.phase !== 'calm') { g.strokeStyle = env.id === 'blizzard' ? 'rgba(220,240,255,.6)' : env.phase === 'warn' ? 'rgba(255,170,40,.7)' : 'rgba(255,80,20,.85)'; g.lineWidth = Math.max(2, half * sc * 0.6); g.beginPath(); g.moveTo(X(A.x), Z(A.z)); g.lineTo(X(B.x), Z(B.z)); g.stroke(); }
        const label = env ? `${env.name} ${env.phase === 'active' ? '中' : env.phase === 'warn' ? '将至' : ''} ${Math.ceil(env.left)}s` : { tide: '熔岩潮汐', lavafall: '熔瀑', blizzard: '暴风雪' }[e.env] ?? '';
        txt(g, label, mx, my - 8, env?.phase === 'active' ? '#ff8a50' : '#ffcf90', 10);
      }
      // 锁着的门
      if (!open && e.cond) {
        const mx = (X(A.x) + X(B.x)) / 2, my = (Z(A.z) + Z(B.z)) / 2;
        icon(g, '锁', mx, my + (e.env ? 8 : 0), 9, '#5a2a1a');
        const why = info ? info.condText(i) : condText(e.cond, route, b => def.bosses[b].name.split(' ').pop()!);
        hits.push({ x: mx, y: my, r: 10, tip: `<b>${e.name ?? '门'}</b><div>${e.door ?? ''}</div><div class="st">需要：${why}</div>` });
      }
    });
    // 节点
    for (const n of route.nodes) {
      if (!known(n)) continue;
      const x = X(n.x), y = Z(n.z), r = Math.max(7, n.r * sc * 0.75), fogged = !seen(n);
      g.globalAlpha = fogged ? 0.45 : 1;
      if (n.boss !== undefined) {
        const dead = rs.dead[n.boss];
        // v0.9.3i 首领头像：名字首字 + 编号角标；已击败灰掉打 ✓；选中橙圈
        if (sel === n.boss) { g.strokeStyle = '#ff9a20'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2); g.stroke(); }
        const av = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r); av.addColorStop(0, dead ? '#8a8a8a' : n.hidden ? '#9a5ac0' : '#e05030'); av.addColorStop(1, dead ? '#3a3a3a' : n.hidden ? '#3a1050' : '#5a0a04');
        g.fillStyle = av; g.strokeStyle = dead ? '#999' : '#ffd060'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
        txt(g, n.hidden && view!.preview && !dead ? '?' : n.name.split(' ').pop()![0], x, y, dead ? '#ccc' : '#fff', Math.round(r * 0.95));
        g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(x + r * 0.75, y - r * 0.75, Math.max(6, r * 0.35), 0, Math.PI * 2); g.fill(); txt(g, dead ? '✓' : String(n.boss + 1), x + r * 0.75, y - r * 0.75, dead ? '#7fff7f' : '#ffd060', Math.max(9, Math.round(r * 0.4)));
        txt(g, n.name.split(' ').pop()!, x, y + r + 9, dead ? '#aaa' : '#ffe0b0', 11);
        const fury = info?.fury && info.fury.includes(n.boss) && !dead && rs.dead[info.fury[0] === n.boss ? info.fury[1] : info.fury[0]];
        if (fury) txt(g, '余怒', x + r + 10, y - r, '#ff6a40', 10);
        hits.push({ x, y, r, boss: n.boss, tip: `<b>${n.name}</b><small>首领 ${n.boss + 1}${n.sigil ? ` · 掉「${n.sigil}」` : ''}</small>${n.desc ? `<div>${n.desc}</div>` : ''}<div class="st${dead ? ' on' : ''}">${dead ? '已击败 · 存档点' : fury ? '余怒：多一个机制，多掉 1 枚暗金碎片' : '未击败'}</div><div class="st">点击查看掉落</div>`, tp: dead && info?.cps.includes(n.id) ? n.id : undefined });
      } else {
        const col = n.kind === 'hub' || n.kind === 'entry' ? '#3a7a3a' : n.kind === 'gate' ? '#7a3a1a' : n.kind === 'secret' ? '#6a2a8a' : n.kind === 'lake' ? (rs.flags.includes('frozen') ? '#9ad0f0' : '#2a5a8a') : n.kind === 'branch' ? '#6a5a2a' : '#4a3a2a';
        g.fillStyle = col; g.strokeStyle = info?.cps.includes(n.id) ? '#7fffa0' : '#c9a060'; g.lineWidth = info?.cps.includes(n.id) ? 2.5 : 1.5;
        if (n.checkpoint) { const q = r * 0.95; g.fillStyle = info?.cps.includes(n.id) ? '#3a9aff' : '#2a5a9a'; g.strokeStyle = '#cfe8ff'; g.beginPath(); g.moveTo(x, y - q); g.lineTo(x + q, y); g.lineTo(x, y + q); g.lineTo(x - q, y); g.closePath(); g.fill(); g.stroke(); }   // v0.9.3i 存档点蓝菱形
        else { g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill(); g.stroke(); }
        const glyph = n.kind === 'entry' ? '⚑' : n.kind === 'hub' ? '⚑' : n.kind === 'gate' ? '门' : n.kind === 'secret' ? '★' : n.kind === 'lake' ? '❄' : n.kind === 'branch' ? n.name[0] : '•';
        txt(g, glyph, x, y, '#fff', Math.round(r * 0.8));
        txt(g, n.name, x, y + r + 8, '#e8d8b8', 10);
        hits.push({ x, y, r, tip: `<b>${n.name}</b>${n.desc ? `<div>${n.desc}</div>` : ''}${n.checkpoint ? `<div class="st${info?.cps.includes(n.id) ? ' on' : ''}">${info?.cps.includes(n.id) ? '存档点（点击传送）' : '存档点（走到这里激活）'}</div>` : ''}`, tp: info?.cps.includes(n.id) ? n.id : undefined });
      }
      g.globalAlpha = 1;
    }
    // 机关
    for (const p of route.props) {
      const N = rnode(route, p.node); if (!known(N) || (N.hidden && view.preview)) continue;
      const done = p.kind === 'lamp' ? rs.flags.includes(`lamp:${p.id}`) : p.kind === 'pillar' ? rs.flags.includes('bridge') : p.kind === 'valve' ? rs.flags.includes('valves') : p.kind === 'icewall' ? rs.flags.includes('icewall') : false;
      const gl = p.kind === 'lamp' ? (done ? '✹' : '○') : p.kind === 'chest' ? '▣' : p.kind === 'valve' ? '⚙' : p.kind === 'pillar' ? '❘' : p.kind === 'icewall' ? '▦' : '✎';
      txt(g, gl, X(p.x), Z(p.z), done ? '#7ad8ff' : p.kind === 'chest' ? '#ffd060' : '#c8e8ff', 12);
      hits.push({ x: X(p.x), y: Z(p.z), r: 7, tip: `<b>${p.label}</b><div class="st${done ? ' on' : ''}">${done ? '已完成' : p.kind === 'lamp' ? '走过去点亮' : p.kind === 'mural' ? '壁画里藏着阀门的顺序' : '可以互动'}</div>` });
    }
    // 建议路线
    const path = info?.path ?? (view.preview ? previewPath(route, def.bosses.length) : null);
    if (path && path.length > 1) {
      g.strokeStyle = '#e02818'; g.lineWidth = 3; g.setLineDash?.([8, 5]); g.beginPath();   // v0.9.3i 推荐路线红虚线
      if (info) { const P = CX.player.pos; g.moveTo(X((P.x - info.O.x) / DGS), Z((P.z - info.O.z) / DGS)); } else g.moveTo(X(rnode(route, path[0]).x), Z(rnode(route, path[0]).z));
      for (const id of path.slice(1)) { const n = rnode(route, id); g.lineTo(X(n.x), Z(n.z)); }
      g.stroke(); g.setLineDash?.([]);
    }
    // 玩家
    if (mv && pdef && !view.preview && packDungeonHere() === view.raid) {   // 11-07 内容包副本也画玩家
      g.save(); g.translate(X(CX.player.pos.x - pdef.origin.x), Z(CX.player.pos.z - pdef.origin.z)); g.rotate(Math.PI - CX.player.rig.root.rotation.y);
      g.fillStyle = '#ff3a20'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    if (inRaid() && !view.preview && rd?.id === view.raid) {
      const O = info?.O ?? { x: RAIDS[view.raid as keyof typeof RAIDS].origin.x, z: RAIDS[view.raid as keyof typeof RAIDS].origin.z };
      g.save(); g.translate(X((CX.player.pos.x - O.x) / DGS), Z((CX.player.pos.z - O.z) / DGS)); g.rotate(Math.PI - CX.player.rig.root.rotation.y);
      g.fillStyle = '#ff3a20'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    // 标题
    g.fillStyle = 'rgba(120,20,8,.9)'; g.fillRect(cw / 2 - 120, 4, 240, 22); g.strokeStyle = '#e8c070'; g.strokeRect(cw / 2 - 118, 6, 236, 18);
    txt(g, `${def.name}${view.preview ? ' · 路线预览' : ''}`, cw / 2, 15, '#ffe8b0', 13);
  }
  // ---- v0.9.6f 3D 副本浮岛（叠在 2D 画布上；用不了就回退 2D）
  {
    const par = cv.parentElement!, side = CX.$('rm-side'), narrow = (par?.clientWidth || 600) < 640;
    const cw = Math.max(200, (par?.clientWidth || 600) - (narrow ? 0 : (side.offsetWidth || 230) + 24)), ch = Math.max(160, (par?.clientHeight || 360) - (narrow ? 150 : 14));
    const visited = new Set([...(info?.visited ?? []), ...(info?.fog ?? [])]);
    const known = (n: RouteNode) => (n.hidden && n.boss !== undefined) || (!info ? !n.hidden || !!rs.dead[n.boss ?? -1] : visited.has(n.id) || (!n.hidden && route.edges.some(e => (e.a === n.id && visited.has(e.b)) || (e.b === n.id && visited.has(e.a)))));
    const nodes: I3Node[] = route.nodes.filter(known).map(n => {
      const h = hits.find(x => x.boss !== undefined && x.boss === n.boss) ?? null;
      const dead = n.boss !== undefined ? !!rs.dead[n.boss] : undefined;
      const unknown = !!n.hidden && n.boss !== undefined && !dead && !raidRec.clears[`hidden|${view!.raid}`];
      const tip = n.boss !== undefined ? (unknown ? `<b>隐藏首领 · ？？？</b>${dm.hidden ? `<div class="st">条件：${dm.hidden.hint}</div>` : ''}<div class="st">点击查看掉落</div>` : h?.tip ?? `<b>${n.name}</b><small>首领 ${n.boss + 1}</small><div class="st${dead ? ' on' : ''}">${dead ? '已击败' : '未击败'}</div><div class="st">点击查看掉落</div>`)
        : `<b>${n.name}</b>${n.desc ? `<div>${n.desc}</div>` : ''}${n.checkpoint ? `<div class="st${info?.cps.includes(n.id) ? ' on' : ''}">${info?.cps.includes(n.id) ? '存档点（点击传送）' : '存档点'}</div>` : ''}`;
      return { id: n.id, kind: n.kind, name: n.name, x: n.x, z: n.z, r: n.r, boss: n.boss, dead, hidden: n.hidden, unknown, cp: !!n.checkpoint, fog: !!info && !visited.has(n.id), tip, tp: info?.cps.includes(n.id) && (n.boss === undefined || dead) ? n.id : undefined };
    });
    const ids = new Set(nodes.map(n => n.id));
    const edges: I3Edge[] = route.edges.filter(e => ids.has(e.a) && ids.has(e.b)).map(e => ({ a: e.a, b: e.b, open: evalCond(e.cond, rs), kind: e.kind }));
    const chests = route.props.filter(p => p.kind === 'chest' && ids.has(p.node) && !(rnode(route, p.node).hidden && view!.preview)).map(p => ({ x: p.x, z: p.z, tip: `<b>${p.label}</b><div class="st">可以互动</div>` }));
    const path = info?.path ?? (view!.preview ? previewPath(route, def.bosses.length) : null);
    const O = info?.O ?? (RAIDS[view!.raid as keyof typeof RAIDS]?.origin);
    const player = inRaid() && !view!.preview && rd?.id === view!.raid && O ? { x: (CX.player.pos.x - O.x) / DGS, z: (CX.player.pos.z - O.z) / DGS } : mv && pdef && !view!.preview && packDungeonHere() === view!.raid ? { x: CX.player.pos.x - pdef.origin.x, z: CX.player.pos.z - pdef.origin.z, h: CX.player.pos.y } : null;
    if (mv) for (const n of nodes) { let bd = Infinity; for (const p of mv.path) { const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < bd) { bd = d; n.h = p.h; } } }
    rm3dShow(cv, { raid: view!.raid, name: `${def.name}${view!.preview ? ' · 路线预览' : ''}`, theme: dm.theme, nodes, edges, chests, sel, path, player, view: mv ?? undefined }, cw, ch);
  }
  // ---- 侧栏
  const side: string[] = [];
  if (info) {
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    side.push(`<div class="rm-k">首领 <b>${rs.dead.filter(Boolean).length}/${def.bosses.length}</b>　用时 <b>${fmt(info.t)}</b>${info.best ? `（最佳 ${fmt(info.best)}）` : ''}</div>`);
    if (route.raid === 'molten_throne') side.push(`<div class="rm-k">印记：${['焰之印', '鳞之印'].map(s => rs.sigils.includes(s) ? `<b class="ok">${s} ✓</b>` : `<span class="no">${s} —</span>`).join('　')}${rs.elites.includes('gatekeeper') ? '　<b class="ok">门卫 ✓</b>' : ''}</div>`);
    if (route.raid === 'frost_crypt') side.push(`<div class="rm-k">魂灯 <b>${rs.lamps}/4</b>　冰桥 ${rs.flags.includes('bridge') ? '<b class="ok">✓</b>' : '—'}　冰湖 ${rs.flags.includes('frozen') ? '<b class="ok">已冻结</b>' : '未冻结'}</div>`);
    side.push(`<div class="rm-k">当前：${rnode(route, info.at).name}　存档点：${rnode(route, info.cp).name}</div>`);
    for (const e of info.env) side.push(`<div class="rm-k env${e.phase === 'active' ? ' hot' : ''}">环境：${e.name}${e.phase === 'active' ? ' 进行中' : e.phase === 'warn' ? ' 马上来' : ''} ${Math.ceil(e.left)} 秒${e.id === 'tide' && rs.flags.includes('obsidian') ? '（河道已冷却）' : ''}</div>`);
    if (info.theme) side.push(`<div class="rm-k env">本周环境：${info.theme}（走廊里会落下预警圈）</div>`);
    if (info.goal) side.push(`<div class="rm-k go">建议：${info.goal.why}${info.path && info.path.length > 1 ? `<br><small>${info.path.slice(1).map(id => rnode(route, id).name.split(' ').pop()).join(' → ')}</small>` : ''}</div>`);
    if (route.mural && info.visited.includes('secret')) side.push(`<div class="rm-k">壁画线索：阀门 ${rs.flags.includes('valves') ? '<b class="ok">密道已开</b>' : `${info.pulled}/3（看十字厅的壁画）`}</div>`);
    side.push(`<button class="btn" id="rm-auto">${autoPath.active ? '停止自动寻路' : '自动寻路到下一目标'}</button>`);
    side.push(`<div class="rm-tip">点地图上亮绿圈的存档点可以传送（战斗中不行）。</div>`);
  } else if (rd) {
    side.push(`<div class="rm-k">首领 <b>${Math.min(rd.killed, rd.regular)}/${rd.regular}</b>${def.hidden ? '　隐藏首领：?' : ''}</div><div class="rm-tip">普通副本是一条线：依次击败首领。</div>`);
  } else {
    side.push(`<div class="rm-k">${def.desc}</div>`);
    if (RAID_ROUTES[view.raid]) side.push(`<div class="rm-tip">两翼 / 双线可以任意顺序打，地图上的虚线是锁着的门和捷径；隐藏地点不会显示，得自己去找。</div>`);
    const p = previewPath(route, def.bosses.length); if (p) side.push(`<div class="rm-k go">建议路线：${p.slice(1).filter(id => rnode(route, id).boss !== undefined).map(id => rnode(route, id).name.split(' ').pop()).join(' → ')}</div>`);
  }
  if (!info && !rd) side.push(weekLine(dm));
  if (dm.hidden && view.preview && !raidRec.clears[`hidden|${view.raid}`]) side.push(`<div class="rm-k">隐藏首领：<b>？</b><br><small>${dm.hidden.hint}</small></div>`);
  if (view.preview && dmMapOf(view.raid) && CX.zone !== 'raid' && CX.zone !== 'dungeon') { const p = allDungeonPortals().find(x => x.id === view!.raid); side.push(`<button class="btn" id="rm-tp"${p?.on ? '' : ' disabled'}>${p?.on ? '传送到入口' : '传送阵未激活（先走到门口）'}</button>`); }
  if (view.raid in DL_BOSSES || CX.LAYOUTS[view.raid]) side.push(`<button class="btn" id="rm-altar">战利品祭坛${sel >= 0 && def.bosses[sel] ? ` · ${def.bosses[sel].name}` : ''}</button>`);   // v0.9.6d
  side.push(dropListHtml(view.raid, curIlvl(dm)));
  const sh = side.join('');
  if (CX.textCache.get('rm-side') !== sh) { CX.textCache.set('rm-side', sh); CX.$('rm-side').innerHTML = sh; { const t = document.getElementById('rm-tp'); if (t) t.onclick = () => { const err = dmTeleport(view!.raid); if (err) { CX.toast(err, '#ffb080'); CX.audio.error(); } }; } const b = document.getElementById('rm-auto'); if (b) b.onclick = () => { if (autoPath.active) autoPath.stop('cancel'); else startRaidAuto(); renderRaidMap(); }; const al = document.getElementById('rm-altar'); if (al) al.onclick = () => { openAltarFromMap(view!.raid, Math.max(0, sel)); }; }
}
type AbyMap = NonNullable<ReturnType<typeof abyssMapInfo>>;
/** v0.8.1.1 深渊地图：左边本层场地俯视（你 + 敌人），下面 20 层进度条；右边本趟信息 */
function renderAbyssMap(a: AbyMap) {
  rm3dStop();
  CX.$('rm-title').textContent = `暗岩深渊 · 第 ${a.floor}/${a.max} 层 · ${a.dungeon}`;
  hits = [];
  const cv = CX.$('rm-cv') as HTMLCanvasElement, g = cv.getContext?.('2d') ?? null;
  if (g) {
    const par = cv.parentElement!, side = CX.$('rm-side'), narrow = par.clientWidth < 640;
    const cw = Math.max(200, (par.clientWidth || 600) - (narrow ? 0 : (side.offsetWidth || 230) + 24)), ch = Math.max(200, (par.clientHeight || 360) - (narrow ? 150 : 14)), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0710'; g.fillRect(0, 0, cw, ch);
    // ---- 本层场地
    const ladderH = 74, cx = cw / 2, cy = (ch - ladderH) / 2, rad = Math.max(40, Math.min(cw / 2, (ch - ladderH) / 2) - 18), k = rad / a.R;
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fillStyle = '#1c1426'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#8a6ac0'; g.stroke();
    g.fillStyle = '#d8c8f0'; g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillText(a.cleared ? '本层已清空 · 按交互键选岔路' : `剩余敌人 ${a.foes.length}`, cx, cy - rad - 4 < 14 ? 14 : cy - rad - 4);
    for (const f of a.foes) {
      const x = cx + f.x * k, y = cy + f.z * k;
      g.beginPath(); g.arc(x, y, f.boss ? 9 : 5, 0, Math.PI * 2); g.fillStyle = f.boss ? '#ff8000' : '#ff4040'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
      if (f.boss) { g.fillStyle = '#ffd080'; g.font = 'bold 12px sans-serif'; g.fillText('首领', x, y - 12); }
    }
    { const x = cx + a.me.x * k, y = cy + a.me.z * k; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = '#40c0ff'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText('你', x, y - 11); }
    // ---- 20 层进度
    const y0 = ch - ladderH + 18, n = a.max, step = (cw - 40) / (n - 1);
    g.strokeStyle = '#4a3a60'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, y0); g.lineTo(cw - 20, y0); g.stroke();
    for (const fl of a.floors) {
      const x = 20 + (fl.f - 1) * step, done = fl.f < a.floor || (fl.f === a.floor && a.cleared), cur = fl.f === a.floor;
      const r = fl.boss ? 8 : 5;
      g.beginPath(); g.arc(x, y0, cur ? r + 3 : r, 0, Math.PI * 2);
      g.fillStyle = done ? '#7ad060' : cur ? '#ffd100' : fl.boss ? '#7a3a20' : '#3a3050'; g.fill();
      g.strokeStyle = cur ? '#fff' : fl.boss ? '#ff8000' : '#8a7aa0'; g.lineWidth = cur ? 2.5 : 1.5; g.stroke();
      if (fl.boss || cur || fl.f === 1 || (fl.f - 1) % 5 === 0) { g.fillStyle = cur ? '#ffd100' : '#e0d8f0'; g.font = `${cur ? 'bold ' : ''}11px sans-serif`; g.fillText(`${fl.f}`, x, y0 + 22); }
      hits.push({ x, y: y0, r: 10, tip: `第 ${fl.f} 层 · ${fl.dungeon}${fl.boss ? ` · ${fl.boss}` : ''}` });
    }
    g.fillStyle = '#b8a8d0'; g.font = '11px sans-serif'; g.textAlign = 'left'; g.fillText('橙圈 = 首领层　绿 = 已通过　黄 = 当前', 20, ch - 8);
  }
  const segs = [0, 5, 10, 15].map(i => a.floors[i]).filter(Boolean).map((fl, i) => `<div>${i * 5 + 1}–${i * 5 + 5} 层：${fl.dungeon}</div>`).join('');
  const bosses = a.floors.filter(f => f.boss).map(f => `<div${f.f === a.floor ? ' style="color:#ffd100"' : ''}>第 ${f.f} 层：${f.boss}</div>`).join('');
  const sh = `<div class="tip"><b>本趟</b><br>第 ${a.floor} / ${a.max} 层 · 奖励 ×${+a.bonus.toFixed(2)}<br>用时 ${Math.floor(a.t / 60)}:${String(Math.floor(a.t % 60)).padStart(2, '0')} · 最高纪录 ${a.best} 层
    <hr><b>畸变</b>${a.muts.length ? a.muts.map(m => `<div><span style="color:${m.color}">● ${m.name}</span> <small>${m.desc}</small></div>`).join('') : '<div><small>无</small></div>'}
    <hr><b>场地</b>${segs}<hr><b>首领层</b>${bosses}</div>`;
  if (CX.textCache.get('rm-side') !== sh) { CX.textCache.set('rm-side', sh); CX.$('rm-side').innerHTML = sh; }
}
function previewPath(route: RouteDef, n: number) {
  const s = newRouteState(n); const out: string[] = ['entry']; let at = 'entry';
  for (let k = 0; k < 12; k++) { const g = nextGoal(route, s, at); if (!g) break; const p = shortestPath(route, s, at, g.node); if (!p) break; out.push(...p.slice(1)); at = g.node; if (g.boss !== undefined) { s.dead[g.boss] = true; const nn = route.nodes.find(x => x.boss === g.boss); if (nn?.sigil) s.sigils.push(nn.sigil); if (route.raid === 'molten_throne' && g.boss === 2) s.flags.push('obsidian'); if (route.raid === 'frost_crypt' && g.boss === 1) s.flags.push('frozen'); } if (g.prop) { if (g.prop.kind === 'lamp') { s.flags.push(`lamp:${g.prop.id}`); s.lamps++; } if (g.prop.kind === 'pillar') s.flags.push('bridge'); } }
  return out.length > 1 ? out : null;
}
/** 自动寻路：沿建议路线的节点中心跑到下一个目标 */
export function startRaidAuto(): boolean {
  const info = raidRouteInfo(); if (!info?.path || !info.goal) { CX.toast('没有下一个目标', '#ffb080'); return false; }
  const pts = info.path.slice(1).map(id => { const n = rnode(info.route, id); return { x: info.O.x + n.x * DGS, z: info.O.z + n.z * DGS }; });
  const gp = info.goal.prop ? { x: info.O.x + info.goal.prop.x * DGS, z: info.O.z + (info.goal.prop.z + 1.2) * DGS } : pts[pts.length - 1] ?? raidBotGoal();
  if (!gp) return false;
  if (info.goal.prop) pts.push(gp);
  if (!pts.length) pts.push(gp);
  const ok = autoPath.start(pts, gp, CX.T, info.goal.prop ? 1.2 : 4);
  raidAuto.on = ok;
  if (ok) { CX.toast(`自动寻路：${info.goal.why}`, '#ffd34d'); CX.togglePanel('raidmap', false); }
  return ok;
}

function txt(g: CanvasRenderingContext2D, t: string, x: number, y: number, c: string, size: number) {
  g.font = `bold ${size}px "PingFang SC","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3; g.strokeText(t, x, y); g.fillStyle = c; g.fillText(t, x, y);
}
function icon(g: CanvasRenderingContext2D, t: string, x: number, y: number, r: number, bg: string) { g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ffb060'; g.lineWidth = 1.5; g.stroke(); txt(g, t, x, y + 0.5, '#fff', Math.round(r * 1.1)); }

export function bindRaidMap(ctx: Ctx) {
  CX = ctx;
  bindRaidMap3d(ctx, { pick: n => {   // v0.9.6f 3D 浮岛点击：首领 = 选中 + 掉落列表高亮；存档点 = 传送
    if (n.tp) { const err = raidTeleport(n.tp); if (err) { CX.toast(err, '#ffb080'); CX.audio.error(); } else CX.togglePanel('raidmap', false); return; }
    if (n.boss !== undefined) { dmSelect(n.boss); if (view && !packDungeonDef(view.raid)) openAltarFromMap(view.raid, n.boss); }   // v0.9.6d 点首领 → 战利品祭坛（内容包小副本没有祭坛）
  } });
  const cv = CX.$('rm-cv') as HTMLCanvasElement, tip = CX.$('rm-tip');
  const hitAt = (e: MouseEvent) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best: typeof hits[number] | null = null, bd = 1e9; for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= h.r + 3 && d < bd) { bd = d; best = h; } } return { best, x, y }; };
  cv.addEventListener('mousemove', e => { const { best, x, y } = hitAt(e); if (!best) { tip.style.display = 'none'; return; } tip.innerHTML = best.tip; tip.style.display = 'block'; tip.style.left = `${Math.min(x + 14, cv.clientWidth - 200)}px`; tip.style.top = `${y + 12}px`; });
  cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  cv.addEventListener('click', e => { const { best } = hitAt(e); if (best && best.boss !== undefined && !best.tp) { dmSelect(best.boss); if (view && !packDungeonDef(view.raid)) openAltarFromMap(view.raid, best.boss); return; } if (best?.tp) { const err = raidTeleport(best.tp); if (err) { CX.toast(err, '#ffb080'); CX.audio.error(); } else CX.togglePanel('raidmap', false); } });
}

/** 11-07 BUG#18：内容包副本的攻略页（同本体攻略面板）：首领逐个列阶段、技能、机制门槛与应对，加包自己的补充说明 */
const KIND_TIP: Record<string, string> = { groundSlam: '地面预警圈，读完落下——走出圈', poisonZone: '地面持续区域——别站在里面', cast: '读条技能——能打断就打断，否则准备减伤 / 躲开', summon: '召唤小怪——优先清掉', charge: '冲锋——让开直线' };
export function openPackGuide(id: string) {
  const def = packDungeonDef(id); if (!def) return;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  let h = `<div style="margin-bottom:8px;color:#e8d8b8">${def.desc}。每个首领倒下是一个存档点；阵亡从最近存档点重来。${def.long ? `<br>${def.long.tip}` : ''}</div>`;
  h += `<button class="btn" id="rg-route">路线图预览</button> `;
  if (def.guide?.notes?.length) h += `<div class="fgroup">区域机制</div><ul>${def.guide.notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
  def.bosses.forEach((b, i) => {
    const B = b.boss as unknown as { abilities?: { id: string; name: string; kind: string }[]; phases?: { name: string; hpBelow: number; abilities: string[] }[] };
    const ab = new Map((B.abilities ?? []).map(a => [a.id, a]));
    const ph = (B.phases ?? []).map(p => `<li><b>${p.name}</b>${p.hpBelow < 1 ? `（${pct(p.hpBelow)} 以下）` : ''}：${p.abilities.map(k => ab.get(k)?.name ?? k).join('、')}</li>`).join('');
    const sk = (B.abilities ?? []).map(a => `<li><b>${a.name}</b>：${KIND_TIP[a.kind] ?? '注意读条与预警'}</li>`).join('');
    const g = b.gate ? `<li><b>机制门槛 · ${b.gate.name}</b>（${b.gate.at.map(pct).join(' / ')}）：${b.gate.tip}。${b.gate.time} 秒内打碎 ${b.gate.core.n} 个「${b.gate.core.name}」，否则团灭技落下。</li>` : '';
    const ex = (def.guide?.boss?.[b.key] ?? []).map(x => `<li>${x}</li>`).join('');
    h += `<div class="rg-boss"><div class="rg-h">${i + 1}. ${b.name}${i === def.bosses.length - 1 ? ' <small>尾王</small>' : ''}</div>
      <ul>${ph}${g}${ex}</ul><div class="fgroup" style="margin-top:4px">技能</div><ul>${sk}</ul>${b.tip ? `<div class="rg-tip">应对：${b.tip}</div>` : ''}</div>`;
  });
  CX.$('rg-title').textContent = `攻略 · ${def.name}`;
  const body = CX.$('rg-body'); body.innerHTML = h;
  const rb = document.getElementById('rg-route'); if (rb) rb.onclick = () => { CX.togglePanel('raidguide', false); (window as unknown as { __game?: { openRaidMap?: (id: string, p: boolean) => void } }).__game?.openRaidMap?.(id, true); };
  CX.togglePanel('raidguide', true);
}

/** 11-07 内容包副本定制 2D 地图：竖井轮廓 + 水面 + 按高度着色的真实主路（分段类型配色 / 虚线）+ 方向箭头 + 区域名 + 高度标 + 图例 */
function drawMapView(g: CanvasRenderingContext2D, mv: import('../core/ContentPacks').PackDungeonMapView, X: (x: number) => number, Z: (z: number) => number, sc: number, cw: number, ch: number, frost: boolean) {
  const S = mv.shaft;
  if (S) {   // 井壁：外圈砖环 + 内侧深度渐变
    const cx = X(S.x), cy = Z(S.z), r = S.r * sc;
    const gr = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r); gr.addColorStop(0, frost ? '#0a1a26' : '#140a06'); gr.addColorStop(0.75, frost ? '#10263a' : '#1e120a'); gr.addColorStop(1, frost ? '#1a3448' : '#2a1a10');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5a4a3a'; g.lineWidth = Math.max(4, 3 * sc); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(200,170,120,.35)'; g.lineWidth = 1; g.setLineDash?.([3, 4]); g.beginPath(); g.arc(cx, cy, r - Math.max(3, 2.2 * sc), 0, Math.PI * 2); g.stroke(); g.setLineDash?.([]);
  }
  for (const w of mv.waters ?? []) {
    g.fillStyle = w.color; g.globalAlpha = 0.5;
    if (w.r) { g.beginPath(); g.arc(X(w.x), Z(w.z), w.r * sc, 0, Math.PI * 2); g.fill(); }
    else if (w.w && w.d) g.fillRect(X(w.x - w.w / 2), Z(w.z - w.d / 2), w.w * sc, w.d * sc);
    g.globalAlpha = 1;
  }
  if (mv.bell) { const bx = X(mv.bell.x), by = Z(mv.bell.z); g.fillStyle = 'rgba(255,208,96,.18)'; g.beginPath(); g.arc(bx, by, 9 * Math.max(1, sc * 3), 0, Math.PI * 2); g.fill(); txt(g, '钟', bx, by, '#ffd060', 13); }
  // 主路：先描深色底边，再按段类型上色；高处亮、低处暗
  const P = mv.path, hs = P.map(p => p.h), hMax = Math.max(...hs), hMin = Math.min(...hs);
  const segK = (i: number) => { const a = P[i].k, b = P[i + 1].k, f = (k: string) => k === 'boss' || k === 'start'; return f(b) ? (f(a) ? 'path' : a) : b; };
  g.lineCap = 'round'; g.lineJoin = 'round';
  const w = Math.max(3.5, 8 * sc);
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = w + 3; g.beginPath(); g.moveTo(X(P[0].x), Z(P[0].z)); for (const p of P.slice(1)) g.lineTo(X(p.x), Z(p.z)); g.stroke();
  for (let i = 0; i < P.length - 1; i++) {
    const k = mv.kinds[segK(i)] ?? mv.kinds.path, A = P[i], B = P[i + 1], lit = 0.55 + 0.45 * ((A.h + B.h) / 2 - hMin) / Math.max(1, hMax - hMin);
    g.strokeStyle = k?.color ?? '#c9a060'; g.globalAlpha = lit; g.lineWidth = w; g.setLineDash?.(k?.dash ? [w * 1.2, w * 0.9] : []);
    g.beginPath(); g.moveTo(X(A.x), Z(A.z)); g.lineTo(X(B.x), Z(B.z)); g.stroke();
  }
  g.globalAlpha = 1; g.setLineDash?.([]);
  // 方向箭头：每段中点一个小三角
  for (let i = 0; i < P.length - 1; i++) {
    const A = P[i], B = P[i + 1], L = Math.hypot(B.x - A.x, B.z - A.z); if (L * sc < 28) continue;
    const mx = X((A.x + B.x) / 2), my = Z((A.z + B.z) / 2), a = Math.atan2(Z(B.z) - Z(A.z), X(B.x) - X(A.x));
    g.save(); g.translate(mx, my); g.rotate(a); g.fillStyle = 'rgba(255,240,200,.85)'; g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, -3); g.lineTo(-3, 3); g.closePath(); g.fill(); g.restore();
  }
  for (const m of mv.marks ?? []) { txt(g, m.name, X(m.x), Z(m.z), '#e8d8b8', 11); txt(g, `${m.h > 0 ? '+' : ''}${Math.round(m.h)} m`, X(m.x), Z(m.z) + 12, 'rgba(200,220,230,.8)', 9); }
  // 图例
  const ks = Object.values(mv.kinds); let ly = ch - 12 - ks.length * 14;
  g.fillStyle = 'rgba(10,14,18,.7)'; g.fillRect(6, ly - 10, 104, ks.length * 14 + 6);
  for (const k of ks) { g.strokeStyle = k.color; g.lineWidth = 4; g.setLineDash?.(k.dash ? [5, 4] : []); g.beginPath(); g.moveTo(12, ly); g.lineTo(34, ly); g.stroke(); g.setLineDash?.([]); g.fillStyle = '#e8dcc0'; g.font = '11px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(k.name, 40, ly); ly += 14; }
  g.textAlign = 'center';
}
