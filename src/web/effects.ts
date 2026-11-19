// 技能特效：弹体、范围、闪电、地面圈、命中粒子
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindEffects(C) 初始化
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
import * as GFX from './groundfx';
import { zoneStorm } from './zonestorm';
import { arcBolt, shockField, BOLT_CTX } from './arcbolt';   // v1.2.72
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
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD } from '../data/zone_field';
import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig } from './enemy_types';
import { bindTitle, CLASS_INFO, LOCKED_CLASSES, newLook, delArmed, MAP_NAME, fmtTime, slotMeta, renderTitle, pickClass, titleModel, demoSkill, swapPlayerModel, importSave, startSelected, startGame, startChar } from './title';
import { bindHudBar, potionReady, usePotion, mini, mctx, miniTimer, updateMinimap, updateCompassPip, tipEl, showTip, hideTip, skillTip, SKILL_KEYS, skillEls, dodgeHud, updateHUD, wildSubArea, fieldSubArea, updatePlates } from './hudbar';
import { bindShopMap, goldHtml, stacksHtml, ShopTab, openShop, renderShop, openTravel, WmView, wmView, wmMap, WORLD_NODES, mapLock, openWorldMap, toggleWorldMap, allTargets, MK_TEXT, worldMapLegend, renderWorldMap, wmCv, drawWorldMap } from './shopmap';
import { bindGuideUi, pinned, unpinned, focusId, npcName, trackedIds, focusQuestId, safe, trackKey, saveTrack, loadTrack, setFocus, toggleTrack, Guide, guide, guidePath, guideTimer, guideFor, arriveR, goalDist, updateGuide, autoPath, pendingArrive, resumeAuto, inCombatNow, startAutoPath, toggleAutoPath, onAutoArrive, onZoneChanged, renderTracker, CHEV_MAX, chevMesh, chevM4, chevQ, chevS, chevP, chevC, chevUp, onBridge, pathY, updatePathLine, objMarker, updateObjMarker } from './guideui';
import { bindPanels, applySettings, renderSettings, saveAgo, bagSel, itemSlotHtml, itemKind, STAT_LABEL, itemTip, statLine, doEquip, doUnequip, renderBag, renderBagTip, DOLL_LEFT, DOLL_RIGHT, DOLL_BOTTOM, slotSilhouette, dollSlot, preview, tryOn, renderChar, dgSrc, dgFilter, openDropGuide, tryGuideItem, renderDropGuide, ROMAN, talState, renderTalents, talentTip, renderTalentTip } from './panels';
import { bindTravel, waypoints, BANK_SIZE, BANK_KEY, loadBank, saveBank, wildLock, BASE_CAMPS, allCamps, showLoading, hideLoading, goPending, goMap, defaultArrive, useGate, checkWaypoints, openWaypoints, RECALL_TIME, recall, recallDest, startRecall, cancelRecall, updateRecall, openBank, renderBank, WorldEventState, worldEvents, updateWorldEvents, startEvent, spawnEventWave, finishEvent } from './travel';
import { bindTutorial, TutId, TUT_ORDER, tutStep, tutReplay, dummy, DUMMY_POS, tutD, tutWantsDummy, kc, menuBtn, TUT, tutStart, tutEnter, tutAdvance, tutFinish, tutClearCircle, tutEvent, tutTimer, updateTutorial, updateTutCircle, tutHls, renderTut, replayTutorial, spawnDummy } from './tutorial';
import { bindLootNpc, loots, spawnLoot, updateLoot, pickupReq, nearestLoot, clearLootInZone, Npc, spawnWildNpcs, npcs, addNpc, Interactable, currentInteractable } from './lootnpc';
import type { Ctx, Unit } from './main';

import { whirlwind } from './vfx';
let CX!: Ctx;

// ======================================================================
// 特效
// ======================================================================
export const fxList: { obj: THREE.Object3D; t: number; dur: number; update: (k: number) => void }[] = [];

export let addFx!: (obj: THREE.Object3D, dur: number, update: (k: number) => void) => void;

