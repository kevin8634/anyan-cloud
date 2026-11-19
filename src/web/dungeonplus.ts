// v0.6.4：普通副本四难度（英雄起等级同步 30 级）+ 暗岩誓约 + 副本遗物 + 异变房间 + 计时奖牌
// 独立模块：enemies.ts 的 spawnDungeon / enterDungeon / leaveDungeon、main 的 syncCharacter / 存档 / 更新循环 / 交互各有一处挂钩（搜索 dgx）
import * as THREE from 'three';
import * as M from './models';
import * as G from './gfx';
import { ENEMY_TYPES, EnemyType } from './enemy_types';
import { ItemDef } from '../core/Loadout';
import { ModifierDef } from '../core/types';
import { weekKey } from '../data/raid_molten';
import {
  Diff, DIFF, DIFFS, SYNC_LEVEL, SYNC_TRASH_K, SYNC_BOSS_K, OathId, OATHS, OATH_IDS, OATH_MAX, OATH_REWARD, RELICS, Relic, RELIC_RES, RelicFam, FAM_NAME, FAM_COLOR,
  AnomalyKind, ANOMALY, ANOMALY_KINDS, WELL_COST, RELIC_PRICE, medalOf, MEDAL_NAME, MEDAL_COLOR, DIFF_TUNE, SyncSpec, SYNC_30,
} from '../data/dungeon_plus';
import { tagItems } from './loottag';
import type { Ctx, Enemy } from './main';
import { makeCaptive, rescueUpgrade, rescueStart, rescueClear, rescueUpdate, rescueDebug, rollAllyKind, bindRescue, ALLY_INFO, Ally } from './rescue';
import { ensureHd } from './chars';

let CX!: Ctx;
export function bindDungeonPlus(c: Ctx) { CX = c; bindRescue(c); }

// ---------------------------------------------------------------- 存档：最佳时间 / 奖牌
export interface DgxSave { best: Record<string, number>; medal: Record<string, string>; /** 1107 长副本每周首通（副本|档 → 周号） */ week?: Record<string, number> }
let rec: DgxSave = { best: {}, medal: {}, week: {} };
/** v0.9.3i 副本地图：某个副本所有难度里的最快用时（秒） */
export function dgxBestOf(id: string): number | undefined { const v = Object.entries(rec.best).filter(([k]) => k.startsWith(id + '|')).map(([, t]) => t); return v.length ? Math.min(...v) : undefined; }
export const dgxSave = () => rec;
export function dgxLoad(s?: Partial<DgxSave>) { rec = { best: { ...(s?.best ?? {}) }, medal: { ...(s?.medal ?? {}) }, week: { ...(s?.week ?? {}) } }; }

// ---------------------------------------------------------------- 本趟状态
interface Anomaly { kind: AnomalyKind; pos: THREE.Vector3; obj: THREE.Object3D; done: boolean; t: number; data: Record<string, unknown> }
/** 副本场地适配：老副本（DungeonLayout）和 v0.6.5 三首领副本（raid 框架）各给一份 */
export interface DgxPlace { zone: 'dungeon' | 'raid'; name: string; anomalyAt: (i: number) => THREE.Vector3; cx: number; halfW: number; spawnGuard: (i: number, at: THREE.Vector3) => Enemy; boss: () => Enemy | null; synced: boolean;
  /** v1.2.16 同步等级（不填 = 30 级；内容包小副本可以给自己的等级档） */
  sync?: SyncSpec;
  /** 1107 长副本档名（标准 / 炼狱） */ long?: DgxLong }
interface DRun { place: DgxPlace; id: string; diff: Diff; oaths: OathId[]; relics: Relic[]; anomalies: Anomaly[]; ironBroken: boolean; bossT: number; enraged: boolean;
  pick: Relic[] | null; ally: Ally | null; traps: { pos: THREE.Vector3; left: number; disc: THREE.Mesh; mat: ReturnType<typeof G.telegraphMaterial> }[]; deaths: number;
  /** 1107：长副本档名（标准 / 炼狱）；普通副本为空，走 DIFF */ lg?: DgxLong }
