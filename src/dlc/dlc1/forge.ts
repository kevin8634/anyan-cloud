// ======================================================================
// DLC1 钟铜熔炉（40 级副本，四档难度）—— v1.2.16
// 无声钟楼地下的铸钟熔炉：当年铸出那口无舌巨钟的地方。入口 = 钟楼脚下营地西侧的铜梯（BT_WILD.dungeonGates）。
// 本体通用接口 PackManifest.dungeons（web/packdungeon.ts）：普通 / 英雄 / 史诗 / 噩梦，英雄起同步 40 级；遗物 / 异变 / 誓约 / 计时奖牌全部复用本体。
// 三个首领（2 普通 + 尾王），数值以钟楼第三 / 四 / 五层守钟者为基准，难度倍率 ×1.15 / 1.2 / 1.3 / 1.45；装等 78 / 81 / 84 / 87。
// 尾王噩梦多一道机制门槛：60% / 30% 血时「熔铸」——铜壳不可破 + 读条，20 秒内打碎 3 颗熔芯，否则团灭。
// 掉落：本体通用掉落表之外，每个首领 rollEchoDrop（回响钟纹）；噩梦尾王每周首通 1 份钟铜精炼材料（存档 dlc.dlc1.forge）。
// ======================================================================
import * as THREE from 'three';
import { sceneHang } from './lux_dlc';
import type { PackCtx, PackDungeonDef, PackDungeonBoss, WildBuildApi } from '../../core/ContentPacks';
import type { BossDef } from '../../core/BossBrain';
import { BT_ID, BT_O, BT_BOSSES } from './belltower';
import { BT_L } from './bt_basin';
import { bellGeo } from './models_bt';
import { rollEchoDrop, ECHO_DROP_TABLE } from './echomark';
import { s40Roll, s40ForgeChance } from './sets40';
import { campDressFor, campDressBind } from './plaza_dress';
import { CAMP_LAND } from './camp_land';   // fix1109 #4
import { lavaPool, lavaReset } from './forge_lava_hd';   // 11-15
import { quality } from './well_dock_hd';
import { forgeScene, forgeSceneOn } from './forge_scene';   // 11-18 熔炉重塑

export const FORGE_MAP = 'dlc1_forge';
export const FORGE_DG = 'dlc1_forge_dg';
export const FORGE_O = { x: 2700, z: -1800 };
/** 钟楼一侧的入口（局部坐标，BT_WILD.dungeonGates 用） */
export const FORGE_GATE_BT = BT_L.forgeGate;   // 11-14b 钟楼面积 ×2 后的位置
export const FORGE_ILVL: [number, number, number, number] = [78, 81, 84, 87];
export const FORGE_MUL: [number, number, number, number] = [1.15, 1.2, 1.3, 1.45];
/** 40 级同步基准 = 40 级钟楼区野怪（coast.dlcMob 在 40 级的结果：生命 3560、伤害 140） */
export const FORGE_SYNC = { level: 40, hp: 3560, dmg: 140 };
export const FORGE_MAT = { id: 'dlc1_bronze_refine', name: '钟铜精炼材料' };

