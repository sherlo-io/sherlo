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

    // Find module.exports = X(...) and rename X to 'withStorybook'
    let calleeName: string | null = null;
    let wrapped = false;
    for (const stmt of body) {
      if (
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'AssignmentExpression' &&
        stmt.expression.operator === '=' &&
        isModuleExports(stmt.expression.left) &&
        stmt.expression.right.type === 'CallExpression' &&
        stmt.expression.right.callee.type === 'Identifier'
      ) {
        calleeName = stmt.expression.right.callee.name;
        if (calleeName !== 'withStorybook') {
          stmt.expression.right.callee = { type: 'Identifier', name: 'withStorybook' };
        }
        wrapped = true;
        break;
      }
    }

    if (!wrapped) return { applied: false };

    // Find and rename the storybook require declaration to use sherlo's package
    // Also rename the variable binding to 'withStorybook' if it differs
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
          // If the variable was named differently, rename it to 'withStorybook'
          if (decl.id && decl.id.type === 'Identifier' && decl.id.name !== 'withStorybook') {
            decl.id = { type: 'Identifier', name: 'withStorybook' };
          }
          // Handle destructured: const { withStorybook } = require(...)
          if (decl.id && decl.id.type === 'ObjectPattern') {
            // Replace with a simple identifier binding
            stmt.declarations[0] = {
              type: 'VariableDeclarator',
              id: { type: 'Identifier', name: 'withStorybook' },
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

    if (storybookRequireIdx === -1) {
      // No existing storybook require found; insert one at the top
      const requireStmt = makeSimpleRequire('withStorybook', NEW_IMPORT_PACKAGE);
      body.unshift(requireStmt);
    }

    modified = generateCode(mod).code;
  } catch {
    return { applied: false };
  }

  // Fallback: if the storybook import line is still present (AST rewrite missed it),
  // remove it via regex so we don't have a duplicate require.
  if (WITH_STORYBOOK_IMPORT_RE.test(modified)) {
    modified = modified.replace(WITH_STORYBOOK_IMPORT_RE, '').replace(/\n\n+/g, '\n\n').trimStart();
  }

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
    arg.value.includes('@storybook/react-native/metro/withStorybook')
  );
}

function makeSimpleRequire(varName: string, pkg: string): any {
  return {
    type: 'VariableDeclaration',
    kind: 'const',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: varName },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'require' },
          arguments: [{ type: 'StringLiteral', value: pkg }],
          optional: false,
        },
      },
    ],
  };
}

export default writeMetroConfigUpdate;
