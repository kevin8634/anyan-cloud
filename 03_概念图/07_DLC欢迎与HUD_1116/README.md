# 07_DLC欢迎与HUD_1116 · DLC「深渊回响」欢迎动画分镜 + 选角 HUD（概念图）

Rhett 11-16 10:31 要求重出：冷青绿 / 深海蓝黑 / 暗铁 + 少量铜色，不要黄金基底；场景为地底之海、沉钟、倒悬的镜渊城。

- W1_open.jpg：开场·沉钟之海远景（钟鸣涟漪、倒悬城倒影）
- W2_heroes.jpg：六职业群像（法师、猎手女；战士、负棺人、时砂行者、炼金投弹手男，露脸）
- W3_logo.jpg：落版。模型生成时留空 Logo 区；Logo 取自 `02_工程包/03_宣发/CG制作/logo_final/M1_logo_anim_a.mp4` 第 56 帧（12fps 抽帧中边缘最清晰，raw/logo_frame_M1a_f056.png），screen 混合合成；「开始冒险」为 PIL + Noto Sans SC Bold 后贴
- H1_mage.jpg / H2_coffin.jpg：选角 HUD。images/edits 先换 DLC 背景（保留本体 H1 定稿法师服装），再 edits+mask 出边框；面板、头像、文字均为 PIL 后贴（头像取自 W2，文字用游戏真数据）
- raw/：原图 PNG、gen.py（出图）、w3.py（落版合成）、hud.py（HUD 合成）、日志。H2_ui_fix.png 为把手中紫焰局部转青后的版本
