// v0.9.7 DLC 框架自动测试：内容包注册表 / 授权 / 等级上限 / 数据表合并 / 存档兼容（DLC → 本体读写 → DLC 无损往返）
// 用法：npm run packs（= tsc && node dist/simPacks.js）
import { packs, hasPack, registerPack, withPacks, withPackRecord, packList, levelCapDelta, stackPack, _resetPacksForTest, PackManifest, bindPacks, runStoryHooks, packCtx } from './core/ContentPacks';
import { Entitlement, installPack, steamOwns } from './core/Entitlement';
import { Progression, MAX_LEVEL, ENDGAME_LEVEL, maxLevel } from './core/TalentTree';
import { ENDGAME, endgameIlvl, bandIlvl, packIlvl, bandMonsterLevel, BAND } from './core/EndgameIlvl';
import { SaveManager, SaveStorage, GameSave, hashText } from './core/SaveManager';
import { Roster } from './core/Roster';
import { Inventory } from './core/Inventory';
import { ItemInstance, LootGenerator } from './core/Loot';
import { applyPackCompat, carrySave, mergeDlcField, splitBank, PackEnv, PackGameSave } from './core/PackSave';
import { QUESTS } from './data/quests';
import { LEGENDARIES, LOOT_DATA } from './data/loot';
import { CLASSES, isClassAvailable } from './data/classes';
import { MAPS, isKnownMap } from './data/world_map';
import { ACHIEVEMENTS } from './data/achievements';
import { DLC1 } from './dlc/dlc1/manifest';

declare const require: { (m: string): unknown; cache: Record<string, unknown>; resolve(m: string): string };
let failed = 0, passed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (ok) passed++; else failed++; };
const mem = () => { const m = new Map<string, string>(); const s: SaveStorage = { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k), keys: () => [...m.keys()] }; return { m, s }; };
const fp = (o: unknown) => hashText(JSON.stringify(o, (_k, v) => (typeof v === 'function' ? String(v) : v)));
/** 键顺序无关的深比较（JSON 规范化后比） */
const norm = (o: unknown): unknown => Array.isArray(o) ? o.map(norm) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, norm((o as Record<string, unknown>)[k])]).filter(([, v]) => v !== undefined)) : o;
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ====================================================================== 1. 没有内容包：和 v0.9.6g 完全等价
console.log('\n=== 1. 没有内容包：与 v0.9.6g 等价');
// v0.9.6g（tag v0.9.6g / HEAD 0d27b65）同一算法算出的数据表指纹（v1.2.35 低血 / 重置特效重做后重算）；v1.2.56 剑刃风暴引导 / 暴风雪瞬发技能描述更新后重算 classes；v1.2.66 天赋补位节点专属化后重算 classes；v1.2.73 报告 5.2 数值（暴风雪/奥术风暴/英勇跳跃/剑刃风暴）后重算 classes
const BASE_FP = { quests: '3e5ab078', legendaries: '64e392e8', fixed: '64e706b9', classes: '5a3e4c59', maps: '0637be37', ach: '1b9fa8e9' };
check(packs().length === 0 && !hasPack('dlc1') && levelCapDelta() === 0, '注册表为空，hasPack(dlc1) = false');
check(!Entitlement.has('dlc1') && Entitlement.buildList().length === 0 && steamOwns('dlc1') === null, '授权：构建列表为空、Steam 桩返回 null → 没有 dlc1');
check(maxLevel() === 30 && MAX_LEVEL === 30 && ENDGAME_LEVEL === 30 && new Progression().maxLevel === 30, `等级上限 maxLevel() = ${maxLevel()}，MAX_LEVEL = ENDGAME_LEVEL = 30`);
check(fp(QUESTS) === BASE_FP.quests && QUESTS.length === 80, `任务表 ${QUESTS.length} 条，指纹 ${fp(QUESTS)} = v0.9.6g`);
check(fp(LEGENDARIES) === BASE_FP.legendaries && LOOT_DATA.legendaries === LEGENDARIES, `橙装表 ${LEGENDARIES.length} 条，指纹 = v0.9.6g`);
check(fp(LOOT_DATA.fixedItems) === BASE_FP.fixed, `固定装备 ${LOOT_DATA.fixedItems.length} 件，指纹 = v0.9.6g`);
check(fp(CLASSES) === BASE_FP.classes && Object.keys(CLASSES).join() === 'warrior,mage,chrono,alchemy', `职业表 4 个，指纹 ${fp(CLASSES)} = v0.9.6g`);
check(fp(MAPS) === BASE_FP.maps && Object.keys(MAPS).length === 10, '区域表 10 个，指纹 = v0.9.6g');
check(fp(ACHIEVEMENTS) === BASE_FP.ach && ACHIEVEMENTS.length === 69, `成就 ${ACHIEVEMENTS.length} 个，指纹 = v0.9.6g`);
{ const a = [1, 2]; check(withPacks(a, 'raids') === a && withPackRecord({ x: 1 }, 'classes').x === 1 && packList('ui').length === 0, 'withPacks / withPackRecord 没有包时返回原引用'); }
{
  const p = new Progression(); p.load({ level: 30, xp: 999 });
  check(p.level === 30 && p.xp === 0 && same(p.save(), { level: 30, xp: 0 }) && p.addXp(1e6) === 0, '30 级读档 / 存档 / 满级不涨经验，与旧版一致');
  const q = new Progression(); q.load({ level: 12, xp: 77 });
  check(q.held === null && same(q.save(), { level: 12, xp: 77 }), '30 级以下读写不变');
  const xs = [1, 10, 11, 20, 29].map(l => q.xpToNext(l));
  check(xs.join() === '100,460,520,2860,8440', `经验曲线 1/10/11/20/29 级 = ${xs.join(' / ')}（与旧公式一致）`);
}
{
  // 本体存档（没有任何包字段）走一遍兼容处理：一个字段都不改、不新增
  const s = { version: 10, savedAt: 1, classId: 'mage', inventory: { gold: 5, bag: [{ id: 'a', name: 'x', slot: 'head' }], equipped: { chest: { id: 'b', name: 'y', slot: 'chest' } }, stacks: { potion_s: 2, 'set:fury3': 1 } }, level: { level: 20, xp: 5 }, talents: {}, quests: { active: {}, done: [] }, map: 'frost', pos: { x: 1, z: 2 } } as unknown as PackGameSave;
  const before = JSON.stringify(s);
  const r = applyPackCompat(s, { hasPack, knownMap: isKnownMap, knownClass: isClassAvailable, bagCap: 30 });
  check(JSON.stringify(s) === before && !r.sealed && !r.parked && !r.classLocked, '本体存档兼容处理：原样不动（含带冒号的本体材料 set:fury3）');
  const fresh = { classId: 'mage', level: { level: 20, xp: 5 } };
  check(carrySave(null, fresh) === fresh && carrySave({ classId: 'x', level: 1, version: 10, savedAt: 2, sum: 'z', notices: ['n'], bank: [] }, fresh) === fresh, 'carrySave：旧存档没有多余字段 → 原样返回新内容（不写 notices / bank / 存档头）');
  check(mergeDlcField(undefined, {}) === undefined, '没有包也没有 dlc 字段 → 不写 dlc');
}

// ====================================================================== 2. 等级 >30 的存档在本体：运行时 30，写回原值
console.log('\n=== 2. 本体读 35 级存档');
{
  const p = new Progression(); p.load({ level: 35, xp: 1234 });
  check(p.level === 30 && p.xp === 0 && p.maxLevel === 30, `运行时按 ${p.level} 级生效（上限 ${p.maxLevel}）`);
  check(p.addXp(5000) === 0 && p.level === 30, '本体里不会继续升级');
  check(same(p.save(), { level: 35, xp: 1234 }) && p.savedLevel === 35, `写回存档：${JSON.stringify(p.save())}（原等级和经验都保留）`);
  check(endgameIlvl(10, 'blue', p.level, 44) === 44 && ENDGAME.level === 30, '终局规则（30 级起固定装等）照常生效');
  const fixed = new Progression(30); fixed.load({ level: 35, xp: 1 });
  check(fixed.maxLevel === 30 && fixed.level === 30, 'new Progression(30) 固定上限的旧用法不变');
}

// ====================================================================== 3. 授权 + 注册 dlc1：上限 40
console.log('\n=== 3. 注册 dlc1（空骨架）');
{
  _resetPacksForTest();   // v1.0.1：dlc1 有了 skills 挂载（技能书在模块加载时已读过），这里清掉冻结标记再测注册
  check(installPack(DLC1) === false && !hasPack('dlc1'), '没有授权时 installPack 不注册');
  Entitlement.grantForTest('dlc1');
  check(Entitlement.has('dlc1') && installPack(DLC1) === true && hasPack('dlc1') && installPack(DLC1) === false, '授权后注册成功，重复注册忽略');
  check(packs().map(p => p.id).join() === 'dlc1' && DLC1.name === '沉钟之海' && DLC1.levelCapDelta === 10, 'dlc1 清单：名「沉钟之海」、levelCapDelta 10');
  check(maxLevel() === 40 && MAX_LEVEL === 30 && ENDGAME_LEVEL === 30, `等级上限 maxLevel() = ${maxLevel()}；本体终局门槛 MAX_LEVEL 仍 30`);
  const p = new Progression(); p.load({ level: 35, xp: 1234 });
  check(p.maxLevel === 40 && p.level === 35 && p.xp === 1234 && p.held === null, 'DLC 下 35 级原样读入');
  const xs = [30, 31, 35, 39].map(l => p.xpToNext(l));
  check(xs.join() === '11110,12650,20240,30430', `v0.9.9 31–40 级经验曲线（原公式 × 1.2~1.65）：30/31/35/39 级升级需要 ${xs.join(' / ')}`);
  { let tot = 0; for (let l = 30; l < 40; l++) tot += p.xpToNext(l); const base = p.totalXpFor(30); check(tot > base && tot < base * 3.5, `30→40 共需 ${tot} 经验（1→30 共 ${base}）`); }
  const q = new Progression(); q.load({ level: 30, xp: 0 }); q.addXp(11109); const q29 = q.level; q.addXp(1);
  check(q29 === 30, '30 级差 1 点经验不升级');
  check(q.level === 31, '30 级可以继续升到 31');
  const top = new Progression(); top.load({ level: 40, xp: 5 });
  check(top.level === 40 && top.xp === 0 && top.addXp(1e6) === 0, '40 级 = 新满级，不再涨经验');
  check(endgameIlvl(10, 'blue', 35, 44) === 44 && endgameIlvl(10, 'blue', 29, 44) === 10, '30 级起终局装等规则不因上限变 40 而失效');
  check(DLC1.storyHooks?.length === 5 && packList('storyHooks').length === 5 && packList('quests').length === 39, 'dlc1 挂载：5 条剧情钩子（占位 + 第七章引子 ×2 + 钟楼对话 + v1.2.54 评委面板）、入口 7-0 + 第七章 6 + 第八章 16 + 第九章 16 个任务（v1.2.71 +7-0 余音）（v1.1.1：A 线 +3 领地任务；v1.1.2：B 线 +3 渊噬之躯任务）');
  withPacks([], 'quests');   // 上面清过冻结标记：模拟任务表已经读取过
  let late = '';
  try { registerPack({ id: 'late_pack', name: '迟到', quests: [{ id: 'q_late' }] }); } catch (e) { late = String(e); }
  check(late.includes('注册太晚') && !hasPack('late_pack'), '数据表已读取后再注册带任务的包 → 报错「注册太晚」，不会悄悄不生效');
}

