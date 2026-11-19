// ========== v0.7.9.1：天赋独立图标 ==========
// 每个天赋 = 底图（手绘位图，按效果从图标池里挑）+ 系色光晕 + 右下角效果徽记（SVG）。
// 同一职业内「底图 + 徽记」组合不重复，所以 161 个天赋各有一个能区分的图标；徽记一眼看出这一点加的是什么。
import type { TalentNodeDef, TalentTreeDef } from '../core/TalentTree';
import { ICONS } from './assets.gen';

export type Badge = 'cap' | 's4' | 'res' | 'crit' | 'cd' | 'area' | 'heal' | 'def' | 'dot' | 'ctrl' | 'move' | 'dmg' | 'misc';
export const BADGE_NAME: Record<Badge, string> = { cap: '终极', s4: '绝技', res: '资源', crit: '暴击', cd: '冷却 / 急速', area: '范围', heal: '治疗', def: '防御', dot: '持续伤害', ctrl: '控制', move: '位移', dmg: '伤害', misc: '特效' };

export function badgeOf(n: TalentNodeDef): Badge {
  if (n.capstone) return 'cap';
  if (n.resNode || n.res) return 'res';
  const mods = [n.modifier, ...(n.extra ?? [])].filter(Boolean);
  if (mods.some(m => m!.match?.slots?.includes('skill4'))) return 's4';
  const ops = mods.flatMap(m => m!.ops ?? []) as { op: string; stat?: string; effect?: { type: string } }[];
  const st = n.stats ?? {};
  const eff = ops.filter(o => o.op === 'addEffect').map(o => o.effect?.type ?? '');
  const stat = ops.filter(o => o.stat).map(o => o.stat!);
  if ('crit' in st || 'critDmg' in st || stat.some(s => s.startsWith('crit'))) return 'crit';
  if (stat.includes('cooldown') || 'haste' in st) return 'cd';
  if (eff.some(t => t === 'heal' || t === 'lifesteal')) return 'heal';
  if ('hp' in st || 'armor' in st || eff.some(t => t === 'reflect' || t === 'shield' || t === 'barrier')) return 'def';
  if (eff.some(t => t === 'dot' || t === 'groundZone' || t === 'burn')) return 'dot';
  if (eff.some(t => t === 'stun' || t === 'slow' || t === 'freeze' || t === 'interrupt' || t === 'knockback')) return 'ctrl';
  if ('speed' in st) return 'move';
  if (stat.some(s => s === 'radius' || s === 'range' || s === 'projectileCount')) return 'area';
  if (stat.includes('damage') || 'power' in st || eff.some(t => t === 'explode' || t === 'chain')) return 'dmg';
  return 'misc';
}

const P = (d: string) => `<path d="${d}"/>`;
const GLYPH: Record<Badge, string> = {
  cap: P('M3 13 L4 6 L7 9 L10 4 L13 9 L16 6 L17 13 Z'),
  s4: '<text x="10" y="15" text-anchor="middle" font-size="13" font-weight="900" font-family="sans-serif">4</text>',
  res: P('M11 2 L5 11 H9 L8 18 L15 8 H11 Z'),
  crit: P('M10 2 L12 8 L18 10 L12 12 L10 18 L8 12 L2 10 L8 8 Z'),
  cd: P('M5 3 H15 V5 L11 10 L15 15 V17 H5 V15 L9 10 L5 5 Z'),
  area: '<circle cx="10" cy="10" r="7" fill="none" stroke-width="2.4"/><circle cx="10" cy="10" r="2.6"/>',
  heal: P('M8 3 H12 V8 H17 V12 H12 V17 H8 V12 H3 V8 H8 Z'),
  def: P('M10 2 L17 5 V10 Q17 15 10 18 Q3 15 3 10 V5 Z'),
  dot: P('M10 2 Q16 9 16 12.5 A6 6 0 0 1 4 12.5 Q4 9 10 2 Z'),
  ctrl: '<circle cx="7" cy="10" r="4" fill="none" stroke-width="2.4"/><circle cx="13" cy="10" r="4" fill="none" stroke-width="2.4"/>',
  move: P('M3 6 H10 L8 3 L17 10 L8 17 L10 14 H3 Z'),
  dmg: P('M15 2 L18 5 L8 15 L9 17 L7 18 L5 16 L3 15 L4 13 L5 12 Z'),
  misc: '<circle cx="10" cy="10" r="5"/>',
};
export function badgeSvg(b: Badge, color: string) {
  const stroke = b === 'area' || b === 'ctrl';
  return `<svg class="tbadge" viewBox="0 0 20 20" width="16" height="16"><g fill="${stroke ? 'none' : color}" stroke="${stroke ? color : '#1a0e04'}" stroke-width="${stroke ? 2.4 : 1.2}">${GLYPH[b].replace(/fill="none" stroke-width="2.4"/g, '')}</g></svg>`;
}

