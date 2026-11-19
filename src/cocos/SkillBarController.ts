// 技能栏：按钮 → Loadout 解析变种 → 角色动画 + 命中判定 + 伤害
// 挂在 UI 的 SkillBar 节点上
import { _decorator, Component, Button, Label, Sprite, game, Vec3 } from 'cc';
import { Loadout, SkillExecutor } from '../core/Loadout';
import { ResolvedSkill, SlotId, SLOT_IDS, CastContext } from '../core/types';
import { SKILLS, COMBOS, SET_BONUSES } from '../data/warrior';
import { PlayerController } from './PlayerController';
import { TargetSelector } from './TargetSelector';
import { Enemy } from './Enemy';
import { CombatManager } from './CombatManager';
const { ccclass, property } = _decorator;

/** 每种形状用哪个动画、定身多久（可按技能 id 细化） */
const CAST_ANIM: Record<string, { clip: string; lock: number }> = {
  single: { clip: 'attack', lock: 0.4 },
  circle: { clip: 'spin', lock: 0.6 },
  cone: { clip: 'attack', lock: 0.5 },
  line: { clip: 'attack', lock: 0.5 },
  projectile: { clip: 'throw', lock: 0.5 },
  dash: { clip: 'run', lock: 0.3 },
};

@ccclass('SkillBarController')
export class SkillBarController extends Component implements SkillExecutor {
  @property([Button]) buttons: Button[] = [];       // 顺序：普攻、技能1、技能2、技能3、大招
  @property([Sprite]) cooldownMasks: Sprite[] = []; // Filled 类型 Sprite，做冷却转圈
  @property([Label]) nameLabels: Label[] = [];
  @property(PlayerController) player: PlayerController | null = null;
  @property(TargetSelector) targeting: TargetSelector | null = null;

  static instance: SkillBarController | null = null;
  loadout!: Loadout;
  private tmp = new Vec3();

  onLoad() { SkillBarController.instance = this; }
  onDestroy() { if (SkillBarController.instance === this) SkillBarController.instance = null; }

  start() {
    this.loadout = new Loadout(this);
    this.loadout.equipSkill(SKILLS.slash, 'basic');
    this.loadout.equipSkill(SKILLS.charge, 'skill1');
    this.loadout.equipSkill(SKILLS.whirlwind, 'skill2');
    this.loadout.equipSkill(SKILLS.thunderclap, 'skill3');
    this.loadout.equipSkill(SKILLS.avatar, 'ultimate');
    this.loadout.setComboModifiers(COMBOS);
    this.loadout.setSetBonuses(SET_BONUSES);
    SLOT_IDS.forEach((slot, i) => this.buttons[i]?.node.on(Button.EventType.CLICK, () => this.onPress(slot)));
    if (this.player) CombatManager.instance?.register(this.player, this.loadout);  // 套装“重置冷却”需要
  }

  private ctx(): CastContext {
    return {
      now: game.totalTime / 1000,
      casterHpPercent: this.player?.hpPercent ?? 1,
      targetEffects: this.targeting?.current?.status.kinds() ?? [],   // 支持“目标被减速时…”这类修饰器
    };
  }

  onPress(slot: SlotId) {
    if (!this.player?.alive || this.player.status.isStunned) return;
    // 需要目标的技能：没目标且范围内也没有敌人时不放
    const def = this.loadout.preview(slot, this.ctx());
    if (!def) return;
    const needsTarget = def.shape === 'single' || def.shape === 'dash' || def.shape === 'projectile';
    if (needsTarget && !this.targeting?.current) return;
    if (needsTarget && this.targeting!.distanceTo(this.targeting!.current!) > Math.max(def.stats.range, 2.5)) return;
    this.loadout.tryCast(slot, this.ctx());
  }

  update() {
    const c = this.ctx();
    SLOT_IDS.forEach((slot, i) => {
      const p = this.loadout.preview(slot, c);
      if (!p) return;
      if (this.nameLabels[i]) this.nameLabels[i].string = p.displayName; // 组合可触发时名字会变，提示玩家
      const mask = this.cooldownMasks[i];
      if (mask) mask.fillRange = p.stats.cooldown > 0 ? this.loadout.cooldownLeft(slot, c.now) / p.stats.cooldown : 0;
    });
  }

  /** SkillExecutor：表现 + 命中判定 */
  execute(skill: ResolvedSkill) {
    const anim = CAST_ANIM[skill.shape];
    this.player?.onCast(anim.clip, anim.lock);
    const me = this.player?.node.worldPosition;
    const target = this.targeting?.current ?? null;
    if (!me) return;

    let hits: Enemy[] = [];
    switch (skill.shape) {
      case 'single':
        if (target) hits = [target];
        break;
      case 'dash':
        if (target) { // 冲到目标面前
          Vec3.subtract(this.tmp, me, target.node.worldPosition).normalize().multiplyScalar(1.5).add(target.node.worldPosition);
          this.player!.node.setWorldPosition(this.tmp);
          hits = [target];
        }
        break;
      case 'circle':
        hits = [...Enemy.all].filter(e => e.alive && Vec3.distance(me, e.node.worldPosition) <= skill.stats.radius);
        break;
      case 'projectile':
        // TODO: 生成投射物预制体；这里先按“主目标 + 附近 N-1 个”即时结算
        if (target) {
          const others = [...Enemy.all].filter(e => e !== target && e.alive && Vec3.distance(target.node.worldPosition, e.node.worldPosition) < 6);
          hits = [target, ...others.slice(0, skill.stats.projectileCount - 1)];
        }
        break;
      case 'cone': case 'line':
        hits = target ? [target] : []; // TODO: 扇形/直线检测
        break;
    }
    // 伤害 + 灼烧/减速/眩晕/燃烧地面/吸血/爆炸/重置冷却 全部交给 EffectSystem
    if (this.player) CombatManager.instance?.fx.applySkill(skill, this.player, hits);

    // 击退：表现层处理
    const kb = skill.effects.find(e => e.type === 'knockback');
    if (kb && kb.type === 'knockback') hits.forEach(e => {
      if (!e.alive) return;
      Vec3.subtract(this.tmp, e.node.worldPosition, me).normalize().multiplyScalar(kb.distance).add(e.node.worldPosition);
      e.node.setWorldPosition(this.tmp);
    });
    // TODO: 技能特效颜色按 skill.element：火=橙，冰=蓝，暗影=紫，神圣=金，自然=绿
  }
}