export type DgxLong = { label: (d: Diff) => string; color: (d: Diff) => string; /** 首领掉落装等（每周首通加倍用） */ ilvl?: (d: Diff) => number; /** 11-08 每周首通改发指定传说特效橙装（内容包给 lgId，钟井 = 40 级本职业新橙装） */ weeklyLg?: () => string[] };
let run: DRun | null = null;
let longPick: (DgxLong & { id: string }) | null = null;
/** 当前副本难度档名 / 颜色：长副本显示 标准 / 炼狱，其余按 DIFF */
export const dgxDiffName = (d: Diff = run?.diff ?? 'normal') => run?.lg ? run.lg.label(d) : DIFF[d].name;
export const dgxDiffColor = (d: Diff = run?.diff ?? 'normal') => run?.lg ? run.lg.color(d) : DIFF[d].color;
export const dgxRun = () => run;
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const weeklyOath = (now = Date.now()): OathId => OATH_IDS[hashStr(`oath|${weekKey(now)}`) % OATH_IDS.length];
const synced = () => !!run && run.diff !== 'normal' && run.place.synced;
/** v1.2.16 当前这趟的同步档（等级 / 参考生命 / 参考伤害） */
export const dgxSync = (): SyncSpec => run?.place.sync ?? SYNC_30;
const inZone = () => !!run && CX.zone === run.place.zone;
/** 老副本的场地适配 */
function layoutPlace(): DgxPlace {
  const L = CX.layout;
  const s = L.s;   // 11-18 副本 ×1.5（?off=dgscale）：halfW / 门 z 是设计坐标，这里给世界坐标
  return { zone: 'dungeon', name: L.def.name, cx: L.origin.x, halfW: L.halfW * s, boss: () => CX.boss,
    anomalyAt: i => new THREE.Vector3(L.origin.x + (i % 2 ? -1 : 1) * Math.min(3, L.halfW - 1.5) * s, 0, L.origin.z + ((L.gateZ[i] ?? -24) - 3.5) * s),
    spawnGuard: (i, at) => {
      const kinds = L.id === 'rotting_temple' ? ['cultist', 'treant', 'toad'] : ['miner', 'spider', 'miner'];
      const t = dgxType(ENEMY_TYPES[kinds[i % 3]], baseOf());
      const e = new CX.Enemy(kinds[i % 3], { ...t, hp: t.hp * 2, name: `诅咒守卫·${t.name}`, elite: true }, at, 'dungeon', 'anomaly', 0, 'trash');
      CX.enemies.push(e); return e;
    }, synced: true };
}
/** v0.6.5 三首领副本（raid 框架）的难度倍率：数值本身就是 30 级，不再同步缩放；hz = 红圈（按最大生命百分比）的倍率 */
export function dgxMuls() {
  if (!run) return { hp: 1, dmg: 1, speed: 1, ilvl: 33, hz: 1 };
  const m = mulOf();
  if (run.diff === 'normal') return { hp: 0.7, dmg: 0.75, speed: 1, ilvl: 30, hz: 0.6 };
  return { ...m, ilvl: DIFF[run.diff].ilvl + extraIlvl(), hz: ({ heroic: 0.7, epic: 0.85, nightmare: 1 } as Record<string, number>)[run.diff] * (run.oaths.includes('fury') ? 1.15 : 1) };
}
export const dgxEnraged = () => !!run?.enraged;
/** v0.9.1q：当前小副本难度档（0 普通 / 1 英雄 / 2 史诗 / 3 噩梦），满级掉落装等 = 40 + 2 × 档 */
export const dgxTier = () => run ? Math.max(0, (['normal', 'heroic', 'epic', 'nightmare'] as string[]).indexOf(run.diff)) : 0;

/** 进本前：选难度和誓约（30 级以下只有普通） */
export function dgxBegin(id: string, diff: Diff, oaths: OathId[] = [], place?: DgxPlace) {
  dgxEnd();
  place ??= layoutPlace();
  if (diff === 'nightmare' && !oaths.includes(weeklyOath())) oaths = [weeklyOath(), ...oaths];
  if (diff === 'normal' || diff === 'heroic') oaths = [];
  const lg = place.long ?? (longPick?.id === id ? longPick : undefined);
  if (lg) oaths = [];   // 1107（Rhett 17:17 / 22:44）：长副本规则同 30 级长副本——没有誓约 / 遗物 / 异变 / 奖牌
  run = { place, id, diff, oaths: oaths.slice(0, OATH_MAX), relics: [], anomalies: [], ironBroken: false, bossT: 0, enraged: false, pick: null, ally: null, traps: [], deaths: 0, lg };
  if (diff !== 'normal') void ensureHd();   // v1.2.36 救援 NPC 用写实模型：进本就开始解析（不看「角色模型」设置）
  CX.syncCharacter();
}
export function dgxEnd() {
  if (!run) return;
  for (const a of run.anomalies) CX.scene.remove(a.obj);
  if (run.ally) rescueClear();
  run.traps.forEach(t => CX.scene.remove(t.disc));
  run = null;
  CX.syncCharacter();
}

