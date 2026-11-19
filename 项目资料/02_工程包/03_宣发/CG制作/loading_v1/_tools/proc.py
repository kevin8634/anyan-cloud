import numpy as np
from PIL import Image, ImageFilter
SRC='/workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/cloud/CG制作/logo_final/N1_bellcrest.png'
OUT='/workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/cloud/CG制作/loading_v1/assets/'
im=Image.open(SRC).convert('RGB'); print(im.size)
a=np.asarray(im).astype(np.float32)/255
H,W,_=a.shape
r,g,b=a[...,0],a[...,1],a[...,2]
mx=a.max(-1); mn=a.min(-1); sat=(mx-mn)/(mx+1e-5)
# gold mask: warm hue, saturated, bright, within the bell-mouth box
warm=(r>g*1.08)&(g>b*1.15)
ys,xs=np.mgrid[0:H,0:W]
box=(xs>430)&(xs<1110)&(ys>585)&(ys<835)
gold=np.clip((mx-0.28)/0.35,0,1)*np.clip((sat-0.35)/0.3,0,1)*warm*box
gm=Image.fromarray((gold*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
gold=np.asarray(gm).astype(np.float32)/255
print('gold coverage',gold.mean())
# luminance key alpha for black background (unpremultiply)
def keyed(rgb):
    m=rgb.max(-1)
    al=np.clip((m-0.035)/0.30,0,1)**0.9
    # keep colour = rgb / alpha (screen-equivalent unpremultiply), clamp
    col=np.clip(rgb/np.maximum(al[...,None],1e-3),0,1)
    return np.dstack([col,al])
# dim layer: gold pixels cooled to dark bronze-ember
lum=(0.3*r+0.59*g+0.11*b)[...,None]
cool=np.dstack([lum*0.42,lum*0.30,lum*0.22])  # dark warm iron, barely readable
dim=a*(1-gold[...,None])+cool*gold[...,None]
TW=1280; TH=round(H*TW/W)
def save(arr,name,q=82,size=(TW,TH)):
    img=Image.fromarray((np.clip(arr,0,1)*255).astype(np.uint8),'RGBA').resize(size,Image.LANCZOS)
    img.save(OUT+name,'WEBP',quality=q,method=6); print(name,img.size)
    return img
save(keyed(dim),'logo_base.webp')
# gold lit layer (only gold pixels, boosted a bit)
lit=np.clip(a*1.12,0,1)
lit_rgba=np.dstack([lit,gold])
save(lit_rgba,'logo_gold.webp',q=85)
# glow: blurred hot gold, half res
gl=Image.fromarray((np.dstack([np.clip(a*1.3+[0.15,0.05,0],0,1),gold])*255).astype(np.uint8),'RGBA').resize((W//3,H//3),Image.LANCZOS)
# blur premultiplied
ga=np.asarray(gl).astype(np.float32)/255
pm=ga[...,:3]*ga[...,3:4]
pmI=Image.fromarray((np.dstack([pm,ga[...,3]])*255).astype(np.uint8),'RGBA').filter(ImageFilter.GaussianBlur(9))
pa=np.asarray(pmI).astype(np.float32)/255
al=np.clip(pa[...,3]*1.6,0,1)
col=np.clip(pa[...,:3]/np.maximum(pa[...,3:4],1e-3),0,1)
Image.fromarray((np.dstack([col,al])*255).astype(np.uint8),'RGBA').resize((640,round(640*H/W)),Image.LANCZOS).save(OUT+'logo_glow.webp','WEBP',quality=80,method=6)
# full original keyed (for reference / fallback)
save(keyed(a),'logo_full.webp')
# debug previews
Image.fromarray((gold*255).astype(np.uint8)).save('gold_mask.png')
bg=np.zeros((TH,TW,3))
b1=np.asarray(Image.open(OUT+'logo_base.webp')).astype(np.float32)/255
comp=b1[...,:3]*b1[...,3:]
Image.fromarray((comp*255).astype(np.uint8)).save('dbg_base_on_black.png')
