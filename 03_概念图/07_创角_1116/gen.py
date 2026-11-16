import json,subprocess,base64,concurrent.futures as cf
BASE="Key art concept for the CHARACTER CREATION / CHARACTER SELECT screen of a dark-fantasy 3D action RPG called 'Dark Rock Legend', AAA quality like World of Warcraft and Destiny 2 character screens, cinematic lighting, high detail, 16:9 widescreen. The chosen hero stands center-stage on a small platform as the focal point, empty dark negative space on the left and right sides reserved for UI panels (no actual UI text drawn, no logos, no letters). The world's identity: ancient bronze bells, dark basalt, a sunken bell coast, runes. "
SHOTS={
 "A_bell_sanctum":"Setting: a vast ruined bell-tower sanctum at dusk, a giant cracked bronze bell hanging overhead, warm candle and brazier light, god rays through broken stained windows, dust motes, a hooded mage in deep blue robes with a glowing staff standing on a round runic stone dais, Warcraft-like warm painterly realism.",
 "B_storm_cliff":"Setting: a windswept cliff above a stormy sea at night, a lighthouse beam sweeping the fog, rain, distant sunken bells in the waves, an armored warrior with a greatsword on a weathered stone ledge, cold teal and silver palette with warm rim light, Destiny 2 style moody cinematic.",
 "C_campfire_camp":"Setting: an intimate night camp in an autumn forest clearing, crackling campfire as the main warm light, banners and a tent behind, fireflies, a hunter with a longbow standing by the fire, other heroes' silhouettes resting at the edge in shadow, cozy Warcraft character-select mood, rich orange and deep blue contrast.",
 "D_void_forge":"Setting: a monumental underground forge hall carved in dark basalt, rivers of molten metal, huge bronze bell molds, sparks and embers drifting, a dark necromancer-like hero with a coffin on his back standing on an obsidian pedestal with glowing rune ring, dramatic red-orange key light and violet fill, epic scale like Destiny 2 tower hangar.",
}
def go(k):
    body=json.dumps({"model":"gpt-image-2","prompt":BASE+SHOTS[k],"size":"1536x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","500","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
    try: x=json.loads(r.stdout)["data"][0]
    except Exception: return k,"ERR "+r.stdout[:300]
    if x.get("b64_json"): open(k+".png","wb").write(base64.b64decode(x["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",k+".png",x["url"]])
    return k,"ok"
with cf.ThreadPoolExecutor(4) as ex:
    for k,u in ex.map(go,SHOTS): print(k,u)
