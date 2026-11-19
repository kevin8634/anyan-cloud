// 金币材料显示、商店（购买 / 出售 / 强化 / 分解）、旧传送阵面板、世界地图与区域地图
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindShopMap(C) 初始化
import * as THREE from 'three';
import { exFogPct, isExMap, exWaystones } from './explore';
import { drawFog, fogGet, fogSeenAt, FOG_CELL } from './fog';
import { bindWorldMap3d, wm3dRetry, wm3dActive, wm3dShow, wm3dZoomTo, wm3dFadeOut, wm3dBusy, W3Poi, W3Data, W3Cloud } from './worldmap3d';
import * as VFX from './vfx';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { LootGenerator, ItemInstance, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME, affixRollRange } from '../core/Loot';
import { Inventory, EQUIP_SLOTS, SLOT_NAME, EQUIP_SLOT_NAME, EquipSlot, CharStats } from '../core/Inventory';
import { TalentTree, Progression, TalentNodeDef, MAX_LEVEL } from '../core/TalentTree';
import { QuestLog, QuestDef } from '../core/Quest';
import { SaveManager, GameSave, LoadStatus } from '../core/SaveManager';
import { Roster, CharMeta, randomName, nameError, exportFileName, MAX_SLOTS } from '../core/Roster';
import { BrowserStorage, downloadText, pickTextFile } from './save';
import { GAME_VERSION, CHANGELOG } from './version';
import { Preview } from './preview';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName, milestones, MILESTONE_TEXT, slotGroup, SalvageOpts } from '../core/Forge';
import { ELEM_NAME, ELEM_COLOR } from '../core/Resonance';
import { slotSilhouette, openDropGuide } from './panels';
import { DARK_ITEMS, engraveFits } from '../data/darkgold';
export const ENGRAVE_COST = { gold: 300, shards: 10 };
/** 拓印：把典藏里的暗金效果刻到装备上 */
export function doEngrave(it: ItemInstance, darkId: string): string | null {
  const d = DARK_ITEMS.find(x => x.id === darkId);
  if (!d || !CX.codex.has(`print|${darkId}`)) return '还没有拓印这件暗金';
  if (!engraveFits(d.slot, it.slot)) return '部位不符';
  if (it.quality === 'dark') return '暗金本身不能再拓印';
  if (CX.inventory.gold < ENGRAVE_COST.gold) return `金币不足（需要 ${ENGRAVE_COST.gold}）`;
  if (CX.inventory.stack('mat_darkshard') < ENGRAVE_COST.shards) return `暗金碎片不足（需要 ${ENGRAVE_COST.shards}）`;
  CX.inventory.spendGold(ENGRAVE_COST.gold); CX.inventory.useStack('mat_darkshard', ENGRAVE_COST.shards);
  CX.gen.engrave(it, darkId); CX.inventory.notify();
  return null;
}
import { toggleRaidMap, openRaidMap, dmDef, dmTeleport, renderRaidMap } from './raidmap';
import { rm3dRetry, rm3dActive } from './raidmap3d';
import { packDungeonHere } from './packdungeon';
import { allDungeonPortals, goMap } from './travel';
import { raidRec, raidDebug } from './raid';
import { weekKey } from '../data/raid_molten';
import { poisFor, drawPoiIcon, legendHtml, poiTip, Poi, POI_STYLE } from './mappoi';
import { TEXTURES } from './assets.gen';
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
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS, PACK_WILD_IDS } from '../data/zones_wild';
import { buildWild, updateWild, WildScene, wildGroundY } from './wild';
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD, BRIDGE2, FIELD_HALF, LAKE_ON, LAKE, LAKE_DOCK, RIVER_X0, lakeShore } from '../data/zone_field';
import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig } from './enemy_types';
import { bindTitle, CLASS_INFO, LOCKED_CLASSES, newLook, delArmed, MAP_NAME, fmtTime, slotMeta, renderTitle, pickClass, titleModel, demoSkill, swapPlayerModel, importSave, startSelected, startGame, startChar } from './title';
import { bindHudBar, potionReady, usePotion, mini, mctx, miniTimer, updateMinimap, updateCompassPip, tipEl, showTip, hideTip, skillTip, SKILL_KEYS, skillEls, dodgeHud, updateHUD, wildSubArea, fieldSubArea, updatePlates } from './hudbar';
import { renderRepairTab } from './durability_ui';
import { autoSellJunk, walletHtml, lockBtnHtml, toggleLockUi, openExchange } from './smith';
import { isRepMap, repPts, repTier, REP_TIERS, repOffers, repWhyNot, repBuy, repBuyCount } from './regional';
import type { Ctx } from './main';

let CX!: Ctx;

// ----- 金币 / 材料显示 -----
export function goldHtml() { return `<span class="gold">${uiIcon('ui_gold', 'mini')}${CX.inventory.gold}</span>`; }

export const JUNK_IDS = ['junk_fang', 'junk_cloth', 'junk_trinket', 'junk_ash'];
/** 材料 / 药水 / 兑换货币；灰色杂物灰显（v0.5 C） */
export function stacksHtml(ids = ['mat_dust', 'mat_shard', 'mat_essence', 'mat_proof', 'mat_badge', 'mat_heart', 'mat_soul', 'mat_darkshard', 'potion_s', 'potion_l', 'cur_ember', 'cur_frost', 'cur_sigil', ...JUNK_IDS]) {
  return ids.filter(id => CX.inventory.stack(id) > 0).map(id => { const j = JUNK_IDS.includes(id); return `<span class="stk${j ? ' junk' : ''}" data-tip-stack="${id}" title="${CX.forge.stackDef(id)?.name ?? id}${j ? '（灰色杂物，商人自动收购）' : ''}">${stackIcon(id).replace('pic ', `pic mini ${j ? 'gray ' : ''}`)}${CX.inventory.stack(id)}</span>`; }).join('');
}

import { renderSalvagePanel } from './salvage_ui';
// ----- 商店：购买 / 修理 / 强化 / 淬炼 / 分解 / 兑换（v0.5 C 取消装备出售；主线 v0.6.6：B 的修理、兑换页 + A 的部位强化、淬炼、一键分解） -----
export type ShopTab = 'buy' | 'repair' | 'upgrade' | 'reforge' | 'salvage' | 'exchange' | 'rep';
/** 打开商店的是谁：补给商（没有「兑换」页）/ 铁匠 / 葛尔达 */
export let shopRole: 'supply' | 'smith' | 'gerda' = 'gerda';
/** 一键分解的勾选（本次游戏内记住） */
let salvConfirm = false;
const matsLine = (mats: { id: string; count: number }[]) => mats.map(m => { const have = CX.inventory.stack(m.id); return `<span class="${have >= m.count ? 'ln' : 'cmp-dn'}">${stackIcon(m.id).replace('pic ', 'pic mini ')}${CX.forge.stackDef(m.id)!.name} ${have}/${m.count}</span>`; }).join(' ');

export function openShop(role: 'supply' | 'smith' | 'gerda' = 'gerda') {
  shopRole = role;
  if (role === 'supply' && CX.shopTab === 'exchange') CX.shopTab = 'buy';
  CX.togglePanel('dialog', false);
  CX.shop.restock(Math.max(1, CX.progression.level));
  CX.shopSel = null;
  const n = CX.npcs.find(x => x.id === 'gerda');
  if (n) { n.rig.root.rotation.y = Math.atan2(CX.player.pos.x - n.rig.root.position.x, CX.player.pos.z - n.rig.root.position.z); n.rig.anim?.play('interact'); }
  CX.togglePanel('shop', true);
  CX.audio.shop();
  autoSellJunk();   // v0.5 C：拜访任何商人，灰色杂物自动卖钱
}

