// v0.6.7：一键分解面板（背包和铁匠共用）+ 回购栏
// 主线规则：普通装备不能出售（v0.5 C），所以 A 方案里的「一键出售可选项」落在一键分解上：
//   品质勾选 + 只分解不能穿的 + 装等低于 X；保护 套装 / 暗金拓印 / 比身上好的 / 野外首领件 / 已锁定（锁定、暗金永远跳过）；
//   确认前显示件数、材料、金币；勾选记住（存进角色存档 inventory.salvOpts）；
//   回购栏：最近分解的 10 件，退还当时拿到的材料和金币即可找回（本次游戏内）。
import { QUALITIES, QUALITY_COLOR, QUALITY_NAME, Quality, itemColor } from '../core/Loot';
import { SalvageOpts } from '../core/Forge';
import { stackIcon, uiIcon } from './icons';
import type { Ctx } from './main';

let CX!: Ctx;
export function bindSalvageUi(c: Ctx) { CX = c; }

export const DEFAULT_SALV: SalvageOpts = { qualities: ['white', 'green', 'blue'], keepBetter: true, keepElite: true, keepSet: true, keepEngraved: true, onlyUnwearable: false, maxIlvl: 0 };
/** 当前角色的勾选（没有就用默认值并写回，下次打开还在） */
export function salvOpts(): SalvageOpts {
  if (!CX.inventory.salvOpts) CX.inventory.salvOpts = JSON.parse(JSON.stringify(DEFAULT_SALV));
  return CX.inventory.salvOpts as SalvageOpts;
}
let confirm = false;
/** 背包格子高亮用：当前勾选会分解哪些 */
export const salvPickIds = () => new Set(CX.forge.salvagePick(salvOpts()).map(i => i.id));

const matTxt = (ms: { id: string; min?: number; max?: number; count?: number }[]) =>
  ms.map(p => `${stackIcon(p.id).replace('pic ', 'pic mini ')}${CX.forge.stackDef(p.id)?.name ?? p.id} ${p.count ?? (p.min === p.max ? p.min : `${p.min}~${p.max}`)}`).join(' ');

