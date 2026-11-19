import { chromium } from 'playwright-core';
const [file, tag, mode] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.HOME+'/.cache/ms-playwright/chromium-1140/chrome-linux/chrome', args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[]; p.on('pageerror', e=>errs.push(String(e))); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.addInitScript(() => {
  const orig = performance.now.bind(performance); let last = orig(), virt = last;
  performance.now = () => { const n = orig(); virt += (n - last) * (window.__ts ?? 1); last = n; return virt; };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
});
await p.goto('file://' + file);
await p.waitForTimeout(7000); console.log('early', errs.slice(0,5), await p.evaluate(()=>typeof window.__game));
await p.evaluate(()=>document.getElementById('start').click());
await p.waitForTimeout(5000);
await p.evaluate(()=>{ const g=window.__game; try{ g.tutFinish && g.tutFinish(); }catch(e){} g.settings.quality='high'; g.applySettings && g.applySettings(); document.querySelectorAll('#dlg,.dlg,#changelog').forEach(d=>d.style.display='none'); });
await p.evaluate(()=>{ ['settings','dlg','changelog'].forEach(id=>{const e=document.getElementById(id); if(e) e.style.display='none';}); });
await p.waitForTimeout(3000);
await p.screenshot({path:`/workspace/work/s_${tag}_camp.png`});
if (mode === 'fx') {
  // 演示红圈 + 旋风斩（时间放慢 10 倍，软件渲染帧率低）
  await p.evaluate(()=>{ const g=window.__game; const q=g.player.pos; g.fxDemoTele(q.x+4.5, q.z-2.5, 3, 4); g.fxDemoTele(q.x-4, q.z-3.5, 2.2, 3); });
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{ window.__ts = 0.15; });
  await p.keyboard.press('2');
  await p.waitForTimeout(2500);
  await p.screenshot({path:`/workspace/work/s_${tag}_whirl.png`});
  await p.waitForTimeout(2500);
  await p.screenshot({path:`/workspace/work/s_${tag}_whirl2.png`});
}
console.log('errors', errs.slice(0,6));
await b.close();
