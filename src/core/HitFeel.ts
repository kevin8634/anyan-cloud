// ========== 打击感：顿帧 + 镜头震动（引擎无关，可在命令行测试） ==========
// 表现层把战斗事件交给 HitFeel，它按事件类型给出「顿帧时长」和「震动强度」，并尊重设置里的震动开关/强度
export type FeelEvent =
  | 'hit'         // 玩家近战普通命中
  | 'crit'        // 玩家暴击
  | 'heavy'       // 重击技能（雷霆一击、法术新星等）
  | 'ultimate'    // 终极技能
  | 'bossSlam'    // Boss 红圈砸地（玩家被砸中）
  | 'bossSlamMiss'// Boss 红圈砸地（没砸中）
  | 'hurt'        // 玩家受到较重的伤害
  | 'kill'        // 击杀小怪
  | 'eliteKill'   // v1.2.56 击杀精英 / 稀有：0.1 秒慢动作
  | 'bossKill';   // 击杀 Boss

/** 每种事件的顿帧（秒）与震动强度（0~1，最终 × 设置强度） */
export const FEEL_TABLE: Record<FeelEvent, { stop: number; shake: number; scale?: number }> = {
  hit: { stop: 0.04, shake: 0 },
  crit: { stop: 0.1, shake: 0.2 },
  heavy: { stop: 0.08, shake: 0.3 },
  ultimate: { stop: 0.14, shake: 0.55 },
  bossSlam: { stop: 0, shake: 0.5 },
  bossSlamMiss: { stop: 0, shake: 0.22 },
  hurt: { stop: 0, shake: 0.15 },
  kill: { stop: 0.05, shake: 0.08 },
  eliteKill: { stop: 0.1, shake: 0.25, scale: 0.3 },
  bossKill: { stop: 0.45, shake: 0.7, scale: 0.2 },
};

export interface FeelSettings { shake: boolean; shakeIntensity: number; hitStop: boolean }

export class HitFeel {
  /** 剩余顿帧（真实时间秒）与此期间的时间倍率 */
  stop = 0; stopScale = 0.08;
  /** 当前震动强度（每秒衰减） */
  shake = 0;
  /** v1.2.56 方向震屏：沿攻击方向（世界 XZ 单位向量）推镜头，强度 push 随时间衰减 */
  dirX = 0; dirZ = 0; push = 0;
  /** 最近的事件（测试/调试用） */
  readonly log: { ev: FeelEvent; stop: number; shake: number }[] = [];
  constructor(public settings: FeelSettings = { shake: true, shakeIntensity: 1, hitStop: true }) {}

  emit(ev: FeelEvent, mul = 1, dir?: { x: number; z: number }) {
    const f = FEEL_TABLE[ev];
    const stop = this.settings.hitStop ? f.stop : 0;
    const shake = this.settings.shake ? f.shake * this.settings.shakeIntensity * mul : 0;
    if (stop > this.stop) { this.stop = stop; this.stopScale = f.scale ?? 0.08; }
    this.shake = Math.min(1.2, Math.max(this.shake, shake));
    if (dir && shake > 0) { const l = Math.hypot(dir.x, dir.z); if (l > 1e-4) { this.dirX = dir.x / l; this.dirZ = dir.z / l; this.push = Math.min(1, Math.max(this.push, shake)); } }
    this.log.push({ ev, stop, shake });
    if (this.log.length > 50) this.log.shift();
    return { stop, shake };
  }

  /** 直接加一段震动（旧代码里的数值），同样受设置控制 */
  kick(amount: number) { if (this.settings.shake) this.shake = Math.min(1.2, Math.max(this.shake, amount * this.settings.shakeIntensity)); }

  /** 每帧（真实时间）调用：返回游戏时间倍率 */
  update(rawDt: number, realDt = rawDt): number {
    let scale = 1;
    // 11-19 C21 hitstopreal：顿帧按真实帧间隔倒计时（realDt 不封顶 0.05）。低帧率（如副本 11 帧，一帧 90ms）时旧写法把 0.1 秒暴击顿帧拖成 2 帧 ≈ 0.18 秒，像卡顿
    if (this.stop > 0) { this.stop -= realDt; scale = this.stopScale; }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - rawDt * 1.6);
    if (this.push > 0) this.push = Math.max(0, this.push - rawDt * 4);
    return scale;
  }
}
