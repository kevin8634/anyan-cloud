// v0.6.3：长副本故事链（副本学者墨言）——每个长副本 5 步，讲清每个首领的来历；终点送一张暗金凭证
import { QuestDef } from '../core/Quest';

const K = (boss: string, label: string) => ({ type: 'kill' as const, target: `raidboss_${boss}`, count: 1, label });
const step = (id: string, name: string, requires: string[], text: string, doneText: string, boss: string, label: string, last = false): QuestDef => ({
  id, name, giver: 'scholar', turnIn: 'scholar', minLevel: 30, requires, text, doneText, objectives: [K(boss, label)],
  reward: last ? { xp: 0, gold: 1500, stacks: [{ id: 'tok_dark', count: 1 }, { id: 'mat_darkshard', count: 10 }] } : { xp: 0, gold: 600, stacks: [{ id: 'mat_darkshard', count: 3 }] },
});

export const RAID_QUESTS: QuestDef[] = [
  // ---------------- 熔心王座 · 熔心余烬
  step('rq_m1', '熔心余烬 · 铸造者', ['em_scholar'], '熔心王座最早是一座铸造厂。戈拉克是那里的铸造者——他把熔渣喂给熔炉，熔炉回报他力量。去证明他不是不可战胜的。', '戈拉克倒下时说了一句「火还没熄」。我一直在想这句话。', 'gorak', '击败熔铸者 戈拉克'),
  step('rq_m2', '熔心余烬 · 双生之火', ['rq_m1'], '铸造厂里有两团永不熄灭的火，人们叫它们伊格和妮丝。传说它们原本是一团火，被君王一刀劈成两半。', '它们倒下时又合成了一团……也许传说是真的。', 'twins', '击败双生焰灵'),
  step('rq_m3', '熔心余烬 · 岩鳞', ['rq_m2'], '萨穆尔是君王的坐骑。它没有学会思考，只学会了冲锋。王座的石柱上全是它撞出来的裂痕。', '石柱终于不用再挨撞了。', 'samur', '击败岩鳞巨蜥 萨穆尔'),
  step('rq_m4', '熔心余烬 · 炎誓', ['rq_m3'], '大祭司是唯一知道王座秘密的人。她发过誓，要用献祭让君王永远燃烧。', '她的誓言碎了。下一个，就是君王本人。', 'priest', '击败炎誓大祭司'),
  step('rq_m5', '熔心余烬 · 熔心君王', ['rq_m4'], '瓦尔卡兹。他把自己的心脏扔进熔炉，换来了永不熄灭的生命。去把那颗心带回来——或者让它彻底冷却。', '心脏冷了。这张凭证给你，去挑一件王座留下的暗金吧。', 'valkaz', '击败熔心君王 瓦尔卡兹', true),
  // ---------------- 永霜墓穴 · 永冬誓约
  step('rq_f1', '永冬誓约 · 守门人', ['em_scholar'], '永霜墓穴的门口有一个守门人，莫戈斯。他把每个进去的人都锁在一块墓碑上，等着他们变成新的守门人。', '他的锁链断了，那些墓碑终于安静了。', 'keeper', '击败墓穴守门人 莫戈斯'),
  step('rq_f2', '永冬誓约 · 霜语', ['rq_f1'], '维瑟拉是永冬之王的女巫，她在镜子里住了三百年。没人知道哪一个才是真的她。', '最后那面镜子碎的时候，我好像听见她松了一口气。', 'vesra', '击败霜语女巫 维瑟拉'),
  step('rq_f3', '永冬誓约 · 寒脊', ['rq_f2'], '寒脊是一条还没长大就死去的龙。永冬之王把它的骨头拼了起来，让它替自己看守天空。', '骨头散了，天空归你了。', 'wyrm', '击败骨龙幼体 寒脊'),
  step('rq_f4', '永冬誓约 · 亡誓', ['rq_f3'], '三个骑士发誓守护王座直到永远。他们做到了——死了也没有离开。', '誓言终了。他们可以休息了。', 'knights', '击败亡誓骑士团'),
  step('rq_f5', '永冬誓约 · 永冬之王', ['rq_f4'], '伊瑟兰害怕春天。他停下了自己的心跳，好让冬天永远不结束。去告诉他，春天会来的。', '墓穴里第一次有了融雪的声音。拿着这张凭证，去挑一件墓穴的暗金。', 'ithran', '击败永冬之王 伊瑟兰', true),
];
