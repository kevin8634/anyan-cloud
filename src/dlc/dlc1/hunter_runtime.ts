// ======================================================================
// DLC1「灵契猎手」：三形态 + 兽魂 + 换形技 + 标记 / 破甲 / 流血（v1.0.6，d1.5）
// 通过本体 ClassExtApi 运行（core/ClassExt.ts），不 import web 模块。
//   F 轮换形态，Z 狼 / X 熊 / V 鹰 直接切换（1 秒内不能连切）
//   换形瞬间释放该形态的换形技（4 秒内置冷却）；兽魂 ≥25 时自动消耗 25 变成「灵契·」换形技（伤害 ×1.6）
//   狼：技能冷却 -15%、附带流血；普攻每第 3 下「撕咬」双倍
//   熊：技能伤害 +15%、范围 +25%；受到伤害 -15%；命中叠破甲（每层受到伤害 +3%，5 层，8 秒）
//   鹰：近身技能变远程；命中标记 6 秒（受到伤害 +12%）
// 三个专精（天赋系）各有一棵专属天赋树，机制天赋由这里按 talentRank 读取。
// v1.2.77 天赋方案 B（未来开发报告 §7.4）：狼群 → 雷狼。狼形攻击附带雷电并叠「感电」（最多 10 层，6 秒），
//   关键：感电电弧 / 雷步 | 雷暴爆发 / 群狼；巨熊：熊掌 / 厚皮 | 震地扩散 / 践踏；苍鹰：猎印 / 锐目 | 跳印 / 鹰击长空；
//   绝技：头狼·奔雷 / 巨熊之怒 / 天空之王。
// ======================================================================
import type { ClassExtApi, ClassExtUnit, ClassRuntime } from '../../core/ClassExt';
import type { ModifierDef, ResolvedSkill, Element } from '../../core/types';
import { SHIFT_SKILLS, PACK_BITE, BEAR_QUAKE, BEAR_TRAMPLE } from './hunter_skills';
import { HQ } from './hunter_data';
import { CondFlags } from '../../core/CondFlags';

export type Form = 'wolf' | 'bear' | 'eagle';
export const FORMS: Form[] = ['wolf', 'bear', 'eagle'];
export const FORM_NAME: Record<Form, string> = { wolf: '狼', bear: '熊', eagle: '鹰' };
const FORM_COLOR: Record<Form, string> = { wolf: '#d0d8e8', bear: '#c08040', eagle: '#80c8ff' };
export const K = { bowMax: 5, bowDur: 10, pactDur: 6, pactPer: 0.06, pierceExtra: 0.6, shockMax: 10, shockDur: 6, arcJumps: 3, arcPct: 0.35, stormPct: 0.012, stormDur: 6, packDur: 6, quakeDur: 8, skyDur: 10, switchCd: 1, shiftIcd: 4, shiftCost: 25, shiftMul: 0.6, bearReduce: 0.15, sunderPer: 0.03, sunderMax: 5, sunderDur: 8, markDur: 6, markAmp: 0.12, bite: 3, bearGroupMul: 0.85 };

type Op = ModifierDef['ops'][number];
const M = (id: string, match: ModifierDef['match'], ops: Op[], priority = 15): ModifierDef => ({ id: `form:${id}`, name: id, desc: '', source: 'buff', match, ops, priority });
const any = (...t: string[]) => ({ tagsAny: t });
const all = (...t: string[]) => ({ tagsAll: t });

