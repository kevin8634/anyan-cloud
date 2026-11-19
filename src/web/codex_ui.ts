// v0.7.12：成就与图鉴面板（O）：成就 / 英灵图鉴 / 纹语图鉴 / 首领图鉴 / 装备图鉴（跳到掉落说明书）
import { Achievements, AchSave, AchSnap } from '../core/Achievements';
import { ACHIEVEMENTS, ACH_CAT, AchCat } from '../data/achievements';
import { packAchStats } from '../core/ContentPacks';
import { RUNE_WORDS } from '../data/awaken';
import { BOSSES } from '../data/dungeon_darkrock';
import { RAIDS } from '../data/raids';
import { STAT_NAME } from '../data/spirits';
import { SPIRIT_TIER_AT } from '../data/spirits';
import { spirits } from './spirit_ui';
import { runeWordsSave } from './awaken_ui';

export interface AchDeps {
  snap: () => Omit<AchSnap, 'kills' | 'deaths' | 'bossTypes'>;
  toast: (m: string, c?: string) => void; click: () => void; fanfare: () => void;
  togglePanel: (id: string, show?: boolean) => void; openDropGuide: () => void; save: () => void; started: () => boolean;
}
let D: AchDeps | null = null;
export const ach = new Achievements();
let tab: 'ach' | 'spirit' | 'rune' | 'boss' = 'ach';
let cat: AchCat | 'all' = 'all';
const $ = (id: string) => document.getElementById(id)!;

/** 首领名册：普通副本首领 + 长副本 / 史诗副本首领（按副本分组） */
export function bossRoster(): { group: string; name: string; title: string }[] {
  const r: { group: string; name: string; title: string }[] = [];
  for (const b of Object.values(BOSSES)) r.push({ group: '副本', name: b.name, title: '' });
  for (const rd of Object.values(RAIDS)) for (const b of rd.bosses) r.push({ group: rd.name, name: b.name, title: b.title });
  return r;
}
export function achSnap(): AchSnap {
  const base = D ? D.snap() : ({} as Omit<AchSnap, 'kills' | 'deaths' | 'bossTypes'>);
  return { ...base, ...packAchStats(), kills: ach.kills, deaths: ach.deaths, bossTypes: Object.keys(ach.boss).length } as AchSnap;   // v1.2.9 内容包成就状态
}
/** 检查一次；新完成的成就弹提示 */
export function achCheck() {
  if (!D || !D.started()) return [];
  const got = ach.check(achSnap());
  got.forEach((a, i) => setTimeout(() => D!.toast(`🏆 成就达成「${a.name}」+${a.pts}${a.title ? ` · 获得称号「${a.title}」` : ''}`, '#ffd100'), i * 900));
  if (got.length) { D.fanfare(); D.save(); if ($('achv').style.display === 'flex') renderAchv(); }
  return got;
}
export function achOnKill(name: string, boss: boolean) { ach.kills++; if (boss) ach.noteBoss(name); }
export function achNoteBoss(name: string) { ach.noteBoss(name); }
export function achOnDeath() { ach.deaths++; }
export const achSave = () => ({ ach: ach.save() });
export function achLoad(s?: Partial<AchSave> | null) { ach.load(s); }
export const achTitle = () => ach.title;

