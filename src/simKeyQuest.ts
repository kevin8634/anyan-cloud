// v0.9.1n：重要任务标识自检（npx tsc -p . && node dist/simKeyQuest.js）
declare const process: { exitCode?: number };
import { QUESTS } from './data/quests';
import { questTags, questText, questHtml, isKeyQuest, isMainQuest, KEY_QUEST_COLOR, KEY_QUEST_COLOR_PARCH } from './data/quest_tags';
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };
const q = (id: string) => QUESTS.find(x => x.id === id)!;
check(questTags(q('rq_m5')).includes('暗金') && questText(q('rq_m5')).endsWith('（暗金）'), `长副本故事链终点：${questText(q('rq_m5'))}`);
check(questTags(q('cq_chrono2')).join() === '橙装,技能,天赋', `职业任务：${questText(q('cq_chrono2'))}`);
check(questHtml(q('ch6_4')).includes(KEY_QUEST_COLOR_PARCH) && questHtml(q('ch6_4'), true).includes(KEY_QUEST_COLOR), `主线终章红字：${questText(q('ch6_4'))}`);
const plain = QUESTS.find(x => !isKeyQuest(x) && !isMainQuest(x))!;
const mains = QUESTS.filter(isMainQuest).map(x => x.id);
check(mains.length === 21 && questText(q('q_wolves')) === '【主线】狼患' && !isMainQuest({ id: 'cs8_r01' }) && isMainQuest({ id: 'cs9a_6' }) && isMainQuest({ id: 'cs7_0' }), `主线标识：本体 ${mains.length} 条（含尾声），资料片 cs7_0~cs9b_6，支线不标`);
check(questHtml(plain) === plain.name, `普通任务不变：${plain.name}`);
const keys = [...new Set(QUESTS.filter(isKeyQuest).map(x => x.id))];
console.log(`  重要任务 ${keys.length} 个：${keys.map(id => questText(q(id))).join('、')}`);
console.log(failed ? `❌ ${failed} 项失败` : '✅ 重要任务标识全部通过');
if (failed) process.exitCode = 1;
