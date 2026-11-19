// 世界地图数据：四个区域（灰石营地 / 翠风原野 / 暗岩矿洞 / 腐沼神殿）、区域之间的传送点、
// NPC 位置、任务目标所在的地点（击杀区域、探索地点）。任务追踪、寻路、地图界面共用（世界坐标）
import { Objective } from '../core/Quest';
import { withPacks, packList, PackZone } from '../core/ContentPacks';
import { MapPoint, MapLink } from '../core/QuestGuide';
import { FIELD_ORIGIN, FIELD_NPCS, FIELD_SPOTS, CHIEF_ROUTE, FIELD_WEST } from './zone_field';
import { WILD, WILD_IDS, WildId, wildW, wildAreas, WILD_KILL_AREA, FIELD_SERVICE_NPCS, PACK_WILD_IDS } from './zones_wild';

export type MapId = 'camp' | 'field' | 'darkrock_mine' | 'rotting_temple' | WildId;
export const MAP_ORIGIN: Record<MapId, { x: number; z: number }> = {
  camp: { x: 0, z: 0 }, field: FIELD_ORIGIN, darkrock_mine: { x: 400, z: 0 }, rotting_temple: { x: -400, z: 0 },
  star: WILD.star.origin, redsand: WILD.redsand.origin, frost: WILD.frost.origin, ember: WILD.ember.origin, foothill: WILD.foothill.origin, marsh: WILD.marsh.origin,
  ...Object.fromEntries(PACK_WILD_IDS.map(id => [id, WILD[id as WildId].origin])),   // v1.0.2 内容包野外
};
const F = FIELD_ORIGIN, D = MAP_ORIGIN.darkrock_mine, S = MAP_ORIGIN.rotting_temple;

export interface MapDef { id: MapId; name: string; kind: 'outdoor' | 'dungeon'; levels: string; view: { x0: number; z0: number; x1: number; z1: number }; desc: string }
const BASE_MAPS: Record<MapId, MapDef> = {
  camp: { id: 'camp', name: '灰石营地', kind: 'outdoor', levels: '1-6', view: { x0: -62, z0: -40, x1: 62, z1: 48 }, desc: '营地 · 狼林 · 北边区域传送阵 · 南门石门 · 东北暗岩山路 · 西南腐沼栈道' },
  field: { id: 'field', name: '翠风原野', kind: 'outdoor', levels: '9-16', view: { x0: F.x - FIELD_WEST - 2, z0: F.z - 122, x1: F.x + 122, z1: F.z + 122 }, desc: '翠风前哨 · 苇河 · 劫掠者营地 · 星落遗迹 · 麦穗村 · 坍塌神殿 · 风蚀高台 · 废矿坑' + (FIELD_WEST > 122 ? ' · 落霞湖' : '') },
  darkrock_mine: { id: 'darkrock_mine', name: '暗岩矿洞', kind: 'dungeon', levels: '4-8', view: { x0: D.x - 20, z0: D.z - 80, x1: D.x + 20, z1: D.z + 9 }, desc: '副本 · 监工格罗克' },
  rotting_temple: { id: 'rotting_temple', name: '腐沼神殿', kind: 'dungeon', levels: '8-12', view: { x0: S.x - 20, z0: S.z - 80, x1: S.x + 20, z1: S.z + 9 }, desc: '副本 · 腐根祭司' },
  ...Object.fromEntries(WILD_IDS.map(id => { const w = WILD[id], o = w.origin, h = w.half + 2; return [id, { id, name: w.name, kind: 'outdoor', levels: `${w.levels[0]}-${w.levels[1]}`, view: { x0: o.x - h, z0: o.z - h, x1: o.x + h, z1: o.z + h }, desc: w.desc }]; })) as Record<WildId, MapDef>,
};
/** v0.9.7：区域表 = 本体 + 内容包区域（没有包 = 本体表原对象）。包区域 id 不在 MapId 联合类型里 */
export const MAPS: Record<MapId, MapDef> = mergePackZones(BASE_MAPS);
function mergePackZones(base: Record<MapId, MapDef>): Record<MapId, MapDef> {
  const z = withPacks<PackZone>([], 'zones');
  if (!z.length) return base;
  const out: Record<string, MapDef> = { ...base };
  for (const d of z) if (!(d.id in out)) out[d.id] = { id: d.id as MapId, name: d.name, kind: d.kind, levels: d.levels, view: d.view, desc: d.desc };
  return out as Record<MapId, MapDef>;
}
/** 存档里的地图 id 在当前构建里是否认识（营地 / 原野 / 副本 / 野外 / 已注册包的区域；ember = 长副本入口） */
export const isKnownMap = (id: string | undefined | null): boolean => !!id && Object.prototype.hasOwnProperty.call(MAPS, id);
/** 内容包区域定义（带 enter 函数）；本体区域 / 不认识 → null */
export const packZone = (id: string): PackZone | null => packList<PackZone>('zones').find(z => z.id === id) ?? null;
/** 翠风原野东边通往赤砂裂谷的石门（局部坐标） */
export const FIELD_EAST_GATE = { x: 66, z: 4 };
/** v0.9.3e 翠风原野东侧（水车磨坊北面）通往星落高原的山径（局部坐标） */
export const FIELD_STAR_GATE = { x: 114, z: -30 };

