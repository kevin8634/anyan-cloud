// v0.6.10 长副本路线图（引擎无关）：节点 + 连线 + 门条件；可达性 / 最短路 / 下一个目标 / 卡死检查
// 浏览器版 web/raid.ts 用它决定哪条走廊能走、首领在哪；web/raidmap.ts 用它画副本地图；npm run routes 用它验证每条路线都能通关
export type Cond =
  | { bossDead: number[] }                 // 这些首领都死了
  | { sigils: number }                     // 至少 n 枚印记
  | { flag: string }                       // 环境 / 机关状态（obsidian 熔岩冷却、valves 阀门、frozen 冰湖、bridge 冰桥、icewall 冰墙）
  | { lamps: number }                      // 点亮的魂灯数
  | { elite: string }                      // 支线精英已击杀
  | { all: Cond[] } | { any: Cond[] };

export type NodeKind = 'entry' | 'boss' | 'hub' | 'gate' | 'branch' | 'side' | 'secret' | 'lake' | 'end';
export interface RouteNode {
  id: string; kind: NodeKind; name: string;
  x: number; z: number; r: number;           // 副本局部坐标（入口 = 0,0；往南 z 为负）
  boss?: number;                             // 首领序号（RaidDef.bosses 下标）
  sigil?: string;                            // 击败后获得的印记
  checkpoint?: boolean;                      // 存档点（首领场地死后自动成为存档点）
  hidden?: boolean;                          // 隐藏点：入口预览不显示，走到附近才揭开
  desc?: string;
}
export interface RouteEdge {
  a: string; b: string; cond?: Cond; half?: number;
  kind?: 'main' | 'branch' | 'shortcut' | 'secret' | 'side';
  name?: string;
  env?: string;                              // 这段走廊的环境（tide 熔岩潮汐 / lavafall 熔瀑 / blizzard 暴风雪）
  door?: string;                             // 锁住时门上的说明
}
export interface RouteProp { id: string; kind: 'lamp' | 'valve' | 'pillar' | 'icewall' | 'chest' | 'mural'; node: string; x: number; z: number; label: string; order?: number }
export interface RouteDef {
  raid: string; name: string;
  nodes: RouteNode[]; edges: RouteEdge[]; props: RouteProp[];
  final: number;                             // 最终首领序号
  order: number[];                           // 默认击杀顺序（调试从第 N 个首领开始 / 入口预览的建议路线）
  /** 首领 i 的小怪放在哪条连线上（a→b，按老布局走廊比例换算） */
  approach: Record<number, [string, string]>;
  /** 支线精英：放在哪个节点 */
  elites?: { id: string; name: string; node: string; mob: string }[];
  /** 余怒：这两个首领先死一个，另一个变强 */
  fury?: [number, number];
  mural?: number[];                          // 阀门的正确顺序（壁画）
}
export interface RouteState { dead: boolean[]; sigils: string[]; flags: string[]; lamps: number; elites: string[] }

export const newRouteState = (n: number): RouteState => ({ dead: Array(n).fill(false), sigils: [], flags: [], lamps: 0, elites: [] });

export function evalCond(c: Cond | undefined, s: RouteState): boolean {
  if (!c) return true;
  if ('bossDead' in c) return c.bossDead.every(i => s.dead[i]);
  if ('sigils' in c) return s.sigils.length >= c.sigils;
  if ('flag' in c) return s.flags.includes(c.flag);
  if ('lamps' in c) return s.lamps >= c.lamps;
  if ('elite' in c) return s.elites.includes(c.elite);
  if ('all' in c) return c.all.every(x => evalCond(x, s));
  return c.any.some(x => evalCond(x, s));
}
/** 门条件的文字（地图 / 门上提示） */
export function condText(c: Cond | undefined, def: RouteDef, bossName: (i: number) => string): string {
  if (!c) return '';
  if ('bossDead' in c) return `击败 ${c.bossDead.map(bossName).join('、')}`;
  if ('sigils' in c) return `${c.sigils} 枚印记`;
  if ('flag' in c) return FLAG_TEXT[c.flag] ?? c.flag;
  if ('lamps' in c) return `点亮 ${c.lamps} 盏魂灯`;
  if ('elite' in c) return `击败 ${def.elites?.find(e => e.id === c.elite)?.name ?? '精英'}`;
  if ('all' in c) return c.all.map(x => condText(x, def, bossName)).join(' + ');
  return c.any.map(x => condText(x, def, bossName)).join('，或 ');
}
export const FLAG_TEXT: Record<string, string> = { obsidian: '熔岩冷却成黑曜石', valves: '按壁画顺序拉开三个阀门', frozen: '冰湖冻结', bridge: '打碎冰柱架桥', icewall: '打碎冰墙' };

