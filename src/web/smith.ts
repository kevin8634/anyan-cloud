// v0.5 C：铁匠改版的浏览器版接线——装备锁定、杂物自动出售、兑换货币钱包、铁匠「兑换」全屏面板（左侧标签模板）。
// 规则和数值在 core/Exchange.ts、core/Forge.ts、data/exchange.ts、data/shop.ts（命令行 npm run smith / economy 共用）
// 主线 v0.6.6：批量分解三按钮（→ A 的按品质勾选一键分解）、词条重铸（→ 淬炼）、强化保护符（强化不再掉级）取消；货币来自长副本（raid.ts 调 raidCurrencyDrop）
import { endgameIlvl, ENDGAME } from '../core/EndgameIlvl';
import { ItemInstance, QUALITY_COLOR, QUALITY_NAME, affixRange, AffixDef, ARMOR_TYPE_NAME } from '../core/Loot';
import { EQUIP_SLOTS, EQUIP_SLOT_NAME, EquipSlot } from '../core/Inventory';
import { Exchange, ExchangeState } from '../core/Exchange';
import { FORGE_DATA } from '../data/shop';
import { SPECIAL_AFFIXES } from '../data/loot';
import { classSet } from '../data/sets';
import { CURRENCIES, CurCost, FORGE_ILVL_BONUS, FORGE_QUALITY, FORGE_SERIES, SET_ILVL_BONUS, WEEKLY_LIMIT } from '../data/exchange';
import { uiIcon, stackIcon, itemIcon } from './icons';
import { showTip, hideTip } from './hudbar';
import { openShop } from './shopmap';
import { markSeen } from './sets_ui';
import type { Ctx } from './main';

let CX!: Ctx;
export let exchange!: Exchange;

// ---------------------------------------------------------------- 存档（v8 exchange 字段）
export function loadExchangeState(s: { exchange?: ExchangeState } | null) { exchange.load(s?.exchange ?? null); }
export function exchangeSave() { return { exchange: exchange.save() }; }

const stackName = (id: string) => CX.forge.stackDef(id)?.name ?? id;
const qColor = (q: string) => (QUALITY_COLOR[q as keyof typeof QUALITY_COLOR] === '#FFFFFF' ? '#3a2410' : QUALITY_COLOR[q as keyof typeof QUALITY_COLOR]);

// ---------------------------------------------------------------- 钱包
/** 金币 + 三种兑换货币（兑换面板、商店顶栏） */
export function walletHtml(_compact = true) {
  const cur = CURRENCIES.map(id => `<span class="stk cur" data-tip-stack="${id}" title="${stackName(id)}">${stackIcon(id).replace('pic ', 'pic mini ')}${stackName(id)} <b>${CX.inventory.stack(id)}</b></span>`).join('');
  return `<span class="gold">${uiIcon('ui_gold', 'mini')}${CX.inventory.gold}</span>${cur}`;
}
/** 价格：每一项拥有/需要，不够的标红 */
export function costHtml(c: CurCost, n = 1) {
  const g = `<span class="${CX.inventory.gold >= c.gold * n ? 'ln' : 'cmp-dn'}">${uiIcon('ui_gold', 'mini')}${c.gold * n}</span>`;
  return [g, ...c.cur.map(x => { const have = CX.inventory.stack(x.id); return `<span class="${have >= x.count * n ? 'ln' : 'cmp-dn'}">${stackIcon(x.id).replace('pic ', 'pic mini ')}${stackName(x.id)} ${have}/${x.count * n}</span>`; })].join(' ');
}

// ---------------------------------------------------------------- 通用确认框（叠在面板上面，Esc / 取消关闭）
export function smithDialog(title: string, html: string, ok: { text: string; act: () => void } | null, cancelText = '取消') {
  const d = CX.$('smith-dlg');
  d.innerHTML = `<div class="sd-box parch orn"><h3>${title}</h3><div class="sd-body">${html}</div><div class="sd-btns">${ok ? `<button class="btn big" id="sd-ok">${ok.text}</button>` : ''}<button class="btn" id="sd-cancel">${cancelText}</button></div></div>`;
  d.style.display = 'flex';
  CX.audio.open();
  (document.getElementById('sd-cancel') as HTMLElement).onclick = () => closeSmithDialog();
  if (ok) (document.getElementById('sd-ok') as HTMLElement).onclick = () => { closeSmithDialog(); ok.act(); };
}
export function closeSmithDialog() { const d = CX.$('smith-dlg'); if (d.style.display === 'flex') { d.style.display = 'none'; d.innerHTML = ''; CX.audio.close(); } }
export const smithDialogOpen = () => CX.$('smith-dlg').style.display === 'flex';

