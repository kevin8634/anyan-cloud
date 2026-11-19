import { SKILL4_LEVEL } from '../data/skills_v078';
// 药水键、小地图雷达、悬浮提示、技能栏
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindHudBar(C) 初始化
import * as THREE from 'three';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { LootGenerator, ItemInstance, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME } from '../core/Loot';
import { Inventory, EQUIP_SLOTS, SLOT_NAME, EQUIP_SLOT_NAME, EquipSlot, CharStats } from '../core/Inventory';
import { TalentTree, Progression, TalentNodeDef, MAX_LEVEL } from '../core/TalentTree';
import { QuestLog, QuestDef } from '../core/Quest';
import { SaveManager, GameSave, LoadStatus } from '../core/SaveManager';
import { Roster, CharMeta, randomName, nameError, exportFileName, MAX_SLOTS } from '../core/Roster';
import { BrowserStorage, downloadText, pickTextFile } from './save';
import { GAME_VERSION, CHANGELOG } from './version';
import { Preview } from './preview';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName } from '../core/Forge';
import { SlotId, SLOT_IDS, ResolvedSkill, Element, ModifierDef, EffectDef } from '../core/types';
import { SET_BONUSES } from '../data/warrior';
import { LOOT_DATA, LOOT_TABLES } from '../data/loot';
import { CLASSES, ClassDef, ClassId } from '../data/classes';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from '../data/dungeon_darkrock';
import { DodgeRoll } from '../core/Dodge';
import { HitFeel, FeelEvent } from '../core/HitFeel';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from '../data/dungeon_swamp';
import { QUESTS, NPCS } from '../data/quests';
import { FORGE_DATA } from '../data/shop';
import * as M from './models';
import * as G from './gfx';
import { GameAudio, Theme } from './audio';
import { loadCharacters, AnimName } from './chars';
import { applyGear, updateGear, gearSummary, gearDebug } from './gear';
import { skillIcon, itemIcon, talentIcon, stackIcon, uiIcon, installArt } from './icons';
import { updateWater } from './textures';
import { NavGrid, Circle, Pos2 } from '../core/NavGrid';
import { AutoPath, AUTOPATH_STOP_TEXT } from '../core/AutoPath';
import { questTarget, nextHop, trackedList, GuideTarget, MapLink } from '../core/QuestGuide';
import { objectiveMax } from '../core/Quest';
import { EnemyBrain as Brain } from '../core/EnemyBrain';
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD, BRIDGE2, FIELD_HALF, LAKE_ON, LAKE, lakeDist, lakeShore, RIVER_X0 } from '../data/zone_field';
import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig } from './enemy_types';
import { bindTitle, CLASS_INFO, LOCKED_CLASSES, newLook, delArmed, MAP_NAME, fmtTime, slotMeta, renderTitle, pickClass, titleModel, demoSkill, swapPlayerModel, importSave, startSelected, startGame, startChar } from './title';
import { raidHud, drawRaidMinimap, raidZoneName } from './raid';
import { dgxNoPotion } from './dungeonplus';
import { poisCached, drawPoiIcon } from './mappoi';
import { chronoTipLine } from './chrono';
import { alchemyTipLine } from './alchemy';
import { wbHud } from './worldboss';
import { packBossHud } from './packboss';
import { bindBuffHud, updateBuffHud } from './buffhud';
import type { Ctx } from './main';
import { bindRuneHud, updateOrbs, skillRuneHtml, setSweep, ensureRune, updateBossTicks, demoBoss } from './runehud';

let CX!: Ctx;

// ----- 药水（Q） -----
export let potionReady = 0;

export function usePotion() {
  if (dgxNoPotion()) { CX.toast('断药之誓：这趟不能用药水', '#f66'); CX.audio.error(); return; }
  if (!CX.started || !CX.player.alive || CX.T < potionReady) { if (CX.T < potionReady) CX.toast('药水冷却中'); return; }
  const missing = CX.player.maxHp - CX.player.hp;
  const id = CX.inventory.stack('potion_l') > 0 && (missing > CX.player.maxHp * 0.5 || CX.inventory.stack('potion_s') === 0) ? 'potion_l' : CX.inventory.stack('potion_s') > 0 ? 'potion_s' : null;
  if (!id) { CX.toast('没有药水了，去营地找葛尔达买'); CX.audio.error(); return; }
  const v = CX.forge.usePotion(id, CX.player.maxHp);
  CX.fx.heal(CX.player, v);
  potionReady = CX.T + (CX.forge.stackDef(id)!.cooldown ?? 12);
  CX.audio.heal();
  CX.particles.emit({ x: CX.player.pos.x, y: 0.5, z: CX.player.pos.z }, { count: 40, color: 0xff5050, color2: 0xffd0a0, speed: 1, up: 2.5, radius: 0.8, life: 1, size: 0.3 });
  CX.save();
}

