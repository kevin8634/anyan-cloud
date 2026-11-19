// ======================================================================
// DLC1 结局 B「渊噬之躯」（v1.1.2，d1.9）—— 数据 + 逻辑 + 存档
// 方案 v3 §五：6 个变异部位（头 / 眼 / 臂 / 心 / 脊 / 影），吞下首领回响解锁对应部位；变异真的改变角色模型（abyssbody_model.ts）
//   渊化值：战斗中累积（击杀 / 受击 / 吞噬），6 秒没有新来源开始衰减；≥ 70 时怪物变强（受到伤害 +15%），持续 5 秒以上开始掉血（每秒 1%）
//   满值 → 渊形态 15 秒（+ 光脊加成）：造成伤害 +35%、击杀引发渊爆、吞噬冷却减半、影触须抽打；外观：渊焰光环 + 变异部位发光
//   第 7 键「吞噬」（devour.ts）：处决低血敌人，回血 + 渊化值 + 渊质；吞精英有几率得到 60 秒的临时变异
// 只对选了「断绳」（DLC1_FATE.choice() === 'B'）的角色开放；选「再鸣」/ 没选的角色看不到任何内容、没有任何加成
// 材料：渊质（升级变异用，存在 dlc.dlc1.abyss.ess，不进本体背包）——吞噬普通 1 / 精英 4 / 首领 2，DLC 区域击杀首领 8；解锁时卡戎送 30；9B-4..6 完成另送
// 存档：dlc.dlc1.abyss（解锁后才写）
// ======================================================================
import type { PackCtx, PackMods, PackEvent } from '../../core/ContentPacks';
import { fateChoice, btState } from './fate';

export type PartId = 'head' | 'eye' | 'arm' | 'heart' | 'spine' | 'shadow';
export const PART_IDS: PartId[] = ['head', 'eye', 'arm', 'heart', 'spine', 'shadow'];
export const MAX_LV = 3;
export interface PartDef {
  id: PartId; slot: string; name: string; color: string;
  /** 解锁来源：吞下这个首领的回响（无声钟楼击杀记录） */
  boss: string; bossName: string;
  /** 每级说明（累计） */
  lv: [string, string, string];
  /** 模型 / 外观一句话 */
  look: string;
}
export const PARTS: PartDef[] = [
  { id: 'head', slot: '头', name: '渊冠', color: '#b48cff', boss: 'bt_b2', bossName: '缄默修士长', look: '额角长出弯曲的黑角',
    lv: ['首领对你的伤害 −4%', '首领对你的伤害 −7%', '首领对你的伤害 −10% · 渊形态中再 −5%'] },
  { id: 'eye', slot: '眼', name: '第三只眼', color: '#ff4a7a', boss: 'bt_b3', bossName: '断绳回响 · 初代鸣钟人', look: '额心睁开一只竖瞳',
    lv: ['吞噬：生命 ≤ 35% 即可处决', '吞噬：生命 ≤ 40% · 范围 +1 米', '吞噬：生命 ≤ 45% · 范围 +2 米'] },
  { id: 'arm', slot: '臂', name: '结晶臂', color: '#a070ff', boss: 'bt_b1', bossName: '无舌之钟 · 铸钟巨像', look: '右臂裹上紫色晶簇',
    lv: ['造成伤害 +4% · 吞噬时晶刺爆发（普攻 × 1）', '造成伤害 +8% · 晶刺爆发 × 1.5', '造成伤害 +12% · 晶刺爆发 × 2'] },
  { id: 'heart', slot: '心', name: '熔岩之心', color: '#ff7a30', boss: 'bt_b5', bossName: '回响 · 熔心君王瓦尔卡兹', look: '胸口透出熔岩般的心跳',
    lv: ['受击时喷出熔渣（3.5 米，普攻 × 0.6，2 秒一次）', '熔渣 × 0.9', '熔渣 × 1.2 · 渊形态中 1 秒一次'] },
  { id: 'spine', slot: '脊', name: '光脊', color: '#7fe8ff', boss: 'bt_b4', bossName: '回响 · 沙葬法老塞特赫', look: '背脊竖起一排发光骨刺',
    lv: ['渊化值获取 +15% · 渊形态 +2 秒', '渊化值获取 +30% · 渊形态 +4 秒', '渊化值获取 +45% · 渊形态 +6 秒'] },
  { id: 'shadow', slot: '影', name: '影触须', color: '#8a5aff', boss: 'bt_sleeper_b', bossName: '沉眠者（完全觉醒）', look: '影子里伸出几条触须',
    lv: ['击杀回复 1% 生命 · 渊形态中触须每 2 秒抽打（普攻 × 0.6）', '击杀回复 1.5% · 抽打 × 0.9', '击杀回复 2% · 抽打 × 1.2'] },
];
export const PART_BY = Object.fromEntries(PARTS.map(p => [p.id, p])) as Record<PartId, PartDef>;
/** 升到 2 / 3 级的渊质 */
export const UP_COST = [0, 0, 20, 45];

