// 运行：npm run zone —— 命令行测试「翠风原野」：任务链能否完成、A* 寻路能否绕开障碍/河流（走桥或浅滩）、
// 副本门的动态阻挡、自动寻路的取消规则（手动操作 / 受伤 / 进入战斗 / 到达）、跨区域指引、经验曲线估算
import { NavGrid, pathLength, Pos2 } from './core/NavGrid';
import { AutoPath } from './core/AutoPath';
import { QuestLog } from './core/Quest';
import { questTarget, nextHop, trackedList } from './core/QuestGuide';
import { Progression, MAX_LEVEL } from './core/TalentTree';
import { QUESTS, NPCS } from './data/quests';
import { fieldObstacles, fieldSolid, FIELD_BOUNDS, FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, riverZ, RIVER_HALF, BRIDGE, FORD, CHIEF_ROUTE, RARE_SPOTS } from './data/zone_field';
import { AREAS, MAP_LINKS, NPC_HOME, locateObjective, mapAt } from './data/world_map';
import { LOOT_TABLES } from './data/loot';

declare const process: { exitCode?: number };
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };
const F = FIELD_ORIGIN;
const W = (x: number, z: number) => ({ x: F.x + x, z: F.z + z });

// ====================================================================== 1. 原野寻路
console.log('== 翠风原野：A* 寻路 ==');
const obstacles = fieldObstacles();
const t0 = Date.now();
const nav = new NavGrid(FIELD_BOUNDS, obstacles, { solid: fieldSolid });
console.log(`网格 ${nav.w}×${nav.h}，障碍 ${obstacles.length} 个，建网格 ${Date.now() - t0} ms，阻挡格 ${nav.blocked.reduce((a, b) => a + b, 0)}`);
const arrive = W(FIELD_SPOTS.arrive.x, FIELD_SPOTS.arrive.z);
check(nav.isFree(arrive.x, arrive.z), '传送落脚点可走');

