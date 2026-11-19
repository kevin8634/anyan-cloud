// 精简 KayKit（CC0）角色模型：只在 Knight 里保留需要的动画，其它角色只留网格（同一套骨骼，动画共用）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, weld } from '@gltf-transform/functions';
const SRC = '/tmp/kk/addons/kaykit_character_pack_adventures/Characters/gltf/';
const KEEP = ['Idle', 'Running_A', 'Walking_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal',
  '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop', 'Death_A', 'Hit_A', 'Spellcast_Raise', 'Spellcast_Long', 'Dodge_Forward', 'Cheer', 'Unarmed_Melee_Attack_Punch_A', 'Interact', 'Spellcast_Shoot', 'Spellcasting'];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of ['Knight', 'Barbarian', 'Rogue', 'Rogue_Hooded', 'Mage']) {   // Mage：法师职业
  const doc = await io.read(SRC + name + '.glb');
  for (const a of doc.getRoot().listAnimations()) if (name !== 'Knight' || !KEEP.includes(a.getName())) {
    a.listChannels().forEach(c => c.dispose());
    a.listSamplers().forEach(s => s.dispose());
    a.dispose();
  }
  doc.getRoot().listTextures().forEach(t => t.dispose());   // 贴图单独加载（游戏里换成卡通材质）
  doc.getRoot().listAccessors().forEach(a => { if (a.listParents().every(p => p.propertyType === 'Root')) a.dispose(); });
  // prune 保留 UV：贴图在游戏里单独加载，删掉贴图引用后默认会把 TEXCOORD 当成没用的属性删掉（会导致角色变白）
  await doc.transform(resample({ tolerance: 1e-3 }), weld(), dedup(), prune({ keepAttributes: true }), quantize({ quantizeTexcoord: 12 }));
  doc.getRoot().listAccessors().forEach(a => { if (a.listParents().every(p => p.propertyType === 'Root')) a.dispose(); });
  const out = `assets/models/${name}.glb`;
  await io.write(out, doc);
  const b = (await import('fs')).statSync(out).size;
  console.log(name, (b / 1024).toFixed(0) + ' KB', doc.getRoot().listAnimations().length + ' anims');
}

const fs = await import('fs');
for (const t of ['knight', 'barbarian', 'rogue', 'mage']) fs.copyFileSync(SRC + t + '_texture.png', `assets/models/${t}_texture.png`);
