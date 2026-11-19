# 长副本 A 尾王 深潮之喉·莫尔维斯 模型修复（05，2026-11-08 18:3x，0 积分）

问题：p73 assets_aholo/dlc1/creatures/wl_morvis.glb（006d8533）是 G1 减面件，只有 7,912 三角，跨 UV 接缝减面导致整身贴图拉丝、碎片、尖刺发锯齿。其余四个首领都有 <id>_boss.glb 绑骨成品（约 4 万三角），只有莫尔维斯一直用这个减面件 + 代码鱼骨架（raid_well_rig tpl 'fish'）。
修复：取 creatures_pilot/wl_morvis_rigged.glb（本地精绑原件，39,868 三角，2048 贴图，干净）→ 去蒙皮、去 13 段动画和骨骼 → 等比缩放 0.4997 对齐旧件包围盒（朝向、中心一致）。代码鱼骨架、体型倍率不用改，同名替换即可。
- wl_morvis.glb  md5 f58f233f  1,521,320 B  材质 MI_MorvisBody（旧为 Designer_Logic_PBR，代码未按材质名取）
- morvis_fix.jpg：上=现用件，下=修复件
可选后续：pilot 原件自带 idle/swim/attack/skill_* /phase_crash/hit/death 13 段鱼类动画（本地精绑已验收过 GIF），若要用骨骼动画替代代码鱼骨架需 01 改加载，非 52 骨 mixamo，不能直接走 boss_glb.ts。

## 18:33 追加：带动画版（Rhett 18:32 批「接上，按现在的大小放入游戏」）
- wl_morvis_rigged.glb  md5 7452faf1  1,656,000 B：pilot 原件整体套一层根节点 wl_morvis_root（缩放 0.4997、平移 0.001,-0.002,-0.002），包围盒与现用件一致（-0.253..0.255 / -0.364..0.360 / -0.502..0.498），代码现有 mul 4.3 / scale 3.0 / 身高基准照旧即游戏内大小不变。
- 13 段动画（只有骨骼 rotation 通道，根不动）：idle swim attack skill_surge skill_bite skill_lure skill_drool skill_eels skill_flood gate_tide phase_crash hit death。
- 接法建议：首领用 AnimationMixer 播这 13 段替代 raid_well_rig 鱼骨架（技能名与 wl_b5 技能对应），静态件 f58f233f 留作兜底。
