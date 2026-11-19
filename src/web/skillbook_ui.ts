// v0.6.8：技能面板（K / ≡ → 技能）——每个技能槽 3 选 1、技能书学习、书页合成、符文（熟练度解锁）、流派推荐卡
// 换技能 / 换符文：只能在非战斗、且不在副本 / 长副本里（营地、野外都可以，免费）
import type { Ctx } from './main';
import { SlotId, ResolvedSkill, SkillDef } from '../core/types';
import { masteryGain } from '../core/SkillBook';
import { SLOT_ROLE, PAGE_ID, TOME_ID, PAGES_PER_TOME, RuneDef, BOOK_DROP } from '../data/skillbook';
import { skillIcon } from './icons';
import { inCombatNow } from './guideui';

let CX!: Ctx;
const SLOTS: SlotId[] = ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate'];   // v0.7.8：+ 第 4 槽
const KEY: Record<string, string> = { skill1: '1', skill2: '2', skill3: '3', skill4: '4', ultimate: 'R' }   // 1107 BUG#22 少 skill4 → 「绝技 undefined」;
const EL_NAME: Record<string, string> = { physical: '物理', fire: '火焰', frost: '冰霜', shadow: '暗影', holy: '神圣', nature: '自然', arcane: '奥术', lightning: '雷电' };
/** 面板里选中的技能（看符文） */
let sel: string | null = null;
let saveTimer = 0;

/** 能不能换技能 / 符文；不能时返回原因 */
export function swapBlocked(): string | null {
  if (CX.zone === 'dungeon' || CX.zone === 'raid') return '副本里不能更换技能和符文（回营地或野外再换）';
  if (inCombatNow()) return '战斗中不能更换技能和符文';
  return null;
}

/** 施放一次：加熟练度，解锁符文时提示 */
export function onSkillCast(s: ResolvedSkill) {
  if (!CX?.skillBook || s.slot === 'basic') return;
  const got = CX.skillBook.addCast(s.baseId);
  for (const r of got) CX.toast(`「${CX.cls.skills[s.baseId]?.name}」熟练度 ${r.need}：解锁符文「${r.name}」（K 打开技能面板装备）`, '#c080ff');
  if (got.length) { CX.save(); dot(); }
  else if (++saveTimer >= 25) { saveTimer = 0; }   // 熟练度随常规存档写入
  if ($('skillbook')?.style.display === 'flex') renderSkillBook();
}

