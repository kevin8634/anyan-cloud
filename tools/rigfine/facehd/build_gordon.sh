# 用法: build.sh 脸部贴图 输出目录名 ; 额外 env 透传给 gordon_facetex
V=/workspace/work/gordon_v3; cd /workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/anyan; export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
NONRM=${NONRM-1} SMOOTH=${SMOOTH-0.30} node tools/rigfine/gordon_facetex.mjs /workspace/work/gordon_facehd/disp_nrm.glb $1 $V/face_tris.bin -0.052,0.054,0.335,0.465 $V/disp_face.glb | tail -1
MRTEX=1024 node tools/lux3d-weightxfer.mjs /workspace/work/gordon_facehd/wl_gordon_t_rig15k.glb $V/disp_face.glb $V/wl_gordon_t_rigged_v3.glb 2>&1 | tail -1
cp $V/wl_gordon_t_rigged_v3.glb assets_aholo/dlc1/creatures_pilot/wl_gordon_t_rigged.glb
CAMS=${CAMS:-eyes,face} STILLS_ONLY=1 timeout 100 node tools/rigfine/skin_gordon_shoot.mjs assets_aholo/dlc1/creatures_pilot/wl_gordon_t_rigged.glb $V/$2 gordon | tail -1