export const AB = {
  formSec: 15, high: 70, highHurtAfter: 5, drain: 0.01, decayAfter: 6, decay: 5,
  gain: { kill: 3, elite: 8, boss: 15, hurt: 1.5, devour: 20, devourElite: 30, devourBoss: 25 },
  form: { dealt: 1.35, taken: 1.1, burstK: 0.6, burstR: 2.5 }, highTaken: 1.15,
  tempSec: 60, tempChance: 0.35,
};

// ---------------------------------------------------------------- 存档
export interface AbyssSave {
  on?: boolean;
  lv: Partial<Record<PartId, number>>;
  ess: number;                                   // 渊质
  n: { devour: number; eat: number };            // 累计：吞噬次数 / 渊形态中吞下的精英
  formed?: number;                               // 进入渊形态的次数
  got?: string[];                                // 已领过的任务奖励
}
const fresh = (): AbyssSave => ({ lv: {}, ess: 0, n: { devour: 0, eat: 0 } });
let D: AbyssSave = fresh();
let ctx: PackCtx | null = null;
export const bindAbyss = (c: PackCtx) => { ctx = c; };
export const abyssCtx = () => ctx;
export const abyssState = () => D;
export const abyssSave = (): AbyssSave | null => (D.on ? JSON.parse(JSON.stringify(D)) : null);
export function abyssLoad(d: unknown) {
  const o = d && typeof d === 'object' ? d as Partial<AbyssSave> : {};
  D = { ...fresh(), ...o, lv: { ...(o.lv ?? {}) }, ess: Math.max(0, Number(o.ess) || 0), n: { devour: o.n?.devour ?? 0, eat: o.n?.eat ?? 0 } };
  for (const k of Object.keys(D.lv) as PartId[]) if (!PART_BY[k]) delete D.lv[k]; else D.lv[k] = Math.max(0, Math.min(MAX_LV, D.lv[k] ?? 0));
  R.val = 0; R.form = 0; R.temp = null; R.high = 0; R.idle = 99; dirty++; lookSig = '';
}
/** 版本号：状态变了就 +1（界面据此重画） */
export let dirty = 0;
const touch = () => { dirty++; };

// ---------------------------------------------------------------- 运行时（不存档）
export const R = { val: 0, form: 0, formMax: 0, idle: 99, high: 0, lockout: 0, temp: null as null | { part: PartId; left: number }, heartCd: 0, lashCd: 0, burstCd: 0, busy: false, lastHurt: 0 };
let rng: () => number = Math.random;

export const abyssOpen = () => fateChoice() === 'B';
export const baseLv = (p: PartId) => D.lv[p] ?? 0;
/** 生效等级（含临时变异 +1） */
export const lvOf = (p: PartId) => Math.min(MAX_LV, baseLv(p) + (R.temp?.part === p ? 1 : 0));
export const inForm = () => R.form > 0;
export const formSec = () => AB.formSec + [0, 2, 4, 6][lvOf('spine')];
export const gainK = () => 1 + [0, 0.15, 0.3, 0.45][lvOf('spine')];
export const devourThr = () => 0.3 + [0, 0.05, 0.1, 0.15][lvOf('eye')];
export const devourR = () => 4 + [0, 0, 1, 2][lvOf('eye')] + (inForm() ? 1 : 0);
export const partReady = (p: PartId) => (btState().kills?.[PART_BY[p].boss] ?? 0) > 0;

