// ======================================================================
// DLC1「回响钟纹」（v1.2.15 → v1.2.37c 改为增益 / 功能型）—— 本体第 8 技能格 PackManifest.skillSlot（电脑 G / 手机技能区按钮）
// 24 枚 = 6 职业 × 4 类，不再造成伤害：
//   战意：8 秒伤害 +15%    迅律：刷新技能 1–3 中剩余冷却最长的一个 + 6 秒急速 +20%（仍受急速上限 40%）
//   庇护：20% 最大生命护盾 + 减伤 20%（6 秒）    疾风：5 秒移速 +40%，下一次翻滚不进入冷却
//   基础冷却 30–45 秒，吃技能冷却缩减（PackCtx.skillCdr，已套 40% 上限）；各职业保留风味名与职业色光效
// 来源：40 级副本首领掉落（rollEchoDrop）；调试 / 测试用 echoGive
// 存档：dlc.dlc1.echo = { own: 钟纹 id[], eq: 装着的 id | null }；旧版 4 风格 id（aoe / single / move / guard）读档时映射到新四类（ECHO_LEGACY）
// ======================================================================
import * as THREE from 'three';
import type { PackCtx, PackSkillSlot, PackSlotItem, PackSlotSkill, PackEvent } from '../../core/ContentPacks';
import { HUNTER_ID } from './hunter_skills';
import { COFFIN_ID } from './coffin_skills';

type Style = 'might' | 'swift' | 'ward' | 'gale';
export interface EchoDef { id: string; cls: string; style: Style; name: string; cd: number; color: string; desc: string }

export const ECHO_CLS: Record<string, { name: string; color: string }> = {
  warrior: { name: '战士', color: '#e8a040' },
  mage: { name: '法师', color: '#8ab8ff' },
  chrono: { name: '时砂行者', color: '#f0d890' },
  alchemy: { name: '炼金投弹手', color: '#80e070' },
  [HUNTER_ID]: { name: '灵契猎手', color: '#70e0b0' },
  [COFFIN_ID]: { name: '负棺人', color: '#b090e0' },
};
export const STYLE_NAME: Record<Style, string> = { might: '战意', swift: '迅律', ward: '庇护', gale: '疾风' };
/** 数值（四类共用；职业只换风味名 / 光效） */
export const ECHO_K = {
  might: { dmg: 0.15, dur: 8, cd: 35 },
  swift: { haste: 0.2, dur: 6, cd: 45, slots: ['skill1', 'skill2', 'skill3'] },
  ward: { shield: 0.2, reduce: 0.2, dur: 6, cd: 40 },
  gale: { speed: 0.4, dur: 5, cd: 30, freeRolls: 1 },
} as const;
const DESC: Record<Style, string> = {
  might: `${ECHO_K.might.dur} 秒内造成的伤害 +${ECHO_K.might.dmg * 100}%`,
  swift: `立即刷新技能 1–3 中剩余冷却最长的一个，并获得 ${ECHO_K.swift.dur} 秒急速 +${ECHO_K.swift.haste * 100}%（急速仍受 40% 上限）`,
  ward: `获得 ${ECHO_K.ward.shield * 100}% 最大生命的护盾，并且受到伤害 -${ECHO_K.ward.reduce * 100}%，持续 ${ECHO_K.ward.dur} 秒`,
  gale: `${ECHO_K.gale.dur} 秒内移动速度 +${ECHO_K.gale.speed * 100}%，下一次翻滚不进入冷却`,
};
/** 旧版风格 → 新四类（v1.2.37c 存档迁移；id 后缀同步换掉） */
export const ECHO_LEGACY: Record<string, Style> = { aoe: 'might', single: 'swift', guard: 'ward', move: 'gale' };
const migrateId = (id: string) => { const m = /^dlc1_em_(.+)_(aoe|single|guard|move)$/.exec(id); return m ? `dlc1_em_${m[1]}_${ECHO_LEGACY[m[2]]}` : id; };

