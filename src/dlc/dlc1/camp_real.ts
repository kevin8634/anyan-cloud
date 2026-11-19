// ======================================================================
// DLC1 镜渊城 · 倒钟广场营地写实化程序件（比赛版；商用 base 包 / 低画质仍用本体 Q 版模型）
//   帆布褶皱帐篷（两坡 + 下垂 + 褶皱 + 掀开的门帘 + 拉绳地钉）、风化木栅（原木桩 + 绳扎 + 横杆）、铁箍木箱 + 木桶
//   全部程序化几何 + canvas 贴图，零外部资产；通过本体 WILD_PROP_HOOKS 替换（碰撞半径沿用本体）
// ======================================================================
import * as THREE from 'three';
import { realWaypoint } from './ground_marks';
import { seaEnv } from './seabed';
import { curQuality } from '../../web/gfx';
// 11-16：帐篷 / 木栅 / 木箱 / 木桶的通用实现抽到本体 src/web/camp_hd.ts（本体灰石营地共用；随机序列不变），这里转出原名
import { realTent, realStake, realCrate, realBarrel, realCrateStack } from '../../web/camp_hd';
export { realTent, realStake, realCrate, realBarrel, realCrateStack };

/** 本体 WILD_PROP_HOOKS 用 */
export function realProp(kind: string, v?: number, s?: number): THREE.Object3D | null {
  if (kind === 'stake') return realStake(v ?? 0, (s ?? 2.2) * 0.62);   // 本体给 2–2.5（Q 版比例）；写实木栅压到 1.25–1.55 + 尖头，低于 NPC 肩高
  if (kind === 'tent') return realTent(v);
  if (kind === 'crate') return realCrateStack();
  // v1.2.67 传送阵改用本体统一模型（不再替换）
  if (kind === 'waypoint' && false) return realWaypoint(v ?? 0xffb040, curQuality === 'medium' ? undefined : seaEnv());   // 传送阵：刻纹石台 + 暗金微光符文（原黄色六边形环 + 内盘）
  return null;
}
