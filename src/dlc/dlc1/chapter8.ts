// ======================================================================
// DLC1 第八章「镜渊城」（35–38 级）—— v1.0.5
// 6 个主线（cs8_1..6，伊奥拉 / 卡戎）+ 10 个回响居民支线（cs8_r01..r10，帮他们「过完那一天」）
// 经验：主线 60000 + 支线 30000，加上清怪约够 34 → 38 级
// ======================================================================
import type { QuestDef } from '../../core/Quest';

const K = (target: string, count: number, label: string) => ({ type: 'kill' as const, target, count, label });
const C = (target: string, chance: number, count: number, label: string) => ({ type: 'collect' as const, target, chance, count, label });
const E = (area: string, label: string) => ({ type: 'explore' as const, area, label });
const T = (npc: string, label: string) => ({ type: 'talk' as const, npc, label });

export const CH8_MAIN: QuestDef[] = [
  { id: 'cs8_1', name: '8-1 倒悬之城', giver: 'iola', turnIn: 'charon', minLevel: 34, requires: ['cs7_6'],
    text: '钟响过一下，穹顶上的城亮了一盏灯。那是镜渊城——我的家。深潮口的尽头有一道倒着的阶梯，顺着它走上去。那里有人在等你，他……不太喜欢我。',
    doneText: '伊奥拉让你来的？那个小敲钟人。我叫卡戎，曾经是这座城的学者，后来被赶了出去。坐吧，外面那些回响不会进广场。',
    objectives: [E('mr_gate', '登上镜渊城')], reward: { xp: 8000, gold: 400 } },
  { id: 'cs8_2', name: '8-2 碎掉的倒影', giver: 'charon', turnIn: 'charon', minLevel: 34, requires: ['cs8_1'],
    text: '长街上那些碎镜子做的影子，是回响忘了自己是谁之后的样子。它们会撞碎还记得事的回响。去把它们打散。',
    doneText: '安静多了。你看，那些居民又开始走动了——还是同一天，同一条路。',
    objectives: [K('mr_wraith', 12, '打散镜像碎影')], reward: { xp: 9000, gold: 420, item: { minQuality: 'blue' } } },
  { id: 'cs8_3', name: '8-3 钟舌', giver: 'charon', turnIn: 'charon', minLevel: 34, requires: ['cs8_1'],
    text: '钟楼的哨兵脑袋就是一口小钟，里面挂着钟舌。我要 6 根，研究钟声到底怎么把「它」捆住的。',
    doneText: '每根钟舌上都刻着同一个名字……沉眠者。他们不是在哄它睡觉，是在给它上锁。',
    objectives: [C('mr_sentinel', 0.5, 6, '收集钟舌')], reward: { xp: 9500, gold: 440 } },
  { id: 'cs8_4', name: '8-4 提灯', giver: 'iola_m', turnIn: 'iola_m', minLevel: 36, requires: ['cs8_2', 'cs8_3'],
    text: '你见过卡戎了。别全信他。城北的提灯塔以前是给晚归的人照路的，现在那里全是提灯蛾。去看看塔顶的灯还在不在。',
    doneText: '灯芯还在。只要再响一次钟，它就能亮起来——镜渊城就能记起自己。',
    objectives: [E('mr_lighthouse', '登上提灯塔'), K('mr_moth', 10, '驱散提灯蛾')], reward: { xp: 10000, gold: 460, item: { minQuality: 'blue' } } },
  { id: 'cs8_5', name: '8-5 两种主张', giver: 'charon', turnIn: 'iola_m', minLevel: 36, requires: ['cs8_4'],
    text: '她想再敲一次钟，把沉眠者哄回去睡觉，让这座城再被勒一千年。我想剪断钟绳，让它醒过来，然后——把它的力量拿过来。去镜廊看看那些镜子里映出的东西，再去问问她。',
    doneText: '镜子里是……城还活着的时候。卡戎也在里面，站在钟楼下面，那时候他还在笑。……我不怪他。可钟不能停。',
    objectives: [E('mr_gallery', '在镜廊看镜中的往昔'), T('iola_m', '和伊奥拉谈谈')], reward: { xp: 8500, gold: 480 } },
  { id: 'cs8_6', name: '8-6 回响首领 · 腐根祭司', giver: 'iola_m', turnIn: 'iola_m', minLevel: 37, requires: ['cs8_5'],
    text: '提灯塔下面有个很大的回响在来回走。她身上挂满了铃铛——你在腐沼神殿见过她。暗岩之心吞了她，现在她想要这座城的钟。不能让她拿到。',
    doneText: '「当——」第二声。你听，整条长街的灯都亮了。卡戎也听见了……他在钟楼上看着我们。最后一口钟，在沉钟塔。',
    objectives: [K('mr_priest', 1, '击败回响 · 腐根祭司')], reward: { xp: 15000, gold: 800, item: { minQuality: 'purple' } } },
];

