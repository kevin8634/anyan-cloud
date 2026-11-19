const {chromium}=require('/workspace/work/anyan/anyan/node_modules/playwright-core');
(async()=>{const b=await chromium.launch({executablePath:require('fs').readdirSync('/home/sandbox/.cache/ms-playwright/chromium-1140').length?'/home/sandbox/.cache/ms-playwright/chromium-1140/chrome-linux/chrome':undefined,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2});
for(const f of ['win1','win2']){await p.goto('file://'+process.cwd()+'/'+f+'.html');await p.waitForTimeout(500);await p.screenshot({path:f+'.png',fullPage:true});}
await b.close();})();