// ====================================================================== 4. 数据表合并（测试包，先注册再加载数据模块）
console.log('\n=== 4. 挂载点：测试包合并进各数据表');
{
  _resetPacksForTest();
  const TEST: PackManifest = {
    id: 'tpack', name: '测试包', levelCapDelta: 5,
    quests: [{ id: 'tq_1', name: '测试任务', giver: 'bran', turnIn: 'bran', minLevel: 31, text: '', doneText: '', objectives: [], reward: { xp: 1, gold: 1 } }],
    items: [{ id: 'tp_item', name: '测试固定装', slot: 'chest', quality: 'orange', baseId: 'b_chest', modifiers: [] }],
    legendaries: [{ id: 'tp_lg', name: '测试橙装', slots: ['chest'], cls: 'warrior', modifier: { id: 'tp_lg', name: '测试', source: 'equipment', priority: 20, desc: '测试', match: {}, ops: [] } }],
    classes: { tclass: { id: 'tclass', name: '测试职业' }, warrior: { id: 'warrior', name: '冒名战士' } },
    zones: [{ id: 'tzone', name: '测试海岸', kind: 'outdoor', levels: '31-35', view: { x0: 0, z0: 0, x1: 10, z1: 10 }, desc: '' }],
    achievements: [{ id: 'tp_ach', cat: 'grow', name: '测试成就', desc: '', stat: 'level', n: 35, pts: 10 }],
    waypoints: [{ id: 'tp_wp', name: '测试传送', desc: '', zone: 'tzone', go: () => undefined }],
  };
  check(registerPack(TEST) && maxLevel() === 35, `重置后注册测试包：上限 ${maxLevel()}`);
  // 重新加载数据模块（让它们在包注册之后求值，等同浏览器里 boot 先于主模块）
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
  const Q = (require('./data/quests') as { QUESTS: typeof QUESTS }).QUESTS;
  const L = require('./data/loot') as { LEGENDARIES: typeof LEGENDARIES; LOOT_DATA: typeof LOOT_DATA };
  const C = require('./data/classes') as { CLASSES: Record<string, { name: string }>; isClassAvailable: typeof isClassAvailable };
  const W = require('./data/world_map') as { MAPS: Record<string, { name: string }>; isKnownMap: typeof isKnownMap; packZone: (id: string) => unknown };
  const A = (require('./data/achievements') as { ACHIEVEMENTS: typeof ACHIEVEMENTS; achDef: (id: string) => unknown });
  check(Q.length === 81 && Q[80].id === 'tq_1' && fp(Q.slice(0, 80)) === BASE_FP.quests, '任务：本体 80 条不变 + 1 条包任务');
  check(L.LEGENDARIES.length === 97 && L.LEGENDARIES[96].pack === 'tpack' && fp(L.LEGENDARIES.slice(0, 96)) === BASE_FP.legendaries && L.LOOT_DATA.legendaries === L.LEGENDARIES, '橙装：+1，自动打 pack 标记，本体部分不变');
  check(L.LOOT_DATA.fixedItems.length === 166 && L.LOOT_DATA.fixedItems[165].pack === 'tpack' && (TEST.items![0] as { pack?: string }).pack === undefined, '固定装备：+1 带 pack 标记（不改包里的原对象）');
  check(Object.keys(C.CLASSES).length === 5 && C.CLASSES.tclass.name === '测试职业' && C.CLASSES.warrior.name === '战士' && C.isClassAvailable('tclass'), '职业：+1；包不能覆盖本体职业（warrior 仍是战士）');
  check(W.isKnownMap('tzone') && W.MAPS.tzone.name === '测试海岸' && Object.keys(W.MAPS).length === 11 && !!W.packZone('tzone') && !W.packZone('camp'), '区域：+1（isKnownMap / packZone）');
  check(A.ACHIEVEMENTS.length === 70 && !!A.achDef('tp_ach'), '成就：+1，achDef 能查到');
  check(packList('waypoints').length === 1, '传送阵入口：1 个');
  const gen = new LootGenerator(L.LOOT_DATA); gen.classId = 'warrior';
  const it = gen.generateFixed('tp_item', 30), lg = gen.generateLegendary('tp_lg', 30);
  check(it?.pack === 'tpack' && lg?.pack === 'tpack', `包物品生成后带 pack 标记（固定装 ${it?.pack} / 橙装 ${lg?.pack}）`);
  const base = gen.generate(20, 'blue');
  check(base.pack === undefined && !('pack' in base), '本体物品没有 pack 字段');
  _resetPacksForTest();
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
}

// ====================================================================== 5. 存档往返：DLC → 本体读写 → DLC 读，不丢任何东西
console.log('\n=== 5. 存档往返：DLC → 本体 → DLC');
{
  const item = (id: string, slot: string, pack?: string): ItemInstance => ({ id, name: `物品${id}`, slot, quality: pack ? 'orange' : 'blue', baseId: 'b_chest', itemLevel: 40, hp: 10, armor: 5, lines: ['l'], sellPrice: 1, modifiers: [], ...(pack ? { pack, lgId: 'dlc1_lg_x' } : {}) } as unknown as ItemInstance);
  const DLC_SAVE = {
    classId: 'warrior', name: '潮声', look: 1, playMs: 1000,
    inventory: { gold: 777, bag: [item('b1', 'head'), item('d1', 'legs', 'dlc1'), item('b2', 'ring')], equipped: { chest: item('d0', 'chest', 'dlc1'), head: item('b0', 'head') }, stacks: { potion_s: 3, '@dlc1:mat_bell': 5, 'set:fury3': 1 } },
    level: { level: 35, xp: 1234 }, talents: {}, quests: { active: {}, done: ['q_wolves'] },
    map: 'dlc1_shore', pos: { x: 12.5, z: -40.3 },
    dlc: { dlc1: { v: 1, bells: [1, 2, 3] } },
    futureField: { a: 1, b: [2] },
  };
  const DLC_ZONES = new Set(['dlc1_shore']);
  const bagCap = 30;
  const envBase: PackEnv = { hasPack, knownMap: isKnownMap, knownClass: isClassAvailable, bagCap };
  const envDlc: PackEnv = { hasPack, knownMap: id => isKnownMap(id) || DLC_ZONES.has(id), knownClass: id => isClassAvailable(id) || id === 'dlc1_hunter', bagCap };
  /** 模拟一次「读档 → 游戏运行 → 存档」：兼容处理 + 等级 / 背包走真实的 core 类 + 未知字段原样带回 */
  const session = (sm: SaveManager, env: PackEnv, now: number, tweak?: (fresh: Record<string, unknown>) => void) => {
    const s = sm.loadResult().save as PackGameSave;
    const rep = applyPackCompat(s, env);
    const prog = new Progression(); prog.load(s.level);
    const inv = new Inventory(bagCap); inv.load(s.inventory);
    const mine: Record<string, unknown> = {};
    for (const p of packs()) if (p.saveData) { p.loadData?.(s.dlc?.[p.id]); mine[p.id] = p.saveData(); }
    const fresh: Record<string, unknown> = { classId: s.classId, name: s.name, look: s.look, playMs: s.playMs, inventory: inv.save(), level: prog.save(), talents: s.talents, quests: s.quests, map: s.map ?? 'camp', pos: s.pos ?? { x: 1, z: 2 } };
    tweak?.(fresh);
    const dlc = mergeDlcField(s.dlc, mine);
    sm.save(carrySave(s, dlc ? { ...fresh, dlc } : fresh) as unknown as GameSave, now);
    return { rep, prog, inv, s };
  };

  // 对照组：DLC 读 → DLC 写（不经过本体）
  _resetPacksForTest(); Entitlement.grantForTest('dlc1'); installPack(DLC1);
  const ctl = mem(); const smC = new SaveManager(ctl.s, 'c', LOOT_DATA); smC.save(clone(DLC_SAVE) as unknown as GameSave, 1);
  session(smC, envDlc, 2);
  const control = smC.loadResult().save as PackGameSave;

  // 实验组：DLC 存档 → 本体读写（还在营地走了走、加了金币以外什么都没动）→ DLC 读写
  const { s: st } = mem(); const sm = new SaveManager(st, 'c', LOOT_DATA); sm.save(clone(DLC_SAVE) as unknown as GameSave, 1);
  _resetPacksForTest(); Entitlement.revokeForTest('dlc1');
  check(!hasPack('dlc1') && maxLevel() === 30, '切到本体：没有 dlc1，上限 30');
  const b = session(sm, envBase, 2);
  check(b.rep.sealed === 3 && b.rep.stillSealed === 3, `本体读档：封存 ${b.rep.sealed} 项（身上 1 件、背包 1 件、DLC 材料 1 种）`);
  check(!b.inv.equipped.chest && b.inv.bag.length === 2 && b.inv.bag.every(i => !i.pack) && b.inv.stack('@dlc1:mat_bell') === 0 && b.inv.stack('set:fury3') === 1, '本体背包 / 身上没有 DLC 物品（不能穿 / 分解 / 卖），本体物品和材料都在');
  check(b.prog.level === 30 && b.prog.savedLevel === 35, '本体运行时 30 级');
  check(b.rep.parked && b.s.map === 'camp' && !b.s.pos, '位置在 DLC 区域 → 回灰石营地');
  check(!b.rep.classLocked, '战士角色不锁定');
  const mid = sm.loadResult().save as PackGameSave;
  check(same(mid.level, { level: 35, xp: 1234 }), `本体写回的等级：${JSON.stringify(mid.level)}`);
  check(mid.packSealed?.items.length === 2 && mid.packSealed.stacks?.['@dlc1:mat_bell'] === 5 && mid.packSealed.items.some(e => e.from === 'equipped' && e.slot === 'chest'), '本体写回的存档里有封存列表（2 件 + 材料 5）');
  check(same(mid.packPark, { map: 'dlc1_shore', pos: { x: 12.5, z: -40.3 } }), '本体写回的存档里停放了原 DLC 坐标');
  check(same(mid.dlc, DLC_SAVE.dlc) && same((mid as unknown as { futureField: unknown }).futureField, DLC_SAVE.futureField), 'dlc.dlc1 和未知字段原样写回');
  // 本体再读写一次（第二次进本体也不能丢、不能重复封存）
  const b2 = session(sm, envBase, 3);
  const mid2 = sm.loadResult().save as PackGameSave;
  check(b2.rep.sealed === 0 && b2.rep.stillSealed === 3 && same(mid2.packSealed, mid.packSealed) && same(mid2.packPark, mid.packPark) && same(mid2.level, mid.level), '本体第二次读写：封存 / 停放 / 等级都不变');

  // 回到 DLC
  _resetPacksForTest(); Entitlement.grantForTest('dlc1'); installPack(DLC1);
  const d = session(sm, envDlc, 4);
  check(d.rep.unsealed === 3 && d.rep.stillSealed === 0 && d.rep.unparked, `DLC 读档：解封 ${d.rep.unsealed} 项，位置放回 DLC 区域`);
  const fin = sm.loadResult().save as PackGameSave;
  const strip = (x: PackGameSave) => { const { savedAt: _a, sum: _b, ...rest } = x; void _a; void _b; return rest; };
  check(same(strip(fin), strip(control)), 'DLC → 本体 ×2 → DLC 的最终存档与「DLC 直接读写」对照组完全一致');
  check(fin.inventory.equipped.chest?.id === 'd0' && fin.inventory.bag.map(i => i.id).join() === 'b1,d1,b2' && fin.inventory.stacks?.['@dlc1:mat_bell'] === 5, '封存物品回到原格子、背包原顺序，材料数量不变');
  check(same(fin.level, { level: 35, xp: 1234 }) && fin.map === 'dlc1_shore' && same(fin.pos, { x: 12.5, z: -40.3 }), '35 级 / 经验 1234 / DLC 区域坐标 (12.5, -40.3) 都恢复');
  check(!fin.packSealed && !fin.packPark && same(fin.dlc, DLC_SAVE.dlc), '封存列表和停放字段清掉，dlc.dlc1 原样');

  // 解封时原格子被占 / 背包满：继续封存，不丢
  _resetPacksForTest(); Entitlement.revokeForTest('dlc1');
  const t = mem(); const sm2 = new SaveManager(t.s, 'c', LOOT_DATA); sm2.save(clone(DLC_SAVE) as unknown as GameSave, 1);
  session(sm2, envBase, 2, f => {   // 本体里：胸甲格穿上了别的装备，背包塞满
    const inv = f.inventory as { equipped: Record<string, unknown>; bag: unknown[] };
    inv.equipped.chest = item('nb', 'chest'); while (inv.bag.length < bagCap) inv.bag.push(item(`f${inv.bag.length}`, 'ring'));
  });
  _resetPacksForTest(); Entitlement.grantForTest('dlc1'); installPack(DLC1);
  const full = session(sm2, envDlc, 3);
  const after = sm2.loadResult().save as PackGameSave;
  check(full.rep.unsealed === 1 && full.rep.stillSealed === 2 && after.packSealed?.items.length === 2 && after.inventory.equipped.chest?.id === 'nb', '格子被占 + 背包满：材料放回，2 件装备继续封存（不丢、不顶掉本体装备）');
}

