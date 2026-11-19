// 地上的掉落物：光柱颜色 = 品质颜色，头顶显示名字
import { _decorator, Component, Label, Color, Node, MeshRenderer } from 'cc';
import { ItemInstance, QUALITY_COLOR } from '../core/Loot';
const { ccclass, property } = _decorator;

@ccclass('LootPickup')
export class LootPickup extends Component {
  @property(Label) nameLabel: Label | null = null;
  @property({ type: MeshRenderer, tooltip: '光柱模型（材质需有 mainColor）' }) beam: MeshRenderer | null = null;
  @property(Node) bobNode: Node | null = null;   // 上下浮动的模型

  loot: ItemInstance | number = 0;   // 数字 = 金币
  color = '#FFD100';
  private t = Math.random() * 6;

  setup(loot: ItemInstance | number) {
    this.loot = loot;
    this.color = typeof loot === 'number' ? '#FFD100' : QUALITY_COLOR[loot.quality];
    if (this.nameLabel) {
      this.nameLabel.string = typeof loot === 'number' ? `${loot} 金币` : loot.name;
      this.nameLabel.color = Color.fromHEX(new Color(), this.color);
    }
    // 绿装以下不显示光柱，紫橙光柱更高
    if (this.beam) {
      const q = typeof loot === 'number' ? 'gold' : loot.quality;
      this.beam.node.active = q === 'blue' || q === 'purple' || q === 'orange';
      this.beam.node.setScale(1, q === 'orange' ? 3 : q === 'purple' ? 2 : 1, 1);
      this.beam.material?.setProperty('mainColor', Color.fromHEX(new Color(), this.color));
    }
  }

  update(dt: number) {
    this.t += dt;
    this.bobNode?.setPosition(0, 0.3 + Math.sin(this.t * 3) * 0.1, 0);
  }
}