// ---------------------------------------------------------------- 场地（局部坐标）
export const FG_SPOTS = { start: { x: CAMP_LAND.fg_camp.x, z: 56 + CAMP_LAND.fg_camp.z } /* fix1109 #4：原 (0,48) 在北门口围墙线上 */, b1: { x: 0, z: 18 }, b2: { x: -28, z: -14 }, b3: { x: 0, z: -46 } };
const stone = (c = 0x2a2420) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
const bronzeM = () => new THREE.MeshStandardMaterial({ color: 0x8a5a24, metalness: 0.75, roughness: 0.4, emissive: 0x2a0a00, emissiveIntensity: 0.5 });
function arena(r: number, col: number): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.5, 0.3, 28), stone(0x3a2e28)); disc.position.y = 0.05; disc.receiveShadow = true; g.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.4, 0.09, 4, 48), new THREE.MeshBasicMaterial({ color: col })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; g.add(ring);
  return g;
}
function furnace(): THREE.Group {
  // 尾王身后的大熔炉：收口的石炉 + 炉口红光 + 吊在上面的半铸成的铜钟
  const g = new THREE.Group(), st = stone(0x241c18);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 10, 10), st); body.position.y = 5; body.castShadow = true; g.add(body);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), new THREE.MeshBasicMaterial({ color: 0xff5010 })); mouth.position.set(0, 3, 6.6); g.add(mouth);
  // 11-14d Rhett：炉上吊的铜钟改用已有模型 scene_wl_well_bell（低画质 / 没模型回退程序钟）
  const glb = sceneHang('scene_wl_well_bell', { h: 4.6 }, () => null as unknown as THREE.Group);
  if (glb) { glb.position.y = 18.2; g.add(glb); }
  else { const bell = new THREE.Mesh(bellGeo(2.2, 3.6, 20), bronzeM()); (bell.material as THREE.Material).side = THREE.DoubleSide; bell.position.y = 14; g.add(bell); }
  const l = new THREE.PointLight(0xff5010, 10, 26); l.position.set(0, 4, 8); g.add(l);
  return g;
}
function moltenPool(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.75, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m;
}
function mold(): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(bellGeo(0.9, 1.5, 14), stone(0x4a3a2e)); (b.material as THREE.Material).side = THREE.DoubleSide; g.add(b);
  return g;
}
function build(api: WildBuildApi) {
  campDressFor(api, FORGE_WILD as unknown as Parameters<typeof campDressFor>[1]);   // fix1107（Rhett 10:22）：营地换倒钟广场样式（地坪 / 篝火 / 火盆 / 拾荒营场景件）
  const NEW = forgeSceneOn();   // 11-18 Rhett「全面重塑钟铜熔炉……去除 BOSS 区域地板的圆圈」（forge_scene.ts；?off=forgescene 回旧）
  if (!NEW) {
    api.add(arena(10, 0xffa040), FG_SPOTS.b1.x, FG_SPOTS.b1.z);
    api.add(arena(10, 0xff8040), FG_SPOTS.b2.x, FG_SPOTS.b2.z);
    api.add(arena(13, 0xff3010), FG_SPOTS.b3.x, FG_SPOTS.b3.z);
  }
  api.add(furnace(), 0, -66);
  let s = 41; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  lavaReset(); const lq = quality() === 'low' ? 'low' : (quality() === 'high' || quality() === 'ultra') ? 'hi' : 'mid';   // 11-15 熔岩池不规则岸线 + 流动硬壳（forge_lava_hd）
  const pools: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < 12; i++) { const x = (r() - 0.5) * 110, z = (r() - 0.5) * 110; if (Math.abs(x) < 14 && z > -60) continue; const rr = 1.5 + r() * 2.5; pools.push({ x, z, r: rr * 1.6 }); api.add(new URLSearchParams(location.search).get('off')?.includes('lava') ? moltenPool(rr) : lavaPool(rr, i + 3, lq), x, z, r() * 6.28); }
  if (!NEW) { for (let i = 0; i < 10; i++) { const x = (r() - 0.5) * 100, z = (r() - 0.5) * 100; if (Math.abs(x) < 16) continue; api.add(mold(), x, z, r() * 3); } return; }
  forgeScene(api, { path: FORGE_WILD.paths[0].map(([x, z]) => ({ x, z })), arenas: [{ ...FG_SPOTS.b1, r: 10 }, { ...FG_SPOTS.b2, r: 10 }, { ...FG_SPOTS.b3, r: 13 }],
    keep: [...pools, { x: 0, z: 56, r: 12.5 }, { x: 0, z: -66, r: 9 }], half: FORGE_WILD.half, trash: FORGE_TRASH_AT,
    b1: FG_SPOTS.b1, b2: FG_SPOTS.b2, b3: FG_SPOTS.b3, furnace: { x: 0, z: -74 } });   // 烟囱在熔炉正后方（炉顶吊着钟）
}
export const FORGE_WILD = {
  id: FORGE_MAP, name: '钟铜熔炉', levels: [40, 40], minLevel: 40, desc: '无声钟楼地下 · 40 级副本 · 三个首领 · 四难度（从钟楼脚下的铜梯进入）',
  origin: FORGE_O, half: 70,
  worldNode: { x: 0.56, y: 0.76 }, sandIcon: '钟铜熔炉',
  palette: { sky: 0x1a0c08, fog: 0x2a120a, fogNear: 30, fogFar: 130, hemi: 0xe0b090, ground: 0x1c1410, hemiI: 1.5, sun: 1.6, sunColor: 0xffc080,
    tA: 0x4a3a30, tB: 0x34281e, path: 0x5a4632, cliff: 0x140e0a, tex: ['rock', 'dirt', 'rock'], map: ['#3a2216', '#120a06'], grass: 0, music: 'bell' },
  scatter: [
    { kind: 'mesa', n: 16, r: 3.4, s: [1.2, 2.2], color: 0x140e0a, edge: true },
    { kind: 'obsidian', n: 20, r: 0.9, s: [0.6, 1.4], color: 0x2a1e18 },
  ],
  camps: [{ id: 'fg_camp', name: '熔炉入口', x: 0, z: 56, r: 10, main: true, waypoint: { x: 5.2, z: 60.2 } }],   // 11-14 Rhett 图三：传送阵挪离栅栏（避开熔炉侧篝火 4,56）,
  gates: [{ to: BT_ID, x: 0, z: 66, name: '回无声钟楼的铜梯', arrive: { x: FORGE_GATE_BT.x, z: FORGE_GATE_BT.z + 7 } }],
  spots: { fg_entry: { x: 0, z: 52, r: 10, name: '熔炉入口' }, fg_b1: { x: 0, z: 18, r: 12, name: '浇铸台' }, fg_b2: { x: -28, z: -14, r: 12, name: '冷却池' }, fg_b3: { x: 0, z: -46, r: 15, name: '炉心' } },
  paths: [[[0, 66], [0, 18], [-14, 2], [-28, -14], [-12, -30], [0, -46]]],
  // 11-18 Rhett「铜钟熔炉删掉箭头的篝火」：营地中心已有换装石圈 + 火舌，传送阵旁这个本体篝火（4,56）删掉；?off=forgefire 回来
  decor: [...(/(?:[?&]off=[^&]*\bforgefire\b)/.test(typeof location !== 'undefined' ? location.search : '') ? [{ kind: 'fire', x: 4, z: 56 }] : []), { kind: 'crate', x: -6, z: 58 }],
  npcs: [], mobs: {}, packs: [],
  build,
};

