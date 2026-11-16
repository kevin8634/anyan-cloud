import json,subprocess,base64,concurrent.futures as cf
BASE="Key art concept for the CHARACTER CREATION / CHARACTER SELECT screen of a dark-fantasy 3D action RPG called 'Dark Rock Legend', AAA quality like World of Warcraft and Destiny 2 character screens, cinematic lighting, high detail, 16:9 widescreen. The chosen hero stands center-stage on a small platform as the focal point, empty dark negative space on the left and right sides reserved for UI panels (no actual UI text drawn, no logos, no letters). The world's identity: ancient bronze bells, dark basalt, a sunken bell coast, runes. "
SHOTS={
 "C_campfire_camp":"The hero is a MALE hunter (a rugged bearded man, clearly masculine, broad shoulders), chainmail in steel grey under a hooded ranger cloak, a longbow in hand, a spectral beast-spirit wolf faintly glowing beside him. Setting: an intimate night camp in an autumn forest clearing, crackling campfire as the main warm light, banners and a tent behind, fireflies, other heroes' silhouettes resting at the edge in shadow, cozy Warcraft character-select mood, rich orange and deep blue contrast. No women in the foreground.",
 "F_alchemy_lab":"The hero is a MALE Alchemist Grenadier (a clearly masculine man with a short beard), a scholar's long charcoal-red coat, a bird-beak plague-doctor style mask pushed up on his head, brass goggles, bandolier of glowing red, blue and green flasks, one flask raised in hand mid-swirl. Setting: a cluttered alchemy tower laboratory built inside an old bronze bell foundry, bubbling vats, copper pipes and alembics, colored smoke in red, blue and green, a small bell over the workbench, shelves of reagents, warm lantern light mixed with the three potion colors, Warcraft-like rich painterly realism.",
}
def go(k):
    body=json.dumps({"model":"gpt-image-2","prompt":BASE+SHOTS[k],"size":"1536x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","500","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
    try: x=json.loads(r.stdout)["data"][0]
    except Exception: return k,"ERR "+r.stdout[:300]
    if x.get("b64_json"): open(k+".png","wb").write(base64.b64decode(x["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",k+".png",x["url"]])
    return k,"ok"
with cf.ThreadPoolExecutor(2) as ex:
    for k,u in ex.map(go,SHOTS): print(k,u)
