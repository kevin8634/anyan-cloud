// 11-17f DLC 光影数值自查：node test/dlclight.test.mjs（不渲染、不联网）——DLC 三图太阳封顶 / 阴影浓度按气候，本体各图不变，?off=dlclight 回原样
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const ROOT = new URL('..', import.meta.url).pathname;
const load = async (off) => {
  const d = mkdtempSync(join(tmpdir(), 'dl_'));
  globalThis.location = { search: off ? '?off=dlclight' : '' };
  // 11-18 DLC 图画风改由 src/dlc/dlc1/map_look_d1.ts 登记（纯净度修复）：入口先登记再导出 map_look
  writeFileSync(join(d, 'e.ts'), `import '${ROOT}src/dlc/dlc1/map_look_d1';\nexport * from '${ROOT}src/web/map_look';\n`);
  await build({ entryPoints: [join(d, 'e.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(d, 'm.mjs'), logLevel: 'warning' });
  return import(join(d, 'm.mjs'));
};
const on = await load(false), off = await load(true);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const z = ['dlc1_coast_wp', 'dlc1_mirror_wp', 'dlc1_belltower_wp'];
const a = z.map(k => on.mapLook(k)), b = z.map(k => off.mapLook(k));
ok(a[0].sunEl === 22 && a[1].sunEl === 15 && a[2].sunEl === 12, `封顶：海岸 ${a[0].sunEl}° / 镜渊 ${a[1].sunEl}° / 钟楼 ${a[2].sunEl}°`);
ok(a[0].shK > a[1].shK && a[1].shK > a[2].shK && a[2].shK >= 0.5, `阴影浓度 海岸 ${a[0].shK} > 镜渊 ${a[1].shK} > 钟楼 ${a[2].shK}（阴天最淡）`);
ok(b.every(l => l.sunEl === 0 && l.shK === 1), '?off=dlclight：三图不封顶、阴影原样');
ok(['world', 'field', 'star', 'foothill', 'marsh', 'redsand', 'frost', 'ember', 'dungeon', 'raid'].every(k => on.MAP_LOOK[k].shK === 1 && on.MAP_LOOK[k].sunEl === off.MAP_LOOK[k].sunEl), '本体各图阴影 / 封顶不变');
ok(on.mapLook('dlc1_forge_dg').sunEl === 0 && on.mapLook('dlc1_well').shK === 1, '熔炉 / 钟井室内不动');
ok(a.every((l, i) => l.grade === b[i].grade && l.fog === b[i].fog && l.vt === b[i].vt), '各图气候（调色 / 雾 / 光束暖度）不变');
console.log(`${fail ? '✗' : '✓'} DLC 光影 ${pass}/${pass + fail}`); process.exitCode = fail ? 1 : 0;