/** 11-18 小怪组位置（forge_scene 第 9 章掩体用；与 FORGE_DUNGEON.trash 同步） */
const FORGE_TRASH_AT = [{ x: -4, z: 34 }, { x: 4, z: 34 }, { x: -18, z: -32 }, { x: -12, z: 4 }, { x: -16, z: 0 }, { x: -8, z: -32 }];
// ---------------------------------------------------------------- 首领
const cfg = (dmg: number, speed: number, range: number, interval: number) => ({ aggroRange: 14, attackRange: range, attackDamage: dmg, attackInterval: interval, moveSpeed: speed, leashRange: 34, patrolRadius: 0 });
const ref = (key: string) => BT_BOSSES.find(b => b.key === key)!.mob;
type Mob = PackDungeonBoss['mob'];
const bossMob = (name: string, model: string, refKey: string, o: Partial<Mob>): Mob => { const r = ref(refKey);
  return { name, level: 40, model, hp: r.hp, dmg: r.dmg as number, interval: 2.3, speed: 3, aggro: 14, range: 3.6, xp: 6000, ilvl: 84, leash: 34, elite: true, loot: 'raid_boss' /* fix1108c #2：钟井掉落表装好后由 forgeUseNewLoot 换成 forge_boss（= raid_boss + 新 40 级橙装）；没装上就保持原表 */, ...o }; };
const add = (name: string, model: string, hp: number, dmg: number, o: Record<string, unknown> = {}) => ({ name, level: 40, model, hp, dmg, interval: 2, speed: 3.6, aggro: 18, range: 2.4, xp: 140, ilvl: 80, ...o });

