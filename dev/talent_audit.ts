import { CLASSES } from '../src/data/classes';
import { COFFIN_CLASS as COFFIN } from '../src/dlc/dlc1/coffin';
import { HUNTER_CLASS as HUNTER } from '../src/dlc/dlc1/hunter';
const out: any[] = [];
const all: any[] = [...Object.values(CLASSES), COFFIN, HUNTER].filter(Boolean);
for (const c of all) for (const sp of c.tree.specs) for (const n of sp.nodes) {
  const sig = JSON.stringify({ m: n.modifier ? { match: n.modifier.match, cond: n.modifier.conditions, ops: n.modifier.ops } : null, s: n.stats, r: n.res, x: n.extra });
  out.push({ cls: c.name, spec: sp.name, specId: sp.id, id: n.id, row: n.row, col: n.col, name: n.name, desc: n.desc, max: n.maxRank, cap: !!n.capstone, sig, hasMech: !!(n.modifier || n.stats || n.res || n.extra?.length) });
}
console.log(JSON.stringify(out));
