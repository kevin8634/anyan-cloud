// ========== 战斗与技能效果（引擎无关，可在命令行测试） ==========
import { Element, EffectDef, ResolvedSkill, SlotId } from './types';

export type Faction = 'player' | 'enemy';
export interface Pos { x: number; z: number; }

/** 战斗单位接口：Cocos 里的玩家、敌人组件实现它 */
export interface CombatUnit {
  readonly uid: string;
  readonly faction: Faction;
  readonly status: StatusSet;
  hp: number;
  maxHp: number;
  readonly alive: boolean;
  getPos(): Pos;
  /** 受到伤害（已计算完毕的最终值）；表现层可在这里飘字、播受击动画 */
  /** 暴击率 0~1（可选，不填不暴击）；暴击伤害 ×critMult（默认 1.5） */
  critChance?: number;
  critMult?: number;
  /** tick：持续伤害/地面区域的每跳（表现层飘小字） */
  onDamaged?(amount: number, element: Element, source: CombatUnit | null, crit?: boolean, tick?: boolean): void;
  /** 无敌（翻滚无敌帧）时受到攻击：飘「免疫」 */
  onImmune?(source: CombatUnit | null): void;
  /** 被减伤增益（盾墙等）吸收掉的伤害：飘「吸收」 */
  onAbsorbed?(amount: number): void;
  onHealed?(amount: number): void;
  onDeath?(): void;
  /** v1.2.57b 吃到控制时（表现层飘「冻结 / 眩晕 / 定身」状态字）；element 为技能元素 */
  onCC?(kind: 'stun', element: Element, source: CombatUnit | null): void;
  /** 被打断/眩晕时调用；正在读条则打断并返回 true */
  onInterrupt?(): boolean;
  /** 免疫控制（Boss）：不吃眩晕/减速，但仍可被打断读条 */
  readonly ccImmune?: boolean;
  /** 护甲：减伤 = 护甲 / (护甲 + 400)，200 护甲约减伤 33% */
  armor?: number;
  /** v0.9.1l 持续伤害（DoT / 地面区域）倍率：玩家 = 1 + 强度 × 0.4%（攻击强度或法术强度，按职业）；怪物不填 = 固定数值 */
  dotPower?: number;
  /** v0.9.1l 急速（0~0.4）：自己施加的持续伤害跳间隔 = 1 秒 ÷ (1 + 急速)，持续时间不变 */
  haste?: number;
  /** v1.2.37 灼痕觉醒：自己施加的持续伤害暴击时额外结算一跳 */
  dotCritEcho?: boolean;
  /** 阶段六：受伤前修正（长副本的盾卫正面减伤、图腾光环、首领护盾/破甲）；返回修正后的伤害 */
  preDamage?(amount: number, source: CombatUnit | null, element: Element): number;
}

// ---------- 状态（buff/debuff） ----------
interface ActiveStatus {
  key: string;               // 同 key 的状态刷新而不是叠加
  kind: 'dot' | 'slow' | 'stun' | 'reflect' | 'invuln' | 'shield' | 'stack' | 'fear' | 'vuln';   // shield：护盾（pool 剩余吸收量）；stack：叠层计数（pool = 层数）   // invuln：无敌（翻滚无敌帧），免疫一切伤害和负面状态
  remaining: number;
  element?: Element;
  dps?: number;
  percent?: number;
  reflect?: number;          // reflect 状态：反弹比例（percent 为减伤比例）
  pool?: number;
  source: CombatUnit | null;
  tickTimer: number;
  ticksLeft: number;         // dot 剩余跳数，避免浮点误差少跳一次
  interval?: number;         // v0.9.1l dot 跳间隔（默认 1 秒；急速缩短）
  crit?: number;             // v0.9.1l 施加时快照的暴击率 / 暴击倍率（dot 每跳可暴击）
  critMult?: number;
  last?: number;             // v1.2.35 部分跳：最后一跳的比例（0–1]
  base?: number;             // v1.2.35 动态 dot：每跳 = base × 施法者当前 dotPower（不填 = 施加时快照的 dps）
}

