# KTX2（Basis Universal）GPU 压缩贴图 · fix1106

目的：比赛版写实模型贴图显存太大（webp 解码后是 RGBA8 + mip，2048² 一张 ≈ 21 MB）。构建时把贴图转成 KTX2，运行时由 KTX2Loader 转码成显卡原生压缩格式（桌面 BC7、支持 ASTC 的设备 ASTC 4x4、只有 ETC2 的手机 ETC1/ETC2），2048² 一张 ≈ 5.6 MB（ETC2 不透明 ≈ 2.8 MB）。分辨率不降。

## 范围
- `assets_aholo/models_hd/LUX_*.glb`（打进单页的写实职业 / 精英；`_raw` 不打包不转）
- `assets_aholo/dlc1/creatures/*.glb`（DLC1 怪物 / NPC / 40 级暗金 / 长副本首领件；`*_boss` 仍拆到 `web/raid/*.js` 按需加载）
- 没转：`assets_aholo/creatures/`（本体比赛怪，1024 为主）、`props/weapon_*`、`dlc1/props/scene_*`。要转只需在 `convert.mjs` 的 `KTX2_SCOPE` 与 `tools/asset-pack.mjs` 的 `KTX2_SCOPE` 各加一行。

## 编码规则
| 用途 | 编码 | 说明 |
|---|---|---|
| 法线 | UASTC 4x4 + zstd，basisu normal 预设 | 线性、不做感知加权、mip 重新归一化 |
| 底色 / 自发光 | ETC1S q255（sRGB）；PSNR < 35 dB 改 UASTC + zstd | PSNR 用 three r170 自带的同一份转码器解回 RGBA 与源图比 |
| 金属粗糙 / AO | ETC1S q255（线性）；PSNR < 33 dB 改 UASTC + zstd | |

为什么颜色类不全用 UASTC：UASTC + zstd 一张 2048 ≈ 3.4–3.6 MB（webp 源 0.2–0.4 MB），全量 UASTC 时单页 HTML ≈ 700 MB，超过 V8 单字符串上限（≈ 512 MB），页面直接打不开。ETC1S q255 一张 2048 ≈ 0.5–0.7 MB，实测颜色 PSNR 38–43 dB；显存两者相同（桌面都转 BC7）。画质不够的图自动走 UASTC，逐张结果在缓存 `glb/**/*.json` 和 `report.py` 输出里。

## 用法
```bash
NODE_OPTIONS=--max-old-space-size=5000 node tools/ktx2/convert.mjs [--budget=秒] [--only=正则]   # 补齐缓存（退出码 3 = 没编完，再跑接着编）
node tools/ktx2/check.mjs            # 缓存 GLB 校验：访问器逐值一致、贴图全 KTX2、尺寸不变、动画 / 蒙皮数不变
python3 tools/ktx2/report.py --before-html=… --after-html=…   # 前后统计（逐张明细写 textures.csv）
node test/ktx2_smoke.mjs [缓存GLB]   # 无头 Chromium file:// 冒烟（NOCOMP=1 模拟不支持压缩格式 → 退回 RGBA）
NODE_OPTIONS=--max-old-space-size=5000 node build-web.mjs --assets=aholo --dlc=dlc1          # 默认 --ktx2
NODE_OPTIONS=--max-old-space-size=5000 node build-web.mjs --assets=aholo --dlc=dlc1 --no-ktx2 # 原 webp 版
```
- 缓存：`/workspace/work/ktx2cache/`（`KTX2_CACHE` 可改）。`glb/<目录>/<名>.<源 md5 前 12 位>.k1.glb` 整个 GLB；`img/<图 md5>.<用途>.k1.ktx2` 单张（同一张图多个 GLB 共用、可续跑）。源 GLB 一改 md5 就变，自动重编；改编码规则把 `SET`（convert.mjs / asset-pack.mjs 两处）+1。
- git 里的源 GLB 不动。缓存 GLB 只换贴图块：BIN 里几何 / 动画 / meshopt 压缩块逐字节保留（只重排偏移），贴图 `EXT_texture_webp` → `KHR_texture_basisu`（extensionsRequired）。
- 冷编全量约 1 小时（逐张串行，单进程 ~1 GB 内存）。缓存不全时构建会现编缺的；编不出来的用原 webp 版并打印。

## 运行时
- `src/web/ktx2.ts`：全局唯一 KTX2Loader；转码器 `basis_transcoder.js/.wasm` 由 `gen-assets.mjs` 以 base64 写进 `src/web/basis.gen.ts`（只在比赛版 --ktx2 构建；base 包空串 → 不建 KTX2Loader），用 LoadingManager URL 改写指向 blob URL，不走网络（file:// 可用）。
- 所有 `new GLTFLoader()` 都包 `withKtx2(...)`（chars.ts、creatures_glb.ts、dlc1/boss_glb.ts）。主渲染器建好后 `setKtx2Renderer(renderer)`；在那之前创建的 loader 用临时 WebGL 上下文查扩展。
- 设备不支持任何压缩格式：KTX2Loader 自动转 RGBA8（显存同转换前），不报错。