const FLAVOR: Record<string, Record<Style, string>> = {
  warrior: { might: '战吼', swift: '疾锋', ward: '铜墙', gale: '破阵' },
  mage: { might: '奥能涌动', swift: '咏速', ward: '寒晶壁', gale: '相位' },
  chrono: { might: '刻印', swift: '千刻', ward: '停摆', gale: '逆时步' },
  alchemy: { might: '狂暴药剂', swift: '速效配方', ward: '炼金护甲', gale: '推进烟爆' },
  [HUNTER_ID]: { might: '兽潮', swift: '猎首', ward: '熊魂守', gale: '狼跃' },
  [COFFIN_ID]: { might: '群棺', swift: '魂钟', ward: '墓碑镇守', gale: '锁魂拖行' },
};
export const ECHO_DEFS: EchoDef[] = Object.keys(ECHO_CLS).flatMap(cls => (['might', 'swift', 'ward', 'gale'] as Style[]).map(style =>
  ({ id: `dlc1_em_${cls}_${style}`, cls, style, name: `钟纹·${FLAVOR[cls][style]}`, cd: ECHO_K[style].cd, color: ECHO_CLS[cls].color, desc: DESC[style] })));
export const ECHO_BY_ID: Record<string, EchoDef> = Object.fromEntries(ECHO_DEFS.map(d => [d.id, d]));

/** 40 级副本掉落表（forge.ts 首领死亡时调用 rollEchoDrop） */
export const ECHO_DROP_TABLE = {
  id: 'dlc1_r40_echomark',
  boss: 0.12, last: 0.3,
  diffK: { normal: 1, heroic: 1.25, epic: 1.5, mythic: 1.5, nightmare: 2 } as Record<string, number>,
  unownedOnly: true,
};
export function rollEchoDrop(last: boolean, diff = 'normal', rng: () => number = Math.random): string | null {
  if (!ctx) return null;
  const p = (last ? ECHO_DROP_TABLE.last : ECHO_DROP_TABLE.boss) * (ECHO_DROP_TABLE.diffK[diff] ?? 1);
  if (rng() >= p) return null;
  const pool = ECHO_DEFS.filter(d => d.cls === ctx!.classId() && !S.own.includes(d.id));
  if (!pool.length) return null;
  const d = pool[Math.floor(rng() * pool.length)];
  echoGive(d.id);
  return d.id;
}

// ---------------------------------------------------------------- 存档 / 状态
let ctx: PackCtx | null = null;
export const bindEcho = (c: PackCtx) => { ctx = c; };
let S: { own: string[]; eq: string | null } = { own: [], eq: null };
const cds: Record<string, number> = {};
const cdMax: Record<string, number> = {};
export function echoLoad(d: unknown) {
  const o = (d && typeof d === 'object' ? d : {}) as { own?: unknown; eq?: unknown };
  const own = Array.isArray(o.own) ? o.own.filter((x): x is string => typeof x === 'string').map(migrateId).filter(x => x in ECHO_BY_ID) : [];
  const eq = typeof o.eq === 'string' ? migrateId(o.eq) : null;
  S = { own: [...new Set(own)], eq: eq && eq in ECHO_BY_ID ? eq : null };
  if (S.eq && !S.own.includes(S.eq)) S.eq = null;
  for (const k of Object.keys(cds)) delete cds[k];
}
export const echoSave = () => (S.own.length || S.eq ? { own: [...S.own], eq: S.eq } : null);
export const ECHO_LEVEL = 40;

export function echoGive(id: string): boolean {
  id = migrateId(id);
  const d = ECHO_BY_ID[id]; if (!d || S.own.includes(id)) return false;
  S.own.push(id);
  ctx?.toast(`获得回响钟纹：[${d.name}]（行囊里装入第 8 技能格）`, d.color);
  ctx?.save();
  return true;
}
export const echoGiveAll = (cls?: string) => ECHO_DEFS.filter(d => !cls || d.cls === cls).map(d => echoGive(d.id));

function whyNot(d: EchoDef): string | null {
  if (!ctx) return '还没进入游戏';
  if (d.cls !== ctx.classId()) return `${ECHO_CLS[d.cls]?.name ?? d.cls}专用`;
  if (ctx.level() < ECHO_LEVEL) return `${ECHO_LEVEL} 级开放`;
  return null;
}
function echoEquip(id: string | null): string | null {
  if (id === null) { S.eq = null; ctx?.save(); return null; }
  id = migrateId(id);
  const d = ECHO_BY_ID[id]; if (!d || !S.own.includes(id)) return '还没有这枚钟纹';
  const w = whyNot(d); if (w) return `无法装入：${w}`;
  S.eq = id; ctx?.save();
  return null;
}
/** 实际冷却 = 基础 × (1 − 技能冷却缩减) */
export const echoCd = (d: EchoDef) => Math.round(d.cd * (1 - Math.max(0, Math.min(0.4, ctx?.skillCdr?.() ?? 0))) * 10) / 10;

