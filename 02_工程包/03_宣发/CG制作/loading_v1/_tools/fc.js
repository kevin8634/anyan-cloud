// 假时钟逐帧截图（确定性 30fps）：接管 performance.now / Date.now / rAF / setTimeout / setInterval，CSS 动画按假时钟 seek
const { chromium } = require('/workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/anyan/node_modules/playwright-core');
const URL='file:///workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/cloud/CG%E5%88%B6%E4%BD%9C/loading_v1/loading.html';
const [,, outDir, W, H, DPR, startF, endF, query, every] = process.argv;
const fs=require('fs'); fs.mkdirSync(outDir,{recursive:true});
const SHIM = `(() => {
  let rs = 20261101; Math.random = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  let T = 0; const base = 1767225600000; let seq = 0;
  const timers = []; let rafQ = [];
  performance.now = () => T; Date.now = () => base + T;
  window.requestAnimationFrame = cb => { rafQ.push(cb); return ++seq; };
  window.cancelAnimationFrame = id => {};
  window.setTimeout = (cb, ms, ...a) => { const id = ++seq; timers.push({ id, at: T + (+ms || 0), cb, a }); return id; };
  window.setInterval = (cb, ms, ...a) => { const id = ++seq; timers.push({ id, at: T + (+ms || 0), cb, a, every: Math.max(1, +ms || 0) }); return id; };
  window.clearTimeout = window.clearInterval = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const seen = new WeakMap();
  window.__advance = (ms) => {
    const end = T + ms;
    for (;;) { timers.sort((x, y) => x.at - y.at); const t = timers[0]; if (!t || t.at > end) break;
      T = Math.max(T, t.at); if (t.every) t.at += t.every; else timers.shift();
      try { t.cb(...t.a); } catch (e) { console.error(e); } }
    T = end;
    const q = rafQ; rafQ = []; q.forEach(cb => { try { cb(T); } catch (e) { console.error(e); } });
    document.getAnimations().forEach(an => { if (!seen.has(an)) seen.set(an, T - ms); an.pause(); an.currentTime = T - seen.get(an); });
  };
})();`;
(async()=>{
  const b=await chromium.launch({env:{...process.env,LD_LIBRARY_PATH:'/tmp/libs/usr/lib/aarch64-linux-gnu'},args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:+W,height:+H},deviceScaleFactor:+DPR||1});
  p.on('pageerror',e=>console.error('PAGEERR',e.message));
  await p.addInitScript(SHIM);
  await p.goto(URL+(query||'?once'),{waitUntil:'load'});
  await p.waitForTimeout(300);
  const dt=1000/30, ev=+(every||1);
  for(let f=0; f<+endF; f++){
    await p.evaluate(ms=>window.__advance(ms), dt);
    if(f>=+startF && (f-startF)%ev===0){ await p.screenshot({path:`${outDir}/f${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:93}); }
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
