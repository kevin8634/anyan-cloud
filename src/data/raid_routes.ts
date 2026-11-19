// v0.6.10 长副本路线图数据（局部坐标：入口 0,0，往南 z 为负）。方案：docs/设计/副本与长副本路线.md
// 熔心王座：枢纽（余烬十字厅）+ 两翼任意顺序 + 封印之门 + 祭司后二选一 + 黑曜石捷径 + 隐藏熔炉密室
// 永霜墓穴：南北双线 + 4 盏魂灯开骑士团大厅 + 维瑟拉死后冰湖冻结改道 + 隐藏冰封书库
import { RouteDef } from '../core/RaidRoute';

export const MOLTEN_ROUTE: RouteDef = {
  raid: 'molten_throne', name: '熔心王座', final: 4, order: [0, 1, 2, 3, 4],
  nodes: [
    { id: 'entry', kind: 'entry', name: '入口', x: 0, z: 0, r: 8, checkpoint: true },
    { id: 'b0', kind: 'boss', name: '熔铸者 戈拉克', x: 0, z: -48, r: 15, boss: 0 },
    { id: 'hub', kind: 'hub', name: '余烬十字厅', x: 0, z: -95, r: 10, checkpoint: true, desc: '枢纽 · 存档点 · 西翼 / 东翼任意顺序' },
    { id: 'guard', kind: 'side', name: '门卫壁龛', x: -30, z: -76, r: 7, desc: '支线精英「封印门卫」：只有 1 枚印记时，打倒它也能开封印之门' },
    { id: 'secret', kind: 'secret', name: '熔炉密室', x: -64, z: -86, r: 8, hidden: true, desc: '三个阀门按壁画顺序拉开 → 密道直通封印之门；里面有宝箱' },
    { id: 'b1', kind: 'boss', name: '双生焰灵 伊格与妮丝', x: -58, z: -132, r: 15, boss: 1, sigil: '焰之印', desc: '西翼 · 焰灵回廊' },
    { id: 'b2', kind: 'boss', name: '岩鳞巨蜥 萨穆尔', x: 58, z: -132, r: 16, boss: 2, sigil: '鳞之印', desc: '东翼 · 熔岩河道（熔岩潮汐）' },
    { id: 'river', kind: 'side', name: '河道尽头', x: 72, z: -178, r: 6, desc: '萨穆尔死后熔岩冷却，黑曜石捷径直通祭坛前' },
    { id: 'seal', kind: 'gate', name: '封印之门', x: 0, z: -150, r: 7, desc: '需要 2 枚印记，或 1 枚印记 + 击败封印门卫' },
    { id: 'b3', kind: 'boss', name: '炎誓大祭司 卡萨', x: 0, z: -200, r: 15, boss: 3 },
    { id: 'pathA', kind: 'branch', name: 'A 祭司阶梯', x: -30, z: -240, r: 8, desc: '精英多，多一个宝箱' },
    { id: 'pathB', kind: 'branch', name: 'B 熔瀑侧道', x: 30, z: -240, r: 8, desc: '熔瀑周期落下（环境伤害高），路更短' },
    { id: 'b4', kind: 'boss', name: '熔心君王 瓦尔卡兹', x: 0, z: -286, r: 17, boss: 4 },
  ],
  edges: [
    { a: 'entry', b: 'b0' },
    { a: 'b0', b: 'hub', cond: { bossDead: [0] }, door: '击败戈拉克后开启' },
    { a: 'hub', b: 'b1', kind: 'branch', name: '焰灵回廊' },
    { a: 'hub', b: 'b2', kind: 'branch', name: '熔岩河道', env: 'tide' },
    { a: 'hub', b: 'guard', kind: 'side', half: 3.5 },
    { a: 'guard', b: 'secret', kind: 'secret', half: 3 },
    { a: 'secret', b: 'seal', kind: 'secret', half: 3, cond: { flag: 'valves' }, name: '密道' },
    { a: 'hub', b: 'seal', cond: { any: [{ sigils: 2 }, { all: [{ sigils: 1 }, { elite: 'gatekeeper' }] }] }, door: '封印：2 枚印记，或 1 枚印记 + 封印门卫' },
    { a: 'b2', b: 'river', kind: 'side', env: 'tide' },
    { a: 'river', b: 'b3', kind: 'shortcut', cond: { flag: 'obsidian' }, name: '黑曜石捷径' },
    { a: 'seal', b: 'b3' },
    { a: 'b3', b: 'pathA', kind: 'branch', cond: { bossDead: [3] }, door: '击败卡萨后开启' },
    { a: 'b3', b: 'pathB', kind: 'branch', cond: { bossDead: [3] }, env: 'lavafall', door: '击败卡萨后开启' },
    { a: 'pathA', b: 'b4' },
    { a: 'pathB', b: 'b4', env: 'lavafall' },
  ],
  props: [
    { id: 'v1', kind: 'valve', node: 'secret', x: -68, z: -84, label: '阀门（左）' },
    { id: 'v2', kind: 'valve', node: 'secret', x: -64, z: -90, label: '阀门（中）' },
    { id: 'v3', kind: 'valve', node: 'secret', x: -60, z: -84, label: '阀门（右）' },
    { id: 'mural', kind: 'mural', node: 'hub', x: -6, z: -101, label: '壁画：熔炉的三道火焰' },
    { id: 'chestS', kind: 'chest', node: 'secret', x: -64, z: -82, label: '密室宝箱' },
    { id: 'chestA', kind: 'chest', node: 'pathA', x: -32, z: -244, label: '阶梯宝箱' },
  ],
  mural: [1, 2, 0],   // 中 → 右 → 左
  approach: { 0: ['entry', 'b0'], 1: ['hub', 'b1'], 2: ['hub', 'b2'], 3: ['seal', 'b3'], 4: ['pathA', 'b4'] },
  elites: [{ id: 'gatekeeper', name: '封印门卫', node: 'guard', mob: 'mt_guard' }],
  fury: [1, 2],
};

