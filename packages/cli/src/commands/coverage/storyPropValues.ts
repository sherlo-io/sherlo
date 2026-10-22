/**
 * WHAT A STORY FILE SAYS - pure: story file text in, findings out.
 *
 * Which files are story files, which are excluded (`sherlo: { exclude: true }`, read by
 * ./componentGaps), and which prop values no story file sets.
 *
 * A story file's component is its meta's `component:`. A value counts as set when that story file
 * sets it for its own component: as a literal in the meta's `args` or a story's `args`, or as a
 * literal prop written on that component anywhere in the file (render functions included). A
 * spread, a variable or a call is not read, and a helper defined in another file is not followed.
 * An excluded story, or an excluded story file, sets nothing: it does not draw what it shows.
 *
 * The allowed values come from the app's TypeScript types, which only the seam can read
 * (../../seams/coverageScan): it answers `ComponentTypes` from the app's own TypeScript program.
 */
import { parse } from '@babel/parser';
import type * as babel from '@babel/types';
import path from 'path';
import type { ComponentProps, CoverageProps, PropFinding } from '../../render/coverage';
import { MAX_NAMED_VALUES } from '../../render/coverage';
import type { SourceFile } from './componentGaps';

/** One finite prop of a component: every value its type allows, each named as `literalName` names it. */
export type FiniteProp = { prop: string; values: string[] };

/** The component a story file's meta names, as the app's types describe it. */
export type StoryComponent = {
  /** The name it is declared under; `default` for a default export, which takes the story's name. */
  name: string;
  /** Where it is declared, relative to the project folder. */
  file: string;
  /** Its finite props declared in the app's own files, in the order the types give them. */
  props: FiniteProp[];
};

/** What the app's TypeScript types answer about a story file's component. */
export type ComponentTypes = {
  /** The component the identifier at `position` of `storyFile` names; undefined when it is none. */
  componentAt(storyFile: string, position: number): StoryComponent | undefined;
};

const STORY_FILE = /\.stories\.(ts|tsx|js|jsx)$/;

/** True for a Storybook story file: `*.stories.tsx` and its kin. */
export function isStoryFile(file: string): boolean {
  return STORY_FILE.test(file);
}

/** How a literal value is named on both sides: `"xs"`, `2`, `true`. */
export function literalName(value: string | number | boolean): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** The prop values no story file sets, per component, from the app's story files. */
export function storyPropValues(params: {
  files: SourceFile[];
  types: ComponentTypes;
}): CoverageProps {
  const storyFiles = params.files.filter((file) => isStoryFile(file.path));
  const found = new Map<string, { component: StoryComponent; set: Map<string, Set<string>> }>();

  for (const file of storyFiles) {
    const story = readStoryFile(file.text);
    if (!story) continue;
    const component = params.types.componentAt(file.path, story.componentPosition);
    if (!component) continue;

    const name = component.name === 'default' ? story.componentName : component.name;
    const id = `${component.file}#${name}`;
    const entry = found.get(id) ?? { component: { ...component, name }, set: new Map() };
    for (const [prop, values] of story.set) {
      entry.set.set(prop, new Set([...(entry.set.get(prop) ?? []), ...values]));
    }
    found.set(id, entry);
  }

  const components: ComponentProps[] = [];
  for (const { component, set } of found.values()) {
    const props: PropFinding[] = [];
    for (const { prop, values } of component.props) {
      const missing = values.filter((value) => !set.get(prop)?.has(value));
      if (missing.length === 0) continue;
      props.push({
        prop,
        allowed: values.length,
        set: values.length - missing.length,
        ...(values.length <= MAX_NAMED_VALUES && { missing }),
      });
    }
    if (props.length > 0) components.push({ name: component.name, file: component.file, props });
  }
  components.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));

  return { storyFiles: storyFiles.length, components };
}

/* ========================================================================== */
/* Reading one story file                                                     */
/* ========================================================================== */

type StoryFileValues = {
  /** Where the meta's `component:` identifier starts, for the types to resolve. */
  componentPosition: number;
  /** The name the story file knows the component by. */
  componentName: string;
  /** Prop -> the literal values this file sets for it. */
  set: Map<string, Set<string>>;
};

