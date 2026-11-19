// 测试打包：只把裸 'three' 换成无 GPU 的 shim，three/examples/* 照常解析
import { build } from 'esbuild';
import path from 'path';
const shim = path.resolve('test/threeShim.ts');
const plugin = { name: 'three-shim', setup(b) {
  b.onResolve({ filter: /^three$/ }, a => (a.importer === shim ? undefined : { path: shim }));
} };
export async function bundle(opts) {
  const r = await build({ bundle: true, format: 'iife', write: false, target: 'es2019', tsconfig: 'src/web/tsconfig.json', plugins: [plugin], ...opts });
  return r.outputFiles[0].text;
}
