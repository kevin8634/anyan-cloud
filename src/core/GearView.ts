// ========== v0.6.7：装备说明 4 层 + 装备分（引擎无关） ==========
// 一件装备只分 4 层，每层一种颜色、一个符号：
//   基础（白）：底材 + 装等决定的主数值；底材自带的二级属性也在这里。同一属性只出现一次：词条加的同名属性直接并进基础。
//   属性（蓝 ◇）：底材没有的角色属性（生命 / 护甲 / 强度 / 暴击 / 暴伤 / 急速 / 移速）。
//   技能（绿 ✚）：点名某个技能 / 技能槽的加成（身上没有该技能时变灰，由界面判断）。
//   特效（橙 ★）：改变玩法的效果：传说大特效、固定特效、暗金、拓印、紫装小特效。
// 老存档的装备不用迁移：直接按 lines + 总属性重新分层。
import { ItemInstance, LootData, BonusStat, BONUS_STATS, AffixDef, affixRegex, QUALITIES, QUALITY_MUL, baseBonus } from './Loot';
import type { SetBonus } from './Loadout';

export type StatK = 'hp' | 'armor' | BonusStat;
export const STAT_KEYS: StatK[] = ['hp', 'armor', ...BONUS_STATS];
export interface StatLine { k: StatK; v: number; sp?: boolean }
export interface SkillLine { text: string; skillIds?: string[]; slots?: string[]; tags?: string[]; sp?: boolean }
export type EffectKind = 'small' | 'big' | 'dark' | 'engrave' | 'set';
export interface EffectLine { text: string; kind: EffectKind }
export interface GearLayers { base: StatLine[]; attrs: StatLine[]; skills: SkillLine[]; effects: EffectLine[]; elems: string[] }

const statOf = (it: ItemInstance, k: StatK) => k === 'hp' ? it.hp : k === 'armor' ? it.armor : it.bonus?.[k] ?? 0;

/** 一行词条文字 → 去掉 ✧ / 〔元素〕 前缀 */
function strip(l: string): { body: string; sp: boolean; el?: string } {
  let body = l, sp = false, el: string | undefined;
  if (body.startsWith('✧ ')) { sp = true; body = body.slice(2); }
  const m = body.match(/^〔(.)〕(.*)$/);
  if (m) { el = m[1]; body = m[2]; }
  return { body, sp, el };
}

export function findAffix(data: LootData, body: string): AffixDef | undefined {
  for (const a of [...data.affixes, ...(data.specialAffixes ?? [])]) {
    if (a.kind === 'effect' ? a.text === body : affixRegex(a).test(body)) return a;
  }
  return undefined;
}

/** v0.6.9：多职业首饰的特效带【战士】/【法师】前缀：只显示当前职业那条 */
const CLS_OF: Record<string, string> = { '战士': 'warrior', '法师': 'mage' };
function clsFilter(text: string, classId?: string): string | null {
  const m = text.match(/^【(战士|法师)】(.*)$/);
  if (!m) return text;
  if (classId && CLS_OF[m[1]] !== classId) return null;
  return classId ? m[2] : text;
}
export function gearLayers(it: ItemInstance, data: LootData, classId?: string): GearLayers {
  const base = data.bases.find(b => b.id === it.baseId);
  const baseKeys = new Set<StatK>();
  if (base) { if (base.hp > 0) baseKeys.add('hp'); if (base.armor > 0) baseKeys.add('armor'); for (const k of BONUS_STATS) if (base.bonus?.[k]) baseKeys.add(k); }
  else { baseKeys.add('hp'); baseKeys.add('armor'); }
  const spStats = new Set<StatK>();
  const skills: SkillLine[] = [], effects: EffectLine[] = [], elems: string[] = [];
  const qi = QUALITIES.indexOf(it.quality);
  for (const raw of it.lines) {
    if (raw.startsWith('★')) { const t = clsFilter(raw.slice(1).trim(), classId); if (t) effects.push({ text: t, kind: 'big' }); continue; }
    if (raw.startsWith('❖')) { const t = clsFilter(raw.slice(1).trim(), classId); if (t) effects.push({ text: t, kind: 'dark' }); continue; }
    if (raw.startsWith('✦')) { effects.push({ text: raw.slice(1).trim(), kind: 'engrave' }); continue; }
    if (raw.startsWith('◆')) { const t = clsFilter(raw.slice(1).trim(), classId); if (t) effects.push({ text: t, kind: qi >= 4 ? 'big' : 'small' }); continue; }
    const { body, sp, el } = strip(raw);
    if (el) elems.push(el);
    const a = findAffix(data, body);
    if (a?.kind === 'char') { if (sp) spStats.add(a.stat as StatK); continue; }
    if (a?.kind === 'skill') { skills.push({ text: body, skillIds: a.match?.skillIds, slots: a.match?.slots as string[] | undefined, tags: a.match?.tagsAny, sp }); continue; }
    if (a?.kind === 'effect') { effects.push({ text: body, kind: 'small' }); continue; }
    // 固定装备（套装件）自带的修饰器文字：不带前缀
    effects.push({ text: body, kind: it.setId ? 'set' : qi >= 4 ? 'big' : 'small' });
  }
  const baseL: StatLine[] = [], attrs: StatLine[] = [];
  for (const k of STAT_KEYS) {
    const v = statOf(it, k);
    if (!v) continue;
    (baseKeys.has(k) ? baseL : attrs).push({ k, v, sp: spStats.has(k) || undefined });
  }
  return { base: baseL, attrs, skills, effects, elems };
}

