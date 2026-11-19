// ======================================================================
// DLC1「负棺人」：收魂 + 三棺态 + 开棺组合 + 未亡（v1.0.7，d1.6）
// 通过本体 ClassExtApi 运行（core/ClassExt.ts），不 import web 模块。
//   收魂：你击杀的敌人按种类变成魂收进棺里（最多 3 个）：野兽 / 人形 / 巨躯 / 异类
//   背棺（默认）：普攻变链甩横扫（自身范围），链扫技能范围 +25%，位移冷却 -15%
//   立棺（F）：把棺插在脚下成「墓碑」：你放的每个技能 0.25 秒后从墓碑处再放一次（60%），墓碑周围敌人减速 30%；再按 F / 走出 30 米收回
//   开棺（X）：一次放出所有魂，按组合出招（3 魂 20 种，见 coffin_skills.ts COMBOS；1–2 魂 = 残魂出棺）
//   未亡：受到致命伤害时躺进棺里「入殓」2 秒（无敌、不能放技能），每个魂换 15% 生命复活；棺里没魂 / 冷却中（90 秒）就真死
// 机制天赋按 talentRank 读（cs_* / cg_* / cr_*）。
// v1.2.77 天赋方案 B（未来开发报告 §7.4）：送葬者 五魂棺 / 哀魂 | 魂爆 / 百鬼夜行，满棺齐放；
//   饮血者（原守墓人）血祭 / 血棺护体 | 饮魂 / 血债，血棺；凋魂者（原摆渡人）侵蚀 / 腐朽之地 | 恐惧 / 蔓延，冥河凋零。
// 11-04 立棺墓碑 凋魂者「立棺墓碑」主循环（§7.4 定稿 + DLC1_沉钟之海 立棺成碑）：主系 = 凋魂者（点了区域三）时立棺 = 凋魂墓碑：
//   墓碑回响 60%（回响命中照常叠侵蚀）、碑周 5 米减速 30%、墓土侵蚀（碑周敌人每 1 秒叠 1 层；点「腐朽之地」改为每 0.5 秒）；
//   收碑 = 再按 F / 走出 30 米。侵蚀最多 30 层；冥河凋零首领 / 精英每秒上限 20 + 3×等级。送葬者 / 饮血者的立棺不变（通用棺态）。
// ======================================================================
import { CondFlags } from '../../core/CondFlags';
import type { ClassExtApi, ClassExtUnit, ClassRuntime } from '../../core/ClassExt';
import type { ModifierDef, ResolvedSkill, SkillDef, Element } from '../../core/types';
import { Soul, SOULS, SOUL_CHAR, SOUL_COLOR, soulOf, comboOf, partialCombo, COFFIN_SKILLS, SOUL_BURST, GHOST_HIT, BLOOD_BURST } from './coffin_skills';
import { CQ, COFFIN_ULT_SKILLS } from './coffin_data';

export type Mode = 'back' | 'planted';
export const K = { erodeMax: 30, erodeDur: 8, erodePer: 0.02, fearAt: 10, fearDur: 1.5, fearIcd: 8, witherDur: 8, witherPct: 0.01, riteCost: 0.03, riteFloor: 0.3, riteMore: 0.25, debtCap: 0.6, bloodDur: 8, fullIcd: 45, ghostDur: 4, bossChunk: 0.05, chainCd: 8, maxSouls: 3, groundIv: 1, rotIv: 0.5, echo: 0.6, echoDelay: 0.25, slow: 0.3, tombR: 5, recall: 30, revivePer: 0.15, rest: 2, undeadCd: 90, openCd: 1, plantCd: 0.6 };
const BY_ID: Record<string, SkillDef> = Object.fromEntries([...COFFIN_SKILLS, ...COFFIN_ULT_SKILLS].map(s => [s.id, s as SkillDef]));

type Op = ModifierDef['ops'][number];
const M = (id: string, match: ModifierDef['match'], ops: Op[], priority = 15): ModifierDef => ({ id: `coffin:${id}`, name: id, desc: '', source: 'buff', match, ops, priority });
const all = (...t: string[]) => ({ tagsAll: t });

