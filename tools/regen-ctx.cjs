// 重新生成 main.ts 末尾的上下文对象 C（拆出去的模块通过它读写 main 的状态）
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), mainPath = path.join(root, 'src/web/main.ts');
let m = fs.readFileSync(mainPath, 'utf8');
const { get, set } = JSON.parse(fs.readFileSync(path.join(root, 'tools/ctx-names.json'), 'utf8'));
const S = new Set(set);
const body = get.map(n => S.has(n) ? `  get ${n}() { return ${n}; }, set ${n}(v) { ${n} = v; },` : `  get ${n}() { return ${n}; },`).join('\n');
const block = `// ==== CTX BEGIN（tools/regen-ctx.cjs 生成，勿手改）：拆出去的模块通过 C 惰性读写 main 的状态\nconst C = {\n${body}\n};\nexport type Ctx = typeof C;\n// ==== CTX END\n`;
if (m.includes('// ==== CTX BEGIN')) m = m.replace(/\/\/ ==== CTX BEGIN[\s\S]*?\/\/ ==== CTX END\n/, block);
else { const i = m.indexOf('\n// ======================================================================\n// 基础'); const j = m.indexOf('\n', m.indexOf('const $ =', i)) + 1; m = m.slice(0, j) + block + m.slice(j); }
fs.writeFileSync(mainPath, m);
console.log('ctx', get.length, 'getters', set.length, 'setters');
