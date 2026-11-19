import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME+'/.cache/ms-playwright/chromium-1140/chrome-linux/chrome', args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
await p.goto('file:///workspace/work/proj/web/index.html');
await p.waitForTimeout(7000);
await p.evaluate(()=>document.getElementById('start').click());
await p.waitForTimeout(5000);
for (let i=0;i<4;i++){ await p.keyboard.press('Escape'); await p.waitForTimeout(300);}
await p.evaluate(()=>{ document.querySelectorAll('.dlg,#dlg').forEach(d=>d.style.display='none'); const g=window.__game; g.camSet && g.camSet(11,0.55); });
await p.waitForTimeout(2500);
await p.screenshot({path:'/workspace/work/shot_play.png'});
await p.evaluate(()=>{ const g=window.__game; g.camSet(16,0.8); });
await p.waitForTimeout(2000);
await p.screenshot({path:'/workspace/work/shot_play2.png'});
await b.close();
