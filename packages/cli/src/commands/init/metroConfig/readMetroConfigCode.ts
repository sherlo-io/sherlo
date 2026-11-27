/**
 * WHAT A METRO CONFIG SAYS, read from its parsed code, never from its text: a comment or a string
 * that names withStorybook is not a call of it. Every look setup takes into the Metro config asks
 * here - whether it is wired for Sherlo, whether it names withStorybook, where it puts Storybook's
 * folder - so no two of them can read the same file two ways.
 */
import { parse } from '@babel/parser';
import { NEW_IMPORT_PACKAGE } from './constants';

/** A `configPath` given as a string: against the project root, or against the config's own folder. */
export type MetroConfigPath =
  | { against: 'project-root'; path: string }
  | { against: 'config-folder'; path: string };

export type MetroConfigCode = {
  /**
   * Already wired for Sherlo: it imports or requires Sherlo's withStorybook, or calls Sherlo's
   * older factory (createSherloStorybook), which wraps Storybook's withStorybook itself.
   */
  wiredForSherlo: boolean;
  /** withStorybook is named in the code (a call, an import, a variable), from any package. */
  mentionsWithStorybook: boolean;
  /**
   * The folder the config gives withStorybook as `configPath`, when written as a string,
   * `path.resolve(__dirname, '<string>')` or `path.join(__dirname, '<string>')`. Null when none is
   * given, and when it is built any other way.
   */
  configPath: MetroConfigPath | null;
  /**
   * The code of a `configPath` built any other way (`path.resolve(root, 'storybook')`), as the
   * config writes it, so setup names what it could not follow. Null when none is given or it is read.
   *
   * BUILD DEBT (init-for-agents, gap B46): follow a configPath built from a variable the config
   * itself sets to a string or to `__dirname`.
   */
  configPathUnread: string | null;
  /**
   * The first withStorybook call, as the config writes it, so a fix can show the person their own
   * call with a configPath in it: the config it wraps, and every option but configPath. Null when
   * there is no call, when its options are not written out as an object, and when a part of it runs
   * over more than one line - a fix line shows one line of code, never a guess at a shorter one.
   */
  withStorybookCall: WithStorybookCall | null;
  /**
   * The name a config exported as a function returns, when the function's own body ends its work
   * with one `return <name>;`, so a fix shows that line wrapped. Null when the export is no
   * function, and when the function returns anything but one name - never a guess at which line.
   */
  exportedFunctionReturns: string | null;
};

export type WithStorybookCall = { config: string; otherOptions: string[] };

/** Null when the code does not parse. */
function readMetroConfigCode(content: string): MetroConfigCode | null {
  let program: unknown;
  try {
    program = parse(content, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] }).program;
  } catch {
    return null;
  }

  const code: MetroConfigCode = {
    wiredForSherlo: false,
    mentionsWithStorybook: false,
    configPath: null,
    configPathUnread: null,
    withStorybookCall: null,
    exportedFunctionReturns: exportedFunctionReturnsOf(program as AstNode),
  };
  let sawWithStorybookCall = false;
  for (const node of allNodes(program)) {
    if (!sawWithStorybookCall && isCallOf(node, 'withStorybook')) {
      sawWithStorybookCall = true;
      code.withStorybookCall = withStorybookCallOf(node, content);
    }
    if (isSherloWithStorybookSource(node) || isCallOf(node, 'createSherloStorybook')) {
      code.wiredForSherlo = true;
    }
    if (node.type === 'Identifier' && node.name === 'withStorybook') {
      code.mentionsWithStorybook = true;
    }
    if (
      code.configPath === null &&
      code.configPathUnread === null &&
      node.type === 'ObjectProperty' &&
      keyName(node) === 'configPath'
    ) {
      code.configPath = configPathOf(node.value);
      if (code.configPath === null) {
        code.configPathUnread = content.slice(node.value.start, node.value.end);
      }
    }
  }
  return code;
}

export default readMetroConfigCode;

/* ========================================================================== */

type AstNode = { type: string; [field: string]: any };