export function spawnRing(p: Pos, radius: number, color: string, dur: number) {
  // v1.2.78 正圆光环 → 不规则冲击前沿（groundfx 共用件）；颜色反查元素用总纲色板，查不到就按给的颜色走灵雾纹理
  const c = color.toLowerCase(); let el: Element | null = null;
  for (const [k, v] of Object.entries(CX.ELEMENT_COLOR)) if (v.toLowerCase() === c) { el = k as Element; break; }
  if (c === '#ffffff' || c === '#fff') el = 'physical';
  if (el) GFX.groundBurst(p, radius, el, dur);
  else GFX.groundBurst(p, radius, 'spirit', dur, new THREE.Color(color).getHex());
}

/** 刀光：贴着角色朝向的弧形 */
export function spawnSlash(color: string, flip: boolean) {
  const m = G.makeSlashArc(color, 1.7);
  const g = new THREE.Group(); g.add(m);
  g.position.copy(CX.player.pos).setY(CX.player.pos.y + 1.15);
  g.rotation.y = CX.player.rig.root.rotation.y;
  m.rotation.set(-Math.PI / 2 + (flip ? 0.5 : -0.5), 0, Math.PI / 2 + (flip ? Math.PI : 0));
  m.position.z = 0.4;
  M.noOutline(m);
  addFx(g, 0.22, k => { (m.material as THREE.ShaderMaterial).uniforms.fade.value = 1 - k; m.rotation.z += (flip ? -1 : 1) * 0.12; g.position.copy(CX.player.pos).setY(CX.player.pos.y + 1.15); });
}

export function spawnWhirl(color: string, radius: number) {
  whirlwind(() => CX.player.pos, radius, color); return;   // v0.9.1 样板：新旋风斩
  for (let i = 0; i < 2; i++) {
    const m = M.noOutline(G.makeSlashArc(color, radius * (0.75 + i * 0.25), Math.PI * 1.6));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group(); g.add(m); g.position.copy(CX.player.pos).setY(CX.player.pos.y + 0.9 + i * 0.3);
    addFx(g, 0.5, k => { g.rotation.y -= 0.45; g.position.copy(CX.player.pos).setY(CX.player.pos.y + 0.9 + i * 0.3); (m.material as THREE.ShaderMaterial).uniforms.fade.value = 1 - k; });
  }
}

export function spawnPillar(at: THREE.Vector3, color: string) {
  const m = M.noOutline(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  m.position.copy(at).setY(G.gy(at.x, at.z) + 7);
  addFx(m, 0.9, k => { m.scale.set(1 - k * 0.7, 1, 1 - k * 0.7); (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k); });
}

export function spawnLightning(from: THREE.Vector3, to: THREE.Vector3, els?: Element[]) {
  arcBolt(from, to, { els: els ?? BOLT_CTX.els ?? ['nature'], life: 0.42, width: 0.06, branches: 2 });   // v1.2.73 弹射电弧 0.16→0.42 秒；v1.2.72 分形电弧（蓝紫 / 电青），取代 1 像素白线
  if (Math.random() < 0.5) CX.audio.element('nature');
}

export const zonesFx: { p: Pos; r: number; el: Element; left: number }[] = [];

/** v1.2.73 某元素的地面区域表现已由技能自己画（暴风雪 blizzardStorm）：这期间同元素区域只登记不画 */
export const ZONE_FX: { skip: Element | null } = { skip: null };
export function spawnZoneFx(p: Pos, r: number, el: Element, dur: number) {
  if (ZONE_FX.skip === el) { zonesFx.push({ p, r, el, left: dur }); return; }
  if (BOLT_CTX.on && (el === 'nature' || el === 'arcane')) { shockField(p, r, el, dur); zonesFx.push({ p, r, el, left: dur }); return; }   // v1.2.72 电弧类技能的地面：电焦裂纹 + 小电弧，不画圆盘
  // v1.2.79b 冰霜地面区域也走通用件（Rhett 11-04 00:46：旧 iceField 冰块不好看），用暴风雪同款霜纹 / 雪片 / 风雪拖线
  zoneStorm(p, r, el, dur);   // v1.2.79 通用六层区域件（AI 贴花 + 雾 + 流动带 + 粒子 + 冲击点 + 起手闪），内含 v1.2.78 groundfx 边缘层
  zonesFx.push({ p, r, el, left: dur });
}

/** v1.2.56 不规则冰面：两层带噪声边缘的冰壳（外层半透明蓝、内层泛白霜）+ 随机冰刺（逐个长出、结束前碎裂），最后 20% 淡出 */
/** v1.2.56b 霜纹贴图（程序化：裂纹 + 霜点 + 中心泛白），全局缓存一张 */
let frostTex: THREE.CanvasTexture | null = null;
function getFrostTex() {
  if (frostTex) return frostTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  if (g) {
    const rg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.6, 'rgba(225,240,255,0.85)'); rg.addColorStop(1, 'rgba(200,225,250,0.7)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(70,120,170,0.75)'; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {   // 放射裂纹，带分叉
      let x = S / 2 + (Math.random() - 0.5) * 30, y = S / 2 + (Math.random() - 0.5) * 30, a = Math.random() * 6.28; g.lineWidth = 1 + Math.random() * 1.6; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { a += (Math.random() - 0.5) * 0.7; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); if (Math.random() < 0.2) { g.moveTo(x, y); } }
      g.stroke();
    }
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  }
  frostTex = new THREE.CanvasTexture(c); frostTex.colorSpace = THREE.SRGBColorSpace; return frostTex;
}

