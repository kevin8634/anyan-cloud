// v0.9.3b 翠风原野扩建自检（node dist/simField93b.js）：范围、起伏、地标可达、怪群、石拱桥、物件不压坡道
import { FIELD_HALF, FIELD_BOUNDS, FIELD_ORIGIN as O, FIELD_SPOTS as S, FIELD_RISES, FIELD_PACKS, FIELD_PACKS_OUTER, fieldProps, fieldObstacles, fieldSolid, fieldWalkY, fieldOnRamp, riverZ, RIVER_HALF, BRIDGE, BRIDGE2, FORD, RARE_SPOTS, CHIEF_ROUTE } from './data/zone_field';
import { HeightField, rampEnds, MAX_WALK_SLOPE } from './core/Terrain';
import { NavGrid } from './core/NavGrid';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const W = (x: number, z: number) => ({ x: O.x + x, z: O.z + z });

ok(FIELD_HALF === 120 && FIELD_BOUNDS.x1 - FIELD_BOUNDS.x0 >= 240, `可走范围 ±${FIELD_HALF}（面积 ${(FIELD_HALF * FIELD_HALF / (78 * 78)).toFixed(1)} 倍）`);
const hf = new HeightField(FIELD_BOUNDS.x0 - 2, FIELD_BOUNDS.z0 - 2, FIELD_BOUNDS.x1 + 2, FIELD_BOUNDS.z1 + 2, (x, z) => fieldWalkY(x - O.x, z - O.z));
const t0 = Date.now();
const nav = new NavGrid(FIELD_BOUNDS, fieldObstacles(), { solid: (x, z) => fieldSolid(x, z) || (fieldWalkY(x - O.x, z - O.z) > 0.02 && hf.steep(x, z, MAX_WALK_SLOPE)) });
ok(Date.now() - t0 < 3000, `寻路网格 ${nav.w}×${nav.h}，生成 ${Date.now() - t0} ms`);
const plen = (p: { x: number; z: number }[] | null, a: { x: number; z: number }) => p ? p.reduce((s, q, i) => s + Math.hypot(q.x - (i ? p[i - 1].x : a.x), q.z - (i ? p[i - 1].z : a.z)), 0) : 0;

// ---- 起伏
ok(FIELD_RISES.length >= 5 && FIELD_RISES.filter(r => r.kind === 'mesa').length >= 1, `${FIELD_RISES.length} 处起伏（${FIELD_RISES.filter(r => r.kind === 'mesa').length} 座台地）`);
for (const r of FIELD_RISES) {
  if (r.kind === 'mesa') {
    const e = rampEnds(r), foot = W(e.foot.x, e.foot.z), top = W(e.top.x, e.top.z);
    ok(Math.abs(hf.at(top.x, top.z) - r.h) < 0.05 && hf.at(foot.x, foot.z) < 0.05, `  ${r.name}：台顶 ${hf.at(top.x, top.z).toFixed(2)} 米，坡脚 ${hf.at(foot.x, foot.z).toFixed(2)} 米`);
    ok(!!nav.findPath(foot.x, foot.z, top.x, top.z), `  ${r.name}：坡脚寻路上台顶`);
    const a = (r.ramp?.a ?? 0) + Math.PI, back = W(r.x + Math.cos(a) * (r.r + 5), r.z + Math.sin(a) * (r.r + 5));
    ok(!nav.lineOfSight(back, top), `  ${r.name}：崖壁一侧直线上不去`);
  } else {
    let blocked = 0; for (let x = r.x - r.r * 0.8; x <= r.x + r.r * 0.8; x += 2) for (let z = r.z - r.r * 0.8; z <= r.z + r.r * 0.8; z += 2) { const p = W(x, z); if (Math.hypot(x - r.x, z - r.z) < r.r * 0.8 && hf.steep(p.x, p.z)) blocked++; }
    const p = W(r.x + r.r / 2, r.z);
    ok(blocked === 0 && hf.slope(p.x, p.z) < MAX_WALK_SLOPE, `  ${r.name}（高 ${r.h} 米）：坡度 ${hf.slope(p.x, p.z).toFixed(0)}°，整片可走`);
  }
}

