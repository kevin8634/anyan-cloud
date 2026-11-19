// v0.7.13：新手到满级引导——成长目标（填补 1–30 级的空档，每 2–3 级都有新东西）+ 10 / 25 / 30 级系统教学
export interface GuideSnap { level: number; eqBest: number; talentSpent: number; spiritEq: number; bookExtra: number; achCount: number; bosses: Record<string, number> }
export interface Milestone { lv: number; id: string; name: string; desc: string; gold: number; done: (s: GuideSnap) => boolean }
export const MILESTONES: Milestone[] = [
  { lv: 3, id: 'm_gear', name: '换上好装备', desc: '装备一件精良（蓝色）或更好的装备', gold: 150, done: s => s.eqBest >= 2 },
  { lv: 5, id: 'm_grok', name: '矿洞之主', desc: '击败暗岩矿洞的监工格罗克', gold: 250, done: s => !!s.bosses['监工格罗克'] },
  { lv: 11, id: 'm_talent', name: '第一份天赋', desc: '按 N 投入至少 1 个天赋点', gold: 300, done: s => s.talentSpent >= 1 },
  { lv: 13, id: 'm_spirit', name: '英灵相伴', desc: '按 Y 装备 1 个英灵', gold: 400, done: s => s.spiritEq >= 1 },
  { lv: 14, id: 'm_book', name: '翻开技能书', desc: '按 K 用自选技能书学会 1 个新技能', gold: 400, done: s => s.bookExtra >= 1 },
  { lv: 16, id: 'm_rot', name: '腐沼净化', desc: '击败腐沼神殿的腐根祭司', gold: 500, done: s => !!s.bosses['腐根祭司'] },
  { lv: 17, id: 'm_epic', name: '史诗之光', desc: '装备一件史诗（紫色）或更好的装备', gold: 600, done: s => s.eqBest >= 3 },
  { lv: 29, id: 'm_ach', name: '迎接满级', desc: '按 O 查看成就，达成 10 个成就', gold: 1000, done: s => s.achCount >= 10 },
];
export type LessonAct = 'talent' | 'skillbook' | 'char' | 'spirit' | 'achv' | 'raidguide';
export interface Lesson { lv: number; title: string; lines: string[]; acts: [LessonAct, string][] }
export const LESSONS: Lesson[] = [
  { lv: 10, title: '10 级：天赋与英灵开放', lines: [
    '从现在起每升 1 级得 1 个天赋点，按 N 打开天赋树。三系天赋各有一个资源天赋，顶层是终极天赋。',
    '可以存 3 套天赋页，在角色面板的装备方案里和装备一起切换。',
    '英灵传承槽 1 开放：按 Y 装备英灵，带着它击败首领会让它升阶。',
    '职业任务开始了：做完每个职业任务都额外给 1 个天赋点。'], acts: [['talent', '打开天赋 N'], ['spirit', '打开英灵 Y']] },
  { lv: 25, title: '25 级：第 4 技能槽「绝技」', lines: [
    '按 4 施放绝技，它的冷却长、伤害高，最好留给首领或成群的敌人。',
    '天赋树第 4 行有强化绝技的节点；30 级会自动学会第二个绝技，在技能书（K）里切换。',
    '英灵传承槽 4 开放，现在可以同时带 4 个英灵。'], acts: [['skillbook', '打开技能书 K'], ['talent', '打开天赋 N']] },
  { lv: 30, title: '30 级：满级之后', lines: [
    '经验转成暗岩印记经验（长副本全额，其他内容 25%），印记 0–100 级，在角色面板（C）给 4 种印记加点；20 / 40 / 60 / 80 / 100 级各多 1 个天赋点。',
    '长副本、炼狱难度和每周机制挑战是主要的刷宝内容，按 M 在世界地图找入口。',
    '暗岩印记 1 / 5 / 10 / 20 / 35 / 50 级各解锁一个新英灵。',
    '按 O 打开成就与图鉴，收集称号和首领图鉴。'], acts: [['char', '打开角色 C'], ['raidguide', '长副本说明'], ['achv', '成就 O']] },
];
