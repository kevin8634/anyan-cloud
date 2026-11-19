// ========== v0.9.3f 野外：动态事件扩展 / 区域声望 / 轻量天气 ==========
// 方案：docs/设计/野外地图.md 第 5 节 5~7
//   动态事件：每张野外图 2 个轮换（护送商队 / 守卫营地 / 遗迹封印），进图 4 分钟后第一次出现，之后每 9 分钟；提前 30 秒预告；出现后玩家走到 45 米内才开始
//     护送：商队车沿主路走（玩家在 14 米内才走、有伏兵活着时停下），走到 30% / 65% 遭伏击；车被围攻会掉耐久，耐久归零或超时失败
//     守卫：营地 / 村口立起战旗，3 波怪从 16 米外冲过来，旗子附近的怪会砍旗；守住 3 波成功
//     封印：遗迹周围 3 块封印石，站在石头旁 4 秒完成封印（开始封印时冒出守卫），3 块都封上成功
//   区域声望：翠风 / 星落 / 赤砂 / 霜脊 / 烬落 各自独立；任务 +60（悬赏 +30）、动态事件 / 世界事件 +120、世界首领 +100、精英 +25、稀有 +15、登塔 +40、开箱 +10
//     中立 0 → 友善 300 → 尊敬 900 → 崇敬 2000 → 崇拜 4000；补给商「声望」页用金币兑换（按周限购）
//   天气：赤砂沙暴 / 霜脊暴风雪 / 烬落灰烬雨，6 分钟平静 + 2 分钟风暴循环；风暴时粒子加满、雾拉近，只做粒子 + 调色，不改光照
import * as THREE from 'three';
import type { Ctx } from './main';
import type { Enemy } from './main';
import * as M from './models';
import { flagWireOn, upgradeFlags } from './field_flags';
import { ENEMY_TYPES } from './enemy_types';
import { WILD, isWildId, WildId } from '../data/zones_wild';
import { FIELD_ORIGIN } from '../data/zone_field';
import { WORLD_BOSSES, WB_IDS } from '../data/world_bosses';
import type { LootTable } from '../core/Loot';

let CX!: Ctx;
export type RepMap = 'field' | 'star' | 'redsand' | 'frost' | 'ember';
export const REP_MAPS: RepMap[] = ['field', 'star', 'redsand', 'frost', 'ember'];
export const isRepMap = (m: string): m is RepMap => (REP_MAPS as string[]).includes(m);
const origin = (m: RepMap) => m === 'field' ? FIELD_ORIGIN : WILD[m].origin;
const mapName = (m: RepMap) => m === 'field' ? '翠风原野' : WILD[m].name;
const levelOf = (m: RepMap) => m === 'field' ? 16 : WILD[m].levels[1];