// ====================================================================== 6. DLC 职业角色在本体：锁定、数据一字不动
console.log('\n=== 6. DLC 职业角色在本体');
{
  _resetPacksForTest(); Entitlement.revokeForTest('dlc1');
  const { s } = mem();
  const ro = new Roster(s, LOOT_DATA, (() => { let n = 0; return () => `c${n++}`; })());
  const m = ro.create('dlc1_hunter', '猎手', 0);
  check(typeof m === 'object', '建一个 DLC 职业角色（模拟 DLC 版建的）');
  const sm = ro.saverFor((m as { id: string }).id);
  sm.save({ classId: 'dlc1_hunter', inventory: { gold: 1, bag: [], equipped: {}, stacks: {} }, level: { level: 33, xp: 9 }, talents: { x: 1 }, quests: { active: {}, done: [] }, map: 'dlc1_shore', pos: { x: 3, z: 4 }, dlc: { dlc1: { pet: 'wolf' } } } as unknown as GameSave, 1);
  const raw = s.get(`darkrock_char_${(m as { id: string }).id}`);
  ro.probe();
  const fixed = applyPackCompat(clone(sm.loadResult().save!) as PackGameSave, { hasPack, knownMap: isKnownMap, knownClass: isClassAvailable, bagCap: 30 });
  check(!isClassAvailable('dlc1_hunter') && fixed.classLocked, '本体：职业不可用 → classLocked（选角界面锁定，title.ts charLocked 拦住进入）');
  check(s.get(`darkrock_char_${(m as { id: string }).id}`) === raw && ro.find((m as { id: string }).id)?.level === 33, '列表读取（probe）后存档原文一字不变，列表显示 33 级');
  const exp = ro.exportText((m as { id: string }).id);
  check(!!exp && JSON.parse(exp).save.classId === 'dlc1_hunter' && JSON.parse(exp).save.dlc.dlc1.pet === 'wolf', '导出文件里职业和 dlc 数据完整');
}

// ====================================================================== 7. 共享仓库
console.log('\n=== 7. 共享仓库封存');
{
  const items = [{ id: 'a' }, { id: 'b', pack: 'dlc1' }, { id: 'c' }] as unknown as ItemInstance[];
  const r0 = splitBank(items, { hasPack: () => false });
  check(r0.keep.map(i => i.id).join() === 'a,c' && r0.seal.map(i => i.id).join() === 'b', '本体：DLC 物品拆进封存（web/travel.ts 存到 darkrock_bank_sealed）');
  const plain = [{ id: 'a' }] as unknown as ItemInstance[];
  check(splitBank(plain, { hasPack: () => false }).keep === plain, '没有 DLC 物品：原数组返回（不写任何新 key）');
  check(stackPack('@dlc1:mat') === 'dlc1' && stackPack('set:fury3') === null && stackPack('potion_s') === null, '堆叠物品归属：只认「@包id:」前缀');
}


// ====================================================================== v0.9.9 31–40 底座
console.log('\n=== v0.9.9 31–40 底座');
{
  const eg = endgameIlvl; const P2 = { Progression };
  const a = new P2.Progression(40); a.load({ level: 30, xp: 0 }); const b = new P2.Progression(40); b.load({ level: 37, xp: 0 }); const c = new P2.Progression(40); c.load({ level: 20, xp: 0 });
  check(a.talentPoints === 28 && a.packTalentPoints === 0, `30 级：本体天赋 ${a.talentPoints} 点，扩展天赋 ${a.packTalentPoints} 点`);
  check(b.talentPoints === 28 && b.packTalentPoints === 3, `37 级：本体天赋仍 ${b.talentPoints} 点，扩展天赋 ${b.packTalentPoints} 点（v1.0.1：32/34/36 级各 1）`);
  check(c.talentPoints === 15 && c.packTalentPoints === 0, '20 级天赋点（3.0：11 + 15 级多 2 + 20 级多 2）');
  check(c.xpToNext(20) === 2860 && c.xpToNext(29) === 8440, '30 级以前经验不变');
  check([31, 35, 39, 40].map(l => bandIlvl(l)).join() === '54,68,75,75', `扩展区域升级期装等 31/35/39/40 = ${[31, 35, 39, 40].map(l => bandIlvl(l)).join(' / ')}`);
  check(packIlvl('dungeon', 40, 'blue', 3) === 81 && packIlvl('raid', 40, 'purple') === 85 && packIlvl('hell', 40, 'purple') === 90 && packIlvl('raid', 36, 'blue') === bandIlvl(36) && packIlvl('field', 33, 'dark') === BAND.dark,
    '扩展内容 40 级：小副本 75–81、长副本 85、炼狱 90、暗金 95；40 以前按升级期');
  check(eg(10, 'blue', 37, 50) === 50 && eg(10, 'dark', 37, 50) === 70, '本体内容在 31–40 级仍掉本体固定装等（长副本 50、暗金 70）');
  check(bandMonsterLevel(35, 31, 34) === 34 && bandMonsterLevel(30, 31, 34) === 31 && bandMonsterLevel(33, 31, 40) === 33, '扩展区域怪物等级 = 玩家等级夹在区域段里');
}
{
  const CP = { _resetPacksForTest, registerPack, bindPacks, runStoryHooks, packCtx };
  CP._resetPacksForTest();
  const log: string[] = [];
  CP.registerPack({ id: 'bind_a', name: 'A', bind: x => { log.push('a' + x.level()); }, storyHooks: [{ id: 'h1', at: 'enterGame', run: () => { log.push('h1'); } }, { id: 'h2', at: 'ending', run: () => { log.push('h2'); } }] });
  CP.registerPack({ id: 'bind_b', name: 'B', bind: () => { throw new Error('坏包'); } });
  const ctx = { toast() {}, level: () => 33, classId: () => 'mage', map: () => 'camp', toCamp() {}, openPanel() {}, save() {}, goMap: () => true, playerPos: () => ({ x: 0, z: 0 }), setMoveMul() {}, dropLoot() {}, questState: () => 'locked', yell() {}, teleport() {} };
  const oe = console.error; console.error = () => {};
  const n1 = CP.bindPacks(ctx), n2 = CP.bindPacks(ctx); const h = CP.runStoryHooks('enterGame'); const h0 = CP.runStoryHooks('nothing');
  console.error = oe;
  check(n1 === 1 && n2 === 0 && log.join() === 'a33,h1' && h === 1 && h0 === 0 && CP.packCtx() === ctx, 'bindPacks 每包只调一次、坏包不影响其它包；runStoryHooks 按时机执行');
  CP._resetPacksForTest();
  check(CP.bindPacks(ctx) === 0 && CP.runStoryHooks('ending') === 0, '没有包：bind / 剧情钩子什么都不做');
}

// ====================================================================== 9. v1.0.2 包野外区域（wilds）
console.log('\n=== 9. v1.0.2 包野外区域：并进 WILD / WILD_IDS / MAPS / 世界坐标');
{
  type WM = { WILD: Record<string, { name: string; origin: { x: number; z: number }; pack?: string }>; WILD_IDS: string[]; FULL_WILD_IDS: string[]; HUB_IDS: string[]; PACK_WILD_IDS: string[]; isWildId: (s: string) => boolean; isPackWild: (s: string) => boolean; WILD_NPC_NAMES: Record<string, unknown> };
  type MM = { MAPS: Record<string, { name: string; levels: string }>; MAP_ORIGIN: Record<string, { x: number; z: number }>; mapAt: (x: number, z: number) => string; isKnownMap: (s: string) => boolean; AREAS: Record<string, { map: string }> };
  const reload = () => { for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k]; return { W: require('./data/zones_wild') as WM, M: require('./data/world_map') as MM }; };
  _resetPacksForTest();
  const b = reload();
  check(b.W.WILD_IDS.length === 6 && b.W.PACK_WILD_IDS.length === 0 && Object.keys(b.M.MAPS).length === 10 && b.M.mapAt(2400, -2400) !== 'dlc1_coast', '没有包：野外 6 个、区域 10 个，包坐标不认');
  const { COAST_WILD, COAST_WAYPOINT, COAST_ID } = require('./dlc/dlc1/coast') as typeof import('./dlc/dlc1/coast');
  _resetPacksForTest(); registerPack(DLC1);
  const { W, M } = reload();
  check(W.WILD_IDS.length === 11 && W.WILD_IDS[10] === 'dlc1_well' && W.WILD_IDS[6] === COAST_ID && W.WILD_IDS[7] === 'dlc1_mirror' && W.WILD_IDS[8] === 'dlc1_belltower' && W.WILD_IDS[9] === 'dlc1_forge' && W.isWildId(COAST_ID) && W.isPackWild(COAST_ID) && !W.isPackWild('ember'), 'dlc1：野外 +5（沉钟海岸、镜渊城、无声钟楼、钟铜熔炉、潮渊钟井），isWildId / isPackWild 认得');
  check(W.FULL_WILD_IDS.length === 4 && W.HUB_IDS.length === 2, '包野外不进探索区 / 副本区列表');
  check(M.MAPS[COAST_ID]?.name === '沉钟海岸' && M.MAPS[COAST_ID].levels === '31-35' && M.isKnownMap(COAST_ID) && Object.keys(M.MAPS).length === 15 && M.MAPS.dlc1_well?.levels === '40-40' && M.MAPS.dlc1_forge?.levels === '40-40' && M.MAPS.dlc1_mirror?.levels === '35-38' && M.MAPS.dlc1_belltower?.levels === '38-40', 'MAPS：包野外自动生成区域条目（名字 / 等级）');
  check(M.MAP_ORIGIN[COAST_ID]?.x === 2400 && M.mapAt(2400, -2400) === COAST_ID && M.mapAt(2400 + 80, -2400 - 80) === COAST_ID && M.mapAt(0, 0) === 'camp' && M.mapAt(0, 1700) === 'ember', 'MAP_ORIGIN / mapAt：包坐标归包区域，本体坐标不变');
  check(M.AREAS.cs_bell?.map === COAST_ID && M.AREAS.cs_wreck?.map === COAST_ID, '包野外的地点并进 AREAS（任务指引可用）');
  check(fp(W.WILD.ember) === fp(b.W.WILD.ember) && W.WILD.star.name === '星落高原', '本体野外数据不变');
  check(COAST_WAYPOINT.locked!() !== null, '白盒传送阵：没进游戏时锁定');
  const log: string[] = []; let lv = 29;
  const ctx = { toast() {}, level: () => lv, classId: () => 'mage', map: () => 'camp', toCamp() {}, openPanel() {}, save() {}, goMap: (m: string) => { log.push(m); return true; }, playerPos: () => ({ x: 0, z: 0 }), setMoveMul() {}, dropLoot() {}, questState: () => 'locked', yell() {}, teleport() {} };
  bindPacks(ctx);
  const l29 = COAST_WAYPOINT.locked!(); lv = 30; const l30 = COAST_WAYPOINT.locked!(); COAST_WAYPOINT.go();
  check(!!l29 && l29.includes('30') && l30 === null && log.join() === COAST_ID, `白盒传送阵：29 级锁定（${l29}），30 级可去，go → ctx.goMap(${log.join()})`);
  check((COAST_WILD as { gates: { to: string }[] }).gates.every(g => g.to === 'camp' || g.to === 'dlc1_mirror') && !((W.WILD.ember as unknown as { gates: { to: string }[] }).gates).some(g => g.to.startsWith('dlc1')), '海岸的门只通灰石营地 / 镜渊城；本体区域不加通往扩展内容的门');
  _resetPacksForTest(); reload();
}