const B1: PackDungeonBoss = { key: 'fg_b1', name: '钟铜傀儡王', ...FG_SPOTS.b1, theme: 'fire', tip: '红圈躲开，「浇铸」读条可以打断；二阶段先清傀儡',
  mob: bossMob('铸模者 · 钟铜傀儡王', 'dlc1_bronze_puppet', 'bt_b3', { hp: 258000 /* fix1108b #1 原沿用 bt_b3 46000 */, scale: 2.3, speed: 2.8, range: 3.8 }),
  adds: { fg_add_puppet: add('熔铜傀儡', 'dlc1_bronze_puppet', 3200, 72, { tint: 0xc06020, tintK: 0.4 }) },
  yells: { spawn: '浇铸台上的傀儡王抬起了铸模做的手：「钟……还没铸完。」', death: '傀儡王碎成了一地铜模。' },
  boss: { name: '钟铜傀儡王', config: cfg(160, 2.8, 3.8, 2.5), globalCooldown: 3.4,
    abilities: [
      { id: 'hammer', kind: 'groundSlam', name: '熔铜锤', cooldown: 10, telegraph: 1.5, radius: 6, damage: 250, element: 'fire', atSelf: true },
      { id: 'pour', kind: 'cast', name: '浇铸', cooldown: 15, castTime: 2.2, damage: 190, element: 'fire', effect: { type: 'stun', duration: 1.5 }, lockout: 2.5 },
      { id: 'slag', kind: 'poisonZone', name: '铜水', cooldown: 13, radius: 3.4, duration: 8, dps: 75, element: 'fire', count: 3, spread: 7 },
      { id: 'mold', kind: 'summon', name: '唤醒熔铜傀儡', cooldown: 26, count: 2, unit: 'fg_add_puppet' },
    ],
    phases: [
      { name: '第一阶段 · 铸模', hpBelow: 1, abilities: ['hammer', 'pour'] },
      { name: '第二阶段 · 浇铸', hpBelow: 0.5, abilities: ['hammer', 'pour', 'slag', 'mold'], damageMul: 1.2, onEnter: 'mold', yell: '……再铸一口……' },
    ] } as BossDef };
const B2: PackDungeonBoss = { key: 'fg_b2', name: '无声的锻师', ...FG_SPOTS.b2, theme: 'fire', tip: '「淬火」减速很重，站在冷却池外；地上的余烬圈尽早离开',
  mob: bossMob('炉前修士 · 无声的锻师', 'dlc1_silent_monk', 'bt_b4', { hp: 265000 /* fix1108b #1 原沿用 bt_b4 50000 */, scale: 2.0, speed: 3.4, tint: 0xff6020, tintK: 0.45, glow: 0x3a1000 }),
  adds: { fg_add_monk: add('炉前学徒', 'dlc1_silent_monk', 2800, 66, { scale: 0.9, tint: 0xa04010, tintK: 0.4, speed: 4 }) },
  yells: { spawn: '锻师把锤子浸进了冷却池。水没有一点声音。', death: '锻师的锤子沉进池底，水面终于起了一圈波纹。' },
  boss: { name: '无声的锻师', config: cfg(165, 3.4, 3.4, 2.3), globalCooldown: 3.2,
    abilities: [
      { id: 'quench', kind: 'cast', name: '淬火', cooldown: 14, castTime: 2.0, damage: 170, element: 'frost', effect: { type: 'slow', percent: 0.5, duration: 4 }, lockout: 3 },
      { id: 'ember', kind: 'poisonZone', name: '余烬', cooldown: 12, radius: 3.4, duration: 8, dps: 78, element: 'fire', count: 3, spread: 8 },
      { id: 'anvil', kind: 'groundSlam', name: '砧响', cooldown: 11, telegraph: 1.4, radius: 5, damage: 230, element: 'physical', count: 2, spread: 6 },
      { id: 'pupils', kind: 'summon', name: '召来学徒', cooldown: 26, count: 3, unit: 'fg_add_monk' },
    ],
    phases: [
      { name: '第一阶段 · 淬火', hpBelow: 1, abilities: ['quench', 'ember', 'anvil'] },
      { name: '第二阶段 · 群锻', hpBelow: 0.45, abilities: ['quench', 'ember', 'anvil', 'pupils'], damageMul: 1.2, onEnter: 'pupils', yell: '（锤声一下一下，却没有一点声音）' },
    ] } as BossDef };