export function renderShop() {
  if (!CX.started || CX.$('shop').style.display !== 'flex') return;
  document.querySelectorAll('#shop .tab').forEach(t => { t.classList.toggle('on', (t as HTMLElement).dataset.tab === CX.shopTab); const tb = (t as HTMLElement).dataset.tab; (t as HTMLElement).style.display = (tb === 'exchange' && shopRole === 'supply') || (tb === 'rep' && !(shopRole === 'supply' && isRepMap(CX.zone))) ? 'none' : ''; });
  if (CX.shopTab === 'rep' && !(shopRole === 'supply' && isRepMap(CX.zone))) CX.shopTab = 'buy';
  CX.$('shop-gold').innerHTML = walletHtml(false);
  CX.$('shop-mats').innerHTML = stacksHtml(['mat_dust', 'mat_shard', 'mat_essence', 'mat_proof', 'mat_badge', 'mat_heart', 'mat_soul', 'mat_darkshard', 'potion_s', 'potion_l']) || '<span style="opacity:.6">还没有材料：分解装备获得</span>';
  const body = CX.$('shop-body'), side = CX.$('shop-side');
  body.innerHTML = ''; side.innerHTML = '';
  const allItems = [...CX.inventory.equippedItems().map(i => ({ it: i, eq: true })), ...CX.inventory.bag.map(i => ({ it: i, eq: false }))];
  const gridOf = (list: { it: ItemInstance; eq: boolean }[], onPick: (it: ItemInstance) => void) => {
    const g = document.createElement('div'); g.className = 'grid';
    if (!list.length) g.innerHTML = '<p class="hint">背包里没有装备</p>';
    list.forEach(({ it, eq }) => {
      const c = document.createElement('div'); c.className = 'cell' + (CX.shopSel === it.id ? ' sel' : '');
      c.innerHTML = `${CX.itemSlotHtml(it)}<span class="nm" style="color:${QUALITY_COLOR[it.quality]}">${it.name}</span>${eq ? '<span class="eqm">已装备</span>' : ''}`;
      c.dataset.uid = it.id;
      c.onclick = () => onPick(it);
      g.appendChild(c);
    });
    body.appendChild(g);
  };
  const selItem = CX.shopSel ? CX.inventory.find(CX.shopSel) : null;
  if (CX.shopTab === 'buy') {
    CX.shop.offers.forEach((o, i) => {
      const row = document.createElement('div'); row.className = 'srow';
      const why = CX.shop.whyCannotBuy(i);
      if (o.kind === 'stack') {
        const d = CX.forge.stackDef(o.id)!;
        row.innerHTML = `<div class="slot q-${d.quality}">${stackIcon(o.id)}</div><div class="sinfo"><b class="${QUALITY_COLOR[d.quality] === '#FFFFFF' ? 'dk' : ''}" style="color:${QUALITY_COLOR[d.quality] === '#FFFFFF' ? '#3a2410' : QUALITY_COLOR[d.quality]}">${d.name}</b><small>${d.desc}（拥有 ${CX.inventory.stack(o.id)}）</small></div>
          <div class="price">${uiIcon('ui_gold', 'mini')}${o.price}</div><button class="btn" data-buy="${i}" ${why ? 'disabled' : ''}>购买</button><button class="btn" data-buy5="${i}" ${CX.inventory.gold < o.price * 5 ? 'disabled' : ''}>×5</button>`;
      } else {
        row.innerHTML = `${CX.itemSlotHtml(o.item)}<div class="sinfo"><b class="${QUALITY_COLOR[o.item.quality] === '#FFFFFF' ? 'dk' : ''}" style="color:${QUALITY_COLOR[o.item.quality] === '#FFFFFF' ? '#3a2410' : QUALITY_COLOR[o.item.quality]}">${o.item.name}</b><small>${QUALITY_NAME[o.item.quality]} · ${SLOT_NAME[o.item.slot]} · 装等 ${o.item.itemLevel}${o.item.hp ? ` · 生命+${o.item.hp}` : ''}${o.item.armor ? ` · 护甲+${o.item.armor}` : ''}${o.item.lines.length ? ' · ' + o.item.lines.join('；') : ''}</small></div>
          <div class="price">${uiIcon('ui_gold', 'mini')}${o.price}</div><button class="btn" data-buy="${i}" ${why ? 'disabled' : ''}>购买</button>`;
        row.querySelector('.slot')!.addEventListener('mouseenter', ev => showTip(CX.itemTip(o.item, false), ev as MouseEvent));
        row.querySelector('.slot')!.addEventListener('mouseleave', hideTip);
      }
      body.appendChild(row);
    });
    body.querySelectorAll('[data-buy]').forEach(b => (b as HTMLElement).onclick = () => { if (CX.shop.buy(+(b as HTMLElement).dataset.buy!)) { CX.audio.coin(); CX.toast('购买成功', '#ffd100'); CX.save(); renderShop(); } });
    body.querySelectorAll('[data-buy5]').forEach(b => (b as HTMLElement).onclick = () => { if (CX.shop.buy(+(b as HTMLElement).dataset.buy5!, 5)) { CX.audio.coin(); CX.toast('购买成功 ×5', '#ffd100'); CX.save(); renderShop(); } });
    side.innerHTML = `<div class="tip">${shopRole === 'supply' ? '补给商' : '葛尔达'}：「药水在副本里能救命，Q 键喝。装备我们不收了——旧装备拿去铁匠台分解，材料能强化你身上的好东西；路上捡的灰色杂物我照收，一进门就给你结了。」</div>`;
  } else if (CX.shopTab === 'rep' && isRepMap(CX.zone)) {
    // ---- v0.9.3f 区域声望：用金币兑换（按周限购）
    const m = CX.zone, pts = repPts(m), ti = repTier(m), nx = REP_TIERS[ti + 1];
    const head = document.createElement('div'); head.className = 'tip';
    head.innerHTML = `<b>${MAPS[m].name}声望：${REP_TIERS[ti].name}</b>（${pts}${nx ? ` / ${nx.at}，下一档「${nx.name}」` : '，已满'}）<br><small>做本区域任务、动态事件、击败精英 / 稀有 / 世界首领、登瞭望塔、开宝箱都能涨声望。</small>`;
    body.appendChild(head);
    for (const o of repOffers(m)) {
      const why = repWhyNot(m, o), row = document.createElement('div'); row.className = 'srow' + (repTier(m) < o.tier ? ' locked' : '');
      row.innerHTML = `<div class="slot q-${o.tier >= 4 ? 'orange' : o.tier >= 3 ? 'purple' : o.tier >= 2 ? 'blue' : 'green'}">${uiIcon(o.tier >= 3 ? 'mat_shard' : 'ui_gold')}</div><div class="sinfo"><b class="dk">${o.name}</b><small>${o.desc} · 需要「${REP_TIERS[o.tier].name}」${o.limit ? ` · 本周 ${repBuyCount(o.id)}/${o.limit}` : ''}${o.once ? ' · 一次性' : ''}</small></div><div class="price">${uiIcon('ui_gold', 'mini')}${o.price}</div><button class="btn" ${why ? 'disabled' : ''} title="${why ?? ''}">${why && why !== '金币不足' ? why : '兑换'}</button>`;
      row.querySelector('button')!.onclick = () => { if (repBuy(m, o.id)) { CX.toast(`兑换：${o.name}`, '#9ad0ff'); renderShop(); } };
      body.appendChild(row);
    }
    side.innerHTML = '<div class="tip">补给商：「你帮这片土地做的事，大家都记着。声望越高，能拿出来的好东西越多。」</div>';
  } else if (CX.shopTab === 'upgrade') {
    // ---- 强化部位：16 个格子，等级跟着格子走
    let sel: EquipSlot | null = null;
    if (CX.shopSel?.startsWith('slot:')) sel = CX.shopSel.slice(5) as EquipSlot;
    else if (selItem) sel = CX.inventory.slotOf(selItem) ?? CX.inventory.defaultTarget(selItem);
    const g = document.createElement('div'); g.className = 'grid slotgrid';
    for (const sl of EQUIP_SLOTS) {
      const it = CX.inventory.equipped[sl], lv = CX.forge.slotLevel(sl), bl = CX.inventory.bless[sl] ?? 0;
      const c = document.createElement('div'); c.className = 'cell' + (sel === sl ? ' sel' : '');
      c.innerHTML = `${it ? CX.itemSlotHtml(it) : `<div class="slot empty">${slotSilhouette(sl)}</div>`}<span class="nm">${EQUIP_SLOT_NAME[sl]} <b class="uplvt">+${lv}</b></span>${bl ? `<span class="blbar"><i style="width:${Math.round(bl * 100)}%"></i></span>` : ''}`;
      c.onclick = () => { CX.shopSel = 'slot:' + sl; renderShop(); };
      g.appendChild(c);
    }
    body.appendChild(g);
    if (sel) {
      const c = CX.forge.costSlot(sel), why = CX.forge.whyCannotSlot(sel), it = CX.inventory.equipped[sel], lv = CX.forge.slotLevel(sel);
      const grp = it ? slotGroup(it.slot) : null;
      const pv = c && it ? CX.forge.previewSlot(sel, c.toLevel) : null;
      const brk = c && c.toLevel % 5 === 0;
      side.innerHTML = `<div class="tip"><b class="tt-name">${EQUIP_SLOT_NAME[sel]}栏 · 强化 +${lv}</b><br>${it ? CX.itemTip(it, true) : '<span style="opacity:.7">这一格还没穿装备：可以先强化，穿上任何装备都会生效。</span>'}<hr>
        ${c ? `<b class="tt-name">${brk ? '突破 ' : ''}强化到 +${c.toLevel}</b><br>${pv ? `生命 ${it!.hp} → <span class="ln">${pv.hp}</span><br>${pv.desc.join('<br>')}<br>` : ''}
        ${brk && grp ? `<span style="color:#b07a00">里程碑：${MILESTONE_TEXT[grp]}${c.toLevel === 10 ? '，武器发光' : c.toLevel === 15 ? '，脚下光环' : ''}</span><br>` : ''}
        成功率 <b style="color:${c.chance >= 0.9 ? '#1a8a1a' : c.chance >= 0.6 ? '#b07a00' : '#c02020'}">${Math.round(c.chance * 100)}%</b>${c.bless ? `（基础 ${Math.round(c.base * 100)}% + 祝福 ${Math.round(c.bless * 100)}%）` : ''}${c.chance < 1 ? '<br><span style="opacity:.8">失败不掉级，只积累祝福值，祝福满了必定成功</span>' : ''}<br>${uiIcon('ui_gold', 'mini')}${c.gold} ${matsLine(c.mats)}<br>
        <button class="btn big" id="s-up" ${why ? 'disabled' : ''}>${uiIcon('ui_anvil', 'mini')}${brk ? '突破' : '强化'}</button>${why ? `<br><span class="cmp-dn">${why}</span>` : ''}` : '<b>已强化到 +15</b>'}</div>`;
      const ub = document.getElementById('s-up');
      if (ub) ub.onclick = () => {
        const r = CX.forge.upgradeSlot(sel!);
        CX.audio.anvil(r.ok);
        CX.toast(r.ok ? `强化成功！${EQUIP_SLOT_NAME[sel!]}栏 +${r.level}` : r.reason, r.ok ? '#ffd100' : '#ff6060');
        if (r.ok) VFX.upgradeBurst(CX.player.pos, r.level, r.level >= 10 ? 0xff8a2a : 0xffd34d);   // v0.9.1e 强化成功光效
        CX.save(); renderShop();
      };
    } else side.innerHTML = `<div class="tip"><b>强化的是部位，不是装备</b><br>头部栏、武器栏……每一格单独强化，换上新装备等级保留，掉到好东西放心换。<br>· +1~+15，每级生命/护甲 +7%，武器栏额外加技能伤害<br>· 失败不掉级，积累祝福值，满了必成<br>· 突破：+5 要「首领之证」（野外首领），+10 要「英雄徽记」（副本首领），+15 要「王座之心」（长副本首领）<br>· +5 / +10 / +15 每次给这一格一个小加成</div>`;
  } else if (CX.shopTab === 'reforge') {
    // ---- 淬炼：重洗一条词条（保留元素）或重铸元素（词条不变）
    const prints = DARK_ITEMS.filter(d => CX.codex.has(`print|${d.id}`));
    gridOf(allItems.filter(x => x.it.affixLog?.length || (x.it.quality !== 'dark' && prints.some(d => engraveFits(d.slot, x.it.slot)))), it => { CX.shopSel = it.id; renderShop(); });
    const engr = (it: ItemInstance) => { const fits = it.quality === 'dark' ? [] : prints.filter(d => engraveFits(d.slot, it.slot)); return fits.length ? `<hr><b class="tt-name">拓印</b>${it.engraveId ? `（当前：${DARK_ITEMS.find(d => d.id === it.engraveId)?.name}，新的会替换）` : ''}<br>${fits.map(d => `<button class="btn sm" data-eg="${d.id}" style="color:#c9a44c">刻上「${d.name}」</button>`).join(' ')}<br><small>${uiIcon('ui_gold', 'mini')}${ENGRAVE_COST.gold} ${matsLine([{ id: 'mat_darkshard', count: ENGRAVE_COST.shards }])}</small>` : ''; };
    const bindEng = (it: ItemInstance) => side.querySelectorAll('[data-eg]').forEach(b => (b as HTMLElement).onclick = () => { const why = doEngrave(it, (b as HTMLElement).dataset.eg!); if (why) { CX.toast(why, '#ff6060'); return; } CX.audio.anvil(true); CX.toast(`拓印完成：${it.name}`, '#e8c060'); CX.save(); renderShop(); });
    if (selItem && !selItem.affixLog?.length && engr(selItem)) { side.innerHTML = `<div class="tip">${CX.itemTip(selItem, true)}${engr(selItem)}</div>`; bindEng(selItem); }
    else if (selItem?.affixLog?.length) {
      const it = selItem, ca = CX.forge.reforgeCost(it, 'affix'), ce = CX.forge.reforgeCost(it, 'elem');
      const off = it.lines.length - it.affixLog!.length;   // 前面是拓印 / 传说 / 特效行
      const rng = (i: number) => { const r = affixRollRange(it, i, LOOT_DATA); return r ? ` <small class="rf-rng" title="装等 ${it.itemLevel} · ${QUALITY_NAME[it.quality]}的区间（未含部位强化），峰值 ${r.hi}">〔${r.text}〕</small>` : ''; };
      const rows = it.affixLog!.map((a, i) => `<div class="rfrow"><span class="ln">${it.lines[off + i] ?? a.id}${rng(i)}</span><button class="btn sm" data-rf="${i}" ${CX.forge.whyCannotReforge(it, i, 'affix') ? 'disabled' : ''}>重洗</button>${a.el ? `<button class="btn sm" data-re="${i}" ${CX.forge.whyCannotReforge(it, i, 'elem') ? 'disabled' : ''} style="color:${ELEM_COLOR[a.el]}">换元素</button>` : ''}</div>`).join('');
      // v0.8.1 暗金重铸：锁定 1 条，其余重随（深渊碎片）
      const rc = it.quality === 'dark' && it.affixLog!.length >= 2 ? CX.forge.recastCost(it) : null;
      const recast = rc ? `<hr><b class="tt-name">暗金重铸</b>（锁定 1 条，其余全部重随）<br>${it.affixLog!.map((a, i) => `<div class="rfrow"><span class="ln">${it.lines[off + i] ?? a.id}${rng(i)}</span><button class="btn sm" data-rc="${i}" ${CX.forge.whyCannotRecast(it, i) ? 'disabled' : ''}>锁定此条重铸</button></div>`).join('')}<small>${uiIcon('ui_gold', 'mini')}${rc.gold} ${matsLine(rc.mats)}（深渊碎片在暗岩深渊获得）</small>` : '';
      side.innerHTML = `<div class="tip">${CX.itemTip(it, true)}<hr><b class="tt-name">淬炼</b><br>${rows}<br><small>重洗：${uiIcon('ui_gold', 'mini')}${ca.gold} ${matsLine(ca.mats)}（元素保留）<br>换元素：${uiIcon('ui_gold', 'mini')}${ce.gold} ${matsLine(ce.mats)}（词条不变）</small>${recast}${engr(it)}</div>`;
      side.querySelectorAll('[data-rc]').forEach(b => (b as HTMLElement).onclick = () => { const i = +(b as HTMLElement).dataset.rc!; const why = CX.forge.recast(it, i, CX.gen); if (why) { CX.toast(why, '#ff6060'); return; } CX.audio.anvil(true); CX.toast(`暗金重铸完成：保留「${it.lines[off + i]}」`, '#e8c060'); CX.save(); renderShop(); });
      bindEng(it);
      const go = (i: number, mode: 'affix' | 'elem') => { const why = CX.forge.reforge(it, i, mode, CX.gen); if (why) { CX.toast(why, '#ff6060'); return; } CX.audio.anvil(true); CX.toast(`淬炼完成：${it.lines[off + i]}`, '#ffd100'); CX.save(); renderShop(); };
      side.querySelectorAll('[data-rf]').forEach(b => (b as HTMLElement).onclick = () => go(+(b as HTMLElement).dataset.rf!, 'affix'));
      side.querySelectorAll('[data-re]').forEach(b => (b as HTMLElement).onclick = () => go(+(b as HTMLElement).dataset.re!, 'elem'));
    } else side.innerHTML = `<div class="tip"><b>淬炼</b><br>选一件装备，重洗其中一条词条（其他词条不动），或者把一条带元素的词条换成别的元素，用来凑元素共鸣。<br><small>v0.6.2 以前掉的旧装备没有词条记录，不能淬炼。</small></div>`;
  } else if (CX.shopTab === 'repair') {
    renderRepairTab(body, side);   // v0.5（账号 B）：修理（耐久度）
  } else if (CX.shopTab === 'exchange') {
    body.innerHTML = '<p class="hint">兑换页是全屏面板</p>';
    side.innerHTML = `<div class="tip"><button class="btn big" id="s-ex">打开兑换</button></div>`;
    CX.$('s-ex').onclick = () => openExchange();
  } else {
    gridOf(CX.inventory.bag.map(i => ({ it: i, eq: false })), it => { CX.shopSel = it.id; salvConfirm = false; renderShop(); });
    if (selItem && CX.inventory.bag.includes(selItem)) {
      const pv = CX.forge.salvagePreview(selItem), why = CX.forge.whyCannotSalvage(selItem), g = CX.forge.salvageGold(selItem);
      side.innerHTML = `<div class="tip">${CX.itemTip(selItem, false)}<hr>${why ? `<span class="cmp-dn">${why}</span>` : `<b class="tt-name">分解可得</b><br>${pv.map(p => `${stackIcon(p.id).replace('pic ', 'pic mini ')}${CX.forge.stackDef(p.id)!.name} ×${p.min === p.max ? p.min : `${p.min}~${p.max}`}`).join('<br>')}${g ? `<br>${uiIcon('ui_gold', 'mini')}+${g} 金币` : ''}`}<br>${why ? '' : `<button class="btn big" id="s-salv">${uiIcon('ui_salvage', 'mini')}分解</button> `}${lockBtnHtml(selItem, 's-lock')}<button class="btn" id="s-back">返回一键分解</button></div>`;
      const lb = document.getElementById('s-lock'); if (lb) lb.onclick = () => { toggleLockUi(selItem); renderShop(); };
      const sb = document.getElementById('s-salv'); if (sb) sb.onclick = () => { if (selItem.quality === 'dark' && selItem.fixedId) { CX.codex.add(`print|${selItem.fixedId}`); CX.toast(`「${selItem.name}」的效果已拓印进暗金典藏`, '#e8c060'); } const got = CX.forge.salvage(selItem.id) ?? []; CX.audio.anvil(true); CX.toast(`分解获得：${got.map(g => `${CX.forge.stackDef(g.id)!.name}×${g.count}`).join('、')}`, '#7fd7ff'); CX.shopSel = null; CX.save(); renderShop(); };
      CX.$('s-back').onclick = () => { CX.shopSel = null; renderShop(); };
    } else renderSalvagePanel(side, renderShop, { auto: true, prefix: 's-' });   // v0.6.7：和背包共用（salvage_ui.ts）
  }
}

