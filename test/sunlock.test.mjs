// 11-17 太阳封顶（秋林移植「太阳盘固定 + 低角」）数值自查：node test/sunlock.test.mjs（不渲染、不联网）
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname, d = mkdtempSync(join(tmpdir(), 'sl_'));
writeFileSync(join(d, 'e.ts'), `import * as THREE from 'three';
import { ssDirs, ssSetSunLock, ssLightDir } from '${ROOT}src/web/seasky_core';
const s = new THREE.Vector3(), m = new THREE.Vector3(), v = new THREE.Vector3();
export function run(lock: number) { ssSetSunLock(lock); let maxEl = -90, rise = -1, set = -1, ly = -1, azMin = 999, azMax = -999, lj = 0, pl: THREE.Vector3 | null = null, visJ = 0, ps: THREE.Vector3 | null = null;
  for (let i = 0; i <= 1440; i += 2) { const h = i / 60; ssDirs(h, s, m); const el = Math.asin(s.y) * 180 / Math.PI; maxEl = Math.max(maxEl, el);
    if (ly <= 0 && s.y > 0 && rise < 0) rise = h; if (ly > 0 && s.y <= 0) set = h; ly = s.y;
    if (s.y > 0.02) { const az = Math.atan2(s.z, s.x) * 180 / Math.PI; const a = az < 0 ? az + 360 : az; azMin = Math.min(azMin, a); azMax = Math.max(azMax, a); if (ps) visJ = Math.max(visJ, ps.angleTo(s) * 180 / Math.PI); ps = s.clone(); } else ps = null;
    ssLightDir(h, 6, v); if (pl) lj = Math.max(lj, pl.angleTo(v) * 180 / Math.PI); pl = v.clone(); }
  return { maxEl, rise, set, azSpan: azMax - azMin, visJ, lj }; }`);
await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(d, 'e.mjs'), logLevel: 'warning', nodePaths: [join(ROOT, 'node_modules')] });
const { run } = await import(join(d, 'e.mjs'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const a = run(0), b = run(16), c = run(24);
ok(a.maxEl > 60, `不封顶：正午太阳 ${a.maxEl.toFixed(1)}°（原样）`);
ok(b.maxEl <= 16.01 && c.maxEl <= 24.01, `封顶：16° 图最高 ${b.maxEl.toFixed(1)}°，24° 图最高 ${c.maxEl.toFixed(1)}°`);
ok(b.rise === a.rise && b.set === a.set, `日出 ${b.rise.toFixed(2)} / 日落 ${b.set.toFixed(2)} 时刻不变`);
ok(b.azSpan < 60 && a.azSpan > 150, `白天日盘方位范围：封顶 ${b.azSpan.toFixed(0)}°（原 ${a.azSpan.toFixed(0)}°）`);
ok(b.visJ < 1.0, `日盘在地平线上时每 2 游戏分钟最多移动 ${b.visJ.toFixed(2)}°（不跳）`);
ok(b.lj <= a.lj + 0.01, `平行光最大单步转角不比原来大（${b.lj.toFixed(1)}° vs ${a.lj.toFixed(1)}°，原有的月光↔日光交接）`);
console.log(`${fail ? '✗' : '✓'} 太阳封顶 ${pass}/${pass + fail}`); process.exitCode = fail ? 1 : 0;
