// v0.7.13：「推荐下一步」按钮 + 成长目标 + 10 / 25 / 30 级系统教学
// v0.9.6g：按钮升级为「玩法介绍」——首页保留「当前推荐」（nextRecs 不变），下面按章节介绍（guideintro.ts），
//   每章预览复用 v0.9.6d 祭坛 3D（altar3d，打开才渲染，关面板 altarFrame 自动释放；3D 不可用显示 2D 物品条 / 图标）；
//   未解锁章节灰显 + 解锁条件；新章节解锁时按钮冒火星 + 菜单红点（#next-dot 汇总到 #menu-badge），看过后消除（存档 guide.intro，可选字段）。
import { GuideSnap, LESSONS, Lesson, LessonAct, MILESTONES } from '../data/guide_v0713';
import { UNLOCKS } from '../data/unlocks';
import { CHAPTERS, Chapter, IntroSnap, chapterOf } from './guideintro';
import { altarShow, altarStop, type AltarItem } from './altar3d';

export interface Rec { text: string; why: string; act: () => void; btn: string }
export interface NextDeps {
  started: () => boolean; snap: () => GuideSnap; recs: () => Rec[];
  open: (a: LessonAct) => void; togglePanel: (id: string, show?: boolean) => void;
  toast: (m: string, c?: string) => void; addGold: (n: number) => void; click: () => void; save: () => void;
  /** v0.9.6g 玩法介绍：解锁快照 / 章节预览物品（说明书来源 → 祭坛物品）/ 章节按钮动作 */
  isnap?: () => IntroSnap; items?: (src: string, kinds: string[], n: number, anc: boolean) => AltarItem[]; go?: (act: string) => void; cls?: () => string; lessonExtra?: (lv: number) => string[]; classLesson?: (lv: number) => Lesson | undefined;
}
let D: NextDeps | null = null;
const $ = (id: string) => document.getElementById(id)!;
/** 存档 guide：已领的成长目标 / 已看过的教学等级 */
let done = new Set<string>(); let seen = new Set<number>();
let actions: (() => void)[] = [];
/** v0.9.6g 已看过的玩法介绍章节 */
let intro = new Set<string>(); let chSel = ''; let chItems: AltarItem[] = []; let chItemSel = 0; let chUse3d = false;

