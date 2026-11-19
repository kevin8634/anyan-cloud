// 阶段六（v0.6.1）：满级单人长副本「永霜墓穴」—— 冰霜亡灵主题，5 个首领（数据；逻辑在 web/raid.ts）
import { RaidDef, RaidMob, RaidBossDef, RaidRoom, mob, bossScale } from './raid_molten';

export const FROST_MOBS: Record<string, RaidMob> = {
  fc_guard: mob('冰誓盾卫', 'brute', 'guard', { tint: 0x5a7a9a, tintK: 0.55, glow: 0x0a2a4a, scale: 1.15, hp: 3400, dmg: 70, speed: 3.0 }),
  fc_bomber: mob('冰尸自爆者', 'miner', 'bomber', { tint: 0x9ad0ff, tintK: 0.6, glow: 0x1a4a7a, hp: 2100, dmg: 58, speed: 4.2, interval: 1.6 }),
  fc_healer: mob('霜语祭司', 'cultist', 'healer', { tint: 0x3a5a8a, tintK: 0.55, glow: 0x0a2040, hp: 2500, dmg: 52, ranged: true, range: 10, interval: 2.4, shot: { color: 0x9ad8ff, el: 'frost' } }),
  fc_totem: mob('寒冰图腾', 'golem', 'totem', { tint: 0x8ab8e0, tintK: 0.6, glow: 0x2a6aa0, scale: 0.8, hp: 1500, dmg: 0, interval: 99, speed: 0, range: 0, aggro: 0 }),
  fc_berserk: mob('霜鬃狂兽', 'wolf', 'berserk', { tint: 0xd8ecff, tintK: 0.6, glow: 0x1a3a6a, scale: 1.45, hp: 3000, dmg: 66, interval: 1.7, speed: 5.0 }),
  // 首领召唤物
  fc_prison: mob('冰柱囚笼', 'golem', 'prison', { tint: 0xbfe6ff, tintK: 0.8, glow: 0x3a8ad0, scale: 0.9, hp: 1700, dmg: 0, interval: 99, speed: 0, range: 0, aggro: 0, xp: 0, eliteXp: 0 }),
};

export const FROST_BOSSES: RaidBossDef[] = bossScale([
  { id: 'keeper', name: '墓穴守门人 莫戈斯', title: '第一首领', hp: 30000, dmg: 96, interval: 2.2, speed: 3.3, range: 3.0, model: 'brute', tint: 0x4a5a6a, tintK: 0.6, glow: 0x0a2a4a, scale: 1.7, xp: 3000, eliteXp: 120,
    phases: ['守门', '锁魂'],
    lines: { intro: '墓穴不收活人。你会成为下一块墓碑。', phase: ['锁链，收紧！'], big: '灵魂锁链——别想逃！', kill: '又一个守墓人。', death: '门……开了……' },
    guide: { ilvl: 30, mechanics: ['灵魂锁链：把你和一块墓碑连起来，连着时持续掉血并减速', '离墓碑超过 14 米锁链就会断，断的时候受一次伤害；10 秒内没拉断 = 重伤', '墓土翻涌：两个红圈'],
      tips: ['看到锁链立刻朝墓碑反方向跑，一次拉断', '先想好往哪边跑，别跑进红圈'] } },
  { id: 'vesra', name: '霜语女巫 维瑟拉', title: '第二首领', hp: 32000, dmg: 82, interval: 2.0, speed: 3.6, range: 2.6, model: 'cultist', tint: 0x9ad0ff, tintK: 0.55, glow: 0x1a4a8a, scale: 1.6, xp: 3200, eliteXp: 130,
    phases: ['霜语', '镜像'],
    lines: { intro: '嘘……听，冰在说话。它在说你的名字。', phase: ['哪一个才是我呢？'], big: '镜中之霜！', kill: '冻住了，真安静。', death: '冰……碎了……' },
    guide: { ilvl: 31, mechanics: ['70% 和 35% 血时分出 3 个镜像，只有脚下有影子的是真身', '打镜像会在你脚下触发冰霜新星（红圈）', '打掉真身 6% 血镜像消失；暴风雪：脚下红圈'],
      tips: ['分身时先停手找影子', '远程也会被冰霜新星打到——新星在你脚下'] } },
  { id: 'wyrm', name: '骨龙幼体 寒脊', title: '第三首领', hp: 34000, dmg: 100, interval: 2.3, speed: 3.6, range: 3.2, model: 'spider', tint: 0xd8dcd0, tintK: 0.7, glow: 0x1a2a4a, scale: 2.3, xp: 3400, eliteXp: 140,
    phases: ['落地', '空中'],
    lines: { intro: '（骨骼摩擦的尖啸，寒气从肋骨间涌出）', big: '（深深吸气——吐息要来了！）', kill: '（骨龙发出满足的低吼）', death: '（骨龙散落成一地冰冷的骨头）' },
    guide: { ilvl: 32, mechanics: ['空中阶段（每 30 秒一次，12 秒）：首领飞起无法攻击，直线吐息扫过整个场地，看地面预警躲', '落地阶段：站在它身后会被甩尾（身后红圈）'],
      tips: ['落地时站在侧面或正面', '吐息是一整条线，往线的两侧走，别顺着线跑'] } },
  { id: 'knights', name: '亡誓骑士团', title: '第四首领', hp: 10000, dmg: 56, interval: 2.4, speed: 3.5, range: 2.7, model: 'brute', tint: 0x3a4a5a, tintK: 0.6, glow: 0x0a1a3a, scale: 1.4, xp: 3600, eliteXp: 150,
    phases: ['三誓', '二誓', '残誓'],
    lines: { intro: '盾骑：誓言未完。旗骑：王座未空。剑骑：拔剑！', phase: ['旗骑：兄弟倒下了——为他复仇！', '剑骑：只剩我了……那就够了！'], big: '剑骑：剑刃风暴！', kill: '盾骑：为了永冬。', death: '剑骑：誓言……终了……' },
    guide: { ilvl: 33, mechanics: ['三个骑士一起打：盾骑在时所有骑士受到伤害 -25%；旗骑在时所有骑士每秒回血；剑骑伤害最高并会剑刃风暴（身边红圈）', '每倒下一个，剩下的伤害 +25%'],
      tips: ['推荐击杀顺序：盾骑 → 旗骑 → 剑骑', '剑骑留到最后时它很痛，留好药水和翻滚'] } },
  { id: 'ithran', name: '永冬之王 伊瑟兰', title: '最终首领', hp: 34000, dmg: 100, interval: 2.4, speed: 3.4, range: 3.4, model: 'brute', tint: 0xd0e8ff, tintK: 0.7, glow: 0x2a6ad0, scale: 2.1, xp: 6000, eliteXp: 300, enrage: 360,
    phases: ['寒意', '冰柱囚笼', '永夜'],
    lines: { intro: '你的心跳……太吵了。让我替你停下它。', phase: ['冰会留住你，直到永远。', '黑暗之中，只有寒冷与你作伴。'], big: '永冬降临！', kill: '安息吧，永远地。', death: '春天……原来是这样的……' },
    guide: { ilvl: 34, mechanics: ['寒意：站着不动层数一直叠，叠满 10 层冻结（眩晕 + 重伤），移动或翻滚清层', '二阶段（70%）冰柱囚笼：随机把你冻在原地，打碎冰柱才能出来', '三阶段（30%）永夜：全场变暗，只能看到身边一圈，靠地面微光判断红圈', '6 分钟后狂暴'],
      tips: ['近战也要边打边挪步', '永夜里红圈依然发光，盯着地面'] } },
]);

