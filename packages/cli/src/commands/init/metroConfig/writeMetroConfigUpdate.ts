import fs from 'fs';
import { generateCode, parseModule } from 'magicast';
import { parse as babelParse } from '@babel/parser';
import { ALREADY_WRAPPED_TOKEN, NEW_IMPORT_PACKAGE } from './constants';

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

    let wrapped = false;
    for (const stmt of body) {
      if (
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'AssignmentExpression' &&
        stmt.expression.operator === '=' &&
        isModuleExports(stmt.expression.left) &&
        stmt.expression.right.type === 'CallExpression'
      ) {
        stmt.expression.right = makeCall('withSherlo', stmt.expression.right);
        wrapped = true;
        break;
      }
    }

    if (!wrapped) return { applied: false };

    const requireStmt = makeRequireDestructure('withSherlo', NEW_IMPORT_PACKAGE);
    let insertAt = 0;
    for (let i = 0; i < body.length; i++) {
      if (nodeContainsText(body[i], 'withStorybook', state.content)) {
        insertAt = i + 1;
        break;
      }
    }
    body.splice(insertAt, 0, requireStmt);

    modified = generateCode(mod).code;
  } catch {
    return { applied: false };
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

function nodeContainsText(node: any, text: string, source: string): boolean {
  if (typeof node.start === 'number' && typeof node.end === 'number') {
    return source.slice(node.start, node.end).includes(text);
  }
  return false;
}

function makeCall(name: string, argument: any): any {
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name },
    arguments: [argument],
    optional: false,
  };
}

function makeRequireDestructure(name: string, pkg: string): any {
  return {
    type: 'VariableDeclaration',
    kind: 'const',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: {
          type: 'ObjectPattern',
          properties: [
            {
              type: 'ObjectProperty',
              key: { type: 'Identifier', name },
              value: { type: 'Identifier', name },
              shorthand: true,
              computed: false,
            },
          ],
        },
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