// ---------------------------------------------------------------- 锁定
export function lockBtnHtml(it: ItemInstance, id: string) {
  return `<button class="btn lockbtn${it.locked ? ' on' : ''}" ${id.startsWith('data-') ? `${id}="${it.id}"` : `id="${id}"`} title="锁定的装备不会被任何分解按钮处理">${it.locked ? '<i class="lockic"></i>解锁' : '<i class="lockic open"></i>锁定'}</button>`;
}
export function toggleLockUi(it: ItemInstance) {
  const on = CX.inventory.toggleLock(it.id);
  if (on === null) return;
  CX.audio.click();
  CX.toast(on ? `已锁定 [${it.name}]：分解时会跳过` : `已解锁 [${it.name}]`, on ? '#ffd100' : '#d8c090');
  CX.save();
}

// ---------------------------------------------------------------- 杂物：拜访任何商人自动卖掉
export function autoSellJunk() {
  const j = CX.forge.sellJunk();
  if (j.count) { CX.toast(`商人收购了 ${j.count} 件灰色杂物：+${j.gold} 金币`, '#ffd100'); CX.audio.coin(); CX.save(); }
  return j;
}

// ---------------------------------------------------------------- 兑换面板
export type XTab = 'forge' | 'set' | 'gem';
export let xTab: XTab = 'forge';
let xSlot: EquipSlot = 'head';
let xBase: string | null = null;
let xSpecial: string | null = null;

export function openExchange(tab?: XTab) {
  if (tab) xTab = tab;
  CX.togglePanel('exchange', true);
  renderExchange();
}
export function setXState(o: { tab?: XTab; slot?: EquipSlot; base?: string | null; special?: string | null }) {
  if (o.tab) xTab = o.tab;
  if (o.slot) { xSlot = o.slot; xBase = null; xSpecial = null; }
  if (o.base !== undefined) { xBase = o.base; xSpecial = null; }
  if (o.special !== undefined) xSpecial = o.special;
  renderExchange();
}

export function renderExchange() {
  if (!CX.started || CX.$('exchange').style.display !== 'flex') return;
  CX.$('ex-wallet').innerHTML = walletHtml();
  const tabs: [XTab, string, string][] = [
    ['forge', '暗岩锻造', `16 部位 · 自选特殊属性 · 本周 ${exchange.left('forge')}/${WEEKLY_LIMIT.forge}`],
    ['set', '套装缺件', `只换还没有的部件 · 本周 ${exchange.left('set')}/${WEEKLY_LIMIT.set}`],
    ['gem', '宝石升级', '以后开放'],
  ];
  CX.$('ex-tabs').innerHTML = `<div class="fgroup">兑换</div>` + tabs.map(([id, n, sub]) => `<div class="ftab${id === xTab ? ' on' : ''}${id === 'gem' ? ' off' : ''}" data-xtab="${id}">${n}<small>${sub}</small></div>`).join('')
    + `<div class="fgroup">铁匠台</div><div class="ftab" data-xback="1">← 返回铁匠台<small>强化 · 淬炼 · 分解 · 修理</small></div>`
    + `<div class="ex-src"><b>货币来源</b>${CURRENCIES.map(id => `<small>${stackName(id)}：${CX.forge.stackDef(id)?.source ?? ''}</small>`).join('')}</div>`;
  CX.$('ex-tabs').querySelectorAll<HTMLElement>('[data-xtab]').forEach(e => { e.onclick = () => { xTab = e.dataset.xtab as XTab; CX.audio.click(); renderExchange(); }; });
  const back = CX.$('ex-tabs').querySelector<HTMLElement>('[data-xback]'); if (back) back.onclick = () => { CX.shopTab = 'upgrade'; openShop('smith'); };
  const m = CX.$('ex-main');
  m.innerHTML = '';
  if (xTab === 'forge') renderForgeTab(m);
  else if (xTab === 'set') renderSetTab(m);
  else m.innerHTML = `<div class="xrow off"><div class="slot q-blue">${uiIcon('mat_shard')}</div><div class="sinfo"><b>宝石升级</b><small>三颗同级宝石合成一颗高一级的宝石。宝石镶嵌在阶段五下一部分开放。</small></div><button class="btn" id="x-gem" disabled>下一部分开放</button></div>`;
}