// ====================================================================== 10. v1.0.3 第七章 + 潮汐
console.log('\n=== 10. v1.0.3 沉钟海岸：第七章任务 + 潮汐');
{
  const { CH7_QUESTS } = require('./dlc/dlc1/chapter7') as typeof import('./dlc/dlc1/chapter7');
  const T = require('./dlc/dlc1/tide') as typeof import('./dlc/dlc1/tide');
  _resetPacksForTest(); registerPack(DLC1);
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
  const W = require('./data/world_map') as { AREAS: Record<string, { map: string }>; KILL_AREA: Record<string, string>; locateObjective: (o: unknown) => { map: string } | null; NPC_HOME: Record<string, { map: string }> };
  const Q = (require('./data/quests') as { QUESTS: { id: string }[] }).QUESTS;
  check(CH7_QUESTS.length === 6 && CH7_QUESTS.every(q => q.giver === 'iola' && q.turnIn === 'iola') && Q.filter(q => q.id.startsWith('cs7_')).length === 7 && (Q as unknown as { id: string; giver: string; turnIn: string }[]).some(q => q.id === 'cs7_0' && q.giver === 'scholar' && q.turnIn === 'bran'), '第七章 6 个主线（伊奥拉发放 / 交付）+ v1.2.71 入口 7-0（墨言发放、布兰交付），已并进 QUESTS');
  const objs = CH7_QUESTS.flatMap(q => q.objectives);
  const lost = objs.filter(o => { const p = W.locateObjective(o); return !p || p.map !== 'dlc1_coast'; });
  check(lost.length === 0, `每个目标都能定位到沉钟海岸（任务指引 / 自动寻路）${lost.length ? '：缺 ' + JSON.stringify(lost) : ''}`);
  check(W.NPC_HOME.iola?.map === 'dlc1_coast' && W.KILL_AREA.cs_foreman === 'cs_foreman_route', '伊奥拉在海岸营地；回响首领有击杀区域');
  const ids = new Set(CH7_QUESTS.map(q => q.id));
  check(CH7_QUESTS.every(q => (q.requires ?? []).every(r => ids.has(r))) && CH7_QUESTS.reduce((s, q) => s + q.reward.xp, 0) === 43500, '前置都在本章内；经验合计 43500');
  check(T.tideAt(0).phase === 'low' && T.tideAt(105).phase === 'rise' && T.tideAt(150).phase === 'high' && T.tideAt(220).phase === 'fall' && T.tideAt(224).phase === 'low' && T.tideAt(150).level === 1, '潮汐周期：退潮 100 → 涨 12 → 涨潮 100 → 退 12（224 秒）');
  // 模拟一个 ctx：站在沉船宝箱旁，退潮开箱、涨潮在浅滩减速、离开海岸还原
  let pos = { x: 2400 - 46, z: -2400 + 16 }, map = 'dlc1_coast', mul = 1; const drops: string[] = [];
  const ctx = { toast() {}, yell() {}, level: () => 31, classId: () => 'mage', map: () => map, toCamp() {}, openPanel() {}, save() {}, goMap: () => true, playerPos: () => pos, setMoveMul: (k: number) => { mul = k; }, dropLoot: (_x: number, _z: number, q?: string) => { drops.push(q ?? ''); }, questState: () => 'available', teleport() {} };
  T.setTidePhase('low'); T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 }); T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 });
  check(drops.join() === 'blue', `退潮走到沉船宝箱：自动打开，掉 1 件蓝装以上（${drops.join()}）`);
  T.setTidePhase('high'); pos = { x: 2400, z: -2400 - 10 }; T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 });
  check(Math.abs(mul - T.WADE_MUL) < 1e-9, `涨潮站在沉钟浅滩：移速 ×${mul}`);
  pos = { x: 2400, z: -2400 + 62 }; T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 });
  check(mul === 1, '涨潮在潮痕营地：不减速');
  pos = { x: 2400, z: -2400 - 10 }; T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 }); map = 'camp'; T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 });
  check(mul === 1, '离开海岸：移速还原');
  T.setTidePhase('low'); map = 'dlc1_coast'; pos = { x: 2400 - 46, z: -2400 + 16 }; T.tideUpdate(0.1, ctx, 'dlc1_coast', { x: 2400, z: -2400 });
  check(drops.length === 2, '下一次退潮：宝箱刷新，可以再开一次');
  _resetPacksForTest();
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
}

// ====================================================================== 11. v1.0.4 新怪物模型
console.log('\n=== 11. v1.0.4 沉钟海岸新怪物模型');
{
  const THREE = require('three') as typeof import('three');
  const { DLC1_MODELS } = require('./dlc/dlc1/models') as typeof import('./dlc/dlc1/models');
  const { COAST_WILD } = require('./dlc/dlc1/coast') as typeof import('./dlc/dlc1/coast');
  const used = Object.values(COAST_WILD.mobs as unknown as Record<string, { model: string }>).map(m => m.model);
  check(used.every(m => m in DLC1_MODELS), `海岸 4 种怪都用新模型（${used.join(' / ')}）`);
  for (const [id, f] of Object.entries(DLC1_MODELS)) {
    const r = f() as { root: import('three').Group; flash: unknown[]; legs: unknown[]; tick?: (dt: number, m: boolean) => void };
    r.tick?.(0.1, true); r.tick?.(0.1, false);
    const sz = new THREE.Box3().setFromObject(r.root).getSize(new THREE.Vector3());
    check(r.flash.length >= 3 && sz.y > 0.9 && sz.y < 4.5 && sz.x < 4, `${id}：可建模（高 ${sz.y.toFixed(2)} 宽 ${sz.x.toFixed(2)}，受击闪白材质 ${r.flash.length}）`);
  }
}

// ====================================================================== 12. v1.0.5 镜渊城 + 第八章
console.log('\n=== 12. v1.0.5 镜渊城：第八章 + 回响居民 + 镜面通道');
{
  const { CH8_MAIN, CH8_SIDE } = require('./dlc/dlc1/chapter8') as typeof import('./dlc/dlc1/chapter8');
  const MR = require('./dlc/dlc1/mirror') as typeof import('./dlc/dlc1/mirror');
  _resetPacksForTest(); registerPack(DLC1);
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
  const W = require('./data/world_map') as { locateObjective: (o: unknown) => { map: string } | null; NPC_HOME: Record<string, { map: string }> };
  check(CH8_MAIN.length === 6 && CH8_SIDE.length === 10, '第八章 6 主线 + 10 回响居民支线');
  const all = [...CH8_MAIN, ...CH8_SIDE];
  const lost = all.flatMap(q => q.objectives).filter(o => { const p = W.locateObjective(o); return !p || p.map !== 'dlc1_mirror'; });
  check(lost.length === 0, `每个目标都能定位到镜渊城${lost.length ? '：缺 ' + JSON.stringify(lost) : ''}`);
  const npcs = new Set(all.flatMap(q => [q.giver, q.turnIn])), miss = [...npcs].filter(n => n !== 'iola' && W.NPC_HOME[n]?.map !== 'dlc1_mirror');
  check(miss.length === 0, `任务 NPC 都在镜渊城（8-1 由海岸的伊奥拉发放）${miss.length ? '：' + miss : ''}`);
  check(CH8_MAIN.reduce((s, q) => s + q.reward.xp, 0) === 60000 && CH8_SIDE.reduce((s, q) => s + q.reward.xp, 0) === 30000, '经验：主线 60000 + 支线 30000');
  // 镜面通道
  let pos = { x: MR.MIRROR_O.x - 30, z: MR.MIRROR_O.z + 12 }; const tp: string[] = [];
  const ctx = { toast() {}, yell() {}, level: () => 36, classId: () => 'mage', map: () => 'dlc1_mirror', toCamp() {}, openPanel() {}, save() {}, goMap: () => true, playerPos: () => pos, setMoveMul() {}, dropLoot() {}, questState: (id: string) => id === 'cs7_6' ? 'done' : 'locked', teleport: (x: number, z: number) => { tp.push(`${x - MR.MIRROR_O.x},${z - MR.MIRROR_O.z}`); pos = { x, z }; },
    spawnBoss: () => true, bossState: () => 'none' as const, removeBoss() {}, banner() {}, synth: () => ({ tone() {}, noise() {}, gate: () => false }), addXp() {} };
  MR.mirrorUpdate(0.1, ctx);
  check(tp.length === 1 && tp[0] === '33,12', `走进左镜 → 从右镜前出来（${tp[0]}）`);
  MR.mirrorUpdate(0.1, ctx); pos = { x: MR.MIRROR_O.x + 30, z: MR.MIRROR_O.z + 12 }; MR.mirrorUpdate(0.1, ctx);
  check(tp.length === 1, '3 秒冷却内不会被立刻传回去');
  MR.bindMirror(ctx);
  check(MR.MIRROR_WAYPOINT.locked!() === null, '传送阵：34 级 + 第七章完成 → 开放');
  _resetPacksForTest();
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
}

