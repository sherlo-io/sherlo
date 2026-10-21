/**
 * WHICH COMPONENTS HAVE NO STORY OF THEIR OWN - pure, no file system.
 *
 * Given the app's source files (path and text), it finds the components, the story files, and which
 * component each story file imports. A component has a story of its own when a story file imports
 * it directly; an import through a barrel (`index.ts` re-exports) counts as importing the
 * component itself, and nothing else is followed - never a component's own imports, because a
 * screen story reaches almost every component under it and would hide the real gaps.
 *
 * Reading the files is the seam's job (../../seams/coverageScan); this file only reads text.
 */
import { parse } from '@babel/parser';
import type * as babel from '@babel/types';
import path from 'path';
import type { CoverageFindings, CoverageGap } from '../../render/coverage';

/** One source file of the app: its path from the project folder, and its text. */
export type SourceFile = { path: string; text: string };

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const STORY_FILE = /\.stories\.(ts|tsx|js|jsx)$/;
const NOT_APP_CODE = /\.(test|spec)\.[jt]sx?$|\.d\.ts$/;

/** Where one exported name lives: the file that declares it and the name it has there. */
type Export = { file: string; name: string };

/** What a file exports: whether it is a component, and the name the list shows for it. */
type OwnExport = { isComponent: boolean; label: string };

type ParsedFile = {
  path: string;
  ast: babel.Program;
  /** Exported name -> what this file declares itself under that name. */
  own: Map<string, OwnExport>;
  /** `export { a as b } from 's'` and `export * from 's'` (name `*`): outer name -> [source, inner name]. */
  reExports: { outer: string; source: string; inner: string }[];
  /** Each import declaration: where it points and which exported names it takes (`*` for all). */
  imports: { source: string; names: string[] }[];
};

/** The gaps the most files import first; the same count in name order, so a run repeats itself. */
export function rankGaps(findings: CoverageFindings): CoverageFindings {
  const gaps = [...findings.gaps].sort(
    (a, b) => b.importedBy - a.importedBy || a.name.localeCompare(b.name)
  );
  return { ...findings, gaps };
}

/**
 * The components of the app, and those no non-excluded story file imports, ranked.
 * `tsconfig` is the text of the app's tsconfig.json, for `baseUrl` and `paths`.
 */
export function componentGaps(params: {
  files: SourceFile[];
  tsconfig?: string;
}): CoverageFindings {
  const parsed = new Map<string, ParsedFile>();
  for (const file of params.files) {
    const result = parseFile(file);
    if (result) parsed.set(file.path, result);
  }
  const resolve = makeResolver(new Set(parsed.keys()), params.tsconfig);

  const components = new Map<string, Export>();
  for (const file of parsed.values()) {
    if (STORY_FILE.test(file.path) || NOT_APP_CODE.test(file.path)) continue;
    for (const [name, { isComponent, label }] of file.own) {
      if (
        isComponent &&
        file.path.endsWith('.tsx') &&
        /^[A-Z]/.test(label) &&
        !/Provider$/.test(label)
      ) {
        components.set(key({ file: file.path, name }), { file: file.path, name: label });
      }
    }
  }

  // What each import takes, followed through barrels only.
  function imported(file: ParsedFile): Export[] {
    return file.imports.flatMap(({ source, names }) => {
      const target = resolve(file.path, source);
      return target ? names.flatMap((name) => exported(target, name, new Set())) : [];
    });
  }

  function exported(file: string, name: string, seen: Set<string>): Export[] {
    const visit = `${file}#${name}`;
    const found = parsed.get(file);
    if (!found || seen.has(visit)) return [];
    seen.add(visit);

    const own = name === '*' ? [...found.own.keys()] : found.own.has(name) ? [name] : [];
    const direct = own.map((ownName) => ({ file, name: ownName }));
    const through = found.reExports
      .filter((reExport) => reExport.outer === '*' || name === '*' || reExport.outer === name)
      .flatMap((reExport) => {
        const target = resolve(file, reExport.source);
        const inner = reExport.outer === '*' ? name : reExport.inner;
        return target ? exported(target, inner, seen) : [];
      });
    return [...direct, ...through];
  }

  const storyKept = new Set<string>();
  const storyExcluded = new Set<string>();
  const importers = new Map<string, Set<string>>();
  for (const file of parsed.values()) {
    const isStory = STORY_FILE.test(file.path);
    const target = isStory && isExcludedStory(file.ast) ? storyExcluded : storyKept;
    for (const taken of imported(file)) {
      const id = key(taken);
      if (isStory) target.add(id);
      else if (taken.file !== file.path) {
        importers.set(id, (importers.get(id) ?? new Set()).add(file.path));
      }
    }
  }

  const gaps: CoverageGap[] = [];
  for (const [id, component] of components) {
    if (storyKept.has(id)) continue;
    gaps.push({
      name: component.name,
      file: component.file,
      importedBy: importers.get(id)?.size ?? 0,
      ...(storyExcluded.has(id) && { excluded: true as const }),
    });
  }
  return rankGaps({ components: components.size, gaps });
}

