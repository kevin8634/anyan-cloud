// v0.5 A（账号 B）：耐久度的浏览器版接线——阵亡损耗、HUD 铁砧警告、提示框耐久行、格子角标、商店「修理」页
// 规则和数值在 core/Durability.ts。主线 v0.6.6：从 v0.5.0-c 的 web/dungeonsync.ts 拆出来（等级同步 / 四难度 / 噩梦词缀那一半由 A 的 dungeonplus 取代）
import { durSummary, durOf, repairCost, isBroken, DUR_WARN, DUR_MAX, DUR_DEATH_LOSS, repairCoef, REPAIR_QUALITY_MUL } from '../core/Durability';
import { ItemInstance, QUALITY_COLOR } from '../core/Loot';
import { EQUIP_SLOT_NAME } from '../core/Inventory';
import { uiIcon } from './icons';
import { showTip, hideTip } from './hudbar';
import type { Ctx } from './main';

let CX!: Ctx;

// ---------------------------------------------------------------- 耐久度
/** 阵亡：身上装备掉耐久，返回提示文字 */
export function afterPlayerDeath(): string {
  const broke = CX.inventory.deathLoss();
  const s = durSummary(CX.inventory.equippedItems());
  CX.save();
  return broke.length ? `装备耐久 -${DUR_DEATH_LOSS}%：${broke.map(i => i.name).join('、')} 已损坏（属性失效），请找铁匠修理`
    : s.worn ? `装备耐久 -${DUR_DEATH_LOSS}%（${s.worn} 件低于 ${DUR_WARN}%，记得修理）` : `装备耐久 -${DUR_DEATH_LOSS}%`;
}
/** 全部修理（测试 / 快捷） */
export function repairAllNow(): number { const c = CX.inventory.repairAll(); if (c) { CX.audio.anvil(true); CX.save(); } return c; }

/** 提示框里的耐久行 */
export function durLine(it: ItemInstance): string {
  const d = durOf(it);
  if (d <= 0) return `<span class="dur-broken">耐久 0/${DUR_MAX} · 已损坏：属性、词条、套装、传说特效全部失效</span>`;
  return `<span class="${d <= DUR_WARN ? 'dur-low' : 'dur-ok'}">耐久 ${d}/${DUR_MAX}</span>`;
}
/** 格子角标：已损坏红色遮罩、低耐久黄色条 */
export function durBadge(it: ItemInstance): string {
  const d = durOf(it);
  if (d >= DUR_MAX) return '';
  return d <= 0 ? '<b class="dur-x">损</b>' : `<i class="durbar${d <= DUR_WARN ? ' low' : ''}"><i style="width:${d}%"></i></i>`;
}

// ---------------------------------------------------------------- HUD：耐久警告
let hudSig = '', hudT = 0;
export function updateStatusHud(dt: number) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.25;
  const el = CX.$('status-hud');
  const s = durSummary(CX.inventory.equippedItems());
  const sig = `${s.broken}|${s.worn}`;
  if (sig === hudSig) return;
  hudSig = sig;
  let html = '';
  // 主线 v0.6.6：副本难度 / 誓约的 HUD 由 dungeonplus（dgxHud）显示，这里只剩耐久警告
  if (s.broken || s.worn) html += `<span class="sh-chip sh-dur${s.broken ? ' broken' : ''}" data-tip="dur">${uiIcon('ui_anvil', 'mini')}<em>${s.broken ? `${s.broken} 损坏` : `${s.worn} 件低`}</em></span>`;
  el.innerHTML = html;
  el.style.display = html ? 'flex' : 'none';
  el.querySelectorAll<HTMLElement>('[data-tip]').forEach(c => {
    const tip = () => {
      const eq = CX.inventory.equippedItems().filter(i => durOf(i) <= DUR_WARN);
      return `<b>装备耐久</b><br>${eq.map(i => `<span style="color:${isBroken(i) ? '#ff5050' : '#ffd34d'}">${i.name} ${durOf(i)}/${DUR_MAX}${isBroken(i) ? '（已损坏，属性失效）' : ''}</span>`).join('<br>')}<br><span style="color:#aaa">阵亡时身上装备 -${DUR_DEATH_LOSS}%；找任意铁匠或补给商修理</span>`;
    };
    c.onmouseenter = ev => showTip(tip(), ev);
    c.onmouseleave = hideTip;
    c.onclick = ev => { ev.stopPropagation(); showTip(tip(), ev); setTimeout(hideTip, 3500); };
  });
}