/** 11-13 I08（Rhett 批）：默认四个技能按契分名（不再是「鹰·契刃斩」这类前缀）；其余技能仍加契前缀。数值不变 */
export const PACT_NAMES: Record<string, Record<Form, string>> = {
  hp_slash: { wolf: '雷爪斩', bear: '熊掌劈', eagle: '鹰羽矢' },
  hp_pounce: { wolf: '雷影扑', bear: '熊冲', eagle: '贯羽矢' },
  hp_rend: { wolf: '雷旋斩', bear: '震地旋掌', eagle: '羽暴' },
  hp_howl: { wolf: '狼嚎', bear: '熊咆', eagle: '鹰唳' },
};
const PACT_PREFIX: Record<Form, string> = { wolf: '雷狼·', bear: '熊·', eagle: '鹰·' };
const PREFIXED = ['hp_leap', 'hp_glide', 'hp_volley', 'hp_maul', 'hp_snare', 'hp_ward', 'hp_totem', 'hp_stampede', 'hp_avatar', 'hp_wildhunt', 'hp_spiritbeast', 'hp_shift_wolf', 'hp_shift_bear', 'hp_shift_eagle', 'hp_t_packbite', 'hp_t_quake', 'hp_t_trample'];
function nameMods(f: Form): ModifierDef[] {
  return [M(f + '_pre', { tagsAll: ['beast'], skillIds: PREFIXED }, [{ op: 'rename', prefix: PACT_PREFIX[f] }], 10),
    ...Object.entries(PACT_NAMES).map(([id, n]) => M(`${f}_nm_${id}`, { skillIds: [id] }, [{ op: 'rename', name: n[f] }], 10))];
}
/** 形态修饰器（纯数据）：同一技能三种打法 */
export function formMods(f: Form): ModifierDef[] { return [...nameMods(f), ...formMods0(f)]; }
function formMods0(f: Form): ModifierDef[] {
  if (f === 'wolf') return [
    M('wolf', all('beast'), [{ op: 'addTag', value: 'wolf' }, { op: 'addTag', value: 'lightning' }, { op: 'mul', stat: 'cooldown', value: -0.15 }, { op: 'addElement', value: 'lightning', damagePercent: 0.15 }], 10),   // v1.2.77 流血 → 雷电
    M('wolf_dash', all('beast', 'f_dash'), [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.25 } }]),
    M('wolf_nova', all('beast', 'f_nova'), [{ op: 'mul', stat: 'radius', value: -0.1 }, { op: 'mul', stat: 'damage', value: 0.1 }]),
  ];
  if (f === 'bear') return [
    M('bear', all('beast'), [{ op: 'addTag', value: 'bear' }, { op: 'addTag', value: 'sunder' }, { op: 'mul', stat: 'damage', value: 0.15 }, { op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'cooldown', value: 0.1 }], 10),
    M('bear_melee', all('beast', 'f_melee'), [{ op: 'mul', stat: 'damage', value: 0.25 }]),
    M('bear_dash', all('beast', 'f_dash'), [{ op: 'addEffect', effect: { type: 'knockback', distance: 3 } }]),
    M('bear_nova', all('beast', 'f_nova'), [{ op: 'mul', stat: 'radius', value: 0.05 }, { op: 'addEffect', effect: { type: 'stun', duration: 0.8 } }]),
  ];
  return [
    M('eagle', all('beast'), [{ op: 'addTag', value: 'eagle' }, { op: 'addTag', value: 'mark' }], 10),
    M('eagle_melee', all('beast', 'f_melee'), [{ op: 'setShape', value: 'projectile' }, { op: 'addTag', value: 'ranged' }, { op: 'addTag', value: 'arrow' }, { op: 'add', stat: 'range', value: 13.4 }, { op: 'mul', stat: 'damage', value: -0.1 }], 5),   // 11-05 arrow = 拉弓动作 + 箭矢弹体（只是外观标签）
    M('eagle_dash', all('beast', 'f_dash'), [{ op: 'setShape', value: 'projectile' }, { op: 'addTag', value: 'ranged' }, { op: 'addTag', value: 'arrow' }, { op: 'add', stat: 'range', value: 6 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 2 } }], 5),
    M('eagle_nova', all('beast', 'f_nova'), [{ op: 'addTag', value: 'targeted' }, { op: 'addTag', value: 'arrow' }, { op: 'add', stat: 'range', value: 16 }, { op: 'mul', stat: 'radius', value: -0.15 }], 5),
    M('eagle_far', any('f_proj', 'f_target', 'f_line', 'f_snare'), [{ op: 'add', stat: 'range', value: 4 }, { op: 'mul', stat: 'damage', value: 0.1 }, { op: 'addTag', value: 'arrow' }]),
  ];
}