/** v1.2.35 持续伤害路线 V1 常数（docs/设计/持续伤害路线_需求.md） */
// 侵蚀：模拟后从「每跳 +1 层、2% × 50」调成「每秒最多 +1 层、1% × 40」——按跳叠层会让急速 / 多 dot 叠满太快（约 15 秒），
// 重 dot 专精 3 分钟首领战总伤会高出 40–50%；按秒叠：40 秒叠满，3 分钟首领战持续专精约 +10–15%，30 秒小战斗基本持平
export const DOT_RULES = { pandemic: 0.3, erosionPer: 0.01, erosionMax: 40, erosionDur: 6, erosionGap: 1, critBonusK: 0.5 };

/** v1.2.77 恐惧：普通单位逃跑 duration 秒并被打断；免控单位（首领）改为受伤 +bossVuln，持续 max(4, duration) 秒 */
export function applyFear(t: CombatUnit, src: CombatUnit | null, duration: number, bossVuln = 0.08) {
  if (t.ccImmune) { if (bossVuln > 0) t.status.add({ key: 'vuln:fear', kind: 'vuln', remaining: Math.max(4, duration), percent: bossVuln, source: src }); return false; }
  t.status.add({ key: 'fear', kind: 'fear', remaining: duration, source: src }); t.onInterrupt?.(); return true;
}

export class StatusSet {
  private list: ActiveStatus[] = [];

