// v0.8.0 / v0.8.1 暗岩深渊自检：npm run abyss
declare const process: { exitCode?: number };
import { abyssGearRatio } from './core/EndgameIlvl';
import { LootGenerator } from './core/Loot';
import { Inventory } from './core/Inventory';
import { Forge, RECAST } from './core/Forge';
import { LOOT_DATA } from './data/loot';
import { FORGE_DATA } from './data/shop';
import { newAbyRun, floorPlan, pathChoices, applyPath, floorScale, floorReward, nextMut, abyFinish, newAbySave, abyLoadSave, isBossFloor, AbyState } from './core/Abyss';
import { ABYSS, MUTS, MutId, PATHS, MUTS_EARLY } from './data/abyss';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const J = (x: unknown) => JSON.stringify(x);
// 确定性
const a = newAbyRun(12345), b = newAbyRun(12345), c = newAbyRun(999);
ok(J(a) === J(b) && J(pathChoices(a)) === J(pathChoices(b)) && J(floorPlan(a, 7)) === J(floorPlan(b, 7)), '同种子：副本、岔路、每层计划完全相同');
let diff = 0; for (let s = 1; s <= 40; s++) if (J(newAbyRun(s).dungeons) !== J(newAbyRun(s + 1000).dungeons) || J(pathChoices(newAbyRun(s))) !== J(pathChoices(newAbyRun(s + 1000)))) diff++;
ok(diff >= 20, `不同种子会变（40 对里 ${diff} 对不同）`);
ok(a.dungeons.length === 4 && new Set(a.dungeons.slice(0, 3)).size === 3 && a.dungeons[3] === a.dungeons[0] && a.dungeons.every(d => (ABYSS.dungeons as readonly string[]).includes(d)), `四段场地：前三段三座不同副本，16–20 回到第一座（${a.dungeons.join(' / ')}）`);
// 每层计划
const plans = Array.from({ length: 20 }, (_, i) => floorPlan(a, i + 1));
ok(plans.filter(p => p.boss !== null).map(p => p.floor).join() === '5,10,15,20', '首领层 = 5、10、15、20');
ok(plans[9].boss === 2 && plans[14].boss === 2 && plans[19].boss === 3 && [0, 1].includes(plans[4].boss!), `10 / 15 层最终首领，20 层隐藏首领，第 5 层第 1/2 首领（${plans[4].boss}）`);
ok(plans.every(p => p.boss !== null || (p.mobs >= 4 && p.room >= 0 && p.room <= 2)), `普通层怪数 ${plans.filter(p => p.boss === null).map(p => p.mobs).join(',')}`);
ok([0, 1, 2, 3].every(k => plans.slice(k * 5, k * 5 + 5).every(p => p.dungeon === a.dungeons[k])), '每 5 层一段场地');
// 缩放
const s1 = floorScale(1), s10 = floorScale(10);
ok(Math.abs(s1.hp - abyssGearRatio(1)) < 0.01 && Math.abs(s10.hp - Math.pow(1.08, 9) * abyssGearRatio(10)) < 0.01 && Array.from({ length: 19 }, (_, i) => floorScale(i + 2).hp > floorScale(i + 1).hp).every(Boolean), `生命（v0.9.1q 按新装等档）：第 1 层 ×${s1.hp} → 第 10 层 ×${s10.hp}，逐层上升`);
ok(Array.from({ length: 9 }, (_, i) => floorScale(i + 2).dmg > floorScale(i + 1).dmg).every(Boolean), '伤害逐层上升');
ok(floorScale(10, ['fury']).hz <= ABYSS.hzCap && floorScale(3, ['tough']).hp > floorScale(3).hp * 1.29 && floorScale(3, ['swift']).speed === 1.3, '畸变：坚韧 / 狂暴 / 迅捷生效，机制伤害封顶');
ok([1, 5, 6, 10, 11, 15, 16, 20].map(f => floorScale(f).ilvlMob).join() === '40,40,45,45,50,50,55,55' && floorScale(20).ilvlBoss === 55, `装等（v0.9.1q）：1-5 层 40 · 6-10 层 45 · 11-15 层 50 · 16-20 层 55`);
// 岔路
const allCh: string[][] = []; for (let s = 1; s <= 200; s++) { let st = newAbyRun(s); for (let f = 1; f < 20; f++) { const ch = pathChoices(st); allCh.push(ch); st = applyPath(st, ch[0]).state; } }
ok(allCh.every(ch => ch.length >= 2 && ch.length <= 3 && new Set(ch).size === ch.length), '每层 2–3 个不重复岔路');
ok(pathChoices({ ...a, floor: 20 }).length === 0 && pathChoices({ ...a, floor: 10 }).length >= 2, '第 20 层没有岔路（10 层之后继续）');
ok(!pathChoices(a).includes('rest'), '没有畸变时不出篝火');
const pre5 = pathChoices({ ...a, floor: 4 }); ok(pre5.length === 2, '首领层前只给 2 个岔路');
const m = applyPath(a, 'mutate'); ok(m.state.floor === 2 && m.state.muts.length === 1 && m.state.bonus === 1.25 && a.muts.length === 0, `畸变岔路：+${MUTS[m.added!].name}，奖励 ×1.25，原状态不变`);
const r = applyPath(m.state, 'rest'); ok(r.heal === true && r.state.muts.length === 0 && r.state.bonus === 1, '篝火：回血 + 移除畸变 + 奖励回落');
const e = applyPath(a, 'elite'); ok(e.state.elite && floorPlan(e.state).elite, '精英之路：下一层有精英');
const ch = applyPath(a, 'chest'); ok(!!ch.chest && ch.chest.rolls === 2 && ch.chest.gold > 0, `宝箱：${ch.chest?.gold} 金 + ${ch.chest?.rolls} 件`);
let st: AbyState = a; for (let i = 0; i < 6; i++) st = applyPath(st, 'mutate').state;
ok(st.muts.length === 6 && new Set(st.muts).size === 6 && st.muts.every(m => MUTS_EARLY.includes(m)) && nextMut(st) === null && !pathChoices(st).includes('mutate'), '前 10 层只出 6 种老畸变，满了不再出畸变裂隙');
let st2: AbyState = { ...a, floor: 10 }; for (let i = 0; i < 12; i++) st2 = applyPath(st2, 'mutate').state;
ok(st2.muts.length === 12 && new Set(st2.muts).size === 12 && nextMut(st2) === null, `11 层起 12 种畸变都可能（${st2.muts.map(m => MUTS[m].name).join('')}）`);
let newSeen = 0; for (let sd = 1; sd <= 50; sd++) { const m = nextMut({ ...newAbyRun(sd), floor: 10 }); if (m && !MUTS_EARLY.includes(m)) newSeen++; }
ok(newSeen >= 15, `进 11 层时畸变裂隙会给新畸变（50 次里 ${newSeen} 次）`);
const hord = floorPlan({ ...a, muts: ['horde' as MutId], floor: 2 }); ok(hord.mobs === Math.round(5 * 1.5), `增援：怪数 5 → ${hord.mobs}`);
// 奖励 / 存档
const r1 = floorReward(1, 1), r5 = floorReward(5, 1), r3e = floorReward(3, 1.25, true);
ok(r5.rolls === 2 && r1.rolls === 1 && r3e.gold > floorReward(3, 1).gold * 1.8 && r5.paragon === 600, `奖励：1 层 ${r1.gold} 金，5 层 ${r5.gold} 金 + ${r5.rolls} 件，精英+畸变 3 层 ${r3e.gold} 金`);
const sv = newAbySave(); ok(abyFinish(sv, { ...a, t: 300 }, 4, false) && sv.best === 4 && sv.runs === 1 && !abyFinish(sv, a, 3, false) && sv.best === 4, '最高层只升不降');
const bt1 = (abyFinish(sv, { ...a, t: 500 }, 10, true), sv.bestTime); ok(sv.clears === 1 && bt1 === 500 && abyFinish(sv, { ...a, t: 400 }, 10, true) && sv.bestTime === 400, '通关记录用时，更快的刷新');
ok(J(abyLoadSave(null)) === J(newAbySave()) && abyLoadSave({ best: 99 as number }).best === 20, '存档读取：空 / 越界');
ok(Object.keys(PATHS).length === 4 && Object.keys(MUTS).length === 12 && isBossFloor(5) && !isBossFloor(6), '4 种岔路、12 种畸变');
ok(floorReward(1, 1).shards === 1 && floorReward(5, 1).shards === 7 && floorReward(20, 1).shards === 10 && floorReward(20, 1.5).shards === 15, `深渊碎片：1 层 1、5 层 7、20 层 10（×倍率）`);
const full = [5, 10, 15, 20].reduce((t, f) => t + floorReward(f, 1).shards, 0) + Array.from({ length: 20 }, (_, i) => i + 1).filter(f => !isBossFloor(f)).reduce((t, f) => t + floorReward(f, 1).shards, 0);
ok(full >= ABYSS.recastShards * 3 && full <= ABYSS.recastShards * 6, `一趟 20 层不加倍率约 ${full} 片碎片 ≈ ${(full / ABYSS.recastShards).toFixed(1)} 次重铸`);
// v0.8.1 暗金重铸
{
  let sd = 77; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const gen = new LootGenerator(LOOT_DATA, rr); gen.classId = 'warrior';
  const inv = new Inventory(30, { hp: 0, armor: 0 }); const forge = new Forge(FORGE_DATA, inv, rr);
  ok(RECAST.shards === ABYSS.recastShards && RECAST.gold === ABYSS.recastGold && forge.stackDef('mat_abyss')?.name === '深渊碎片', '深渊碎片注册，重铸价格两处一致');
  const dark = gen.generateFixed('d_bloodoath', 40)!; inv.add(dark);
  const blue = gen.generate(40, 'blue'); inv.add(blue);
  ok(!!blue && forge.whyCannotRecast(blue, 0) === '只有暗金装备能重铸', '非暗金不能重铸');
  ok((dark.affixLog?.length ?? 0) >= 2, `暗金有 ${dark.affixLog?.length} 条随机词条`);
  ok(/深渊碎片不足|金币不足/.test(forge.whyCannotRecast(dark, 0) ?? ''), `没材料：${forge.whyCannotRecast(dark, 0)}`);
  inv.addGold(1e6); inv.addStack('mat_abyss', 200);
  ok(forge.whyCannotRecast(dark, 9) === '先选一条要锁定的词条', '锁定序号越界被拒');
  let keepOk = true, changed = 0; const lines0 = dark.lines.join('|');
  for (let k = 0; k < 8; k++) {
    const lockId = JSON.stringify(dark.affixLog![0]), before = dark.affixLog!.slice(1).map(a => a.id + a.r).join();
    const why = forge.recast(dark, 0, gen); if (why) { keepOk = false; break; }
    if (JSON.stringify(dark.affixLog![0]) !== lockId) keepOk = false;
    if (dark.affixLog!.slice(1).map(a => a.id + a.r).join() !== before) changed++;
  }
  ok(keepOk && changed >= 7, `重铸 8 次：锁定的词条始终不变，其余变了 ${changed} 次`);
  ok(inv.stack('mat_abyss') === 200 - 8 * RECAST.shards && dark.lines.join('|') !== lines0 && dark.quality === 'dark' && dark.name.includes('血誓') || dark.quality === 'dark', `扣碎片（剩 ${inv.stack('mat_abyss')}），仍是暗金`);
}
console.log(fail ? `❌ ${fail} 项失败` : '✅ 全部通过');
if (fail) process.exitCode = 1;