export const FROST_ROUTE: RouteDef = {
  raid: 'frost_crypt', name: '永霜墓穴', final: 4, order: [0, 1, 2, 3, 4],
  nodes: [
    { id: 'entry', kind: 'entry', name: '入口', x: 0, z: 0, r: 8, checkpoint: true },
    { id: 'b0', kind: 'boss', name: '墓穴守门人 莫戈斯', x: 0, z: -48, r: 15, boss: 0 },
    { id: 'fork', kind: 'hub', name: '岔路口', x: 0, z: -84, r: 8, checkpoint: true, desc: '北道冰柱长廊 / 南道风雪峡谷' },
    { id: 'b1', kind: 'boss', name: '霜语女巫 维瑟拉', x: -54, z: -116, r: 15, boss: 1, desc: '北道 · 冰柱长廊' },
    { id: 'b2', kind: 'boss', name: '骨龙幼体 寒脊', x: 54, z: -116, r: 16, boss: 2, desc: '南道 · 风雪峡谷（周期暴风雪）' },
    { id: 'lake', kind: 'lake', name: '冰湖', x: 0, z: -146, r: 11, desc: '维瑟拉死后湖面冻结：北道尽头和南道尽头之间直穿' },
    { id: 'north', kind: 'side', name: '北道尽头', x: -46, z: -166, r: 7, desc: '2 盏魂灯；冰柱倒下才能过' },
    { id: 'south', kind: 'side', name: '南道尽头', x: 46, z: -166, r: 7, desc: '2 盏魂灯' },
    { id: 'b3', kind: 'boss', name: '亡誓骑士团', x: 0, z: -204, r: 15, boss: 3, desc: '骑士团大厅：点亮 4 盏魂灯才开' },
    { id: 'library', kind: 'secret', name: '冰封书库', x: -40, z: -226, r: 7, hidden: true, desc: '骑士团倒下后打碎冰墙；里面有宝箱' },
    { id: 'b4', kind: 'boss', name: '永冬之王 伊瑟兰', x: 0, z: -262, r: 17, boss: 4 },
  ],
  edges: [
    { a: 'entry', b: 'b0' },
    { a: 'b0', b: 'fork', cond: { bossDead: [0] }, door: '击败莫戈斯后开启' },
    { a: 'fork', b: 'b1', kind: 'branch', name: '冰柱长廊' },
    { a: 'fork', b: 'b2', kind: 'branch', name: '风雪峡谷', env: 'blizzard' },
    { a: 'b1', b: 'north', cond: { flag: 'bridge' }, door: '断桥：打碎旁边的冰柱架桥' },
    { a: 'b2', b: 'south', env: 'blizzard' },
    { a: 'north', b: 'lake', kind: 'shortcut', cond: { flag: 'frozen' }, name: '冰湖' },
    { a: 'lake', b: 'south', kind: 'shortcut', cond: { flag: 'frozen' }, name: '冰湖' },
    { a: 'north', b: 'b3', cond: { lamps: 4 }, door: '大厅的门：点亮 4 盏魂灯' },
    { a: 'south', b: 'b3', cond: { lamps: 4 }, door: '大厅的门：点亮 4 盏魂灯' },
    { a: 'b3', b: 'library', kind: 'secret', half: 3, cond: { flag: 'icewall' }, name: '冰墙后' },
    { a: 'b3', b: 'b4', cond: { bossDead: [3] }, door: '击败骑士团后开启' },
  ],
  props: [
    { id: 'pillar', kind: 'pillar', node: 'b1', x: -50, z: -127, label: '打碎冰柱（架桥）' },
    { id: 'l1', kind: 'lamp', node: 'north', x: -50, z: -168, label: '魂灯（北 1）' },
    { id: 'l2', kind: 'lamp', node: 'north', x: -42, z: -168, label: '魂灯（北 2）' },
    { id: 'l3', kind: 'lamp', node: 'south', x: 42, z: -168, label: '魂灯（南 1）' },
    { id: 'l4', kind: 'lamp', node: 'south', x: 50, z: -168, label: '魂灯（南 2）' },
    { id: 'icewall', kind: 'icewall', node: 'b3', x: -13, z: -211, label: '冰墙（有裂纹）' },
    { id: 'chestL', kind: 'chest', node: 'library', x: -40, z: -228, label: '书库宝箱' },
  ],
  approach: { 0: ['entry', 'b0'], 1: ['fork', 'b1'], 2: ['fork', 'b2'], 3: ['south', 'b3'], 4: ['b3', 'b4'] },
};

export const RAID_ROUTES: Record<string, RouteDef> = { molten_throne: MOLTEN_ROUTE, frost_crypt: FROST_ROUTE };