/** 首领 / 精英 / 稀有击杀：几率掉指定技能书（拾取即学会；全学会了折成 3 张书页）+ 书页 */
export function bookDrop(kind: keyof typeof BOOK_DROP, rng: () => number = Math.random) {
  if (!CX?.skillBook) return;
  const d = BOOK_DROP[kind], b = CX.skillBook;
  const pages = d.pages[0] + Math.floor(rng() * (d.pages[1] - d.pages[0] + 1));
  if (pages > 0) { CX.inventory.addStack(PAGE_ID, pages); CX.toast(`获得 技能书页 ×${pages}`, '#7fb0ff'); }
  if (rng() < d.book) {
    const left = b.unlearned();
    if (left.length) {
      const id = left[Math.floor(rng() * left.length)];
      b.learn(id);
      CX.toast(`掉落技能书《${CX.cls.skills[id].name}》，已学会！按 K 装备`, '#c080ff');
      CX.yell(`学会新技能「${CX.cls.skills[id].name}」`, '#c080ff', 2.5);
    } else { CX.inventory.addStack(PAGE_ID, 3); CX.toast('掉落技能书（已全部学会）：折成 技能书页 ×3', '#7fb0ff'); }
    CX.save();
  }
  dot();
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const esc = (t: string) => CX.escHtml(t);

/** 菜单按钮红点：有自选书 / 书页够合成 / 有新解锁但没装的符文 */
function dot() {
  const b = CX.skillBook, inv = CX.inventory;
  const has = inv.stack(TOME_ID) > 0 || inv.stack(PAGE_ID) >= PAGES_PER_TOME;
  const d = document.getElementById('skillbook-dot'); if (d) d.style.display = has ? 'inline-block' : 'none';
  void b;
}

function statLine(d: SkillDef) {
  const st = d.stats, bits = [`伤害 ${st.damage}`, `冷却 ${st.cooldown} 秒`];
  if (st.radius) bits.push(`${d.shape === 'line' ? '宽' : '范围'} ${st.radius} 米`);
  if (st.range > 2) bits.push(`距离 ${st.range} 米`);
  bits.push(EL_NAME[d.element] ?? d.element);
  return bits.join(' · ');
}

export function renderSkillBook() {
  const el = $('sb-body'); if (!el || !CX.skillBook) return;
  const b = CX.skillBook, inv = CX.inventory, role = CX.cls.ext?.book?.roles ?? (SLOT_ROLE as Partial<Record<string, Partial<Record<string, string>>>>)[CX.cls.id] ?? {};
  const block = swapBlocked();
  const tomes = inv.stack(TOME_ID), pages = inv.stack(PAGE_ID);
  let h = `<div class="sb-top"><span>自选技能书 <b>${tomes}</b></span><span>技能书页 <b>${pages}</b>/${PAGES_PER_TOME}</span>
    <button class="btn" id="sb-craft" ${pages >= PAGES_PER_TOME ? '' : 'disabled'}>合成自选书</button>
    ${block ? `<span class="sb-warn">${esc(block)}</span>` : '<span class="sb-ok">可免费更换</span>'}</div>`;
  for (const slot of SLOTS) {
    const cur = b.skillAt(slot).id;
    h += `<div class="sb-row"><div class="sb-role">${role[slot]}<small>${KEY[slot]}</small></div>`;
    for (const d of b.options(slot)) {
      const learned = b.isLearned(d.id), on = d.id === cur, m = b.mastery[d.id] ?? 0;
      const rune = b.rune[d.id] ? b.data.runes.find(r => r.id === b.rune[d.id]) : null;
      h += `<div class="sb-card${on ? ' on' : ''}${learned ? '' : ' locked'}${sel === d.id ? ' sel' : ''}" data-sk="${d.id}">
        ${skillIcon(d.id, '')}<div class="sb-txt"><b>${esc(d.name)}</b><small>${esc((d as SkillDef & { desc?: string }).desc ?? '')}</small>
        <small class="sb-st">${statLine(d)}</small>
        <small class="sb-m">${learned ? `熟练度 ${m}${rune ? ` · 符文「${esc(rune.name)}」` : ''}` : '未学会'}</small></div>
        <div class="sb-act">${on ? '<span class="sb-tag">已装备</span>' : learned ? `<button class="btn" data-eq="${slot}:${d.id}" ${block ? 'disabled' : ''}>装备</button>` : `<button class="btn" data-learn="${d.id}" ${tomes ? '' : 'disabled'} title="消耗 1 本自选技能书">学习</button>`}</div></div>`;
    }
    h += `</div>`;
  }
  // 符文
  const sid = sel && CX.cls.skills[sel] ? sel : b.skillAt('skill1').id;
  const sd = CX.cls.skills[sid], m = b.mastery[sid] ?? 0, runes = b.runesOf(sid);
  h += `<div class="sb-runes"><div class="sb-rh">「${esc(sd.name)}」的符文 <small>熟练度 ${m}（每次施放 +${masteryGain(sd)}）</small></div>`;
  h += `<div class="sb-rl">${runes.map((r: RuneDef) => {
    const ok = b.runeUnlocked(r), on = b.rune[sid] === r.id;
    const pct = Math.min(100, Math.round(m / r.need * 100));
    return `<div class="sb-rune${on ? ' on' : ''}${ok ? '' : ' locked'}"><b>${esc(r.name)}</b>${r.element ? `<i class="sb-el el-${r.element}">${EL_NAME[r.element]}</i>` : ''}<small>${esc(r.desc)}</small>
      ${ok ? (on ? `<button class="btn" data-rune="${sid}:" ${block ? 'disabled' : ''}>卸下</button>` : `<button class="btn" data-rune="${sid}:${r.id}" ${block || !b.isLearned(sid) ? 'disabled' : ''}>装备</button>`)
        : `<div class="sb-bar"><i style="width:${pct}%"></i></div><small>${m}/${r.need}</small>`}</div>`;
  }).join('')}</div>
  <small class="sb-note">元素符文计入元素共鸣（火 / 冰 / 暗影 / 自然→岩）。天赋里指定某个技能的强化，只对那个技能生效。</small></div>`;
  // 推荐卡
  h += `<div class="sb-presets"><div class="sb-rh">流派推荐卡</div><div class="sb-pl">${b.data.presets.map(p => {
    const names = SLOTS.map(s => p.skills[s] ? CX.cls.skills[p.skills[s]!]?.name : '').filter(Boolean).join(' / ');
    return `<div class="sb-preset"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small><small class="sb-st">${esc(names)}</small><button class="btn" data-preset="${p.id}" ${block ? 'disabled' : ''}>一键套用</button></div>`;
  }).join('')}</div></div>`;
  el.innerHTML = h;
  dot();
}

function changed() {
  CX.equipFromBook();
  CX.syncCharacter();
  CX.save();
  renderSkillBook();
}

export function bindSkillBookUi(ctx: Ctx) {
  CX = ctx;
  const body = $('sb-body');
  if (!body) return;
  body.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    const btn = t.closest('button') as HTMLButtonElement | null;
    const b = CX.skillBook, inv = CX.inventory;
    if (btn && !btn.disabled) {
      ev.stopPropagation();
      if (btn.id === 'sb-craft') {
        if (inv.stack(PAGE_ID) >= PAGES_PER_TOME) { inv.useStack(PAGE_ID, PAGES_PER_TOME); inv.addStack(TOME_ID, 1); CX.toast('合成了 1 本「自选技能书」', '#c080ff'); CX.audio.open(); CX.save(); renderSkillBook(); }
        return;
      }
      if (btn.dataset.learn) {
        const id = btn.dataset.learn;
        if (inv.stack(TOME_ID) < 1) return;
        if (b.learn(id)) { inv.useStack(TOME_ID, 1); CX.toast(`学会了「${CX.cls.skills[id].name}」`, '#c080ff'); CX.audio.levelUp?.(); sel = id; changed(); }
        return;
      }
      const why = swapBlocked();
      if (why) { CX.toast(why); CX.audio.error(); return; }
      if (btn.dataset.eq) {
        const [slot, id] = btn.dataset.eq.split(':') as [SlotId, string];
        const err = b.setSkill(slot, id);
        if (err) { CX.toast(err); CX.audio.error(); return; }
        CX.loadout.resetCooldown(slot);
        CX.toast(`技能 ${KEY[slot]} 换成「${CX.cls.skills[id].name}」`, '#ffd100');
        sel = id; changed(); return;
      }
      if (btn.dataset.rune !== undefined) {
        const [sid, rid] = btn.dataset.rune.split(':');
        const err = b.setRune(sid, rid || null);
        if (err) { CX.toast(err); CX.audio.error(); return; }
        changed(); return;
      }
      if (btn.dataset.preset) {
        const p = b.data.presets.find(x => x.id === btn.dataset.preset)!;
        const skipped = b.applyPreset(p);
        CX.toast(skipped.length ? `已套用「${p.name}」，跳过 ${skipped.length} 项：${skipped[0]}${skipped.length > 1 ? ' …' : ''}` : `已套用「${p.name}」`, skipped.length ? '#ffb040' : '#9aff80');
        SLOTS.forEach(s => CX.loadout.resetCooldown(s));
        changed(); return;
      }
      return;
    }
    const card = t.closest('[data-sk]') as HTMLElement | null;
    if (card) { sel = card.dataset.sk!; renderSkillBook(); }
  });
  $('btn-skillbook')?.addEventListener('click', () => CX.togglePanel('skillbook'));
  window.addEventListener('keydown', e => {
    if (!CX.started || e.key.toLowerCase() !== 'k' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    CX.togglePanel('skillbook');
  });
}
