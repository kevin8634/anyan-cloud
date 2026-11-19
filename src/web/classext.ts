// ========== v1.0.6：内容包职业运行时桥（core/ClassExt.ts ClassRuntime ↔ 本体运行时） ==========
// 本体 4 职业没有 ext.runtime：这里所有函数都直接返回（代码路径和以前一样）。
// 挂钩：main.applyClass → classExtReset；main 每帧 → classExtUpdate；main 按键 → classExtKey；
//       casting.tryCast → classExtCanCast / classExtCast；casting.applyHits → classExtHits；EffectSystem.preDeal / onDealt（串联）
import type { Ctx, Enemy } from './main';
import type { ClassExtApi, ClassExtUnit, ClassRuntime, ClassFx, ClassFxApi, ClassFxKind, ClassSynthApi } from '../core/ClassExt';
import * as THREE from 'three';
import * as G from './gfx';
import { fx as vfxFx, live as vfxLive, sigil as vfxSigil, scorch as vfxScorch, whirlwind as vfxWhirl } from './vfx';
import { spawnLightning } from './effects';
import type { ResolvedSkill, SkillDef, Element } from '../core/types';
import { unitsInRadius, CombatUnit, applyFear } from '../core/Combat';
import { SkillResolver } from '../core/SkillResolver';
import { ComboTracker } from '../core/ComboTracker';
import { resMax, resGain, resSpend } from '../core/Resource';
import { res } from './reshud';
import { spawnRing } from './effects';
import { questDone, hasDark } from './classgear';
import { executeSkill } from './casting';
import { ICON_ALIAS, addIcons } from './icons';
import { CLASSES } from '../data/classes';

let CX!: Ctx;
let rt: ClassRuntime | null = null;
let cfx: ClassFx | null = null;   // v1.0.8 职业专属施法表现
const bound = new Set<ClassRuntime>();
const resolver = new SkillResolver(new ComboTracker());
let statusEl: HTMLElement | null = null;
let statusTxt = '';

const api: ClassExtApi = {
  now: () => CX.T,
  toast: (m, c) => CX.toast(m, c),
  player: () => CX.player as unknown as ClassExtUnit,
  playerObj: () => CX.player.rig?.root,
  target: () => (CX.target && CX.target.alive ? CX.target as unknown as ClassExtUnit : null),
  enemiesNear: (p, r) => (unitsInRadius(CX.world, p, r, 'player') as Enemy[]).filter(e => e.z === CX.zone && e.alive) as unknown as ClassExtUnit[],
  damage: (t, amt, el, crit = false) => (t.alive && amt > 0 ? CX.fx.dealDamage(t as unknown as CombatUnit, amt, el, CX.player, crit, false, false) : 0),
  heal: n => CX.fx.heal(CX.player, n),
  fire: (def: SkillDef) => {
    if (!CX.player.alive) return null;
    const s = resolver.resolve(def, CX.loadout.allModifiers(), CX.ctx(), false);
    CX.loadout.combo.record(s, CX.T);   // v1.2.28 职业自己放的技能（开棺等）也记入组合记录，供 recentCast 条件
    try { executeSkill(s); } catch (e) { console.error('职业技能出错', e); return null; }
    return s;
  },
  setMods: mods => { CX.loadout.classMods = mods; },
  refreshBar: () => { /* 技能栏每帧按 preview 重画名字，不需要额外处理 */ },
  res: () => ({ value: res.value, max: resMax(res) }),
  resAdd: n => resGain(res, n, CX.T),
  resSpend: n => { if (res.value < n - 1e-6) return false; resSpend(res, n); return true; },
  talentRank: id => CX.tree?.effRank(id) ?? 0,
  hasDark: id => hasDark(id),   // 11-05 DLC 40 级暗金武器（不眠棺挤棺等）
  questDone: id => questDone(id),
  weapons: () => { const e = CX.inventory.equipped; return { main: e.mainHand?.weaponType, off: e.offHand && e.offHand !== e.mainHand ? e.offHand.weaponType : undefined }; },
  ring: (p, r, c) => spawnRing(p as never, r, c, 0.5),
  playAnim: (n, sp = 1.4) => { (CX.player.rig?.anim as { play?: (a: string, s: number) => void } | undefined)?.play?.(n, sp); },
  level: () => CX.progression.level,
  unitKind: t => { const e = t as unknown as Enemy; return { kind: String(e.kind ?? ''), name: String(e.type?.name ?? ''), elite: !!(e.isBoss || e.type?.elite || e.type?.rare || e.type?.mini) }; },
  fireFrom: (def, at) => {
    if (!CX.player.alive || def.tags.includes('movement') || def.tags.includes('blink') || def.shape === 'dash') return null;
    const p = CX.player.pos, ox = p.x, oz = p.z;
    const s = resolver.resolve(def, CX.loadout.allModifiers(), CX.ctx(), false);
    p.x = at.x; p.z = at.z;
    CX.loadout.combo.record(s, CX.T);   // v1.2.28 职业自己放的技能（开棺等）也记入组合记录，供 recentCast 条件
    try { executeSkill(s); } catch (e) { console.error('职业技能出错', e); return null; } finally { p.x = ox; p.z = oz; }
    return s;
  },
  fear: (t, d, bv) => { const u = t as unknown as CombatUnit; return u.alive ? applyFear(u, CX.player, d, bv ?? 0.08) : false; },
  shield: (key, pc, d, cap) => { const m = CX.player.maxHp; CX.player.status.addShield(`cls:${key}`, m * pc, d, m * (cap ?? pc), CX.player); },
  zap: (a, b) => spawnLightning(new THREE.Vector3(a.x, 1.2, a.z), new THREE.Vector3(b.x, 1.0, b.z)),
  feared: t => (t as unknown as CombatUnit).status?.fearFrom !== undefined,
  slow: (t, percent, duration) => { const u = t as unknown as CombatUnit; if (u.alive && !u.ccImmune) u.status.add({ key: 'slow:clsext', kind: 'slow', remaining: duration, percent, source: CX.player }); },
};

