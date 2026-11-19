// v0.8.0 暗岩深渊面板：入口（传送阵 → 暗岩深渊）+ 每层清完后的岔路选择
// 不 import raid.ts（raid.ts 调这里）；进入 / 纪录由 main.ts 用 bindAbyssUi 注入
import { ink } from './contrast';
import type { AbySave } from '../core/Abyss';
import type { WeekEntry } from '../core/Weekly';
import { ABYSS, MUTS, MutId, PATHS, PathKind } from '../data/abyss';
import { altarShow, altarActive } from './altar3d';

export interface WeeklyView { key: string; muts: MutId[]; end: number; board: WeekEntry[]; claimed: number; rewards: { floor: number; shards: number }[]; runs: number }
export interface AbyssDeps { story: () => { active: boolean; done: boolean }; enterStory: () => boolean; replayEnding: () => void; enterWeekly: () => boolean; weekly: () => WeeklyView; enter: () => boolean; lock: () => string | null; rec: () => AbySave; inAbyss: () => boolean; togglePanel: (id: string, show?: boolean) => void; click: () => void; icon: (id: string) => string }
export interface ChoiceInfo { floor: number; best: number; muts: MutId[]; bonus: number; reward: { gold: number; rolls: number; paragon: number }; choices: PathKind[] }
let D: AbyssDeps | null = null;
let pending: { info: ChoiceInfo; pick: (k: PathKind) => void; leave: () => void } | null = null;
/** v0.9.1q 通关 20 层：终极奖励——从几件暗金（装等 70）里自选一件 */
export interface DarkOpt { name: string; icon: string; lines: string[]; flavor?: string; set?: boolean; /** v0.9.6d 祭坛 3D 用 */ slot?: string; color?: string; tier?: number }
let darkPick: { opts: DarkOpt[]; pick: (i: number) => void; head?: string } | null = null;
let darkSel = 0;   // v0.9.6d 祭坛式选择页：当前预览的一件
const $ = (id: string) => document.getElementById(id)!;
const open = () => $('abyss').style.display === 'flex';
const mutTags = (m: MutId[]) => m.length ? m.map(x => `<span class="abytag" style="border-color:${ink(MUTS[x].color)};color:${ink(MUTS[x].color)}" title="${MUTS[x].desc}">${MUTS[x].name}</span>`).join('') : '<small>无</small>';

