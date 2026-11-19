// ======================================================================
// DLC1 40 级职业身体外观（11-04 Rhett 16:55 批：法师 40 级长袍交 01 接入测试）
//   法师穿「潮汐长袍」→ LUX_Mage40Robe（fix2）；时砂穿「逆潮外衣」→ LUX_Chrono40；负棺人穿「寿衣铁铠 / 长夜送葬胸甲」→ LUX_Coffin40（11-04 18:13 批）。
//   模型只在比赛版（assets_aholo/models_hd）；商用构建没有 → models.ts 回落 LUX_Mage / 原写实。
//   战士穿「回响胸铠」→ LUX_Warrior40；猎手穿「群狼锁甲 / 万兽盟约锁甲」→ LUX_Hunter40；炼金穿「回响炼成围裙」→ LUX_Alchemy40（11-04 22:40 第二批）。
//   测试：URL ?robe40=1 强制开、?robe40=0 强制关。贴身版（四职业 40 级套装）交件后在这里加表。
// ======================================================================
import { CLASS_BODY_HOOKS, CLASS_BODY_VARIANTS } from '../../web/chars';
import { S40_BY_CLASS, S40_PIECES_OF } from './sets40';

// 11-05：改为按 40 级职业套装件数触发——身上本职业 40 级套装（sets40.ts）≥ BODY40_MIN 件 → 换整身；
//   原「胸甲件 id 命中」保留（40 级橙装胸甲 lg40_* 与万兽盟约 / 长夜送葬胸甲不是 40 级套装件，仍单件触发）；?robe40=1/0 强制开关不变。
export const BODY40_MIN = 6; // Rhett 11-05 00:58：套装是 6 件，集齐 6 件才换整身

// 胸甲件 id（lgId 或 fixedId）命中任一 → 换身体
const BODY40: Record<string, { chest: string[]; model: string }> = {
  mage: { chest: ['lg40_m_tiderobe'], model: 'LUX_Mage40Robe' },                       // 潮汐长袍
  chrono: { chest: ['lg40_c_tidecoat'], model: 'LUX_Chrono40' },                         // 逆潮外衣（11-04 18:13 Rhett 批 05 交件）
  coffin: { chest: ['lg40_c_shroudplate', 'i_c_set_chest'], model: 'LUX_Coffin40' },
  // 11-04 22:40 第二批（Rhett 自绑，05 rigfix 改 UE 骨名）
  warrior: { chest: ['lg40_w_echoplate'], model: 'LUX_Warrior40' },                     // 回响胸铠（铃铛护肩是身体一部分）
  hunter: { chest: ['lg40_h_packmail', 'i_h_set_hauberk'], model: 'LUX_Hunter40' },      // 群狼锁甲 / 万兽盟约锁甲（狼毛护肩）
  alchemy: { chest: ['lg40_a_apron'], model: 'LUX_Alchemy40' },                          // 回响炼成围裙（肩瓶）     // 寿衣铁铠 / 长夜送葬胸甲（不含棺与灯笼，棺仍挂背骨）
};
type EqItem = { fixedId?: string } | null | undefined;
/** 身上本职业 40 级套装件数（按 fixedId 计） */
export function setPieces(cls: string, eq: Record<string, unknown> | null | undefined): number {
  const ids = S40_PIECES_OF[S40_BY_CLASS[cls] ?? '']; if (!ids || !eq) return 0;
  let n = 0; for (const it of Object.values(eq) as EqItem[]) if (it?.fixedId && ids.includes(it.fixedId)) n++;
  return n;
}
const force = (() => { try { const v = new URLSearchParams(location.search).get('robe40'); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();

for (const [cls, b] of Object.entries(BODY40)) (CLASS_BODY_VARIANTS[cls] ??= []).push(b.model);   // 加载画面预载
CLASS_BODY_HOOKS.push((cls, eq) => {
  const b = BODY40[cls]; if (!b) return null;
  if (force !== null) return force ? b.model : null;
  if (setPieces(cls, eq) >= BODY40_MIN) return b.model;
  const c = eq?.chest as { lgId?: string; fixedId?: string; id?: string } | null | undefined;
  return c && b.chest.some(k => c.lgId === k || c.fixedId === k || c.id === k) ? b.model : null;
});
export const body40Info = () => ({ force, table: BODY40, min: BODY40_MIN });
