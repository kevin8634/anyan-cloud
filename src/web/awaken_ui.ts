// v0.7.4：觉醒 + 岩纹镌刻面板（铁匠「觉醒 · 岩纹」/ 角色面板按钮 / 快捷键 U）
// 只列身上和背包里能觉醒或有孔的装备；纹语图鉴：镶对顺序才记入，没发现的只显示提示
import type { Ctx } from './main';
import { ItemInstance, QUALITY_COLOR } from '../core/Loot';
import { canAwaken, affixDef, runeDef, onBossKill, choose, socketable, socketCount, openCost, runesOf, wordOf, insert, remove } from '../core/Awaken';
import { AWK_NEED, RUNE_STONES, RUNE_WORDS, RUNE_DROP, UNSOCKET_GOLD, AWK_XP } from '../data/awaken';
import { CUR_SIGIL } from '../data/exchange';

let CX!: Ctx;
const $ = (id: string) => document.getElementById(id)!;
/** 已发现的纹语（存档 runewords） */
export const runeWords = new Set<string>();
export const runeWordsSave = () => [...runeWords];
export function runeWordsLoad(a?: string[]) { runeWords.clear(); (a ?? []).forEach(x => runeWords.add(x)); }
/** 面板里选中的装备 id 与岩纹 */
let selId: string | null = null;
let selRune: string | null = null;

const allItems = (): ItemInstance[] => [...CX.inventory.equippedItems(), ...CX.inventory.bag] as ItemInstance[];
const relevant = (it: ItemInstance) => canAwaken(it) || socketCount(it) > 0 || (socketable(it) && openCost(it) !== null && it.quality !== 'white');

/** 首领 / 精英击杀：身上装备 +历练，几率掉岩纹 */
export function awakenBossKill(kind: keyof typeof AWK_XP, rng: () => number = Math.random) {
  if (!CX) return;
  const ready = onBossKill(CX.inventory.equippedItems() as ItemInstance[], kind, rng);
  for (const it of ready) CX.toast(`「${it.name}」历练已满，隐藏词条觉醒！（铁匠或按 U 选择）`, '#e080ff');
  const d = RUNE_DROP[kind];
  if (rng() < d.chance) {
    const n = d.count[0] + Math.floor(rng() * (d.count[1] - d.count[0] + 1));
    for (let i = 0; i < n; i++) {
      const r = RUNE_STONES[Math.floor(rng() * RUNE_STONES.length)];
      CX.inventory.addStack(r.id, 1);
      CX.toast(`获得 岩纹「${r.name}」`, r.color);
    }
  }
  if ($('awaken')?.style.display === 'flex') renderAwaken();
}

function afterChange(it: ItemInstance) {
  const w = wordOf(it);
  if (w && !runeWords.has(w.id)) { runeWords.add(w.id); CX.toast(`发现纹语「${w.name}」！${w.desc}`, '#ffd070'); CX.audio.victory?.(); }
  CX.syncCharacter(); CX.save(); renderAwaken();
}

export function openAwaken() { CX.togglePanel('awaken', true); renderAwaken(); }

