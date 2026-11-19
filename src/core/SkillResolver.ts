import { CastContext, EffectDef, ModifierDef, ResolvedSkill, SkillDef, StatKey } from './types';
import { ComboTracker } from './ComboTracker';
import { CondFlags } from './CondFlags';
import { adaptRename, renameFit } from './ElementNames';

/**
 * 核心：基础技能 + 一堆修饰器 => 实际释放的变种技能
 * 规则：
 *  1. 按 priority 排序依次匹配（先改元素/形状/标签，后面的修饰器就能按新标签匹配，形成连锁变种）
 *  2. 数值统一结算：最终值 = (基础 + Σadd) × (1 + Σmul)
 */
/** v1.2.37 冷却缩减上限：技能 1~4 固定 40%；大招未觉醒 40%，每件「暮时·终局」觉醒 +10%，最多 80% */
export const CDR_CAP = 0.4, ULT_CDR_CAP_BASE = 0.4, ULT_CDR_CAP_MAX = 0.8;

/** v1.2.73 范围加成封顶：Σ范围 mul 上限、超出部分换伤害的比例与上限 */
export const RADIUS_CAP = 0.5, RADIUS_OVER_DMG = 0.3, RADIUS_OVER_DMG_MAX = 0.15;

export class SkillResolver {
  private icdUntil = new Map<string, number>();
  /** v1.2.37：按槽位给冷却缩减上限（0~1）；普攻返回 null（普攻间隔由急速管，不吃通用冷却词条） */
  cdCap: (slot: string) => number | null = slot => slot === 'basic' ? null : slot === 'ultimate' ? ULT_CDR_CAP_BASE : CDR_CAP;
  constructor(private combo: ComboTracker) {}

  resolve(def: SkillDef, mods: ModifierDef[], ctx: CastContext, commit = false): ResolvedSkill {
    const r: ResolvedSkill = {
      baseId: def.id,
      displayName: def.name,
      slot: def.slot,
      element: def.element,
      shape: def.shape,
      tags: [...def.tags],
      stats: { ...def.stats },
      effects: def.effects.map(e => ({ ...e })),
      appliedModifiers: [],
    };
    const adds: Partial<Record<StatKey, number>> = {};
    const muls: Partial<Record<StatKey, number>> = {};
    const mores: Partial<Record<StatKey, number>> = {};
    let prefix = '', suffix = '', baseName = def.name;
    const baseFx = new Set<EffectDef>(r.effects);   // v1.2.66：只有技能自带效果跟主元素转换
    let converted = false;
    const adapted: { element: string }[] = [];   // v1.2.66 元素转译

    const sorted = [...mods].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const m of sorted) {
      if (!this.matches(m, r)) continue;
      const k = this.checkConditions(m, ctx, commit);
      if (k === false) continue;
      r.appliedModifiers.push(m.id);
      for (const op of m.ops) {
        switch (op.op) {
          case 'add': adds[op.stat] = (adds[op.stat] ?? 0) + op.value * k; break;
          case 'mul':
            // v1.2.37：普攻只吃点名普攻的冷却修饰器（急速 = 攻速），通用「技能冷却 -x%」不再缩短普攻间隔
            if (op.stat === 'cooldown' && r.slot === 'basic' && !(m.match.slots?.includes('basic') || m.match.skillIds?.includes(def.id))) break;
            muls[op.stat] = (muls[op.stat] ?? 0) + op.value * k; break;
          case 'more': mores[op.stat] = (mores[op.stat] ?? 1) * (1 + op.value * k); break;
          case 'setElement':
            // v1.2.66 多重元素：第一次转换改主元素（只转技能自带效果）；再有别的元素转换时不覆盖，改成一段独立元素伤害
            if (converted && op.value !== r.element) { addElem(r, op.value, 0.35); break; }
            converted = true;
            r.element = op.value;
            r.effects.forEach(e => { if (baseFx.has(e) && 'element' in e) e.element = op.value; });
            break;
          case 'addElement': addElem(r, op.value, op.damagePercent * k); break;
          case 'setShape': r.shape = op.value; break;
          case 'addTag': if (!r.tags.includes(op.value)) r.tags.push(op.value); break;
          case 'addEffect': { const ef = k === 1 ? { ...op.effect } : scaleEffect(op.effect, k); if (m.match.adaptFrom && 'element' in ef) adapted.push(ef as any); r.effects.push(ef); break; }
          case 'rename': { const o = renameFit(m.match.adaptFrom ? adaptRename(op, m.match.adaptFrom, r) : op, m, r); prefix = (o.prefix ?? '') + prefix; suffix += o.suffix ?? ''; if (o.name) baseName = o.name; break; }
        }
      }
    }