const B3: PackDungeonBoss = { key: 'fg_b3', name: '钟母', ...FG_SPOTS.b3, theme: 'fire', tip: '尾王：三阶段越来越快；噩梦难度 60% / 30% 血「熔铸」——铜壳不可破，20 秒内打碎 3 颗熔芯',
  mob: bossMob('钟母 · 熔炉之心', 'dlc1_bell_colossus', 'bt_b5', { hp: 274000 /* fix1108b #1 原沿用 bt_b5 56000 */, scale: 1.9, speed: 2.6, range: 4.2, tint: 0xa03010, tintK: 0.5, glow: 0x601000, xp: 9000, loot: 'raid_final' /* fix1108c #2 装表后换 forge_final */ }),
  adds: { fg_add_slag: add('熔渣钟童', 'golem', 3400, 76, { tint: 0x6a2a10, tintK: 0.5, glow: 0x3a1000 }) },
  yells: { spawn: '熔炉里站起来一口没有冷却的钟。它在发烫，也在发声——是你听过的那声钟响。', death: '钟母裂开了。熔炉的火，第一次熄了。' },
  gate: { diffs: ['nightmare'], at: [0.6, 0.3], time: 20, name: '熔铸', tip: '铜壳合上了，不可破——打碎周围 3 颗熔芯，否则全场熔毁',
    core: { name: '熔芯', model: 'golem', n: 3, hpK: 2.5, r: 7, tint: 0xff5010, scale: 0.6 } },
  boss: { name: '钟母', config: cfg(175, 2.6, 4.2, 2.4), globalCooldown: 3,
    abilities: [
      { id: 'toll', kind: 'groundSlam', name: '熔钟震', cooldown: 10, telegraph: 1.6, radius: 7, damage: 270, element: 'fire', atSelf: true },
      { id: 'drip', kind: 'poisonZone', name: '滴铜', cooldown: 12, radius: 3.4, duration: 10, dps: 85, element: 'fire', count: 3, spread: 9 },
      { id: 'hum', kind: 'cast', name: '钟鸣', cooldown: 16, castTime: 2.4, damage: 230, element: 'arcane', effect: { type: 'stun', duration: 1.5 }, lockout: 2.5 },
      { id: 'cast', kind: 'groundSlam', name: '铸痕', cooldown: 9, telegraph: 1.3, radius: 4.5, damage: 240, element: 'fire', count: 3, spread: 8 },
      { id: 'kids', kind: 'summon', name: '熔渣钟童', cooldown: 24, count: 3, unit: 'fg_add_slag' },
    ],
    phases: [
      { name: '第一阶段 · 余温', hpBelow: 1, abilities: ['toll', 'hum'] },
      { name: '第二阶段 · 熔流', hpBelow: 0.65, abilities: ['toll', 'hum', 'drip', 'cast'], damageMul: 1.15, yell: '……当……（钟声是烫的）' },
      { name: '第三阶段 · 铸成', hpBelow: 0.3, abilities: ['toll', 'hum', 'drip', 'cast', 'kids'], damageMul: 1.3, onEnter: 'kids', yell: '它要把自己铸成一口新钟。' },
    ] } as BossDef };
export const FORGE_BOSSES = [B1, B2, B3];

// ---------------------------------------------------------------- 掉落钩子 / 存档
let ctx: PackCtx | null = null;
export const bindForge = (c: PackCtx) => { ctx = c; };
/** fix1108c #2：钟井掉落表（含 forge_boss / forge_final）动态装好后调用；表不存在就不换，避免结算掉落时读空表 */
export const forgeUseNewLoot = (tables: Record<string, unknown>) => {
  if (tables.forge_boss) { B1.mob.loot = 'forge_boss'; B2.mob.loot = 'forge_boss'; }
  if (tables.forge_final) B3.mob.loot = 'forge_final';
};
let S: { mats: number; week: number | null; clears: Record<string, number> } = { mats: 0, week: null, clears: {} };
export function forgeLoad(d: unknown) {
  const o = (d && typeof d === 'object' ? d : {}) as Partial<typeof S>;
  S = { mats: Math.max(0, Number(o.mats) || 0), week: typeof o.week === 'number' ? o.week : null, clears: { ...(o.clears ?? {}) } };
  log.length = 0;
}
export const forgeSave = () => (S.mats || S.week !== null || Object.keys(S.clears).length ? { mats: S.mats, week: S.week, clears: { ...S.clears } } : null);
/** 测试用：每次首领倒下的钟纹掉落钩子记录 */
const log: { i: number; last: boolean; diff: string; echo: string | null; s40?: string | null }[] = [];
let rng: () => number = Math.random;
export const forgeSetRng = (f: (() => number) | null) => { rng = f ?? Math.random; };
function onBossDown(i: number, last: boolean, diff: string) {
  const echo = rollEchoDrop(last, diff, rng);
  const p = ctx?.playerPos(), s40 = p ? s40Roll(s40ForgeChance(diff, last), p.x, p.z, rng) : null;   // 11-05 40 级职业套装（规格 §8，英雄起）
  log.push({ i, last, diff, echo, s40 });
}
function onComplete(o: { diff: string; sec: number; week: number }) {
  S.clears[o.diff] = (S.clears[o.diff] ?? 0) + 1;
  if (o.diff === 'nightmare' && S.week !== o.week) {
    S.week = o.week; S.mats++;
    ctx?.toast(`噩梦每周首通：${FORGE_MAT.name} ×1（共 ${S.mats}）`, '#ffb040');
    ctx?.banner?.({ big: FORGE_MAT.name, small: '钟铜熔炉 · 噩梦 · 本周首通', theme: 'gold', ms: 2600 });
  }
  ctx?.save();
}
export const forgeDebug = () => ({ ...S, clears: { ...S.clears }, log: log.map(x => ({ ...x })) });