// ---------------------------------------------------------------- 释放
let last: { id: string; style: string; cd: number; refreshed: string | null } = { id: '', style: '', cd: 0, refreshed: null };
export const echoLast = () => ({ ...last });

export function echoUse(): boolean {
  const d = S.eq ? ECHO_BY_ID[S.eq] : null;
  if (!ctx || !d) return false;
  const w = whyNot(d); if (w) { ctx.toast(`${d.name}：${w}`, '#ff8060'); return false; }
  const left = cds[d.id] ?? 0;
  if (left > 0) { ctx.toast(`${d.name} 冷却中（${left.toFixed(1)} 秒）`, '#c8c0a0'); return false; }
  let refreshed: string | null = null;
  const key = `echo_${d.style}`;
  if (d.style === 'might') ctx.buff?.({ key, name: d.name, dmg: ECHO_K.might.dmg, dur: ECHO_K.might.dur });
  else if (d.style === 'swift') {
    refreshed = ctx.refreshLongestCd?.([...ECHO_K.swift.slots]) ?? null;
    ctx.buff?.({ key, name: d.name, haste: ECHO_K.swift.haste, dur: ECHO_K.swift.dur });
  } else if (d.style === 'ward') {
    ctx.shield?.(ECHO_K.ward.shield, ECHO_K.ward.dur);
    ctx.guard?.(ECHO_K.ward.reduce, 0, ECHO_K.ward.dur);
  } else {
    ctx.buff?.({ key, name: d.name, speed: ECHO_K.gale.speed, dur: ECHO_K.gale.dur });
    ctx.freeRoll?.(ECHO_K.gale.freeRolls);
  }
  const cd = echoCd(d);
  cds[d.id] = cd; cdMax[d.id] = cd;
  last = { id: d.id, style: d.style, cd, refreshed };
  castFx(d);
  castSound(d);
  ctx.yell(d.name);
  return true;
}
/** 每帧（manifest.update） */
export function echoUpdate(dt: number) {
  for (const k of Object.keys(cds)) if (cds[k] > 0) cds[k] = Math.max(0, cds[k] - dt);
}
/** 战斗事件（增益型钟纹不需要；保留接口给 manifest） */
export function echoEvent(_ev: PackEvent) { /* 无 */ }
export const echoResetCd = () => { for (const k of Object.keys(cds)) cds[k] = 0; };
export const echoState = () => ({ own: [...S.own], eq: S.eq, cd: S.eq ? cds[S.eq] ?? 0 : 0 });