// ---------------------------------------------------------------- 商店「修理」页（铁匠 / 补给商）
export function renderRepairTab(body: HTMLElement, side: HTMLElement) {
  const eq = CX.inventory.equippedItems(), bagD = CX.inventory.bag.filter(i => repairCost(i) > 0);
  const list = [...eq.map(it => ({ it, slot: CX.inventory.slotOf(it) })), ...bagD.map(it => ({ it, slot: null }))];
  if (!list.length) body.innerHTML = '<p class="hint">身上没有装备</p>';
  for (const { it, slot } of list) {
    const d = durOf(it), c = repairCost(it);
    const row = document.createElement('div'); row.className = 'srow' + (d <= 0 ? ' broken' : '');
    row.innerHTML = `${CX.itemSlotHtml(it)}<div class="sinfo"><b class="dk" style="color:${QUALITY_COLOR[it.quality] === '#FFFFFF' ? '#3a2410' : QUALITY_COLOR[it.quality]}">${it.name}</b>
      <small>${slot ? EQUIP_SLOT_NAME[slot] : '背包'} · 装等 ${it.itemLevel} · <span class="${d <= 0 ? 'dur-broken' : d <= DUR_WARN ? 'dur-low' : 'dur-ok'}">耐久 ${d}/${DUR_MAX}${d <= 0 ? ' 已损坏' : ''}</span></small>
      <i class="durbar wide${d <= DUR_WARN ? ' low' : ''}"><i style="width:${d}%"></i></i></div>
      <div class="price">${c ? `${uiIcon('ui_gold', 'mini')}${c}` : ''}</div><button class="btn" data-rep="${it.id}" ${c && c <= CX.inventory.gold ? '' : 'disabled'}>${c ? '修理' : '完好'}</button>`;
    row.querySelector('.slot')!.addEventListener('mouseenter', ev => showTip(CX.itemTip(it, true), ev as MouseEvent));
    row.querySelector('.slot')!.addEventListener('mouseleave', hideTip);
    body.appendChild(row);
  }
  body.querySelectorAll<HTMLElement>('[data-rep]').forEach(b => { b.onclick = () => { const it = CX.inventory.find(b.dataset.rep!); const c = CX.inventory.repair(b.dataset.rep!); if (c) { CX.audio.anvil(true); CX.toast(`修理 ${it?.name ?? ''}：-${c} 金币`, '#ffd100'); CX.save(); CX.renderShop(); } }; });
  const total = CX.inventory.repairAllCost();
  side.innerHTML = `<div class="tip"><b class="tt-name">全部修理</b><br>${total ? `需要 ${uiIcon('ui_gold', 'mini')}${total} 金币（身上 + 背包）` : '所有装备都是完好的'}<br>
    <button class="btn big" id="s-repall" ${total && total <= CX.inventory.gold ? '' : 'disabled'}>${uiIcon('ui_anvil', 'mini')}全部修理</button>${total > CX.inventory.gold ? '<br><span class="cmp-dn">金币不够</span>' : ''}<hr>
    <small>阵亡时身上每件装备耐久 -${DUR_DEATH_LOSS}%。耐久 0 =「已损坏」：装备不会消失，但属性、词条、套装和传说特效全部失效，修好立即恢复。<br>
    修理费 = 缺失耐久 × (0.04 + 0.005 × 装等) × 品质倍率（白 ${REPAIR_QUALITY_MUL.white} / 绿 ${REPAIR_QUALITY_MUL.green} / 蓝 ${REPAIR_QUALITY_MUL.blue} / 紫 ${REPAIR_QUALITY_MUL.purple} / 橙 ${REPAIR_QUALITY_MUL.orange} / 暗金 ${REPAIR_QUALITY_MUL.dark}）。例：装等 32 的紫装从 0 修满 ${Math.ceil(100 * repairCoef(32) * REPAIR_QUALITY_MUL.purple)} 金。</small></div>`;
  const rb = document.getElementById('s-repall');
  if (rb) rb.onclick = () => { const c = repairAllNow(); if (c) { CX.toast(`全部修理：-${c} 金币`, '#ffd100'); CX.renderShop(); } };
}

/** 绑定上下文 */
export function bindDurabilityUi(__ctx: Ctx) {
  CX = __ctx;
}
