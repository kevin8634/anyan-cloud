import json,subprocess,sys,base64,concurrent.futures as cf
S="Game VFX texture for additive blending, pure black background (#000000), no text, no watermark, no frame, centered, soft glowing edges fading to pure black, painterly dark fantasy style, teal-green and pale gold spirit energy. "
P={
"hfx_spirit_flame":S+"Seamless tileable flowing spirit-flame texture: wispy ethereal fire strands streaming upward, fine filament detail, bright cores, used as animated scrolling texture on a ghostly beast spirit.",
"hfx_claw":S+"Three parallel diagonal beast claw slash marks, sharp tapered ends, hot bright white cores with teal glow and tiny sparks, top-left to bottom-right.",
"hfx_feather":S+"Single glowing spectral feather shaped like a blade, horizontal, sharp tip pointing right, translucent vane with luminous rachis, small trailing particles.",
"hfx_arrow_trail":S+"Horizontal arrow streak light trail, bright thin white-hot head at right, long tapering teal energy tail fading to the left with spiral wisps.",
"hfx_chain":S+"Horizontal seamless tileable spectral chain of interlocking glowing links made of spirit energy, runic engravings on links, spanning full width.",
"hfx_totem_rune":S+"Circular druidic beast-pact rune seal seen from top, concentric rings with wolf, bear and eagle glyphs, thin luminous lines, symmetric.",
"hfx_ground_crack":S+"Top-down radial ground fissure decal, jagged cracks radiating from center with molten-teal glowing light inside the cracks, debris dust.",
"fx_chime_bell":"Game VFX texture for additive blending, pure black background (#000000), no text, no watermark, centered. A large spectral church bell seen from the front, made of glowing golden-bronze light, engraved runes on its rim, bright white-gold rim light, faint concentric sound ripples around it, soft glow fading to pure black, dark fantasy painterly style.",
"npc_iola_bell":"Game VFX texture for additive blending, pure black background (#000000), no text, no watermark, centered. A small ornate hand bell pendant woven from glowing golden light threads, filigree patterns, white-hot inner glow, tiny floating golden motes, soft glow fading to pure black, ethereal dark fantasy style.",
"hfx_howl_ring":S+"Top-down expanding sonic shockwave ring, distorted concentric pulses, bright rim with ghostly beast-howl streaks, empty dark center.",
}
def one(k):
    body=json.dumps({"model":"gpt-image-2","prompt":P[k],"size":"1024x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","400","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
    try:
        d=json.loads(r.stdout); x=d["data"][0]
        if x.get("b64_json"): open(k+".png","wb").write(base64.b64decode(x["b64_json"]))
        else: subprocess.run(["curl","-s","-m","120","-o",k+".png",x["url"]])
        return k+" ok "+json.dumps(d.get("usage"))[:200]
    except Exception as e: return k+" FAIL "+r.stdout[:300]
ks=sys.argv[1:] or list(P)
with cf.ThreadPoolExecutor(8) as ex:
    for s in ex.map(one,ks): print(s,flush=True)
