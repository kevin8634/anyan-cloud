// v0.7.12：成就（约 60 个，分 5 类）。进度全部从角色当前状态读，不额外埋点（击杀 / 阵亡 / 首领名册除外）
import { withPacks } from '../core/ContentPacks';
export type AchCat = 'grow' | 'fight' | 'chal' | 'coll' | 'class';
export const ACH_CAT: Record<AchCat, string> = { grow: '成长', fight: '战斗', chal: '挑战', coll: '收集', class: '职业与财富' };
/** 成就读取的状态（core/Achievements.ts 的 AchSnap） */
export type AchStat = 'level' | 'paragon' | 'kills' | 'bossKills' | 'eliteKills' | 'raidKills' | 'deaths' | 'raidClears' | 'hellClears' | 'bossTypes'
  | 'spirits' | 'spiritT3' | 'runewords' | 'legendaries' | 'darks' | 'sets' | 'codex' | 'classQuests' | 'gold' | 'abyss' | 'story' | 'weekly';
export interface AchDef { id: string; cat: AchCat; name: string; desc: string; stat: AchStat | `pk_${string}`; n: number; pts: number; title?: string }   // v1.2.9 pk_：内容包状态（PackManifest.achStats）

const A: AchDef[] = [];
const tier = (cat: AchCat, stat: AchStat, desc: (n: number) => string, list: [string, number, number, string?][]) =>
  list.forEach(([name, n, pts, title], i) => A.push({ id: `${stat}_${i + 1}`, cat, name, desc: desc(n), stat, n, pts, ...(title ? { title } : {}) }));
const big = (n: number) => n >= 10000 ? `${n / 10000} 万` : `${n}`;

tier('grow', 'level', n => `角色达到 ${n} 级`, [['初出茅庐', 10, 10], ['小有名气', 20, 10], ['身经百战', 25, 20], ['暗岩冒险者', 30, 30, '暗岩冒险者']]);
tier('grow', 'story', () => '完成第六章「暗岩之心」，看到结局', [['暗岩之心', 1, 50, '暗岩守护者']]);   // v0.8.3
tier('grow', 'paragon', n => `暗岩印记达到 ${n} 级`, [['印记初显', 1, 10], ['岩纹入骨', 10, 10], ['四印齐鸣', 25, 20], ['半步传说', 50, 30, '印记行者'], ['深岩之子', 75, 30], ['暗岩化身', 100, 50, '暗岩化身']]);
tier('fight', 'kills', n => `累计击败 ${big(n)} 个敌人`, [['第一滴血', 100, 10], ['清道夫', 500, 10], ['屠戮者', 2000, 20], ['战场收割', 5000, 30], ['万人斩', 10000, 50, '万人斩']]);
tier('fight', 'bossKills', n => `击败副本首领 ${n} 次`, [['首领克星', 1, 10], ['熟门熟路', 10, 10], ['常客', 50, 20], ['首领噩梦', 100, 30, '首领噩梦']]);
tier('fight', 'eliteKills', n => `击败精英 ${n} 次`, [['猎头人', 10, 10], ['精英猎手', 50, 20], ['赏金传说', 200, 30, '赏金猎人']]);
tier('fight', 'raidKills', n => `击败长副本首领 ${n} 次`, [['王座之下', 1, 20], ['远征者', 10, 20], ['长征者', 50, 50, '长征者']]);
tier('chal', 'raidClears', n => `通关长副本 ${n} 次`, [['一路到底', 1, 20], ['五度远征', 5, 20], ['征服常态化', 20, 30]]);
tier('chal', 'hellClears', n => `通关炼狱难度长副本 ${n} 次`, [['炼狱初体验', 1, 30], ['炼狱行者', 5, 50, '炼狱行者']]);
tier('chal', 'abyss', n => `暗岩深渊最高到达第 ${n} 层`, [['深渊一瞥', 5, 10], ['深渊行者', 10, 20], ['深渊之心', 15, 30], ['深渊征服者', 20, 50, '深渊征服者']]);   // v0.8.1
tier('chal', 'weekly', n => `每周挑战单次到达第 ${n} 层`, [['周常挑战者', 5, 10], ['周榜常客', 10, 20], ['本周之王', 20, 50, '周榜之王']]);   // v0.8.5
tier('chal', 'bossTypes', n => `首领图鉴记录 ${n} 个不同首领`, [['见多识广', 3, 10], ['首领名册', 8, 20], ['首领百科', 15, 30, '首领学者']]);
tier('chal', 'deaths', n => `阵亡 ${n} 次（不丢人）`, [['凡人之躯', 1, 5], ['屡败屡战', 25, 10], ['不灭意志', 100, 20, '不死鸟']]);
tier('coll', 'spirits', n => `解锁 ${n} 个本职业英灵`, [['英灵低语', 3, 10], ['英灵相随', 6, 20], ['英灵之主', 12, 50, '英灵之主']]);
tier('coll', 'spiritT3', n => `${n} 个英灵升到 3 阶`, [['薪火相传', 1, 20], ['众灵归一', 5, 30]]);
tier('coll', 'runewords', n => `发现 ${n} 个纹语`, [['纹语初识', 1, 10], ['破译者', 4, 20], ['纹语大师', 8, 50, '纹语大师']]);
tier('coll', 'legendaries', n => `获得 ${n} 种不同的橙装`, [['橙光乍现', 1, 10], ['传说在手', 5, 20], ['传说收藏家', 15, 30], ['传说宝库', 30, 50, '传说收藏家']]);
tier('coll', 'darks', n => `获得 ${n} 种不同的暗金装备`, [['暗金初见', 1, 20], ['暗金之握', 5, 30], ['暗金宝库', 10, 50, '暗金之主']]);
tier('coll', 'sets', n => `收集 ${n} 件套装 / 固定装备`, [['成套出发', 3, 10], ['套装达人', 10, 20]]);
tier('coll', 'codex', n => `装备图鉴累计 ${n} 条`, [['图鉴新手', 50, 10], ['图鉴学徒', 150, 20], ['图鉴大全', 300, 30, '博物学者']]);
tier('class', 'classQuests', n => `完成 ${n} 个职业任务`, [['职业之路', 1, 10], ['职业大成', 2, 20, '职业宗师']]);
tier('class', 'gold', n => `身上持有 ${big(n)} 金币`, [['小有积蓄', 10000, 10], ['富甲一方', 100000, 20], ['暗岩首富', 1000000, 30, '暗岩首富']]);

export const ACHIEVEMENTS: AchDef[] = withPacks<AchDef>(A, 'achievements');   // v0.9.7 内容包成就（没有包 = 原数组；DLC 成就单独分类 TODO）
export const achDef = (id?: string | null) => ACHIEVEMENTS.find(a => a.id === id);
/** 称号：成就自带的称号 + 点数里程碑 */
export const POINT_TITLES: [number, string][] = [[100, '小有成就'], [300, '成就猎人'], [600, '暗岩传说']];
