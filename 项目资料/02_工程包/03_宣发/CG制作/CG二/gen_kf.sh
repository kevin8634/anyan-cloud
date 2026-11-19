#!/bin/bash
cd /workspace/work/.agents/skills/credit-media-skill
O=/workspace/projects/cb2f008a-ebc2-4775-88d9-32586935b5a5/CG二/keyframes_v1; R=/workspace/projects/cb2f008a-ebc2-4775-88d9-32586935b5a5/云盘同步/CG制作/CG二
PRE="写实电影CG关键帧，16:9宽银幕横构图，与参考图同一世界观和画风：地底巨大溶洞中的哥特城市镜渊城，尖塔、拱桥、从岩顶倾泻的瀑布，青绿冷调阴影与熔铜暖金灯光对比，体积光、浮尘、潮湿反光石面。"
NEG="画面中不要出现任何文字、字幕、水印、UI；人物比例正常不变形，严格保持参考图人物外貌服饰。"
gen(){ n=$1; shift; p=$1; shift; args=(); for i in "$@"; do args+=(--image "$i"); done
  bash scripts/run.sh image --model gpt-image-2 --size 1536x1024 --quality high --prompt "$PRE $p $NEG" "${args[@]}" --out $O/$n.png $DRY > $O/$n.log 2>&1 & }
gen K1_f1s2_clocktower "电影大远景：从城市上空俯瞰，镜头正前方是城市中央高耸的青铜钟楼，楼顶悬挂巨大的铜绿古钟正在摆动，金色声波圆环一圈圈向外荡开，惊起尘埃；周围层叠尖塔与石桥，远处瀑布，城中暖金灯火点点。" $R/film1_clock_stopped.jpg
gen K2_f1s4_bridge "中景横移构图：镜渊城一座长石拱桥，桥上几名身披深色长袍的市民保持行走姿态完全静止，衣摆停在半空；桥侧瀑布凝固成玻璃般的水柱，水珠悬停空中；石灯火苗凝固不动；背景远处是钟楼剪影与悬停的灰烬，时间静止的寂静感。" $R/film1_clock_stopped.jpg
gen K3_f1s7_moyan "近景偏侧面：老学者墨言（严格按参考图二：白发长须、破旧棕褐兜帽长袍、金色圆形胸针）站在钟楼脚下，仰头望向上方停住的巨钟，神情惊疑；双手捧着微微发光的皮面笔记本，笔尖悬在纸上；巨钟金光从上方照亮他的脸，背景是镜渊城与悬停的金色碎光。" $R/film1_clock_stopped.jpg $R/chars/moyan.jpg
gen K4_f5s1_cellar "背后跟拍视角：主角（与参考图一中央的人物相同：破旧深色兜帽斗篷、背影）走进潮湿幽暗的地底石砌地窖，手持火把，火光摇曳；前方通道一分为二，左侧拱门透出金铜暖光，右侧拱门弥漫青黑潮雾；地面积水倒映左暖右冷两色光。" $R/film5_crossroads.jpg
gen K5_f5s2_iola "近景：伊奥拉（严格按参考图二：由金铜光纹构成的半透明少女，金色长发如光丝，胸口小钟光核）站在左侧地窖通道的金色暖光中，长发光丝缓缓飘动，向镜头安静伸出一只手作邀请，表情悲悯；背景是湿润的哥特石拱与积水反光。" $R/film5_crossroads.jpg $R/chars/iola.jpg
gen K6_f5s3_charon "近景：卡戎（严格按参考图二：高瘦黑色破布兜帽长袍，胸前交叉锁链，手握长篙，兜帽阴影下两点幽蓝眼光）站在右侧地窖通道的青黑潮雾与浅水中，长篙点在水面荡开一圈波纹，锁链垂落，冷青色调；背景是湿润的石拱与远处幽暗水道。" $R/film5_crossroads.jpg $R/chars/charon.jpg
gen K7_f5s5_crossroads "按参考图一重构为16:9全景：主角背影站在画面正中央的积水石面上一动不动；左侧是金铜光纹少女伊奥拉与暖金光，右侧是兜帽渡者卡戎与青黑冷雾；积水倒映两侧光，左暖右冷对称构图，上下留足空间。" $R/film5_crossroads.jpg $R/chars/iola.jpg $R/chars/charon.jpg
wait
