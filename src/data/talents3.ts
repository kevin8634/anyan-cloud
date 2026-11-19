// v1.2.58 天赋 3.0（规则见 docs/设计/未来开发报告/未来开发报告.md 第 7 节）
// 在天赋树 2.0 的节点上重排成三区域：
//   行 1 区域一普通 ×3（各 2 级，投 4 点）→ 行 2 区域一关键（2 选 1）
//   行 3 区域二普通 ×3（各 2 级，投 4 点）→ 行 4 区域二关键（2 选 1）
//   行 5 区域三普通 ×4（各 3 级，投 9 点，仅主系）→ 行 6 绝技
// 组合：主 3 + 副 1 + 副 1 / 主 3 + 副 2 / 主 2 + 副 2 + 副 2，都正好 30 点。
// 普通节点改级数时按「满级总值不变」换算每级数值；关键节点沿用 2.0 的机制节点（选择 / 1 级机制 / 资源），不足的补「本系专注」。
import { TalentTreeDef, TalentNodeDef, TalentSpecDef } from '../core/TalentTree';
import type { ModOp } from '../core/types';

export interface SpecV3 { name: string; focus: string; /** 定稿的区域一关键（替换自动挑出的前两个） */ keys1?: TalentNodeDef[]; /** 定稿的区域二关键 */ keys2?: TalentNodeDef[]; /** v1.2.66 按 id 覆盖自动补位节点（本系精研 / 本系专注 / 绝技模板 / 重名）；带 modifier/stats/res 时按每级数值写，不再 rerank 换算 */ replace?: Record<string, Partial<TalentNodeDef>>; }

const GENERIC_STATS = ['crit', 'haste', 'hp'] as const;
const isStatOnly = (n: TalentNodeDef) => !!n.stats && !n.modifier && !n.extra?.length && !n.res;
const isGenericStat = (n: TalentNodeDef) => isStatOnly(n) && Object.keys(n.stats!).some(k => (GENERIC_STATS as readonly string[]).includes(k));

function scaleOps(ops: ModOp[], f: number): ModOp[] { return ops.map(o => (o.op === 'add' || o.op === 'mul') ? { ...o, value: +(o.value * f).toFixed(4) } : o); }
/** 改最大级数，保持满级总值 */
function rerank(n: TalentNodeDef, max: number): TalentNodeDef {
  const f = n.maxRank / max;
  const m: TalentNodeDef = { ...n, kind: 'rank', maxRank: max };
  delete m.requires; delete m.group;
  if (f === 1) return m;
  m.rankMul = f;
  if (!n.desc.includes('{v}')) m.desc = `${n.desc}（${max} 级满效果）`;
  if (n.modifier) m.modifier = { ...n.modifier, ops: scaleOps(n.modifier.ops, f) };
  if (n.extra) m.extra = n.extra.map(x => ({ ...x, ops: scaleOps(x.ops, f) }));
  if (n.stats) m.stats = Object.fromEntries(Object.entries(n.stats).map(([k, v]) => [k, +((v as number) * f).toFixed(3)]));
  if (n.res) m.res = Object.fromEntries(Object.entries(n.res).map(([k, v]) => [k, +((v as number) * f).toFixed(3)]));
  if (n.perRankShown) m.perRankShown = +(n.perRankShown * f).toFixed(2);
  if (n.perRankShown2) m.perRankShown2 = +(n.perRankShown2 * f).toFixed(2);
  return m;
}

