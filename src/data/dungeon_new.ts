// v0.6.5：两个新的普通副本（等级同步四难度，3 首领 + 隐藏首领 + 副本小套）—— 数据
//   沙葬王陵（赤砂裂谷 · 赤岩遗迹南侧）：蝎后 / 沙匪头目 / 沙葬法老；隐藏：无名守陵人（不碰碎任何石棺）
//   巨魔冰窟（霜脊高地 · 巨魔洞口）：巨魔双子 / 冰窟萨满 / 雪原巨人；隐藏：冰窟之心（点燃三座火盆）
// 复用长副本框架（web/raid.ts：走廊 + 圆形场地 + 首领脚本），RaidDef.kind = 'dungeon' 时难度 / 誓约 / 遗物 / 异变 / 奖牌走 dungeonplus。
// 数值以「英雄 · 30 级 · 装等 33」为基准，史诗 / 噩梦再乘 DIFF 倍率。
import type { RaidDef, RaidMob, RaidBossDef, RaidRoom, EliteMech } from './raid_molten';
import { ItemDef, SetBonus } from '../core/Loadout';
import { ModifierDef } from '../core/types';

const dmob = (name: string, model: string, mech: EliteMech, o: Partial<RaidMob>): RaidMob =>
  ({ name, model, mech, tint: 0x6a4a2a, tintK: 0.5, hp: 4200, dmg: 120, interval: 2.1, speed: 3.6, range: 2.3, aggro: 13, xp: 0, eliteXp: 4, ...o });

// 两个副本共用的布局：入口 → 3 ×（走廊 + 场地）→ 隐藏场地
const ROOMS = (packs: { kind: string; x: number; z: number }[][]): RaidRoom[] => [
  { corridor: [-33, -10], arena: { z: -48, r: 15 }, pack: packs[0] },
  { corridor: [-86, -63], arena: { z: -101, r: 15 }, pack: packs[1] },
  { corridor: [-139, -116], arena: { z: -155, r: 16 }, pack: packs[2] },
  { corridor: [-193, -170], arena: { z: -203, r: 13 }, pack: [] },
];

