// 阶段七 v0.7.2-br.A：新职业的职业任务线（原创内容）。QuestDef.cls = 只对这个职业出现（QuestLog.classId 过滤），地图上标「职业任务」
//   时砂行者「遗落钟楼」：翠风原野（10 级）→ 赤砂裂谷（20 级）；完成后：回声伤害 +10% / 回溯冷却 -2 秒
//   炼金投弹手「腐沼实验室」：腐沼神殿（10 级）→ 霜脊高地 + 烬落荒原（24 级）；完成后：地面反应伤害 +20% / 大釜投掷速度 +25%
//   奖励效果在 web/chrono.ts、web/alchemy.ts 里用 questDone(id) 读取；QUEST_PERKS 给任务面板 / 提示用
import { QuestDef } from '../core/Quest';
import { withPacks, packList } from '../core/ContentPacks';

const BASE_CLASS_QUESTS: QuestDef[] = [
  { id: 'cq_chrono1', cls: 'chrono', name: '遗落钟楼 · 散沙', giver: 'rowan', turnIn: 'rowan', minLevel: 10,
    text: '你那对时轮……我在原野北边的劫掠者身上见过同样的金沙。老人们说，很久以前原野上有座钟楼，一夜之间连同里面的人一起「停」住了，后来被风沙埋了。把那些沙子拿回来看看？',
    doneText: '沙子在你手里会往回流……原来钟楼的人不是死了，是被困在了某一刻。拿着它，你的回声会更清楚。下一步去赤砂裂谷，驿站长莫桑知道钟楼的齿轮去了哪儿。',
    objectives: [{ type: 'collect', target: 'raider', chance: 0.5, count: 3, label: '散落的时砂' }],
    reward: { xp: 900, gold: 160, item: { minQuality: 'purple' } } },
  { id: 'cq_chrono2', cls: 'chrono', name: '遗落钟楼 · 齿轮', giver: 'mosang', turnIn: 'mosang', minLevel: 20, requires: ['cq_chrono1'],
    text: '钟楼的齿轮？被沙匪当废铜烂铁抢走了，在峡谷那边。他们不知道那东西一转，周围的时间就跟着转。拿回三枚，钟楼说不定能再走一格。',
    doneText: '三枚齐了。你听——它在走。往后你回溯的时候，钟楼会替你多扛一会儿。',
    objectives: [{ type: 'collect', target: 'sand_bandit', chance: 0.5, count: 3, label: '钟楼齿轮' }],
    reward: { xp: 3200, gold: 420, item: { minQuality: 'orange' } } },
  { id: 'cq_alchemy1', cls: 'alchemy', name: '腐沼实验室 · 孢子', giver: 'qinghe', turnIn: 'qinghe', minLevel: 10,
    text: '你身上那股味道……是硝石和沼气。腐沼神殿底下以前有个炼金师的实验室，那些腐化树人身上的孢子囊就是从那里长出来的。帮我采三个回来，我们一起看看他到底在配什么。',
    doneText: '孢子囊遇火会炸，遇冰会结晶……他研究的就是这个：让药剂在地上互相「点火」。拿去吧，你的配方会更猛。',
    objectives: [{ type: 'collect', target: 'treant', chance: 0.6, count: 3, label: '腐沼孢子囊' }],
    reward: { xp: 900, gold: 160, item: { minQuality: 'purple' } } },
  { id: 'cq_alchemy2', cls: 'alchemy', name: '腐沼实验室 · 原料', giver: 'yan', turnIn: 'yan', minLevel: 24, requires: ['cq_alchemy1'],
    text: '青禾托人捎信给我了。那个炼金师的最后一张配方要两样东西：霜脊冰元素体内的冰晶，和烬落熔岩卵里的硫磺。一冷一热，配好了能让大釜自己沸腾。',
    doneText: '冰晶和硫磺放进同一口锅——你看它翻滚的样子。往后你的大釜会扔得更快。',
    objectives: [{ type: 'collect', target: 'ice_elemental', chance: 0.6, count: 2, label: '霜脊冰晶' }, { type: 'collect', target: 'lava_spawn', chance: 0.6, count: 2, label: '烬落硫磺' }],
    reward: { xp: 4200, gold: 520, item: { minQuality: 'orange' } } },
  // v0.7.10：战士「断刃誓约」、法师「星烬手稿」——补齐四职业各 2 个职业任务，每个奖励 1 个天赋点
  { id: 'cq_warrior1', cls: 'warrior', name: '断刃誓约 · 残旗', giver: 'rowan', turnIn: 'rowan', minLevel: 10,
    text: '原野上的劫掠者扛着的那些破旗——那是当年守边军团的军旗。军团最后一战没有一个人退。把旗子夺回来三面，让他们的誓言有人接着守。',
    doneText: '三面，一面不少。你握旗的样子跟他们一样。从今往后，这份誓言算你一份。',
    objectives: [{ type: 'collect', target: 'raider', chance: 0.5, count: 3, label: '守边军旗' }],
    reward: { xp: 900, gold: 160, item: { minQuality: 'purple' } } },
  { id: 'cq_warrior2', cls: 'warrior', name: '断刃誓约 · 断刃', giver: 'mosang', turnIn: 'mosang', minLevel: 20, requires: ['cq_warrior1'],
    text: '军团长的佩剑断成了三截，被沙匪拿去当战利品炫耀。找回来，我认识一个铁匠，能把它重新熔进你的武器里。',
    doneText: '三截都在。剑没了，剑意还在——它会跟着你。',
    objectives: [{ type: 'collect', target: 'sand_bandit', chance: 0.5, count: 3, label: '军团长断刃' }],
    reward: { xp: 3200, gold: 420, item: { minQuality: 'orange' } } },
  { id: 'cq_mage1', cls: 'mage', name: '星烬手稿 · 残页', giver: 'qinghe', turnIn: 'qinghe', minLevel: 10,
    text: '有位星象师当年在腐沼神殿里避难，留下一本手稿。腐化树人把纸页卷进了树皮里。帮我找回三页，上面记着把星火凝成法术的办法。',
    doneText: '墨迹还在发光……这是用星烬写的。读懂它，你的法术会更听话。',
    objectives: [{ type: 'collect', target: 'treant', chance: 0.6, count: 3, label: '星烬手稿残页' }],
    reward: { xp: 900, gold: 160, item: { minQuality: 'purple' } } },
  { id: 'cq_mage2', cls: 'mage', name: '星烬手稿 · 封印', giver: 'yan', turnIn: 'yan', minLevel: 24, requires: ['cq_mage1'],
    text: '手稿最后一页被封住了，要用冰元素的寒核和熔岩卵的余烬一起才能解开——冷与热，正是星象师研究了一辈子的东西。',
    doneText: '封印开了。最后一页只写着一句话：「火会熄，星不会」。拿着吧。',
    objectives: [{ type: 'collect', target: 'ice_elemental', chance: 0.6, count: 2, label: '冰元素寒核' }, { type: 'collect', target: 'lava_spawn', chance: 0.6, count: 2, label: '熔岩余烬' }],
    reward: { xp: 4200, gold: 520, item: { minQuality: 'orange' } } },
];

/** v1.0.6：职业任务 = 本体 + 内容包职业的任务（没有包 = 本体表原对象） */
export const CLASS_QUESTS: QuestDef[] = withPacks<QuestDef>(BASE_CLASS_QUESTS, 'classQuests');

export const QUEST_PERKS: Record<string, string> = {
  cq_chrono1: '遗落钟楼：回声伤害 +10% · 天赋点 +1', cq_chrono2: '遗落钟楼：回溯冷却 -2 秒 · 天赋点 +1',
  cq_alchemy1: '腐沼实验室：地面反应伤害 +20% · 天赋点 +1', cq_alchemy2: '腐沼实验室：大釜投掷速度 +25% · 天赋点 +1',
  cq_warrior1: '断刃誓约：天赋点 +1', cq_warrior2: '断刃誓约：天赋点 +1',
  cq_mage1: '星烬手稿：天赋点 +1', cq_mage2: '星烬手稿：天赋点 +1',
};
// v1.0.6：内容包职业任务的奖励说明（QuestDef 上多填的 perk 字段）
for (const q of packList<QuestDef & { perk?: string }>('classQuests')) if (q.perk && !(q.id in QUEST_PERKS)) QUEST_PERKS[q.id] = q.perk;
