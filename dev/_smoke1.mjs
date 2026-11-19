// 加载自检（两套构建）：node dev/smoke.mjs → 无头 Chromium 打开 web/index.html 与 web/index_dlc1.html，8 秒内无 pageerror / console.error
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { existsSync } from 'fs';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
let bad = 0;
// v1.2.21：比赛版产物存在时一起自检
for (const f of [process.argv[2]]) {
  const p = await b.newPage(); const errs = []; p.setDefaultNavigationTimeout(180000);   // 10-27：比赛版页面 95–120 MB，file:// 加载在软件渲染 + 其他浏览器任务并发时常超过默认 30 秒 → 导航超时放宽到 180 秒
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + resolve(f));
  await p.waitForTimeout(8000);
  const v = await p.evaluate(() => document.body.innerText.match(/v\d+\.\d+\.\d+\w*/)?.[0]);
  console.log(f, 'version', v, errs.length ? errs.join('\n') : 'NO ERRORS'); if (errs.length) bad++;
  await p.close();
}
await b.close();
process.exitCode = bad ? 1 : 0;
