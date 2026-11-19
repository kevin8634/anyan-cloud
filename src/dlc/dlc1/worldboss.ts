// ======================================================================
// DLC1 世界首领（v1.2.6 d1.10a）：潮汐巨鲸（沉钟海岸 · 深潮口）、镜像骑士团（镜渊城 · 回响长街）
//   刷新：按真实时间（存档 dlc.dlc1.wb），出现前 2 分钟在两张 DLC 图里喊话；出现后一直在，直到被打倒
//   玩家不在那张图时只记「已出现」，进图时再生成（PackCtx.spawnBoss 只在当前区域可见）
//   掉落：raid_boss 表（必紫 + 心核 / 暗岩碎片）；每日首杀额外一件橙装 + 经验。40 级专属橙装在 d1.10b 补
//   地图标记：worldboss 状态 → 沉钟海岸 / 镜渊城的 mapBadge 与传送阵 badge（本体只负责画）
// ======================================================================
import type { PackCtx, PackBossDef } from '../../core/ContentPacks';
import type { BossDef } from '../../core/BossBrain';
import type { ItemDef } from '../../core/Loadout';
import type { ModifierDef } from '../../core/types';
import { COAST_ID, COAST_O } from './coast';
import { MIRROR_ID, MIRROR_O } from './mirror';
import { setTidePhase } from './tide';
import { whaleSong, warHorn } from './sfx_kit';   // v1.2.9 登场音效

type M = PackBossDef['mob'];
const cfg = (dmg: number, speed: number, range: number, interval: number) => ({ aggroRange: 14, attackRange: range, attackDamage: dmg, attackInterval: interval, moveSpeed: speed, leashRange: 34, patrolRadius: 0 });

export interface DlcWorldBoss {
  key: string; name: string; short: string; map: string; O: { x: number; z: number }; x: number; z: number; r: number; arena: string;
  respawnMin: number; mob: M; boss: BossDef; adds: NonNullable<PackBossDef['adds']>; theme: NonNullable<PackBossDef['theme']>;
  yells: { warn: string; spawn: string; death: string };
  /** v1.2.7 专属橙装（固定装备 id，只在这只首领掉） */
  uniques: string[];
}
export const WB_WARN_MIN = 2;
/** 专属橙装单件掉率（每次击杀各自判定）；每日首杀必掉一件（优先还没拿过的） */
export const WB_UNIQUE_CHANCE = 0.12;

