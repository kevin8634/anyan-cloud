// ======================================================================
// DLC1 守钟人第 7 键「钟鸣」（v1.1.1，d1.8）—— 本体扩展按键 PackManifest.extKey（电脑 T / 手机技能区按钮）
// 范围钟声：以自己为中心 8 米，打断所有读条、眩晕普通敌人 1.2 秒、伤害 = 普攻 × 3、易伤 +20%（8 秒）
// 充能（0–100）：打断敌人读条 +40、翻滚 / 无敌挡下攻击（格挡）+25、受到伤害 +2（每 0.5 秒最多一次）、击杀精英 +10
//   × (1 + 钟楼 / 居民 / 钟律的充能加成)；钟鸣伤害 / 易伤 / 范围吃训练场、居民、钟律加成
// 只对选了「再鸣」的角色出现（DLC1_FATE.choice() === 'A'）；选「断绳」或还没选：按钮不出现，T 键无效
// 在无声钟楼的「死寂」里敲响钟鸣会立刻驱散死寂
// ======================================================================
import * as THREE from 'three';
import type { PackExtKey, PackEvent, PackCtx } from '../../core/ContentPacks';
import { fateChoice } from './fate';
import { domainMods, domainState, noteChimeHits, bellSound, domainOnKill } from './domain';
import { endSilence } from './belltower';
import { fxTex } from './fx_kit';

// v1.2.39c：伤害 = 技能伤害 800%；造成伤害也充能（每 0.25 秒最多 +1 ≈ 持续输出 25 秒充满）；易伤对首领同样生效
//   放完进入 8 秒「余音」：技能伤害 +20%，每 2 秒自动响一次小钟（4 米，技能伤害 100%）
export const CHIME = { r: 8, dmgK: 8, stun: 1.2, vuln: 0.2, vulnDur: 8, gain: { interrupt: 40, parry: 25, hurt: 2, elite: 10, deal: 1 }, dealGap: 250,
  echo: { dur: 8, dmg: 0.2, every: 2, r: 4, dmgK: 1 } };
let ctx: PackCtx | null = null;
export const bindChime = (c: PackCtx) => { ctx = c; };
let lastHurt = 0, lastDeal = 0, echoLeft = 0, echoTick = 0;
const st = () => domainState();
export const chimeOn = () => fateChoice() === 'A';
export const chimeCharge = () => Math.max(0, Math.min(100, st().chime ?? 0));
export function chimeAdd(n: number) {
  if (!chimeOn() || n <= 0) return;
  const k = 1 + (domainMods().chimeCharge ?? 0);
  const before = chimeCharge();
  st().chime = Math.min(100, before + n * k);
  if (before < 100 && st().chime! >= 100) { ctx?.toast('钟鸣已就绪（T）', '#ffe08a'); ctx?.synth?.()?.tone({ f: 880, type: 'sine', dur: 0.5, gain: 0.05, d: 0.45 }); }
}
export function chimeEvent(ev: PackEvent) {
  if (ev.type === 'kill') { domainOnKill(ev); if (ev.elite || ev.boss) chimeAdd(CHIME.gain.elite); return; }
  if (!chimeOn()) return;
  if (ev.type === 'interrupt') chimeAdd(CHIME.gain.interrupt);
  else if (ev.type === 'parry') chimeAdd(CHIME.gain.parry);
  else if (ev.type === 'deal') { const t = performance.now(); if (t - lastDeal >= CHIME.dealGap) { lastDeal = t; chimeAdd(CHIME.gain.deal); } }
  else if (ev.type === 'hurt') { const t = performance.now(); if (t - lastHurt > 500) { lastHurt = t; chimeAdd(CHIME.gain.hurt); } }
}

export const chimeStats = () => {
  const m = domainMods();
  return { r: CHIME.r + (m.chimeR ?? 0), dmgK: CHIME.dmgK * (1 + (m.chimeDmg ?? 0)), vuln: CHIME.vuln + (m.chimeVuln ?? 0), stun: CHIME.stun, vulnDur: CHIME.vulnDur };
};
let lastUse = { hits: 0, interrupted: 0 };
export function chimeUse(force = false): boolean {
  if (!ctx || !chimeOn()) return false;
  if (!force && chimeCharge() < 100) { ctx.toast(`钟鸣充能 ${Math.floor(chimeCharge())}%：造成伤害、打断读条、翻滚挡下攻击来充能`, '#c8c0a0'); return false; }
  const s = chimeStats();
  const r = ctx.strike?.({ r: s.r, dmgK: s.dmgK, el: 'arcane', interrupt: true, stun: s.stun, vuln: s.vuln, vulnDur: s.vulnDur }) ?? { hits: 0, interrupted: 0 };
  lastUse = r;
  st().chime = 0;
  noteChimeHits(r.hits);
  chimeFx(s.r);
  bellSound(1.5);
  if (endSilence()) ctx.toast('钟鸣驱散了死寂', '#9ae8f0');
  if (r.interrupted) ctx.yell(`钟鸣 · 打断 ${r.interrupted} 个读条`);
  echoLeft = CHIME.echo.dur; echoTick = 0;
  ctx.buff?.({ key: 'dlc1_chime_echo', name: '余音', dmg: CHIME.echo.dmg, dur: CHIME.echo.dur });
  return true;
}
/** v1.2.39c 余音：每 2 秒自动响一次小钟 */
export function chimeUpdate(dt: number) {
  if (echoLeft <= 0 || !ctx) return;
  echoLeft -= dt; echoTick += dt;
  if (echoTick >= CHIME.echo.every) {
    echoTick -= CHIME.echo.every;
    const s = chimeStats();
    ctx.strike?.({ r: CHIME.echo.r, dmgK: CHIME.echo.dmgK * (1 + (domainMods().chimeDmg ?? 0)), el: 'arcane', vuln: s.vuln, vulnDur: 3 });
    chimeFx(CHIME.echo.r, true);
    bellSound(0.6);
  }
}
export const chimeEchoLeft = () => Math.max(0, echoLeft);
export const chimeLast = () => lastUse;

