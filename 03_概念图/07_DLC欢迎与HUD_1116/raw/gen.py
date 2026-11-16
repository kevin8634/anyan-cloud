import json,subprocess,base64,sys,os
OUT="/workspace/work/anyan-cloud/03_概念图/07_DLC欢迎与HUD_1116/raw/"
os.chdir(os.path.dirname(os.path.abspath(__file__)))
STYLE=("Dark gothic fantasy, AAA cinematic key art like World of Warcraft and Destiny 2 intro screens, painterly realism, high detail, 16:9 widescreen. "
 "Expansion 'Abyssal Echo': a vast underground sea beneath a colossal cavern dome; an inverted gothic city (the Mirror-Abyss City) hangs upside-down from the dome like stalactites with dim teal windows; "
 "sunken bell towers and giant drowned bronze bells rising from black water; a pale cold moon glimmering through a rippling water surface far above at the dome's zenith, wavering god-rays and teal caustics. "
 "Palette: ink black, deep-sea navy blue-black, cold teal-green and cyan glow, dark wet iron, muted jade, cold silver moonlight, with only small dull copper/verdigris bronze accents. "
 "STRICTLY no warm yellow or golden light, no sunset, no orange, no purple. "
 "Absolutely NO text, NO letters, NO logos, NO watermark anywhere in the image. ")
GEN={
 "W1_open":STYLE+"Storyboard frame 1 of the expansion's opening welcome animation: an epic establishing wide shot. The camera glides low over a still black underground sea toward the horizon; ahead, a colossal ancient sunken bell tower half-drowned in the water, its huge verdigris bronze bell hanging silent; faint concentric cyan echo-ripples spread across the water surface and through the air from the bell as if it just tolled once. Above, the inverted city hangs from the cavern dome, its spires pointing down, mirrored in the black water. Drifting sea-mist bands, bioluminescent cyan motes, a broken shipwreck mast. Quiet, vast, eerie, melancholic.",
 "W2_heroes":STYLE+"Storyboard frame 2 of the expansion's opening welcome animation: a heroic group lineup of exactly SIX heroes standing side by side on a wet black basalt jetty at the edge of the underground sea, the drowned bell tower and the inverted city behind them, each hero lit by a cold rim light plus a small accent of their own signature colour, faces clearly visible, hoods down. From left to right: "
  "(1) a FEMALE mage, a clearly feminine young woman with long flowing hair, modest high-collared deep navy and teal robes with dark iron trim, glowing frost-arcane staff (ice-blue light); "
  "(2) a MALE warrior, rugged bearded man in dark plate armour and tattered cloak, holding a huge greatsword (steel-white light); "
  "(3) a FEMALE hunter, a clearly feminine young woman with braided hair, chain-mail armour with a fur mantle, reflex hunting bow, a ghostly cyan spirit wolf at her side (pale green light); "
  "(4) a MALE coffin bearer, gaunt pale man in heavy dark ornate armour carrying a massive iron coffin bound with chains on his back, cold spectral energy in his hand (cyan-white light); "
  "(5) a MALE chrono sandwalker, man in sand-coloured hooded wraps with hood down and face visible, pale glowing clock-dial rings around his hands and a floating hourglass (pale silver light); "
  "(6) a MALE alchemist grenadier, man with goggles on his forehead and a short beard, long dark leather coat, bandolier of glowing potion vials, holding a green glowing bomb flask (acid green light). "
  "Heroes evenly spaced across the frame, full body, confident poses, sea mist swirling at their feet, cyan motes in the air.",
 "W3_logo":STYLE+"Storyboard frame 3 (final title card) of the expansion's opening welcome animation: the drowned bell tower and the inverted city seen in deep shadow, framed at the edges of the image; the whole UPPER-CENTRE half of the frame is an EMPTY, very dark, almost pure black calm area (deep night water and darkness, nothing drawn there) reserved for a logo to be added later. A still black water surface across the lower-middle with faint cyan concentric ripples. Centred in the lower fifth, one ornate EMPTY horizontal button frame made of dark wet iron with thin teal glowing edges, small verdigris bronze bell ornaments on each end, and a dark smooth blank button face. Very dark overall, low-key lighting. NO letters at all.",
}
BG=("Keep this exact hero character completely unchanged: same person, same face, same hair, same body, same pose, same costume with exactly the same coverage and cut, same staff/weapon and props, standing on the round stage platform in the centre. "
 "Only replace the ENVIRONMENT and the lighting around the hero with the expansion 'Abyssal Echo' setting: ")