/** 底图池：按徽记找相近的手绘图标，碰撞时依次往后挑 */
const POOL: Record<Badge, string[]> = {
  cap: ['tl_starfall', 'tl_wrath', 'tl_epiphany', 'tl_endless', 'tl_arcaneheart', 'tl_fireheart', 'tl_iceheart'],
  s4: ['tl_quick', 'tl_haste', 'tl_storm', 'tl_echo'],
  res: ['tl_wrath', 'tl_arcane', 'tl_mark', 'tl_steam', 'tl_endless', 'tl_echo'],
  crit: ['tl_weapon', 'it_dagger', 'tl_wrath', 'it_sword', 'tl_scorch', 'tl_mark'],
  cd: ['tl_haste', 'tl_quick', 'it_hourglass', 'tl_echo', 'tl_epiphany', 'tl_ghost'],
  area: ['tl_quake', 'tl_storm', 'tl_starfall', 'tl_blast', 'tl_wildfire', 'sk_whirlwind'],
  heal: ['tl_laststand', 'tl_endless', 'it_amulet', 'tl_barrier', 'tl_iceheart'],
  def: ['tl_tough', 'tl_iron', 'tl_barrier', 'tl_icearmor', 'it_shield', 'it_helm', 'tl_laststand', 'it_chest', 'it_frost_shield'],
  dot: ['tl_scorch', 'tl_flame', 'tl_plague', 'tl_wildfire', 'tl_steam', 'tl_frost'],
  ctrl: ['tl_frost', 'tl_deepfreeze', 'sk_thunderclap', 'sk_stasis', 'sk_arcane_bind', 'tl_quake'],
  move: ['sk_charge', 'sk_sand_step', 'tl_ghost', 'it_plate_boots', 'it_leather_boots', 'it_cloth_shoes'],
  dmg: ['tl_weapon', 'it_greataxe', 'it_axe', 'it_mace', 'tl_flame', 'tl_arcane', 'tl_blast', 'it_chakram', 'it_wand', 'it_staff'],
  misc: ['tl_echo', 'tl_mark', 'it_tome', 'it_orb', 'it_reagent', 'it_flask'],
};
const ALL = () => Object.keys(ICONS).filter(k => /^(tl_|sk_|it_)/.test(k));

export interface TalentArt { icon: string; badge: Badge }
const cache = new WeakMap<TalentTreeDef, Map<string, TalentArt>>();
/** 给一棵职业天赋树的每个节点分配「底图 + 徽记」，同树内组合不重复 */
export function talentArtMap(tree: TalentTreeDef): Map<string, TalentArt> {
  const hit = cache.get(tree); if (hit) return hit;
  const used = new Set<string>(), out = new Map<string, TalentArt>(), all = ALL();
  for (const sp of tree.specs) for (const n of sp.nodes) {
    const badge = badgeOf(n);
    const cands = [n.icon ?? '', ...POOL[badge], ...all].filter(k => k && ICONS[k]);
    const icon = cands.find(k => !used.has(`${k}|${badge}`)) ?? cands[0] ?? 'ui_class';
    used.add(`${icon}|${badge}`); out.set(n.id, { icon, badge });
  }
  cache.set(tree, out); return out;
}
