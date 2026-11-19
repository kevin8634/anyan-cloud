// 11-18 纯净度修复：DLC1 各图画风登记（原在本体 src/web/map_look.ts MAP_LOOK 里写死 dlc1_* → 本体构建 check-purity 失败）。
// 数值与 ba8c886 / 09cacc9 原样一致；?off=dlclight 仍经 D() 回 1117e。map_look.ts 不 import 任何模块，静态 import 不影响启动顺序（test/dlc_boot_order.mjs）。
import { registerMapLook, L, D } from '../../web/map_look';
import { registerAmbience } from '../../web/amb_registry';   // 11-18 环境音（amb_registry 不 import 任何模块，不影响启动顺序）

registerMapLook('dlc1_coast', L('coast', 0.85, 1.05, 0.9, 0.85, 0.35, 0.2, ...D([22, 0.85])), { outdoor: true });   // 沉钟海岸：海风晴阴相间
registerMapLook('dlc1_mirror', L('mirror', 1.2, 0.6, 0.8, 0.4, 0.25, 0.0, ...D([15, 0.7])), { outdoor: true, moonLit: true });   // 镜渊城：地底海穹顶、常夜月光
registerMapLook('dlc1_belltower', L('belltower', 1.15, 0.75, 0.6, 0.55, 0.15, 0.0, ...D([12, 0.55])), { outdoor: true });   // 无声钟楼：阴天
registerMapLook('dlc1_forge', L('lava', 1.0, 1.0, 0.8, 0.5, 0.6, 1.0));   // 熔炉室内
registerMapLook('dlc1_well', L('mine', 1.0, 1.0, 0.8, 0.5, 0.4, 0.3));   // 钟井室内
// 11-18 环境音（?off=ambsfx）：沉钟海岸用 amb_coast_day / _night（Rhett 10:14 对照表「海岸 / 外海 → coast」；外海在海岸图内）
registerAmbience('dlc1_coast', 'coast');
