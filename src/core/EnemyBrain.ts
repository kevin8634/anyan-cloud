// ========== 怪物 AI（引擎无关的状态机） ==========
// 状态：待机巡逻 → 发现玩家追击 → 进入攻击距离攻击 → 拉太远脱战回家回满血（魔兽式拉怪/脱战）
import { CombatUnit, Pos } from './Combat';

export type AIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'leash' | 'dead';

export interface EnemyConfig {
  aggroRange: number;      // 仇恨范围
  attackRange: number;
  attackDamage: number;
  attackInterval: number;  // 攻击间隔(秒)
  moveSpeed: number;
  leashRange: number;      // 离出生点超过这个距离就脱战
  patrolRadius: number;
}

export const DEFAULT_ENEMY: EnemyConfig = {
  aggroRange: 8, attackRange: 2, attackDamage: 15, attackInterval: 1.6,
  moveSpeed: 3.5, leashRange: 30, patrolRadius: 5,
};

/** AI 每帧输出的意图，由引擎层执行（移动、转向、播动画） */
export interface AIIntent {
  state: AIState;
  moveDir: Pos | null;     // 归一化方向；null 表示不动
  speed: number;           // 已乘过减速
  faceTo: Pos | null;
  attacked: boolean;       // 本帧发起了一次攻击（播动画用）
  /** v1.2.73 本帧开始攻击预备（表现层播后摆；扣血仍在 attackCd 到 0 那帧） */
  windup?: boolean;
}

const sub = (a: Pos, b: Pos): Pos => ({ x: a.x - b.x, z: a.z - b.z });
const len = (p: Pos) => Math.hypot(p.x, p.z);
const norm = (p: Pos): Pos => { const l = len(p) || 1; return { x: p.x / l, z: p.z / l }; };

export class EnemyBrain {
  state: AIState = 'idle';
  private attackCd = 0;
  private idleTimer: number;
  private patrolTarget: Pos | null = null;
  /** v1.2.73 攻击预备时长（秒，0 = 不预备、行为与旧版完全一致）。>0 时：扣血前 windup 秒发出 intent.windup；刚进入攻击距离的第一击延后 windup 秒 */
  windup = 0;
  private wSent = false;

  constructor(
    private self: CombatUnit,
    private spawn: Pos,
    private cfg: EnemyConfig = DEFAULT_ENEMY,
    /** 发起攻击时调用，由外部走 EffectSystem 结算伤害 */
    private doAttack: (target: CombatUnit, damage: number) => void,
    private rng: () => number = Math.random,
  ) { this.idleTimer = 1 + rng() * 2; }

  /** 被打时直接进入战斗（即使玩家在仇恨范围外远程攻击） */
  provoke() { if (this.state !== 'dead' && this.state !== 'leash') this.state = 'chase'; }

  update(dt: number, player: CombatUnit | null): AIIntent {
    const me = this.self.getPos();
    const out: AIIntent = { state: this.state, moveDir: null, speed: 0, faceTo: null, attacked: false };
    if (!this.self.alive) { this.state = out.state = 'dead'; return out; }
    this.attackCd = Math.max(0, this.attackCd - dt);
    const speed = this.cfg.moveSpeed * this.self.status.speedMultiplier;
    if (this.self.status.isStunned) return out;   // 眩晕：什么都不做
    { const ff = this.self.status.fearFrom;   // v1.2.77 恐惧：背对来源（没有来源就背对玩家）逃跑，不攻击
      if (ff !== undefined) { const from = (ff ?? player)?.getPos(); if (from) { const d = norm(sub(me, from)); out.moveDir = d; out.faceTo = { x: me.x + d.x, z: me.z + d.z }; out.speed = speed; } out.state = 'chase'; return out; } }

    const target = player && player.alive ? player : null;
    const toTarget = target ? sub(target.getPos(), me) : null;
    const dTarget = toTarget ? len(toTarget) : Infinity;
    const dHome = len(sub(me, this.spawn));

    // 状态切换
    if (this.state === 'leash') {
      if (dHome < 0.5) { this.state = 'idle'; this.self.hp = this.self.maxHp; this.self.status.clear(); }
    } else if (dHome > this.cfg.leashRange || (!target && (this.state === 'chase' || this.state === 'attack'))) {
      this.state = 'leash';
    } else if (this.state === 'idle' || this.state === 'patrol') {
      if (dTarget <= this.cfg.aggroRange) this.state = 'chase';
    } else if (this.state === 'chase' && dTarget <= this.cfg.attackRange) {
      this.state = 'attack';
      if (this.windup > 0 && this.attackCd < this.windup) { this.attackCd = this.windup; this.wSent = false; }
    } else if (this.state === 'attack' && dTarget > this.cfg.attackRange * 1.2) {
      this.state = 'chase';
    }
    out.state = this.state;

    // 行为
    switch (this.state) {
      case 'idle':
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          const a = this.rng() * Math.PI * 2, r = this.rng() * this.cfg.patrolRadius;
          this.patrolTarget = { x: this.spawn.x + Math.cos(a) * r, z: this.spawn.z + Math.sin(a) * r };
          this.state = out.state = 'patrol';
        }
        break;
      case 'patrol': {
        const d = sub(this.patrolTarget!, me);
        if (len(d) < 0.3) { this.state = out.state = 'idle'; this.idleTimer = 2 + this.rng() * 3; break; }
        out.moveDir = norm(d); out.speed = speed * 0.5; out.faceTo = this.patrolTarget;
        break;
      }
      case 'chase':
        out.moveDir = norm(toTarget!); out.speed = speed; out.faceTo = target!.getPos();
        break;
      case 'attack':
        out.faceTo = target!.getPos();
        if (this.windup > 0 && !this.wSent && this.attackCd > 0 && this.attackCd <= this.windup) { this.wSent = true; out.windup = true; }
        if (this.attackCd <= 0) {
          this.attackCd = this.cfg.attackInterval; this.wSent = false;
          out.attacked = true;
          this.doAttack(target!, this.cfg.attackDamage);
        }
        break;
      case 'leash':
        out.moveDir = norm(sub(this.spawn, me)); out.speed = this.cfg.moveSpeed * 1.5; out.faceTo = this.spawn;
        break;
    }
    return out;
  }
}