// ---------------------------------------------------------------- 运行时状态
const S = {
  form: 'wolf' as Form, switchT: -99, shiftT: -99, basicN: 0,
  marks: new Map<ClassExtUnit, number>(),
  sunder: new Map<ClassExtUnit, { n: number; t: number }>(),
  bleedUntil: new Map<ClassExtUnit, number>(),
  shock: new Map<ClassExtUnit, { n: number; t: number }>(),           // v1.2.77 感电层数
  storms: new Map<ClassExtUnit, { left: number; tick: number }>(),    // 雷暴爆发：剩余秒数
  packUntil: -99, packTick: 0, quakeNext: false, quakeUntil: -99, quakeTick: 0, trampleT: 0, lastPos: null as null | { x: number; z: number }, skyUntil: -99, hideT: -99, skyBow: false,
  lastMarked: null as ClassExtUnit | null,
  pactHit: true,   // 11-05 鹰契·交契：本次交契的首次近战命中是否已用掉（必定破甲）
  stats: { skyFull: 0, bowStacks: 0, pierces: 0, pierceExtra: 0, pacts: 0, pactSunders: 0, pactAmp: 0, switches: 0, shifts: 0, empShifts: 0, bites: 0, marks: 0, sunders: 0, reduced: 0, amp: 0, shocks: 0, arcs: 0, storms: 0, stormDmg: 0, packHits: 0, shields: 0, quakes: 0, tramples: 0, jumps: 0, skyCasts: 0, sharp: 0, grp: 0, grpLow: 0 },
};
let A: ClassExtApi | null = null;
/** 11-05 当前形态（hunter_model 换装时决定哪把武器在手：鹰 = 弓，其余 = 长柄） */
export const hunterForm = (): Form => S.form;
let lastRoot: unknown = null;
/** 运行时 API（模型 / 测试用） */
export const hunterApi = () => A;
const rank = (id: string) => A?.talentRank(id) ?? 0;

function applyForm() {
  if (!A) return;
  const mods = formMods(S.form);
  // 天赋：形态强化（数据型的在天赋树里；这里只补需要按形态切换的）
  const fr = rank('hw_frenzy'); if (fr && S.form === 'wolf') mods.push(M('t_frenzy', all('wolf'), [{ op: 'mul', stat: 'cooldown', value: -0.05 * fr }], 60));
  const sl = rank('hb_slam'); if (sl && S.form === 'bear') mods.push(M('t_slam', all('bear'), [{ op: 'mul', stat: 'damage', value: 0.08 * sl }], 60));
  const rg = rank('he_range'); if (rg && S.form === 'eagle') mods.push(M('t_range', all('eagle'), [{ op: 'add', stat: 'range', value: 2 * rg }, { op: 'mul', stat: 'damage', value: 0.04 * rg }], 60));
  if (rank('hw_k_step') && S.form === 'wolf') mods.push(M('t_step', all('wolf', 'f_dash'), [{ op: 'addEffect', effect: { type: 'groundZone', element: 'lightning', dps: 12, radius: 2.5, duration: 2 } }], 60));   // 雷步
  if (S.quakeNext && S.form === 'bear') mods.push(M('t_quake', all('bear', 'f_nova'), [{ op: 'mul', stat: 'radius', value: 1 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 3 } }], 65));   // 震地扩散
  if (S.form === 'eagle' && A.now() < S.skyUntil) mods.push(M('t_sky', all('eagle', 'f_melee'), [{ op: 'addEffect', effect: { type: 'critEvery', n: 1 } }, { op: 'addTag', value: 'pierce' }, { op: 'add', stat: 'projectileCount', value: 1 }], 65));   // 天空之王
  if (rank('he_volley') && S.form === 'eagle') mods.push(M('t_volley', all('eagle', 'f_melee'), [{ op: 'add', stat: 'projectileCount', value: 1 }, { op: 'mul', stat: 'damage', value: -0.2 }], 60));
  // 11-05 40 级暗金「鹰契」d40_h_bow（规格 v0.2 §4b）：满 5 层时下一个鹰形远射技能变「穿云·」（穿透；追加箭在 onHits）
  if (S.form === 'eagle' && bowOn() && CondFlags.get('dk40h_bow', A.now()) >= K.bowMax) mods.push(M('t_pierce', all('eagle', 'ranged'), [{ op: 'addTag', value: 'pierce' }, { op: 'addTag', value: 'dk40_pierce' }, { op: 'rename', prefix: '穿云·' }], 66));
  A.setMods(mods);
}
/** 11-05 身上有鹰契（弓栏暗金）：只在鹰契手持时叠层 / 穿云；交契是切出后的独立状态 */
const bowOn = () => !!A?.hasDark?.('d40_h_bow');