/** 棺态修饰器（纯数据）：reach = 链甩额外半径（摆渡人「长链」） */
export function modeMods(m: Mode, reach = 0): ModifierDef[] {
  if (m === 'back') return [
    M('back', all('coffin'), [{ op: 'addTag', value: 'back' }], 10),
    M('back_basic', all('coffin', 'f_melee'), [{ op: 'setShape', value: 'circle' }, { op: 'add', stat: 'radius', value: 3.2 + reach }, { op: 'mul', stat: 'damage', value: -0.15 }, { op: 'rename', prefix: '链甩·' }, { op: 'addTag', value: 'aoe' }], 5),
    M('back_sweep', all('coffin', 'f_sweep'), [{ op: 'mul', stat: 'radius', value: 0.25 }]),
    M('back_move', all('coffin', 'movement'), [{ op: 'mul', stat: 'cooldown', value: -0.15 }]),
  ];
  return [M('grave', all('coffin'), [{ op: 'addTag', value: 'grave' }], 10)];
}

// ---------------------------------------------------------------- 运行时状态
export interface CoffinVisual { mode: Mode; souls: Soul[]; open: boolean; rest: boolean; tomb: { x: number; z: number } | null;
  /** 11-04 立棺墓碑 墓碑范围（米）、是否凋魂墓碑（腐朽之地地面腐蚀） */
  tombR?: number; rot?: boolean }
/** 11-04 立棺墓碑 墓碑上的瞬时表现事件（腐土冒烟 / 脚下泥土下陷），coffin_model / tomb_fx 画 */
export interface TombFxEvent { kind: 'rot' | 'slow'; pts: { x: number; z: number }[] }
const S = {
  mode: 'back' as Mode, tomb: null as { x: number; z: number } | null, souls: [] as Soul[],
  openT: -99, plantT: -99, restUntil: -1, restN: 0, undeadT: -999, slowT: 0,
  echoQ: [] as { def: SkillDef; t: number }[],
  killed: new WeakSet<object>(),
  drawn: new WeakMap<object, number>(), chainT: -99,
  last: '' as string,
  // v1.2.77 方案 B
  erode: new Map<ClassExtUnit, { n: number; t: number; base: number; tick: number }>(),
  fearT: new Map<ClassExtUnit, number>(), wither: new Map<ClassExtUnit, { left: number; tick: number }>(),
  ghosts: [] as { until: number; tick: number }[], groundT: 0, bloodUntil: -99, debt: 0, fullT: -999, riteFlag: false, spreadT: 0, inner: false,
  pend: new WeakMap<object, string>(),
  b: { tombErodes: 0, groundTicks: 0, echoHits: 0, echoErodes: 0, erodes: 0, erodeDmg: 0, fears: 0, vulns: 0, spreads: 0, withers: 0, witherDmg: 0, rites: 0, hpSpent: 0, healed: 0, shielded: 0, debtDmg: 0, bloodBursts: 0, soulBursts: 0, ghostHits: 0, wails: 0, fills: 0 },
  stats: { kills: 0, souls: 0, drawn: 0, opens: 0, echoes: 0, revives: 0, deaths: 0, sweeps: 0, slowed: 0, squeezed: 0, combos: [] as string[] },
};
let A: ClassExtApi | null = null;
let lastRoot: unknown = null;
export const coffinApi = () => A;
const rank = (id: string) => A?.talentRank(id) ?? 0;
const hpPct = () => { const p = A?.player(); return p && p.maxHp > 0 ? p.hp / p.maxHp : 0; };
/** 血祭生效：点了血祭（或血棺期间）且生命 ≥ 33% */
const riteOn = () => !!A && (rank('cb_k_rite') > 0 || A.now() < S.bloodUntil) && hpPct() >= K.riteFloor + K.riteCost;
const isBossish = (t: ClassExtUnit) => !!t.isBoss || !!A?.unitKind?.(t)?.elite;
const witherCap = () => 20 + 3 * (A?.level() ?? 30);   // v1.2.77 classtune：原 60 + 12 × 等级（首领木桩 DPS 667）
let visual: ((v: CoffinVisual) => void) | null = null;
let tombFx: ((e: TombFxEvent) => void) | null = null;
/** 外观（coffin_model.ts 注册） */
export function onCoffinVisual(fn: (v: CoffinVisual) => void) { visual = fn; }
/** 11-04 立棺墓碑 墓碑瞬时表现（coffin.ts 注册到 tomb_fx） */
export function onTombFx(fn: (e: TombFxEvent) => void) { tombFx = fn; }
const show = () => visual?.({ mode: S.mode, souls: [...S.souls], open: !!A && A.now() - S.openT < 1.2, rest: S.restUntil > 0, tomb: S.tomb, tombR: tombR(), rot: S.mode === 'planted' && groundOn() });
/** 11-04 立棺墓碑 主系 = 凋魂者（天赋 3.0 主系 = 点了区域三的系；凋魂者区域三节点） */
const WITHER_Z3 = ['cr_speed', 'cr6_master', 'c_fer_p0', 'c_fer_p1', 'cr_styx'];
export const witherMain = () => WITHER_Z3.some(id => rank(id) > 0);
/** 墓土侵蚀生效：凋魂墓碑（主系凋魂者），或点了「腐朽之地」 */
const groundOn = () => witherMain() || rank('cw_k_rot') > 0;
/** 墓土侵蚀间隔：腐朽之地 0.5 秒，否则 1 秒 */
export const groundIv = () => (rank('cw_k_rot') ? K.rotIv : K.groundIv);