// ======================================================================  区域声望
export const REP_TIERS = [{ name: '中立', at: 0 }, { name: '友善', at: 300 }, { name: '尊敬', at: 900 }, { name: '崇敬', at: 2000 }, { name: '崇拜', at: 4000 }] as const;
export const REP_GAIN = { quest: 60, bounty: 30, event: 120, worldboss: 100, elite: 25, rare: 15, tower: 40, chest: 10 } as const;
export interface RepSave { pts: Record<string, number>; buys: Record<string, { w: string; n: number }>; once: string[] }
const rep: RepSave = { pts: {}, buys: {}, once: [] };
export const repClock = { now: () => Date.now() };
function weekKey(t = repClock.now()) { const d = new Date(t); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export function repSave(): RepSave { return { pts: { ...rep.pts }, buys: JSON.parse(JSON.stringify(rep.buys)), once: [...rep.once] }; }
export function repLoad(s?: Partial<RepSave>) { rep.pts = { ...(s?.pts ?? {}) }; rep.buys = JSON.parse(JSON.stringify(s?.buys ?? {})); rep.once = [...(s?.once ?? [])]; }
export const repPts = (m: string) => rep.pts[m] ?? 0;
export function repTier(m: string) { const p = repPts(m); let i = 0; REP_TIERS.forEach((t, k) => { if (p >= t.at) i = k; }); return i; }
export function repAdd(m: string, n: number, why = '') {
  if (!isRepMap(m) || n <= 0) return;
  const before = repTier(m);
  rep.pts[m] = repPts(m) + n;
  CX.toast(`${mapName(m)}声望 +${n}${why ? `（${why}）` : ''}`, '#9ad0ff');
  const after = repTier(m);
  if (after > before) { CX.yell(`${mapName(m)}的人们现在视你为「${REP_TIERS[after].name}」！`, '#9ad0ff', 4); CX.audio.questAccept(); }
}
/** 任务交付（main.completeQuest）：发任务的 NPC 在哪张图，就加哪张图的声望 */
export function repOnQuest(giverMap: string | undefined, repeatable: boolean) { if (giverMap) repAdd(giverMap, repeatable ? REP_GAIN.bounty : REP_GAIN.quest, '任务'); }
/** 击杀（combatev）：精英 / 稀有 / 世界首领 */
export function repOnKill(e: Enemy) {
  if (!isRepMap(e.z)) return;
  if (e.wb) repAdd(e.z, REP_GAIN.worldboss, '世界首领');
  else if (e.type.elite && !e.type.mini) repAdd(e.z, REP_GAIN.elite, '精英');
  else if (e.type.rare) repAdd(e.z, REP_GAIN.rare, '稀有');
}

/** 兑换品：tier = 需要的声望档；limit = 每周限购（0 = 不限），once = 一次性 */
export interface RepOffer { id: string; name: string; desc: string; tier: number; price: number; limit: number; once?: boolean }
export function repOffers(m: RepMap): RepOffer[] {
  const wb = WB_IDS.map(id => WORLD_BOSSES[id]).find(d => d.map === m);
  return [
    { id: `${m}:pack`, name: `${mapName(m)}补给包`, desc: '小治疗药水 ×5', tier: 1, price: 60, limit: 0 },
    wb ? { id: `${m}:soul`, name: `${wb.name.split(' · ')[1]}的精魄`, desc: `首领精魄 ×1（满 10 个凝成专属橙装）`, tier: 2, price: 220, limit: 3 }
      : { id: `${m}:essence`, name: '原野精华', desc: '强化精华 ×2', tier: 2, price: 180, limit: 3 },
    { id: `${m}:jewel`, name: `${mapName(m)}纪念首饰`, desc: `史诗项链 / 戒指 / 饰品（装等 ${levelOf(m) + 2}）`, tier: 3, price: 600, limit: 1 },
    { id: `${m}:legend`, name: `${mapName(m)}的馈赠`, desc: `传说装备一件（装等 ${levelOf(m) + 4}，一次性）`, tier: 4, price: 1500, limit: 0, once: true },
  ];
}
export function repWhyNot(m: RepMap, o: RepOffer): string | null {
  if (repTier(m) < o.tier) return `需要「${REP_TIERS[o.tier].name}」`;
  if (o.once && rep.once.includes(o.id)) return '已兑换';
  const b = rep.buys[o.id]; if (o.limit && b && b.w === weekKey() && b.n >= o.limit) return '本周已兑完';
  if (CX.inventory.gold < o.price) return '金币不足';
  return null;
}
export function repBuy(m: RepMap, id: string): boolean {
  const o = repOffers(m).find(x => x.id === id); if (!o || repWhyNot(m, o)) return false;
  if (!CX.inventory.spendGold(o.price)) return false;
  if (o.limit) { const b = rep.buys[o.id]; rep.buys[o.id] = b && b.w === weekKey() ? { w: b.w, n: b.n + 1 } : { w: weekKey(), n: 1 }; }
  if (o.once) rep.once.push(o.id);
  const kind = id.split(':')[1];
  if (kind === 'pack') CX.inventory.addStack('potion_s', 5);
  else if (kind === 'essence') CX.inventory.addStack('mat_essence', 2);
  else if (kind === 'soul') { const d = WB_IDS.map(x => WORLD_BOSSES[x]).find(x => x.map === m)!; CX.inventory.addStack(d.soul, 1); CX.wbSoulCheck(d.id, CX.player.pos); }
  else {
    const it = kind === 'jewel' ? CX.gen.generate(levelOf(m) + 2, 'purple', ['neck', 'ring', 'trinket']) : CX.gen.generate(levelOf(m) + 4, 'orange');
    if (!CX.inventory.add(it)) CX.spawnLoot(it, CX.player.pos, 0, 1);
    CX.toast(`获得 [${it.name}]`, '#ff8000');
  }
  CX.audio.coin(); CX.save();
  return true;
}
export function repBuyCount(id: string) { const b = rep.buys[id]; return b && b.w === weekKey() ? b.n : 0; }
export const repState = rep;

// ======================================================================  动态事件
export type DynKind = 'escort' | 'defend' | 'seal';
export interface DynDef { id: string; kind: DynKind; name: string; route?: [number, number][]; at: [number, number]; kinds: string[] }
const innerKinds = (m: WildId) => [...new Set(WILD[m].packs.filter(p => !p.gen && !p.hot).flatMap(p => p.kinds))].filter(k => !WILD[m].mobs[k]?.elite && !WILD[m].mobs[k]?.rare);
const mainRoad = (m: WildId): [number, number][] => WILD[m].paths[0].filter(p => p[1] <= 42 && p[1] >= -32) as [number, number][];
const spotXZ = (m: WildId, k: string): [number, number] => [WILD[m].spots[k].x, WILD[m].spots[k].z];
const campXZ = (m: WildId): [number, number] => { const c = WILD[m].camps.find(x => x.main)!; return [c.x, c.z - 18]; };
export function dynDefs(m: RepMap): DynDef[] {
  if (m === 'field') return [
    { id: 'field_escort', kind: 'escort', name: '护送商队过桥', route: [[0, 38], [0, 17.5], [0, 6.5], [0, -6], [30, -2], [50, 2], [62, 4]], at: [0, 38], kinds: ['raider', 'archer', 'raider'] },
    { id: 'field_defend', kind: 'defend', name: '守卫麦穗村', at: [80, 38], kinds: ['raider', 'archer', 'boar'] },
  ];
  const k = innerKinds(m);
  const ruin: Record<string, string> = { star: 'observatory_altar', redsand: 'red_ruins_altar', frost: 'ice_spire_top', ember: 'cult_altar_core' };
  const names: Record<string, [string, string]> = { star: ['护送观星车', '封印观星台'], redsand: ['护送驼队', '封印赤岩祭坛'], frost: ['护送补给雪橇', '封印冰晶尖塔'], ember: ['守卫烬火堡垒', '封印教团祭坛'] };
  const first: DynDef = m === 'ember' ? { id: `${m}_defend`, kind: 'defend', name: names[m][0], at: campXZ(m), kinds: k }
    : { id: `${m}_escort`, kind: 'escort', name: names[m][0], route: mainRoad(m), at: mainRoad(m)[0], kinds: k };
  return [first, { id: `${m}_seal`, kind: 'seal', name: names[m][1], at: spotXZ(m, ruin[m]), kinds: k }];
}
export const DYN = { near: 45, first: 240, every: 540, warn: 30, escortT: 300, defendT: 200, sealT: 180, waves: 3, sealSec: 4 } as const;
const DYN_LOOT: LootTable = { id: 'dyn_event', gold: [0, 0], entries: [{ kind: 'random', chance: 1, minQuality: 'blue' }, { kind: 'random', chance: 0.35, minQuality: 'purple' }], stacks: [{ id: 'mat_shard', chance: 1, min: 1, max: 2 }] };

interface DynRun { def: DynDef; map: RepMap; endAt: number; mobs: Enemy[]; hp: number; obj: THREE.Object3D[]; step: number; prog: number; wave: number; seals: boolean[]; sealT: number[]; ambush: number }
interface DynMap { next: number; idx: number; run: DynRun | null }
const dyn: Record<string, DynMap> = {};
const dm = (m: RepMap) => dyn[m] ??= { next: DYN.first, idx: 0, run: null };
const W = (m: RepMap, x: number, z: number) => { const o = origin(m); return new THREE.Vector3(o.x + x, CX.groundAt(o.x + x, o.z + z), o.z + z); };

function spawn(r: DynRun, k: string, p: THREE.Vector3) {
  const type = ENEMY_TYPES[k]; if (!type) return;
  const e = new CX.Enemy(k, type, new THREE.Vector3(p.x, 0, p.z), r.map, 'event', 0, r.map === 'field' ? 'trash_field' : `trash_${r.map}`);
  e.brain.provoke?.(); CX.enemies.push(e); r.mobs.push(e);
  CX.particles.emit({ x: p.x, y: 0.3, z: p.z }, { count: 18, color: 0xc0a0ff, color2: 0xffffff, speed: 2, up: 2, life: 0.6, size: 0.3 });
}
function ring(r: DynRun, cx: number, cz: number, n: number, rad: number) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, f = CX.navFor(r.map).nearestFree(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, 6); if (f) spawn(r, r.def.kinds[i % r.def.kinds.length], new THREE.Vector3(f.x, 0, f.z)); }
}
const aliveMobs = (r: DynRun) => r.mobs.filter(e => e.alive);
export function dynStart(m: RepMap, idx?: number) {
  const d = dm(m); if (d.run) return;
  const defs = dynDefs(m), def = defs[(idx ?? d.idx) % defs.length]; d.idx = (idx ?? d.idx) + 1;
  const r: DynRun = { def, map: m, endAt: CX.T + (def.kind === 'escort' ? DYN.escortT : def.kind === 'defend' ? DYN.defendT : DYN.sealT), mobs: [], hp: 100, obj: [], step: 0, prog: 0, wave: 0, seals: [false, false, false], sealT: [0, 0, 0], ambush: 0 };
  const c = W(m, def.at[0], def.at[1]);
  if (def.kind === 'escort') { const cart = M.makeCart(); cart.position.copy(c); CX.scene.add(cart); r.obj.push(cart); }
  else if (def.kind === 'defend') { const b = M.makeBanner(0x2a6ad0); if (flagWireOn()) upgradeFlags(b); b.position.copy(c); CX.scene.add(b); r.obj.push(b); }   // 11-17e 守卫战旗换布料摆动（?off=flagwire）
  else for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5, s = M.makeCrystal(0xb070ff, 0.9); s.position.copy(W(m, def.at[0] + Math.cos(a) * 7, def.at[1] + Math.sin(a) * 7)); CX.scene.add(s); r.obj.push(s); }
  d.run = r;
  CX.yell(`动态事件「${def.name}」开始了！${def.kind === 'escort' ? '商队在等你一起出发。' : def.kind === 'defend' ? '敌人正在逼近，守住战旗！' : '去遗迹旁的三块封印石，站上去完成封印。'}`, '#9ad0ff', 5);
  CX.audio.roar();
}
function end(m: RepMap, ok: boolean) {
  const d = dm(m), r = d.run; if (!r) return;
  d.run = null; d.next = DYN.every;
  r.mobs.forEach(e => { const i = CX.enemies.indexOf(e); if (i >= 0) { e.dispose(); CX.enemies.splice(i, 1); } if (CX.target === e) CX.target = null; });
  r.obj.forEach(o => CX.scene.remove(o));
  if (!ok) { CX.yell(`「${r.def.name}」失败了……下次再来。`, '#c0a080', 4); return; }
  const lv = levelOf(m), c = W(m, r.def.at[0], r.def.at[1]);
  const pos = r.def.kind === 'escort' ? r.obj[0].position.clone() : c;
  CX.yell(`「${r.def.name}」完成！`, '#ffd100', 4); CX.audio.questDone();
  const gold = lv * 8; CX.inventory.addGold(gold); CX.toast(`+${gold} 金币`, '#ffd100');
  CX.addXp(lv * 60);
  const lr = CX.gen.roll(DYN_LOOT, lv + 1);
  lr.items.forEach((it, i) => CX.spawnLoot(it, pos, i, lr.items.length));
  lr.stacks.forEach(s => CX.inventory.addStack(s.id, s.count));
  repAdd(m, REP_GAIN.event, '动态事件');
  dynDone[r.def.id] = (dynDone[r.def.id] ?? 0) + 1;
  CX.save();
}
export const dynDone: Record<string, number> = {};
function tickRun(r: DynRun, dt: number) {
  const m = r.map, P = CX.player.pos, live = aliveMobs(r);
  if (CX.T > r.endAt) { end(m, false); return; }
  if (r.def.kind === 'escort') {
    const cart = r.obj[0], route = r.def.route!;
    const near = Math.hypot(P.x - cart.position.x, P.z - cart.position.z) < 14;
    for (const e of live) if (Math.hypot(e.pos.x - cart.position.x, e.pos.z - cart.position.z) < 4) r.hp -= 1.2 * dt;
    if (near && !live.length && r.step < route.length - 1) {
      const a = W(m, route[r.step][0], route[r.step][1]), b = W(m, route[r.step + 1][0], route[r.step + 1][1]);
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1; r.prog += 2.4 * dt / L;
      if (r.prog >= 1) { r.prog = 0; r.step++; }
      const p = r.step < route.length - 1 ? a.lerp(W(m, route[r.step + 1][0], route[r.step + 1][1]), r.prog) : W(m, route[r.step][0], route[r.step][1]);
      cart.position.set(p.x, CX.groundAt(p.x, p.z), p.z); cart.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    }
    const frac = (r.step + r.prog) / (route.length - 1);
    if ((r.ambush === 0 && frac >= 0.3) || (r.ambush === 1 && frac >= 0.65)) { r.ambush++; ring(r, cart.position.x, cart.position.z, 3, 9); CX.toast('伏兵！保护商队！', '#ff8a40'); }
    if (r.hp <= 0) end(m, false);
    else if (r.step >= route.length - 1 && !live.length) end(m, true);
  } else if (r.def.kind === 'defend') {
    const c = r.obj[0].position;
    for (const e of live) if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 5) r.hp -= 1.5 * dt;
    if (!live.length) { if (r.wave >= DYN.waves) { end(m, true); return; } r.wave++; ring(r, c.x, c.z, 2 + r.wave, 16); if (r.wave > 1) CX.toast(`第 ${r.wave} 波来袭`, '#ff8a40'); }
    if (r.hp <= 0) end(m, false);
  } else {
    r.obj.forEach((s, i) => {
      if (r.seals[i]) return;
      if (Math.hypot(P.x - s.position.x, P.z - s.position.z) < 2.8) {
        if (r.sealT[i] === 0) ring(r, s.position.x, s.position.z, 2, 7);
        r.sealT[i] += dt;
        if (r.sealT[i] >= DYN.sealSec) { r.seals[i] = true; (s as THREE.Object3D).scale.setScalar(0.6); CX.toast(`封印石 ${r.seals.filter(Boolean).length}/3`, '#9ad0ff'); CX.particles.emit({ x: s.position.x, y: 1, z: s.position.z }, { count: 30, color: 0xffd34d, color2: 0xffffff, speed: 2, up: 3, life: 0.8, size: 0.3 }); }
      } else if (r.sealT[i] > 0) r.sealT[i] = Math.max(0.001, r.sealT[i] - dt * 0.5);
    });
    if (r.seals.every(Boolean) && !live.length) end(m, true);
  }
}
let hudEl: HTMLDivElement | null = null;
function hud(text: string | null) {
  if (typeof document === 'undefined') return;
  if (!hudEl) { hudEl = document.createElement('div'); hudEl.id = 'dyn-hud'; hudEl.style.cssText = 'position:fixed;left:50%;top:calc(96px + var(--sat, 0px));transform:translateX(-50%);z-index:6;display:none;pointer-events:none;background:rgba(10,20,40,.75);border:1px solid #6aa0ff;border-radius:4px;padding:5px 14px;color:#cfe4ff;font-size:14px;font-weight:bold;text-shadow:0 1px 2px #000;white-space:nowrap'; document.body.appendChild(hudEl); }
  hudEl.style.display = text ? 'block' : 'none'; if (text) hudEl.textContent = text;
}
export function dynHudText(m: RepMap): string | null {
  const d = dm(m), r = d.run;
  if (!r) { if (d.next > DYN.warn) return null; const def = dynDefs(m)[d.idx % 2]; return d.next > 0 ? `动态事件「${def.name}」${Math.ceil(d.next)} 秒后出现` : `动态事件「${def.name}」已出现，地图上有标记（走近即开始）`; }
  const left = Math.max(0, r.endAt - CX.T), t = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  if (r.def.kind === 'escort') return `✦ ${r.def.name} · 路程 ${Math.round((r.step + r.prog) / (r.def.route!.length - 1) * 100)}% · 商队耐久 ${Math.ceil(r.hp)}% · ${t}`;
  if (r.def.kind === 'defend') return `✦ ${r.def.name} · 第 ${r.wave}/${DYN.waves} 波 · 战旗 ${Math.ceil(r.hp)}% · ${t}`;
  return `✦ ${r.def.name} · 封印 ${r.seals.filter(Boolean).length}/3 · ${t}`;
}
/** 动态事件地图标记 */
export function dynPois(m: string) {
  if (!isRepMap(m)) return [];
  const d = dm(m), def = d.run?.def ?? dynDefs(m)[d.idx % 2], o = origin(m);
  const at = d.run && def.kind === 'escort' ? { x: d.run.obj[0].position.x, z: d.run.obj[0].position.z } : { x: o.x + def.at[0], z: o.z + def.at[1] };
  return [{ kind: 'event' as const, name: `动态事件 · ${def.name}`, x: at.x, z: at.z, sub: def.kind === 'escort' ? '护送商队走完全程' : def.kind === 'defend' ? '守住战旗 3 波' : '完成 3 块封印石', state: d.run ? '进行中' : d.next <= 0 ? '等待你前往' : `${Math.ceil(d.next / 60)} 分钟后`, live: !!d.run, key: `dyn:${def.id}` }];
}