// ---------------------------------------------------------------- 等级同步 / 誓约：敌人数值
const mulOf = () => {
  if (!run || run.diff === 'normal') return { hp: 1, dmg: 1, speed: 1 };
  const d = DIFF[run.diff], o = run.oaths, tn = (run.diff === 'epic' || run.diff === 'nightmare') ? DIFF_TUNE[run.id] : undefined;   // v0.7.4
  return { hp: d.hp * (tn?.hp ?? 1) * (o.includes('stone') ? 1.3 : 1), dmg: d.dmg * (tn?.dmg ?? 1) * (o.includes('fury') ? 1.25 : 1), speed: o.includes('swift') ? 1.25 : 1 };
};
/** 普通副本敌人：同步到 30 级（以副本小怪的平均生命 / 伤害为基准等比放大） */
export function dgxType(t: EnemyType, base: { hp: number; dmg: number }, boss = false): EnemyType {
  if (!synced()) return t;
  const m = mulOf(), S = dgxSync(), kHp = S.hp / base.hp * m.hp * (boss ? SYNC_BOSS_K : SYNC_TRASH_K), kDmg = S.dmg / base.dmg * m.dmg;
  return { ...t, hp: Math.round(t.hp * kHp), dmg: Math.round(t.dmg * kDmg), speed: t.speed * m.speed, level: S.level, ilvl: DIFF[run!.diff].ilvl + extraIlvl() + (boss ? 1 : 0), elite: t.elite || boss };
}
/** 首领技能伤害（BossBrain 给的是绝对值）的倍率 */
export function dgxBossDmg(base: { dmg: number }) {
  if (!synced()) return 1;
  return dgxSync().dmg / base.dmg * mulOf().dmg * (run!.enraged ? 2 : 1);
}
export const dgxSpeedMul = () => mulOf().speed;
const extraIlvl = () => run && !run.ironBroken ? run.oaths.length : 0;
/** v1.2.16 只算誓约的敌人倍率（自带难度倍率的副本用：磐石生命 ×1.3、狂怒伤害 ×1.25、疾风移速 ×1.25） */
export function dgxOathMul() { const o = run?.oaths ?? []; return { hp: o.includes('stone') ? 1.3 : 1, dmg: o.includes('fury') ? 1.25 : 1, speed: o.includes('swift') ? 1.25 : 1 }; }
/** v1.2.16 誓约给的额外装等（铁血之誓破了 = 0） */
export const dgxExtraIlvl = () => extraIlvl();
export const dgxNoPotion = () => !!run && run.oaths.includes('nopot') && inZone();

// ---------------------------------------------------------------- 遗物：本趟生效的修饰器（syncCharacter 读）
export function dgxRelicItem(): ItemDef | null {
  if (!run || !run.relics.length) return null;
  const mods: ModifierDef[] = [];
  run.relics.forEach((r, i) => r.mods?.forEach((m, j) => mods.push({ ...m, id: `relic:${r.id}:${i}:${j}`, name: r.name, source: 'equipment', desc: r.desc } as ModifierDef)));
  for (const f of famsResonating()) RELIC_RES[f].mods?.forEach((m, j) => mods.push({ ...m, id: `relicres:${f}:${j}`, name: RELIC_RES[f].desc, source: 'equipment', desc: RELIC_RES[f].desc } as ModifierDef));
  return { id: 'dgx_relics', name: '副本遗物', slot: 'trinket', quality: 'white', modifiers: mods };
}
export function dgxHpPct() {
  if (!run) return 0;
  return run.relics.reduce((a, r) => a + (r.hpPct ?? 0), 0) + famsResonating().reduce((a, f) => a + (RELIC_RES[f].hpPct ?? 0), 0);
}
function famsResonating(): RelicFam[] {
  if (!run) return [];
  const n = new Map<RelicFam, number>();
  run.relics.forEach(r => n.set(r.fam, (n.get(r.fam) ?? 0) + 1));
  return [...n].filter(([, c]) => c >= 2).map(([f]) => f);
}
function addRelic(r: Relic) {
  if (!run) return;
  const before = famsResonating().length;
  run.relics.push(r);
  CX.syncCharacter();
  CX.toast(`获得遗物「${r.name}」：${r.desc}`, FAM_COLOR[r.fam]);
  if (famsResonating().length > before) { const fs = famsResonating(), f = fs[fs.length - 1]; CX.yell(RELIC_RES[f].desc, FAM_COLOR[f], 3); CX.audio.portal(); }
  updateHud();
}
const randRelics = (n: number) => {
  const own = new Set(run?.relics.map(r => r.id));
  const pool = RELICS.filter(r => !own.has(r.id)).sort(() => Math.random() - 0.5);
  return pool.slice(0, n);
};

/** 遗物三选一面板 */
function offerRelics() {
  if (!run) return;
  run.pick = randRelics(3);
  const body = CX.$('rg-body');
  CX.$('rg-title').textContent = '副本遗物 · 三选一（本趟生效）';
  const fams = new Map<RelicFam, number>(); run.relics.forEach(r => fams.set(r.fam, (fams.get(r.fam) ?? 0) + 1));
  body.innerHTML = `<div class="rg-tip">同系遗物凑满 2 件触发共振。已有：${run.relics.length ? run.relics.map(r => `<b style="color:${FAM_COLOR[r.fam]}">${r.name}</b>`).join('、') : '无'}</div>` +
    run.pick.map((r, i) => `<div class="rg-boss"><div class="rg-h"><b style="color:${FAM_COLOR[r.fam]}">〔${FAM_NAME[r.fam]}〕${r.name}</b>${(fams.get(r.fam) ?? 0) === 1 ? ' <small style="color:#ffd060">选它触发共振</small>' : ''}</div>${r.desc}<br><button class="btn" data-rp="${i}">选这个</button></div>`).join('');
  body.querySelectorAll('[data-rp]').forEach(b => (b as HTMLElement).onclick = () => dgxPick(+(b as HTMLElement).dataset.rp!));
  CX.togglePanel('raidguide', true);
}
export function dgxPick(i: number) {
  if (!run?.pick) return false;
  const r = run.pick[i]; run.pick = null;
  CX.togglePanel('raidguide', false);
  if (r) addRelic(r);
  return !!r;
}

