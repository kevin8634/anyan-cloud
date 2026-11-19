// 把 天赋 + 装备 汇总到 技能栏(Loadout) 和 玩家属性 上。
// 天赋或装备任何一方变化都调用 syncCharacter()
import { LootManager } from './LootManager';
import { ProgressionManager } from './ProgressionManager';
import { SkillBarController } from './SkillBarController';
import { PlayerController } from './PlayerController';

export function syncCharacter() {
  const loadout = SkillBarController.instance?.loadout;
  const inv = LootManager.instance?.inventory;
  const tree = ProgressionManager.instance?.tree;
  if (loadout) {
    loadout.setItems(inv?.equippedItems() ?? []);
    loadout.setTalents(tree?.activeNodes() ?? []);
  }
  const base = PlayerController.instance?.baseMaxHp ?? 1000;
  const g = inv?.stats() ?? { hp: 0, armor: 0 };      // 装备（Inventory 基础属性设为 0，只算装备）
  const t = tree?.charStats() ?? { hp: 0, armor: 0 };
  PlayerController.instance?.applyStats(base + g.hp + t.hp, g.armor + t.armor);
}