/** v0.9.2b 营地通往两个副本区的路口（营地世界坐标） */
export const CAMP_GATES = { foothill: { x: 52, z: -30 }, marsh: { x: -52, z: 34 } } as const;

/** 传送点：from 区域里 (x,z) 处的传送门通往 to 区域 */
export const MAP_LINKS: MapLink[] = [
  { from: 'camp', to: 'field', x: 0, z: 40, name: '原野石门' },
  { from: 'field', to: 'camp', x: F.x, z: F.z + 70, name: '回营地的石门' },
  // v0.9.2b 暗岩矿洞 / 腐沼神殿搬进副本区：营地东北 / 西南的山路 → 副本区 → 门口传送阵
  { from: 'camp', to: 'foothill', x: CAMP_GATES.foothill.x, z: CAMP_GATES.foothill.z, name: '暗岩山路' },
  { from: 'camp', to: 'marsh', x: CAMP_GATES.marsh.x, z: CAMP_GATES.marsh.z, name: '腐沼栈道' },
  { from: 'foothill', to: 'darkrock_mine', ...wildW('foothill', 0, -34), name: '暗岩矿洞传送阵' },
  { from: 'marsh', to: 'rotting_temple', ...wildW('marsh', 0, -34), name: '腐沼神殿传送阵' },
  { from: 'darkrock_mine', to: 'camp', x: D.x, z: D.z + 5, name: '副本出口' },
  { from: 'rotting_temple', to: 'camp', x: S.x, z: S.z + 5, name: '副本出口' },
  { from: 'field', to: 'redsand', x: F.x + 66, z: F.z + 4, name: '赤砂石门' },
  { from: 'field', to: 'star', x: F.x + 114, z: F.z - 30, name: '星落山径' },
  ...WILD_IDS.flatMap(id => WILD[id].gates.map(g => ({ from: id, to: g.to, ...wildW(id, g.x, g.z), name: g.name }))),
];
export const FIELD_GATE = { x: 0, z: 40 };

/** NPC 所在位置 */
export const NPC_HOME: Record<string, MapPoint> = {
  bran: { map: 'camp', x: 3, z: 1 }, tom: { map: 'camp', x: 4, z: -28 }, ayla: { map: 'camp', x: -12, z: 5 }, gerda: { map: 'camp', x: 0, z: 12.8 },
  ...Object.fromEntries(Object.entries(FIELD_NPCS).map(([k, v]) => [k, { map: 'field', x: F.x + v.x, z: F.z + v.z }])),
  ...Object.fromEntries(WILD_IDS.flatMap(id => WILD[id].npcs.map(n => [n.id, { map: id, ...wildW(id, n.x, n.z) }]))),
  ...Object.fromEntries(FIELD_SERVICE_NPCS.map(n => [n.id, { map: 'field', x: F.x + n.x, z: F.z + n.z }])),
  kai: { map: 'camp', x: -3.6, z: 13.4 },
};

