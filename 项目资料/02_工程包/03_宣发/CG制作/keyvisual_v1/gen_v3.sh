#!/bin/bash
# C1 战士加盾（11-02 09:55）；C2 法师女性特征加强（v2 偏中性）
cd /workspace/work/.agents/skills/credit-media-skill; export CREDIT_MEDIA_API_KEY=proxy
O=/workspace/projects/04b4b2af-0042-4c1b-a4f3-cdc315529fa5/promo/keyvisual_v1
CPRE="写实电影级角色设定图，暗黑奇幻，参考图是同一角色的上一版设定图，保持其画风、布局（左正面全身、中背面全身、右武器配件特写）、背景、光影与服装配色，只做以下修改："
NEG="画面中不要出现任何文字、标注、水印、UI；不要卡通或Q版；不要多余肢体；正面与背面必须是同一人同一套装备；人物比例正常，不要性感化。"
bash scripts/run.sh image --model gpt-image-2 --size 1536x1024 --quality high --image $O/C1_warrior.png --prompt "$CPRE 战士保持原人物、暗铁板甲、深红破披风不变；正面图左手持一面厚重暗铁鸢形盾（盾面有磨损的青铜钟纹浮雕与铆钉包边），右手持长剑；背面图盾牌挂在左臂外侧可见盾背皮带；右侧特写改为三件：长剑、鸢形盾正面、短斧。 $NEG" --out $O/C1_warrior_v2.png > $O/C1_warrior_v2.log 2>&1 &
bash scripts/run.sh image --model gpt-image-2 --size 1536x1024 --quality high --image $O/C2_mage_v2.png --prompt "$CPRE 人物必须明确是成年女性：柔和的女性脸部轮廓、细眉、无胡须、深色长发编成侧辫，身形为女性（肩窄、腰线收紧），服装与配件保持不变（深蓝骨白法袍、暗金符文、法典、法球、吊坠、手托火冰雷三色微光）。 $NEG" --out $O/C2_mage_v3.png > $O/C2_mage_v3.log 2>&1 &
wait
for f in C1_warrior_v2 C2_mage_v3; do convert $f.png -quality 88 jpg/$f.jpg; done