// ======================================================================  天气
export const WEATHER = { clear: 360, storm: 120, base: 0.35 } as const;
const STORM_NAME: Record<string, string> = { dust: '沙暴', snow: '暴风雪', ash: '灰烬雨' };
interface Wx { t: number; storm: boolean; k: number }
const wx: Record<string, Wx> = {};
let fogBase: { near: number; far: number; zone: string } | null = null;
function tickWeather(m: WildId, dt: number) {
  const w = CX.wilds[m]; const kind = WILD[m].palette.weather; if (!w?.weather || !kind) return;
  const s = wx[m] ??= { t: WEATHER.clear * 0.5, storm: false, k: WEATHER.base };
  s.t -= dt;
  if (s.t <= 0) {
    s.storm = !s.storm; s.t = s.storm ? WEATHER.storm : WEATHER.clear;
    CX.toast(s.storm ? `${STORM_NAME[kind]}来了` : `${STORM_NAME[kind]}渐渐停了`, s.storm ? '#e0c090' : '#c0d0e0');
  }
  const want = s.storm ? 1 : WEATHER.base; s.k += (want - s.k) * Math.min(1, dt * 0.5);
  const pts = w.weather.points, n = (pts.geometry.getAttribute('position') as THREE.BufferAttribute).count;
  pts.geometry.setDrawRange(0, Math.max(1, Math.floor(n * s.k)));
  const fog = CX.scene.fog as THREE.Fog | null;
  if (fog) {
    if (!fogBase || fogBase.zone !== m) fogBase = { near: fog.near, far: fog.far, zone: m };
    const f = 1 - (s.k - WEATHER.base) / (1 - WEATHER.base) * 0.45;
    fog.near = fogBase.near * f; fog.far = fogBase.far * f;
  }
}
export function wxState(m: string) { const s = wx[m]; return s ? { storm: s.storm, k: s.k, t: s.t } : null; }
export function wxForce(m: string, storm: boolean) { const s = wx[m] ??= { t: 1, storm: !storm, k: WEATHER.base }; s.storm = !storm; s.t = 0; }

