// ========== Boss AI（引擎无关） ==========
// 在普通怪 AI（追击/近战/脱战）之上加三种机制：
//   groundSlam 红圈：在玩家脚下画圈，倒计时后结算，站在圈里就挨打 → 玩家要走位
//   cast       读条：Boss 站定读条，读完造成大伤害；被打断（打断/眩晕技能）则失败
//   summon     召唤小怪（unit 指定召唤物类型，如藤蔓）
//   poisonZone 毒池：在玩家脚下（可多个散开）留下持续伤害区域，站在里面每秒掉血 → 玩家要离开并避免在毒池里打
//   groundSlam 加 atSelf：以 Boss 自身为圆心的大范围爆发 → 近战要跑出去
//   cast 加 selfHealPercent：读条完成 Boss 回血（必须打断）
// 阶段：血量低于阈值时切换，换技能组、加攻击力/移速，可在进入时召唤或喊话
import { CombatUnit, Pos } from './Combat';
import { EnemyBrain, EnemyConfig, AIIntent } from './EnemyBrain';
import { EffectDef, Element } from './types';

export type BossAbility =
  | { id: string; kind: 'groundSlam'; name: string; cooldown: number; telegraph: number; radius: number; damage: number; element: Element; count?: number; spread?: number; atSelf?: boolean }
  | { id: string; kind: 'cast'; name: string; cooldown: number; castTime: number; damage: number; element: Element; effect?: EffectDef; lockout?: number; selfHealPercent?: number }
  | { id: string; kind: 'summon'; name: string; cooldown: number; count: number; unit?: string }
  | { id: string; kind: 'poisonZone'; name: string; cooldown: number; radius: number; duration: number; dps: number; element: Element; count?: number; spread?: number };

export interface BossPhase {
  name: string;
  hpBelow: number;          // 血量比例低于它进入该阶段；第一阶段写 1
  abilities: string[];      // 本阶段可用技能 id
  damageMul?: number;       // 近战伤害倍率
  speedMul?: number;
  onEnter?: string;         // 进入阶段立即释放的技能 id（如召唤）
  yell?: string;            // 喊话
}

export interface BossDef {
  name: string;
  config: EnemyConfig;
  abilities: BossAbility[];
  phases: BossPhase[];
  globalCooldown: number;   // 两个机制之间至少间隔，避免叠在一起没法躲
}

/** Boss 的表现层事件，Cocos 侧实现：画红圈、显示读条、刷小怪、喊话 */
export interface BossEvents {
  onTelegraph?(id: number, pos: Pos, radius: number, duration: number, name: string): void;
  onTelegraphResolve?(id: number, hitPlayer: boolean): void;
  /** 玩家在红圈里但处于无敌帧（翻滚）：不受伤害 */
  onTelegraphDodged?(id: number): void;
  onCastStart?(name: string, castTime: number): void;
  onCastEnd?(name: string, success: boolean): void;
  onPhase?(phase: BossPhase, index: number): void;
  onSummon?(count: number, unit?: string): void;
  onZone?(id: number, pos: Pos, radius: number, duration: number, name: string): void;
  onZoneEnd?(id: number): void;
  onHeal?(amount: number): void;
  onReset?(): void;
  /** v1.2.48：进入战斗（每次从脱战进入战斗时一次，含拉脱后重新开打） */
  onEngage?(): void;
}

interface PoisonZone { id: number; pos: Pos; radius: number; remaining: number; tick: number; ability: BossAbility & { kind: 'poisonZone' } }

interface Telegraph { id: number; pos: Pos; radius: number; remaining: number; ability: BossAbility & { kind: 'groundSlam' } }

export interface BossIntent extends AIIntent {
  casting: { name: string; progress: number } | null;   // 读条进度 0~1
  phaseIndex: number;
}

let telegraphSeq = 1;

export class BossBrain {
  readonly base: EnemyBrain;
  phaseIndex = 0;
  private cds = new Map<string, number>();
  private gcd = 3;                                // 开场 3 秒后才放第一个机制
  private casting: { ab: BossAbility & { kind: 'cast' }; elapsed: number } | null = null;
  private lockout = 0;                            // 被打断后的硬直
  private telegraphs: Telegraph[] = [];
  private zones: PoisonZone[] = [];
  private inCombat = false;

