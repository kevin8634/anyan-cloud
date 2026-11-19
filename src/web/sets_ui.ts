// v0.5 B：职业套装的浏览器版接线——提示框、角色面板的套装效果、长副本首领的套装掉落（带保底）
// 规则和数值在 core/Sets.ts（命令行模拟 npm run sets 共用）；这里只做界面
// 主线 v0.6.6：暗金典藏 / 典藏任务链（商店「典藏」页）取消，暗金走 A 的 data/darkgold.ts；套装件改由长副本首领掉落（raidSetDrop）
import { ItemInstance, QUALITY_COLOR } from '../core/Loot';
import { SET6, SET4_HINT } from '../data/sets';
import { spec6 } from './setfx';
import { SETS, setOf, classSet, RAID_SET_CHANCE } from '../data/sets';
import { SetPityState, newPity, PITY_BIAS, PITY_FORCE, rollSetPiece } from '../core/Sets';
import { SLOT_IDS } from '../core/types';
import type { Ctx } from './main';

let CX!: Ctx;

export const DARKGOLD = QUALITY_COLOR.dark;
/** 套装保底：每个角色一份（存档 v7 setPity） */
export const setPity: SetPityState = newPity();


export function loadSetsState(s: { setPity?: SetPityState } | null) {
  setPity.dry = s?.setPity?.dry ?? 0;
  setPity.seen = [...(s?.setPity?.seen ?? [])];
}
export function setsSave() { return { setPity: { dry: setPity.dry, seen: [...setPity.seen] } }; }
/** 背包 / 身上 / 仓库里出现的套装件都算「见过」（保底只偏向真正缺的部件） */
export function markSeen(it: ItemInstance) { if (it.setId && it.fixedId && !setPity.seen.includes(it.fixedId)) setPity.seen.push(it.fixedId); }

// ---------------------------------------------------------------- 提示框
/** 套装件提示：套装名、身上生效件数、每个部件是否穿着、2/4 件效果（已激活亮、未激活灰） */
export function setTipHtml(it: ItemInstance): string {
  const set = setOf(it.setId); if (!set) return '';
  const counts = CX.inventory.setCounts();
  const n = counts.get(set.id) ?? 0;
  const worn = new Set(CX.inventory.activeItems().filter(i => i.setId === set.id).map(i => i.fixedId ?? i.name));
  const pieces = set.pieces.map((id, k) => {
    const on = worn.has(id) || worn.has(set.pieceNames[k]);
    return `<span class="set-pc ${on ? 'set-on' : 'set-off'}">${on ? '◆' : '◇'}&nbsp;${set.pieceNames[k]}</span>`;
  }).join(' ');
  const bon = set.bonuses.filter(b => b.desc !== '').map(b => {   // v1.2.12 desc 为空 = 同档附带的第二个修饰器，不单独显示

    const act = n >= b.pieces;
    const six = b.pieces === 6 ? SET6[set.id] : undefined;
    if (six) {   // v0.9.1m：6 件按主专精 / 终极天赋分支，当前生效的那条高亮
      const cur = act ? spec6(set.id) : null;
      const rows = [`<span class="${cur === 'general' ? 'set-act' : 'set-off'}">${six.general}${six.generalHidden ? `<span class="set-hidden">${six.generalHidden}</span>` : ''}${cur === 'general' ? '　✔' : ''}</span>`,
        ...six.branches.map(x => `<span class="${cur === x.spec ? 'set-act' : 'set-off'}">${x.name}：${x.desc}${x.hidden ? `<span class="set-hidden">${x.hidden}</span>` : ''}${cur === x.spec ? '　✔' : ''}</span>`)];
      return `<span class="${act ? 'set-act' : 'set-off'}">（6）按主专精变化，点了该系终极天赋时生效对应分支${act ? '　✔ 已激活' : ''}</span><br>` + rows.join('<br>');
    }
    const hint = b.pieces === 4 && SET4_HINT[set.id] ? `<span class="set-hidden">（${SET4_HINT[set.id]}）</span>` : '';   // 11-04 霜誓 / 狂怒 4 件模糊提示
    return `<span class="${act ? 'set-act' : 'set-off'}">（${b.pieces}）${b.desc ?? b.modifier?.desc ?? ''}${hint}${act ? '　✔ 已激活' : ''}</span>`;
  }).join('<br>');
  return `<span class="set-h">套装：${set.name}（${n}/${set.pieces.length}）</span><br><small class="set-pcs">${pieces}</small><br>${bon}`;
}
// ---------------------------------------------------------------- 角色面板
/** 角色面板的套装 / 暗金行：每套 n/5 + 效果状态；4 件激活时写出变种后的技能名 */
export function charSetRows(row: (k: string, v: string, hint?: string) => string): string {
  const counts = CX.inventory.setCounts();
  let html = '';
  for (const [id, n] of counts) {
    const set = SETS[id]; if (!set) continue;
    const parts = set.bonuses.filter(b => b.desc !== '').map(b => {
      if (n < b.pieces) return `<span class="set-off">${b.pieces} 件：${b.desc}</span>`;
      let txt = b.desc ?? '';
      if (b.modifier) {
        const sk = SLOT_IDS.map(s => CX.loadout.preview(s, { now: CX.T, casterHpPercent: 1, targetEffects: [] })).find(x => x?.appliedModifiers.includes(b.modifier!.id));
        if (sk) txt = `${CX.cls.skills[sk.baseId]?.name ?? sk.baseId} → <b class="set-var">${sk.displayName}</b>`;
      }
      return `<span class="set-act">${b.pieces} 件 ✔ ${txt}</span>`;
    }).join('<br>');
    html += row(set.name, `<span class="set-cnt">${n}/${set.pieces.length}</span>`, parts);
  }
  return html ? `<h4>套装</h4>${html}` : '';
}
/** 当前 4 件套激活的套装 id（测试用） */
export function activeSet4(): string[] { return [...CX.inventory.setCounts()].filter(([, n]) => n >= 4).map(([id]) => id); }

