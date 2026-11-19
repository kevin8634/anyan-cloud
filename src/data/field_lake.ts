// 11-19 Rhett「在哪里加一个湖泊合适？我想看波光粼粼的湖面」→「可以，地图扩大，弄一片湖出来。技能包都有你利用好来构建」
// 翠风原野往西扩 72 米，苇河西端汇入「落霞湖」（椭圆 + 岸线噪声），南岸一座木栈桥伸进湖里（面北 = 正对秋林逆光的低太阳，看太阳光路上的碎闪光）。
// 数据层（浏览器 + 命令行模拟共用）：开关、湖形、离岸距离、栈桥、河道终点。?off=qllake（或 localStorage darkrock_cine_off 含 qllake）整体回旧：边界 / 地形 / 河 / 草木全部不变。
// 不 import zone_field（它反过来 import 本文件，模块初始化顺序会撞上）：苇河中线式子与 ±120 在此照抄，改那边要同步
const FIELD_HALF = 120;
const riverZ = (lx: number) => 12 + 5 * Math.sin(lx * 0.045);

export const LAKE_ON = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return !`${q},${ls}`.split(',').map(x => x.trim()).includes('qllake');
  } catch { return true; }
})();
/** 西扩米数（湖开时） */
export const LAKE_WEXT = LAKE_ON ? 72 : 0;
/** 西边界（局部 x 的绝对值）；东 / 南 / 北仍是 FIELD_HALF */
export const FIELD_WEST = FIELD_HALF + LAKE_WEXT;
/** 湖：中心（局部）、半轴（米） */
export const LAKE = { cx: -156, cz: 8.5, rx: 25, rz: 20, name: '落霞湖' };
const lakeK = (a: number) => 1 + 0.08 * Math.sin(3 * a + 0.7) + 0.05 * Math.sin(5 * a + 2.1) + 0.03 * Math.sin(9 * a + 4.0);
/** 离湖岸的有向距离（米，湖里为正、岸上为负）；湖关时恒为很大的负数 */
export function lakeDist(lx: number, lz: number) {
  if (!LAKE_ON) return -1e9;
  const dx = (lx - LAKE.cx) / LAKE.rx, dz = (lz - LAKE.cz) / LAKE.rz, e = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const rE = (LAKE.rx * LAKE.rz) / Math.hypot(LAKE.rz * Math.cos(a), LAKE.rx * Math.sin(a));   // 该方向椭圆半径（米）
  return (lakeK(a) - e) * rE;
}
/** 湖岸线上第 a 弧度方向的点（局部），供网格 / 小地图 */
export function lakeShore(a: number, grow = 0): [number, number] {
  // a = 归一化椭圆坐标里的角（与 lakeDist 同一参数）；grow = 沿径向外扩米数
  const k = lakeK(a), c = Math.cos(a), s = Math.sin(a), x = LAKE.rx * k * c, z = LAKE.rz * k * s, l = Math.hypot(x, z) || 1;
  return [LAKE.cx + x + (x / l) * grow, LAKE.cz + z + (z / l) * grow];
}
/** 南岸木栈桥（局部）：x 居中、z 从 z0（湖里）到 z1（岸上），宽 w；桥面可走 */
export const LAKE_DOCK = (() => {
  const [, zs] = lakeShore(Math.PI / 2);
  return { x: LAKE.cx, z0: zs - 9, z1: zs + 1.5, w: 2.6 };
})();
export const onLakeDock = (lx: number, lz: number) => LAKE_ON && Math.abs(lx - LAKE_DOCK.x) < LAKE_DOCK.w / 2 - 0.25 && lz > LAKE_DOCK.z0 + 0.3 && lz < LAKE_DOCK.z1 + 0.5;
/** 苇河西端（湖开时河在这里汇入湖，往西不再有河道） */
export const RIVER_X0 = (() => {
  if (!LAKE_ON) return -FIELD_HALF - 30;
  for (let x = LAKE.cx; x < 0; x += 0.25) if (lakeDist(x, riverZ(x)) < 1.5) return x;
  return LAKE.cx + LAKE.rx;
})();
/** 湖底高度（局部；水面 −0.12）：岸外 4 米起缓降到岸线 −0.12，湖心约 −1.7；岸外更远返回 +∞（不压地形） */
export function lakeBedY(lx: number, lz: number) {
  const d = lakeDist(lx, lz);
  if (d < -4) return Infinity;
  if (d < 0) { const t = (d + 4) / 4; return -0.12 * t * t * (3 - 2 * t); }
  const u = Math.min(1, d / 12);
  return -0.12 - 1.6 * Math.pow(u * u * (3 - 2 * u), 0.8);
}
/** 树影不落湖（专长包第 98 步 c：低太阳 15° 时 12–17 米树投 50–65 米影，湖在林影里就没有碎闪光）：
 *  秋林逆光太阳水平方向 (0.4, −1) → 影子朝 (−0.37, +0.93)；从该点顺影子方向 60 米内碰到湖就不种树 */
export function lakeTreeOk(lx: number, lz: number) {
  if (!LAKE_ON) return true;
  if (lakeDist(lx, lz) > -3.5) return false;
  const sx = -0.371, sz = 0.928;
  for (let k = 4; k <= 60; k += 4) if (lakeDist(lx + sx * k, lz + sz * k) > -1) return false;
  return true;
}