  constructor(
    private self: CombatUnit,
    spawn: Pos,
    private def: BossDef,
    /** 对目标造成伤害（走 EffectSystem） */
    private hit: (target: CombatUnit, damage: number, element: Element, effect?: EffectDef) => void,
    private events: BossEvents = {},
    private rng: () => number = Math.random,
  ) {
    const cfg = { ...def.config, patrolRadius: 0 };   // Boss 不巡逻，站桩等人
    this.base = new EnemyBrain(self, spawn, cfg, (t, dmg) => this.hit(t, dmg * this.phase.damageMul!, 'physical'), rng);
  }

  get phase(): BossPhase { return { damageMul: 1, speedMul: 1, ...this.def.phases[this.phaseIndex] }; }
  get isCasting() { return !!this.casting; }
  /** 当前毒池（给机器人/AI 躲避用） */
  get activeZones(): readonly { pos: Pos; radius: number }[] { return this.zones; }
  /** 当前红圈（给机器人/AI 躲避用） */
  get activeTelegraphs(): readonly { pos: Pos; radius: number; remaining: number }[] { return this.telegraphs; }

  provoke() { this.base.provoke(); }

  /** 打断：返回是否真的打断了读条 */
  interrupt(): boolean {
    if (!this.casting) return false;
    const ab = this.casting.ab;
    this.casting = null;
    this.lockout = ab.lockout ?? 2;
    this.cds.set(ab.id, ab.cooldown);
    this.events.onCastEnd?.(ab.name, false);
    return true;
  }

  update(dt: number, player: CombatUnit | null): BossIntent {
    // 红圈倒计时（Boss 死了也照样结算已经落下的圈）
    this.updateTelegraphs(dt, player);
    this.updateZones(dt, player);

    if (!this.self.alive) return { ...this.idle('dead'), casting: null, phaseIndex: this.phaseIndex };

    // 读条中：站定，不移动不近战
    if (this.casting) {
      this.casting.elapsed += dt;
      const ab = this.casting.ab;
      if (this.casting.elapsed >= ab.castTime) {
        this.casting = null;
        this.cds.set(ab.id, ab.cooldown);
        if (player?.alive) this.hit(player, ab.damage * this.phase.damageMul!, ab.element, ab.effect);
        if (ab.selfHealPercent) {
          const v = Math.min(this.self.maxHp - this.self.hp, Math.round(this.self.maxHp * ab.selfHealPercent));
          if (v > 0) { this.self.hp += v; this.events.onHeal?.(v); }
        }
        this.events.onCastEnd?.(ab.name, true);
      }
      const c = this.casting as { ab: BossAbility & { kind: 'cast' }; elapsed: number } | null;
      return { ...this.idle('attack'), faceTo: player?.getPos() ?? null,
        casting: c ? { name: c.ab.name, progress: c.elapsed / c.ab.castTime } : { name: ab.name, progress: 1 }, phaseIndex: this.phaseIndex };
    }

    const intent = this.base.update(dt, player);
    intent.speed *= this.phase.speedMul!;

    // 进入/离开战斗
    const fighting = intent.state === 'chase' || intent.state === 'attack';
    if (intent.state === 'leash' && this.inCombat) this.reset();
    if (fighting && !this.inCombat) { this.inCombat = true; this.events.onEngage?.(); }

    if (this.inCombat && fighting) {
      this.checkPhase();
      this.lockout = Math.max(0, this.lockout - dt);
      this.gcd = Math.max(0, this.gcd - dt);
      for (const [k, v] of this.cds) this.cds.set(k, Math.max(0, v - dt));
      if (this.gcd <= 0 && this.lockout <= 0 && !this.self.status.isStunned && player) this.tryAbility(player);
    }
    return { ...intent, casting: null, phaseIndex: this.phaseIndex };
  }

  // ---------- 内部 ----------
  private idle(state: AIIntent['state']): AIIntent { return { state, moveDir: null, speed: 0, faceTo: null, attacked: false }; }

  private checkPhase() {
    const hpPct = this.self.hp / this.self.maxHp;
    while (this.phaseIndex + 1 < this.def.phases.length && hpPct <= this.def.phases[this.phaseIndex + 1].hpBelow) {
      this.phaseIndex++;
      const ph = this.phase;
      this.events.onPhase?.(ph, this.phaseIndex);
      if (ph.onEnter) { const ab = this.ability(ph.onEnter); if (ab) this.use(ab, null); }
      this.gcd = 2;   // 转阶段给玩家喘口气
    }
  }

