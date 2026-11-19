// v1.2.54 铸造台「按提示词识别武器类型」单元测试（零积分：不联网，fetch 全部是本地假函数）
// 覆盖：识别表（≥10 条 + 未识别）、提示词拼接、输入框下方的识别提示、smithyRun 发的 weaponType / pending 类型、
//   同组 → 换上、不同组 → 只入库不换上（中文提示）、未识别 → 按主手、离线武器库按识别类型优先、服务端 buildPrompt 支持所有识别类型
// 用法：node test/forge_detect.test.mjs
import { build } from 'esbuild';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

// 假 localStorage（铸造服务地址 → server 模式）
const LS = new Map();
globalThis.localStorage = { getItem: k => LS.has(k) ? LS.get(k) : null, setItem: (k, v) => LS.set(k, String(v)), removeItem: k => LS.delete(k), clear: () => LS.clear() };
const OUT = '/tmp/forge_detect_bundle.mjs';
await build({ entryPoints: [ROOT + 'src/dlc/dlc1/smithy.ts'], bundle: true, format: 'esm', platform: 'node', outfile: OUT, logLevel: 'error' });
const S = await import(OUT + '?t=' + Date.now());

// ---- 1 识别表
const CASES = [
  ['缠着海藻的锈蚀锚形长剑', 'sword'],
  ['黑曜石细剑', 'sword'],
  ['染血的弯刀', 'sword'],
  ['熔岩双手巨剑', 'greatsword'],
  ['骨制大剑', 'greatsword'],
  ['冰霜战斧', 'axe'],
  ['刻满符文的双手巨斧', 'greataxe'],
  ['剑柄镶着斧刃的战锤', 'mace'],
  ['钉头锤', 'mace'],
  ['淬毒匕首', 'dagger'],
  ['影子短刀', 'dagger'],
  ['顶端嵌着宝珠的法杖', 'staff'],
  ['黄金权杖', 'staff'],
  ['桦木魔杖', 'wand'],
  ['精灵长弓', 'bow'],
  ['机关十字弩', 'bow'],
  ['龙骨长枪', 'greataxe'],
  ['青铜戟', 'greataxe'],
  ['死神镰刀', 'greataxe'],
  ['时砂轮刃', 'chakram'],
  ['冒泡的绿色药瓶', 'flask'],
  ['漂浮的紫色法球', 'orb'],
  ['羊皮魔法书', 'tome'],
  ['一面龙鳞盾', null],
  ['一块发光的石头', null],
  ['', null],
];
for (const [p, want] of CASES) { const got = S.smithyDetectType(p); ok(got === want, `识别「${p}」→ ${got}（应为 ${want}）`); }

// ---- 2 提示词拼接 / 服务端支持
ok(S.smithyBuildPrompt('缠着海藻的锈蚀锚形长剑', 'sword').includes('一把单手长剑'), 'smithyBuildPrompt 用识别类型（单手长剑）');
const fc = require(ROOT + 'cloud/forge-fc/index.js');
const types = [...new Set(S.SMITHY_TYPE_KW.map(x => x[1]))];
ok(types.every(t => !fc._buildPrompt('x', t).includes('一把武器')), `服务端 buildPrompt 认识全部 ${types.length} 种识别类型：${types.join(',')}`);
ok(types.every(t => !S.smithyBuildPrompt('x', t).includes('一把武器')), '前端 smithyBuildPrompt 认识全部识别类型');

// ---- 3 识别提示文字
ok(S.smithyDetectLabel('缠着海藻的锈蚀锚形长剑', 'axe') === '识别为：单手剑（按提示词）', `提示：${S.smithyDetectLabel('缠着海藻的锈蚀锚形长剑', 'axe')}`);
ok(S.smithyDetectLabel('一块发光的石头', 'axe') === '未识别，按主手：单手斧', `提示：${S.smithyDetectLabel('一块发光的石头', 'axe')}`);
ok(/^识别为：双手斧（按提示词）　·　与当前主手（单手剑）不同类/.test(S.smithyDetectLabel('双手巨斧', 'sword')), `提示：${S.smithyDetectLabel('双手巨斧', 'sword')}`);

