import json,subprocess,base64,sys
STYLE=("Dark gothic fantasy, AAA cinematic key art like World of Warcraft and Destiny 2 intro screens, painterly realism, high detail, 16:9 widescreen. "
 "World identity: 'Dark Rock' - black basalt crags, ancient gothic bell towers, giant bronze bells, dark gold and aged parchment accents, runes. "
 "Absolutely NO text, NO letters, NO logos, NO watermark anywhere in the image. ")
GEN={
 "W1_open":STYLE+"Storyboard frame 1 of an opening welcome animation: an epic establishing wide shot at dawn. A vast dark basalt land of jagged black rock spires; on the tallest crag stands a colossal ancient gothic bell tower with a huge bronze bell visibly swinging, faint golden concentric sound-wave ripples spreading through the air from the bell. Thick morning mist rolls through the valleys below, first pale gold sunlight breaking on the horizon behind the tower, flocks of crows lifting off, tiny lit windows in distant ruined spires. Quiet, majestic, melancholic mood, lots of atmosphere, cool blue-grey shadows with warm gold highlights.",
 "W2_heroes":STYLE+"Storyboard frame 2 of an opening welcome animation: a heroic group lineup of exactly SIX heroes standing side by side on a misty basalt ridge in front of a giant bell tower at dawn, each lit by a dramatic rim light in their own signature colour as if revealed one after another, faces visible. From left to right: "
  "(1) a FEMALE mage, a clearly feminine young woman with long flowing hair, hood down, deep blue and gold robes, glowing frost-arcane staff (blue light); "
  "(2) a MALE warrior, rugged bearded man in dark plate armour and tattered cloak, holding a huge greatsword (steel-white light); "
  "(3) a FEMALE hunter, a clearly feminine young woman with braided hair, red hooded leather armour pulled back to show her face, longbow, a ghostly blue spirit wolf at her side (crimson light); "
  "(4) a MALE coffin bearer, gaunt pale man in dark ornate armour carrying a massive iron coffin strapped on his back, purple void energy in his hand (violet light); "
  "(5) a MALE chrono sandwalker, man in sand-coloured hooded wraps with face visible, glowing golden clock-dial rings around his hands and a floating hourglass (amber light); "
  "(6) a MALE alchemist grenadier, man with goggles on his forehead and a short beard, long red leather coat, bandolier of glowing potion vials, holding a red bomb flask (green-red light). "
  "Heroes are evenly spaced across the frame, full body, confident poses, morning fog swirling at their feet, golden dust in the air.",
 "W3_logo":STYLE+"Storyboard frame 3 (final title card) of an opening welcome animation: the giant bronze bell tower seen from below in silhouette against a dawn sky with gold light and drifting mist, the lower-centre of the frame darkened into a calm vignette. In the upper-middle there is an ornate EMPTY dark-gold gothic title plaque / crest emblem (a bell and crossed runes motif with filigree wings) with a blank smooth area where the game logo will be added later - leave it completely blank. Below it, centred in the lower third, one large ornate EMPTY button frame: a horizontal dark-gold and aged-parchment gothic button with glowing edges and small bell ornaments on each end, the button face is blank. Faint gold embers and light rays. NO letters at all.",
}
HUDCORE=("Turn this exact image into a finished in-game CHARACTER SELECT / CHARACTER CREATION HUD screen mockup in the style of World of Warcraft and Destiny 2 character select. KEEP the background scene and the hero in the centre exactly as they are (same person, same face, same costume, same pose); the hero stands on the central round stage platform. "
 "Overlay ornate dark-gothic UI panels in an aged-parchment and dark antique-gold style with thin gold filigree borders, semi-transparent dark backing: "
 "(a) LEFT side: a tall vertical character roster panel containing 4 stacked save-slot cards (each with a small round portrait thumbnail on its left and blank space for text) and below them one '+' new-character slot card; "
 "(b) RIGHT side: a tall class detail panel with a blank title banner at top, a small row of three diamond difficulty pips, blank text lines area, and three square skill icon slots with glowing ability icons; "
 "(c) BOTTOM edge: a horizontal strip of SIX round gold-rimmed class emblem icons (staff, sword, bow, coffin, hourglass, potion flask), one of them highlighted; "
 "(d) BOTTOM CENTRE above the icon strip: a blank parchment name-entry text field and next to it a large glowing ornate gold primary button with a blank face. "
 "Do not cover the hero's face or body with UI; panels stay at the edges. IMPORTANT: draw NO text, NO letters, NO numbers, NO words anywhere - all labels and buttons are blank, text will be added later.")
EDIT={
 "H1_mage":("A_bell_sanctum_base.png",HUDCORE+" The hero is the FEMALE mage; the highlighted class icon is the staff. Warm candle-gold UI glow matching the bell sanctum."),
 "H2_coffin":("D_void_forge_base.png",HUDCORE+" The hero is the MALE coffin bearer; the highlighted class icon is the coffin. Violet void accents on the UI glow matching the void forge."),
}
def save(k,out):
    try: x=json.loads(out)["data"][0]
    except Exception: print(k,"ERR",out[:500]); return
    if x.get("b64_json"): open(k+".png","wb").write(base64.b64decode(x["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",k+".png",x["url"]])
    print(k,"ok")
k=sys.argv[1]
if k in GEN:
    body=json.dumps({"model":"gpt-image-2","prompt":GEN[k],"size":"1536x1024","quality":"high","n":1})
    r=subprocess.run(["curl","-s","-m","600","https://api.openai-next.com/v1/images/generations","-H","Content-Type: application/json","-d",body],capture_output=True,text=True)
else:
    img,p=EDIT[k]
    r=subprocess.run(["curl","-s","-m","600","https://api.openai-next.com/v1/images/edits","-F","model=gpt-image-2","-F","image=@"+img,"-F","prompt="+p,"-F","size=1536x1024","-F","quality=high","-F","n=1"],capture_output=True,text=True)
save(k,r.stdout)
