// 任务管理器（单例）+ 任务追踪栏 + NPC 对话框
// 场景：空节点挂 QuestManager；Canvas 下放 tracker(Label) 和 dialog 面板；NPC 节点挂 Npc 组件
import { _decorator, Component, Node, Label, Button, sys } from 'cc';
import { QuestLog, QuestDef, QuestSave } from '../core/Quest';
import { QUESTS, NPCS } from '../data/quests';
import { ProgressionManager } from './ProgressionManager';
import { LootManager } from './LootManager';
const { ccclass, property } = _decorator;

const SAVE_KEY = 'rpg_quests_v1';

@ccclass('QuestManager')
export class QuestManager extends Component {
  static instance: QuestManager | null = null;

  @property(Label) tracker: Label | null = null;          // 右上角任务追踪
  @property(Node) dialog: Node | null = null;             // 对话框面板
  @property(Label) dialogTitle: Label | null = null;
  @property(Label) dialogBody: Label | null = null;
  @property(Button) acceptButton: Button | null = null;   // 接受 / 完成 共用
  @property(Label) acceptLabel: Label | null = null;

  readonly log = new QuestLog(QUESTS);
  onToast: ((text: string, color?: string) => void) | null = null;
  private pending: { q: QuestDef; action: 'accept' | 'turnIn' } | null = null;
  private npc = '';

  get level() { return ProgressionManager.instance?.progression.level ?? 1; }

  onLoad() {
    QuestManager.instance = this;
    const raw = sys.localStorage.getItem(SAVE_KEY);
    if (raw) { try { this.log.load(JSON.parse(raw) as QuestSave); } catch { /* 忽略 */ } }
    this.log.events = {
      onProgress: (_q, text) => this.onToast?.(text, '#FFD100'),
      onReady: q => { this.onToast?.(`「${q.name}」可以交了`, '#33FF33'); this.save(); },
    };
    this.acceptButton?.node.on(Button.EventType.CLICK, () => this.confirm());
    if (this.dialog) this.dialog.active = false;
  }
  onDestroy() { if (QuestManager.instance === this) QuestManager.instance = null; }

  // ----- 外部事件 -----
  onKill(kind: string) { this.log.onKill(kind); this.refreshTracker(); }
  onDungeonClear(id: string) { this.log.onDungeonClear(id); this.refreshTracker(); this.save(); }

  /** Npc 组件被点击/靠近按交互时调用 */
  talk(npc: string) {
    this.npc = npc;
    this.log.onTalk(npc);
    const list = this.log.npcQuests(npc, this.level);
    const info = NPCS[npc];
    if (this.dialogTitle) this.dialogTitle.string = `${info.name} · ${info.title}`;
    const first = list.find(x => x.s === 'ready') ?? list.find(x => x.s === 'available') ?? list[0];
    if (!first) { this.show('暂时没有需要你帮忙的事。', null); return; }
    const { q, s } = first;
    if (s === 'available') this.show(`【${q.name}】\n${q.text}\n\n目标：${q.objectives.map(o => o.label).join('、')}\n奖励：${q.reward.xp} 经验 ${q.reward.gold} 金币`, { q, action: 'accept' });
    else if (s === 'ready') this.show(`【${q.name}】\n${q.doneText}`, { q, action: 'turnIn' });
    else this.show(`【${q.name}】\n还没完成呢。`, null);
  }

  closeDialog() { if (this.dialog) this.dialog.active = false; }

  private show(text: string, pending: QuestManager['pending']) {
    this.pending = pending;
    if (this.dialogBody) this.dialogBody.string = text;
    if (this.acceptButton) this.acceptButton.node.active = !!pending;
    if (this.acceptLabel && pending) this.acceptLabel.string = pending.action === 'accept' ? '接受任务' : '完成任务';
    if (this.dialog) this.dialog.active = true;
  }

  private confirm() {
    const p = this.pending;
    if (!p) return;
    if (p.action === 'accept') { this.log.accept(p.q.id, this.level); this.onToast?.(`接受任务：${p.q.name}`, '#FFD100'); }
    else {
      const r = this.log.turnIn(p.q.id, this.level);
      if (r) {
        const lm = LootManager.instance;
        lm?.inventory.addGold(r.gold);
        if (r.item && lm) lm.inventory.add(lm.gen.generate(this.level + 3, lm.gen.rollQuality(r.item.minQuality), r.item.slots));
        ProgressionManager.instance?.addXp(r.xp);
        this.onToast?.(`完成任务：${p.q.name}`, '#33FF33');
      }
    }
    this.save();
    this.refreshTracker();
    this.talk(this.npc);   // 刷新对话（可能接着有下一个任务）
  }

  refreshTracker() {
    if (!this.tracker) return;
    this.tracker.string = this.log.active().map(({ q, p, ready }) =>
      `${q.name}\n` + (ready ? `  ✔ 回去找${NPCS[q.turnIn].name}` : q.objectives.map((o, i) => `  ${this.log.objectiveText(o, p[i])}`).join('\n'))).join('\n');
  }

  private save() { sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.log.save())); }
}

/** NPC：玩家靠近显示交互按钮，点击开始对话；头顶标记 ! ? */
@ccclass('Npc')
export class Npc extends Component {
  @property npcId = 'bran';
  @property(Label) marker: Label | null = null;    // 头顶 ! / ?

  update() {
    const qm = QuestManager.instance;
    if (!qm || !this.marker) return;
    const m = qm.log.npcMarker(this.npcId, qm.level);
    this.marker.string = m === '…' ? '?' : m;
  }
  /** 交互按钮 / 点击 NPC 时调用 */
  interact() { QuestManager.instance?.talk(this.npcId); }
}