/** 检查一条路径：每 0.25 米采样都不在河里、不在任何障碍里（留 0.3 米角色半径） */
function pathOk(from: Pos2, path: Pos2[]) {
  let a = from, bad = 0, crossings: number[] = [];
  for (const b of path) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.25));
    for (let k = 1; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      if (fieldSolid(x, z) || obstacles.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 0.3)) bad++;
      const lx = x - F.x, lz = z - F.z;
      if (Math.abs(lz - riverZ(lx)) < RIVER_HALF) crossings.push(lx);
    }
    a = b;
  }
  return { bad, crossings };
}
const dests: [string, Pos2][] = [
  ['星落祭坛', { x: AREAS.ruins_altar.x, z: AREAS.ruins_altar.z + 3 }],
  ['守林人老柯', NPC_HOME.ke],
  ['劫掠者营地', AREAS.bandit_camp],
  ['哨卫长罗文（栅栏里）', NPC_HOME.rowan],
  ['野猪草甸', AREAS.boar_meadow],
  ['赤鬃路线', CHIEF_ROUTE[1]],
];
for (const [name, g] of dests) {
  const t = Date.now();
  const p = nav.findPath(arrive.x, arrive.z, g.x, g.z);
  if (!p) { check(false, `落脚点 → ${name}：找不到路`); continue; }
  const L = pathLength(arrive, p), straight = Math.hypot(g.x - arrive.x, g.z - arrive.z);
  const { bad, crossings } = pathOk(arrive, p);
  const viaBridge = crossings.every(x => (x > BRIDGE.x0 - 0.5 && x < BRIDGE.x1 + 0.5) || (x > FORD.x0 - 0.5 && x < FORD.x1 + 0.5));
  check(bad === 0 && viaBridge && Math.hypot(p[p.length - 1].x - g.x, p[p.length - 1].z - g.z) < 2.5,
    `落脚点 → ${name}：${p.length} 个路点，${L.toFixed(0)} 米（直线 ${straight.toFixed(0)} 米），展开 ${nav.lastExpanded} 格，${Date.now() - t} ms，` +
    `穿障碍 ${bad} 次，${crossings.length ? `过河 x≈${(crossings.reduce((a, b) => a + b, 0) / crossings.length).toFixed(1)}（桥/浅滩）` : '不过河'}`);
}
// 过河必须走桥：从桥东边 30 米的南岸到正对面的北岸
{
  const a = W(30, riverZ(30) + 8), b = W(30, riverZ(30) - 8);
  const p = nav.findPath(a.x, a.z, b.x, b.z)!;
  const { bad, crossings } = pathOk(a, p);
  const L = pathLength(a, p);
  check(!!p && bad === 0 && crossings.length > 0 && crossings.every(x => x > BRIDGE.x0 - 0.5 && x < BRIDGE.x1 + 0.5) && L > 50,
    `隔河 16 米的两点：绕到木桥过河，路线 ${L.toFixed(0)} 米`);
  check(!nav.lineOfSight(a, b), '直线被河挡住（视线检测）');
}
// 进栅栏只能走门：栅栏外东侧 → 栅栏里
{
  const a = W(20, 48), b = W(6, 48);
  const p = nav.findPath(a.x, a.z, b.x, b.z)!;
  const { bad } = pathOk(a, p);
  const L = pathLength(a, p);
  check(!!p && bad === 0 && L > 20, `栅栏外 14 米 → 栅栏里：从门绕进去 ${L.toFixed(0)} 米`);
}
// 终点在河里 / 障碍里：自动吸附到最近可走点
{
  const g = W(20, riverZ(20));
  const p = nav.findPath(arrive.x, arrive.z, g.x, g.z);
  check(!!p && !fieldSolid(p[p.length - 1].x, p[p.length - 1].z), '终点落在河里：吸附到岸边');
}
// 怪物刷新点、NPC、稀有点都可走
const spots: [string, Pos2][] = [...FIELD_PACKS.map((p, i) => [`怪群 ${i + 1}（${p.kinds.join('/')}）`, p] as [string, Pos2]),
  ...RARE_SPOTS.map((p, i) => [`稀有点 ${i + 1}`, p] as [string, Pos2]), ...CHIEF_ROUTE.map((p, i) => [`精英路点 ${i + 1}`, p] as [string, Pos2]),
  ...Object.entries(FIELD_NPCS).map(([k, v]) => [NPCS[k].name, W(v.x, v.z)] as [string, Pos2])];
const unreachable = spots.filter(([, p]) => !nav.findPath(arrive.x, arrive.z, p.x, p.z));
check(unreachable.length === 0, `${spots.length} 个刷新点/路点/NPC 都能走到${unreachable.length ? '，到不了：' + unreachable.map(s => s[0]).join('、') : ''}`);

// ====================================================================== 2. 小网格：绕墙 / 封死 / 动态门
console.log('\n== 小网格：绕墙、封死、动态阻挡 ==');
{
  const wall = Array.from({ length: 15 }, (_, i) => ({ x: 0, z: -7 + i, r: 0.5 }));   // x=0 一堵墙，z ∈ [-7, 7]
  const g = new NavGrid({ x0: -10, z0: -10, x1: 10, z1: 10 }, wall, { agentR: 0.3 });
  const p = g.findPath(-5, 0, 5, 0)!;
  const L = pathLength({ x: -5, z: 0 }, p);
  check(!!p && L > 14 && p.every(q => !wall.some(c => Math.hypot(q.x - c.x, q.z - c.z) < c.r)), `墙挡在中间：绕行 ${L.toFixed(1)} 米（直线 10 米），${p.length} 个路点`);
  const sealed = new NavGrid({ x0: -10, z0: -10, x1: 10, z1: 10 }, [], { solid: (x) => Math.abs(x) < 0.6 });
  check(sealed.findPath(-5, 0, 5, 0) === null, '完全封死：返回 null');
  let gateOpen = false;
  const corridor = new NavGrid({ x0: -6, z0: -50, x1: 6, z1: 8 }, [], { solid: (x) => Math.abs(x) > 5, dynamic: (_x, z) => !gateOpen && Math.abs(z + 24) < 0.8 });
  check(corridor.findPath(0, 4, 0, -40) === null, '副本门关着：门后到不了');
  gateOpen = true;
  const pc = corridor.findPath(0, 4, 0, -40);
  check(!!pc && pathLength({ x: 0, z: 4 }, pc) < 46, `门打开：直接走到门后（${pc ? pathLength({ x: 0, z: 4 }, pc).toFixed(0) : '-'} 米）`);
  // 碰撞：推出圆形障碍；不能走进河里
  const pp = { x: 0.1, z: 0 }; g.collide(pp, 0.4);
  check(Math.hypot(pp.x, pp.z) >= 0.9 - 1e-6, `碰撞：站进障碍会被推出（${pp.x.toFixed(2)}, ${pp.z.toFixed(2)}）`);
  const prev = W(20, riverZ(20) + RIVER_HALF + 0.5), into = W(20, riverZ(20));
  const res = nav.resolveMove(prev, { ...into });
  check(!fieldSolid(res.x, res.z), '走进河里会被挡回岸上');
}