// ---------------------------------------------------------------- 遭遇清理 / 通关
export function dgxOnEncounter(kind: string, index: number) {
  if (!run || run.diff === 'normal' || kind === 'boss' || run.lg) return;
  offerRelics();
  spawnAnomaly(index);
}
export function dgxOnComplete(dungeonName: string, sec: number, bossPos: THREE.Vector3) {
  if (!run) return;
  if (run.lg) {   // 1107 长副本：只记最快用时；每周首通奖励加倍（每档每周一次）+ 炼狱暗金碎片 ×10
    const key = `${run.id}|${run.diff}`, prev = rec.best[key], wk = weekKey(Date.now()); rec.best[key] = Math.min(prev ?? Infinity, Math.round(sec));
    CX.toast(`${dungeonName}（${dgxDiffName()}）用时 ${fmt(sec)}${prev !== undefined && sec <= prev ? ' · 刷新最快' : ''}`, dgxDiffColor());
    if ((rec.week ??= {})[key] !== wk) { rec.week[key] = wk;
      const il = run.lg.ilvl?.(run.diff) ?? DIFF[run.diff].ilvl, wl = run.lg.weeklyLg?.() ?? [], items = wl.length ? wl.map(id => CX.gen.generateLegendary(id, il)).filter((x): x is NonNullable<typeof x> => !!x) : [0, 1].map(() => CX.gen.generate(il, CX.gen.rollQuality('purple')));
      tagItems(items, 'dungeon', `${dungeonName} · ${dgxDiffName()} · 每周首通`); items.forEach((it, i) => CX.spawnLoot(it, bossPos.clone(), i, items.length));
      if (run.diff === 'nightmare') CX.inventory.addStack('mat_darkshard', 10);
      CX.yell(`本周首通：奖励加倍${run.diff === 'nightmare' ? ' + 暗金碎片 ×10' : ''}`, '#ffd060', 3.5); }
    return;
  }
  const key = `${run.id}|${run.diff}`, prev = rec.best[key];
  const md = medalOf(sec, prev);
  rec.best[key] = Math.min(prev ?? Infinity, Math.round(sec));
  if (!rec.medal[key] || ['bronze', 'silver', 'gold'].indexOf(md) > ['bronze', 'silver', 'gold'].indexOf(rec.medal[key])) rec.medal[key] = md;
  CX.yell(`${MEDAL_NAME[md]}！${prev === undefined ? '首个纪录' : sec <= prev ? '刷新个人最佳' : `个人最佳 ${fmt(prev)}`}`, MEDAL_COLOR[md], 3.5);
  CX.toast(`${dungeonName}（${dgxDiffName()}）用时 ${fmt(sec)} · ${MEDAL_NAME[md]}`, MEDAL_COLOR[md]);
  // 誓约奖励：每条多掉一件
  if (run.oaths.length && !run.ironBroken) {
    const ilvl = DIFF[run.diff].ilvl + extraIlvl() + 1;
    const items = run.oaths.map(() => CX.gen.generate(ilvl, CX.gen.rollQuality('blue')));
    tagItems(items, 'dungeon', `${dungeonName} · ${dgxDiffName()} · 誓约`);
    items.forEach((it, i) => CX.spawnLoot(it, bossPos.clone(), i, items.length));
    CX.toast(`誓约奖励：额外 ${items.length} 件装备`, '#ffd060');
  } else if (run.oaths.length) CX.toast('铁血之誓已破，誓约奖励作废', '#c08080');
}
export const fmt = (s: number) => `${Math.floor(s / 60)}分${String(Math.floor(s % 60)).padStart(2, '0')}秒`;

