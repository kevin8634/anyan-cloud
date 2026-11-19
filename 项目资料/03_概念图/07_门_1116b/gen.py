import json,subprocess,base64,concurrent.futures as cf
STYLE="Concept art for a dark-fantasy 3D action RPG, stylized-realistic in the spirit of World of Warcraft dungeon entrances (strong sense of place, the entrance grows out of the landscape), its own identity: dark basalt rock, aged bronze, weathered stone, glowing runes, small bronze bell motifs. Three-quarter view from slightly above, whole entrance and its surroundings visible, natural irregular terrain, no text, no people, no UI. "
SHOTS={
 "frost_crypt_icecave":"Entrance to the Everfrost Crypt, a frozen royal tomb: at the bottom of a deep sunken snowy basin ringed by steep frost-covered cliffs, a huge ice cave mouth is carved into the cliff face, framed by a half-buried ancient tomb facade of dark stone with frozen bronze bells and two cracked guardian king statues encased in ice, icicles and blue glacier ice, a winding path of broken stone steps descends into the basin, inside the cave mouth a cold pale-blue swirling portal veil, frozen mist pouring out, frozen waterfall on one side, braziers with blue flames.",
 "molten_throne_firemountain":"Entrance to the Molten Throne, a volcanic fortress dungeon: halfway up a towering jagged volcanic peak, a colossal gate is carved into the mountainside, a switchback path hugging the cliff climbs to a ledge platform in front of it, dark basalt pillars and a monumental bronze-and-obsidian door frame with crown motifs and bronze bells, rivers of lava pouring down the slopes beside the gate, a swirling orange-red fire portal veil inside the arch, ash clouds, embers, glowing cracks, chains and broken banners, epic vertical scale with the summit smoking above.",
}
def go(k):
    body=json.dumps({"model":"gpt-image-2","prompt":STYLE+SHOTS[k],"size":"1536x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","500","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
    try: j=json.loads(r.stdout); x=j["data"][0]
    except Exception: return k,"ERR "+r.stdout[:300]
    if x.get("b64_json"): open(k+".png","wb").write(base64.b64decode(x["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",k+".png",x["url"]])
    return k,"ok "+json.dumps(j.get("usage",{}))
with cf.ThreadPoolExecutor(2) as ex:
    for k,u in ex.map(go,SHOTS): print(k,u)
