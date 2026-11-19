// v1.2.49 环境高精化：本包写实场景件的材质类别（本体 src/web/envhd.ts 按 mesh 名 luxscene_<id> 套 PBR 细节层）
//   masonry = 建筑（风化石材 / 污渍流痕 / 底部脏污 / 少量铜锈）；bronze = 铜器（铜锈 + 磨痕）；reef = 礁石 / 遗迹石块（湿润 + 藤壶 + 苔藓）
//   10-27 遗迹件修复：碎钟断柱组（scene_ruins）分件 —— 断柱 / 基座 / 碎石 = ruin（风化石材），落地的三口铜钟 = bell（青铜 + 铜锈）
import { registerEnvKinds } from '../../web/envhd';
import { registerSceneParts } from '../../web/creatures_glb';
registerEnvKinds({
  scene_belltower: 'masonry', scene_invertedtower: 'masonry', scene_gatebell: 'masonry',
  scene_bell: 'bronze', scene_sea_bell: 'bronze', scene_mirrorframe: 'bronze', scene_chain: 'bronze', scene_sea_chain: 'bronze',
  scene_ruins: 'ruin', 'scene_ruins.bell': 'bell', scene_reefspire: 'reef', scene_sea_rock: 'reef',
});

// 碎钟断柱组里的铜钟：按模型包围盒归一化坐标（各轴 -1..1）圈出三口钟（中间立着的大钟 + 钟顶、左前 / 右前两口侧卧小钟），
// 排除两根断柱和底板。坐标量自 Lux3D 原件（任务 4374431，原始 y 范围 ±0.939 → 换算成 -1..1）
const BELLS: [number, number, number, number, number, number][] = [
  [0, -0.38, 0.0, 0.4, 0.48, 0.5], [0.05, -0.12, -0.2, 0.26, 0.2, 0.24], [-0.52, -0.6, 0.4, 0.28, 0.26, 0.3], [0.45, -0.62, 0.47, 0.28, 0.22, 0.25],
];
registerSceneParts('scene_ruins', [{ suffix: 'bell', envK: 0.35, color: 0x8c6c4c, test: (x, yn, z) => {
  const y = yn * 0.939;
  if (y < -0.83) return false;
  if ((x + 0.55) ** 2 + (z + 0.6) ** 2 < 0.09 || (x - 0.45) ** 2 + (z + 0.45) ** 2 < 0.0784) return false;
  return BELLS.some(([cx, cy, cz, rx, ry, rz]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 < 1);
} }]);

// 11-04 raidA 场景地标件（Lux3D G1，Rhett 11-03 23:37 批）：PBR 细节层类别 + 冰封钟楼尖底部冰块分件（半透明冰材质在 well_depth_hd.ts 里换）
registerEnvKinds({ scene_wl_well_bell: 'bronze', scene_wl_chapel_arch: 'ruin', scene_wl_frozen_spire: 'masonry' });
registerSceneParts('scene_wl_frozen_spire', [{ suffix: 'ice', envK: 1.4, color: 0xcfeaff, test: (_x, y) => y < -0.47 }]);
