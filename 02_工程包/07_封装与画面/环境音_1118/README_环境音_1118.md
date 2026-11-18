# 环境音 1118（MiniMax-H3 视频→抽音频）

状态：21/21 已出（含试样 forest_day），未挂接游戏代码（audio.ts ambBus 挂接留待 wip/pack1118 之后）。

- 来源：openai-next `POST /v1/video/generations`，model `MiniMax-H3`，文生视频，`content=[{type:text}]`、`duration 6`、`resolution 768P`、`ratio 16:9`；H3 原生带 AAC 立体声音轨（32 kHz），无音频开关。查询 `GET /v1/video/generations/{task_id}` → `result_url`。
- 后期：抽音频 → highpass 40 Hz + afftdn 轻降噪 → 首尾裁 50 ms → 1.5 s 等功率交叉淡化做无缝循环 → 线性增益到 -24 LUFS（不压限，保证循环接缝无跳变）→ mp3 96 kbps 立体声 44.1 kHz + ogg vorbis 96 kbps。
- 循环接缝已量：首尾样本差均在该条正常相邻样本差范围内。**游戏里建议用 .ogg**（mp3 编码器自带首尾填充，约 5.04 s，循环会有极短空隙；ogg 为精确 4.99 s）。
- 每条只有约 5 秒（6 秒视频，按秒计费），循环较短，鸟叫等有辨识度的声音会听出重复；挂接时可两条错位叠放或随机起点。
- 检查：每条都有音轨、非静音；频谱看无旋律/和声结构（未见音乐）；但无法自动判断人声，camp_day（要求模糊人声）与 abyss（远处低语）需耳听确认。

| 文件 | 地图 | 时段 | 内容 | 时长(ogg) | 响度 | 峰值 |
|---|---|---|---|---|---|---|
| amb_forest_day.ogg / .mp3 | 翠风原野（森林） | 白天 | 鸟语、树叶沙沙 | 4.99 s | -24.3 LUFS | -12.2 dBFS |
| amb_forest_night.ogg / .mp3 | 翠风原野（森林） | 夜间 | 蟋蟀虫鸣、远处猫头鹰 | 4.99 s | -24.1 LUFS | -15.0 dBFS |
| amb_camp_day.ogg / .mp3 | 灰石营地 | 白天 | 篝火、铁匠敲打、远处人声（模糊） | 4.99 s | -24.4 LUFS | -2.8 dBFS |
| amb_camp_night.ogg / .mp3 | 灰石营地 | 夜间 | 篝火、虫鸣 | 4.99 s | -24.3 LUFS | -9.4 dBFS |
| amb_plateau_day.ogg / .mp3 | 星落高原 | 白天 | 高原风、鹰啸 | 4.99 s | -24.4 LUFS | -11.8 dBFS |
| amb_plateau_night.ogg / .mp3 | 星落高原 | 夜间 | 夜风、稀疏虫鸣 | 4.99 s | -24.7 LUFS | -11.2 dBFS |
| amb_rift.ogg / .mp3 | 赤砂裂谷 | 昼夜共用 | 热风沙、碎石滚落 | 4.99 s | -24.2 LUFS | -12.1 dBFS |
| amb_frost.ogg / .mp3 | 霜脊高地 | 昼夜共用 | 雪风、冰裂 | 4.99 s | -24.5 LUFS | -13.0 dBFS |
| amb_ember.ogg / .mp3 | 烬落荒原 | 昼夜共用 | 余烬噼啪、低沉地鸣 | 4.99 s | -24.3 LUFS | -11.4 dBFS |
| amb_foothill_day.ogg / .mp3 | 暗岩山麓 | 白天 | 山溪、鸟鸣 | 4.99 s | -24.4 LUFS | -13.1 dBFS |
| amb_foothill_night.ogg / .mp3 | 暗岩山麓 | 夜间 | 溪水、虫鸣 | 4.99 s | -24.4 LUFS | -13.6 dBFS |
| amb_swamp_day.ogg / .mp3 | 腐沼湿地 | 白天 | 蛙鸣、水泡、蚊蝇 | 4.99 s | -24.6 LUFS | -4.5 dBFS |
| amb_swamp_night.ogg / .mp3 | 腐沼湿地 | 夜间 | 蛙群夜鸣 | 4.99 s | -24.6 LUFS | -4.3 dBFS |
| amb_mine.ogg / .mp3 | 暗岩矿洞 | — | 滴水、矿车远响、洞风 | 4.99 s | -24.5 LUFS | -0.2 dBFS |
| amb_temple.ogg / .mp3 | 腐沼神殿 / 沙葬王陵 | — | 石室回声、沙流 | 4.99 s | -24.0 LUFS | -9.7 dBFS |
| amb_icecave.ogg / .mp3 | 巨魔冰窟 / 永霜墓穴 | — | 冰洞风啸、冰滴 | 4.99 s | -24.4 LUFS | -9.0 dBFS |
| amb_foundry.ogg / .mp3 | 灰烬铸造厂 / 熔心王座 | — | 熔岩翻涌、锻锤回响 | 4.99 s | -24.3 LUFS | -13.9 dBFS |
| amb_abyss.ogg / .mp3 | 深渊 | — | 低频嗡鸣、远处低语 | 4.99 s | -24.6 LUFS | -14.5 dBFS |
| amb_coast_day.ogg / .mp3 | 海岸（DLC 镜渊 / 外海） | 白天 | 海浪、海鸥 | 4.99 s | -24.2 LUFS | -10.7 dBFS |
| amb_coast_night.ogg / .mp3 | 海岸（DLC 镜渊 / 外海） | 夜间 | 夜浪、风帆 | 4.99 s | -24.7 LUFS | -8.2 dBFS |
| amb_rain.ogg / .mp3 | 通用（下雨天气） | — | 雨声 | 4.99 s | -24.3 LUFS | -5.1 dBFS |

花费：MiniMax-H3 ×21 = $7.875（usage 7978.06→8765.56 美分，2026-11-18 09:19–09:25 CST），无失败扣费。

试听：`试听合集_环境音_1118.mp3`（每条循环 3 遍 + 1 秒空白，顺序见 preview_order.txt）；频谱总览 spectrum_sheet_a/b.png。
提示词：prompts.tsv（forest_day 见 forest_day.req.json）。
