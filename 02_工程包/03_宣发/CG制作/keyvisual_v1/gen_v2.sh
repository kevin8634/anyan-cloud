#!/bin/bash
# v2 重出：C2 法师改女性；C5 鹰契=弓（Rhett 11-02 09:53）
cd /workspace/work/.agents/skills/credit-media-skill; export CREDIT_MEDIA_API_KEY=proxy
O=/workspace/projects/04b4b2af-0042-4c1b-a4f3-cdc315529fa5/promo/keyvisual_v1
CPRE="写实电影级角色设定图，暗黑奇幻，参考图是同一角色的上一版设定图，保持其画风、布局（左正面全身、中背面全身、右武器配件特写）、背景、光影与服装配色，只做以下修改："
NEG="画面中不要出现任何文字、标注、水印、UI；不要卡通或Q版；不要多余肢体；正面与背面必须是同一人同一套装备；人物比例正常，不要性感化。"
bash scripts/run.sh image --model gpt-image-2 --size 1536x1024 --quality high --image $O/C2_mage.png --prompt "$CPRE 法师改为成年女性（约三十岁，五官坚毅、神情沉静，深色长发），服装仍是深蓝与骨白长法袍、暗金符文刺绣，腰挂法典与水晶法球，一手托火、冰、雷三色微光；右侧配件保留法典、法球、吊坠。 $NEG" --out $O/C2_mage_v2.png > $O/C2_mage_v2.log 2>&1 &
bash scripts/run.sh image --model gpt-image-2 --size 1536x1024 --quality high --image $O/C5_hunter.png --prompt "$CPRE 灵契猎手保持原人物、链甲兽皮、鸣钟人徽记、长柄弯刃和狼熊鹰三只幽影绿兽魂不变；新增一把反曲猎弓（鹰契武器）：正面图中弓背在背后或挂于腰侧，背面图可见弓与箭袋；右侧特写改为三件：长柄弯刃、带鹰羽装饰的反曲猎弓与箭袋、鸣钟人徽记。 $NEG" --out $O/C5_hunter_v2.png > $O/C5_hunter_v2.log 2>&1 &
wait