/** 切职业（main.applyClass）：换运行时、重置状态 */
export function classExtReset() {
  if (CX?.loadout) CX.loadout.classMods = [];
  rt = CX?.cls?.ext?.runtime ?? null;
  cfx = CX?.cls?.ext?.fx ?? null;
  if (rt && !bound.has(rt)) { bound.add(rt); try { rt.bind?.(api); } catch (e) { console.error(e); } }
  try { rt?.reset?.(); } catch (e) { console.error(e); }
  setStatus('');
}
export function classExtUpdate(dt: number) {
  if (!rt) return;
  try { rt.update?.(dt); setStatus(rt.status?.() ?? ''); } catch (e) { console.error('职业运行时出错', e); rt = null; }
}
export const classExtKey = (k: string) => !!rt?.key?.(k);
export const classExtCanCast = (s: ResolvedSkill) => !rt?.canCast || rt.canCast(s);
export function classExtCast(s: ResolvedSkill) { rt?.onCast?.(s); }
export function classExtHits(s: ResolvedSkill, hits: Enemy[]): ResolvedSkill { return rt?.onHits ? rt.onHits(s, hits as unknown as ClassExtUnit[]) : s; }
export const classExtDebug = () => rt?.debug?.() ?? null;

// ---------------------------------------------------------------- v1.0.8：职业专属施法表现（core/ClassExt.ts ClassFx）
const synthApi: ClassSynthApi = {   // v1.0.9
  tone: o => { try { CX.audio.extTone(o); } catch { /* 音频不可用 */ } },
  noise: o => { try { CX.audio.extNoise(o); } catch { /* 音频不可用 */ } },
  gate: (k, g) => CX.audio.extGate(k, g),
};
export const classExtFxApi = (): ClassFxApi => fxApi;   // v1.1.1 内容包 PackCtx.fx 复用
const fxApi: ClassFxApi = {
  synth: synthApi,
  live: (o, dur, up) => vfxLive(o as THREE.Object3D, dur, up),
  fx: (k, p, o) => vfxFx(k, p, o as never),
  ring: (p, r, c, d = 0.5) => spawnRing(p as never, r, c, d),
  sigil: (p, r, c, d = 1.2) => vfxSigil(p, r, c, d),
  scorch: (p, r, c, d = 2.2) => vfxScorch(p, r, c, d),
  whirl: (r, c, d = 0.55) => vfxWhirl(() => CX.player.pos, r, c, d, true),
  lightning: (a, b) => spawnLightning(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)),
  feel: (k, n) => CX.feel.emit(k, n),
  sound: (k, el) => {
    const a = CX.audio as unknown as Record<string, (x?: string) => void>;
    const m = k === 'frost' ? 'frostNova' : k === 'bolt' ? 'castBolt' : k;
    if (typeof a[m] === 'function') a[m](el ?? 'physical');
  },
  anim: (n, sp = 1.5) => { (CX.player.rig?.anim as { play?: (a: string, s: number) => void } | undefined)?.play?.(n, sp); },
  me: () => CX.player.pos,
  facing: () => CX.player.rig?.root?.rotation.y ?? 0,
  gy: (x, z) => G.gy(x, z),
};
/** 本体 casting 每处画默认表现前调用：true = 职业自己画了，本体跳过默认表现 */
export function classExtFx(kind: ClassFxKind, s: ResolvedSkill, at: { x: number; z: number }, dir: { x: number; z: number } | null = null): boolean {
  if (!cfx?.cast) return false;
  try { return !!cfx.cast(kind, s, { x: at.x, z: at.z }, dir ? { x: dir.x, z: dir.z } : null, fxApi); } catch (e) { console.error('职业表现出错', e); return false; }
}
/** v1.0.9：职业专属施法音效；true = 职业自己出声了，本体跳过默认音效 */
export function classExtSfx(kind: ClassFxKind, s: ResolvedSkill): boolean {
  if (!cfx?.sfx) return false;
  try { return !!cfx.sfx(kind, s, synthApi); } catch (e) { console.error('职业音效出错', e); return false; }
}
export function classExtProjectile(s: ResolvedSkill, i: number): { obj: THREE.Object3D; spin: boolean } | null {
  if (!cfx?.projectile) return null;
  try { const r = cfx.projectile(s, i); return r && r.obj ? { obj: r.obj as THREE.Object3D, spin: !!r.spin } : null; } catch (e) { console.error('职业表现出错', e); return null; }
}
export function classExtTrail(s: ResolvedSkill, p: { x: number; y: number; z: number }): boolean {
  if (!cfx?.trail) return false;
  try { return !!cfx.trail(s, p, fxApi); } catch { return false; }
}
export function classExtDashTrail(s: ResolvedSkill, p: { x: number; y: number; z: number }): boolean {
  if (!cfx?.dashTrail) return false;
  try { return !!cfx.dashTrail(s, p, fxApi); } catch { return false; }
}
/** 测试用：当前职业有没有专属表现 */
export const classExtHasFx = () => !!cfx;