// ======================================================================  每帧
export function regionalUpdate(dt: number) {
  const z = CX.zone;
  if (z !== fogBase?.zone) fogBase = null;
  if (isWildId(z)) tickWeather(z, dt);
  if (!isRepMap(z)) { hud(null); return; }
  const d = dm(z);
  if (d.run) tickRun(d.run, dt);
  else {
    d.next = Math.max(0, d.next - dt);
    // 时间到了只是「出现」：玩家走到 45 米内才真正开始（不会在远处凭空冒怪、打断赶路）
    if (d.next <= 0) { const def = dynDefs(z)[d.idx % dynDefs(z).length], o = origin(z); if (Math.hypot(CX.player.pos.x - o.x - def.at[0], CX.player.pos.z - o.z - def.at[1]) < DYN.near) dynStart(z); }
  }
  hud(dynHudText(z));
}
/** 离开地图：进行中的动态事件算失败（怪物 / 道具都收掉） */
export function regionalOnZone() { for (const m of REP_MAPS) if (m !== CX.zone && dyn[m]?.run) end(m, false); }
export function dynDebug(m: string) { const d = dyn[m]; return d ? { next: d.next, idx: d.idx, run: d.run ? { id: d.run.def.id, kind: d.run.def.kind, hp: d.run.hp, step: d.run.step, wave: d.run.wave, seals: [...d.run.seals], mobs: aliveMobs(d.run).length, cart: d.run.obj[0]?.position.clone(), stones: d.run.obj.map(o => o.position.clone()) } : null } : null; }
export function dynForceNext(m: RepMap, sec = 0) { dm(m).next = sec; }

export function bindRegional(c: Ctx) { CX = c; }
