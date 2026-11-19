// 运行：npm run sim —— 命令行模拟一场战斗，验证效果系统和怪物AI
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, unitsInRadius, Pos, Faction } from './core/Combat';
import { EnemyBrain, DEFAULT_ENEMY } from './core/EnemyBrain';
import { Loadout } from './core/Loadout';
import { SlotId } from './core/types';
import { SKILLS, TALENTS, ITEMS, SET_BONUSES, COMBOS } from './data/warrior';

class Dummy implements CombatUnit {
  status = new StatusSet();
  hp: number;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number, el: string) { log(`    ${this.uid} 受到 ${n} ${el} 伤害，剩余 ${this.hp}`); }
  onHealed(n: number) { log(`    ${this.uid} 回复 ${n}，当前 ${this.hp}`); }
  onDeath() { log(`    ☠ ${this.uid} 死亡`); }
}

let t = 0;
const log = (s: string) => console.log(`[${t.toFixed(1).padStart(5)}s] ${s}`);

const player = new Dummy('玩家', 'player', 1000, { x: 0, z: 0 });
const wolves = [1, 2, 3].map(i => new Dummy(`野狼${i}`, 'enemy', 300, { x: 10 + i, z: i - 2 }));
const all: CombatUnit[] = [player, ...wolves];

let loadout: Loadout;
const world: CombatWorld = {
  units: () => all,
  resetCooldown: (_o, slot: SlotId) => { loadout.resetCooldown(slot); log(`    ⟳ 套装触发：重置 ${slot} 冷却`); },
  onZoneSpawn: (_p, r, el, d) => log(`    🔥 生成 ${el} 地面区域 半径${r} 持续${d}s`),
};
const fx = new EffectSystem(world, () => 0.1);   // rng 固定，结果可复现

const brains = wolves.map(w => new EnemyBrain(w, { ...w.pos }, DEFAULT_ENEMY, (target, dmg) => {
  log(`  ${w.uid} 攻击 ${target.uid}`); fx.dealDamage(target, dmg, 'physical', w);
}, () => 0.5));

loadout = new Loadout({
  execute: skill => {
    const center = skill.shape === 'circle' ? player.pos : wolves.find(w => w.alive)!.pos;
    const hits = skill.shape === 'circle' ? unitsInRadius(world, center, skill.stats.radius, 'player') : [wolves.find(w => w.alive)!];
    log(`▶ 释放 ${skill.displayName}，命中 ${hits.length} 个`);
    hits.forEach(h => brains[wolves.indexOf(h as Dummy)]?.provoke());
    fx.applySkill(skill, player, hits);
  },
});
loadout.equipSkill(SKILLS.slash, 'basic');
loadout.equipSkill(SKILLS.charge, 'skill1');
loadout.equipSkill(SKILLS.whirlwind, 'skill2');
loadout.equipSkill(SKILLS.thunderclap, 'skill3');
loadout.equipSkill(SKILLS.avatar, 'ultimate');
loadout.setTalents([TALENTS[0], TALENTS[1]]);          // 烈焰之刃 + 焦土
loadout.setItems([ITEMS[2], ITEMS[3]]);                  // 狂怒2件套（不带寒冰核心，保留火焰旋风斩）
loadout.setSetBonuses(SET_BONUSES);
loadout.setComboModifiers(COMBOS);

const cast = (slot: SlotId) => loadout.tryCast(slot, { now: t, casterHpPercent: player.hp / player.maxHp, targetEffects: [] });
const step = (sec: number, dt = 0.1) => {
  for (let i = 0; i < sec / dt; i++) {
    t += dt;
    brains.forEach((b, k) => {
      const it = b.update(dt, player);
      if (it.moveDir) { wolves[k].pos.x += it.moveDir.x * it.speed * dt; wolves[k].pos.z += it.moveDir.z * it.speed * dt; }
    });
    fx.update(dt);
  }
};

log('三只野狼在 11~13 米外巡逻，玩家站在原点');
step(1);
log(`野狼状态: ${brains.map(b => b.state).join(', ')}`);
player.pos.x = 5; log('玩家走近到 x=5');
step(2);
log(`野狼状态: ${brains.map(b => b.state).join(', ')}（进入仇恨范围，追击/攻击）`);
cast('skill3');            // 雷霆一击：范围减速
log(`  野狼1 移速倍率 ${wolves[0].status.speedMultiplier}`);
step(0.5);
cast('skill2');            // 火焰旋风斩·焦土
step(3);
cast('ultimate');          // 天神下凡（5秒内用过雷霆一击→震地连击）
step(4);
log(`结束：${all.map(u => `${u.uid} ${u.hp}/${u.maxHp}`).join('，')}`);
