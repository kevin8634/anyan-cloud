// ======================================================================
// DLC1 结局 A「钟楼领地」（v1.1.1，d1.8）—— 数据 + 逻辑 + 存档
// 方案 v3 §五：重建镜渊城 8 座建筑（每座 3 级，每级一个常驻加成 / 服务）、回响居民、每天敲钟选一条钟律、第 7 键钟鸣（bellchime.ts）
// 只对选了「再鸣」（DLC1_FATE.choice() === 'A'）的角色开放；选「断绳」的角色看不到领地、按钮、地块。
// 材料：金币（本体）+ 钟铜 / 回响（领地自己的材料，存在 dlc.dlc1.domain.mats，不进本体背包）
//   钟铜：DLC 区域击杀（普通 35% 1 个，精英 4 个，首领 10 个）；回响：精英 1 个、首领 3 个；任务奖励 / 解锁时伊奥拉送一批
// 建造：同一时间只能建一座（钟楼 2 级起两座）；按真实时间推进（离线也算），可以花回响加速；其他建筑等级不能超过钟楼
// 存档：dlc.dlc1.domain（没解锁 = 不写）
// ======================================================================
import type { PackCtx, PackMods } from '../../core/ContentPacks';
import { fateChoice, btState } from './fate';

export type BId = 'belfry' | 'forge' | 'academy' | 'dock' | 'sanctum' | 'market' | 'training' | 'archive';
export interface Cost { gold: number; bronze: number; echo: number }
/** 领地内部加成（PackMods 之外的：钟鸣 / 掉落 / 回血） */
export interface DomainMods extends PackMods { chimeCharge?: number; chimeDmg?: number; chimeVuln?: number; chimeR?: number; eliteBronze?: number; killHeal?: number; eliteLoot?: number; bossRegen?: number; sageLoot?: number }
export interface BuildingDef {
  id: BId; name: string; role: string; desc: string; plot: { x: number; z: number }; color: number;
  /** 每级加成说明（累计值） */
  lv: [string, string, string];
  mods: (lv: number) => DomainMods;
  service?: { name: string; desc: (lv: number) => string };
  /** 解锁时刻的一句话 */
  line: string;
}
export const MAX_LV = 3;
/** 每级成本 / 建造分钟（钟楼一级打折，作为第一座） */
const COST: Cost[] = [{ gold: 2000, bronze: 20, echo: 5 }, { gold: 6000, bronze: 45, echo: 12 }, { gold: 15000, bronze: 90, echo: 25 }];
const MINUTES = [2, 5, 10];

