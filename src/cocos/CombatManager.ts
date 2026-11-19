// 战斗管理器：场景里放一个空节点挂上它（单例）
// 负责：持有 EffectSystem、每帧推进状态/地面区域、提供单位查询、生成地面特效
import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { CombatUnit, CombatWorld, EffectSystem, Pos } from '../core/Combat';
import { Element, SlotId } from '../core/types';
const { ccclass, property } = _decorator;

/** 各单位注册进来；玩家的 Loadout 也注册，用于 resetCooldown */
export interface CooldownOwner { resetCooldown(slot: SlotId): void; }

@ccclass('CombatManager')
export class CombatManager extends Component implements CombatWorld {
  static instance: CombatManager | null = null;

  /** 地面区域特效预制体（可选）：按元素取，没有就用 default */
  @property(Prefab) zoneFireFx: Prefab | null = null;
  @property(Prefab) zoneFrostFx: Prefab | null = null;
  @property(Prefab) zoneDefaultFx: Prefab | null = null;
  @property(Prefab) explodeFx: Prefab | null = null;

  readonly fx = new EffectSystem(this);
  private all = new Set<CombatUnit>();
  private cdOwners = new Map<CombatUnit, CooldownOwner>();

  onLoad() { CombatManager.instance = this; }
  onDestroy() { if (CombatManager.instance === this) CombatManager.instance = null; }

  register(u: CombatUnit, cd?: CooldownOwner) { this.all.add(u); if (cd) this.cdOwners.set(u, cd); }
  unregister(u: CombatUnit) { this.all.delete(u); this.cdOwners.delete(u); }

  // ----- CombatWorld -----
  units(): Iterable<CombatUnit> { return this.all; }
  resetCooldown(owner: CombatUnit, slot: SlotId) { this.cdOwners.get(owner)?.resetCooldown(slot); }

  onZoneSpawn(pos: Pos, radius: number, element: Element, duration: number) {
    const prefab = element === 'fire' ? this.zoneFireFx : element === 'frost' ? this.zoneFrostFx : this.zoneDefaultFx;
    this.spawnFx(prefab ?? this.zoneDefaultFx, pos, radius, duration);
  }
  onExplode(pos: Pos, radius: number, _element: Element) { this.spawnFx(this.explodeFx, pos, radius, 1); }

  private spawnFx(prefab: Prefab | null, pos: Pos, radius: number, life: number) {
    if (!prefab) return;
    const n: Node = instantiate(prefab);
    n.setParent(this.node);
    n.setWorldPosition(new Vec3(pos.x, 0.05, pos.z));
    n.setScale(radius, 1, radius);   // 预制体按半径 1 制作
    this.scheduleOnce(() => n.isValid && n.destroy(), life);
  }

  update(dt: number) { this.fx.update(dt); }
}

/** Cocos 节点位置 → 战斗坐标 */
export const toPos = (n: Node): Pos => ({ x: n.worldPosition.x, z: n.worldPosition.z });