// ---------------------------------------------------------------- 沙葬王陵
export const TOMB_MOBS: Record<string, RaidMob> = {
  st_guard: dmob('王陵石卫', 'golem', 'guard', { tint: 0xb08a5a, tintK: 0.55, scale: 1.1, hp: 4800, dmg: 110, speed: 3.0 }),
  st_scarab: dmob('爆裂圣甲虫', 'spider', 'bomber', { tint: 0x3a6a5a, tintK: 0.6, glow: 0x0a3020, scale: 0.8, hp: 2600, dmg: 90, speed: 4.6, interval: 1.5 }),
  st_priest: dmob('沙葬祭司', 'cultist', 'healer', { tint: 0xc8a060, tintK: 0.5, hp: 3200, dmg: 80, ranged: true, range: 10, interval: 2.4, shot: { color: 0xffd080, el: 'physical' } }),
  st_jackal: dmob('胡狼守卫', 'wolf', 'berserk', { tint: 0x6a4a2a, tintK: 0.6, scale: 1.3, hp: 3800, dmg: 105, interval: 1.7, speed: 5.0 }),
  // 首领召唤物
  st_spawn: dmob('小沙蝎', 'spider', 'slag', { tint: 0xa06a3a, tintK: 0.6, scale: 0.55, hp: 1200, dmg: 60, interval: 1.4, speed: 4.4, range: 1.8, aggro: 20, eliteXp: 0 }),
  st_bandit: dmob('沙匪打手', 'brute', 'berserk', { tint: 0x8a5a3a, tintK: 0.45, scale: 1.0, hp: 2400, dmg: 90, speed: 4.2, eliteXp: 0 }),
  st_mummy: dmob('裹布木乃伊', 'miner', 'offering', { tint: 0xd8c8a0, tintK: 0.7, scale: 1.0, hp: 2000, dmg: 85, speed: 2.8, eliteXp: 0 }),
};
export const TOMB_BOSSES: RaidBossDef[] = [
  { id: 'kasra', name: '蝎后 卡瑟拉', title: '第一首领', hp: 52000, dmg: 175, interval: 2.0, speed: 3.8, range: 3.0, model: 'spider', tint: 0x8a4a20, tintK: 0.6, glow: 0x3a1000, scale: 2.2, xp: 0, eliteXp: 60,
    phases: ['巢穴', '孵化'],
    lines: { intro: '（嘶——沙子底下传来无数细碎的爬动声）', phase: ['（蝎后尾针高高翘起，卵囊开始破裂）'], big: '（蝎后钻进了沙里！）', kill: '（蝎后满意地摆动螯钳）', death: '（蝎后的甲壳裂开，一动不动）' },
    guide: { ilvl: 33, mechanics: ['毒刺：每次命中叠 1 层蝎毒（每层每秒掉血），5 层时爆发重伤——翻滚可以清掉所有层数', '钻地：钻进沙里 2 秒，从你脚下钻出（红圈），看到她消失就开始跑', '孵化（50%）：每 20 秒放出 3 只小沙蝎'],
      tips: ['蝎毒 3 层以上就翻滚', '小沙蝎血很少，清掉再打首领'] } },
  { id: 'rashid', name: '沙匪头目 拉希德', title: '第二首领', hp: 54000, dmg: 180, interval: 2.1, speed: 3.6, range: 2.8, model: 'brute', tint: 0x8a4a2a, tintK: 0.45, glow: 0x2a0a00, scale: 1.6, xp: 0, eliteXp: 60,
    phases: ['劫掠', '亡命'],
    lines: { intro: '王陵里的金子是我的！你也想分一份？拿命来换！', phase: ['兄弟们，抄家伙！'], big: '尝尝这个——炸药！', kill: '又一个寻宝的蠢货。', death: '金子……我的金子……' },
    guide: { ilvl: 34, mechanics: ['扔炸药：在你脚下画一个大红圈（3 秒）。红圈里如果有火药桶，桶会一起爆炸，首领受到 8% 生命的伤害并眩晕 4 秒', '回旋刀：朝你的方向扔出一排红圈', '60% / 30% 叫来两个沙匪打手'],
      tips: ['看到炸药就跑到火药桶旁边，让爆炸把桶点着，然后自己离开红圈', '场上一共 4 个火药桶，炸完就没了'] } },
  { id: 'setekh', name: '沙葬法老 塞特赫', title: '最终首领', hp: 60000, dmg: 190, interval: 2.3, speed: 3.4, range: 3.2, model: 'cultist', tint: 0xe0b040, tintK: 0.55, glow: 0x5a3a00, scale: 1.9, xp: 0, eliteXp: 120, enrage: 300,
    phases: ['审判', '流沙', '永眠'],
    lines: { intro: '谁……打扰了法老的长眠？', phase: ['黄沙会吞没一切不敬者。', '起来吧，我的仆从们！'], big: '直视法老之眼！', kill: '回到沙里去吧。', death: '王朝……终于……落幕……' },
    guide: { ilvl: 35, mechanics: ['法老之眼：读条 3 秒，读完时面朝法老的人被恐惧 3 秒并受重伤——读条时转身背对他', '流沙（70%）：场地外圈一段一段变成流沙（站上去持续掉血、减速），安全区在转', '永眠（35%）：唤醒 3 个木乃伊，木乃伊活着时法老受到伤害 -50%'],
      tips: ['眼睛读条时往外跑就是背对着他', '木乃伊出来先清'] } },
  { id: 'warden', name: '无名守陵人', title: '隐藏首领', hp: 70000, dmg: 200, interval: 2.2, speed: 3.6, range: 3.0, model: 'golem', tint: 0x4a4a3a, tintK: 0.6, glow: 0x6a5a20, scale: 2.0, xp: 0, eliteXp: 200,
    phases: ['守护', '黄沙之怒'],
    lines: { intro: '……你没有惊扰任何一位安眠者。那么，接受最后的考验。', phase: ['黄沙，听我号令！'], big: '……', kill: '安眠吧。', death: '王陵……托付给你了……' },
    guide: { ilvl: 36, mechanics: ['三连地裂和熔岩足迹（这里是流沙）一起出现', '生命低于 50% 后加上直线沙暴吐息'], tips: ['边打边侧移，不要站在原地'] } },
];
export const TOMB_ROOMS = ROOMS([
  [{ kind: 'st_guard', x: 0, z: -20 }, { kind: 'st_scarab', x: -2.5, z: -23 }, { kind: 'st_scarab', x: 2.5, z: -23 }],
  [{ kind: 'st_priest', x: 0, z: -78 }, { kind: 'st_jackal', x: -2.5, z: -73 }, { kind: 'st_guard', x: 2.5, z: -73 }],
  [{ kind: 'st_priest', x: -2.5, z: -132 }, { kind: 'st_jackal', x: 2.5, z: -128 }, { kind: 'st_scarab', x: 0, z: -125 }, { kind: 'st_guard', x: 0, z: -122 }],
]);
/** 石棺（走廊两侧，局部坐标）：靠近会碰碎；一个都没碎 → 隐藏首领 */
export const TOMB_COFFINS: [number, number][] = [[-4.9, -16], [4.9, -28], [-4.9, -70], [4.9, -82], [-4.9, -122], [4.9, -134]];
/** 第二首领场地的火药桶（相对场地圆心） */
export const TOMB_BARRELS: [number, number][] = [[-9, -5], [9, -5], [-9, 6], [9, 6]];

