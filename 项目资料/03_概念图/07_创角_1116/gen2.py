import json,subprocess,base64,concurrent.futures as cf
BASE="Key art concept for the CHARACTER CREATION / CHARACTER SELECT screen of a dark-fantasy 3D action RPG called 'Dark Rock Legend', AAA quality like World of Warcraft and Destiny 2 character screens, cinematic lighting, high detail, 16:9 widescreen. The chosen hero stands center-stage on a small platform as the focal point, empty dark negative space on the left and right sides reserved for UI panels (no actual UI text drawn, no logos, no letters). The world's identity: ancient bronze bells, dark basalt, a sunken bell coast, runes. "
SHOTS={
 "E_chrono_sands":"Hero class: Chrono Sandwalker, a physical ranged assassin in dark leather armor with a hood and scarf, holding two glowing bronze chakram time-wheels, a floating hourglass behind the shoulder, faint translucent afterimage echoes of the hero repeating a pose. Setting: a ruined desert clock-temple at golden sunset, a colossal broken bronze clock face and toppled bells half buried in red sand, sand streaming upward frozen in time, floating stone fragments, warm amber key light with teal shadows, Destiny 2 style cinematic.",
 "F_alchemy_lab":"Hero class: Alchemist Grenadier, a spell-caster potion bomber in a leather apron over cloth robes, goggles on the forehead, bandolier of glowing red, blue and green flasks, one flask raised in hand mid-swirl. Setting: a cluttered alchemy tower laboratory built inside an old bronze bell foundry, bubbling vats, copper pipes and alembics, colored smoke in red, blue and green, a small bell hanging over the workbench, shelves of reagents, warm lantern light mixed with the three potion colors, Warcraft-like rich painterly realism.",
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
