import * as fs from 'node:fs';
import { parse } from '@babel/parser';
import { traverseFast } from '@babel/types';

/**
 * Every module a TypeScript file names, as the compiler reads them: each `import ... from`,
 * `export ... from`, `import()` and `require()`, in the order they are written.
 */
export function importedModules(file: string): string[] {
  const { program } = parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
  });
  const modules: string[] = [];

  traverseFast(program, (node) => {
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportAllDeclaration' ||
        node.type === 'ExportNamedDeclaration') &&
      node.source
    ) {
      modules.push(node.source.value);
    }

    const isImportCall = node.type === 'CallExpression' && node.callee.type === 'Import';
    const isRequireCall =
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'require';
    if ((isImportCall || isRequireCall) && node.arguments[0]?.type === 'StringLiteral') {
      modules.push(node.arguments[0].value);
    }

    if (
      node.type === 'TSImportEqualsDeclaration' &&
      node.moduleReference.type === 'TSExternalModuleReference'
    ) {
      modules.push(node.moduleReference.expression.value);
    }
  });

  return modules;
}
