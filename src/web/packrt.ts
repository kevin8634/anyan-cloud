// ========== v1.1.1 内容包战斗运行时：全局倍率 / 易伤 / 范围打击 / 战斗事件 ==========
// 没有内容包时 bindPackRt 直接返回，本体结算链不变。本文件只放通用词。
import type { Ctx, Enemy } from './main';
import type { PackStrike, PackStrikeResult } from '../core/ContentPacks';
import { packs, packMul, emitPackEvent, packHitGuard } from '../core/ContentPacks';
import { unitsInRadius, CombatUnit } from '../core/Combat';

let CX!: Ctx;
const vuln = new WeakMap<object, { k: number; until: number }>();
let on = false;

export function bindPackRt(c: Ctx) {
  CX = c;
  if (!packs().length) return;
  on = true;
  const prevP = CX.fx.preDeal;
  CX.fx.preDeal = (t, amt, el, src, crit, tick) => {
    let a = prevP ? prevP(t, amt, el, src, crit, tick) : amt;
    if (a <= 0) return a;
    if (t === CX.player) {
      const hg = packHitGuard(), se = src as Enemy | null;   // raidA A7：包的命中过滤（高处够不着）
      if (hg && se && se !== (CX.player as unknown) && se.pos) { try { if (hg({ x: se.pos.x, y: se.pos.y, z: se.pos.z, boss: !!(se.isBoss || se.pboss || se.wb) }) === false) return 0; } catch { /* 包出错不影响结算 */ } }
      a *= packMul('taken');
      if ((src as Enemy | null)?.isBoss) a *= packMul('takenBoss');
    } else if (src === CX.player) {
      a *= packMul('dealt');
      const v = vuln.get(t); if (v && v.until > CX.T) a *= 1 + v.k;
    }
    return a;
  };
  const prevD = CX.fx.onDealt;
  CX.fx.onDealt = (t, dealt, el, src, crit, tick) => { prevD?.(t, dealt, el, src, crit, tick); if (t === CX.player && dealt > 0) emitPackEvent({ type: 'hurt', amount: dealt }); else if (src === CX.player && dealt > 0) emitPackEvent({ type: 'deal', amount: dealt, boss: !!(t as unknown as Enemy).isBoss }); };
}
/** 是否有易伤（测试 / 表现用） */
export const packVuln = (t: object) => { const v = vuln.get(t); return v && v.until > CX.T ? v.k : 0; };

/** 以玩家为中心的范围打击 */
export function packStrike(o: PackStrike): PackStrikeResult {
  if (!CX?.player?.alive) return { hits: 0, interrupted: 0, killed: 0, elites: 0, bosses: 0 };
  const p = o.at ? { x: o.at.x, y: 0, z: o.at.z } : CX.player.getPos();   // v1.2.15 at：打击中心
  let list = (unitsInRadius(CX.world, p, Math.max(0.5, o.r), 'player') as Enemy[]).filter(e => e.z === CX.zone && e.alive);
  if (o.maxHpFrac !== undefined) list = list.filter(e => e.hp <= e.maxHp * o.maxHpFrac! + 1e-6);   // v1.1.2 低血过滤
  if (o.max !== undefined) list = list.map(e => [e, Math.hypot(e.pos.x - p.x, e.pos.z - p.z)] as const).sort((a, b) => a[1] - b[1]).slice(0, Math.max(0, o.max)).map(a => a[0]);
  const base = CX.loadout.preview('basic', CX.ctx())?.stats.damage ?? 50;
  let hits = 0, interrupted = 0, killed = 0, elites = 0, bosses = 0;
  for (const e of list) {
    const u = e as unknown as CombatUnit;
    hits++;
    if (e.isBoss) bosses++; else if (e.type?.elite || e.type?.rare || e.type?.mini) elites++;
    if (o.interrupt || o.stun) { if (u.onInterrupt?.()) interrupted++; }
    if (o.stun && !u.ccImmune) u.status.add({ key: 'stun', kind: 'stun', remaining: o.stun, source: CX.player as unknown as CombatUnit });
    if (o.vuln && o.vuln > 0) vuln.set(u, { k: o.vuln, until: CX.T + (o.vulnDur ?? 6) });
    if (o.execute && !e.isBoss) CX.fx.dealDamage(u, e.hp + e.maxHp, o.el ?? 'arcane', CX.player as unknown as CombatUnit, false, false, false);
    else if (o.dmgK > 0) CX.fx.dealDamage(u, base * o.dmgK, o.el ?? 'arcane', CX.player as unknown as CombatUnit, false, false, false);
    if (!e.alive) killed++;
  }
  return { hits, interrupted, killed, elites, bosses };
}
/** 击杀经验 / 金币倍率（没有包 = 原值，不取整） */
export const packXp = (n: number) => { if (!on) return n; const m = packMul('xp'); return m === 1 ? n : Math.round(n * m); };
export const packGold = (n: number) => { if (!on) return n; const m = packMul('gold'); return m === 1 ? n : Math.round(n * m); };
export const packEvent = (ev: Parameters<typeof emitPackEvent>[0]) => { if (on) emitPackEvent(ev); };
