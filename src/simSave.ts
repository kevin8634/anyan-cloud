// 存档自动测试（阶段三）：v1~v4 老存档样本都能升级到最新版、不丢东西；损坏检测、备份回退、角色列表、导出导入
// 主线 v0.6.6：第 5 节读 test/saves/ 下三条线的真实格式样本（v0.4.1 / v0.5.0-c 账号 B / v0.6.6-br.A 账号 A），全部迁移到 v9
// 用法：npm run save
import { SaveManager, SaveStorage, SAVE_VERSION, BACKUP_SPACING, GameSave, V9_NOTICE, CHARM_REFUND_GOLD, RELIC_SHARD_TO_DARKSHARD } from './core/SaveManager';
import { Inventory } from './core/Inventory';
import { Forge } from './core/Forge';
import { ItemInstance } from './core/Loot';
import { FORGE_DATA } from './data/shop';
import { ALL_SET_BONUSES } from './data/sets';
import { Roster, LEGACY_BASE } from './core/Roster';
import { LOOT_DATA } from './data/loot';

declare const require: (m: string) => { readFileSync(p: string, e: string): string };
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };
const mem = () => { const m = new Map<string, string>(); const s: SaveStorage = { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k), keys: () => [...m.keys()] }; return { m, s }; };

// ---------------------------------------------------------------- 老存档样本（每个版本一份，字段和当时一致）
const SAMPLES: Record<string, object> = {
  v1: { version: 1, savedAt: 1, inventory: { gold: 11, bag: [], equipped: {} }, level: { level: 3, xp: 40 }, talents: { wt_weapon: 1 }, quests: { active: {}, done: ['q_wolves'] } },
  v2: { version: 2, savedAt: 2, classId: 'mage', inventory: { gold: 22, bag: [], equipped: {}, stacks: { mat_dust: 4, potion_s: 2 } }, level: { level: 5, xp: 10 }, talents: {}, quests: { active: { q_fangs: [2] }, done: ['q_wolves'] } },
  v3: { version: 3, savedAt: 3, classId: 'warrior', inventory: { gold: 33, bag: [], equipped: {}, stacks: { potion_s: 3 } }, level: { level: 9, xp: 123 }, talents: { wt_weapon: 3 }, quests: { active: {}, done: ['q_wolves', 'q_fangs'] } },
  v4: { version: 4, savedAt: 4, classId: 'warrior', inventory: { gold: 44, bag: [], equipped: {}, stacks: { potion_s: 5, mat_shard: 2 } }, level: { level: 12, xp: 5 }, talents: { wa_weapon: 2 }, quests: { active: {}, done: ['q_wolves', 'q_fangs', 'q_mine'] }, tutorial: -1 },
};
console.log('\n=== 1. 老存档样本升级到 v' + SAVE_VERSION);
for (const [v, raw] of Object.entries(SAMPLES)) {
  const { s } = mem(); s.set('k', JSON.stringify(raw));
  const r = new SaveManager(s, 'k', LOOT_DATA).loadResult();
  const o = raw as { inventory: { gold: number }; level: { level: number; xp: number }; quests: { done: string[] } };
  check(r.status === 'ok' && r.save!.version === SAVE_VERSION && r.save!.inventory.gold === o.inventory.gold && r.save!.level.level === o.level.level && r.save!.level.xp === o.level.xp
    && r.save!.quests.done.join() === o.quests.done.join() && Array.isArray(r.save!.codex) && r.save!.playMs === 0,
    `${v}：金币 ${r.save?.inventory.gold} · 等级 ${r.save?.level.level} · 经验 ${r.save?.level.xp} · 任务 ${r.save?.quests.done.length} 个 → v${r.save?.version}`);
}