// ---------------------------------------------------------------- 解锁 / 部位
export function ensureUnlocked(): boolean {
  if (!abyssOpen()) return false;
  if (D.on) return true;
  D.on = true; D.ess += 30; touch();
  ctx?.toast('渊噬之躯已开放：吞下的首领回响会化作身体的变异', '#d0a0ff');
  ctx?.toast('卡戎塞给你一把渊质 ×30（点技能区上方的渊化条打开「渊噬之躯」，T 吞噬）', '#d0a0ff');
  ctx?.save();
  return true;
}
/** 吞下首领回响：击杀记录里有、部位还没解锁 → 1 级 */
export function absorbEchoes(): PartId[] {
  if (!D.on) return [];
  const out: PartId[] = [];
  for (const p of PARTS) {
    if (baseLv(p.id) > 0 || !partReady(p.id)) continue;
    D.lv[p.id] = 1; out.push(p.id);
    ctx?.toast(`你吞下了「${p.bossName}」的回响 → ${p.slot}部变异「${p.name}」：${p.lv[0]}`, p.color);
  }
  if (out.length) { touch(); refreshLook(); ctx?.save(); }
  return out;
}
export function whyNot(p: PartId): string | null {
  if (!abyssOpen()) return '只有渊噬者能变异';
  const l = baseLv(p);
  if (l < 1) return partReady(p) ? '即将变异' : `在无声钟楼击败「${PART_BY[p].bossName}」并吞下它的回响`;
  if (l >= MAX_LV) return '已满级';
  if (D.ess < UP_COST[l + 1]) return `渊质不够（需要 ${UP_COST[l + 1]}）`;
  return null;
}
export function upgrade(p: PartId): boolean {
  const w = whyNot(p); if (w) { ctx?.toast(`${PART_BY[p].name}：${w}`, '#ff9a40'); return false; }
  const to = baseLv(p) + 1;
  D.ess -= UP_COST[to]; D.lv[p] = to; touch(); refreshLook(); ctx?.save();
  ctx?.toast(`${PART_BY[p].slot}部变异「${PART_BY[p].name}」→ ${to} 级：${PART_BY[p].lv[to - 1]}`, PART_BY[p].color);
  growl(0.8);
  return true;
}

// ---------------------------------------------------------------- 外观：部位等级 / 渊形态变了 → 重建挂件
let lookSig = '';
export const lookOf = () => ({ open: abyssOpen() && !!D.on, lv: Object.fromEntries(PART_IDS.map(p => [p, lvOf(p)])) as Record<PartId, number>, temp: R.temp?.part ?? null });
export function refreshLook(force = false) {
  const l = lookOf(); const sig = JSON.stringify(l);
  if (!force && sig === lookSig) return false;
  lookSig = sig; ctx?.redress?.(); return true;
}

// ---------------------------------------------------------------- 渊化值
export function addVal(n: number) {
  if (!abyssOpen() || !D.on || n <= 0 || inForm() || R.lockout > 0) return;
  R.idle = 0;
  R.val = Math.min(100, R.val + n * gainK());
  if (R.val >= 100) enterForm();
}
export function enterForm() {
  if (inForm()) return;
  R.formMax = R.form = formSec(); R.val = 100; R.high = 0;
  D.formed = (D.formed ?? 0) + 1; touch();
  ctx?.yell('渊形态！');
  ctx?.toast(`渊形态 ${R.formMax} 秒：造成伤害 +35%、击杀引发渊爆、吞噬冷却减半`, '#d0a0ff');
  growl(1.4);
  const fx = ctx?.fx?.(); if (fx) { const me = fx.me(); fx.fx('smoke', { x: me.x, y: me.y + 1, z: me.z }, { count: phone() ? 8 : 16, color: 0x2a0a40, color2: 0x8a3aff, speed: 4, spread: 0.8, up: 1, life: 0.8, size: 0.9, ring: true }); fx.feel('heavy', 0.7); }
}
function endForm() {
  R.form = 0; R.val = 0; R.lockout = 3; touch();
  ctx?.toast('渊形态结束（3 秒内渊化值不会增长）', '#a890c0');
}
export const phone = () => typeof document !== 'undefined' && document.documentElement.classList.contains('phone');