// ---------------------------------------------------------------- 巨魔冰窟
export const TROLL_MOBS: Record<string, RaidMob> = {
  tc_guard: dmob('冰甲巨魔', 'brute', 'guard', { tint: 0x6a9ac8, tintK: 0.5, scale: 1.2, hp: 4800, dmg: 115, speed: 3.0 }),
  tc_bomber: dmob('冰囊爆裂者', 'toad', 'bomber', { tint: 0xbfe6ff, tintK: 0.6, glow: 0x1a4a7a, hp: 2600, dmg: 90, speed: 4.4, interval: 1.6 }),
  tc_healer: dmob('巨魔巫医', 'cultist', 'healer', { tint: 0x4a7a6a, tintK: 0.5, hp: 3200, dmg: 80, ranged: true, range: 10, interval: 2.4, shot: { color: 0x9ad8ff, el: 'frost' } }),
  tc_totem: dmob('霜火图腾', 'golem', 'totem', { tint: 0x8ab8e0, tintK: 0.6, glow: 0x2a6aa0, scale: 0.8, hp: 2200, dmg: 0, interval: 99, speed: 0, range: 0, aggro: 0 }),
  tc_wolf: dmob('雪原座狼', 'wolf', 'berserk', { tint: 0xd8ecff, tintK: 0.6, scale: 1.35, hp: 3800, dmg: 105, interval: 1.7, speed: 5.0 }),
};
export const TROLL_BOSSES: RaidBossDef[] = [
  { id: 'trolls', name: '巨魔双子 格鲁与莫格', title: '第一首领', hp: 30000, dmg: 160, interval: 2.2, speed: 3.6, range: 2.8, model: 'brute', tint: 0x5a8ab8, tintK: 0.5, glow: 0x0a2a4a, scale: 1.6, xp: 0, eliteXp: 60,
    phases: ['双子', '复仇'],
    lines: { intro: '格鲁：小东西！莫格：抓住它！格鲁：吃掉它！', phase: ['莫格：格鲁！起来！'], big: '格鲁：接住——！', kill: '莫格：嚼嚼。', death: '格鲁：莫格……一起……' },
    guide: { ilvl: 33, mechanics: ['巨魔再生：一只倒下后，10 秒内另一只没死，倒下的那只会站起来（回 40% 生命）', '格鲁扔冰块（大红圈），莫格震地（身边红圈）'],
      tips: ['把两只打到差不多的血量，再先后击杀', '另一只倒下时它会狂暴，留好翻滚'] } },
  { id: 'urga', name: '冰窟萨满 乌尔嘎', title: '第二首领', hp: 52000, dmg: 165, interval: 2.2, speed: 3.4, range: 2.8, model: 'cultist', tint: 0x3a6a8a, tintK: 0.55, glow: 0x0a3a6a, scale: 1.7, xp: 0, eliteXp: 60,
    phases: ['先祖', '风暴'],
    lines: { intro: '先祖的冰在呼唤你的血。', phase: ['风暴，降临！'], big: '冰枪——贯穿他！', kill: '先祖收下了。', death: '先祖……原谅我……' },
    guide: { ilvl: 34, mechanics: ['霜火图腾：每 25 秒插一根，图腾附近的首领受到伤害 -50%，先拆', '冰枪：读条 3 秒，带护盾，打掉护盾打断；读完 = 大量冰霜伤害', '冰霜新星：首领身边大红圈，近战往外走'],
      tips: ['图腾一出来就拆', '冰枪读条开爆发技能'] } },
  { id: 'holger', name: '雪原巨人 霍尔格', title: '最终首领', hp: 60000, dmg: 195, interval: 2.4, speed: 3.3, range: 3.4, model: 'brute', tint: 0xe8f4ff, tintK: 0.6, glow: 0x2a5a9a, scale: 2.3, xp: 0, eliteXp: 120, enrage: 300,
    phases: ['践踏', '雪崩', '冰封'],
    lines: { intro: '冰窟是我的家。你是我的晚饭。', phase: ['山，塌下来！', '冰，护住我！'], big: '飞吧，小虫子！', kill: '冻成冰块，留着冬天吃。', death: '山……也会……倒下……' },
    guide: { ilvl: 35, mechanics: ['践踏：身边大红圈', '抓起投掷：把你扔到场边，落地点周围落冰锥', '雪崩（70%）：一排排雪球滚过场地（直线红圈）', '冰封（35%）：读条 5 秒套冰甲护盾，打不掉护盾首领回 10% 血'],
      tips: ['被扔出去先离开冰锥红圈', '冰甲读条时全力输出'] } },
  { id: 'heart', name: '冰窟之心', title: '隐藏首领', hp: 70000, dmg: 190, interval: 2.2, speed: 2.8, range: 3.0, model: 'golem', tint: 0xbfe6ff, tintK: 0.8, glow: 0x3a8ad0, scale: 2.0, xp: 0, eliteXp: 200,
    phases: ['苏醒', '永冻'],
    lines: { intro: '……温暖……好久……没有……感到温暖了……', phase: ['……但寒冷……才是我……'], big: '……', kill: '……睡吧……', death: '……谢谢……你的……火……' },
    guide: { ilvl: 36, mechanics: ['寒意：站着不动层数一直叠，满 10 层冻结', '直线寒霜吐息；生命低于 50% 后加上灵魂锁链'], tips: ['一直挪步'] } },
];
export const TROLL_ROOMS = ROOMS([
  [{ kind: 'tc_guard', x: 0, z: -20 }, { kind: 'tc_bomber', x: -2.5, z: -23 }, { kind: 'tc_bomber', x: 2.5, z: -23 }],
  [{ kind: 'tc_healer', x: 0, z: -78 }, { kind: 'tc_wolf', x: -2.5, z: -73 }, { kind: 'tc_guard', x: 2.5, z: -73 }],
  [{ kind: 'tc_totem', x: 0, z: -132 }, { kind: 'tc_wolf', x: -2.5, z: -126 }, { kind: 'tc_healer', x: 2.5, z: -126 }, { kind: 'tc_guard', x: 0, z: -122 }],
]);
/** 火盆（走廊壁龛，局部坐标）：三个都点燃 → 隐藏首领 */
export const TROLL_BRAZIERS: [number, number][] = [[-4.4, -24], [4.4, -76], [-4.4, -128]];

