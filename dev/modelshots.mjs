// v1.2.0-m1 模型套件 playtest：经典 / 写实两种设置下进游戏，检查模型、动作、挂件，截图对照
// v1.2.17 起：按职业逐个检查 + 近景截图（正面 / 侧面 / 攻击帧 / 全套装备），最后拼成对照图
// 用法：node dev/modelshots.mjs [html] [输出目录] [模式,逗号分隔] [职业,逗号分隔]
//   例：node dev/modelshots.mjs web/index_dlc1.html /tmp/models classic,new warrior,mage
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { execSync } from 'child_process';
const HTML = resolve(process.argv[2] || 'web/index_dlc1.html'), OUT = process.argv[3] || '/tmp/models';
const MODES = process.argv[4] ? process.argv[4].split(',') : ['classic', 'new', 'auto'];
const CLASSES = process.argv[5] ? process.argv[5].split(',') : ['warrior'];
(await import('fs')).mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
/** 写实模式下每个职业期望的模型（没列的 = 还没换，仍是经典） */
const HD_MODEL = { warrior: process.env.HD_WARRIOR ?? 'UBC_Male', mage: 'UBC_Female', chrono: 'UBC_Male', alchemy: 'UBC_Male', hunter: 'UBC_Male', coffin: 'UBC_Male' };
const HD_DONE = (process.env.HD_DONE ?? 'warrior').split(',');
const shots = [];
for (const mode of MODES) for (const cls of CLASSES) {
  const page = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => console.log('PAGE CRASH')); page.on('console', m => { if (m.type() === 'error' || m.text().includes('写实')) console.log('console:', m.text().slice(0, 200)); });
  await page.goto('file://' + HTML);
  await page.evaluate(m => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: m })); }, mode);
  await page.reload();
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
  const has = await page.evaluate(c => { try { window.__game.startGame(c); return true; } catch (e) { return String(e); } }, cls);
  if (has !== true) { ok(false, `${mode}/${cls}: startGame ${has}`); await page.close(); continue; }
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => { const g = window.__game, r = g.player.rig; const names = []; r.root.traverse(o => names.push(o.name));
    const anim = r.anim; const acts = anim ? [...anim.actions.keys()] : [];
    const clipOf = {}; if (anim) for (const [k, a] of anim.actions) clipOf[k] = (Array.isArray(a) ? a : [a]).map(x => x.getClip().name).join('|');
    return { model: r.root.userData.model, acts, clipOf, hand: names.includes('handslotr'), head: names.includes('head'), hips: names.includes('hips') }; });
  const wantModel = mode === 'new' && HD_DONE.includes(cls) ? HD_MODEL[cls] : null;
  if (wantModel) ok(info.model === wantModel, `${mode}/${cls}: 模型 ${info.model}（期望 ${wantModel}）`);
  else console.log(`INFO ${mode}/${cls}: 模型 ${info.model}`);
  ok(info.hand && info.head && info.hips, `${mode}/${cls}: 挂点骨骼 handslotr/head/hips`);
  for (const a of ['idle', 'walk', 'run', 'attack1', 'attack2', 'attack3', 'heavy', 'cast', 'hit', 'death']) ok(info.acts.includes(a), `${mode}/${cls}: 动作 ${a}`);
  if (wantModel) {
    const atk = new Set(['attack1', 'attack2', 'attack3', 'heavy', 'spin'].map(k => info.clipOf[k]));
    ok(atk.size >= 3, `${mode}/${cls}: 攻击片段 ${atk.size} 种（${[...atk].join(' / ')}）`);
    console.log(`INFO ${mode}/${cls} 动作表`, JSON.stringify(info.clipOf));
  }
  // 近景：藏 UI，镜头贴近，正面 / 侧面 / 攻击帧
  await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden';
    const g = window.__game; g.camSet(4.6, 0.2); g.camYawSet(0); g.player.rig.root.rotation.y = 0; });
  const snap = async (tag, setup, wait = 400) => {
    await page.evaluate(setup); await page.waitForTimeout(wait);
    const f = `${OUT}/${cls}_${mode}_${tag}.png`;
    await page.screenshot({ path: f, clip: { x: 280, y: 30, width: 340, height: 560 } }); shots.push(f); return f;
  };
  await snap('front', () => { const g = window.__game; g.player.rig.anim?.loop('idle'); g.player.rig.root.rotation.y = 0; }, 600);
  await snap('side', () => { window.__game.player.rig.root.rotation.y = Math.PI / 2; });
  await snap('attack', () => { const g = window.__game; g.player.rig.root.rotation.y = 0.5; g.player.rig.anim?.play('attack2'); }, 380);
  // 全套装备（紫色 + 披风 + 肩 + 头 + 胸）
  await page.evaluate(c => { const g = window.__game; g.gen.classId = c; g.player.rig.root.rotation.y = 0;
    for (const sl of ['head', 'shoulder', 'chest', 'back', 'hands', 'legs']) { const it = g.gen.generate(30, 'purple', [sl]); if (!it) continue; g.inventory.add(it); try { g.inventory.equip(it.id, sl); } catch (e) { /* 该职业不能穿 */ } }
    g.syncCharacter(); }, cls);
  await snap('gear', () => { const g = window.__game; g.player.rig.anim?.loop('idle'); g.player.rig.root.rotation.y = 0.3; }, 1200);
  await snap('gearback', () => { window.__game.player.rig.root.rotation.y = Math.PI - 0.5; }, 300);
  ok(errors.length === 0, `${mode}/${cls}: 无页面错误 ${errors.slice(0, 2).join(' | ')}`);
  await page.close();
}
// 拼图：每行一个 职业×模式，四列 正面 / 侧面 / 攻击 / 全套
try {
  const rows = [];
  for (const cls of CLASSES) for (const mode of MODES) {
    const fs = ['front', 'side', 'attack', 'gear', 'gearback'].map(t => `${OUT}/${cls}_${mode}_${t}.png`);
    const r = `${OUT}/_row_${cls}_${mode}.png`;
    execSync(`convert ${fs.join(' ')} +append -resize 50% -gravity NorthWest -fill white -undercolor '#0008' -pointsize 18 -annotate +6+6 '${cls} / ${mode}' ${r}`);
    rows.push(r);
  }
  execSync(`convert ${rows.join(' ')} -append ${OUT}/montage.png`); console.log('montage', `${OUT}/montage.png`);
} catch (e) { console.log('拼图失败（没装 ImageMagick？）', String(e).slice(0, 120)); }
console.log(fail ? `FAIL ${fail}` : 'ALL PASS');
await b.close();
process.exit(fail ? 1 : 0);