/** 切换形态（返回是否切换成功）；换形技在这里放 */
export function setForm(f: Form, force = false): boolean {
  if (!A) return false;
  const now = A.now();
  if (!force && (f === S.form || now - S.switchT < K.switchCd)) return false;
  // 11-05 鹰契·交契（规格 v0.2 H2）：从鹰形切到狼 / 熊时，把鹰契层数 N 转成 6 秒交契（层数 N），清空鹰契
  if (!force && S.form === 'eagle' && f !== 'eagle' && bowOn()) {
    const n = CondFlags.get('dk40h_bow', now);
    if (n > 0) { CondFlags.consume('dk40h_pact'); CondFlags.addStack('dk40h_pact', n, K.bowMax, now + K.pactDur, now); S.pactHit = false; S.stats.pacts++; }
    CondFlags.consume('dk40h_bow');
  }
  S.form = f; S.switchT = now; S.stats.switches++;
  applyForm();
  A.ring(A.player().getPos(), 2.2, FORM_COLOR[f]);
  if (!force) shiftSkill(f);
  formVisual?.(f);
  return true;
}
function shiftSkill(f: Form) {
  if (!A || !A.player().alive) return;
  const now = A.now(), icd = K.shiftIcd - (A.questDone(HQ[0]) ? 1 : 0);
  if (now - S.shiftT < icd) return;
  S.shiftT = now;
  const def = SHIFT_SKILLS[f];
  let mul = 0;
  if (f === 'eagle' && rank('he_dive')) mul += 0.25 * rank('he_dive');
  if (f === 'eagle' && rank('he_k_dive') && A.target() && marked(A.target()!)) mul += 0.4;
  if (f === 'wolf' && rank('hw_k_pack')) { S.packUntil = now + K.packDur; S.packTick = 0; A.ring(A.player().getPos(), 2.8, '#a8c8ff'); }
  if (A.questDone(HQ[1])) mul += 0.2;
  const emp = A.res().value >= K.shiftCost - 1e-6 && A.resSpend(K.shiftCost);
  if (emp) { mul += K.shiftMul; S.stats.empShifts++;
    if (f === 'bear' && rank('hb_ursoc')) { S.quakeUntil = now + K.quakeDur; S.quakeTick = 0; }   // 巨熊之怒：8 秒连续震地
    if (f === 'eagle' && rank('he_sky')) { S.skyUntil = now + K.skyDur; S.skyBow = true; S.stats.skyCasts++; } }   // 天空之王：10 秒羽矢必暴、穿透
  const extra: ModifierDef[] = mul ? [M('shift_emp', { skillIds: [def.id] }, [{ op: 'more', stat: 'damage', value: mul }, ...(emp ? [{ op: 'rename' as const, prefix: '灵契·' }] : [])], 50)] : [];
  if (f === 'eagle' && rank('he_k_dive')) extra.push(M('t_dive', { skillIds: [def.id] }, [{ op: 'addEffect', effect: { type: 'interrupt' } }], 51));   // 鹰击长空：俯冲打断读条
  const keep = formMods(S.form);
  A.setMods([...keep, ...extra]);
  if (f !== 'eagle' || A.target() || A.enemiesNear(A.player().getPos(), def.stats.range).length) { A.fire(def); S.stats.shifts++; }
  applyForm();
}
/** 形态外观（hunter_model.ts 注册） */
let formVisual: ((f: Form) => void) | null = null;
export function onFormVisual(fn: (f: Form) => void) { formVisual = fn; }