export const TOMB_HINT = '壁画：一排石棺，一个人低着头从中间走过。下面刻着：「安眠者不愿被惊扰。只为敬畏者，守陵人才会开门。」';
export const TROLL_HINT = '壁画：一个巨大的冰影蜷缩在洞底，三团火围着它。下面刻着：「三团火温暖沉睡者的梦，它会醒来道谢。」';


// ---------------------------------------------------------------- 灰烬铸造厂（v0.6.6，烬落荒原）
export const FORGE_MOBS: Record<string, RaidMob> = {
  fd_guard: dmob('铁甲铸卫', 'golem', 'guard', { tint: 0x3a2a24, tintK: 0.6, glow: 0x5a1800, scale: 1.1, hp: 4800, dmg: 115, speed: 3.0 }),
  fd_bomber: dmob('熔渣罐', 'toad', 'bomber', { tint: 0xff6a20, tintK: 0.65, glow: 0x7a2000, hp: 2600, dmg: 90, speed: 4.4, interval: 1.6 }),
  fd_healer: dmob('炉火司祭', 'cultist', 'healer', { tint: 0x6a2a10, tintK: 0.5, glow: 0x3a0800, hp: 3200, dmg: 80, ranged: true, range: 10, interval: 2.4, shot: { color: 0xff8a30, el: 'fire' } }),
  fd_totem: dmob('鼓风炉', 'golem', 'totem', { tint: 0x2a1a14, tintK: 0.6, glow: 0xa03000, scale: 0.8, hp: 2200, dmg: 0, interval: 99, speed: 0, range: 0, aggro: 0 }),
  fd_hound: dmob('熔铁猎犬', 'wolf', 'berserk', { tint: 0x2a1a18, tintK: 0.7, glow: 0x6a1a00, scale: 1.3, hp: 3800, dmg: 105, interval: 1.7, speed: 5.0 }),
  // 首领召唤物
  fd_worker: dmob('铸工', 'miner', 'berserk', { tint: 0x5a3a2a, tintK: 0.45, hp: 2200, dmg: 85, speed: 4.0, eliteXp: 0 }),
  fd_mini: dmob('半成品傀儡', 'golem', 'slag', { tint: 0x4a3a30, tintK: 0.5, glow: 0x7a2000, scale: 0.75, hp: 2600, dmg: 95, interval: 2.0, speed: 3.2, range: 2.4, aggro: 20, eliteXp: 0 }),
};
export const FORGE_BOSSES: RaidBossDef[] = [
  { id: 'overseer', name: '铸造监工 葛伦', title: '第一首领', hp: 52000, dmg: 175, interval: 2.1, speed: 3.6, range: 3.0, model: 'brute', tint: 0x4a2a1a, tintK: 0.5, glow: 0x3a1000, scale: 1.6, xp: 0, eliteXp: 60,
    phases: ['开工', '赶工'],
    lines: { intro: '谁准你停下手里的活？——哦，是个外人。正好，炉子缺燃料。', phase: ['都给我快点！传送带开到最快！'], big: '吃鞭子！', kill: '扔进炉子。', death: '工期……要……延误了……' },
    guide: { ilvl: 33, mechanics: ['传送带：场上两条传送带会把站在上面的人往场边的熔渣池送，走出去或翻滚离开', '鞭笞：朝你的方向一条直线红圈', '每 25 秒叫来两个铸工；50% 后传送带加速'],
      tips: ['别站在传送带上打', '铸工血少，先清'] } },
  { id: 'golem', name: '锻炉傀儡', title: '第二首领', hp: 56000, dmg: 185, interval: 2.4, speed: 3.0, range: 3.2, model: 'golem', tint: 0x3a2420, tintK: 0.6, glow: 0xa03000, scale: 2.2, xp: 0, eliteXp: 60,
    phases: ['升温', '过载'],
    lines: { intro: '（炉膛咆哮，温度计的指针开始往上爬）', phase: ['（傀儡全身通红，蒸汽从关节里喷出来）'], big: '（傀儡举起锻锤）', kill: '（傀儡喷出一股白汽）', death: '（炉火熄灭，傀儡僵在原地）' },
    guide: { ilvl: 34, mechanics: ['过热：热度每秒上升，满 100 会全场爆炸（重伤）', '把它引进场边的冷却池：热度清零、眩晕 5 秒、受到伤害 +50%；每个池子用完要 25 秒才能再用', '锻锤：你脚下的红圈'],
      tips: ['热度过 60 就往冷却池走，站到池子另一侧让它踩进来', '眩晕时开爆发'] } },
  { id: 'master', name: '熔铸大师 维克多', title: '最终首领', hp: 60000, dmg: 190, interval: 2.3, speed: 3.4, range: 3.0, model: 'cultist', tint: 0x7a3a10, tintK: 0.5, glow: 0x6a2a00, scale: 1.9, xp: 0, eliteXp: 120, enrage: 300,
    phases: ['浇注', '成型', '淬火'],
    lines: { intro: '你来得正好。我缺一块好材料。', phase: ['起来吧，我的半成品们！', '淬火——让一切定型！'], big: '铁水，浇下来！', kill: '不合格。回炉。', death: '我的……最后一件作品……' },
    guide: { ilvl: 35, mechanics: ['浇注：在你脚下落一大滩铁水（大红圈，留下一会儿的熔铁）', '熔铁浪：一排排直线红圈扫过场地', '60%：叫来两个半成品傀儡；30%：场地外圈变成熔岩'],
      tips: ['浇注红圈很大，提前往外走', '半成品傀儡出来先清'] } },
  { id: 'statue', name: '未竟之作 · 无名铸像', title: '隐藏首领', hp: 70000, dmg: 200, interval: 2.2, speed: 3.2, range: 3.0, model: 'golem', tint: 0xb08a50, tintK: 0.6, glow: 0xffa040, scale: 2.1, xp: 0, eliteXp: 200,
    phases: ['苏醒', '完成'],
    lines: { intro: '……大师……我……完成了吗？', phase: ['……我是……完美的……'], big: '……', kill: '……不合格……', death: '……原来……我是……完成了的……' },
    guide: { ilvl: 36, mechanics: ['三连地裂和熔岩足迹一起出现', '生命低于 50% 后加上直线吐息'], tips: ['边打边侧移'] } },
];
export const FORGE_ROOMS = ROOMS([
  [{ kind: 'fd_guard', x: 0, z: -20 }, { kind: 'fd_bomber', x: -2.5, z: -23 }, { kind: 'fd_bomber', x: 2.5, z: -23 }],
  [{ kind: 'fd_healer', x: 0, z: -78 }, { kind: 'fd_hound', x: -2.5, z: -73 }, { kind: 'fd_guard', x: 2.5, z: -73 }],
  [{ kind: 'fd_totem', x: 0, z: -132 }, { kind: 'fd_hound', x: -2.5, z: -126 }, { kind: 'fd_healer', x: 2.5, z: -126 }, { kind: 'fd_guard', x: 0, z: -122 }],
]);
/** 第一首领场地的两条传送带（相对场地圆心的 z、方向） */
export const FORGE_BELTS: { z: number; dir: number }[] = [{ z: -5, dir: 1 }, { z: 5, dir: -1 }];
/** 第二首领场地的冷却池（相对场地圆心） */
export const FORGE_POOLS: [number, number][] = [[-10, 0], [10, 0]];
/** 第三首领场地的四个空模子（相对场地圆心）：被「浇注」的铁水灌满 → 隐藏首领 */
export const FORGE_MOLDS: [number, number][] = [[-9, -7], [9, -7], [-9, 7], [9, 7]];
export const FORGE_HINT = '壁画：大师俯身在四个空模子前，铁水从他手里流下。下面刻着：「大师一生只差最后一件作品。四个模子，都在等铁水。」';

