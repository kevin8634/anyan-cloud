// 11-14 钟楼盆地写实草木（flora_hd）：南侧山口营地周围的枯草 + 几棵将死的老树，盆地坡面稀疏枯草。
// 死寂铜色调：草偏枯黄、树叶稀疏偏褐。低画质不放；中画质减量。草不投影（性能），树投影。
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import type { WildBuildApi } from '../../core/ContentPacks';
import { makeGrassHD, makeTreeHD, makeFlowersHD, fbm2 } from './flora_hd';
import { BT_FLATS, BT_L, BASIN_C, btGround, rimR, btLakeDepth } from './bt_basin';

const slope = (x: number, z: number) => Math.hypot(btGround(x + 0.6, z) - btGround(x - 0.6, z), btGround(x, z + 0.6) - btGround(x, z - 0.6)) / 1.2;
/** 不压在玩法平台中心（营地外圈和坡面可以）、不在陡坡、不出山脊 */
function okSpot(x: number, z: number, campOnly: boolean): boolean {
  const dx = x - BASIN_C.x, dz = z - BASIN_C.z, th = Math.atan2(dx, dz), rr = Math.hypot(dx, dz);
  if (rr > rimR(th) - 2 && !(campOnly && Math.hypot(x - BT_L.camp.x, z - BT_L.camp.z) < 34)) return false;
  if (slope(x, z) > 0.7) return false;
  if (btLakeDepth(x, z) > -0.08) return false;   // 11-16 湖里 / 水边不长草
  for (const f of BT_FLATS) { const d = Math.hypot(x - f.x, z - f.z); if (f.id === 'camp' ? d < f.R - 5 : d < f.R + 1) return false; }
  if (Math.hypot(x - BT_L.tower.x, z - BT_L.tower.z) < 22) return false;
  if (campOnly) return Math.hypot(x - BT_L.camp.x, z - BT_L.camp.z) < 34;
  return fbm2(x * 0.04, z * 0.04) > 0.45;
}
export function btFlora(api: WildBuildApi) {
  if (curQuality === 'low') return;
  const k = curQuality === 'medium' ? 0.4 : 1, root = new THREE.Group(); root.name = 'bt_flora';
  const G = (x: number, z: number) => api.groundY(x, z);
  const C = BT_L.camp;
  const shore = (x: number, z: number) => btLakeDepth(x, z) > -1.0;   // 11-17g 地面高出湖面不到 1 米的岸边草花进湖面倒影（?off=vegshadow 关）
  root.add(makeGrassHD({ count: Math.round(42000 * k), area: [C.x - 34, C.z - 34, C.x + 34, C.z + 30], ground: G, accept: (x, z) => okSpot(x, z, true), shore, seed: 31, hMin: 0.25, hMax: 0.8, dry: 0.9 }));
  root.add(makeGrassHD({ count: Math.round(30000 * k), area: [C.x - 30, C.z - 30, C.x + 30, C.z + 26], ground: G, accept: (x, z) => okSpot(x, z, true), shore, seed: 37, hMin: 0.06, hMax: 0.2, dry: 0.8, cover: true }));
  root.add(makeGrassHD({ count: Math.round(36000 * k), area: [-120, -120, 120, 120], ground: G, accept: (x, z) => okSpot(x, z, false), shore, seed: 41, hMin: 0.2, hMax: 0.6, dry: 1 }));
  root.add(makeFlowersHD({ count: Math.round(500 * k), area: [C.x - 30, C.z - 30, C.x + 30, C.z + 26], ground: G, accept: (x, z) => okSpot(x, z, true), shore, seed: 43, colors: [0xd8d2c0, 0xb8a6c8, 0xc8b070] }));
  const trees: [number, number, number][] = [[-22, 8, 7], [24, -6, 8], [-14, -22, 6.5], [18, 20, 7.5], [-30, -8, 9], [30, 10, 8.5]];
  trees.forEach(([dx, dz, h], i) => {
    const x = C.x + dx, z = C.z + dz; if (!okSpot(x, z, true) && slope(x, z) > 0.7) return;
    const t = makeTreeHD({ seed: 200 + i, height: h, autumn: 0.75, leafDensity: 0.45, spread: 1.15, lean: (i % 3 - 1) * 0.1 });
    t.position.set(x, G(x, z) - 0.1, z); t.rotation.y = i * 1.7; root.add(t);
    api.block?.(x, z, 0.6);
  });
  root.position.y = -api.groundY(0, 0);   // api.add 会加上 (0,0) 的地面高度；子物体已按世界高度摆好
  api.add(root, 0, 0);
}
