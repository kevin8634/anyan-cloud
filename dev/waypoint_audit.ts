// v1.2.67 传送阵与 NPC / 装饰距离核查：npx esbuild dev/waypoint_audit.ts --bundle --platform=node --outfile=/tmp/wpa.js && node /tmp/wpa.js
import { WILD, WILD_IDS } from '../src/data/zones_wild';
import { BT_WILD } from '../src/dlc/dlc1/belltower';
import { COAST_WILD } from '../src/dlc/dlc1/coast';
import { FORGE_WILD } from '../src/dlc/dlc1/forge';
import { MIRROR_WILD } from '../src/dlc/dlc1/mirror';
const NPC_MIN = 5.0, DECOR_MIN = 3.4;   // 传送阵半径约 2.3 + 互动 2.6；NPC 互动半径 ~3
const defs: any[] = [...WILD_IDS.map(i => WILD[i]), BT_WILD, COAST_WILD, FORGE_WILD, MIRROR_WILD];
let bad = 0;
for (const d of defs) for (const c of d.camps) {
  const w = c.waypoint;
  for (const n of d.npcs ?? []) { const r = Math.hypot(n.x - w.x, n.z - w.z); if (r < NPC_MIN) { bad++; console.log(`NPC ${d.id}/${c.id} ${n.id}(${n.name}) @${n.x},${n.z} 距 ${r.toFixed(2)}`); } }
  for (const o of d.decor ?? []) { const r = Math.hypot(o.x - w.x, o.z - w.z); if (r < DECOR_MIN) console.log(`  装饰 ${d.id}/${c.id} ${o.kind} @${o.x},${o.z} 距 ${r.toFixed(2)}`); }
}
const DR: Record<string, number> = { tent: 2.6, stall: 1.6, anvil: 1.0, fire: 1.4, crate: 1.0, tower: 2.1, board: 1.0, banner: 0.7 };
for (const d of defs) {
  const ns = d.npcs ?? [];
  ns.forEach((a: any, i: number) => ns.slice(i + 1).forEach((b: any) => { const r = Math.hypot(a.x - b.x, a.z - b.z); if (r < 2.4) { bad++; console.log(`NPC 重叠 ${d.id} ${a.id}/${b.id} 距 ${r.toFixed(2)}`); } }));
  for (const n of ns) for (const o of d.decor ?? []) { const lim = DR[o.kind]; if (lim && !(o.kind === 'board' && n.role === 'bounty') && Math.hypot(n.x - o.x, n.z - o.z) < lim) { bad++; console.log(`NPC 卡装饰 ${d.id} ${n.id} ↔ ${o.kind}@${o.x},${o.z}`); } }
}
console.log(bad ? `✗ ${bad} 个 NPC 离传送阵太近` : '✓ 所有营地传送阵周围 NPC 距离 ≥ ' + NPC_MIN + '，NPC 不互相重叠、不卡装饰');