// ---------------------------------------------------------------- 异变房间
function spawnAnomaly(index: number) {
  if (!run) return;
  const used = new Set(run.anomalies.map(a => a.kind));
  const pool = ANOMALY_KINDS.filter(k => !used.has(k));
  const kind = forcedAnomaly ?? pool[Math.floor(Math.random() * pool.length)];
  const pos = run.place.anomalyAt(index);
  let obj: THREE.Object3D;
  const data: Record<string, unknown> = {};
  if (kind === 'captive') { const k = rollAllyKind(); const cg = makeCaptive(k); obj = cg.obj; data.ally = cg.ally; data.allyKind = k; }   // v1.2.36 写实模型 + 两种类型（web/rescue.ts）
  else if (kind === 'cursed') { obj = M.makeCrate(1.1); obj.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined; if (m?.color) m.color.lerp(new THREE.Color(0x6a20a0), 0.6); }); }
  else if (kind === 'trap') { obj = new THREE.Group(); const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), G.toon(0x5a4a3a)); post.position.y = 0.6; const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), G.toon(0xb08040)); lever.position.set(0, 1.3, 0); lever.rotation.z = 0.5; lever.name = 'lever'; obj.add(post, lever); }
  else if (kind === 'goblin') { obj = new THREE.Group(); data.enemy = spawnGoblin(pos); }
  else if (kind === 'well') { obj = new THREE.Group(); const rim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.6, 14), G.toon(0x6a6a7a)); rim.position.y = 0.3; const water = M.makeDisc('#4ab0ff', 0.75, 0.85); water.position.y = 0.55; obj.add(rim, water); }
  else { obj = new THREE.Group(); const rig = M.makeNpcModel('Rogue', 0xc0a040, 0.3); obj.add(rig.root); const pack = M.makeCrate(0.6); pack.position.set(0.9, 0, 0.3); obj.add(pack); }
  obj.position.copy(pos);
  CX.scene.add(obj);
  run.anomalies.push({ kind, pos, obj, done: false, t: 0, data });
  CX.yell(`异变：${ANOMALY[kind].name}——${ANOMALY[kind].desc}`, '#c08aff', 3.5);
  updateHud();
}
let forcedAnomaly: AnomalyKind | null = null;
/** 测试用：指定下一个异变房间 */
export function dgxForceAnomaly(k: AnomalyKind | null) { forcedAnomaly = k; }

function spawnGoblin(at: THREE.Vector3): Enemy {
  const S = dgxSync(), t: EnemyType = { name: '宝藏怪', hp: Math.round(S.hp * 2.2), dmg: 0, interval: 9, speed: 5.4, aggro: 12, range: 1, xp: 0, ilvl: DIFF[run!.diff].ilvl, level: S.level, rare: true,
    model: () => { const r = M.makeNpcModel('Rogue_Hooded', 0xffd040, 0.55); r.root.scale.setScalar(0.75); return r; } };
  ENEMY_TYPES.dgx_goblin = t;
  const e = new CX.Enemy('dgx_goblin', t, at.clone(), run!.place.zone, 'anomaly', 0, 'trash', false);
  let seen = false, left = 20;
  e.brain = {
    update: (dt, p) => {
      const pp = CX.player.pos, dx = e.pos.x - pp.x, dz = e.pos.z - pp.z, d = Math.hypot(dx, dz) || 1;
      if (d < 12 || e.hp < e.maxHp) seen = true;
      if (seen) left -= dt;
      (e as Enemy & { dgxLeft?: number }).dgxLeft = left;
      if (!seen || !p) return { state: 'patrol', moveDir: null, speed: 0, faceTo: null, attacked: false };
      // 往远离你的方向跑，贴墙时沿墙走
      const cx = run?.place.cx ?? e.pos.x, hw = run?.place.halfW ?? 5;
      let mx = dx / d, mz = dz / d;
      if (Math.abs(e.pos.x - cx) > hw - 1) mx = -Math.sign(e.pos.x - cx) * 0.6;
      return { state: 'chase', moveDir: { x: mx, z: mz }, speed: t.speed, faceTo: { x: e.pos.x + mx, z: e.pos.z + mz }, attacked: false };
    },
    provoke: () => { seen = true; },
  };
  CX.enemies.push(e);
  return e;
}

function rewardItems(n: number, minQ: 'blue' | 'purple', where: THREE.Vector3, why: string) {
  if (!run) return;
  const ilvl = DIFF[run.diff].ilvl + extraIlvl();
  const items = Array.from({ length: n }, () => CX.gen.generate(ilvl, CX.gen.rollQuality(minQ)));
  tagItems(items, 'dungeon', `${run.place.name} · ${why}`);
  items.forEach((it, i) => CX.spawnLoot(it, where.clone(), i, n));
}

/** 交互：在异变房间旁边 */
export function dgxInteract(): { label: string; act: () => void; pos: THREE.Vector3 } | null {
  if (!run || !inZone()) return null;
  for (const a of run.anomalies) {
    if (a.done || a.kind === 'goblin' || CX.dist2d(a.pos, CX.player.pos) > 3.2) continue;
    if (a.kind === 'cursed' && a.data.guards) continue;
    if (a.kind === 'trap' && a.data.on) continue;
    return { label: `${ANOMALY[a.kind].label}${a.kind === 'merchant' ? `（每件 ${RELIC_PRICE} 金币）` : ''}`, act: () => actAnomaly(a), pos: a.pos };
  }
  return null;
}
export function dgxAct(kind: AnomalyKind) { const a = run?.anomalies.find(x => x.kind === kind && !x.done); if (a) actAnomaly(a); return !!a; }