export const nextSave = () => ({ guide: { done: [...done], seen: [...seen], intro: [...intro] } });
export function nextLoad(s: { done?: string[]; seen?: number[]; intro?: string[] } | null | undefined, level: number) {
  done = new Set(s?.done ?? []);
  // v0.9.6g 老存档没有 intro：读档时已经解锁的章节算看过（不冒火星），之后新解锁的才提示
  intro = new Set(s?.intro ?? CHAPTERS.filter(c => c.unlocked({ level, codexLg: 0, codexSet: 0 })).map(c => c.id));
  chSel = '';
  // 老存档没有这个字段：已经过了的教学不再弹
  seen = new Set(s?.seen ?? LESSONS.filter(l => l.lv <= level).map(l => l.lv));
}
/** 检查成长目标，完成的发金币 */
export function milestoneCheck() {
  if (!D || !D.started()) return [];
  const s = D.snap(), got = MILESTONES.filter(m => !done.has(m.id) && s.level >= m.lv - 2 && m.done(s));
  got.forEach(m => { done.add(m.id); D!.addGold(m.gold); D!.toast(`📘 成长目标完成「${m.name}」+${m.gold} 金币`, '#80ffb0'); });
  if (got.length) { D.save(); if ($('nextstep').style.display === 'flex') renderNext(); }
  return got;
}
/** 升级时调用：到了 10 / 25 / 30 级弹教学 */
export function lessonOnLevel(lv: number, delay = 1600) {
  setTimeout(introSync, 0);   // v0.9.6g 新章节解锁 → 按钮火星
  const l = LESSONS.find(x => x.lv === lv && !seen.has(x.lv)) ?? (seen.has(lv) ? undefined : D?.classLesson?.(lv));   // v1.2.2 内容包职业的专属教学（如 2 级职业要点）
  if (l) { if (delay > 0) setTimeout(() => { if (!seen.has(l.lv)) showLesson(l); }, delay); else showLesson(l); }
}
/** v1.2.53 快速体验：lv 级以下的教学都算看过（升级时排队的弹窗也不再弹） */
export function lessonSkipTo(lv: number) { LESSONS.filter(l => l.lv <= lv).forEach(l => seen.add(l.lv)); for (let i = 1; i <= lv; i++) seen.add(i); }
export function showLesson(l: Lesson) {
  if (!D) return;
  seen.add(l.lv);
  $('lesson-title').textContent = l.title;
  const lines = [...l.lines, ...(D.lessonExtra?.(l.lv) ?? [])];   // v1.2.2 职业专属教学行（内容包职业）
  $('lesson-body').innerHTML = `<ul>${lines.map(x => `<li>${x}</li>`).join('')}</ul><div class="lesson-acts">${l.acts.map(([a, n]) => `<button class="btn" data-lact="${a}">${n}</button>`).join('')}<button class="btn" data-lact="ok">知道了</button></div>`;
  D.togglePanel('lesson', true); D.save();
}
function curMilestones(lv: number) { return MILESTONES.filter(m => !done.has(m.id) && m.lv <= lv + 2); }
export function renderNext() {
  if (!D) return;
  const s = D.snap(), recs = D.recs().slice(0, 4);
  actions = recs.map(r => r.act);
  let h = `<div class="fgroup">当前推荐</div>`;
  h += recs.length ? recs.map((r, i) => `<div class="nsrow${i === 0 ? ' top' : ''}"><div><b>${i === 0 ? '★ ' : ''}${r.text}</b><small>${r.why}</small></div><button class="btn" data-rec="${i}">${r.btn}</button></div>`).join('') : '<p class="cxnote">暂时没有要紧事，随便逛逛吧。</p>';
  // v0.9.6g 玩法介绍章节
  const is = isnap(), fresh = newChapters(is);
  if (!chSel || !chapterOf(chSel)) chSel = fresh[0]?.id ?? 'combat';
  h += `<div class="fgroup">玩法介绍</div><div class="gd-chs" id="gd-chs">${CHAPTERS.map(c => { const ok = c.unlocked(is); return `<span class="gd-ch${ok ? '' : ' lock'}${fresh.includes(c) ? ' new' : ''}${c.id === chSel ? ' on' : ''}" data-ch="${c.id}" title="${ok ? c.name : '未解锁：' + c.lock}"><i>${c.glyph}</i>${c.name}${ok ? '' : ' 🔒'}</span>`; }).join('')}</div><div class="gd-det" id="gd-detail"></div>`;
  const ms = curMilestones(s.level);
  h += `<div class="fgroup">成长目标</div>` + (ms.length ? ms.map(m => `<div class="nsrow${m.done(s) ? ' ok' : ''}"><div><b>${m.lv} 级 · ${m.name}</b><small>${m.desc} · 奖励 ${m.gold} 金币</small></div><span>${m.done(s) ? '✔' : '进行中'}</span></div>`).join('') : '<p class="cxnote">当前等级的成长目标都完成了。</p>');
  // 成长路线：1–30 每级开放什么
  const by: Record<number, string[]> = {};
  UNLOCKS.forEach(u => (by[u.lv] ??= []).push(`★ ${u.name}`));
  MILESTONES.forEach(m => (by[m.lv] ??= []).push(`📘 ${m.name}${done.has(m.id) ? ' ✔' : ''}`));
  LESSONS.forEach(l => (by[l.lv] ??= []).push('🎓 系统教学'));
  h += `<div class="fgroup">成长路线</div><div class="nsroad">${Object.keys(by).map(Number).sort((a, b) => a - b).map(lv => `<div class="${lv <= s.level ? 'past' : ''}${lv > s.level && Object.keys(by).map(Number).filter(x => x > s.level)[0] === lv ? ' nextlv' : ''}"><i>${lv}</i>${by[lv].join('　')}</div>`).join('')}</div>`;
  h += `<div class="lesson-acts">${LESSONS.filter(l => seen.has(l.lv)).map(l => `<button class="btn" data-replay="${l.lv}">重看 ${l.lv} 级教学</button>`).join('')}</div>`;
  $('ns-body').innerHTML = h;
  renderChapter(chSel);
}
export function openNext() { if (!D) return; milestoneCheck(); if (newChapters().length) chSel = ''; D.togglePanel('nextstep'); if ($('nextstep').style.display === 'flex') renderNext(); else altarStop(); }