// ---- 地标可达（从传送落脚点出发）
const start = W(S.arrive.x, S.arrive.z);
const spots: [string, { x: number; z: number }][] = [
  ['翠风前哨', W(S.outpost.x, S.outpost.z - 4)], ['劫掠者营地', W(S.bandit.x, S.bandit.z)], ['星落遗迹', W(S.ruins.x - 6, S.ruins.z + 6)], ['守林人小屋', W(S.hut.x + 4, S.hut.z + 4)],
  ['麦穗村广场', W(S.village.x, S.village.z + 6)], ['风车塔', W(S.windmill.x - 4, S.windmill.z - 5)], ['水车磨坊', W(96, 21)], ['坍塌神殿', W(S.temple.x, S.temple.z + 6)],
  ['风蚀高台台顶', W(S.mesa.x, S.mesa.z)], ['废矿坑口', W(S.mine.x + 4, S.mine.z - 4)], ['隐蔽洞穴口', W(S.cave.x + 4, S.cave.z)], ['东边赤砂石门', W(62, 4)],
];
for (const [n, p] of spots) {
  const path = nav.findPath(start.x, start.z, p.x, p.z);
  ok(!!path, `可达：${n}（路程 ${plen(path, start).toFixed(0)} 米，寻路展开 ${nav.lastExpanded}）`);
}
// ---- 石拱桥：麦穗村 → 神殿必须从石拱桥过河
{
  const a = W(S.village.x, S.village.z - 12), b = W(S.temple.x, S.temple.z + 10), p = nav.findPath(a.x, a.z, b.x, b.z);
  const xs: number[] = []; if (p) for (let i = 1; i < p.length; i++) for (let t = 0; t <= 1; t += 0.1) { const x = p[i - 1].x + (p[i].x - p[i - 1].x) * t - O.x, z = p[i - 1].z + (p[i].z - p[i - 1].z) * t - O.z; if (Math.abs(z - riverZ(x)) < RIVER_HALF) xs.push(x); }
  ok(!!p && xs.length > 0 && xs.every(x => x > BRIDGE2.x0 - 0.6 && x < BRIDGE2.x1 + 0.6), `麦穗村 → 坍塌神殿从石拱桥过河（过河点 x ≈ ${xs.length ? xs[0].toFixed(1) : '—'}）`);
  const mid = W((BRIDGE2.x0 + BRIDGE2.x1) / 2, riverZ((BRIDGE2.x0 + BRIDGE2.x1) / 2));
  ok(!fieldSolid(mid.x, mid.z) && fieldSolid(mid.x + 6, O.z + riverZ(mid.x + 6 - O.x)), '石拱桥桥面可走、桥外是河');
  ok(!fieldSolid(O.x, O.z + riverZ(0)) && !fieldSolid(O.x + (FORD.x0 + FORD.x1) / 2, O.z + riverZ((FORD.x0 + FORD.x1) / 2)) && BRIDGE.x1 < BRIDGE2.x0, '原来的木桥、浅滩照旧可走');
}
// ---- 怪群
const packsBad = FIELD_PACKS.filter(p => !nav.isFree(p.x, p.z) || !nav.findPath(start.x, start.z, p.x, p.z));
ok(packsBad.length === 0, `${FIELD_PACKS.length} 群怪（外环新增 ${FIELD_PACKS_OUTER.length} 群）全部站在可走格上且可达${packsBad.length ? '：' + packsBad.map(p => `(${p.x - O.x},${p.z - O.z})`).join(' ') : ''}`);
ok([...RARE_SPOTS, ...CHIEF_ROUTE].every(p => nav.isFree(p.x, p.z)), '稀有点、精英路线照旧可走');
const outer = FIELD_PACKS_OUTER.filter(p => Math.max(Math.abs(p.lx), Math.abs(p.lz)) > 72).length;
ok(outer >= 8, `外环（±72 外）有 ${outer} 群怪`);
// ---- 物件
const props = fieldProps(), solid = props.filter(p => p.r > 0);
const onRampP = solid.filter(p => fieldOnRamp(p.x - O.x, p.z - O.z, 0.5));
ok(onRampP.length === 0, `物件 ${props.length} 个（挡路 ${solid.length}），坡道上没有物件${onRampP.length ? '：' + onRampP.map(p => p.kind).join(',') : ''}`);
const kinds = (k: string) => props.filter(p => p.kind === k).length;
ok(kinds('house') === 5 && kinds('windmill') === 1 && kinds('watermill') === 1 && kinds('twall') >= 6 && kinds('tstatue') === 3 && kinds('mine') === 1 && kinds('cave') === 1,
  `地标：房屋 ${kinds('house')}、风车 ${kinds('windmill')}、水车 ${kinds('watermill')}、神殿残墙 ${kinds('twall')}、残像 ${kinds('tstatue')}、矿坑 ${kinds('mine')}、洞穴 ${kinds('cave')}`);
const outside = props.filter(p => Math.abs(p.x - O.x) > FIELD_HALF + 1 || Math.abs(p.z - O.z) > FIELD_HALF + 1);
ok(outside.length === 0, '所有物件都在可走范围内（远景树另放）');
const trees = props.filter(p => (p.kind === 'birch' || p.kind === 'oak') && Math.max(Math.abs(p.x - O.x), Math.abs(p.z - O.z)) > 78).length;
ok(trees > 120, `外环树木 ${trees} 棵`);

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
(globalThis as unknown as { process: { exitCode: number } }).process.exitCode = fails ? 1 : 0;