  add(s: Omit<ActiveStatus, 'tickTimer' | 'ticksLeft'>) {
    // 无敌期间不吃负面状态（中毒/减速/眩晕）
    if (this.isInvulnerable && (s.kind === 'dot' || s.kind === 'slow' || s.kind === 'stun' || s.kind === 'fear' || s.kind === 'vuln')) return;
    const iv = s.interval && s.interval > 0 ? s.interval : 1;
    const old = this.list.find(x => x.key === s.key);
    if (s.kind === 'dot') {
      // v1.2.35 传染式刷新：剩余时间最多保留新持续的 30%；部分跳：跳数 = ceil(持续 / 间隔)，最后一跳按比例
      const dur = s.remaining + (old && old.kind === 'dot' ? Math.min(Math.max(0, old.remaining), s.remaining * DOT_RULES.pandemic) : 0);
      const exact = dur / iv, ticksLeft = Math.max(1, Math.ceil(exact - 1e-6)), last = Math.min(1, Math.max(0.05, exact - (ticksLeft - 1)));
      if (old) { Object.assign(old, s, { remaining: dur, ticksLeft, interval: iv, last }); return; }   // 保留原跳的相位
      this.list.push({ ...s, remaining: dur, interval: iv, tickTimer: iv, ticksLeft, last });
      return;
    }
    const ticksLeft = Math.max(1, Math.round(s.remaining / iv));
    if (old) { Object.assign(old, s, { ticksLeft, interval: iv }); return; }  // 刷新持续时间
    this.list.push({ ...s, interval: iv, tickTimer: iv, ticksLeft });
  }
  /** v0.9.1l：某目标身上的持续伤害（套装 / 橙装结算剩余伤害用） */
  dots(): readonly { key: string; dps: number; ticksLeft: number; element: Element; source: CombatUnit | null }[] {
    return this.list.filter(s => s.kind === 'dot').map(s => ({ key: s.key, dps: s.dps ?? 0, ticksLeft: s.ticksLeft, element: s.element ?? 'physical', source: s.source }));
  }
  /** v0.9.1m：刷新某个持续伤害的剩余跳数（套装「刷新流血 / 切割」用） */
  refreshDot(key: string, ticks: number) { const s = this.list.find(x => x.key === key && x.kind === 'dot'); if (s) s.ticksLeft = Math.max(s.ticksLeft, ticks);
  }
  /** v0.9.1r：持续伤害多跳 n 次（橙装「多烧 1 跳 / 延长燃烧」） */
  extendDot(key: string, ticks: number) { const s = this.list.find(x => x.key === key && x.kind === 'dot'); if (s) { s.ticksLeft += ticks; s.remaining += ticks * (s.interval ?? 1); } }
  get isStunned() { return this.list.some(s => s.kind === 'stun'); }
  /** v1.2.77 恐惧（方案 B）：返回恐惧来源（转身逃离它），没有恐惧时 undefined；来源为空时返回 null */
  get fearFrom(): CombatUnit | null | undefined { const f = this.list.find(s => s.kind === 'fear'); return f ? f.source : undefined; }
  /** v1.2.77 易伤（首领免疫恐惧时改为受伤加成）：取最高一个 */
  get vuln() { let v = 0; for (const s of this.list) if (s.kind === 'vuln') v = Math.max(v, s.percent ?? 0); return v; }
  /** 无敌帧（翻滚）：伤害、红圈、负面状态全部无效 */
  get isInvulnerable() { return this.list.some(s => s.kind === 'invuln'); }
  /** 移动速度倍率：多个减速取最强的那个（魔兽规则，避免叠到0） */
  get speedMultiplier() {
    const slows = this.list.filter(s => s.kind === 'slow').map(s => s.percent ?? 0);
    return this.isStunned ? 0 : 1 - Math.min(0.8, Math.max(0, ...slows));
  }
  /** 盾墙类增益：取减伤最高的一个 */
  get reflectBuff(): { reduce: number; reflect: number } | null {
    const r = this.list.filter(s => s.kind === 'reflect').sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
    return r ? { reduce: r.percent ?? 0, reflect: r.reflect ?? 0 } : null;
  }
  /** v0.6.9 护盾剩余吸收量（多个护盾相加） */
  get shield() { return this.list.filter(s => s.kind === 'shield').reduce((a, s) => a + (s.pool ?? 0), 0); }
  /** 护盾吸收伤害，返回吸收掉的量 */
  absorb(amount: number) {
    let left = amount;
    for (const s of this.list) if (s.kind === 'shield' && left > 0) { const k = Math.min(left, s.pool ?? 0); s.pool = (s.pool ?? 0) - k; left -= k; }
    this.list = this.list.filter(s => s.kind !== 'shield' || (s.pool ?? 0) > 0.5);
    return amount - left;
  }
  /** 加护盾：同 key 的护盾叠加吸收量但不超过 cap */
  addShield(key: string, amount: number, duration: number, cap: number, source: CombatUnit | null) {
    const old = this.list.find(x => x.key === key);
    if (old) { old.pool = Math.min(cap, (old.pool ?? 0) + amount); old.remaining = duration; return; }
    this.list.push({ key, kind: 'shield', remaining: duration, pool: Math.min(cap, amount), source, tickTimer: 1, ticksLeft: 0 });
  }
  /** 叠层：返回叠到的层数（达到 max 时清零并返回 max） */
  addStack(key: string, max: number, duration: number, source: CombatUnit | null) {
    let s = this.list.find(x => x.key === key);
    if (!s) { s = { key, kind: 'stack', remaining: duration, pool: 0, source, tickTimer: 1, ticksLeft: 0 }; this.list.push(s); }
    s.pool = (s.pool ?? 0) + 1; s.remaining = duration;
    const n = s.pool;
    if (n >= max) this.remove(key);
    return n;
  }
  /** v1.2.35 叠层但满了不清零（侵蚀）：返回叠后的层数 */
  bumpStack(key: string, max: number, duration: number, source: CombatUnit | null, gap = 0) {
    let s = this.list.find(x => x.key === key);
    if (s && duration - s.remaining < gap - 1e-3) return s.pool ?? 0;   // 距上次叠层不到 gap 秒：不叠也不刷新
    if (!s) { s = { key, kind: 'stack', remaining: duration, pool: 0, source, tickTimer: 1, ticksLeft: 0 }; this.list.push(s); }
    s.pool = Math.min(max, (s.pool ?? 0) + 1); s.remaining = duration; return s.pool;
  }
  stacks(key: string) { return this.list.find(x => x.key === key)?.pool ?? 0; }
  has(kind: ActiveStatus['kind']) { return this.list.some(s => s.kind === kind); }
  /** v1.2.13 HUD 用：当前所有状态的只读快照（BUFF / DEBUFF 图标行） */
  view(): readonly { key: string; kind: ActiveStatus['kind']; remaining: number; element?: Element; percent?: number; pool?: number; dps?: number; source: CombatUnit | null }[] { return this.list; }
  /** 给技能条件 targetHasEffect 用 */
  kinds(): EffectDef['type'][] { return [...new Set(this.list.filter(s => s.kind !== 'invuln' && s.kind !== 'stack').map(s => s.kind as EffectDef['type']))]; }
  clear() { this.list = []; }
  remove(key: string) { this.list = this.list.filter(s => s.key !== key); }