export const BUILDINGS: BuildingDef[] = [
  { id: 'belfry', name: '钟楼', role: '领地核心', desc: '城中央的钟楼。每天在这里敲一次钟，从几条钟律中选一条，今天一整天都生效。其他建筑的等级不能超过钟楼。',
    plot: { x: -26, z: 40 }, color: 0x7fe8f0, lv: ['钟律 3 选 1 · 钟鸣充能 +15%', '钟律 4 选 1 · 钟鸣充能 +30% · 可同时建两座', '钟律 5 选 1 · 钟鸣充能 +50%'],
    mods: l => ({ chimeCharge: [0, 0.15, 0.3, 0.5][l] }), service: { name: '敲钟', desc: () => '选择今天的钟律' }, line: '钟楼重新立起来了。伊奥拉在钟下面朝你挥手。' },
  { id: 'forge', name: '铁匠工坊', role: '锻造', desc: '戈兹的炉子又热了。工坊让你下手更重，还能用回响锻出一件好装备。',
    plot: { x: 40, z: 18 }, color: 0xff9040, lv: ['造成伤害 +2% · 回响锻造（紫）', '造成伤害 +4% · 回响锻造（紫）', '造成伤害 +6% · 回响锻造（橙）'],
    mods: l => ({ dealt: 1 + [0, 0.02, 0.04, 0.06][l] }), service: { name: '回响锻造', desc: l => `花 ${FORGE_ECHO} 回响，锻出一件${l >= 3 ? '橙色' : '紫色'}装备` }, line: '工坊的烟囱冒烟了。' },
  { id: 'academy', name: '回响学会', role: '学识', desc: '鸣钟人的学会。研究回响让你获得更多经验，也能把钟铜炼成回响。',
    plot: { x: -30, z: 22 }, color: 0xb0a0ff, lv: ['击杀经验 +5% · 安魂研究', '击杀经验 +10% · 安魂研究（更省）', '击杀经验 +15% · 安魂研究（最省）'],
    mods: l => ({ xp: 1 + [0, 0.05, 0.1, 0.15][l] }), service: { name: '安魂研究', desc: l => `${academyRate(l)} 钟铜 → 1 回响` }, line: '学会的穹顶亮起了一圈蓝光。' },
  { id: 'dock', name: '潮汐码头', role: '贸易', desc: '海水回来了，老汉斯的船终于够得着水。码头让怪物掉更多金币，还能坐船回沉钟海岸。',
    plot: { x: 28, z: 50 }, color: 0x40c0e0, lv: ['击杀金币 +5% · 渡船', '击杀金币 +10% · 渡船', '击杀金币 +15% · 渡船'],
    mods: l => ({ gold: 1 + [0, 0.05, 0.1, 0.15][l] }), service: { name: '渡船', desc: () => '坐船去沉钟海岸' }, line: '码头上挂起了灯，有船靠岸了。' },
  { id: 'sanctum', name: '圣所', role: '庇护', desc: '小圣堂修好了。圣所的钟声护着你，让你受到的伤害更少，也能在这里祈福回满生命。',
    plot: { x: -46, z: -46 }, color: 0xfff0c0, lv: ['承受伤害 −3% · 祈福', '承受伤害 −6% · 祈福', '承受伤害 −9% · 祈福'],
    mods: l => ({ taken: 1 - [0, 0.03, 0.06, 0.09][l] }), service: { name: '祈福', desc: () => '立即回满生命（60 秒一次）' }, line: '圣所的玫瑰窗透出暖光。' },
  { id: 'market', name: '市集', role: '流通', desc: '长街的摊子又摆起来了。精英怪会多掉钟铜，多余的钟铜可以卖成金币。',
    plot: { x: -24, z: 60 }, color: 0xffd060, lv: ['精英额外钟铜 +1 · 收购钟铜', '精英额外钟铜 +2 · 收购钟铜', '精英额外钟铜 +3 · 收购钟铜'],
    mods: l => ({ eliteBronze: l }), service: { name: '收购钟铜', desc: l => `10 钟铜 → ${MARKET_GOLD * l} 金币` }, line: '市集的灯笼一串串亮了。' },
  { id: 'training', name: '训练场', role: '钟鸣', desc: '守钟人的训练场。钟鸣更响、范围更大、易伤更重；每天可以试敲一次，立即充满钟鸣。',
    plot: { x: 30, z: -18 }, color: 0xe06060, lv: ['钟鸣伤害 +20% · 易伤 +5%', '钟鸣伤害 +40% · 易伤 +10% · 范围 +1 米', '钟鸣伤害 +60% · 易伤 +15% · 范围 +2 米'],
    mods: l => ({ chimeDmg: [0, 0.2, 0.4, 0.6][l], chimeVuln: [0, 0.05, 0.1, 0.15][l], chimeR: [0, 0, 1, 2][l] }), service: { name: '试敲', desc: () => '钟鸣立即充满（每天一次）' }, line: '训练场上竖起了新的木桩。' },
  { id: 'archive', name: '档案馆', role: '居民', desc: '回响们的名册。档案馆越大，能入住的回响居民越多。',
    plot: { x: -52, z: 24 }, color: 0x90d0a0, lv: ['回响居民上限 6', '回响居民上限 9', '回响居民上限 12'],
    mods: () => ({}), line: '档案馆里，一本本名册重新摆上了书架。' },
];
export const BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b])) as Record<BId, BuildingDef>;
export const FORGE_ECHO = 10, MARKET_GOLD = 400;
export const academyRate = (l: number) => [20, 20, 15, 10][l];

export function costOf(id: BId, toLv: number): Cost {
  const c = COST[toLv - 1]; const k = id === 'belfry' && toLv === 1 ? 0.5 : 1;
  return { gold: Math.round(c.gold * k), bronze: Math.round(c.bronze * k), echo: Math.round(c.echo * k) };
}
export const minutesOf = (id: BId, toLv: number) => (id === 'belfry' && toLv === 1 ? 1 : MINUTES[toLv - 1]);

