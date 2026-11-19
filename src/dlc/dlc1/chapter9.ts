// ======================================================================
// DLC1 第九章「再鸣 / 断绳」（无声钟楼 38–40 级）—— v1.1.0（d1.7）
// 4 个主线（cs9_1..4）+ 分支 A「再鸣」3 个（cs9a_1..3，伊奥拉）/ 分支 B「断绳」3 个（cs9b_1..3，卡戎）
// 9-3「最后一下」是岔路口（任务名后红字「（抉择）」）：走到钟楼顶层 → 横幅 + 抉择界面；9-4 起需要已经做出选择
// 分支任务用 QuestDef.gate 只对选了这条路的角色开放
// ======================================================================
import type { QuestDef } from '../../core/Quest';
import { fateChoice } from './fate';

const K = (target: string, count: number, label: string) => ({ type: 'kill' as const, target, count, label });
const C = (target: string, chance: number, count: number, label: string) => ({ type: 'collect' as const, target, chance, count, label });
const E = (area: string, label: string) => ({ type: 'explore' as const, area, label });
const isA = () => fateChoice() === 'A', isB = () => fateChoice() === 'B', chosen = () => fateChoice() !== null;

export const CH9_MAIN: QuestDef[] = [
  { id: 'cs9_1', name: '9-1 无声钟楼', giver: 'iola_m', turnIn: 'iola_b', minLevel: 37, requires: ['cs8_6'],
    text: '两声了。最后一口钟在沉钟塔——城里的人叫它「无声钟楼」，因为它已经一千年没响过。提灯塔后面的倒悬阶梯通到它脚下。我先去，你跟上。小心那些修士，他们把自己的嘴缝上了。',
    doneText: '你来了。……这里好安静，安静得能听见海底有什么在呼吸。钟楼一共五层，每一层都有一个守钟的东西。它们早就忘了自己在守什么。',
    objectives: [E('bt_gate', '抵达无声钟楼'), K('bt_monk', 10, '击退静默修士')], reward: { xp: 16000, gold: 600, item: { minQuality: 'blue' } } },
  { id: 'cs9_2', name: '9-2 下层的守钟者', giver: 'iola_b', turnIn: 'charon_b', minLevel: 38, requires: ['cs9_1'],
    text: '第一层是铸钟巨像，它胸口那口钟没有钟舌，所以一辈子都敲不响。第二层是修士长，他是最早缝上嘴的人。打倒它们，楼梯才会露出来。',
    doneText: '（卡戎从阴影里走出来）别那样看我，我也是来爬楼的。上面两层的东西，你一个人对付不了——至少我是这么觉得的。',
    objectives: [K('bt_b1', 1, '击败 无舌之钟 · 铸钟巨像'), K('bt_b2', 1, '击败 缄默修士长')], reward: { xp: 22000, gold: 800, item: { minQuality: 'purple' } } },
  { id: 'cs9_3', name: '9-3 最后一下', giver: 'charon_b', turnIn: 'iola_b', minLevel: 38, requires: ['cs9_2'], tags: ['抉择'],
    text: '第三层住着第一个敲钟人的回响，他死的时候手里还攥着钟绳。第四层……是你在王陵见过的老朋友。过了这两层，就是钟楼顶层。到了那里，你得做个决定：跟她再敲一次钟，还是跟我把绳子剪断。',
    doneText: '你已经站在顶层了。不管你选了什么……谢谢你一路陪我走到这里。',
    objectives: [K('bt_b3', 1, '击败 断绳回响 · 初代鸣钟人'), K('bt_b4', 1, '击败 回响 · 沙葬法老塞特赫'), E('bt_crossroads', '登上钟楼顶层，做出选择')], reward: { xp: 26000, gold: 900, item: { minQuality: 'purple' } } },
  { id: 'cs9_4', name: '9-4 沉眠者之门', giver: 'iola_b', turnIn: 'iola_b', minLevel: 39, requires: ['cs9_3'], gate: chosen,
    text: '最后一层不在上面，在下面。钟楼的地窖通到沉眠者睡觉的地方，门口守着一个很大的回响——熔心君王。他想要沉眠者的力量，比卡戎还想。',
    doneText: '门开了。你听见了吗？那是它的心跳。和钟声一模一样。',
    objectives: [K('bt_b5', 1, '击败 回响 · 熔心君王瓦尔卡兹')], reward: { xp: 30000, gold: 1000, item: { minQuality: 'purple' } } },
];

