// v0.7.7 天赋树 2.0：在 4 职业原有三系数据上统一改造（规则见 docs/设计/天赋树2.0.md）
// ① 终极天赋从第 5 层移到第 6 层（本系投入 15 点才能点），原第 6 层的两个数值节点上移到第 5 层
// ② 取消跨树互斥组（武器附魔、元素核心之类），三选一只在本系本层内互斥
// ③ 每系第 2 层加 1 个「资源节点」（改 v0.7.5 职业资源）
// 30 级共 21 点：一系拿终极（16 点）+ 另一系浅点 5 点；两个终极需要 32 点，点不出
import { TalentTreeDef, TalentNodeDef, TalentResKey } from '../core/TalentTree';

type ResNode = { id: string; name: string; icon: string; desc: string; res: Partial<Record<TalentResKey, number>> };
/** 每系一个资源节点（1 级） */
const RES_NODES: Record<string, ResNode> = {
  w_arms: { id: 'wa_res', name: '蓄势', icon: 'tl_weapon', desc: '怒气强化门槛 50 → 40', res: { thrAdd: -10 } },
  w_fury: { id: 'wf_res', name: '怒火中烧', icon: 'tl_wrath', desc: '怒气获取 +25%', res: { gainMul: 0.25 } },
  w_prot: { id: 'wp_res', name: '坚守怒意', icon: 'tl_iron', desc: '怒气脱战后多保留 3 秒才开始衰减', res: { delayAdd: 3 } },
  m_fire: { id: 'mf_res', name: '炽能', icon: 'tl_fireheart', desc: '奥能满溢强化的技能伤害再 +12%', res: { empowerMore: 0.12 } },
  m_frost: { id: 'mi_res', name: '凝能', icon: 'tl_iceheart', desc: '奥能多保留 6 秒才开始衰减', res: { delayAdd: 6 } },
  m_arcane: { id: 'ma_res', name: '奥能共振', icon: 'tl_arcaneheart', desc: '奥能只需 3 层就能满溢强化', res: { thrAdd: -1 } },
  c_mark: { id: 'cm_res', name: '多重刻印', icon: 'tl_mark', desc: '连击点上限 +1', res: { maxAdd: 1 } },
  c_echo: { id: 'ce_res', name: '回声蓄力', icon: 'tl_echo', desc: '消耗连击点的技能伤害再 +12%', res: { empowerMore: 0.12 } },
  c_rewind: { id: 'cr_res', name: '缓流', icon: 'tl_haste', desc: '连击点断档时间 +2 秒', res: { delayAdd: 2 } },
  a_blast: { id: 'ab_res', name: '低沸点', icon: 'tl_blast', desc: '沸腾门槛 100 → 85', res: { thrAdd: -15 } },
  a_ground: { id: 'ag_res', name: '催化剂', icon: 'tl_plague', desc: '反应热度获取 +25%', res: { gainMul: 0.25 } },
  a_turret: { id: 'at_res', name: '稳压阀', icon: 'tl_steam', desc: '沸腾伤害再 +12%，热度多保留 3 秒', res: { empowerMore: 0.12, delayAdd: 3 } },
};

/** v0.7.8：每系第 4 层 1 个「绝技」槽位节点（第 4 技能槽，按槽位生效） */
const SLOT4_NODES: { name: string; desc: string; ops: any[] }[] = [
  { name: '绝技·锋锐', desc: '技能 4（绝技）伤害 +25%', ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] },
  { name: '绝技·迅捷', desc: '技能 4（绝技）冷却 -20%', ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }] },
  { name: '绝技·扩张', desc: '技能 4（绝技）范围 +25%，伤害 +10%', ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.1 }] },
];
export function talentTree2(def: TalentTreeDef): TalentTreeDef {
  return {
    ...def, tierCost: 3, tiers: 6,
    specs: def.specs.map(sp => {
      const nodes: TalentNodeDef[] = sp.nodes.map(n => {
        const m: TalentNodeDef = { ...n };
        delete m.group;
        if (n.capstone) m.row = 6; else if (n.row === 6) m.row = 5;
        return m;
      });
      const rn = RES_NODES[sp.id];
      if (rn && !nodes.some(n => n.id === rn.id)) {
        const used = new Set(nodes.filter(n => n.row === 2).map(n => n.col));
        const col = [3, 1, 2, 0].find(c => !used.has(c)) ?? 3;
        nodes.push({ id: rn.id, name: rn.name, row: 2, col, kind: 'rank', maxRank: 1, icon: rn.icon, desc: `资源：${rn.desc}`, res: rn.res, resNode: true });
      }
      const si = def.specs.indexOf(sp), sn = SLOT4_NODES[si % 3], sid = `${sp.id}_s4`;
      if (!nodes.some(n => n.id === sid)) {
        const used4 = new Set(nodes.filter(n => n.row === 4).map(n => n.col));
        const col4 = [3, 0, 1, 2].find(c => !used4.has(c)) ?? 3;
        nodes.push({ id: sid, name: sn.name, row: 4, col: col4, kind: 'rank', maxRank: 1, icon: 'tl_haste', desc: sn.desc,
          modifier: { name: sn.name, desc: '', match: { slots: ['skill4'] }, ops: sn.ops } });
      }
      return { ...sp, nodes };
    }),
  };
}