// ====================================================================== 13. v1.0.6 灵契猎手
console.log('\n=== 13. v1.0.6 第 5 职业 灵契猎手（职业挂载 / 链甲 / 兽魂 / 三形态 / 天赋 / 技能书 / 英灵 / 职业任务 / 模型）');
{
  _resetPacksForTest(); registerPack(DLC1);
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/](data|core)[\\/]/.test(k) && !/ContentPacks|Entitlement/.test(k)) delete require.cache[k];
  const CL = require('./data/classes') as typeof import('./data/classes');
  const RS = require('./data/resources') as typeof import('./data/resources');
  const RC = require('./core/Resource') as typeof import('./core/Resource');
  const LD = require('./data/loot') as typeof import('./data/loot');
  const LG = require('./core/Loot') as typeof import('./core/Loot');
  const INV = require('./core/Inventory') as typeof import('./core/Inventory');
  const SPI = require('./data/spirits') as typeof import('./data/spirits');
  const CQ = require('./data/class_quests') as typeof import('./data/class_quests');
  const QS = require('./data/quests') as typeof import('./data/quests');
  const SB = require('./core/SkillBook') as typeof import('./core/SkillBook');
  const TT = require('./core/TalentTree') as typeof import('./core/TalentTree');
  const SR = require('./core/SkillResolver') as typeof import('./core/SkillResolver');
  const CT = require('./core/ComboTracker') as typeof import('./core/ComboTracker');
  const HR = require('./dlc/dlc1/hunter_runtime') as typeof import('./dlc/dlc1/hunter_runtime');
  const HD = require('./dlc/dlc1/hunter_data') as typeof import('./dlc/dlc1/hunter_data');
  const HS = require('./dlc/dlc1/hunter_skills') as typeof import('./dlc/dlc1/hunter_skills');
  const H = (CL.CLASSES as Record<string, import('./data/classes').ClassDef>).hunter;
  check(Object.keys(CL.CLASSES).join().startsWith('warrior,mage,chrono,alchemy,hunter') && CL.isClassAvailable('hunter') && !!H?.ext, '职业表：本体 4 + 灵契猎手（带 ext）');
  check(H.equip.armorType === 'mail' && H.powerName === '攻击强度' && H.equip.weapons!.join() === 'glaive,bow' && H.equip.rangedOffhand === 'bow', '链甲、攻击强度；11-05 两栏：长柄弯刃（主手）+ 弓（弓栏）');
  check(Object.keys(H.skills).length === 18 && H.ext!.book!.choices.skill1!.length === 3 && H.ext!.book!.choices.ultimate!.length === 3 && H.ext!.book!.choices.skill4!.length === 5, `技能 ${Object.keys(H.skills).length} 个（15 职业技能 + 3 扩展天赋绝技）；每槽 3 选 1，绝技 2 + 3`);
  const allIds = Object.values(H.ext!.book!.choices).flat() as string[];
  check(allIds.every(id => !!H.skills[id]) && H.ext!.book!.runes.every(r => !!H.skills[r.skillId]), '技能书可选项 / 符文都指向存在的技能');
  check(H.ext!.book!.runes.length === 51 && H.ext!.book!.presets.length === 3, `符文 ${H.ext!.book!.runes.length} 枚（17 技能 × 3），推荐配装 3 套`);
  const bd = CL.skillBookData(H); const book = new SB.SkillBook(bd);
  check(book.skillAt('skill1').id === 'hp_pounce' && !!bd.talentOnly?.has('hp_u_packlord') && !bd.talentOnly?.has('hp_leap'), '技能书：默认契约突袭；扩展天赋绝技只能由天赋学会');
  // 天赋树
  const tree = new TT.TalentTree(H.tree, 21);
  const caps = H.tree.specs.map(sp => sp.nodes.filter(n => n.capstone).map(n => `${n.name}@${n.row}`).join());
  check(H.tree.specs.map(s => s.name).join() === '雷狼,巨熊,苍鹰' && tree.nodes.length === 45 && caps.join() === '头狼·奔雷@6,巨熊之怒@6,天空之王@6', `3 专精 ${tree.nodes.length} 个天赋，终极 ${caps.join(' / ')}`);
  check(H.tree.specs.every(sp => sp.nodes.filter(n => n.kind === 'choice').length === 4 && sp.nodes.some(n => n.capstone && n.row === 6)), '每系 4 个关键节点（区域一 / 二各 2 选 1）+ 绝技（天赋 3.0，方案 B）');
  // 兽魂
  const r = RC.newRes('hunter');
  check(r.kind === 'beast' && RC.resMax(r) === 100 && RS.RES_DEF.hunter?.name === '兽魂', '资源：兽魂（0–100）');
  RC.resOnHit(r, 'basic', 'e1', 1); RC.resOnHit(r, 'skill2', 'e1', 1);
  check(r.value === 10, `普攻命中 +6、技能命中 +4（= ${r.value}）`);
  check(RC.resEmpower(r, 'skill1') === null, '不到 40 不强化');
  r.value = 50; const emp = RC.resEmpower(r, 'skill2');
  check(!!emp && emp.cost === 40 && emp.mods[0].ops.some(o => o.op === 'rename') && RC.resEmpower(r, 'basic') === null, '满 40：技能「兽魂·」强化（消耗 40），普攻不吃');
  // 底材 / 链甲
  const hb = LD.LOOT_DATA.bases.filter(b => b.cls === 'hunter' && !b.id.endsWith('_d40'));   // v1.2.38b：40 级暗金专用底材另算
  check(hb.length === 11 && hb.every(b => (b as { pack?: string }).pack === 'dlc1') && hb.filter(b => b.armorType === 'mail').length === 8, '底材：链甲 8 件 + 武器 3 种（打上包标记）');
  const gen = new LG.LootGenerator(LD.LOOT_DATA); gen.classId = 'hunter';
  const its = Array.from({ length: 60 }, () => gen.generate(20, 'blue'));
  const mail = its.filter(i => i.armorType), wpn = its.filter(i => i.weaponType);
  check(mail.length > 0 && mail.every(i => i.armorType === 'mail' && i.pack === 'dlc1') && wpn.every(i => ['glaive', 'bow'].includes(i.weaponType!)), `猎手掉落：护甲全是链甲（${mail.length} 件，带 pack），武器只有猎手武器（${wpn.length} 件）`);
  const inv = new INV.Inventory(); inv.rules = H.equip;
  const plate = { id: 'p', baseId: 'b_helm', name: '铁盔', slot: 'head', quality: 'blue', itemLevel: 10, hp: 1, armor: 1, modifiers: [], lines: [], sellPrice: 1, armorType: 'plate' } as unknown as import('./core/Loot').ItemInstance;
  check(!inv.canEquip(plate) && inv.canEquip({ ...plate, armorType: 'mail' } as typeof plate), `穿戴：重甲不能穿（${inv.whyCannotEquip(plate)}），链甲可以`);
  { // 11-05 两栏：长柄（主手）+ 弓（弓栏）同时装备、互不卸下；弓栏只收弓，主手不收弓；短刃不能穿、不掉落；老存档迁移幂等
    const mk = (id: string, baseId: string, slot: string, weaponType: string, il = 10) => ({ id, baseId, name: baseId, slot, weaponType, quality: 'blue', itemLevel: il, hp: 0, armor: 0, modifiers: [], lines: [], sellPrice: 1 }) as unknown as import('./core/Loot').ItemInstance;
    const iv = new INV.Inventory(30); iv.rules = H.equip;
    iv.add(mk('g', 'b_h_glaive', 'twoHand', 'glaive')); iv.add(mk('b', 'b_h_bow', 'offHand', 'bow')); iv.add(mk('ob', 'b_h_bow', 'oneHand', 'bow')); iv.add(mk('sb', 'b_h_shortblade', 'offHand', 'shortblade'));
    const r1 = iv.tryEquip('g'), r2 = iv.tryEquip('b');
    check(r1.ok && r2.ok && r2.slot === 'offHand' && iv.equipped.mainHand?.id === 'g' && iv.equipped.offHand?.id === 'b' && iv.tryEquip('g' as string).ok === false, '两栏：长柄进主手、弓进弓栏，同时在身');
    check(iv.slotsFor(mk('x', 'b_h_bow', 'oneHand', 'bow')).join() === 'offHand' && iv.slotsFor(mk('y', 'b_h_glaive', 'twoHand', 'glaive')).join() === 'mainHand' && !iv.tryEquip('ob', 'mainHand').ok && !iv.canEquip(mk('z', 'b_h_shortblade', 'offHand', 'shortblade')), '弓栏只收弓（老存档单手弓也进弓栏），主手不收弓；短刃不能装备');
    check(iv.slotName('offHand') === '弓' && iv.slotName('mainHand') === '主手：长柄' && new INV.Inventory().slotName('offHand') === '副手', '格子名：猎手「主手：长柄」「弓」，其他职业不变');
    check(!hb.some(b => b.id === 'b_h_shortblade') || !its.some(i => i.baseId === 'b_h_shortblade'), '短刃不再掉落（定义保留）');
    const old = new INV.Inventory(30); old.rules = H.equip;
    old.load({ gold: 0, bag: [mk('g2', 'b_h_glaive', 'twoHand', 'glaive', 12)], equipped: { mainHand: mk('ob2', 'b_h_bow', 'oneHand', 'bow'), offHand: mk('sb2', 'b_h_shortblade', 'offHand', 'shortblade') } });
    const m1 = old.migrateRangedOffhand(() => mk('new', 'b_h_glaive', 'twoHand', 'glaive', 1)), m2 = old.migrateRangedOffhand(() => mk('new2', 'b_h_glaive', 'twoHand', 'glaive', 1));
    check(old.equipped.offHand?.id === 'ob2' && old.equipped.mainHand?.id === 'g2' && old.bag.some(i => i.id === 'sb2') && m2.length === 0, `老存档迁移：短刃回背包、弓到弓栏、背包长柄进主手；再跑一遍不动（${m1.join(' / ')}）`);
    const old2 = new INV.Inventory(30); old2.rules = H.equip; old2.load({ gold: 0, bag: [], equipped: { offHand: mk('sb3', 'b_h_shortblade', 'offHand', 'shortblade') } });
    old2.migrateRangedOffhand(() => mk('base', 'b_h_glaive', 'twoHand', 'glaive', 1));
    check(old2.equipped.mainHand?.id === 'base' && !old2.equipped.offHand && old2.bag[0]?.id === 'sb3', '老存档迁移：主手空 + 背包没长柄 → 补基础长柄');
    const war = new INV.Inventory(30); war.rules = { weapons: ['greatsword', 'shield'] };
    war.add(mk('gs', 'b_gs', 'twoHand', 'greatsword')); war.add(mk('sh', 'b_sh', 'offHand', 'shield')); war.tryEquip('gs'); war.tryEquip('sh');
    check(!war.equipped.mainHand && war.equipped.offHand?.id === 'sh' && war.migrateRangedOffhand().length === 0, '其他职业：副手照旧卸下双手武器，迁移不生效');
  }
  // 英灵 / 职业任务
  check(SPI.SPIRITS.filter(s => s.cls === 'hunter').length === 12 && SPI.SPIRITS.filter(s => s.cls === 'hunter' && s.unlock.stat === 'paragon').length === 6, '英灵 12 个（6 个暗岩印记英灵）');
  check(CQ.CLASS_QUESTS.filter(q => q.cls === 'hunter').length === 2 && QS.QUESTS.some(q => q.id === 'cq_hunter2') && /天赋点 \+1/.test(CQ.QUEST_PERKS.cq_hunter1 ?? ''), '职业任务 2 个（进任务表，奖励说明 +1 天赋点）');
  check(packList<{ cls: string; layers: unknown[][] }>('talentTier').some(t => t.cls === 'hunter' && t.layers.map(l => l.length).join() === '1,2,1,2,3'), '扩展天赋层（31–40）：猎手一棵，1/2/1/2/3');
  // 三形态：同一技能三种打法
  const res = new SR.SkillResolver(new CT.ComboTracker()); const cx = { now: 0, casterHpPercent: 1, targetEffects: [] };
  const R = (id: string, f: import('./dlc/dlc1/hunter_runtime').Form) => res.resolve(H.skills[id], HR.formMods(f), cx);
  const sw = R('hp_slash', 'wolf'), sb = R('hp_slash', 'bear'), se = R('hp_slash', 'eagle');
  check(sw.displayName === '雷爪斩' && sw.tags.includes('lightning') && sb.stats.damage > sw.stats.damage && se.shape === 'projectile' && se.tags.includes('ranged') && se.stats.range >= 15, `普攻：${sw.displayName}（雷电）/ ${sb.displayName}（伤害 ${sb.stats.damage.toFixed(1)}）/ ${se.displayName}（远程 ${se.stats.range} 米）`);
  const pw = R('hp_pounce', 'wolf'), pb = R('hp_pounce', 'bear'), pe = R('hp_pounce', 'eagle');
  check(pw.stats.cooldown < 8 && pb.effects.some(e => e.type === 'knockback') && pe.shape === 'projectile', '技能 1：狼冷却更短 / 熊击退 / 鹰变贯羽');
  const rw = R('hp_rend', 'wolf'), rb = R('hp_rend', 'bear'), re = R('hp_rend', 'eagle');
  check(rw.stats.radius < 4.5 && rb.stats.radius > 5 && rb.effects.some(e => e.type === 'stun') && re.tags.includes('targeted') && re.stats.range >= 16, '技能 2：狼收窄 / 熊震地（范围大 + 眩晕）/ 鹰在目标处落下');
  // 运行时：换形 + 换形技 + 兽魂 + 标记 / 破甲 / 熊减伤
  let now = 0, rv = 0; const fired: string[] = []; let mods: unknown[] = [];
  const P = { alive: true, hp: 100, maxHp: 100, getPos: () => ({ x: 0, z: 0 }) }, E = { alive: true, hp: 100, maxHp: 100, getPos: () => ({ x: 1, z: 0 }) };
  const api = { now: () => now, toast() {}, player: () => P, playerObj: () => null, target: () => E, enemiesNear: () => [E], damage: () => 0, heal() {}, fire: (d: { id: string }) => { fired.push(d.id + (JSON.stringify(mods).includes('灵契·') ? '+灵契' : '')); return null; }, setMods: (m: unknown[]) => { mods = m; }, refreshBar() {},
    res: () => ({ value: rv, max: 100 }), resAdd: (n: number) => { rv += n; }, resSpend: (n: number) => { if (rv < n) return false; rv -= n; return true; }, talentRank: () => 0, questDone: () => false, weapons: () => ({}), ring() {}, playAnim() {}, level: () => 20 };
  const RT = HR.HUNTER_RUNTIME; RT.bind!(api as unknown as import('./core/ClassExt').ClassExtApi); RT.reset!();
  check((RT.debug!() as { form: string }).form === 'wolf' && JSON.stringify(mods).includes('狼·'), '开局狼形态（挂上狼形态修饰器）');
  now = 2; RT.key!('x');
  check((RT.debug!() as { form: string }).form === 'bear' && fired.join() === 'hp_shift_bear', `X → 熊形态，放出换形技（${fired.join()}）`);
  now = 2.5; RT.key!('v');
  check((RT.debug!() as { form: string }).form === 'bear', '1 秒内不能连切');
  now = 4; rv = 30; RT.key!('v');
  check((RT.debug!() as { form: string }).form === 'eagle' && fired.length === 1, '再切到鹰：换形技 4 秒内置冷却中，不放');
  now = 7; RT.key!('f');
  check((RT.debug!() as { form: string }).form === 'wolf' && fired[1] === 'hp_shift_wolf+灵契' && rv === 5, `F 轮换回狼：兽魂 ≥25 → 「灵契·」换形技，消耗 25（${fired[1]}，剩 ${rv}）`);
  check(RT.preDeal!(P, 100, 'physical', true, false) === 100, '狼形态受到伤害不减');
  now = 9; RT.key!('x');
  check(Math.round(RT.preDeal!(P, 100, 'physical', true, false)) === 85, '熊形态受到伤害 -15%');
  const sk = (tags: string[], slot = 'skill2') => ({ baseId: 'x', displayName: 'x', slot, element: 'physical', shape: 'circle', tags, stats: { damage: 10 }, effects: [], appliedModifiers: [] }) as unknown as import('./core/types').ResolvedSkill;
  for (let i = 0; i < 7; i++) RT.onHits!(sk(['bear', 'sunder']), [E]);
  check(Math.round(RT.preDeal!(E, 100, 'physical', false, false)) === 115, `破甲叠到 5 层封顶：受到伤害 +15%（${Math.round(RT.preDeal!(E, 100, 'physical', false, false))}）`);
  RT.onHits!(sk(['eagle', 'mark']), [E]);
  check(Math.round(RT.preDeal!(E, 100, 'physical', false, false)) === 127, '再被鹰形态命中标记：+12%（共 127）');
  now = 30;
  check(RT.preDeal!(E, 100, 'physical', false, false) === 100, '破甲 / 标记过期后不再增伤');
  now = 31; RT.key!('z'); RT.onCast!(sk(['wolf'], 'basic')); RT.onCast!(sk(['wolf'], 'basic')); RT.onCast!(sk(['wolf'], 'basic'));
  const bite = RT.onHits!({ ...sk(['wolf'], 'basic'), stats: { damage: 10 } as never }, [E]);
  check(bite.displayName === '狼·撕咬' && bite.stats.damage === 20, '狼形态普攻第 3 下「撕咬」伤害 ×2');
  check(/狼契/.test(RT.status!() ?? ''), `状态行：${(RT.status!() ?? '').replace(/<[^>]+>/g, '')}`);
  // 11-05 Rhett 14:14 暗金鹰契 / 三魂同契按规格 v0.2 修正：①天空之王（灵契·苍鹰俯冲）命中直接满 5 层鹰契；②三魂同契只在狼 / 熊手持时生效
  { // 猎手运行时模块是之前缓存的（dlc 不清缓存），CondFlags 要用它自己引用的那一份
    type CFT = typeof import('./core/CondFlags')['CondFlags'];
    const CR = (require('./core/CondFlags') as typeof import('./core/CondFlags')).CondFlags;   // 本节新加载的 SkillResolver 读这一份
    type NM = { id: string; exports: unknown; children: NM[] }; const seen = new Set<NM>(), q = Object.values(require.cache) as NM[]; let CF: CFT = CR;
    while (q.length) { const m = q.pop()!; if (!m || seen.has(m)) continue; seen.add(m); if (/[\\/]core[\\/]CondFlags\.js$/.test(m.id) && (m.exports as { CondFlags: CFT }).CondFlags !== CR) CF = (m.exports as { CondFlags: CFT }).CondFlags; q.push(...m.children); }
    if (CF !== CR) CR.provide('dk40h_hold', () => CF.get('dk40h_hold', now));   // 运行时写的是旧缓存那一份 → 转给解析器
    const G40 = require('./dlc/dlc1/gear40') as typeof import('./dlc/dlc1/gear40');
    const a2 = api as unknown as { hasDark: (id: string) => boolean; talentRank: (id: string) => number };
    a2.hasDark = id => id === 'd40_h_bow' || id === 'd40_h_triad'; a2.talentRank = id => (id === 'he_sky' ? 1 : 0);
    now = 40; rv = 30; CF.consume('dk40h_bow'); RT.key!('v');
    const dive = { ...sk(['eagle', 'ranged', 'beast', 'mark'], 'skill1'), baseId: HS.SHIFT_SKILLS.eagle.id } as unknown as import('./core/types').ResolvedSkill;
    check((RT.debug!() as { form: string }).form === 'eagle' && CF.get('dk40h_bow', now) === 0, '鹰契：切鹰（灵契·苍鹰俯冲 → 天空之王）前 0 层');
    RT.onHits!(dive, [E]);
    check(CF.get('dk40h_bow', now) === 5 && (RT.debug!() as { stats: { skyFull: number } }).stats.skyFull === 1, `鹰契：天空之王命中直接满 5 层（${CF.get('dk40h_bow', now)} 层）`);
    RT.onHits!(dive, [E]);
    check((RT.debug!() as { stats: { skyFull: number } }).stats.skyFull === 1, '鹰契：满层只给天空之王那一发（同一次俯冲不重复）');
    const triad = G40.DLC1_DARK.find(d => d.id === 'd40_h_triad')!.modifiers;
    CR.addStack('dk40h_w', 1, 1, now + 10, now);
    const inE = res.resolve(H.skills.hp_rend, [...HR.formMods('eagle'), ...triad], { now, casterHpPercent: 1, targetEffects: [] });
    check(CF.get('dk40h_hold', now) === 0 && !inE.appliedModifiers.includes('dk40h_w'), '三魂同契：鹰形（手持弓）时不生效（残狼亮着也不挂）');
    now = 46; RT.key!('x'); CR.addStack('dk40h_w', 1, 1, now + 10, now);
    const inB = res.resolve(H.skills.hp_rend, [...HR.formMods('bear'), ...triad], { now, casterHpPercent: 1, targetEffects: [] });
    check(CF.get('dk40h_hold', now) === 1 && inB.appliedModifiers.includes('dk40h_w') && inB.tags.includes('wolf'), '三魂同契：熊形（手持长柄）时生效（残狼 → 带狼标签）');
    check(CF.get('dk40h_pact', now) === 5, `交契：鹰契 5 层切熊转 5 层交契（${CF.get('dk40h_pact', now)}）`);
    now = 52; RT.key!('z'); check(CF.get('dk40h_hold', now) === 1, '三魂同契：狼形时也生效');
    a2.hasDark = () => false; a2.talentRank = () => 0; CF.reset(); CR.reset(); CR.unprovide('dk40h_hold'); }
  // 模型
  const THREE = require('three') as typeof import('three');
  const HM = require('./dlc/dlc1/hunter_model') as typeof import('./dlc/dlc1/hunter_model');
  const got: import('three').Object3D[] = [];
  const dress = (eq: Record<string, { weaponType?: string; quality?: string } | undefined>) => { got.length = 0; HM.hunterDress({ H: 2, eq, attach: (_b, o) => { got.push(o as import('three').Object3D); return true; } }); return got.length; };
  check(dress({}) === 7 && dress({ mainHand: { weaponType: 'glaive', quality: 'orange' }, offHand: { weaponType: 'bow', quality: 'blue' } }) === 7 && ['h_glaive', 'h_bow', 'h_quiver'].every(n => got.some(o => o.name === n)), '挂件：兜帽 / 披肩 / 铜铃 / 链甲裙 + 长柄弯刃 + 弓 + 箭袋（11-05 两栏同时挂）');
  { const gl = got.find(o => o.name === 'h_glaive')!, bw = got.find(o => o.name === 'h_bow')!; const r0 = new THREE.Group(); r0.add(gl, bw);
    HM.hunterWeaponForm(r0, 'eagle'); const e1 = gl.userData.stowLock === true && bw.userData.stowLock === false;
    HM.hunterWeaponForm(r0, 'bear'); check(e1 && gl.userData.stowLock === false && bw.userData.stowLock === true, '换形：鹰 = 弓在手、长柄锁在背；熊 / 狼 = 长柄在手、弓锁在背'); }
  const bad = got.some(o => { let n = false; o.traverse(c => { const m = c as import('three').Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); if (!Number.isFinite(m.geometry.boundingBox!.max.x)) n = true; } }); return n; });
  check(!bad, '挂件几何体没有 NaN');
  const root = new THREE.Group(); root.position.set(5, 0, 0);
  HM.formAura(root, 'wolf'); HM.formAura(root, 'eagle');
  check(root.children.length === 1 && root.children[0].userData.form === 'eagle' && root.position.x === 5 && root.scale.x === 1, '形态之魂：换形时替换（只留一个），不改父节点变换');
  void HD; void HS;
  _resetPacksForTest();
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/](data|core)[\\/]/.test(k) && !/ContentPacks|Entitlement/.test(k)) delete require.cache[k];
}