export function iceField(p: Pos, r: number, dur: number) {
  const y = G.gy(p.x, p.z);
  const patch = (rk: number, color: number, op: number, lift: number, seed: number) => {
    const N = 30, sh = new THREE.Shape(), ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, n = 0.82 + 0.1 * Math.sin(a * 3 + ph[0] + seed) + 0.07 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 9 + ph[2]) + (Math.random() - 0.5) * 0.06;
      const x = Math.cos(a) * r * rk * n, z = Math.sin(a) * r * rk * n; if (i === 0) sh.moveTo(x, z); else sh.lineTo(x, z);
    }
    const geo = new THREE.ShapeGeometry(sh); { const uv = geo.attributes.uv, pos = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + 0.5, pos.getY(i) / (2 * r) + 0.5); }   // v1.2.56b 霜纹按半径铺满
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map: getFrostTex(), roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0, depthWrite: false, emissive: 0x6a9cc8, emissiveIntensity: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }));
    M.noOutline(m); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(p.x, y + lift, p.z); m.renderOrder = 1; m.receiveShadow = true;
    addFx(m, dur, k => { (m.material as THREE.MeshStandardMaterial).opacity = op * Math.min(1, k * dur / 0.15) * Math.min(1, (1 - k) * 5); });
  };
  patch(1, 0xbfe0f8, 0.85, 0.05, 0); patch(0.7, 0xffffff, 0.7, 0.07, 2.1);   // v1.2.56b 加亮：截图里原来几乎看不见
  const n = Math.round(8 + r * 1.6);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, d = r * 0.85 * Math.sqrt(Math.random()), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const h = 0.45 + Math.random() * (d < r * 0.4 ? 1.3 : 0.8), w = 0.12 + Math.random() * 0.14;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88, emissive: 0x3a6a90, emissiveIntensity: 0.35, flatShading: true }));
    M.noOutline(m); m.castShadow = true;
    m.position.set(x, G.gy(x, z) + h * 0.42, z); m.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 6.28, (Math.random() - 0.5) * 0.7);
    const t0 = Math.random() * 0.35, grow = 0.12, endAt = 1 - 0.3 / dur;
    let broke = false;
    addFx(m, dur, k => {
      const t = k * dur, g = Math.max(0, Math.min(1, (t - t0) / grow));
      if (k < endAt) m.scale.set(g, g * (1 + 0.15 * Math.sin(g * 3.14)), g);
      else { const e = (k - endAt) / (1 - endAt); m.scale.setScalar(Math.max(0.01, 1 - e)); (m.material as THREE.MeshStandardMaterial).opacity = 0.88 * (1 - e);
        if (!broke) { broke = true; CX.particles.emit({ x, y: G.gy(x, z) + h * 0.4, z }, { count: 6, color: 0xdff4ff, color2: 0xffffff, speed: 2.5, up: 1.5, radius: 0.2, life: 0.45, size: 0.18, gravity: 8 }); } }
    });
  }
}