function actAnomaly(a: Anomaly) {
  if (!run) return;
  if (a.kind === 'captive') {
    a.done = true;
    const al = a.data.ally as Ally;
    rescueStart(al, a.obj); run.ally = al;
    const info = ALLY_INFO[al.kind];
    CX.yell(al.kind === 'aura' ? `${info.name}：愿誓言护佑你，我跟在你身后。` : `${info.name}：谢了！我跟你一起打到底！`, info.color, 2.5);
    CX.audio.questDone();
  } else if (a.kind === 'cursed') {
    a.data.guards = [0, 1, 2].map(i => {
      const e = run!.place.spawnGuard(i, a.pos.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 2.5, 0, Math.sin(i * 2.1) * 2.5)));
      e.brain.provoke(); return e;
    });
    CX.yell('宝箱里冲出了诅咒守卫！', '#b060ff', 2); CX.audio.roar();
  } else if (a.kind === 'trap') {
    a.data.on = true; a.data.left = 15; a.data.hits = 0; a.data.next = 0.5;
    CX.yell('机关启动！躲开落石', '#ffb040', 2);
  } else if (a.kind === 'well') {
    if (!CX.inventory.spendGold(WELL_COST)) { CX.toast(`金币不足（需要 ${WELL_COST}）`, '#f66'); return; }
    a.done = true; const r = randRelics(1)[0]; if (r) addRelic(r);
    CX.particles.emit({ x: a.pos.x, y: 0.6, z: a.pos.z }, { count: 50, color: 0x4ab0ff, color2: 0xffffff, speed: 2, up: 3, life: 1, size: 0.3 });
  } else if (a.kind === 'merchant') openMerchant(a);
}

function openMerchant(a: Anomaly) {
  if (!run) return;
  const offer = (a.data.offer as Relic[] | undefined) ?? (a.data.offer = randRelics(2)) as Relic[];
  CX.$('rg-title').textContent = '游荡商人 · 遗物';
  const body = CX.$('rg-body');
  body.innerHTML = `<div class="rg-tip">金币：${CX.inventory.gold}</div>` + offer.map((r, i) => `<div class="rg-boss"><b style="color:${FAM_COLOR[r.fam]}">〔${FAM_NAME[r.fam]}〕${r.name}</b>　${r.desc}<br>${run!.relics.includes(r) ? '<small>已买</small>' : `<button class="btn" data-mb="${i}">${RELIC_PRICE} 金币</button>`}</div>`).join('');
  body.querySelectorAll('[data-mb]').forEach(b => (b as HTMLElement).onclick = () => {
    const r = offer[+(b as HTMLElement).dataset.mb!];
    if (!CX.inventory.spendGold(RELIC_PRICE)) { CX.toast('金币不足', '#f66'); return; }
    addRelic(r); if (offer.every(x => run!.relics.includes(x))) a.done = true; openMerchant(a);
  });
  CX.togglePanel('raidguide', true);
}

function baseOf() {
  // 以副本小怪的平均生命 / 伤害为同步基准
  const ks = CX.layout.id === 'rotting_temple' ? ['toad', 'treant', 'cultist'] : ['miner', 'spider'];
  const ts = ks.map(k => ENEMY_TYPES[k]);
  return { hp: ts.reduce((a, t) => a + t.hp, 0) / ts.length, dmg: ts.reduce((a, t) => a + t.dmg, 0) / ts.length };
}
export const dgxBase = baseOf;

