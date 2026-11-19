// ======================================================================
// DLC1 成就（v1.2.9 d1.11a）：12 个，进 PackManifest.achievements；进度从包内状态读（PackManifest.achStats，键 pk_dlc1_*）
// 公平：只在 DLC 构建里存在，本体成就点数 / 称号不受影响（本体读 DLC 存档时这些成就不显示）。
// ======================================================================
import type { AchDef } from '../../data/achievements';
import type { PackCtx } from '../../core/ContentPacks';
import { btState } from './fate';
import { wbDebug } from './worldboss';
import { BELL_SET_PIECES } from './gear40';

const a = (id: string, cat: AchDef['cat'], name: string, desc: string, stat: AchDef['stat'], n: number, pts: number, title?: string): AchDef =>
  ({ id: `dlc1_${id}`, cat, name, desc, stat, n, pts, ...(title ? { title } : {}) });

export const DLC1_ACHIEVEMENTS: AchDef[] = [
  a('lv35', 'grow', '潮声渐起', '角色达到 35 级', 'level', 35, 10),
  a('lv40', 'grow', '深渊回响', '角色达到 40 级', 'level', 40, 30, '深渊回响者'),
  a('ch7', 'grow', '沉钟海岸', '完成第七章', 'pk_dlc1_ch7', 1, 20),
  a('ch8', 'grow', '镜中之城', '完成第八章', 'pk_dlc1_ch8', 1, 20),
  a('fate', 'grow', '命运的岔路', '在钟楼顶层做出选择', 'pk_dlc1_fate', 1, 20),
  a('endA', 'grow', '再鸣', '以「再鸣」结局唤醒沉钟', 'pk_dlc1_endA', 1, 50, '鸣钟人'),
  a('endB', 'grow', '断绳', '以「断绳」结局吞下沉眠者', 'pk_dlc1_endB', 1, 50, '渊噬者'),
  a('bt5', 'fight', '无声的钟楼', '击败无声钟楼的 5 位首领', 'pk_dlc1_bt', 5, 30),
  a('whale', 'fight', '潮退之时', '击败世界首领潮汐巨鲸', 'pk_dlc1_whale', 1, 20),
  a('knights', 'fight', '解除当值', '击败世界首领镜像骑士团', 'pk_dlc1_knights', 1, 20),
  a('wb10', 'chal', '海与镜的猎手', '世界首领累计击杀 10 次', 'pk_dlc1_wb', 10, 30),
  a('bellset', 'coll', '钟声齐鸣', '集齐「无声钟楼」套装 2 件', 'pk_dlc1_bellset', 2, 20),
];

/** 成就读的状态（manifest.achStats 调用；ctx 没绑定时全 0） */
export function dlc1AchStats(ctx: PackCtx | null): Record<string, number> {
  const done = (id: string) => (ctx?.questState(id) === 'done' ? 1 : 0);
  const S = btState() as ReturnType<typeof btState> & { btSet?: string[] }, k = S.kills ?? {};
  const wb = wbDebug.state() as Record<string, { kills?: number }>;
  const kw = wb.dwb_whale?.kills ?? 0, kk = wb.dwb_knights?.kills ?? 0;
  return {
    pk_dlc1_ch7: done('cs7_6'), pk_dlc1_ch8: done('cs8_6'), pk_dlc1_fate: S.fate ? 1 : 0,
    pk_dlc1_endA: S.ending === 'A' ? 1 : 0, pk_dlc1_endB: S.ending === 'B' ? 1 : 0,
    pk_dlc1_bt: ['bt_b1', 'bt_b2', 'bt_b3', 'bt_b4', 'bt_b5'].filter(b => (k[b] ?? 0) > 0).length,
    pk_dlc1_whale: kw, pk_dlc1_knights: kk, pk_dlc1_wb: kw + kk,
    pk_dlc1_bellset: BELL_SET_PIECES.filter(p => (S.btSet ?? []).includes(p)).length,
  };
}