export const node = (d: RouteDef, id: string) => d.nodes.find(n => n.id === id)!;
export const bossNode = (d: RouteDef, i: number) => d.nodes.find(n => n.boss === i)!;
export const edgeLen = (d: RouteDef, e: RouteEdge) => { const a = node(d, e.a), b = node(d, e.b); return Math.hypot(a.x - b.x, a.z - b.z); };

/** 从 from 出发能走到的节点（只走条件满足的连线） */
export function reachable(d: RouteDef, s: RouteState, from = 'entry'): Set<string> {
  const seen = new Set([from]), q = [from];
  while (q.length) { const u = q.shift()!; for (const e of d.edges) { if (!evalCond(e.cond, s)) continue; const v = e.a === u ? e.b : e.b === u ? e.a : null; if (v && !seen.has(v)) { seen.add(v); q.push(v); } } }
  return seen;
}
/** 最短路（按长度）：返回节点 id 列表（含起点终点），走不到返回 null */
export function shortestPath(d: RouteDef, s: RouteState, from: string, to: string, ignoreCond = false): string[] | null {
  const dist = new Map<string, number>([[from, 0]]), prev = new Map<string, string>(), done = new Set<string>();
  while (true) {
    let u: string | null = null, best = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < best) { best = v; u = k; }
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const e of d.edges) {
      if (!ignoreCond && !evalCond(e.cond, s)) continue;
      const v = e.a === u ? e.b : e.b === u ? e.a : null;
      if (!v || done.has(v)) continue;
      // 走过活着的首领场地要打一场：最短路尽量绕开（除非就是要去那里）
      const B = node(d, v), pen = B.boss !== undefined && !s.dead[B.boss] && v !== to ? 400 : 0;
      const nd = best + edgeLen(d, e) + pen;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  const out = [to]; while (out[0] !== from) out.unshift(prev.get(out[0])!);
  return out;
}
export const pathLen = (d: RouteDef, p: string[]) => p.slice(1).reduce((a, id, i) => { const u = node(d, p[i]), v = node(d, id); return a + Math.hypot(u.x - v.x, u.z - v.z); }, 0);

export interface Goal { node: string; why: string; prop?: RouteProp; boss?: number }
/** 下一个目标：先打能走到的最近首领（最终首领最后）；走不到就去做开门的事（魂灯 / 冰桥 / 支线精英） */
export function nextGoal(d: RouteDef, s: RouteState, at: string): Goal | null {
  if (s.dead[d.final]) return null;
  const R = reachable(d, s, at);
  // 冰桥 / 魂灯：路上的机关
  const props = d.props.filter(p => (p.kind === 'lamp' && !s.flags.includes(`lamp:${p.id}`)) || (p.kind === 'pillar' && !s.flags.includes('bridge'))).filter(p => R.has(p.node));
  const bosses = d.nodes.filter(n => n.boss !== undefined && !s.dead[n.boss] && n.boss !== d.final && R.has(n.id));
  const fin = bossNode(d, d.final);
  const cands: Goal[] = [];
  for (const n of bosses) cands.push({ node: n.id, why: `击败 ${n.name}`, boss: n.boss });
  for (const p of props) cands.push({ node: p.node, why: p.label, prop: p });
  if (R.has(fin.id)) cands.push({ node: fin.id, why: `击败 ${fin.name}`, boss: d.final });
  if (!cands.length) {
    // 走不到：支线精英
    for (const e of d.elites ?? []) if (!s.elites.includes(e.id) && R.has(e.node)) cands.push({ node: e.node, why: `击败支线精英 ${e.name}` });
  }
  if (!cands.length) return null;
  // 全清：其它目标都做完才去最终首领；否则按距离挑最近
  const finC = cands.find(c => c.boss === d.final);
  let best: Goal | null = null, bl = Infinity;
  for (const c of cands) { if (c.boss === d.final && cands.length > 1) continue; const p = shortestPath(d, s, at, c.node); if (!p) continue; const l = pathLen(d, p); if (l < bl) { bl = l; best = c; } }
  return best ?? finC ?? null;
}

