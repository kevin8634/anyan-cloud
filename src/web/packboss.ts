// ========== v1.1.0 内容包首领：PackCtx.spawnBoss / bossState / removeBoss ==========
// 和世界首领同一套 BossBrain 表现（worldboss.ts makeBossBrain：红圈 / 读条 / 召唤 / 毒池 / 阶段喊话），首领框走 hudbar（packBossHud）。
// 没有内容包时这里的函数一次都不会被调用（只由 PackCtx 触发），本体行为不变。本文件只放通用词。
import * as THREE from 'three';
import type { Ctx, Enemy } from './main';
import type { PackBossDef } from '../core/ContentPacks';
import type { BossIntent } from '../core/BossBrain';
import { ENEMY_TYPES, wildModel } from './enemy_types';
import { makeBossBrain, bossSay } from './worldboss';
import * as BFX from './bossfx';
import type { WildMob } from '../data/zones_wild';

let CX!: Ctx;
export function bindPackBoss(c: Ctx) { CX = c; }

const defs = new Map<string, PackBossDef>();
const reg = (k: string, d: Record<string, unknown> & { name: string; model: string }) => {
  const m = { hp: 1000, dmg: 50, interval: 2, speed: 3, aggro: 10, range: 2.5, xp: 100, ilvl: 80, level: 40, ...d } as unknown as WildMob;
  ENEMY_TYPES[k] = { name: m.name, hp: m.hp, dmg: m.dmg, interval: m.interval, speed: m.speed, aggro: m.aggro, range: m.range, xp: m.xp, ilvl: m.ilvl, model: wildModel(m),
    ranged: m.ranged, onHitDot: m.onHitDot, patrol: 0, level: m.level, elite: m.elite, leash: m.leash, shot: m.shot };
};
const find = (key: string) => CX?.enemies.find(e => e.pboss === key) ?? null;
const brainDef = (d: PackBossDef) => ({ name: d.mob.name, theme: d.theme ?? 'stone', boss: d.boss, adds: d.adds ?? {} });

export function packBossSpawn(d: PackBossDef): boolean {
  if (!CX || !d?.key) return false;
  defs.set(d.key, d);
  const old = find(d.key);
  if (old) {
    if (old.alive) return true;
    CX.respawnEnemy(old);   // 回满血、复位；rebrain 换新大脑
  } else {
    reg(d.key, { elite: true, ...d.mob });
    for (const [k, a] of Object.entries(d.adds ?? {})) reg(k, a);
    const e = new CX.Enemy(d.key, ENEMY_TYPES[d.key], new THREE.Vector3(d.x, 0, d.z), d.map as never, '', 1e9, d.mob.loot ?? 'elite_ember');
    e.pboss = d.key; e.ccImmune = true;
    (e as unknown as { pbRespawn?: number }).pbRespawn = d.respawn;   // v1.2.39b 地图倒计时
    e.rebrain = () => makeBossBrain(e, brainDef(d));
    e.brain = makeBossBrain(e, brainDef(d));
    e.pos.y = CX.groundAt(d.x, d.z);
    CX.enemies.push(e);
  }
  const e = find(d.key)!;
  if (CX.zone === e.z) {
    if (d.yells?.spawn) CX.yell(d.yells.spawn, '#ff8000', 3.5);   // v1.2.48 登场配音在首次开打时播（worldboss.ts makeBrain.onEngage）
    BFX.bossEntrance(e.getPos(), d.theme ?? 'stone', e.rig.scale);
  }
  return true;
}
/** raidA A5：首领位置 / 血量 / 读条 / 阶段（给内容包做场地机制） */
export function packBossInfo(key: string): { x: number; z: number; hp: number; max: number; cast: string | null; castP: number; phase: number } | null {
  const e = find(key); if (!e || !e.alive) return null;
  const it = e.intent as { casting?: { name: string; progress: number } | null; phaseIndex?: number } | null;
  return { x: e.pos.x, z: e.pos.z, hp: e.hp, max: e.maxHp, cast: it?.casting?.name ?? null, castP: it?.casting?.progress ?? 0, phase: it?.phaseIndex ?? 0 };
}
export function packBossState(key: string): 'none' | 'alive' | 'dead' {
  const e = find(key); return !e ? 'none' : e.alive ? 'alive' : 'dead';
}
export function packBossRemove(key: string) {
  if (!CX) return;
  for (let i = CX.enemies.length - 1; i >= 0; i--) {
    const e = CX.enemies[i];
    if (e.pboss !== key) continue;
    e.dispose(); CX.enemies.splice(i, 1); if (CX.target === e) CX.target = null;
  }
}
/** combatev.onUnitDeath 里调用（通用掉落之后） */
export function packBossOnDeath(e: Enemy) {
  const d = e.pboss ? defs.get(e.pboss) : null; if (!d) return;
  if (e.z === CX.zone && bossSay(d.key, 'death', d.mob.name, '#ffd34d')) { if (d.yells?.death) CX.toast(d.yells.death, '#ffe08a'); }   // v1.2.48 配音
  else if (d.yells?.death) CX.yell(d.yells.death, '#ffd34d', 4);
  BFX.bossDeath(e.getPos(), d.theme ?? 'stone', e.rig.scale);
  for (const a of CX.enemies) if (a.wbAdd && a.alive && a.z === e.z && a.pos.distanceTo(e.pos) < 40) { a.hp = 0; a.deadAt = CX.T; }   // 召唤物跟着散（尸体由 wbUpdate 清）
  try { d.onDeath?.(); } catch (err) { console.error('内容包首领 onDeath 出错', err); }
  CX.save();
}
/** 首领框（hudbar：世界首领之后） */
export function packBossHud(): { boss: Enemy; phase: string; ticks?: number[] } | null {
  if (!CX || !defs.size) return null;
  for (const e of CX.enemies) {
    if (!e.pboss || !e.alive || e.z !== CX.zone) continue;
    const bi = e.intent as BossIntent | null;
    if (!bi || (bi.state !== 'chase' && bi.state !== 'attack')) continue;
    const ph = defs.get(e.pboss)!.boss.phases;
    return { boss: e, phase: ph[bi.phaseIndex]?.name ?? '', ticks: ph.slice(1).map(x => x.hpBelow) };
  }
  return null;
}