function key({ file, name }: Export): string {
  return `${file}#${name}`;
}

/* ========================================================================== */
/* Reading one file                                                           */
/* ========================================================================== */

function parseFile(file: SourceFile): ParsedFile | undefined {
  let program: babel.Program;
  try {
    program = parse(file.text, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx'],
    }).program;
  } catch {
    // A file that does not parse cannot be read for exports or imports; the scan carries on.
    return undefined;
  }

  const local = new Map<string, boolean>(); // top-level binding -> is a component
  for (const statement of program.body) {
    const declaration = unwrapExport(statement);
    if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
      local.set(declaration.id.name, returnsJsx(declaration, local));
    } else if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) {
        if (item.id.type === 'Identifier' && item.init) {
          local.set(item.id.name, returnsJsx(item.init, local));
        }
      }
    }
  }

  const own = new Map<string, OwnExport>();
  const reExports: ParsedFile['reExports'] = [];
  const imports: ParsedFile['imports'] = [];
  const baseName = path.basename(file.path).replace(/\..*$/, '');
  const exportLocal = (name: string) =>
    own.set(name, { isComponent: local.get(name) ?? false, label: name });

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      imports.push({ source: statement.source.value, names: importedNames(statement) });
    } else if (statement.type === 'ExportAllDeclaration') {
      reExports.push({ outer: '*', source: statement.source.value, inner: '*' });
    } else if (statement.type === 'ExportNamedDeclaration') {
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ExportSpecifier') continue;
        const inner = specifier.local.name;
        const outer = nameOf(specifier.exported);
        if (statement.source) reExports.push({ outer, source: statement.source.value, inner });
        else own.set(outer, { isComponent: local.get(inner) ?? false, label: outer });
      }
      const declaration = statement.declaration;
      if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
        exportLocal(declaration.id.name);
      } else if (declaration?.type === 'VariableDeclaration') {
        for (const item of declaration.declarations) {
          if (item.id.type === 'Identifier') exportLocal(item.id.name);
        }
      }
    } else if (statement.type === 'ExportDefaultDeclaration') {
      const value = statement.declaration;
      // A default export is listed under the name it was written with, else its file's name.
      const label =
        (value.type === 'FunctionDeclaration' && value.id?.name) ||
        (value.type === 'Identifier' && value.name) ||
        baseName;
      const isComponent =
        value.type === 'Identifier' ? (local.get(value.name) ?? false) : returnsJsx(value, local);
      own.set('default', { isComponent, label });
    }
  }
  return { path: file.path, ast: program, own, reExports, imports };
}

function unwrapExport(statement: babel.Statement): babel.Statement | babel.Declaration | undefined {
  if (statement.type === 'ExportNamedDeclaration') return statement.declaration ?? undefined;
  return statement;
}

function nameOf(node: babel.Identifier | babel.StringLiteral): string {
  return node.type === 'Identifier' ? node.name : node.value;
}

function importedNames(statement: babel.ImportDeclaration): string[] {
  return statement.specifiers.map((specifier) => {
    if (specifier.type === 'ImportDefaultSpecifier') return 'default';
    if (specifier.type === 'ImportNamespaceSpecifier') return '*';
    return nameOf(specifier.imported);
  });
}

/** True when the value is a function, `memo(...)` or `forwardRef(...)` that returns JSX. */
function returnsJsx(value: babel.Node, local: Map<string, boolean>): boolean {
  if (value.type === 'FunctionDeclaration') return hasJsx(value.body);
  if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') {
    return hasJsx(value.body);
  }
  if (value.type === 'CallExpression') {
    const callee = value.callee.type === 'MemberExpression' ? value.callee.property : value.callee;
    if (callee.type !== 'Identifier' || !['memo', 'forwardRef'].includes(callee.name)) return false;
    const [inner] = value.arguments;
    if (inner?.type === 'Identifier') return local.get(inner.name) ?? false;
    return inner !== undefined && returnsJsx(inner, local);
  }
  return false;
}

function hasJsx(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasJsx);
  if (typeof node !== 'object' || node === null) return false;
  const { type } = node as { type?: string };
  if (type === 'JSXElement' || type === 'JSXFragment') return true;
  return Object.entries(node).some(
    ([property, child]) => property !== 'loc' && property !== 'extra' && hasJsx(child)
  );
}

/* ========================================================================== */
/* Excluded stories                                                           */
/* ========================================================================== */

