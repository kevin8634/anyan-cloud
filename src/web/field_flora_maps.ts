// 11-15 本体野外写实草木：每张户外图的配方（草层 / 花 / 树种分配 / 灌丛 / 风），由 scenes.ts（营地、翠风原野）和 wild.ts（六张野外图）调用。
// 避让：道路、河面（芦苇只长在岸上）、建筑与营地物件（寻路圆 + 余量，边缘渐稀）、传送点 / 传送门、坡道与陡坡、冰湖 / 熔岩。
// 树的位置沿用原来的散布点（寻路障碍不变），只换成写实树种；灌丛不挡路（可被推开）。
import { FloraTree, FieldFloraOpt, ffFbm, ffSmooth, TreeKind, GrassLayer, FlowerSet, GroveOpt, DemoTreeOpt } from './field_flora';
import * as M from './models';
import { campIsPathV, fieldPathDistV } from './road2';
import { LAKE_ON, FIELD_WEST, LAKE_DOCK, RIVER_X0, lakeDist, lakeTreeOk } from '../data/field_lake';   // 11-19 落霞湖 qllake
import { FIELD_ORIGIN, FIELD_SPOTS, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD, BRIDGE2, FIELD_HALF, FIELD_RISES, fieldOnRamp, fieldSteep, fieldObstacles, fieldProps } from '../data/zone_field';
import type { WildDef } from '../data/zones_wild';
import { LEAF, type LeafRecipe } from './field_leaves';
import type { LushOpt } from './ql_lush';
// 11-19 花草繁茂 qllush（Rhett「花草繁茂」+ 秋林逆光截图）：营地外围 / 翠风原野 / 星落 / 山麓 / 腐沼加 Demo 近层繁茂草 + Demo 四种花（ql_lush.ts）。
//   花种 / 配色按区：原野 = Demo 原样（紫穗 / 黄五瓣 / 红罂粟 / 白雏菊）；营地 = 黄白为主 + 橙罂粟；星落 = 蓝紫穗为主（高山）+ 白 / 黄；
//   山麓 = 黄白为主 + 少量红 / 紫；腐沼 = 品红穗（千屈菜）+ 白 + 少量金黄，不长罂粟。赤砂 / 霜脊 / 烬落按地貌不铺。原有野花保留 0.6。?off=qllush 关
//   近层草密度（簇 / m²，每簇 12–16 根）按「原草层 + 繁茂层 ≈ Demo 高档近草 74 根 / m²」配：营地原本已约 60 → 1.0；原野约 40 → 2.0；星落约 28 → 3.0；山麓约 45 → 2.0；腐沼约 29 → 3.0
// 11-19 Demo 树（demo_trees.ts）：营地 / 星落 / 山麓 / 腐沼夏绿图集，原野秋林原色，霜脊只加 Demo 云杉；赤砂 / 烬落不加。
// 11-16 落叶：游戏没有季节 / 月份系统（日夜只有游戏时钟），按地图气候定：翠风原野秋色最多；营地 / 星落 / 山麓少量；
// 腐沼少量枯叶；霜脊 = 雪松上抖落的少量雪粒；烬落 = 焦树飘下的灰；赤砂不落。

const hsh = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
type Circ = { x: number; z: number; r: number };
/** 圆形障碍附近渐稀：r + pad0 内为 0，到 r + pad1 回到 1（8 米网格加速） */
function circleFade(cs: Circ[], pad0 = 0.3, pad1 = 2.2) {
  const G = 8, grid = new Map<string, Circ[]>();
  for (const c of cs) { const R = c.r + pad1; for (let gx = Math.floor((c.x - R) / G); gx <= Math.floor((c.x + R) / G); gx++) for (let gz = Math.floor((c.z - R) / G); gz <= Math.floor((c.z + R) / G); gz++) { const k = gx + ',' + gz; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(c); } }
  return (x: number, z: number) => { const l = grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)); if (!l) return 1; let w = 1; for (const c of l) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + pad1) w = Math.min(w, ffSmooth(c.r + pad0, c.r + pad1, d)); } return w; };
}
const pickKind = (h: number, table: [TreeKind, number][]): TreeKind => { let a = 0; for (const [k, p] of table) { a += p; if (h < a) return k; } return table[table.length - 1][0]; };