// ---------------------------------------------------------------- 图标（SVG：职业色底 + 钟形 + 风格符号）
const iconCache: Record<string, string> = {};
export function echoIcon(d: EchoDef): string {
  if (iconCache[d.id]) return iconCache[d.id];
  const c = d.color;
  const sym: Record<Style, string> = {
    might: `<g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M22 50l10-22 10 22"/><path d="M26 42h12"/></g><path d="M32 26l4 6h-8z" fill="#fff"/>`,
    swift: `<g stroke="${c}" stroke-width="3" fill="none"><circle cx="32" cy="36" r="10"/><path d="M32 20v8M32 44v8M16 36h8M40 36h8"/></g><circle cx="32" cy="36" r="3" fill="#fff"/>`,
    gale: `<g fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 26l10 10-10 10"/><path d="M30 26l10 10-10 10" opacity=".75"/><path d="M42 26l10 10-10 10" opacity=".5"/></g>`,
    ward: `<path d="M32 18l14 5v11c0 9-6 15-14 19-8-4-14-10-14-19V23z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="2.6"/><path d="M24 36l5 5 11-11" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="${c}" stop-opacity=".45"/><stop offset=".6" stop-color="#101820"/><stop offset="1" stop-color="#04070a"/></radialGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4e6b8"/><stop offset="1" stop-color="#8a6a30"/></linearGradient></defs><rect width="64" height="64" rx="10" fill="url(#g)"/><path d="M27 6h10v3c5 1 8 5 8 10v4H19v-4c0-5 3-9 8-10z" fill="url(#b)" opacity=".9"/><rect x="17" y="22" width="30" height="2.5" rx="1" fill="#f4e6b8"/>${sym[d.style]}<rect x="1.5" y="1.5" width="61" height="61" rx="9" fill="none" stroke="${c}" stroke-opacity=".8" stroke-width="2"/></svg>`;
  return (iconCache[d.id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg));
}

// ---------------------------------------------------------------- 表现 / 音效（职业色：战意 = 光环 + 火花；迅律 = 旋风；庇护 = 法印；疾风 = 拖影）
const phoneNow = () => typeof document !== 'undefined' && document.documentElement.classList.contains('phone');
function castFx(d: EchoDef) {
  const fx = ctx?.fx?.(); if (!fx) return;
  const me = fx.me(), p = { x: me.x, z: me.z }, y = fx.gy(p.x, p.z);
  const col = new THREE.Color(d.color).getHex(), n = phoneNow() ? 0.5 : 1;
  fx.ring(p, 2.2, d.color, 0.5); fx.ring(p, 1.2, '#ffffff', 0.35);
  if (d.style === 'might') { fx.fx('spark', { x: p.x, y: y + 1, z: p.z }, { count: Math.round(26 * n), color: col, color2: 0xffffff, speed: 4, spread: 1, up: 2, life: 0.6, size: 0.4, ring: true }); fx.whirl(1.2, d.color, 1.2); }
  else if (d.style === 'swift') { fx.whirl(1.4, d.color, 1.6); fx.fx('rune', { x: p.x, y: y + 1.2, z: p.z }, { count: Math.round(18 * n), color: col, color2: 0xffffff, speed: 2, spread: 0.8, up: 1.5, life: 0.7, size: 0.35 }); }
  else if (d.style === 'ward') { fx.sigil(p, 2.2, d.color, 3); fx.whirl(1.4, d.color, 2); }
  else { fx.fx('streak', { x: p.x, y: y + 1, z: p.z }, { count: phoneNow() ? 8 : 16, color: col, color2: 0xffffff, speed: 3, spread: 0.6, up: 0.4, life: 0.4, size: 0.35 }); }
  fx.anim('cast', 2);
  fx.feel('hit', 0.4);
}
function castSound(d: EchoDef) {
  const A = ctx?.synth?.(); if (!A || !A.gate('echomark', 0.1)) return;
  const base = { might: 330, swift: 520, gale: 440, ward: 260 }[d.style];
  A.tone({ f: base * 2, f2: base, type: 'sine', dur: 0.9, gain: 0.06, a: 0.005, d: 0.85, detune: 7 });
  A.tone({ f: base * 3.01, type: 'triangle', dur: 0.6, gain: 0.025, a: 0.005, d: 0.55 });
  A.noise({ f: 2200, type: 'bandpass', q: 2, dur: 0.18, gain: 0.03 });
}

// ---------------------------------------------------------------- 第 8 技能格挂载
const tipOf = (d: EchoDef) => {
  const cd = echoCd(d);
  return `<b class="tt-name" style="color:${d.color}">${d.name}</b><span class="tt-sub">回响钟纹 · ${ECHO_CLS[d.cls]?.name ?? d.cls} · ${STYLE_NAME[d.style]} · 第 8 技能格</span>${d.desc}<br>` +
    `冷却 ${cd} 秒${cd < d.cd ? `（基础 ${d.cd} 秒，吃冷却缩减）` : '（吃冷却缩减）'}${(cds[d.id] ?? 0) > 0 ? ` · 剩余 ${cds[d.id].toFixed(1)} 秒` : ''}` +
    `<br><span style="opacity:.7;font-style:italic">钟声停了，回响还刻在铜上。</span>`;
};
const skillCache: Record<string, PackSlotSkill> = {};
const skillOf = (d: EchoDef): PackSlotSkill => (skillCache[d.id] ??= { id: d.id, name: d.name, icon: echoIcon(d), glyph: d.name.slice(-1), color: d.color, get cd() { return cdMax[d.id] ?? echoCd(d); }, cdLeft: () => cds[d.id] ?? 0, use: () => echoUse(), tip: () => tipOf(d) });
export const ECHO_SLOT: PackSkillSlot = {
  title: '回响钟纹 · 第 8 技能格',
  current: () => { const d = S.eq ? ECHO_BY_ID[S.eq] : null; return d && !whyNot(d) ? skillOf(d) : null; },
  items: (): PackSlotItem[] => S.own.map(id => ECHO_BY_ID[id]).filter(Boolean).sort((a, b) => (a.cls === ctx?.classId() ? 0 : 1) - (b.cls === ctx?.classId() ? 0 : 1)).map(d => {
    const w = whyNot(d);
    return { id: d.id, name: d.name, icon: echoIcon(d), color: d.color, tip: tipOf(d), equipped: S.eq === d.id, usable: !w, note: w ?? `${STYLE_NAME[d.style]} · ${echoCd(d)} 秒` };
  }),
  equip: id => echoEquip(id),
};
