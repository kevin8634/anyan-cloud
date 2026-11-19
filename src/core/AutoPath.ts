// ========== 自动寻路（引擎无关） ==========
// 角色沿路径点自动跑向任务目标；任何一个条件满足就停：
//   手动操作（摇杆/WASD）、受到伤害、进入战斗、到达目的地
import { Pos2 } from './NavGrid';

export type AutoPathStop = 'arrived' | 'input' | 'damage' | 'combat' | 'cancel' | 'nopath';
export const AUTOPATH_STOP_TEXT: Record<AutoPathStop, string> = {
  arrived: '已到达目的地', input: '手动操作，自动寻路已取消', damage: '受到攻击，自动寻路已取消',
  combat: '进入战斗，自动寻路已取消', cancel: '自动寻路已取消', nopath: '找不到路线',
};

export interface AutoPathInput {
  manual: boolean;       // 本帧有没有手动移动输入
  lastHurt: number;      // 最近一次受伤的时间
  inCombat: boolean;     // 有怪物在追击/攻击玩家
}

export class AutoPath {
  active = false;
  path: Pos2[] = [];
  private idx = 0;
  startedAt = 0;
  goal: Pos2 | null = null;
  arriveR = 1.5;
  lastStop: AutoPathStop | null = null;
  onStop?: (reason: AutoPathStop) => void;

  /** 开始寻路。now = 当前游戏时间（此前的受伤不算） */
  start(path: Pos2[], goal: Pos2, now: number, arriveR = 1.5): boolean {
    if (!path.length) { this.stop('nopath'); return false; }
    this.path = path; this.idx = 0; this.goal = goal; this.arriveR = arriveR;
    this.startedAt = now; this.active = true; this.lastStop = null;
    return true;
  }
  /** 定时重算路线时替换路径（保持激活状态） */
  setPath(path: Pos2[], goal?: Pos2, arriveR?: number) {
    if (!path.length) return;
    this.path = path; this.idx = 0;
    if (goal) this.goal = goal;
    if (arriveR !== undefined) this.arriveR = arriveR;
  }
  stop(reason: AutoPathStop) {
    const was = this.active;
    this.active = false; this.lastStop = reason;
    if (was || reason === 'nopath') this.onStop?.(reason);
  }

  /** 每帧调用：返回本帧的移动方向（归一化），或 null（已停止） */
  step(pos: Pos2, now: number, input: AutoPathInput): Pos2 | null {
    if (!this.active) return null;
    if (input.manual) { this.stop('input'); return null; }
    if (input.lastHurt > this.startedAt) { this.stop('damage'); return null; }
    if (input.inCombat) { this.stop('combat'); return null; }
    if (this.goal && Math.hypot(pos.x - this.goal.x, pos.z - this.goal.z) <= this.arriveR) { this.stop('arrived'); return null; }
    while (this.idx < this.path.length - 1 && Math.hypot(pos.x - this.path[this.idx].x, pos.z - this.path[this.idx].z) < 0.7) this.idx++;
    const t = this.path[this.idx];
    const dx = t.x - pos.x, dz = t.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { if (this.idx >= this.path.length - 1) { this.stop('arrived'); return null; } this.idx++; return null; }
    void now;
    return { x: dx / d, z: dz / d };
  }

  /** 剩余路线（从 pos 起），画地面引导线用 */
  remaining(pos: Pos2): Pos2[] { return [pos, ...this.path.slice(this.idx)]; }
}
