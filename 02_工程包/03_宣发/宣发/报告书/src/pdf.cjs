const { chromium } = require('/workspace/work/p73/node_modules/playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/workspace/work/.envcache/ms-playwright/chromium-1140/chrome-linux/chrome',args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.goto('file://'+__dirname+'/r.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1500);
await p.pdf({path:process.argv[2]||'draft.pdf',preferCSSPageSize:true,printBackground:true});await b.close();})();
