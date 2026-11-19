import numpy as np, cv2, onnxruntime as ort, sys, os
so=ort.SessionOptions(); so.intra_op_num_threads=2
s=ort.InferenceSession('/workspace/work/gordon_v4/models/real_esrgan_x4.onnx',so,providers=['CPUExecutionProvider'])
src,dst,a,b=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
img=cv2.imread(src)[:,:,::-1].astype(np.float32)/255
H,W=img.shape[:2]; T=128; P=8
out=np.load(dst) if os.path.exists(dst) else np.zeros((H*4,W*4,3),np.float16)
tiles=[(y,x) for y in range(0,H,T) for x in range(0,W,T)]
for y,x in tiles[a:b]:
    y0,x0=max(y-P,0),max(x-P,0); y1,x1=min(y+T+P,H),min(x+T+P,W)
    o=s.run(None,{'input':img[y0:y1,x0:x1].transpose(2,0,1)[None]})[0][0].transpose(1,2,0)
    oy,ox=(y-y0)*4,(x-x0)*4; h,w=min(T,H-y)*4,min(T,W-x)*4
    out[y*4:y*4+h,x*4:x*4+w]=o[oy:oy+h,ox:ox+w]
np.save(dst,out); print(len(tiles))