// ---------------------------------------------------------------- 战斗事件
function strike(o: Parameters<NonNullable<PackCtx['strike']>>[0]) {
  if (!ctx?.strike || R.busy) return null;
  R.busy = true;
  try { return ctx.strike(o); } finally { R.busy = false; }
}
export function abyssEvent(ev: PackEvent) {
  if (!abyssOpen() || !D.on || !ctx) return;
  if (ev.type === 'kill') {
    const s = lvOf('shadow'); if (s) ctx.heal?.([0, 0.01, 0.015, 0.02][s]);
    if (ev.boss && ev.map.startsWith('dlc1_')) { D.ess += 8; touch(); ctx.toast('渊质 +8', '#d0a0ff'); }
    addVal(ev.boss ? AB.gain.boss : ev.elite ? AB.gain.elite : AB.gain.kill);
    if (inForm() && !R.busy && R.burstCd <= 0) {   // 渊爆
      R.burstCd = 0.25;
      strike({ r: AB.form.burstR, dmgK: AB.form.burstK, el: 'shadow' });
      const fx = ctx.fx?.(); if (fx) fx.fx('shard', { x: ev.x, y: fx.gy(ev.x, ev.z) + 0.8, z: ev.z }, { count: phone() ? 5 : 10, color: 0xa070ff, color2: 0x30103a, speed: 5, spread: 0.4, up: 0.6, life: 0.5, size: 0.3 });
    }
    return;
  }
  if (ev.type === 'hurt') {
    const t = performance.now();
    if (t - R.lastHurt > 500) { R.lastHurt = t; addVal(AB.gain.hurt); }
    const h = lvOf('heart');
    if (h && R.heartCd <= 0 && !R.busy) {
      R.heartCd = inForm() && h >= 3 ? 1 : 2;
      strike({ r: 3.5, dmgK: [0, 0.6, 0.9, 1.2][h], el: 'fire' });
      const fx = ctx.fx?.(); if (fx) { const me = fx.me(); fx.fx('flame', { x: me.x, y: me.y + 1.2, z: me.z }, { count: phone() ? 6 : 12, color: 0xff7a30, color2: 0x401000, speed: 5, spread: 0.3, up: 0.8, life: 0.45, size: 0.35, ring: true }); }
    }
  }
}

// ---------------------------------------------------------------- 吞噬（devour.ts 调用）：结果结算
export function onDevoured(r: { killed: number; elites: number; bosses: number }) {
  if (!ctx) return;
  D.n.devour++;
  const boss = r.bosses > 0 && !r.killed, elite = r.elites > 0;
  ctx.heal?.(boss ? 0.05 : elite ? 0.15 : 0.08);
  const ess = boss ? 2 : elite ? 4 : 1; D.ess += ess;
  if (inForm() && elite && r.killed) D.n.eat++;
  addVal(boss ? AB.gain.devourBoss : elite ? AB.gain.devourElite : AB.gain.devour);
  const a = lvOf('arm'); if (a) strike({ r: 3, dmgK: [0, 1, 1.5, 2][a], el: 'arcane' });
  if (elite && r.killed && rng() < AB.tempChance) giveTemp();
  touch();
  return ess;
}
export function giveTemp(part?: PartId) {
  const cand = PART_IDS.filter(p => baseLv(p) < MAX_LV);
  const p = part ?? cand[Math.floor(rng() * cand.length)];
  if (!p) return null;
  R.temp = { part: p, left: AB.tempSec }; touch(); refreshLook();
  ctx?.toast(`临时变异：${PART_BY[p].slot}部「${PART_BY[p].name}」+1 级（${AB.tempSec} 秒）`, PART_BY[p].color);
  return p;
}

// ---------------------------------------------------------------- 加成汇总
export function abyssMods(): PackMods {
  const m: PackMods = {};
  if (!abyssOpen() || !D.on) return m;
  const a = lvOf('arm'), h = lvOf('head');
  let dealt = 1 + [0, 0.04, 0.08, 0.12][a], taken = 1;
  if (inForm()) { dealt *= AB.form.dealt; taken *= AB.form.taken; } else if (R.val >= AB.high) taken *= AB.highTaken;
  m.dealt = dealt; m.taken = taken;
  if (h) m.takenBoss = (1 - [0, 0.04, 0.07, 0.1][h]) * (h >= 3 && inForm() ? 0.95 : 1);
  return m;
}

// ---------------------------------------------------------------- 第九章 B 线接入
const QUEST_GIFT: Record<string, number> = { cs9b_4: 15, cs9b_5: 25, cs9b_6: 40 };
function questTick() {
  if (!ctx) return;
  const ev = (q: string, area: string, ok: boolean) => { if (ok && ctx!.questState(q) === 'active') ctx!.questEvent?.('explore', area); };
  ev('cs9b_4', 'ab_q_devour', D.n.devour >= 5);
  ev('cs9b_5', 'ab_q_mut', PART_IDS.some(p => baseLv(p) >= 2));
  ev('cs9b_6', 'ab_q_form', (D.formed ?? 0) > 0);
  ev('cs9b_6', 'ab_q_eat', D.n.eat > 0);
  for (const [q, g] of Object.entries(QUEST_GIFT)) {
    if ((D.got ?? []).includes(q) || ctx.questState(q) !== 'done') continue;
    (D.got ??= []).push(q); D.ess += g; touch();
    ctx.toast(`渊质 +${g}`, '#d0a0ff');
  }
}

