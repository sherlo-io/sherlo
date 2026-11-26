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
};

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
  };
  for (const node of allNodes(program)) {
    if (isSherloWithStorybookSource(node) || isCallOf(node, 'createSherloStorybook')) {
      code.wiredForSherlo = true;
    }
    if (node.type === 'Identifier' && node.name === 'withStorybook') {
      code.mentionsWithStorybook = true;
    }
    if (code.configPath === null && node.type === 'ObjectProperty' && keyName(node) === 'configPath') {
      code.configPath = configPathOf(node.value);
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

function keyName(property: AstNode): string | undefined {
  const { key } = property;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  return undefined;
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