console.log('\n=== 2. 校验和 / 损坏检测 / 绝不覆盖');
{
  const { s } = mem(); const sm = new SaveManager(s, 'c', LOOT_DATA);
  check(sm.loadResult().status === 'none', '没有存档：none');
  sm.save({ ...(SAMPLES.v4 as object), classId: 'warrior' } as never, 1000);
  const good = s.get('c')!;
  check(JSON.parse(good).sum?.length === 8 && sm.loadResult().status === 'ok', '写入带校验和，读回 ok');
  s.set('c', good.slice(0, good.length - 40));
  let r = sm.loadResult();
  check(r.status === 'corrupt' && r.save === null && s.get('c_corrupt') !== null, '截断的存档：corrupt，不当成新角色，原文另存 _corrupt');
  const t = JSON.parse(good); t.inventory.gold = 999999; s.set('c', JSON.stringify(t));
  r = sm.loadResult();
  check(r.status === 'corrupt', '改过金币但校验和没变：识别为损坏');
}

console.log('\n=== 3. 备份轮换与回退');
{
  const { s } = mem(); const sm = new SaveManager(s, 'b', LOOT_DATA);
  const base = SAMPLES.v4 as never as Parameters<SaveManager['save']>[0];
  let now = 1_000_000;
  for (let i = 0; i < 6; i++) { sm.save({ ...base, inventory: { ...(base as { inventory: object }).inventory, gold: i } } as never, now); now += BACKUP_SPACING + 1; }
  const golds = [1, 2, 3].map(i => JSON.parse(s.get(sm.backupKey(i)) ?? '{}').inventory?.gold);
  check(golds.join() === '4,3,2', `3 份轮换备份（新→旧）金币 ${golds.join(' / ')}，主存档 ${JSON.parse(s.get('b')!).inventory.gold}`);
  const b1 = s.get(sm.backupKey(1));
  sm.save(JSON.parse(s.get('b')!), now - BACKUP_SPACING + 1000);   // 刚轮换过：bak1 = 5 分钟内的
  const b1b = s.get(sm.backupKey(1));
  sm.save(JSON.parse(s.get('b')!), now - BACKUP_SPACING + 2000);
  check(b1 !== b1b && s.get(sm.backupKey(1)) === b1b, '距上一份备份不到 5 分钟：只写主存档，不轮换（备份之间有时间差）');
  s.set('b', '{"broken":');
  const r = sm.loadResult();
  check(r.status === 'recovered' && r.save!.inventory.gold === 5 && r.from === sm.backupKey(1), `主存档坏了：从 ${r.from} 恢复（金币 ${r.save?.inventory.gold}）`);
}

console.log('\n=== 4. 角色列表：老存档迁移 / 创建 / 删除 / 导出导入');
{
  const { s } = mem(); let n = 0; const ids = () => `id${++n}`;
  s.set(LEGACY_BASE, JSON.stringify(SAMPLES.v3)); s.set(`${LEGACY_BASE}_mage`, JSON.stringify(SAMPLES.v2));
  const ro = new Roster(s, LOOT_DATA, ids);
  const k = ro.migrateLegacy(['warrior', 'mage'], { warrior: '战士', mage: '法师' });
  check(k === 2 && ro.slots[0]?.name === '战士' && ro.slots[1]?.classId === 'mage' && ro.slots[0]?.level === 9, `迁移 ${k} 个：${ro.slots.map(m => m && `${m.name}(${m.level})`).join('、')}`);
  check(ro.migrateLegacy(['warrior', 'mage'], {}) === 0, '只迁移一次');
  ro.probe();
  check(ro.slots[0]?.status === 'ok' && ro.saverFor(ro.slots[0]!.id).load()!.version === SAVE_VERSION, '迁移后的角色能正常读档');
  check(typeof ro.create('warrior', '战士') === 'string', '同名不能创建');
  const c = ro.create('warrior', '霜刃', 2);
  check(typeof c !== 'string' && ro.count === 3, `创建第 3 个角色「霜刃」`);
  for (const n of ['青岚', '赤焰', '玄冰', '紫电', '白夜']) ro.create('warrior', n);
  check(ro.count === 8 && ro.slots.length === 8, '最多 8 个角色栏位');
  check(ro.create('mage', '多余') === '角色栏位已满（最多 8 个），先删除一个角色', '栏位满了不能再建');
  for (const m of ro.slots.slice(3)) if (m) ro.remove(m.id);
  const text = ro.exportText(ro.slots[0]!.id)!;
  check(JSON.parse(text).format === 'darkrock-save', `导出文件 ${text.length} 字节`);
  ro.remove(ro.slots[2]!.id);
  check(ro.count === 2 && s.get('darkrock_char_id3') === null, '删除角色：存档和备份一起删除');
  const im = ro.importText(text);
  check(typeof im !== 'string' && im.name === '战士2' && im.level === 9, `导入：同名自动改成「${typeof im === 'string' ? im : im.name}」，等级 ${typeof im === 'string' ? '' : im.level}`);
  check(ro.importText('{"format":"x"}') === '文件不是暗岩传说的存档', '导入非存档文件：拒绝');
  // 角色列表丢了：从角色存档重建
  s.set('darkrock_roster', '{坏了');
  const ro2 = new Roster(s, LOOT_DATA, ids);
  check(ro2.count === 3, `角色列表损坏：从角色存档重建出 ${ro2.count} 个角色`);
}

