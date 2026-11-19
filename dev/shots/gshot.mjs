import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME+'/.cache/ms-playwright/chromium-1140/chrome-linux/chrome' });
const p = await b.newPage({ viewport:{width:1080,height:1000}, deviceScaleFactor: 1 });
for (const f of process.argv.slice(2)) { await p.goto('file:///workspace/work/guide/'+f+'.html'); await p.waitForTimeout(800); await p.screenshot({path:`/workspace/work/guide/${f}.png`, fullPage:true}); }
await b.close();
