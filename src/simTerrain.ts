// v0.9.3a 野外性能底座：高度图 / 坡道寻路 / 40 米分块激活（node dist/simTerrain.js）
import { WILD, FULL_WILD_IDS } from './data/zones_wild';
import { HeightField, risesY, rampEnds, pickActive, chunkDist, MAX_ACTIVE, MAX_WALK_SLOPE } from './core/Terrain';
import { NavGrid } from './core/NavGrid';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };

for (const id of FULL_WILD_IDS) {
  const d = WILD[id], H = d.half, rs = d.rises ?? [];
  ok(rs.length >= 3, `${d.name}：${rs.length} 处地形起伏（${rs.filter(r => r.kind === 'mesa').length} 座台地）`);
  const hf = new HeightField(-H - 4, -H - 4, H + 4, H + 4, (x, z) => risesY(rs, x, z));
  const nav = new NavGrid({ x0: -H, z0: -H, x1: H, z1: H }, [], { solid: (x, z) => risesY(rs, x, z) > 0.02 && hf.steep(x, z, MAX_WALK_SLOPE) });
  // 关键地点不能落在起伏上（营地、传送门、刷怪点、副本门）
  const keyPts: [string, number, number][] = [
    ...d.camps.map(c => [c.name, c.x, c.z] as [string, number, number]),
    ...d.gates.map(g => [g.name, g.x, g.z] as [string, number, number]),
    ...d.packs.filter(p => !p.hot).map((p, i) => [`怪群${i + 1}`, p.x, p.z] as [string, number, number]),   // v0.9.3c 刷怪点本来就在台顶
    ...(d.dungeonGates ?? []).map(g => [g.name, g.x, g.z] as [string, number, number]),
  ];
  const bad = keyPts.filter(([, x, z]) => risesY(rs, x, z) > 0.05);
  ok(bad.length === 0, `${d.name}：营地 / 传送门 / 怪群都在平地上${bad.length ? `（压到：${bad.map(b => b[0]).join('、')}）` : ''}`);
  for (const r of rs) {
    if (r.kind === 'mesa') {
      const { foot, top } = rampEnds(r);
      ok(Math.abs(hf.at(top.x, top.z) - r.h) < 0.05 && hf.at(foot.x, foot.z) < 0.05, `  ${r.name}：台顶 ${hf.at(top.x, top.z).toFixed(2)} 米，坡脚 ${hf.at(foot.x, foot.z).toFixed(2)} 米`);
      const path = nav.findPath(foot.x, foot.z, top.x, top.z);
      ok(!!path, `  ${r.name}：从坡脚能寻路上台顶`);
      // 背对坡道的一侧：崖壁挡住，直线上不去，寻路要绕到坡道
      const a = (r.ramp?.a ?? 0) + Math.PI, back = { x: r.x + Math.cos(a) * (r.r + 5), z: r.z + Math.sin(a) * (r.r + 5) };
      ok(!nav.lineOfSight(back, top), `  ${r.name}：崖壁一侧直线上不去`);
      const p2 = nav.findPath(back.x, back.z, top.x, top.z);
      const len = p2 ? p2.reduce((s, p, i) => s + (i ? Math.hypot(p.x - p2[i - 1].x, p.z - p2[i - 1].z) : Math.hypot(p.x - back.x, p.z - back.z)), 0) : 0;
      ok(!!p2 && len > r.r + 5 + r.r, `  ${r.name}：从崖下绕到坡道上去（路程 ${len.toFixed(0)} 米，直线 ${(r.r + 5).toFixed(0)} 米）`);
      let maxSlope = 0;
      for (let t = 0.1; t < 0.9; t += 0.05) { const x = foot.x + (top.x - foot.x) * t * 0.6, z = foot.z + (top.z - foot.z) * t * 0.6; maxSlope = Math.max(maxSlope, hf.slope(x, z)); }
      ok(maxSlope < MAX_WALK_SLOPE, `  ${r.name}：坡道最大坡度 ${maxSlope.toFixed(0)}°（< ${MAX_WALK_SLOPE}°）`);
    } else {
      let blocked = 0; for (let x = r.x - r.r; x <= r.x + r.r; x++) for (let z = r.z - r.r; z <= r.z + r.r; z++) if (!nav.isFree(x, z) && nav.inBounds(x, z)) blocked++;
      ok(blocked === 0 && hf.slope(r.x + r.r / 2, r.z) < 20, `  山丘 (${r.x},${r.z}) 高 ${r.h} 米：整片可走，半山腰坡度 ${hf.slope(r.x + r.r / 2, r.z).toFixed(0)}°`);
    }
  }
}

// 分块激活：200 只怪散在 240 米见方里
let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const units = Array.from({ length: 200 }, (_, i) => ({ i, x: (rnd() - 0.5) * 240, z: (rnd() - 0.5) * 240, fighting: i < 3 }));
const px = 10, pz = -5;
const act = pickActive(units, u => u, px, pz, MAX_ACTIVE, u => u.fighting);
ok(act.size <= MAX_ACTIVE, `200 只怪 → 激活 ${act.size} 只（上限 ${MAX_ACTIVE}）`);
ok(units.filter(u => u.fighting).every(u => act.has(u)), '交战中的怪不管多远都保留');
ok([...act].filter(u => !u.fighting).every(u => chunkDist(u.x, u.z, px, pz) <= 1), '其余激活的怪都在玩家所在 40 米区块 + 一圈里');
const far = [...act].filter(u => !u.fighting).reduce((m, u) => Math.max(m, Math.hypot(u.x - px, u.z - pz)), 0);
const nearOut = units.filter(u => !act.has(u) && chunkDist(u.x, u.z, px, pz) <= 1).reduce((m, u) => Math.min(m, Math.hypot(u.x - px, u.z - pz)), Infinity);
ok(nearOut >= far - 1e-6, `按距离取最近的（最远激活 ${far.toFixed(0)} 米 ≤ 最近未激活 ${nearOut.toFixed(0)} 米）`);
const few = pickActive(units.slice(0, 20), u => u, px, pz, MAX_ACTIVE);
ok(few.size === units.slice(0, 20).filter(u => chunkDist(u.x, u.z, px, pz) <= 1).length, '怪少时：附近区块里的全部激活');

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
(globalThis as unknown as { process: { exitCode: number } }).process.exitCode = fails ? 1 : 0;