// ======================================================================  v0.9.6g 玩法介绍
const isnap = (): IntroSnap => D?.isnap?.() ?? { level: D?.snap().level ?? 1, codexLg: 0, codexSet: 0 };
/** 已解锁、没看过、而且有解锁条件的章节（「战斗与职业」一开始就开，不算新） */
const newChapters = (is = isnap()) => CHAPTERS.filter(c => c.lock && c.unlocked(is) && !intro.has(c.id));
export const introNew = () => (D && D.started() ? newChapters().length : 0);
/** 按钮火星 + 菜单红点：新章节解锁时亮，看过后灭（3 秒检查一次 + 升级 / 看章节时立即） */
export function introSync() {
  const n = introNew();
  document.getElementById('btn-next')?.classList.toggle('gd-new', n > 0);
  document.getElementById('btn-next-m')?.classList.toggle('gd-new', n > 0);
  const dot = document.getElementById('next-dot'); if (dot) dot.style.display = n > 0 ? '' : 'none';
  return n;
}
function chPreviewHtml(c: Chapter, ok: boolean) {
  const its = chItems;
  const two = its.length ? its.map((it, i) => `<span class="gd-it${i === chItemSel ? ' sel' : ''}" data-gdi="${i}" style="color:${it.anc ? '#ff2a2a' : it.color}">${it.name}</span>`).join('') : `<span class="gd-ico">${c.glyph}</span>`;
  return `<div class="gd-pv${ok ? '' : ' lock'}"><div class="gd-stage" id="gd-stage"></div><div class="gd-2d" id="gd-2d">${two}</div></div>`;
}
export function renderChapter(id: string) {
  if (!D) return;
  const c = chapterOf(id) ?? CHAPTERS[0], is = isnap(), ok = c.unlocked(is), box = document.getElementById('gd-detail'); if (!box) return;
  if (chSel !== c.id) chItemSel = 0;
  chSel = c.id;
  chItems = ok && c.preview && D.items ? D.items(c.preview.src, c.preview.kinds, c.preview.n, !!c.preview.anc) : [];
  if (chItemSel >= chItems.length) chItemSel = 0;
  box.className = `gd-det${ok ? '' : ' lock'}`;
  box.innerHTML = `<div class="gd-h"><b>${c.glyph} ${c.name}</b>${ok ? '' : `<span class="gd-lk">🔒 解锁条件：${c.lock}</span>`}</div>${chPreviewHtml(c, ok)}<ul>${c.lines(D.cls?.() ?? 'warrior').map(x => `<li>${x}</li>`).join('')}</ul>${ok && c.go ? `<div class="lesson-acts"><button class="btn" data-gdgo="${c.go[0]}">${c.go[1]}</button></div>` : ''}`;
  document.querySelectorAll('#gd-chs .gd-ch').forEach(e => e.classList.toggle('on', (e as HTMLElement).dataset.ch === c.id));
  showPreview();
  if (ok && c.lock && !intro.has(c.id)) { intro.add(c.id); D.save(); document.querySelector(`#gd-chs [data-ch="${c.id}"]`)?.classList.remove('new'); introSync(); }
}
function showPreview() {
  const st = document.getElementById('gd-stage'), two = document.getElementById('gd-2d');
  if (!st || !two) return;
  chUse3d = chItems.length > 0 && altarShow(st, 'nextstep', { id: `intro_${chSel}`, items: chItems, sel: chItemSel, boss: null, tint: 0xffb040 }, i => { chItemSel = i; markItem(); });
  if (!chUse3d && chItems.length === 0) altarStop();
  st.style.display = chUse3d ? '' : 'none';
  two.classList.toggle('with3d', chUse3d);
}
function markItem() {
  document.querySelectorAll('#gd-2d .gd-it').forEach(e => e.classList.toggle('sel', +((e as HTMLElement).dataset.gdi ?? -1) === chItemSel));
  if (chUse3d) showPreview();
}
export const introDebug = () => ({ seen: [...intro], fresh: newChapters().map(c => c.id), unlocked: CHAPTERS.filter(c => c.unlocked(isnap())).map(c => c.id), sel: chSel, items: chItems.length, itemSel: chItemSel, use3d: chUse3d });
/** 测试 / 外部：打开面板并跳到某章 */
export function introOpen(id: string) { if (!D) return; if ($('nextstep').style.display !== 'flex') { milestoneCheck(); D.togglePanel('nextstep', true); } chSel = id; renderNext(); }
export function bindNext(d: NextDeps) {
  D = d;
  $('ns-body').addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest('[data-rec],[data-replay],[data-ch],[data-gdi],[data-gdgo]') as HTMLElement | null; if (!t) return;
    D!.click();
    if (t.dataset.ch) { renderChapter(t.dataset.ch); return; }
    if (t.dataset.gdi) { chItemSel = +t.dataset.gdi; markItem(); return; }
    if (t.dataset.gdgo) { D!.togglePanel('nextstep', false); D!.go?.(t.dataset.gdgo); return; }
    if (t.dataset.rec) { D!.togglePanel('nextstep', false); actions[+t.dataset.rec]?.(); }
    else { const l = LESSONS.find(x => x.lv === +t.dataset.replay!); if (l) showLesson(l); }
  });
  $('lesson-body').addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest('[data-lact]') as HTMLElement | null; if (!t) return;
    D!.click(); D!.togglePanel('lesson', false);
    if (t.dataset.lact !== 'ok') D!.open(t.dataset.lact as LessonAct);
  });
  $('quest-tracker').addEventListener('click', e => { if ((e.target as HTMLElement).closest('#btn-next')) { e.stopPropagation(); openNext(); } });
  document.getElementById('btn-next-m')?.addEventListener('click', () => openNext());
  setInterval(() => { milestoneCheck(); introSync(); }, 3000);
}
export const nextDebug = () => ({ done: [...done], seen: [...seen], intro: [...intro], recs: D ? D.recs().map(r => r.text) : [], snap: D?.snap() });