export const NEW_DUNGEON_DEFS = (): Record<'sand_tomb' | 'troll_cave' | 'ash_forge', Omit<RaidDef, 'id'>> => ({
  sand_tomb: {
    name: '沙葬王陵', level: 30, desc: '30 级普通副本 · 3 个首领 · 四难度 · 埋在赤砂下的法老墓',
    mobs: TOMB_MOBS, bosses: TOMB_BOSSES, rooms: TOMB_ROOMS, origin: { x: -1200, z: 0 }, theme: 'sand', explore: 'dungeon',
    kind: 'dungeon', wild: 'redsand', el: 'physical', hidden: { room: 3, hint: TOMB_HINT },
    palette: { sea: 0xc8a050, stone: 0x9a7a50, stone2: 0x8a6a44, rim: 0x5a4028, ring: 0xffd080, torch: 0xffc070, rock: 0x8a6a40, wall: 0xffc060, zone: '#d8b060', zoneRing: '#fff0b0' },
    look: { bg: 0x2a1c10, fogNear: 16, fogFar: 66, hemi: 0xffd8a0, ground: 0x4a3018, hemiI: 0.85, sun: 0.6 },
  },
  troll_cave: {
    name: '巨魔冰窟', level: 30, desc: '30 级普通副本 · 3 个首领 · 四难度 · 霜脊山腹里的巨魔老巢',
    mobs: TROLL_MOBS, bosses: TROLL_BOSSES, rooms: TROLL_ROOMS, origin: { x: -1400, z: 0 }, theme: 'troll', explore: 'frost',
    kind: 'dungeon', wild: 'frost', el: 'frost', hidden: { room: 3, hint: TROLL_HINT },
    palette: { sea: 0x3a6a9a, stone: 0x6a7a8a, stone2: 0x5a6a7a, rim: 0x2a3440, ring: 0x9ad8ff, torch: 0xffa050, rock: 0x7a8a9a, wall: 0x9ad8ff, zone: '#9ad8ff', zoneRing: '#e8f8ff' },
    look: { bg: 0x0c1622, fogNear: 14, fogFar: 60, hemi: 0xa8d0ff, ground: 0x1a2a3a, hemiI: 0.8, sun: 0.45 },
  },
  ash_forge: {
    name: '灰烬铸造厂', level: 30, desc: '30 级普通副本 · 3 个首领 · 四难度 · 烬落荒原深处还在运转的铸造厂',
    mobs: FORGE_MOBS, bosses: FORGE_BOSSES, rooms: FORGE_ROOMS, origin: { x: -1600, z: 0 }, theme: 'forge', explore: 'dungeon',
    kind: 'dungeon', wild: 'ember', el: 'fire', hidden: { room: 3, hint: FORGE_HINT },
    palette: { sea: 0xff5a10, stone: 0x3a3030, stone2: 0x2e2626, rim: 0x1a1414, ring: 0xffa040, torch: 0xff8a3a, rock: 0x2a2220, wall: 0xff6a20, zone: '#ff7a20', zoneRing: '#ffd080' },
    look: { bg: 0x1a0c08, fogNear: 14, fogFar: 62, hemi: 0xffa070, ground: 0x2a1006, hemiI: 0.75, sun: 0.5 },
  },
});

