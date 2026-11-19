// ======================================================================
// DLC1 渊噬者第 7 键「吞噬」（v1.1.2，d1.9）—— 本体扩展按键 PackManifest.extKey（电脑 T / 手机技能区按钮）
// 和守钟人的「钟鸣」共用同一个按键位：manifest.extKey = [钟鸣, 吞噬]，本体显示第一个 visible() 为真的；
//   钟鸣只对 A、吞噬只对 B 可见，两者互斥（没选 = 都不出现）
// 吞噬：身边 4 米（第三只眼 +1 / +2，渊形态 +1）内最近的、生命 ≤ 30%（第三只眼 35 / 40 / 45%）的一个敌人
//   普通 / 精英：直接处决；首领：不能处决，改为普攻 × 5 的撕咬
//   回血 8%（精英 15%，首领 5%）、渊化值 +20（精英 +30，首领 +25）、渊质 +1（精英 4，首领 2）；吞精英 35% 几率临时变异 60 秒
//   冷却 8 秒（渊形态 4 秒）；v1.2.39c 起附近没有可吞噬目标 = 渊爪横扫并进冷却
// ======================================================================
import * as THREE from 'three';
import type { PackExtKey } from '../../core/ContentPacks';
import { abyssOpen, abyssState, abyssCtx, devourR, devourThr, inForm, onDevoured, growl, phone } from './abyssbody';

// v1.2.39c：首领撕咬 = 技能伤害 600%（照常回渊化值）；附近没有可吞噬目标时改为 6 米「渊爪横扫」（技能伤害 200%，进冷却）；
//   吞噬 / 撕咬成功后 6 秒伤害 +15%
export const DEVOUR = { cd: 8, cdForm: 4, bossK: 6, sweepR: 6, sweepK: 2, buffDmg: 0.15, buffDur: 6 };
let cdLeft = 0, cdMax = DEVOUR.cd;
let last = { hits: 0, killed: 0, elites: 0, bosses: 0, ess: 0 };
export const devourOn = () => abyssOpen() && !!abyssState().on;
export const devourCharge = () => (cdLeft <= 0 ? 1 : 1 - cdLeft / Math.max(0.01, cdMax));
export const devourLast = () => last;
export function devourUpdate(dt: number) { if (cdLeft > 0) cdLeft = Math.max(0, cdLeft - dt); }
export const devourResetCd = () => { cdLeft = 0; };

export function devourUse(): boolean {
  const ctx = abyssCtx();
  if (!ctx || !devourOn()) return false;
  if (cdLeft > 0) { ctx.toast(`吞噬冷却中（${cdLeft.toFixed(1)} 秒）`, '#a890c0'); return false; }
  const r = devourR(), thr = devourThr();
  const res = ctx.strike?.({ r, dmgK: DEVOUR.bossK, el: 'shadow', maxHpFrac: thr, max: 1, execute: true }) ?? { hits: 0, interrupted: 0 };
  if (!res.hits) {
    last = { hits: 0, killed: 0, elites: 0, bosses: 0, ess: 0 };
    const sw = ctx.strike?.({ r: DEVOUR.sweepR, dmgK: DEVOUR.sweepK, el: 'shadow' }) ?? { hits: 0, interrupted: 0 };
    cdMax = inForm() ? DEVOUR.cdForm : DEVOUR.cd; cdLeft = cdMax;
    sweepFx(DEVOUR.sweepR); growl(0.8);
    ctx.yell(sw.hits ? `渊爪横扫 · ${sw.hits}` : '渊爪横扫');
    return true;
  }
  const o = { killed: res.killed ?? 0, elites: res.elites ?? 0, bosses: res.bosses ?? 0 };
  const ess = onDevoured(o) ?? 0;
  last = { hits: res.hits, ...o, ess };
  cdMax = inForm() ? DEVOUR.cdForm : DEVOUR.cd; cdLeft = cdMax;
  devourFx(r);
  ctx.buff?.({ key: 'dlc1_devour_sate', name: '饱噬', dmg: DEVOUR.buffDmg, dur: DEVOUR.buffDur });
  growl(o.bosses ? 0.7 : 1);
  ctx.yell(o.bosses && !o.killed ? '撕咬！' : o.elites ? '吞噬 · 精英' : '吞噬');
  return true;
}

