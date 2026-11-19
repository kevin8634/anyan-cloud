// ======================================================================
// DLC1 第七章「沉钟」（沉钟海岸 31–35 级，6 个主线）—— v1.0.3
// 结构同本体 core/Quest.ts QuestDef（只 import 类型）。全部由伊奥拉发放 / 交付。
// 经验：6 个任务共 43500，加上清怪约够 30 → 33/34 级；第八章（镜渊城 35–38）接着升。
// ======================================================================
import type { QuestDef } from '../../core/Quest';

const K = (target: string, count: number, label: string) => ({ type: 'kill' as const, target, count, label });
const C = (target: string, chance: number, count: number, label: string) => ({ type: 'collect' as const, target, chance, count, label });
const E = (area: string, label: string) => ({ type: 'explore' as const, area, label });

export const CH7_QUESTS: QuestDef[] = [
  { id: 'cs7_1', name: '7-1 钟停了', giver: 'iola', turnIn: 'iola', minLevel: 30,
    text: '你就是打碎暗岩之魂的人？……别害怕，我只是个回响，最后一个敲钟人留下的回声。钟停了，海水在往回退。去浅滩中央看看那口沉钟，你会明白的。',
    doneText: '你也听见了，对吧？钟身里还有一点余音，像心跳。千年来，就是这颗心跳把「它」按在海底。',
    objectives: [E('cs_bell_core', '调查沉钟')], reward: { xp: 4000, gold: 200 } },
  { id: 'cs7_2', name: '7-2 溺亡者的那一天', giver: 'iola', turnIn: 'iola', minLevel: 30, requires: ['cs7_1'],
    text: '浅滩上那些湿漉漉的影子，是被暗岩之心吞掉的人。他们一遍遍重复死前的那一天，见到活人就扑上来。让他们歇一歇吧。',
    doneText: '他们散了……也许下次退潮又会回来。回响就是这样，忘不掉自己。',
    objectives: [K('cs_drowned', 12, '让溺亡回响安息')], reward: { xp: 6000, gold: 260, item: { minQuality: 'blue' } } },
  { id: 'cs7_3', name: '7-3 钟壳', giver: 'iola', turnIn: 'iola', minLevel: 31, requires: ['cs7_1'],
    text: '沉船湾的蟹把碎钟片背在身上当壳。那些碎片是钟的一部分，我想把它们找回来——带 6 片给我。',
    doneText: '你看这纹路，是鸣钟人的潮汐历。碎成这样，还在记着日子。',
    objectives: [C('cs_bellcrab', 0.5, 6, '收集钟壳碎片')], reward: { xp: 6500, gold: 280 } },
  { id: 'cs7_4', name: '7-4 退潮的沉船', giver: 'iola', turnIn: 'iola', minLevel: 31, requires: ['cs7_2', 'cs7_3'],
    text: '潮水退下去的时候，沉船湾会露出几只箱子，那是当年送钟的船。趁退潮去看看，顺便把礁柱上那些潮鳍妖赶远一点——涨潮时她们会把人拖进水里。',
    doneText: '船上的人是来给钟换绳子的。他们没能回去。',
    objectives: [E('cs_wreck', '退潮时探查沉船湾'), K('cs_siren', 6, '驱散潮鳍妖')], reward: { xp: 7000, gold: 300, item: { minQuality: 'blue' } } },
  { id: 'cs7_5', name: '7-5 深潮口', giver: 'iola', turnIn: 'iola', minLevel: 32, requires: ['cs7_4'],
    text: '最南边的深潮口，是海水退回去的地方。那里有个很大的回响在来回走——我认得他的脚步声，他也曾经是你的敌人。先去探探路，别急着动手。',
    doneText: '是他，矿洞里的那个工头。暗岩之心吞了他，现在他成了回响，比活着的时候更大、更沉。',
    objectives: [E('cs_deep', '探查深潮口'), K('cs_siren', 8, '清理深潮口的潮鳍妖')], reward: { xp: 8000, gold: 340 } },
  { id: 'cs7_6', name: '7-6 回响首领', giver: 'iola', turnIn: 'iola', minLevel: 32, requires: ['cs7_5'],
    text: '回响首领……被吞掉的强大灵魂会变成这样。打倒他，他的回声会散进海里，钟身会再响一下——我想听见那一下。',
    doneText: '……你听见了吗？「当——」很轻，可钟确实响了。镜渊城的灯，刚刚亮了一盏。我们该往上走了。',
    objectives: [K('cs_foreman', 1, '击败回响 · 溺亡工头格罗克')], reward: { xp: 12000, gold: 600, item: { minQuality: 'purple' } } },
];