const pct = (p: number) => `${Math.round(Math.min(1, p) * 100)}%`;
export const FORGE_DUNGEON: PackDungeonDef = {
  id: FORGE_DG, name: '钟铜熔炉', theme: 'fire',
  desc: '40 级副本 · 无声钟楼地下的铸钟熔炉 · 3 个首领 · 四难度（英雄起同步 40 级）',
  map: FORGE_MAP, origin: FORGE_O, start: FG_SPOTS.start, exit: { map: BT_ID, x: BT_O.x + FORGE_GATE_BT.x, z: BT_O.z + FORGE_GATE_BT.z + 7 },
  minLevel: 40, syncLevel: FORGE_SYNC.level, syncHp: FORGE_SYNC.hp, syncDmg: FORGE_SYNC.dmg,
  ilvl: FORGE_ILVL, mul: FORGE_MUL, bosses: FORGE_BOSSES,
  trash: [
    { kind: 'puppet', mob: { name: '熔铜傀儡', model: 'dlc1_bronze_puppet', hp: 4400, dmg: 140, interval: 2, speed: 3, range: 2.6, aggro: 11, xp: 220, tint: 0xc06020, tintK: 0.35, loot: 'trash_ember' },
      at: [{ x: -4, z: 34 }, { x: 4, z: 34 }, { x: -18, z: -32 }] },
    { kind: 'monk', mob: { name: '炉前学徒', model: 'dlc1_silent_monk', hp: 3900, dmg: 140, interval: 1.8, speed: 3.6, range: 2.2, aggro: 11, xp: 200, tint: 0xa04010, tintK: 0.35, loot: 'trash_ember' },
      at: [{ x: -12, z: 4 }, { x: -16, z: 0 }, { x: -8, z: -32 }] },
  ],
  guard: 'puppet',
  drops: (diff, ilvl) => {
    const k = ECHO_DROP_TABLE.diffK[diff] ?? 1;
    const rand = { name: '随机史诗 / 传说装备（首领掉落表）', quality: 'purple', chance: `装等 ${ilvl}`, tip: '每个首领 2–3 件史诗起，饰品 / 披风必有一件' };
    const echo = (p: number) => ({ name: '回响钟纹（本职业未拥有）', quality: 'orange', chance: pct(p * k), tip: '第 8 技能格（G）的技能物品' });
    const s40 = (last: boolean) => { const c = s40ForgeChance(diff, last); return c > 0 ? [{ name: '40 级职业套装（本职业，6 件）', quality: 'purple', chance: pct(c), tip: '每套独立保底：连空 3 次只掉缺的件，6 次必掉' }] : []; };
    const out = FORGE_BOSSES.map((b, i) => { const last = i === FORGE_BOSSES.length - 1; return { title: `首领 ${i + 1} · ${b.name}`, rows: [rand, echo(last ? ECHO_DROP_TABLE.last : ECHO_DROP_TABLE.boss), ...s40(last)] }; });
    if (diff === 'nightmare') out.push({ title: '噩梦 · 每周首通', rows: [{ name: FORGE_MAT.name, quality: 'orange', chance: '每周 1 份', tip: '尾王「熔铸」机制门槛：打碎 3 颗熔芯' }] });
    return out;
  },
  onBossDown, onComplete,
};

campDressBind([FORGE_MAP]);   // fix1107 营地帐篷 / 货箱 / 栅栏桩换写实件（同镜渊城）
