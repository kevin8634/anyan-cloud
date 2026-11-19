// 副本控制器：挂在副本场景根节点上
// 登记每只怪属于哪个遭遇战 → 清完一波开对应的门 → Boss 死亡显示通关；玩家死亡显示失败
import { _decorator, Component, Node, Label, director } from 'cc';
import { DungeonRun } from '../core/Dungeon';
import { DUNGEONS } from '../data/dungeon_darkrock';
import { Enemy } from './Enemy';
import { PlayerController } from './PlayerController';
import { QuestManager } from './QuestManager';
const { ccclass, property } = _decorator;

@ccclass('DungeonController')
export class DungeonController extends Component {
  @property dungeonId = 'darkrock_mine';
  @property({ type: [Node], tooltip: '第 i 扇门挡住第 i+1 个遭遇战；清完第 i 个遭遇战时隐藏' })
  gates: Node[] = [];
  @property(Label) progressLabel: Label | null = null;   // 左上角：暗岩矿洞 1/3 矿洞入口
  @property(Node) resultPanel: Node | null = null;        // 通关/失败面板
  @property(Label) resultLabel: Label | null = null;

  private run!: DungeonRun;
  private ended = false;

  onLoad() {
    const def = DUNGEONS[this.dungeonId];
    this.run = new DungeonRun(def, {
      onEncounterCleared: (_e, i) => { if (this.gates[i]) this.gates[i].active = false; this.refresh(); },
      onCompleted: (d, sec) => {
        QuestManager.instance?.onDungeonClear(d.id);
        this.end(`${d.name} 通关！\n用时 ${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒`);
      },
      onWipe: () => this.end('你阵亡了\n点击重新挑战'),
    });
    // 敌人在 start 里登记（含召唤物），死亡时通知
    Enemy.onAnySpawn = e => e.encounterId && this.run.addUnit(e.encounterId, e.uid);
    Enemy.onAnyDeath = e => this.run.onUnitDeath(e.uid);
    if (this.resultPanel) this.resultPanel.active = false;
    this.refresh();
  }

  onDestroy() { Enemy.onAnySpawn = Enemy.onAnyDeath = null; }

  update(dt: number) {
    this.run.update(dt);
    const p = PlayerController.instance;
    if (p && !p.alive && !this.ended) this.run.onPlayerDeath();
  }

  /** 结果面板上的按钮绑定它 */
  restart() { director.loadScene(director.getScene()!.name); }

  private end(text: string) {
    this.ended = true;
    if (this.resultLabel) this.resultLabel.string = text;
    if (this.resultPanel) this.resultPanel.active = true;
    // TODO: 通关后发放 Boss 掉落、记录首通、任务进度
  }

  private refresh() {
    if (!this.progressLabel) return;
    const d = this.run.def, i = Math.min(this.run.current, d.encounters.length - 1);
    this.progressLabel.string = this.run.completed ? `${d.name}  已通关` : `${d.name}  ${i + 1}/${d.encounters.length}  ${d.encounters[i].name}`;
  }
}
