// v0.9.3c 怪群重排与刷新规则 + 三张新图扩建（node dist/simWild93c.js）
import { WORLD_BOSSES, WB_IDS } from './data/world_bosses';
import { WILD, FULL_WILD_IDS, RESPAWN, SAFE_R, levelOffsetAt, wildPathDist } from './data/zones_wild';
import { FIELD_PACKS, CHIEF_RESPAWN, RARE_RESPAWN } from './data/zone_field';
import { HeightField, risesY, MAX_WALK_SLOPE, chunkOf } from './core/Terrain';
import { NavGrid } from './core/NavGrid';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const HALF: Record<string, number> = { star: 110, redsand: 130, frost: 130, ember: 160 };

for (const id of FULL_WILD_IDS) {
  const d = WILD[id], H = d.half, rs = d.rises ?? [];
  console.log(`== ${d.name}`);
  ok(H === HALF[id] && (d.inner ?? 0) < H, `范围 ±${d.inner} → ±${H}（面积 ${((H / d.inner!) ** 2).toFixed(1)} 倍）`);
  const hf = new HeightField(-H - 4, -H - 4, H + 4, H + 4, (x, z) => risesY(rs, x, z));
  const nav = new NavGrid({ x0: -H - 2, z0: -H - 2, x1: H + 2, z1: H + 2 }, [], { solid: (x, z) => Math.abs(x) > H || Math.abs(z) > H || (risesY(rs, x, z) > 0.02 && hf.steep(x, z, MAX_WALK_SLOPE)) });
  const packs = d.packs, mobs = packs.reduce((s, p) => s + p.kinds.length, 0);
  ok(packs.length >= 30 && packs.length <= 40, `${packs.length} 群怪（30–40），共 ${mobs} 只`);
  const gen = packs.filter(p => p.gen && !p.hot);
  ok(gen.every(p => p.kinds.length >= 3 && p.kinds.length <= 5), `新增 ${gen.length} 群每群 3–5 只`);
  ok(gen.every(p => Math.max(Math.abs(p.x), Math.abs(p.z)) > d.inner! - 4), '新增怪群都在外环（老任务区不动）');
  const near = gen.filter(p => wildPathDist(d, p.x, p.z) <= 11).length;
  ok(near === gen.length, `新增怪群都在路边 11 米内（${near}/${gen.length}）`);
  const minCamp = Math.min(...gen.map(p => Math.min(...d.camps.map(c => Math.hypot(p.x - c.x, p.z - c.z)))));
  ok(minCamp > SAFE_R, `营地 ${SAFE_R} 米内没有新怪群（最近 ${minCamp.toFixed(0)} 米）`);
  // 沿环路每 25–35 米能遇到一群
  const loop = d.paths[d.paths.length - 5];
  const arenas = WB_IDS.map(i => WORLD_BOSSES[i]).filter(b => b.map === d.id);
  for (const b of arenas) ok(!packs.some(p => p.gen && Math.hypot(p.x - b.x, p.z - b.z) < b.r), `世界首领「${b.name}」竞技场（${b.arena}，半径 ${b.r}）里没有外环怪群`);
  let gaps = 0, maxGap = 0, last = -1, along = 0;
  for (let i = 0; i < loop.length - 1; i++) { const a = loop[i], b = loop[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < L; t += 2) { const x = a[0] + (b[0] - a[0]) * t / L, z = a[1] + (b[1] - a[1]) * t / L; if (packs.some(p => Math.hypot(p.x - x, p.z - z) < 12) || arenas.some(b => Math.hypot(b.x - x, b.z - z) < b.r + 12)) {   // v0.9.3d 世界首领竞技场也算遭遇
 if (last >= 0) maxGap = Math.max(maxGap, along - last); last = along; } along += 2; } }
  gaps = Math.round(along / Math.max(1, packs.filter(p => p.gen).length));
  ok(maxGap < 75, `外环环路 ${along.toFixed(0)} 米，路上最长 ${maxGap} 米没遇到怪（平均每 ${gaps} 米一群）`);
  // 可走、可达
  const camp = d.camps.find(c => c.main)!;
  const bad = packs.filter(p => !nav.isFree(p.x, p.z) || !nav.findPath(camp.x, camp.z + 6, p.x, p.z));
  ok(bad.length === 0, `所有怪群站在可走格上、从主营地能走到${bad.length ? '：' + bad.map(p => `(${p.x},${p.z})`).join(' ') : ''}`);
  // 刷新规则
  const normal = packs.filter(p => !p.hot && p.gen);
  const old = packs.filter(p => !p.gen);
  ok(old.every(p => (p.respawn ?? 30) <= 40), `老任务区 ${old.length} 群保持原刷新（${Math.min(...old.map(p => p.respawn ?? 30))}–${Math.max(...old.map(p => p.respawn ?? 30))} 秒，不等走开）`);
  ok(normal.every(p => (p.respawn ?? 0) >= RESPAWN.normalMin && (p.respawn ?? 0) <= RESPAWN.normalMax), `普通群刷新 ${Math.min(...normal.map(p => p.respawn!))}–${Math.max(...normal.map(p => p.respawn!))} 秒`);
  const hot = packs.filter(p => p.hot), mesas = rs.filter(r => r.kind === 'mesa');
  ok(hot.length === mesas.length && hot.every(p => p.respawn === RESPAWN.hot && mesas.some(m => Math.hypot(m.x - p.x, m.z - p.z) < 1) && p.kinds.length >= 3), `刷怪点 ${hot.length} 个（每座台地台顶一个，${RESPAWN.hot} 秒，${hot.map(p => p.kinds.length).join('/')} 只）`);
  ok(d.elite?.respawn === RESPAWN.elite && d.rare?.respawn === RESPAWN.rareMin, `精英 ${d.elite?.respawn} 秒；稀有首次 ${d.rare?.respawn} 秒，之后 ${RESPAWN.rareMin}–${RESPAWN.rareMax} 秒随机`);
  // 等级梯度
  ok(packs.filter(p => !p.gen).every(p => p.lv === 0), '老怪群等级不变（+0）');
  const lv1 = packs.filter(p => p.lv === 1).length, lv2 = packs.filter(p => p.lv === 2).length;
  ok(lv1 > 0 && lv2 > 0 && packs.every(p => p.lv === levelOffsetAt(d, p.x, p.z)), `外环 +1 级 ${lv1} 群、+2 级 ${lv2} 群`);
  // 分块：最密的 3×3 块里不超过 60 只（同屏上限 40 会裁掉）
  const cnt = new Map<string, number>(); for (const p of packs) { const c = chunkOf(d.origin.x + p.x, d.origin.z + p.z); const k = c.cx + ',' + c.cz; cnt.set(k, (cnt.get(k) ?? 0) + p.kinds.length); }
  let worst = 0; for (const k of cnt.keys()) { const [cx, cz] = k.split(',').map(Number); let s = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) s += cnt.get(`${cx + i},${cz + j}`) ?? 0; worst = Math.max(worst, s); }
  ok(worst <= 60, `最密的 3×3 区块共 ${worst} 只（同屏上限 40）`);
}
console.log('== 翠风原野');
{ const fo = FIELD_PACKS.filter(p => p.outer), fi = FIELD_PACKS.filter(p => !p.outer);
  ok(fo.length >= 8 && fo.every(p => p.respawn >= 45 && p.respawn <= 60), `翠风外环 ${fo.length} 群刷新 45–60 秒（走开 30 米才刷）`);
  ok(fi.every(p => p.respawn < 45), `翠风老任务区 ${fi.length} 群保持原刷新`); }
ok(CHIEF_RESPAWN === 300 && RARE_RESPAWN === RESPAWN.rareMin, `精英 ${CHIEF_RESPAWN} 秒、稀有 ${RARE_RESPAWN} 秒起`);
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
(globalThis as unknown as { process: { exitCode: number } }).process.exitCode = fails ? 1 : 0;