/** 地点：击杀区域、探索地点（r = 地图上的目标圈半径） */
export const AREAS: Record<string, MapPoint & { name: string }> = {
  wolf_wood: { map: 'camp', x: 36, z: 2, r: 16, name: '狼林' },
  mine_tunnel: { map: 'darkrock_mine', x: D.x, z: D.z - 35, r: 5, name: '塌方隧道' },
  mine_boss: { map: 'darkrock_mine', x: D.x, z: D.z - 62, r: 10, name: '监工格罗克' },
  swamp_causeway: { map: 'rotting_temple', x: S.x, z: S.z - 14, r: 6, name: '腐沼堤道' },
  swamp_nave: { map: 'rotting_temple', x: S.x, z: S.z - 36, r: 6, name: '沉没回廊' },
  swamp_boss: { map: 'rotting_temple', x: S.x, z: S.z - 62, r: 10, name: '腐根祭司' },
  boar_meadow: { map: 'field', x: F.x - 40, z: F.z + 28, r: 14, name: '野猪草甸' },
  bandit_camp: { map: 'field', x: F.x + FIELD_SPOTS.bandit.x, z: F.z + FIELD_SPOTS.bandit.z, r: 14, name: '劫掠者营地' },
  ruins: { map: 'field', x: F.x + FIELD_SPOTS.ruins.x, z: F.z + FIELD_SPOTS.ruins.z, r: 12, name: '星落遗迹' },
  ruins_altar: { map: 'field', x: F.x + FIELD_SPOTS.ruins.x, z: F.z + FIELD_SPOTS.ruins.z, r: 4.5, name: '星落祭坛' },
  chief_route: { map: 'field', x: CHIEF_ROUTE[0].x + 6, z: CHIEF_ROUTE[0].z - 8, r: 22, name: '赤鬃的游荡路线' },
  outpost: { map: 'field', x: F.x + FIELD_SPOTS.outpost.x, z: F.z + FIELD_SPOTS.outpost.z, r: 12, name: '翠风前哨' },
  // v0.9.3b 外环
  village: { map: 'field', x: F.x + FIELD_SPOTS.village.x, z: F.z + FIELD_SPOTS.village.z, r: 20, name: '麦穗村' },
  temple: { map: 'field', x: F.x + FIELD_SPOTS.temple.x, z: F.z + FIELD_SPOTS.temple.z, r: 16, name: '坍塌神殿' },
  mesa: { map: 'field', x: F.x + FIELD_SPOTS.mesa.x, z: F.z + FIELD_SPOTS.mesa.z, r: 14, name: '风蚀高台' },
  old_mine: { map: 'field', x: F.x + FIELD_SPOTS.mine.x, z: F.z + FIELD_SPOTS.mine.z, r: 12, name: '废矿坑' },
  ...wildAreas(),
};
/** 怪物种类 → 击杀区域 */
export const KILL_AREA: Record<string, string> = {
  wolf: 'wolf_wood', spider: 'mine_tunnel', miner: 'mine_tunnel', toad: 'swamp_causeway', treant: 'swamp_causeway', cultist: 'swamp_nave',
  boar: 'boar_meadow', raider: 'bandit_camp', archer: 'bandit_camp', golem: 'ruins', chief: 'chief_route', goldboar: 'boar_meadow',
  ...WILD_KILL_AREA,
  // v0.6.3 长副本故事链：指引到副本入口
  ...Object.fromEntries(['gorak', 'twins', 'samur', 'priest', 'valkaz'].map(b => [`raidboss_${b}`, 'molten_gate'])),
  ...Object.fromEntries(['keeper', 'vesra', 'wyrm', 'knights', 'ithran'].map(b => [`raidboss_${b}`, 'frost_gate'])),
};
const CLEAR_AREA: Record<string, string> = { darkrock_mine: 'mine_boss', rotting_temple: 'swamp_boss' };

/** 任务目标在哪里（没有固定地点返回 null） */
export function locateObjective(o: Objective): MapPoint | null {
  switch (o.type) {
    case 'kill': case 'collect': { const a = AREAS[KILL_AREA[o.target]]; return a ?? null; }
    case 'clear': return AREAS[CLEAR_AREA[o.dungeonId]] ?? null;
    case 'talk': return NPC_HOME[o.npc] ? { ...NPC_HOME[o.npc], r: 2.5 } : null;
    case 'explore': return AREAS[o.area] ?? null;
  }
}
/** 世界坐标属于哪个区域 */
export function mapAt(x: number, z: number): MapId {
  for (const id of PACK_WILD_IDS) { const w = WILD[id as WildId]; if (Math.abs(x - w.origin.x) <= w.half + 4 && Math.abs(z - w.origin.z) <= w.half + 4) return id as MapId; }   // v1.0.2 内容包野外（坐标由包自己选在本体区域之外）
  if (z > 1450) return 'ember';
  if (z > 1000) return 'frost';
  if (z > 600) return 'redsand';
  if (x > 200) return 'darkrock_mine';
  if (x < -200) return 'rotting_temple';
  if (z > 250) return 'field';
  return 'camp';
}