  /** 每帧调用；返回本帧需要结算的 dot 伤害 */
  tick(dt: number): { amount: number; element: Element; source: CombatUnit | null; crit?: number; critMult?: number }[] {
    const out: { amount: number; element: Element; source: CombatUnit | null; crit?: number; critMult?: number }[] = [];
    for (const s of this.list) {
      s.remaining -= dt;
      if (s.kind === 'dot') {
        s.tickTimer -= dt;
        while (s.tickTimer <= 1e-6 && s.ticksLeft > 0) {   // 每秒跳一次
          const per = s.base !== undefined && s.source?.dotPower ? s.base * s.source.dotPower : s.dps ?? 0;   // 动态：读施法者当前强度
          out.push({ amount: per * (s.ticksLeft === 1 ? s.last ?? 1 : 1), element: s.element ?? 'physical', source: s.source, crit: s.crit, critMult: s.critMult });
          s.tickTimer += s.interval ?? 1;
          s.ticksLeft--;
        }
      }
    }
    this.list = this.list.filter(s => s.kind === 'dot' ? s.ticksLeft > 0 : s.remaining > 1e-6);
    return out;
  }
}

// ---------- 地面区域（燃烧地面、毒池等） ----------
interface GroundZone { pos: Pos; radius: number; dps: number; element: Element; ticksLeft: number; tickTimer: number; owner: CombatUnit; interval?: number;
  /** v1.2.73 冰霜区域：叠减速 / 第 N 跳冻结（见 EffectDef.groundZone） */ key?: string; slowPerTick?: number; slowMax?: number; freezeTick?: number; freezeDur?: number; hitsBy?: Map<CombatUnit, number>; }

/** 战斗世界：由引擎层提供查询能力 */
export interface CombatWorld {
  units(): Iterable<CombatUnit>;
  resetCooldown(owner: CombatUnit, slot: SlotId | 'longest', effect?: Extract<EffectDef, { type: 'resetCooldown' }>): void;
  /** v1.2.37：冷却缩短 sec 秒（余烬回涌）；不实现 = 忽略 */
  reduceCooldown?(owner: CombatUnit, slot: SlotId, sec: number): void;
  /** 表现层钩子（可选）：特效、飘字 */
  onZoneSpawn?(pos: Pos, radius: number, element: Element, duration: number): void;
  onExplode?(pos: Pos, radius: number, element: Element): void;
  /** 连锁弹跳（奥术禁锢·连锁）：从 a 跳到 b */
  onChain?(a: Pos, b: Pos, element: Element): void;
  /** v1.2.66 附加元素命中特效 */
  onElemHit?(pos: Pos, element: Element): void;
  /** 自身增益开始（盾墙）：飘字/特效 */
  onBuff?(unit: CombatUnit, name: string, duration: number): void;
  /** 反弹伤害（盾墙） */
  onReflect?(from: CombatUnit, to: CombatUnit, amount: number): void;
  /** v0.6.9：获得护盾（总量） / 叠层爆发（冻结） */
  onShield?(unit: CombatUnit, total: number): void;
  onStackBurst?(unit: CombatUnit, name: string, element: Element): void;
}

const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.z - b.z);