// ----- 传送阵：选择副本 -----
export function openTravel() {
  const b = CX.$('travel-body'); b.innerHTML = '';
  for (const L of Object.values(CX.LAYOUTS)) {
    const lock = CX.dungeonLock(L.id);
    const d = document.createElement('div'); d.className = 'drow' + (lock ? ' locked' : '');
    d.innerHTML = `<div class="slot ${lock ? 'q-white' : 'q-purple'}">${uiIcon(L.id === 'rotting_temple' ? 'bs_poison' : 'ui_portal', lock ? 'off' : '')}</div><div class="sinfo"><b>${L.def.name}</b><small>推荐等级 ${L.rec}+ · ${L.def.encounters.map(e => e.name).join(' → ')}</small>${lock ? `<small class="cmp-dn">🔒 ${lock}</small>` : ''}</div><button class="btn" ${lock ? 'disabled' : ''}>进入</button>`;
    d.querySelector('button')!.onclick = () => CX.enterDungeon(L.id);
    b.appendChild(d);
  }
  CX.togglePanel('travel', true);
}

// ----- 世界地图（M）：世界总览 / 当前区域详图 -----
export type WmView = 'world' | 'zone' | 'dungeon';

export let wmView: WmView = 'zone';

export let wmMap: MapId = 'camp';

/** v0.6.9：世界地图节点 = 新大陆底图（assets/textures/worldmap.jpg）上各区域的位置（0~1，相对底图） */
export const WORLD_NODES: Record<MapId, { x: number; y: number }> = { camp: { x: 0.5, y: 0.22 }, field: { x: 0.47, y: 0.5 }, darkrock_mine: { x: 0.8, y: 0.2 }, rotting_temple: { x: 0.13, y: 0.21 }, foothill: { x: 0.71, y: 0.29 }, marsh: { x: 0.24, y: 0.3 },   // v0.9.2b 副本区；副本节点挪到副本区外侧
  star: { x: 0.64, y: 0.4 }, redsand: { x: 0.8, y: 0.53 }, frost: { x: 0.74, y: 0.78 }, ember: { x: 0.26, y: 0.75 },
  ...Object.fromEntries(PACK_WILD_IDS.map(id => [id, WILD[id as WildId].worldNode ?? { x: 0.5, y: 0.92 }])) };   // v1.0.2 内容包野外：包自己给名牌位置
const WM_ASPECT = 1100 / 614;
let wmImg: HTMLImageElement | null = null;
function worldImg() { if (!wmImg && typeof Image !== 'undefined' && TEXTURES.worldmap) { wmImg = new Image(); wmImg.onload = () => drawWorldMap(); wmImg.src = TEXTURES.worldmap; } return wmImg; }
/** 底图在画布里的矩形（等比、居中） */
export function wmRect(cw: number, ch: number) { let w = cw, h = cw / WM_ASPECT; if (h > ch) { h = ch; w = ch * WM_ASPECT; } return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }; }
/** 上次绘制的兴趣点（屏幕坐标，悬停说明用） */
export let wmHits: { x: number; y: number; r: number; poi?: Poi; map?: MapId }[] = [];
/** 标题横幅（每张地图） */
function banner(g: CanvasRenderingContext2D, cw: number, title: string, sub: string) {
  const w = Math.min(cw * 0.7, 380), x = (cw - w) / 2, y = 8, h = 34;
  g.save();
  g.fillStyle = '#7a1a08'; g.beginPath(); g.moveTo(x - 14, y + 6); g.lineTo(x, y + 6); g.lineTo(x, y + h + 4); g.lineTo(x - 14, y + h + 4); g.lineTo(x - 6, y + h / 2 + 5); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + w + 14, y + 6); g.lineTo(x + w, y + 6); g.lineTo(x + w, y + h + 4); g.lineTo(x + w + 14, y + h + 4); g.lineTo(x + w + 6, y + h / 2 + 5); g.closePath(); g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#c0301a'); gr.addColorStop(1, '#8a1a0a');
  g.fillStyle = gr; g.strokeStyle = '#e8c070'; g.lineWidth = 2; g.fillRect(x, y, w, h); g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = '#ffe8b0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillText(title, cw / 2, y + h / 2 - (sub ? 5 : 0));
  if (sub) { g.font = '11px "PingFang SC",sans-serif'; g.fillStyle = '#f0d8a0'; g.fillText(sub, cw / 2, y + h / 2 + 10); }
  g.restore();
}

function worldTip(id: MapId) {
  const m = MAPS[id], pois = poisFor(id), lock = mapLock(id);
  const cnt = (['dungeon', 'dungeon3', 'raid', 'wildboss', 'rare', 'event', 'quest', 'cquest'] as const).map(k => { const n = pois.filter(p => p.kind === k && !p.dim).length; return n ? `${POI_STYLE[k].glyph}${POI_STYLE[k].name} ${n}` : ''; }).filter(Boolean).join(' · ');
  return `<b>${m.name}</b><small>${m.kind === 'dungeon' ? '副本' : '野外'} · ${m.levels} 级</small><div>${m.desc}</div>${cnt ? `<div>${cnt}</div>` : ''}${lock ? `<div class="st">${lock}</div>` : ''}`;
}
/** v1.2.5 内容包野外的醒目标记（本体区域永远 null） */
export function mapBadgeOf(id: MapId): string | null { try { return isWildId(id) ? WILD[id].mapBadge?.() ?? null : null; } catch { return null; } }
export function mapLock(id: MapId): string | null { return id === 'field' ? CX.fieldLock() : id === 'rotting_temple' ? CX.dungeonLock(id) : isWildId(id) ? CX.wildLock(id) : null; }

export function openWorldMap(view?: WmView, map?: MapId) {
  if (view === 'dungeon') { openDungeonTab(); return; }
  wmMap = map ?? CX.currentMap();
  if (view) wmView = view;
  CX.togglePanel('worldmap', true);
  renderWorldMap();
}

/** v0.9.3i「副本」页签：当前副本 → 区域详图里的副本 → 当前地图的副本门口 → 暗岩矿洞 */
let lastDungeon = '';
export function openDungeonTab(id?: string) {
  const here = CX.zone === 'dungeon' ? CX.layout.id : CX.zone === 'raid' ? (raidDebug()?.id as string | undefined) : undefined;
  const zoneDg = isWildId(wmMap) ? WILD[wmMap].dungeonGates?.[0]?.id : undefined;
  const d = id ?? here ?? (lastDungeon || zoneDg || (isWildId(CX.currentMap()) ? WILD[CX.currentMap() as WildId].dungeonGates?.[0]?.id : undefined) || 'darkrock_mine');
  lastDungeon = d;
  openRaidMap(d, !here || here !== d);
}
export function toggleWorldMap() { if (CX.$('worldmap').style.display === 'flex') CX.togglePanel('worldmap', false); else openWorldMap(); }

