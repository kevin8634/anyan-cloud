# 调试：每三角区域标签 / 主骨标签 → npy（给 raster.py 上色）  python3 labels.py <cfg> <meshdir> <rig.json> <out_region.npy> <out_bone.npy>
import numpy as np,json,sys
cfg={};exec(open(sys.argv[1]).read(),cfg);D=sys.argv[2].rstrip('/')+'/'
P=np.fromfile(D+'pos.bin',np.float32).reshape(-1,3);I=np.fromfile(D+'idx.bin',np.uint32).reshape(-1,3)
R=cfg['regions'](P[:,0],P[:,1],P[:,2]);rs=sorted(set(R));ri=np.array([rs.index(r) for r in R])
np.save(sys.argv[4],ri[I[:,0]]);print(dict(enumerate(rs)))
rig=json.load(open(sys.argv[3]));si=np.array(rig['si']).reshape(-1,4);sw=np.array(rig['sw']).reshape(-1,4)
top=si[:,0];np.save(sys.argv[5],top[I[:,0]]);print({i:b['name'] for i,b in enumerate(rig['bones'])})