// ---------------------------------------------------------------- 回响居民
export interface ResidentDef { id: string; name: string; title: string; home: BId; from: { quest?: string; kill?: string }; desc: string; mods: DomainMods }
export const RESIDENTS: ResidentDef[] = [
  { id: 'echo_ouf', name: '欧芙', title: '面包师', home: 'market', from: { quest: 'cs8_r01' }, desc: '击杀金币 +4%', mods: { gold: 1.04 } },
  { id: 'echo_brun', name: '布伦', title: '守门人', home: 'training', from: { quest: 'cs8_r02' }, desc: '承受伤害 −3%', mods: { taken: 0.97 } },
  { id: 'echo_tisha', name: '缇莎', title: '小女孩', home: 'academy', from: { quest: 'cs8_r03' }, desc: '击杀经验 +4%', mods: { xp: 1.04 } },
  { id: 'echo_hans', name: '老汉斯', title: '渔夫', home: 'dock', from: { quest: 'cs8_r04' }, desc: '击杀金币 +4%', mods: { gold: 1.04 } },
  { id: 'echo_melo', name: '梅洛', title: '抄经员', home: 'archive', from: { quest: 'cs8_r05' }, desc: '击杀经验 +4%', mods: { xp: 1.04 } },
  { id: 'echo_goz', name: '戈兹', title: '铁匠', home: 'forge', from: { quest: 'cs8_r06' }, desc: '造成伤害 +3%', mods: { dealt: 1.03 } },
  { id: 'echo_lian', name: '莉安', title: '新娘', home: 'sanctum', from: { quest: 'cs8_r07' }, desc: '击杀回复 1% 生命', mods: { killHeal: 0.01 } },
  { id: 'echo_pike', name: '派克', title: '学徒敲钟人', home: 'belfry', from: { quest: 'cs8_r08' }, desc: '钟鸣充能 +15%', mods: { chimeCharge: 0.15 } },
  { id: 'echo_sein', name: '赛恩', title: '卫兵队长', home: 'training', from: { quest: 'cs8_r09' }, desc: '造成伤害 +2%', mods: { dealt: 1.02 } },
  { id: 'echo_otta', name: '奥塔', title: '老妇人', home: 'belfry', from: { quest: 'cs8_r10' }, desc: '钟鸣伤害 +15%', mods: { chimeDmg: 0.15 } },
  { id: 'echo_seteh', name: '塞特赫之回响', title: '城门守卫', home: 'sanctum', from: { kill: 'bt_b4' }, desc: '首领对你的伤害 −5%', mods: { takenBoss: 0.95 } },
  { id: 'echo_valkaz', name: '瓦尔卡兹之回响', title: '炉火看守', home: 'forge', from: { kill: 'bt_b5' }, desc: '造成伤害 +4%', mods: { dealt: 1.04 } },
];
export const resCap = (archiveLv: number) => 3 + 3 * archiveLv;

// ---------------------------------------------------------------- 钟律
export interface RuleDef { id: string; name: string; desc: string; mods: DomainMods }
export const RULES: RuleDef[] = [
  { id: 'tide', name: '潮汐律', desc: '野外精英被击杀时额外掉落 1 件装备', mods: { eliteLoot: 1 } },
  { id: 'hush', name: '静默律', desc: '首领对你造成的伤害 −15%', mods: { takenBoss: 0.85 } },
  { id: 'bronze', name: '铸铜律', desc: '造成伤害 +8%', mods: { dealt: 1.08 } },
  { id: 'echo', name: '回响律', desc: '每次击杀回复 5% 生命；首领战中每 10 秒回复 3% 生命', mods: { killHeal: 0.05, bossRegen: 0.03 } },
  { id: 'gold', name: '金钟律', desc: '击杀金币 +25%', mods: { gold: 1.25 } },
  { id: 'peal', name: '鸣钟律', desc: '钟鸣充能 +60%，钟鸣伤害 +30%', mods: { chimeCharge: 0.6, chimeDmg: 0.3 } },
  { id: 'sage', name: '学者律', desc: '击杀掉落钟铜（普通 1 · 精英 3）；击败首领额外多掉 1 枚首领之证（强化突破材料）', mods: { sageLoot: 1 } },
];
export const RULE_BY = Object.fromEntries(RULES.map(r => [r.id, r])) as Record<string, RuleDef>;

