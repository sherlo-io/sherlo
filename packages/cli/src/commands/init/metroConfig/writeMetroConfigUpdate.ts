import fs from 'fs';
import { generateCode, parseModule } from 'magicast';
import { parse as babelParse } from '@babel/parser';
import { ALREADY_WRAPPED_TOKEN, NEW_IMPORT_PACKAGE, WITH_STORYBOOK_IMPORT_RE } from './constants';

/**
 * Wires the Metro config for Sherlo, writing it only when it changed. `applied: false` means the
 * file's shape is one setup cannot read, and it was left untouched.
 */
async function writeMetroConfigUpdate(state: {
  path: string;
  content: string;
}): Promise<{ applied: boolean }> {
  const modified = rewriteMetroConfig(state.content);
  if (modified === null) return { applied: false };
  if (modified === state.content) return { applied: true };

  await fs.promises.writeFile(state.path, modified, 'utf-8');
  return { applied: true };
}

export default writeMetroConfigUpdate;

/**
 * THE METRO CONFIG, WIRED FOR SHERLO, or null when its shape is one setup cannot read. Pure, so the
 * project check asks it too, before the login, and refuses a config setup could not wire later.
 *
 *   - Storybook's own withStorybook is required or imported: that one line is pointed at Sherlo's,
 *     under the name the developer's calls use. Sherlo's includes Storybook's, so the calls stay
 *     as they are, another plugin around them included (metro-without-storybook spike, 2026-10-29).
 *   - No withStorybook at all: the exported config is wrapped in Sherlo's withStorybook, and its
 *     require (or import, in an ES module) is added at the top. Storybook does not work without
 *     the wrapper, so setup adds it rather than stopping.
 *   - A config exported as a function, or one with no export setup can find, is left alone.
 */
export function rewriteMetroConfig(content: string): string | null {
  // Sherlo's older factory shape wraps Storybook's own withStorybook itself: repointing that
  // require would nest one wrapper in the other.
  if (content.includes(ALREADY_WRAPPED_TOKEN) || content.includes('createSherloStorybook(')) {
    return content;
  }

  let modified: string;
  try {
    const mod = parseModule(content);
    const body = (mod.$ast as any).body as any[];

    // A withStorybook from anywhere but Storybook's package is the developer's own: never wrapped twice.
    const isWired =
      repointStorybookRequire(body) ||
      (!content.includes('withStorybook') && wrapExportedConfig(body));
    if (!isWired) return null;

    modified = generateCode(mod).code;
  } catch {
    return null;
  }

  // Fallback: if the storybook import line is still present (AST rewrite missed it),
  // remove it via regex so we don't have a duplicate require.
  if (WITH_STORYBOOK_IMPORT_RE.test(modified)) {
    modified = modified.replace(WITH_STORYBOOK_IMPORT_RE, '').replace(/\n\n+/g, '\n\n').trimStart();
  }

  // Recast's printer drops the file's final newline: the result ends with one exactly when the
  // file it read did.
  const inputEndsWithNewline = content.endsWith('\n');
  if (inputEndsWithNewline && !modified.endsWith('\n')) modified += '\n';
  if (!inputEndsWithNewline) modified = modified.replace(/\n+$/, '');

  try {
    babelParse(modified, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  } catch {
    return null;
  }

  return modified;
}

/* ========================================================================== */

/** Points Storybook's withStorybook require or import at Sherlo's package. True when it found one. */
function repointStorybookRequire(body: any[]): boolean {
  for (const stmt of body) {
    if (stmt.type === 'ImportDeclaration' && isStorybookWithStorybookPath(stmt.source?.value)) {
      stmt.source = { type: 'StringLiteral', value: NEW_IMPORT_PACKAGE };
      return true;
    }

    if (stmt.type !== 'VariableDeclaration' || stmt.declarations?.length !== 1) continue;

    const decl = stmt.declarations[0];
    if (!isStorybookRequireCall(decl.init)) continue;

    decl.init.arguments[0] = { type: 'StringLiteral', value: NEW_IMPORT_PACKAGE };
    // Handle destructured: const { withStorybook } = require(...) or
    // const { withStorybook: sb } = require(...)
    if (decl.id && decl.id.type === 'ObjectPattern') {
      // Replace with a simple identifier binding, under the name the developer's calls use
      stmt.declarations[0] = {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: getDestructuredLocalName(decl.id) },
        init: requireCall(NEW_IMPORT_PACKAGE),
      };
    }
    return true;
  }

  return false;
}

/**
 * Wraps `module.exports = <config>` or `export default <config>` in Sherlo's withStorybook and adds
 * its require or import at the top. True when it wrapped one.
 */
function wrapExportedConfig(body: any[]): boolean {
  for (const stmt of body) {
    const isCommonJsExport =
      stmt.type === 'ExpressionStatement' &&
      stmt.expression.type === 'AssignmentExpression' &&
      stmt.expression.operator === '=' &&
      isModuleExports(stmt.expression.left);

    if (isCommonJsExport && isConfigValue(stmt.expression.right)) {
      stmt.expression.right = withStorybookCall(stmt.expression.right);
      insertAfterImports(body, {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: { type: 'Identifier', name: 'withStorybook' },
            init: requireCall(NEW_IMPORT_PACKAGE),
          },
        ],
      });
      return true;
    }

    if (stmt.type === 'ExportDefaultDeclaration' && isConfigValue(stmt.declaration)) {
      stmt.declaration = withStorybookCall(stmt.declaration);
      insertAfterImports(body, {
        type: 'ImportDeclaration',
        specifiers: [
          { type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: 'withStorybook' } },
        ],
        source: { type: 'StringLiteral', value: NEW_IMPORT_PACKAGE },
      });
      return true;
    }
  }

  return false;
}

/**
 * Adds the require or import under the file's own, so it reads as one of them and a comment heading
 * the file stays at its top.
 */
function insertAfterImports(body: any[], statement: any): void {
  let lastImport = -1;
  body.forEach((stmt, index) => {
    const isImport =
      stmt.type === 'ImportDeclaration' ||
      (stmt.type === 'VariableDeclaration' &&
        stmt.declarations?.some(
          (decl: any) =>
            decl.init?.type === 'CallExpression' && decl.init.callee?.name === 'require'
        ));
    if (isImport && lastImport === index - 1) lastImport = index;
  });

  body.splice(lastImport + 1, 0, statement);
}

/** A config value setup can wrap: anything but a function, which Metro calls itself. */
function isConfigValue(node: any): boolean {
  return (
    !!node &&
    ![
      'ArrowFunctionExpression',
      'FunctionExpression',
      'FunctionDeclaration',
      'ClassDeclaration',
    ].includes(node.type)
  );
}

function withStorybookCall(argument: any): any {
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: 'withStorybook' },
    arguments: [argument],
    optional: false,
  };
}

function requireCall(packageName: string): any {
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: 'require' },
    arguments: [{ type: 'StringLiteral', value: packageName }],
    optional: false,
  };
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

function isStorybookWithStorybookPath(value: unknown): boolean {
  return (
    typeof value === 'string' && /^@storybook\/react-native\/(?:metro\/)?withStorybook$/.test(value)
  );
}

function isStorybookRequireCall(node: any): boolean {
  if (!node || node.type !== 'CallExpression') return false;
  if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return false;
  const arg = node.arguments?.[0];
  return (
    arg &&
    (arg.type === 'StringLiteral' || arg.type === 'Literal') &&
    isStorybookWithStorybookPath(arg.value)
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
