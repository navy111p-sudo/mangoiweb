import ts from '../../cloudflare-deploy/node_modules/typescript/lib/typescript.js';

/** Identify filesystem URL conversions which break Windows paths or escaped names.
 * HTTP URL pathnames, comments and string fixtures are deliberately left alone.
 */
export function filesystemPortabilityIssues(source, file = 'harness.mjs') {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const issues = [];
  const pathCall = node => ts.isCallExpression(node) && /^(?:path\.)?(?:join|resolve)$/.test(node.expression.getText(parsed));
  function visit(node) {
    let reason;
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'pathname' &&
        ts.isNewExpression(node.expression) && node.expression.expression.getText(parsed) === 'URL' &&
        node.expression.arguments?.some(arg => arg.getText(parsed) === 'import.meta.url')) {
      reason = 'file URL pathname must use fileURLToPath';
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] && pathCall(node.arguments[0])) reason = 'dynamic import of a filesystem path must use pathToFileURL';
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => {
        const next = node.elements[index + 1];
        if (ts.isStringLiteral(element) && element.text === '--import' && next && pathCall(next)) {
          issues.push({ line: parsed.getLineAndCharacterOfPosition(next.getStart(parsed)).line + 1,
            reason: '--import filesystem argument must use pathToFileURL' });
        }
      });
    }
    if (reason) issues.push({ line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1, reason });
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return issues;
}
