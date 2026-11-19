# 暗岩传说：深渊回响（Aholo Lux3D 黑客松参赛作品）

网页 3D 动作 RPG。场景地标、武器、怪物模型由 Aholo Lux3D 生成；铸造台可在游戏内用一句话实时生成武器（Lux3D G1-Turbo）。

- 打开即玩，画面由浏览器 / 显卡渲染（设置里可选 低 / 中 / 高 / Ultra 画质）。
- 推荐桌面 Chrome / Edge，键鼠操作。
- 铸造台：每 IP 每日 2 次，全站每日 5 次（G1-Turbo 约 13 积分/次）；异步任务（约 30–60 秒），模型贴图服务端压到 1024 JPEG（约 1MB），前端 2MB 分块取回、关页后可续取；超限或失败时提示原因并使用离线武器库。

## 部署说明
- Docker 创空间，免费 CPU（platform/2v-cpu-8g-mem），服务监听 7860。
- 需在创空间「设置 → 环境变量」添加 `AHOLO_API_KEY`（不要写进仓库）。可选：`DAILY_LIMIT`（默认 5）、`PER_IP_LIMIT`（默认 2）、`FACE_COUNT`（默认 12000）。
- `GET /health` 查看铸造台状态（不花积分）：今日已用 / 上限 / 每人上限，以及最近一次结果 `last`（时间、状态、原因、大小、耗时）。
- 接口：`POST /forge` → `{taskId}`；`GET /forge/status/<taskId>`；`GET /glb/<taskId>`（支持 Range）。`/diag/*` 为网关诊断接口（零积分）。
