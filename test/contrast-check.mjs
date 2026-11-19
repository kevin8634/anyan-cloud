// v0.9.1o 文字对比度审计：开局后逐个打开羊皮纸面板，找出和背景对比度不足的文字（没有描边阴影的）
// 运行：LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu node test/contrast-check.mjs [阈值=4.5]
import { chromium } from 'playwright-core';
const TH = Number(process.argv[2] ?? 4.5);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('file://' + process.cwd() + '/web/index.html');
await p.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 60000 });
await p.evaluate(() => { document.getElementById('class-pick').children[0].click(); document.getElementById('start').click(); });
await p.waitForTimeout(3000);
await p.evaluate(() => { const g = window.__game; g.tutFinish?.(); for (let i = 0; i < 29; i++) g.progression.addXp?.(1e6);
  for (const id of ['i_fury_bracer', 'i_fury_legs', 'i_helm', 'i_chest']) { try { g.inventory.add(g.gen.generateFixed(id, 30)); } catch {} }
  for (const q of g.quests.defs.slice(0, 40)) { try { g.quests.accept(q.id, 30); } catch {} } });
const ids = await p.evaluate(() => [...document.querySelectorAll('.panel.parch')].map(e => e.id));
const all = [];
for (const id of ids) {
  const res = await p.evaluate(async ({ id, TH }) => {
    const g = window.__game;
    try { if (id === 'abyss') g.openAbyss ? g.openAbyss() : g.togglePanel(id, true); else g.togglePanel(id, true); } catch (e) { return { err: String(e) }; }
    await new Promise(r => setTimeout(r, 300));
    const panel = document.getElementById(id); if (getComputedStyle(panel).display === 'none') return { skip: true };
    const rgb = s => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
    const lum = ([r, g2, b2]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b2); };
    const PARCH = [232, 213, 170];
    const mix = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
    const imgBg = el => { for (let e = el; e && e !== panel; e = e.parentElement) if (getComputedStyle(e).backgroundImage !== 'none') return true; return false; };
    const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0) stack.push(c); if (e === panel) break; } let bg = PARCH; for (const c of stack.reverse()) bg = mix(c, bg); return bg; };
    const out = [];
    const body = panel.querySelector('.body') ?? panel;
    for (const el of body.querySelectorAll('*')) {
      const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
      if (!own) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || el.offsetParent === null) continue;
      if (imgBg(el)) continue;
      if (cs.textShadow !== 'none' && /0px 0px|1px 1px|-1px/.test(cs.textShadow)) continue;
      const fg0 = rgb(cs.color), bg = bgOf(el), fg = mix([...fg0.slice(0, 3), (fg0[3] ?? 1) * Number(cs.opacity)], bg);
      const L1 = lum(fg), L2 = lum(bg), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (cr < TH) out.push({ cr: +cr.toFixed(2), color: cs.color, bg: bg.map(Math.round).join(','), cls: el.className?.toString?.() || el.tagName, text: own.slice(0, 24) });
    }
    g.togglePanel(id, false);
    return { out };
  }, { id, TH });
  if (res.out?.length) { console.log(`## ${id}  (${res.out.length})`); const seen = new Set(); for (const o of res.out) { const k = o.color + o.cls; if (seen.has(k)) continue; seen.add(k); console.log(`  ${o.cr}  ${o.color} on ${o.bg}  .${o.cls}  「${o.text}」`); } all.push(...res.out); }
  else if (res.err) console.log(`## ${id} ERR ${res.err}`);
}
console.log(all.length ? `❌ 低对比度文字 ${all.length} 处（阈值 ${TH}）` : `✅ 所有面板文字对比度 ≥ ${TH}`);
await b.close();