export const CH9_A: QuestDef[] = [
  { id: 'cs9a_1', name: '9A-1 新的钟绳', giver: 'iola_b', turnIn: 'iola_b', minLevel: 39, requires: ['cs9_4'], gate: isA,
    text: '钟绳断成了很多截，缠在那些断绳回响身上。帮我找回 6 截还没有朽掉的，我把它们重新编起来。',
    doneText: '你看，编好了。和一千年前一模一样——只是这一次，拉绳子的人是你。',
    objectives: [C('bt_wraith', 0.5, 6, '收集还没朽掉的钟绳')], reward: { xp: 18000, gold: 700 } },
  { id: 'cs9a_2', name: '9A-2 安魂', giver: 'iola_b', turnIn: 'iola_b', minLevel: 39, requires: ['cs9a_1'], gate: isA,
    text: '钟楼四周落着三口小钟，是鸣钟人的安魂钟。去每一口钟旁边站一会儿，让它们记起自己的声音。',
    doneText: '三口钟都在轻轻地响。沉眠者翻了个身……它听见了。现在，只差最后一下。',
    objectives: [E('bt_soul1', '让西侧的安魂钟记起声音'), E('bt_soul2', '让东侧的安魂钟记起声音'), E('bt_soul3', '让北侧的安魂钟记起声音')], reward: { xp: 18000, gold: 700 } },
  { id: 'cs9a_3', name: '9A-3 再鸣', giver: 'iola_b', turnIn: 'iola_b', minLevel: 40, requires: ['cs9a_2'], gate: isA,
    text: '沉眠者醒了一半。它身上还缠着钟声，可它在挣。去地窖，在它挣断最后一根之前，把它压回梦里。我会在钟下面等你——等你回来，我们一起敲。',
    doneText: '（钟声在你身后响起）……谢谢你。镜渊城的灯，我都看见了。',
    objectives: [K('bt_sleeper_a', 1, '击败 沉眠者（被钟声束缚）')], reward: { xp: 40000, gold: 2000, item: { minQuality: 'orange' } } },
];
// v1.1.1（d1.8）A 线接入钟楼领地：9A-4 重建钟楼 → 9A-5 回响入住 → 9A-6 第一声钟律 + 钟鸣（完成时另送领地材料，见 domain.ts QUEST_GIFT）
CH9_A.push(
  { id: 'cs9a_4', name: '9A-4 灯火重燃', giver: 'iola_b', turnIn: 'iola_m', minLevel: 40, requires: ['cs9a_3'], gate: isA,
    text: '钟又响了，可镜渊城还是一片废墟。我回不去了——我现在就是这口钟。你替我回去吧：先把城中央的钟楼立起来，它会告诉大家，城还活着。（在镜渊城点屏幕下方的「钟楼领地」）',
    doneText: '（钟楼下，伊奥拉的回响抬起头）……我听见了。是我自己的钟声。守钟人，欢迎回家。',
    objectives: [E('dm_q_bell', '在镜渊城重建钟楼')], reward: { xp: 12000, gold: 1500 } },
  { id: 'cs9a_5', name: '9A-5 回响归来', giver: 'iola_m', turnIn: 'iola_m', minLevel: 40, requires: ['cs9a_4'], gate: isA,
    text: '那些过完了「那一天」的回响，不用再重复了。给他们一个家：工坊、码头、市集……房子建好了，他们自己会搬进去。',
    doneText: '你看，欧芙的炉子又热了。他们不再重复那一天了——他们在过新的一天。',
    objectives: [E('dm_q_res', '让 3 位回响居民入住领地')], reward: { xp: 12000, gold: 1500 } },
  { id: 'cs9a_6', name: '9A-6 守钟人的第一天', giver: 'iola_m', turnIn: 'iola_m', minLevel: 40, requires: ['cs9a_5'], gate: isA,
    text: '守钟人每天要做两件事：早上敲钟，定下今天的钟律；遇到危险，就让钟声替你说话。去试试吧。',
    doneText: '当——这一下是你敲的。从今天起，镜渊城的每一天，都从你的钟声开始。',
    objectives: [E('dm_q_rule', '敲钟，选一条今天的钟律'), E('dm_q_chime', '用钟鸣同时击中 3 个敌人')], reward: { xp: 15000, gold: 2000, item: { minQuality: 'purple' } } },
);