  private tryAbility(player: CombatUnit) {
    const ready = this.phase.abilities.map(id => this.ability(id)).filter((a): a is BossAbility => !!a && (this.cds.get(a.id) ?? 0) <= 0);
    if (!ready.length) return;
    this.use(ready[Math.floor(this.rng() * ready.length)], player);
    this.gcd = this.def.globalCooldown;
  }

  private use(ab: BossAbility, player: CombatUnit | null) {
    switch (ab.kind) {
      case 'groundSlam': {
        this.cds.set(ab.id, ab.cooldown);
        const center = ab.atSelf ? this.self.getPos() : player?.getPos() ?? this.self.getPos();
        const n = ab.count ?? 1;
        for (let i = 0; i < n; i++) {
          // 第一个圈在玩家脚下（或 Boss 自身），其余随机散开
          const a = this.rng() * Math.PI * 2, r = i === 0 ? 0 : (ab.spread ?? 4) * (0.5 + this.rng() * 0.5);
          const pos = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
          const t: Telegraph = { id: telegraphSeq++, pos, radius: ab.radius, remaining: ab.telegraph, ability: ab };
          this.telegraphs.push(t);
          this.events.onTelegraph?.(t.id, pos, ab.radius, ab.telegraph, ab.name);
        }
        break;
      }
      case 'cast':
        this.casting = { ab, elapsed: 0 };
        this.events.onCastStart?.(ab.name, ab.castTime);
        break;
      case 'summon':
        this.cds.set(ab.id, ab.cooldown);
        this.events.onSummon?.(ab.count, ab.unit);
        break;
      case 'poisonZone': {
        this.cds.set(ab.id, ab.cooldown);
        const center = player?.getPos() ?? this.self.getPos();
        const n = ab.count ?? 1;
        for (let i = 0; i < n; i++) {
          const a = this.rng() * Math.PI * 2, r = i === 0 ? 0 : (ab.spread ?? 4) * (0.5 + this.rng() * 0.5);
          const z: PoisonZone = { id: telegraphSeq++, pos: { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }, radius: ab.radius, remaining: ab.duration, tick: 1, ability: ab };
          this.zones.push(z);
          this.events.onZone?.(z.id, z.pos, z.radius, z.remaining, ab.name);
        }
        break;
      }
    }
  }

  /** 毒池：每秒对站在里面的玩家结算一次；Boss 死亡后毒池消散 */
  private updateZones(dt: number, player: CombatUnit | null) {
    for (const z of this.zones) {
      z.remaining -= dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += 1;
        if (player?.alive && this.self.alive) {
          const p = player.getPos();
          if (Math.hypot(p.x - z.pos.x, p.z - z.pos.z) <= z.radius) this.hit(player, z.ability.dps, z.ability.element);
        }
      }
      if (z.remaining <= 0 || !this.self.alive) this.events.onZoneEnd?.(z.id);
    }
    this.zones = this.zones.filter(z => z.remaining > 0 && this.self.alive);
  }

  private updateTelegraphs(dt: number, player: CombatUnit | null) {
    for (const t of this.telegraphs) {
      t.remaining -= dt;
      if (t.remaining > 0) continue;
      let hitPlayer = false;
      if (player?.alive) {
        const p = player.getPos();
        if (Math.hypot(p.x - t.pos.x, p.z - t.pos.z) <= t.radius) {
          if (player.status.isInvulnerable) { this.events.onTelegraphDodged?.(t.id); this.events.onTelegraphResolve?.(t.id, false); continue; }
          hitPlayer = true;
          this.hit(player, t.ability.damage * this.phase.damageMul!, t.ability.element);
        }
      }
      this.events.onTelegraphResolve?.(t.id, hitPlayer);
    }
    this.telegraphs = this.telegraphs.filter(t => t.remaining > 0);
  }

  private ability(id: string) { return this.def.abilities.find(a => a.id === id); }

  /** 脱战/团灭：回满血、回到第一阶段、清掉所有机制 */
  private reset() {
    this.inCombat = false;
    this.phaseIndex = 0;
    this.cds.clear();
    this.gcd = 3;
    this.lockout = 0;
    if (this.casting) this.events.onCastEnd?.(this.casting.ab.name, false);
    this.casting = null;
    this.telegraphs.forEach(t => this.events.onTelegraphResolve?.(t.id, false));
    this.telegraphs = [];
    this.zones.forEach(z => this.events.onZoneEnd?.(z.id));
    this.zones = [];
    this.events.onReset?.();
  }
}