// ---------------------------------------------------------------- 灰石营地（夏绿）
export function campFloraOpt(trees: { x: number; z: number; s: number; ry: number; round: boolean }[], circles: Circ[], portals: Circ[]): FieldFloraOpt {
  const fade = circleFade([...circles, ...portals], 0.4, 2.4);
  const W = (x: number, z: number) => {
    if (campIsPathV(x, z, M.isPath) || (Math.abs(x) < 6 && z < -26)) return 0;   // 11-16e 新路形
    const gy = M.groundY(x, z); if (gy > 1.8) return 0;
    const nearPath = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dz]) => campIsPathV(x + dx, z + dz, M.isPath)) ? 0.35 : 1;   // 道路边缘渐稀
    return nearPath * fade(x, z) * (1 - ffSmooth(1.0, 1.8, gy));
  };
  const T: FloraTree[] = trees.map(t => {
    const h = hsh(t.x, t.z);
    const kind: TreeKind = t.round ? pickKind(h, [['broadleaf', 0.55], ['oak', 0.15], ['birch', 0.3]]) : pickKind(h, [['spruce', 0.8], ['birch', 0.2]]);
    return { x: t.x, z: t.z, kind, s: t.s, ry: t.ry, v: h > 0.5 ? 1 : 0 };
  });
  return {
    id: 'camp', area: [-90, -65, 90, 85], ground: (x, z) => M.groundY(x, z), grassW: W, trees: T,
    grass: [
      { count: 55000, seed: 11, hMin: 0.3, hMax: 0.85, dry: 0.25 },
      { count: 25000, seed: 13, hMin: 0.06, hMax: 0.2, dry: 0.2, cover: true },
    ],
    flowers: { count: 16000, seed: 17, kinds: [['daisy', 0.35], ['buttercup', 0.25], ['lupine', 0.2], ['poppy', 0.2]] },
    shrubs: { count: 120, seed: 19, w: (x, z) => (W(x, z) > 0.95 && Math.hypot(x, z - 4) > 22 ? 1 : 0) },
    wind: { s: 0.45, h: 0.7 },
    leaves: { count: 320, kinds: { broadleaf: LEAF.summer, oak: LEAF.oak, birch: LEAF.birch } },
    // 11-18 林团（夏绿：只用夏绿阔叶 + 云杉；白桦金叶 / 栎锈叶是秋色，不进夏季图林团）：营地外圈成片阔叶林；营地内圈 38 米不长，让出营地与篝火视线
    grove: { seed: 811, count: 300, kinds: [['broadleaf', 0.7], ['spruce', 0.3]], thr: 0.5,
      w: (x, z) => (Math.hypot(x, z - 4) < 38 ? 0 : W(x, z)) },
    // 11-19 秋林 Demo 树种混种（夏绿图集：Demo 阔叶 mid / yg + Demo 云杉），跟林团同一避让（内圈 38 米不长）
    demo: { pal: 'summer', count: 40, seed: 911, kinds: [['mid', 0.4], ['yg', 0.3], ['conifer', 0.3]] },
    // 11-19 qllush：营地外围（营地中心 20 米内不铺、20–32 米渐密）
    lush: { grass: 1.0, h: [0.3, 0.8], dry: 0.22, seed: 1101, flowers: [['yellow', 'yellow', 0.8], ['white', 'white', 1.4], ['red', 'orange', 0.8], ['purple', 'purple', 0.5]],
      w: (x, z) => ffSmooth(20, 32, Math.hypot(x, z - 4)) },
  };
}

