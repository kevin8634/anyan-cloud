import numpy as np, cv2, onnxruntime as ort, sys
M='/workspace/work/gordon_v3/models/'
TPL=np.float32([[192.98,239.95],[318.90,240.19],[256.0,371.0]])  # 左眼 右眼 嘴中
def run(model, crop, w=0.7):
    s=ort.InferenceSession(M+model+'.onnx',providers=['CPUExecutionProvider'])
    x=(crop[:,:,::-1].astype(np.float32)/255.0-0.5)/0.5  # BGR->RGB
    x=x.transpose(2,0,1)[None]
    feed={'input':x}
    if model=='codeformer': feed['weight']=np.array(w,dtype=np.float64)
    y=s.run(None,feed)[0][0].transpose(1,2,0)
    y=((y.clip(-1,1)+1)/2*255)[:,:,::-1]
    return y.clip(0,255).astype(np.uint8)
def restore(img, pts, model, w=0.7, scale=1.0):
    A,_=cv2.estimateAffinePartial2D(np.float32(pts),TPL)
    crop=cv2.warpAffine(img,A,(512,512),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)
    out=run(model,crop,w)
    Ai=cv2.invertAffineTransform(A)
    H,W=img.shape[:2]
    back=cv2.warpAffine(out,Ai,(W,H),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)
    msk=np.zeros((512,512),np.float32); cv2.rectangle(msk,(30,30),(482,482),1,-1); msk=cv2.GaussianBlur(msk,(0,0),18)
    mb=cv2.warpAffine(msk,Ai,(W,H))[...,None]
    return crop,out,back,mb
if __name__=='__main__':
    src,model,w,outp=sys.argv[1],sys.argv[2],float(sys.argv[3]),sys.argv[4]
    pts=[list(map(float,p.split(','))) for p in sys.argv[5:8]]
    img=cv2.imread(src)
    crop,out,back,mb=restore(img,pts,model,w)
    cv2.imwrite(outp+'_crop.png',crop); cv2.imwrite(outp+'_out.png',out)
    cv2.imwrite(outp+'.png',(img*(1-mb)+back*mb).astype(np.uint8))
