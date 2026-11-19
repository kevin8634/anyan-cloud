// v0.6.2：给掉落的装备打上来源（提示框显示「来源：…」，一键分解的保护选项也看它）
import { ItemInstance } from '../core/Loot';
import { WILD, isWildId } from '../data/zones_wild';

const DUNGEON_OF: Record<string, string> = { boss_grok: '暗岩矿洞', trash: '暗岩矿洞', boss_rotroot: '腐沼神殿', trash_swamp: '腐沼神殿' };

export function tagItems(items: ItemInstance[], tier: NonNullable<ItemInstance['tier']>, source: string) {
  for (const it of items) { it.tier = tier; it.source = source; }
}

/** 按掉落表 + 所在区域推断来源 */
export function tagByTable(items: ItemInstance[], table: string, zone: string, mobName: string, raidName = '长副本') {
  if (zone === 'raid') return tagItems(items, 'raid', raidName);
  if (zone === 'dungeon') return tagItems(items, 'dungeon', DUNGEON_OF[table] ?? '副本');
  if (table.startsWith('elite_')) return tagItems(items, 'elite', `野外首领 · ${mobName}`);
  const map = zone === 'field' ? '翠风原野' : isWildId(zone) ? WILD[zone].name : '野外';
  tagItems(items, 'wild', map);
}