export function updateFx(dt: number) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i]; f.t += dt; const k = Math.min(1, f.t / f.dur); f.update(k);
    if (k >= 1) { CX.scene.remove(f.obj); fxList.splice(i, 1); }
  }
  for (let i = zonesFx.length - 1; i >= 0; i--) {
    const z = zonesFx[i]; z.left -= dt;
    if (z.left <= 0) { zonesFx.splice(i, 1); continue; }
    if (Math.random() < 0.7) CX.particles.emit({ x: z.p.x, y: 0.1, z: z.p.z }, { count: 2, color: z.el === 'fire' ? 0xff4a10 : 0x9fe8ff, color2: z.el === 'fire' ? 0xffc040 : 0xffffff, speed: 0.4, up: 2.2, radius: z.r, life: 0.9, size: 0.35, drag: 0.5 });
  }
}

// ---------- 战斗飘字：DOM 对象池复用；同一单位短时间内的数字分道错开；手机上数量上限更低 ----------
export type FloatKind = 'dmg' | 'crit' | 'tick' | 'hurt' | 'heal' | 'absorb' | 'immune' | 'info';

export interface Floater { el: HTMLDivElement; pos: THREE.Vector3; t: number; dur: number; kind: FloatKind; dx: number }

export let FLOAT_CAP!: 14 | 34;

export const floatPool: Floater[] = [];

export const floats: Floater[] = [];

export const floatLane = new WeakMap<Unit, { n: number; t: number }>();

export const escHtml = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function releaseFloater(f: Floater) { f.el.style.display = 'none'; floatPool.push(f); }

export function showFloat(u: Unit, kind: FloatKind, html: string, color: string, scale = 1) {
  // 超过上限：先挤掉最旧的持续伤害 / 普通伤害
  if (floats.length >= FLOAT_CAP) {
    let i = floats.findIndex(f => f.kind === 'tick'); if (i < 0) i = floats.findIndex(f => f.kind === 'dmg'); if (i < 0) i = 0;
    releaseFloater(floats[i]); floats.splice(i, 1);
  }
  let f = floatPool.pop();
  if (!f) { const el = document.createElement('div'); CX.$('floats').appendChild(el); f = { el, pos: new THREE.Vector3(), t: 0, dur: 1, kind, dx: 0 }; }
  // 分道：0.45 秒内同一单位的第 n 个数字往上叠、左右交错
  const L = floatLane.get(u) ?? { n: 0, t: -9 };
  if (CX.T - L.t > 0.45) L.n = 0;
  const lane = L.n++ % 5; L.t = CX.T; floatLane.set(u, L);
  f.pos.copy(u.pos); f.pos.y += u.rig.scale * (kind === 'hurt' ? 2.0 : 2.4) + lane * 0.34;
  f.dx = [0, -1, 1, -0.6, 0.6][lane] * 28 + (kind === 'hurt' || (kind === 'tick' && u === CX.player) ? 34 : 0);
  f.t = 0; f.kind = kind; f.dur = kind === 'crit' ? 1.15 : kind === 'tick' ? 0.75 : kind === 'info' ? 1.3 : 1;
  f.el.className = `fl fl-${kind}`; f.el.innerHTML = html; f.el.style.color = color;
  f.el.style.fontSize = kind === 'info' ? `${15 * scale}px` : '';
  f.el.style.opacity = '0'; f.el.style.display = '';
  floats.push(f);
}