export class EffectSystem {
  private zones: GroundZone[] = [];
  private everyCount = new Map<string, number>();
  /** v1.2.37 余震：延迟结算的爆炸 */
  private shocks: { t: number; pos: Pos; radius: number; amount: number; element: Element; owner: CombatUnit }[] = [];
  /** v0.7.0：每次伤害结算后的钩子（时砂行者：时痕储存、暴击返还时砂、时停记账） */
  onDealt?: (target: CombatUnit, dealt: number, element: Element, source: CombatUnit | null, crit: boolean, tick: boolean) => void;
  /** v0.9.1r：伤害结算前的倍率钩子（橙装易伤 / 减伤），返回新的伤害 */
  preDeal?: (target: CombatUnit, amount: number, element: Element, source: CombatUnit | null, crit: boolean, tick: boolean) => number;
  constructor(private world: CombatWorld, private rng: () => number = Math.random) {}

  /** 造成伤害：所有伤害都走这里，方便以后加暴击、护甲、元素抗性 */
  dealDamage(target: CombatUnit, amount: number, element: Element, source: CombatUnit | null, crit = false, reflected = false, tick = false) {
    if (!target.alive || amount <= 0) return 0;
    if (target.status.isInvulnerable) { target.onImmune?.(source); return 0; }   // 翻滚无敌帧
    if (this.preDeal && !reflected) { amount = this.preDeal(target, amount, element, source, crit, tick); if (amount <= 0) return 0; }
    if (target.preDamage) { amount = target.preDamage(amount, source, element); if (amount <= 0) return 0; }
    { const v = target.status.vuln; if (v > 0) amount *= 1 + v; }   // v1.2.77 易伤
    const armor = target.armor ?? 0;
    if (armor > 0 && element === 'physical') amount *= 400 / (400 + armor);   // 护甲只减物理伤害
    const rf = target.status.reflectBuff;
    let back = 0;
    if (rf) {                                                                  // 盾墙：减伤 + 反弹（按减伤前的伤害）
      back = amount * rf.reflect;
      const absorbed = Math.round(amount * rf.reduce);
      amount *= 1 - rf.reduce;
      if (absorbed > 0) target.onAbsorbed?.(absorbed);
    }
    if (target.status.shield > 0) {                                            // v0.6.9 护盾：先扣护盾
      const ab = target.status.absorb(amount);
      amount -= ab;
      if (ab >= 1) target.onAbsorbed?.(Math.round(ab));
      if (amount <= 0) return 0;
    }
    const dealt = Math.min(target.hp, Math.round(amount));
    target.hp -= dealt;
    target.onDamaged?.(dealt, element, source, crit, tick);
    this.onDealt?.(target, dealt, element, source, crit, tick);
    if (target.hp <= 0) { target.status.clear(); target.onDeath?.(); }
    if (back >= 1 && source && source !== target && source.alive && !reflected) {
      const v = this.dealDamage(source, back, element, target, false, true);   // 反弹伤害不再被反弹
      if (v) this.world.onReflect?.(target, source, v);
    }
    return dealt;
  }

  heal(target: CombatUnit, amount: number, overflowShield = 0) {
    if (!target.alive) return;
    const v = Math.min(target.maxHp - target.hp, Math.round(amount));
    if (v > 0) { target.hp += v; target.onHealed?.(v); }
    const over = Math.round(amount) - Math.max(0, v);
    if (overflowShield > 0 && over > 0) { target.status.addShield('shield:overflow', over, 8, target.maxHp * overflowShield, target); this.world.onShield?.(target, target.status.shield); }
  }
  /** 每个施法者每个技能的施放次数（critEvery 用） */
  private castCount = new Map<string, number>();