/** The meta's component and the values the file sets on it; undefined for a file that names none. */
function readStoryFile(text: string): StoryFileValues | undefined {
  let program: babel.Program;
  try {
    program = parse(text, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] }).program;
  } catch {
    // A story file that does not parse sets nothing the scan can read; the scan carries on.
    return undefined;
  }

  const { meta, stories } = storyObjects(program);
  const component = meta && objectMember(meta, 'component');
  if (!meta || component?.type !== 'Identifier' || typeof component.start !== 'number') {
    return undefined;
  }

  const set = new Map<string, Set<string>>();
  const found = { componentPosition: component.start, componentName: component.name, set };
  // An excluded story draws nothing, so nothing it sets counts; an excluded file sets nothing.
  if (isExcludedStory(program)) return found;
  const excluded = new Set(stories.filter(excludes));
  const add = (prop: string, value: string | undefined) => {
    if (value !== undefined) set.set(prop, (set.get(prop) ?? new Set()).add(value));
  };

  for (const object of [meta, ...stories.filter((story) => !excluded.has(story))]) {
    const args = objectMember(object, 'args');
    if (args?.type !== 'ObjectExpression') continue;
    for (const property of args.properties) {
      if (property.type !== 'ObjectProperty') continue;
      const prop = keyName(property);
      if (prop) add(prop, literalOf(property.value));
    }
  }

  for (const element of openingElements(program, excluded)) {
    if (element.name.type !== 'JSXIdentifier' || element.name.name !== component.name) continue;
    for (const attribute of element.attributes) {
      if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;
      const prop = attribute.name.name;
      const value = attribute.value;
      // `<Avatar isRound />` sets `true`.
      if (!value) add(prop, literalName(true));
      else if (value.type === 'JSXExpressionContainer') add(prop, literalOf(value.expression));
      else add(prop, literalOf(value));
    }
  }

  return found;
}

/** The name of a literal string, number or boolean; undefined for anything else. */
function literalOf(node: babel.Node): string | undefined {
  const value = stripTypes(node);
  if (
    value.type === 'StringLiteral' ||
    value.type === 'NumericLiteral' ||
    value.type === 'BooleanLiteral'
  ) {
    return literalName(value.value);
  }
  return undefined;
}

/** Every JSX opening element in the file, render functions included, but none inside `skipped`. */
function openingElements(node: unknown, skipped: Set<unknown>): babel.JSXOpeningElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => openingElements(child, skipped));
  if (typeof node !== 'object' || node === null || skipped.has(node)) return [];
  const isOpening = (node as { type?: string }).type === 'JSXOpeningElement';
  return [
    ...(isOpening ? [node as babel.JSXOpeningElement] : []),
    ...Object.entries(node).flatMap(([property, child]) =>
      property === 'loc' || property === 'extra' ? [] : openingElements(child, skipped)
    ),
  ];
}

/* ========================================================================== */
/* The meta and the stories                                                   */
/* ========================================================================== */

/** A story file is excluded when its meta, or every story in it, says `sherlo: { exclude: true }`. */
export function isExcludedStory(program: babel.Program): boolean {
  const { meta, stories, storyCount } = storyObjects(program);
  if (meta && excludes(meta)) return true;
  return storyCount > 0 && stories.length === storyCount && stories.every(excludes);
}

/** A story file's meta and its exported stories, each read only when written as an object literal. */
function storyObjects(program: babel.Program): {
  meta?: babel.ObjectExpression;
  stories: babel.ObjectExpression[];
  storyCount: number;
} {
  const objects = new Map<string, babel.ObjectExpression>();
  const stories: babel.ObjectExpression[] = [];
  let meta: babel.ObjectExpression | undefined;
  let storyCount = 0;

  for (const statement of program.body) {
    const isExported = statement.type === 'ExportNamedDeclaration';
    const declaration = isExported ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) {
        const init = item.init && stripTypes(item.init);
        if (item.id.type === 'Identifier' && init?.type === 'ObjectExpression') {
          objects.set(item.id.name, init);
          if (isExported) stories.push(init);
        }
        if (isExported) storyCount += 1;
      }
    } else if (isExported && declaration) {
      storyCount += 1;
    } else if (statement.type === 'ExportDefaultDeclaration') {
      const value = stripTypes(statement.declaration);
      if (value.type === 'ObjectExpression') meta = value;
      if (value.type === 'Identifier') meta = objects.get(value.name);
    }
  }

  return { meta, stories, storyCount };
}

function stripTypes(node: babel.Node): babel.Node {
  return node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression'
    ? stripTypes(node.expression)
    : node;
}

/** True when an object has `parameters: { sherlo: { exclude: true } }`. */
function excludes(object: babel.ObjectExpression): boolean {
  const sherlo = ['parameters', 'sherlo'].reduce<babel.Node | undefined>(
    (current, name) =>
      current?.type === 'ObjectExpression' ? objectMember(current, name) : undefined,
    object
  );
  const exclude = sherlo?.type === 'ObjectExpression' ? objectMember(sherlo, 'exclude') : undefined;
  return exclude?.type === 'BooleanLiteral' && exclude.value;
}

function objectMember(object: babel.ObjectExpression, name: string): babel.Node | undefined {
  for (const property of object.properties) {
    if (property.type === 'ObjectProperty' && keyName(property) === name) {
      return stripTypes(property.value);
    }
  }
  return undefined;
}

/* ========================================================================== */
/* The app's types                                                            */
/* ========================================================================== */

type Literal = string | number | boolean;

