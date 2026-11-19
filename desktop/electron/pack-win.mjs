// 打 Windows x64 免安装版（在 Linux 沙箱里跑，不需要 wine）
//   node desktop/electron/pack-win.mjs [--html=web/index_dlc1_比赛版.html] [--electron=<win32-x64 zip>] [--out=desktop/out] [--zip]
// 产物：desktop/out/DarkRock-win-x64/DarkRock.exe（+ resources/app/game/ 下原样拷贝的网页构建：index.html + raid/ music/ movie/）
// 游戏代码 0 改动；exe 图标 / 版本信息用 resedit（纯 JS）写入。
import { execFileSync } from 'child_process';
import { existsSync, rmSync, mkdirSync, cpSync, renameSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { createRequire } from 'module';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../..');
const opt = k => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const html = resolve(root, opt('html') || 'web/index_dlc1_比赛版.html');
const ezip = resolve(opt('electron') || '/workspace/work/electron_pkg/dl/electron-v45.2.3-win32-x64.zip');
const outRoot = resolve(root, opt('out') || 'desktop/out');
const name = 'DarkRock-win-x64', dst = join(outRoot, name), app = join(dst, 'resources', 'app');
if (!existsSync(html)) throw new Error('找不到网页构建：' + html);
if (!existsSync(ezip)) throw new Error('找不到 Electron 运行时 zip：' + ezip);

rmSync(dst, { recursive: true, force: true }); mkdirSync(dst, { recursive: true });
execFileSync('python3', ['-c', 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', ezip, dst]);
renameSync(join(dst, 'electron.exe'), join(dst, 'DarkRock.exe'));
rmSync(join(dst, 'resources', 'default_app.asar'), { force: true });
for (const f of readdirSync(join(dst, 'locales'))) if (!/^(zh-CN|en-US)\.pak$/.test(f)) rmSync(join(dst, 'locales', f));

mkdirSync(join(app, 'game'), { recursive: true });
for (const f of ['main.js', 'preload.js', 'package.json']) cpSync(join(here, f), join(app, f));
// 11-17 内置铸造服务：与仓库同样的相对路径（forge_local.js require '../../cloud/forge-fc/index.js'）
mkdirSync(join(app, 'deploy', 'local'), { recursive: true });
cpSync(join(root, 'deploy/local/forge_local.js'), join(app, 'deploy/local/forge_local.js'));
for (const f of ['index.js', 'glbslim.js', 'check.js', 'vendor']) cpSync(join(root, 'cloud/forge-fc', f), join(app, 'cloud/forge-fc', f), { recursive: true });
cpSync(html, join(app, 'game', 'index.html'));
for (const d of ['raid', 'music', 'movie', 'assets']) { const s = join(dirname(html), d); if (existsSync(s)) cpSync(s, join(app, 'game', d), { recursive: true }); }

// exe 图标 + 版本信息（resedit，纯 JS）
const req = createRequire('/workspace/work/electron_pkg/tools/');
try {
  const ResEdit = req('resedit');
  const exePath = join(dst, 'DarkRock.exe');
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(readFileSync(join(here, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const l = { lang: 1033, codepage: 1200 };
    vi.setStringValues(l, { ProductName: '暗岩传说：深渊回响', FileDescription: '暗岩传说：深渊回响', CompanyName: '锐特AI工坊', OriginalFilename: 'DarkRock.exe', InternalName: 'DarkRock' });
    vi.setFileVersion(0, 1, 0, 0, 1033); vi.setProductVersion(0, 1, 0, 0, 1033); vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe); writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('exe 图标 / 版本信息已写入');
} catch (e) { console.warn('resedit 失败，保留 Electron 默认图标：', e.message); }

writeFileSync(join(dst, '先看我_运行说明.txt'), '\ufeff' + readFileSync(join(here, 'README_win.txt'), 'utf8').replace(/\n/g, '\r\n'));

const du = p => statSync(p).isDirectory() ? readdirSync(p).reduce((s, f) => s + du(join(p, f)), 0) : statSync(p).size;
console.log(`目录：${dst}\n大小：${(du(dst) / 1048576).toFixed(1)} MB（其中游戏 ${(du(join(app, 'game')) / 1048576).toFixed(1)} MB）`);
if (process.argv.includes('--zip')) {
  const z = join(outRoot, name + '.zip'); rmSync(z, { force: true });
  execFileSync('zip', ['-r', '-q', '-6', z, name], { cwd: outRoot });
  console.log(`zip：${z} ${(statSync(z).size / 1048576).toFixed(1)} MB`);
}
