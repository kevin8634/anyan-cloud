// 商店 / 强化 / 分解（Cocos 侧薄封装）：逻辑全部在 core/Forge.ts，背包用 LootManager 的 Inventory（随它一起存档）
// 场景：Canvas 下放 ShopPanel 节点挂本组件；商人 NPC 的对话按钮 → ShopManager.instance.open()
// 界面（货架列表、强化/分解按钮）按 BagUI 的做法自行搭建，调用下面的方法即可
import { _decorator, Component, Node } from 'cc';
import { Forge, Shop, ShopOffer, UpgradeResult } from '../core/Forge';
import { FORGE_DATA } from '../data/shop';
import { LootManager } from './LootManager';
import { PlayerController } from './PlayerController';
import { ProgressionManager } from './ProgressionManager';
const { ccclass, property } = _decorator;

@ccclass('ShopManager')
export class ShopManager extends Component {
  static instance: ShopManager | null = null;
  @property({ type: Node, tooltip: '商店面板根节点（打开时显示）' }) panel: Node | null = null;
  forge!: Forge;
  shop!: Shop;
  /** 界面刷新回调（货架、金币、材料变化） */
  onChange: (() => void) | null = null;
  private potionReadyAt = 0;

  onLoad() { ShopManager.instance = this; }
  start() {
    const lm = LootManager.instance!;
    this.forge = new Forge(FORGE_DATA, lm.inventory);
    this.shop = new Shop(FORGE_DATA, lm.inventory, lm.gen);
    lm.listeners.add(() => this.onChange?.());
  }
  onDestroy() { if (ShopManager.instance === this) ShopManager.instance = null; }

  open() {
    this.shop.restock(ProgressionManager.instance?.progression.level ?? 1);
    if (this.panel) this.panel.active = true;
    this.onChange?.();
  }
  close() { if (this.panel) this.panel.active = false; }

  get offers(): ShopOffer[] { return this.shop.offers; }
  buy(index: number, count = 1) { const ok = this.shop.buy(index, count); this.onChange?.(); return ok; }
  sell(uid: string) { return this.shop.sell(uid); }
  upgrade(uid: string): UpgradeResult { return this.forge.upgrade(uid); }
  salvage(uid: string) { return this.forge.salvage(uid); }
  salvageJunk() { return this.forge.salvageBelow('green'); }

  /** 喝药（技能栏药水按钮）：优先小药水，12 秒共享冷却 */
  usePotion(nowSec: number) {
    const p = PlayerController.instance;
    if (!p?.alive || nowSec < this.potionReadyAt) return false;
    const inv = LootManager.instance!.inventory;
    const id = inv.stack('potion_s') > 0 ? 'potion_s' : 'potion_l';
    const v = this.forge.usePotion(id, p.maxHp);
    if (!v) return false;
    p.hp = Math.min(p.maxHp, p.hp + v);
    this.potionReadyAt = nowSec + (this.forge.stackDef(id)?.cooldown ?? 12);
    return true;
  }
}
