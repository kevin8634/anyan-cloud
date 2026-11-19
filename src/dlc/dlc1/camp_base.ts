// ======================================================================
// 11-18 Rhett「所有营地的模型都替换成 DLC 的模型」：本体六个野外区域（星落 / 赤砂 / 霜脊 / 烬落 / 山麓 / 腐沼）的营地
//   套 DLC 营地同款：板岩地坪 + shader 火舌篝火（Lux3D 石圈，放在本体篝火原位）+ 门口火盆 + 沉船围墙 / 船灯 / 铁砧角 / 告示板 / 商摊 / 木桶等场景件（campBuild）；
//   帐篷 / 货箱 / 商摊 / 铁砧 / 告示板 / 栅栏桩走 WILD_PROP_HOOKS 换 Lux3D 件（同镜渊城）。
//   让位：传送阵、营地里的 NPC、本体固定装饰（帐篷 / 瞭望塔 / 货箱 / 篝火 ……）。
//   商用 base 包（没有 DLC 场景件）/ 低画质：全部跳过，保持本体 Q 版。?off=basecamp 关。
//   灰石营地（主城，scenes.ts 不是野外区域）不在此列。
// ======================================================================
import { WILD_BUILD_HOOKS, type WildBuildApi } from '../../core/ContentPacks';
import { WILD, WILD_IDS } from '../../data/zones_wild';
import { campDressBind, campDressBuild } from './plaza_dress';
import './camp_gray';   // 11-18 Rhett：灰石营地（本体主营地）也换 DLC 营地模型（?off=graycamp）

const OFF = (() => { try { return /(?:[?&]off=[^&]*\bbasecamp\b)/.test(location.search); } catch { return false; } })();
const DECOR_R: Record<string, number> = { tent: 2.8, tower: 2.2, crate: 1, fire: 1.6, stall: 1.6, anvil: 1, board: 1, banner: 0.6, cart: 1.8, altar: 2.6 };
export const baseCampStats: Record<string, number> = {};

if (!OFF) {
  campDressBind(WILD_IDS as string[]);
  for (const id of WILD_IDS) {
    const def = WILD[id];
    WILD_BUILD_HOOKS[id] ??= (api: WildBuildApi) => {
      let n = 0;
      for (const C of def.camps) {
        const near = (x: number, z: number, extra = 0) => Math.hypot(x - C.x, z - C.z) < C.r + extra;
        const fire = def.decor.filter(d => d.kind === 'fire' && near(d.x, d.z)).sort((a, b) => Math.hypot(a.x - C.x, a.z - C.z) - Math.hypot(b.x - C.x, b.z - C.z))[0];
        const avoid = [
          { x: C.waypoint.x - C.x, z: C.waypoint.z - C.z, r: 2.8 },
          ...(def.npcs ?? []).filter(m => near(m.x, m.z, 6)).map(m => ({ x: m.x - C.x, z: m.z - C.z, r: 1.3 })),
          ...def.decor.filter(d => d.kind !== 'fire' && near(d.x, d.z, 6)).map(d => ({ x: d.x - C.x, z: d.z - C.z, r: DECOR_R[d.kind] ?? 1 })),
        ];
        try { campDressBuild(api, C, avoid, false, fire ? { x: fire.x, z: fire.z } : undefined); n++; } catch (e) { console.error('本体营地换装出错', id, e); }
      }
      baseCampStats[id] = n;
    };
  }
}