// ---------------------------------------------------------------- 翠风原野（秋色：金白桦 / 红枫 / 锈栎 + 云杉，河岸芦苇）
export function fieldFloraOpt(ring: { x: number; z: number; s: number; ry: number; birch: boolean }[]): FieldFloraOpt {
  const F = FIELD_ORIGIN, FS = FIELD_SPOTS;
  const obst = circleFade(fieldObstacles().filter(c => c.r > 0.6), 0.3, 2.0);   // 树（r 0.55·s）以外的物件
  const oldAccept = (lx: number, lz: number) => lx < FIELD_HALF - 3 && lx > -FIELD_WEST + 3 && Math.abs(lz) < FIELD_HALF - 3   // qllake：西界 FIELD_WEST
    && !(Math.abs(lx - FS.outpost.x) < 15 && Math.abs(lz - FS.outpost.z) < 11) && Math.hypot(lx - FS.ruins.x, lz - FS.ruins.z) > 4
    && Math.hypot(lx - FS.village.x, lz - FS.village.z) > 13 && Math.hypot(lx - FS.temple.x, lz - FS.temple.z) > 14 && !fieldOnRamp(lx, lz, 0.5) && !fieldSteep(lx, lz)
    && Math.hypot(lx - FS.portal.x, lz - FS.portal.z) > 5;
  const W = (x: number, z: number) => {
    const lx = x - F.x, lz = z - F.z;
    if (!oldAccept(lx, lz)) return 0;
    const rd = Math.abs(lz - riverZ(lx));
    return ffSmooth(1.5, 3.4, fieldPathDistV(lx, lz, fieldPathDist)) * (LAKE_ON && lx < RIVER_X0 ? 1 : ffSmooth(RIVER_HALF + 0.9, RIVER_HALF + 3.4, rd)) * obst(x, z)   // 河汇入湖后往西没有河道
      * (LAKE_ON ? ffSmooth(0.8, 3.0, -lakeDist(lx, lz)) : 1);   // qllake：湖面不长、岸边 0.8–3 米渐密
  };
  /** qllake：树另给权重——湖岸 3.5 米内、以及影子会落到湖上的位置不种（专长包第 98 步 c） */
  const TW = (x: number, z: number) => { const w = W(x, z); return w > 0 && LAKE_ON && !lakeTreeOk(x - F.x, z - F.z) ? 0 : w; };
  const reedW = (x: number, z: number) => {
    const lx = x - F.x, lz = z - F.z, rd = Math.abs(lz - riverZ(lx));
    if (LAKE_ON) {   // qllake：湖岸芦苇（岸外 0.35–3.2 米，栈桥两侧留空）
      const ld = -lakeDist(lx, lz);
      if (ld > 0.35 && ld < 3.2 && !(Math.abs(lx - LAKE_DOCK.x) < 4 && lz > LAKE_DOCK.z0)) return (1 - ffSmooth(2.2, 3.2, ld)) * ffSmooth(0.35, 0.6, ffFbm(lx * 0.08 + 4, lz * 0.08));
    }
    if (rd < RIVER_HALF + 0.35 || rd > RIVER_HALF + 3.2 || Math.abs(lx) > FIELD_HALF - 3) return 0;
    if ((lx > BRIDGE.x0 - 3 && lx < BRIDGE.x1 + 3) || (lx > FORD.x0 - 2 && lx < FORD.x1 + 2) || (lx > BRIDGE2.x0 - 3 && lx < BRIDGE2.x1 + 3)) return 0;   // 桥头 / 浅滩留空
    if (fieldPathDistV(lx, lz, fieldPathDist) < 2.2 || Math.hypot(lx - FS.watermill.x, lz - FS.watermill.z) < 10) return 0;
    return (1 - ffSmooth(RIVER_HALF + 2.2, RIVER_HALF + 3.2, rd)) * ffSmooth(0.35, 0.6, ffFbm(lx * 0.08 + 4, lz * 0.08));
  };
  const AK = (FIELD_HALF + FIELD_WEST) / (2 * FIELD_HALF);   // qllake：面积比（西扩后草花 / 林团数量同比加，密度不变；湖关时 = 1）
  const T: FloraTree[] = [];
  for (const p of fieldProps()) {
    if (p.kind !== 'birch' && p.kind !== 'oak') continue;
    const h = hsh(p.x, p.z);
    const kind: TreeKind = p.kind === 'birch' ? pickKind(h, [['birch', 0.6], ['spruce', 0.2], ['maple', 0.2]]) : pickKind(h, [['oak', 0.5], ['maple', 0.5]]);
    T.push({ x: p.x, z: p.z, kind, s: p.s, ry: p.ry, v: p.v > 0.5 ? 1 : 0 });
  }
  for (const r of ring) { const h = hsh(r.x, r.z); T.push({ x: r.x, z: r.z, kind: r.birch ? pickKind(h, [['birch', 0.55], ['spruce', 0.45]]) : pickKind(h, [['maple', 0.5], ['oak', 0.5]]), s: r.s, ry: r.ry, v: h > 0.5 ? 1 : 0 }); }
  return {
    id: 'field', area: [F.x - FIELD_WEST, F.z - FIELD_HALF, F.x + FIELD_HALF, F.z + FIELD_HALF], ground: (x, z) => M.fieldGroundY(x - F.x, z - F.z, riverZ, FIELD_RISES), grassW: W, trees: T,
    // 11-18 林团（秋色不变：枫 / 栎 / 金白桦 + 少量云杉）
    grove: { seed: 823, count: Math.round(380 * AK), thr: 0.52, kinds: [['maple', 0.35], ['oak', 0.3], ['birch', 0.25], ['spruce', 0.1]], w: TW },
    // 11-19 秋林 Demo 树种混种（Demo 原色图集：红橙枫 / 金黄枫 / 锈橡 / 黄绿卵叶，比例照 Demo 中景 mid 0.42 / gold 0.18 / 云杉 0.22 / yg 0.18）
    demo: { pal: 'autumn', count: Math.round(60 * AK), seed: 923, kinds: [['mid', 0.42], ['gold', 0.18], ['conifer', 0.22], ['yg', 0.18]], w: TW },
    grass: [
      { count: Math.round(95000 * AK), seed: 21, hMin: 0.32, hMax: 0.95, dry: 0.45, hue: -0.025 },
      { count: Math.round(45000 * AK), seed: 23, hMin: 0.06, hMax: 0.2, dry: 0.5, hue: -0.02, cover: true },
      { count: LAKE_ON ? 4600 : 3500, seed: 25, hMin: 0.9, hMax: 1.7, dry: 0.4, reed: true, w: reedW },
    ],
    flowers: { count: Math.round(26000 * AK), seed: 27, kinds: [['aster', 0.35], ['daisy', 0.3], ['buttercup', 0.15], ['poppy', 0.1], ['lupine', 0.1]] },
    shrubs: { count: 260, seed: 29, w: (x, z) => (W(x, z) > 0.95 && fieldPathDistV(x - F.x, z - F.z, fieldPathDist) > 3.5 ? 1 : 0) },
    wind: { s: 0.5, h: 0.6 },
    water: (x, z) => Math.min(Math.abs(z - F.z - riverZ(x - F.x)) - RIVER_HALF, LAKE_ON ? -lakeDist(x - F.x, z - F.z) : 1e9),   // 11-17 河岸草花进河面倒影（?off=vegshadow）；qllake 湖岸同样进倒影
    leaves: { count: 2600, kinds: { birch: LEAF.birch, maple: LEAF.maple, oak: LEAF.oak } },
    // 11-19 qllush：秋林逆光本图——Demo 花种 / 配色 / 密度原样
    lush: { grass: 2.0, h: [0.3, 0.85], dry: 0.45, seed: 1102, flowers: [['purple', 'purple', 1], ['yellow', 'yellow', 1], ['red', 'red', 1], ['white', 'white', 1]] },
  };
}

