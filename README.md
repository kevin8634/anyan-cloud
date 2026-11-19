<p align="center">
  <img src="项目资料/02_工程包/03_宣发/宣发/报告书/src_v4/img/logo.jpg" width="520" alt="暗岩传说：深渊回响">
</p>

<h1 align="center">暗岩传说：深渊回响</h1>
<p align="center"><b>Darkrock Legends: Abyssal Echoes</b><br>一句话铸造武器的 AI 3D 网页动作 RPG · Aholo 黑客松参赛作品</p>

<p align="center">
  <a href="https://kevin8634.github.io/dark-rock-legends/"><b>▶ 在线试玩</b></a> ·
  <a href="https://www.xiaohongshu.com/discovery/item/6afe335e000000002a01b7cb">演示视频（小红书）</a> ·
  <a href="项目资料/02_工程包/03_宣发/宣发/报告书/锐特AI工坊_暗岩传说_v4.pdf">项目报告书 PDF</a> ·
  <a href="项目资料/04_离线版">离线版</a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6">
  <img alt="three.js" src="https://img.shields.io/badge/three.js-WebGL-000000">
  <img alt="Lux3D" src="https://img.shields.io/badge/3D%20assets-Aholo%20Lux3D-14b8a6">
  <img alt="Electron" src="https://img.shields.io/badge/desktop-Electron-47848f">
  <img alt="License" src="https://img.shields.io/badge/code-MIT-green">
</p>

---

打开浏览器就能玩的暗黑风 3D 动作 RPG：**1–40 级、六职业、深渊 20 层、双结局资料片「沉钟之海」**，手机也能运行。
资料片里的写实职业、怪物、首领、武器和地标场景件由 **Aholo Lux3D** 生成，经减面、压缩、自动绑骨后由 three.js 实时渲染；
铁匠铺的「铸造台」把 Lux3D 直接接进玩法——**写一句话，一把只属于你的 3D 武器从熔炉里烧出来，飞到角色手上**。

<p align="center">
  <img src="项目资料/02_工程包/03_宣发/宣发/报告书/src_v4/img/sc_coast.jpg" width="49%" alt="沉钟海岸">
  <img src="项目资料/02_工程包/03_宣发/宣发/报告书/src_v4/img/sc_forge.jpg" width="49%" alt="铸造台出炉">
</p>
<p align="center">
  <img src="项目资料/02_工程包/03_宣发/宣发/报告书/src_v4/img/six_heroes.jpg" width="49%" alt="六职业">
  <img src="项目资料/02_工程包/03_宣发/宣发/报告书/src_v4/img/morvis_moves.jpg" width="49%" alt="首领逐招战斗">
</p>

## 亮点

| | |
|---|---|
| 🔨 **一句话铸武器** | 运行时调用 Lux3D G1-Turbo 文生 3D，熔炉锻打演出中实时成形，武器刻上铸造者名字；提示词还能驱动武器特效（如「缠着雷电的法杖」） |
| 🧬 **AI 生成整部资料片** | 比赛版 237 个 3D 模型中 224 个（94.5%）由 Lux3D 生成；379 次任务、346 次成功 |
| ⚡ **网页端 10 万面 → 60 帧** | meshopt 减面压缩（中位数 9.7 万 → 7900 面），183 个模型 2.03 GB → 65 MB，KTX2 贴图，低画质自动回退 |
| 🦴 **人形自动绑骨** | T 字概念图 → 四视图 → G1 多图生 3D → 自动绑骨 → 权重转移 + 骨名映射，复用同一套动作库 |
| 🎬 **电影感画面** | 昼夜、雾、体积光、暴风雪、湖面水体、树影等，均带 `?off=` 开关可逐项对比 |

## 目录结构

```
src/
  core/        引擎无关的游戏逻辑：战斗、技能、天赋、装备、掉落、副本、深渊、存档（可独立测试）
  data/        配置数据：职业、技能书、天赋、套装、任务、地图、首领
  web/         three.js 网页客户端：渲染、特效、HUD、铸造台、水体与天气
  dlc/dlc1/    资料片「沉钟之海」：新职业、首领、海岸地图、选人界面
  sim*.ts      命令行模拟器（战斗、首领、掉落、经济、天赋平衡……）
tools/         资产流水线：Lux3D 生成、减面压缩、绑骨修正、KTX2、打包与发布
opensource/    lux3d-web-pipeline：从一句话到网页里能拿在手上的 3D 道具（可单独使用）
cloud/         铸造台云函数（Lux3D 中转、GLB 精简）
deploy/        本地 / 魔搭创空间部署
desktop/       Electron 桌面版
test/          回放与冒烟测试
dev/           开发期截图与对比脚本
项目资料/       交接文档、宣发与报告书、概念图、离线版（OneDrive 云盘镜像）
```

## 快速开始

```bash
npm install
npm run sim        # 命令行模拟一场战斗
npm run boss       # 模拟整个副本（会躲圈、会打断）
npm run zone       # 地图 / 区域数据自检
```

完整网页构建需要美术资源包（约 3 GB，未放入本仓库）：

```bash
node gen-assets.mjs --assets=aholo --dlc=dlc1
node build-web.mjs  --assets=aholo --dlc=dlc1   # 产出单 HTML 文件，浏览器直接打开
```

只想玩？直接打开 **[在线试玩](https://kevin8634.github.io/dark-rock-legends/)**，或下载 [项目资料/04_离线版](项目资料/04_离线版) 里的离线包。

## 关于 SKILL 专长包

项目开发中使用的 AI SKILL 专长包（画质、MMORPG、魔法与破坏等）**不开源，属付费内容**。
如有需要，请联系 **王磊 · wanglei19860304@gmail.com**。

## 许可

- 代码：[MIT](LICENSE)
- 美术资源、模型、音频、宣发素材与 SKILL 专长包不在 MIT 授权范围内，保留所有权利。

<p align="center"><sub>锐特AI工坊 · 队长 王磊 · Aholo 黑客松 2026 · PLAY IN 3D, CREATE WITH AHOLO</sub></p>