// ====================================================================== 3. 自动寻路：沿路线跑到目的地 + 取消规则
console.log('\n== 自动寻路 ==');
{
  const goalA = AREAS.ruins_altar;
  const path = nav.findPath(arrive.x, arrive.z, goalA.x, goalA.z)!;
  const ap = new AutoPath();
  const stops: string[] = []; ap.onStop = r => stops.push(r);
  ap.start(path, goalA, 0, goalA.r);
  const pos = { ...arrive }; let t = 0; const dt = 0.05;
  while (ap.active && t < 120) {
    const dir = ap.step(pos, t, { manual: false, lastHurt: -99, inCombat: false });
    if (dir) { const prev = { ...pos }; pos.x += dir.x * 6.5 * dt; pos.z += dir.z * 6.5 * dt; nav.resolveMove(prev, pos); }
    t += dt;
  }
  check(stops[0] === 'arrived' && Math.hypot(pos.x - goalA.x, pos.z - goalA.z) <= (goalA.r ?? 2) + 0.1, `沿路线跑到星落祭坛：${t.toFixed(1)} 秒，停止原因 ${stops[0]}`);
  const run = (input: { manual?: boolean; hurtAt?: number; combat?: boolean }, after = 1) => {
    const a = new AutoPath(); a.start(path, goalA, 10, goalA.r);
    const p = { ...arrive }; let tt = 10, why = '';
    a.onStop = r => { why = r; };
    while (a.active && tt < 30) {
      const late = tt - 10 >= after;
      a.step(p, tt, { manual: late && !!input.manual, lastHurt: late && input.hurtAt !== undefined ? tt : (input.hurtAt ?? -99), inCombat: late && !!input.combat });
      p.z -= 0.2; tt += 0.05;
    }
    return why;
  };
  check(run({ manual: true }) === 'input', '摇杆/WASD 手动操作 → 取消（input）');
  check(run({ hurtAt: 0 }) === 'damage', '开始后受到伤害 → 取消（damage）');
  const old = new AutoPath(); old.start(path, goalA, 10, goalA.r);
  check(old.step({ ...arrive }, 10.1, { manual: false, lastHurt: 9, inCombat: false }) !== null && old.active, '开始前的旧伤害不会取消');
  check(run({ combat: true }) === 'combat', '有怪物追击/攻击（进入战斗）→ 取消（combat）');
  const e = new AutoPath(); let r0 = ''; e.onStop = r => { r0 = r; };
  check(!e.start([], goalA, 0) && r0 === 'nopath', '空路线：不启动（nopath）');
}