console.log('\n=== 5. 三条线的存档样本（test/saves/）→ v' + SAVE_VERSION);
{
  const fs = require('fs');
  const load = (f: string) => {
    const raw = JSON.parse(fs.readFileSync(`test/saves/${f}.json`, 'utf8'));
    const { s } = mem(); s.set('k', JSON.stringify(raw));
    const sm = new SaveManager(s, 'k', LOOT_DATA), r = sm.loadResult();
    const inv = new Inventory(30, { hp: 1000, armor: 0 }); inv.setBonuses = ALL_SET_BONUSES; new Forge(FORGE_DATA, inv); inv.load(r.save!.inventory);
    return { raw, r, save: r.save as GameSave, inv, sm, s };
  };
  const all = (g: GameSave) => [...Object.values(g.inventory.equipped), ...g.inventory.bag, ...(g.bank ?? [])].filter(Boolean) as ItemInstance[];
  const roundtrip = (x: ReturnType<typeof load>) => {
    x.sm.save({ ...x.save, inventory: x.inv.save() });
    const b = x.sm.loadResult().save!;
    const inv2 = new Inventory(30, { hp: 1000, armor: 0 }); inv2.setBonuses = ALL_SET_BONUSES; new Forge(FORGE_DATA, inv2); inv2.load(b.inventory);
    return b.version === SAVE_VERSION && JSON.stringify(inv2.save()) === JSON.stringify(x.inv.save()) && JSON.stringify(inv2.stats()) === JSON.stringify(x.inv.stats());
  };

  // ---- v0.4.1（存档 v5）
  {
    const x = load('v0.4.1'), g = x.save;
    check(x.r.status === 'ok' && g.version === SAVE_VERSION && g.inventory.gold === x.raw.inventory.gold && g.level.level === 28, `v0.4.1：v${x.raw.version} → v${g.version}，金币 / 等级不变`);
    check(all(g).every(i => i.durability === 100), '耐久：身上 / 背包 / 角色存档里的仓库全部补成 100');
    check(x.inv.slotLv.chest === 7 && x.inv.equipped.chest!.upgrade === 7 && !x.inv.bag.some(i => i.upgrade), '旧的装备强化 +7 → 胸甲栏部位强化 +7（A 的迁移，数值按新规则重算）');
    check(g.setPity!.seen.includes('i_helm') && g.relicChain === undefined, '套装保底：说明书里拿过的狂怒头盔算「见过」；没有典藏任务链字段');
    check(!g.notices?.includes(V9_NOTICE), '没有 v0.5 的东西：不弹整合提示');
    check(roundtrip(x), '存档往返：背包 / 部位强化 / 属性完全一致');
  }
  // ---- v0.5.0-c（账号 B，存档 v8）
  {
    const x = load('v0.5.0-c'), g = x.save, eq = g.inventory.equipped;
    check(x.r.status === 'ok' && g.version === SAVE_VERSION, `v0.5.0-c：v${x.raw.version} → v${g.version}`);
    const mh = eq.mainHand!;
    check(mh.quality === 'dark' && mh.fixedId === 'd_bloodoath' && mh.name === '血誓' && !mh.noSalvage && !(mh as { relic?: string }).relic && mh.lines[0].startsWith('❖') && mh.modifiers.filter(m => m.id.endsWith(':relic_bloodoath')).length === 1 && mh.durability === 60,
      `暗金典藏「血誓」→ 主线暗金 d_bloodoath（品质 dark、❖ 效果行、修饰器只有一份、可拓印、耐久 60 保留）`);
    check(g.codex!.includes('dark|d_bloodoath') && !g.codex!.some(k => k.startsWith('relic|')), '掉落说明书：relic|… 改成 dark|…');
    const st = g.inventory.stacks!;
    check(st.mat_darkshard === 4 * RELIC_SHARD_TO_DARKSHARD && !st.mat_relic && !st.charm_protect && g.inventory.gold === 9000 + 2 * CHARM_REFUND_GOLD, `典藏残片 ×4 → 暗金碎片 ×${st.mat_darkshard}；强化保护符 ×2 → 退还 ${2 * CHARM_REFUND_GOLD} 金`);
    check(st.cur_ember === 7 && st.cur_sigil === 5 && st.junk_ash === 3 && g.exchange?.used.forge === 1, '兑换货币、杂物、每周限购保留');
    check(eq.head!.locked === true && eq.head!.lines.some(l => l.startsWith('✧ ')) && !eq.head!.lines.some(l => l.startsWith('✦ ')) && g.inventory.bag[0].locked === true, '锁定保留；特殊属性 ✦ 改成 ✧（不和 A 的拓印 ✦ 冲突）');
    check(g.relicChain === undefined && g.setPity!.dry === 2 && g.setPity!.seen.includes('i_fury_legs') && g.dungeonBest!.darkrock_mine === 3, '典藏任务链删除；套装保底、副本最高难度记录保留');
    check(g.notices!.includes(V9_NOTICE), '弹一次整合提示（典藏 → 暗金、残片 / 保护符折算）');
    check(x.inv.slotLv.chest === 9 && x.inv.equipped.chest!.upgrade === 9, 'B 的 +9 胸甲 → 胸甲栏部位强化 +9');
    check(eq.legs!.durability === 0 && !x.inv.activeItems().includes(x.inv.equipped.legs!) && x.inv.setCounts().get('set_fury') === undefined, '已损坏的狂怒腿铠：不生效、不计套装件数');
    check(roundtrip(x), '存档往返：一致');
  }
  // ---- v0.6.6-br.A（账号 A，分支不升版本号：仍是 5）
  {
    const x = load('v0.6.6-br.A'), g = x.save;
    check(x.r.status === 'ok' && g.version === SAVE_VERSION, `v0.6.6-br.A：v${x.raw.version} → v${g.version}`);
    check(JSON.stringify(g.raid) === JSON.stringify(x.raw.raid) && JSON.stringify(g.dgx) === JSON.stringify(x.raw.dgx), '长副本记录（通关 / 最佳 / 本周 / 炼狱）、普通副本奖牌原样保留');
    check(x.inv.slotLv.chest === 6 && x.inv.slotLv.mainHand === 10 && x.inv.bless.chest === 0.15 && x.inv.autoSalvage.join() === 'white,green', '部位强化、祝福值、拾取自动分解设置保留');
    const mh = g.inventory.equipped.mainHand!, ring = g.inventory.equipped.ring1!;
    check(mh.quality === 'dark' && mh.fixedId === 'd_rifter' && ring.engraveId === 'd_throne_ember' && ring.lines.some(l => l.startsWith('✦ 拓印')), '暗金「裂地者」、拓印「王座余烬」不受 ✦→✧ 迁移影响');
    check(all(g).every(i => i.durability === 100) && g.inventory.stacks!.mat_darkshard === 23 && g.codex!.includes('print|d_throne_ember'), '补上耐久 100；暗金碎片、典藏拓印记录保留');
    check(!g.notices?.includes(V9_NOTICE) && g.setPity!.dry === 0, '没有 v0.5 的东西：不弹整合提示；套装保底从 0 开始');
    check(roundtrip(x), '存档往返：一致');
  }
}

console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 存档测试全部通过');
if (failed) (globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1;