const echoMul = () => K.echo + 0.1 * rank('cg_echo');
const tombR = () => K.tombR;
/** v1.2.77 五魂棺：魂上限 3 → 4 */
export const maxSouls = () => K.maxSouls + (rank('cu_k_cap') ? 1 : 0);
export const undeadCd = () => K.undeadCd - 15 * rank('cs_wake') - (A?.questDone(CQ[0]) ? 20 : 0);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function baseMods(): ModifierDef[] {
  const mods = modeMods(S.mode, 0);
  if (riteOn()) mods.push(M('t_rite', { slots: ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate'] }, [{ op: 'mul', stat: 'damage', value: K.riteMore }], 60));   // 血祭
  const fr = rank('cs_fresh'); if (fr && A && A.now() - S.openT < 6) mods.push(M('t_fresh', all('coffin'), [{ op: 'mul', stat: 'damage', value: 0.08 * fr }], 60));
  return mods;
}
function applyMods(extra: ModifierDef[] = []) { A?.setMods([...baseMods(), ...extra]); }

/** 立棺 / 收棺（返回是否切换） */
export function setMode(m: Mode, force = false): boolean {
  if (!A) return false;
  const now = A.now();
  if (!force && (m === S.mode || now - S.plantT < K.plantCd || S.restUntil > 0)) return false;
  S.mode = m; S.plantT = now;
  S.tomb = m === 'planted' ? { ...A.player().getPos() } : null;
  if (m === 'back') S.echoQ.length = 0;
  S.groundT = 0;
  applyMods();
  // 11-04 立棺墓碑 特效 §3.1：不再画几何圈（砸立入地、墓土翻起由 coffin_model / tomb_fx 画）
  show();
  return true;
}

/** 收魂（测试也直接调） */
export function harvest(t: ClassExtUnit) {
  if (!A || S.killed.has(t)) return;
  S.killed.add(t); S.stats.kills++;
  const info = A.unitKind?.(t) ?? { kind: '', name: '', elite: !!t.isBoss };
  const big = info.elite || !!t.isBoss;
  const soul = soulOf(info.kind, info.name, big);
  let n = 1;
  if (rank('cs_res') && big) n++;
  for (let i = 0; i < n; i++) {
    if (S.souls.length < maxSouls()) { S.souls.push(soul); S.stats.souls++; }
    else if (squeeze()) { S.souls.push(soul); S.stats.souls++; }   // 11-05 不眠棺：挤棺
  }
  syncRes(); show();
}
/** v1.2.27 首领战收魂：首领 / 精英每掉 5% 最大生命抽 1 个魂；锁魂链命中首领 / 精英直接锁 1 个魂（8 秒一次） */
function bigUnit(t: ClassExtUnit) { return !!t.isBoss || !!A?.unitKind?.(t)?.elite; }
/** 11-05 40 级暗金「不眠棺」挤棺：棺满再收魂 → 最老的魂被挤出，以「残魂出棺·1」放出（不耗开棺冷却；立棺时墓碑回响）。返回是否挤出 */
export const SLEEPLESS = 'd40_c_sleepless';
function squeeze(): boolean {
  if (!A?.hasDark?.(SLEEPLESS) || !S.souls.length) return false;
  const old = S.souls.shift()!, c = partialCombo([old]);
  S.stats.squeezed++;
  A.fire(c.skill);
  if (S.mode === 'planted') queueEcho(c.skill);
  return true;
}
function pullSoul(t: ClassExtUnit, why: string) {
  if (!A) return;
  const info = A.unitKind?.(t) ?? { kind: '', name: '', elite: true };
  if (S.souls.length >= maxSouls() && !squeeze()) return;   // 11-05 不眠棺：首领抽魂同样挤棺
  S.souls.push(soulOf(info.kind, info.name, true)); S.stats.souls++; S.stats.drawn++;
  if (why) A.toast(why, '#cfc0ff');
  syncRes(); show();
}
export function drainBig(t: ClassExtUnit, dealt: number) {
  if (!A || !(dealt > 0) || t.hp <= 0 || !bigUnit(t) || !(t.maxHp > 0)) return;
  let acc = (S.drawn.get(t) ?? 0) + dealt / t.maxHp;
  while (acc >= K.bossChunk) { acc -= K.bossChunk; pullSoul(t, ''); }
  S.drawn.set(t, acc);
}
export function chainBig(hits: ClassExtUnit[]) {
  if (!A) return;
  const now = A.now(); if (now - S.chainT < K.chainCd) return;
  const t = hits.find(h => h.hp > 0 && bigUnit(h)); if (!t) return;
  S.chainT = now; pullSoul(t, '锁魂链 · 锁住 1 个魂');
}
function syncRes() {
  if (!A) return;
  const d = S.souls.length - Math.round(A.res().value);
  if (d > 0) A.resAdd(d); else if (d < 0) A.resSpend(-d);
  if (A.res().value > S.souls.length + 1e-6) A.resSpend(A.res().value - S.souls.length);
}

/** 开棺：放出所有魂 → 组合技 */
export function openCoffin(): string | null {
  if (!A || !A.player().alive || S.restUntil > 0) return null;
  const now = A.now();
  if (now - S.openT < K.openCd) return null;
  // 满棺齐放（绝技）：棺没满就瞬间补满（45 秒一次）
  if (rank('cs_full') && S.souls.length < maxSouls() && now - S.fullT >= K.fullIcd) {
    S.fullT = now; S.b.fills++;
    while (S.souls.length < maxSouls()) S.souls.push(S.souls[S.souls.length - 1] ?? 'eldritch');
    A.toast('满棺齐放', '#e0d0ff');
  }
  if (!S.souls.length) { A.toast('棺中没有魂', '#c8c0b0'); return null; }
  const souls = [...S.souls], c = comboOf(souls);
  let more = 0.1 * rank('cs_open') + (A.questDone(CQ[1]) ? 0.2 : 0);
  if (rank('cs_full') && souls.length >= maxSouls()) more += 0.5;
  if (souls.length >= 4) more += 0.25;   // 五魂棺：第 4 个魂
  S.souls = []; S.openT = now; S.stats.opens++; S.stats.combos.push(c.name); S.last = c.name;
  syncRes();
  openTalents(souls.length);
  applyMods(more ? [M('open', { skillIds: [c.skill.id] }, [{ op: 'more', stat: 'damage', value: more }], 50)] : []);
  A.toast(`开棺 · ${c.name}`, c.color);
  A.ring(A.player().getPos(), Math.max(3, c.skill.stats.radius || 4), c.color);
  A.playAnim('attack3', 1.2);
  A.fire(c.skill);
  if (S.mode === 'planted') queueEcho(c.skill);
  applyMods();
  show();
  return c.name;
}

// ---------------------------------------------------------------- v1.2.77 方案 B 机制
/** 开棺时：哀魂 / 魂爆 / 百鬼夜行 / 血债 / 血棺 */
function openTalents(n: number) {
  if (!A) return;
  const me = A.player().getPos(), now = A.now();
  if (rank('cu_k_wail')) { for (const e of A.enemiesNear(me, 6)) { if (A.fear?.(e, 2, 0.08)) S.b.fears++; else S.b.vulns++; } S.b.wails++; A.ring(me, 6, '#8a7aa8'); }
  if (rank('cu_k_burst')) {
    const near = A.enemiesNear(me, 8).filter(e => e.alive), tg = A.target();
    for (let i = 0; i < n; i++) { const e = (i === 0 && tg) ? tg : near[i % Math.max(1, near.length)]; inner(() => A!.fireFrom?.(SOUL_BURST, e ? e.getPos() : me)); S.b.soulBursts++; }
  }
  if (rank('cu_k_ghosts')) for (let i = 0; i < n; i++) S.ghosts.push({ until: now + K.ghostDur, tick: i * 0.12 });
  if (rank('cb_k_debt') && S.debt > 0) {
    const tg = A.target() ?? A.enemiesNear(me, 8).find(e => e.alive) ?? null;
    if (tg) { const amt = S.debt; S.debt = 0; inner(() => { S.b.debtDmg += A!.damage(tg, amt, 'shadow'); for (const e of A!.enemiesNear(tg.getPos(), 6)) if (e !== tg) S.b.debtDmg += A!.damage(e, amt * 0.5, 'shadow'); }); A.ring(tg.getPos(), 3, '#a03040'); A.toast('血债 · 清算', '#e06070'); }
  }
  if (rank('cg_night')) { S.bloodUntil = now + K.bloodDur; A.toast('血棺', '#c04050'); }
}
/** 自己造成的伤害 / 放出的天赋技能：不再触发叠层与吸血 */
function inner<T>(fn: () => T): T { const was = S.inner; S.inner = true; try { return fn(); } finally { S.inner = was; } }
/** 吸血：血契 / 血棺护体 / 血棺翻倍；饮魂满血溢出转护盾 */
function lifesteal(amt: number) {
  if (!A || !(amt > 0)) return;
  const p = A.player(); if (!p.alive) return;
  let k = 1 + 0.1 * rank('cg_guard');
  if (rank('cb_k_ward') && hpPct() < 0.5) k += 0.5;
  if (A.now() < S.bloodUntil) k *= 2;
  const a = amt * k, over = p.hp + a - p.maxHp;
  A.heal(a); S.b.healed += a;
  if (over > 0 && rank('cb_k_drink') && A.shield) { A.shield('drink', over / p.maxHp, 5, 0.15); S.b.shielded += over; }
}
/** 血祭 / 血棺：放技能时消耗生命 */
function spendLife() {
  if (!A) return;
  const p = A.player(), blood = A.now() < S.bloodUntil;
  if (!riteOn()) return;
  const cost = Math.min(p.hp * K.riteCost, Math.max(0, p.hp - p.maxHp * K.riteFloor));
  if (!(cost > 0)) return;
  p.hp -= cost; S.b.rites++; S.b.hpSpent += cost;
  if (rank('cb_k_debt')) S.debt = Math.min(p.maxHp * K.debtCap, S.debt + cost * 0.3);
  if (blood) { inner(() => A!.fireFrom?.(BLOOD_BURST, p.getPos())); S.b.bloodBursts++; }
  S.riteFlag = riteOn(); applyMods();
}
export const erodeN = (t: ClassExtUnit) => { const e = S.erode.get(t); return e && A && A.now() - e.t < erodeDur() ? e.n : 0; };
const erodeDur = () => K.erodeDur + 2 * rank('cr_reach');
const erodeOn = () => rank('cw_k_erode') > 0 || rank('cw_k_rot') > 0;
/** 叠侵蚀；base = 该目标最近技能命中伤害（每层每秒 2%） */
export function addErode(t: ClassExtUnit, k: number, dealt = 0) {
  if (!A || !t.alive || k <= 0) return;
  const was = erodeN(t), o = S.erode.get(t);
  const base = dealt > 0 ? (o?.base ? o.base * 0.7 + dealt * 0.3 : dealt) : (o?.base ?? 20 + 2 * A.level());
  const n = Math.min(K.erodeMax, was + k);
  S.erode.set(t, { n, t: A.now(), base, tick: o && was > 0 ? o.tick : 0 }); S.b.erodes += k;
  if (rank('cw_k_fear') && was < K.fearAt && n >= K.fearAt && A.now() - (S.fearT.get(t) ?? -99) >= K.fearIcd) {
    S.fearT.set(t, A.now()); if (A.fear?.(t, K.fearDur, 0.1)) S.b.fears++; else S.b.vulns++;
  }
  if (rank('cr_styx') && n >= K.erodeMax && !S.wither.has(t)) { S.wither.set(t, { left: K.witherDur, tick: 0 }); S.b.withers++; A.ring(t.getPos(), 2, '#6a5880'); }
}
function updateCurses(dt: number) {
  if (!A) return;
  const now = A.now(), haste = Math.max(0, Math.min(0.4, (A.player() as unknown as { haste?: number }).haste ?? 0));
  const iv = 1 / (1 + haste), mul = 1 + 0.1 * rank('cr_chain');
  for (const [e, st] of S.erode) {
    if (!e.alive || now - st.t >= erodeDur()) { S.erode.delete(e); continue; }
    st.tick += dt; if (st.tick < iv) continue; st.tick -= iv;
    const d = st.base * K.erodePer * st.n * mul;
    inner(() => { S.b.erodeDmg += A!.damage(e, d, 'shadow', false); });
  }
  for (const [e, st] of S.wither) {
    if (!e.alive || st.left <= 0) { S.wither.delete(e); continue; }
    st.tick += dt; if (st.tick < 1) continue; st.tick -= 1; st.left -= 1;
    let d = e.maxHp * K.witherPct; if (isBossish(e)) d = Math.min(d, witherCap());
    inner(() => { S.b.witherDmg += A!.damage(e, d, 'shadow', false); });
  }
  // 11-04 立棺墓碑 墓土侵蚀 / 腐朽之地：凋魂墓碑周围敌人每 1 秒（腐朽之地 0.5 秒）叠 1 层
  if (groundOn() && S.mode === 'planted' && S.tomb) { S.groundT += dt; if (S.groundT >= groundIv()) { S.groundT -= groundIv(); S.b.groundTicks++;
    const pts: { x: number; z: number }[] = [];
    for (const e of A.enemiesNear(S.tomb, tombR())) { if (!e.alive) continue; addErode(e, 1); S.b.tombErodes++; if (pts.length < 16) pts.push(e.getPos()); }
    if (pts.length) tombFx?.({ kind: 'rot', pts }); } }
  // 蔓延：被恐惧 / 侵蚀 ≥10 的敌人每秒传 3 层
  if (rank('cw_k_spread')) { S.spreadT += dt; if (S.spreadT >= 1) { S.spreadT = 0;
    for (const [e] of S.erode) { if (!e.alive || (erodeN(e) < K.fearAt && !A.feared?.(e))) continue;
      for (const o of A.enemiesNear(e.getPos(), 2.5)) if (o !== e && o.alive) { addErode(o, 3); S.b.spreads++; } } } }
  // 百鬼夜行：每 0.5 秒穿过附近敌人
  const me = A.player().getPos();
  for (let i = S.ghosts.length - 1; i >= 0; i--) {
    const g = S.ghosts[i]; if (now >= g.until || !A.player().alive) { S.ghosts.splice(i, 1); continue; }
    g.tick += dt; if (g.tick < 0.5) continue; g.tick -= 0.5;
    const near = A.enemiesNear(me, 10).filter(e => e.alive); if (!near.length) continue;
    const e = near[Math.floor(Math.random() * near.length)];
    inner(() => A!.fireFrom?.(GHOST_HIT, e.getPos())); S.b.ghostHits++;
  }
  if (S.erode.size > 96) for (const [e] of S.erode) if (!e.alive) S.erode.delete(e);
}

function queueEcho(def: SkillDef) {
  if (!A || !S.tomb || !A.fireFrom) return;
  if (def.tags.includes('movement') || def.tags.includes('blink') || def.shape === 'dash') return;
  S.echoQ.push({ def, t: A.now() + K.echoDelay });
}
function runEcho(def: SkillDef) {
  if (!A || !S.tomb || !A.fireFrom) return;
  const tomb = S.tomb;
  const reach = def.shape === 'single' ? 4 : def.shape === 'circle' && !def.tags.includes('targeted') ? Math.max(3, def.stats.radius) * 1.25 + 1 : Math.max(def.stats.range, 6);
  const near = A.enemiesNear(tomb, reach);
  const tg = A.target();
  if (!near.length || (def.shape === 'single' && (!tg || !near.includes(tg)))) return;
  if (def.tags.includes('targeted') && !tg) return;
  // 11-04 立棺墓碑 回响打 echo 标签：表现层（coffin_fx）切成灰青亡者重放，不再画几何圈
  applyMods([M('echo', { skillIds: [def.id] }, [{ op: 'more', stat: 'damage', value: echoMul() - 1 }, { op: 'rename', prefix: '墓·' }, { op: 'addTag', value: 'echo' }], 55)]);
  A.fireFrom(def, tomb);
  S.stats.echoes++;
  applyMods();
}

export const COFFIN_RUNTIME: ClassRuntime = {
  bind(api) { A = api; CondFlags.provide('souls', () => (A && A.level() > 0 ? S.souls.length : 0));
    for (const [k, v] of [['B', 'beast'], ['H', 'man'], ['G', 'giant'], ['A', 'eldritch']] as const) CondFlags.provide(`souls_${k}`, () => (A && A.level() > 0 ? S.souls.filter(x => x === v).length : 0)); },   // 11-05 不眠棺：分种类魂读数   // v1.2.35 溺亡送葬面：每魂技能伤害 +7%
  reset() {
    S.mode = 'back'; S.tomb = null; S.souls = []; S.openT = -99; S.plantT = -99; S.restUntil = -1; S.restN = 0; S.undeadT = -999; S.slowT = 0; S.echoQ.length = 0; S.last = '';
    S.erode.clear(); S.fearT.clear(); S.wither.clear(); S.ghosts.length = 0; S.groundT = 0; S.bloodUntil = -99; S.debt = 0; S.fullT = -999; S.riteFlag = false; S.inner = false; S.pend = new WeakMap(); for (const k of Object.keys(S.b) as (keyof typeof S.b)[]) S.b[k] = 0;
    S.killed = new WeakSet(); S.drawn = new WeakMap(); S.chainT = -99; S.stats = { kills: 0, souls: 0, drawn: 0, opens: 0, echoes: 0, revives: 0, deaths: 0, sweeps: 0, slowed: 0, squeezed: 0, combos: [] };
    applyMods(); syncRes(); show();
  },
  update(_dt?: number) {
    if (!A) return;
    const now = A.now();
    updateCurses(Math.min(0.1, Math.max(0, _dt ?? 0.016)));
    if (riteOn() !== S.riteFlag) { S.riteFlag = riteOn(); applyMods(); }
    const root = A.playerObj(); if (root !== lastRoot) { lastRoot = root; show(); }
    // 入殓结束：按魂复活
    if (S.restUntil > 0 && now >= S.restUntil) {
      S.restUntil = -1; S.stats.revives++;
      A.heal(A.player().maxHp * K.revivePer * S.restN);
      A.toast(`未亡 · 以 ${S.restN} 个魂复活`, '#e0d0ff');
      show();
    }
    // 墓碑回响
    for (let i = S.echoQ.length - 1; i >= 0; i--) if (now >= S.echoQ[i].t) { const e = S.echoQ.splice(i, 1)[0]; runEcho(e.def); }
    // 墓碑减速 + 走远收回
    if (S.mode === 'planted' && S.tomb) {
      if (dist(A.player().getPos(), S.tomb) > K.recall) { setMode('back', true); A.toast('铁棺收回背上', '#c8c0b0'); }
      else if (now - S.slowT >= 0.5 && A.slow) {
        S.slowT = now;
        const pc = K.slow, pts: { x: number; z: number }[] = [];
        for (const e of A.enemiesNear(S.tomb, tombR())) { A.slow(e, pc, 0.8); S.stats.slowed++; if (pts.length < 12) pts.push(e.getPos()); }
        if (pts.length && !groundOn()) tombFx?.({ kind: 'slow', pts });
      }
    }
    if (now - S.openT > 1.2 && now - S.openT < 1.5) show();   // 棺盖合上
    if (rank('cs_fresh') && now - S.openT > 6 && now - S.openT < 6.2) applyMods();
    if (Math.round(A.res().value) !== S.souls.length) syncRes();
  },
  key(k) {
    if (k === 'f') { setMode(S.mode === 'back' ? 'planted' : 'back'); return true; }
    if (k === 'x') { openCoffin(); return true; }
    return false;
  },
  canCast() { return S.restUntil <= 0; },
  onCast(s: ResolvedSkill) {
    if (!S.inner && s.slot !== 'basic' && s.tags.includes('coffin') && !s.tags.includes('opencoffin')) spendLife();
    if (S.mode !== 'planted' || !s.tags.includes('coffin')) return;
    const def = BY_ID[s.baseId]; if (def) queueEcho(def);
  },
  onHits(s, hits) {
    if (!A) return s;
    let out = s;
    if (s.baseId === 'cf_chainline' && hits.length) chainBig(hits);
    if (s.slot === 'basic' && s.tags.includes('back') && hits.length) S.stats.sweeps++;
    if (s.tags.includes('echo') && hits.length) S.b.echoHits += hits.length;
    if (!S.inner && !s.tags.includes('talent')) for (const h of hits) S.pend.set(h, s.tags.includes('echo') ? `echo:${s.slot}` : s.slot);   // 侵蚀 / 吸血在 onDealt 按实际伤害算
    return out;
  },
  onDealt(t, dealt, _el, _crit, tick) {
    if (t.hp <= 0) harvest(t); else drainBig(t, dealt);
    if (!A || S.inner || tick) return;
    const tagged = S.pend.get(t); if (tagged === undefined) return;
    S.pend.delete(t);
    const echo = tagged.startsWith('echo:'), slot = echo ? tagged.slice(5) : tagged;
    // 侵蚀：暗影侵蚀 普攻 1 / 技能 2；只点腐朽之地 技能命中 1（墓碑回响命中同样叠）
    if (erodeOn() && t.hp > 0) { const k = rank('cw_k_erode') ? (slot === 'basic' ? 1 : 2) : (slot === 'basic' ? 0 : 1); addErode(t, k, dealt); if (echo) S.b.echoErodes += k; }
    // 吸血
    let ls = 0;
    if (slot !== 'basic' || A.now() < S.bloodUntil) {
      if (rank('cb_k_drink')) ls += 0.09;   // v1.2.77 classtune：12% → 9%（生存测试净承伤 59% → 10% 时 65%，留余量）
      if (rank('cb_k_ward') && hpPct() < 0.5) ls += 0.04;
      if (A.now() < S.bloodUntil) ls += 0.06;
    }
    if (ls > 0) lifesteal(dealt * ls);
  },
  preDeal(t, amt, _el: Element, toPlayer) {
    if (!A || !toPlayer) return amt;
    const now = A.now();
    if (S.restUntil > 0) return 0;                                    // 入殓中：无敌
    let a = amt;
    const armor = (t as unknown as { armor?: number }).armor ?? 0;
    const est = _el === 'physical' && armor > 0 ? a * 400 / (400 + armor) : a;
    if (est >= t.hp) {
      if (S.souls.length && now - S.undeadT >= undeadCd()) {
        S.restN = S.souls.length; S.souls = []; S.undeadT = now; S.restUntil = now + K.rest; S.echoQ.length = 0;
        syncRes();
        A.toast('入殓……', '#9a90c0');
        A.ring(A.player().getPos(), 2.4, '#9a90c0');
        show();
        return 0;
      }
      S.stats.deaths++;
    }
    return a;
  },
  status() {
    if (!A) return null;
    const now = A.now();
    if (S.restUntil > 0) return `<span style="color:#e0d0ff">【入殓】</span> ${(S.restUntil - now).toFixed(1)}s 后以 ${S.restN} 个魂复活`;
    const md = S.mode === 'back' ? '<span style="color:#c8c0b0">【背棺】</span>' : `<span style="color:#9a90c0">【${groundOn() ? '凋魂墓碑' : '立棺'}】</span> 墓碑 ${S.tomb ? dist(A.player().getPos(), S.tomb).toFixed(0) : 0} 米${groundOn() ? `<span style="color:#a08cc0"> · ${rank('cw_k_rot') ? '腐朽之地' : '墓土'} 每 ${groundIv()} 秒 +1 侵蚀</span>` : ''}`;
    const slots = Array.from({ length: maxSouls() }, (_, i) => {
      const so = S.souls[i]; const c = so ? '#' + SOUL_COLOR[so].toString(16).padStart(6, '0') : '#555';
      return `<i style="display:inline-block;min-width:1.6em;margin:0 1px;padding:0 3px;border:1px solid ${c};border-radius:4px;color:${so ? c : '#777'};font-style:normal;text-align:center;background:rgba(0,0,0,.35)">${so ? SOUL_CHAR[so] : '空'}</i>`;
    }).join('');
    const open = S.souls.length ? `开棺 → <b style="color:#e0d0ff">${comboOf(S.souls).name}</b>` : '<span style="opacity:.7">棺中没有魂（击杀 / 打首领精英 / 锁魂链收魂）</span>';
    const cd = Math.max(0, undeadCd() - (now - S.undeadT));
    const tg = A.target();
    const ex = [tg && erodeN(tg) ? `<span style="color:#a08cc0">侵蚀 ${erodeN(tg)}</span>` : '', tg && S.wither.has(tg) ? '<span style="color:#c0b0e0">冥河凋零</span>' : '',
      now < S.bloodUntil ? `<span style="color:#e06070">血棺 ${(S.bloodUntil - now).toFixed(0)}s</span>` : '', S.debt > 0 ? `<span style="color:#c05060">血债 ${Math.round(S.debt)}</span>` : '', riteOn() && rank('cb_k_rite') ? '<span style="color:#d07080">血祭</span>' : ''].filter(Boolean).join(' ');
    return `${md} 魂 ${slots} · ${open}<br><small style="opacity:.85">F ${S.mode === 'back' ? '立棺' : '收棺'} · X 开棺 · 未亡${cd > 0 ? ` ${cd.toFixed(0)}s` : S.souls.length ? '就绪' : '（无魂）'}${ex ? ' · ' + ex : ''}</small>`;
  },
  debug: () => ({ witherTomb: witherMain(), groundOn: groundOn(), groundIv: groundIv(), tombR: tombR(), echoMul: echoMul(), witherCap: witherCap(), mode: S.mode, tomb: S.tomb, souls: [...S.souls], last: S.last, rest: S.restUntil > 0, undeadT: S.undeadT, echoQ: S.echoQ.length, stats: { ...S.stats, combos: [...S.stats.combos] }, b: { ...S.b }, erode: S.erode.size, wither: S.wither.size, debt: S.debt, blood: S.bloodUntil, max: maxSouls() }),
};
/** 测试用：直接塞魂 */
export function debugSouls(s: Soul[]) { S.souls = s.filter(x => SOULS.includes(x)).slice(0, maxSouls()); syncRes(); show(); }
