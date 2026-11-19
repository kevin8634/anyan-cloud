# 魔搭创空间 Docker：免费 CPU（platform/2v-cpu-8g-mem），监听 7860
# 基础镜像用魔搭镜像仓库（国内拉取稳定），装系统 nodejs（≥18，自带 fetch）
FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/* && node -v
WORKDIR /home/user/app
COPY server.js diag.js ./
COPY forge ./forge
COPY public ./public
# v1.2.47：任务表 + 模型放持久盘 /mnt/workspace（重启不丢，不可写时服务自动退回 /tmp）；FORGE_CLAIM=1 定时领取模式（魔搭专用开关，可在创空间变量里改成 0）
ENV PORT=7860 GLB_DIR=/mnt/workspace/forge_glb FORGE_CLAIM=1 CLAIM_ETA_S=120
EXPOSE 7860
CMD ["node", "server.js"]