// ---------------------------------------------------------------- 存档
export interface DomainSave {
  on?: boolean;                                   // 已解锁（送过开局材料）
  lv: Partial<Record<BId, number>>;
  /** 建造队列：建筑 → { 开始毫秒, 结束毫秒, 目标等级 } */
  q: Partial<Record<BId, { s: number; e: number; to: number }>>;
  mats: { bronze: number; echo: number };
  res: string[];                                  // 已入住
  rule?: { day: string; id: string };             // 今天的钟律
  daily?: Record<string, string>;                 // 每日一次的服务：服务 id → 日期
  got?: string[];                                 // 已领过的任务材料奖励
  chime?: number;                                 // 钟鸣充能 0–100
}
const fresh = (): DomainSave => ({ lv: {}, q: {}, mats: { bronze: 0, echo: 0 }, res: [] });
let D: DomainSave = fresh();
let ctx: PackCtx | null = null;
let clockOff = 0;   // 测试：时间偏移（毫秒）
export const now = () => Date.now() + clockOff;
export const dayKey = (t = now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const domainSave = (): DomainSave | null => (D.on ? JSON.parse(JSON.stringify(D)) : null);
export function domainLoad(d: unknown) {
  const o = d && typeof d === 'object' ? d as Partial<DomainSave> : {};
  D = { ...fresh(), ...o, lv: { ...(o.lv ?? {}) }, q: { ...(o.q ?? {}) }, mats: { bronze: Math.max(0, o.mats?.bronze ?? 0), echo: Math.max(0, o.mats?.echo ?? 0) }, res: [...(o.res ?? [])] };
  for (const k of Object.keys(D.lv) as BId[]) if (!BY_ID[k]) delete D.lv[k]; else D.lv[k] = Math.max(0, Math.min(MAX_LV, D.lv[k] ?? 0));
  dirty++;
}
export const domainState = () => D;
export const bindDomain = (c: PackCtx) => { ctx = c; };
export const domainCtx = () => ctx;
/** 版本号：状态变了就 +1（3D / 界面据此重画） */
export let dirty = 0;
const touch = () => { dirty++; };

/** 领地对这个角色是否开放：选了再鸣 */
export const domainOpen = () => fateChoice() === 'A';
export const lvOf = (id: BId) => D.lv[id] ?? 0;
export const building = (id: BId) => D.q[id] ?? null;

// ---------------------------------------------------------------- 解锁
export function ensureUnlocked(): boolean {
  if (!domainOpen()) return false;
  if (D.on) return true;
  D.on = true;
  const k = btState().kills ?? {};
  const hist = Object.values(k).reduce((s, n) => s + (n ?? 0), 0);
  D.mats.bronze += 60; D.mats.echo += 20 + Math.min(20, hist * 2);
  touch();
  ctx?.toast('钟楼领地已开放：镜渊城等着你把它重建起来', '#9ff0ff');
  ctx?.toast(`伊奥拉留给你一些材料：钟铜 ×60、回响 ×${20 + Math.min(20, hist * 2)}（去镜渊城，点屏幕下方的「钟楼领地」）`, '#9ff0ff');
  ctx?.save();
  return true;
}

// ---------------------------------------------------------------- 建造
export const queueCap = () => (lvOf('belfry') >= 2 ? 2 : 1);
export const queued = () => (Object.keys(D.q) as BId[]).filter(k => D.q[k]);
/** 不能建的原因（null = 可以） */
export function whyNot(id: BId): string | null {
  if (!domainOpen()) return '只有守钟人能重建镜渊城';
  const l = lvOf(id);
  if (l >= MAX_LV) return '已满级';
  if (D.q[id]) return '正在建造';
  if (id !== 'belfry' && lvOf('belfry') < 1) return '先重建钟楼';
  if (id !== 'belfry' && l + 1 > lvOf('belfry')) return `钟楼需要 ${l + 1} 级`;
  if (queued().length >= queueCap()) return queueCap() > 1 ? '同时最多建两座' : '同时只能建一座（钟楼 2 级可以建两座）';
  const c = costOf(id, l + 1), g = ctx?.gold?.() ?? 0;
  if (g < c.gold) return '金币不够';
  if (D.mats.bronze < c.bronze) return '钟铜不够';
  if (D.mats.echo < c.echo) return '回响不够';
  return null;
}
export function startBuild(id: BId): boolean {
  const w = whyNot(id); if (w) { ctx?.toast(`${BY_ID[id].name}：${w}`, '#ff9a40'); return false; }
  const to = lvOf(id) + 1, c = costOf(id, to);
  if (c.gold > 0 && !(ctx?.spendGold?.(c.gold) ?? false)) { ctx?.toast('金币不够', '#ff9a40'); return false; }
  D.mats.bronze -= c.bronze; D.mats.echo -= c.echo;
  const s = now(); D.q[id] = { s, e: s + minutesOf(id, to) * 60000, to };
  touch(); ctx?.save();
  ctx?.toast(`开始${to === 1 ? '重建' : '扩建'}「${BY_ID[id].name}」→ ${to} 级（${minutesOf(id, to)} 分钟）`, '#ffd890');
  return true;
}
/** 加速：剩余每分钟 1 回响（不足 1 分钟按 1 分钟） */
export const rushCost = (id: BId) => { const q = D.q[id]; return q ? Math.max(1, Math.ceil((q.e - now()) / 60000)) : 0; };
export function rush(id: BId): boolean {
  const q = D.q[id]; if (!q) return false;
  const c = rushCost(id);
  if (D.mats.echo < c) { ctx?.toast(`加速需要 ${c} 回响`, '#ff9a40'); return false; }
  D.mats.echo -= c; q.e = now(); tickBuild(); return true;
}
/** 建造进度 0–1 */
export const progress = (id: BId) => { const q = D.q[id]; return q ? Math.max(0, Math.min(1, (now() - q.s) / Math.max(1, q.e - q.s))) : 0; };
export function tickBuild(): BId[] {
  const done: BId[] = [];
  for (const id of queued()) {
    const q = D.q[id]!; if (now() < q.e) continue;
    D.lv[id] = q.to; delete D.q[id]; done.push(id);
    const b = BY_ID[id];
    ctx?.toast(`「${b.name}」${q.to === 1 ? '重建完成' : `扩建到 ${q.to} 级`}：${b.lv[q.to - 1]}`, '#9ff0ff');
    if (q.to === 1) ctx?.yell(b.line);
    ctx?.synth?.()?.tone({ f: 523, type: 'sine', dur: 1.2, gain: 0.06, d: 1.1 });
  }
  if (done.length) { touch(); moveIn(); ctx?.save(); }
  return done;
}

// ---------------------------------------------------------------- 居民
export const residentReady = (r: ResidentDef) => r.from.quest ? (ctx?.questState(r.from.quest) === 'done') : (btState().kills?.[r.from.kill!] ?? 0) > 0;
export function moveIn(): string[] {
  if (!D.on) return [];
  const out: string[] = [];
  for (const r of RESIDENTS) {
    if (D.res.includes(r.id) || D.res.length >= resCap(lvOf('archive'))) continue;
    if (lvOf(r.home) < 1 || !residentReady(r)) continue;
    D.res.push(r.id); out.push(r.id);
    ctx?.toast(`回响居民「${r.name}」（${r.title}）入住了${BY_ID[r.home].name}：${r.desc}`, '#b8f0ff');
  }
  if (out.length) { touch(); ctx?.save(); }
  return out;
}
/** 居民为什么还没入住 */
export function residentWhy(r: ResidentDef): string | null {
  if (D.res.includes(r.id)) return null;
  if (!residentReady(r)) return r.from.quest ? '还在重复那一天（先完成他的支线）' : '还没被安魂（先在无声钟楼击败它）';
  if (lvOf(r.home) < 1) return `等${BY_ID[r.home].name}建好`;
  if (D.res.length >= resCap(lvOf('archive'))) return '档案馆名册已满（扩建档案馆）';
  return '即将入住';
}

// ---------------------------------------------------------------- 钟律
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** 今天可选的钟律（按日期固定洗牌，钟楼等级决定条数） */
export function offered(day = dayKey()): RuleDef[] {
  const n = [0, 3, 4, 5][lvOf('belfry')]; if (!n) return [];
  return [...RULES].sort((a, b) => hash(day + a.id) - hash(day + b.id)).slice(0, n);
}
export const todayRule = (): RuleDef | null => (D.rule && D.rule.day === dayKey() ? RULE_BY[D.rule.id] ?? null : null);
export function ringRule(id: string): boolean {
  if (!domainOpen() || lvOf('belfry') < 1) { ctx?.toast('先重建钟楼', '#ff9a40'); return false; }
  if (todayRule()) { ctx?.toast('今天已经敲过钟了，明天再选新的钟律', '#ff9a40'); return false; }
  const r = offered().find(x => x.id === id); if (!r) return false;
  D.rule = { day: dayKey(), id }; touch(); ctx?.save();
  bellSound();
  ctx?.yell(`当——「${r.name}」：${r.desc}`);
  return true;
}
export function bellSound(k = 1) {
  const A = ctx?.synth?.(); if (!A || !A.gate('dm_bell', 0.4)) return;
  [[1, 0.26], [2.0, 0.13], [2.76, 0.1], [5.4, 0.05]].forEach(([m, g]) => A.tone({ f: 110 * k * m, type: 'sine', dur: 3, gain: g, a: 0.005, d: 2.8, vib: 0.004, vibHz: 4 }));
}

// ---------------------------------------------------------------- 服务
const usedToday = (sid: string) => D.daily?.[sid] === dayKey();
export function service(id: BId): string | null {
  if (!ctx) return null;
  const l = lvOf(id); if (l < 1) return `先建好「${BY_ID[id].name}」`;
  switch (id) {
    case 'forge': {
      if (D.mats.echo < FORGE_ECHO) return `需要 ${FORGE_ECHO} 回响`;
      D.mats.echo -= FORGE_ECHO; const p = ctx.playerPos(); ctx.dropLoot(p.x + 1.2, p.z + 1.2, l >= 3 ? 'orange' : 'purple'); touch(); ctx.save();
      return '回响在炉火里凝成了一件装备（掉在你脚边）';
    }
    case 'academy': {
      const r = academyRate(l); if (D.mats.bronze < r) return `需要 ${r} 钟铜`;
      D.mats.bronze -= r; D.mats.echo += 1; touch(); return `${r} 钟铜炼成了 1 回响`;
    }
    case 'dock': ctx.goMap('dlc1_coast', undefined, '乘船前往'); return '渡船起航';
    case 'sanctum': {
      const t = D.daily?.sanctum_t ? Number(D.daily.sanctum_t) : 0;
      if (now() - t < 60000) return `祈福还要 ${Math.ceil((60000 - (now() - t)) / 1000)} 秒`;
      (D.daily ??= {}).sanctum_t = String(now()); ctx.heal?.(1); return '圣所的钟声抚平了你的伤口';
    }
    case 'market': {
      if (D.mats.bronze < 10) return '需要 10 钟铜';
      const g = MARKET_GOLD * l; D.mats.bronze -= 10; ctx.addGold?.(g); touch(); ctx.save();
      return `卖出 10 钟铜，得到 ${g} 金币`;
    }
    case 'training': {
      if (usedToday('training')) return '今天已经试敲过了';
      (D.daily ??= {}).training = dayKey(); D.chime = 100; touch(); return '钟鸣已充满';
    }
    default: return null;
  }
}
// ---------------------------------------------------------------- 加成汇总
export function domainMods(): DomainMods {
  const m: DomainMods = {};
  if (!domainOpen() || !D.on) return m;
  const add = (x: DomainMods) => {
    for (const [k, v] of Object.entries(x) as [keyof DomainMods, number][]) {
      if (v === undefined) continue;
      if (k === 'dealt' || k === 'taken' || k === 'takenBoss' || k === 'xp' || k === 'gold') m[k] = (m[k] ?? 1) * v;
      else m[k] = (m[k] ?? 0) + v;
    }
  };
  for (const b of BUILDINGS) { const l = lvOf(b.id); if (l > 0) add(b.mods(l)); }
  for (const id of D.res) { const r = RESIDENTS.find(x => x.id === id); if (r) add(r.mods); }
  const t = todayRule(); if (t) add(t.mods);
  return m;
}

// ---------------------------------------------------------------- 战斗事件：材料 / 钟律掉落 / 回血
export function domainOnKill(ev: { kind: string; elite: boolean; boss: boolean; map: string; x: number; z: number }) {
  if (!domainOpen() || !D.on || !ctx) return;
  const m = domainMods();
  const dlc = ev.map.startsWith('dlc1_');
  if (m.killHeal) ctx.heal?.(m.killHeal);
  if (m.eliteLoot && ev.elite && !ev.boss) ctx.dropLoot(ev.x, ev.z, 'blue');
  // v1.2.39c 学者律：任何地图击杀都掉钟铜（普通 1 · 精英 3），首领额外 +1 首领之证
  let sb = 0;
  if (m.sageLoot) {
    sb = ev.boss || ev.elite ? 3 : 1;
    if (ev.boss && ctx.addStack?.('mat_proof', 1)) ctx.toast('学者律 · 首领之证 +1', '#ffd070');
  }
  if (!dlc) { if (sb) { D.mats.bronze += sb; touch(); if (sb > 1) ctx.toast(`钟铜 +${sb}`, '#b8f0ff'); } return; }
  let br = sb, ec = 0;
  if (ev.boss) { br += 10; ec = 3; } else if (ev.elite) { br += 4 + (m.eliteBronze ?? 0); ec = 1; } else if (Math.random() < 0.35) br += 1;
  if (!br && !ec) return;
  D.mats.bronze += br; D.mats.echo += ec; touch();
  if (ec) ctx.toast(`回响 +${ec}${br ? ` · 钟铜 +${br}` : ''}`, '#b8f0ff');
}

// ---------------------------------------------------------------- 第九章 A 线接入：任务目标 + 材料奖励
const QUEST_GIFT: Record<string, { bronze: number; echo: number }> = { cs9a_4: { bronze: 40, echo: 15 }, cs9a_5: { bronze: 0, echo: 20 }, cs9a_6: { bronze: 60, echo: 30 } };
let chimeHits = 0;
export const noteChimeHits = (n: number) => { if (n >= 3) chimeHits = 1; };
function questTick() {
  if (!ctx) return;
  const ev = (q: string, area: string, ok: boolean) => { if (ok && ctx!.questState(q) === 'active') ctx!.questEvent?.('explore', area); };
  ev('cs9a_4', 'dm_q_bell', lvOf('belfry') >= 1);
  ev('cs9a_5', 'dm_q_res', D.res.length >= 3);
  ev('cs9a_6', 'dm_q_rule', !!todayRule());
  ev('cs9a_6', 'dm_q_chime', chimeHits > 0);
  for (const [q, g] of Object.entries(QUEST_GIFT)) {
    if ((D.got ?? []).includes(q) || ctx.questState(q) !== 'done') continue;
    (D.got ??= []).push(q); D.mats.bronze += g.bronze; D.mats.echo += g.echo; touch();
    ctx.toast(`领地材料：${g.bronze ? `钟铜 +${g.bronze} · ` : ''}回响 +${g.echo}`, '#b8f0ff');
  }
}

// ---------------------------------------------------------------- 每帧
let t2 = 0;
let regenT = 0;
export function domainUpdate(dt: number) {
  // v1.2.39c 回响律：首领战中（当前目标是首领）每 10 秒回复 3% 生命
  if (ctx && domainOpen() && D.on) {
    const br = domainMods().bossRegen ?? 0;
    if (br > 0 && ctx.target?.()?.boss) { if ((regenT += dt) >= 10) { regenT = 0; ctx.heal?.(br); } } else regenT = 0;
  }
  if (!ctx || (t2 += dt) < 1) return;
  t2 = 0;
  if (!domainOpen()) return;
  ensureUnlocked();
  tickBuild();
  moveIn();
  questTick();
}

// ---------------------------------------------------------------- 测试 / 调试
export const domainDebug = {
  state: () => D,
  grant: (bronze = 500, echo = 200) => { D.mats.bronze += bronze; D.mats.echo += echo; touch(); },
  finishAll: () => { for (const id of queued()) D.q[id]!.e = now(); return tickBuild(); },
  setLv: (id: BId, l: number) => { D.lv[id] = Math.max(0, Math.min(MAX_LV, l)); touch(); moveIn(); },
  shiftDays: (n: number) => { clockOff += n * 86400000; touch(); },
  shiftMs: (ms: number) => { clockOff += ms; },
  mods: () => domainMods(),
  offered: () => offered().map(r => r.id),
  rule: () => todayRule()?.id ?? null,
  reset: () => { D = fresh(); clockOff = 0; touch(); },
};