const side = (id: string, name: string, giver: string, text: string, doneText: string, objectives: QuestDef['objectives'], xp: number, opt: Partial<QuestDef> = {}): QuestDef =>
  ({ id, name, giver, turnIn: giver, minLevel: 34, requires: ['cs8_1'], text, doneText, objectives, reward: { xp, gold: 260 }, ...opt });

export const CH8_SIDE: QuestDef[] = [
  side('cs8_r01', '那天的面包', 'echo_ouf', '面包还在炉子里，可炉子是冷的……你能帮我看看炉膛吗？在长街东边。', '炉子……原来早就塌了。也好，那天的面包，就当是烤好了吧。谢谢你。', [E('mr_oven', '查看冷掉的面包炉')], 2500),
  side('cs8_r02', '守住门', 'echo_brun', '那天碎影冲进来的时候，我没守住门。这一次……帮我把它们挡在外面。', '门守住了。我可以下岗了。', [K('mr_wraith', 6, '击退闯进来的碎影')], 3000),
  side('cs8_r03', '木马', 'echo_tisha', '我的木马跑进镜廊最里面的镜子里了。你能帮我找回来吗？', '找到了！……它怎么是湿的？没关系，我抱着它睡觉。', [E('mr_toy', '在镜廊深处找到木马')], 2800),
  side('cs8_r04', '灯蛾粉', 'echo_hans', '提灯蛾翅膀上的粉，抹在船底能让船浮在雾上。给我 4 包，我想再出一次海。', '够了。等钟再响，海水回来，我就出发。', [C('mr_moth', 0.5, 4, '收集灯蛾粉')], 3000, { minLevel: 36 }),
  side('cs8_r05', '最后一页', 'echo_melo', '这是潮汐历的最后一页。我抄完了，可一直没交给学会。卡戎以前是学会的人……替我交给他吧。', '你交给他了？他说了什么？……他哭了？好吧。我抄完了。', [T('charon', '把最后一页交给卡戎')], 2500),
  side('cs8_r06', '钟铜', 'echo_goz', '钟楼哨兵身上的铜是好钟铜。给我 4 块，我要把那天没铸完的钟舌铸完。', '好铜。叮——你听，这声音对了。', [C('mr_sentinel', 0.5, 4, '收集钟铜')], 3000, { minLevel: 36 }),
  side('cs8_r07', '婚礼', 'echo_lian', '他说钟响三下就来小圣堂接我。钟响了，可他没来……你能去小圣堂看看吗？', '……圣堂里只有他的回响，站在那里等我。原来我们都在等。谢谢你，我知道该去哪里了。', [E('mr_chapel', '去小圣堂看看')], 2800),
  side('cs8_r08', '倒着的楼梯', 'echo_pike', '师父让我爬上钟楼敲钟，可楼梯是倒着的，我一上去就头晕。你帮我去钟楼看看，钟还在不在？', '还在！等我学会走倒着的楼梯，我就去敲它。', [E('mr_belltower', '去钟楼看看')], 2800),
  side('cs8_r09', '失控的哨兵', 'echo_sein', '钟楼的哨兵只听钟声，不听号令了。帮我让 5 个哨兵停下来。', '它们停了。等钟再响，它们会回到岗位上的。', [K('mr_sentinel', 5, '让钟首哨兵停下')], 3200, { minLevel: 36 }),
  side('cs8_r10', '钟声很好听', 'echo_otta', '我听见第二声钟了。孩子，去告诉伊奥拉——那个总是偷偷爬上钟楼的小丫头——就说老奥塔说，钟声很好听。', '她笑了吗？那就好。我可以睡了。', [T('iola_m', '把奥塔的话带给伊奥拉')], 4400, { minLevel: 37, requires: ['cs8_6'] }),
];

export const CH8_QUESTS: QuestDef[] = [...CH8_MAIN, ...CH8_SIDE];
