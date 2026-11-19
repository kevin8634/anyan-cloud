// 敌人：战斗单位 + AI 状态机 + 移动/动画/血条
// 挂在敌人根节点上；model 子节点带 SkeletalAnimation
import { _decorator, Component, Node, Sprite, SkeletalAnimation, math } from 'cc';
import { CombatUnit, StatusSet, Faction, Pos } from '../core/Combat';
import { EnemyBrain, EnemyConfig, AIState, AIIntent } from '../core/EnemyBrain';
import { Element } from '../core/types';
import { CombatManager, toPos } from './CombatManager';
import { PlayerController } from './PlayerController';
import { LootManager } from './LootManager';
import { ProgressionManager } from './ProgressionManager';
import { QuestManager } from './QuestManager';
const { ccclass, property } = _decorator;

/** Enemy 能驱动的 AI 接口：EnemyBrain 和 BossBrain 都满足 */
export interface EnemyAI { update(dt: number, p: CombatUnit | null): AIIntent; provoke(): void; interrupt?(): boolean; }

@ccclass('Enemy')
export class Enemy extends Component implements CombatUnit {
  static readonly all = new Set<Enemy>();
  /** 全局钩子：副本控制器监听出生/死亡 */
  static onAnySpawn: ((e: Enemy) => void) | null = null;
  static onAnyDeath: ((e: Enemy) => void) | null = null;

  @property({ tooltip: '所属遭遇战 id（副本用），野外怪留空' }) encounterId = '';
  @property({ tooltip: '掉落表 id（见 data/loot.ts），留空不掉落' }) lootTable = 'trash';
  @property itemLevel = 10;
  @property({ tooltip: '击杀经验（小怪 30~70，Boss 450~750）' }) xpReward = 30;
  @property({ tooltip: '任务用的怪物种类：wolf / miner / spider' }) questKind = '';
  @property displayName = '豺狼人';
  @property maxHp = 300;
  @property aggroRange = 8;
  @property attackRange = 2;
  @property attackDamage = 15;
  @property attackInterval = 1.6;
  @property moveSpeed = 3.5;
  @property leashRange = 30;
  @property patrolRadius = 5;
  @property(SkeletalAnimation) anim: SkeletalAnimation | null = null;
  @property(Node) hpBarRoot: Node | null = null;   // 头顶血条（世界空间小面片或 UI 跟随）
  @property(Sprite) hpBarFill: Sprite | null = null;
  @property(Node) stunFx: Node | null = null;      // 头顶眩晕星星
  @property modelYawOffset = 0;
  @property clipIdle = 'idle';
  @property clipRun = 'run';
  @property clipAttack = 'attack';
  @property clipDeath = 'death';

  readonly uid = Math.random().toString(36).slice(2);
  readonly faction: Faction = 'enemy';
  readonly status = new StatusSet();
  hp = 0;
  get alive() { return this.hp > 0; }

  protected brain!: EnemyAI;
  protected lastIntent: AIIntent | null = null;
  private lastState: AIState | null = null;
  private yaw = 0;

  getPos(): Pos { return toPos(this.node); }

  onEnable() {
    this.hp = this.maxHp;
    Enemy.all.add(this);
    const cfg: EnemyConfig = {
      aggroRange: this.aggroRange, attackRange: this.attackRange, attackDamage: this.attackDamage,
      attackInterval: this.attackInterval, moveSpeed: this.moveSpeed, leashRange: this.leashRange, patrolRadius: this.patrolRadius,
    };
    this.brain = this.createBrain(cfg);
  }
  /** 子类（Boss）覆盖它换成别的 AI */
  protected createBrain(cfg: EnemyConfig): EnemyAI {
    return new EnemyBrain(this, this.getPos(), cfg, (target, dmg) => CombatManager.instance?.fx.dealDamage(target, dmg, 'physical', this));
  }
  start() { CombatManager.instance?.register(this); Enemy.onAnySpawn?.(this); }
  /** 召唤出来后直接进战斗 */
  provoke() { this.brain.provoke(); }
  onInterrupt() { return this.brain.interrupt?.() ?? false; }   // start 晚于所有 onLoad，保证管理器已就绪
  onDisable() { Enemy.all.delete(this); CombatManager.instance?.unregister(this); }

  // ----- CombatUnit 回调 -----
  onDamaged(_amount: number, _el: Element, source: CombatUnit | null) {
    if (source?.faction === 'player') this.brain.provoke();   // 被远程打也会冲过来
    // TODO: 飘字 / 受击闪白
  }
  onDeath() {
    Enemy.onAnyDeath?.(this);
    ProgressionManager.instance?.addXp(this.xpReward);
    if (this.questKind) QuestManager.instance?.onKill(this.questKind);
    if (this.lootTable) LootManager.instance?.dropAt(this.lootTable, this.node.worldPosition, this.itemLevel);
    this.play(this.clipDeath, true);
    if (this.hpBarRoot) this.hpBarRoot.active = false;
    this.scheduleOnce(() => this.node.destroy(), 2);
  }

  update(dt: number) {
    const player = PlayerController.instance;
    const it = this.brain.update(dt, player && player.alive ? player : null);
    this.lastIntent = it;
    if (it.state === 'dead') return;

    if (it.moveDir && it.speed > 0) {
      const p = this.node.worldPosition;
      this.node.setWorldPosition(p.x + it.moveDir.x * it.speed * dt, p.y, p.z + it.moveDir.z * it.speed * dt);
    }
    if (it.faceTo) {
      const p = this.node.worldPosition;
      const target = math.toDegree(Math.atan2(it.faceTo.x - p.x, it.faceTo.z - p.z)) + this.modelYawOffset;
      const delta = ((target - this.yaw + 540) % 360) - 180;
      this.yaw += math.clamp(delta, -540 * dt, 540 * dt);
      this.node.setRotationFromEuler(0, this.yaw, 0);
    }

    // 动画
    if (it.attacked) this.play(this.clipAttack, true);
    else if (it.state !== this.lastState && it.state !== 'attack')
      this.play(it.moveDir ? this.clipRun : this.clipIdle);
    this.lastState = it.state;

    // 表现
    if (this.hpBarFill) this.hpBarFill.fillRange = this.hp / this.maxHp;
    if (this.hpBarRoot) this.hpBarRoot.active = this.alive && this.hp < this.maxHp;
    if (this.stunFx) this.stunFx.active = this.status.isStunned;
  }

  protected play(clip: string, force = false) {
    if (!this.anim) return;
    this.anim.crossFade(clip, force ? 0.05 : 0.15);
  }
}
