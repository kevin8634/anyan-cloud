// ========== 闪避翻滚（引擎无关，可在命令行测试） ==========
// 向移动方向（静止时朝面朝方向）快速翻滚约 5 米；前 0.35 秒无敌（伤害、红圈、负面状态全部无效）
// 冷却 6 秒，急速按比例缩短；眩晕时不能翻滚；开始翻滚会取消自动寻路（由表现层处理）
import { CombatUnit, Pos } from './Combat';

export interface DodgeConfig {
  distance: number;    // 翻滚距离（米）
  duration: number;    // 位移耗时（秒）
  iframes: number;     // 无敌帧（秒）
  cooldown: number;    // 基础冷却（秒）
}
export const DEFAULT_DODGE: DodgeConfig = { distance: 5, duration: 0.4, iframes: 0.35, cooldown: 6 };

export interface RollState { dir: Pos; elapsed: number; moved: number }

export class DodgeRoll {
  private readyAt = 0;
  /** 进行中的翻滚（表现层每帧读取 step() 的位移） */
  roll: RollState | null = null;
  /** 急速百分比（0~40）：冷却 × (1 - 急速%) */
  haste = 0;
  /** v1.2.37c 接下来 N 次翻滚不进入冷却（内容包增益用） */
  freeRolls = 0;
  /** 额外冷却缩减（秒，天赋/装备可用） */
  cdReduce = 0;
  onRoll?: (dir: Pos) => void;
  constructor(public cfg: DodgeConfig = DEFAULT_DODGE) {}

  get cooldown() { return Math.max(1, this.cfg.cooldown * (1 - Math.min(40, Math.max(0, this.haste)) / 100) - this.cdReduce); }
  cooldownLeft(now: number) { return Math.max(0, this.readyAt - now); }
  get rolling() { return !!this.roll; }

  /** 为什么现在不能翻滚（null = 可以） */
  whyNot(unit: CombatUnit, now: number): string | null {
    if (!unit.alive) return '已阵亡';
    if (unit.status.isStunned) return '眩晕中无法翻滚';
    if (this.roll) return '正在翻滚';
    if (this.cooldownLeft(now) > 1e-6) return '翻滚冷却中';
    return null;
  }

  /** 开始翻滚：dir 为移动方向（可以是 0 向量，此时用 facing） */
  start(unit: CombatUnit, now: number, dir: Pos | null, facing: Pos): boolean {
    if (this.whyNot(unit, now)) return false;
    let d = dir && Math.hypot(dir.x, dir.z) > 1e-3 ? dir : facing;
    const l = Math.hypot(d.x, d.z) || 1;
    d = { x: d.x / l, z: d.z / l };
    this.roll = { dir: d, elapsed: 0, moved: 0 };
    if (this.freeRolls > 0) { this.freeRolls--; this.readyAt = now; } else this.readyAt = now + this.cooldown;
    unit.status.add({ key: 'roll', kind: 'invuln', remaining: this.cfg.iframes, source: unit });
    this.onRoll?.(d);
    return true;
  }

  /** 每帧推进：返回本帧位移（先快后慢的缓动），结束后 roll = null */
  step(dt: number): Pos | null {
    const r = this.roll; if (!r) return null;
    const T = this.cfg.duration;
    const k0 = Math.min(1, r.elapsed / T); r.elapsed += dt;
    const k1 = Math.min(1, r.elapsed / T);
    const ease = (k: number) => 1 - (1 - k) * (1 - k);
    const s = (ease(k1) - ease(k0)) * this.cfg.distance;
    r.moved += s;
    if (k1 >= 1) this.roll = null;
    return { x: r.dir.x * s, z: r.dir.z * s };
  }

  /** 重置冷却（复活 / 换区域时可用） */
  reset() { this.readyAt = 0; this.roll = null; }
}
