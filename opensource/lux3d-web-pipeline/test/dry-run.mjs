// 不花积分的自检：用示例 GLB 走 lux3d.mjs gen --dry-run（后处理 + 登记）和 weapon-hd.mjs（高清武器）
// 用法：node test/dry-run.mjs <示例原始.glb>
import { execFileSync } from 'child_process';
import { existsSync, rmSync, readFileSync, statSync } from 'fs';
const sample = process.argv[2]; if (!sample || !existsSync(sample)) { console.error('用法：node test/dry-run.mjs <示例原始.glb>'); process.exit(1); }
const env = { ...process.env, LUX3D_OUT_DIR: '/tmp/lwp_out', LUX3D_RAW_DIR: '/tmp/lwp_raw' };
rmSync('/tmp/lwp_out', { recursive: true, force: true });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
execFileSync('node', ['bin/lux3d.mjs', 'gen', '--dry-run', '--sample', sample, '--text', '示例', '--out', 'props/sample.glb', '--use', '自检', '--target', '6000'], { env, stdio: 'inherit' });
ok(existsSync('/tmp/lwp_out/props/sample.glb'), `后处理产物 ${(statSync('/tmp/lwp_out/props/sample.glb').size / 1024).toFixed(0)} KB`);
ok(/props\/sample\.glb/.test(readFileSync('/tmp/lwp_out/README.md', 'utf8')), '登记表有这一行');
execFileSync('node', ['bin/weapon-hd.mjs', sample, '/tmp/lwp_out/props/sample_hd.glb', '--target', '20000', '--tex', '1024', '--glow', 'orange'], { env, stdio: 'inherit' });
ok(existsSync('/tmp/lwp_out/props/sample_hd.glb'), '高清武器产物');
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
