// v1.2.73 程序化绑骨姿态联系表：node test/rig73_pose.mjs <比赛版 DLC html> [输出目录]
// 把评委路线 P0 怪的 rig 摘出 AI，放到营地（亮）玩家身前，手动推进 ProcAnim：待机 / 走 25% / 走 75% / 预备末 / 出手 / 收招 / 受击 / 死亡
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html = 'web/index_dlc1_比赛版.html', OUT = '/tmp/rig73p'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 640, height: 640 } }); page.setDefaultTimeout(240000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + resolve(html), { timeout: 300000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 38; g.player.hp = g.player.maxHp = 1e7; });
// 先在两张图生成怪（含巨鲸），每张图到了就收集 rig（摘出 AI 列表，主循环不再管它）
await page.evaluate(() => { window.__R = {}; });
for (const [map, boss] of [['dlc1_mirror'], ['dlc1_coast', 'dwb_whale']]) {
  await page.evaluate(([map, boss]) => { const g = window.__game; g.ensureWild(map); g.goMap(map); if (boss) window.__dlc1.wb.setNext(boss, 0); }, [map, boss]);
  await page.waitForTimeout(6500);
  await page.evaluate(boss => { if (boss) window.__dlc1.wb.tick(); }, boss);
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const g = window.__game;
    for (const e of [...g.enemies]) { const r = e.rig?.root?.userData?.procRig; if (!r) continue; const key = r.tpl + '|' + (e.type?.name ?? e.name ?? ''); if (window.__R[key] || /强壮/.test(key)) continue; window.__R[key] = e.rig; g.enemies.splice(g.enemies.indexOf(e), 1); } });
}
const got = await page.evaluate(() => Object.keys(window.__R));
console.log(JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__R).map(([k, r]) => [k, r.root.userData.procRig])))));
console.log('rigs', got.join(' / '));
await page.evaluate(() => { const g = window.__game; g.goMap('camp'); });
await page.waitForTimeout(3000);
await page.evaluate(() => { for (let k = 0; k < 3; k++) [...document.querySelectorAll('button')].filter(x => x.offsetParent && /知道了|关闭|确定/.test(x.textContent)).forEach(x => x.click()); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });

const rep = await page.evaluate(() => {
  const out = {};
  for (const [key, rig] of Object.entries(window.__R)) {
    if (!/^(H|H袍)\|/.test(key)) continue;
    const A = rig.anim; A.revive(); A.loop('idle'); for (let i=0;i<20;i++) A.update(1/30);
   for (const pose of ['windup','strike','cast']) {
    A.revive(); A.loop('idle'); for (let i=0;i<20;i++) A.update(1/30);
    if (pose!=='cast') { A.play('windup'); for (let i=0;i<Math.round(A.windup*30)+2;i++) A.update(1/30); }
    if (pose==='strike') { A.play('attack1'); for (let i=0;i<4;i++) A.update(1/30); }
    if (pose==='cast') { A.play('castLong'); for (let i=0;i<20;i++) A.update(1/30); }
    rig.root.updateMatrixWorld(true);
    let sm=null; rig.root.traverse(o=>{ if(o.isSkinnedMesh) sm=o; });
    sm.skeleton.update();
    const g=sm.geometry, pos=g.attributes.position, si=g.attributes.skinIndex, sw=g.attributes.skinWeight, ix=g.index;
    const n=pos.count, V=new Float32Array(n*3), v=new (rig.root.position.constructor)();
    for(let i=0;i<n;i++){ sm.getVertexPosition(i,v); V[i*3]=v.x;V[i*3+1]=v.y;V[i*3+2]=v.z; }
    const P=pos.array; const tri=[]; const cnt=ix?ix.count:n;
    const L=(A,a,b)=>Math.hypot(A[a*3]-A[b*3],A[a*3+1]-A[b*3+1],A[a*3+2]-A[b*3+2]);
    let bad=[];
    for(let t=0;t<cnt;t+=3){ const a=ix?ix.getX(t):t,b=ix?ix.getX(t+1):t+1,c=ix?ix.getX(t+2):t+2;
      for(const [p,q] of [[a,b],[b,c],[c,a]]){ const l0=L(P,p,q), l1=L(V,p,q); if(l1>l0*3 && l1>0.05) bad.push([p,q,l0,l1]); } }
    const names=sm.skeleton.bones.map(b=>b.name);
    const desc=i=>{ const w=[]; for(let k=0;k<4;k++){ if(sw.getComponent(i,k)>0.01) w.push(names[si.getComponent(i,k)]+':'+sw.getComponent(i,k).toFixed(2)); } return w.join(' ')+' @'+[P[i*3],P[i*3+1],P[i*3+2]].map(x=>x.toFixed(2)).join(','); };
    bad.sort((x,y)=>y[3]/y[2]-x[3]/x[2]);
    out[key+' '+pose]={bad:bad.length, top:bad.slice(0,2).map(([p,q,l0,l1])=>[l0.toFixed(3),l1.toFixed(3),desc(p),desc(q)])};
   }
  }
  return out;
});
console.log(JSON.stringify(rep,null,1));
await b.close(); process.exit(0);
