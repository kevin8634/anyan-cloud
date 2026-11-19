// v1.2.71 入口剧情「潮音钟门」e2e：node test/gate71_e2e.mjs [html=web/index_dlc1.html] [画质=medium]
//   7-0 发放（墨言在灰石营地）→ 心脏碎片 → 交给布兰 → 钟铸好 → 古井交互敲钟 → 井水下降 + 下行过场 → 沉钟海岸潮痕营地（伊奥拉旁、7-1 可接）
//   首次下行前传送阵不列「沉钟海岸」，之后列出；老存档（已接 7-1 / 到过海岸）直接视为完成、传送阵不上锁；过场截图存 shots_gate71/
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1.html'), Q = process.argv[3] || 'medium';
const OUT = resolve(ROOT, 'shots_gate71'); mkdirSync(OUT, { recursive: true });
const NOISE = /webp|decode|media|play\(\)|NotAllowedError|AudioContext was not allowed|Failed to load resource|ERR_FILE_NOT_FOUND/i;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.setDefaultTimeout(600000);
await page.addInitScript(([q]) => { if (!sessionStorage.getItem('g71')) { sessionStorage.setItem('g71', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, dayNight: false })); } }, [Q]);
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
const CH6 = ['em_scholar', 'ch6_1', 'ch6_2', 'ch6_3', 'ch6_4'];
const wpRow = () => page.evaluate(() => { const g = window.__game; g.openWaypoints(); const r = document.getElementById('travel-body').querySelector('[data-packwp="dlc1_coast_wp"]'); const out = r ? { btn: !r.querySelector('button').disabled, text: r.textContent.slice(0, 40) } : null; g.togglePanel('travel', false); return out; });