EDIT={
 "H1_bg":("A_bell_sanctum_base.png",None,BG+"a drowned bell sanctum at the shore of a vast underground sea - a giant verdigris bronze bell hanging behind her, wet black stone gothic arches, the inverted city hanging from the cavern dome in the distance, black water with teal reflections and caustics, pale cold moonlight shafts from far above, cyan bioluminescent motes, sea mist. Replace all warm candle and sunset light with cold teal, cyan and silver moonlight; recolour the lighting on the hero to cold moonlight and teal rim light, and make the gold trims of the environment dark iron and verdigris. Palette ink black, deep-sea navy, teal-green, cyan, dark iron, small copper accents. No yellow, no orange sunset, no candles. No text."),
 "H2_bg":("D_void_forge_base.png",None,BG+"a sunken coffin harbour / drowned bell-tower pier at the underground sea - wet black basalt, chained sunken bronze bells hanging from above, broken gothic spires of the inverted city hanging from the cavern dome, black water with faint teal glow instead of lava, cold mist, pale moonlight shafts, ghostly cyan soul-lights drifting. Replace all lava, orange and purple light with cold teal-cyan and silver; the energy in his hand becomes cold cyan spectral flame. Palette ink black, deep-sea navy, teal-green, cyan, dark iron, small copper accents. No lava, no orange, no purple. No text."),
}
UI=("Add a TEXT-FREE game interface skin around the edges of this painting. Keep the centre of the image (the hero, the face, the costume, the stone platform and the background) completely unchanged. "
 "Only paint inside the transparent mask areas (left column, right column, bottom band). Style: dark gothic expansion UI of dark wet iron with thorny wrought-iron filigree frames, thin cold teal-cyan glowing edges, small verdigris-copper bell ornaments, semi-transparent deep navy-black glass backing; NO gold, NO yellow, NO parchment. "
 "LEFT column: one tall framed panel holding 4 empty stacked horizontal slot cards, each card has an empty round portrait ring on its left (no faces), and a 5th card below that shows only a large plus sign. "
 "RIGHT column: one tall framed dark slate-glass panel with an empty iron ribbon banner at the top, a row of three small teal diamond gems, a large empty dark panel area, and three empty square iron-framed sockets at its bottom. "
 "BOTTOM band: in the centre a long empty dark iron input bar and directly to its right a large glowing ornate iron-and-teal button with a completely blank face; below/around them a horizontal row of SIX round iron-rimmed medallions each containing only a simple engraved pictogram: a staff, a sword, a bow, a coffin, an hourglass, a potion flask; %s "
 "STRICT: this is a blank UI template - there must be ZERO text, ZERO letters, ZERO Chinese characters, ZERO numbers, ZERO logos or brand emblems anywhere. Every banner, slot, field and button is empty.")
EDIT["H1_ui"]=(OUT+"H1_bg.png","mask_edges.png",UI%"the staff medallion glows bright cyan as selected.")
EDIT["H2_ui"]=(OUT+"H2_bg.png","mask_edges.png",UI%"the coffin medallion glows bright cyan as selected.")
def save(k,out):
    try: x=json.loads(out)["data"][0]
    except Exception: print(k,"ERR",out[:500]); return
    if x.get("b64_json"): open(OUT+k+".png","wb").write(base64.b64decode(x["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",OUT+k+".png",x["url"]])
    print(k,"ok",flush=True)
k=sys.argv[1]
if k in GEN:
    body=json.dumps({"model":"gpt-image-2","prompt":GEN[k],"size":"1536x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","900","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
else:
    img,m,p=EDIT[k]
    a=["curl","-s","-m","900","https://api.openai-next.com/v1/images/edits","-F","model=gpt-image-2","-F","image=@"+img]
    if m: a+=["-F","mask=@"+m]
    r=subprocess.run(a+["-F","prompt="+p,"-F","size=1536x1024","-F","quality=high","-F","n=1"],capture_output=True,text=True)
save(k,r.stdout)
