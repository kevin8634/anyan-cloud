// Boss：继承 Enemy，换成 BossBrain，并负责红圈、读条条、Boss 血条、喊话、召唤
import { _decorator, Node, Prefab, instantiate, Label, Sprite, Vec3 } from 'cc';
import { Enemy } from './Enemy';
import { CombatManager } from './CombatManager';
import { BossBrain, BossIntent } from '../core/BossBrain';
import { EnemyConfig } from '../core/EnemyBrain';
import { BOSSES } from '../data/dungeon_darkrock';
const { ccclass, property } = _decorator;

@ccclass('Boss')
export class Boss extends Enemy {
  @property({ tooltip: '配置表里的 Boss id，如 grok' }) bossId = 'grok';

  @property({ type: Prefab, tooltip: '红圈：按半径 1 制作；子节点 fill 会从 0 放大到 1 表示倒计时' })
  telegraphPrefab: Prefab | null = null;
  @property clipCast = 'cast';
  @property(Prefab) summonPrefab: Prefab | null = null;   // 召唤的小怪（挂 Enemy）

  // 屏幕顶部 Boss 面板（Canvas 下）
  @property(Node) bossPanel: Node | null = null;
  @property(Label) bossNameLabel: Label | null = null;
  @property(Sprite) bossHpFill: Sprite | null = null;
  @property(Node) castBarRoot: Node | null = null;
  @property(Sprite) castBarFill: Sprite | null = null;
  @property(Label) castLabel: Label | null = null;
  @property(Label) yellLabel: Label | null = null;

  readonly ccImmune = true;   // Boss 不吃眩晕/减速，但能被打断
  private telegraphs = new Map<number, { node: Node; fill: Node | null; total: number; left: number }>();

  protected createBrain(cfg: EnemyConfig) {
    const def = BOSSES[this.bossId];
    this.displayName = def.name;
    const fx = () => CombatManager.instance?.fx;
    return new BossBrain(this, this.getPos(), { ...def, config: { ...def.config, ...cfg, patrolRadius: 0 } },
      (target, dmg, el, effect) => {
        fx()?.dealDamage(target, dmg, el, this);
        if (effect?.type === 'slow') target.status.add({ key: 'boss-slow', kind: 'slow', remaining: effect.duration, percent: effect.percent, source: this });
        if (effect?.type === 'stun') target.status.add({ key: 'stun', kind: 'stun', remaining: effect.duration, source: this });
      },
      {
        onTelegraph: (id, pos, radius, duration) => this.spawnTelegraph(id, new Vec3(pos.x, 0.06, pos.z), radius, duration),
        onTelegraphResolve: (id) => { const t = this.telegraphs.get(id); t?.node.isValid && t.node.destroy(); this.telegraphs.delete(id); },
        onCastStart: (name) => { if (this.castLabel) this.castLabel.string = name; this.play(this.clipCast, true); },
        onCastEnd: (name, ok) => { if (!ok) this.yell(`${name} 被打断！`, 1.5); },
        onPhase: (ph) => ph.yell && this.yell(`${this.displayName}：${ph.yell}`, 3),
        onSummon: (n) => this.summon(n),
        onReset: () => this.yell('', 0),
      });
  }

  onEnable() {
    super.onEnable();
    if (this.bossNameLabel) this.bossNameLabel.string = this.displayName;
    if (this.bossPanel) this.bossPanel.active = false;
    if (this.castBarRoot) this.castBarRoot.active = false;
  }

  update(dt: number) {
    super.update(dt);
    const it = this.lastIntent as BossIntent | null;
    const inFight = !!it && (it.state === 'chase' || it.state === 'attack') && this.alive;
    if (this.bossPanel) this.bossPanel.active = inFight;
    if (this.bossHpFill) this.bossHpFill.fillRange = this.hp / this.maxHp;
    if (this.castBarRoot) this.castBarRoot.active = !!it?.casting;
    if (it?.casting && this.castBarFill) this.castBarFill.fillRange = it.casting.progress;
    // 红圈倒计时动画
    for (const t of this.telegraphs.values()) {
      t.left -= dt;
      const k = Math.min(1, 1 - t.left / t.total);
      t.fill?.setScale(k, 1, k);
    }
  }

  private spawnTelegraph(id: number, pos: Vec3, radius: number, duration: number) {
    if (!this.telegraphPrefab) return;
    const n = instantiate(this.telegraphPrefab);
    n.setParent(this.node.parent!);
    n.setWorldPosition(pos);
    n.setScale(radius, 1, radius);
    const fill = n.getChildByName('fill');
    fill?.setScale(0, 1, 0);
    this.telegraphs.set(id, { node: n, fill, total: duration, left: duration });
  }

  private summon(count: number) {
    if (!this.summonPrefab) return;
    for (let i = 0; i < count; i++) {
      const n = instantiate(this.summonPrefab);
      n.setParent(this.node.parent!);
      const a = (i / count) * Math.PI * 2;
      const p = this.node.worldPosition;
      n.setWorldPosition(p.x + Math.cos(a) * 4, p.y, p.z + Math.sin(a) * 4);
      const e = n.getComponent(Enemy);
      if (e) { e.encounterId = this.encounterId; this.scheduleOnce(() => e.provoke(), 0); }
    }
  }

  private yell(text: string, seconds: number) {
    if (!this.yellLabel) return;
    this.yellLabel.string = text;
    this.yellLabel.node.active = !!text;
    this.unschedule(this.hideYell);
    if (seconds > 0) this.scheduleOnce(this.hideYell, seconds);
  }
  private hideYell = () => { if (this.yellLabel) this.yellLabel.node.active = false; };

  onDeath() {
    super.onDeath();
    if (this.bossPanel) this.bossPanel.active = false;
    this.yell(`${this.displayName} 被击败了！`, 3);
  }
}