// ---------------------------------------------------------------- 长副本首领的套装掉落（主线 v0.6.6，A 方案「长副本：职业 4 件套」）
/** 长副本首领（不含三首领普通副本）击杀时判定一次：带保底，返回掉落的部件（或 null） */
export function raidSetDrop(ilvl: number, hell: boolean, rng: () => number = Math.random): ItemInstance | null {
  const set = classSet(CX.cls.id);
  if (!set?.pieces.length) return null;
  CX.inventory.equippedItems().concat(CX.inventory.bag, CX.bank ?? []).forEach(markSeen);
  const r = rollSetPiece(set.pieces, hell ? RAID_SET_CHANCE.hell : RAID_SET_CHANCE.normal, setPity, rng);
  if (!r.piece) return null;
  const prev = CX.gen.classId; CX.gen.classId = CX.cls.id;
  const it = CX.gen.generateFixed(r.piece, ilvl);
  CX.gen.classId = prev;
  if (it && r.forced) CX.toast('套装保底：这次必定掉落一件你还没有的套装部件', '#ffd100');
  return it;
}

/** 掉落说明书顶部：套装保底与典藏任务链的说明 */
export function setGuideNote(): string {
  const set = classSet(CX.cls.id);
  CX.inventory.equippedItems().concat(CX.inventory.bag).forEach(markSeen);
  const miss = set ? set.pieces.length - set.pieces.filter(p => setPity.seen.includes(p)).length : 0;
  return set ? `套装「${set.name}」：长副本每个首领 ${Math.round(RAID_SET_CHANCE.normal * 100)}%（炼狱 ${Math.round(RAID_SET_CHANCE.hell * 100)}%），还缺 ${miss} 件；保底：连续 ${PITY_BIAS} 次首领没出新部件后只掉缺的部件，连续 ${PITY_FORCE} 次必掉一件缺的（当前 ${setPity.dry}）。` : '';
}

export function bindSetsUi(__ctx: Ctx) { CX = __ctx; }