/** Every node under this one, the node itself first. */
function* allNodes(value: unknown): Generator<AstNode> {
  if (Array.isArray(value)) {
    for (const item of value) yield* allNodes(item);
    return;
  }
  if (!value || typeof value !== 'object' || typeof (value as AstNode).type !== 'string') return;

  yield value as AstNode;
  for (const [field, child] of Object.entries(value)) {
    if (field === 'loc' || field.endsWith('Comments')) continue;
    if (child && typeof child === 'object') yield* allNodes(child);
  }
}

/** `import ... from '<Sherlo's withStorybook>'` or `require('<Sherlo's withStorybook>')`. */
function isSherloWithStorybookSource(node: AstNode): boolean {
  if (node.type === 'ImportDeclaration') return node.source.value === NEW_IMPORT_PACKAGE;
  return (
    isCallOf(node, 'require') &&
    node.arguments[0]?.type === 'StringLiteral' &&
    node.arguments[0].value === NEW_IMPORT_PACKAGE
  );
}

/** A call of `name(...)` or `<anything>.name(...)`. */
function isCallOf(node: AstNode, name: string): boolean {
  if (node.type !== 'CallExpression') return false;
  const { callee } = node;
  if (callee.type === 'Identifier') return callee.name === name;
  return (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === name
  );
}

/** `module.exports`. */
export function isModuleExports(node: any): boolean {
  return (
    node.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'module' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'exports'
  );
}

/** What `module.exports = <value>` or `export default <value>` exports, or null with neither. */
function exportedValueOf(program: AstNode): AstNode | null {
  for (const statement of program.body as AstNode[]) {
    if (statement.type === 'ExportDefaultDeclaration') return statement.declaration;
    if (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'AssignmentExpression' &&
      statement.expression.operator === '=' &&
      isModuleExports(statement.expression.left)
    ) {
      return statement.expression.right;
    }
  }
  return null;
}

function exportedFunctionReturnsOf(program: AstNode): string | null {
  const exported = exportedValueOf(program);
  const isFunction =
    exported &&
    ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(
      exported.type
    );
  if (!isFunction || exported.body.type !== 'BlockStatement') return null;

  const returns = ownReturnsOf(exported.body);
  if (returns.length !== 1 || returns[0].argument?.type !== 'Identifier') return null;
  return returns[0].argument.name;
}

/**
 * Every return of the function the block belongs to, an `if` or a loop's included, a nested
 * function's not: a config returned on one path of several is not the one config to wrap.
 */
function ownReturnsOf(node: AstNode): AstNode[] {
  if (!node || typeof node.type !== 'string') return [];
  if (node.type === 'ReturnStatement') return [node];
  if (
    ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type)
  ) {
    return [];
  }
  return Object.entries(node)
    .filter(([key]) => !['loc', 'leadingComments', 'trailingComments'].includes(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((child) => child && typeof child === 'object')
    .flatMap((child) => ownReturnsOf(child as AstNode));
}

function keyName(property: AstNode): string | undefined {
  const { key } = property;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  return undefined;
}

function withStorybookCallOf(call: AstNode, content: string): WithStorybookCall | null {
  const [config, options] = call.arguments as AstNode[];
  if (!config) return null;
  if (options && options.type !== 'ObjectExpression') return null;

  const sourceOf = (node: AstNode) => content.slice(node.start, node.end);
  const otherOptions = ((options?.properties ?? []) as AstNode[])
    .filter((property) => property.type !== 'ObjectProperty' || keyName(property) !== 'configPath')
    .map(sourceOf);
  const parts = [sourceOf(config), ...otherOptions];
  if (parts.some((part) => part.includes('\n'))) return null;
  return { config: sourceOf(config), otherOptions };
}

function configPathOf(value: AstNode): MetroConfigPath | null {
  const text = stringOf(value);
  if (text !== null) return { against: 'project-root', path: text };

  // path.resolve(__dirname, '...') or path.join(__dirname, '...', ...): from the config's own folder.
  if (!isCallOf(value, 'resolve') && !isCallOf(value, 'join')) return null;
  const [first, ...rest] = value.arguments as AstNode[];
  if (first?.type !== 'Identifier' || first.name !== '__dirname') return null;
  const segments = rest.map(stringOf);
  if (segments.some((segment) => segment === null)) return null;
  return { against: 'config-folder', path: segments.join('/') || '.' };
}

/** The text of a string literal or of a template literal with nothing put into it. */
function stringOf(node: AstNode): string | null {
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}
