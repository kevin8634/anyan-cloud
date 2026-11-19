// v0.7.5：职业资源（core/Resource.ts）的浏览器层——施法挂钩 + HUD
// HUD：离散资源（奥能充能 / 连击点）= 角色头顶光点；连续资源（怒气 / 反应热度）= 角色脚边弧形条；
// 手机：大招键外圈的环。战斗中显示，脱战且资源为 0 时淡出。满层时发光 + 提示音，强化技能图标金框。
import * as THREE from 'three';
import type { Ctx } from './main';
import { SlotId, ResolvedSkill } from '../core/types';
import { ResState, newRes, resMax, resThr, resDef, resTick, resOnHit, resOnHurt, resOnReaction, resOnCast, resEmpower, resSpend, resFreeUlt } from '../core/Resource';

let CX!: Ctx;
export let res: ResState = newRes('warrior');
let hud: HTMLDivElement | null = null, dots: HTMLDivElement | null = null, arcFg: SVGPathElement | null = null, arcSvg: SVGSVGElement | null = null, ring: HTMLDivElement | null = null;
let wasFull = false;
const v = new THREE.Vector3();
const ARC_R = 46, ARC_SPAN = 120;   // 弧形条半径（像素）、张角（度）

export function resReset(clsId: string) { const b = res?.bonus; res = newRes(clsId); if (b) res.bonus = { ...b }; wasFull = false; buildHud(); }
/** v0.7.6 英灵传承：设置资源加成（上限变了就重建光点） */
export function resSetBonus(b: ResState['bonus']) { const m0 = resMax(res); res.bonus = { ...b }; if (resMax(res) !== m0) { res.value = Math.min(res.value, resMax(res)); buildHud(); } }

/** 施法前：决定这次是否强化（把修饰器临时挂到 loadout 上）。返回强化信息，施法后交给 resAfterCast */
let pendingEmp: { cost: number; label: string; free?: boolean } | null = null;
/** 最近一次施法的槽位（命中加怒气用：普攻 +8，技能 +4） */
export let lastSlot: SlotId = 'basic';
let empT = 0;
export function resBeforeCast(slot: SlotId, pre: ResolvedSkill) {
  pendingEmp = null; lastSlot = slot;
  if (slot === 'ultimate' && resFreeUlt(res) && CX.loadout.cooldownLeft(slot, CX.T) > 0) { CX.loadout.resetCooldown(slot); pendingEmp = { cost: resMax(res), label: '怒气满：大招无视冷却', free: true }; }
  const e = resEmpower(res, slot, pre.tags);
  CX.loadout.resMods = e?.mods ?? [];
  if (e) pendingEmp = { cost: (pendingEmp?.cost ?? 0) + e.cost, label: e.label };
}
/** 施法后：成功就扣资源，再按这次施法攒资源（法师元素轮换） */
export function resAfterCast(slot: SlotId, cast: ResolvedSkill | null) {
  CX.loadout.resMods = [];
  if (!cast) { pendingEmp = null; return; }
  if (pendingEmp) { resSpend(res, pendingEmp.cost); if (pendingEmp.free) res.stats.freeUlts++; }
  pendingEmp = null;
  resOnCast(res, slot, cast.element, CX.T);
}
/** 预览：技能图标金框（下一次施法会被强化） */
export function resWouldEmpower(slot: SlotId, pre?: ResolvedSkill) {
  if (slot === 'ultimate' && resFreeUlt(res)) return true;
  return !!resEmpower(res, slot, pre?.tags ?? []);
}
export function resHit(targetId: string, slot: SlotId = lastSlot) { resOnHit(res, slot, targetId, CX.T); }
export function resHurt(amount: number) { resOnHurt(res, amount, CX.player.maxHp, CX.T); }
export function resReaction() { resOnReaction(res, CX.T); }

