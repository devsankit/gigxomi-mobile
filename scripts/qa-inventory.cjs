// Source inventory only. Does not execute app code or contact any API.
const fs = require('node:fs'); const path = require('node:path'); const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, '../qa/full-app-review'));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : /\.tsx?$/.test(item.name) ? [path.join(dir, item.name)] : []);
const rows = []; const endpoints = [];
for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'src/components')), ...walk(path.join(root, 'src/hooks'))]) {
  const text = fs.readFileSync(file, 'utf8'); const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = path.relative(root, file).replaceAll('\\', '/');
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const actions = attrs.filter(a => /^on(Press|Submit|ChangeText|ValueChange|Refresh|RequestClose|LongPress)/.test(a.name.getText(ast)));
      const name = attrs.find(a => ['title', 'accessibilityLabel', 'label', 'placeholder'].includes(a.name.getText(ast)));
      for (const action of actions) rows.push({ id: `${rel}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1}:${action.name.getText(ast)}`, file: rel, control: node.tagName.getText(ast), label: name?.initializer?.getText(ast) || node.parent.getText(ast).replace(/\s+/g, ' ').slice(0, 140), event: action.name.getText(ast), handler: action.initializer?.getText(ast).replace(/\s+/g, ' ').slice(0, 400), status: 'Blocked', evidence: 'Source inventoried; authenticated runtime verification outstanding.' });
    }
    if (ts.isCallExpression(node) && /apiRequest$/.test(node.expression.getText(ast))) endpoints.push({ file: rel, line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1, endpoint: node.arguments[0]?.getText(ast), options: node.arguments[1]?.getText(ast).replace(/\s+/g, ' ').slice(0, 450) });
    ts.forEachChild(node, visit);
  } visit(ast);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'control-inventory.json'), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(out, 'endpoint-inventory.json'), JSON.stringify(endpoints, null, 2));
const quote = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
const columns = ['id','control','label','event','handler','status','evidence'];
fs.writeFileSync(path.join(out, 'control-inventory.csv'), [columns.join(','), ...rows.map(row => columns.map(c => quote(row[c])).join(','))].join('\n'));
console.log(JSON.stringify({ source: root, controls: rows.length, endpointCalls: endpoints.length, output: out, runtimeSignoff: false }));
if(process.argv[3]){
  const backend=path.resolve(process.argv[3]);
  const apiRoot=path.join(backend,'src/app/api');
  const patterns=walk(apiRoot).filter(file=>/route\.tsx?$/.test(file)).map(file=>path.relative(apiRoot,file).replaceAll('\\','/').replace(/\/route\.tsx?$/,'').split('/'));
  const audit=endpoints.map(call=>{
    const literal=/^(['"])([^'"$]+)\1$/.exec(call.endpoint||'');
    if(!literal)return {...call,routeStatus:'Dynamic expression: requires runtime verification'};
    const parts=literal[2].split('?')[0].replace(/^\//,'').split('/');
    return {...call,routeStatus:patterns.some(pattern=>pattern.length===parts.length&&pattern.every((part,i)=>part.startsWith('[')||part===parts[i]))?'Route present; not runtime verified':'No matching backend route'};
  });
  fs.writeFileSync(path.join(out,'api-route-audit.json'),JSON.stringify(audit,null,2));
  console.log(JSON.stringify({literalRouteChecks:audit.filter(x=>x.routeStatus.startsWith('Route present')).length,missing:audit.filter(x=>x.routeStatus.startsWith('No matching')),dynamic:audit.filter(x=>x.routeStatus.startsWith('Dynamic')).length}));
}