/** 所有进行中任务的指引目标（地图上画目标圈） */
export function allTargets() {
  return CX.quests.active().map(a => ({ id: a.q.id, t: questTarget(CX.quests, a.q, a.p, a.ready, locateObjective, NPC_HOME, CX.npcName) })).filter(x => x.t) as { id: string; t: GuideTarget }[];
}

export const MK_TEXT = (mk: string) => (mk === '…' ? '?' : mk);

/** 生成地图的文字说明（画布画不了时也能看；测试也读它） */
/** v0.9.3i 副本卡片：等级、首领、传送阵状态、本周通关；按钮「查看副本地图」「传送到入口」 */
function dungeonCards(only?: MapId): string {
  return allDungeonPortals().filter(p => !only || p.map === only).map(p => {
    const d = dmDef(p.id); if (!d) return '';
    const wk = raidRec.week[p.id] === weekKey(Date.now());
    return `<div class="wd"><b>${d.name}</b> <small>${MAPS[p.map].name} · ${d.kind === 'raid' ? '长副本' : '普通副本'} · ${d.kind === 'layout' ? MAPS[p.id as MapId]?.levels + ' 级' : d.level + ' 级'}</small><br><small>首领：${d.bosses.slice(0, d.hidden ? d.hidden.room : undefined).map(b => b.name.split(' ').pop()).join(' / ')}${d.hidden ? ' / ？' : ''}</small><br><small>传送阵：${p.on ? '已激活' : '未激活'}${d.kind !== 'layout' ? ` · 本周${wk ? '已通关 ✓' : '未通关'}` : ''}</small><br><button class="btn" data-dmap="${p.id}">查看副本地图</button><button class="btn" data-dtp="${p.id}"${p.on ? '' : ' disabled'}>传送到入口</button></div>`;
  }).join('');
}
export function worldMapLegend(): string {
  const tg = allTargets();
  if (wmView === 'world') {
    return legendHtml((Object.keys(MAPS) as MapId[]).flatMap(id => poisFor(id))) + (Object.keys(MAPS) as MapId[]).map(id => {
      const m = MAPS[id], n = tg.filter(x => x.t.point.map === id).length, lock = mapLock(id);
      return `<div class="wl${id === CX.currentMap() ? ' here' : ''}" data-map="${id}"><b>${m.name}</b> <small>${m.kind === 'dungeon' ? '副本' : '野外'} · ${m.levels} 级</small>${id === CX.currentMap() ? ' <span class="you">● 你在这里</span>' : ''}${n ? ` <span class="qn">◆×${n}</span>` : ''}${lock ? ' <span class="lk"><i class="lockic"></i></span>' : ''}<br><small>${m.desc}</small></div>`;
    }).join('') + `<div class="wl" style="cursor:default"><b>副本</b> <small>到过门口的副本传送阵可以直接传送</small></div>` + dungeonCards();
  }
  const id = wmMap;
  const ns = Object.entries(NPC_HOME).filter(([, h]) => h.map === id).map(([n]) => { const mk = CX.quests.npcMarker(n, CX.progression.level); return `<span class="np">${mk ? `<i class="mk${mk === '…' ? ' g' : ''}">${MK_TEXT(mk)}</i>` : ''}${CX.npcName(n)}</span>`; }).join('');
  const objs = tg.filter(x => x.t.point.map === id).map(x => { const cq = !!CX.quests.def(x.id)?.cls; return `<div class="wo${x.id === CX.focusId ? ' f' : ''}${cq ? ' cq' : ''}">${cq ? '✦ <b>职业任务</b> · ' : '◆ '}${x.t.questName}：${x.t.label}</div>`; }).join('');
  const links = MAP_LINKS.filter(l => l.from === id).map(l => `${l.name} → ${MAPS[l.to as MapId].name}`);
  return legendHtml(poisFor(id)) + `<div class="wl here"><b>${MAPS[id].name}</b> <small>${MAPS[id].levels} 级 · ${MAPS[id].desc}</small></div>${ns ? `<div class="wn">NPC：${ns}</div>` : ''}${objs || '<div class="wo">这个区域没有任务目标</div>'}<div class="wp">传送：${[...new Set(links)].join('；')}</div>` + dungeonCards(id);
}

export function renderWorldMap() {
  queueMicrotask(syncM3sw);
  if (CX.$('worldmap').style.display !== 'flex') return;
  // v1.2.73 地图面板 2D / 3D 开关：写回设置 map3d（on / off），切 3D 时清掉上次失败标记
  document.querySelectorAll('[data-m3sw]').forEach(b => (b as HTMLElement).onclick = ev => {
    ev.stopPropagation();
    const now3d = wm3dActive() || rm3dActive();
    CX.settings.map3d = now3d ? 'off' : 'on'; CX.saveSettings();
    if (!now3d) { wm3dRetry(); rm3dRetry(); }
    if (CX.$('worldmap').style.display === 'flex') renderWorldMap();
    if (CX.$('raidmap').style.display === 'flex') renderRaidMap();
    syncM3sw();
  });
  document.querySelectorAll('#worldmap .tab').forEach(t => t.classList.toggle('on', (t as HTMLElement).dataset.view === wmView));
  CX.$('wm-title').textContent = wmView === 'world' ? '世界地图' : `区域地图 · ${MAPS[wmMap].name}`;
  { const cr = wmView === 'world' ? '<b>世界</b>' : `<a data-crumb="world">世界</a> › <b>${MAPS[wmMap].name}</b>`; if (CX.textCache.get('wm-crumb') !== cr) { CX.textCache.set('wm-crumb', cr); CX.$('wm-crumb').innerHTML = cr; CX.$('wm-crumb').querySelectorAll('[data-crumb]').forEach(x => (x as HTMLElement).onclick = () => { wmView = 'world'; renderWorldMap(); }); } }
  const lh = worldMapLegend();
  if (CX.textCache.get('wm-legend') !== lh) { CX.textCache.set('wm-legend', lh); CX.$('wm-legend').innerHTML = lh; }   // 内容没变就不重建（不打断点击）
  CX.$('wm-legend').querySelectorAll('[data-map]').forEach(x => (x as HTMLElement).onclick = () => { wmMap = (x as HTMLElement).dataset.map as MapId; wmView = 'zone'; renderWorldMap(); });
  CX.$('wm-legend').querySelectorAll('[data-dmap]').forEach(x => (x as HTMLElement).onclick = ev => { ev.stopPropagation(); openDungeonTab((x as HTMLElement).dataset.dmap); });
  CX.$('wm-legend').querySelectorAll('[data-dtp]').forEach(x => (x as HTMLElement).onclick = ev => { ev.stopPropagation(); const err = dmTeleport((x as HTMLElement).dataset.dtp!); if (err) { CX.toast(err, '#ffb080'); CX.audio.error(); } });
  drawWorldMap();
  showSand();   // v0.9.6e 3D 沙盘（不可用时内部回退，2D 画布照画）
}

export let wmCv!: HTMLCanvasElement;