function sweepFx(r: number) {
  const fx = abyssCtx()?.fx?.(); if (!fx) return;
  const me = fx.me();
  fx.fx('smoke', { x: me.x, y: me.y + 0.8, z: me.z }, { count: phone() ? 10 : 22, color: 0x8a3aff, color2: 0x120418, speed: 7, spread: 0.5, up: 0.1, life: 0.45, size: 0.5, ring: true });
  fx.fx('spark', { x: me.x, y: me.y + 1, z: me.z }, { count: phone() ? 6 : 14, color: 0xff4a7a, color2: 0xa060ff, speed: r, spread: 0.4, up: 0.2, life: 0.35, size: 0.3, ring: true });
  fx.feel('heavy', 0.5);
}
// ---------------------------------------------------------------- 表现：身前张开的渊口 + 向内收拢的紫色漩涡
let mawGeo: THREE.BufferGeometry | null = null;
function devourFx(r: number) {
  const fx = abyssCtx()?.fx?.(); if (!fx) return;
  const me = fx.me(), f = fx.facing();
  mawGeo ??= new THREE.TorusGeometry(0.9, 0.12, 4, 18, Math.PI * 1.6);
  const m = new THREE.MeshBasicMaterial({ color: 0xa060ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const maw = new THREE.Mesh(mawGeo, m);
  const fx0 = me.x + Math.sin(f) * 1.2, fz0 = me.z + Math.cos(f) * 1.2;
  maw.position.set(fx0, me.y + 1.1, fz0); maw.rotation.y = f;
  fx.live(maw, 0.5, k => { maw.scale.setScalar(1.4 - k * 1.1); maw.rotation.z = k * 4; m.opacity = 0.85 * (1 - k); });
  fx.fx('smoke', { x: fx0, y: me.y + 1, z: fz0 }, { count: phone() ? 8 : 16, color: 0x8a3aff, color2: 0x120418, speed: -4, spread: Math.min(2.5, r * 0.4), up: 0.2, life: 0.5, size: 0.5, swirl: 6 });
  fx.fx('spark', { x: me.x, y: me.y + 1.2, z: me.z }, { count: phone() ? 6 : 12, color: 0xff4a7a, color2: 0xa060ff, speed: 3, spread: 0.3, up: 0.5, life: 0.4, size: 0.25, ring: true });
  fx.feel('heavy', 0.6);
}

// ---------------------------------------------------------------- 第 7 键
const ICON = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#3a1450"/><stop offset="1" stop-color="#08020c"/></radialGradient><radialGradient id="m" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff4a7a"/><stop offset=".55" stop-color="#5a0a40"/><stop offset="1" stop-color="#14020c"/></radialGradient></defs><rect width="64" height="64" fill="url(#g)"/><g fill="none" stroke="#a070ff" stroke-width="2" opacity=".75"><path d="M8 32c6-14 14-20 24-20s18 6 24 20"/><path d="M8 32c6 14 14 20 24 20s18-6 24-20"/></g><ellipse cx="32" cy="32" rx="17" ry="12" fill="url(#m)"/><g fill="#efe6ff"><path d="M17 26l3 7 3-8z"/><path d="M24 22l3 8 3-9z"/><path d="M34 21l3 9 3-8z"/><path d="M41 25l3 8 3-7z"/><path d="M19 39l3-7 3 8z"/><path d="M27 42l3-8 3 9z"/><path d="M36 42l3-9 3 8z"/></g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
})();
export const DEVOUR_KEY: PackExtKey = {
  id: 'dlc1_devour', name: '吞噬', icon: ICON, glyph: '噬', color: '#b070ff',
  visible: devourOn,
  charge: devourCharge,
  use: () => devourUse(),
  tip: () => `<b class="tt-name" style="color:#c090ff">吞噬</b><span class="tt-sub">第 7 键 · T · 渊噬者</span>处决身边 ${devourR()} 米内最近的一个生命 ≤ ${Math.round(devourThr() * 100)}% 的敌人（首领改为技能伤害 ${DEVOUR.bossK * 100}% 的撕咬，照常回渊化值）；附近没有可吞噬的目标时改为 ${DEVOUR.sweepR} 米渊爪横扫（技能伤害 ${DEVOUR.sweepK * 100}%）<br><span style="color:#ffb0d0">吞噬 / 撕咬后 ${DEVOUR.buffDur} 秒伤害 +${Math.round(DEVOUR.buffDmg * 100)}%</span><br><span style="color:#d0a0ff">回血 8%（精英 15%）· 渊化值 +20（精英 +30）· 渊质 +1（精英 4）· 吞精英有几率临时变异</span><br>冷却 ${DEVOUR.cd} 秒（渊形态 ${DEVOUR.cdForm} 秒）${cdLeft > 0 ? ` · 剩余 ${cdLeft.toFixed(1)} 秒` : ''}`,
};