  /** 技能命中结算：伤害 + 全部附加效果 */
  /** center：v1.2.73 以目标点为圆心的技能（暴风雪 / 奥术风暴）传入落点，地面区域放在落点而不是第一个被命中的敌人身上（审计 G6）；没有敌人也会铺区域 */
  applySkill(skill: ResolvedSkill, caster: CombatUnit, hits: CombatUnit[], center?: Pos) {
    let total = 0;
    // 连锁：从最后一个目标弹向附近没被打过的敌人，每跳伤害按比例衰减；被弹到的目标同样吃后面的效果（眩晕、打断…）
    const mul = new Map<CombatUnit, number>(hits.map(h => [h, 1]));
    const chain = skill.effects.find(e => e.type === 'chain');
    if (chain && chain.type === 'chain' && hits.length) {
      hits = [...hits];
      let from = hits[hits.length - 1], k = 1;
      for (let j = 0; j < chain.jumps; j++) {
        let best: CombatUnit | null = null, bd = chain.radius;
        for (const u of this.world.units()) {
          if (!u.alive || u.faction === caster.faction || mul.has(u)) continue;
          const d = dist(u.getPos(), from.getPos());
          if (d <= bd) { bd = d; best = u; }
        }
        if (!best) break;
        k *= chain.damagePercent;
        this.world.onChain?.(from.getPos(), best.getPos(), skill.element);
        mul.set(best, k); hits.push(best); from = best;
      }
    }
    // v0.6.9 每第 n 次施放必暴
    const ce = skill.effects.find(e => e.type === 'critEvery');
    let forceCrit = false;
    if (ce && ce.type === 'critEvery' && hits.length) {
      const k = `${caster.uid}:${skill.baseId}`, n = (this.castCount.get(k) ?? 0) + 1;
      this.castCount.set(k, n % ce.n);
      forceCrit = n >= ce.n;
    }
    for (const t of hits) {
      const crit = forceCrit || (!!caster.critChance && this.rng() < caster.critChance);   // 用注入的随机数：命令行模拟可复现
      total += this.dealDamage(t, skill.stats.damage * (mul.get(t) ?? 1) * (crit ? caster.critMult ?? 1.5 : 1), skill.element, caster, crit);
    }

    for (const e of skill.effects) {
      switch (e.type) {
        case 'elemHit':   // v1.2.66 多重元素：每个附加元素一段独立伤害（独立暴击、按该元素抗性结算、各自特效）
          for (const t of hits) {
            if (!t.alive) continue;
            const c = !!caster.critChance && this.rng() < caster.critChance;
            total += this.dealDamage(t, skill.stats.damage * e.damagePercent * (mul.get(t) ?? 1) * (c ? caster.critMult ?? 1.5 : 1), e.element, caster, c);
            this.world.onElemHit?.(t.getPos(), e.element);
          }
          break;
        case 'dot':
          hits.forEach(t => t.alive && t.status.add({ key: `dot:${skill.baseId}:${e.element}`, kind: 'dot', remaining: e.duration, dps: e.dps * (caster.dotPower ?? 1), base: caster.dotPower ? e.dps : undefined, element: e.element, source: caster,
            interval: dotInterval(caster), crit: caster.dotPower ? caster.critChance : 0, critMult: caster.critMult }));
          break;
        case 'slow':
          hits.forEach(t => t.alive && !t.ccImmune && t.status.add({ key: `slow:${skill.baseId}`, kind: 'slow', remaining: e.duration, percent: e.percent, source: caster }));
          break;
        case 'stun':
          hits.forEach(t => { if (!t.alive) return; if (!t.ccImmune) { t.status.add({ key: 'stun', kind: 'stun', remaining: e.duration, source: caster }); t.onCC?.('stun', skill.element, caster); } t.onInterrupt?.(); });
          break;
        case 'fear':   // v1.2.77 恐惧：小怪转身逃跑、不攻击；免控单位（首领）改为易伤
          hits.forEach(t => { if (!t.alive) return; applyFear(t, caster, e.duration, e.bossVuln ?? 0.08); });
          break;
        case 'interrupt':
          hits.forEach(t => t.alive && t.onInterrupt?.());
          break;
        case 'groundZone': {
          const zc = center ?? hits[0]?.getPos() ?? caster.getPos();
          const zr = e.radius * (skill.radScale ?? 1);   // v1.2.73 G5：区域半径吃范围加成（原来写死）
          const iv = dotInterval(caster);
          const chill = e.element === 'frost' && (e.slowPerTick || e.freezeTick) ? { key: skill.baseId, slowPerTick: e.slowPerTick, slowMax: e.slowMax, freezeTick: e.freezeTick, freezeDur: e.freezeDur, hitsBy: new Map<CombatUnit, number>() } : {};   // v1.2.73 只有冰霜区域带冻结（火雨等转元素后不冻）
          this.zones.push({ pos: { ...zc }, radius: zr, dps: e.dps * (caster.dotPower ?? 1), element: e.element, ticksLeft: Math.max(1, Math.round(e.duration / iv)), tickTimer: iv, interval: iv, owner: caster, ...chill });
          this.world.onZoneSpawn?.(zc, zr, e.element, e.duration);
          break;
        }
        case 'dotStack':   // v1.2.73 每次命中叠 1 层（最多 max），按层数刷新一个持续伤害
          for (const t of hits) {
            if (!t.alive) continue;
            const n = t.status.bumpStack(`dsk:${skill.baseId}`, e.max, e.duration, caster);
            t.status.add({ key: `dot:${skill.baseId}:${e.element}`, kind: 'dot', remaining: e.duration, dps: e.dpsPerStack * n * (caster.dotPower ?? 1), base: caster.dotPower ? e.dpsPerStack * n : undefined, element: e.element, source: caster,
              interval: dotInterval(caster), crit: caster.dotPower ? caster.critChance : 0, critMult: caster.critMult });
          }
          break;
        case 'explode':
          for (const h of hits) {
            const p = h.getPos();
            this.world.onExplode?.(p, e.radius, skill.element);
            for (const u of this.world.units())
              if (u !== h && u.faction !== caster.faction && dist(u.getPos(), p) <= e.radius)
                total += this.dealDamage(u, skill.stats.damage * e.damagePercent, skill.element, caster);
          }
          break;
        case 'heal':
          this.heal(caster, total * e.percentOfDamage, e.overflowShield ?? 0);
          break;
        case 'shield':
          caster.status.addShield(`shield:${skill.baseId}`, caster.maxHp * e.percentMaxHp, e.duration, caster.maxHp * e.percentMaxHp, caster);
          this.world.onShield?.(caster, caster.status.shield);
          break;
        case 'stackStun':
          for (const t of hits) {
            if (!t.alive) continue;
            const n = t.status.addStack(`stk:${skill.baseId}`, e.stacks, 6, caster);
            if (n >= e.stacks) {
              if (!t.ccImmune) t.status.add({ key: 'stun', kind: 'stun', remaining: e.duration, source: caster });
              t.onInterrupt?.();
              this.world.onStackBurst?.(t, e.name ?? '冻结', skill.element);
            }
          }
          break;
        case 'critEvery':
          break; // 已在上面处理
        case 'resetCooldown':
          if (!hits.length) break;
          if (e.every) {   // v1.2.35：每第 N 次命中必定重置（按效果分别计数）
            const key = `${e.slot}:${e.every}`;
            const n = (this.everyCount.get(key) ?? 0) + 1;
            if (n >= e.every) { this.everyCount.set(key, 0); this.world.resetCooldown(caster, e.slot, e); } else this.everyCount.set(key, n);
          } else if (this.rng() < e.chance) this.world.resetCooldown(caster, e.slot, e);
          break;
        case 'reflect':
          caster.status.add({ key: 'reflect', kind: 'reflect', remaining: e.duration, percent: e.reduce, reflect: e.percent, source: caster });
          this.world.onBuff?.(caster, skill.displayName, e.duration);
          break;
        case 'aftershock':
          if (hits[0]) this.shocks.push({ t: e.delay, pos: { ...hits[0].getPos() }, radius: e.radius, amount: skill.stats.damage * e.damagePercent, element: skill.element, owner: caster });   // 每次施放只震一次（以第一个命中目标为中心），避免群体技能叠加
          break;
        case 'cdRefund': {
          const sec = Math.min(e.max, e.perHit * hits.length);
          if (sec > 0) for (const s of e.slots) this.world.reduceCooldown?.(caster, s, sec);
          break;
        }
        case 'killHeal': {
          const n = hits.filter(t => !t.alive).length;
          if (n > 0) this.heal(caster, caster.maxHp * e.percentMaxHp * n, 0);
          break;
        }
        case 'chain':
          break; // 已在上面处理
        case 'knockback':
          break; // 位移是表现层的事，由引擎层读取 skill.effects 处理
      }
    }
    return total;
  }