// ---- 4 smithyRun（假 ctx + 假铸造服务）
const LIB = [
  { key: 'weapon_bell_sword', type: 'sword' }, { key: 'weapon_rock_axe', type: 'axe' }, { key: 'weapon_rock_mace', type: 'mace' }, { key: 'weapon_rock_dagger', type: 'dagger' },
  { key: 'weapon_rock_greatsword', type: 'greatsword' }, { key: 'weapon_rock_greataxe', type: 'greataxe' }, { key: 'weapon_bell_staff', type: 'staff' }, { key: 'weapon_rock_wand', type: 'wand' },
];
let main = 'sword'; const sets = [], loads = [], keys = new Set(LIB.map(l => l.key));
const ws = { mainType: () => main, library: () => LIB, get: () => null, set: (t, k) => { sets.push([t, k]); return true; }, load: async (k, b, meta) => { loads.push({ k, meta }); keys.add(k); return true; }, has: k => keys.has(k), list: () => [] };
S.bindSmithy({ weaponSkin: ws, toast() {} });
LS.set('darkrock_forge_api', 'http://fake.forge');
S.SMITHY.pollMs = 5;
const posts = []; let id = 900;
const fetcher = async (url, o = {}) => {
  const u = String(url);
  if (u.endsWith('/forge') && o.method === 'POST') { const b = JSON.parse(o.body); posts.push(b); return new Response(JSON.stringify({ taskId: ++id }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  if (u.includes('/forge/status/')) return new Response(JSON.stringify({ state: 'done', url: '/glb/' + u.split('/').pop() + '.glb' }), { status: 200 });
  if (u.includes('/glb/')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  return new Response('{}', { status: 404 });
};
globalThis.fetch = fetcher;   // smithyBoot 的版本 / 配置查询也走假服务
const run = async p => { LS.delete('darkrock_forge_day'); const r = await S.smithyRun(p, fetcher, true); return r; };

let r = await run('缠着海藻的锈蚀锚形长剑');
ok(posts.at(-1)?.weaponType === 'sword' && r.ok && r.online && r.worn === true && r.detected === 'sword' && sets.at(-1)?.[1] === r.key, `同组（长剑 / 主手单手剑）→ weaponType=sword，换上：${r.msg}`);
main = 'axe';
r = await run('缠着海藻的锈蚀锚形长剑');
ok(posts.at(-1)?.weaponType === 'sword' && loads.at(-1)?.meta.type === 'sword' && r.worn === true && sets.at(-1)?.[0] === 'axe' && sets.at(-1)?.[1] === r.key, `主手单手斧、提示词长剑 → 生成 sword（不再是 axe），同组换上：${r.msg}`);
main = 'sword'; const s0 = sets.length;
r = await run('刻满符文的双手巨斧');
ok(posts.at(-1)?.weaponType === 'greataxe' && loads.at(-1)?.meta.type === 'greataxe' && r.type === 'greataxe' && r.worn === false && sets.length === s0, `不同组（双手巨斧 / 主手单手剑）→ weaponType=greataxe，只入库不换上`);
ok(r.msg === '这把是双手斧，当前主手是单手剑，已收进「我的铸造品」，换同类武器后可换上', `不同组提示：${r.msg}`);
r = await run('一块发光的石头');
ok(posts.at(-1)?.weaponType === 'sword' && r.worn === true && r.detected === null, `未识别 → 按主手 sword：${r.msg}`);
// pending 记识别类型：创建后、取回前看 pending
const slowF = async (url, o = {}) => { const u = String(url); if (u.includes('/forge/status/')) { pendSeen = S.smithyPending(); return new Response(JSON.stringify({ state: 'failed', error: '测试失败' }), { status: 200 }); } return fetcher(url, o); };
let pendSeen = null; LS.delete('darkrock_forge_day');
r = await S.smithyRun('精灵长弓', slowF, true);
ok(pendSeen?.type === 'bow' && posts.at(-1)?.weaponType === 'bow', `pending 记识别类型：${pendSeen?.type}`);

// ---- 5 离线武器库按识别类型优先（同组里挑）
ok(S.smithyPickOffline('淬毒匕首', 'sword') === 'weapon_rock_dagger', `离线：匕首 → ${S.smithyPickOffline('淬毒匕首', 'sword')}`);
ok(S.smithyPickOffline('冰霜战锤', 'axe') === 'weapon_rock_mace', `离线：战锤 → ${S.smithyPickOffline('冰霜战锤', 'axe')}`);
ok(S.smithyPickOffline('桦木魔杖', 'staff') === 'weapon_rock_wand', `离线：魔杖 → ${S.smithyPickOffline('桦木魔杖', 'staff')}`);
ok(S.smithyPickOffline('熔岩双手巨剑', 'sword') !== 'weapon_rock_greatsword', '离线：识别类型不同组时只在主手同组里挑（不塞双手剑）');

console.log(`${fail ? '✗' : '✓'} 铸造类型识别 ${n - fail}/${n}`);
process.exit(fail ? 1 : 0);