// ---------------------------------------------------------------- 专属橙装（v1.2.7 d1.10b-1：4 件首饰 / 披风，六职业通用）
const fx = (id: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): ModifierDef => ({ id, name: desc, source: 'equipment', desc, ...m });
type WbItem = ItemDef & { baseId: string; affixes: number; desc: string };
const slotOf: Record<string, ItemDef['slot']> = { b_idol: 'trinket', b_cloak: 'back', b_amulet: 'neck', b_ring: 'ring' };
const item = (id: string, name: string, baseId: string, desc: string, mods: ModifierDef[]): WbItem => ({ id, name, baseId, slot: slotOf[baseId], quality: 'orange', modifiers: mods, affixes: 3, desc });
export const WB_ITEMS: WbItem[] = [
  item('dwb_whale_bell', '鸣潮者的背钟', 'b_idol', '巨鲸背上三口钟里最小的一口，摇一摇，海就往回退。', [
    fx('dwbbell', '技能 2 命中时敲响钟声：半径 4 米余波（50% 伤害）并减速 30%（2 秒）', { match: { slots: ['skill2'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.5 } }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }] }),
    fx('dwbbell2', '冰霜伤害 +15%', { match: { elements: ['frost'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ]),
  item('dwb_whale_cloak', '退潮鲸皮披风', 'b_cloak', '披上它，脚下的水会让开一条路。', [
    fx('dwbcloak', '大招命中后获得潮汐护盾（最大生命 16%，6 秒）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.16, duration: 6 } }] }),
    fx('dwbcloak2', '位移技能伤害 +30%', { match: { tagsAny: ['movement'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] }),
  ]),
  item('dwb_knight_mirror', '瑟兰的镜盾碎片', 'b_amulet', '碎片里还能看见骑士团列队的倒影。', [
    fx('dwbmirror', '技能 1~3 命中后在目标处炸开倒影（半径 2.5，35% 伤害）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2.5, damagePercent: 0.35 } }] }),
    fx('dwbmirror2', '奥术伤害 +15%', { match: { elements: ['arcane'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ]),
  item('dwb_knight_oath', '骑士团誓约指环', 'b_ring', '「城门还没关，我们就还在当值。」', [
    fx('dwboath', '眩晕或打断敌人后 6 秒内所有技能伤害 +25%', { match: {}, conditions: [{ type: 'flag', key: 'cc' }], ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] }),
    fx('dwboath2', '普通攻击叠誓约：同一目标 5 次眩晕 1.2 秒（首领只打断）', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'stackStun', stacks: 5, duration: 1.2, name: '誓约制裁' } }] }),
  ]),
];

export const WB_WHALE: DlcWorldBoss = {
  uniques: ['dwb_whale_bell', 'dwb_whale_cloak'],
  key: 'dwb_whale', name: '潮汐巨鲸 · 鸣潮者', short: '潮汐巨鲸', map: COAST_ID, O: COAST_O, x: 0, z: -62, r: 16, arena: '深潮口', respawnMin: 25, theme: 'frost',
  mob: { name: '潮汐巨鲸 · 鸣潮者', level: 35, model: 'dlc1_tide_whale', hp: 238000 /* fix1108b #1 原 90000 */, dmg: 150, interval: 2.6, speed: 2.4, aggro: 14, range: 5.2, xp: 6000, ilvl: 72, leash: 34, elite: true, scale: 1.6, loot: 'raid_boss' },
  adds: { dwb_add_tidal: { name: '随潮而来的溺亡者', level: 35, model: 'dlc1_drowned', tint: 0x40e0e0, tintK: 0.35, hp: 3600, dmg: 70, interval: 1.8, speed: 4, aggro: 18, range: 2.2, xp: 160, ilvl: 70 } },
  yells: {
    warn: '深潮口的海水在往后退——退得太远了。有什么大东西要浮上来。',
    spawn: '潮汐巨鲸浮出深潮口！它背上的三口沉钟同时响了。',
    death: '巨鲸沉回了海底。背上的钟声，一口一口地停了。',
  },
  boss: { name: '潮汐巨鲸', config: cfg(150, 2.4, 5.2, 2.6), globalCooldown: 3.4,
    abilities: [
      { id: 'tail', kind: 'groundSlam', name: '巨尾拍岸', cooldown: 9, telegraph: 1.5, radius: 6.5, damage: 300, element: 'physical', atSelf: true },
      { id: 'breach', kind: 'groundSlam', name: '鲸跃 · 破浪', cooldown: 14, telegraph: 1.8, radius: 4.5, damage: 260, element: 'frost', count: 3, spread: 9 },
      { id: 'surge', kind: 'cast', name: '涨潮', cooldown: 18, castTime: 2.4, damage: 200, element: 'frost', effect: { type: 'slow', percent: 0.45, duration: 4 }, lockout: 3 },
      { id: 'pool', kind: 'poisonZone', name: '冷潮漩涡', cooldown: 16, radius: 3.6, duration: 8, dps: 80, element: 'frost', count: 2, spread: 8 },
      { id: 'tidal', kind: 'summon', name: '潮水带来溺亡者', cooldown: 26, count: 3, unit: 'dwb_add_tidal' },
    ],
    phases: [
      { name: '第一阶段 · 浮潮', hpBelow: 1, abilities: ['tail', 'surge', 'breach'] },
      { name: '第二阶段 · 满潮', hpBelow: 0.6, abilities: ['tail', 'surge', 'breach', 'pool', 'tidal'], damageMul: 1.15, onEnter: 'tidal', yell: '海水漫过了浅滩——潮汐巨鲸把整片海都叫了过来！' },
      { name: '第三阶段 · 钟鸣', hpBelow: 0.25, abilities: ['tail', 'breach', 'pool', 'tidal'], damageMul: 1.3, yell: '三口沉钟一齐狂响，巨鲸疯了一样拍打海面！' },
    ] },
};

export const WB_KNIGHTS: DlcWorldBoss = {
  uniques: ['dwb_knight_mirror', 'dwb_knight_oath'],
  key: 'dwb_knights', name: '镜像骑士团 · 团长瑟兰', short: '镜像骑士团', map: MIRROR_ID, O: MIRROR_O, x: 0, z: 22, r: 15, arena: '回响长街', respawnMin: 25, theme: 'stone',
  mob: { name: '镜像骑士团 · 团长瑟兰', level: 38, model: 'dlc1_knight_captain', hp: 270000 /* fix1108b #1 原 96000 */, dmg: 165, interval: 2.2, speed: 3.6, aggro: 14, range: 3.4, xp: 6800, ilvl: 80, leash: 34, elite: true, scale: 1.7, loot: 'raid_boss' },
  adds: { dwb_add_knight: { name: '镜像骑士', level: 38, model: 'dlc1_mirror_knight', hp: 5200, dmg: 90, interval: 2, speed: 4, aggro: 18, range: 2.6, xp: 220, ilvl: 78, scale: 1.1 } },
  yells: {
    warn: '回响长街两侧的镜子里，同时多了一排站得笔直的人影。',
    spawn: '镜像骑士团从镜子里走了出来！团长瑟兰：「城门还没关，我们就还在当值。」',
    death: '瑟兰单膝跪下，镜盾碎成一地星光：「……换岗了。」',
  },
  boss: { name: '团长瑟兰', config: cfg(165, 3.6, 3.4, 2.2), globalCooldown: 3.0,
    abilities: [
      { id: 'cleave', kind: 'groundSlam', name: '镜刃横斩', cooldown: 8, telegraph: 1.2, radius: 5, damage: 280, element: 'physical', atSelf: true },
      { id: 'lances', kind: 'groundSlam', name: '倒影长枪', cooldown: 12, telegraph: 1.5, radius: 3.2, damage: 240, element: 'arcane', count: 4, spread: 9 },
      { id: 'blind', kind: 'cast', name: '镜光致盲', cooldown: 16, castTime: 2.0, damage: 180, element: 'arcane', effect: { type: 'stun', duration: 1.2 }, lockout: 2.5 },
      { id: 'squad', kind: 'summon', name: '列队', cooldown: 30, count: 2, unit: 'dwb_add_knight' },
      { id: 'oath', kind: 'cast', name: '骑士誓言', cooldown: 28, castTime: 3.0, damage: 120, element: 'arcane', selfHealPercent: 0.04, lockout: 2 },
    ],
    phases: [
      { name: '第一阶段 · 当值', hpBelow: 1, abilities: ['cleave', 'lances', 'blind'] },
      { name: '第二阶段 · 列队', hpBelow: 0.7, abilities: ['cleave', 'lances', 'blind', 'squad'], damageMul: 1.1, onEnter: 'squad', yell: '瑟兰举起镜盾：「第二列，上前！」' },
      { name: '第三阶段 · 誓言', hpBelow: 0.35, abilities: ['cleave', 'lances', 'blind', 'squad', 'oath'], damageMul: 1.25, onEnter: 'squad', yell: '「誓言还在，骑士团就还在！」（打断他的「骑士誓言」）' },
    ] },
};
export const DLC_WORLD_BOSSES = [WB_WHALE, WB_KNIGHTS];

// ---------------------------------------------------------------- 状态（存档）
type WbRec = { next: number; up?: 1; kills?: number; day?: string; got?: string[] };
let rnd = () => Math.random();
let S: Record<string, WbRec> = {};
let ctx: PackCtx | null = null;
let now = () => Date.now();
export const bindWorldBoss = (c: PackCtx) => { ctx = c; };
const today = () => { const d = new Date(now()); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const rec = (b: DlcWorldBoss) => (S[b.key] ??= { next: now() + 3 * 60000 });   // 第一次：3 分钟后出现（1 分钟后开始预警）
export function wbSave(): Record<string, WbRec> | null { return Object.keys(S).length ? JSON.parse(JSON.stringify(S)) : null; }
export function wbLoad(d: unknown) { S = d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : {}; warned.clear(); }
const warned = new Set<string>();
/** v1.2.54 评委版：首领临时换战场（巨鲸 → 镜渊城湖岸，不渡海）。正常游戏不设置 = 原战场 */
export const wbArena: Record<string, { map: string; O: { x: number; z: number }; x: number; z: number; arena: string; spawn?: string } | undefined> = {};
const L = (b: DlcWorldBoss) => wbArena[b.key] ?? b;
let t1 = 0;

function bossDef(b: DlcWorldBoss): PackBossDef {
  const l = L(b); return { key: b.key, map: l.map, x: l.O.x + l.x, z: l.O.z + l.z, mob: b.mob, boss: b.boss, adds: b.adds, theme: b.theme, yells: { spawn: (wbArena[b.key]?.spawn) ?? b.yells.spawn, death: b.yells.death }, onDeath: () => onDeath(b) };
}
function onDeath(b: DlcWorldBoss) {
  const r = rec(b); r.up = undefined; r.kills = (r.kills ?? 0) + 1; r.next = now() + b.respawnMin * 60000; warned.delete(b.key);
  if (!ctx) return;
  const first = r.day !== today(); r.day = today();
  ctx.banner?.({ big: `世界首领 · ${b.short}`, small: first ? '今日首杀：必掉一件专属橙装' : `${b.respawnMin} 分钟后再次出现`, theme: 'dual', ms: 3600 });
  const l = L(b), X = l.O.x + l.x, Z = l.O.z + l.z, got = (r.got ??= []);
  const drop = (id: string) => { const n = ctx!.dropFixed?.(id, X, Z); if (n) { if (!got.includes(id)) got.push(id); ctx!.toast(`专属橙装：${n}`, '#ff8000'); } else ctx!.dropLoot(X, Z, 'orange'); };
  const rolled = b.uniques.filter(() => rnd() < WB_UNIQUE_CHANCE);
  if (first && !rolled.length) rolled.push(b.uniques.find(u => !got.includes(u)) ?? b.uniques[Math.floor(rnd() * b.uniques.length)]);
  rolled.forEach(drop);
  if (first) ctx.addXp?.(Math.round(b.mob.level * 120));
  ctx.save();
}
/** 当前状态：up = 已出现（在场或等玩家进图）、warn = 预警中（剩余秒）、wait = 等刷新（剩余秒）、locked = 等级不够还没开始计时 */
export function wbStatus(b: DlcWorldBoss): { st: 'up' | 'warn' | 'wait' | 'locked'; left: number } {
  if (!ctx || ctx.level() < b.mob.level - 5) return { st: 'locked', left: 0 };
  const r = rec(b); if (r.up) return { st: 'up', left: 0 };
  const left = Math.max(0, (r.next - now()) / 1000);
  return { st: left <= WB_WARN_MIN * 60 ? 'warn' : 'wait', left };
}
const inDlcMap = () => !!ctx && (ctx.map() === COAST_ID || ctx.map() === MIRROR_ID);

export function wbUpdate(dt: number) {
  if (!ctx || (t1 += dt) < 1) return; t1 = 0;
  for (const b of DLC_WORLD_BOSSES) {
    const s = wbStatus(b); if (s.st === 'locked') continue;
    const r = rec(b), here = ctx.map() === L(b).map;
    if (s.st === 'warn' && !warned.has(b.key)) {
      warned.add(b.key);
      if (inDlcMap()) { ctx.yell(`${b.yells.warn}（${b.short} · ${Math.ceil(s.left / 60)} 分钟后出现在${b.arena}）`); ctx.toast(`世界首领「${b.short}」即将出现在${b.arena}`, '#5ff0e0'); }
    }
    if (!r.up && s.left <= 0) {
      r.up = 1; warned.delete(b.key);
      if (!here && inDlcMap()) ctx.toast(`世界首领「${b.short}」出现了（${b.arena}）`, '#5ff0e0');
      if (here && b === WB_WHALE) setTidePhase('high');   // 巨鲸出水 = 涨潮
    }
    // 生成 / 移除：只在那张图里
    const bs = ctx.bossState?.(b.key) ?? 'none';
    if (r.up && here && bs !== 'alive') {
      ctx.spawnBoss?.(bossDef(b));
      if (bs === 'none') { const A = ctx.synth?.(); if (A && A.gate(`wb_in_${b.key}`, 5)) (b === WB_WHALE ? whaleSong : warHorn)(A); wbSfxLog.push(b.key); }   // v1.2.9 登场音效
    }
    else if (!r.up && bs === 'dead' && !here) ctx.removeBoss?.(b.key);
  }
}

/** 地图 / 传送阵标记文字（世界首领优先，其次新区域提示） */
export function wbBadge(b: DlcWorldBoss): string | null {
  const s = wbStatus(b);
  if (s.st === 'up') return `首领 · ${b.short}`;
  if (s.st === 'warn') return `${b.short} · ${Math.max(1, Math.ceil(s.left / 60))} 分钟`;
  return null;
}
export const coastBadge = () => wbBadge(WB_WHALE) ?? (ctx && ctx.level() >= 30 && ['available', 'active'].includes(ctx.questState('cs7_1')) ? '新区域 · 第七章' : null);
export const mirrorBadge = () => wbBadge(WB_KNIGHTS) ?? (ctx && ['available', 'active'].includes(ctx.questState('cs8_1')) ? '新区域 · 第八章' : null);

/** 测试 / 调试 */
/** v1.2.9 测试用：放过的登场音效 */
export const wbSfxLog: string[] = [];
export const wbDebug = {
  state: () => JSON.parse(JSON.stringify(S)),
  status: () => Object.fromEntries(DLC_WORLD_BOSSES.map(b => [b.key, wbStatus(b)])),
  /** 让某个首领 sec 秒后出现（0 = 立刻） */
  setNext: (key: string, sec: number) => { const b = DLC_WORLD_BOSSES.find(x => x.key === key); if (b) { const r = rec(b); r.up = undefined; r.next = now() + sec * 1000; warned.delete(key); } },
  tick: (dt = 1.01) => { t1 = 1; wbUpdate(dt); },
  setClock: (f: (() => number) | null) => { now = f ?? (() => Date.now()); },
  setRng: (f: (() => number) | null) => { rnd = f ?? (() => Math.random()); },
  items: WB_ITEMS.map(i => i.id),
  bosses: DLC_WORLD_BOSSES.map(b => ({ key: b.key, name: b.name, map: b.map, x: b.O.x + b.x, z: b.O.z + b.z, arena: b.arena })),
};