function genericNormal(spId: string, i: number): TalentNodeDef {
  const k = GENERIC_STATS[i % 3];
  const d = { crit: { name: '锐眼', desc: '暴击率 +{v}%', per: 1.5, stats: { crit: 1.5 }, icon: 'tl_haste' }, haste: { name: '迅捷', desc: '急速 +{v}%', per: 2, stats: { haste: 2 }, icon: 'tl_haste' }, hp: { name: '坚韧', desc: '生命 +{v}', per: 60, stats: { hp: 60 }, icon: 'tl_iron' } }[k];
  return { id: `${spId}_g${i}`, name: d.name, row: 1, col: 0, kind: 'rank', maxRank: 2, icon: d.icon, desc: `通用：${d.desc}`, perRankShown: d.per, stats: d.stats };
}
function powerNormal(spId: string, i: number, focus: string): TalentNodeDef {
  return { id: `${spId}_p${i}`, name: '本系精研', row: 3, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_weapon', desc: `技能伤害 +{v}%（${focus}）`, perRankShown: 3,
    modifier: { name: '本系精研', desc: '', match: {}, ops: [{ op: 'more', stat: 'damage', value: 0.03 }] } };
}
function focusKey(spId: string, i: number, focus: string): TalentNodeDef {
  return { id: `${spId}_k${i}`, name: '本系专注', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_weapon', desc: `关键：技能伤害 +10%，冷却 -5%（${focus}）`,
    modifier: { name: '本系专注', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.1 }, { op: 'mul', stat: 'cooldown', value: -0.05 }] } };
}

export function specToV3(sp: TalentSpecDef, cfg?: SpecV3): TalentSpecDef {
  const focus = cfg?.focus ?? sp.desc;
  const all = sp.nodes.filter(n => !n.capstone).sort((a, b) => a.row - b.row || a.col - b.col);
  const cap = sp.nodes.find(n => n.capstone);
  const keyCand = all.filter(n => n.kind === 'choice' || n.maxRank === 1);
  const keys: TalentNodeDef[] = keyCand.slice(0, 4).map(n => ({ ...n, kind: 'choice', maxRank: 1 }));
  for (let i = keys.length; i < 4; i++) keys.push(focusKey(sp.id, i, focus));
  if (cfg?.keys1) keys.splice(0, 2, ...cfg.keys1);
  if (cfg?.keys2) keys.splice(2, 2, ...cfg.keys2);
  const used = new Set(keyCand.slice(0, 4)); let normals = all.filter(n => !used.has(n));
  // 区域一需要 1 个通用属性节点（暴击 / 急速 / 生命，只在这里出现）
  let gen = normals.find(isGenericStat);
  if (gen) normals = normals.filter(n => n !== gen); else gen = genericNormal(sp.id, sp.id.length);
  const z1 = [gen, ...normals.splice(0, 2)];
  const z2 = normals.splice(0, 3);
  const z3 = normals.splice(0, 4);
  // 多出来的普通节点（极少）并进区域三最后一个槽位之外：丢弃前提示开发期报错
  if (normals.length) console.warn(`[天赋3.0] ${sp.id} 多出普通节点：${normals.map(n => n.id).join(',')}`);
  let pi = 0;
  while (z1.length < 3) z1.push(powerNormal(sp.id, pi++, focus));
  while (z2.length < 3) z2.push(powerNormal(sp.id, pi++, focus));
  while (z3.length < 4) z3.push(powerNormal(sp.id, pi++, focus));
  const place = (arr: TalentNodeDef[], row: number, max: number) => arr.map((n, i) => ({ ...rerank(n, max), row, col: i }));
  const pk = (arr: TalentNodeDef[], row: number) => arr.map((n, i) => { const m: TalentNodeDef = { ...n, row, col: i === 0 ? 0 : 2, kind: 'choice', maxRank: 1 }; delete m.requires; delete m.group; m.desc = m.desc.startsWith('关键') ? m.desc : `关键：${m.desc}`; return m; });
  const nodes: TalentNodeDef[] = [
    ...place(z1, 1, 2), ...pk(keys.slice(0, 2), 2),
    ...place(z2, 3, 2), ...pk(keys.slice(2, 4), 4),
    ...place(z3, 5, 3),
  ];
  if (cap) { const c: TalentNodeDef = { ...cap, row: 6, col: 1, kind: 'rank', maxRank: 1 }; delete c.requires; delete c.group; nodes.push(c); }   // v1.2.77 绝技也吃 replace（改名 / 改说明）
  if (cfg?.replace) for (let i = 0; i < nodes.length; i++) {
    const rep = cfg.replace[nodes[i].id]; if (!rep) continue;
    const m: TalentNodeDef = { ...nodes[i], ...rep };
    if (rep.modifier || rep.stats || rep.res) { delete m.rankMul; if (!rep.modifier) delete m.modifier; if (!rep.stats) delete m.stats; if (!rep.res) delete m.res; }
    if (m.kind === 'choice' && !m.desc.startsWith('关键')) m.desc = `关键：${m.desc}`;
    if (m.capstone) m.kind = 'rank';
    nodes[i] = m;
  }
  return { ...sp, name: cfg?.name ?? sp.name, focus, nodes };
}

