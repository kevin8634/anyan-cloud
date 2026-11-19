// 副本注册表：长副本（阶段六）+ v0.6.5 起的三首领普通副本（kind = 'dungeon'）
import { MOLTEN_THRONE, RaidDef, RaidId } from './raid_molten';
import { FROST_CRYPT } from './raid_frost';
import { NEW_DUNGEON_DEFS } from './dungeon_new';
const N = NEW_DUNGEON_DEFS();
export const RAIDS: Record<RaidId, RaidDef> = { molten_throne: MOLTEN_THRONE, frost_crypt: FROST_CRYPT, sand_tomb: { id: 'sand_tomb', ...N.sand_tomb }, troll_cave: { id: 'troll_cave', ...N.troll_cave }, ash_forge: { id: 'ash_forge', ...N.ash_forge } };
export const isDungeonRaid = (id: string) => RAIDS[id as RaidId]?.kind === 'dungeon';