/** 画一键分解面板到 el；changed() = 外层重画（背包 / 商店） */
export function renderSalvagePanel(el: HTMLElement, changed: () => void, opt: { auto?: boolean; prefix?: string } = {}) {
  const P = opt.prefix ?? 's-';
  const o = salvOpts();
  const pick = CX.forge.salvagePick(o), tot = CX.forge.salvageTotals(pick), gold = CX.forge.salvageGoldTotal(pick);
  const qBox = QUALITIES.filter(q => q !== 'dark').map(q => `<label class="ck"><input type="checkbox" data-sq="${q}" ${o.qualities.includes(q) ? 'checked' : ''}><span style="color:${q === 'white' ? '#5a4a30' : QUALITY_COLOR[q]}">${QUALITY_NAME[q]}</span></label>`).join('');
  const ck = (k: keyof SalvageOpts, t: string) => `<label class="ck"><input type="checkbox" data-sk="${k}" ${o[k] ? 'checked' : ''}>${t}</label>`;
  const auto = (['white', 'green'] as const).map(q => `<label class="ck"><input type="checkbox" data-sa="${q}" ${CX.inventory.autoSalvage.includes(q) ? 'checked' : ''}>${QUALITY_NAME[q]}</label>`).join('');
  const bb = CX.forge.buyback;
  el.innerHTML = `<div class="tip salv-panel"><b class="tt-name">一键分解</b>
    <div class="sv-row"><span>品质</span>${qBox}</div>
    <div class="sv-row"><span>只挑</span>${ck('onlyUnwearable', '只分解不能穿的（职业 / 等级不符）')}<label class="ck"><input type="checkbox" class="sv-ilvl-on" ${o.maxIlvl ? 'checked' : ''}>装等低于</label><input type="number" class="sv-ilvl" min="1" max="99" value="${o.maxIlvl || Math.max(1, CX.charSheet().ilvl - 3)}" ${o.maxIlvl ? '' : 'disabled'}></div>
    <div class="sv-row"><span>保护</span>${ck('keepSet', '套装')}${ck('keepEngraved', '带拓印的')}${ck('keepBetter', '比身上好的')}${ck('keepElite', '野外首领特效件')}</div><small>暗金、已锁定的装备永远不会被一键分解</small>
    <div class="sv-sum">将分解 <b>${pick.length}</b> 件${pick.length ? `：${matTxt(tot)} ${uiIcon('ui_gold', 'mini')}+${gold} 金币` : ''}</div>
    ${confirm && pick.length ? `<button class="btn big" id="${P}salv-ok">确认分解 ${pick.length} 件</button> <button class="btn" id="${P}salv-no">取消</button>` : `<button class="btn big" id="${P}salvall" ${pick.length ? '' : 'disabled'}>${uiIcon('ui_salvage', 'mini')}一键分解</button>`}
    <small class="sv-tip">勾选会记住；分解错了可以在回购栏找回（退还当时拿到的材料和金币）。</small>
    ${opt.auto ? `<hr>拾取时自动分解：${auto}<br><small>只对比身上差的生效（已锁定的不会自动分解）</small>` : ''}
    <hr><b>回购栏</b> <small>最近分解的 ${bb.length}/10 件（本次游戏内）</small>
    <div class="sv-bb">${bb.length ? bb.map((e, i) => { const why = CX.forge.whyCannotBuyback(i); return `<div class="sv-bbr"><span style="color:${itemColor(e.item)}">${e.item.name}</span><small>装等 ${e.item.itemLevel}</small><small class="sv-cost">${matTxt(e.mats)}${e.gold ? ` ${uiIcon('ui_gold', 'mini')}${e.gold}` : ''}</small><button class="btn" data-bb="${i}" ${why ? `disabled title="${why}"` : ''}>找回</button></div>`; }).join('') : '<small>还没有分解过装备</small>'}</div></div>`;
  const redo = () => { confirm = false; CX.save(); changed(); };
  el.querySelectorAll('[data-sq]').forEach(b => (b as HTMLInputElement).onchange = () => { const q = (b as HTMLElement).dataset.sq as Quality; o.qualities = (b as HTMLInputElement).checked ? [...o.qualities, q] : o.qualities.filter(x => x !== q); redo(); });
  el.querySelectorAll('[data-sk]').forEach(b => (b as HTMLInputElement).onchange = () => { (o as unknown as Record<string, boolean>)[(b as HTMLElement).dataset.sk!] = (b as HTMLInputElement).checked; redo(); });
  el.querySelectorAll('[data-sa]').forEach(b => (b as HTMLInputElement).onchange = () => { const q = (b as HTMLElement).dataset.sa as 'white'; CX.inventory.autoSalvage = (b as HTMLInputElement).checked ? [...CX.inventory.autoSalvage, q] : CX.inventory.autoSalvage.filter(x => x !== q); redo(); });
  const ilOn = el.querySelector('.sv-ilvl-on') as HTMLInputElement, il = el.querySelector('.sv-ilvl') as HTMLInputElement;
  ilOn.onchange = () => { o.maxIlvl = ilOn.checked ? Math.max(1, +il.value || 1) : 0; redo(); };
  il.onchange = () => { if (ilOn.checked) { o.maxIlvl = Math.max(1, Math.min(99, +il.value || 1)); redo(); } };
  const go = el.querySelector(`#${P}salvall`) as HTMLElement | null; if (go) go.onclick = () => { confirm = true; changed(); };
  const no = el.querySelector(`#${P}salv-no`) as HTMLElement | null; if (no) no.onclick = () => { confirm = false; changed(); };
  const ok = el.querySelector(`#${P}salv-ok`) as HTMLElement | null;
  if (ok) ok.onclick = () => {
    const got = CX.forge.salvageMany(pick); confirm = false;
    CX.toast(got.length ? `分解 ${pick.length} 件（+${gold} 金币），获得：${got.map(g => `${CX.forge.stackDef(g.id)!.name}×${g.count}`).join('、')}` : '没有可分解的装备', '#7fd7ff');
    if (got.length) CX.audio.anvil(true);
    CX.save(); changed();
  };
  el.querySelectorAll('[data-bb]').forEach(b => (b as HTMLElement).onclick = () => {
    const i = +(b as HTMLElement).dataset.bb!, e = CX.forge.buyback[i];
    if (e && CX.forge.buyBack(i)) { CX.toast(`找回了 [${e.item.name}]`, itemColor(e.item)); CX.audio.equip(); CX.save(); changed(); }
  });
}