// ---------------------------------------------------------------- 副本小套 + 隐藏首领外观件
type FixedDef = ItemDef & { baseId: string; affixes: number };
const fx = (id: string, name: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): ModifierDef => ({ id, name, source: 'equipment', desc, ...m });
const slotOf = (b: string) => b === 'b_cloak' ? 'back' : b === 'b_ring' ? 'ring' : b === 'b_idol' ? 'trinket' : 'neck';
const piece = (id: string, name: string, baseId: string, setId: string): FixedDef => ({ id, name, baseId, slot: slotOf(baseId) as ItemDef['slot'], quality: 'purple', setId, modifiers: [], affixes: 3 });
export const DUNGEON_SET_ITEMS: FixedDef[] = [
  piece('set_tomb_cloak', '守陵人的裹尸布', 'b_cloak', 'set_tomb'), piece('set_tomb_amulet', '法老的圣甲虫', 'b_amulet', 'set_tomb'), piece('set_tomb_ring', '王陵封印指环', 'b_ring', 'set_tomb'),
  piece('set_forge_cloak', '铸工防火披风', 'b_cloak', 'set_forge'), piece('set_forge_ring', '大师的测温戒', 'b_ring', 'set_forge'), piece('set_forge_idol', '傀儡核心', 'b_idol', 'set_forge'),
  piece('set_troll_cloak', '巨魔皮斗篷', 'b_cloak', 'set_troll'), piece('set_troll_amulet', '萨满骨链', 'b_amulet', 'set_troll'), piece('set_troll_idol', '雪原巨人的牙', 'b_idol', 'set_troll'),
  // 隐藏首领：独一无二的外观件（固定名字 + 特效）
  { id: 'h_warden_mask', name: '无名守陵人的面具', baseId: 'b_idol', slot: 'trinket', quality: 'orange', affixes: 2,
    modifiers: [fx('h_warden', '守陵人', '技能命中使目标陷入流沙侵蚀（5 秒持续伤害）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 110, duration: 5 } }] }),
      { ...fx('h_warden2', '守陵人', '大招伤害 +20%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }), cls: 'warrior' },
      { ...fx('h_warden2m', '守陵人', '大招冷却 -15%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.15 }] }), cls: 'mage' }] },   // v0.6.9 第二条改职业版
  { id: 'h_statue_ring', name: '无名铸像的指环', baseId: 'b_ring', slot: 'ring', quality: 'orange', affixes: 2,
    modifiers: [fx('h_statue', '无名铸像', '普通攻击每第 4 次必定暴击', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'critEvery', n: 4 } }] }),
      { ...fx('h_statue2w', '无名铸像', '旋风斩每次命中引发小爆炸（半径 2，20% 伤害）', { match: { skillIds: ['whirlwind'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2, damagePercent: 0.2 } }] }), cls: 'warrior' },
      { ...fx('h_statue2', '无名铸像', '火焰技能伤害 +10%', { match: { tagsAny: ['fire'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.1 }] }), cls: 'mage' }] },
  { id: 'h_heart_shard', name: '冰窟之心碎片', baseId: 'b_amulet', slot: 'neck', quality: 'orange', affixes: 2,
    modifiers: [fx('h_heart', '冰窟之心', '同一目标被命中 6 次后冻结 1.2 秒（首领只打断）', { match: { slots: ['skill1', 'skill2', 'skill3', 'basic'] }, ops: [{ op: 'addEffect', effect: { type: 'stackStun', stacks: 6, duration: 1.2, name: '冻结' } }] }),
      { ...fx('h_heart2w', '冰窟之心', '雷霆一击对冻结 / 眩晕中的敌人伤害 +30%', { match: { skillIds: ['thunderclap'] }, conditions: [{ type: 'targetHasEffect', effect: 'stun' }], ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] }), cls: 'warrior' },
      { ...fx('h_heart2', '冰窟之心', '对冻结 / 眩晕中的敌人伤害 +15%', { match: {}, conditions: [{ type: 'targetHasEffect', effect: 'stun' }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }), cls: 'mage' }] },
];
export const DUNGEON_SETS: SetBonus[] = [
  { setId: 'set_tomb', pieces: 2, modifier: fx('set_tomb_2', '王陵之誓(2件)', '王陵之誓(2件)：所有伤害 +6%', { match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.06 }] }) },
  { setId: 'set_tomb', pieces: 3, modifier: fx('set_tomb_3', '王陵之誓(3件)', '王陵之誓(3件)：大招命中时重置剩余冷却最长的技能（不含大招）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'longest', chance: 1 } }] }) },
  { setId: 'set_forge', pieces: 2, modifier: fx('set_forge_2', '铸造之火(2件)', '铸造之火(2件)：范围技能伤害 +10%', { match: { tagsAny: ['aoe'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.1 }] }) },
  { setId: 'set_forge', pieces: 3, modifier: fx('set_forge_3', '铸造之火(3件)', '铸造之火(3件)：技能命中留下燃烧地面（3 秒，持续火焰伤害）', { match: { slots: ['skill1', 'skill2', 'skill3', 'ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 100, radius: 2.2, duration: 3 } }] }) },
  { setId: 'set_troll', pieces: 2, modifier: fx('set_troll_2', '巨魔之血(2件)', '巨魔之血(2件)：技能伤害的 2% 转化为生命，溢出转为护盾（最多 10% 最大生命）', { match: {}, ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.02, overflowShield: 0.1 } }] }) },
  { setId: 'set_troll', pieces: 3, modifier: fx('set_troll_3', '巨魔之血(3件)', '巨魔之血(3件)：技能命中叠「巨魔之怒」，满 10 层时下一个技能眩晕敌人 0.8 秒（首领改为打断，并使其 4 秒内受到的伤害 +10%）', { match: { slots: ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate'] }, conditions: [{ type: 'stacks', key: 'troll', min: 10, consume: true }], ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 0.8 } }] }) },
];
export const SET_OF: Record<string, string[]> = { sand_tomb: ['set_tomb_cloak', 'set_tomb_amulet', 'set_tomb_ring'], troll_cave: ['set_troll_cloak', 'set_troll_amulet', 'set_troll_idol'], ash_forge: ['set_forge_cloak', 'set_forge_ring', 'set_forge_idol'] };
export const HIDDEN_DROP: Record<string, string> = { sand_tomb: 'h_warden_mask', troll_cave: 'h_heart_shard', ash_forge: 'h_statue_ring' };
/** 首领掉副本套的几率（英雄 / 史诗 / 噩梦） */
/** v1.2.76 Rhett 11-03：副本小套（王陵之誓 / 铸造之火 / 巨魔之血）没用，停止掉落；定义保留，老存档已有的照常读 */
export const DUNGEON_SET_DROP = false;
export const SET_CHANCE: Record<string, number> = { heroic: 0.25, epic: 0.32, nightmare: 0.4, normal: 0.25 };
