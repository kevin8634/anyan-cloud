// fix1109c #1：40 级绝技图标核对 —— 6 职业 ×3 绝技：技能栏 skillIcon / 天赋终极节点 talentIcon 都要落到专属图（不是通用 ui_class）
import { build } from 'esbuild';
const r = await build({ stdin: { contents: `
  import { DLC1_SKILLS, DLC1_TALENTS } from './src/dlc/dlc1/talents';
  import { HUNTER_ULT_SKILLS, HUNTER_TIER } from './src/dlc/dlc1/hunter_data';
  import { COFFIN_ULT_SKILLS, COFFIN_TIER } from './src/dlc/dlc1/coffin_data';
  import { PACK_ICONS } from './src/dlc/dlc1/icons.gen';
  import { ICONS } from './src/web/assets.gen';
  import { skillIcon, talentIcon, addIcons } from './src/web/icons';
  addIcons(Object.fromEntries(Object.entries(PACK_ICONS).filter(([k]) => /^sk_(hp|cf)_/.test(k))));   // 猎手 / 负棺人：classext.ts 按 ext.art 登记（这里模拟）
  const rows = []; let bad = 0;
  const tiers = [...DLC1_TALENTS, HUNTER_TIER, COFFIN_TIER];
  for (const s of [...DLC1_SKILLS, ...HUNTER_ULT_SKILLS, ...COFFIN_ULT_SKILLS]) {
    const node = tiers.flatMap(t => t.layers.flat()).find(n => n.skill === s.id);
    const si = /ic-([a-z0-9_]+)/.exec(skillIcon(s.id, '#fff'))[1], ti = /ic-([a-z0-9_]+)/.exec(talentIcon(node?.icon ?? '', true))[1];
    const ok = si === 'sk_' + s.id && ti === 'sk_' + s.id && !!ICONS[si]; if (!ok) bad++;
    rows.push({ cls: s.cls ?? tiers.find(t => t.layers.flat().includes(node))?.cls, id: s.id, name: s.name, skillIcon: si, talentIcon: ti, ok });
  }
  console.table(rows); console.log(bad ? 'FAIL ' + bad : 'OK 18/18'); if (bad) process.exitCode = 1;
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error', define: { __DARKROCK_DLC__: '[]' } });
const f = '/tmp/fix1109c_icons_run.mjs'; (await import('fs')).writeFileSync(f, r.outputFiles[0].text); await import(f);