export const FROST_ROOMS: RaidRoom[] = [
  { corridor: [-33, -10], arena: { z: -48, r: 15 }, pack: [{ kind: 'fc_guard', x: 0, z: -20 }, { kind: 'fc_bomber', x: -2.5, z: -23 }, { kind: 'fc_bomber', x: 2.5, z: -23 }] },
  { corridor: [-86, -63], arena: { z: -101, r: 15 }, pack: [{ kind: 'fc_healer', x: 0, z: -78 }, { kind: 'fc_berserk', x: -2.5, z: -73 }, { kind: 'fc_guard', x: 2.5, z: -73 }] },
  { corridor: [-139, -116], arena: { z: -155, r: 16 }, pack: [{ kind: 'fc_totem', x: 0, z: -130 }, { kind: 'fc_bomber', x: -2.5, z: -126 }, { kind: 'fc_berserk', x: 2.5, z: -126 }] },
  { corridor: [-195, -171], arena: { z: -210, r: 15 }, pack: [{ kind: 'fc_healer', x: 0, z: -186 }, { kind: 'fc_guard', x: 0, z: -181 }, { kind: 'fc_bomber', x: -3, z: -182 }, { kind: 'fc_bomber', x: 3, z: -182 }] },
  { corridor: [-249, -225], arena: { z: -266, r: 17 }, pack: [{ kind: 'fc_totem', x: 0, z: -243 }, { kind: 'fc_healer', x: -3, z: -240 }, { kind: 'fc_berserk', x: 3, z: -236 }, { kind: 'fc_guard', x: 0, z: -235 }] },
];
/** 第一首领场地的墓碑（相对场地圆心） */
export const KEEPER_STONES: [number, number][] = [[-10, -6], [10, -6], [-10, 7], [10, 7]];

export const FROST_CRYPT: RaidDef = {
  id: 'frost_crypt', name: '永霜墓穴', level: 30, desc: '30 级单人长副本 · 5 个首领 · 冰封的王陵',
  origin: { x: -1000, z: 0 }, theme: 'frost', explore: 'frost', wild: 'frost',   // v0.9.3g 入口迁到霜脊高地
  palette: { sea: 0x6ab8ff, stone: 0x5a6878, stone2: 0x4a5868, rim: 0x2a3440, ring: 0x9ad8ff, torch: 0x8ac8ff, rock: 0x6a7a8a, wall: 0x7ac8ff, zone: '#8ad0ff', zoneRing: '#e0f4ff' },
  mobs: FROST_MOBS, bosses: FROST_BOSSES, rooms: FROST_ROOMS,
  look: { bg: 0x0a1420, fogNear: 14, fogFar: 62, hemi: 0x9ac8ff, ground: 0x1a2a3a, hemiI: 0.8, sun: 0.5 },
};