/** 装备分：一个数字看好坏（新手只看它和 ▲▼）。已损坏 = 0。
 *  v1.2.14 改动（设计见 docs/设计/装备与副本.md「装备分改动表」）：
 *   G1 特效按装等计分：特效分 = 同部位同装等紫装的属性分（基础层 + 2 条属性词条期望，见 purpleRef） × 系数（小特效 8%、传说 20%、拓印 15%、暗金 40%；传说原案 25%，见 FX_COEF 注释）；
 *      同一件的传说 / 暗金特效按「一件一份」算（多行特效共享这一份），小特效 / 拓印按条算。
 *   G2 套装按进度计分：传 ctx.setBonuses + ctx.setOthers（除这件以外身上生效的同套件数）时，
 *      这件能「凑成」的那一档套装效果整档算进这件（2 件 25%、4 件 35%、6 件及以上 45%）；凑不上只算属性。
 *   G3 按职业 / 专精取属性权重：ctx.role = 'dps' | 'tank'；不传 = 旧的通用权重（兼容老调用）。 */
export type GearRole = 'dps' | 'tank';
/** 专精 → 装备分权重。本体数据表不动（数据指纹测试锁着），坦克专精在这里登记；内容包专精可直接在 TalentSpecDef.gearRole 里写 */
export const GEAR_ROLE_BY_SPEC: Record<string, GearRole> = { w_prot: 'tank' };
export const specGearRole = (sp: { id: string; gearRole?: GearRole }): GearRole => sp.gearRole ?? GEAR_ROLE_BY_SPEC[sp.id] ?? 'dps';
const W: Record<StatK, number> = { hp: 0.2, armor: 0.25, power: 2, crit: 6, critDmg: 2.5, haste: 6, speed: 4 };
export const ROLE_WEIGHTS: Record<GearRole | 'all', Record<StatK, number>> = {
  all: W,
  dps: { hp: 0.12, armor: 0.15, power: 2.5, crit: 7, critDmg: 3, haste: 7, speed: 4 },
  tank: { hp: 0.35, armor: 0.45, power: 1.2, crit: 3, critDmg: 1.2, haste: 4, speed: 4 },
};
export const FX_COEF = { small: 0.08, big: 0.2, engrave: 0.15, dark: 0.4 };   // big 原案 25%：橙装品质倍率本身已比紫装高 11.5%，25% 实测橙 ≈ 紫 ×1.33，按「约 +25%」目标改 20%
export const SET_TIER_COEF = (pieces: number) => pieces >= 6 ? 0.45 : pieces >= 4 ? 0.35 : 0.25;
export interface GearScoreCtx {
  role?: GearRole;
  /** 当前职业：首饰 / 披风这类通用底材按本职业的词条池估紫装基准 */
  classId?: string;
  /** 套装效果表（Inventory.setBonuses）；不传 = 不算套装进度 */
  setBonuses?: SetBonus[];
  /** 除这件以外，身上生效的同套件数（按 setId） */
  setOthers?: Map<string, number> | Record<string, number>;
}
const othersOf = (ctx: GearScoreCtx | undefined, id: string) => { const o = ctx?.setOthers; return !o ? 0 : o instanceof Map ? o.get(id) ?? 0 : o[id] ?? 0; };
/** 属性层分（基础 + 属性，按权重） */
export function statScore(it: ItemInstance, role?: GearRole): number {
  const w = ROLE_WEIGHTS[role ?? 'all'];
  let s = 0;
  for (const k of STAT_KEYS) s += statOf(it, k) * w[k];
  return s;
}
/** G1 基准：本部位同装等紫装的属性分 = 同底材紫装基础层 + 紫装 2 条属性词条的期望（按词条权重、取中值）。
 *  只算基础层的话首饰（底材只有一点生命）的特效几乎不值钱，所以把紫装必带的 2 条属性一起算进「紫装基础分」。
 *  没有底材（老存档 / 异常数据）时按本件属性折算成紫装。结果按 底材|装等|权重 缓存。 */