export function talentTree3(def: TalentTreeDef, cfg: Record<string, SpecV3> = {}): TalentTreeDef {
  return { ...def, v3: true, tierCost: 0, tiers: 6, specs: def.specs.map(sp => specToV3(sp, cfg[sp.id])) };
}

/** 本体四职业：十八系定稿里的系名与主打 */
export const SPEC_V3: Record<string, SpecV3> = {
  w_arms: { name: '裂伤', focus: '流血 · 物理持续伤害', keys1: [
    { id: 'wa_k_rend', name: '撕裂', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_weapon', desc: '关键：物理技能命中叠流血（最多 5 层，6 秒），每层每秒造成该次伤害的 3%；流血可暴击' },
    { id: 'wa_k_deep', name: '深创', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'it_greataxe', desc: '关键：物理技能命中叠流血（最多 5 层）；叠满 5 层时立刻引爆剩余流血的 60% 并清空' },
  ], keys2: [
    { id: 'wa_k_mortal', name: '致死打击', row: 4, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_weapon', desc: '关键：对身上有持续伤害（流血等）的目标，技能伤害 +20%',
      modifier: { name: '致死打击', desc: '', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'dot' }], ops: [{ op: 'more', stat: 'damage', value: 0.2 }] } },
    { id: 'wa_k_bleed', name: '放血', row: 4, col: 2, kind: 'choice', maxRank: 1, icon: 'it_greataxe', desc: '关键：撕裂 / 深创的流血每层每秒伤害由 3% 提高到 4.5%' },
  ] },
  w_fury: { name: '暴怒', focus: '暴击 · 怒气', keys1: [
    { id: 'wf_k_rage', name: '怒火', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_wrath', desc: '关键：怒气获取 +30%，怒气满溢强化的技能伤害再 +15%', res: { gainMul: 0.3, empowerMore: 0.15 } },
    { id: 'wf_k_frenzy', name: '狂乱', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_wrath', desc: '关键：每次暴击叠 1 层狂乱（最多 10 层，6 秒），每层技能伤害 +2.5%', modifier: { name: '狂乱', desc: '', match: {}, conditions: [{ type: 'stacks', key: 'frenzy', scale: true }], ops: [{ op: 'more', stat: 'damage', value: 0.025 }] } },
  ] },
  w_prot: { name: '铁壁', focus: '护甲 · 反伤', keys1: [
    { id: 'wp_k_armorhit', name: '甲击', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'it_shield', desc: '关键：技能伤害随护甲提高：每 60 点护甲 +1%（最多 +25%）', modifier: { name: '甲击', desc: '', match: {}, conditions: [{ type: 'stacks', key: 'armor_pct', scale: true }], ops: [{ op: 'more', stat: 'damage', value: 0.01 }] } },
    { id: 'wp_k_harden', name: '坚甲', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_iron', desc: '关键：护甲 +400，生命 +400', stats: { armor: 400, hp: 400 } },
  ] },
  m_fire: { name: '炽焰', focus: '火焰暴击 · 短时高额灼烧', keys1: [
    { id: 'mf_k_blaze', name: '炽燃', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_fireheart', desc: '关键：火焰暴击附加「炽燃」= 该次伤害的 60%，2 秒内烧完（不叠层，刷新取高）' },
    { id: 'mf_k_ember', name: '余烬', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_fireheart', desc: '关键：对身上有持续伤害（燃烧 / 炽燃等）的目标，火焰技能伤害 +18%',
      modifier: { name: '余烬', desc: '', match: { elements: ['fire'] }, conditions: [{ type: 'targetHasEffect', effect: 'dot' }], ops: [{ op: 'mul', stat: 'damage', value: 0.18 }] } },
  ] },
  m_frost: { name: '凛冬', focus: '冰系增伤 · 短冷却 · 暴击', keys1: [
    { id: 'mi_k_brittle', name: '冰脆', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_iceheart', desc: '关键：被减速 / 冻结的目标受你的冰霜伤害 +20%',
      modifier: { name: '冰脆', desc: '', match: { elements: ['frost'] }, conditions: [{ type: 'targetHasEffect', effect: 'slow' }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] } },
    { id: 'mi_k_flow', name: '寒流', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_iceheart', desc: '关键：冰霜技能冷却 -12%，伤害 +6%',
      modifier: { name: '寒流', desc: '', match: { elements: ['frost'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.12 }, { op: 'mul', stat: 'damage', value: 0.06 }] } },
  ] },
  m_arcane: { name: '星痕', focus: '叠层易伤 · 爆发', keys1: [
    { id: 'ma_k_vuln', name: '奥术易伤', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_arcaneheart', desc: '关键：奥术伤害命中叠易伤（最多 10 层，6 秒），每层奥术伤害 +3%', modifier: { name: '奥术易伤', desc: '', match: { elements: ['arcane'] }, conditions: [{ type: 'stacks', key: 'arcane_vuln', scale: true }], ops: [{ op: 'more', stat: 'damage', value: 0.03 }] } },
    { id: 'ma_k_overflow', name: '满溢', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_arcaneheart', desc: '关键：奥能只需 3 层就能满溢强化，满溢强化的技能伤害再 +10%', res: { thrAdd: -1, empowerMore: 0.1 } },
  ] },
  c_mark: { name: '时痕', focus: '印记 · 引爆', keys1: [
    { id: 'cm_k_stack', name: '刻痕', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_mark', desc: '关键：技能命中叠刻痕（最多 5 层，6 秒），每层技能伤害 +3%', modifier: { name: '刻痕', desc: '', match: {}, conditions: [{ type: 'stacks', key: 'cmark', scale: true }], ops: [{ op: 'more', stat: 'damage', value: 0.03 }] } },
    { id: 'cm_k_glass', name: '沙漏', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_mark', desc: '关键：对被减速 / 冻结的目标，技能伤害 +15%', modifier: { name: '沙漏', desc: '', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'slow' }], ops: [{ op: 'more', stat: 'damage', value: 0.15 }] } },
  ] },
  c_echo: { name: '回声', focus: '复制 · 残影', keys1: [
    { id: 'ce_k_throw', name: '回声投掷', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_echo', desc: '关键：时轮投掷伤害 +30%（回声余响）', modifier: { name: '回声投掷', desc: '', match: { skillIds: ['chrono_throw'] }, ops: [{ op: 'more', stat: 'damage', value: 0.3 }] } },
    { id: 'ce_k_guard', name: '回声护身', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_echo', desc: '关键：生命 +500，护甲 +200', stats: { hp: 500, armor: 200 } },
  ] },
  c_rewind: { name: '回溯', focus: '冷却循环 · 暴击', keys1: [
    { id: 'cr_k_return', name: '返时', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_haste', desc: '关键：暴击时 15% 几率让冷却最长的技能（1~3）立刻冷却完毕（每秒最多一次）' },
    { id: 'cr_k_foresee', name: '预知', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_haste', desc: '关键：每 10 秒，下一个技能伤害 +50%',
      modifier: { name: '预知', desc: '', match: {}, conditions: [{ type: 'icd', sec: 10 }], ops: [{ op: 'more', stat: 'damage', value: 0.5 }] } },
  ] },
  a_blast: { name: '爆破', focus: '火焰 · 范围暴击', keys1: [
    { id: 'ab_k_double', name: '爆燃', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_blast', desc: '关键：火焰暴击时在目标处二次爆炸，造成该次伤害的 40%（3 米范围）' },
    { id: 'ab_k_wave', name: '冲击波', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_blast', desc: '关键：火焰范围技能半径 +25%，伤害 +8%', modifier: { name: '冲击波', desc: '', match: { elements: ['fire'], tagsAny: ['aoe'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.08 }] } },
  ] },
  a_ground: { name: '腐蚀', focus: '酸毒 · 持续 · 降护甲', keys1: [
    { id: 'ag_k_corrode', name: '腐蚀', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_plague', desc: '关键：自然伤害命中叠腐蚀（最多 6 层，6 秒），每层自然伤害 +4%', modifier: { name: '腐蚀', desc: '', match: { elements: ['nature'] }, conditions: [{ type: 'stacks', key: 'corrode', scale: true }], ops: [{ op: 'more', stat: 'damage', value: 0.04 }] } },
    { id: 'ag_k_bone', name: '蚀骨', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_plague', desc: '关键：对身上有持续伤害的目标，自然技能伤害 +20%', modifier: { name: '蚀骨', desc: '', match: { elements: ['nature'] }, conditions: [{ type: 'targetHasEffect', effect: 'dot' }], ops: [{ op: 'more', stat: 'damage', value: 0.2 }] } },
  ] },
  a_turret: { name: '炮台', focus: '机械 · 召唤', keys1: [
    { id: 'at_k_calib', name: '校准', row: 2, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_steam', desc: '关键：大釜炮台伤害 +35%', modifier: { name: '校准', desc: '', match: { skillIds: ['cauldron'] }, ops: [{ op: 'more', stat: 'damage', value: 0.35 }] } },
    { id: 'at_k_brace', name: '加固', row: 2, col: 2, kind: 'choice', maxRank: 1, icon: 'tl_steam', desc: '关键：大釜炮台冷却 -20%，生命 +400', modifier: { name: '加固', desc: '', match: { skillIds: ['cauldron'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }] }, stats: { hp: 400 } },
  ] },
};

// ---- v1.2.66 天赋内容核查（docs/设计/天赋与技能联动核查_1030.md）：自动补位节点换成各系专属 ----
type Rep = Partial<TalentNodeDef>;
export const md = (name: string, match: import('../core/types').ModifierDef['match'], ops: ModOp[], conditions?: import('../core/types').ModCondition[]) =>
  ({ name, desc: '', match, ops, ...(conditions ? { conditions } : {}) }) as NonNullable<TalentNodeDef['modifier']>;
/** 区域三普通（3 级），v / v2 为每级数值 */
export const rp = (name: string, desc: string, v: number, extra: Rep, v2?: number): Rep => ({ name, desc, perRankShown: v, ...(v2 !== undefined ? { perRankShown2: v2 } : {}), ...extra });
const slotLabel = (slot: string) => slot === 'basic' ? '普通攻击' : `技能 ${slot.replace('skill', '')}`;
export const dmgSlot = (name: string, slot: string, v: number): Rep => rp(name, `${slotLabel(slot)} 伤害 +{v}%`, v, { modifier: md(name, { slots: [slot as any] }, [{ op: 'mul', stat: 'damage', value: v / 100 }]) });
export const cdSlot = (name: string, slot: string, v: number): Rep => rp(name, `${slotLabel(slot)} 冷却 -{v}%`, v, { modifier: md(name, { slots: [slot as any] }, [{ op: 'mul', stat: 'cooldown', value: -v / 100 }]) });
export const vsHigh = (name: string, v: number, el?: string): Rep => rp(name, `对生命高于 70% 的目标${el ? ({ shadow: '暗影', fire: '火焰', frost: '冰霜', nature: '自然', arcane: '奥术', lightning: '雷电', physical: '物理' } as any)[el] : '技能'}伤害 +{v}%`, v,
  { modifier: md(name, el ? { elements: [el as any] } : {}, [{ op: 'mul', stat: 'damage', value: v / 100 }], [{ type: 'targetHpAbove', percent: 0.7 }]) });
export const ultName = (name: string): Rep => ({ name });
const BODY_REPLACE: Record<string, Record<string, Rep>> = {
  w_arms: { w_arms_p0: rp('血雾', '对流血中的目标技能伤害 +{v}%', 3, { modifier: md('血雾', {}, [{ op: 'more', stat: 'damage', value: 0.03 }], [{ type: 'targetHasEffect', effect: 'dot' }]) }),
    w_arms_s4: ultName('断首式'), wa_k_mortal: { name: '重创' } },
  w_fury: { w_fury_p0: rp('血勇', '怒气满溢强化的技能伤害再 +{v}%', 4, { res: { empowerMore: 0.04 } }), w_fury_s4: ultName('狂澜') },
  w_prot: { w_prot_p0: rp('盾锋', '盾牌 / 震击类技能伤害 +{v}%', 4, { modifier: md('盾锋', { tagsAny: ['shield', 'slam'] }, [{ op: 'mul', stat: 'damage', value: 0.04 }]) }), w_prot_s4: ultName('镇岳') },
  m_fire: { m_fire_p0: rp('焚风', '火焰范围技能半径 +{v}%，伤害 +{v2}%', 5, { modifier: md('焚风', { elements: ['fire'], tagsAny: ['aoe'] }, [{ op: 'mul', stat: 'radius', value: 0.05 }, { op: 'mul', stat: 'damage', value: 0.01 }]) }, 1),
    m_fire_p1: cdSlot('速燃', 'skill1', 5), m_fire_s4: ultName('天火') },
  m_frost: { m_frost_p0: dmgSlot('冰棱', 'skill1', 4), m_frost_s4: ultName('霜纪'), mi_flow: { name: '踏雪' } },
  m_arcane: { m_arcane_p0: rp('星轨', '技能 3 冷却 -{v}%，伤害 +{v2}%', 5, { modifier: md('星轨', { slots: ['skill3'] }, [{ op: 'mul', stat: 'cooldown', value: -0.05 }, { op: 'mul', stat: 'damage', value: 0.02 }]) }, 2), m_arcane_s4: ultName('星陨') },
  c_echo: { c_echo_p0: dmgSlot('叠影', 'skill2', 4), c_echo_p1: cdSlot('回环', 'skill1', 5), c_echo_s4: ultName('万声') },
  c_mark: { c_mark_p0: vsHigh('蚀刻', 4), c_mark_p1: cdSlot('裂时', 'skill3', 5), c_mark_s4: ultName('终末刻') },
  c_rewind: { c_rewind_p0: rp('逆流', '每 8 秒，下一个技能伤害 +{v}%', 10, { modifier: md('逆流', {}, [{ op: 'more', stat: 'damage', value: 0.1 }], [{ type: 'icd', sec: 8 }]) }),
    c_rewind_p1: cdSlot('余温', 'skill2', 5), c_rewind_s4: ultName('长夜') },
  a_blast: { a_blast_p0: rp('爆芯', '火焰范围技能伤害 +{v}%', 4, { modifier: md('爆芯', { elements: ['fire'], tagsAny: ['aoe'] }, [{ op: 'mul', stat: 'damage', value: 0.04 }]) }),
    a_blast_k3: { name: '连爆', desc: '关键：火焰技能冷却 -12%', modifier: md('连爆', { elements: ['fire'] }, [{ op: 'mul', stat: 'cooldown', value: -0.12 }]) }, a_blast_s4: ultName('大爆炸') },
  a_ground: { a_ground_p0: rp('渗毒', '自然技能冷却 -{v}%', 4, { modifier: md('渗毒', { elements: ['nature'] }, [{ op: 'mul', stat: 'cooldown', value: -0.04 }]) }),
    a_ground_p1: dmgSlot('溶甲', 'skill1', 4), a_ground_s4: ultName('蚀日') },
  a_turret: { a_turret_p0: rp('齿轮', '大釜炮台冷却 -{v}%', 5, { modifier: md('齿轮', { skillIds: ['cauldron'] }, [{ op: 'mul', stat: 'cooldown', value: -0.05 }]) }),
    a_turret_p1: dmgSlot('过载', 'skill2', 4), a_turret_s4: ultName('重炮') },
};
for (const [id, rep] of Object.entries(BODY_REPLACE)) SPEC_V3[id] = { ...SPEC_V3[id], replace: { ...SPEC_V3[id]?.replace, ...rep } };