// ====================================================================== 4. 任务链 + 指引
console.log('\n== 翠风原野任务链 ==');
{
  const log = new QuestLog(QUESTS, () => 0.3);
  const prog = new Progression(MAX_LEVEL);
  prog.load({ level: 9, xp: 0 });
  log.load({ active: {}, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine'] });
  const lv = () => prog.level;
  const fieldIds = QUESTS.filter(q => q.id.startsWith('q_field')).map(q => q.id);
  check(fieldIds.length === 6, `原野任务 ${fieldIds.length} 个：${fieldIds.map(id => log.def(id).name).join('、')}`);
  const fieldOnly = QUESTS.filter(q => (q.giver === 'rowan' || q.giver === 'qinghe') && q.id.startsWith('q_'));   // 阶段四：罗文还会给出去赤砂裂谷的 rs_news
  check(fieldOnly.length === 5 && new Set(fieldOnly.flatMap(q => q.objectives.map(o => o.type))).size >= 4, `前哨 NPC 发布 ${fieldOnly.length} 个任务，目标类型 ${[...new Set(fieldOnly.flatMap(q => q.objectives.map(o => o.type)))].join('/')}`);
  const fresh = new QuestLog(QUESTS); fresh.load({ active: {}, done: ['q_wolves'] });
  check(fresh.state('q_field_news', 9) === 'locked', '没通关暗岩矿洞：原野任务锁定');
  check(log.state('q_field_news', lv()) === 'available' && log.npcMarker('tom', lv()) === '!', '通关矿洞后：老汤头顶「!」给出「翠风原野」');
  const npcName = (id: string) => NPCS[id].name;
  const target = (id: string) => { const a = log.active().find(x => x.q.id === id)!; return questTarget(log, a.q, a.p, a.ready, locateObjective, NPC_HOME, npcName); };
  let gained = 0;
  const turn = (id: string) => { const r = log.turnIn(id, lv()); if (r) { gained += r.xp; prog.addXp(r.xp); } return !!r; };
  const kill = (kind: string, n: number) => { for (let i = 0; i < n; i++) { log.onKill(kind); const m = FIELD_MOBS[kind]; if (m) { prog.addXp(m.xp); gained += m.xp; } } };
  log.accept('q_field_news', lv());
  const tn = target('q_field_news')!;
  check(tn.point.map === 'field' && tn.label.includes('罗文') && tn.kind === 'objective', `「翠风原野」指引：${tn.label} → ${tn.point.map}`);
  const hop = nextHop('camp', 'field', MAP_LINKS)!;
  check(hop.name === '原野石门' && hop.x === 0 && hop.z === 40, `在营地：先去「${hop.name}」(${hop.x}, ${hop.z})`);
  log.onTalk('rowan');
  check(log.state('q_field_news', lv()) === 'ready' && log.npcMarker('rowan', lv()) === '?', '和罗文对话后可交（罗文头顶黄色 ?）');
  turn('q_field_news');
  check(log.npcMarker('rowan', lv()) === '!' && log.npcMarker('qinghe', lv()) === '!', '罗文、青禾头顶「!」');
  ['q_field_boars', 'q_field_supplies'].forEach(id => log.accept(id, lv()));
  check(log.npcMarker('rowan', lv()) === '…', '接了野猪任务后罗文头顶灰色 ?（进行中）');
  const tb = target('q_field_boars')!;
  check(tb.point.map === 'field' && Math.hypot(tb.point.x - AREAS.boar_meadow.x, tb.point.z - AREAS.boar_meadow.z) < 1, `「野猪成灾」指引 → ${AREAS.boar_meadow.name}（${tb.label}）`);
  kill('boar', 8);
  check(target('q_field_boars')!.kind === 'turnin' && target('q_field_boars')!.label === '回去找罗文', '杀够 8 只：指引改为交任务的 NPC');
  let raiders = 0; while (log.active().find(a => a.q.id === 'q_field_supplies')!.ready === false && raiders < 40) { kill('raider', 1); raiders++; }
  check(raiders >= 5 && raiders < 40, `收集药草包：杀了 ${raiders} 个劫掠者（掉率 55%，这里固定随机数）`);
  turn('q_field_boars'); turn('q_field_supplies');
  log.accept('q_field_ruins', lv()); log.accept('q_field_hermit', lv());
  const tr = target('q_field_ruins')!;
  check(tr.label.startsWith('调查星落遗迹') && Math.hypot(tr.point.x - AREAS.ruins_altar.x, tr.point.z - AREAS.ruins_altar.z) < 0.1, `探索目标指向祭坛（r=${tr.point.r}）`);
  check(log.pendingExplores().includes('ruins_altar'), '待探索地点：ruins_altar');
  log.onExplore('ruins_altar'); kill('golem', 4);
  const th = target('q_field_hermit')!;
  check(th.point.map === 'field' && Math.hypot(th.point.x - NPC_HOME.ke.x, th.point.z - NPC_HOME.ke.z) < 0.1, '送药包：指引到守林人老柯');
  log.onTalk('ke');
  check(log.state('q_field_hermit', lv()) === 'ready' && log.npcMarker('ke', lv()) === '?', '对话老柯后可交（交给老柯，不是青禾）');
  turn('q_field_ruins'); turn('q_field_hermit');
  const lvBeforeChief = lv();
  check(log.state('q_field_chief', lv()) === (lv() >= 12 ? 'available' : 'locked'), `「赤鬃的末日」需要 12 级（现在 ${lv()} 级）`);
  if (lv() < 12) prog.load({ level: 12, xp: 0 });
  log.accept('q_field_chief', lv());
  kill('chief', 1);
  turn('q_field_chief');
  check(fieldIds.every(id => log.state(id, lv()) === 'done'), `6 个原野任务全部完成（赤鬃前 ${lvBeforeChief} 级，原野共获得经验 ${gained}）`);
  // 任务指引：其它区域 → 营地 → 原野
  check(nextHop('field', 'darkrock_mine', MAP_LINKS)?.to === 'camp' && nextHop('darkrock_mine', 'field', MAP_LINKS)?.name === '副本出口', '跨区域：原野 → 营地 → 矿洞；矿洞 → 出口 → 营地 → 原野');
  check(mapAt(arrive.x, arrive.z) === 'field' && mapAt(0, 4) === 'camp' && mapAt(400, -30) === 'darkrock_mine', '世界坐标 → 区域判断');
  check(JSON.stringify(trackedList(['a', 'b', 'c', 'd'], ['d'])) === '["d","a","b"]', '追踪列表：手动追踪优先，最多 3 个');
}

// ====================================================================== 5. 掉落表 & 经验曲线估算
console.log('\n== 掉落与经验 ==');
{
  check(['trash_field', 'elite_field', 'rare_field'].every(k => LOOT_TABLES[k]), '掉落表：trash_field / elite_field / rare_field');
  check(LOOT_TABLES.trash_field.entries.some(e => e.kind === 'random' && !!e.slots?.includes('back')) && LOOT_TABLES.rare_field.entries[0].kind === 'random' && LOOT_TABLES.rare_field.entries[0].minQuality === 'purple', '新部位底材（肩/披风/护腕/腰带/首饰）+ 稀有怪保底紫');
  const mobs = Object.values(FIELD_MOBS);
  check(mobs.length === 6 && mobs.filter(m => m.elite).length === 1 && mobs.filter(m => m.rare).length === 1 && Math.min(...mobs.map(m => m.level)) === 9 && Math.max(...mobs.map(m => m.level)) === 16, `怪物 ${mobs.length} 种（4 普通 + 精英 + 稀有），等级 ${Math.min(...mobs.map(m => m.level))}~${Math.max(...mobs.map(m => m.level))}`);
  // 典型路线：矿洞后 9 级 → 原野前 5 个任务 → 腐沼神殿 → 赤鬃
  const p = new Progression(MAX_LEVEL); p.load({ level: 9, xp: 0 });
  const q = (id: string) => QUESTS.find(x => x.id === id)!.reward.xp;
  const M = FIELD_MOBS;
  p.addXp(q('q_field_news') + q('q_field_boars') + q('q_field_supplies') + q('q_field_ruins') + q('q_field_hermit') + M.boar.xp * 9 + M.raider.xp * 9 + M.archer.xp * 3 + M.golem.xp * 5);
  const afterField = p.level;
  p.addXp(q('q_swamp_news') + q('q_swamp_rot') + q('q_swamp_priest') + 60 * 3 + 70 * 2 + 65 * 2 + 750);
  const afterSwamp = p.level;
  p.addXp(q('q_field_chief') + M.chief.xp);
  check(p.level >= 17 && p.level <= 18, `经验估算：矿洞后 9 级 → 原野 ${afterField} 级 → 腐沼神殿 ${afterSwamp} 级 → 赤鬃 ${p.level} 级（目标 17~18）`);
}

console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
if (failed) process.exitCode = 1;