function buildHud() {
  if (typeof document === 'undefined') return;
  hud?.remove(); ring?.remove();
  const d = resDef(res);
  hud = document.createElement('div'); hud.id = 'res-hud';
  hud.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:6;transition:opacity .4s;opacity:0';
  dots = document.createElement('div'); dots.className = 'res-dots';
  dots.style.cssText = 'position:fixed;display:flex;gap:5px;transform:translate(-50%,-100%)';
  if (d.show === 'dots') for (let i = 0; i < resMax(res); i++) { const p = document.createElement('i'); p.style.cssText = `width:10px;height:10px;border-radius:50%;border:1.5px solid ${d.color};background:transparent;box-shadow:0 0 4px #000;transition:all .15s`; dots.appendChild(p); }
  hud.appendChild(dots);
  const NS = 'http://www.w3.org/2000/svg';
  arcSvg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  arcSvg.setAttribute('width', String(ARC_R * 2 + 12)); arcSvg.setAttribute('height', String(ARC_R + 16));
  arcSvg.style.cssText = 'position:fixed;transform:translate(-50%,-30%);overflow:visible';
  const bg = document.createElementNS(NS, 'path') as SVGPathElement;
  arcFg = document.createElementNS(NS, 'path') as SVGPathElement;
  const path = arcPath(1);
  bg.setAttribute('d', path); bg.setAttribute('stroke', 'rgba(0,0,0,.55)'); bg.setAttribute('stroke-width', '7'); bg.setAttribute('fill', 'none'); bg.setAttribute('stroke-linecap', 'round');
  arcFg.setAttribute('stroke', d.color); arcFg.setAttribute('stroke-width', '4.5'); arcFg.setAttribute('fill', 'none'); arcFg.setAttribute('stroke-linecap', 'round');
  arcSvg.append(bg, arcFg);
  if (d.show === 'arc') hud.appendChild(arcSvg);
  document.body.appendChild(hud);
  // 手机：大招键外圈
  const ult = document.getElementById('sk-ultimate');
  if (ult) { ring = document.createElement('div'); ring.className = 'res-ring'; ring.style.cssText = 'position:absolute;inset:-6px;border-radius:50%;pointer-events:none;display:none'; ult.appendChild(ring); }
}
/** 下半圆的一段弧：t = 0~1 填充比例（从左往右） */
function arcPath(t: number) {
  const cx = ARC_R + 6, cy = 6, a0 = (90 + ARC_SPAN / 2) * Math.PI / 180, a1 = a0 - ARC_SPAN * Math.max(0.001, t) * Math.PI / 180;
  const p = (a: number) => `${(cx + ARC_R * Math.cos(a)).toFixed(1)} ${(cy + ARC_R * Math.sin(a)).toFixed(1)}`;
  return `M ${p(a0)} A ${ARC_R} ${ARC_R} 0 0 0 ${p(a1)}`;
}

export function updateResHud(dt: number) {
  if (!CX?.player) return;
  resTick(res, dt, CX.T);
  if (!hud || !CX.started) { if (hud) hud.style.opacity = '0'; return; }
  const d = resDef(res), mx = resMax(res), t = res.value / mx;
  const full = d.kind === 'combo' ? res.value >= mx : res.value >= resThr(res) - 1e-6;
  const show = res.value > 0.01 || CX.T - res.lastGain < 3;
  hud.style.opacity = show ? '1' : '0';
  const W = window.innerWidth, H = window.innerHeight, sc = CX.player.rig?.scale ?? 1;
  // 头顶
  v.set(CX.player.pos.x, CX.player.pos.y + 2.35 * sc, CX.player.pos.z).project(CX.camera);
  if (dots) {
    dots.style.left = `${(v.x + 1) / 2 * W}px`; dots.style.top = `${(1 - v.y) / 2 * H}px`;
    Array.from(dots.children).forEach((c, i) => { const on = i < Math.floor(res.value + 1e-6); (c as HTMLElement).style.background = on ? (full ? d.full : d.color) : 'transparent'; (c as HTMLElement).style.boxShadow = on && full ? `0 0 8px ${d.color}` : '0 0 4px #000'; });
  }
  // 脚边
  v.set(CX.player.pos.x, CX.player.pos.y + 0.05, CX.player.pos.z).project(CX.camera);
  if (arcSvg && arcFg) {
    arcSvg.style.left = `${(v.x + 1) / 2 * W}px`; arcSvg.style.top = `${(1 - v.y) / 2 * H}px`;
    arcFg.setAttribute('d', arcPath(t)); arcFg.setAttribute('stroke', full ? d.full : d.color);
    arcFg.style.filter = full ? `drop-shadow(0 0 4px ${d.color})` : '';
    arcFg.setAttribute('opacity', res.value > 0.01 ? '1' : '0');
  }
  // 手机环
  if (ring) {
    ring.style.display = CX.isMobile ? 'block' : 'none';
    if (CX.isMobile) ring.style.background = `conic-gradient(${full ? d.full : d.color} ${Math.round(t * 360)}deg, rgba(0,0,0,.35) 0)`, ring.style.webkitMask = ring.style.mask = 'radial-gradient(circle, transparent 62%, #000 64%)';
  }
  // 满层提示
  if (full && !wasFull) { CX.audio.heal(); const mats = (CX.player.rig?.flash ?? []) as { emissive: THREE.Color; userData: { baseEmissive?: number } }[]; mats.forEach(m => m.emissive.setHex(0x553300)); setTimeout(() => mats.forEach(m => m.emissive.setHex(m.userData.baseEmissive ?? 0)), 160); }
  wasFull = full;
  // 强化技能金框（每 0.2 秒刷新一次）
  if ((empT += dt) < 0.2) return;
  empT = 0;
  for (const sl of ['skill1', 'skill2', 'skill3', 'ultimate'] as SlotId[]) {
    const el = document.getElementById(`sk-${sl}`);
    if (el) el.classList.toggle('res-emp', resWouldEmpower(sl, CX.loadout.preview(sl, { now: CX.T, casterHpPercent: 1, targetEffects: [] })));
  }
}

export function bindResHud(ctx: Ctx) { CX = ctx; }
/** 测试用 */
export const resDebug = () => ({ kind: res.kind, value: res.value, castSeq: res.castSeq, stats: { ...res.stats }, hud: !!hud, opacity: hud?.style.opacity, dots: dots?.children.length ?? 0, arc: !!arcSvg?.isConnected, ring: !!ring });
