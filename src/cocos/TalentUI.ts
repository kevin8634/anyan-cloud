// 天赋界面：三棵专精树并排（每棵 5 层 × 4 列），格子，点格子看详情、加点/退点；顶部显示等级、经验、剩余点数
import { _decorator, Component, Node, Prefab, instantiate, Label, Button, Color, Sprite } from 'cc';
import { TalentNodeDef } from '../core/TalentTree';
import { ProgressionManager } from './ProgressionManager';
const { ccclass, property } = _decorator;

const COLOR_ACTIVE = '#FFD100', COLOR_AVAILABLE = '#3FBF3F', COLOR_LOCKED = '#555555';

@ccclass('TalentUI')
export class TalentUI extends Component {
  @property(Node) panel: Node | null = null;
  @property({ type: Prefab, tooltip: '天赋格子：根节点 Button + 子节点 frame(Sprite) / name(Label) / rank(Label)' })
  nodePrefab: Prefab | null = null;
  @property(Node) gridRoot: Node | null = null;          // 格子父节点（不要挂 Layout，位置由代码摆）
  @property cellWidth = 90;
  @property cellHeight = 110;
  @property({ tooltip: '两棵树之间的间距' }) specGap = 40;

  @property(Label) levelLabel: Label | null = null;      // 等级 7
  @property(Sprite) xpFill: Sprite | null = null;        // 经验条（Filled 模式）
  @property(Label) pointsLabel: Label | null = null;     // 剩余天赋点 3

  @property(Node) detail: Node | null = null;
  @property(Label) detailTitle: Label | null = null;
  @property(Label) detailBody: Label | null = null;
  @property(Button) addButton: Button | null = null;
  @property(Button) removeButton: Button | null = null;

  private cells = new Map<string, Node>();
  private selected: TalentNodeDef | null = null;
  private refreshFn = () => this.refresh();

  start() {
    const pm = ProgressionManager.instance;
    if (!pm) return;
    pm.listeners.add(this.refreshFn);
    // 生成格子
    if (this.nodePrefab && this.gridRoot) {
      const specW = 4 * this.cellWidth + this.specGap, root = this.gridRoot;
      pm.tree.def.specs.forEach((sp, si) => sp.nodes.forEach(n => {
        const cell = instantiate(this.nodePrefab!);
        cell.setParent(root);
        cell.setPosition((si - 1) * specW + (n.col - 1.5) * this.cellWidth, -(n.row - 1) * this.cellHeight, 0);
        const name = cell.getChildByName('name')?.getComponent(Label);
        if (name) name.string = n.name;
        cell.on(Button.EventType.CLICK, () => this.openDetail(n));
        this.cells.set(n.id, cell);
      }));
    }
    this.addButton?.node.on(Button.EventType.CLICK, () => { if (this.selected) pm.tree.add(this.selected.id); });
    this.removeButton?.node.on(Button.EventType.CLICK, () => { if (this.selected) pm.tree.remove(this.selected.id); });
    if (this.panel) this.panel.active = false;
    this.closeDetail();
  }
  onDestroy() { ProgressionManager.instance?.listeners.delete(this.refreshFn); }

  // 按钮绑定
  toggle() { if (this.panel) { this.panel.active = !this.panel.active; this.refresh(); } }
  resetTalents() { ProgressionManager.instance?.tree.reset(); }
  closeDetail() { this.selected = null; if (this.detail) this.detail.active = false; }

  refresh() {
    const pm = ProgressionManager.instance;
    if (!pm || !this.panel?.active) return;
    const { progression: p, tree } = pm;
    if (this.levelLabel) this.levelLabel.string = `等级 ${p.level}`;
    if (this.xpFill) this.xpFill.fillRange = p.level >= p.maxLevel ? 1 : p.xp / p.xpToNext();
    if (this.pointsLabel) this.pointsLabel.string = `剩余天赋点 ${tree.available}　${tree.def.specs.map(s => `${s.name} ${tree.spentIn(s.id)}`).join(' / ')}`;

    for (const n of tree.nodes) {
      const cell = this.cells.get(n.id);
      if (!cell) continue;
      const r = tree.rank(n.id);
      const rank = cell.getChildByName('rank')?.getComponent(Label);
      if (rank) rank.string = n.kind === 'choice' ? (r ? '已选' : '') : `${r}/${n.maxRank}`;
      const frame = cell.getChildByName('frame')?.getComponent(Sprite);
      const color = r > 0 ? COLOR_ACTIVE : tree.whyCannotAdd(n.id) ? COLOR_LOCKED : COLOR_AVAILABLE;
      if (frame) frame.color = Color.fromHEX(new Color(), color);
    }
    if (this.selected) this.openDetail(this.selected);
  }

  private openDetail(n: TalentNodeDef) {
    const tree = ProgressionManager.instance!.tree;
    this.selected = n;
    if (!this.detail) return;
    this.detail.active = true;
    const r = tree.rank(n.id);
    if (this.detailTitle) this.detailTitle.string = `${n.name}${n.kind === 'rank' ? `  ${r}/${n.maxRank}` : n.kind === 'choice' ? '  （同层只能选一个）' : ''}${n.capstone ? '  【终极】' : ''}`;
    const lines: string[] = [];
    if (r > 0) lines.push(`当前：${tree.describe(n, r)}`);
    if (r < n.maxRank) lines.push(`${r > 0 ? '下一级' : '效果'}：${tree.describe(n, r + 1)}`);
    const sp = tree.specOf(n.id)!;
    if (n.row > 1) lines.push(`需要在「${sp.name}」投入 ${tree.tierNeed(n.row)} 点`);
    if (n.requires) lines.push(`前置：点满「${tree.node(n.requires)!.name}」`);
    const why = tree.whyCannotAdd(n.id);
    if (why && r < n.maxRank) lines.push('', `无法加点：${why}`);
    if (this.detailBody) this.detailBody.string = lines.join('\n');
    if (this.addButton) this.addButton.node.active = !why;
    if (this.removeButton) this.removeButton.node.active = !tree.whyCannotRemove(n.id);
  }
}