export const CH9_B: QuestDef[] = [
  { id: 'cs9b_1', name: '9B-1 断绳之刃', giver: 'charon_b', turnIn: 'charon_b', minLevel: 39, requires: ['cs9_4'], gate: isB,
    text: '钟绳是用鸣钟人的誓言编的，普通的刀剪不断。静默修士嘴上那些铜片，是从誓约之钟上削下来的。给我 6 片，我来打一把能剪断誓言的刀。',
    doneText: '刀成了。别用那种眼神看它——它只是一把刀，用它的人才决定它是什么。',
    objectives: [C('bt_monk', 0.5, 6, '收集誓约铜片')], reward: { xp: 18000, gold: 700 } },
  { id: 'cs9b_2', name: '9B-2 斩绳', giver: 'charon_b', turnIn: 'charon_b', minLevel: 39, requires: ['cs9b_1'], gate: isB,
    text: '钟绳拴在钟楼外面的三根锚柱上。去把它们一根一根砍断。每断一根，沉眠者就会醒来一点……你最好做好准备。',
    doneText: '三根都断了。你感觉到了吗？海水在往钟楼这边涌。它醒了——完完全全地。',
    objectives: [E('bt_soul1', '斩断西侧锚柱的钟绳'), E('bt_soul2', '斩断东侧锚柱的钟绳'), E('bt_soul3', '斩断北侧锚柱的钟绳')], reward: { xp: 18000, gold: 700 } },
  { id: 'cs9b_3', name: '9B-3 断绳', giver: 'charon_b', turnIn: 'charon_b', minLevel: 40, requires: ['cs9b_2'], gate: isB,
    text: '去地窖。它现在是醒着的，比你见过的任何东西都要大、都要饿。打倒它，然后——把它吞下去。这一千年，该轮到我们了。',
    doneText: '你做到了。……我还以为我会很高兴。',
    objectives: [K('bt_sleeper_b', 1, '击败 沉眠者（完全觉醒）')], reward: { xp: 40000, gold: 2000, item: { minQuality: 'orange' } } },
];

// v1.1.2（d1.9）B 线接入渊噬之躯：9B-4 吞噬 → 9B-5 第一次变异 → 9B-6 渊形态 + 吞精英（完成时另送渊质，见 abyssbody.ts QUEST_GIFT）
CH9_B.push(
  { id: 'cs9b_4', name: '9B-4 渊之初醒', giver: 'charon_b', turnIn: 'charon_b', minLevel: 40, requires: ['cs9b_3'], gate: isB,
    text: '你吞下了它，可你的身体还不知道自己吃了什么。饿的时候就吃——把那些快死的东西吞掉，伤口会合上，力气会回来。（按 T 吞噬生命很低的敌人）',
    doneText: '感觉到了吗？每吞一个，你身体里的潮水就涨一点。别让它漫过头顶——除非你想。',
    objectives: [E('ab_q_devour', '用吞噬处决 5 个敌人')], reward: { xp: 12000, gold: 1500 } },
  { id: 'cs9b_5', name: '9B-5 血肉的回响', giver: 'charon_b', turnIn: 'charon_b', minLevel: 40, requires: ['cs9b_4'], gate: isB,
    text: '钟楼里那些守钟的东西，你吞下了它们的回响。它们没有消失，它们在你身体里找位置——角、眼、骨头、影子。喂它们渊质，让它们长出来。（点技能区上方的渊化条打开「渊噬之躯」）',
    doneText: '……你的影子刚才动了一下，比你先动。我不会问那是什么感觉。',
    objectives: [E('ab_q_mut', '把任意一个变异部位升到 2 级')], reward: { xp: 12000, gold: 1500 } },
  { id: 'cs9b_6', name: '9B-6 渊噬者的第一夜', giver: 'charon_b', turnIn: 'charon_b', minLevel: 40, requires: ['cs9b_5'], gate: isB,
    text: '最后一件事。让潮水漫过头顶一次——渊形态。然后在那片黑里，吞下一个够分量的东西。做完了，你就再也不是来这里时的那个人了。',
    doneText: '潮水退了，你还站着。……好。海的那一边还有别的钟，它们会听见你的。',
    objectives: [E('ab_q_form', '进入渊形态'), E('ab_q_eat', '在渊形态中吞噬一个精英')], reward: { xp: 15000, gold: 2000, item: { minQuality: 'purple' } } },
);

export const CH9_QUESTS: QuestDef[] = [...CH9_MAIN, ...CH9_A, ...CH9_B];
