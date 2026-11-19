// v0.9.1o 橙装 96 条（设计表 docs/设计/表_橙装96条.xlsx，自动生成：python /tmp/gen.py）
// pending = 需要战斗钩子、还没实现的条目：本版不进掉落池，v0.9.1p 补齐
export interface LgSpec { n: number; id: string; name: string; cls: string; spec: string; slots: string[]; desc: string; frm?: string; slot?: string; ops?: unknown[]; match?: unknown; extraOps?: unknown[]; extra?: { match: unknown; conditions?: unknown[]; ops: unknown[]; desc: string }[]; pend?: string; pending?: boolean }
export const LG_V091: LgSpec[] = [
{
"n": 1,
"name": "处决·斩首者",
"cls": "warrior",
"spec": "武器",
"slots": [
"oneHand",
"twoHand"
],
"desc": "普攻每第 3 次必定暴击；暴击的普攻让目标身上流血剩余伤害 +50%",
"id": "lg_w_headsman",
"frm": "lg_w_headsman",
"slot": "basic",
"pend": "流血 +50% 部分"
},
{
"n": 2,
"name": "血怒·风暴战斧",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"oneHand",
"twoHand"
],
"desc": "技能 1 变为投射物，掷出 3 把斧头（每把 -40% 伤害），每把附带流血",
"id": "lg_storm_axe",
"frm": "lg_storm_axe",
"slot": "skill1",
"extraOps": [
{
"op": "addEffect",
"effect": {
"type": "dot",
"element": "physical",
"dps": 8,
"duration": 4
}
}
]
},
{
"n": 3,
"name": "铁壁·镇岳巨锤",
"cls": "warrior",
"spec": "防护",
"slots": [
"oneHand",
"twoHand"
],
"desc": "技能 3 命中获得护盾（伤害的 25%）；护盾存在时流血伤害 +30%",
"id": "lg91_warrior_03",
"pending": true
},
{
"n": 4,
"name": "处决·裂伤盾刃",
"cls": "warrior",
"spec": "武器",
"slots": [
"offHand"
],
"desc": "流血中的目标受到你的普攻伤害 +20%",
"id": "lg91_warrior_04",
"pending": true
},
{
"n": 5,
"name": "血怒·嗜血战盾",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"offHand"
],
"desc": "你的流血每跳回复伤害 3% 的生命",
"id": "lg91_warrior_05",
"pending": true
},
{
"n": 6,
"name": "铁壁·不破之盾",
"cls": "warrior",
"spec": "防护",
"slots": [
"offHand"
],
"desc": "被攻击时 30% 几率让攻击者流血；盾墙期间减伤再 +15%",
"id": "lg91_warrior_06",
"pending": true
},
{
"n": 7,
"name": "处决·双生之心",
"cls": "warrior",
"spec": "武器",
"slots": [
"neck"
],
"desc": "技能 2 命中时 30% 几率重置技能 1",
"id": "lg_x_twinheart",
"frm": "lg_x_twinheart",
"slot": "skill2"
},
{
"n": 8,
"name": "霜刃·寒冰核心",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"neck"
],
"desc": "技能 2 变为冰霜伤害并减速，范围 +50%",
"id": "lg_frost_core",
"frm": "lg_frost_core",
"slot": "skill2"
},
{
"n": 9,
"name": "铁壁·誓血项链",
"cls": "warrior",
"spec": "防护",
"slots": [
"neck"
],
"desc": "技能命中流血目标时，立刻结算该流血剩余伤害的 50%（每个目标 4 秒一次）",
"id": "lg91_warrior_09",
"pending": true
},
{
"n": 10,
"name": "处决·晨昏披风",
"cls": "warrior",
"spec": "武器",
"slots": [
"back"
],
"desc": "大招命中后留下震裂地面（5 秒，物理，随强度缩放）",
"id": "lg_x_duskcloak",
"frm": "lg_x_duskcloak"
},
{
"n": 11,
"name": "血怒·猩红斗篷",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"back"
],
"desc": "流血暴击时回复 5 点怒气",
"id": "lg91_warrior_11",
"pending": true
},
{
"n": 12,
"name": "铁壁·守边旗披",
"cls": "warrior",
"spec": "防护",
"slots": [
"back"
],
"desc": "大招期间受到伤害 -20%，结束时把期间受到伤害的 30% 化作周围流血",
"id": "lg91_warrior_12",
"pending": true
},
{
"n": 13,
"name": "铁壁·不屈腰带",
"cls": "warrior",
"spec": "防护",
"slots": [
"waist"
],
"desc": "位移技能命中时获得护盾（最大生命 12%，6 秒）",
"id": "lg_w_oathbelt",
"frm": "lg_w_oathbelt",
"slot": "skill1"
},
{
"n": 14,
"name": "处决·刽子手腰带",
"cls": "warrior",
"spec": "武器",
"slots": [
"waist"
],
"desc": "对生命低于 30% 的敌人技能伤害 +25%",
"id": "lg_w_execbelt"
},
{
"n": 15,
"name": "血怒·狂战腰带",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"waist"
],
"desc": "身边每个流血的敌人让你急速 +2%（最多 +10%）",
"id": "lg91_warrior_15",
"pending": true
},
{
"n": 16,
"name": "处决·震地战靴",
"cls": "warrior",
"spec": "武器",
"slots": [
"feet"
],
"desc": "技能 1 落地爆炸（80% 伤害）并留下 3 秒震裂地面",
"id": "lg_w_quakeboots",
"frm": "lg_quake_boots",
"slot": "skill1"
},
{
"n": 17,
"name": "血怒·疾风战靴",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"feet"
],
"desc": "技能 1 冷却 -25%；技能 1 后 3 秒内流血跳速 +30%",
"id": "lg91_warrior_17",
"pending": true
},
{
"n": 18,
"name": "铁壁·磐石战靴",
"cls": "warrior",
"spec": "防护",
"slots": [
"feet"
],
"desc": "站定 1 秒后减伤 20%，被近战命中时让攻击者流血",
"id": "lg91_warrior_18",
"pending": true
},
{
"n": 19,
"name": "处决·回响指环",
"cls": "warrior",
"spec": "武器",
"slots": [
"ring"
],
"desc": "技能 3 命中后雷电再弹 3 次（每跳 50%）",
"id": "lg_x_echoring",
"frm": "lg_x_echoring",
"slot": "skill3"
},
{
"n": 20,
"name": "血怒·血誓指环",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"ring"
],
"desc": "放大招时每 10 点怒气让流血伤害 +5%（8 秒）",
"id": "lg91_warrior_20",
"pending": true
},
{
"n": 21,
"name": "铁壁·荆棘指环",
"cls": "warrior",
"spec": "防护",
"slots": [
"ring"
],
"desc": "受到近战伤害的 15% 以流血反弹给攻击者",
"id": "lg91_warrior_21",
"pending": true
},
{
"n": 22,
"name": "处决·誓约护符",
"cls": "warrior",
"spec": "武器",
"slots": [
"trinket"
],
"desc": "位移技能或翻滚后「立誓」4 秒：所有伤害 +20%，技能伤害的 5% 转化为生命",
"id": "lg_x_oathcharm",
"frm": "lg_x_oathcharm"
},
{
"n": 23,
"name": "血怒·狂怒徽记",
"cls": "warrior",
"spec": "狂怒",
"slots": [
"trinket"
],
"desc": "技能 2 每命中一个流血目标，冷却 -0.5 秒",
"id": "lg91_warrior_23",
"pending": true
},
{
"n": 24,
"name": "铁壁·坚韧圣物",
"cls": "warrior",
"spec": "防护",
"slots": [
"trinket"
],
"desc": "护盾破裂时对周围造成护盾值 50% 的流血",
"id": "lg91_warrior_24",
"pending": true
},
{
"n": 25,
"name": "星界·裂光法杖",
"cls": "mage",
"spec": "奥术",
"slots": [
"twoHand",
"oneHand"
],
"desc": "普攻分裂为 3 发（每发 -35%），每第 3 次施放必定暴击",
"id": "lg_split_staff",
"frm": "lg_split_staff",
"slot": "basic"
},
{
"n": 26,
"name": "凛冬·裂冰法杖",
"cls": "mage",
"spec": "冰霜",
"slots": [
"twoHand",
"oneHand"
],
"desc": "技能 1 命中后碎裂，冰片弹向附近 2 个敌人（每跳 65%）",
"id": "lg_m_shatterstaff",
"frm": "lg_m_shatterstaff",
"slot": "skill1"
},
{
"n": 27,
"name": "焚星·余烬法杖",
"cls": "mage",
"spec": "火焰",
"slots": [
"twoHand",
"oneHand"
],
"desc": "燃烧暴击时 50% 几率多烧 1 跳",
"id": "lg91_mage_27",
"pending": true
},
{
"n": 28,
"name": "凛冬·霜火法珠",
"cls": "mage",
"spec": "冰霜",
"slots": [
"offHand"
],
"desc": "技能 1 变为冰霜伤害并减速 30%，同一目标 3 次冻结 1 秒（首领只打断）",
"id": "lg_frostfire",
"frm": "lg_frostfire",
"slot": "skill1"
},
{
"n": 29,
"name": "焚星·熔心法珠",
"cls": "mage",
"spec": "火焰",
"slots": [
"offHand"
],
"desc": "同时燃烧且减速的目标受到你的伤害 +15%",
"id": "lg91_mage_29",
"pending": true
},
{
"n": 30,
"name": "星界·时序法典",
"cls": "mage",
"spec": "奥术",
"slots": [
"offHand"
],
"desc": "技能 3 命中时重置技能 1 冷却",
"id": "lg_m_chronomantle",
"frm": "lg_m_chronomantle",
"slot": "skill3"
},
{
"n": 31,
"name": "焚星·余烬项坠",
"cls": "mage",
"spec": "火焰",
"slots": [
"neck"
],
"desc": "技能 2 留下燃烧地面（4 秒，随强度缩放）",
"id": "lg_m_embergloves",
"frm": "lg_m_embergloves",
"slot": "skill2"
},
{
"n": 32,
"name": "凛冬·凛冬吊坠",
"cls": "mage",
"spec": "冰霜",
"slots": [
"neck"
],
"desc": "技能 2 命中叠寒意，3 层冻结 1.5 秒（首领只打断）",
"id": "lg_m_wintercrown",
"frm": "lg_m_wintercrown",
"slot": "skill2"
},
{
"n": 33,
"name": "星界·星辉项链",
"cls": "mage",
"spec": "奥术",
"slots": [
"neck"
],
"desc": "奥能满溢强化技能后 5 秒内燃烧伤害 +30%",
"id": "lg91_mage_33",
"pending": true
},
{
"n": 34,
"name": "焚星·烈阳披风",
"cls": "mage",
"spec": "火焰",
"slots": [
"back"
],
"desc": "大招命中的所有目标附带燃烧（6 秒）",
"id": "lg_m_sunmantle",
"ops": [
{
"op": "addEffect",
"effect": {
"type": "dot",
"element": "fire",
"dps": 12,
"duration": 6
}
},
{
"op": "rename",
"prefix": "烈阳"
}
],
"match": {
"slots": [
"ultimate"
]
}
},
{
"n": 35,
"name": "凛冬·冰霜斗篷",
"cls": "mage",
"spec": "冰霜",
"slots": [
"back"
],
"desc": "站在自己的冰原里受到伤害 -15%",
"id": "lg91_mage_35",
"pending": true
},
{
"n": 36,
"name": "星界·星界披风",
"cls": "mage",
"spec": "奥术",
"slots": [
"back"
],
"desc": "技能 3 变为以目标为中心的范围禁锢（半径 4 米）",
"id": "lg_astral_legs",
"frm": "lg_astral_legs",
"slot": "skill3"
},
{
"n": 37,
"name": "星界·护法腰带",
"cls": "mage",
"spec": "奥术",
"slots": [
"waist"
],
"desc": "闪现类技能后获得护盾（最大生命 15%，6 秒）",
"id": "lg_m_wardsash",
"frm": "lg_m_wardsash",
"slot": "skill3"
},
{
"n": 38,
"name": "焚星·灼热腰带",
"cls": "mage",
"spec": "火焰",
"slots": [
"waist"
],
"desc": "身边燃烧的敌人 ≥ 3 个时急速 +10%",
"id": "lg91_mage_38",
"pending": true
},
{
"n": 39,
"name": "凛冬·冰晶腰带",
"cls": "mage",
"spec": "冰霜",
"slots": [
"waist"
],
"desc": "技能 2 冷却 -20%",
"id": "lg_m_icebelt",
"ops": [
{
"op": "mul",
"stat": "cooldown",
"value": -0.2
}
],
"match": {
"slots": [
"skill2"
]
}
},
{
"n": 40,
"name": "焚星·坠星之靴",
"cls": "mage",
"spec": "火焰",
"slots": [
"feet"
],
"desc": "大招变为火焰伤害 +20%，并留下燃烧地面",
"id": "lg_m_starfall",
"frm": "lg_m_starfall",
"slot": "ultimate"
},
{
"n": 41,
"name": "凛冬·霜行之靴",
"cls": "mage",
"spec": "冰霜",
"slots": [
"feet"
],
"desc": "移动时留下冰霜路径，减速踩到的敌人",
"id": "lg91_mage_41",
"pending": true
},
{
"n": 42,
"name": "星界·闪耀之靴",
"cls": "mage",
"spec": "奥术",
"slots": [
"feet"
],
"desc": "技能 3 距离 +3 米，施放后重置普攻",
"id": "lg_m_blinkboots",
"ops": [
{
"op": "add",
"stat": "range",
"value": 3
},
{
"op": "addEffect",
"effect": {
"type": "resetCooldown",
"slot": "basic",
"chance": 1
}
}
],
"match": {
"slots": [
"skill3"
]
}
},
{
"n": 43,
"name": "焚星·炎环",
"cls": "mage",
"spec": "火焰",
"slots": [
"ring"
],
"desc": "燃烧每跳 2% 几率重置大招冷却（内置冷却 20 秒）",
"id": "lg91_mage_43",
"pending": true
},
{
"n": 44,
"name": "凛冬·碎霜指环",
"cls": "mage",
"spec": "冰霜",
"slots": [
"ring"
],
"desc": "对冻结 / 减速的目标暴击伤害 +30%",
"id": "lg91_mage_44",
"pending": true
},
{
"n": 45,
"name": "星界·奥能指环",
"cls": "mage",
"spec": "奥术",
"slots": [
"ring"
],
"desc": "普攻每次命中让目标燃烧延长 0.5 秒（最多 +3 秒）",
"id": "lg91_mage_45",
"pending": true
},
{
"n": 46,
"name": "焚星·不灭火种",
"cls": "mage",
"spec": "火焰",
"slots": [
"trinket"
],
"desc": "燃烧中的目标死亡时，燃烧跳到最近的敌人身上",
"id": "lg91_mage_46",
"pending": true
},
{
"n": 47,
"name": "凛冬·永冻之心",
"cls": "mage",
"spec": "冰霜",
"slots": [
"trinket"
],
"desc": "冰原（地面冰霜区域）持续 +3 秒",
"id": "lg91_mage_47",
"pending": true
},
{
"n": 48,
"name": "星界·星界棱镜",
"cls": "mage",
"spec": "奥术",
"slots": [
"trinket"
],
"desc": "技能 4 伤害 +25%，命中燃烧目标再 +15%",
"id": "lg_m_prism",
"ops": [
{
"op": "mul",
"stat": "damage",
"value": 0.25
}
],
"match": {
"slots": [
"skill4"
]
},
"extra": [
{
"match": {
"slots": [
"skill4"
]
},
"conditions": [
{
"type": "targetHasEffect",
"effect": "dot"
}
],
"ops": [
{
"op": "mul",
"stat": "damage",
"value": 0.15
}
],
"desc": "技能 4 命中燃烧目标伤害再 +15%"
}
]
},
{
"n": 49,
"name": "回响·裂时之轮",
"cls": "chrono",
"spec": "回声",
"slots": [
"oneHand"
],
"desc": "技能 2 多飞出 2 枚时轮（每枚 -15%）",
"id": "lg_split_wheel",
"frm": "lg_split_wheel",
"slot": "skill2"
},
{
"n": 50,
"name": "刻痕·锋砂之轮",
"cls": "chrono",
"spec": "时痕",
"slots": [
"oneHand"
],
"desc": "普攻切割持续 +2 秒；切割暴击时叠 1 层时痕",
"id": "lg91_chrono_50",
"pending": true
},
{
"n": 51,
"name": "逆时·倒转之轮",
"cls": "chrono",
"spec": "回溯",
"slots": [
"oneHand"
],
"desc": "回溯后 5 秒内普攻伤害 +40%",
"id": "lg91_chrono_51",
"pending": true
},
{
"n": 52,
"name": "逆时·倒流沙漏",
"cls": "chrono",
"spec": "回溯",
"slots": [
"offHand"
],
"desc": "回溯冷却 -4 秒，回溯后回 1 格时砂",
"id": "lg_backflow",
"frm": "lg_backflow"
},
{
"n": 53,
"name": "刻痕·刻印飞轮",
"cls": "chrono",
"spec": "时痕",
"slots": [
"offHand"
],
"desc": "时痕引爆时给目标施加切割（引爆伤害的 20%，4 秒）",
"id": "lg91_chrono_53",
"pending": true
},
{
"n": 54,
"name": "回响·镜像之轮",
"cls": "chrono",
"spec": "回声",
"slots": [
"offHand"
],
"desc": "回声与分身的时轮切割伤害 +50%",
"id": "lg91_chrono_54",
"pending": true
},
{
"n": 55,
"name": "刻痕·守时者吊坠",
"cls": "chrono",
"spec": "时痕",
"slots": [
"neck"
],
"desc": "时痕引爆后 2 秒内你造成的伤害 +25%",
"id": "lg_keeper_hood",
"frm": "lg_keeper_hood"
},
{
"n": 56,
"name": "回响·残响项链",
"cls": "chrono",
"spec": "回声",
"slots": [
"neck"
],
"desc": "回声伤害 +30%",
"id": "lg_echo_gauntlet",
"frm": "lg_echo_gauntlet"
},
{
"n": 57,
"name": "逆时·永恒坠饰",
"cls": "chrono",
"spec": "回溯",
"slots": [
"neck"
],
"desc": "时砂满时切割伤害 +25%",
"id": "lg91_chrono_57",
"pending": true
},
{
"n": 58,
"name": "逆时·终末披风",
"cls": "chrono",
"spec": "回溯",
"slots": [
"back"
],
"desc": "终刻期间每次暴击让时停延长 0.2 秒（最多 +1.5 秒）",
"id": "lg_final_moment",
"frm": "lg_final_moment",
"slot": "ultimate"
},
{
"n": 59,
"name": "刻痕·沙暴斗篷",
"cls": "chrono",
"spec": "时痕",
"slots": [
"back"
],
"desc": "技能 1 穿过的敌人叠 1 层时痕",
"id": "lg91_chrono_59",
"pending": true
},
{
"n": 60,
"name": "回响·回声斗篷",
"cls": "chrono",
"spec": "回声",
"slots": [
"back"
],
"desc": "回声每次命中 10% 几率返还 1 格时砂",
"id": "lg91_chrono_60",
"pending": true
},
{
"n": 61,
"name": "刻痕·计时腰带",
"cls": "chrono",
"spec": "时痕",
"slots": [
"waist"
],
"desc": "时痕上限 +1，引爆伤害 +10%",
"id": "lg91_chrono_61",
"pending": true
},
{
"n": 62,
"name": "回响·双影束带",
"cls": "chrono",
"spec": "回声",
"slots": [
"waist"
],
"desc": "回声分身持续 +2 秒",
"id": "lg91_chrono_62",
"pending": true
},
{
"n": 63,
"name": "逆时·回旋腰带",
"cls": "chrono",
"spec": "回溯",
"slots": [
"waist"
],
"desc": "回溯时让 4 米内的敌人切割（4 秒）",
"id": "lg91_chrono_63",
"pending": true
},
{
"n": 64,
"name": "逆时·无尽长靴",
"cls": "chrono",
"spec": "回溯",
"slots": [
"feet"
],
"desc": "技能 1 冷却 -40%，位移距离 +3 米",
"id": "lg_endless_boots",
"frm": "lg_endless_boots",
"slot": "skill1"
},
{
"n": 65,
"name": "刻痕·追猎之靴",
"cls": "chrono",
"spec": "时痕",
"slots": [
"feet"
],
"desc": "对带时痕的目标移速 +15%，普攻射程 +2 米",
"id": "lg91_chrono_65",
"pending": true
},
{
"n": 66,
"name": "回响·幻步之靴",
"cls": "chrono",
"spec": "回声",
"slots": [
"feet"
],
"desc": "技能 1 的起点留下一个回声，朝最近的敌人扔一次时轮",
"id": "lg91_chrono_66",
"pending": true
},
{
"n": 67,
"name": "刻痕·印记之戒",
"cls": "chrono",
"spec": "时痕",
"slots": [
"ring"
],
"desc": "切割每跳 5% 几率叠 1 层时痕",
"id": "lg91_chrono_67",
"pending": true
},
{
"n": 68,
"name": "回响·共振指环",
"cls": "chrono",
"spec": "回声",
"slots": [
"ring"
],
"desc": "回声暴击时让本体在目标身上的切割立刻跳一次",
"id": "lg91_chrono_68",
"pending": true
},
{
"n": 69,
"name": "逆时·时砂指环",
"cls": "chrono",
"spec": "回溯",
"slots": [
"ring"
],
"desc": "回溯后 3 秒内切割跳速 +50%",
"id": "lg91_chrono_69",
"pending": true
},
{
"n": 70,
"name": "刻痕·命定沙漏",
"cls": "chrono",
"spec": "时痕",
"slots": [
"trinket"
],
"desc": "引爆伤害 +20%，对首领再 +10%",
"id": "lg91_chrono_70",
"pending": true
},
{
"n": 71,
"name": "回响·万象棱镜",
"cls": "chrono",
"spec": "回声",
"slots": [
"trinket"
],
"desc": "大招期间回声次数 +1",
"id": "lg91_chrono_71",
"pending": true
},
{
"n": 72,
"name": "逆时·停摆怀表",
"cls": "chrono",
"spec": "回溯",
"slots": [
"trinket"
],
"desc": "终刻结束时，时停里被打过的敌人切割延长 4 秒",
"id": "lg91_chrono_72",
"pending": true
},
{
"n": 73,
"name": "爆燃·贤者药瓶",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"oneHand"
],
"desc": "混合药剂 20% 几率不消耗试剂；普攻伤害 +15%",
"id": "lg_sage_flask",
"frm": "lg_sage_flask",
"slot": "basic"
},
{
"n": 74,
"name": "沼泽·腐蚀投掷器",
"cls": "alchemy",
"spec": "地面",
"slots": [
"oneHand"
],
"desc": "普攻命中区域里的敌人时刷新它身上的腐蚀",
"id": "lg91_alchemy_74",
"pending": true
},
{
"n": 75,
"name": "大釜·炮手之杖",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"oneHand"
],
"desc": "大釜炮台在场时普攻伤害 +25%",
"id": "lg91_alchemy_75",
"pending": true
},
{
"n": 76,
"name": "大釜·三元试剂匣",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"offHand"
],
"desc": "每种试剂上限 +1",
"id": "lg_trinity_box",
"frm": "lg_trinity_box"
},
{
"n": 77,
"name": "爆燃·硝石雷管",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"offHand"
],
"desc": "爆燃会再点燃 6 米内一个毒池（连锁一次）；技能 1 范围 +20%",
"id": "lg_saltpeter_robe",
"frm": "lg_saltpeter_robe",
"slot": "skill1"
},
{
"n": 78,
"name": "沼泽·蚀骨药囊",
"cls": "alchemy",
"spec": "地面",
"slots": [
"offHand"
],
"desc": "毒池范围 +30%，并缓缓跟着池里的敌人移动",
"id": "lg_corrode_gloves",
"frm": "lg_corrode_gloves"
},
{
"n": 79,
"name": "沼泽·疯狂学者吊坠",
"cls": "alchemy",
"spec": "地面",
"slots": [
"neck"
],
"desc": "地面反应（爆燃 / 蒸汽 / 冰晶毒）效果 +40%",
"id": "lg_mad_mask",
"frm": "lg_mad_mask"
},
{
"n": 80,
"name": "爆燃·火油项链",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"neck"
],
"desc": "灼烧暴击时目标爆炸（30% 伤害，3 米）",
"id": "lg91_alchemy_80",
"pending": true
},
{
"n": 81,
"name": "大釜·铜釜挂坠",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"neck"
],
"desc": "大釜每次开火给目标补冻伤",
"id": "lg91_alchemy_81",
"pending": true
},
{
"n": 82,
"name": "大釜·永燃斗篷",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"back"
],
"desc": "大釜炮台持续时间翻倍",
"id": "lg_eternal_pot",
"frm": "lg_eternal_pot",
"slot": "ultimate"
},
{
"n": 83,
"name": "爆燃·防爆披风",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"back"
],
"desc": "站在自己的爆炸范围里受到伤害 -20%",
"id": "lg91_alchemy_83",
"pending": true
},
{
"n": 84,
"name": "沼泽·瘴气斗篷",
"cls": "alchemy",
"spec": "地面",
"slots": [
"back"
],
"desc": "你站在自己的区域里时，持续伤害 +20%",
"id": "lg91_alchemy_84",
"pending": true
},
{
"n": 85,
"name": "沼泽·试剂腰带",
"cls": "alchemy",
"spec": "地面",
"slots": [
"waist"
],
"desc": "地面区域持续 +2 秒",
"id": "lg91_alchemy_85",
"pending": true
},
{
"n": 86,
"name": "爆燃·弹药腰带",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"waist"
],
"desc": "技能 1 冷却 -20%",
"id": "lg_a_ammobelt",
"ops": [
{
"op": "mul",
"stat": "cooldown",
"value": -0.2
}
],
"match": {
"slots": [
"skill1"
]
}
},
{
"n": 87,
"name": "大釜·齿轮腰带",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"waist"
],
"desc": "大招冷却 -15%",
"id": "lg_a_gearbelt",
"ops": [
{
"op": "mul",
"stat": "cooldown",
"value": -0.15
}
],
"match": {
"slots": [
"ultimate"
]
}
},
{
"n": 88,
"name": "沼泽·泥行靴",
"cls": "alchemy",
"spec": "地面",
"slots": [
"feet"
],
"desc": "区域里的敌人减速再 +20%",
"id": "lg91_alchemy_88",
"pending": true
},
{
"n": 89,
"name": "爆燃·跃爆靴",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"feet"
],
"desc": "闪避或位移后下一个瓶子伤害 +40%",
"id": "lg91_alchemy_89",
"pending": true
},
{
"n": 90,
"name": "大釜·驻守靴",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"feet"
],
"desc": "在大釜 5 米内急速 +15%",
"id": "lg91_alchemy_90",
"pending": true
},
{
"n": 91,
"name": "爆燃·连锁指环",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"ring"
],
"desc": "技能 1 命中带冻伤的敌人时，立刻结算冻伤剩余伤害",
"id": "lg91_alchemy_91",
"pending": true
},
{
"n": 92,
"name": "沼泽·瘟疫指环",
"cls": "alchemy",
"spec": "地面",
"slots": [
"ring"
],
"desc": "腐蚀中的敌人死亡时把腐蚀传给 4 米内的敌人",
"id": "lg91_alchemy_92",
"pending": true
},
{
"n": 93,
"name": "大釜·炮火指环",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"ring"
],
"desc": "大釜开火 15% 几率连发一次",
"id": "lg91_alchemy_93",
"pending": true
},
{
"n": 94,
"name": "爆燃·炼金核心",
"cls": "alchemy",
"spec": "爆破",
"slots": [
"trinket"
],
"desc": "同时带灼烧、冻伤、腐蚀的目标受到你的伤害 +20%",
"id": "lg91_alchemy_94",
"pending": true
},
{
"n": 95,
"name": "沼泽·腐化之种",
"cls": "alchemy",
"spec": "地面",
"slots": [
"trinket"
],
"desc": "腐蚀每跳让目标易伤 1%（最多 10%）",
"id": "lg91_alchemy_95",
"pending": true
},
{
"n": 96,
"name": "大釜·贤者碎片",
"cls": "alchemy",
"spec": "炮台",
"slots": [
"trinket"
],
"desc": "大招期间持续伤害跳速 +30%",
"id": "lg91_alchemy_96",
"pending": true
}
];