export function renderAwaken() {
  const body = $('awk-body');
  if (!body) return;
  const items = allItems().filter(relevant);
  if (selId && !items.some(i => i.id === selId)) selId = null;
  const sel = items.find(i => i.id === selId) ?? items[0];
  const eq = new Set(CX.inventory.equippedItems().map(i => i.id));
  const list = items.map(it => {
    const a = it.awk, st = affixDef(a?.pick) ? '◈ 已觉醒' : a?.opts ? '◈ 可选择！' : canAwaken(it) ? `历练 ${a?.xp ?? 0}/${AWK_NEED}` : '';
    const rs = socketCount(it) ? runesOf(it).map(r => runeDef(r)?.glyph ?? '○').join('') : '';
    return `<div class="awk-it${it === sel ? ' on' : ''}" data-awk-sel="${it.id}"><b style="color:${QUALITY_COLOR[it.quality]}">${it.name}</b>${eq.has(it.id) ? ' <small>已穿戴</small>' : ''}<br><small>${st} ${rs}</small></div>`;
  }).join('') || '<div class="dim">还没有可以觉醒或镌刻的装备。紫色装备、副本 / 长副本掉落的装备可以觉醒；武器和胸甲（紫色以上）有岩纹孔。</div>';
  let det = '';
  if (sel) {
    const a = sel.awk;
    det += `<h3 style="color:${QUALITY_COLOR[sel.quality]}">${sel.name}</h3>`;
    if (canAwaken(sel)) {
      const d = affixDef(a?.pick);
      if (d) det += `<div class="awk-sec">◈ 觉醒·<b>${d.name}</b>：${d.desc}</div>`;
      else if (a?.opts) det += `<div class="awk-sec">◈ 历练已满，选择一条隐藏词条（选后不能更改）：${a.opts.map((id, i) => { const o = affixDef(id)!; return `<button class="btn awk-opt" data-awk-pick="${i}"><b>${o.name}</b><br><small>${o.desc}</small></button>`; }).join('')}</div>`;
      else det += `<div class="awk-sec dim">◈ 隐藏词条：？？？　历练 ${a?.xp ?? 0}/${AWK_NEED}（穿在身上击败副本 / 野外首领 +1，长副本首领 +2）</div>`;
    }
    if (sel.kills) det += `<div class="dim">伴你击败 ${sel.kills} 个首领</div>`;
    if (socketable(sel)) {
      const n = socketCount(sel), r = runesOf(sel), w = wordOf(sel), oc = openCost(sel);
      det += `<div class="awk-sec">◯ 岩纹孔（${n}/3）：${r.map((x, i) => { const d = runeDef(x); return `<span class="awk-sock" data-awk-sock="${i}" title="${d ? `${d.name}：${d.desc}（点击取下，${UNSOCKET_GOLD} 金）` : '空孔：先在下面选一颗岩纹，再点这里镶嵌'}" style="${d ? `color:${d.color};border-color:${d.color}` : ''}">${d?.glyph ?? '　'}</span>`; }).join('')}`;
      if (oc) det += ` <button class="btn" data-awk-open>开孔（${oc.gold} 金${oc.sigil ? ` + 暗岩徽记 ×${oc.sigil}` : ''}）</button>`;
      det += '</div>';
      det += w ? `<div class="awk-sec" style="color:#ffd070">纹语·<b>${w.name}</b>：${w.desc}</div>` : n === 3 && r.every(Boolean) ? '<div class="dim">这个顺序不是纹语（单颗岩纹效果照样生效）</div>' : '';
      det += `<div class="awk-sec">背包岩纹：${RUNE_STONES.map(s => { const c = CX.inventory.stack(s.id); return `<span class="awk-rune${selRune === s.id ? ' on' : ''}${c ? '' : ' off'}" data-awk-rune="${s.id}" style="color:${s.color}" title="${s.name}：${s.desc}">${s.glyph}×${c}</span>`; }).join('')}</div>`;
    }
  }
  const codex = RUNE_WORDS.map(w => runeWords.has(w.id)
    ? `<div><b style="color:#ffd070">${w.name}</b> ${w.seq.map(s => runeDef(s)!.glyph).join('→')}：${w.desc}</div>`
    : `<div class="dim">？？？ ——「${w.hint}」</div>`).join('');
  body.innerHTML = `<div class="awk-wrap"><div class="awk-list">${list}</div><div class="awk-det">${det}<h3>纹语图鉴（${runeWords.size}/${RUNE_WORDS.length}）</h3><div class="awk-codex">${codex}</div></div></div>`;
}

function onClick(ev: MouseEvent) {
  const t = (ev.target as HTMLElement).closest('[data-awk-sel],[data-awk-pick],[data-awk-sock],[data-awk-rune],[data-awk-open]') as HTMLElement | null;
  if (!t) return;
  const items = allItems().filter(relevant), sel = items.find(i => i.id === selId) ?? items[0];
  if (t.dataset.awkSel) { selId = t.dataset.awkSel; renderAwaken(); return; }
  if (t.dataset.awkRune) { selRune = selRune === t.dataset.awkRune ? null : t.dataset.awkRune; renderAwaken(); return; }
  if (!sel) return;
  if (t.dataset.awkPick !== undefined) {
    const err = choose(sel, +t.dataset.awkPick);
    if (err) CX.toast(err, '#ff6060'); else CX.toast(`「${sel.name}」觉醒：${affixDef(sel.awk!.pick)!.name}`, '#e080ff');
    afterChange(sel); return;
  }
  if (t.dataset.awkOpen !== undefined) {
    const oc = openCost(sel);
    if (!oc) return;
    if (CX.inventory.gold < oc.gold) { CX.toast(`金币不足（需要 ${oc.gold}）`, '#ff6060'); return; }
    if (oc.sigil && CX.inventory.stack(CUR_SIGIL) < oc.sigil) { CX.toast(`暗岩徽记不足（需要 ${oc.sigil}）`, '#ff6060'); return; }
    CX.inventory.spendGold(oc.gold); if (oc.sigil) CX.inventory.useStack(CUR_SIGIL, oc.sigil);
    sel.sockOpen = (sel.sockOpen ?? 0) + 1;
    CX.toast(`「${sel.name}」开出第 ${socketCount(sel)} 个岩纹孔`, '#ffd070');
    afterChange(sel); return;
  }
  if (t.dataset.awkSock !== undefined) {
    const i = +t.dataset.awkSock, cur = runesOf(sel)[i];
    let err: string | null;
    if (selRune) err = insert(sel, i, selRune, id => CX.inventory.useStack(id, 1), id => CX.inventory.addStack(id, 1));
    else if (cur) err = CX.inventory.gold < UNSOCKET_GOLD ? `金币不足（取下岩纹需要 ${UNSOCKET_GOLD}）` : (CX.inventory.spendGold(UNSOCKET_GOLD), remove(sel, i, id => CX.inventory.addStack(id, 1)));
    else err = '先在「背包岩纹」里选一颗';
    if (err) { CX.toast(err, '#ff6060'); renderAwaken(); return; }
    if (selRune && !CX.inventory.stack(selRune)) selRune = null;
    afterChange(sel);
  }
}

export function bindAwakenUi(ctx: Ctx) {
  CX = ctx;
  $('awk-body')?.addEventListener('click', onClick);
  $('btn-awaken')?.addEventListener('click', () => CX.togglePanel('awaken'));
}
/** 测试用 */
export const awakenDebug = () => ({ words: [...runeWords], selId, selRune });