const tipOn = (el: Element | null, it: ItemInstance, eq = false) => { if (!el) return; el.addEventListener('mouseenter', ev => showTip(CX.itemTip(it, eq), ev as MouseEvent)); el.addEventListener('mouseleave', hideTip); };

function renderForgeTab(m: HTMLElement) {
  const cls = CX.cls.id, lv = CX.progression.level, ilvl = endgameIlvl(lv + FORGE_ILVL_BONUS, 'purple', lv, ENDGAME.base);   // v0.9.1q 满级固定 40
  const grid = EQUIP_SLOTS.map(s => {
    const b = exchange.forgeBases(cls, s)[0];
    return `<div class="xslot${s === xSlot ? ' on' : ''}" data-xslot="${s}"><div class="slot q-purple">${itemIcon(b ?? s)}</div><small>${EQUIP_SLOT_NAME[s]}</small></div>`;
  }).join('');
  const bases = exchange.forgeBases(cls, xSlot);
  const base = xBase && bases.includes(xBase) ? xBase : bases[0];
  const bdef = CX.gen.base(base);
  const sps = exchange.forgeSpecials(cls, xSlot, base);
  const cost = exchange.forgeCost(xSlot, lv);
  const why = !xSpecial ? '请先选择一条特殊属性' : exchange.whyCannotPay(cost, 'forge') ?? (CX.inventory.isFull ? '背包已满' : null);
  m.innerHTML = `<p class="ex-h">${FORGE_SERIES}系列：每个部位一件史诗装备（装等 ${ilvl}${lv >= ENDGAME.level ? '，满级固定' : ` = 等级 + ${FORGE_ILVL_BONUS}`}，${ARMOR_TYPE_NAME[CX.cls.equip.armorType ?? 'plate']}），3 条随机词条 + 1 条<b>你自己选的</b> ✧ 特殊属性。本周还能锻造 <b>${exchange.left('forge')}</b> 件。</p>
    <div class="xslots">${grid}</div>
    <div class="xdetail"><b class="tt-name">${EQUIP_SLOT_NAME[xSlot]}：${FORGE_SERIES}·${bdef?.name ?? ''}</b>
    ${bases.length > 1 ? `<div class="xchips"><span>底材</span>${bases.map(b => `<button class="btn chip${b === base ? ' on' : ''}" data-xbase="${b}">${CX.gen.base(b)?.name}</button>`).join('')}</div>` : ''}
    <div class="xchips sp"><span>✧ 特殊属性（选一条）</span>${sps.map(a => `<button class="btn chip${a.id === xSpecial ? ' on' : ''}" data-xsp="${a.id}">✧ ${affixRange(a as AffixDef, ilvl, FORGE_QUALITY, 1.6)}</button>`).join('')}</div>
    <div class="xcost">价格：${costHtml(cost)}</div>
    <button class="btn big" id="x-forge" ${why ? 'disabled' : ''}>${uiIcon('ui_anvil', 'mini')}锻造</button>${why ? ` <span class="cmp-dn">${why}</span>` : ''}</div>`;
  m.querySelectorAll<HTMLElement>('[data-xslot]').forEach(e => { e.onclick = () => { xSlot = e.dataset.xslot as EquipSlot; xBase = null; xSpecial = null; CX.audio.click(); renderExchange(); }; });
  m.querySelectorAll<HTMLElement>('[data-xbase]').forEach(e => { e.onclick = () => { xBase = e.dataset.xbase!; xSpecial = null; renderExchange(); }; });
  m.querySelectorAll<HTMLElement>('[data-xsp]').forEach(e => { e.onclick = () => { xSpecial = e.dataset.xsp!; CX.audio.click(); renderExchange(); }; });
  const fb = document.getElementById('x-forge');
  if (fb) fb.onclick = () => {
    const r = exchange.forgeItem(cls, xSlot, base, xSpecial ?? '', lv);
    if (!r.ok) { CX.toast(r.reason, '#ff6060'); return; }
    CX.audio.anvil(true); CX.noteCodex(r.value);
    CX.toast(`锻造完成：[${r.value.name}]`, QUALITY_COLOR[r.value.quality]);
    xSpecial = null; CX.save(); renderExchange();
  };
}

