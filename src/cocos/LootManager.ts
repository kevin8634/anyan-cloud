// 掉落 + 背包管理器（单例）：场景里放一个空节点挂上
// - 怪物死亡时 dropAt() 在地上生成掉落物，玩家走近自动拾取
// - 背包/穿戴变化 → 更新技能变种(Loadout)、玩家生命/护甲、背包界面，并自动存档
// - 存档用 sys.localStorage，微信小游戏里同样可用（底层是 wx.setStorageSync）
import { _decorator, Component, Node, Prefab, instantiate, Vec3, sys } from 'cc';
import { LootGenerator, ItemInstance } from '../core/Loot';
import { Inventory, InventorySave, migrateInventoryV3 } from '../core/Inventory';
import { CLASSES } from '../data/classes';
import { LOOT_DATA, LOOT_TABLES } from '../data/loot';
import { PlayerController } from './PlayerController';
import { syncCharacter } from './CharacterSync';
import { LootPickup } from './LootPickup';
const { ccclass, property } = _decorator;

const SAVE_KEY = 'rpg_inventory_v1';

@ccclass('LootManager')
export class LootManager extends Component {
  static instance: LootManager | null = null;

  @property({ type: Prefab, tooltip: '掉落物预制体：挂 LootPickup，带光柱和名字 Label' }) pickupPrefab: Prefab | null = null;
  @property pickupRadius = 1.5;

  readonly gen = new LootGenerator(LOOT_DATA);
  inventory!: Inventory;
  /** 背包界面等订阅 */
  readonly listeners = new Set<() => void>();
  /** 背包满、拾取到装备时的提示（接 Toast） */
  onToast: ((text: string, color?: string) => void) | null = null;

  private pickups = new Set<LootPickup>();

  onLoad() {
    LootManager.instance = this;
    this.inventory = new Inventory(30, { hp: 0, armor: 0 });
    this.inventory.rules = CLASSES.warrior.equip;   // Cocos 版目前只有战士：重甲、单手+盾/双持/双手
    const raw = sys.localStorage.getItem(SAVE_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw) as InventorySave;
        // 旧版 5 格存档（weapon/trinket…）迁移到 16 格
        const old = JSON.stringify(s).includes('"slot":"weapon"') || 'weapon' in s.equipped || 'trinket' in s.equipped;
        this.inventory.load(old ? migrateInventoryV3(s, 'warrior', LOOT_DATA) : s);
      } catch { /* 存档损坏就当新号 */ }
    }
    this.inventory.onChange = () => this.onInventoryChanged();
  }
  start() { this.scheduleOnce(() => this.onInventoryChanged(), 0); }   // 下一帧，等 SkillBar/Player 的 start 都跑完
  onDestroy() { if (LootManager.instance === this) LootManager.instance = null; }

  /** 怪物死亡时调用 */
  dropAt(tableId: string, pos: Readonly<Vec3>, itemLevel: number) {
    const table = LOOT_TABLES[tableId];
    if (!table) return;
    const r = this.gen.roll(table, itemLevel);
    r.stacks.forEach(st => { this.inventory.addStack(st.id, st.count); this.toast(`获得材料 ${st.id} ×${st.count}`, '#7FD7FF'); });   // 材料直接进背包
    const all: (ItemInstance | number)[] = [...r.items, r.gold];
    all.forEach((loot, i) => {
      if (!this.pickupPrefab) return;
      const n: Node = instantiate(this.pickupPrefab);
      n.setParent(this.node);
      const a = (i / all.length) * Math.PI * 2;   // 一圈散开
      n.setWorldPosition(pos.x + Math.cos(a) * 1.2, pos.y, pos.z + Math.sin(a) * 1.2);
      const p = n.getComponent(LootPickup)!;
      p.setup(loot);
      this.pickups.add(p);
    });
  }

  update() {
    const player = PlayerController.instance;
    if (!player?.alive) return;
    const me = player.node.worldPosition;
    for (const p of this.pickups) {
      if (Vec3.distance(me, p.node.worldPosition) > this.pickupRadius) continue;
      if (typeof p.loot === 'number') { this.inventory.addGold(p.loot); this.toast(`+${p.loot} 金币`, '#FFD100'); }
      else if (this.inventory.add(p.loot)) this.toast(`获得 ${p.loot.name}`, p.color);
      else { this.toast('背包已满'); continue; }
      this.pickups.delete(p);
      p.node.destroy();
    }
  }

  // ----- 给界面调用 -----
  equip(uid: string) { this.inventory.equip(uid); }
  sell(uid: string) { const g = this.inventory.sell(uid); if (g) this.toast(`出售 +${g} 金币`, '#FFD100'); }
  sellJunk() { const g = this.inventory.sellBelow('blue'); this.toast(g ? `出售蓝色及以下 +${g} 金币` : '没有可出售的装备', '#FFD100'); }

  private onInventoryChanged() {
    const inv = this.inventory;
    syncCharacter();   // 装备词条 + 天赋 → 技能栏、生命、护甲
    sys.localStorage.setItem(SAVE_KEY, JSON.stringify(inv.save()));
    this.listeners.forEach(f => f());
  }

  private toast(text: string, color?: string) { this.onToast?.(text, color); }
}
