// 等级 + 天赋管理器（单例）：场景里放一个空节点挂上
// 杀怪加经验 → 升级给天赋点 → 天赋变化同步到技能栏；自动存档
import { _decorator, Component, sys } from 'cc';
import { TalentTree, Progression, TalentSave, LevelSave, MAX_LEVEL } from '../core/TalentTree';
import { WARRIOR_TREE } from '../data/talents_warrior';
import { syncCharacter } from './CharacterSync';
const { ccclass, property } = _decorator;

const SAVE_KEY = 'rpg_progress_v2';   // v2：三系专精天赋（v1 的单树天赋不再读取，等级保留、点数全退）
const OLD_KEY = 'rpg_progress_v1';

@ccclass('ProgressionManager')
export class ProgressionManager extends Component {
  static instance: ProgressionManager | null = null;

  @property maxLevel = MAX_LEVEL;
  /** 旧存档迁移后需要提示一次「天赋已重置」 */
  talentResetNotice = false;

  progression!: Progression;
  tree!: TalentTree;
  readonly listeners = new Set<() => void>();
  /** 升级提示（接 Toast / 升级特效） */
  onLevelUp: ((level: number) => void) | null = null;

  onLoad() {
    ProgressionManager.instance = this;
    this.progression = new Progression(this.maxLevel);
    this.tree = new TalentTree(WARRIOR_TREE, 0);
    let raw = sys.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      const old = sys.localStorage.getItem(OLD_KEY);
      if (old) {
        try { const o = JSON.parse(old) as { level: LevelSave }; raw = JSON.stringify({ level: o.level, talents: {} }); this.talentResetNotice = true; } catch { /* 忽略 */ }
      }
    }
    if (raw) {
      try {
        const s = JSON.parse(raw) as { level: LevelSave; talents: TalentSave };
        this.progression.load(s.level);
        this.tree.totalPoints = this.progression.talentPoints;
        this.tree.load(s.talents);
      } catch { /* 存档损坏当新号 */ }
    }
    this.progression.onLevelUp = lv => { this.tree.totalPoints = this.progression.talentPoints; this.onLevelUp?.(lv); };
    this.tree.onChange = () => this.changed();
  }
  start() { this.scheduleOnce(() => syncCharacter(), 0); }
  onDestroy() { if (ProgressionManager.instance === this) ProgressionManager.instance = null; }

  addXp(n: number) { this.progression.addXp(n); this.changed(); }

  private changed() {
    syncCharacter();
    sys.localStorage.setItem(SAVE_KEY, JSON.stringify({ level: this.progression.save(), talents: this.tree.save() }));
    this.listeners.forEach(f => f());
  }
}
