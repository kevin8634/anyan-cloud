// ======================================================================
// fix1109 #4（Rhett 11-09 17:45）：传回营地的落点挪到营地内部空地
//   本体所有「回营地」落点（传送阵传送 / 死亡复活 / 回程 / 读档 / ctx.goMap 不给坐标）都是「传送阵中心 + (2.5, 0)」（src/web/travel.ts，本体不改）：
//   倒钟广场 / 钟楼脚下 / 熔炉入口 / 井口的传送阵在营地东侧靠栅栏，+2.5 米落在栅栏外或栅栏上，潮痕营地贴着传送阵模型。
//   做法（只改 DLC）：每帧看玩家是否「一帧内跳了 > 6 米且正好落在本体落点上（±0.05 米）」→ 同帧挪到本营地的落点 LAND。
//   正常走路经过本体落点不会触发（没有跳变）。DLC 自己的落点（评委跳转、副本起点）直接用 LAND。
//   LAND = 营地局部坐标（相对营地中心），按营地半径 r、篝火 / 帐篷 / 货箱 / 旗 / NPC / 拾荒营件 / 传送阵算的空地：
//     离围墙内侧 ≥ 4.6 米、离传送阵中心 ≥ 7 米、离篝火中心 ≥ 2.8 米、帐篷 ≥ 3.4 米、NPC ≥ 2 米、拾荒营件 ≥ 1.3 米（按区域定义数据 0.1 米网格搜索）
// ======================================================================

/** 营地 id → 落点（营地局部坐标）。改营地布局时同步改这里 */
export const CAMP_LAND: Record<string, { x: number; z: number }> = {
  cs_camp: { x: -0.9, z: 5.1 },   // 潮痕营地（r 12）：篝火南侧，避开两顶帐篷 / 货箱 / 维克
  mr_camp: { x: -0.9, z: 5.1 },   // 倒钟广场（r 12）：篝火南侧，避开奥塔 / 米拉 / 帐篷 / 铁砧角 / 南门船灯
  bt_camp: { x: -3.9, z: 3.4 },   // 钟楼脚下（r 12）：篝火西南，避开帐篷 / 货箱 / 卡戎
  fg_camp: { x: -3.2, z: -2.2 },  // 熔炉入口（r 10）：篝火西北，避开货箱 / 熔炉侧篝火
  wl_camp: { x: -1.0, z: 2.7 },   // 井口（r 8）：篝火南侧，避开伊奥拉
};

type Camp = { id: string; x: number; z: number; waypoint: { x: number; z: number } };
type Def = { id: string; origin: { x: number; z: number }; camps: Camp[] };
type Ctx = { map(): string; playerPos(): { x: number; z: number }; teleport(x: number, z: number): void };

let ctx: Ctx | null = null;
const byMap = new Map<string, { from: { x: number; z: number }; to: { x: number; z: number } }[]>();
let last: { x: number; z: number; map: string } | null = null;
export const campLandStats = { moved: 0, last: '' };

/** 世界坐标落点（DLC 自己的跳转 / 副本起点用） */
export function campLandWorld(def: Def, campId: string): { x: number; z: number } {
  const c = def.camps.find(k => k.id === campId) ?? def.camps[0], l = CAMP_LAND[c.id];
  return l ? { x: def.origin.x + c.x + l.x, z: def.origin.z + c.z + l.z } : { x: def.origin.x + c.waypoint.x + 2.5, z: def.origin.z + c.waypoint.z };
}
/** 营地局部坐标 → 区域局部坐标（副本 start 用，start 是相对区域原点的） */
export function campLandLocal(camp: { x: number; z: number; id: string }): { x: number; z: number } {
  const l = CAMP_LAND[camp.id]; return l ? { x: camp.x + l.x, z: camp.z + l.z } : { x: camp.x, z: camp.z };
}
export function bindCampLand(c: Ctx, defs: Def[]) {
  ctx = c; byMap.clear(); last = null;
  for (const d of defs) byMap.set(d.id, d.camps.filter(k => CAMP_LAND[k.id]).map(k => ({
    from: { x: d.origin.x + k.waypoint.x + 2.5, z: d.origin.z + k.waypoint.z },   // 本体落点（travel.ts：传送阵 + 2.5）
    to: campLandWorld(d, k.id) })));
}
export function campLandUpdate() {
  if (!ctx) return;
  const map = ctx.map(), p = ctx.playerPos(), L = byMap.get(map);
  const jumped = !last || last.map !== map || Math.hypot(p.x - last.x, p.z - last.z) > 6;
  if (L && jumped) for (const e of L) if (Math.abs(p.x - e.from.x) < 0.05 && Math.abs(p.z - e.from.z) < 0.05) {
    ctx.teleport(e.to.x, e.to.z); campLandStats.moved++; campLandStats.last = `${map} ${e.to.x.toFixed(1)},${e.to.z.toFixed(1)}`;
    last = { x: e.to.x, z: e.to.z, map }; return;
  }
  last = { x: p.x, z: p.z, map };
}
