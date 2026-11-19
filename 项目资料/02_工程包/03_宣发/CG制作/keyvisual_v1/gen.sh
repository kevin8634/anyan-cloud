#!/bin/bash
# 六职业 + 场景主视觉 v1（提示词见 ../六职业与场景主视觉_提示词v1.md，Rhett 11-02 09:44 批准）
cd /workspace/work/.agents/skills/credit-media-skill
export CREDIT_MEDIA_API_KEY=proxy
O=/workspace/projects/04b4b2af-0042-4c1b-a4f3-cdc315529fa5/promo/keyvisual_v1; R=$O/ref
CPRE="写实电影级角色设定图，暗黑奇幻，与参考图同一世界观和画风「暗岩传说」。横版构图：左侧全身正面站姿（大），中间同一人物全身背面，右侧武器与配件特写2到3个；中性深灰渐变背景；青绿冷调轮廓光与熔铜暖色主光；材质真实，金属磨损、皮革划痕、布料织纹；人物比例正常。"
SPRE="写实电影级场景主视觉，16:9宽银幕横构图，与参考图同一世界观和画风，青绿冷调阴影与熔铜暖光对比，体积光、浮尘、潮湿反光，无人物或只有极小的人物剪影提供尺度。"
NEG="画面中不要出现任何文字、标注、字幕、水印、UI；不要卡通或Q版；不要多余肢体；正面与背面必须是同一人同一套装备。"
SNEG="画面中不要出现任何文字、字幕、水印、UI。"
gen(){ n=$1; pre=$2; neg=$3; p=$4; shift 4; args=(); for i in "$@"; do args+=(--image "$i"); done
  bash scripts/run.sh image --model gpt-image-2 --size 1536x1024 --quality high --prompt "$pre $p $neg" "${args[@]}" --out $O/$n.png > $O/$n.log 2>&1 & }
gen C1_warrior "$CPRE" "$NEG" "身穿厚重暗铁板甲的老兵战士，肩甲有刮痕与铆钉，破旧深红披风，双手巨剑（宽刃，护手铸成钟形），腰挂短斧；神情坚毅，满脸风霜。" $R/style_B.jpg
gen C2_mage "$CPRE" "$NEG" "身穿深蓝与骨白长法袍的元素法师，袍边刺绣暗金符文，腰间挂皮面法典与水晶法球；一手托着悬浮的火、冰、雷三色微光，眼中映出法术光芒。" $R/style_B.jpg
gen C3_chrono "$CPRE" "$NEG" "身穿深蓝皮甲的刺客时砂行者，沙金色围巾遮住下半张脸，背后半透明星图斗篷；双持圆形飞刃时轮，轮心是发光沙漏；正面身后重叠一个半透明蓝色回声分身。" $R/style_B.jpg
gen C4_alchemy "$CPRE" "$NEG" "身穿炭黑与暗红布甲长衣的炼金投弹手，戴鸟嘴面具，胸前斜挎药瓶带，红、蓝、绿三色药液发光；手握一只华丽药瓶，腰侧挂试剂匣。" $R/style_B.jpg
gen C5_hunter "$CPRE" "$NEG" "身穿链甲与兽皮的灵契猎手，胸前鸣钟人猎卫徽记（小钟纹章）；双手长柄弯刃；身旁三只半透明幽影绿色兽魂：狼、熊、鹰，与其立契；海风吹动发丝。" $R/style_B.jpg
gen C6_coffin "$CPRE" "$NEG" "身穿厚重锈铁重甲的不死送葬者负棺人，面容苍白，眼窝幽紫微光；背负一口巨大铁棺，铁棺缠绕粗重棺链，链端垂在手中；棺缝透出紫色暗影与三缕魂光。不是死亡骑士：没有符文剑、没有冰霜、没有骷髅马。" $R/style_B.jpg
gen S1_mirrordeep "$SPRE" "$SNEG" "镜渊城：地底巨大溶洞中的哥特城市，尖塔与层叠石拱桥倒映在城下静止的镜面湖中，倒影里的城市比真实城市多出一座塔；中央青铜钟楼，岩顶瀑布倾泻，暖金灯火点点。" $R/K1.jpg $R/style_B.jpg
gen S2_coast "$SPRE" "$SNEG" "沉钟海岸：退潮后的阴沉海岸，浅滩上半埋着一口巨大的铜绿古钟，钟口朝天积满海水；远处锈铁锚码头与巨鲸骨礁，风暴乌云压低，海面泛幽影绿微光。" $R/style_B.jpg
gen S3_belltower "$SPRE" "$SNEG" "无声钟楼：仰视一座孤立于黑色礁石上的高耸钟楼，楼身缠满锈链，顶层钟室没有钟，只有空荡的钟架；空气中悬停着静止的雨滴，完全无声的压迫感。" $R/K1.jpg $R/style_B.jpg
gen S4_abyss "$SPRE" "$SNEG" "暗岩深渊：深入地底的巨型裂谷，岩壁布满熔铜色发光裂纹，谷底一颗巨大的暗岩之心缓慢搏动，光从裂纹中脉动外溢，石阶螺旋向下延伸。" $R/style_B.jpg
wait