// v1.2.27 职业 HUD：独立面板（底部中间最上层：交互提示 [E] 在最下、内容包的条 / 按钮在中间、职业面板在最上），右侧「?」打开玩法说明（guide.first）
// v1.2.50 Rhett 10-26：状态条默认收成左下一个小按钮（短标签），鼠标移上 / 点按展开成整条说明，移开收回（不再盖住设置窗口）
const CLS_CSS = `#cls-status{position:fixed;left:calc(12px + var(--sal,0px));bottom:216px;z-index:30;display:flex;align-items:center;gap:8px;max-width:min(760px,94vw);padding:5px 8px 5px 12px;border:1px solid rgba(240,224,176,.28);border-radius:8px;background:rgba(10,8,6,.62);font:600 13px/1.45 sans-serif;color:#f0e0b0;text-shadow:0 1px 2px #000;pointer-events:none}
#cls-status .t{display:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#cls-status.open .t,#cls-status.full .t{display:block}#cls-status.open .s,#cls-status.full .s{display:none}
#cls-status .s{pointer-events:auto;cursor:pointer;white-space:nowrap}#cls-status{pointer-events:auto}
#cls-status .h{pointer-events:auto;flex:none;width:24px;height:24px;border-radius:50%;border:1px solid #f0e0b0;background:rgba(60,48,30,.85);color:#f0e0b0;font:bold 14px/1 sans-serif;cursor:pointer;touch-action:manipulation}
html.phone #cls-status{left:calc(8px + var(--sal,0px));bottom:calc(136px + var(--sab,0px));font-size:11px;max-width:62vw;padding:3px 6px 3px 8px}
#cls-help{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
#cls-help .box{width:min(560px,94vw);max-height:80vh;overflow:auto;padding:14px 18px;border:1px solid #8a7040;border-radius:10px;background:#1c160e;color:#eadcc0;font:13px/1.7 sans-serif}
#cls-help h3{margin:0 0 8px;color:#ffd890;font-size:16px}#cls-help ul{margin:0 0 10px 18px;padding:0}#cls-help button{padding:5px 18px}`;
export function openClassHelp() {
  if (typeof document === 'undefined') return;
  const f = CX?.cls?.ext?.guide?.first; if (!f) return;
  document.getElementById('cls-help')?.remove();
  const d = document.createElement('div'); d.id = 'cls-help';
  d.innerHTML = `<div class="box"><h3>${f.title}</h3><ul>${f.lines.map(l => `<li>${l}</li>`).join('')}</ul><div style="text-align:right"><button class="btn">知道了</button></div></div>`;
  d.addEventListener('click', e => { if (e.target === d || (e.target as HTMLElement).tagName === 'BUTTON') d.remove(); });
  document.body.appendChild(d);
}
function setStatus(t: string) {
  if (t === statusTxt || typeof document === 'undefined') return;
  statusTxt = t;
  if (!statusEl) {
    if (!t) return;
    if (!document.getElementById('cls-css')) { const st = document.createElement('style'); st.id = 'cls-css'; st.textContent = CLS_CSS; document.head.appendChild(st); }
    statusEl = document.createElement('div'); statusEl.id = 'cls-status';
    statusEl.innerHTML = '<span class="s"></span><span class="t"></span><button class="h" title="玩法说明">?</button>';
    statusEl.querySelector('.h')!.addEventListener('click', e => { e.stopPropagation(); openClassHelp(); });
    const el = statusEl;
    el.addEventListener('mouseenter', () => el.classList.add('open'));
    el.addEventListener('mouseleave', () => el.classList.remove('open'));
    el.addEventListener('click', e => { if ((e.target as HTMLElement).classList.contains('h')) return; e.stopPropagation(); el.classList.toggle('open'); });
    document.addEventListener('pointerdown', e => { if (!el.contains(e.target as Node)) el.classList.remove('open'); });   // 手机：点空白收起
    document.body.appendChild(statusEl);
  }
  (statusEl.querySelector('.t') as HTMLElement).innerHTML = t;
  // 短标签：状态行开头的【…】段（如形态）+「说明」；没有就显示「职业状态」
  const m = /^(<span[^>]*>)?【[^】]{1,8}】(<\/span>)?/.exec(t);
  (statusEl.querySelector('.s') as HTMLElement).innerHTML = m ? `${m[0]} <span style="opacity:.75">说明 ▸</span>` : '';
  statusEl.classList.toggle('full', !m);   // 没有【…】段的职业（层数 / 冷却等战斗信息）保持整条常显
  (statusEl.querySelector('.h') as HTMLElement).style.display = CX?.cls?.ext?.guide?.first ? '' : 'none';
  statusEl.style.display = t ? '' : 'none';
}

