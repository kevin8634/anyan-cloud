// 11-07 装备一致性全量校验（六职业 + dlc1）：图标 / 名称 / 手持模型三者与底材武器类型一致
// npm run gearconsist（= tsc && node dist/simGearConsist.js）
// 1) 图标：每个武器底材（本体 + dlc1 + 40 级暗金底材）解析到的图标 key 存在、且画的就是这种武器；
// 2) 手持模型：比赛版按武器类型挂的 Lux 模型（web/gear.ts LUX_W）、40 级暗金专属模型（D40_LUX）文件都在；
// 3) 名称：六职业实际掉落（橙 + 固定件 + 暗金 + 40 级暗金）名字里的武器名词 = 手持武器类型。
// web 侧映射（icons.ts BASE_ICON、gear.ts LUX_W）引 three，不在 node 里 import，按源码文本解析。
import { LootGenerator, ItemInstance, nameFitsWeapon, WeaponType } from './core/Loot';
import { LOOT_DATA } from './data/loot';
import { installPack, Entitlement } from './core/Entitlement';
import { _resetPacksForTest, packList } from './core/ContentPacks';
import { DLC1 } from './dlc/dlc1/manifest';
import { D40_LUX } from './dlc/dlc1/gear40';
declare const process: { exitCode?: number };
declare function require(m: string): any;
const fs = require('fs');

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

_resetPacksForTest(); Entitlement.grantForTest('dlc1');
check(installPack(DLC1) === true, '注册 dlc1');
const classes = DLC1.classes as Record<string, { icons?: Record<string, string>; ext?: { icons?: Record<string, string> } }> | undefined;
const CLS = ['warrior', 'mage', 'chrono', 'alchemy', ...Object.keys(classes ?? {})];
console.log(`  职业：${CLS.join(' / ')}`);
// 数据表在模块加载时合并内容包；sim 里 dlc1 注册晚于 import，这里手动并上（同 id 本体优先）
const uniq = <T extends { id: string }>(a: T[]) => { const m = new Map<string, T>(); for (const x of a) if (!m.has(x.id)) m.set(x.id, x); return [...m.values()]; };
const DATA = { ...LOOT_DATA,
  bases: uniq([...LOOT_DATA.bases, ...packList<typeof LOOT_DATA.bases[number]>('bases')]),
  legendaries: uniq([...LOOT_DATA.legendaries, ...packList<typeof LOOT_DATA.legendaries[number]>('legendaries')]),
  fixedItems: uniq([...LOOT_DATA.fixedItems, ...packList<typeof LOOT_DATA.fixedItems[number]>('items')]) } as typeof LOOT_DATA;
console.log(`  底材 ${DATA.bases.length}（dlc1 +${DATA.bases.length - LOOT_DATA.bases.length}）、特效 ${DATA.legendaries.length}、固定件 ${DATA.fixedItems.length}`);

// ---------- 1. 图标
const parseRec = (file: string, name: string): Record<string, string> => {
  const src: string = fs.readFileSync(file, 'utf8'); const i = src.indexOf(name); if (i < 0) return {};
  const body = src.slice(src.indexOf('{', i), src.indexOf('};', i));
  const out: Record<string, string> = {}; for (const m of body.matchAll(/(\w+):\s*'([\w-]+)'/g)) out[m[1]] = m[2]; return out;
};
const BASE_ICON = parseRec('src/web/icons.ts', 'const BASE_ICON');
const PACK_ICON: Record<string, string> = {}; for (const c of Object.values(classes ?? {})) Object.assign(PACK_ICON, c.ext?.icons ?? c.icons ?? {});   // 内容包职业图标在 ClassDef.ext.icons（web 端并入 ICON_ALIAS）
const iconOf = (id: string) => { const b0 = id.replace(/_d40$/, ''); return BASE_ICON[id] ?? PACK_ICON[id] ?? BASE_ICON[b0] ?? PACK_ICON[b0]; };
const iconFile = (k: string) => ['assets/icons', 'src/dlc/dlc1/icons'].some(d => ['jpg', 'png', 'webp'].some(e => fs.existsSync(`${d}/${k}.${e}`)));
/** 图标画的是哪种武器（it_<武器>）；短刃已退役沿用匕首图 */
const ICON_OK: Partial<Record<WeaponType, string[]>> = { shortblade: ['it_dagger'] };
console.log('\n=== 1. 武器底材图标 ===');
const wpnSlots = new Set(['oneHand', 'twoHand', 'offHand']);
const wbases = DATA.bases.filter(b => wpnSlots.has(b.slot) && b.weaponType);
let iconBad = 0; const iconList: string[] = [];
for (const b of wbases) {
  const k = iconOf(b.id), wt = b.weaponType!;
  const ok = !!k && iconFile(k) && (k === `it_${wt}` || (ICON_OK[wt] ?? []).includes(k));
  if (!ok) { iconBad++; iconList.push(`${b.id}(${b.name}/${wt}) → ${k ?? '无，退回槽位默认图'}${k && !iconFile(k) ? '（文件缺）' : ''}`); }
}
check(iconBad === 0, `武器底材 ${wbases.length} 个，图标与武器类型一致（不符 ${iconBad}${iconList.length ? '：' + iconList.join('；') : ''}）`);

