// ========== v0.9.6b 太古装备 ==========
// 规则（方案 docs/设计/地图掉落HUD_3D.md 4.4）：
//   - 出处：长副本炼狱的套装 / 橙装 / 暗金每件 4%；深渊 20 层 3 件顶级橙装每件 6%；20 层结算自选那件 10%（领取时判定）
//   - 所有词条取该装等区间峰值（affixLog.r = 1）
//   - 橙装 / 暗金特效数值 ×2；几率类封顶 60%（重置冷却类 50%）；冷却缩减封顶 -60%；「每第 N 次」→ N-1（最少 2）；
//     数量 +100% 向下取整；持续时间 ×1.5；套装没有特效，只取峰值
//   - 名字红色 #ff2a2a + 结尾「（太古）」；分解双倍材料 + 1 个「太古余烬」
// 代码型钩子（web/lgfx.ts / chrono.ts / alchemy.ts）通过 classgear 的 ax / ap / ad / an / aev 读倍率
import type { EffectDef, ModifierDef, ModOp } from './types';

export const ANCIENT_COLOR = '#ff2a2a';
export const ANCIENT_SUFFIX = '（太古）';
export const ANCIENT_CUR = 'mat_ember';   // 太古余烬（本版只计数）
export const ANC = { mul: 2, dur: 1.5, chanceCap: 0.6, resetCap: 0.5, cdCap: -0.6 } as const;

export const ancChance = (p: number, reset = false) => Math.min(reset ? ANC.resetCap : ANC.chanceCap, Math.max(p, p * ANC.mul));
export const ancEvery = (n: number) => Math.max(2, n - 1);
export const ancCount = (n: number) => Math.floor(n * ANC.mul);
export const ancName = (name: string) => name.endsWith(ANCIENT_SUFFIX) ? name : name + ANCIENT_SUFFIX;
const r2 = (v: number) => Math.round(v * 1000) / 1000;

function ancEffect(e: EffectDef): EffectDef {
  const d = (x: number) => r2(x * ANC.dur), m = (x: number) => r2(x * ANC.mul);
  switch (e.type) {
    case 'dot': return { ...e, dps: m(e.dps), duration: d(e.duration) };
    case 'slow': return { ...e, percent: Math.min(0.8, m(e.percent)), duration: d(e.duration) };
    case 'stun': return { ...e, duration: d(e.duration) };
    case 'groundZone': return { ...e, dps: m(e.dps), duration: d(e.duration) };
    case 'dotStack': return { ...e, dpsPerStack: m(e.dpsPerStack), duration: d(e.duration) };
    case 'knockback': return { ...e, distance: m(e.distance) };
    case 'heal': return { ...e, percentOfDamage: m(e.percentOfDamage), ...(e.overflowShield ? { overflowShield: m(e.overflowShield) } : {}) };
    case 'explode': return { ...e, damagePercent: m(e.damagePercent) };
    case 'elemHit': return { ...e, damagePercent: m(e.damagePercent) };
    case 'resetCooldown': return { ...e, chance: ancChance(e.chance, true), ...(e.every ? { every: ancEvery(e.every) } : {}) };
    case 'reflect': return { ...e, reduce: Math.min(ANC.chanceCap, m(e.reduce)), percent: m(e.percent), duration: d(e.duration) };
    case 'chain': return { ...e, jumps: ancCount(e.jumps), damagePercent: Math.min(1, m(e.damagePercent)) };
    case 'shield': return { ...e, percentMaxHp: m(e.percentMaxHp), duration: d(e.duration) };
    case 'stackStun': return { ...e, stacks: ancEvery(e.stacks), duration: d(e.duration) };
    case 'critEvery': return { ...e, n: ancEvery(e.n) };
    default: return e;
  }
}