export function drawWorldMap() {
  const g = wmCv.getContext?.('2d') ?? null;
  if (!g) return;
  const cw = Math.max(200, wmCv.clientWidth || 600), ch = Math.max(120, wmCv.clientHeight || 320), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (wmCv.width !== Math.round(cw * dpr) || wmCv.height !== Math.round(ch * dpr)) { wmCv.width = Math.round(cw * dpr); wmCv.height = Math.round(ch * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 羊皮纸底
  const bg = g.createRadialGradient(cw / 2, ch / 2, 10, cw / 2, ch / 2, Math.max(cw, ch) * 0.7); bg.addColorStop(0, '#f0e0b8'); bg.addColorStop(1, '#c8a870');
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
  g.font = '12px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ink = '#4a2c10';
  const tg = allTargets();
  wmHits = [];
  if (wmView === 'world') {
    const rc0 = wmRect(cw, ch - 46), rc = { ...rc0, y: rc0.y + 46 }, img = worldImg();   // 上面留给标题横幅
    g.fillStyle = '#2a5a7a'; g.fillRect(0, 0, cw, ch);
    if (img && img.complete && img.naturalWidth) g.drawImage(img, rc.x, rc.y, rc.w, rc.h);
    else { g.fillStyle = bg; g.fillRect(rc.x, rc.y, rc.w, rc.h); }
    const P = (id: MapId) => ({ x: rc.x + WORLD_NODES[id].x * rc.w, y: rc.y + WORLD_NODES[id].y * rc.h });
    // 道路（虚线）
    g.strokeStyle = 'rgba(70,40,10,.75)'; g.lineWidth = 2.5; g.setLineDash?.([7, 5]);
    const drawn = new Set<string>();
    for (const l of MAP_LINKS) { const k = [l.from, l.to].sort().join('-'); if (drawn.has(k) || (MAPS[l.from as MapId].kind === 'dungeon')) continue; drawn.add(k); const a = P(l.from as MapId), b = P(l.to as MapId); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    g.setLineDash?.([]);
    // v0.9.3j 副本区：虚线框圈住副本区和它的副本（区域小，只有入口、传送阵和少量怪）
    for (const [hub, dg] of [['foothill', 'darkrock_mine'], ['marsh', 'rotting_temple']] as [MapId, MapId][]) {
      const a = P(hub), b = P(dg), pad = Math.max(34, rc.w * 0.05);
      const x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad * 0.7, x1 = Math.max(a.x, b.x) + pad, y1 = Math.max(a.y, b.y) + pad * 0.9;
      g.fillStyle = 'rgba(40,20,5,.18)'; g.strokeStyle = 'rgba(255,230,170,.95)'; g.lineWidth = 2; g.setLineDash?.([6, 4]);
      g.beginPath(); g.roundRect?.(x0, y0, x1 - x0, y1 - y0, 10); if (!g.roundRect) g.rect(x0, y0, x1 - x0, y1 - y0); g.fill(); g.stroke(); g.setLineDash?.([]);
      g.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(40,20,5,.85)'; g.strokeText('副本区', (x0 + x1) / 2, y0 + 9); g.fillStyle = '#ffe8b0'; g.fillText('副本区', (x0 + x1) / 2, y0 + 9);
    }
    if (CX.guide) { const a = P(CX.currentMap()), b = P(CX.guide.t.point.map as MapId); if (a.x !== b.x || a.y !== b.y) { g.strokeStyle = '#ffc020'; g.lineWidth = 4; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
    const r = Math.max(9, Math.min(rc.w, rc.h) * 0.022);
    // 1106 名牌避让：你在这里 / 解锁区域优先，撞了就上下挪（挪动的画一条引线回到原位）
    const ids = (Object.keys(MAPS) as MapId[]).slice().sort((a, b) => (+(b === CX.currentMap()) - +(a === CX.currentMap())) || (+!!mapLock(a) - +!!mapLock(b)));
    const NP = new Map<MapId, { x: number; y: number }>(), boxes: number[][] = [];
    { const t = Math.min(cw * 0.7, 380); boxes.push([(cw - t) / 2 - 14, 0, (cw + t) / 2 + 14, 48]); }
    for (const id of ids) {
      const o = P(id), m = MAPS[id], here = id === CX.currentMap(), pois = poisFor(id);
      g.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif'; const tw = Math.max(g.measureText(m.name).width + 16, 92);
      const nk = (['dungeon', 'dungeon3', 'raid', 'wildboss', 'rare', 'event', 'quest', 'cquest'] as const).filter(k => pois.some(q => q.kind === k)).length;
      const top = here || mapBadgeOf(id) ? 34 : 15, bot = 15 + (nk ? r * 2 + 4 : 0), w = Math.max(tw, nk * r * 2.2);
      let dy = 0;
      for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4]) { const d = k * 14, b = [o.x - w / 2, o.y + d - top, o.x + w / 2, o.y + d + bot]; if (!boxes.some(q => b[0] < q[2] && q[0] < b[2] && b[1] < q[3] && q[1] < b[3])) { dy = d; break; } dy = 0; }
      boxes.push([o.x - w / 2, o.y + dy - top, o.x + w / 2, o.y + dy + bot]); NP.set(id, { x: o.x, y: o.y + dy });
      if (dy) { g.strokeStyle = 'rgba(40,20,5,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x, o.y + dy + (dy > 0 ? -15 : 15)); g.stroke(); g.fillStyle = '#ffeec8'; g.beginPath(); g.arc(o.x, o.y, 3, 0, Math.PI * 2); g.fill(); }
    }
    for (const id of Object.keys(MAPS) as MapId[]) {
      const p = NP.get(id)!, m = MAPS[id], lock = mapLock(id), here = id === CX.currentMap();
      const pois = poisFor(id);
      // 区域名牌
      g.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
      const fp = exFogPct(id), label = `${m.name}`, sub = `${m.levels} 级${lock ? ' · 未开放' : fp !== null ? ` · 探索 ${fp}%` : ''}`;
      const lw = g.measureText(label).width; g.font = '10px "PingFang SC",sans-serif'; const swd = g.measureText(sub).width; g.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = Math.max(lw, swd, 60) + 16;
      g.fillStyle = lock ? 'rgba(80,70,60,.82)' : here ? 'rgba(150,30,10,.9)' : 'rgba(40,24,10,.78)'; g.strokeStyle = here ? '#ffd060' : '#c9a060'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect?.(p.x - tw / 2, p.y - 15, tw, 30, 6); if (!g.roundRect) g.rect(p.x - tw / 2, p.y - 15, tw, 30); g.fill(); g.stroke();
      g.fillStyle = '#ffeec8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, p.x, p.y - 5);
      g.font = '10px "PingFang SC",sans-serif'; g.fillStyle = '#e8d0a0'; g.fillText(sub, p.x, p.y + 8);
      // 区域内的副本 / 首领 / 事件 / 任务：小图标一排
      const kinds = (['dungeon', 'dungeon3', 'raid', 'wildboss', 'rare', 'event', 'quest', 'cquest'] as const).filter(k => pois.some(q => q.kind === k));
      kinds.forEach((k, i) => { const ix = p.x - (kinds.length - 1) * r * 1.1 + i * r * 2.2, iy = p.y + 15 + r + 2; drawPoiIcon(g, k, ix, iy, r * 0.9, { live: (k === 'quest' || k === 'cquest') && pois.some(q => q.kind === k && q.live) }); const n = pois.filter(q => q.kind === k).length; if (n > 1) { g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(`${n}`, ix + r * 0.8, iy + r * 0.6); g.fillText(`${n}`, ix + r * 0.8, iy + r * 0.6); } });
      const bd = mapBadgeOf(id);   // v1.2.5 内容包醒目标记：青色光环 + 名牌上方标签
      if (bd) {
        g.save(); g.strokeStyle = 'rgba(80,240,224,.95)'; g.lineWidth = 3; g.shadowColor = '#30e0d0'; g.shadowBlur = 12;
        g.beginPath(); g.ellipse?.(p.x, p.y, tw / 2 + 10, 26, 0, 0, Math.PI * 2); g.stroke();
        g.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif'; const bw = g.measureText(bd).width + 14, by = p.y - (here ? 44 : 30);
        g.shadowBlur = 0; g.fillStyle = '#5ff0e0'; g.beginPath(); g.roundRect?.(p.x - bw / 2, by - 9, bw, 18, 8); if (!g.roundRect) g.rect(p.x - bw / 2, by - 9, bw, 18); g.fill();
        g.fillStyle = '#062a2a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(bd, p.x, by); g.restore();
      }
      if (here) { g.fillStyle = '#ffd34d'; g.strokeStyle = '#3a1000'; g.lineWidth = 3; g.font = 'bold 12px sans-serif'; g.strokeText('▼ 你在这里', p.x, p.y - 24); g.fillText('▼ 你在这里', p.x, p.y - 24); }
      wmHits.push({ x: p.x, y: p.y, r: Math.max(tw / 2, 24), map: id });
    }
    banner(g, cw, '暗岩大陆', '点击区域查看详图 · 悬停看说明');
    return;
  }
  drawZone(g, cw, ch, wmMap, false);
}
/** 区域详图。base = true：只画底层（地面 / 路 / 地名 / NPC / 任务圈 / 指引线），给 3D 沙盘当贴图——不画图标、迷雾、横幅、玩家箭头，也不动 wmHits */
function drawZone(g: CanvasRenderingContext2D, cw: number, ch: number, id: MapId, base: boolean) {
  const ink = '#4a2c10', tg = allTargets(), v = MAPS[id].view;
  g.font = '12px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const TOP = base ? 0 : 50, PAD = base ? 0 : 16;   // v0.6.9：上面留给标题横幅
  const sc = Math.min((cw - PAD) / (v.x1 - v.x0), (ch - PAD - TOP) / (v.z1 - v.z0));
  const ox = (cw - (v.x1 - v.x0) * sc) / 2, oz = TOP + (ch - TOP - (v.z1 - v.z0) * sc) / 2;
  const X = (x: number) => ox + (x - v.x0) * sc, Z = (z: number) => oz + (z - v.z0) * sc;
  g.fillStyle = id === 'field' ? 'rgba(200,170,80,.35)' : isWildId(id) ? WILD[id].palette.map[0] : MAPS[id].kind === 'dungeon' ? 'rgba(60,40,30,.25)' : 'rgba(120,150,70,.3)';
  g.fillRect(X(v.x0), Z(v.z0), (v.x1 - v.x0) * sc, (v.z1 - v.z0) * sc);
  const dotAt = (x: number, z: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill(); };
  const fk = base ? 1 : Math.max(1, Math.min(1.6, Math.min(cw, ch) / 560));   // 1106 横版大画布：区域图字号跟着放大
  // 1106 地名 / NPC 名避让：撞到已画的字就上下挪一行，挪不开照原位画
  const zb: number[][] = [];
  const free = (t: string, px: number, py: number, size: number) => { const w = g.measureText(t).width + 4, h = size + 3;
    for (const k of [0, 1, -1, 2, -2]) { const y = py + k * h, b = [px - w / 2, y - h / 2, px + w / 2, y + h / 2]; if (!zb.some(q => b[0] < q[2] && q[0] < b[2] && b[1] < q[3] && q[1] < b[3])) { zb.push(b); return y; } }
    zb.push([px - w / 2, py - h / 2, px + w / 2, py + h / 2]); return py; };
  const label = (t: string, x: number, z: number, c = ink, size0 = 12) => { const size = Math.round(size0 * fk); g.font = `bold ${size}px "PingFang SC",sans-serif`; const px = X(x), py = free(t, px, Z(z), size); if (/^#[c-f]/i.test(c)) { g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,6,.85)'; g.strokeText(t, px, py); } g.fillStyle = c; g.fillText(t, px, py); };   // v1.2.39b 浅色字加深色描边
  if (id === 'camp') {
    g.strokeStyle = 'rgba(150,110,60,.8)'; g.lineWidth = Math.max(2, 3 * sc);
    [[[0, -36], [0, -2]], [[10, 4], [30, 4]], [[0, 18], [0, 40]]].forEach(([a, b]) => { g.beginPath(); g.moveTo(X(a[0]), Z(a[1])); g.lineTo(X(b[0]), Z(b[1])); g.stroke(); });
    g.strokeStyle = '#7a5530'; g.lineWidth = 2; g.beginPath(); g.arc(X(0), Z(4), 16 * sc, 0, Math.PI * 2); g.stroke();
    for (const c of CX.campCircles) if (c.r < 1 && c.r > 0.3 && Math.hypot(c.x, c.z - 4) > 17) dotAt(c.x, c.z, Math.max(1.5, c.r * sc * 1.4), 'rgba(60,100,40,.55)');
    label('灰石营地', 0, 4, ink, 13); label('狼林', 38, -4); label('传送阵', 0, -28, '#5a2a8a'); label('原野石门', 0, 44, '#8a5a00');
  } else if (id === 'field') {
    g.strokeStyle = 'rgba(150,110,60,.75)'; g.lineWidth = Math.max(2, 2.4 * sc);
    for (const pl of FIELD_PATHS) { g.beginPath(); pl.forEach(([x, z], i) => (i ? g.lineTo(X(CX.F.x + x), Z(CX.F.z + z)) : g.moveTo(X(CX.F.x + x), Z(CX.F.z + z)))); g.stroke(); }
    g.strokeStyle = 'rgba(70,140,200,.85)'; g.lineWidth = RIVER_HALF * 2 * sc; g.beginPath();
    { const xs = LAKE_ON ? Math.ceil(RIVER_X0) : -FIELD_HALF - 2; for (let x = xs; x <= FIELD_HALF + 2; x += 2) { const z = riverZ(x); if (x === xs) g.moveTo(X(CX.F.x + x), Z(CX.F.z + z)); else g.lineTo(X(CX.F.x + x), Z(CX.F.z + z)); } }
    g.stroke();
    if (LAKE_ON) {   // 11-19 落霞湖
      g.fillStyle = 'rgba(70,140,200,.85)'; g.beginPath();
      for (let i = 0; i <= 64; i++) { const [x, z] = lakeShore(i / 64 * Math.PI * 2); if (i) g.lineTo(X(CX.F.x + x), Z(CX.F.z + z)); else g.moveTo(X(CX.F.x + x), Z(CX.F.z + z)); }
      g.fill(); g.fillStyle = '#8a5a2a'; g.fillRect(X(CX.F.x + LAKE_DOCK.x - LAKE_DOCK.w / 2), Z(CX.F.z + LAKE_DOCK.z0), LAKE_DOCK.w * sc, (LAKE_DOCK.z1 - LAKE_DOCK.z0) * sc);
    }
    g.fillStyle = '#8a5a2a'; g.fillRect(X(CX.F.x + BRIDGE.x0), Z(CX.F.z + riverZ(0) - 6), (BRIDGE.x1 - BRIDGE.x0) * sc, 12 * sc);
    g.fillStyle = 'rgba(120,110,100,.8)'; g.fillRect(X(CX.F.x + FORD.x0), Z(CX.F.z + riverZ(-55) - 4), (FORD.x1 - FORD.x0) * sc, 8 * sc);
    g.fillStyle = '#a8a090'; g.fillRect(X(CX.F.x + BRIDGE2.x0), Z(CX.F.z + riverZ(80) - 6), (BRIDGE2.x1 - BRIDGE2.x0) * sc, 12 * sc);
    { const M2 = FIELD_SPOTS.mesa; g.fillStyle = 'rgba(150,100,60,.45)'; g.beginPath(); g.arc(X(CX.F.x + M2.x), Z(CX.F.z + M2.z), 13 * sc, 0, Math.PI * 2); g.fill(); }
    for (const p of fieldProps()) {
      if (p.kind === 'birch' || p.kind === 'oak') dotAt(p.x, p.z, Math.max(1.5, 0.9 * sc), p.v > 0.5 ? 'rgba(200,110,30,.6)' : 'rgba(210,160,40,.6)');
      else if (p.kind === 'pillar' || p.kind === 'block' || p.kind === 'stone') dotAt(p.x, p.z, Math.max(2, 0.9 * sc), '#8a8478');
      else if (p.kind === 'tent' || p.kind === 'hut' || p.kind === 'tower' || p.kind === 'house' || p.kind === 'watermill' || p.kind === 'windmill') { g.fillStyle = p.kind === 'house' ? '#8a3a20' : '#6a3a1a'; const h = p.kind === 'house' ? 3 : 2.2; g.fillRect(X(p.x) - h * sc, Z(p.z) - h * sc, h * 2 * sc, h * 2 * sc); }
      else if (p.kind === 'twall' || p.kind === 'tstatue') dotAt(p.x, p.z, Math.max(2, 1.4 * sc), '#9a968a');
    }
    const op = FIELD_SPOTS.outpost; g.strokeStyle = '#6a4020'; g.lineWidth = 2; g.strokeRect(X(CX.F.x + op.x - op.hw), Z(CX.F.z + op.z - op.hd), op.hw * 2 * sc, op.hd * 2 * sc);
    label('翠风前哨', CX.F.x, CX.F.z + 48 + 13); label('苇河', CX.F.x + 30, CX.F.z + riverZ(30) + 7, '#205080'); if (LAKE_ON) label(LAKE.name, CX.F.x + LAKE.cx, CX.F.z + LAKE.cz - LAKE.rz - 6, '#205080'); label('劫掠者营地', CX.F.x - 38, CX.F.z - 47, '#8a1a10');
    label('星落遗迹', CX.F.x + 42, CX.F.z - 57, '#3a4a6a'); label('麦穗村', CX.F.x + 88, CX.F.z + 70); label('风车塔', CX.F.x + 112, CX.F.z + 74, ink, 10); label('水车磨坊', CX.F.x + 100, CX.F.z + 26, ink, 10);
    label('坍塌神殿', CX.F.x + 86, CX.F.z - 102, '#3a4a6a'); label('风蚀高台', CX.F.x - 90, CX.F.z - 104, '#6a3a1a'); label('废矿坑', CX.F.x - 96, CX.F.z + 86, '#5a4a3a'); label('石拱桥', CX.F.x + 80, CX.F.z + riverZ(80) + 9, '#205080', 10); label('守林人小屋', CX.F.x - 58, CX.F.z - 66); label('野猪草甸', CX.F.x - 40, CX.F.z + 40); label('浅滩', CX.F.x - 55, CX.F.z + riverZ(-55) + 7, '#205080', 10);
  } else if (isWildId(id)) {
    // 新地图：路、营地、地点、传送阵、副本入口（全部来自 data/zones_wild.ts）
    const w = WILD[id], O = w.origin, dark = id === 'ember' || /^#[0-3]/.test(w.palette.map[0]), light = dark ? '#f0e0b8' : ink;   // v1.2.39b 深色底图（沉钟海岸 / 镜渊城 / 无声钟楼）地名改浅色
    g.strokeStyle = id === 'ember' ? 'rgba(200,140,90,.7)' : 'rgba(120,80,40,.65)'; g.lineWidth = Math.max(2, 2.4 * sc);
    for (const pl of w.paths) { g.beginPath(); pl.forEach(([x, z], i) => (i ? g.lineTo(X(O.x + x), Z(O.z + z)) : g.moveTo(X(O.x + x), Z(O.z + z)))); g.stroke(); }
    for (const d of w.decor) if (d.kind === 'lava') { g.fillStyle = 'rgba(255,90,20,.85)'; g.beginPath(); g.arc(X(O.x + d.x), Z(O.z + d.z), (d.s ?? 5) * sc, 0, Math.PI * 2); g.fill(); }
      else if (d.kind === 'icelake') { g.fillStyle = 'rgba(160,210,250,.8)'; g.beginPath(); g.arc(X(O.x + d.x), Z(O.z + d.z), (d.s ?? 10) * sc, 0, Math.PI * 2); g.fill(); }
    for (const c of w.camps) {
      g.strokeStyle = '#6a4020'; g.lineWidth = 2; g.beginPath(); g.arc(X(O.x + c.x), Z(O.z + c.z), c.r * sc, 0, Math.PI * 2); g.stroke();
      label(c.name, O.x + c.x, O.z + c.z - c.r - 4, light, 12);
      const wpOn = CX.waypoints.has(c.id); dotAt(O.x + c.waypoint.x, O.z + c.waypoint.z, 5, wpOn ? '#3ab0ff' : '#888'); 
    }
    for (const [k, sp] of Object.entries(w.spots)) if (!/_(altar|core|top)$|route$|outpost$|^west_camp$/.test(k)) label(sp.name, O.x + sp.x, O.z + sp.z + sp.r * 0.6, light, 10);
    for (const d of w.dungeonGates ?? []) label(d.name, O.x + d.x, O.z + d.z - 16, light, 11);
  } else {
    const L = CX.LAYOUTS[id], O = L.origin, s = L.s, hw = L.halfW * s;   // 11-18 副本 ×1.5：设计尺寸 × s（视框在 dgscale 里同步放大）
    g.fillStyle = 'rgba(70,55,45,.55)'; g.fillRect(X(O.x - hw), Z(O.z - 47 * s), hw * 2 * sc, 54 * s * sc);
    g.beginPath(); g.arc(X(L.boss.x), Z(L.boss.z), 14.5 * s * sc, 0, Math.PI * 2); g.fill();
    L.gates.forEach((gt, i) => { if (!gt.visible) return; g.strokeStyle = '#2a1a10'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(O.x - hw), Z(O.z + L.gateZ[i] * s)); g.lineTo(X(O.x + hw), Z(O.z + L.gateZ[i] * s)); g.stroke(); });
    L.def.encounters.forEach((e, i) => label(e.name, O.x + hw + 9 * s, i === 2 ? L.boss.z : O.z + [-15, -36][i] * s, '#f0e0c0', 11));
  }
  // v0.6.9 兴趣点图标（传送阵、营地、副本、首领、稀有、事件；任务目标画圈）
  const pois = base ? [] : poisFor(id);
  for (const p of pois) {
    if (p.kind === 'quest' || p.kind === 'cquest') { wmHits.push({ x: X(p.x), y: Z(p.z), r: 10, poi: p }); continue; }
    const rr = p.kind === 'portal' || p.kind === 'camp' ? 8 : 10;
    drawPoiIcon(g, p.kind, X(p.x), Z(p.z), rr, { live: p.live, dim: p.dim });
    if (p.kind === 'wildboss' || p.kind === 'event' || (p.kind === 'rare' && !p.dim)) { g.font = 'bold 10px "PingFang SC",sans-serif'; g.fillStyle = p.live ? '#c02010' : '#4a2c10'; g.strokeStyle = 'rgba(255,245,220,.85)'; g.lineWidth = 3; const t = p.state ?? ''; if (t) { g.strokeText(t, X(p.x), Z(p.z) + rr + 9); g.fillText(t, X(p.x), Z(p.z) + rr + 9); } }
    wmHits.push({ x: X(p.x), y: Z(p.z), r: rr + 3, poi: p });
  }
  // 任务目标圈（焦点任务金色实线，其它虚线）
  for (const x of tg) {
    if (x.t.point.map !== id) continue;
    const f = x.id === CX.focusId;
    g.strokeStyle = f ? '#e09000' : 'rgba(200,130,0,.7)'; g.fillStyle = f ? 'rgba(255,200,40,.28)' : 'rgba(255,200,40,.12)'; g.lineWidth = f ? 3 : 1.5;
    g.setLineDash?.(f ? [] : [5, 4]); g.beginPath(); g.arc(X(x.t.point.x), Z(x.t.point.z), Math.max(7, (x.t.point.r ?? 3) * sc), 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash?.([]);
  }
  // v0.9.5a 迷雾：野外图没走过的地方盖住（图标一起盖；任务圈留在外面另画）
  if (!base && isExMap(id) && fogGet(id)) {
    const rect = { x: X(v.x0), y: Z(v.z0), w: (v.x1 - v.x0) * sc, h: (v.z1 - v.z0) * sc };
    drawFog(g, id, X, Z, sc, rect);
    wmHits = wmHits.filter(h => !h.poi || h.poi.kind === 'quest' || h.poi.kind === 'cquest' || fogSeenAt(id, h.poi.x, h.poi.z));
    for (const x of tg) { if (x.t.point.map !== id || fogSeenAt(id, x.t.point.x, x.t.point.z)) continue; const f = x.id === CX.focusId; g.strokeStyle = f ? '#e09000' : 'rgba(200,130,0,.8)'; g.lineWidth = f ? 3 : 1.5; g.setLineDash?.([5, 4]); g.beginPath(); g.arc(X(x.t.point.x), Z(x.t.point.z), Math.max(7, (x.t.point.r ?? 3) * sc), 0, Math.PI * 2); g.stroke(); g.setLineDash?.([]); }
  }
  for (const [n, h] of Object.entries(NPC_HOME)) {
    if (h.map !== id) continue;
    const mk = CX.quests.npcMarker(n, CX.progression.level);
    dotAt(h.x, h.z, 4.5, '#3a8a20');
    if (mk) { g.font = 'bold 18px sans-serif'; g.fillStyle = mk === '…' ? '#888' : '#ffcc00'; g.strokeStyle = '#3a2000'; g.lineWidth = 3; g.strokeText(MK_TEXT(mk), X(h.x), Z(h.z) - 13); g.fillText(MK_TEXT(mk), X(h.x), Z(h.z) - 13); }
    g.font = `${Math.round(11 * fk)}px sans-serif`; g.fillStyle = ink; { const nm = CX.npcName(n); g.fillText(nm, X(h.x), free(nm, X(h.x), Z(h.z) + 11 * fk, Math.round(11 * fk))); }
  }
  if (!base) { const fp = exFogPct(id); banner(g, cw, MAPS[id].name, `${MAPS[id].kind === 'dungeon' ? '副本' : '野外'} · ${MAPS[id].levels} 级${fp !== null ? ` · 已探索 ${fp}%` : ''}`); }
  // 路线 + 玩家
  if (id === CX.currentMap()) {
    if (CX.guide && CX.guidePath.length) { g.strokeStyle = '#ffb000'; g.lineWidth = 3; g.setLineDash?.([7, 5]); g.beginPath(); g.moveTo(X(CX.player.pos.x), Z(CX.player.pos.z)); for (const q of CX.guidePath) g.lineTo(X(q.x), Z(q.z)); g.stroke(); g.setLineDash?.([]); }
    if (base) return;
    g.save(); g.translate(X(CX.player.pos.x), Z(CX.player.pos.z)); g.rotate(Math.PI - CX.player.rig.root.rotation.y);
    g.fillStyle = '#d02010'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindShopMap(__ctx: Ctx) {
  CX = __ctx;
  bindWorldMap3d(__ctx, { pick: sandPick });
  document.querySelectorAll('#shop .tab').forEach(t => (t as HTMLElement).onclick = () => {
    const tab = (t as HTMLElement).dataset.tab as ShopTab;
    if (tab === 'exchange') { openExchange(); return; }   // v0.5 C：兑换是全屏面板（左侧标签模板）
    CX.shopTab = tab; CX.shopSel = null; renderShop();
  });
  document.querySelectorAll('#worldmap .tab').forEach(t => (t as HTMLElement).onclick = () => { const v = (t as HTMLElement).dataset.view as WmView; if (v === 'dungeon') { openDungeonTab(); return; } wmView = v; if (wmView === 'zone') wmMap = wmMap ?? CX.currentMap(); renderWorldMap(); });
  wmCv = CX.$('wm-cv') as HTMLCanvasElement;
  const hitAt = (e: MouseEvent) => { const r = wmCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best: typeof wmHits[number] | null = null, bd = 1e9; for (const h of wmHits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= h.r && d < bd) { bd = d; best = h; } } return { best, x, y }; };
  wmCv.addEventListener('click', e => {
    if (wmView === 'zone') { const { best } = hitAt(e); if (best?.poi) wmPoiAct(best.poi); return; }   // v0.9.3i 区域详图：点副本入口 → 副本地图；v0.9.6e 传送石 → 传送、世界首领 → 祭坛
    if (wmView !== 'world') return;
    const { best } = hitAt(e);
    if (best?.map) { if (MAPS[best.map].kind === 'dungeon') { openDungeonTab(best.map); return; } wmMap = best.map; wmView = 'zone'; renderWorldMap(); }
  });
  const tip = CX.$('wm-tip');
  wmCv.addEventListener('mousemove', e => {
    const { best, x, y } = hitAt(e);
    if (!tip) return;
    if (!best) { tip.style.display = 'none'; return; }
    tip.innerHTML = best.poi ? poiTip(best.poi) : best.map ? worldTip(best.map) : '';
    tip.style.display = 'block'; tip.style.left = `${Math.min(x + 14, wmCv.clientWidth - 200)}px`; tip.style.top = `${y + 12}px`;
  });
  wmCv.addEventListener('mouseleave', () => { if (tip) tip.style.display = 'none'; });
  CX.$('btn-map').onclick = () => { if (CX.zone === 'raid' || CX.zone === 'dungeon' || packDungeonHere()) toggleRaidMap(); else toggleWorldMap(); };   // v0.9.3i 副本里打开副本地图
}

// ================================================================ v0.9.6e 3D 沙盘（世界 + 区域）
// 2D 画布照画（3D 可用时 visibility:hidden），这里只把同一份数据组装成 W3Data 交给 worldmap3d。
/** 地点点击（2D / 3D 共用）：副本入口 → 副本地图；已激活传送石 → 传送；世界首领 → 战利品祭坛。返回是否处理了 */
export function wmPoiAct(p: Poi): boolean {
  if (p.did) { openDungeonTab(p.did); return true; }
  if (p.kind === 'waystone' && p.key) {
    const w = exWaystones().find(x => x.id === p.key);
    if (!w) { CX.toast('这块传送石还没激活（走过去点亮）', '#ffb080'); CX.audio.error(); return true; }
    const here = CX.currentMap() === w.map && Math.hypot(CX.player.pos.x - w.x, CX.player.pos.z - w.z) < 25;
    if (here) { CX.toast('你就在这块传送石旁边', '#ffb080'); return true; }
    const lock = mapLock(w.map as MapId); if (lock) { CX.toast(lock, '#f66'); CX.audio.error(); return true; }
    if (goMap(w.map as MapId, { x: w.x + 2.2, z: w.z + 2.2 }, '传送')) CX.togglePanel('worldmap', false);
    return true;
  }
  if (p.kind === 'wildboss' && p.key?.startsWith('wb_')) { openDropGuide(p.key); return true; }
  return false;
}
const SAND_REGION_ICON: Record<string, string> = { frost: '雪岭', ember: '火山', redsand: '台地', foothill: '山麓', darkrock_mine: '矿山', star: '高原',
  ...Object.fromEntries(PACK_WILD_IDS.flatMap(id => WILD[id as WildId].sandIcon ? [[id, WILD[id as WildId].sandIcon!]] : [])) };
/** 世界沙盘高度：各区域一座「山」（类型决定高度 / 形状）+ 底图海面压低 */
const SAND_BUMPS: Partial<Record<MapId, { a: number; r: number; kind?: 'volcano' | 'ridge' | 'mesa' | 'low' }>> = {
  camp: { a: 0.12, r: 0.07 }, field: { a: 0.1, r: 0.12, kind: 'low' }, foothill: { a: 0.55, r: 0.07 }, darkrock_mine: { a: 0.75, r: 0.06 },
  rotting_temple: { a: 0.05, r: 0.06, kind: 'low' }, marsh: { a: 0.02, r: 0.08, kind: 'low' }, star: { a: 0.38, r: 0.08 },
  redsand: { a: 0.32, r: 0.08, kind: 'mesa' }, frost: { a: 0.95, r: 0.11, kind: 'ridge' }, ember: { a: 0.9, r: 0.08, kind: 'volcano' },
};
let seaMask: { w: number; h: number; d: Float32Array } | null = null;
function worldSea(img: HTMLImageElement | null): typeof seaMask {
  if (seaMask || !img || !img.complete || !img.naturalWidth) return seaMask;
  const c = document.createElement('canvas'); c.width = 128; c.height = 72;
  const g = c.getContext?.('2d'); if (!g) return null;
  try {
    g.drawImage(img, 0, 0, 128, 72); const px = g.getImageData(0, 0, 128, 72).data, d = new Float32Array(128 * 72);
    for (let i = 0; i < d.length; i++) { const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2]; d[i] = b > r + 18 && b >= gg - 4 ? 0 : 1; }
    seaMask = { w: 128, h: 72, d };
  } catch { return null; }
  return seaMask;
}
function noise2(x: number, y: number) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number) { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = noise2(i, j), b = noise2(i + 1, j), c = noise2(i, j + 1), d = noise2(i + 1, j + 1), su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; }
function worldHeight(u: number, v: number): number {
  let h = 0.06 + vnoise(u * 14, v * 9) * 0.06;
  for (const [id, b] of Object.entries(SAND_BUMPS) as [MapId, NonNullable<typeof SAND_BUMPS[MapId]>][]) {
    const n = WORLD_NODES[id]; let dx = (u - n.x) * WM_ASPECT, dy = v - n.y;
    if (b.kind === 'ridge') dx *= 0.55;   // 雪岭：东西拉长
    const d = Math.hypot(dx, dy) / b.r; if (d > 2.2) continue;
    let k = Math.exp(-d * d * 1.4);
    if (b.kind === 'volcano') k = k - 0.55 * Math.exp(-d * d * 14);   // 火山口
    if (b.kind === 'mesa') k = Math.min(1, Math.exp(-Math.pow(d, 6) * 0.6) * 1.1);
    if (b.kind === 'ridge') k *= 0.8 + 0.4 * vnoise(u * 40, v * 40);
    h += b.a * k;
  }
  const m = seaMask; if (m) { const i = Math.min(m.w - 1, Math.max(0, Math.round(u * (m.w - 1)))), j = Math.min(m.h - 1, Math.max(0, Math.round(v * (m.h - 1)))); if (!m.d[j * m.w + i]) h = Math.min(h, 0.01); }
  return h;
}
function worldTint(u: number, v: number, h: number): [number, number, number] | null {
  const near = (id: MapId, r: number) => Math.hypot((u - WORLD_NODES[id].x) * WM_ASPECT, v - WORLD_NODES[id].y) < r;
  if (h > 0.5 && near('frost', 0.25)) { const k = Math.min(1, (h - 0.5) * 3); return [1 + k * 0.35, 1 + k * 0.38, 1 + k * 0.45]; }   // 雪岭积雪
  if (near('ember', 0.05) && h > 0.3) return [1.4, 0.7, 0.45];   // 火山口发红
  if (h > 0.45) return [1.08, 1.04, 1];
  return null;
}
let sandBase: HTMLCanvasElement | null = null, sandBaseKey = '';
function sandCanvas(w: number, h: number) { sandBase ??= document.createElement('canvas'); if (sandBase.width !== w || sandBase.height !== h) { sandBase.width = w; sandBase.height = h; } return sandBase.getContext?.('2d') ?? null; }
/** 世界沙盘底图：世界底图 + 道路虚线 + 指引线（名牌 / 图标改成 3D 标签和光柱） */
function worldBase(img: HTMLImageElement | null): { c: HTMLCanvasElement | null; key: string } {
  const ok = !!(img && img.complete && img.naturalWidth), key = `world|${ok}|${CX.guide ? CX.guide.t.point.map : ''}|${CX.currentMap()}`;
  if (typeof document === 'undefined') return { c: null, key };
  if (key === sandBaseKey && sandBase) return { c: sandBase, key };
  const W = CX.isTouch ? 768 : 1100, Hh = Math.round(W / WM_ASPECT), g = sandCanvas(W, Hh); if (!g) return { c: null, key };
  sandBaseKey = key;
  g.fillStyle = '#2a5a7a'; g.fillRect(0, 0, W, Hh);
  if (ok) g.drawImage(img!, 0, 0, W, Hh);
  const P = (id: MapId) => ({ x: WORLD_NODES[id].x * W, y: WORLD_NODES[id].y * Hh });
  g.strokeStyle = 'rgba(70,40,10,.8)'; g.lineWidth = 3; g.setLineDash?.([9, 6]);
  const drawn = new Set<string>();
  for (const l of MAP_LINKS) { const k = [l.from, l.to].sort().join('-'); if (drawn.has(k) || MAPS[l.from as MapId].kind === 'dungeon') continue; drawn.add(k); const a = P(l.from as MapId), b = P(l.to as MapId); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  g.setLineDash?.([]);
  if (CX.guide) { const a = P(CX.currentMap()), b = P(CX.guide.t.point.map as MapId); if (a.x !== b.x || a.y !== b.y) { g.strokeStyle = '#ffc020'; g.lineWidth = 5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
  return { c: sandBase, key };
}
function zoneBase(id: MapId): { c: HTMLCanvasElement | null; key: string } {
  const tg = allTargets().filter(x => x.t.point.map === id);
  const key = `zone|${id}|${tg.map(x => `${x.id}:${Math.round(x.t.point.x)}:${Math.round(x.t.point.z)}`).join(',')}|${CX.focusId}|${id === CX.currentMap() ? CX.guidePath.length : 0}|${Object.keys(NPC_HOME).filter(n => NPC_HOME[n].map === id).map(n => CX.quests.npcMarker(n, CX.progression.level) ?? '').join('')}`;
  if (typeof document === 'undefined') return { c: null, key };
  if (key === sandBaseKey && sandBase) return { c: sandBase, key };
  const v = MAPS[id].view, asp = (v.x1 - v.x0) / (v.z1 - v.z0), S = CX.isTouch ? 768 : 1024;
  const W = asp >= 1 ? S : Math.round(S * asp), Hh = asp >= 1 ? Math.round(S / asp) : S, g = sandCanvas(W, Hh); if (!g) return { c: null, key };
  sandBaseKey = key;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const bg = g.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, Math.max(W, Hh) * 0.7); bg.addColorStop(0, '#f0e0b8'); bg.addColorStop(1, '#c8a870');
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  // 2D 是按画布像素画的（线宽 / 字号固定）：放大一倍画，字和线在沙盘上不至于太细
  const k = Math.max(1, Math.min(2, W / 620)); g.save(); g.scale(k, k); drawZone(g, W / k, Hh / k, id, true); g.restore();
  return { c: sandBase, key };
}
/** 区域的游戏地形高度（世界坐标） */
function zoneGround(id: MapId): ((x: number, z: number) => number) | null {
  if (isWildId(id)) { const w = WILD[id], O = w.origin; return (x, z) => wildGroundY(w, x - O.x, z - O.z); }
  if (id === 'field') return (x, z) => CX.fieldY(x, z);
  if (id === 'camp') return (x, z) => M.groundY(x, z);
  return null;
}
const SAND_PAL: Partial<Record<string, { cloud: number; ground: number }>> = { frost: { cloud: 0xe8f0ff, ground: 0x8a9ab0 }, ember: { cloud: 0x6a5048, ground: 0x4a2a20 }, redsand: { cloud: 0xe8d0b0, ground: 0xa06a3a } };
function pillarKind(p: Poi): W3Poi['kind'] {
  if (p.did || p.kind === 'raid' || p.kind === 'dungeon3') return 'dungeon';
  if (p.kind === 'wildboss' && p.key?.startsWith('wb_')) return 'boss';
  if (p.kind === 'waystone') return 'stone';
  return 'mark';
}
function sandData(): W3Data | null {
  const touch = CX.isTouch, budget = touch ? 1100 : 2300;
  if (wmView === 'world') {
    const img = worldImg(); worldSea(img);
    const ids = Object.keys(MAPS) as MapId[], pois: W3Poi[] = [];
    for (const id of ids) {
      const n = WORLD_NODES[id], m = MAPS[id], lock = mapLock(id), fp = exFogPct(id), here = id === CX.currentMap();
      pois.push({ id: `r:${id}`, kind: 'region', u: n.x, v: n.y, label: m.name, sub: `${m.levels} 级${lock ? ' · 未开放' : fp !== null ? ` · 探索 ${fp}%` : ''}${SAND_REGION_ICON[id] ? ` · ${SAND_REGION_ICON[id]}` : ''}`, tip: worldTip(id), here, lock: !!lock, ref: id });
      // 光柱排在名牌右上：金 = 你在这 / 紫 = 副本 / 红 = 世界首领
      let k = 0; const slot = () => ({ u: n.x + 0.052 + (k % 3) * 0.022, v: n.y - 0.035 + Math.floor(k++ / 3) * 0.03 });
      if (here) pois.push({ id: `you:${id}`, kind: 'you', ...slot(), tip: `<b>你在这里</b><small>${m.name}</small>`, ref: id });
      { const bd = mapBadgeOf(id); if (bd) pois.push({ id: `bd:${id}`, kind: 'mark', u: n.x, v: n.y - 0.06, glyph: bd, color: '#5ff0e0', tip: `<b>${bd}</b><small>${m.name}</small>`, ref: id }); }   // v1.2.5 醒目标记
      if (m.kind === 'dungeon') pois.push({ id: `dg:${id}`, kind: 'dungeon', ...slot(), label: '', tip: worldTip(id), ref: { did: id } });
      if (isWildId(id)) for (const d of (WILD[id].dungeonGates ?? []).filter(x => !(x.id in MAPS))) pois.push({ id: `dg:${d.id}`, kind: 'dungeon', ...slot(), tip: `<b>${d.name}</b><small>${MAPS[id].name}</small><div>${d.desc}</div>`, ref: { did: d.id } });
      for (const b of poisFor(id).filter(p => p.kind === 'wildboss' && p.key?.startsWith('wb_'))) pois.push({ id: `wb:${b.key}`, kind: 'boss', ...slot(), tip: poiTip(b), ref: b });
    }
    // 云雾：没开放 / 没探索完的野外区域，各撒一团（边缘的先散）
    const fogIds = ids.filter(id => MAPS[id].kind !== 'dungeon' && (mapLock(id) || isExMap(id)));   // 没去过的野外图 = 探索 0%
    const per = fogIds.length ? Math.floor(budget / fogIds.length) : 0, clouds: W3Cloud[] = [], meta: { id: MapId; rank: number; n: number }[] = [];
    for (const id of fogIds) {
      const n = WORLD_NODES[id], rn = (() => { let s = hash32(id); return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })(), list: { u: number; v: number; d: number }[] = [];
      for (let i = 0; i < per; i++) { const a = rn() * Math.PI * 2, r = Math.sqrt(rn()) * 0.085; list.push({ u: n.x + Math.cos(a) * r / WM_ASPECT * 1.15, v: n.y + Math.sin(a) * r * 0.9, d: r }); }
      list.sort((a, b) => b.d - a.d).forEach((c, i) => { clouds.push({ u: c.u, v: c.v, s: 0.024 }); meta.push({ id, rank: i, n: list.length }); });
    }
    const pct: Record<string, number> = {}; for (const id of fogIds) pct[id] = mapLock(id) ? 0 : exFogPct(id) ?? 0;
    const b = worldBase(img);
    return { view: 'world', key: 'world', title: '暗岩大陆', sub: '点击区域推近 · 拖动旋转 · 滚轮缩放', aspect: WM_ASPECT, base: b.c, baseSig: b.key, height: worldHeight, relief: 0.07, tint: worldTint, ground: 0x6a7a4a, accent: 0xffc040, pois, clouds, cloudColor: 0xf4ecdc,
      cloudAlpha: i => { const q = meta[i]; return (q.rank + 0.5) / q.n >= pct[q.id] / 100 ? 1 : 0; } };
  }
  const id = wmMap, v = MAPS[id].view, vw = v.x1 - v.x0, vd = v.z1 - v.z0;
  const U = (x: number) => (x - v.x0) / vw, V = (z: number) => (z - v.z0) / vd;
  // 高度：游戏地形按 48×48 采样归一化（v0.9.3a 高度图同一个函数）
  const gf = zoneGround(id); let lo = 0, hi = 0; const N = 48, samp = new Float32Array(N * N);
  if (gf) { lo = Infinity; hi = -Infinity; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const y = gf(v.x0 + i / (N - 1) * vw, v.z0 + j / (N - 1) * vd); samp[j * N + i] = y; lo = Math.min(lo, y); hi = Math.max(hi, y); } }
  const span = Math.max(0.001, hi - lo), relief = gf && span > 0.5 ? Math.max(0.025, Math.min(0.09, span / vw * 2.2)) : 0.012;
  const height = (u: number, w: number) => {
    if (!gf || span <= 0.5) return 0.5 + (vnoise(u * 10, w * 10) - 0.5) * 0.6;
    const fx = u * (N - 1), fz = w * (N - 1), i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz)), a = fx - i, c = fz - j;
    const y = (samp[j * N + i] * (1 - a) + samp[j * N + i + 1] * a) * (1 - c) + (samp[(j + 1) * N + i] * (1 - a) + samp[(j + 1) * N + i + 1] * a) * c;
    return (y - lo) / span;
  };
  const tint = (_u: number, _w: number, h: number): [number, number, number] | null => id === 'frost' && h > 0.45 ? [1.25, 1.28, 1.35] : id === 'ember' && h > 0.5 ? [0.85, 0.7, 0.65] : h > 0.6 ? [0.92, 0.9, 0.86] : null;
  // 地点：被迷雾盖住的藏起来（同 2D）；任务目标在底图贴图里
  const fg = isExMap(id) ? fogGet(id) : undefined, pois: W3Poi[] = [];
  for (const p of poisFor(id)) {
    if (p.kind === 'quest' || p.kind === 'cquest') continue;
    if (fg && !fogSeenAt(id, p.x, p.z)) continue;
    const k = pillarKind(p), st = POI_STYLE[p.kind];
    pois.push({ id: `${p.kind}:${p.key ?? p.did ?? p.name}:${Math.round(p.x)}:${Math.round(p.z)}`, kind: k, u: U(p.x), v: V(p.z), label: k === 'mark' ? undefined : p.name.replace(/^世界首领 · /, ''), tip: poiTip(p), glyph: st.glyph, color: st.color, dim: !!p.dim, ref: p });
  }
  if (id === CX.currentMap()) pois.push({ id: 'you', kind: 'you', u: U(CX.player.pos.x), v: V(CX.player.pos.z), label: '你', tip: `<b>你在这里</b><small>${MAPS[id].name}</small>` });
  // 云雾：fog.ts 格子（每 stride×stride 格合成一朵；透明度 = 这块里没点亮的比例）
  const clouds: W3Cloud[] = [], blocks: number[][] = [];
  if (fg) {
    const stride = Math.max(1, Math.ceil(Math.sqrt(fg.n * fg.n / budget)));
    for (let j = 0; j < fg.n; j += stride) for (let i = 0; i < fg.n; i += stride) {
      const cells: number[] = []; for (let b = j; b < Math.min(fg.n, j + stride); b++) for (let a = i; a < Math.min(fg.n, i + stride); a++) cells.push(b * fg.n + a);
      const cx = fg.x0 + (i + stride / 2) * FOG_CELL, cz = fg.z0 + (j + stride / 2) * FOG_CELL, u = U(cx), w = V(cz);
      if (u < -0.02 || w < -0.02 || u > 1.02 || w > 1.02) continue;
      clouds.push({ u: Math.max(0.01, Math.min(0.99, u)), v: Math.max(0.01, Math.min(0.99, w)), s: FOG_CELL * stride * 2.3 / vw }); blocks.push(cells);
    }
  }
  let flat = -1;   // 没去过的野外图（还没有迷雾格子）：整片盖云，浓度 = 1 - 存档探索度
  if (!fg && isExMap(id)) {
    const n = Math.min(44, Math.floor(Math.sqrt(budget))); flat = 1 - (exFogPct(id) ?? 0) / 100;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) clouds.push({ u: (i + 0.5) / n, v: (j + 0.5) / n, s: 2.3 / n });
  }
  const fp = exFogPct(id), b = zoneBase(id), pal = SAND_PAL[id];
  return { view: 'zone', key: id, title: MAPS[id].name, sub: `${MAPS[id].kind === 'dungeon' ? '副本' : '野外'} · ${MAPS[id].levels} 级${fp !== null ? ` · 已探索 ${fp}%` : ''}`, aspect: vw / vd, base: b.c, baseSig: b.key,
    height, relief, tint, ground: isWildId(id) ? WILD[id].palette.ground : 0x6a7a4a, accent: 0xffc040, pois, clouds, cloudColor: pal?.cloud ?? 0xe4d8bc,
    cloudAlpha: i => { if (flat >= 0) return flat; const cs = blocks[i], s = fg!.seen; let k = 0; for (const c of cs) if (!s[c]) k++; return k / cs.length; } };
}
function hash32(t: string) { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function showSand() {
  if (wm3dBusy()) return;
  const cw = Math.max(200, wmCv.clientWidth || 600), ch = Math.max(120, wmCv.clientHeight || 320);
  const d = sandData(); if (!d) return;
  wm3dShow(wmCv, d, cw, ch);
}
/** 3D 沙盘点击 */
function sandPick(p: W3Poi) {
  const ref = p.ref as (Poi & { did?: string }) | MapId | { did: string } | undefined;
  if (p.kind === 'region' && typeof ref === 'string') {
    const id = ref as MapId;
    if (MAPS[id].kind === 'dungeon') { if (!wm3dFadeOut(() => openDungeonTab(id))) openDungeonTab(id); return; }
    const go = () => { wmMap = id; wmView = 'zone'; renderWorldMap(); };
    if (!wm3dZoomTo(p.u, p.v, go)) go();   // 世界 → 区域：推近 + 云散开 0.6 秒
    return;
  }
  if (p.kind === 'you') { if (wmView === 'world' && typeof ref === 'string') { const id = ref as MapId; if (!wm3dZoomTo(p.u, p.v, () => { wmMap = id; wmView = 'zone'; renderWorldMap(); })) { wmMap = id; wmView = 'zone'; renderWorldMap(); } } return; }
  const did = ref && typeof ref === 'object' ? ref.did : undefined;
  if (did) { const open = () => { openDungeonTab(did); CX.$('raidmap').classList.add('rm-rise'); setTimeout(() => CX.$('raidmap').classList.remove('rm-rise'), 700); }; if (!wm3dFadeOut(open)) open(); return; }   // 区域 → 副本：淡出后浮岛淡入
  if (ref && typeof ref === 'object' && 'kind' in ref) wmPoiAct(ref as Poi);
}

/** v1.2.73 地图上 2D / 3D 按钮的字：显示点下去会切到哪种 */
export function syncM3sw() { const on = CX.settings.map3d !== 'off' && (wm3dActive() || rm3dActive()); document.querySelectorAll('[data-m3sw]').forEach(b => { const t = on ? '2D' : '3D'; if (b.textContent !== t) b.textContent = t; }); }