// ---------------------------------------------------------------- 六张野外图（按气候）
interface WildRecipe { grove?: Omit<GroveOpt, 'w'>; demo?: Omit<DemoTreeOpt, 'w'>; lush?: LushOpt; grass: GrassLayer[]; flowers?: FlowerSet; shrubs?: number; pine?: [TreeKind, number][]; dead?: [TreeKind, number][]; wind: { s: number; h: number }; leaves?: LeafRecipe }
const WILD_RECIPE: Record<string, WildRecipe> = {
  // 星落高原：高原草原 + 苔痕林（云杉 / 阔叶 / 白桦），羽扇豆 / 雏菊 / 紫菀
  star: { grove: { seed: 831, count: 320, kinds: [['spruce', 0.45], ['broadleaf', 0.55]], thr: 0.52 }, demo: { pal: 'summer', count: 50, seed: 931, kinds: [['mid', 0.35], ['yg', 0.3], ['conifer', 0.35]] }, grass: [{ count: 80000, seed: 31, hMin: 0.3, hMax: 0.9, dry: 0.25, hue: 0.01 }, { count: 30000, seed: 33, hMin: 0.06, hMax: 0.2, dry: 0.2, cover: true }],
    flowers: { count: 22000, seed: 35, kinds: [['lupine', 0.35], ['daisy', 0.3], ['aster', 0.25], ['buttercup', 0.1]] }, shrubs: 150,
    pine: [['spruce', 0.55], ['broadleaf', 0.25], ['birch', 0.2]], wind: { s: 0.5, h: 0.4 }, leaves: { count: 300, kinds: { broadleaf: LEAF.summer, birch: LEAF.birch } },
    lush: { grass: 3.0, h: [0.28, 0.78], dry: 0.22, seed: 1131, flowers: [['purple', 'blue', 1.0], ['purple', 'purple', 0.3], ['white', 'white', 1.3], ['yellow', 'yellow', 0.5]] } },
  // 暗岩山麓：山地林（云杉为主 + 阔叶 / 栎），毛茛 / 雏菊
  foothill: { grove: { seed: 841, count: 280, kinds: [['spruce', 0.55], ['broadleaf', 0.45]], thr: 0.52 }, demo: { pal: 'summer', count: 50, seed: 941, kinds: [['mid', 0.3], ['yg', 0.2], ['conifer', 0.5]] }, grass: [{ count: 18000, seed: 41, hMin: 0.28, hMax: 0.85, dry: 0.35 }, { count: 7000, seed: 43, hMin: 0.06, hMax: 0.18, dry: 0.3, cover: true }],
    flowers: { count: 5000, seed: 45, kinds: [['buttercup', 0.4], ['daisy', 0.4], ['lupine', 0.2]] }, shrubs: 50,
    pine: [['spruce', 0.6], ['broadleaf', 0.25], ['oak', 0.15]], wind: { s: 0.45, h: 1.0 }, leaves: { count: 260, kinds: { broadleaf: LEAF.summer, oak: LEAF.oak } },
    lush: { grass: 2.0, h: [0.3, 0.8], dry: 0.32, seed: 1141, flowers: [['yellow', 'yellow', 0.9], ['white', 'white', 1.2], ['red', 'red', 0.5], ['purple', 'purple', 0.3]] } },
  // 腐沼：湿地深绿高草 + 芦苇丛，枯树为主夹杂暗绿阔叶
  marsh: { grove: { seed: 851, count: 110, thr: 0.6, kinds: [['broadleaf', 0.6], ['dead', 0.4]], under: 0.8 }, demo: { pal: 'summer', count: 24, seed: 951, kinds: [['mid', 0.5], ['yg', 0.5]] }, grass: [{ count: 17000, seed: 51, hMin: 0.35, hMax: 1.1, dry: 0.12, hue: 0.02 }, { count: 2000, seed: 53, hMin: 0.9, hMax: 1.6, dry: 0.3, reed: true }],
    shrubs: 40, dead: [['dead', 0.7], ['broadleaf', 0.3]], wind: { s: 0.3, h: 2.0 }, leaves: { count: 220, kinds: { broadleaf: LEAF.dry, dead: LEAF.dry } },
    lush: { grass: 3.0, h: [0.45, 1.05], dry: 0.12, seed: 1151, flowers: [['purple', 'magenta', 0.8], ['white', 'white', 0.8], ['yellow', 'gold', 0.3]] } },
  // 赤砂裂谷：稀疏枯黄草丛，白骨枯树
  redsand: { grass: [{ count: 5000, seed: 61, hMin: 0.2, hMax: 0.6, dry: 1.0 }], dead: [['dead', 1]], wind: { s: 0.6, h: 0.2 } },
  // 霜脊高地：雪松（积雪）为主 + 枯树
  frost: { grove: { seed: 861, count: 220, kinds: [['snowcedar', 0.9], ['dead', 0.1]], under: 0 }, demo: { pal: 'summer', count: 30, seed: 961, kinds: [['conifer', 1]] }, grass: [], pine: [['snowcedar', 0.85], ['dead', 0.15]], wind: { s: 0.6, h: -0.5 }, leaves: { count: 260, kinds: { snowcedar: LEAF.snow } } },
  // 烬落荒原：焦黑枯树
  ember: { grass: [], dead: [['charred', 1]], wind: { s: 0.35, h: 1.4 }, leaves: { count: 240, kinds: { charred: LEAF.ash } } },
};
export const wildFloraHas = (id: string) => id in WILD_RECIPE;
/** wild.ts 用：trees = 原散布点（世界坐标），W = 草权重（世界坐标） */
export function wildFloraOpt(def: WildDef, ground: (x: number, z: number) => number, W: (x: number, z: number) => number, spots: { x: number; z: number; s: number; ry: number; kind: 'pine' | 'deadtree' }[]): FieldFloraOpt {
  const rc = WILD_RECIPE[def.id], O = def.origin, H = def.half;
  const T: FloraTree[] = [];
  for (const p of spots) {
    const table = p.kind === 'pine' ? rc.pine : rc.dead; if (!table) continue;
    const h = hsh(p.x, p.z), kind = pickKind(h, table);
    T.push({ x: p.x, z: p.z, kind, s: p.s * (kind === 'spruce' || kind === 'snowcedar' ? 1.0 : 1.1), ry: p.ry, v: h > 0.5 ? 1 : 0 });
  }
  return {
    id: def.id, area: [O.x - H, O.z - H, O.x + H, O.z + H], ground, grassW: W, trees: T,
    grass: def.palette.grass ? rc.grass : [], flowers: def.palette.grass ? rc.flowers : undefined,
    shrubs: rc.shrubs ? { count: rc.shrubs, seed: 71, w: (x, z) => (W(x, z) > 0.95 ? 1 : 0) } : undefined,
    wind: rc.wind, leaves: rc.leaves,
    demo: rc.demo,   // 11-19 秋林 Demo 树种（赤砂 / 烬落无活树，不加）
    lush: def.palette.grass ? rc.lush : undefined,   // 11-19 花草繁茂（?off=qllush）
    // 11-18 林团：避开营地 / 刷怪点 / 怪群 / 门（比草更宽），其余跟草权重
    grove: rc.grove ? { ...rc.grove, w: (x, z) => {
      const lx = x - O.x, lz = z - O.z;
      for (const c of def.camps) if (Math.hypot(lx - c.x, lz - c.z) < c.r + 6) return 0;
      for (const sp of Object.values(def.spots)) if (Math.hypot(lx - sp.x, lz - sp.z) < Math.min(sp.r, 12) + 3) return 0;
      for (const pk of def.packs) if (Math.hypot(lx - pk.x, lz - pk.z) < 9) return 0;
      for (const gt of def.gates) if (Math.hypot(lx - gt.x, lz - gt.z) < 10) return 0;
      return W(x, z);
    } } : undefined,
  };
}