// ====================================================================== 14. v1.0.7 负棺人
console.log('\n=== 14. v1.0.7 第 6 职业 负棺人（职业挂载 / 重甲 + 葬棺 / 收魂 / 三棺态 / 开棺组合 / 未亡 / 天赋 / 模型）');
{
  _resetPacksForTest(); registerPack(DLC1);
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/](data|core)[\\/]/.test(k) && !/ContentPacks|Entitlement/.test(k)) delete require.cache[k];
  const CL = require('./data/classes') as typeof import('./data/classes');
  const RS = require('./data/resources') as typeof import('./data/resources');
  const RC = require('./core/Resource') as typeof import('./core/Resource');
  const LD = require('./data/loot') as typeof import('./data/loot');
  const LG = require('./core/Loot') as typeof import('./core/Loot');
  const INV = require('./core/Inventory') as typeof import('./core/Inventory');
  const SPI = require('./data/spirits') as typeof import('./data/spirits');
  const CQ = require('./data/class_quests') as typeof import('./data/class_quests');
  const SB = require('./core/SkillBook') as typeof import('./core/SkillBook');
  const TT = require('./core/TalentTree') as typeof import('./core/TalentTree');
  const SR = require('./core/SkillResolver') as typeof import('./core/SkillResolver');
  const CT = require('./core/ComboTracker') as typeof import('./core/ComboTracker');
  const CR = require('./dlc/dlc1/coffin_runtime') as typeof import('./dlc/dlc1/coffin_runtime');
  const CS = require('./dlc/dlc1/coffin_skills') as typeof import('./dlc/dlc1/coffin_skills');
  const C = (CL.CLASSES as Record<string, import('./data/classes').ClassDef>).coffin;
  check(Object.keys(CL.CLASSES).join() === 'warrior,mage,chrono,alchemy,hunter,coffin' && CL.isClassAvailable('coffin') && !!C?.ext, '职业表：本体 4 + 灵契猎手 + 负棺人（带 ext）');
  check(C.equip.armorType === 'plate' && C.powerName === '攻击强度' && C.equip.weapons!.join() === 'coffin' && LG.WEAPON_TYPE_NAME.coffin === '棺', '重甲、攻击强度；武器只有「棺」（葬棺）');
  check(Object.keys(C.skills).length === 18 && C.ext!.book!.choices.skill4!.length === 5 && Object.values(C.ext!.book!.choices).flat().every(id => !!C.skills[id as string]), `技能 ${Object.keys(C.skills).length} 个（15 + 3 扩展天赋绝技），可选项都存在`);
  check(C.ext!.book!.runes.length === 51 && C.ext!.book!.runes.every(r => !!C.skills[r.skillId]) && C.ext!.book!.presets.length === 3, `符文 ${C.ext!.book!.runes.length} 枚、推荐配装 3 套`);
  const bd = CL.skillBookData(C); const book = new SB.SkillBook(bd);
  check(book.skillAt('skill1').id === 'cf_drag' && !!bd.talentOnly?.has('cf_u_mountain'), '技能书：默认拖棺冲锋；扩展天赋绝技只能由天赋学会');
  const tree = new TT.TalentTree(C.tree, 21);
  const caps = C.tree.specs.map(sp => sp.nodes.filter(n => n.capstone).map(n => n.name).join());
  check(C.tree.specs.map(s => s.name).join() === '送葬者,饮血者,凋魂者' && tree.nodes.length === 45 && caps.join() === '满棺齐放,血棺,冥河凋零', `3 专精 ${tree.nodes.length} 个天赋，终极 ${caps.join(' / ')}`);
  check(C.tree.specs.every(sp => sp.nodes.filter(n => n.kind === 'choice').length === 4 && sp.nodes.some(n => n.capstone && n.row === 6)), '每系 4 个关键节点 + 绝技（天赋 3.0，方案 B）');
  { const t4 = new TT.TalentTree(C.tree, 30); t4.load({ __v: 3, cs_iron: 2 }); const sv = t4.save(); check(t4.migrated && t4.spent === 0 && sv.__v === 4, `方案 B：负棺人旧天赋页（版本 3）全额返还，新存档版本 ${sv.__v}`); }
  check(packList<{ cls: string; layers: unknown[][] }>('talentTier').some(t => t.cls === 'coffin' && t.layers.map(l => l.length).join() === '1,2,1,2,3'), '扩展天赋层（31–40）：负棺人一棵，1/2/1/2/3');
  const r = RC.newRes('coffin');
  check(r.kind === 'soul' && RC.resMax(r) === 3 && RS.RES_DEF.coffin?.name === '棺中魂', '资源：棺中魂（0–3）');
  RC.resOnHit(r, 'basic', 'e1', 1); check(r.value === 0, '命中不加魂（只有击杀收魂）');
  const cb = LD.LOOT_DATA.bases.filter(b => b.cls === 'coffin');
  check(cb.length === 9 && cb.every(b => (b as { pack?: string }).pack === 'dlc1') && cb.filter(b => b.armorType === 'plate').length === 8, '底材：重甲 8 件 + 葬棺（打上包标记）');
  const gen = new LG.LootGenerator(LD.LOOT_DATA); gen.classId = 'coffin';
  const its = Array.from({ length: 60 }, () => gen.generate(20, 'blue'));
  const arm = its.filter(i => i.armorType), wpn = its.filter(i => i.weaponType);
  check(arm.every(i => i.armorType === 'plate') && wpn.every(i => i.weaponType === 'coffin'), `负棺人掉落：护甲全是重甲（${arm.length}），武器只有葬棺（${wpn.length}）`);
  const inv = new INV.Inventory(); inv.rules = C.equip;
  const mail = { id: 'p', baseId: 'b_h_hauberk', name: '链甲', slot: 'chest', quality: 'blue', itemLevel: 10, hp: 1, armor: 1, modifiers: [], lines: [], sellPrice: 1, armorType: 'mail' } as unknown as import('./core/Loot').ItemInstance;
  check(!inv.canEquip(mail) && inv.canEquip({ ...mail, armorType: 'plate' } as typeof mail), '穿戴：重甲可以，链甲不行');
  check(SPI.SPIRITS.filter(s => s.cls === 'coffin').length === 12 && CQ.CLASS_QUESTS.filter(q => q.cls === 'coffin').length === 2 && /天赋点 \+1/.test(CQ.QUEST_PERKS.cq_coffin1 ?? ''), '英灵 12 个；职业任务 2 个（+1 天赋点）');
  // 魂判定 + 组合表
  check(CS.soulOf('wolf', '灰鬃狼') === 'beast' && CS.soulOf('cultist', '邪教徒') === 'man' && CS.soulOf('treant', '树人') === 'giant' && CS.soulOf('ice_elemental', '冰元素') === 'eldritch' && CS.soulOf('raider', '强盗头子', true) === 'giant', '魂判定：狼=野兽 / 邪教徒=人形 / 树人=巨躯 / 冰元素=异类 / 精英人形=巨躯');
  const keys = new Set(CS.COMBOS.map(c => c.key)), names = new Set(CS.COMBOS.map(c => c.name));
  check(CS.COMBOS.length === 20 && keys.size === 20 && names.size === 20, '开棺组合 20 种（4 类魂取 3 个，键 / 名字都不重复）');
  check(CS.comboOf(['giant', 'giant', 'giant']).name === '葬山' && CS.comboOf(['eldritch', 'beast', 'man']).name === '百鬼送葬' && CS.comboOf(['man', 'beast', 'eldritch']).name === '百鬼送葬', '3 巨躯 = 葬山；野兽 + 人形 + 异类 = 百鬼送葬（顺序无关）');
  check(CS.comboOf(['beast']).name.startsWith('残魂出棺') && CS.comboOf(['beast', 'man']).skill.stats.damage === 140, '1–2 魂 = 残魂出棺（伤害按魂数）');
  // 棺态修饰器
  const res = new SR.SkillResolver(new CT.ComboTracker()); const cx = { now: 0, casterHpPercent: 1, targetEffects: [] };
  const sb = res.resolve(C.skills.cf_swing, CR.modeMods('back'), cx), sp = res.resolve(C.skills.cf_swing, CR.modeMods('planted'), cx);
  check(sb.shape === 'circle' && sb.stats.radius >= 3 && sb.displayName === '链甩·棺击' && sp.shape === 'single', `背棺：普攻变 ${sb.displayName}（半径 ${sb.stats.radius}）；立棺：单体`);
  const sw = res.resolve(C.skills.cf_sweep, CR.modeMods('back'), cx);
  check(sw.stats.radius > 5.5, `背棺：链棺横扫范围 ${sw.stats.radius.toFixed(2)}`);
  // 运行时
  let now = 0, rv = 0, healed = 0; const fired: string[] = [], fromT: string[] = [], slowed: unknown[] = []; let mods: unknown[] = [];
  const P = { alive: true, hp: 100, maxHp: 1000, armor: 0, getPos: () => ({ x: 0, z: 0 }) };
  const mk = (kind: string, elite = false) => ({ alive: true, hp: 0, maxHp: 100, kind, elite, getPos: () => ({ x: 2, z: 0 }) });
  const E = { alive: true, hp: 100, maxHp: 100, getPos: () => ({ x: 2, z: 0 }) };
  const api = { now: () => now, toast() {}, player: () => P, playerObj: () => null, target: () => E, enemiesNear: () => [E], damage: () => 0, heal: (n: number) => { healed += n; }, fire: (d: { id: string }) => { fired.push(d.id + (JSON.stringify(mods).includes('coffin:open') ? '+' : '')); return null; }, setMods: (m: unknown[]) => { mods = m; }, refreshBar() {},
    res: () => ({ value: rv, max: 3 }), resAdd: (n: number) => { rv += n; }, resSpend: (n: number) => { if (rv < n - 1e-6) return false; rv -= n; return true; }, talentRank: () => 0, questDone: () => false, weapons: () => ({}), ring() {}, playAnim() {}, level: () => 20,
    unitKind: (t: { kind?: string; elite?: boolean }) => ({ kind: t.kind ?? '', name: '', elite: !!t.elite }),
    fireFrom: (d: { id: string }, at: { x: number; z: number }) => { fromT.push(`${d.id}@${at.x},${at.z}` + (JSON.stringify(mods).includes('墓·') ? '墓' : '')); return null; },
    slow: (t: unknown) => { slowed.push(t); } };
  const RT = CR.COFFIN_RUNTIME; RT.bind!(api as unknown as import('./core/ClassExt').ClassExtApi); RT.reset!();
  const D = () => RT.debug!() as { mode: string; souls: string[]; last: string; rest: boolean; stats: { revives: number; echoes: number; deaths: number } };
  check(D().mode === 'back' && JSON.stringify(mods).includes('链甩·'), '开局背棺（挂上背棺修饰器）');
  RT.onDealt!(mk('wolf') as never, 50, 'physical', false, false); RT.onDealt!(mk('cultist') as never, 50, 'physical', false, false);
  const alive = { ...mk('treant'), hp: 10 }; RT.onDealt!(alive as never, 5, 'physical', false, false);
  check(D().souls.join() === 'beast,man' && rv === 2, `击杀收魂：狼 → 野兽、邪教徒 → 人形；没打死不收（魂 ${D().souls.join()}，资源 ${rv}）`);
  const w2 = mk('wolf'); RT.onDealt!(w2 as never, 1, 'physical', false, false); RT.onDealt!(w2 as never, 1, 'physical', false, false); RT.onDealt!(mk('golem') as never, 1, 'physical', false, false);
  check(D().souls.length === 3 && rv === 3, '同一只怪只收一次；最多 3 个魂');
  now = 1; RT.key!('x');
  check(fired.length === 1 && D().last === '猎犬押解' && D().souls.length === 0 && rv === 0, `X 开棺：野兽 + 人形 + 野兽 → ${D().last}（${fired[0]}），魂清空`);
  now = 2; CR.debugSouls(['giant', 'giant', 'giant']); RT.key!('x');
  check(D().last === '葬山' && fired[1] === 'cf_open_GGG', '3 巨躯开棺 = 葬山');
  now = 3; RT.key!('x'); check(fired.length === 2, '空棺不能开');
  { // v1.2.27 首领战收魂
    const B = { alive: true, hp: 1000, maxHp: 1000, isBoss: true, kind: 'golem', getPos: () => ({ x: 2, z: 0 }) };
    RT.onDealt!(B as never, 40, 'physical', false, false); const n0 = D().souls.length;
    RT.onDealt!(B as never, 70, 'physical', false, false);
    check(n0 === 0 && D().souls.length === 2, `首领每掉 5% 最大生命抽 1 个魂（4% → ${n0}，累计 11% → ${D().souls.length}）`);
    CR.debugSouls([]);
    const sk = { baseId: 'cf_chainline', slot: 'skill2', tags: ['coffin'], effects: [], stats: { damage: 10 } };
    now = 10; RT.onHits!(sk as never, [B as never]); now = 12; RT.onHits!(sk as never, [B as never]);
    const n1 = D().souls.length; now = 18.5; RT.onHits!(sk as never, [B as never]);
    check(n1 === 1 && D().souls.length === 2, `锁魂链命中首领锁 1 个魂，8 秒一次（${n1} → ${D().souls.length}）`);
    RT.onHits!(sk as never, [mk('wolf') as never]);
    CR.debugSouls([]);
  }
  // 立棺：墓碑回响 + 减速
  now = 5; RT.key!('f');
  check(D().mode === 'planted' && JSON.stringify(mods).includes('coffin:grave'), 'F 立棺：墓碑插在脚下');
  RT.onCast!({ baseId: 'cf_sweep', slot: 'skill2', tags: ['coffin', 'grave'] } as never);
  RT.onCast!({ baseId: 'cf_drag', slot: 'skill1', tags: ['coffin', 'movement'] } as never);
  now = 5.3; RT.update!(0.3);
  check(fromT.length === 1 && fromT[0] === 'cf_sweep@0,0墓' && D().stats.echoes === 1, `立棺：技能从墓碑处再放一次（${fromT.join()}），位移技能不回响`);
  check(slowed.length > 0, '墓碑周围敌人被减速');
  now = 6; RT.key!('f'); check(D().mode === 'back', '再按 F 收棺');
  // 未亡
  CR.debugSouls(['man', 'beast']); P.hp = 100;
  const dmg = RT.preDeal!(P as never, 500, 'physical', true, false);
  check(dmg === 0 && D().rest && D().souls.length === 0, '致命伤害 → 入殓（这一下伤害吃掉、魂清空）');
  check(RT.preDeal!(P as never, 500, 'physical', true, false) === 0 && RT.canCast!({} as never) === false, '入殓中无敌、不能放技能');
  now = 8.1; RT.update!(0.1);
  check(!D().rest && D().stats.revives === 1 && Math.round(healed) === 300, `2 秒后以 2 个魂复活（回复 ${Math.round(healed)} = 30% 生命）`);
  CR.debugSouls(['man']);
  check(RT.preDeal!(P as never, 500, 'physical', true, false) === 500 && D().stats.deaths === 1, '未亡冷却中（90 秒）→ 真死');
  now = 200; CR.debugSouls([]);
  check(RT.preDeal!(P as never, 500, 'physical', true, false) === 500, '棺里没魂 → 真死');
  check(/背棺/.test(RT.status!() ?? ''), `状态行：${(RT.status!() ?? '').replace(/<[^>]+>/g, '')}`);
  // 模型
  const THREE = require('three') as typeof import('three');
  const CM = require('./dlc/dlc1/coffin_model') as typeof import('./dlc/dlc1/coffin_model');
  const got: { bone: string; o: import('three').Object3D }[] = [];
  CM.coffinDress({ H: 2, eq: { mainHand: { weaponType: 'coffin', quality: 'purple' } }, attach: (bone, o) => { got.push({ bone, o: o as import('three').Object3D }); return true; } });
  const back = got.find(g => g.o.name === 'coffin_back');
  check(got.length === 5 && back?.bone === 'chest' && !!back.o.getObjectByName('coffin_lid') && !!back.o.getObjectByName('coffin_soul_2'), '挂件 5 件：背上铁棺（棺盖 + 3 个魂窗）/ 棺链 / 兜帽铁面 / 寿衣布条 / 手中链钩');
  const bad = got.some(({ o }) => { let n = false; o.traverse(c => { const m = c as import('three').Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); if (!Number.isFinite(m.geometry.boundingBox!.max.x)) n = true; } }); return n; });
  check(!bad, '挂件几何体没有 NaN');
  const scene = new THREE.Scene(), root = new THREE.Group(); root.position.set(5, 0, 3); scene.add(root); root.add(back!.o);
  CM.coffinVisual(root, { mode: 'planted', souls: ['beast'], open: false, rest: false, tomb: { x: 5, z: 3 } });
  CM.coffinVisual(root, { mode: 'planted', souls: ['beast'], open: false, rest: false, tomb: { x: 5, z: 3 } });
  const graves = scene.children.filter(c => c.name === 'coffin_grave');
  check(graves.length === 1 && !back!.o.visible && graves[0].position.x === 5, '立棺：背上的棺隐去，场景里出现一块墓碑（重复调用不重复建）');
  CM.coffinVisual(root, { mode: 'back', souls: [], open: true, rest: true, tomb: null });
  check(!scene.getObjectByName('coffin_grave') && !!scene.getObjectByName('coffin_rest') && !root.visible && (back!.o.getObjectByName('coffin_lid')!.rotation.y > 1), '收棺墓碑消失；开棺棺盖打开；入殓角色隐去、地上躺棺');
  CM.coffinVisual(root, { mode: 'back', souls: [], open: false, rest: false, tomb: null });
  check(root.visible && !scene.getObjectByName('coffin_rest') && root.position.x === 5 && root.scale.x === 1 && back!.o.visible, '复活后恢复；不改父节点变换');
  _resetPacksForTest();
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/](data|core)[\\/]/.test(k) && !/ContentPacks|Entitlement/.test(k)) delete require.cache[k];
}

