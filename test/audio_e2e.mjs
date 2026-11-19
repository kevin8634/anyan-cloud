// v1.2.48 曲目 + 配音浏览器端到端（比赛版 DLC：web/index_dlc1_比赛版.html + web/music/）
//   首次交互前不出声 → 交互后标题曲 → 开场旁白（字幕 + 压低音乐）→ 钟楼 silent_belfry → 首领开打登场配音 + boss_battle → 最后阶段配音字幕
//   → 镜渊城倒钟广场 bell_plaza / 城内 silent_belfry → 沉钟海岸 sunken_shore；普通版 DLC：没有曲目，程序化音乐不受影响
// 用法：node test/audio_e2e.mjs [html，默认比赛版 DLC]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { existsSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html');
const AHOLO = /比赛版/.test(HTML);
if (!existsSync(HTML)) { console.log('跳过：没有', HTML); process.exit(0); }
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 640, height: 400 } }); page.setDefaultNavigationTimeout(180000);   // 10-27：比赛版页面 95–120 MB，file:// 加载在软件渲染 + 其他浏览器任务并发时常超过默认 30 秒 → 导航超时放宽到 180 秒
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); sessionStorage.setItem('__init', '1'); } });
await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
const A = () => page.evaluate(() => { const a = window.__game.audio; return { ...a.tracks.state(), names: a.tracks.names(), voice: a.voicePlaying, yell: document.getElementById('yell').textContent, sub: document.getElementById('vo-sub')?.textContent ?? '', subOn: !!document.querySelector('#vo-sub.on') }; });
const waitTrack = (name, ms = 20000) => page.waitForFunction(nm => window.__game.audio.tracks.current === nm, name, { timeout: ms, polling: 250 }).then(() => true, () => false);
const s0 = await A();
if (!AHOLO) {
  ok(s0.names.length === 0, `普通版没有曲目（${s0.names.join(',') || '无'}）`);
  await page.mouse.click(5, 5); await page.waitForTimeout(800);
  ok((await A()).cur === null, '普通版交互后仍是程序化音乐');
  ok(!errs.length, `无页面错误 ${errs.slice(0, 2).join(' | ')}`);
  console.log(`${fail ? '✗' : '✓'} audio_e2e ${n - fail}/${n}`); await b.close(); process.exit(fail ? 1 : 0);
}
ok(['title_theme', 'boss_battle', 'ending', 'bell_plaza', 'silent_belfry', 'sunken_shore', 'final_boss_sleeper'].every(t => s0.names.includes(t)), `曲目登记 ${s0.names.join(',')}`);
ok(s0.cur === null, `首次交互前不播放（cur=${s0.cur}）`);
await page.mouse.click(5, 5);
ok(await waitTrack('title_theme', 5000), '交互后切到标题曲');
await page.waitForTimeout(2500);
let s = await A();
ok(s.tracks.title_theme && !s.tracks.title_theme.paused && s.tracks.title_theme.lvl > 0.5, `标题曲在播（${JSON.stringify(s.tracks.title_theme)}）`);
const vol0 = s.tracks.title_theme?.vol ?? 0;
// 开场旁白（webdriver 下开场动画自动跳过，直接调钩子）
await page.evaluate(() => window.__game.audio.introDone?.());
await page.waitForTimeout(1500);
s = await A();
// v1.2.54 Rhett：标题 / 选角画面不要说话，只放音乐（main.ts audio.introDone = null）→ 改为检查不出旁白、音乐不压低
ok(!s.voice, `标题画面不播开场旁白（v1.2.54 Rhett 定）`);
ok(s.tracks.title_theme.vol >= vol0 * 0.9, `标题曲音量不被压低 ${vol0} → ${s.tracks.title_theme.vol}`);
await page.evaluate(() => window.__game.audio.stopVoice());
await page.waitForTimeout(1500);
ok((await A()).tracks.title_theme.vol > vol0 * 0.9, '旁白结束音乐恢复');
// 进游戏：钟楼
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e8; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); });
ok(await waitTrack('silent_belfry'), `无声钟楼 → silent_belfry（${(await A()).cur}）`);
await page.waitForTimeout(2500);
s = await A();
ok(s.tracks.title_theme && s.tracks.title_theme.lvl === 0 && s.tracks.title_theme.paused, `交叉淡出标题曲（${JSON.stringify(s.tracks.title_theme)}）`);
// 首领交战 → boss_battle；最后阶段 → 配音字幕
const spawned = await page.waitForFunction(() => window.__game.enemies.some(x => x.pboss === 'bt_b1'), null, { timeout: 30000, polling: 250 }).then(() => true, () => false);
ok(spawned, '首领生成');
await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.pboss === 'bt_b1'); g.player.pos.set(e.pos.x + 1, 0, e.pos.z + 5); g.target = e; e.brain.provoke?.(); });
const intro = await page.waitForFunction(() => document.getElementById('yell').textContent.includes('借你的骨头'), null, { timeout: 15000, polling: 100 }).then(() => true, () => false);
ok(intro && (await A()).voice, `开打时登场配音字幕「${(await A()).yell}」`);
ok(await waitTrack('boss_battle'), `首领交战 → boss_battle（${(await A()).cur}）`);
await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.pboss === 'bt_b1'); e.hp = e.maxHp * 0.45; g.player.hp = 1e8; });
const said = await page.waitForFunction(() => document.getElementById('yell').textContent.includes('铜的孩子'), null, { timeout: 15000, polling: 200 }).then(() => true, () => false);
s = await A();
ok(said && s.voice, `最后阶段配音 + 字幕「${s.yell}」`);
ok(s.tracks.boss_battle && s.tracks.boss_battle.vol < 0.2, `配音时首领曲压低（vol ${s.tracks.boss_battle?.vol}）`);
// 离开首领 → 4 秒后回区域曲；镜渊城
await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.pboss === 'bt_b1'); e.brain.reset?.(); g.target = null; g.audio.stopVoice(); g.ensureWild('dlc1_mirror'); g.goMap('dlc1_mirror'); g.player.hp = 1e8; });
// 10-27：合并海底第五轮 / 环境高精后首次进镜渊城建图更重，安静机器上实测 13.5 秒才切到 bell_plaza（离开首领 4 秒延迟 + 建图），并发时超过 20 秒 → 放宽到 45 秒
ok(await waitTrack('camp_bell_plaza', 45000), `镜渊城倒钟广场（主营地）→ camp_bell_plaza（${(await A()).cur}）`);
await page.evaluate(() => { const g = window.__game; g.player.pos.set(2400, 0, -2100 - 10); });
ok(await waitTrack('silent_belfry'), `镜渊城城内 → silent_belfry（${(await A()).cur}）`);
await page.evaluate(() => { const g = window.__game; g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); });
ok(await waitTrack('sunken_shore'), `沉钟海岸 → sunken_shore（${(await A()).cur}）`);
await page.evaluate(() => window.__game.goMap('camp'));
ok(await waitTrack(null), `本体营地 → 程序化音乐（${(await A()).cur}）`);
s = await A();
ok(!s.bad.length, `曲目全部加载成功（坏曲目 ${s.bad.join(',') || '无'}）`);
ok(!errs.length, `无页面错误 ${errs.slice(0, 2).join(' | ')}`);
console.log(`${fail ? '✗' : '✓'} audio_e2e ${n - fail}/${n}`);
await b.close();
process.exit(fail ? 1 : 0);