// ---------------------------------------------------------------- 每帧
let t1 = 0, wisp = 0;
export function abyssUpdate(dt: number) {
  if (!ctx || !abyssOpen()) return;
  if ((t1 += dt) >= 1) { t1 = 0; ensureUnlocked(); absorbEchoes(); questTick(); }
  if (!D.on) return;
  R.heartCd -= dt; R.burstCd -= dt; R.lockout = Math.max(0, R.lockout - dt);
  if (R.temp && (R.temp.left -= dt) <= 0) { const p = R.temp.part; R.temp = null; touch(); refreshLook(); ctx.toast(`临时变异「${PART_BY[p].name}」褪去了`, '#a890c0'); }
  if (inForm()) {
    R.form -= dt; R.val = Math.max(0, 100 * R.form / Math.max(1, R.formMax));
    const s = lvOf('shadow');
    if (s && (R.lashCd -= dt) <= 0) {
      R.lashCd = 2;
      const r = strike({ r: 4, dmgK: [0, 0.6, 0.9, 1.2][s], el: 'shadow' });
      if (r?.hits) lashFx();
    }
    if ((wisp += dt) > (phone() ? 0.6 : 0.35)) {
      wisp = 0;
      const fx = ctx.fx?.(); if (fx) { const me = fx.me(); fx.fx('smoke', { x: me.x, y: me.y + 0.3, z: me.z }, { count: phone() ? 2 : 4, color: 0x5a20a0, color2: 0x120418, speed: 0.6, spread: 0.6, up: 2.2, life: 0.9, size: 0.6, sizeEnd: 0.1 }); }
    }
    if (R.form <= 0) endForm();
    return;
  }
  R.idle += dt;
  if (R.idle > AB.decayAfter) R.val = Math.max(0, R.val - AB.decay * dt);
  if (R.val >= AB.high) {
    R.high += dt;
    if (R.high > AB.highHurtAfter) ctx.drain?.(AB.drain * dt);
  } else R.high = 0;
}
function lashFx() {
  const fx = ctx?.fx?.(); if (!fx) return;
  const me = fx.me();
  fx.ring({ x: me.x, z: me.z }, 4, '#8a5aff', 0.45);
  fx.fx('streak', { x: me.x, y: me.y + 0.4, z: me.z }, { count: phone() ? 4 : 8, color: 0x8a5aff, color2: 0x1a0828, speed: 7, spread: 0.2, up: 0.1, life: 0.35, size: 0.3, ring: true });
}
export function growl(k = 1) {
  const A = ctx?.synth?.(); if (!A || !A.gate('ab_growl', 0.3)) return;
  A.noise({ f: 180 * k, f2: 60, type: 'lowpass', q: 2, dur: 0.7, gain: 0.12, a: 0.02, d: 0.6 });
  A.tone({ f: 70 * k, f2: 45, type: 'sawtooth', dur: 0.8, gain: 0.05, a: 0.02, d: 0.7, lp: 400 });
}

// ---------------------------------------------------------------- 测试 / 调试
export const abyssDebug = {
  state: () => D, rt: () => R,
  grant: (n = 200) => { D.ess += n; touch(); },
  setLv: (p: PartId, l: number) => { D.lv[p] = Math.max(0, Math.min(MAX_LV, l)); touch(); refreshLook(); },
  setVal: (v: number) => { R.val = Math.max(0, Math.min(99.9, v)); R.idle = 0; },
  add: (n: number) => addVal(n),
  form: () => enterForm(),
  endForm: () => { if (inForm()) { R.form = 0.0001; } },
  temp: (p?: PartId) => giveTemp(p),
  rng: (f: (() => number) | null) => { rng = f ?? Math.random; },
  mods: () => abyssMods(),
  look: () => lookOf(),
  reset: () => { D = fresh(); R.val = 0; R.form = 0; R.temp = null; touch(); refreshLook(true); },
};