function lobby(): string {
  const r = D!.rec(), lock = D!.lock();
  let h = `<p class="abyintro">深渊在三座普通副本的场地里随机展开，每 5 层换一座：每层生命 / 伤害 +8%，第 5、10、15 层是首领，第 20 层是隐藏首领。清完一层选一条岔路，倒下就结束这一趟，只保留最高层数。每层给深渊碎片，在铁匠「淬炼」页重铸暗金。</p>`;
  h += `<div class="fgroup">纪录</div><div class="abyrec"><div><b>${r.best}</b><small>最高层</small></div><div><b>${r.clears}</b><small>通关 ${ABYSS.maxFloor} 层</small></div><div><b>${r.bestTime ? `${Math.floor(r.bestTime / 60)}:${String(r.bestTime % 60).padStart(2, '0')}` : '—'}</b><small>最快通关</small></div><div><b>${r.runs}</b><small>挑战次数</small></div></div>`;
  const sy = D!.story();
  if (sy.active || sy.done) h += `<div class="fgroup">第六章 · 暗岩之心</div><div class="lesson-acts">${sy.active ? `<button class="btn${lock ? ' off' : ''}" id="aby-story" ${lock ? 'disabled' : ''}>前往暗岩之心（剧情最终战）</button>` : ''}${sy.done ? '<button class="btn" id="aby-ending">重看结局</button>' : ''}</div>`;
  h += weeklyHtml(lock);
  h += `<div class="fgroup">畸变（选「畸变裂隙」获得，奖励 +25%；后 6 种 11 层起出现）</div><div class="abylist">${(Object.keys(MUTS) as MutId[]).map(m => `<div><span class="abytag" style="border-color:${ink(MUTS[m].color)};color:${ink(MUTS[m].color)}">${MUTS[m].name}</span><small>${MUTS[m].desc}</small></div>`).join('')}</div>`;
  h += `<div class="fgroup">岔路</div><div class="abylist">${(Object.keys(PATHS) as PathKind[]).map(p => `<div><b>${PATHS[p].name}</b><small>${PATHS[p].desc}</small></div>`).join('')}</div>`;
  h += `<div class="lesson-acts"><button class="btn${lock ? ' off' : ''}" id="aby-enter" ${lock ? 'disabled' : ''}>${lock ? lock : D!.inAbyss() ? '重新开始（放弃这一趟）' : '进入暗岩深渊'}</button></div>`;
  return h;
}
const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** v0.8.2 每周挑战：固定种子 + 本地排行（本周前 10） */
function weeklyHtml(lock: string | null): string {
  const w = D!.weekly(), left = Math.max(0, w.end - Date.now()), dd = Math.floor(left / 864e5), hh = Math.floor(left / 36e5) % 24;
  let h = `<div class="fgroup">每周挑战 · ${w.key}</div><div class="abyweek"><p>本周所有角色打同一趟深渊：场地顺序、岔路都固定，开局自带畸变 ${mutTags(w.muts)}。距离换周还有 ${dd} 天 ${hh} 小时。</p>`;
  h += `<div class="abywr">${w.rewards.map(r => `<span class="${w.claimed >= r.floor ? 'got' : ''}">${w.claimed >= r.floor ? '✔' : '◇'} 第 ${r.floor} 层：碎片 ×${r.shards}</span>`).join('')}</div>`;
  h += w.board.length ? `<table class="abyboard"><tr><th>名次</th><th>层数</th><th>用时</th><th>角色</th><th>畸变</th></tr>${w.board.map((e, i) => `<tr${i === 0 ? ' class="top"' : ''}><td>${i + 1}</td><td>${e.floor}${e.cleared ? ' 🏆' : ''}</td><td>${fmtT(e.t)}</td><td>${e.name ? `${e.name} · ` : ''}${e.cls}</td><td>${e.muts}</td></tr>`).join('')}</table>` : '<p><small>本周还没有成绩。</small></p>';
  h += `<div class="lesson-acts"><button class="btn${lock ? ' off' : ''}" id="aby-weekly" ${lock ? 'disabled' : ''}>${lock ? lock : `开始每周挑战（本周已打 ${w.runs} 趟）`}</button></div></div>`;
  return h;
}
function choices(i: ChoiceInfo): string {
  let h = `<div class="fgroup">第 ${i.floor} 层清空 · 奖励 ${i.reward.gold} 金币 + ${i.reward.rolls} 件装备 + ${i.reward.paragon} 印记经验</div>`;
  h += `<div class="abyst">当前畸变：${mutTags(i.muts)}　奖励倍率 ×${i.bonus}　最高纪录 ${i.best} 层</div>`;
  h += `<div class="abyesc">💡 地上还有掉落？先按 <kbd>ESC</kbd>（手机点右上角 ×）关闭本窗口去拾取装备，捡完按 <kbd>E</kbd>（或点「深渊岔路」）再回来选路。</div>`;
  h += `<div class="abypaths">${i.choices.map(k => `<button class="abypath" data-path="${k}"><span class="abyart">${D!.icon(PATHS[k].icon)}</span><span class="abytxt"><b>${PATHS[k].name}</b><small>${PATHS[k].desc}</small></span></button>`).join('')}</div>`;
  h += `<div class="lesson-acts"><button class="btn" id="aby-leave">离开深渊（纪录 ${Math.max(i.best, i.floor)} 层）</button></div>`;
  return h;
}
function darkHtml(d: NonNullable<typeof darkPick>): string {
  let h = `<div class="fgroup">${d.head ?? '🏆 暗岩深渊 20 层通关 · 终极奖励：本职业暗金自选 1 件（每次通关都能领；套装部件在第 10 层结算领）'}</div>`;
  h += `<div class="abyesc">选一件带走（领取时 10% 成为太古）；关掉窗口也不会丢，按 <kbd>E</kbd> 回来再选。</div>`;
  h += `<div class="alt-stage aby-stage" id="aby-stage"></div><button class="btn abytake" id="aby-take" data-dark="${darkSel}">带走「${d.opts[darkSel]?.name ?? ''}」</button>`;   // v0.9.6d 祭坛（3D 不可用时藏起来，点卡片直接领取，同旧版）
  h += `<div class="abydark">${d.opts.map((o, i) => `<button class="abydk${o.set ? ' set' : ''}${i === darkSel ? ' on' : ''}" data-dark="${i}"><span class="abydk-i">${o.icon}</span><b>${o.name}</b>${o.lines.map(l => `<small>${l}</small>`).join('')}${o.flavor ? `<i>${o.flavor}</i>` : ''}</button>`).join('')}</div>`;
  return h;
}
/** v0.9.6d 祭坛式 3D 选择：预览第 i 件（3D 可用时卡片点一下 = 预览，「带走」或再点一次 = 领取） */
function darkAltar() {
  const d = darkPick, st = document.getElementById('aby-stage'), tk = document.getElementById('aby-take');
  if (!d || !st) return false;
  const on = altarShow(st, 'abyss', { id: 'aby_dark', sel: darkSel, boss: '暗岩深渊之主', tint: 0xffb040, items: d.opts.map((o, i) => ({ key: `${i}|${o.name}`, name: o.name, slot: o.slot ?? 'trinket', color: o.color ?? '#e8c060', tier: o.tier ?? 5 })) }, i => darkSelect(i));
  st.style.display = on ? '' : 'none'; if (tk) tk.style.display = on ? '' : 'none';
  return on;
}
function darkSelect(i: number) {
  const d = darkPick; if (!d || !d.opts[i]) return;
  darkSel = i;
  document.querySelectorAll('#aby-body .abydk').forEach((b, k) => b.classList.toggle('on', k === i));
  const tk = document.getElementById('aby-take'); if (tk) { tk.dataset.dark = String(i); tk.textContent = `带走「${d.opts[i].name}」`; }
  darkAltar();
}
export const abyDarkSel = () => darkSel;
export function abyssShowDarkPick(opts: DarkOpt[], pick: (i: number) => void, head?: string) { darkPick = { opts, pick, head }; darkSel = 0; if (D) window.setTimeout(() => { if (darkPick) openAbyss(); }, 1200); }
export const abyssDarkPending = () => !!darkPick;
export function abyssRender() {
  if (!D || !open()) return;
  if (darkPick) { $('aby-title').textContent = darkPick.head ? '暗岩深渊 · 第 10 层结算' : '暗岩深渊 · 终极奖励'; $('aby-x').style.display = ''; $('aby-body').innerHTML = darkHtml(darkPick); darkAltar(); return; }
  $('aby-title').textContent = pending ? `暗岩深渊 · 第 ${pending.info.floor + 1} 层之前` : '暗岩深渊';
  $('aby-x').style.display = '';   // v0.9.1p：选路时也能关（掉落还没捡），岔路选择保留，按 E 重新打开
  $('aby-body').innerHTML = pending ? choices(pending.info) : lobby();
}
export function openAbyss() { if (!D) return; D.togglePanel('abyss', true); abyssRender(); }
export function abyssShowChoices(info: ChoiceInfo, pick: (k: PathKind) => void, leave: () => void) {
  pending = { info, pick, leave };
  if (!D) return;
  // 先让掉落飞一会儿再弹
  window.setTimeout(() => { if (pending?.info === info) openAbyss(); }, 900);
}
export function abyssHideChoices() { const was = !!pending; pending = null; if (was && D && open()) D.togglePanel('abyss', false); }
export const abyssPending = () => pending ? pending.info.choices.slice() : null;
export function bindAbyssUi(d: AbyssDeps) {
  D = d;
  $('aby-body').addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const dk = t.closest('[data-dark]') as HTMLElement | null;
    if (dk && darkPick) { D!.click(); const i = +dk.dataset.dark!; if (altarActive() && dk.classList.contains('abydk') && i !== darkSel) { darkSelect(i); return; } const d = darkPick; darkPick = null; d.pick(i); D!.togglePanel('abyss', false); return; }
    const p = t.closest('[data-path]') as HTMLElement | null;
    if (p && pending) { D!.click(); pending.pick(p.dataset.path as PathKind); return; }
    if (t.closest('#aby-leave') && pending) { D!.click(); const l = pending.leave; pending = null; D!.togglePanel('abyss', false); l(); return; }
    if (t.closest('#aby-story')) { D!.click(); D!.togglePanel('abyss', false); D!.enterStory(); return; }
    if (t.closest('#aby-ending')) { D!.click(); D!.togglePanel('abyss', false); D!.replayEnding(); return; }
    if (t.closest('#aby-weekly')) { D!.click(); D!.togglePanel('abyss', false); D!.enterWeekly(); return; }
    if (t.closest('#aby-enter')) { D!.click(); D!.togglePanel('abyss', false); D!.enter(); }
  });
}
