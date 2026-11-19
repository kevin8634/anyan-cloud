// v0.9.9 封存页：查看因为「没有对应扩展内容」而封存的物品（角色身上 / 背包的 + 共享仓库的）。
// 只读：物品数据完整保留，装上对应扩展内容后读档自动放回（core/PackSave.applyPackCompat、travel.bankPackFix）。
// 本文件不能出现任何具体扩展内容的名字（纯净检查）；扩展内容只显示包 id 对应的已注册名字，没注册就显示「未安装的扩展内容」。
import { itemColor, QUALITY_NAME, type ItemInstance } from '../core/Loot';
import { packById } from '../core/ContentPacks';
import type { PackGameSave, SealedItem } from '../core/PackSave';
import { BANK_SEALED_KEY } from './travel';

/** 只用到主模块上下文的这两样（title.ts 进入游戏时传进来） */
export interface SealedCtx { loadedSave: unknown; safeLS: { get(k: string): string | null } }
let CX!: SealedCtx;

const SLOT_FROM: Record<string, string> = { equipped: '身上', bag: '背包' };
export interface SealedView { char: SealedItem[]; stacks: [string, number][]; bank: ItemInstance[] }

/** 读出当前角色和共享仓库的封存内容 */
export function sealedView(): SealedView {
  const ps = (CX.loadedSave as PackGameSave | null)?.packSealed;
  let bank: ItemInstance[] = [];
  try { const x = JSON.parse(CX.safeLS.get(BANK_SEALED_KEY) ?? '[]'); if (Array.isArray(x)) bank = x; } catch { /* 坏数据不显示，也不改 */ }
  return { char: ps?.items ?? [], stacks: Object.entries(ps?.stacks ?? {}), bank };
}
export const sealedCount = (v = sealedView()) => v.char.length + v.stacks.length + v.bank.length;

const packName = (id?: string) => (id && packById(id)?.name) || '未安装的扩展内容';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const row = (it: ItemInstance, from: string) =>
  `<div class="sl-row"><b style="color:${itemColor(it)}">${esc(it.name)}</b><small>${QUALITY_NAME[it.quality] ?? ''} · 装等 ${it.itemLevel ?? '?'}</small><small>${from}</small><small>${esc(packName(it.pack))}</small></div>`;

function render(box: HTMLElement) {
  const v = sealedView();
  const body = [
    v.char.length ? `<h4>本角色（${v.char.length}）</h4>` + v.char.map(s => row(s.item, SLOT_FROM[s.from] ?? s.from)).join('') : '',
    v.stacks.length ? `<h4>本角色材料（${v.stacks.length} 种）</h4>` + v.stacks.map(([k, n]) => `<div class="sl-row"><b>${esc(k.replace(/^@[^:]+:/, ''))}</b><small>× ${n}</small><small>材料</small><small>${esc(packName(k.slice(1, k.indexOf(':'))))}</small></div>`).join('') : '',
    v.bank.length ? `<h4>共享仓库（${v.bank.length}）</h4>` + v.bank.map(it => row(it, '仓库')).join('') : '',
  ].join('') || '<p class="sl-empty">没有封存的物品。</p>';
  box.innerHTML = `<div class="sl-box parch orn"><h2>封存物品<span class="x" id="sl-x">×</span></h2>
    <p class="sl-tip">这些物品属于当前没有启用的扩展内容，已暂时封存：不会被删除、分解或出售。启用对应扩展内容后读档，会自动放回原来的位置（背包满了放不下的继续封存）。</p>
    <div class="sl-list">${body}</div></div>`;
  (box.querySelector('#sl-x') as HTMLElement).onclick = () => closeSealed();
}

let el: HTMLElement | null = null;
export function openSealed() {
  if (!el) {
    el = document.createElement('div'); el.id = 'sealed';
    el.onclick = e => { if (e.target === el) closeSealed(); };
    document.body.appendChild(el);
    const st = document.createElement('style');
    st.textContent = `#sealed{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
#sealed .sl-box{width:min(620px,92vw);max-height:80vh;display:flex;flex-direction:column;padding:14px 18px;color:#eee}
#sealed h2{display:flex;justify-content:space-between;margin:0 0 6px}#sealed h4{margin:10px 0 4px;color:#ffd100}
#sealed .sl-tip{font-size:13px;color:#ffb080;margin:0 0 6px}#sealed .sl-list{overflow:auto}
#sealed .sl-row{display:grid;grid-template-columns:2fr 1.3fr .6fr 1.3fr;gap:6px;padding:4px 2px;border-bottom:1px solid rgba(255,255,255,.08);font-size:14px}
#sealed .sl-row small{color:#bbb}#sealed .sl-empty{color:#aaa}`;
    document.head.appendChild(st);
  }
  render(el); el.style.display = 'flex';
}
export function closeSealed() { if (el) el.style.display = 'none'; }

/** 进入游戏时调用：有封存物品就在行囊标题栏加一个「封存（n）」按钮，没有就不出现（本体正常存档完全看不到它） */
export function initSealedButton(ctx: SealedCtx) {
  CX = ctx;
  const n = sealedCount();
  let b = document.getElementById('bag-sealed') as HTMLButtonElement | null;
  if (!n) { if (b) b.style.display = 'none'; return; }
  if (!b) {
    const g = document.getElementById('bag-guide'); if (!g) return;
    b = document.createElement('button'); b.className = 'btn'; b.id = 'bag-sealed'; b.style.cssText = 'margin:0;padding:3px 10px;color:#ff9a40';
    b.onclick = () => openSealed(); g.insertAdjacentElement('beforebegin', b);
  }
  b.textContent = `封存（${n}）`; b.style.display = '';
}
