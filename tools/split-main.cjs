// 把 src/web/main.ts 的一段（按行号）拆成独立模块：
//   - 段内引用 main 顶层的值 → C.xxx（C 是 main 里的上下文对象，全是 getter/setter，惰性求值）
//   - 段内引用 main 顶层的类型 → import type（main 里加 export）
//   - 段内顶层声明 → 模块 export；变量的初始化和顶层语句按原顺序放进 bindXxx()，在 main 原位置调用
// 用法：node tools/split-main.cjs <起始行> <结束行（含）> <模块名> <bind 函数名> "<注释>"
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const [, , a0, b0, modName, bindName, comment] = process.argv;
const A = +a0, B = +b0;
const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, 'src/web/main.ts');
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(root, 'src/web/tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const prog = ts.createProgram([mainPath], cfg.options);
const ck = prog.getTypeChecker();
const sf = prog.getSourceFile(mainPath);
const text = sf.text;
const lineStart = l => sf.getPositionOfLineAndCharacter(l - 1, 0);
const P0 = lineStart(A), P1 = B >= sf.getLineStarts().length ? text.length : lineStart(B + 1);
// 顶层声明表
const top = new Map();   // name -> { node, kind: 'var'|'let'|'func'|'class'|'type' }
for (const st of sf.statements) {
  if (ts.isVariableStatement(st)) { const isLet = !(st.declarationList.flags & ts.NodeFlags.Const); for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) top.set(d.name.text, { node: st, decl: d, kind: isLet ? 'let' : 'var' }); else if (ts.isObjectBindingPattern(d.name)) for (const el of d.name.elements) if (ts.isIdentifier(el.name)) top.set(el.name.text, { node: st, decl: el, kind: 'var', bound: true }); } }
  else if (ts.isFunctionDeclaration(st) && st.name) top.set(st.name.text, { node: st, kind: 'func' });
  else if (ts.isClassDeclaration(st) && st.name) top.set(st.name.text, { node: st, kind: 'class' });
  else if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) top.set(st.name.text, { node: st, kind: 'type' });
}
const inChunk = n => n.getStart(sf) >= P0 && n.getEnd() <= P1;
const chunkStmts = sf.statements.filter(s => s.getStart(sf) >= P0 && s.getEnd() <= P1);
if (!chunkStmts.length) throw new Error('empty chunk');
for (const st of sf.statements) { const s0 = st.getStart(sf), s1 = st.getEnd(); if ((s0 < P0 && s1 > P0) || (s0 < P1 && s1 > P1)) throw new Error('statement straddles chunk boundary at line ' + (sf.getLineAndCharacterOfPosition(s0).line + 1)); }
// 段内声明的名字；被段外赋值的 let 留在 main（状态归 main 所有）
const cnPath = path.join(root, 'tools/ctx-names.json');
const prevCtx = fs.existsSync(cnPath) ? JSON.parse(fs.readFileSync(cnPath, 'utf8')) : { get: [], set: [] };
const assignedOutside = new Set(prevCtx.set);
(function scan(n) {
  if (ts.isIdentifier(n) && !inChunk(n)) {
    let q = n; while (q.parent && ts.isParenthesizedExpression(q.parent)) q = q.parent;
    const p = q.parent;
    if (p && ((ts.isBinaryExpression(p) && p.left === q && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) || (ts.isPrefixUnaryExpression(p) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) || ts.isPostfixUnaryExpression(p))) assignedOutside.add(n.text);
  }
  ts.forEachChild(n, scan);
})(sf);
const keepInMain = new Set();
for (const [n, d] of top) if (inChunk(d.node) && d.kind === 'let' && assignedOutside.has(n)) keepInMain.add(n);
const own = new Set(); for (const [n, d] of top) if (inChunk(d.node) && !keepInMain.has(n)) own.add(n);
const isTypePos = n => { for (let p = n.parent; p; p = p.parent) { if (ts.isTypeNode(p) || ts.isHeritageClause?.(p) && false) return true; if (ts.isStatement(p) || ts.isExpression?.(p) && !ts.isTypeNode(p)) { if (ts.isTypeNode(p)) return true; } if (ts.isBlock(p) || ts.isSourceFile(p)) break; } return false; };
const typeNodeAncestor = n => { for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent) { if (ts.isTypeNode(p) || ts.isTypeQueryNode?.(p)) return ts.isTypeQueryNode(p) ? 'query' : 'type'; if (ts.isExpressionWithTypeArguments(p) && p.parent && ts.isHeritageClause(p.parent)) return 'heritage'; if (ts.isStatement(p) || ts.isFunctionLike(p)) return null; } return null; };
const edits = [];   // {pos,end,text}
const usedCtx = new Set(), usedTypes = new Set(), setNeeded = new Set();
function topDeclOf(sym) {
  if (!sym) return null;
  if (sym.flags & ts.SymbolFlags.Alias) return null;   // import
  const d = sym.declarations?.[0]; if (!d || d.getSourceFile() !== sf) return null;
  for (const [n, t] of top) { if (t.decl === d || t.node === d) return n; }
  return null;
}
function visit(n) {
  if (ts.isIdentifier(n) && inChunk(n)) {
    const par = n.parent;
    let sym;
    if (ts.isShorthandPropertyAssignment(par) && par.name === n) sym = ck.getShorthandAssignmentValueSymbol(par);
    else sym = ck.getSymbolAtLocation(n);
    const name = topDeclOf(sym);
    if (name && !own.has(name) && name === n.text) {
      // 跳过声明自身的名字、属性名
      const isDeclName = (par.name === n) && (ts.isVariableDeclaration(par) || ts.isFunctionDeclaration(par) || ts.isClassDeclaration(par) || ts.isParameter(par) || ts.isPropertyAssignment(par) || ts.isPropertyDeclaration(par) || ts.isMethodDeclaration(par));
      if (!isDeclName && !(ts.isPropertyAccessExpression(par) && par.name === n)) {
        const tpos = typeNodeAncestor(n);
        const t = top.get(name);
        if (tpos === 'type' || tpos === 'heritage' && t.kind === 'type') { usedTypes.add(name); }
        else if (tpos === 'query') { usedTypes.add(name); }
        else if (t.kind === 'type') { usedTypes.add(name); }
        else {
          usedCtx.add(name);
          if (ts.isShorthandPropertyAssignment(par)) edits.push({ pos: n.getStart(sf), end: n.getEnd(), text: `${name}: CX.${name}` });
          else edits.push({ pos: n.getStart(sf), end: n.getEnd(), text: `CX.${name}` });
          // 赋值目标
          let q = n; while (q.parent && (ts.isParenthesizedExpression(q.parent))) q = q.parent;
          if ((ts.isBinaryExpression(q.parent) && q.parent.left === q && q.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && q.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) || (ts.isPrefixUnaryExpression(q.parent) && (q.parent.operator === ts.SyntaxKind.PlusPlusToken || q.parent.operator === ts.SyntaxKind.MinusMinusToken)) || ts.isPostfixUnaryExpression(q.parent)) setNeeded.add(name);
        }
      }
    }
  }
  ts.forEachChild(n, visit);
}
chunkStmts.forEach(visit);
const apply = (s0, s1) => { let out = '', cur = s0; for (const e of edits.filter(e => e.pos >= s0 && e.end <= s1).sort((x, y) => x.pos - y.pos)) { out += text.slice(cur, e.pos) + e.text; cur = e.end; } return out + text.slice(cur, s1); };
// 段内语句 → 模块
const decls = [], bindBody = [], exported = [], mainKeep = [];
let consumed = 0;
for (const st of chunkStmts) {
  const full0 = Math.max(st.getFullStart(), consumed), s0 = st.getStart(sf);
  let s1 = st.getEnd();
  const tr = ts.getTrailingCommentRanges(text, s1); if (tr && tr.length) s1 = tr[tr.length - 1].end;   // 同一行的行尾注释跟着走
  consumed = s1;
  const lead = text.slice(full0, s0);
  if (ts.isVariableStatement(st) && st.declarationList.declarations.some(d => ts.isIdentifier(d.name) && keepInMain.has(d.name.text))) {
    if (!st.declarationList.declarations.every(d => ts.isIdentifier(d.name) && keepInMain.has(d.name.text))) throw new Error('mixed keep/move declaration');
    mainKeep.push(text.slice(s0, s1)); continue;
  }
  const code = apply(s0, s1);
  if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name)) throw new Error('destructuring not supported at ' + d.getText(sf).slice(0, 40));
      const nm = d.name.text; exported.push(nm);
      const refsOwnVar = (n) => { let hit = false; (function v(x) { if (hit) return; if (ts.isIdentifier(x) && x !== d.name) { const nm2 = topDeclOf(ck.getSymbolAtLocation(x)); if (nm2 && own.has(nm2) && top.get(nm2).kind !== 'func' && top.get(nm2).kind !== 'type') hit = true; } ts.forEachChild(x, v); })(n); return hit; };
      const pure = !d.initializer || (!edits.some(e => e.pos >= d.initializer.getStart(sf) && e.end <= d.initializer.getEnd()) && !refsOwnVar(d.initializer));
      if (pure && st.declarationList.declarations.length === 1) { decls.push(lead.replace(/^\n+/, '\n') + 'export ' + code); continue; }
      let ty = d.type ? apply(d.type.getStart(sf), d.type.getEnd()) : ck.typeToString(ck.getTypeAtLocation(d.name), d, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType | ts.TypeFormatFlags.WriteArrowStyleSignature);
      ty = ty.replace(/import\("[^"]*\/src\/web\/main"\)\./g, '');
      decls.push(`${lead.trimEnd() ? lead.replace(/^\n+/, '\n') : '\n'}export let ${nm}!: ${ty};`);
      if (d.initializer) bindBody.push(`  ${nm} = ${apply(d.initializer.getStart(sf), d.initializer.getEnd())};`);
    }
  } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) {
    if (st.name) exported.push(st.name.text);
    decls.push(lead.replace(/^\n+/, '\n') + 'export ' + code);
  } else {
    bindBody.push((lead.replace(/^\n+/, '\n') + code).split('\n').map(l => (l.trim() ? '  ' + l : '')).join('\n').replace(/^\n/, ''));
  }
}
// main 里需要 export 的类型
const header = text.slice(0, sf.statements.find(s => !ts.isImportDeclaration(s)).getFullStart());
const imports = header.split('\n').filter(l => l.startsWith('import') || /^\s+[\w, ]+\} from/.test(l)).join('\n')
  .replace(/^import \{ ([^}]*)\} from '\.\/(\w+)';$/gm, (m) => m);   // 保持原样
