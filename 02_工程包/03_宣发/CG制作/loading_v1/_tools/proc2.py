import numpy as np
from PIL import Image, ImageFilter
exec(open('proc.py').read().split("TW=1280")[0])  # reuse masks (a, gold, dim)
OUT='/workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/cloud/CG制作/loading_v1/assets/'
import os
for f in os.listdir(OUT): os.remove(OUT+f)
TW=1280; TH=round(H*TW/W)
def sv(arr,name,q,size):
    img=Image.fromarray((np.clip(arr,0,1)*255).astype(np.uint8),'RGB').resize(size,Image.LANCZOS)
    img.save(OUT+name,'WEBP',quality=q,method=6); print(name,img.size,os.path.getsize(OUT+name))
# crush near-black to true black so screen-blend leaves no box
def crush(x): 
    m=x.max(-1,keepdims=True); return x*np.clip((m-0.02)/0.06,0,1)
sv(crush(dim),'n1_base.webp',80,(TW,TH))
sv(crush(np.clip(a*1.1,0,1)*gold[...,None]),'n1_gold.webp',82,(TW,TH))
# glow: blurred gold, warm-boosted
gi=Image.fromarray((np.clip(a*1.35*gold[...,None]+np.array([0.10,0.04,0])*gold[...,None],0,1)*255).astype(np.uint8)).resize((512,round(512*H/W)),Image.LANCZOS).filter(ImageFilter.GaussianBlur(7))
g=np.asarray(gi).astype(np.float32)/255*1.8
sv(g,'n1_glow.webp',78,(512,round(512*H/W)))