function bar(v: number, n: number) { return `<div class="achbar"><i style="width:${Math.round((v / n) * 100)}%"></i><span>${v}/${n}</span></div>`; }
function renderAch() {
  const s = achSnap();
  const cats = Object.keys(ACH_CAT) as AchCat[];
  let h = `<div class="achcats">${['all', ...cats].map(c => `<button class="btn achcat${c === cat ? ' on' : ''}" data-cat="${c}">${c === 'all' ? '全部' : ACH_CAT[c as AchCat]}</button>`).join('')}</div>`;
  const titles = ach.titles();
  h += `<div class="achtitle">称号：<select id="achv-title"><option value="">（不显示）</option>${titles.map(t => `<option${t === ach.title ? ' selected' : ''}>${t}</option>`).join('')}</select> <small>已获得 ${titles.length} 个</small></div><div class="achlist">`;
  const list = ACHIEVEMENTS.filter(a => cat === 'all' || a.cat === cat).sort((a, b) => +!!ach.done[b.id] - +!!ach.done[a.id] || 0);
  for (const a of list) {
    const d = ach.done[a.id];
    h += `<div class="achrow${d ? ' done' : ''}"><b>${d ? '🏆' : '◇'} ${a.name}</b><small>${a.desc}${a.title ? ` · 称号「${a.title}」` : ''}</small>${d ? `<em>${new Date(d).toLocaleDateString()}</em>` : bar(ach.progress(a, s), a.n)}<span class="achpts">${a.pts}</span></div>`;
  }
  return h + '</div>';
}
function renderSpiritCodex() {
  const pool = spirits.pool();
  return `<div class="cxgrid">${pool.map(d => {
    const u = spirits.unlocked(d), t = spirits.tier(d.id);
    return `<div class="cxcard${u ? '' : ' locked'}" style="--c:${d.color}"><b>${u ? `${d.name} · ${d.title}` : '？？？'}</b><small>${u ? `${t} 阶 · ${d.desc(Math.max(1, t))}` : `🔒 ${STAT_NAME[d.unlock.stat]} ${spirits.stat(d.unlock.stat)}/${d.unlock.n}`}</small>${u ? `<i>${d.lore}</i>` : ''}${u && t < 3 ? `<small>升阶：装备时击败首领 ${spirits.xp[d.id] ?? 0}/${SPIRIT_TIER_AT[t] ?? '—'}</small>` : ''}</div>`;
  }).join('')}</div>`;
}
function renderRuneCodex() {
  const got = new Set(runeWordsSave());
  return `<p class="cxnote">纹语配方不会直接告诉你：按顺序镶对 3 颗岩纹才会记入图鉴。下面的提示是唯一线索。</p><div class="cxgrid">${RUNE_WORDS.map(w => {
    const u = got.has(w.id);
    return `<div class="cxcard${u ? '' : ' locked'}" style="--c:#ffd070"><b>${u ? w.name : '未发现的纹语'}</b><small>${u ? w.desc : `提示：${w.hint}`}</small></div>`;
  }).join('')}</div>`;
}
function renderBossCodex() {
  const ros = bossRoster(), known = new Set(ros.map(b => b.name));
  let h = '', g = '';
  for (const b of ros) {
    if (b.group !== g) { if (g) h += '</div>'; g = b.group; h += `<div class="fgroup">${g}</div><div class="cxgrid">`; }
    const n = ach.boss[b.name] ?? 0;
    h += `<div class="cxcard${n ? '' : ' locked'}" style="--c:#ff8000"><b>${n ? b.name : '？？？'}</b><small>${n ? `${b.title ? `${b.title} · ` : ''}击败 ${n} 次` : '尚未击败'}</small></div>`;
  }
  if (g) h += '</div>';
  const extra = Object.entries(ach.boss).filter(([k]) => !known.has(k));
  if (extra.length) h += `<div class="fgroup">精英与稀有</div><div class="cxgrid">${extra.map(([k, n]) => `<div class="cxcard" style="--c:#d0a0ff"><b>${k}</b><small>击败 ${n} 次</small></div>`).join('')}</div>`;
  return h;
}
export function renderAchv() {
  if (!D) return;
  const ros = bossRoster();
  $('achv-sum').textContent = `成就 ${ach.count()}/${ACHIEVEMENTS.length} · 点数 ${ach.points()}/${ach.maxPoints()} · 首领 ${ros.filter(b => ach.boss[b.name]).length}/${ros.length}`;
  const tabs: [typeof tab, string][] = [['ach', '成就'], ['spirit', '英灵图鉴'], ['rune', '纹语图鉴'], ['boss', '首领图鉴']];
  $('achv-body').innerHTML = `<div class="tpages">${tabs.map(([k, n]) => `<button class="btn tpage${k === tab ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('')}<button class="btn tpage" data-tab="gear">装备图鉴 ↗</button></div>`
    + (tab === 'ach' ? renderAch() : tab === 'spirit' ? renderSpiritCodex() : tab === 'rune' ? renderRuneCodex() : renderBossCodex());
  const sel = document.getElementById('achv-title') as HTMLSelectElement | null;
  if (sel) sel.onchange = () => { ach.setTitle(sel.value || null); D!.click(); D!.save(); };
}
function onClick(e: Event) {
  const t = (e.target as HTMLElement).closest('[data-tab],[data-cat]') as HTMLElement | null; if (!t || !D) return;
  if (t.dataset.tab === 'gear') { D.togglePanel('achv', false); D.openDropGuide(); return; }
  if (t.dataset.tab) tab = t.dataset.tab as typeof tab;
  if (t.dataset.cat) cat = t.dataset.cat as typeof cat;
  D.click(); renderAchv();
}
export function bindAchv(d: AchDeps) {
  D = d;
  $('achv-body').addEventListener('click', onClick);
  document.getElementById('btn-achv')?.addEventListener('click', () => d.togglePanel('achv'));
  setInterval(() => achCheck(), 3000);
}
export const achDebug = () => ({ snap: achSnap(), done: Object.keys(ach.done), points: ach.points(), titles: ach.titles(), title: ach.title, boss: { ...ach.boss } });
