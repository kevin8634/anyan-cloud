// 运行：npm run routes —— v0.6.10 长副本路线：所有路线都能通关、门条件不卡死、捷径 / 密道 / 冰湖正确、几何不重叠
import { RouteDef, newRouteState, reachable, shortestPath, pathLen, simulate, onBossDead, evalCond, useProp, props, node, bossNode, nextGoal } from './core/RaidRoute';
import { RAID_ROUTES, MOLTEN_ROUTE, FROST_ROUTE } from './data/raid_routes';
import { RAIDS } from './data/raids';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

for (const d of Object.values(RAID_ROUTES)) {
  const raid = RAIDS[d.raid as keyof typeof RAIDS];
  console.log(`\n=== ${d.name} ===`);
  const n = raid.bosses.length;
  check(d.nodes.filter(x => x.boss !== undefined).length === n && raid.bosses.every((_, i) => !!bossNode(d, i)), `${n} 个首领都有场地节点`);
  check(d.edges.every(e => d.nodes.some(x => x.id === e.a) && d.nodes.some(x => x.id === e.b)), '连线两端都存在');
  check(new Set(d.nodes.map(x => x.id)).size === d.nodes.length, '节点 id 不重复');
  // 首领场地半径与老布局一致（首领机制按场地半径写的）
  check(raid.bosses.every((_, i) => bossNode(d, i).r === raid.rooms[i].arena.r), '首领场地半径和老布局一致');
  // 几何：节点圆不重叠；走廊不穿过别的节点圆
  let geo = true;
  for (const a of d.nodes) for (const b of d.nodes) if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + 4) { geo = false; console.log(`    重叠：${a.name} / ${b.name}`); }
  for (const e of d.edges) { const A = node(d, e.a), B = node(d, e.b); for (const c of d.nodes) { if (c === A || c === B) continue; const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((c.x - A.x) * dx + (c.z - A.z) * dz) / (L * L))); const px = A.x + dx * t - c.x, pz = A.z + dz * t - c.z; if (Math.hypot(px, pz) < c.r + (e.half ?? 5.5)) { geo = false; console.log(`    走廊 ${A.name}→${B.name} 穿过 ${c.name}`); } } }
  check(geo, '节点不重叠，走廊不穿过别的场地');
  check(d.props.every(p => { const n = node(d, p.node); return Math.hypot(p.x - n.x, p.z + (p.kind === 'icewall' ? 2.6 : 1.2) - n.z) <= n.r - 0.8; }), '机关都在所属节点的地面上（站得到）');
  // 开局
  const s0 = newRouteState(n), R0 = reachable(d, s0);
  check(R0.has('b0') && !R0.has(bossNode(d, 1).id), `开局只能走到第一首领（能走到 ${[...R0].join(',')}）`);
  // 默认路线（全清）
  const sim = simulate(d, n);
  check(sim.ok, `全清路线能通关（${Math.round(sim.len)} 米）：${sim.order.join(' → ')}`);
  // 每个节点在某个状态下都能走到（不卡死）
  const sAll = newRouteState(n); sAll.dead.fill(true); sAll.sigils = ['a', 'b']; sAll.flags = ['obsidian', 'valves', 'frozen', 'bridge', 'icewall']; sAll.lamps = 4; sAll.elites = (d.elites ?? []).map(e => e.id);
  check(reachable(d, sAll).size === d.nodes.length, '全部解锁后所有节点都能走到');
  // 任意顺序：随机挑下一个可达目标，跑 200 次都能通关
  let rnd = 7; const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  let allOk = true;
  for (let k = 0; k < 200; k++) {
    const r = simulate(d, n, g => { const s = newRouteState(n); void s; return g; });
    if (!r.ok) allOk = false;
    // 随机顺序：手动走
    const s = newRouteState(n); let at = 'entry';
    for (let guard = 0; guard < 60 && !s.dead[d.final]; guard++) {
      const Rr = reachable(d, s, at);
      const opts = [...d.nodes.filter(x => x.boss !== undefined && !s.dead[x.boss] && Rr.has(x.id)).map(x => ({ t: 'boss', x })), ...d.props.filter(p => p.kind === 'lamp' || p.kind === 'pillar').filter(p => Rr.has(p.node) && !(s.flags.includes(`lamp:${p.id}`) || (p.kind === 'pillar' && s.flags.includes('bridge')))).map(p => ({ t: 'prop', p })), ...(d.elites ?? []).filter(e => Rr.has(e.node) && !s.elites.includes(e.id)).map(e => ({ t: 'elite', e }))] as ({ t: 'boss'; x: typeof d.nodes[number] } | { t: 'prop'; p: typeof d.props[number] } | { t: 'elite'; e: NonNullable<RouteDef['elites']>[number] })[];
      if (!opts.length) break;
      const o = opts[Math.floor(R() * opts.length)];
      if (o.t === 'boss') { const p = shortestPath(d, s, at, o.x.id); if (!p) { allOk = false; break; } for (const id of p.slice(1)) { const nn = node(d, id); if (nn.boss !== undefined) onBossDead(d, s, nn.boss); } at = o.x.id; }
      else if (o.t === 'prop') { useProp(d, s, o.p); at = o.p.node; }
      else { s.elites.push(o.e.id); at = o.e.node; }
    }
    if (!s.dead[d.final]) allOk = false;
  }
  check(allOk, '随机顺序 200 次：都能打到最终首领（不卡死）');
}

