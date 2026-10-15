import fs from 'fs';
import { generateCode, parseModule } from 'magicast';
import { parse as babelParse } from '@babel/parser';
import { ALREADY_WRAPPED_TOKEN, NEW_IMPORT_PACKAGE, WITH_STORYBOOK_IMPORT_RE } from './constants';

async function writeMetroConfigUpdate(state: {
  path: string;
  content: string;
}): Promise<{ applied: boolean }> {
  if (state.content.includes(ALREADY_WRAPPED_TOKEN)) {
    return { applied: true };
  }

  let modified: string;
  try {
    const mod = parseModule(state.content);
    const body = (mod.$ast as any).body as any[];

    // Only a config that exports a call is rewritten. The call itself is never touched, so
    // another plugin around (or inside) withStorybook stays exactly as the developer wrote it.
    const exportsACall = body.some(
      (stmt) =>
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'AssignmentExpression' &&
        stmt.expression.operator === '=' &&
        isModuleExports(stmt.expression.left) &&
        stmt.expression.right.type === 'CallExpression'
    );

    if (!exportsACall) return { applied: false };

    // Point Storybook's own withStorybook require at Sherlo's package, keeping the name it is bound to
    let storybookRequireIdx = -1;
    for (let i = 0; i < body.length; i++) {
      const stmt = body[i];
      if (
        stmt.type === 'VariableDeclaration' &&
        stmt.declarations &&
        stmt.declarations.length === 1
      ) {
        const decl = stmt.declarations[0];
        if (isStorybookRequireCall(decl.init)) {
          storybookRequireIdx = i;
          // Replace the require string
          decl.init.arguments[0] = { type: 'StringLiteral', value: NEW_IMPORT_PACKAGE };
          // Handle destructured: const { withStorybook } = require(...) or
          // const { withStorybook: sb } = require(...)
          if (decl.id && decl.id.type === 'ObjectPattern') {
            // Replace with a simple identifier binding, under the name the developer's calls use
            stmt.declarations[0] = {
              type: 'VariableDeclarator',
              id: { type: 'Identifier', name: getDestructuredLocalName(decl.id) },
              init: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'require' },
                arguments: [{ type: 'StringLiteral', value: NEW_IMPORT_PACKAGE }],
                optional: false,
              },
            };
          }
          break;
        }
      }
    }

    // Without Storybook's own withStorybook require there is nothing to repoint, and an inserted
    // require would be unused: leave the file for the manual-edit warning.
    if (storybookRequireIdx === -1) return { applied: false };

    modified = generateCode(mod).code;
  } catch {
    return { applied: false };
  }

  // Fallback: if the storybook import line is still present (AST rewrite missed it),
  // remove it via regex so we don't have a duplicate require.
  if (WITH_STORYBOOK_IMPORT_RE.test(modified)) {
    modified = modified.replace(WITH_STORYBOOK_IMPORT_RE, '').replace(/\n\n+/g, '\n\n').trimStart();
  }

  // Recast's printer drops the file's final newline: the result ends with one exactly when the
  // file it read did.
  const inputEndsWithNewline = state.content.endsWith('\n');
  if (inputEndsWithNewline && !modified.endsWith('\n')) modified += '\n';
  if (!inputEndsWithNewline) modified = modified.replace(/\n+$/, '');

  try {
    babelParse(modified, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  } catch {
    return { applied: false };
  }

  await fs.promises.writeFile(state.path, modified, 'utf-8');
  return { applied: true };
}

function isModuleExports(node: any): boolean {
  return (
    node.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'module' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'exports'
  );
}

function isStorybookRequireCall(node: any): boolean {
  if (!node || node.type !== 'CallExpression') return false;
  if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return false;
  const arg = node.arguments?.[0];
  return (
    arg &&
    (arg.type === 'StringLiteral' || arg.type === 'Literal') &&
    typeof arg.value === 'string' &&
    /^@storybook\/react-native\/(?:metro\/)?withStorybook$/.test(arg.value)
  );
}

function getDestructuredLocalName(objectPattern: any): string {
  const withStorybookProperty = objectPattern.properties.find(
    (property: any) => property.key?.type === 'Identifier' && property.key.name === 'withStorybook'
  );

  return withStorybookProperty?.value?.type === 'Identifier'
    ? withStorybookProperty.value.name
    : 'withStorybook';
}

export default writeMetroConfigUpdate;