// ---------------------------------------------------------------- 每帧
export function dgxUpdate(dt: number) {
  if (!run || !inZone()) return;
  const P = CX.player;
  if (!P.alive && !(run as DRun & { _dead?: boolean })._dead) {
    (run as DRun & { _dead?: boolean })._dead = true; run.deaths++;
    if (run.oaths.includes('iron') && !run.ironBroken) { run.ironBroken = true; CX.yell('铁血之誓破碎了', '#ff4040', 3); }
  } else if (P.alive) (run as DRun & { _dead?: boolean })._dead = false;
  // 沙漏之誓
  const B = run.place.boss();
  if (B && B.alive && run.oaths.includes('clock') && B.intent && B.intent.state !== 'patrol' && B.intent.state !== 'leash') {
    run.bossT += dt;
    if (!run.enraged && run.bossT > 240) { run.enraged = true; CX.yell(`${B.name}狂暴了！（沙漏之誓）`, '#ff4040', 3); }
  }
  for (const a of run.anomalies) {
    if (a.kind === 'captive' && !a.done) { const al = a.data.ally as Ally | undefined; if (al) { if (al.model === 'classic') rescueUpgrade(al); al.anim?.mixer.update(dt); } }   // v1.2.36 笼中待机动画（写实模型解析完就换上）
    if (a.done) continue;
    a.t += dt;
    if (a.kind === 'goblin') {
      const e = a.data.enemy as Enemy & { dgxLeft?: number };
      if (!e.alive) { a.done = true; CX.spawnLoot(Math.round(600 + Math.random() * 400), e.pos.clone(), 0, 3); rewardItems(2, 'blue', e.pos, '宝藏怪'); CX.yell('宝藏怪倒下了！金币撒了一地', '#ffd060', 2.5); }
      else if ((e.dgxLeft ?? 99) <= 0) { a.done = true; e.hp = 0; e.deadAt = CX.T; const i = CX.enemies.indexOf(e); if (i >= 0) { e.dispose(); CX.enemies.splice(i, 1); } CX.toast('宝藏怪钻进地缝跑掉了', '#c0a080'); }
    } else if (a.kind === 'cursed' && a.data.guards) {
      if ((a.data.guards as Enemy[]).every(g => !g.alive)) { a.done = true; a.data.guards = null; rewardItems(2, 'purple', a.pos, '诅咒宝箱'); CX.scene.remove(a.obj); CX.yell('诅咒解除，宝箱打开了', '#c08aff', 2); }
    } else if (a.kind === 'trap' && a.data.on) {
      a.data.left = (a.data.left as number) - dt; a.data.next = (a.data.next as number) - dt;
      if ((a.data.next as number) <= 0 && (a.data.left as number) > 1) { a.data.next = 1.1; trapAt(new THREE.Vector3(P.pos.x + (Math.random() - 0.5) * 1.5, 0, P.pos.z + (Math.random() - 0.5) * 1.5), a); }
      if ((a.data.left as number) <= 0) {
        a.done = true; const hits = a.data.hits as number;
        if (hits === 0) rewardItems(2, 'purple', a.pos, '机关密室'); else if (hits <= 2) rewardItems(1, 'blue', a.pos, '机关密室'); else CX.spawnLoot(300, a.pos.clone(), 0, 1);
        CX.yell(hits === 0 ? '机关密室：毫发无伤！' : `机关密室：被砸中 ${hits} 次`, hits === 0 ? '#ffd060' : '#c0a080', 2.5);
      }
    }
  }
  // 落石
  for (let i = run.traps.length - 1; i >= 0; i--) {
    const t = run.traps[i]; t.left -= dt;
    t.mat.uniforms.progress && (t.mat.uniforms.progress.value = 1 - t.left / 1.2);
    if (t.left <= 0) {
      CX.scene.remove(t.disc); run.traps.splice(i, 1);
      CX.particles.emit({ x: t.pos.x, y: 0.2, z: t.pos.z }, { count: 30, color: 0x8a7a66, color2: 0xc0b090, speed: 3, up: 2, radius: 1.5, life: 0.7, size: 0.4, gravity: 6 });
      if (P.alive && !P.status.isInvulnerable && CX.dist2d(P.pos, t.pos) < 2.2) {
        CX.fx.dealDamage(P, Math.round(P.maxHp * 0.15), 'physical', null);
        const a = run.anomalies.find(x => x.kind === 'trap'); if (a) a.data.hits = (a.data.hits as number) + 1;
      }
    }
  }
  // v1.2.36 救援 NPC：助战型自动战斗 / 光环型跟随（web/rescue.ts）
  if (run.ally) rescueUpdate(dt, run.place.zone);
}
function trapAt(pos: THREE.Vector3, _a: Anomaly) {
  const mat = G.telegraphMaterial();
  mat.uniforms.color.value.setRGB(1, 0.6, 0.1);
  const disc = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), mat));
  disc.rotation.x = -Math.PI / 2; disc.position.set(pos.x, 0.05, pos.z);
  CX.scene.add(disc);
  run!.traps.push({ pos, left: 1.2, disc, mat });
}

// ---------------------------------------------------------------- 选难度面板
/** v1.2.16 opts：sync = 同步等级（默认 30）；desc = 每档说明（自带装等 / 倍率的副本用）；level = 进入等级（低于它只开普通） */
export interface DgxChooseOpts { sync?: number; desc?: (d: Diff) => string; level?: number;
  /** fix1107（Rhett 11-07 10:28：40 级长副本按长副本规则）：长副本只给两档（标准 / 炼狱），不显示遗物 / 誓约说明；label 改档名；lock 返回不能选的原因 */
  long?: { diffs: Diff[]; label: (d: Diff) => string; color: (d: Diff) => string; lock?: (d: Diff) => string | null; tip: string } }