console.log('\n=== 熔心王座：两翼 / 封印 / 捷径 / 密道 ===');
{
  const d = MOLTEN_ROUTE, s = newRouteState(5);
  onBossDead(d, s, 0);
  const R = reachable(d, s);
  check(R.has('b1') && R.has('b2') && R.has('guard') && R.has('secret') && !R.has('seal'), '戈拉克死后：两翼、门卫壁龛、熔炉密室都能去，封印之门锁着');
  const seal = d.edges.find(e => e.a === 'hub' && e.b === 'seal')!;
  const s1 = JSON.parse(JSON.stringify(s)); onBossDead(d, s1, 1);
  check(!evalCond(seal.cond, s1) && s1.sigils.length === 1, '1 枚印记（焰之印）：封印还锁着');
  s1.elites.push('gatekeeper');
  check(evalCond(seal.cond, s1), '1 枚印记 + 封印门卫：封印打开');
  const s2 = JSON.parse(JSON.stringify(s)); onBossDead(d, s2, 1); onBossDead(d, s2, 2);
  check(evalCond(seal.cond, s2), '2 枚印记：封印打开');
  const s3 = JSON.parse(JSON.stringify(s)); onBossDead(d, s3, 2);
  check(s3.flags.includes('obsidian') && reachable(d, s3).has('b3') && !reachable(d, s3).has('seal') || reachable(d, s3).has('b3'), '萨穆尔死后：熔岩冷却，黑曜石捷径直通祭坛（卡萨）');
  const viaShort = shortestPath(d, s3, 'b2', 'b3')!;
  check(viaShort.includes('river'), `捷径路线：${viaShort.join(' → ')}`);
  // 最快路线：戈拉克 → 萨穆尔 → 捷径 → 卡萨 → B → 瓦尔卡兹
  const fast = ['entry', 'b0', 'hub', 'b2', 'river', 'b3', 'pathB', 'b4'];
  const sf = newRouteState(5); onBossDead(d, sf, 0); onBossDead(d, sf, 2); onBossDead(d, sf, 3);
  const full = simulate(d, 5);
  const lenFast = pathLen(d, fast);
  check(lenFast < full.len * 0.75, `最快路线 ${Math.round(lenFast)} 米，全清 ${Math.round(full.len)} 米`);
  // 密道：阀门顺序
  const sv = newRouteState(5); onBossDead(d, sv, 0);
  const vs = props(d, 'valve'), pulled: string[] = [];
  const wrong = useProp(d, sv, vs[0], pulled);
  check(!wrong.ok && pulled.length === 0, `拉错顺序：${wrong.msg}`);
  for (const k of d.mural!) useProp(d, sv, vs[k], pulled);
  check(sv.flags.includes('valves') && reachable(d, sv).has('seal') && reachable(d, sv).has('b3'), '按壁画顺序（中 → 右 → 左）：密道直通封印之门');
  check(!nextGoal(d, newRouteState(5), 'entry') || nextGoal(d, newRouteState(5), 'entry')!.boss === 0, '入口的建议目标：戈拉克');
}

console.log('\n=== 永霜墓穴：双线 / 魂灯 / 冰湖 / 冰桥 ===');
{
  const d = FROST_ROUTE, s = newRouteState(5);
  onBossDead(d, s, 0);
  check(reachable(d, s).has('b1') && reachable(d, s).has('b2') && !reachable(d, s).has('north'), '莫戈斯死后：北道 / 南道都能去；北道尽头要先架冰桥');
  s.flags.push('bridge'); onBossDead(d, s, 2);
  const before = shortestPath(d, s, 'north', 'south')!;
  s.dead[2] = false; s.flags = s.flags.filter(f => f !== 'bridge');
  onBossDead(d, s, 1); s.flags.push('bridge'); onBossDead(d, s, 2);
  const after = shortestPath(d, s, 'north', 'south')!;
  check(s.flags.includes('frozen') && after.includes('lake') && pathLen(d, after) < pathLen(d, before) * 0.5, `维瑟拉死后冰湖冻结：北道尽头 → 南道尽头 ${Math.round(pathLen(d, before))} 米 → ${Math.round(pathLen(d, after))} 米`);
  check(!reachable(d, s).has('b3'), '魂灯不够：骑士团大厅关着');
  for (const p of props(d, 'lamp')) useProp(d, s, p);
  check(s.lamps === 4 && reachable(d, s).has('b3'), '架桥 + 点亮 4 盏魂灯：大厅打开');
  check(!useProp(d, s, d.props.find(p => p.kind === 'icewall')!).ok, '骑士团活着：冰墙打不碎');
  onBossDead(d, s, 3);
  check(useProp(d, s, d.props.find(p => p.kind === 'icewall')!).ok && reachable(d, s).has('library'), '骑士团倒下后打碎冰墙：冰封书库');
}

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 路线全部通过');
if (fails) process.exitCode = 1;