const sunderN = (t: ClassExtUnit) => { const s = S.sunder.get(t); return s && A && A.now() - s.t < K.sunderDur ? s.n : 0; };
const marked = (t: ClassExtUnit) => !!A && (S.marks.get(t) ?? -1) > A.now();
const bleeding = (t: ClassExtUnit) => !!A && (S.bleedUntil.get(t) ?? -1) > A.now();
/** v1.2.77 感电层数（过期为 0） */
export const shockN = (t: ClassExtUnit) => { const s = S.shock.get(t); return s && A && A.now() - s.t < K.shockDur ? s.n : 0; };
const isBossish = (t: ClassExtUnit) => !!t.isBoss || !!A?.unitKind?.(t).elite;
/** 雷暴爆发 / 首领上限：每秒最多 = 20 + 3 × 等级（v1.2.77 classtune：原 60 + 12 × 等级，雷暴几乎常驻，首领木桩 DPS 750 → 压到 ≈400） */
const stormCap = () => 20 + 3 * (A?.level() ?? 30);
function addShock(t: ClassExtUnit, dealt: number) {
  if (!A || !t.alive) return;
  const was = shockN(t), per = rank('hw_alpha') ? 2 : 1, n = Math.min(K.shockMax, was + per);
  S.shock.set(t, { n, t: A.now() }); S.stats.shocks++;
  // 感电电弧：每跨过 5 层一次，跳 3 个目标（头狼 +2）
  if (rank('hw_k_shock') && Math.floor(n / 5) > Math.floor(was / 5)) {
    const jumps = K.arcJumps + (rank('hw_alpha') ? 2 : 0), p = t.getPos();
    const near = A.enemiesNear(p, 8).filter(e => e !== t && e.alive).sort((a, b) => Math.hypot(a.getPos().x - p.x, a.getPos().z - p.z) - Math.hypot(b.getPos().x - p.x, b.getPos().z - p.z)).slice(0, jumps);
    let from = p; for (const e of near) { A.zap?.(from, e.getPos()); A.damage(e, Math.max(1, dealt * K.arcPct), 'lightning'); from = e.getPos(); S.stats.arcs++; }
  }
  // 雷暴爆发：满 10 层落雷，6 秒每秒最大生命 1.2%（首领 / 精英封顶），然后清空（头狼回到 5 层）
  if (rank('hw_k_storm') && n >= K.shockMax && !S.storms.has(t)) {
    S.storms.set(t, { left: K.stormDur, tick: 0 }); S.stats.storms++;
    S.shock.set(t, { n: rank('hw_alpha') ? 5 : 0, t: A.now() });
    A.ring(t.getPos(), 2.2, '#c8dcff'); A.zap?.({ x: t.getPos().x, z: t.getPos().z }, t.getPos());
  }
}
const lastHitMul = new WeakMap<ClassExtUnit, number>();

