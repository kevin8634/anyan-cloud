// 11-07 BUG#18 宣发版攻略：docs/攻略/潮渊钟井.html，内容全部从 WELL_DUNGEON / WELL_BOSSES 定义生成（改数值后重跑即同步）
// 运行：bash tools/guide/well_guide.sh
import { WELL_DUNGEON, WELL_BOSSES, TIDE } from '../../src/dlc/dlc1/raid_well';
declare function require(m: string): any;
const fs = require('fs');

type Ab = { id: string; name: string; kind: string; cooldown?: number; telegraph?: number; castTime?: number; radius?: number; damage?: number; dps?: number; duration?: number; count?: number; element?: string; effect?: { type: string; duration?: number } };
const EL: Record<string, string> = { physical: '物理', frost: '冰霜', fire: '火焰', nature: '自然', shadow: '暗影', arcane: '奥术', holy: '神圣' };
const KIND: Record<string, string> = { groundSlam: '地面预警', poisonZone: '持续区域', cast: '读条', summon: '召唤', charge: '冲锋' };
const TIP: Record<string, string> = { groundSlam: '看预警圈，读完前走出去', poisonZone: '持续伤害区，离开并别把首领拉进去', cast: '能打断就打断，打不断就提前减伤 / 躲开', summon: '优先清掉小怪', charge: '侧移让开直线' };
const FX: Record<string, string> = { stun: '眩晕', dot: '持续伤害', slow: '减速', root: '定身', knock: '击退' };
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const def = WELL_DUNGEON;

let h = `<html><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>
.boss{margin-top:18px}.boss h3{font-family:'Noto Serif SC';font-weight:900;font-size:32px;color:#ffe0a0;margin-bottom:6px}
.boss h3 small{font-size:20px;color:#ff9a60;margin-left:10px}.ph{color:#9ae8f0}.gate{color:#ffb070}.tipbox{margin-top:8px;padding:10px 14px;border-left:4px solid #c8902a;background:#ffffff08;border-radius:6px}
td.n{white-space:nowrap;color:#ffd060;font-weight:700}
</style></head><body><div class="wrap">
<h1>潮渊钟井 · 攻略</h1>
<div class="sub">${esc(def.desc)}</div>
<h2><span class="n">1</span>副本概览</h2>
<div class="card"><ul>
<li>进入等级 <span class="k">${def.minLevel}</span>；${esc(def.long?.tip ?? '')}</li>
<li>首领 ${WELL_BOSSES.length} 个：${WELL_BOSSES.map(b => esc(b.name)).join(' → ')}</li>
${(def.guide?.notes ?? []).map(n => `<li>${esc(n)}</li>`).join('\n')}
</ul></div>
<h2><span class="n">2</span>首领逐个打法</h2>`;
WELL_BOSSES.forEach((b, i) => {
  const B = b.boss as unknown as { abilities?: Ab[]; phases?: { name: string; hpBelow: number; abilities: string[]; yell?: string }[] };
  const ab = new Map((B.abilities ?? []).map(a => [a.id, a]));
  const rows = (B.abilities ?? []).map(a => {
    const num: string[] = [];
    if (a.damage) num.push(`伤害 ${a.damage}`); if (a.dps) num.push(`每秒 ${a.dps}${a.duration ? ` × ${a.duration} 秒` : ''}`);
    if (a.radius) num.push(`半径 ${a.radius} 米`); if (a.count && a.kind !== 'summon') num.push(`${a.count} 处`); if (a.kind === 'summon' && a.count) num.push(`${a.count} 只`);
    if (a.telegraph) num.push(`预警 ${a.telegraph} 秒`); if (a.castTime) num.push(`读条 ${a.castTime} 秒`); if (a.cooldown) num.push(`冷却 ${a.cooldown} 秒`);
    if (a.effect) num.push(`${FX[a.effect.type] ?? a.effect.type}${a.effect.duration ? ' ' + a.effect.duration + ' 秒' : ''}`);
    return `<tr><td class="n">${esc(a.name)}</td><td>${KIND[a.kind] ?? a.kind}${a.element ? ' · ' + (EL[a.element] ?? a.element) : ''}</td><td>${num.join('，')}</td><td>${TIP[a.kind] ?? '注意读条与预警'}</td></tr>`;
  }).join('');
  const ph = (B.phases ?? []).map(p => `<li><span class="ph">${esc(p.name)}</span>${p.hpBelow < 1 ? `（${pct(p.hpBelow)} 血以下）` : ''}：${p.abilities.map(k => esc(ab.get(k)?.name ?? k)).join('、')}</li>`).join('');
  const g = b.gate ? `<li class="gate">机制门槛 · ${esc(b.gate.name)}（${b.gate.at.map(pct).join(' / ')} 血）：${esc(b.gate.tip)}。${b.gate.time} 秒内打碎 ${b.gate.core.n} 个「${esc(b.gate.core.name)}」。</li>` : '';
  const ex = (def.guide?.boss?.[b.key] ?? []).map(x => `<li>${esc(x)}</li>`).join('');
  h += `<div class="card boss"><h3>${i + 1}. ${esc(b.name)}${i === WELL_BOSSES.length - 1 ? '<small>尾王</small>' : ''}</h3>
<ul>${ph}${g}${ex}</ul>
<table><tr><th>技能</th><th>类型</th><th>数值（标准难度）</th><th>应对</th></tr>${rows}</table>
${b.tip ? `<div class="tipbox">要点：${esc(b.tip)}</div>` : ''}</div>`;
});
const dS = def.drops?.('heroic', 85) ?? [], dN = def.drops?.('nightmare', 90) ?? [];
h += `<h2><span class="n">3</span>掉落</h2><div class="card"><table><tr><th>首领</th><th>掉落</th><th style="white-space:nowrap">标准 · 85</th><th style="white-space:nowrap">炼狱 · 90</th></tr>${dN.map((d, i) => d.rows.map((r, k) => { const s0 = dS[i]?.rows.find(x => x.name === r.name); return `<tr><td class="n">${k ? '' : esc(d.title)}</td><td>${esc(r.name)}</td><td>${esc(String(s0?.chance ?? '—'))}</td><td>${esc(String(r.chance))}</td></tr>`; }).join('')).join('')}</table>
<div class="dim" style="margin-top:8px">数值随游戏定义自动生成；潮汐每 ${TIDE.every} 秒一次，涨潮 ${TIDE.high} 秒。</div></div>
<div class="foot">暗岩传说 · 沉钟之海 · 由游戏数据自动生成</div></div></body></html>`;
fs.writeFileSync('docs/攻略/潮渊钟井.html', h);
console.log('docs/攻略/潮渊钟井.html', h.length, 'B，首领', WELL_BOSSES.length);