  update(dt: number) {
    // 状态
    for (const u of this.world.units()) {
      if (!u.alive) continue;
      for (const d of u.status.tick(dt)) {
        const crit = !!d.crit && this.rng() < d.crit;   // v0.9.1l 持续伤害每跳可暴击（施加时快照）
        // v1.2.35 dot 暴击只吃一半暴伤加成；侵蚀：玩家（有 dotPower）的 dot 每秒最多给目标叠 1 层，每层 +1% 所有 dot 伤害（40 层封顶）
        const cm = crit ? 1 + ((d.critMult ?? 1.5) - 1) * DOT_RULES.critBonusK : 1;
        let ero = 1;
        if (d.source?.dotPower) { ero = 1 + u.status.stacks('erosion') * DOT_RULES.erosionPer; u.status.bumpStack('erosion', DOT_RULES.erosionMax, DOT_RULES.erosionDur, d.source, DOT_RULES.erosionGap); }
        this.dealDamage(u, d.amount * cm * ero, d.element, d.source, crit, false, true);
        if (crit && d.source?.dotCritEcho && u.alive) this.dealDamage(u, d.amount * cm * ero, d.element, d.source, true, false, true);   // v1.2.37 灼痕
      }
    }
    // v1.2.37 余震
    if (this.shocks.length) {
      for (const k of this.shocks) {
        k.t -= dt;
        if (k.t > 1e-6) continue;
        this.world.onExplode?.(k.pos, k.radius, k.element);
        for (const u of this.world.units())
          if (u.alive && u.faction !== k.owner.faction && dist(u.getPos(), k.pos) <= k.radius) this.dealDamage(u, k.amount, k.element, k.owner);
      }
      this.shocks = this.shocks.filter(k => k.t > 1e-6);
    }
    // 地面区域
    for (const z of this.zones) {
      z.tickTimer -= dt;
      if (z.tickTimer <= 1e-6 && z.ticksLeft > 0) {
        z.tickTimer += z.interval ?? 1;
        z.ticksLeft--;
        for (const u of this.world.units())
          if (u.alive && u.faction !== z.owner.faction && dist(u.getPos(), z.pos) <= z.radius) {
            this.dealDamage(u, z.dps, z.element, z.owner, false, false, true);
            if (z.hitsBy && u.alive) {   // v1.2.73 暴风雪：每跳减速 +x%（封顶），第 N 跳冻结（首领只打断）
              const n = (z.hitsBy.get(u) ?? 0) + 1; z.hitsBy.set(u, n);
              if (z.slowPerTick && !u.ccImmune) u.status.add({ key: `slow:${z.key}`, kind: 'slow', remaining: (z.interval ?? 1) + 0.6, percent: Math.min(z.slowMax ?? 0.6, z.slowPerTick * n), source: z.owner });
              if (z.freezeTick && n === z.freezeTick) {
                if (!u.ccImmune) { u.status.add({ key: 'stun', kind: 'stun', remaining: z.freezeDur ?? 1.5, source: z.owner }); u.onCC?.('stun', z.element, z.owner); }
                u.onInterrupt?.();
                this.world.onStackBurst?.(u, '冻结', z.element);
              }
            }
          }
      }
    }
    this.zones = this.zones.filter(z => z.ticksLeft > 0);
  }

  get activeZones(): readonly GroundZone[] { return this.zones; }
}

/** v0.9.1l 持续伤害跳间隔：1 秒 ÷ (1 + 急速) */
export const dotInterval = (u: CombatUnit) => 1 / (1 + Math.max(0, Math.min(0.4, u.haste ?? 0)));

/** 范围查询工具：给技能命中判定用 */
export function unitsInRadius(world: CombatWorld, center: Pos, radius: number, hostileTo: Faction): CombatUnit[] {
  const out: CombatUnit[] = [];
  for (const u of world.units()) if (u.alive && u.faction !== hostileTo && dist(u.getPos(), center) <= radius) out.push(u);
  return out;
}
