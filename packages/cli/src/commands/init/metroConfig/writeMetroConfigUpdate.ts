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
        stmt.expression.right.callee = { type: 'Identifier', name: 'withSherloStorybook' };
        wrapped = true;
        break;
      }
    }

    if (!wrapped || !calleeName) return { applied: false };

    // Insert after the withStorybook import:
    // 1. const { createSherloStorybook } = require('@sherlo/react-native-storybook/metro');
    // 2. const withSherloStorybook = createSherloStorybook(<originalCallee>);
    const requireStmt = makeRequireDestructure('createSherloStorybook', NEW_IMPORT_PACKAGE);
    const factoryStmt = makeFactoryVariable('withSherloStorybook', 'createSherloStorybook', calleeName);

    let insertAt = 0;
    for (let i = 0; i < body.length; i++) {
      if (nodeContainsText(body[i], 'withStorybook', state.content)) {
        insertAt = i + 1;
        break;
      }
    }
    body.splice(insertAt, 0, requireStmt, factoryStmt);

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

function makeFactoryVariable(varName: string, factoryName: string, withStorybookName: string): any {
  return {
    type: 'VariableDeclaration',
    kind: 'const',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: varName },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: factoryName },
          arguments: [{ type: 'Identifier', name: withStorybookName }],
          optional: false,
        },
      },
    ],
  };
}

export default writeMetroConfigUpdate;
