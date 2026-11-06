#!/bin/bash
# usage: gen.sh <cls>  — 贴身版重绘（Rhett 11-04 15:34 批）
set -a; source /workspace/work/chars/env.sh; set +a
cd /workspace/work/cms/credit-media-skill
C=$1
BASE="Redesign this exact same character armor set as a FORM-FITTING version for a 3D game rig. Keep the same character, face/hood, color palette, materials, ornament motifs, emblems and overall design language. Changes: all coats, robes, skirts, tabards and cloth strips must end ABOVE MID-THIGH; no floor-length or knee-length hems, no loose flowing cloth, no capes, no long tattered strips, no dangling chains or hanging props; sleeves fitted; legs clearly separated and fully visible with fitted trousers/greaves and boots; hands empty. Full body front view, standing straight, arms slightly away from body, feet fully visible, plain dark grey studio background, high detail realistic dark fantasy game character concept art, single character."
case $C in
 mage)  X="Mage: keep the indigo starry robe pattern, star sigils and gold trim, but turn the long robe into a fitted mid-thigh tunic over fitted dark leggings and tall boots.";;
 chrono) X="Chrono sand-walker: keep the gold and bronze clockwork motifs and shoulder piece, remove the long golden cloth flaps, use a short fitted tabard above mid-thigh over fitted trousers.";;
 hunter) X="Spirit hunter: keep the wolf-pelt pauldron, grey-blue tattered motif and mask, but replace the long tattered coat with a fitted short jacket ending above mid-thigh, fitted wrapped trousers.";;
 coffin) X="Coffin bearer: keep the black iron cross-hatched armor, helmet with glowing visor slit and gold cross emblem, remove the lantern and the long ragged robe; fitted plate cuirass and short faulds above mid-thigh over fitted leg armor.";;
esac
python3 scripts/credit_media.py image --model gpt-image-2 --quality high --size 1024x1536 --image /workspace/work/chars/concept40/sets/$C.png --prompt "$BASE $X" --out /workspace/work/chars/concept40/sets_fit/${C}_fit.png