export const HUNTER_RUNTIME: ClassRuntime = {
  bind(api) { A = api;
    // 11-05 Rhett 14:14：三魂同契只在狼 / 熊契手持（长柄）时生效 —— gear40 三魂同契四条加 flag 条件 dk40h_hold（读数，reset 不清）
    CondFlags.provide('dk40h_hold', () => (S.form !== 'eagle' ? 1 : 0)); },
  reset() { S.form = 'wolf'; S.switchT = -99; S.shiftT = -99; S.basicN = 0; S.marks.clear(); S.sunder.clear(); S.bleedUntil.clear(); S.shock.clear(); S.storms.clear(); S.packUntil = -99; S.quakeNext = false; S.quakeUntil = -99; S.skyUntil = -99; S.skyBow = false; S.hideT = -99; S.lastPos = null; S.lastMarked = null; for (const k of Object.keys(S.stats) as (keyof typeof S.stats)[]) S.stats[k] = 0; applyForm(); formVisual?.('wolf'); },
  update(_dt?: number) {
    if (!A) return;
    const now = A.now();
    const root = A.playerObj(); if (root !== lastRoot) { lastRoot = root; formVisual?.(S.form); }   // 换了模型（选角 / 读档）→ 重新挂形态之魂
    if (S.marks.size > 64) for (const [e, t] of S.marks) if (t < now || !e.alive) S.marks.delete(e);
    if (S.sunder.size > 64) for (const [e, s] of S.sunder) if (now - s.t > K.sunderDur || !e.alive) S.sunder.delete(e);
    if (S.shock.size > 64) for (const [e, s] of S.shock) if (now - s.t > K.shockDur || !e.alive) S.shock.delete(e);
    const dt = Math.min(0.1, Math.max(0, _dt ?? 0.016)), me = A.player().getPos();
    // 雷暴爆发：每秒一跳
    for (const [e, st] of S.storms) {
      if (!e.alive || st.left <= 0) { S.storms.delete(e); continue; }
      st.tick += dt; if (st.tick < 1) continue; st.tick -= 1; st.left -= 1;
      let d = e.maxHp * K.stormPct; if (isBossish(e)) d = Math.min(d, stormCap());
      A.zap?.({ x: e.getPos().x + 0.3, z: e.getPos().z - 0.3 }, e.getPos()); S.stats.stormDmg += A.damage(e, d, 'lightning');
    }
    // 群狼：换成狼形时召来 2 只雷狼影，6 秒内每秒各扑咬一次附近敌人
    if (now < S.packUntil && A.player().alive) { S.packTick += dt; if (S.packTick >= 1) { S.packTick -= 1;
      const near = A.enemiesNear(me, 8).filter(e => e.alive).slice(0, 2);
      for (const e of near) { A.zap?.(me, e.getPos()); A.fireFrom?.(PACK_BITE, e.getPos()); S.stats.packHits++; } } }
    // 巨熊之怒：8 秒内每秒震地一次
    if (now < S.quakeUntil && A.player().alive && S.form === 'bear') { S.quakeTick += dt; if (S.quakeTick >= 1) { S.quakeTick -= 1; A.fireFrom?.(BEAR_QUAKE, me); A.ring(me, 5, '#c08040'); S.stats.quakes++; } }
    // 践踏：熊形移动时撞开身边小怪（每 0.5 秒）
    if (rank('hb_k_trample') && S.form === 'bear' && A.player().alive) {
      const moved = S.lastPos ? Math.hypot(me.x - S.lastPos.x, me.z - S.lastPos.z) : 0;
      S.trampleT += dt; if (S.trampleT >= 0.5) { S.trampleT = 0;
        if (moved > 0.15 && A.enemiesNear(me, 1.8).some(e => e.alive && !isBossish(e))) { A.fireFrom?.(BEAR_TRAMPLE, me); S.stats.tramples++; } }
    }
    S.lastPos = { x: me.x, z: me.z };
    // 跳印：标记目标死亡 → 标记跳到最近敌人
    if (rank('he_k_jump')) for (const [e, t] of S.marks) if (!e.alive && t > now) {
      S.marks.delete(e); const p = e.getPos();
      const n = A.enemiesNear(p, 12).filter(x => x.alive).sort((a, b) => Math.hypot(a.getPos().x - p.x, a.getPos().z - p.z) - Math.hypot(b.getPos().x - p.x, b.getPos().z - p.z))[0];
      if (n) { S.marks.set(n, now + K.markDur); A.zap?.(p, n.getPos()); S.stats.jumps++; }
    }
    if (S.form === 'eagle' && S.skyUntil > 0 && now >= S.skyUntil) { S.skyUntil = -99; applyForm(); }
  },
  key(k) {
    if (k === 'f') { setForm(FORMS[(FORMS.indexOf(S.form) + 1) % 3]); return true; }
    if (k === 'z') { setForm('wolf'); return true; }
    if (k === 'x') { setForm('bear'); return true; }
    if (k === 'v') { setForm('eagle'); return true; }
    return false;
  },
  onCast(s: ResolvedSkill) { if (s.slot === 'basic') S.basicN++; if (S.quakeNext && s.tags.includes('bear') && s.tags.includes('f_nova')) { S.quakeNext = false; queueMicrotask(applyForm); } },
  onHits(s, hits) {
    if (!A) return s;
    const now = A.now();
    let out = s;
    // 狼：普攻每第 3 下撕咬（伤害 ×2；群狼天赋 ×2.5）
    if (s.slot === 'basic' && s.tags.includes('wolf') && S.basicN % K.bite === 0 && hits.length) {
      out = { ...s, displayName: '狼·撕咬', stats: { ...s.stats, damage: s.stats.damage * (rank('hw_pack') ? 2.5 : 2) } }; S.stats.bites++;
    }
    // 11-04 Rhett：巨熊群体（8 目标）输出比基准高约 18%，熊形范围技能一次命中 ≥3 个时伤害 ×0.85（单体不变）
    if (S.form === 'bear' && s.tags.includes('aoe')) { if (hits.length >= 3) { out = { ...out, stats: { ...out.stats, damage: out.stats.damage * K.bearGroupMul } }; S.stats.grp++; } else S.stats.grpLow++; }
    // 厚皮 / 震地扩散：熊形一次命中 3 个以上
    if (s.tags.includes('bear') && hits.length >= 3) {
      if (rank('hb_k_hide') && now - S.hideT >= 3) { S.hideT = now; A.shield?.('hide', 0.08, 5, 0.16); S.stats.shields++; }
      if (rank('hb_k_quake') && !S.quakeNext && !(s.tags.includes('f_nova'))) { S.quakeNext = true; applyForm(); }
    }
    // 11-05 鹰契：鹰形远射命中带标记目标叠 1 层（每次施放 1 层，10 秒，最多 5）；穿云这一发对所有带标记的敌人各追加一箭（60%），消耗全部层数
    if (S.form === 'eagle' && bowOn() && s.tags.includes('eagle') && s.tags.includes('ranged') && hits.length) {
      if (s.tags.includes('dk40_pierce')) {
        const dmg = Math.max(1, s.stats.damage * K.pierceExtra);
        for (const [e, t] of S.marks) if (t > now && e.alive) { A.damage(e, dmg, s.element); S.stats.pierceExtra++; }
        CondFlags.consume('dk40h_bow'); S.stats.pierces++; queueMicrotask(applyForm);
      } else if (hits.some(h => marked(h))) {
        const was = CondFlags.get('dk40h_bow', now); CondFlags.addStack('dk40h_bow', 1, K.bowMax, now + K.bowDur, now); S.stats.bowStacks++;
        if (was < K.bowMax && CondFlags.get('dk40h_bow', now) >= K.bowMax) queueMicrotask(applyForm);
      }
    }
    // 11-05 Rhett 14:14 按规格 v0.2 §4b（苍鹰行）：天空之王（灵契·苍鹰俯冲）命中直接叠满 5 层鹰契
    if (S.skyBow && bowOn() && s.baseId === SHIFT_SKILLS.eagle.id && hits.length) {
      S.skyBow = false; const was = CondFlags.get('dk40h_bow', now);
      CondFlags.addStack('dk40h_bow', K.bowMax, K.bowMax, now + K.bowDur, now); S.stats.skyFull++;
      if (was < K.bowMax) queueMicrotask(applyForm);
    }
    // 11-05 交契首击：交契期间第一次狼 / 熊命中必定破甲（多叠 1 层破甲）
    if (!S.pactHit && S.form !== 'eagle' && hits.length && CondFlags.get('dk40h_pact', now) > 0) {
      S.pactHit = true; const h = hits[0], max = K.sunderMax + (rank('hb_ursoc') ? 3 : 0); S.sunder.set(h, { n: Math.min(max, sunderN(h) + 1), t: now }); S.stats.pactSunders++;
    }
    for (const h of hits) {
      if (s.tags.includes('mark')) { S.marks.set(h, now + K.markDur); S.stats.marks++; }
      if (s.tags.includes('sunder')) { const max = K.sunderMax + (rank('hb_ursoc') ? 3 : 0); S.sunder.set(h, { n: Math.min(max, sunderN(h) + 1), t: now }); S.stats.sunders++; }
      if (s.effects.some(e => e.type === 'dot' && e.element === 'physical')) S.bleedUntil.set(h, now + 4);
      if (s.tags.includes('wolf')) lastHitMul.set(h, 1);   // 感电在 onDealt 按实际伤害叠（电弧要用）
      // 苍鹰终极：鹰契普攻打中标记目标回 3 兽魂
      if (rank('he_sky') && s.slot === 'basic' && s.tags.includes('eagle') && marked(h)) A.resAdd(3);
      // 头狼·奔雷：狼契命中感电目标回 2 兽魂
      if (rank('hw_alpha') && s.tags.includes('wolf') && shockN(h) > 0) A.resAdd(2);
    }
    return out;
  },
  onDealt(t, dealt, _el, _crit, tick) {
    if (!A || tick || !lastHitMul.has(t)) return;
    lastHitMul.delete(t);
    if (S.form === 'wolf') addShock(t, dealt);
  },
  preDeal(t, amt, _el: Element, toPlayer, _tick, crit) {
    if (!A) return amt;
    if (toPlayer) {
      if (S.form !== 'bear') return amt;
      const red = K.bearReduce + 0.05 * rank('hb_thick');
      S.stats.reduced += amt * red;
      return amt * (1 - red);
    }
    let k = 1;
    const sn = sunderN(t); if (sn) k += sn * (K.sunderPer + 0.01 * rank('hb_sunder')) + (rank('hb_ursoc') && sn >= 5 ? 0.25 : 0);
    if (S.form !== 'eagle' && marked(t)) { const pn = CondFlags.get('dk40h_pact', A.now()); if (pn) { k += K.pactPer * pn; S.stats.pactAmp++; } }   // 11-05 交契：狼 / 熊命中带标记目标每层 +6%
    if (marked(t)) { k += K.markAmp + 0.04 * rank('he_mark'); if (crit && rank('he_k_mark')) k += 0.25 * 0.5; }   // 猎印：对标记目标暴击时总伤约 +12.5%（说明已按此写）
    if (shockN(t) > 0 && rank('hw_bleed')) k += 0.03 * rank('hw_bleed');   // 雷噬（原撕裂）：对感电目标
    if (rank('he_k_sharp') && !crit && S.form === 'eagle') {   // 锐目：鹰契 8 米外未暴击的攻击 15% 概率双倍结算（说明已按此写）
      const me = A.player().getPos(), p = t.getPos();
      if (Math.hypot(p.x - me.x, p.z - me.z) > 8 && Math.random() < 0.15) { k *= 2; S.stats.sharp++; }
    }
    if (k > 1) S.stats.amp += amt * (k - 1);
    return amt * k;
  },
  status() {
    if (!A) return null;
    const cd = Math.max(0, K.shiftIcd - (A.questDone(HQ[0]) ? 1 : 0) - (A.now() - S.shiftT));
    const tg = A.target();
    const extra = tg ? [marked(tg) ? '<span style="color:#80c8ff">标记</span>' : '', sunderN(tg) ? `<span style="color:#e0a050">破甲 ${sunderN(tg)}</span>` : '', shockN(tg) ? `<span style="color:#c8dcff">感电 ${shockN(tg)}</span>` : '', S.storms.has(tg) ? '<span style="color:#e8f0ff">雷暴</span>' : ''].filter(Boolean).join(' ') : '';
    return `<span style="color:${FORM_COLOR[S.form]}">【${FORM_NAME[S.form]}契】</span> F 换契 · Z 狼 / X 熊 / V 鹰 · 换形技${cd > 0 ? ` ${cd.toFixed(1)}s` : '就绪'}${extra ? ' · ' + extra : ''}`;
  },
  debug: () => ({ shock: S.shock.size, storms: S.storms.size, quakeNext: S.quakeNext, sky: S.skyUntil, form: S.form, shiftT: S.shiftT, switchT: S.switchT, basicN: S.basicN, marks: S.marks.size, sunder: S.sunder.size, stats: { ...S.stats } }),
};