/** 击败首领后的状态变化（印记、进度型环境） */
export function onBossDead(d: RouteDef, s: RouteState, i: number) {
  s.dead[i] = true;
  const n = bossNode(d, i);
  if (n?.sigil && !s.sigils.includes(n.sigil)) s.sigils.push(n.sigil);
  for (const [b, f] of BOSS_FLAGS[d.raid] ?? []) if (b === i && !s.flags.includes(f)) s.flags.push(f);
}
/** 首领死亡 → 进度型环境：熔心王座 萨穆尔（2）→ 熔岩冷却；永霜墓穴 维瑟拉（1）→ 冰湖冻结 */
export const BOSS_FLAGS: Record<string, [number, string][]> = { molten_throne: [[2, 'obsidian']], frost_crypt: [[1, 'frozen']] };

/** 点亮魂灯 / 打碎冰柱 / 拉阀门 */
export function useProp(d: RouteDef, s: RouteState, p: RouteProp, pulled: string[] = []): { ok: boolean; msg: string } {
  if (p.kind === 'lamp') { const f = `lamp:${p.id}`; if (s.flags.includes(f)) return { ok: false, msg: '这盏魂灯已经亮了' }; s.flags.push(f); s.lamps++; return { ok: true, msg: `魂灯 ${s.lamps}/4` }; }
  if (p.kind === 'pillar') { if (s.flags.includes('bridge')) return { ok: false, msg: '冰桥已经架好' }; s.flags.push('bridge'); return { ok: true, msg: '冰柱倒下，架成了一座冰桥' }; }
  if (p.kind === 'icewall') { if (!s.dead[3]) return { ok: false, msg: '冰墙纹丝不动（骑士团还在）' }; if (s.flags.includes('icewall')) return { ok: false, msg: '' }; s.flags.push('icewall'); return { ok: true, msg: '冰墙碎了，后面是一间书库' }; }
  if (p.kind === 'valve') {
    if (s.flags.includes('valves')) return { ok: false, msg: '密道已经打开' };
    const want = d.mural ?? [];
    pulled.push(p.id);
    const k = pulled.length - 1;
    if (props(d, 'valve')[want[k]]?.id !== p.id) { pulled.length = 0; return { ok: false, msg: '阀门咔哒一声弹回去了——顺序不对（看看壁画）' }; }
    if (pulled.length === want.length) { s.flags.push('valves'); return { ok: true, msg: '三个阀门都拉开了，密道打开！' }; }
    return { ok: true, msg: `阀门 ${pulled.length}/${want.length}` };
  }
  return { ok: false, msg: '' };
}
export const props = (d: RouteDef, kind: RouteProp['kind']) => d.props.filter(p => p.kind === kind);

/** 卡死检查：从入口出发，按「下一个目标」一直走（机关遇到就用，阀门按正确顺序），必须能打完最终首领 */
export function simulate(d: RouteDef, n: number, pick?: (cands: Goal) => Goal): { ok: boolean; order: string[]; len: number } {
  const s = newRouteState(n); let at = 'entry', len = 0; const order: string[] = [];
  for (let guard = 0; guard < 40; guard++) {
    let g = nextGoal(d, s, at);
    if (!g) return { ok: s.dead[d.final], order, len };
    if (pick) g = pick(g);
    const p = shortestPath(d, s, at, g.node); if (!p) return { ok: false, order, len };
    // 路上经过的活首领也要打
    for (const id of p.slice(1)) { const nn = node(d, id); if (nn.boss !== undefined && !s.dead[nn.boss]) { onBossDead(d, s, nn.boss); order.push(nn.name); } }
    len += pathLen(d, p); at = g.node;
    if (g.prop) { const r = useProp(d, s, g.prop); order.push(`${g.prop.label}${r.ok ? '' : '×'}`); }
    if (g.boss !== undefined && !s.dead[g.boss]) { onBossDead(d, s, g.boss); order.push(node(d, g.node).name); }
    if (!g.prop && g.boss === undefined) { const e = (d.elites ?? []).find(x => x.node === g!.node); if (e) { s.elites.push(e.id); order.push(e.name); } }
  }
  return { ok: false, order, len };
}
