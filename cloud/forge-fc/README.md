# 铸造台服务部署说明（v1.2.46 异步任务版）

游戏里的「铸造台」在线模式靠这个服务调用 Lux3D：**Key 只放在服务端环境变量里**，游戏页面、仓库、文档都不含 Key。

推荐部署方式：**魔搭 Docker 创空间**（deploy/modelscope/，server.js 常驻进程，同一服务出游戏页 + 铸造接口）。
本目录 `index.js` 也兼容阿里云 FC 3.0 HTTP 触发器 event（需开启实例保活或最大实例数 1；后台轮询被冻结时，前端每次查询状态会自动接着推进任务）。

## 文件
- `index.js`：接口 + 后台任务（创建 → 轮询 → 下载 → 压缩 → 存盘，任务表落盘，重启自动续跑）
- `glbslim.js`：GLB 瘦身（贴图缩到 ≤1024 并转 JPEG 85，几何不动；纯 JS，零 npm 依赖）
- `vendor/jpeg-js/`：jpeg-js 0.4.4 编解码器（BSD-3-Clause，原样拷贝）

## 接口
| 接口 | 说明 |
|---|---|
| `POST /forge` `{prompt, weaponType}` | 秒回 `{taskId, state:'queued'}`；拿到 Lux3D taskId 才计次（积分已花）；创建失败返回 `{error}` 不计次 |
| `GET /forge/status/<taskId>` | `{state: queued\|generating\|downloading\|done\|failed, error?, size?, url?}`；done 时 `url = 'glb/<taskId>'`（相对地址，前端以服务地址解析） |
| `GET /glb/<taskId>` | 压缩后的模型，支持 `Range: bytes=a-b` → 206；前端按 2MB 分块取回 |
| `GET /health` | `{ok, today, used, limit, perIp, active, last:{time, taskId, state, error, size, raw, ms}}`（不花积分） |

## 环境变量
| 变量 | 默认 | 说明 |
|---|---|---|
| `AHOLO_API_KEY` | — | 必填，Aholo 国内站 API Key（原样，不加 Bearer） |
| `DAILY_LIMIT` | 5 | 全站每日上限（G1-Turbo 实测约 13 积分/次） |
| `PER_IP_LIMIT` | 2 | 每 IP 每日上限（前端本地另限每天 2 次） |
| `FACE_COUNT` | 12000 | 面数 |
| `TEX_MAX` / `TEX_QUALITY` | 1024 / 85 | 贴图最大边长 / JPEG 质量 |
| `GLB_DIR` | /tmp/forge_glb | 模型、任务表（tasks.json）、计数（forge_state.json）目录；保留 48 小时（`GLB_KEEP_H`） |
| `KEEP_RAW` | 空 | `1` = 同时保留 Lux3D 原始 GLB（`<id>.raw.glb`） |
| `ALLOW_ORIGIN` | `*` | CORS 来源 |

## 提示词
`<玩家描述>。一把<武器类型>，暗黑奇幻游戏武器道具，单件完整、无底座、无手、白色背景，造型清晰。`（v1.2.46 去掉了硬加的「金属与皮革材质」）

## 本地测试（零积分）
- `node test/forge.test.mjs`：假 Lux3D（真实样例 GLB test/fixtures/lux3d_4390018.glb）+ 真实 server.js 子进程，覆盖成功 / 生成失败 / 创建失败不计次 / 重启续取 / 超限 / Range / 压缩。
- `node test/forge_e2e.mjs`：浏览器端到端（比赛版 DLC 页面）：成功 / 失败退回武器库 / 关页续取 / 超限 / 我的铸造品 / 导出导入存档。
- 续取真实已完成任务（零积分，只调 task/get + 下载）：`require('./index.js')._resume(<taskId>)`（仅 JS 内部函数，没有 HTTP 入口）。
