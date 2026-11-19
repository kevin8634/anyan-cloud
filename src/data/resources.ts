// v0.7.5：职业资源配置（core/Resource.ts）。显示：dots = 头顶光点，arc = 脚边弧形条（手机 = 大招键外圈）
export type ResKind = 'rage' | 'arcane' | 'combo' | 'heat' | (string & {});   // v1.0.6：内容包职业可以带自己的资源种类
import { packClassField } from '../core/ContentPacks';
import type { ClassResDef } from '../core/ClassExt';
export interface ResDef {
  kind: ResKind; name: string; max: number; threshold: number; show: 'dots' | 'arc'; color: string; full: string;
  /** 脱战多少秒后开始衰减、每秒衰减多少（≥999 = 直接清零） */
  decayDelay: number; decayPerSec: number;
  gainBasic?: number; gainSkillHit?: number; gainHurtPerPct?: number; gainReaction?: number;
  desc: string;
  /** v1.0.6：内容包资源的强化规则（core/ClassExt.ts ClassResDef.empower） */
  empower?: ClassResDef['empower'];
}
const BASE_RES_DEF: Record<string, ResDef> = {
  warrior: { kind: 'rage', name: '怒气', max: 100, threshold: 50, show: 'arc', color: '#e03a2a', full: '#ff9a30', decayDelay: 4, decayPerSec: 6,
    gainBasic: 8, gainSkillHit: 4, gainHurtPerPct: 1.5,
    desc: '普攻命中 +8、技能命中 +4、受伤按损失生命增加。满 50：下一个技能 1~3 变「怒·」强化版（伤害 +30%、范围 +25%，消耗 50）；满 100：大招无视冷却（消耗 100）' },
  mage: { kind: 'arcane', name: '奥能充能', max: 4, threshold: 4, show: 'dots', color: '#c070ff', full: '#ffffff', decayDelay: 8, decayPerSec: 0.5,
    desc: '每放一个和上一个不同元素的技能 +1 层。4 层：下一个技能「满溢·」——多 1 发、范围 +50%、伤害 +20%，然后清空' },
  chrono: { kind: 'combo', name: '连击点', max: 5, threshold: 1, show: 'dots', color: '#ffd060', full: '#fff4c0', decayDelay: 3, decayPerSec: 999,
    desc: '技能连续命中同一目标，每次施法 +1 点（换目标重新计数，断档 3 秒清零）。技能 1（位移）/ 技能 3（控制）/ 大招消耗全部连击点：每点伤害 +10%，5 点附带 1 秒眩晕' },
  alchemy: { kind: 'heat', name: '反应热度', max: 100, threshold: 100, show: 'arc', color: '#ff7a20', full: '#ffe060', decayDelay: 5, decayPerSec: 5,
    gainReaction: 20,
    desc: '每次地面反应（爆燃 / 蒸汽 / 晶毒）+20。满 100：下一瓶试剂「沸腾·」——伤害 +50%、范围 +30%（消耗 100）' },
};
/** v1.0.6：资源表 = 本体 + 内容包职业自带的资源（ClassDef.ext.res）；没有包 = 本体表原对象 */
const PACK_RES = packClassField<ResDef>(d => (d.ext as { res?: ResDef } | undefined)?.res, Object.keys(BASE_RES_DEF));
export const RES_DEF: Record<string, ResDef> = Object.keys(PACK_RES).length ? { ...BASE_RES_DEF, ...PACK_RES } : BASE_RES_DEF;
