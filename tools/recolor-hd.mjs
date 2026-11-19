// v1.2.5：写实服装贴图改色（原地覆盖，只改绿色系像素，皮革 / 金属不动）。
// 用法：node tools/recolor-hd.mjs <模型> <贴图名> <目标色 hex>
// 战士：node tools/recolor-hd.mjs Outfit_Male_Ranger T_Ranger_BaseColor 5a4636（游侠绿布 → 深褐呢料）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [name, tex, hex] = process.argv.slice(2);
const f = `assets/models_hd/${name}.glb`, doc = await io.read(f);
const t = doc.getRoot().listTextures().find(x => x.getName() === tex); if (!t) throw new Error('no texture ' + tex);
const { data, info } = await sharp(t.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const tr = parseInt(hex.slice(0, 2), 16), tg = parseInt(hex.slice(2, 4), 16), tb = parseInt(hex.slice(4, 6), 16);
let n = 0;
for (let i = 0; i < data.length; i += 3) {
  const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (g !== mx || mx - mn < 14 || g < r * 1.08) continue;   // 只认绿色占优的像素
  const L = (r * 0.3 + g * 0.59 + b * 0.11) / 110;           // 保留明暗
  const k = Math.min(1, (mx - mn) / 40);                     // 越绿替换越彻底，边缘平滑过渡
  data[i] = r + (Math.min(255, tr * L) - r) * k; data[i + 1] = g + (Math.min(255, tg * L) - g) * k; data[i + 2] = b + (Math.min(255, tb * L) - b) * k; n++;
}
t.setImage(new Uint8Array(await sharp(data, { raw: info }).jpeg({ quality: 82 }).toBuffer()));
await io.write(f, doc); console.log('recolored', name, tex, n, 'px');
