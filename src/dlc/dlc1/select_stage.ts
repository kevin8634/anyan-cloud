// 11-18 19:55 Rhett「为什么还要留着」：镜渊城 3D 选人画面彻底删除——选角不再生成镜渊城（载入时不建区、不刷怪），
//   旧六人弧形站位（A 态）也不再画：未进「选择角色」详情前主场景一帧都不渲染（selectBlank），详情页只画职业背景图 + 选中角色（selhud）。
//   角色站在营地远处一块空地上（只给选角灯和镜头一个落脚点，画面里看不到营地）。回退只能 git revert。
import type { PackSelectStage } from '../../core/ContentPacks';

export const MIRROR_SELECT: PackSelectStage = {
  map: 'camp',
  cam: [0.6, 2.4, 12.6, 0, 1.5, 0],
  arc: { x: 0, z: 7, r: 5, span: 1.2, scale: 1.4 },
  fov: 55,
  focus: { dist: 4.6, h: 1.35, side: 1.3 },
  lowOk: true,
  solo: true,
};
