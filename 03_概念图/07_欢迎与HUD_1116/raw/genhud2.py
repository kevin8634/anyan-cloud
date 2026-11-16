import json,subprocess,base64,sys
P=("Add a TEXT-FREE game interface skin around the edges of this painting. Keep the centre of the image (the hero, the face, the costume, the stone platform and the background) completely unchanged. "
 "Only paint inside the transparent mask areas (left column, right column, bottom band). Style: dark gothic, aged parchment panels with dark antique-gold filigree frames, small bronze bell ornaments, semi-transparent black backing. "
 "LEFT column: one tall framed panel holding 4 empty stacked horizontal slot cards, each card has an empty round portrait ring on its left (no faces), and a 5th card below that shows only a large plus sign. "
 "RIGHT column: one tall framed parchment panel with an empty ribbon banner at the top, a row of three small gold diamond gems, a large empty parchment area, and three empty square gold-framed sockets at its bottom. "
 "BOTTOM band: in the centre a long empty parchment input bar and directly to its right a large glowing ornate gold-and-crimson button with a completely blank face; below/around them a horizontal row of SIX round gold-rimmed medallions each containing only a simple engraved pictogram: a staff, a sword, a bow, a coffin, an hourglass, a potion flask; %s "
 "STRICT: this is a blank UI template - there must be ZERO text, ZERO letters, ZERO Chinese characters, ZERO numbers, ZERO logos or brand emblems anywhere. Every banner, slot, field and button is empty.")
J={"H1_mage":("A_bell_sanctum_base.png","the staff medallion glows warm gold as selected."),
   "H2_coffin":("D_void_forge_base.png","the coffin medallion glows violet as selected.")}
k=sys.argv[1];img,x=J[k]
r=subprocess.run(["curl","-s","-m","600","https://api.openai-next.com/v1/images/edits","-F","model=gpt-image-2","-F","image=@"+img,"-F","mask=@mask_edges.png","-F","prompt="+P%x,"-F","size=1536x1024","-F","quality=high","-F","n=1"],capture_output=True,text=True)
try:
    d=json.loads(r.stdout)["data"][0]
    if d.get("b64_json"): open(k+"_v2.png","wb").write(base64.b64decode(d["b64_json"]))
    else: subprocess.run(["curl","-s","-m","120","-o",k+"_v2.png",d["url"]])
    print(k,"ok")
except Exception: print(k,"ERR",r.stdout[:500])
