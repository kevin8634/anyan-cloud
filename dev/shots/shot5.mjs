import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME+'/.cache/ms-playwright/chromium-1140/chrome-linux/chrome', args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[]; p.on('pageerror', e=>errs.push(String(e.stack||e).slice(0,600))); p.on('console', m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(m.text().slice(0,400)); });
await p.goto('file://' + (process.argv[3] || '/workspace/work/proj/web/index.html'));
await p.waitForTimeout(7000);
await p.evaluate(()=>document.getElementById('start').click());
await p.waitForTimeout(5000);
const hide = () => p.evaluate(()=>{ const el=document.elementFromPoint(845,365); if(el && el.tagName!=='CANVAS' && !el.closest('#skillbar .slot')){ const t=el.closest('[id]')&&el.closest('[id]').id!=='skillbar'?el.closest('[id]'):el.parentElement; window.__hid=(t.id||t.className); t.style.display='none'; } ['settings','dlg','changelog'].forEach(id=>{const e=document.getElementById(id); if(e) e.style.display='none';}); });
await p.evaluate(()=>{ const g=window.__game; g.settings.quality='high'; g.applySettings&&g.applySettings(); try{g.tutFinish()}catch(e){} });
const shot = async (name, js, wait=3500) => { await p.evaluate(js); await hide(); await p.waitForTimeout(wait); await hide(); await p.screenshot({path:`/workspace/work/e_${name}${process.argv[4]||''}.png`}); };
const step = process.argv[2] || 'camp';
if (step==='camp') {
  await shot('camp_portal', ()=>{ const g=window.__game; g.player.pos.set(-2, 0, -25); g.camYawSet(0.35); g.camSet(13, 0.62); });
  await shot('field_gate', ()=>{ const g=window.__game; const s=g.scene.getObjectByName('fieldGate'); g.player.pos.set(s.position.x+2.5, 0, s.position.z-4.5); g.camYawSet(Math.PI+0.5); g.camSet(12, 0.5); });
} else if (step==='gear') {
  await shot('loot', ()=>{ const g=window.__game; const q=g.player.pos.clone(); q.set(2,0,-18); g.player.pos.copy(q);
    const Q=['white','blue','purple','purple','orange','dark']; const S=['chest','oneHand','head','legs','twoHand','oneHand'];
    Q.forEach((qq,i)=>{ const it={ id:'t'+i, baseId:'x', name:['旧皮甲','精钢长剑','秘纹头冠','狂怒腿甲','炽炎巨剑','暗岩典藏'][i], quality:qq, slot:S[i], itemLevel:10, hp:1, armor:1, lines:[], modifiers:[], sellPrice:1 }; if(i===3) it.setId='set_fury';
      const at=q.clone().set(q.x+(i-2.5)*2.2, 0, q.z-3.5); g.spawnLoot(it, at, 0, 1); });
    g.camYawSet(0); g.camSet(12, 0.62); }, 600);
  await shot('loot2', ()=>{}, 3000);
  await shot('loot3', ()=>{ const g=window.__game; g.player.pos.set(6.4,0,-17); g.camYawSet(0); g.camSet(6.5, 0.36); }, 2500);
  await shot('weapon', ()=>{ const g=window.__game; const e=g.inventory.equipped; const mk=(slot,extra)=>Object.assign({ id:'e'+slot, baseId:'x', name:slot, quality:'purple', slot, itemLevel:40, hp:10, armor:10, lines:[], modifiers:[], sellPrice:1 }, extra);
    e.mainHand=mk('oneHand',{quality:'orange', weaponType:'sword', upgrade:13}); ['chest','legs','hands','feet'].forEach(s=>e[s]=mk(s,{setId:'set_fury'})); g.refreshGear(true); g.player.pos.set(10,0,-22);
    g.camYawSet(Math.PI); g.camSet(7, 0.35); }, 3000);
  await shot('upgrade', ()=>{ const g=window.__game; g.VFX.upgradeBurst(g.player.pos, 15, 0xff8a2a); }, 450);
} else if (step==='hero') {
  await shot('hero', ()=>{ const g=window.__game; g.player.pos.set(4,0,-20); g.camYawSet(Math.PI*0.85); g.camSet(4.2, 0.3); }, 3500);
  await shot('hero2', ()=>{ const g=window.__game; g.player.pos.set(-8,0,-14); g.camYawSet(0.3); g.camSet(13, 0.8); }, 3000);
} else if (step==='skills') {
  await p.evaluate(()=>{ const g=window.__game; g.player.pos.set(4,0,-20); window.__q=g.player.pos.clone(); g.camYawSet(0); g.camSet(13, 0.62); });
  await p.waitForTimeout(2500);
  await shot('s_war', ()=>{ const g=window.__game, V=g.VFX, q=window.__q, pl=g.player; V.avatarRise(()=>pl.pos, 3.5); V.thunderSlam({x:q.x-5,z:q.z-3}, 3.5, '#9fd0ff'); V.chargeImpact({x:q.x+5,z:q.z-3}, '#ffffff', true); V.coneSweep({x:q.x+3,z:q.z-1}, {x:0.6,z:-0.8}, 3.5, '#ff9a3c', true); }, 380);
  await p.waitForTimeout(9000);
  await shot('s_mage', ()=>{ const g=window.__game, V=g.VFX, q=window.__q; V.arcaneBind({x:q.x-4,z:q.z-4}, 3, '#b070ff'); V.blinkFx({x:q.x+1,z:q.z}, {x:q.x+6,z:q.z-3}, '#b070ff');
    ['fire','frost','arcane'].forEach((el,j)=>{ for(let i=0;i<42;i++){ const k=(i%14)/14; V.projTrail({x:q.x-6+k*10, y:1.5, z:q.z-6.5+j*1.6}, el, true);} }); }, 260);
  await p.waitForTimeout(9000);
  await shot('s_chrono', ()=>{ const g=window.__game, V=g.VFX, q=window.__q; V.timeStop({x:q.x,z:q.z-3}, 5); for(let i=0;i<72;i++){ const a=(i%24)/24*Math.PI*1.6; V.wheelTrail({x:q.x+5+Math.cos(a)*1.5, y:1.2, z:q.z-2+Math.sin(a)*1.5}, false);} V.riftTick({x:q.x-5,z:q.z-2},2.5); }, 650);
  await p.waitForTimeout(9000);
  await shot('s_alch', ()=>{ const g=window.__game, V=g.VFX, q=window.__q; V.cauldronDrop({x:q.x-3,z:q.z-3}); for(let i=0;i<30;i++) V.cauldronTick({x:q.x-3,z:q.z-3}); V.cauldronFire({x:q.x-3,z:q.z-3});
    for(let i=0;i<60;i++){ const k=(i%20)/20; V.lobTrail({x:q.x-3+k*7, y:1.2+Math.sin(k*Math.PI)*3, z:q.z-3}, 0xff5a20);} V.potionSplash({x:q.x+4,z:q.z-3}, 2.5, 0xff5a20, true); }, 450);
} else if (step==='boss') {
  await shot('raidb', ()=>{ const g=window.__game; g.progression.level = 60; g.enterRaid('molten_throne', 0); }, 8000);
  const base = ()=>{ const g=window.__game; window.__q=g.player.pos.clone(); g.camYawSet(0); g.camSet(15, 0.72); };
  await p.evaluate(base);
  await shot('b_impact', ()=>{ const g=window.__game, q=window.__q; [[-3,-5,2.7],[0,-7,3.2],[3,-5,2.7]].forEach(([x,z,r])=>g.BFX.bossImpact({x:q.x+x,z:q.z+z}, r, 'fire', r>3)); }, 300);
  await shot('b_cast', ()=>{ const g=window.__game, q=window.__q; const pl=g.player; g.BFX.castCharge(()=>pl.pos, 'fire', 4, 1.2); window.__sb=g.BFX.shieldBubble(()=>pl.pos, 'fire', 1.1, 6); }, 1500);
  await shot('b_break', ()=>{ const g=window.__game; window.__sb.stop(true); g.BFX.castBreak(g.player.pos, 'fire', 1.1); }, 200);
  await shot('b_phase', ()=>{ const g=window.__game; g.BFX.phaseBurst(g.player.pos, 'fire', 1); }, 350);
  await shot('b_frost', ()=>{ const g=window.__game, q=window.__q; g.BFX.bossImpact({x:q.x-2,z:q.z-5}, 3.5, 'frost', true); g.BFX.bossImpact({x:q.x+3,z:q.z-6}, 2.5, 'shadow'); }, 300);
  await shot('b_death', ()=>{ const g=window.__game; for(let i=0;i<40;i++) g.BFX.enrageTick(g.player.pos,1); g.BFX.bossDeath({x:window.__q.x, z:window.__q.z-4}, 'fire', 1); }, 500);
} else if (step==='tele') {
  await shot('tele', ()=>{ const g=window.__game; g.player.pos.set(-6,0,-12); g.camYawSet(0); g.camSet(15, 0.75); const q=g.player.pos; g.fxDemoTele(q.x+3.5, q.z-3, 4.5, 3); }, 1800);
} else if (step==='dungeon') {
  await shot('dungeon', ()=>{ const g=window.__game; g.enterDungeon('darkrock_mine','normal'); }, 6000);
    await shot('dungeon_rift', ()=>{ const g=window.__game; const q=g.player.pos; const bp=g.M.makePortal(0x8a3fff,'rift'); bp.position.set(q.x-1.5, 0, q.z-6); g.scene.add(bp); g.camYawSet(0.25); g.camSet(12, 0.5); window.__bp=true; }, 4000);
} else {
  await shot('raid', ()=>{ const g=window.__game; g.progression.level = 60; g.enterRaid('molten_throne', 0); }, 8000);
  await shot('raid2', ()=>{ const g=window.__game; g.camSet(16, 0.75); }, 2500);
}
console.log('errors', errs.filter(e=>!/GroupMarker|ReadPixels/.test(e)).slice(0,8), await p.evaluate(()=>[window.__bp, window.__hid]));
await b.close();
