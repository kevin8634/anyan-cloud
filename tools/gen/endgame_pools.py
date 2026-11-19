# 从 docs/设计/表_掉落池分配.xlsx 生成 src/data/endgame_pools.ts（需要 openpyxl + npx tsx 读橙装 id）
import json, subprocess, openpyxl
ids = json.loads(subprocess.check_output(['npx','tsx','-e',"import {LG_V091} from './src/data/legendary_v091_table.ts'; console.log(JSON.stringify(Object.fromEntries(LG_V091.map(a=>[a.n,a.id]))))"]).decode().strip().splitlines()[-1])
C={'战士':'warrior','法师':'mage','时砂行者':'chrono','炼金师':'alchemy'}
MB=['戈拉克','伊格与妮丝','萨穆尔','卡萨','瓦尔卡兹（尾王）']; FB=['莫戈斯','维瑟拉','寒脊','亡誓骑士团','伊瑟兰（尾王）']
cls=list(C.values())
raid={k:{'bosses':[{c:None for c in cls} for _ in range(5)],'shared':{c:[] for c in cls}} for k in ['molten_throne','frost_crypt']}
aby={c:[] for c in cls}; top={c:[] for c in cls}
ws=openpyxl.load_workbook('docs/设计/表_掉落池分配.xlsx')['橙装分配']
for src,pos,cn,_s,_sl,n,_nm,_d in ws.iter_rows(min_row=2,values_only=True):
    c=C[cn]; lid=ids[str(n)]
    if src in ('熔心王座','永霜墓穴'):
        r=raid['molten_throne' if src=='熔心王座' else 'frost_crypt']
        if pos=='共享': r['shared'][c].append(lid)
        else: r['bosses'][(MB if src=='熔心王座' else FB).index(pos)][c]=lid
    elif '20' in src: top[c].append(lid)
    else: aby[c].append(lid)
out=f'''// v0.9.6a 终局橙装分池（设计表 docs/设计/表_掉落池分配.xlsx，python tools/gen/endgame_pools.py 生成）
//   96 件 = 每职业 熔心王座 7 / 永霜墓穴 7 / 深渊首领层 6 / 深渊 20 层顶级 4，长副本和深渊零重复
//   熔心王座 = 爆发专精（狂怒 / 火焰 / 回声 / 爆破）；永霜墓穴 = 控制防守（防护 / 冰霜 / 时痕 / 地面）；深渊 = 第三专精（武器 / 奥术 / 回溯 / 炮台）
export type Cls4 = 'warrior' | 'mage' | 'chrono' | 'alchemy';
/** 长副本：bosses[i][职业] = 首领 i 的独特橙装；shared[职业] = 全副本共享 2 件 */
export const RAID_LG: Record<'molten_throne' | 'frost_crypt', {{ bosses: Record<Cls4, string>[]; shared: Record<Cls4, string[]> }}> = {json.dumps(raid)};
/** 深渊 5 / 10 / 15 层首领池（每职业 6 件，一次掉 3 件不重复） */
export const ABY_LG: Record<Cls4, string[]> = {json.dumps(aby)};
/** 深渊 20 层尾王顶级池（每职业 4 件，一次掉 3 件不重复） */
export const ABY_TOP: Record<Cls4, string[]> = {json.dumps(top)};
/** 掉率 [普通, 炼狱]：套装部件见 data/sets.ts RAID_SET_CHANCE（35% / 45%） */
export const RAID_LG_CHANCE = {{ unique: [0.18, 0.25], shared: [0.12, 0.18] }} as const;
export const ABY_BOSS_LG = 3;
export const ABY_DARKSHARD: Record<number, number> = {{ 5: 3, 10: 6, 15: 9, 20: 12 }};
/** 太古（v0.9.6b 接入）：长副本炼狱每件 4%；深渊 20 层每件橙装 6%、结算自选 10% */
export const ANCIENT_CHANCE = {{ raidHell: 0.04, abyTop: 0.06, abyPick: 0.10 }} as const;
export const ALL_ENDGAME_LG = new Set<string>([...Object.values(RAID_LG).flatMap(r => [...r.bosses.flatMap(b => Object.values(b)), ...Object.values(r.shared).flat()]), ...Object.values(ABY_LG).flat(), ...Object.values(ABY_TOP).flat()]);
'''
open('src/data/endgame_pools.ts','w').write(out)
print(sum(len(v) for v in aby.values()), sum(len(v) for v in top.values()))