    // v1.2.37 冷却缩减：Σ冷却减少按槽位封顶（冷却增加不封）
    const cap = this.cdCap(r.slot);
    if (cap !== null) {
      const raw = -(muls.cooldown ?? 0);
      r.cdr = { raw: Math.max(0, raw), cap };
      if (raw > cap) muls.cooldown = -cap;
    }
    // v1.2.73 范围加成封顶（Rhett 11-02）：Σ范围 mul 最多 +50%；超出部分每 10% 换伤害 +3%，换算最多 +15%
    const rRaw = muls.radius ?? 0;
    if (rRaw > RADIUS_CAP) {
      const bonus = Math.min(RADIUS_OVER_DMG_MAX, (rRaw - RADIUS_CAP) * RADIUS_OVER_DMG);
      muls.radius = RADIUS_CAP; mores.damage = (mores.damage ?? 1) * (1 + bonus);
      r.radCap = { raw: rRaw, cap: RADIUS_CAP, dmg: bonus };
    }
    (Object.keys(r.stats) as StatKey[]).forEach(k => {
      const v = (r.stats[k] + (adds[k] ?? 0)) * (1 + (muls[k] ?? 0)) * (mores[k] ?? 1);
      r.stats[k] = Math.max(0, k === 'projectileCount' ? Math.round(v) : v);
    });
    if (def.stats.radius > 0 && r.stats.radius > 0) r.radScale = r.stats.radius / def.stats.radius;   // v1.2.73 G5：地面区域跟着范围加成变大
    r.stats.cooldown = Math.max(r.stats.cooldown, def.slot === 'basic' ? 0 : def.tags.includes('fastcast') ? 0.2 : 0.5); // 冷却下限（v0.7.1 fastcast：炼金的三色药瓶，0.45 秒内要能连按同色调配）
    for (const ef of adapted) ef.element = r.element;
    r.elements = [r.element, ...r.effects.flatMap(e => e.type === 'elemHit' && e.element !== r.element ? [e.element] : [])].filter((x, i, a) => a.indexOf(x) === i);   // v1.2.66：天赋附加的持续伤害 / 地面跟当前技能元素走
    r.displayName = prefix + baseName + suffix;
    return r;
  }

  private matches(m: ModifierDef, r: ResolvedSkill): boolean {
    const q = m.match;
    if (q.skillIds && !q.skillIds.includes(r.baseId)) return false;
    if (q.slots && !q.slots.includes(r.slot)) return false;
    if (q.elements && !q.elements.includes(r.element) && !q.elementSlots?.includes(r.slot)) return false;
    if (q.tagsAll && !q.tagsAll.every(t => r.tags.includes(t))) return false;
    if (q.tagsAny && !q.tagsAny.some(t => r.tags.includes(t))) return false;
    return true;
  }

  /** commit=true 表示真正释放，会消耗组合条件；false 用于 UI 预览。返回 false = 不生效，数字 = 数值倍率（stacks.scale） */
  private checkConditions(m: ModifierDef, ctx: CastContext, commit: boolean): number | false {
    let k = 1;
    const later: (() => void)[] = [];
    for (const c of m.conditions ?? []) {
      switch (c.type) {
        case 'hpBelow': if (ctx.casterHpPercent >= c.percent) return false; break;
        case 'targetHasEffect': if (!ctx.targetEffects.includes(c.effect)) return false; break;
        case 'targetHpAbove': if ((ctx.targetHpPercent ?? 0) <= c.percent) return false; break;
        case 'flag': {
          if (CondFlags.get(c.key, ctx.now) <= 0) return false;
          if (c.consume) later.push(() => CondFlags.consume(c.key));
          break;
        }
        case 'stacks': {
          const n = CondFlags.get(c.key, ctx.now);
          if (n < (c.min ?? 1) || n <= 0) return false;
          if (c.scale) k *= n;
          if (c.consume) later.push(() => CondFlags.consume(c.key));
          break;
        }
        case 'icd': {
          if (ctx.now < (this.icdUntil.get(m.id) ?? -Infinity)) return false;
          later.push(() => this.icdUntil.set(m.id, ctx.now + c.sec));
          break;
        }
        case 'recentCast': {
          const rec = this.combo.find(ctx.now, c.within, m.id, c.skillId, c.tag);
          if (!rec) return false;
          if (c.consume !== false) later.push(() => this.combo.consume(rec, m.id));
          break;
        }
      }
    }
    if (commit) later.forEach(f => f());
    return k;
  }
  /** 测试 / 换区域：清空内置冷却 */
  resetIcd() { this.icdUntil.clear(); }
}

/** stacks.scale：效果里的数值 × 层数（吸血比例、护盾、伤害比例） */
function scaleEffect(e: EffectDef, k: number): EffectDef {
  switch (e.type) {
    case 'heal': return { ...e, percentOfDamage: e.percentOfDamage * k };
    case 'shield': return { ...e, percentMaxHp: e.percentMaxHp * k };
    case 'explode': return { ...e, damagePercent: e.damagePercent * k };
    case 'elemHit': return { ...e, damagePercent: e.damagePercent * k };
    default: return { ...e };
  }
}

/** v1.2.66 附加一段独立元素伤害：同元素多次附加合并比例，主元素相同时也作为独立一段（独立暴击、独立特效） */
function addElem(r: ResolvedSkill, el: ResolvedSkill['element'], pct: number) {
  const ex = r.effects.find(e => e.type === 'elemHit' && e.element === el) as { damagePercent: number } | undefined;
  if (ex) ex.damagePercent += pct; else r.effects.push({ type: 'elemHit', element: el, damagePercent: pct });
}