const fixRel = imports.replace(/from '\.\.\//g, "from '../").replace(/from '\.\//g, "from './");
const typeList = [...usedTypes].sort();
const mod = `// ${comment}
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 ${bindName}(C) 初始化
${fixRel}
import type { Ctx${typeList.length ? ', ' + typeList.join(', ') : ''} } from './main';

let CX!: Ctx;
${decls.join('\n')}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function ${bindName}(__ctx: Ctx) {
  CX = __ctx;
${bindBody.join('\n')}
}
`;
fs.writeFileSync(path.join(root, 'src/web', modName + '.ts'), mod);
// main：删掉这一段，原位置放 bind 调用；导出用到的类型；import 模块导出
let m = text.slice(0, P0) + (mainKeep.length ? `// 状态留在 main（${modName}.ts 通过 C 读写）\n` + mainKeep.join('\n') + '\n' : '') + `${bindName}(C);   // → ${modName}.ts\n` + text.slice(P1);
// 给类型声明加 export
for (const t of typeList) {
  const re = new RegExp(`^(interface|type|class|enum|const enum) ${t}\\b`, 'm');
  m = m.replace(re, 'export $1 ' + t);
}
// import 模块
const impLine = `import { ${bindName}, ${exported.filter(x => x !== bindName).join(', ')} } from './${modName}';\n`;
const firstNonImp = m.indexOf('\n// ======================================================================\n// 基础');
m = m.slice(0, firstNonImp) + '\n' + impLine.trimEnd() + m.slice(firstNonImp);
fs.writeFileSync(mainPath, m);
// C 上下文：记录需要的名字（累加到 tools/ctx-names.json），之后 regen-ctx 生成
const cn = path.join(root, 'tools/ctx-names.json');
const prev = fs.existsSync(cn) ? JSON.parse(fs.readFileSync(cn, 'utf8')) : { get: [], set: [] };
prev.get = [...new Set([...prev.get, ...usedCtx])].sort(); prev.set = [...new Set([...prev.set, ...setNeeded])].sort();
fs.writeFileSync(cn, JSON.stringify(prev, null, 1));
console.log(`moved ${chunkStmts.length} statements, exports ${exported.length}, ctx ${usedCtx.size} (set ${setNeeded.size}), types ${typeList.join(',')}`);