/** 伤害数字颜色：物理白色，元素伤害淡淡染色（自然=闪电淡蓝，避免和治疗的绿色混淆） */
export const DMG_COLOR: Record<Element, string> = { lightning: '#d8e8ff', physical: '#ffffff', fire: '#ffa060', frost: '#9fe0ff', shadow: '#c890ff', holy: '#fff0a0', nature: '#b8ecff', arcane: '#e0a8ff' };

/** 普通提示飘字（冷却重置、增益、经验等），不受伤害数字设置影响 */
export function floatText(u: Unit, text: string, color: string, scale = 1, _crit = false) { showFloat(u, 'info', escHtml(text), color, scale); }

/** 战斗数字：白色普通 / 黄橙暴击（放大弹出 +「暴击」）/ 绿色治疗 / 吸收 / 免疫 / 玩家受伤红色 / 持续伤害小字；按设置过滤 */
export function combatText(u: Unit, kind: FloatKind, amount: number, el: Element = 'physical') {
  const m = CX.settings.dmgText;
  if (m === 'off') return;
  const mine = u === CX.target || u === CX.player;
  if (m === 'compact' && (kind === 'tick' || (kind === 'dmg' && !mine))) return;
  if (CX.isMobile && kind === 'tick' && !mine) return;                       // 手机：持续伤害只显示当前目标和自己
  switch (kind) {
    case 'crit': showFloat(u, kind, `<small>暴击</small>${amount}`, '#ffb22e'); break;
    case 'dmg': showFloat(u, kind, `${amount}`, DMG_COLOR[el]); break;
    case 'tick': showFloat(u, kind, `${amount}`, u === CX.player ? '#ff7a7a' : el === 'physical' ? '#e8d8c8' : DMG_COLOR[el]); break;
    case 'hurt': showFloat(u, kind, `-${amount}`, '#ff3b3b'); break;
    case 'heal': showFloat(u, kind, `+${amount}`, '#4dff6a'); break;
    case 'absorb': showFloat(u, kind, `吸收 ${amount}`, '#9fd8ff'); break;
    case 'immune': showFloat(u, kind, '免疫', '#fff2b0'); break;
    default: break;
  }
}

export const v3 = new THREE.Vector3();

export function project(p: THREE.Vector3): { x: number; y: number; vis: boolean } {
  v3.copy(p).project(CX.camera);
  return { x: (v3.x + 1) / 2 * window.innerWidth, y: (1 - v3.y) / 2 * window.innerHeight, vis: v3.z < 1 };
}

export function updateFloats(dt: number) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt;
    if (f.t > f.dur) { releaseFloater(f); floats.splice(i, 1); continue; }
    f.pos.y += dt * (f.kind === 'crit' ? 0.7 : f.kind === 'tick' ? 0.9 : 1.25);
    const s = project(f.pos);
    if (!s.vis) { f.el.style.display = 'none'; continue; }
    f.el.style.display = '';
    // 暴击：0.07 秒放大到 1.9 倍再弹回；其它：轻微弹出
    const k = f.kind === 'crit' ? (f.t < 0.07 ? 1 + f.t / 0.07 * 0.9 : Math.max(1, 1.9 - (f.t - 0.07) / 0.12 * 0.9))
      : f.t < 0.06 ? 0.7 + f.t / 0.06 * 0.4 : Math.max(1, 1.1 - (f.t - 0.06) * 2);
    const fade = 1 - Math.max(0, (f.t - f.dur * 0.55) / (f.dur * 0.45));
    f.el.style.opacity = fade.toFixed(2);
    f.el.style.transform = `translate3d(${(s.x + f.dx * Math.min(1, f.t * 6)).toFixed(1)}px,${s.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${k.toFixed(3)})`;
  }
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindEffects(__ctx: Ctx) {
  CX = __ctx;
  addFx = (obj: THREE.Object3D, dur: number, update: (k: number) => void) => { CX.scene.add(obj); fxList.push({ obj, t: 0, dur, update }); };
  GFX.bindGroundFx({ add: addFx, groundY: (x, z) => G.gy(x, z), time: () => CX.T });
  FLOAT_CAP = CX.isMobile ? 14 : 34;
}
