import json, re
exec(open('tools/lg91_table.py').read().split("assert len(rows)")[0])  # rows
SLOT = {'主手':['oneHand','twoHand'],'副手':['offHand'],'项链':['neck'],'披风':['back'],'腰带':['waist'],'鞋子':['feet'],'戒指':['ring'],'饰品':['trinket']}
CLS = {'战士':'warrior','法师':'mage','时砂行者':'chrono','炼金投弹手':'alchemy'}
# 主手按职业的底材
MH = {'warrior':['oneHand','twoHand'],'mage':['twoHand','oneHand'],'chrono':['oneHand'],'alchemy':['oneHand']}
D = lambda el,dps,dur: {"op":"addEffect","effect":{"type":"dot","element":el,"dps":dps,"duration":dur}}
I = {  # 名称 → 实现：from=旧 id（沿用修饰器 / 钩子），slot=改为按槽位匹配，ops/match=新修饰器，extraOps=在旧修饰器上追加
'处决·斩首者':dict(id='lg_w_headsman',frm='lg_w_headsman',slot='basic',pend='流血 +50% 部分'),
'血怒·风暴战斧':dict(id='lg_storm_axe',frm='lg_storm_axe',slot='skill1',extraOps=[D('physical',8,4)]),
'处决·双生之心':dict(id='lg_x_twinheart',frm='lg_x_twinheart',slot='skill2'),
'霜刃·寒冰核心':dict(id='lg_frost_core',frm='lg_frost_core',slot='skill2'),
'处决·晨昏披风':dict(id='lg_x_duskcloak',frm='lg_x_duskcloak'),
'铁壁·不屈腰带':dict(id='lg_w_oathbelt',frm='lg_w_oathbelt',slot='skill1'),
'处决·刽子手腰带':dict(id='lg_w_execbelt'),
'处决·震地战靴':dict(id='lg_w_quakeboots',frm='lg_quake_boots',slot='skill1'),
'处决·回响指环':dict(id='lg_x_echoring',frm='lg_x_echoring',slot='skill3'),
'处决·誓约护符':dict(id='lg_x_oathcharm',frm='lg_x_oathcharm'),
'星界·裂光法杖':dict(id='lg_split_staff',frm='lg_split_staff',slot='basic'),
'凛冬·裂冰法杖':dict(id='lg_m_shatterstaff',frm='lg_m_shatterstaff',slot='skill1'),
'凛冬·霜火法珠':dict(id='lg_frostfire',frm='lg_frostfire',slot='skill1'),
'星界·时序法典':dict(id='lg_m_chronomantle',frm='lg_m_chronomantle',slot='skill3'),
'焚星·余烬项坠':dict(id='lg_m_embergloves',frm='lg_m_embergloves',slot='skill2'),
'凛冬·凛冬吊坠':dict(id='lg_m_wintercrown',frm='lg_m_wintercrown',slot='skill2'),
'焚星·烈阳披风':dict(id='lg_m_sunmantle',match={"slots":["ultimate"]},ops=[D('fire',12,6),{"op":"rename","prefix":"烈阳"}]),
'星界·星界披风':dict(id='lg_astral_legs',frm='lg_astral_legs',slot='skill3'),
'星界·护法腰带':dict(id='lg_m_wardsash',frm='lg_m_wardsash',slot='skill3'),
'凛冬·冰晶腰带':dict(id='lg_m_icebelt',match={"slots":["skill2"]},ops=[{"op":"mul","stat":"cooldown","value":-0.2}]),
'焚星·坠星之靴':dict(id='lg_m_starfall',frm='lg_m_starfall',slot='ultimate'),
'星界·闪耀之靴':dict(id='lg_m_blinkboots',match={"slots":["skill3"]},ops=[{"op":"add","stat":"range","value":3},{"op":"addEffect","effect":{"type":"resetCooldown","slot":"basic","chance":1}}]),
'星界·星界棱镜':dict(id='lg_m_prism',match={"slots":["skill4"]},ops=[{"op":"mul","stat":"damage","value":0.25}],extra=[dict(match={"slots":["skill4"]},conditions=[{"type":"targetHasEffect","effect":"dot"}],ops=[{"op":"mul","stat":"damage","value":0.15}],desc='技能 4 命中燃烧目标伤害再 +15%')]),
'回响·裂时之轮':dict(id='lg_split_wheel',frm='lg_split_wheel',slot='skill2'),
'逆时·倒流沙漏':dict(id='lg_backflow',frm='lg_backflow'),
'刻痕·守时者吊坠':dict(id='lg_keeper_hood',frm='lg_keeper_hood'),
'回响·残响项链':dict(id='lg_echo_gauntlet',frm='lg_echo_gauntlet'),
'逆时·终末披风':dict(id='lg_final_moment',frm='lg_final_moment',slot='ultimate'),
'逆时·无尽长靴':dict(id='lg_endless_boots',frm='lg_endless_boots',slot='skill1'),
'爆燃·贤者药瓶':dict(id='lg_sage_flask',frm='lg_sage_flask',slot='basic'),
'大釜·三元试剂匣':dict(id='lg_trinity_box',frm='lg_trinity_box'),
'爆燃·硝石雷管':dict(id='lg_saltpeter_robe',frm='lg_saltpeter_robe',slot='skill1'),
'沼泽·蚀骨药囊':dict(id='lg_corrode_gloves',frm='lg_corrode_gloves'),
'沼泽·疯狂学者吊坠':dict(id='lg_mad_mask',frm='lg_mad_mask'),
'大釜·永燃斗篷':dict(id='lg_eternal_pot',frm='lg_eternal_pot',slot='ultimate'),
'爆燃·弹药腰带':dict(id='lg_a_ammobelt',match={"slots":["skill1"]},ops=[{"op":"mul","stat":"cooldown","value":-0.2}]),
'大釜·齿轮腰带':dict(id='lg_a_gearbelt',match={"slots":["ultimate"]},ops=[{"op":"mul","stat":"cooldown","value":-0.15}]),
}
SPEC = {'武器':'w_arms','狂怒':'w_fury','防护':'w_prot','火焰':'m_fire','冰霜':'m_frost','奥术':'m_arcane','时痕':'c_mark','回声':'c_echo','回溯':'c_rewind','爆破':'a_blast','地面':'a_ground','炮台':'a_turret'}
out=[]; n=0
for i,(cn,part,name,spec,desc,src,impl) in enumerate(rows,1):
    cls=CLS[cn]; im=I.get(name)
    slots = MH[cls] if part=='主手' else SLOT[part]
    e = {"n":i,"name":name,"cls":cls,"spec":spec,"slots":slots,"desc":desc}
    if im is None:
        e["id"]=f"lg91_{cls}_{i:02d}"; e["pending"]=True
    else:
        e["id"]=im['id']
        for k in ('frm','slot','ops','match','extraOps','extra','pend'):
            if k in im: e[k]=im[k]
    out.append(e)
ids=[e['id'] for e in out]; assert len(set(ids))==96
ts = "// v0.9.1o 橙装 96 条（设计表 docs/设计/表_橙装96条.xlsx，自动生成：python /tmp/gen.py）\n// pending = 需要战斗钩子、还没实现的条目：本版不进掉落池，v0.9.1p 补齐\nexport interface LgSpec { n: number; id: string; name: string; cls: string; spec: string; slots: string[]; desc: string; frm?: string; slot?: string; ops?: unknown[]; match?: unknown; extraOps?: unknown[]; extra?: { match: unknown; conditions?: unknown[]; ops: unknown[]; desc: string }[]; pend?: string; pending?: boolean }\nexport const LG_V091: LgSpec[] = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n"
open('src/data/legendary_v091_table.ts','w').write(ts)
print(sum(1 for e in out if not e.get('pending')), 'ready')
