// ========== v0.7.10：暗岩印记 UI（角色面板 C，装备方案下面一行） ==========
import { Paragon, MARKS, MARK_CAP, PARAGON_MAX, PARAGON_TALENT_LEVELS, markEff, MarkId } from '../core/Paragon';
import { maxLevel } from '../core/TalentTree';   // v0.9.7：印记在「当前等级上限」开放（本体 30；内容包加上限后随之后移）

export interface ParagonDeps { level: () => number; inLongRaid: () => boolean; sync: () => void; save: () => void; refreshPoints: () => void; toast: (t: string, c?: string) => void; click: () => void; error: () => void; floatXp: (t: string) => void }
let D!: ParagonDeps;
export const paragon = new Paragon();
/** 长副本全额，其他地方 25% */
export const PARAGON_OUTSIDE = 0.25;

export function bindParagon(d: ParagonDeps) {
  D = d;
  paragon.onLevelUp = lv => {
    const tp = PARAGON_TALENT_LEVELS.includes(lv);
    D.toast(`暗岩印记提升到 ${lv} 级！获得 1 点印记点${tp ? ' · 额外 1 个天赋点' : ''}`, '#7fd4ff');
    if (tp) D.refreshPoints();
    D.sync();   // v0.7.11：顺带检查新解锁的印记英灵
    renderParagon();
  };
  if (typeof document !== 'undefined') document.getElementById('paragon')?.addEventListener('click', ev => {
    const b = (ev.target as HTMLElement).closest('[data-pm]') as HTMLElement | null; if (!b) return;
    const id = b.dataset.pm as MarkId, sub = b.dataset.op === '-';
    if (b.dataset.op === 'reset') { if (!paragon.spent) return; paragon.reset(); D.toast('印记点已全部返还'); }
    else if (!(sub ? paragon.remove(id) : paragon.add(id))) { D.error(); return; }
    D.click(); D.sync(); D.save(); renderParagon();
  });
}

/** fix1108 #10：印记开放等级 = min(当前等级上限, 30)。本体 30；装资料片后也是 30 级开放（30–39 级在本体地图拿到的经验转成印记经验） */
export const PARAGON_OPEN = 30;
export const paragonOpenLevel = () => Math.min(maxLevel(), PARAGON_OPEN);
/** 满级之后的经验转进印记；early = 装资料片后 30–39 级打本体内容（升级经验不给，转成印记经验）。返回实际给的印记经验 */
export function paragonGainXp(n: number, early = false): number {
  if (D.level() < (early ? paragonOpenLevel() : maxLevel()) || paragon.level >= PARAGON_MAX) return 0;
  const v = Math.round(n * (D.inLongRaid() ? 1 : PARAGON_OUTSIDE));
  if (v > 0) { paragon.addXp(v); D.floatXp(`+${v} 印记经验`); renderParagon(); }
  return v;
}

export function paragonSave() { return { paragon: paragon.save() }; }
export function paragonLoad(raw: unknown) { paragon.load(raw as never); renderParagon(); }

export function renderParagon() {
  if (typeof document === 'undefined' || !D) return;
  const el = document.getElementById('paragon'); if (!el) return;
  if (D.level() < paragonOpenLevel()) { el.innerHTML = `<span class="pg-t">暗岩印记</span><span class="pg-lock">${paragonOpenLevel()} 级开放：满级后的经验转为印记经验${maxLevel() > PARAGON_OPEN ? `（${PARAGON_OPEN}–${maxLevel() - 1} 级在本体地图的经验也会转入）` : ''}</span>`; return; }   // fix1108 #10
  const p = paragon, need = p.xpToNext(), pct = p.level >= PARAGON_MAX ? 100 : Math.floor(p.xp / need * 100);
  const nextTp = PARAGON_TALENT_LEVELS.find(l => l > p.level);
  const rows = MARKS.map(m => {
    const pts = p.marks[m.id], e = markEff(pts);
    const val = Object.entries(m.per).map(([k, v]) => `${({ power: '强度', hp: '生命', armor: '护甲', haste: '急速', speed: '移速', crit: '暴击', critDmg: '暴伤' } as Record<string, string>)[k]} +${Math.round(v! * e * 10) / 10}${k === 'power' || k === 'hp' || k === 'armor' ? '' : '%'}`).join(' ');
    return `<div class="pg-m" title="${m.desc}：每条最多 ${MARK_CAP} 点，越往后单点收益越低"><b>${m.name}</b><span class="pg-n">${pts}/${MARK_CAP}</span><span class="pg-v">${val || '—'}</span><button class="btn sm" data-pm="${m.id}" data-op="-">−</button><button class="btn sm" data-pm="${m.id}" data-op="+">＋</button></div>`;
  }).join('');
  el.innerHTML = `<div class="pg-h"><span class="pg-t">暗岩印记 ${p.level}/${PARAGON_MAX}</span><span class="pg-bar"><i style="width:${pct}%"></i></span><span class="pg-xp">${p.level >= PARAGON_MAX ? '已满' : `${p.xp}/${need}`}</span><span class="pg-av">可用 ${p.available} 点</span>${nextTp ? `<span class="pg-next">印记 ${nextTp} 级 +1 天赋点</span>` : ''}<button class="btn sm" data-pm="might" data-op="reset">重置</button></div><div class="pg-rows">${rows}</div><div class="pg-tip">长副本里获得全额印记经验，其他地方 25%</div>`;
}