/** A story file is excluded when its meta, or every story in it, says `sherlo: { exclude: true }`. */
function isExcludedStory(program: babel.Program): boolean {
  const objects = new Map<string, babel.ObjectExpression>();
  const stories: babel.ObjectExpression[] = [];
  let meta: babel.ObjectExpression | undefined;
  let storyCount = 0;

  for (const statement of program.body) {
    const declaration = unwrapExport(statement);
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) {
        const init = item.init && stripTypes(item.init);
        if (item.id.type === 'Identifier' && init?.type === 'ObjectExpression') {
          objects.set(item.id.name, init);
          if (statement.type === 'ExportNamedDeclaration') stories.push(init);
        }
        if (statement.type === 'ExportNamedDeclaration') storyCount += 1;
      }
    } else if (statement.type === 'ExportNamedDeclaration' && declaration) {
      storyCount += 1;
    } else if (statement.type === 'ExportDefaultDeclaration') {
      const value = stripTypes(statement.declaration);
      if (value.type === 'ObjectExpression') meta = value;
      if (value.type === 'Identifier') meta = objects.get(value.name);
    }
  }

  if (meta && excludes(meta)) return true;
  return storyCount > 0 && stories.length === storyCount && stories.every(excludes);
}

function stripTypes(node: babel.Node): babel.Node {
  return node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression'
    ? stripTypes(node.expression)
    : node;
}

/** True when an object has `parameters: { sherlo: { exclude: true } }`. */
function excludes(object: babel.ObjectExpression): boolean {
  const sherlo = ['parameters', 'sherlo'].reduce<babel.Node | undefined>(
    (current, name) => (current?.type === 'ObjectExpression' ? member(current, name) : undefined),
    object
  );
  const exclude = sherlo?.type === 'ObjectExpression' ? member(sherlo, 'exclude') : undefined;
  return exclude?.type === 'BooleanLiteral' && exclude.value;
}

function member(object: babel.ObjectExpression, name: string): babel.Node | undefined {
  for (const property of object.properties) {
    if (property.type === 'ObjectProperty' && !property.computed) {
      if (nameOf(property.key as babel.Identifier) === name) return stripTypes(property.value);
    }
  }
  return undefined;
}

/* ========================================================================== */
/* Resolving an import to one of the app's files                              */
/* ========================================================================== */

/** `(fromFile, source) -> the app file the import points at`, from relative paths, baseUrl and paths. */
function makeResolver(files: Set<string>, tsconfig?: string) {
  const options = tsconfig ? compilerOptions(tsconfig) : {};
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : undefined;
  const aliases = Object.entries((options.paths as Record<string, string[]>) ?? {});

  function find(base: string): string | undefined {
    const clean = path.posix.normalize(base);
    return [
      clean,
      ...EXTENSIONS.map((e) => clean + e),
      ...EXTENSIONS.map((e) => `${clean}/index${e}`),
    ].find((candidate) => files.has(candidate));
  }

  return (from: string, source: string): string | undefined => {
    if (source.startsWith('.')) return find(path.posix.join(path.posix.dirname(from), source));

    for (const [pattern, targets] of aliases) {
      const star = pattern.indexOf('*');
      const prefix = star < 0 ? pattern : pattern.slice(0, star);
      const suffix = star < 0 ? '' : pattern.slice(star + 1);
      const fits =
        star < 0 ? source === pattern : source.startsWith(prefix) && source.endsWith(suffix);
      if (!fits) continue;
      const rest = source.slice(prefix.length, source.length - suffix.length);
      for (const target of targets) {
        const found = find(path.posix.join(baseUrl ?? '.', target.replace('*', rest)));
        if (found) return found;
      }
    }
    return baseUrl === undefined ? undefined : find(path.posix.join(baseUrl, source));
  };
}

/** The `compilerOptions` of a tsconfig, which may carry comments and trailing commas. */
function compilerOptions(text: string): Record<string, unknown> {
  try {
    const root = toValue(parseJson(text));
    return (root as { compilerOptions?: Record<string, unknown> }).compilerOptions ?? {};
  } catch {
    // A tsconfig that cannot be read leaves only relative imports to resolve.
    return {};
  }
}

function parseJson(text: string): babel.Node {
  const file = parse(`(${text})`, { sourceType: 'script' });
  return (file.program.body[0] as babel.ExpressionStatement).expression;
}

function toValue(node: babel.Node): unknown {
  if (node.type === 'ObjectExpression') {
    return Object.fromEntries(
      node.properties.flatMap((property) =>
        property.type === 'ObjectProperty'
          ? [
              [
                nameOf(property.key as babel.Identifier | babel.StringLiteral),
                toValue(property.value),
              ],
            ]
          : []
      )
    );
  }
  if (node.type === 'ArrayExpression') return node.elements.map((e) => (e ? toValue(e) : null));
  if (node.type === 'StringLiteral' || node.type === 'BooleanLiteral') return node.value;
  return undefined;
}