// ----- 小地图（罗盘框里的雷达）：北朝上，玩家箭头，敌人红点，Boss 橙点，NPC 黄点，传送门紫点 -----
export let mini!: HTMLCanvasElement;

export let mctx!: CanvasRenderingContext2D | null;

export let miniTimer = 0;

export function updateMinimap(dt: number) {
  miniTimer -= dt;
  if (miniTimer > 0) return;
  miniTimer = 0.1;
  updateCompassPip();
  if (!mctx) return;
  const W = mini.width, R = W / 2, range = CX.zone === 'dungeon' || CX.zone === 'raid' ? 36 : 45, k = R / range;
  const g = mctx;
  g.clearRect(0, 0, W, W);
  g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(R, R, 4, R, R, R);
  if (CX.zone === 'world') { bg.addColorStop(0, '#6f9a48'); bg.addColorStop(1, '#3d5a28'); }
  else if (CX.zone === 'field') { bg.addColorStop(0, '#b0a050'); bg.addColorStop(1, '#6a6028'); }
  else if (isWildId(CX.zone)) { bg.addColorStop(0, WILD[CX.zone].palette.map[0]); bg.addColorStop(1, WILD[CX.zone].palette.map[1]); }
  else if (CX.zone === 'raid') { bg.addColorStop(0, '#5a2a1a'); bg.addColorStop(1, '#2a0a04'); }
  else if (CX.layout.id === 'rotting_temple') { bg.addColorStop(0, '#4a5a34'); bg.addColorStop(1, '#1e2a18'); }
  else { bg.addColorStop(0, '#4a4248'); bg.addColorStop(1, '#1a161c'); }
  g.fillStyle = bg; g.fillRect(0, 0, W, W);
  const P = CX.player.pos;
  const dot = (x: number, z: number, color: string, r: number) => { const dx = (x - P.x) * k, dz = (z - P.z) * k; if (dx * dx + dz * dz > (R - 3) ** 2) return; g.fillStyle = color; g.beginPath(); g.arc(R + dx, R + dz, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke(); };
  if (CX.zone === 'world') {
    g.strokeStyle = 'rgba(200,160,100,.7)'; g.lineWidth = 3; g.beginPath(); g.arc(R + (0 - P.x) * k, R + (4 - P.z) * k, 9 * k, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1;
    dot(CX.WORLD_PORTAL.x, CX.WORLD_PORTAL.z, '#c070ff', 4);
    dot(CX.FIELD_GATE_POS.x, CX.FIELD_GATE_POS.z, '#ffc040', 4);
  } else if (CX.zone === 'field') {
    // 河（采样画一条蓝带）、木栅栏、遗迹石环
    g.strokeStyle = 'rgba(80,150,200,.85)'; g.lineWidth = RIVER_HALF * 2 * k; g.beginPath();
    for (let x = Math.max(P.x - range, LAKE_ON ? CX.F.x + RIVER_X0 : -1e9); x <= P.x + range; x += 3) { const zz = CX.F.z + riverZ(x - CX.F.x); const sx = R + (x - P.x) * k, sz = R + (zz - P.z) * k; if (x === P.x - range) g.moveTo(sx, sz); else g.lineTo(sx, sz); }
    g.stroke();
    if (LAKE_ON) { g.fillStyle = 'rgba(80,150,200,.85)'; g.beginPath(); for (let i = 0; i <= 48; i++) { const [lx, lz] = lakeShore(i / 48 * Math.PI * 2); const sx = R + (CX.F.x + lx - P.x) * k, sz = R + (CX.F.z + lz - P.z) * k; if (i) g.lineTo(sx, sz); else g.moveTo(sx, sz); } g.fill(); }   // 11-19 落霞湖
    g.strokeStyle = '#a07040'; g.lineWidth = 3; g.beginPath(); g.moveTo(R + (CX.F.x + BRIDGE.x0 - P.x) * k, R + (CX.F.z + riverZ(0) - P.z) * k); g.lineTo(R + (CX.F.x + BRIDGE.x1 - P.x) * k, R + (CX.F.z + riverZ(0) - P.z) * k); g.stroke();
    { const bx = (BRIDGE2.x0 + BRIDGE2.x1) / 2; g.strokeStyle = '#b0a898'; g.beginPath(); g.moveTo(R + (CX.F.x + BRIDGE2.x0 - P.x) * k, R + (CX.F.z + riverZ(bx) - P.z) * k); g.lineTo(R + (CX.F.x + BRIDGE2.x1 - P.x) * k, R + (CX.F.z + riverZ(bx) - P.z) * k); g.stroke(); }
    { const V = FIELD_SPOTS.village; g.strokeStyle = 'rgba(120,80,40,.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(R + (CX.F.x + V.x - P.x) * k, R + (CX.F.z + V.z - P.z) * k, 21 * k, 19 * k, 0, 0, Math.PI * 2); g.stroke(); }
    { const M2 = FIELD_SPOTS.mesa; g.strokeStyle = 'rgba(150,100,60,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(R + (CX.F.x + M2.x - P.x) * k, R + (CX.F.z + M2.z - P.z) * k, 13 * k, 0, Math.PI * 2); g.stroke(); }
    const op = FIELD_SPOTS.outpost; g.strokeStyle = 'rgba(120,80,40,.9)'; g.lineWidth = 2;
    g.strokeRect(R + (CX.F.x + op.x - op.hw - P.x) * k, R + (CX.F.z + op.z - op.hd - P.z) * k, op.hw * 2 * k, op.hd * 2 * k);
    g.strokeStyle = 'rgba(200,200,190,.8)'; g.beginPath(); g.arc(R + (CX.F.x + FIELD_SPOTS.ruins.x - P.x) * k, R + (CX.F.z + FIELD_SPOTS.ruins.z - P.z) * k, 11 * k, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1;
    dot(CX.FIELD_RETURN.x, CX.FIELD_RETURN.z, '#ffc040', 4);
    dot(CX.FIELD_EAST_POS.x, CX.FIELD_EAST_POS.z, '#ff9a40', 4);
    dot(CX.F.x + 114, CX.F.z - 30, '#b080ff', 4);   // v0.9.3e 星落山径
  } else if (isWildId(CX.zone)) {
    const w = WILD[CX.zone], O = w.origin, ws = CX.wilds[CX.zone];
    g.strokeStyle = 'rgba(255,240,210,.35)'; g.lineWidth = 2;
    for (const pl of w.paths) { g.beginPath(); pl.forEach(([x, z], i) => { const sx = R + (O.x + x - P.x) * k, sz = R + (O.z + z - P.z) * k; if (i) g.lineTo(sx, sz); else g.moveTo(sx, sz); }); g.stroke(); }
    for (const c of w.camps) { g.strokeStyle = 'rgba(120,80,40,.9)'; g.beginPath(); g.arc(R + (O.x + c.x - P.x) * k, R + (O.z + c.z - P.z) * k, c.r * k, 0, Math.PI * 2); g.stroke(); }
    for (const d of w.decor) if (d.kind === 'lava') { g.fillStyle = 'rgba(255,90,20,.8)'; g.beginPath(); g.arc(R + (O.x + d.x - P.x) * k, R + (O.z + d.z - P.z) * k, (d.s ?? 5) * k, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = 1;
    if (ws) { ws.gates.forEach(gt => dot(gt.pos.x, gt.pos.z, '#ffc040', 4)); Object.values(ws.waypoints).forEach(p => dot(p.x, p.z, '#3ab0ff', 4)); ws.dgates.forEach(d => dot(d.pos.x, d.pos.z, '#ff4020', 5)); }
  } else if (CX.zone === 'raid') {
    drawRaidMinimap(g, R, k, P);
  } else {
    const L = CX.layout, s = L.s;   // 11-18 副本 ×1.5：设计尺寸 × s；出口在放大的组里，取世界坐标
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.fillRect(R + (L.origin.x - L.halfW * s - P.x) * k, R + (L.origin.z - 47 * s - P.z) * k, L.halfW * 2 * s * k, 54 * s * k);
    g.beginPath(); g.arc(R + (L.boss.x - P.x) * k, R + (L.boss.z - P.z) * k, 14.5 * s * k, 0, Math.PI * 2); g.fill();
    { const ex = L.exit.getWorldPosition(new THREE.Vector3()); dot(ex.x, ex.z, '#60ff80', 4); }
  }
  for (const n of CX.npcs) if (n.z === CX.zone) { const mk = CX.quests.npcMarker(n.id, CX.progression.level); dot(n.rig.root.position.x, n.rig.root.position.z, mk === '!' || mk === '?' ? '#ffe040' : mk === '…' ? '#b0b0b0' : n.id === 'gerda' ? '#40c0ff' : '#c0c0a0', mk ? 4 : 3); }
  for (const e of CX.enemies) if (e.alive && e.z === CX.zone) dot(e.pos.x, e.pos.z, e.isBoss || e.type.elite ? '#ff8000' : e.type.rare ? '#d0a0ff' : '#ff3030', e.isBoss || e.type.elite ? 5 : e.type.rare ? 4 : 2.6);
  for (const l of CX.loots) dot(l.obj.position.x, l.obj.position.z, '#ffd100', 2);
  // 任务：追踪任务的目标圈（焦点任务更亮）+ 路线 + 目标菱形
  for (const id of CX.trackedIds()) {
    const gd = id === CX.focusId ? CX.guide : CX.guideFor(id);
    if (!gd || !gd.final) continue;
    const f = id === CX.focusId;
    g.strokeStyle = f ? 'rgba(255,215,60,.95)' : 'rgba(255,215,60,.45)'; g.fillStyle = f ? 'rgba(255,215,60,.18)' : 'rgba(255,215,60,.07)'; g.lineWidth = f ? 2 : 1;
    g.beginPath(); g.arc(R + (gd.goal.x - P.x) * k, R + (gd.goal.z - P.z) * k, Math.max(4, gd.goal.r * k), 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (CX.guide && CX.guidePath.length) {
    g.strokeStyle = '#ffd34d'; g.lineWidth = 2; g.setLineDash?.([4, 3]); g.beginPath(); g.moveTo(R, R);
    for (const q of CX.guidePath) g.lineTo(R + (q.x - P.x) * k, R + (q.z - P.z) * k);
    g.stroke(); g.setLineDash?.([]); g.lineWidth = 1;
  }
  if (CX.guide) {
    const gx = R + (CX.guide.goal.x - P.x) * k, gz = R + (CX.guide.goal.z - P.z) * k;
    if ((gx - R) ** 2 + (gz - R) ** 2 < (R - 4) ** 2) { g.fillStyle = '#ffd34d'; g.strokeStyle = '#3a2000'; g.beginPath(); g.moveTo(gx, gz - 6); g.lineTo(gx + 5, gz); g.lineTo(gx, gz + 6); g.lineTo(gx - 5, gz); g.closePath(); g.fill(); g.stroke(); }
  }
  g.restore();
  // v0.6.9：小地图边缘箭头——本区域的副本入口、存活的野外 / 稀有首领、进行中的世界事件（在小地图范围外时贴边显示）
  if (CX.zone !== 'raid' && CX.zone !== 'dungeon') {
    for (const p of poisCached(CX.currentMap())) {
      const want = p.kind === 'dungeon3' || p.kind === 'raid' || (p.kind === 'wildboss' && p.live) || (p.kind === 'rare' && p.live) || (p.kind === 'event' && p.live);
      if (!want) continue;
      const dx = (p.x - P.x) * k, dz = (p.z - P.z) * k, d = Math.hypot(dx, dz);
      if (d < R - 8) continue;
      const ex = R + dx / d * (R - 7), ez = R + dz / d * (R - 7);
      drawPoiIcon(g, p.kind, ex, ez, 5.5, { live: p.live });
    }
  }
  // 玩家箭头（朝向）
  g.save(); g.translate(R, R); g.rotate(Math.PI - CX.player.rig.root.rotation.y);
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

/** 罗盘（小地图外圈）上的目标方位标记：始终贴在外圈，指向焦点目标，显示距离 */
export function updateCompassPip() {
  const pip = CX.$('mm-obj');
  if (!CX.guide || !CX.started) { pip.style.display = 'none'; return; }
  const dx = CX.guide.goal.x - CX.player.pos.x, dz = CX.guide.goal.z - CX.player.pos.z, d = Math.hypot(dx, dz);
  const ux = d > 0.01 ? dx / d : 0, uz = d > 0.01 ? dz / d : -1;
  pip.style.display = 'block';
  pip.style.left = `${50 + ux * 47}%`; pip.style.top = `${50 + uz * 47}%`;   // 按罗盘大小比例定位（手机上罗盘更小）
  pip.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(ux, -uz) * 180 / Math.PI}deg)`;
  pip.title = `${CX.guide.final ? CX.guide.t.label : CX.guide.link!.name} · ${Math.round(d)} 米`;
  CX.setText('mm-dist', `${Math.round(d)}米`);
}

// ----- 悬浮提示（电脑：鼠标移到技能、装备上） -----
export let tipEl!: HTMLElement;

export function showTip(html: string, ev: MouseEvent | { clientX: number; clientY: number }, force = false) {
  // 触屏没有悬停：装备/天赋/商品改为点击后在面板里的详情栏显示；技能长按时 force 显示
  if (CX.isTouch && !force) return;
  tipEl.innerHTML = html; tipEl.style.display = 'block';
  const w = tipEl.offsetWidth || 260, h = tipEl.offsetHeight || 120;
  tipEl.style.left = `${Math.min(window.innerWidth - w - 8, ev.clientX + 16)}px`;
  tipEl.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, ev.clientY - h - 12))}px`;
}

export function hideTip() { tipEl.style.display = 'none'; }

/** v0.9.1l 持续伤害按职业和元素显示名字：战士流血、时砂切割、燃烧/灼烧、冻伤、腐蚀 */
export function dotName(el?: string) {
  const c = CX.cls.id;
  if (el === 'physical') return c === 'chrono' ? '切割' : '流血';
  if (el === 'fire') return c === 'alchemy' ? '灼烧' : '燃烧';
  return ({ frost: '冻伤', nature: '腐蚀', shadow: '暗蚀', arcane: '奥蚀', holy: '圣灼' } as Record<string, string>)[el ?? ''] ?? '持续伤害';
}
export function skillTip(slot: SlotId) {
  const p = CX.loadout.preview(slot, CX.ctx());
  if (!p) return '';
  const base = CX.cls.skills[p.baseId];
  const eff = p.effects.map(e => e.type === 'elemHit' ? `<span style="color:${CX.ELEMENT_COLOR[e.element]}">+${CX.ELEMENT_NAME[e.element]} ${Math.round(p.stats.damage * e.damagePercent)}</span>` : ({ dot: `${dotName((e as { element?: string }).element)} ${Math.round(((e as { dps?: number }).dps ?? 0) * (CX.player.dotPower ?? 1))}/跳 · 每 ${(1 / (1 + (CX.player.haste ?? 0))).toFixed(2)} 秒`, slow: '减速', stun: slot === 'skill2' && CX.cls.id === 'mage' ? '冻结' : CX.cls.id === 'chrono' ? '定身' : '眩晕', groundZone: '燃烧地面', knockback: '击退', heal: '吸血', explode: '爆炸', resetCooldown: '重置冷却', interrupt: '打断读条', reflect: '减伤反弹', chain: '连锁弹跳' } as Record<string, string>)[e.type]).filter(Boolean);
  const mods = p.appliedModifiers.filter(id => id !== 'level').length;
  return `<b class="tt-name" style="color:${CX.ELEMENT_COLOR[p.element]}">${p.displayName}</b><span class="tt-sub">${(p.elements ?? [p.element]).map(el => CX.ELEMENT_NAME[el]).join(' + ')} · ${{ single: '单体', cone: '扇形', circle: '范围', line: '直线', projectile: '投射物', dash: '冲锋' }[p.shape]}${p.stats.projectileCount > 1 ? ` ×${p.stats.projectileCount}` : ''}</span>
    伤害 <b>${Math.round(p.stats.damage)}</b>　冷却 ${p.stats.cooldown.toFixed(1)} 秒${p.stats.radius ? `　半径 ${p.stats.radius.toFixed(1)}` : ''}${p.radCap ? `（范围加成 +${Math.round(p.radCap.raw * 100)}% 已封顶 +${Math.round(p.radCap.cap * 100)}%，溢出转伤害 +${Math.round(p.radCap.dmg * 100)}%）` : ''}${p.stats.range > 2.5 ? `　射程 ${p.stats.range.toFixed(0)}` : ''}<br>
    ${chronoTipLine(p)}${alchemyTipLine(p)}${eff.length ? `<span class="ln">${[...new Set(eff)].join(' · ')}</span><br>` : ''}${p.displayName !== base.name || p.element !== base.element ? `<span class="lg">已被天赋/装备改变形态</span><br>` : ''}${mods ? `<span class="tt-sub">受 ${mods} 个天赋/装备/组合影响</span>` : ''}${slot === CX.cls.interruptSlot ? '<br><span style="color:#ffd100">可打断 Boss 读条</span>' : ''}`;
}

// ----- 技能栏 -----
export const SKILL_KEYS: Record<SlotId, string> = { basic: '空格', skill1: '1', skill2: '2', skill3: '3', skill4: '4', ultimate: 'R' };

export let skillEls!: { slot: SlotId; el: HTMLElement; ic: HTMLElement; icKey: string; wasCd: boolean; cd: HTMLElement; cdt: HTMLElement; nm: HTMLElement; }[];

/** 翻滚键的冷却遮罩（按钮内容在「闪避翻滚」一节里生成后再取） */
export let dodgeHud!: { el: HTMLElement; readonly cd: HTMLElement; readonly cdt: HTMLElement; was: boolean; };

export function updateHUD() {
  const p = CX.player;
  CX.setText('pf-level', `${CX.progression.level}`);
  { const sh = Math.round(p.status.shield); CX.setW('pf-shield', Math.min(1, sh / p.maxHp)); CX.setText('pf-hpt', sh > 0 ? `${p.hp} / ${p.maxHp}  +${sh}` : `${p.hp} / ${p.maxHp}`); }   // v0.6.9 护盾
  CX.setW('pf-hp', p.hp / p.maxHp);
  const xpk = CX.progression.level >= CX.progression.maxLevel ? 1 : CX.progression.xp / CX.progression.xpToNext();
  CX.setW('pf-xp', xpk); CX.setW('xp-fill', xpk);
  updateOrbs(xpk);   // v0.9.6c 血球 / 资源球 / 经验弧
  CX.setText('xp-text', CX.progression.level >= CX.progression.maxLevel ? `等级 ${CX.progression.level}（满级）` : `等级 ${CX.progression.level} · 经验 ${CX.progression.xp} / ${CX.progression.xpToNext()}`);
  // 药水按钮：数量 + 冷却
  const pc = CX.inventory.stack('potion_s') + CX.inventory.stack('potion_l');
  CX.setText('pot-n', String(pc));
  const pcd = Math.max(0, potionReady - CX.T);
  (CX.$('pot-cd') as HTMLElement).style.height = `${pcd > 0 ? pcd / 12 * 100 : 0}%`;
  CX.$('sk-potion').classList.toggle('empty', pc === 0);
  setSweep(CX.$('sk-potion'), pcd / 12);
  const tf = CX.$('target-frame');
  if (CX.target && CX.target.alive && !CX.target.isBoss) {
    tf.style.display = 'block';
    CX.setText('tf-name', CX.target.name); CX.setW('tf-hp', CX.target.hp / CX.target.maxHp); CX.setText('tf-hpt', `${CX.target.hp} / ${CX.target.maxHp}`);
    CX.setText('tf-level', CX.target.type.level ? String(CX.target.type.level) : CX.target.type.ilvl >= 13 ? '??' : String(Math.max(1, CX.target.type.ilvl - 2)));
    const st = CX.target.status;
    CX.setText('tf-st', [st.isStunned ? '眩晕' : '', st.fearFrom !== undefined ? '恐惧' : '', st.vuln > 0 ? '易伤' : '', st.has('slow') ? '减速' : '', st.has('dot') ? '持续伤害' : ''].filter(Boolean).join(' '));
  } else tf.style.display = 'none';
  const bf = CX.$('boss-frame');
  const rh = CX.zone === 'raid' ? raidHud() : null;
  const wh = !rh && CX.zone !== 'dungeon' ? (wbHud() ?? packBossHud()) : null;   // v0.9.3d 世界首领 / v1.1.0 内容包首领
  const hb = rh ? rh.boss : wh ? wh.boss : CX.boss;
  const bi = hb?.intent as BossIntent | null;
  const db = demoBoss();   // v0.9.6c 截图 / 测试用假首领
  if (db) {
    bf.style.display = 'block';
    CX.setText('bf-name', db.name); CX.setW('bf-hp', db.hp); CX.setText('bf-hpt', `${Math.round(db.hp * 1e6)} / 1000000  (${Math.ceil(db.hp * 100)}%)`); CX.setText('bf-phase', db.phase);
    CX.$('castbar').style.display = 'block'; CX.setW('cb-fill', db.cast.progress); CX.setText('cb-name', db.cast.name);
    updateBossTicks(db.ticks, db.hp);
  } else if (hb && hb.alive && bi && (rh || bi.state === 'chase' || bi.state === 'attack')) {
    bf.style.display = 'block';
    CX.setText('bf-name', hb.name); CX.setW('bf-hp', hb.hp / hb.maxHp); CX.setText('bf-hpt', `${hb.hp} / ${hb.maxHp}  (${Math.ceil(hb.hp / hb.maxHp * 100)}%)`);
    CX.setText('bf-phase', rh ? rh.phase : wh ? wh.phase : CX.bossDef.phases[bi.phaseIndex]?.name ?? '');
    CX.$('castbar').style.display = bi.casting ? 'block' : 'none';
    if (bi.casting) CX.setW('cb-fill', bi.casting.progress);
    updateBossTicks(rh ? rh.ticks : wh ? wh.ticks : CX.bossDef.phases.slice(1).map(x => x.hpBelow), hb.hp / hb.maxHp);
  } else bf.style.display = 'none';
  tf.classList.toggle('below', bf.style.display === 'block');
  updateBuffHud(db ? null : (hb ?? null) as never, bf.style.display === 'block', tf.style.display === 'block' ? CX.target as never : null);   // v1.2.13 BUFF / DEBUFF
  for (const s of skillEls) {
    if (s.slot === 'skill4') { const on = CX.progression.level >= SKILL4_LEVEL; s.el.style.display = on ? '' : 'none'; if (!on) continue; }   // v0.7.8：25 级开放
    const pre = CX.loadout.preview(s.slot, CX.ctx());
    if (!pre) continue;
    const left = CX.loadout.cooldownLeft(s.slot, CX.T);
    s.cd.style.height = `${pre.stats.cooldown > 0 ? (left / pre.stats.cooldown) * 100 : 0}%`;
    s.el.classList.toggle('oncd', left > 0.05);   // v1.2.69 冷却中：不可用指针
    setSweep(s.el, pre.stats.cooldown > 0 && left > 0.05 ? left / pre.stats.cooldown : 0);
    s.cdt.textContent = left > 0.05 && pre.stats.cooldown > 1.5 ? (left >= 10 ? Math.ceil(left).toString() : left.toFixed(1)) : '';
    if (s.nm.textContent !== pre.displayName) s.nm.textContent = pre.displayName;
    const key = pre.baseId + pre.element;
    const baseDef = CX.cls.skills[pre.baseId];
    if (s.icKey !== key) { s.icKey = key; s.ic.innerHTML = skillIcon(pre.baseId, CX.ELEMENT_COLOR[pre.element], pre.element !== baseDef.element); }
    const onCd = left > 0.05;
    if (s.wasCd && !onCd && pre.stats.cooldown > 1.5) { s.el.classList.remove('ready'); void s.el.offsetWidth; s.el.classList.add('ready'); }
    s.wasCd = onCd;
    s.el.classList.toggle('variant', pre.displayName !== baseDef.name || pre.element !== baseDef.element);
    s.nm.style.color = CX.ELEMENT_COLOR[pre.element];
    // 射程外的技能变暗（远程职业很有用）
    const tgtOk = !CX.target || !CX.target.alive || pre.shape === 'circle' && !pre.tags.includes('targeted') || CX.dist2d(CX.target.pos, CX.player.pos) <= pre.stats.range + (pre.shape === 'single' && !pre.tags.includes('ranged') ? 1.6 : 1);
    s.el.classList.toggle('oor', !tgtOk);
  }
  { // 翻滚键冷却
    const left = CX.dodge.cooldownLeft(CX.T), cd = CX.dodge.cooldown;
    dodgeHud.cd.style.height = `${left > 0 ? left / cd * 100 : 0}%`;
    ensureRune(dodgeHud.el); setSweep(dodgeHud.el, left > 0.05 ? left / cd : 0);
    dodgeHud.cdt.textContent = left > 0.05 ? left.toFixed(1) : '';
    if (dodgeHud.was && left <= 0.05) { dodgeHud.el.classList.remove('ready'); void dodgeHud.el.offsetWidth; dodgeHud.el.classList.add('ready'); }
    dodgeHud.was = left > 0.05;
    dodgeHud.el.classList.toggle('oor', CX.player.status.isStunned);
  }
  CX.setText('zone-name', CX.zone === 'world' ? (CX.player.pos.x > 18 ? '狼林' : '灰石营地') : CX.zone === 'field' ? fieldSubArea() : isWildId(CX.zone) ? wildSubArea(CX.zone) : CX.zone === 'raid' ? raidZoneName() : CX.layout.def.name);
  const it = CX.currentInteractable();
  const ib = CX.$('interact');
  ib.style.display = it && CX.player.alive ? 'block' : 'none';
  if (it) CX.setText('interact', `${CX.isTouch ? '' : '[E] '}${it.label}`);
  CX.renderTracker();
}

/** 原野里的小地名 */
export function wildSubArea(id: WildId) {
  const w = WILD[id], lx = CX.player.pos.x - w.origin.x, lz = CX.player.pos.z - w.origin.z;
  for (const c of w.camps) if (Math.hypot(lx - c.x, lz - c.z) < c.r + 2) return `${w.name} · ${c.name}`;
  let best = '', bd = Infinity;
  for (const [k, sp] of Object.entries(w.spots)) { if (/_(altar|core|top)$|route$/.test(k)) continue; const d = Math.hypot(lx - sp.x, lz - sp.z); if (d < sp.r + 3 && d < bd) { bd = d; best = sp.name; } }
  return best ? `${w.name} · ${best}` : w.name;
}

export function fieldSubArea() {
  for (const id of ['outpost', 'bandit_camp', 'ruins', 'boar_meadow', 'village', 'temple', 'mesa', 'old_mine'] as const) { const a = AREAS[id]; if (Math.hypot(CX.player.pos.x - a.x, CX.player.pos.z - a.z) < (a.r ?? 10) + 2) return `翠风原野 · ${a.name}`; }
  if (LAKE_ON && lakeDist(CX.player.pos.x - CX.F.x, CX.player.pos.z - CX.F.z) > -14) return '翠风原野 · ' + LAKE.name;   // 11-19 qllake
  if (Math.abs(CX.player.pos.z - CX.F.z - riverZ(CX.player.pos.x - CX.F.x)) < 7) return '翠风原野 · 苇河';
  if (Math.hypot(CX.player.pos.x - CX.F.x - FIELD_SPOTS.hut.x, CX.player.pos.z - CX.F.z - FIELD_SPOTS.hut.z) < 14) return '翠风原野 · 白桦林';
  return '翠风原野';
}

export function updatePlates() {
  for (const e of CX.enemies) {
    const show = e.z === CX.zone && e.rig.root.visible && (e.alive || CX.T - e.deadAt < 0.1) && CX.dist2d(e.pos, CX.player.pos) < 35;
    if (!show) { e.plate.style.display = 'none'; continue; }
    const s = CX.project(e.pos.clone().setY(e.pos.y + e.rig.scale * 2.5 + 0.3));
    e.plate.style.display = s.vis ? '' : 'none';
    e.plate.style.left = `${s.x}px`; e.plate.style.top = `${s.y}px`;
    (e.plate.querySelector('i') as HTMLElement).style.width = `${(e.hp / e.maxHp) * 100}%`;
    e.plate.style.outline = e === CX.target ? '1px solid #ffd100' : '';
    e.plate.classList.toggle('cur', e === CX.target);
  }
  for (const n of CX.npcs) {
    const show = n.z === CX.zone && CX.dist2d(n.rig.root.position, CX.player.pos) < 40;
    if (!show) { n.plate.style.display = 'none'; continue; }
    const s = CX.project(n.rig.root.position.clone().setY(n.rig.root.position.y + ((n.rig.root.userData.labelH as number | undefined) ?? 2.9)));   // 11-14d 放大的 NPC（伊奥拉）按 labelH 放到头顶
    n.plate.style.display = s.vis ? '' : 'none';
    n.plate.style.left = `${s.x}px`; n.plate.style.top = `${s.y}px`;
    const mk = CX.quests.npcMarker(n.id, CX.progression.level);
    const html = `<div class="mk ${mk === '…' ? 'grey' : ''}">${mk === '…' ? '?' : mk}</div><div class="npn">${NPCS[n.id].name}</div><div class="npt">&lt;${NPCS[n.id].title}&gt;</div>`;
    if (n.plate.dataset.h !== html) { n.plate.dataset.h = html; n.plate.innerHTML = html; }
  }
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindHudBar(__ctx: Ctx) {
  CX = __ctx;
  bindRuneHud(CX);
  bindBuffHud(CX);
  ensureRune(CX.$('sk-potion'));
  {
    const pb = CX.$('sk-potion');
    const down = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); usePotion(); };
    pb.addEventListener('touchstart', down, { passive: false }); pb.addEventListener('mousedown', down);
    const rb = CX.$('sk-recall');
    const rdown = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); CX.startRecall(); };
    rb.addEventListener('touchstart', rdown, { passive: false }); rb.addEventListener('mousedown', rdown);
  }
  mini = CX.$('minimap-cv') as HTMLCanvasElement;
  mctx = mini.getContext?.('2d') ?? null;
  tipEl = CX.$('tooltip');
  skillEls = SLOT_IDS.map(slot => {
  const el = CX.$(`sk-${slot}`);
  el.innerHTML = `<div class="ic"></div><div class="cd"></div><div class="cdt"></div><div class="key">${CX.isTouch ? '' : SKILL_KEYS[slot]}</div><div class="nm"></div>${skillRuneHtml()}`;
  el.addEventListener('mouseenter', ev => showTip(skillTip(slot), ev));
  el.addEventListener('mouseleave', hideTip);
  let press = 0;
  const down = (ev: Event) => {
    ev.preventDefault(); ev.stopPropagation(); if (slot === 'basic') CX.holdBasic = true; CX.tryCast(slot);
    // 触屏：长按 0.45 秒在按钮旁显示技能说明，松手消失
    if (ev.type === 'touchstart') { clearTimeout(press); press = window.setTimeout(() => { const r = el.getBoundingClientRect(); showTip(skillTip(slot), { clientX: Math.max(8, r.left - 300), clientY: r.top }, true); }, 450); }
  };
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('mousedown', down);
  const up = () => { if (slot === 'basic') CX.holdBasic = false; if (press) { clearTimeout(press); press = 0; hideTip(); } };
  el.addEventListener('touchend', up); el.addEventListener('touchcancel', up); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
  return { slot, el, ic: el.querySelector('.ic') as HTMLElement, icKey: '', wasCd: false, cd: el.querySelector('.cd') as HTMLElement, cdt: el.querySelector('.cdt') as HTMLElement, nm: el.querySelector('.nm') as HTMLElement };
});
  dodgeHud = { el: CX.$('sk-dodge'), get cd() { return this.el.querySelector('.cd') as HTMLElement; }, get cdt() { return this.el.querySelector('.cdt') as HTMLElement; }, was: false };
}
