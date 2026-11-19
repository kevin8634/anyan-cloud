// v1.2.21 资产双包检查：node tools/check-assets.mjs [产物.html ...]
//   1) assets/ 原有资产（非 .md）与 tag assets-base-v1.2.20 完全一致，没有被改 / 删 / 新增
//   2) assets_aholo/ 每个文件都在 README.md 登记表里
//   3) 商用产物（文件名不带 _比赛版）不含任何比赛资产；比赛版产物报告含了几个比赛资产
//   不带参数时检查 web/index.html、web/index_dlc1.html 和 web/ 下全部 *_比赛版.html
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { AHOLO_DIR, aholoFiles, unregistered } from './asset-pack.mjs';

const BASE_TAG = 'assets-base-v1.2.20';
let fail = 0;
const bad = msg => { console.error('✗ ' + msg); fail++; };
const ok = msg => console.log('✓ ' + msg);

// 1) 原有资产冻结
try {
  const diff = execSync(`git diff --name-status ${BASE_TAG} -- assets`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  const untracked = execSync('git ls-files --others --exclude-standard -- assets', { encoding: 'utf8' }).split('\n').filter(Boolean);
  // v1.2.28：本体新增的自制资产登记在 assets/BASE_ADDED.txt（一行一个相对路径，只允许新增，不允许改原有文件）
  const added = existsSync('assets/BASE_ADDED.txt') ? new Set(readFileSync('assets/BASE_ADDED.txt', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) : new Set();
  const isAdd = l => l.startsWith('A\t');
  const changed = [...diff.filter(l => !(isAdd(l) && added.has(l.split('\t').pop()))).map(l => l.split('\t').pop()), ...untracked.filter(f => !added.has(f))].filter(f => !/\.md$/i.test(f) && f !== 'assets/BASE_ADDED.txt');
  if (changed.length) bad(`assets/ 原有资产被改动（对比 ${BASE_TAG}）：${changed.join(', ')}`);
  else ok(`assets/ 原有资产与 ${BASE_TAG} 一致`);
} catch (e) { bad(`无法对比 ${BASE_TAG}：${e.message.split('\n')[0]}`); }

// 2) 比赛资产登记
const files = aholoFiles();
const unreg = unregistered();
if (unreg.length) bad(`${AHOLO_DIR}/ 有未登记文件：${unreg.join(', ')}`);
else ok(`${AHOLO_DIR}/ ${files.length} 个文件全部已登记`);

// 3) 产物检查：用每个比赛文件 base64 中间一段做指纹
// 与某个原有资产逐字节相同的比赛文件无法区分，跳过（真实的 Lux3D 生成物不会出现这种情况）
const baseHashes = new Set(execSync('git ls-files -s -- assets', { encoding: 'utf8' }).split('\n').filter(Boolean).map(l => l.split(/\s+/)[1]));
const fp = [];
for (const f of files) {
  const buf = readFileSync(join(AHOLO_DIR, f));
  const h = execSync(`git hash-object "${join(AHOLO_DIR, f)}"`, { encoding: 'utf8' }).trim();
  if (baseHashes.has(h)) { console.log(`· ${f} 与某个原有资产完全相同，不做泄漏检查`); continue; }
  const b = buf.toString('base64');
  const start = b.length > 2000 ? Math.floor(b.length / 8) * 4 : 0;   // 4 的倍数对齐，避开文件头（GLB 头部大同小异）
  fp.push({ f, s: b.slice(start, start + 160) });
}
let targets = process.argv.slice(2);
if (!targets.length) {
  targets = ['web/index.html', 'web/index_dlc1.html'].filter(existsSync);
  if (existsSync('web')) for (const f of readdirSync('web')) if (f.endsWith('_比赛版.html')) targets.push('web/' + f);
}
for (const t of targets) {
  if (!existsSync(t)) { bad(`找不到产物 ${t}`); continue; }
  const html = readFileSync(t, 'utf8');
  const hits = fp.filter(x => html.includes(x.s)).map(x => x.f);
  const contest = t.includes('_比赛版');
  if (contest) ok(`${t}：比赛版，含比赛资产 ${hits.length}/${fp.length}${hits.length ? '（' + hits.join(', ') + '）' : ''}`);
  else if (hits.length) bad(`${t}：商用产物含比赛资产 ${hits.join(', ')}`);
  else ok(`${t}：商用产物不含比赛资产`);
}
console.log(fail ? `check-assets 失败 ${fail} 项` : 'check-assets 通过');
process.exit(fail ? 1 : 0);
