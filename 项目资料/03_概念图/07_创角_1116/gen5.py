import json,subprocess,base64,concurrent.futures as cf
BASE="Key art concept for the CHARACTER CREATION / CHARACTER SELECT screen of a dark-fantasy 3D action RPG called 'Dark Rock Legend', AAA quality like World of Warcraft and Destiny 2 character screens, cinematic lighting, high detail, 16:9 widescreen. The chosen hero stands center-stage on a small platform as the focal point, empty dark negative space on the left and right sides reserved for UI panels (no actual UI text drawn, no logos, no letters). The world's identity: ancient bronze bells, dark basalt, a sunken bell coast, runes. "
SHOTS={
 "A_bell_sanctum":"The hero is a FEMALE mage (a clearly feminine young woman, beautiful face fully visible, hood pushed back, long flowing hair), elegant deep blue and gold robes with a shoulder mantle, a glowing arcane staff in one hand and a swirling frost-arcane orb in the other. Setting: a vast ruined bell-tower sanctum at dusk, a giant cracked bronze bell hanging overhead, warm candle and brazier light, god rays through broken stained windows, dust motes, she stands on a round runic stone dais, Warcraft-like warm painterly realism.",
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