// ---------- 2. 手持模型
console.log('\n=== 2. 手持模型（比赛版） ===');
const gearSrc: string = fs.readFileSync('src/web/gear.ts', 'utf8');
const luxBody = gearSrc.slice(gearSrc.indexOf('export const LUX_W'), gearSrc.indexOf('};', gearSrc.indexOf('export const LUX_W')));
const LUX_W: Record<string, string> = {}; for (const m of luxBody.matchAll(/(\w+):\s*\['([\w-]+)'/g)) LUX_W[m[1]] = m[2];
const glbFile = (k: string) => ['assets_aholo/props', 'assets_aholo/dlc1/creatures', 'assets_aholo/dlc1/props', 'assets_aholo/models_hd'].some(d => fs.existsSync(`${d}/${k}.glb`));
const missW = Object.entries(LUX_W).filter(([, k]) => !glbFile(k)).map(([t, k]) => `${t}=${k}`);
check(missW.length === 0, `按武器类型的 Lux 模型 ${Object.keys(LUX_W).length} 个文件都在${missW.length ? '（缺：' + missW.join('、') + '）' : ''}`);
const missD = Object.entries(D40_LUX).filter(([, v]) => !glbFile(v[0])).map(([id, v]) => `${id}=${v[0]}`);
check(missD.length === 0, `40 级暗金专属模型 ${Object.keys(D40_LUX).length} 个文件都在${missD.length ? '（缺：' + missD.join('、') + '）' : ''}`);
const types = [...new Set(wbases.map(b => b.weaponType!))];
console.log(`  未走 LUX_W 的武器类型（由 KayKit 道具 / 职业模型挂件负责）：${types.filter(t => !LUX_W[t]).join('、') || '无'}`);

// ---------- 3. 名称
console.log('\n=== 3. 实际掉落名称（每职业 3000 件橙 + 全部固定件 + 暗金） ===');
let bad = 0; const badList: string[] = []; let n = 0;
const seen = (it: ItemInstance | null | undefined, tag = '') => { if (!it || !it.weaponType) return; n++; if (!nameFitsWeapon(it.name, it.weaponType as WeaponType)) { bad++; if (badList.length < 12) badList.push(`${tag}${it.name}(${it.weaponType})`); } };
for (const cls of CLS) {
  let s = 12345; const rng = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = new LootGenerator(DATA, rng); (g as unknown as { classId: string }).classId = cls;
  for (let i = 0; i < 3000; i++) seen(g.generate(40, 'orange', ['oneHand', 'twoHand', 'offHand']), `${cls} `);
  for (const f of DATA.fixedItems) seen(g.generateFixed(f.id, 40), `${cls} 固定件 `);
}
const darkBad: string[] = [];
const DARKS = DATA.fixedItems.filter(f => f.quality === 'dark') as Array<{ name: string; baseId: string }>;
for (const d of DARKS) { const b = DATA.bases.find(x => x.id === d.baseId); if (b?.weaponType && !nameFitsWeapon(d.name, b.weaponType)) darkBad.push(`${d.name}@${b.name}(${b.weaponType})`); }
check(bad === 0, `掉落 ${n} 件武器，名字与手持类型一致（不符 ${bad}${badList.length ? '：' + badList.join('、') : ''}）`);
check(darkBad.length === 0, `暗金 ${DARKS.length} 件名字与底材一致${darkBad.length ? '（不符：' + darkBad.join('、') + '）' : ''}`);

console.log(fails ? `\n✗ ${fails} 项失败` : '\n✓ 全部通过');
if (fails) process.exitCode = 1;
