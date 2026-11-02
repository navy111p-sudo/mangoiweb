/** Parse dependency syntax; prose, quoted examples, comments and regexes are not imports. */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../cloudflare-deploy/package.json', import.meta.url));
const ts = require('typescript'); // Already required by the CI typecheck; no optional regex fallback.
const browserPackage = value => /^puppeteer(?:-[\w-]+)?(?:\/|$)/.test(value);

export function usesPuppeteer(body) {
  const source = ts.createSourceFile('harness.mjs', body, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  let found = false;
  function visit(node) {
    if (found) return;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier) && browserPackage(node.moduleSpecifier.text)) {
      found = true; return;
    }
    if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && browserPackage(node.arguments[0].text)) {
      found = true; return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