const REF_CACHE = new Map<string, number>();
export function purpleRef(it: ItemInstance, data: LootData, role?: GearRole, classId?: string): number {
  const base = data.bases.find(b => b.id === it.baseId);
  if (!base) return statScore(it, role) * QUALITY_MUL.purple / (QUALITY_MUL[it.quality] ?? 1);
  const cls = base.cls ?? classId;
  const key = `${base.id}|${it.itemLevel}|${role ?? 'all'}|${cls ?? ''}|${data.affixes.length}`;
  const hit = REF_CACHE.get(key); if (hit !== undefined) return hit;
  const w = ROLE_WEIGHTS[role ?? 'all'], il = it.itemLevel, P = QUALITY_MUL.purple;
  const scale = (1 + (il - 1) * 0.12) * P;
  let s = Math.round(base.hp * scale) * w.hp + Math.round(base.armor * scale) * w.armor;
  const b = baseBonus(base, il, 'purple');
  if (b) for (const k of BONUS_STATS) s += (b[k] ?? 0) * w[k];
  // 属性词条期望（公式同 Loot.applyAffix，roll 取 0.5）
  const pool = data.affixes.filter(a => a.kind === 'char' && a.slots.includes(base.slot) && (!a.cls || !cls || a.cls === cls));
  let tw = 0, tv = 0;
  for (const a of pool) {
    if (a.kind !== 'char') continue;
    const k = a.stat as StatK, mid = (a.min + a.max) / 2, sc = P * (1 + (il - 1) * 0.05);
    const v = k === 'hp' || k === 'armor' || k === 'power' ? mid * sc * (1 + (il - 1) * 0.07) : mid * P * (1 + (il - 1) * 0.04);
    tw += a.weight; tv += a.weight * v * w[k];
  }
  if (tw > 0) s += 2 * tv / tw;
  REF_CACHE.set(key, s);
  return s;
}
/** 特效 / 套装部分的分（G1 + G2），不含属性 */
export function effectScore(it: ItemInstance, data: LootData, ctx?: GearScoreCtx): number {
  const L = gearLayers(it, data);
  const ref = purpleRef(it, data, ctx?.role, ctx?.classId);
  const qi = QUALITIES.indexOf(it.quality);
  let s = 0, big = false, dark = false;
  for (const e of L.effects) {
    if (e.kind === 'small' || (e.kind === 'set' && qi < 4)) s += ref * FX_COEF.small;
    else if (e.kind === 'engrave') s += ref * FX_COEF.engrave;
    else if (e.kind === 'dark') dark = true;
    else big = true;   // 传说大特效 / 橙色固定特效 / 橙色套装件自带特效
  }
  if (big) s += ref * FX_COEF.big;
  if (dark) s += ref * FX_COEF.dark;
  if (it.setId && ctx?.setBonuses) {
    const n = othersOf(ctx, it.setId);
    for (const b of ctx.setBonuses) if (b.setId === it.setId && n < b.pieces && n + 1 >= b.pieces) s += ref * SET_TIER_COEF(b.pieces);
  }
  return s;
}
export function gearScore(it: ItemInstance, data: LootData, ctx?: GearScoreCtx): number {
  if (it.durability !== undefined && it.durability <= 0) return 0;
  const L = gearLayers(it, data);
  let s = statScore(it, ctx?.role);
  s += L.skills.length * (8 + it.itemLevel * 0.4);
  s += effectScore(it, data, ctx);
  return Math.round(s);
}

/** G4：换上 it、换下 olds 时会失去的特效（文字相同的不算失去）；ctx.setOthers = 除被换下那件以外身上的同套件数，用来判断断套 */
export interface LostFx { text: string; kind: EffectKind | 'setTier'; from: string }
export function lostEffects(it: ItemInstance, olds: ItemInstance[], data: LootData, classId?: string, ctx?: GearScoreCtx): LostFx[] {
  const broken = (x: ItemInstance) => x.durability !== undefined && x.durability <= 0;
  const keep = new Set(broken(it) ? [] : gearLayers(it, data, classId).effects.map(e => e.text));
  const out: LostFx[] = [];
  for (const o of olds) {
    if (broken(o)) continue;
    for (const e of gearLayers(o, data, classId).effects) if (!keep.has(e.text)) out.push({ text: e.text, kind: e.kind, from: o.name });
    if (o.setId && ctx?.setBonuses && o.setId !== it.setId) {
      const n = othersOf(ctx, o.setId);
      for (const b of ctx.setBonuses) if (b.setId === o.setId && n < b.pieces && n + 1 >= b.pieces) out.push({ text: b.desc ?? `${b.pieces} 件套装效果`, kind: 'setTier', from: o.name });
    }
  }
  return out;
}
