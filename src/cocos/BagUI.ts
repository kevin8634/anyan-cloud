// 背包界面：16 个穿戴格（顺序同 EQUIP_SLOTS），右边背包网格，点击装备弹出详情（对比 + 穿戴/出售）
// 节点结构见 README「背包界面」
import { _decorator, Component, Node, Prefab, instantiate, Label, Button, Color, Sprite } from 'cc';
import { ItemInstance, QUALITY_COLOR, QUALITY_NAME } from '../core/Loot';
import { EQUIP_SLOTS, EQUIP_SLOT_NAME, SLOT_NAME } from '../core/Inventory';
import { LootManager } from './LootManager';
import { PlayerController } from './PlayerController';
const { ccclass, property } = _decorator;

@ccclass('BagUI')
export class BagUI extends Component {
  @property(Node) panel: Node | null = null;                 // 整个背包面板（开关它）
  @property({ type: Prefab, tooltip: '格子预制体：根节点 Button + 子节点 frame(Sprite 品质框) + name(Label)' })
  cellPrefab: Prefab | null = null;
  @property(Node) bagGrid: Node | null = null;               // 背包网格父节点（挂 Layout GRID）
  @property({ type: [Node], tooltip: '穿戴格 16 个，顺序：头部 项链 肩部 披风 胸甲 护腕 手套 腰带 腿甲 鞋子 戒指1 戒指2 饰品1 饰品2 主手 副手' }) equipCells: Node[] = [];
  @property(Label) goldLabel: Label | null = null;
  @property(Label) statsLabel: Label | null = null;          // 生命 / 护甲

  // 详情弹窗
  @property(Node) detail: Node | null = null;
  @property(Label) detailTitle: Label | null = null;
  @property(Label) detailBody: Label | null = null;
  @property(Button) equipButton: Button | null = null;
  @property(Button) sellButton: Button | null = null;

  private selected: ItemInstance | null = null;
  private refreshFn = () => this.refresh();

  start() {
    LootManager.instance?.listeners.add(this.refreshFn);
    this.equipButton?.node.on(Button.EventType.CLICK, () => { if (this.selected) LootManager.instance?.equip(this.selected.id); this.closeDetail(); });
    this.sellButton?.node.on(Button.EventType.CLICK, () => { if (this.selected) LootManager.instance?.sell(this.selected.id); this.closeDetail(); });
    if (this.panel) this.panel.active = false;
    this.closeDetail();
  }
  onDestroy() { LootManager.instance?.listeners.delete(this.refreshFn); }

  // 按钮绑定
  toggle() { if (this.panel) { this.panel.active = !this.panel.active; if (this.panel.active) this.refresh(); } }
  sellJunk() { LootManager.instance?.sellJunk(); }
  closeDetail() { this.selected = null; if (this.detail) this.detail.active = false; }

  refresh() {
    const lm = LootManager.instance;
    if (!lm || !this.panel?.active) return;
    const inv = lm.inventory;
    if (this.goldLabel) this.goldLabel.string = `${inv.gold}`;
    const pc = PlayerController.instance;   // 显示最终属性（基础 + 装备 + 天赋）
    const hp = pc?.maxHp ?? 0, armor = pc?.armor ?? 0;
    if (this.statsLabel) this.statsLabel.string = `生命 ${hp}   护甲 ${armor}（物理减伤 ${Math.round(armor / (armor + 400) * 100)}%）`;

    EQUIP_SLOTS.forEach((slot, i) => this.fillCell(this.equipCells[i], inv.equipped[slot] ?? null, EQUIP_SLOT_NAME[slot], true));

    if (this.bagGrid && this.cellPrefab) {
      // 格子数量固定为容量，不足补空格
      while (this.bagGrid.children.length < inv.capacity) instantiate(this.cellPrefab).setParent(this.bagGrid);
      this.bagGrid.children.forEach((cell, i) => this.fillCell(cell, inv.bag[i] ?? null, null, false));
    }
  }

  private fillCell(cell: Node | undefined, item: ItemInstance | null, emptyLabel: string | null, equipped: boolean) {
    if (!cell) return;
    const name = cell.getChildByName('name')?.getComponent(Label);
    const frame = cell.getChildByName('frame')?.getComponent(Sprite);
    if (name) name.string = item ? item.name : emptyLabel ?? '';
    if (frame) frame.color = Color.fromHEX(new Color(), item ? QUALITY_COLOR[item.quality] : '#444444');
    cell.off(Button.EventType.CLICK);
    if (item) cell.on(Button.EventType.CLICK, () => this.openDetail(item, equipped));
  }

  private openDetail(item: ItemInstance, equipped: boolean) {
    const inv = LootManager.instance!.inventory;
    this.selected = item;
    if (!this.detail) return;
    this.detail.active = true;
    if (this.detailTitle) {
      this.detailTitle.string = item.name;
      this.detailTitle.color = Color.fromHEX(new Color(), QUALITY_COLOR[item.quality]);
    }
    const lines = [`${QUALITY_NAME[item.quality]} · ${SLOT_NAME[item.slot]} · 装等 ${item.itemLevel}`];
    if (item.hp) lines.push(`生命 ${item.hp}`);
    if (item.armor) lines.push(`护甲 ${item.armor}`);
    lines.push('', ...item.lines);
    if (item.setId) lines.push('', '套装：狂怒战魂（2件：暴击率+4% 急速+3%；4件：旋风斩变为熔岩旋风斩）');
    if (!equipped) {
      const c = inv.compare(item);
      const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
      lines.push('', c.replaces ? `对比 ${c.replaces.name}：生命 ${sign(c.hp)}  护甲 ${sign(c.armor)}  装等 ${sign(c.itemLevel)}` : '该部位未穿戴装备');
      lines.push(`出售价格 ${item.sellPrice} 金币`);
    }
    if (this.detailBody) this.detailBody.string = lines.join('\n');
    if (this.equipButton) this.equipButton.node.active = !equipped;
    if (this.sellButton) this.sellButton.node.active = !equipped;
  }
}
