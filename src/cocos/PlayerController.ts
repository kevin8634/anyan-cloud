// 角色控制：读摇杆 → 按镜头方向移动 → 转向 → 切换动画
// 不依赖物理引擎（小游戏包体和性能更友好）；地图边界用 bounds 限制，后面需要碰撞再换 CharacterController
import { _decorator, Component, Vec3, SkeletalAnimation, math } from 'cc';
import { VirtualJoystick } from './VirtualJoystick';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { TargetSelector } from './TargetSelector';
import { CombatUnit, StatusSet, Faction, Pos } from '../core/Combat';
import { Element } from '../core/types';
import { CombatManager, toPos } from './CombatManager';
const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component implements CombatUnit {
  static instance: PlayerController | null = null;
  @property(VirtualJoystick) joystick: VirtualJoystick | null = null;
  @property(ThirdPersonCamera) cam: ThirdPersonCamera | null = null;
  @property(SkeletalAnimation) anim: SkeletalAnimation | null = null;
  @property moveSpeed = 6;
  @property turnSpeed = 720;          // 度/秒
  @property modelYawOffset = 0;       // 模型默认朝向不对时调这里（Mixamo 模型一般是 0）
  @property idleClip = 'idle';
  @property runClip = 'run';
  @property boundsHalfSize = 50;      // 地图半边长

  @property maxHp = 1000;
  hp = 1000;
  readonly uid = 'player';
  readonly faction: Faction = 'player';
  readonly status = new StatusSet();
  get alive() { return this.hp > 0; }
  armor = 0;
  /** 装备变化时由 LootManager 调用：保持血量百分比不变 */
  applyStats(maxHp: number, armor: number) {
    const pct = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.maxHp = maxHp;
    this.armor = armor;
    if (this.alive) this.hp = Math.max(1, Math.round(maxHp * pct));
  }
  getPos(): Pos { return toPos(this.node); }
  onDamaged(_amount: number, _el: Element, _src: CombatUnit | null) { /* TODO: 受击闪红、屏幕边缘红光 */ }
  onDeath() { this.play('death', true); /* TODO: 复活界面 */ }
  /** 施法/攻击中锁定移动的剩余时间 */
  private castLock = 0;
  private currentClip = '';
  private fwd = new Vec3(); private right = new Vec3(); private move = new Vec3(); private pos = new Vec3();
  private yaw = 0;

  get hpPercent() { return this.hp / this.maxHp; }

  /** 裸装基础生命（Inspector 里的 maxHp），装备/天赋在此之上加 */
  baseMaxHp = 1000;
  onLoad() { PlayerController.instance = this; this.baseMaxHp = this.maxHp; }
  onDestroy() { if (PlayerController.instance === this) PlayerController.instance = null; }

  start() {
    if (this.hp <= 0 || this.hp > this.maxHp) this.hp = this.maxHp;
    this.yaw = this.node.eulerAngles.y;
    this.play(this.idleClip);
    CombatManager.instance?.register(this);
  }

  /** 技能释放时调用：面向目标、短暂定身、播放动画 */
  onCast(clip: string, lockTime: number) {
    const target = this.getComponent(TargetSelector)?.current;
    if (target) {
      const d = Vec3.subtract(this.move, target.node.worldPosition, this.node.worldPosition);
      this.yaw = math.toDegree(Math.atan2(d.x, d.z)) + this.modelYawOffset;
      this.node.setRotationFromEuler(0, this.yaw, 0);
    }
    this.castLock = lockTime;
    this.play(clip, true);
  }

  update(dt: number) {
    if (!this.alive) return;
    if (this.status.isStunned) { this.play(this.idleClip); return; }
    if (this.castLock > 0) { this.castLock -= dt; return; }
    const j = this.joystick?.dir;
    if (!j || !this.cam || (j.x === 0 && j.y === 0)) { this.play(this.idleClip); return; }

    this.cam.getGroundAxes(this.fwd, this.right);
    this.move.set(0, 0, 0)
      .add(Vec3.multiplyScalar(this.right, this.right, j.x))
      .add(Vec3.multiplyScalar(this.fwd, this.fwd, j.y));
    const strength = Math.min(1, this.move.length());
    this.move.normalize();

    this.pos.set(this.node.position).add(Vec3.multiplyScalar(this.fwd, this.move, this.moveSpeed * this.status.speedMultiplier * strength * dt));
    const b = this.boundsHalfSize;
    this.pos.x = math.clamp(this.pos.x, -b, b);
    this.pos.z = math.clamp(this.pos.z, -b, b);
    this.node.setPosition(this.pos);

    // 平滑转向
    const targetYaw = math.toDegree(Math.atan2(this.move.x, this.move.z)) + this.modelYawOffset;
    let delta = ((targetYaw - this.yaw + 540) % 360) - 180;
    const step = this.turnSpeed * dt;
    this.yaw += math.clamp(delta, -step, step);
    this.node.setRotationFromEuler(0, this.yaw, 0);

    this.play(this.runClip);
  }

  private play(clip: string, force = false) {
    if (!this.anim || (!force && this.currentClip === clip)) return;
    this.currentClip = clip;
    this.anim.crossFade(clip, 0.15);
  }
}
