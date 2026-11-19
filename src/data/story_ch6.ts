// v0.8.3 第 6 章「暗岩之心」：主线收尾（原创内容）
// 墨言（副本学者）接，布兰（营地守卫长）收尾。最终一战在暗岩深渊最深处（剧情模式：固定场地、无畸变、难度按第 6 层算）。
import { QuestDef } from '../core/Quest';

const K = (target: string, label: string) => ({ type: 'kill' as const, target, count: 1, label });
/** 剧情最终战击杀事件（raid.ts 剧情深渊清空时发出） */
export const STORY_KILL = 'story_heart';
export const STORY_FINAL_QUEST = 'ch6_4';
/** 剧情最终战难度：按深渊第几层的生命 / 伤害算 */
export const STORY_SCALE_FLOOR = 6;
export const STORY_BOSS_NAME = '暗岩之魂';

export const STORY_QUESTS: QuestDef[] = [
  { id: 'ch6_1', name: '第六章 · 大地的心跳', giver: 'scholar', turnIn: 'bran', minLevel: 30, requires: ['em_scholar'],
    text: '这几晚营地的地面在跳——一下，一下，像心跳。我翻遍了所有副本留下的碑文，它们都指向同一个名字：暗岩之心。去问问布兰，守卫们夜里一定也感觉到了。',
    doneText: '你也感觉到了？矿道最深处的岩壁每晚都在发烫，守夜的人说听见有东西在下面喘气。墨言要是知道什么，让他全说出来。',
    objectives: [{ type: 'talk', npc: 'bran', label: '向守卫长布兰打听地底的动静' }],
    reward: { xp: 0, gold: 500, stacks: [{ id: 'mat_abyss', count: 5 }] } },
  { id: 'ch6_2', name: '第六章 · 三座副本的回声', giver: 'scholar', turnIn: 'scholar', minLevel: 30, requires: ['ch6_1'],
    text: '沙葬王陵、巨魔冰窟、灰烬铸造厂——三座副本的主人临死前都喊过同一句话：「它在等我们回去。」我需要你再去一趟，从它们身上带回最后的回声。',
    doneText: '三块碎片拼起来，是一张地图。不是地面上的路——是往下的路。它们不是暗岩的主人，只是被它喂养的看门狗。',
    objectives: [K('raidboss_setekh', '击败沙葬法老 塞特赫'), K('raidboss_holger', '击败雪原巨人 霍尔格'), K('raidboss_master', '击败熔铸大师 维克多')],
    reward: { xp: 0, gold: 1200, stacks: [{ id: 'mat_abyss', count: 10 }] } },
  { id: 'ch6_3', name: '第六章 · 王与誓的余烬', giver: 'scholar', turnIn: 'scholar', minLevel: 30, requires: ['ch6_2'],
    text: '瓦尔卡兹把心脏扔进熔炉，伊瑟兰停下了自己的心跳。他们都想逃开同一样东西——暗岩之心在呼唤每一颗还在跳的心。去王座和墓穴，把他们剩下的东西拿回来。',
    doneText: '一颗烧不尽，一颗冻不坏。两颗心放在一起，就能打开深渊最底下那扇门。……我本来以为，我只是在记录历史。',
    objectives: [K('raidboss_valkaz', '击败熔心君王 瓦尔卡兹'), K('raidboss_ithran', '击败永冬之王 伊瑟兰')],
    reward: { xp: 0, gold: 2000, stacks: [{ id: 'mat_darkshard', count: 10 }] } },
  { id: STORY_FINAL_QUEST, name: '第六章 · 暗岩之心', giver: 'scholar', turnIn: 'scholar', minLevel: 30, requires: ['ch6_3'],
    text: '门在暗岩深渊的最底下。从传送阵进深渊，选「前往暗岩之心」。它会借用那尊未完成的铸像当身体——别被骗了，那不是铸像，是暗岩之魂本身。让这颗心，最后停一次。',
    doneText: '……地面不跳了。我写了三百页的笔记，最后一页只有一句话：「有人下去了，然后回来了。」谢谢你。',
    objectives: [K(STORY_KILL, `击败${STORY_BOSS_NAME}（暗岩深渊 · 剧情）`)],
    reward: { xp: 0, gold: 3000, stacks: [{ id: 'tok_dark', count: 1 }, { id: 'mat_abyss', count: 30 }] } },
  { id: 'ch6_5', name: '尾声 · 余烬之后', giver: 'scholar', turnIn: 'bran', minLevel: 30, requires: [STORY_FINAL_QUEST],
    text: '布兰在营地门口等你。他说今晚要给全营地的人加一顿肉——这是灰石营地十年来第一个安静的夜晚。',
    doneText: '坐下，喝一杯。从你第一天背着破剑走进营地，到今天……灰石营地会记住你的名字。往后深渊还会有回响，但那是另一个故事了。',
    objectives: [{ type: 'talk', npc: 'bran', label: '回营地见布兰' }],
    reward: { xp: 0, gold: 1000, item: { minQuality: 'orange' } } },
];

/** 结局过场：逐句淡入的字幕，然后滚动制作名单 */
export const ENDING_LINES: string[] = [
  '暗岩之魂碎成了一地灰。',
  '那颗跳了一千年的心，终于停了下来。',
  '熔心王座的火灭了，永霜墓穴开始融雪。',
  '沙葬王陵的风沙落定，冰窟的冰不再生长，铸造厂的熔炉第一次冷却。',
  '灰石营地的人们在门口点起篝火——这一次，不是为了驱赶黑暗。',
  '墨言合上了他的笔记。',
  '布兰把你的名字刻在了营地的门柱上。',
  '而在深渊更深的地方，有什么东西，轻轻翻了个身。',
];
export const CREDITS: [string, string][] = [
  ['暗岩传说：深渊回响', '第一部 · 完'],
  ['出品', 'Rhett Wong'],
  ['策划 / 程序 / 美术 / 音频', 'Hark 协作开发'],
  ['角色模型', 'KayKit Adventurers（CC0，Kay Lousberg）'],
  ['引擎', 'three.js · TypeScript'],
  ['画面技术参考（MIT，代码已改写）', 'Painted Valley 时段色表 · Stonehenge 帧率调速'],
  ['水面倒影参考（MIT，代码已改写）', 'wquguru · fable52-fps-repro 平面反射 / 镜像相机'],
  ['感谢', '每一位在灰石营地停留过的冒险者'],
];
