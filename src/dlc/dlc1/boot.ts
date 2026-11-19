// DLC1 启动：build-web.mjs --dlc=dlc1 把这个模块放在游戏主模块之前加载；有授权才注册（core/Entitlement.ts）
import { installPack } from '../../core/Entitlement';
import { DLC1 } from './manifest';
import './parch_dlc';
import './map_look_d1';   // 11-18 DLC 各图画风登记（原写死在本体 map_look.ts，纯净度修复）   // 11-16 DLC 全屏窗口羊皮纸（html.ui-parch 下生效）

installPack(DLC1);
// Rhett 11-18：本体六个野外营地换 DLC 营地模型（?off=basecamp）。必须在 installPack 之后求值（见 manifest.ts 注释）；动态 import 在本轮脚本同步段之后、加载流程第一个 await 续上之前执行，早于建野外区域
void import('./camp_base').catch(e => console.error('DLC1 本体营地换装加载失败', e));
// 11-17 法师 40 级绝技专属表现（溺光法球 / 钟律共鸣 / 渊海潮汐），只登记表现。
//   必须延后动态 import：mage_fx_d1 → web/vfx → … → web/models → data/classes → data/skillbook，静态 import 会让游戏数据早于 installPack 读取，
//   报「内容包 dlc1 注册太晚：挂载点 skills 已经被读取过」，标题页卡 0%（89ca0d3 引入，11-17 修）。test/dlc_boot_order.mjs 守着。
setTimeout(() => { void import('./mage_fx_d1').catch(e => console.warn('DLC1 法师绝技表现登记失败', e)); }, 0);
// Rhett 11-18 欢迎动画（?off=welcome1118）与选角 HUD（?off=selhud）：选角 HUD 用到本体选角钩子（web/selectstage），同样延后动态 import
setTimeout(() => { void import('./selui/welcome').then(m => m.installWelcome()).catch(e => console.warn('DLC1 欢迎动画加载失败', e)); }, 0);
setTimeout(() => { void import('./selui/selhud').then(m => m.installSelHud()).catch(e => console.warn('DLC1 选角 HUD 加载失败', e)); }, 0);