/** A type node as far as the declared order reads one: both TypeScript APIs build this shape. */
export type TypeNodeShape = {
  /** A union's members. */
  types?: ArrayLike<TypeNodeShape>;
  /** The node a parenthesized type wraps, or the type an alias declaration or a prop is given. */
  type?: TypeNodeShape;
  /** The name a type reference uses. */
  typeName?: unknown;
};

/**
 * What one TypeScript API answers about a component, in its own symbol objects; the rules of
 * which props count are written once, in `componentTypesFrom`.
 */
export type TypeReader<Sym> = {
  /** The symbol the identifier at `position` names, followed through its import. */
  symbolAt(file: string, position: number): Sym | undefined;
  name(symbol: Sym): string;
  /** The absolute paths of the files that declare the symbol. */
  declaredIn(symbol: Sym): string[];
  /** The props of a function component's first parameter. */
  propsOf(component: Sym): readonly Sym[];
  /** Each member of the prop's type, `undefined` and `null` left out: the literal it is, if one. */
  valuesOf(prop: Sym): (Literal | undefined)[];
  /** The type node the prop's declaration writes, if it writes one. */
  typeNodeOf(prop: Sym): TypeNodeShape | undefined;
  /** The type node a type reference names, read from the alias's own declaration. */
  aliasedTypeNode(reference: TypeNodeShape): TypeNodeShape | undefined;
  /** The members of a type node's type, as `valuesOf` gives a prop's. */
  nodeValuesOf(node: TypeNodeShape): (Literal | undefined)[];
};

/** A literal type's value, from the flags of the API that made it; undefined for any other type. */
export function literalValue(
  part: { flags: number; value?: unknown; intrinsicName?: string },
  flags: { StringLiteral: number; NumberLiteral: number; BooleanLiteral: number }
): Literal | undefined {
  if (part.flags & (flags.StringLiteral | flags.NumberLiteral)) {
    return typeof part.value === 'string' || typeof part.value === 'number'
      ? part.value
      : undefined;
  }
  if (part.flags & flags.BooleanLiteral) {
    return part.value === true || part.intrinsicName === 'true';
  }
  return undefined;
}

/**
 * The finite props of a story file's component: those whose type is a union of string or number
 * literals, or boolean, declared in the app's own files - never one inherited from `node_modules`.
 * The checker says which values a prop allows; their order is the order the declaration writes.
 */
export function componentTypesFrom<Sym>(reader: TypeReader<Sym>, root: string): ComponentTypes {
  const isOwn = (file: string) =>
    file.startsWith(root + path.sep) && !file.split(/[\\/]/).includes('node_modules');
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');

  return {
    componentAt(storyFile, position) {
      const component = reader.symbolAt(path.join(root, storyFile), position);
      const [file] = component ? reader.declaredIn(component) : [];
      if (!component || !file || !isOwn(file)) return undefined;

      const props: FiniteProp[] = [];
      for (const prop of reader.propsOf(component)) {
        const declaredIn = reader.declaredIn(prop);
        if (declaredIn.length === 0 || !declaredIn.every(isOwn)) continue;
        const values = reader.valuesOf(prop);
        const literals = sortedLiterals(values);
        if (literals.length === 0 || literals.length < values.length) continue;
        const allowed = new Set(literals.map(literalName));
        const typeNode = reader.typeNodeOf(prop);
        const written = typeNode ? declaredOrder(reader, typeNode, 0) : [];
        const named = [...written, ...literals]
          .map(literalName)
          .filter((name) => allowed.has(name));
        props.push({ prop: reader.name(prop), values: [...new Set(named)] });
      }
      return { name: reader.name(component), file: relative(file), props };
    },
  };
}

/** How many aliases deep the declared order follows a type before it stops. */
const MAX_TYPE_DEPTH = 20;

/** The literals a type node writes, in source order: union members in turn, aliases followed. */
function declaredOrder<Sym>(
  reader: TypeReader<Sym>,
  node: TypeNodeShape,
  depth: number
): Literal[] {
  if (depth > MAX_TYPE_DEPTH) return [];
  if (node.types) {
    return Array.from(node.types).flatMap((member) => declaredOrder(reader, member, depth + 1));
  }
  const inner = node.typeName === undefined ? node.type : reader.aliasedTypeNode(node);
  if (inner) return declaredOrder(reader, inner, depth + 1);
  return sortedLiterals(reader.nodeValuesOf(node));
}

/**
 * The literals among values, in a fixed order: a checker hands a union's members in the order it
 * made their types, which changes from run to run. Numbers by size, the rest by text (false first).
 */
function sortedLiterals(values: (Literal | undefined)[]): Literal[] {
  return values
    .flatMap((value) => (value === undefined ? [] : [value]))
    .sort((a, b) =>
      typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
    );
}

/** The plain name of a property: `size` or `'size'`, never a computed key. */
function keyName(property: babel.ObjectProperty): string | undefined {
  if (property.computed) return undefined;
  const { key } = property;
  return key.type === 'Identifier'
    ? key.name
    : key.type === 'StringLiteral'
      ? key.value
      : undefined;
}