// ---------- 1. 发放
await page.evaluate((CH6) => { const g = window.__game; g.tutFinish?.(); g.progression.level = 29; g.quests.load({ active: {}, done: CH6.slice(0, 4) }); window.__dlc1.gate.reset(); }, CH6);
let s = await page.evaluate(() => ({ st: window.__game.quests.state('cs7_0', 29), npc: window.__game.npcs.some(n => n.id === 'scholar' && n.z === 'world'), gate: window.__dlc1.gate.debug() }));
ok(s.npc, '墨言出现在灰石营地（本体 NPC 挂点）');
ok(s.st !== 'available' && s.gate.built && !s.gate.bell, `29 级 / 第六章未完：7-0 不可接（${s.st}）；古井钟门已建、钟未铸`);
await page.evaluate((CH6) => { const g = window.__game; g.progression.level = 30; g.quests.load({ active: {}, done: CH6 }); }, CH6);
s = await page.evaluate(() => ({ st: window.__game.quests.state('cs7_0', 30), offer: window.__game.quests.npcQuests('scholar', 30).map(q => q.id ?? q.q?.id ?? q), q1: window.__game.quests.state('cs7_1', 30) }));
ok(s.st === 'available' && JSON.stringify(s.offer).includes('cs7_0'), `30 级 + ch6_4 完成：墨言发放 7-0「余音」（${s.st}）`);
ok(!(await wpRow()), '首次下行前：营地传送阵不列出「沉钟海岸」');
// 古井交互（钟未铸）
await page.evaluate(() => { const g = window.__game; g.player.pos.set(-6, 0, -4.2); });   // 交互半径 3.4：站在拱门前 2.8 米（-3.2 = 3.8 米在半径外）
await page.waitForTimeout(800);
let it = await page.evaluate(() => window.__game.currentInteractable()?.label);
ok(/古井/.test(it ?? ''), `古井交互提示：「${it}」`);
await page.screenshot({ path: `${OUT}/1_古井_未铸.png` });
// ---------- 2. 完成
await page.evaluate(() => { const g = window.__game; g.quests.accept('cs7_0', 30); });
await page.evaluate(() => window.__dlc1.gate.simShard());
s = await page.evaluate(() => ({ a: window.__game.quests.active().find(a => a.q.id === 'cs7_0'), d: window.__dlc1.gate.debug() }));
ok(s.d.shard === 1 && s.a?.p?.[0] === 1, '深渊首领击杀事件（zone raid、boss）→「心脏碎片」到手（explore 目标完成）');
await page.evaluate(() => { const g = window.__game; g.openDialog('bran'); g.togglePanel('dialog', false); });
s = await page.evaluate(() => ({ st: window.__game.quests.state('cs7_0', 30) }));
ok(s.st === 'ready', `交给布兰：7-0 可交付（${s.st}）`);
await page.evaluate(() => { window.__game.quests.turnIn('cs7_0', 30); });
await page.waitForTimeout(1200);
await page.waitForFunction(() => window.__dlc1.gate.debug().bell, null, { timeout: 20000, polling: 300 }).catch(() => {});   // 钟的显示每 0.5 秒游戏时间同步一次，swiftshader 掉帧时要 4–6 秒
s = await page.evaluate(() => ({ st: window.__game.quests.state('cs7_0', 30), d: window.__dlc1.gate.debug() }));
ok(s.st === 'done' && s.d.done && s.d.bell, `7-0 完成：钟铸好挂上古井（bell ${s.d.bell}）`);
ok(!(await wpRow()), '钟铸好但还没下行：传送阵仍不列出');
it = await page.evaluate(() => window.__game.currentInteractable()?.label);
ok(/敲响潮音钟/.test(it ?? ''), `古井交互：「${it}」`);
await page.evaluate(() => { const g = window.__game; window.__camOv = [-1.5, 3.2, 1.5, -6, 3.2, -7]; });
await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/2_潮音钟门_钟已铸.png` });
await page.evaluate(() => { delete window.__camOv; });
// ---------- 3. 敲钟 → 过场 → 海岸
await page.evaluate(() => { window.__dlc1.gate.setSpeed(1); window.__game.currentInteractable().act(); });
await page.waitForTimeout(1200);
await page.waitForFunction(() => window.__dlc1.gate.debug().level > 0, null, { timeout: 20000, polling: 200 }).catch(() => {});   // 水位按游戏时间推进，swiftshader 掉帧时 1.2 秒可能还是 0
s = await page.evaluate(() => window.__dlc1.gate.debug());
ok(s.busy && s.level > 0, `敲钟：井水开始下降（${s.level}）`);
await page.waitForFunction(() => window.__dlc1.gate.debug().descent.on, null, { timeout: 60000, polling: 300 }).catch(() => {});
const shotAt = async (name, t) => { await page.waitForFunction(t => window.__dlc1.gate.debug().descent.t >= t || !window.__dlc1.gate.debug().descent.on, t, { timeout: 120000, polling: 250 }).catch(() => {}); await page.screenshot({ path: `${OUT}/${name}.png` }); };
await shotAt('3_下行_螺旋阶梯', 2.5); await shotAt('4_下行_壁画', 7); await shotAt('5_下行_潮水倒退', 10.5);
const st3 = await page.evaluate(() => window.__dlc1.gate.debug().descent);
ok(st3.webgl && st3.frames > 3, `下行过场：独立 WebGL 画布渲染 ${st3.frames} 帧，阶段 ${st3.stage}`);
await page.waitForFunction(() => window.__game.zone === 'dlc1_coast' && !window.__dlc1.gate.debug().descent.on, null, { timeout: 180000, polling: 500 }).catch(() => {});
s = await page.evaluate(() => { const g = window.__game, io = g.npcs.find(n => n.id === 'iola'); return { zone: g.zone, p: [+(g.player.pos.x - 2400).toFixed(1), +(g.player.pos.z + 2400).toFixed(1)], iola: io ? +Math.hypot(io.rig.root.position.x - g.player.pos.x, io.rig.root.position.z - g.player.pos.z).toFixed(1) : -1, q1: g.quests.state('cs7_1', 30), d: window.__dlc1.gate.debug() }; });
ok(s.zone === 'dlc1_coast' && s.iola >= 0 && s.iola < 6, `到达沉钟海岸潮痕营地（局部 ${s.p}），伊奥拉在 ${s.iola} 米内`);
ok(s.q1 === 'available' && s.d.descended === 1 && s.d.arrived === 1, `7-1 可接（${s.q1}），首次下行已记录`);
await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/6_抵达潮痕营地.png` });
// ---------- 4. 首次后传送阵解锁 + 常驻入口
await page.evaluate(() => window.__game.goMap('camp')); await page.waitForTimeout(2000);
const row = await wpRow();
ok(!!row && row.btn, `首次下行后：传送阵列出「沉钟海岸」且可用（${row?.text}）`);
const sv = await page.evaluate(() => JSON.parse(window.__game.rawSave()).dlc?.dlc1?.gate);
ok(sv && sv.descended === 1, `存档记下首次下行（dlc.dlc1.gate ${JSON.stringify(sv)}）`);
await page.evaluate(() => { const g = window.__game; g.player.pos.set(-6, 0, -4.2); window.__dlc1.gate.setSpeed(6); }); await page.waitForTimeout(800);
await page.evaluate(() => window.__game.currentInteractable().act());
await page.waitForFunction(() => window.__game.zone === 'dlc1_coast' && !window.__dlc1.gate.debug().descent.on, null, { timeout: 180000, polling: 500 }).catch(() => {});
s = await page.evaluate(() => ({ zone: window.__game.zone, d: window.__dlc1.gate.debug() }));
ok(s.zone === 'dlc1_coast' && s.d.arrived === 2, '钟门常驻：再次敲钟直接下行到海岸');
// ---------- 5. 老存档兼容
await page.evaluate(() => { const g = window.__game; g.goMap('camp'); window.__dlc1.gate.reset(); g.quests.load({ active: { cs7_1: [0] }, done: ['ch6_4'] }); }); await page.waitForTimeout(1500);
s = await page.evaluate(() => window.__dlc1.gate.debug()); const r1 = await wpRow();
ok(s.legacy && s.done && s.open && r1?.btn, `老存档（已接 7-1、无 7-0）：视为 7-0 完成，传送阵不上锁（${r1?.text}）`);
await page.evaluate(() => { const g = window.__game; window.__dlc1.gate.reset(); g.quests.load({ active: {}, done: [] }); g.goMap('dlc1_coast'); }); await page.waitForTimeout(2500);
await page.evaluate(() => window.__game.goMap('camp')); await page.waitForTimeout(1500);
s = await page.evaluate(() => window.__dlc1.gate.debug()); const r2 = await wpRow();
ok(s.coastSeen === 1 && s.open && !!r2, `老存档（到过海岸、没有任何第七章任务）：传送阵列出（${r2?.text}）`);
await page.evaluate(() => { const g = window.__game; window.__dlc1.gate.reset(); g.quests.load({ active: {}, done: ['ch6_4', 'cs7_1', 'cs7_2'] }); }); await page.waitForTimeout(500);
s = await page.evaluate(() => window.__dlc1.gate.debug());
ok(s.done && s.open, '老存档（已完成 7-1）：视为 7-0 完成');
const real = errors.filter(e => !NOISE.test(e));
if (errors.length) console.log('页面报错', errors.length, '非环境噪声', real.length, real.slice(0, 5).join(' | '));
ok(!real.length, `0 报错（环境噪声 ${errors.length - real.length} 条不计）`);
console.log(`gate71_e2e ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
