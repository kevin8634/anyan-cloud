import json,sys,base64,urllib.request,concurrent.futures as cf
PRE="Dark fantasy cinematic matte painting in the style of a Diablo game opening cinematic, painterly oil brushwork, extreme chiaroscuro, deep crushed blacks, volumetric fog, one strong motivated light source, muted desaturated palette with accents of molten gold and eerie teal-green glow, widescreen 16:9 composition, ominous and epic. "
NEG=" No text, no letters, no logo, no watermark, no UI, not cartoon, not anime."
S={
"bg_select":"Character selection backdrop. A vast plaza beneath the city of Mirrordeep, where an enormous ancient bronze bell hangs inverted from the dark sky above, upside-down gothic spires and towers hanging from above like a reversed city. The plaza floor is a still shallow sheet of black water acting as a perfect mirror, reflecting an upright version of the city that glows faintly brighter in teal-green. Broken obsidian mirror monoliths stand around the edges, catching cold teal light. Thin mist drifts far back toward a sea cave. The lower center of the frame is an empty, calm, dark flat water floor with soft reflections, left open for characters to stand on. The upper-left area stays dark and simple. Left and right thirds are dark with low detail. Main light: cold teal glow from the bell mouth above, with a few small accents of molten gold.",
}
def g(k):
  body=json.dumps({"model":"gpt-image-2","prompt":PRE+S[k]+NEG,"size":"1536x1024","quality":"high","n":1}).encode()
  for host in ["api.openai-next.com","us.api.openai-next.com"]:
    try:
      r=urllib.request.urlopen(urllib.request.Request(f"https://{host}/v1/images/generations",body,{"Content-Type":"application/json"}),timeout=600)
      d=json.load(r)["data"][0]
      if d.get("b64_json"): open(k+".png","wb").write(base64.b64decode(d["b64_json"]))
      else: urllib.request.urlretrieve(d["url"],k+".png")
      return k,"ok",host
    except Exception as e: err=str(e)
  return k,"fail",err
ks=sys.argv[1:] or list(S)
with cf.ThreadPoolExecutor(3) as ex:
  for r in ex.map(g,ks): print(r,flush=True)
