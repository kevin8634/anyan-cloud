// ========== 副本进度（引擎无关） ==========
// 副本 = 若干个按顺序的“遭遇战”。清完一个遭遇战，下一个的门打开；Boss 死亡 = 通关。
export interface EncounterDef {
  id: string;
  name: string;
  kind: 'trash' | 'boss';
}

export interface DungeonDef {
  id: string;
  name: string;
  recommendedLevel: number;
  encounters: EncounterDef[];
}

export interface DungeonEvents {
  onEncounterCleared?(e: EncounterDef, index: number): void;
  onCompleted?(d: DungeonDef, seconds: number): void;
  onWipe?(): void;
}

export class DungeonRun {
  /** 每个遭遇战还活着的怪的 uid */
  private alive: Set<string>[];
  current = 0;
  completed = false;
  elapsed = 0;

  constructor(readonly def: DungeonDef, private events: DungeonEvents = {}) {
    this.alive = def.encounters.map(() => new Set());
  }

  /** 场景加载时登记每只怪属于哪个遭遇战；召唤出来的小怪也可以登记进 Boss 遭遇战 */
  addUnit(encounterId: string, uid: string) {
    const i = this.def.encounters.findIndex(e => e.id === encounterId);
    if (i >= 0) this.alive[i].add(uid);
  }

  isUnlocked(encounterId: string) {
    return this.def.encounters.findIndex(e => e.id === encounterId) <= this.current;
  }

  onUnitDeath(uid: string) {
    if (this.completed) return;
    this.alive.forEach(s => s.delete(uid));
    // 当前遭遇战清空就推进（连续推进，处理空遭遇战）
    while (!this.completed && this.alive[this.current].size === 0) {
      const e = this.def.encounters[this.current];
      this.events.onEncounterCleared?.(e, this.current);
      if (e.kind === 'boss' && this.current === this.def.encounters.length - 1) {
        this.completed = true;
        this.events.onCompleted?.(this.def, this.elapsed);
      } else this.current++;
    }
  }

  onPlayerDeath() { this.events.onWipe?.(); }

  update(dt: number) { if (!this.completed) this.elapsed += dt; }
}