/** 背包 + 身上 + 仓库 */
const ownedItems = () => [...CX.inventory.equippedItems(), ...CX.inventory.bag, ...(CX.bank ?? [])];

function renderSetTab(m: HTMLElement) {
  const set = classSet(CX.cls.id), lv = CX.progression.level;
  if (!set) { m.innerHTML = '<p class="hint">这个职业还没有套装</p>'; return; }
  const missing = exchange.missingSetPieces(set.pieces, ownedItems());
  const cost = exchange.setCost(lv);
  const lim = exchange.left('set');
  m.innerHTML = `<p class="ex-h">套装「${set.name}」缺件兑换：只列出你<b>还没有</b>的部件（背包、身上、仓库都算有），防止一直缺同一件。装等 ${endgameIlvl(lv + SET_ILVL_BONUS, 'purple', lv, ENDGAME.base)}${lv >= ENDGAME.level ? '（满级固定）' : '（= 英雄难度掉落）'}，每周 ${WEEKLY_LIMIT.set} 件，本周剩余 <b>${lim}</b>。</p>
    <div class="xcost">每件价格：${costHtml(cost)}</div>` +
    set.pieces.map((id, k) => {
      const miss = missing.includes(id), why = miss ? exchange.whyCannotPay(cost, 'set') ?? (CX.inventory.isFull ? '背包已满' : null) : '已拥有';
      return `<div class="xrow${miss ? '' : ' off'}"><div class="slot q-purple">${itemIcon(CX.gen.fixedBase(id) ?? '')}</div><div class="sinfo"><b style="color:${QUALITY_COLOR.purple}">${set.pieceNames[k]}</b><small>${miss ? '<span class="cmp-dn">缺少</span>' : '<span class="ln">✔ 已拥有</span>'}</small></div>
        <button class="btn" data-xset="${id}" ${why ? 'disabled' : ''}>${miss ? '兑换' : '已拥有'}</button></div>`;
    }).join('') + (missing.length ? '' : '<p class="hint">套装已经集齐，没有可兑换的部件</p>');
  m.querySelectorAll<HTMLElement>('[data-xset]').forEach(b => { b.onclick = () => {
    const r = exchange.buySetPiece(b.dataset.xset!, set.pieces, ownedItems(), lv);
    if (!r.ok) { CX.toast(r.reason, '#ff6060'); return; }
    markSeen(r.value); CX.noteCodex(r.value); CX.audio.loot('purple');
    CX.toast(`兑换套装部件：[${r.value.name}]`, QUALITY_COLOR.purple); CX.save(); renderExchange();
  }; });
}

/** 绑定上下文 */
export function bindSmith(__ctx: Ctx) {
  CX = __ctx;
  exchange = new Exchange(CX.inventory, CX.gen, FORGE_DATA, SPECIAL_AFFIXES, id => CX.forge.stackDef(id)?.name ?? id);
  // 确认框：Esc 先关它（捕获阶段，不让 Esc 再去关下面的面板）；点遮罩空白处也关闭
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && smithDialogOpen()) { e.stopImmediatePropagation(); e.preventDefault(); closeSmithDialog(); } }, true);
  CX.$('smith-dlg').addEventListener('click', e => { if (e.target === CX.$('smith-dlg')) closeSmithDialog(); });
}