// ====================================================================== 15. v1.1.0 无声钟楼 + 第九章 + 命运的岔路
console.log('\n=== 15. v1.1.0 无声钟楼：第九章 + 5 首领 + 沉眠者 A/B + 岔路口');
{
  const { CH9_MAIN, CH9_A, CH9_B, CH9_QUESTS } = require('./dlc/dlc1/chapter9') as typeof import('./dlc/dlc1/chapter9');
  const BT = require('./dlc/dlc1/belltower') as typeof import('./dlc/dlc1/belltower');
  const FT = require('./dlc/dlc1/fate') as typeof import('./dlc/dlc1/fate');
  const MB = require('./dlc/dlc1/models_bt') as typeof import('./dlc/dlc1/models_bt');
  _resetPacksForTest(); registerPack(DLC1);
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/]data[\\/]/.test(k)) delete require.cache[k];
  const W = require('./data/world_map') as { locateObjective: (o: unknown) => { map: string } | null; NPC_HOME: Record<string, { map: string }> };
  check(CH9_MAIN.length === 4 && CH9_A.length === 6 && CH9_B.length === 6, '第九章 4 主线 + A 分支 6（含 v1.1.1 领地 3 个）/ B 分支 6（含 v1.1.2 渊噬之躯 3 个）');
  // v1.1.2 第 7 键按选择分发：extKey = [钟鸣, 吞噬]；包挂件 dress
  { const ks = Array.isArray(DLC1.extKey) ? DLC1.extKey : [];
    check(ks.length === 2 && ks[0].id === 'dlc1_chime' && ks[1].id === 'dlc1_devour' && typeof DLC1.dress === 'function', 'v1.1.2：第 7 键两个（钟鸣 / 吞噬，按选择互斥），dress 包挂件');
    check(CH9_B.slice(3).every(q => q.gate && q.requires?.length === 1) && CH9_B[3].requires![0] === 'cs9b_3', 'v1.1.2：9B-4..6 接在 9B-3 之后，只对断绳开放'); }
  check(CH9_MAIN[2].id === 'cs9_3' && (CH9_MAIN[2].tags ?? []).includes('抉择'), '9-3 是岔路口，带「抉择」标识');
  const lost = CH9_QUESTS.flatMap(q => q.objectives).filter(o => { const p = W.locateObjective(o); const dm = (o as { area?: string }).area?.startsWith('dm_q_'); return !p || p.map !== (dm ? 'dlc1_mirror' : 'dlc1_belltower'); });
  check(lost.length === 0, `每个目标都能定位到无声钟楼（领地任务定位到镜渊城）${lost.length ? '：缺 ' + JSON.stringify(lost) : ''}`);
  {   // v1.1.1 钟楼领地：数据 / 没选 A 时不生效
    const DMN = require('./dlc/dlc1/domain') as typeof import('./dlc/dlc1/domain');
    check(DMN.BUILDINGS.length === 8 && new Set(DMN.BUILDINGS.map(b => b.id)).size === 8 && DMN.BUILDINGS.every(b => b.lv.length === 3), '领地：8 座建筑，各 3 级');
    check(DMN.RESIDENTS.length === 12 && DMN.RULES.length === 7 && DMN.resCap(3) === 12, '领地：12 位回响居民（档案馆 3 级全住下）、7 条钟律');
    check(DMN.costOf('belfry', 1).gold < DMN.costOf('forge', 1).gold && DMN.costOf('forge', 3).gold > DMN.costOf('forge', 2).gold, '成本：钟楼一级打折，逐级递增');
    check(!DMN.domainOpen() && JSON.stringify(DMN.domainMods()) === '{}' && DMN.domainSave() === null, '没选再鸣：领地不开放、没有加成、不写存档');
  }
  const npcs = new Set(CH9_QUESTS.flatMap(q => [q.giver, q.turnIn])), miss = [...npcs].filter(n => n !== 'iola_m' && W.NPC_HOME[n]?.map !== 'dlc1_belltower');
  check(miss.length === 0, `任务 NPC 都在钟楼脚下（9-1 由镜渊城的伊奥拉发放）${miss.length ? '：' + miss : ''}`);
  check(BT.BT_BOSSES.length === 5 && BT.ALL_BT_BOSSES.length === 7, '5 个首领 + 沉眠者 A / B');
  check(BT.SLEEPER_A.boss.phases.length === 4 && BT.SLEEPER_B.boss.phases.length === 5, `沉眠者阶段：A ${BT.SLEEPER_A.boss.phases.length} / B ${BT.SLEEPER_B.boss.phases.length}（B 多一个完全觉醒阶段）`);
  const abIds = (b: typeof BT.SLEEPER_A) => new Set(b.boss.abilities.map(a => a.id));
  const badPh = BT.ALL_BT_BOSSES.filter(b => b.boss.phases.some(ph => ph.abilities.some(a => !abIds(b).has(a)) || (ph.onEnter && !abIds(b).has(ph.onEnter))));
  check(badPh.length === 0, `阶段引用的技能都存在${badPh.length ? '：' + badPh.map(b => b.key) : ''}`);
  const badAdd = BT.ALL_BT_BOSSES.filter(b => b.boss.abilities.some(a => a.kind === 'summon' && a.unit && !(b.adds ?? {})[a.unit]));
  check(badAdd.length === 0, '召唤物都有定义');
  // 首领 / 新怪模型
  for (const [id, f] of Object.entries(MB.BT_MODELS)) {
    const r = f() as { root: import('three').Object3D; flash: unknown[] }; const THREE = require('three') as typeof import('three');
    const sz = new THREE.Box3().setFromObject(r.root).getSize(new THREE.Vector3());
    check(r.flash.length >= 3 && sz.y > 0.9 && sz.y < 6.5 && Number.isFinite(sz.x), `${id}：可建模（高 ${sz.y.toFixed(2)}，材质 ${r.flash.length}）`);
  }
  // 岔路口：选择一次、不可更改、存档往返
  FT.btLoad(undefined);
  check(FT.fateChoice() === null && CH9_A[0].gate!() === false && CH9_B[0].gate!() === false && CH9_MAIN[3].gate!() === false, '未选择：9-4 / 分支都锁定');
  let heard: string | null = null; FT.DLC1_FATE.onChoose(f => { heard = f; });
  check(FT.chooseFate('B') && !FT.chooseFate('A') && FT.fateChoice() === 'B' && heard === 'B', '选 B：写入、回调；之后不能再改');
  check(CH9_B[0].gate!() && !CH9_A[0].gate!() && CH9_MAIN[3].gate!(), '选 B：B 线 + 9-4 开放、A 线锁定');
  const sv = JSON.parse(JSON.stringify(FT.btSave())); FT.btLoad({ fate: 'X' }); check(FT.fateChoice() === null, '存档里无效的选择被忽略');
  FT.btLoad(sv); check(FT.fateChoice() === 'B', '存档往返：选择保留');
  const sd = DLC1.saveData!() as { bt?: { fate?: string } }; check(sd.bt?.fate === 'B', '包存档 dlc.dlc1.bt.fate');
  DLC1.loadData!({ v: 1, bells: [1] }); check(FT.fateChoice() === null && (DLC1.saveData!() as { bells?: number[] }).bells?.length === 1, '读没有 bt 的旧包存档：无选择、其它字段保留');
  check(FT.endingLines('A').length >= 6 && FT.endingLines('B').length >= 6, '双结局字幕');
  // 传送阵
  const ctx = { toast() {}, yell() {}, level: () => 38, classId: () => 'mage', map: () => 'camp', toCamp() {}, openPanel() {}, save() {}, goMap: () => true, playerPos: () => ({ x: 0, z: 0 }), setMoveMul() {}, dropLoot() {}, questState: (id: string) => id === 'cs8_6' ? 'done' : 'locked', teleport() {},
    spawnBoss: () => true, bossState: () => 'none' as const, removeBoss() {}, banner() {}, synth: () => ({ tone() {}, noise() {}, gate: () => false }), addXp() {} };
  BT.bindBelltower(ctx);
  check(BT.BT_WAYPOINT.locked!() === null, '传送阵：37 级 + 第八章完成 → 开放');
  FT.btLoad(undefined);
  _resetPacksForTest();
  for (const k of Object.keys(require.cache)) if (/[\\/]dist[\\/](data|core)[\\/]/.test(k) && !/ContentPacks|Entitlement/.test(k)) delete require.cache[k];
}

console.log(failed ? `\n❌ ${failed} 项失败（通过 ${passed}）` : `\n✅ 内容包测试全部通过（${passed} 项）`);
if (failed) (globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1;