// ---------------------------------------------------------------- 表现：头顶虚影铜钟 + 三道扩散声环 + 金青粒子
const bellGeo = (() => { const p: THREE.Vector2[] = []; for (let i = 0; i <= 12; i++) { const t = i / 12; p.push(new THREE.Vector2(0.35 + 0.55 * t * t + (t > 0.9 ? (t - 0.9) * 2 : 0), 1.3 - t * 1.3)); } return new THREE.LatheGeometry(p, 20); })();
function chimeFx(r: number, small = false) {
  const fx = ctx?.fx?.(); if (!fx) return;
  const me = fx.me();
  if (small) { fx.fx('star', { x: me.x, y: me.y + 2.2, z: me.z }, { count: 10, color: 0xffe0a0, color2: 0x7fe8f0, speed: 4, spread: 0.6, up: 0.3, life: 0.5, size: 0.25, ring: true }); return; }
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  // 11-14d Rhett「技能的钟用 GPT」：头顶虚影铜钟换成 gpt-image-2 发光钟图（icons/fx_chime_bell.jpg，加色精灵，摆动 = 精灵旋转）；没图回退车削网格
  const bt = fxTex('fx_chime_bell');
  if (bt) {
    const sm = new THREE.SpriteMaterial({ map: bt, color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const sp = new THREE.Sprite(sm); sp.center.set(0.5, 0.85); sp.renderOrder = 5;
    fx.live(sp, 1.1, (k) => { const p = fx.me(); sp.position.set(p.x, p.y + 4.4 + k * 0.6, p.z); sm.rotation = Math.sin(k * 18) * 0.3 * (1 - k); sp.scale.setScalar(2.6 * (1 + k * 0.4)); sm.opacity = k < 0.08 ? k / 0.08 : 1 - Math.pow((k - 0.08) / 0.92, 1.5); });
  } else {
  const bell = new THREE.Mesh(bellGeo, mat); bell.position.set(me.x, me.y + 3.2, me.z);
  fx.live(bell, 1.1, (k) => { const p = fx.me(); bell.position.set(p.x, p.y + 3.2 + k * 0.6, p.z); bell.rotation.z = Math.sin(k * 18) * 0.35 * (1 - k); bell.scale.setScalar(1 + k * 0.5); mat.opacity = 0.75 * (1 - k); });
  }
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: i === 1 ? 0x7fe8f0 : 0xffd070, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(me.x, fx.gy(me.x, me.z) + 0.15, me.z);
    const delay = i * 0.12;
    fx.live(ring, 0.9 + delay, (k) => { const t = Math.max(0, (k * (0.9 + delay) - delay) / 0.9); ring.scale.setScalar(0.3 + t * r); (ring.material as THREE.MeshBasicMaterial).opacity = t <= 0 ? 0 : 0.85 * (1 - t); });
  }
  fx.fx('star', { x: me.x, y: me.y + 3, z: me.z }, { count: 26, color: 0xffe0a0, color2: 0x7fe8f0, speed: 6, spread: 1, up: 0.4, life: 0.7, size: 0.35, ring: true });
  fx.feel('heavy', 0.8);
}

// ---------------------------------------------------------------- 第 7 键
const ICON = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#3a5a5e"/><stop offset="1" stop-color="#0a1416"/></radialGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#b07a28"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><g fill="none" stroke="#7fe8f0" stroke-width="2" opacity=".8"><path d="M10 40a24 24 0 0 1 0-16"/><path d="M54 24a24 24 0 0 1 0 16"/><path d="M5 45a32 32 0 0 1 0-26"/><path d="M59 19a32 32 0 0 1 0 26"/></g><path d="M32 12c-8 0-12 7-12 15v9l-4 6h32l-4-6v-9c0-8-4-15-12-15z" fill="url(#b)" stroke="#5a3a10" stroke-width="1.5"/><circle cx="32" cy="47" r="4" fill="#ffe9a8" stroke="#5a3a10"/><rect x="30" y="7" width="4" height="6" rx="1" fill="#c09040"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
})();
export const CHIME_KEY: PackExtKey = {
  id: 'dlc1_chime', name: '钟鸣', icon: ICON, glyph: '钟', color: '#ffd070',
  visible: chimeOn,
  charge: () => chimeCharge() / 100,
  use: () => chimeUse(),
  tip: () => {
    const s = chimeStats();
    return `<b class="tt-name" style="color:#ffd070">钟鸣</b><span class="tt-sub">第 7 键 · T · 守钟人</span>范围 ${s.r} 米的钟声：打断所有读条，普通敌人眩晕 ${s.stun} 秒，伤害 = 技能伤害 ${Math.round(s.dmgK * 100)}%，敌人（含首领）易伤 +${Math.round(s.vuln * 100)}%（${s.vulnDur} 秒）<br><span style="color:#ffe08a">余音：放完 ${CHIME.echo.dur} 秒内技能伤害 +${Math.round(CHIME.echo.dmg * 100)}%，每 ${CHIME.echo.every} 秒自动响一次小钟</span><br><span style="color:#9ff0ff">充能：造成伤害（持续输出约 25 秒充满）· 打断读条 +40 · 翻滚挡下攻击 +25 · 受击 +2 · 击杀精英 +10</span><br>当前 ${Math.floor(chimeCharge())}%`;
  },
};
