import json,sys,base64,urllib.request,concurrent.futures as cf
PRE="Dark fantasy cinematic matte painting in the style of a Diablo game opening cinematic, painterly oil brushwork, extreme chiaroscuro, deep crushed blacks, volumetric fog, one strong motivated light source, muted desaturated palette with accents of molten gold and eerie teal-green glow, widescreen 16:9 composition, ominous and epic. "
NEG=" No text, no letters, no logo, no watermark, no UI, not cartoon, not anime."
S={
"o1_bell":"A colossal ancient bronze bell hanging inside a ruined gothic bell tower, silhouetted against a stormy night sky with heavy rain. The bell's clapper is frozen still. A jagged crack splits the bell from rim to crown and eerie teal-green light seeps out of the crack. Lightning rims the bell's edge. Far below, a dark city of inverted spires dissolves into fog. Camera slightly below the bell looking up.",
"o2_abyss":"Looking straight down a vast spiral staircase of black stone descending into a bottomless abyssal well carved into dark volcanic rock. At the very bottom, concentric rings of teal-green echo light glow and pulse outward like sound waves. Mist drifts down the shaft, tiny embers float. Strong depth and vertigo, the center of the frame is the glowing well.",
"o3_king":"A gigantic ancient king seated on a throne of black jagged rock at the bottom of an abyss, seen from the front at low angle, enormous scale. He wears a crown forged from broken cracked bell bronze with verdigris. His face is completely in deep shadow; two dark empty eye sockets, the eyes are NOT glowing yet, unlit. Faint teal-green echo light from the ground rims his armored shoulders and the throne edges. Embers drift in the darkness, thick fog at his feet. Center composition, the face in the upper middle of the frame.",
}
def g(k):
  body=json.dumps({"model":"gpt-image-2","prompt":PRE+S[k]+NEG,"size":"1536x1024","quality":"high","n":1}).encode()
  for host in ["api.openai-next.com","us.api.openai-next.com"]:
    try:
      r=urllib.request.urlopen(urllib.request.Request(f"https://{host}/v1/images/generations",body,{"Content-Type":"application/json"}),timeout=400)
      d=json.load(r)["data"][0]
      if d.get("b64_json"): open(k+".png","wb").write(base64.b64decode(d["b64_json"]))
      else: urllib.request.urlretrieve(d["url"],k+".png")
      return k,"ok",host
    except Exception as e: err=str(e)
  return k,"fail",err
ks=sys.argv[1:] or list(S)
with cf.ThreadPoolExecutor(3) as ex:
  for r in ex.map(g,ks): print(r,flush=True)