export function bindClassExt(ctx: Ctx) {
  CX = ctx;
  // 图标别名（内容包职业的技能 / 底材借用本体图标）
  for (const c of Object.values(CLASSES)) for (const [k, v] of Object.entries(c.ext?.icons ?? {})) if (!(k in ICON_ALIAS)) ICON_ALIAS[k] = v;
  // v1.0.8 职业自带图标（data URL）：登记进图标表，优先于别名
  for (const c of Object.values(CLASSES)) if (c.ext?.art) addIcons(c.ext.art);
  const prevD = CX.fx.onDealt;
  CX.fx.onDealt = (t, dealt, el, src, crit, tick) => { prevD?.(t, dealt, el, src, crit, tick); if (rt?.onDealt && src === CX.player && t !== CX.player) rt.onDealt(t as unknown as ClassExtUnit, dealt, el as Element, crit, tick); };
  const prevP = CX.fx.preDeal;
  CX.fx.preDeal = (t, amt, el, src, crit, tick) => {
    const a = prevP ? prevP(t, amt, el, src, crit, tick) : amt;
    if (!rt?.preDeal) return a;
    if (t === CX.player) return rt.preDeal(t as unknown as ClassExtUnit, a, el, true, tick);
    if (src === CX.player) return rt.preDeal(t as unknown as ClassExtUnit, a, el, false, tick, crit);
    return a;
  };
}