export function dgxChoose(id: string, nameArg?: string, go?: (diff: Diff, oaths: OathId[]) => void, opts: DgxChooseOpts = {}) {
  const name = nameArg ?? CX.LAYOUTS[id].def.name;
  const lv = CX.progression.level;
  const minNormal = !go;   // 老副本：30 级以下只能普通；新副本 30 级才能进
  const SL = opts.sync ?? SYNC_LEVEL, descOf = (d: Diff) => opts.desc?.(d) ?? DIFF[d].desc;
  const sel: OathId[] = [];
  const wk = weeklyOath();
  const render = (diff: Diff) => {
    const key = (d: Diff) => `${id}|${d}`;
    const LG = opts.long; longPick = LG ? { id, label: LG.label, color: LG.color } : null;
    const nm = (d: Diff) => LG ? LG.label(d) : DIFF[d].name, co = (d: Diff) => LG ? LG.color(d) : DIFF[d].color;
    let h = LG ? `<div class="rg-tip">${LG.tip}</div><div class="dgx-diffs">` : `<div class="rg-tip">英雄起等级同步到 ${SL} 级。清完每个区域：遗物三选一 + 一个异变房间。通关按用时给奖牌（只跟自己的最佳比）。</div><div class="dgx-diffs">`;
    for (const d of LG ? LG.diffs : DIFFS) {
      const lock = LG ? !!LG.lock?.(d) : (minNormal || opts.level !== undefined) && d !== 'normal' && lv < (opts.level ?? SL);
      h += `<button class="btn ${d === diff ? 'on' : ''}" data-df="${d}" ${lock ? 'disabled' : ''} title="${LG?.lock?.(d) ?? ''}" style="color:${co(d)}">${nm(d)}</button>`;
    }
    h += `</div><div class="rg-boss"><div class="rg-h" style="color:${co(diff)}">${nm(diff)}</div>${descOf(diff)}${rec.best[key(diff)] ? `<br>个人最佳 ${fmt(rec.best[key(diff)])} · 最好奖牌 <b style="color:${MEDAL_COLOR[rec.medal[key(diff)] as 'gold']}">${MEDAL_NAME[rec.medal[key(diff)] as 'gold'] ?? ''}</b>` : ''}</div>`;
    if (!LG && (diff === 'epic' || diff === 'nightmare')) {
      h += `<div class="fgroup">暗岩誓约（最多 ${OATH_MAX} 条）</div><div class="rg-tip">${OATH_REWARD}${diff === 'nightmare' ? `<br>本周必带：<b style="color:#ff6040">${OATHS[wk].name}</b>` : ''}</div>`;
      for (const o of OATH_IDS) {
        const forced = diff === 'nightmare' && o === wk;
        h += `<label style="display:block"><input type="checkbox" data-oa="${o}" ${forced || sel.includes(o) ? 'checked' : ''} ${forced ? 'disabled' : ''}> <b>${OATHS[o].name}</b>：${OATHS[o].desc}</label>`;
      }
    }
    h += `<button class="btn big" id="dgx-go">进入${name}（${nm(diff)}）</button>`;
    const body = CX.$('rg-body'); body.innerHTML = h;
    body.querySelectorAll('[data-df]').forEach(b => (b as HTMLElement).onclick = () => render((b as HTMLElement).dataset.df as Diff));
    body.querySelectorAll('[data-oa]').forEach(b => (b as HTMLInputElement).onchange = ev => {
      const o = (b as HTMLElement).dataset.oa as OathId, on = (ev.target as HTMLInputElement).checked;
      const limit = OATH_MAX - (diff === 'nightmare' && !sel.includes(wk) ? 1 : 0);
      if (on && sel.length >= limit) { (ev.target as HTMLInputElement).checked = false; CX.toast(`最多 ${OATH_MAX} 条誓约`, '#f66'); return; }
      if (on) sel.push(o); else sel.splice(sel.indexOf(o), 1);
    });
    CX.$('dgx-go').onclick = () => { CX.togglePanel('raidguide', false); if (go) go(diff, [...sel]); else CX.enterDungeon(id, diff, [...sel]); };
  };
  CX.$('rg-title').textContent = `${name} · 选择难度`;
  render(opts.long ? opts.long.diffs[0] : lv >= (opts.level ?? SL) ? 'heroic' : 'normal');
  CX.togglePanel('raidguide', true);
}

// ---------------------------------------------------------------- HUD（副本里屏幕上方一行）
function updateHud() {
  const el = document.getElementById('dgx-hud');
  if (!el) return;
  if (!run || (run.diff === 'normal' && run.place.synced) || !inZone()) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<b style="color:${dgxDiffColor()}">${dgxDiffName()}</b>${run.oaths.length ? ` · 誓约 ${run.oaths.map(o => OATHS[o].name.replace('之誓', '')).join('/')}${run.ironBroken ? '（已破）' : ''}` : ''}${run.relics.length ? ` · 遗物 ${run.relics.map(r => `<span style="color:${FAM_COLOR[r.fam]}">${r.name}</span>`).join(' ')}` : ''}`;
}
export function dgxHud() { updateHud(); }
export function dgxDebug() { return run ? { diff: run.diff, oaths: run.oaths, relics: run.relics.map(r => r.id), anomalies: run.anomalies.map(a => ({ kind: a.kind, done: a.done })), pick: !!run.pick, ally: !!run.ally, allyInfo: rescueDebug(), ironBroken: run.ironBroken, hpPct: dgxHpPct() } : null; }
