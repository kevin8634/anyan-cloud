// 任务配置：灰石营地主线（原创内容）
import { QuestDef } from '../core/Quest';
import { withPacks } from '../core/ContentPacks';

import { WILD_NPC_NAMES, WILD_QUESTS } from './zones_wild';
import { RAID_QUESTS } from './raid_quests';
import { CLASS_QUESTS } from './class_quests';
import { STORY_QUESTS } from './story_ch6';   // v0.8.3
export const NPCS: Record<string, { name: string; title: string }> = {
  ...WILD_NPC_NAMES,
  kai: { name: '老钱', title: '灰石营地 · 仓库管理员' },
  bran: { name: '布兰', title: '营地守卫长' },
  tom: { name: '老汤', title: '矿工' },
  ayla: { name: '艾拉', title: '沼泽巡林者' },
  gerda: { name: '葛尔达', title: '杂货商 · 铁匠' },
  // 翠风原野
  rowan: { name: '罗文', title: '翠风前哨 · 哨卫长' },
  qinghe: { name: '青禾', title: '草药师' },
  ke: { name: '老柯', title: '守林人' },
};

export const QUESTS: QuestDef[] = withPacks<QuestDef>([
  { id: 'q_wolves', name: '狼患', giver: 'bran', turnIn: 'bran', minLevel: 1,
    text: '营地东边的灰鬃狼越来越大胆，昨晚又叼走了两只羊。去林子里清理掉一些。',
    doneText: '干得漂亮！今晚大家能睡个好觉了。拿着这个，比你那把破剑强。',
    objectives: [{ type: 'kill', target: 'wolf', count: 6, label: '击杀灰鬃狼' }],
    reward: { xp: 150, gold: 30, item: { minQuality: 'green', slots: ['oneHand', 'twoHand'] } } },
  { id: 'q_fangs', name: '锋利的狼牙', giver: 'bran', turnIn: 'bran', minLevel: 1,
    text: '铁匠需要狼牙做箭头。顺手帮我收集一些吧。',
    doneText: '这些够用了，谢谢。',
    objectives: [{ type: 'collect', target: 'wolf', chance: 0.6, count: 4, label: '狼牙' }],
    reward: { xp: 120, gold: 40, item: { minQuality: 'green', slots: ['head', 'shoulder', 'chest', 'hands', 'legs', 'feet'] } } },
  { id: 'q_mine_news', name: '矿洞的异动', giver: 'bran', turnIn: 'tom', minLevel: 2, requires: ['q_wolves'],
    text: '北边暗岩矿洞的矿工逃出来一个，叫老汤，就在营地北边。去问问他发生了什么。',
    doneText: '你是布兰派来的？太好了……监工格罗克疯了，他把矿工们都变成了他的打手！',
    objectives: [{ type: 'talk', npc: 'tom', label: '与老汤对话' }],
    reward: { xp: 80, gold: 10 } },
  { id: 'q_mine', name: '深入暗岩矿洞', giver: 'tom', turnIn: 'tom', minLevel: 2, requires: ['q_mine_news'],
    text: '矿洞入口就在我身后的传送阵。击败格罗克，救救我的兄弟们。小心他的红圈和读条，冲锋能打断他！',
    doneText: '格罗克倒下了？！你是暗岩矿洞的英雄！这是我们攒下的宝贝，请收下。',
    objectives: [
      { type: 'kill', target: 'spider', count: 3, label: '击杀穴居蜘蛛' },
      { type: 'clear', dungeonId: 'darkrock_mine', label: '击败监工格罗克' },
    ],
    reward: { xp: 600, gold: 200, item: { minQuality: 'purple' } } },
  // ---- 第二章：腐沼神殿（通关暗岩矿洞后解锁） ----
  { id: 'q_swamp_news', name: '沼泽来客', giver: 'tom', turnIn: 'ayla', minLevel: 6, requires: ['q_mine'],
    text: '矿洞的事多亏你了。营地西边来了个巡林者，叫艾拉，说南方的沼泽出了大事。她在找能打的人，去见见她吧。',
    doneText: '老汤推荐的人？好。腐沼神殿里的祭司在用腐根污染整片沼泽，再这样下去灰石营地的水源也保不住。',
    objectives: [{ type: 'talk', npc: 'ayla', label: '与艾拉对话' }],
    reward: { xp: 120, gold: 30 } },
  { id: 'q_swamp_rot', name: '腐化之源', giver: 'ayla', turnIn: 'ayla', minLevel: 6, requires: ['q_swamp_news'],
    text: '神殿外的堤道上全是被腐化的巨蟾和树妖。杀掉它们，再从树妖身上带回一些腐化孢子，我要研究怎么净化。',
    doneText: '这些孢子……果然是祭司的手笔。拿着，这是巡林者的谢礼。',
    objectives: [
      { type: 'kill', target: 'toad', count: 3, label: '击杀腐沼巨蟾' },
      { type: 'collect', target: 'treant', chance: 0.8, count: 2, label: '腐化孢子' },
    ],
    reward: { xp: 500, gold: 180, item: { minQuality: 'blue' } } },
  { id: 'q_swamp_priest', name: '净化腐沼神殿', giver: 'ayla', turnIn: 'ayla', minLevel: 6, requires: ['q_swamp_news'],
    text: '腐根祭司就在神殿最深处。小心她脚下的毒沼和根须，读条「腐化汲取」时一定要打断，不然她会恢复生命！藤蔓长出来就先砍掉。',
    doneText: '沼泽的空气……变干净了。你救了这片土地，也救了灰石营地。这件宝物归你了。',
    objectives: [
      { type: 'kill', target: 'cultist', count: 2, label: '击杀沼泽祭徒' },
      { type: 'clear', dungeonId: 'rotting_temple', label: '击败腐根祭司' },
    ],
    reward: { xp: 900, gold: 450, item: { minQuality: 'purple' } } },
  // ---- 翠风原野（通关暗岩矿洞后解锁，9~16 级，连接两个副本；可选） ----
  { id: 'q_field_news', name: '翠风原野', giver: 'tom', turnIn: 'rowan', minLevel: 6, requires: ['q_mine'],
    text: '矿洞的事了结了，可南边的翠风原野又不太平——劫掠者抢了商队，野猪糟蹋庄稼。营地南门外的石门能直接传送过去，去前哨站找哨卫长罗文吧。',
    doneText: '灰石营地来的援手？来得正好。前哨就这么十几个人，原野上的麻烦可不少。',
    objectives: [{ type: 'talk', npc: 'rowan', label: '与哨卫长罗文对话' }],
    reward: { xp: 100, gold: 30 } },
  { id: 'q_field_boars', name: '野猪成灾', giver: 'rowan', turnIn: 'rowan', minLevel: 7, requires: ['q_field_news'],
    text: '前哨南边两片草甸全是鬃背野猪，獠牙能把木栅栏都拱倒。替我们清理一批，让巡逻队能喘口气。',
    doneText: '草甸那边安静多了。这件护具是巡逻队的备用品，你比他们更需要。',
    objectives: [{ type: 'kill', target: 'boar', count: 8, label: '击杀鬃背野猪' }],
    reward: { xp: 450, gold: 90, item: { minQuality: 'green', slots: ['shoulder', 'wrist', 'waist', 'back'] } } },
  { id: 'q_field_supplies', name: '被劫的补给', giver: 'qinghe', turnIn: 'qinghe', minLevel: 8, requires: ['q_field_news'],
    text: '运药草的商队在河北岸被劫了。那些劫掠者把药草包随手塞在身上——过了木桥往西北走就是他们的营地，帮我抢回来。小心躲在后面放冷箭的弩手。',
    doneText: '都在这儿，一包不少！这枚护符是我亲手调过的，戴着能让人精神些。',
    objectives: [{ type: 'collect', target: 'raider', chance: 0.55, count: 5, label: '被劫的药草包' }],
    reward: { xp: 500, gold: 120, item: { minQuality: 'blue', slots: ['neck', 'ring', 'trinket'] } } },
  { id: 'q_field_ruins', name: '星落遗迹', giver: 'rowan', turnIn: 'rowan', minLevel: 9, requires: ['q_field_boars'],
    text: '东北的星落遗迹最近夜里发光，守在那里的石傀儡也开始乱走。去祭坛看看到底出了什么事，顺手打碎几只石傀儡。',
    doneText: '祭坛上的星纹又亮了？……这事得报给营地。辛苦你了，这是前哨的谢礼。',
    objectives: [
      { type: 'explore', area: 'ruins_altar', label: '调查星落遗迹的祭坛' },
      { type: 'kill', target: 'golem', count: 4, label: '击碎遗迹石傀儡' },
    ],
    reward: { xp: 600, gold: 140, item: { minQuality: 'blue' } } },
  { id: 'q_field_hermit', name: '给守林人的药包', giver: 'qinghe', turnIn: 'ke', minLevel: 8, requires: ['q_field_supplies'],
    text: '守林人老柯住在西北角的白桦林里，他的老寒腿离不开这包药。路上会经过劫掠者营地，送到了替我问声好。',
    doneText: '青禾那丫头又惦记我这把老骨头了。……对了，那个红鬃毛的劫掠头目天天在北岸转悠，你要是碰上，可别逞强。',
    objectives: [{ type: 'talk', npc: 'ke', label: '把药包交给守林人老柯' }],
    reward: { xp: 350, gold: 60 } },
  { id: 'q_field_chief', name: '赤鬃的末日', giver: 'rowan', turnIn: 'rowan', minLevel: 12, requires: ['q_field_ruins', 'q_field_hermit'],
    text: '劫掠者的头目「赤鬃」就在北岸游荡，他手下的人抢了商队、烧了农庄。他的斧头会撕开伤口，打之前把药水备足。除掉他，原野才算真正太平。',
    doneText: '赤鬃死了？！翠风前哨欠你一个大人情。这把东西是从他的藏宝箱里找到的，归你了。',
    objectives: [{ type: 'kill', target: 'chief', count: 1, label: '击败赤鬃 · 劫掠头目' }],
    reward: { xp: 1000, gold: 300, item: { minQuality: 'purple' } } },
  // 阶段四：赤砂裂谷 / 霜脊高地 / 烬落荒原（data/zones_wild.ts）
  ...WILD_QUESTS,
  ...RAID_QUESTS,
  ...CLASS_QUESTS,
  ...STORY_QUESTS,
], 'quests');   // v0.9.7 内容包任务（没有包 = 原数组）
