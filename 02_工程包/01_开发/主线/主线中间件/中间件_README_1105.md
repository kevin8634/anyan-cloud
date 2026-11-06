# 主线中间件 1105（01 开发交接，2026-11-05 01:10 北京时间）
包：主线/主线中间件/主线中间件_1105_0110.tar.gz
内容（均不入库）：
- shots/：1105 段全部实测截图原图——warrior40、hunter40、hunter40_i_h_set_hauberk、alchemy40（11-04 robe40）、hunter_bow（feat/hunter-bow 6 张，被「本次更新」面板挡住，需重拍）、fx_aby（深渊光柱「改前」11 张 + json，「改后」未跑）、ref；脚本 mk_sheet.py（拼对照图）、zoom.py。
- p73_wt_bow_work_logs/：feat/hunter-bow 构建与测试日志。
- chars/specs/：DLC1_40级职业套装_v0.2.md 等规格（套装终极天赋按此做）。
解压：`mkdir -p /workspace/work && tar xzf 主线中间件_1105_0110.tar.gz -C /workspace/work`（得 shots/、chars/specs/、p73_wt_bow_work_logs/）。
不打包、可重建的：各工作树 *.gen.ts、dist/、web/index*.html、web/music、web/raid（`node build-web.mjs && node build-web.mjs --assets=aholo --dlc=dlc1` 生成）；p73_wt_before = `git worktree add /workspace/work/p73_wt_before d5e86b1` 后构建；p73_wt_bow = 从 feat/hunter-bow bundle 取分支后 `git worktree add /workspace/work/p73_wt_bow feat/hunter-bow`，再 `ln -s /workspace/work/p73/node_modules`。
依赖：npm install；浏览器 `bash tools/setup_env.sh`，env LD_LIBRARY_PATH=/workspace/work/.envcache/libs/usr/lib/aarch64-linux-gnu PLAYWRIGHT_BROWSERS_PATH=/workspace/work/.envcache/ms-playwright。
