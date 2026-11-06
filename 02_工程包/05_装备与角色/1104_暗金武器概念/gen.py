import sys,json,base64,subprocess,urllib.request
k=sys.argv[1]
BASE=("Dark fantasy game weapon concept art, single legendary 'dark-gold' tier weapon, full object shown vertically and centered, "
"three-quarter view, entire weapon visible with margin, no hands, no character, plain dark grey studio background, high detail realistic materials, "
"subtle spectral mint-green glow (#7dffb0) in engravings and cracks, deep-sea drowned-bell-tower theme. ")
W={
"hunter_bow":"Recurve hunting bow 'Eagle Pact' shown together with its matching arrow quiver side by side: moss-green-black metal and dark wood (#1a2418), strongly recurved limbs decorated with eagle feathers, a ghostly eagle spirit wisp curling around the grip, beast-bone tips, the quiver of tooled leather with eagle feathers and bone charms, filled with dark arrows fletched with eagle feathers.",
"warrior_ebb":"Two-handed greatsword 'Ebb Debt': wide blunt heavy blade, deep sea blue-black metal (#10202a), engraved tide-line marks along the blade, a small hollow bronze bell hanging from the crossguard with glowing green water inside it.",
"mage_clash":"Two-handed tall staff 'Clashing Orrery': night-sky indigo-black shaft (#161a2c), at the top three interlocking rings passing through each other, one ember-fire, one frost-ice, one starlight, orbiting a small core.",
"hunter_triad":"Two-handed long-hafted curved glaive 'Triad Pact': moss-green-black metal (#1a2418), long curved blade, three wisps of animal spirits (wolf, bear, eagle) curling from the blade root, a carved beast-bone charm hanging from the pommel.",
"coffin_sleepless":"Coffin weapon 'Sleepless Coffin' carried on the back: narrow tall vigil coffin of grave-iron purple-black (#18161f), iron bands, three small everburning lanterns set on the lid glowing in different soul colours.",
"chrono_owe":"Throwing chakram 'Wheel of Borrowed Time': old bronze-black metal (#1e1c14), clockwork ring blade with dial engravings, the outer ring has one extra tick segment and appears to rotate backwards.",
"chrono_repay":"Off-hand hourglass 'Hourglass of Repayment', small enough to hold in one hand: old bronze-black frame (#1e1c14), clockwork struts; IMPORTANT: the glowing green sand is clearly flowing UPWARD from the lower bulb into the upper bulb, defying gravity, the upper bulb fuller than the lower.",
"alchemy_dissolve":"Throwing potion flask 'Bone-Dissolving Vial', a SMALL hand-held glass bottle only about 25 cm tall (not a staff, no long handle): slim long neck, round body, swamp-green-black metal cap and fittings (#14261a), murky green liquid with tiny white bones suspended inside, rising green bubbles.",
"alchemy_swallow":"Off-hand reagent case 'Tide-Swallowing Reagent Box': ONLY a compact hand-held metal box about 20 cm wide, nothing else (no staff, no pole, no handle shaft), swamp-green-black metal (#14261a) with bronze rivets, its lid shaped like a half-open bronze toothed maw, iridescent rainbow light swirling out of the gap, a few small reagent vials slotted in its sides. Shown alone, centered.",
}
body=json.dumps({"model":"gpt-image-2","prompt":BASE+W[k],"size":"1024x1536","quality":"high","n":1})
r=subprocess.run(["curl","-s","-m","300","https://api.openai-next.com/v1/images/generations","-H","Authorization: Bearer placeholder","-H","Content-Type: application/json","-d",body],capture_output=True)
open(k+".resp.json","wb").write(r.stdout)
j=json.loads(r.stdout); d=j["data"][0]
img=base64.b64decode(d["b64_json"]) if d.get("b64_json") else urllib.request.urlopen(d["url"]).read()
open(k+".png","wb").write(img); print(k,"ok",len(img),j.get("usage"))
