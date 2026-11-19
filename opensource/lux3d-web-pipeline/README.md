# lux3d-web-pipeline · 一句话到网页里能拿在手上的 3D 道具

出自网页 3D 动作 RPG《暗岩传说：深渊回响》参加 Aholo 黑客松时整理的生产流水线：**Agent 规划 → Lux3D 生成 → 减面压缩 → 风格统一 → three.js 网页加载**。游戏里 100 多个角色、怪物、首领、武器都走这条线。

> From one sentence to a 3D prop you can hold in a browser game. A Lux3D (Aholo) → glTF optimisation → three.js pipeline extracted from the web ARPG *Darkrock Legend: Abyss Echo*. MIT licensed.

## 流程

```
① 规划（Agent）     需求表：名字 / 用途 / 一句话提示 / 面数预算 / 贴图尺寸
② 生成（Lux3D）     bin/lux3d.mjs gen：文生 / 图生 / 四视图多图生 3D（Turbo 约 1 积分 20 秒；G1 约 20 积分）
                    bin/lux3d.mjs img / fourview：概念图 → 四视图，再多图生 3D（角色一致性更好）
③ 减面压缩          自动：weld + dedup → meshopt 简化（Permissive，允许跨 UV 接缝）→ webp 贴图 → meshopt 压缩
                    普通怪 / 道具约 8000 面 + 1024 贴图，几百 KB
④ 高清武器（可选）   bin/weapon-hd.mjs：2–3 万面 + 2048 贴图 + 由底色生成法线贴图 + 自动发光遮罩（冷青 / 熔岩橙）
⑤ 人形绑骨（可选）   bin/riginput.mjs → bin/lux3d.mjs rig → bin/rigfix.mjs（骨名改成 UE / UBC 命名，直接复用现成动作）
⑥ 网页加载          web/lux3d-prop.js：解析 meshopt GLB → 自动立起 / 归一化长度与握点 → PBR + 程序环境反射 → 「熔炉成形」溶解效果
⑦ 登记              每个产物自动写进 <输出目录>/README.md 登记表（用途 / 工具 / 输入 / 任务号 / 积分 / 减面前后），比赛报告和授权核对直接用
```

## 快速开始

```bash
npm install
export AHOLO_API_KEY=你的Key        # 只放环境变量，不要写进文件；用完 unset
node bin/lux3d.mjs ping             # 连通测试，不花积分
node bin/lux3d.mjs gen --text "一把单手战斧，乌木斧柄缠黑皮，斧刃是黑色岩铁，刃口裂纹透出熔岩橙光" \
     --mode turbo --style photorealistic --out props/axe.glb --use "战士武器" --target 8000
node bin/weapon-hd.mjs lux3d_raw/<任务号>/textured.glb assets/props/axe_hd.glb --glow orange
npm test -- lux3d_raw/<任务号>/textured.glb   # 自检：不花积分，演练后处理 + 登记 + 高清化
```

浏览器查看：`npm run viewer`（或在本目录用任意静态服务器打开 `examples/viewer.html`，three 从本地 node_modules 加载），选一个 GLB，看它从下往上「烧铸」成形。

```js
import { loadProp, forgeReveal } from './web/lux3d-prop.js';
const axe = await loadProp('assets/props/axe_hd.glb', { len: 0.95, anchor: 0.15 });
const reveal = forgeReveal(axe); scene.add(axe);
// 每帧：reveal(t)，t 从 0 到 1
```

## 运行时生成（玩家一句话铸武器）

游戏里的「铸造台」用一个云函数替前端调 Lux3D Turbo（Key 只在云函数环境变量里），代码和部署说明见仓库 `cloud/forge-fc/`（阿里云函数计算 FC 3.0，零依赖，带全服日上限、每 IP 次数、敏感词、模型转存和本地测试）。

## 经验（踩过的坑）

- 结果链接 2 小时过期，**生成完立刻下载**；大文件用 curl，Node fetch 走代理时会卡住。
- Lux3D 贴图接缝多，meshopt 默认锁边减不下去 → 用 meshoptimizer ≥1.0 的 `Permissive`。
- meshopt 量化的 Int16 顶点直接旋转 / 缩放会溢出成「拉丝」，先转 Float32（`loadProp` 已处理）。
- 自动立起靠「最长轴」，个别件会头朝下：看各高度截面宽度（剑的护手离剑柄近），用 `flip`。
- 泛光（Bloom）下小面积高亮会被放大成光球：发光补丁要封顶，原来不发光的地方别超过 1。
- Key 不进代码、日志、仓库；报错信息里打码（`mask()`）。

## 许可

代码 MIT。生成的模型以 Aholo / Lux3D 用户协议为准（商用前请自行核对）。
