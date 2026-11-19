import json,subprocess,base64,concurrent.futures as cf
STYLE="Concept art for a dark-fantasy 3D action RPG (stylized-realistic, like World of Warcraft dungeon entrances but with its own identity: dark basalt rock, aged bronze, weathered stone, glowing runes), three-quarter view from slightly above, full structure visible on natural irregular ground, no text, no people, no UI. "
SHOTS={
 "long_dungeon":"Grand entrance to a long dungeon: a massive half-buried ancient gate carved into a cliff of dark basalt, two leaning bronze bells hung from broken stone arches, cracked stairs with moss and frost, a deep swirling ember-orange portal veil inside the arch, embers drifting, chains, irregular rubble around, dramatic scale.",
 "field_portal":"Overworld waypoint teleport portal: an irregular ring of standing rune stones on a cracked stone dais with roots and grass growing through, a vertical oval of cool blue-white light with rippling surface, floating rune shards orbiting slowly, soft light spilling onto the ground.",
 "small_dungeon":"Small dungeon door: a low crypt-like doorway in a rocky hillside, weathered bronze door frame with bell motifs, a dim violet swirling veil inside, two iron lanterns, scattered bones and dead leaves, ivy and moss, intimate scale.",
 "return_portal":"Dungeon exit/return portal inside a cave chamber: a broken stone archway on uneven rock floor, warm golden swirling veil, small waterfall of light particles, glowing runes on the floor in an irregular broken circle, crystals and rubble around.",
}
def go(k):
    body=json.dumps({"model":"gpt-image-2","prompt":STYLE+SHOTS[k],"size":"1536x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","400","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
    try: x=json.loads(r.stdout)["data"][0]
    except Exception: return k,"ERR "+r.stdout[:300]
    if x.get("b64_json"): open(k+".png","wb").write(base64.b64decode(x["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",k+".png",x["url"]])
    return k,"ok"
with cf.ThreadPoolExecutor(4) as ex:
    for k,u in ex.map(go,SHOTS): print(k,u)