function ancOp(o: ModOp): ModOp {
  if (o.op === 'addEffect') return { ...o, effect: ancEffect(o.effect) };
  if (o.op !== 'add' && o.op !== 'mul' && o.op !== 'more') return o;
  if (o.stat === 'projectileCount' && o.op === 'add') return { ...o, value: ancCount(o.value) };
  if (o.stat === 'cooldown' && o.value < 0) return { ...o, value: o.op === 'add' ? r2(o.value * ANC.mul) : Math.max(ANC.cdCap, r2(o.value * ANC.mul)) };
  if (o.stat === 'castTime' && o.value < 0) return { ...o, value: Math.max(ANC.cdCap, r2(o.value * ANC.mul)) };
  if (o.value < 0) return o;   // 代价类（负面）不翻倍
  return { ...o, value: r2(o.value * ANC.mul) };
}

/** 特效描述文字按同样规则改数字：几率 / 概率 % 封顶 60（重置 50），冷却 -% 封顶 60，「第 N 次 / N 层」→ N-1，「N 秒」×1.5，其他数字 ×2（米 / 级 / 层数上限不动） */
export function ancDesc(desc: string): string {
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  return desc.replace(/翻倍/g, '变为 3 倍').replace(/(第\s*)(\d+)(\s*次)/g, (_s, a, n, b) => `${a}${ancEvery(+n)}${b}`)
    .replace(/(\d+(?:\.\d+)?)(\s*)(%|秒|米|级|个|次|层|点|跳|倍)?/g, (s, n: string, sp: string, u: string | undefined, off: number, all: string) => {
      const v = +n, pre = all.slice(Math.max(0, off - 8), off), post = all.slice(off + s.length, off + s.length + 3);
      if (/(第|技能|槽位?|大招)\s*$/.test(pre)) return s;   // 已处理 / 槽位编号
      if (/(低于|高于|超过|不足|少于|生命|距离|半径|范围)\s*$/.test(pre)) return s;   // 条件阈值不动
      if (/内置冷却\s*$/.test(pre) || /^\s*个?魂/.test(post)) return s;   // v1.2.35 内置冷却 / 魂数不动
      if (/每\s*$/.test(pre)) return u === '次' ? fmt(ancEvery(v)) + sp + u : s;   // 「每 N 次」→ N-1；「每 N 点」门槛不动
      if (/[A-Za-z]$/.test(pre)) return s;
      if (u === '米' || u === '级' || u === '倍') return s;
      if (/[-－]\s*$/.test(pre) && !/(冷却|读条)/.test(pre)) return s;   // 代价（每发 -35%）不翻倍
      if (u === '%') {
        if (/^\s*(几率|概率|机率)/.test(post) || /(几率|概率|机率)\s*$/.test(pre)) return fmt(Math.min(/重置/.test(all.slice(off, off + 14)) ? 50 : 60, v * 2)) + sp + u;
        if (/冷却/.test(pre) && /[-－]\s*$/.test(pre)) return fmt(Math.min(60, v * 2)) + sp + u;
        return fmt(v * 2) + sp + u;
      }
      if (u === '秒') return fmt(v * ANC.dur) + sp + u;
      if (u === '层' && /(叠|满|达到)/.test(pre)) return fmt(ancEvery(v)) + sp + u;
      return fmt(v * 2) + sp + (u ?? '');
    });
}

/** 太古版特效修饰器（橙装 / 暗金；套装不调用） */
export function ancientMod(m: ModifierDef): ModifierDef {
  const conditions = m.conditions?.map(c => c.type === 'stacks' && c.consume && c.min ? { ...c, min: ancEvery(c.min) } : c);   // v1.2.35「满 N 层」→ N-1
  return { ...m, desc: ancDesc(m.desc), ops: m.ops.map(ancOp), ...(conditions ? { conditions } : {}) };
}

/** 掉落时判定：rng() < p 就把它变成太古（返回是否变了） */
export interface AncientRoller { ancientify(it: { ancient?: boolean }): boolean }
export function rollAncient<T extends { ancient?: boolean; quality: string; setId?: string }>(gen: AncientRoller, it: T, p: number, rng: () => number = Math.random): boolean {
  if (it.ancient || !(it.setId || it.quality === 'orange' || it.quality === 'dark')) return false;
  return rng() < p ? gen.ancientify(it) : false;
}
