/**
 * WHAT TO KNOW BEFORE WRITING THE TEST OF ONE SCREEN OR COMPONENT - pure, from the same graph the
 * ranking reads (./suggestItems): the real screen behind a thin route file, what it draws, the data
 * modules it reaches, the server queries it runs (through its own hooks too), the link params it
 * reads, the conditions that change what it draws and the test ids it sets.
 */
import path from 'path';
import type { SourceFile } from '../coverage/componentGaps';
import { routeNameOf, screenGraph } from './suggestItems';

export type ScreenFacts = {
  name: string;
  file: string;
  /** The thin route file in front of `file`, when the file asked about is not the real screen. */
  routeFile?: string;
  draws: string[];
  data: string[];
  /** The names of the GraphQL operations it runs, each once, in the order found. */
  queries: string[];
  linkParams: string[];
  states: string[];
  testIDs: string[];
};

/** Libraries that fetch, keep state or store data: an import of one is data the screen reads. */
const DATA_LIBRARIES = [
  'axios',
  'ky',
  'swr',
  'urql',
  '@urql/',
  '@apollo/client',
  '@tanstack/',
  'react-query',
  'graphql-request',
  '@reduxjs/toolkit',
  'react-redux',
  'redux',
  'zustand',
  'jotai',
  'recoil',
  'mobx',
  'valtio',
  '@react-native-async-storage/async-storage',
  'react-native-mmkv',
  'expo-secure-store',
  'react-native-keychain',
  'expo-sqlite',
  '@nozbe/watermelondb',
  'realm',
  '@supabase/',
  'firebase',
  '@react-native-firebase/',
];
const DATA_FILE =
  /(^|\/)(api|apis|store|stores|atoms?|slices?|queries|query|client|storage|secure\w*|database|db|services?|repositor(y|ies)|models?)(\/|\.|$)/i;
const LINK_PARAM_HOOKS = new Set(['useLocalSearchParams', 'useGlobalSearchParams']);
const SKIPPED_KEYS = new Set(['loc', 'extra', 'leadingComments', 'trailingComments']);
const GRAPHQL_TAGS = new Set(['gql', 'graphql']);
const OPERATION = /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/g;
/** A name GraphQL codegen gives an operation's hook or document: `useFeedQuery`, `FeedDocument`. */
const GENERATED_OPERATION =
  /^(?:use([A-Z]\w*?)(?:LazyQuery|SuspenseQuery|Query|Mutation|Subscription)|([A-Z]\w*?)(?:Document|Query))$/;
const HOOK_NAME = /^use[A-Z]/;

function walk(node: any, visit: (node: any) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== 'object' || node === null || typeof node.type !== 'string') return;
  visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (!SKIPPED_KEYS.has(key)) walk(child, visit);
  }
}

const nameOfKey = (key: any): string | undefined =>
  key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : undefined;

function keysOfPattern(pattern: any): string[] {
  if (pattern?.type !== 'ObjectPattern') return [];
  return pattern.properties.flatMap((property: any) =>
    property.type === 'ObjectProperty' && nameOfKey(property.key) ? [nameOfKey(property.key)!] : []
  );
}

function withoutExtension(file: string): string {
  return file.replace(/\.[jt]sx?$/, '').replace(/\/index$/, '');
}

export function screenFacts(params: {
  files: SourceFile[];
  tsconfig?: string;
  file: string;
}): ScreenFacts | undefined {
  const graph = screenGraph(params);
  const { parsed, resolve, components, rendersOf, wrappers, entries, labelOf, realScreenOf } =
    graph;
  if (!parsed.has(params.file)) return undefined;
  const screen = realScreenOf(params.file);
  const texts = new Map(params.files.map((file) => [file.path, file.text]));

  // The files this screen is made of: the screen, then what it draws through JSX tags, to a depth of 3.
  const scope = new Set<string>([params.file, screen]);
  let edge = [screen];
  for (let depth = 0; depth < 3; depth += 1) {
    edge = edge
      .flatMap((file) => [...(rendersOf.get(file) ?? [])])
      .filter((file) => {
        if (scope.has(file) || entries.has(file)) return false;
        scope.add(file);
        return true;
      });
  }

  const draws = [...(rendersOf.get(screen) ?? [])]
    .filter((file) => !wrappers.has(file))
    .map(labelOf);
  const data = new Map<string, Set<string>>();
  const linkParams = new Set<string>();
  const states = new Set<string>();
  const testIDs = new Set<string>();

  for (const segment of params.file.matchAll(/\[(?:\.\.\.)?(\w+)\]/g)) linkParams.add(segment[1]);

  for (const file of scope) {
    const unit = parsed.get(file);
    const text = texts.get(file) ?? '';
    if (!unit) continue;

    for (const item of unit.imports) {
      const target = resolve(file, item.source);
      if (!target) {
        if (dataLibraryOf(item.source)) data.set(item.source, data.get(item.source) ?? new Set());
      } else if (!components.has(target) && target !== file) {
        const targetParsed = parsed.get(target);
        const readsData =
          DATA_FILE.test(target) ||
          targetParsed?.imports.some((inner) => dataLibraryOf(inner.source));
        if (!readsData) continue;
        const names = data.get(withoutExtension(target)) ?? new Set<string>();
        item.names
          .filter((name) => name !== 'default' && name !== '*')
          .forEach((name) => names.add(name));
        data.set(withoutExtension(target), names);
      }
    }

    const sourceOf = (node: any): string =>
      text.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
    const addState = (node: any, hasJsxBranch: boolean) => {
      if (!hasJsxBranch) return;
      const condition = sourceOf(node);
      states.add(condition.length > 60 ? `${condition.slice(0, 57)}...` : condition);
    };

    walk(unit.ast.body, (node) => {
      switch (node.type) {
        case 'ConditionalExpression':
          addState(node.test, jsxIn(node.consequent) || jsxIn(node.alternate));
          break;
        case 'LogicalExpression':
          addState(node.left, node.operator !== '??' && jsxIn(node.right));
          break;
        case 'IfStatement':
          addState(node.test, jsxIn(node.consequent) || jsxIn(node.alternate));
          break;
        case 'SwitchCase':
          addState(node.test ?? { start: 0, end: 0 }, jsxIn(node.consequent));
          break;
        case 'JSXAttribute':
          if (node.name?.name === 'testID') {
            const value =
              node.value?.type === 'StringLiteral'
                ? node.value.value
                : node.value?.expression?.type === 'StringLiteral'
                  ? node.value.expression.value
                  : undefined;
            if (value) testIDs.add(value);
          }
          break;
        case 'VariableDeclarator': {
          const init = node.init?.type === 'TSAsExpression' ? node.init.expression : node.init;
          if (init?.type === 'CallExpression' && LINK_PARAM_HOOKS.has(init.callee?.name)) {
            keysOfPattern(node.id).forEach((key) => linkParams.add(key));
          }
          if (init?.type === 'MemberExpression' && init.property?.name === 'params') {
            keysOfPattern(node.id).forEach((key) => linkParams.add(key));
          }
          break;
        }
        case 'CallExpression': {
          const typeArgument = node.typeParameters?.params?.[0];
          if (LINK_PARAM_HOOKS.has(node.callee?.name) && typeArgument?.type === 'TSTypeLiteral') {
            for (const member of typeArgument.members) {
              const key = member.key && nameOfKey(member.key);
              if (key) linkParams.add(key);
            }
          }
          break;
        }
        case 'MemberExpression':
          if (
            node.object?.type === 'MemberExpression' &&
            node.object.property?.name === 'params' &&
            !node.computed &&
            node.property?.name
          ) {
            linkParams.add(node.property.name);
          }
          break;
      }
    });
  }

  return {
    name: routeNameOf(params.file) ?? labelOf(screen),
    file: screen,
    ...(screen !== params.file && { routeFile: params.file }),
    draws,
    data: [...data].map(([module, names]) =>
      names.size > 0 ? `${module} (${[...names].join(', ')})` : module
    ),
    queries: queriesOf(graph, scope),
    linkParams: [...linkParams],
    states: [...states].slice(0, 8),
    testIDs: [...testIDs],
  };
}

/**
 * The operations the files of a screen run, following their own non-component imports (their hooks)
 * to a depth of 3. A file imported whole is read for every GraphQL template in it; one imported only
 * for named values is read for the templates those names hold; a generated hook or document names its
 * operation where it is imported, and its file, which holds every operation of the app, is never read.
 */
function queriesOf(graph: ReturnType<typeof screenGraph>, scope: Set<string>): string[] {
  const { parsed, resolve, components } = graph;
  const queries = new Set<string>();
  const readWhole = new Set(scope);
  let reach: { file: string; only?: Set<string> }[] = [...scope].map((file) => ({ file }));
  for (let depth = 0; reach.length > 0; depth += 1) {
    const next: typeof reach = [];
    for (const { file, only } of reach) {
      const unit = parsed.get(file);
      if (!unit) continue;
      operationsIn(unit.ast.body, only).forEach((name) => queries.add(name));
      if (only) continue;
      for (const item of unit.imports) {
        if (dataLibraryOf(item.source)) continue;
        const generated = item.names.flatMap((name) => {
          const match = GENERATED_OPERATION.exec(name);
          return match ? [match[1] ?? match[2]] : [];
        });
        generated.forEach((name) => queries.add(name));
        const target = resolve(file, item.source);
        if (!target || generated.length > 0 || components.has(target) || depth >= 3) continue;
        const whole = item.names.some(
          (name) => name === 'default' || name === '*' || HOOK_NAME.test(name)
        );
        if (!whole) next.push({ file: target, only: new Set(item.names) });
        else if (!readWhole.has(target)) {
          readWhole.add(target);
          next.push({ file: target });
        }
      }
    }
    reach = next;
  }
  return [...queries];
}

/** The operation names in the `gql`/`graphql` templates of a file, or of only the named values in it. */
function operationsIn(body: unknown, only?: Set<string>): string[] {
  const names: string[] = [];
  const readTemplates = (node: unknown) =>
    walk(node, (inner) => {
      const argument = inner.type === 'CallExpression' ? inner.arguments[0] : undefined;
      const template =
        inner.type === 'TaggedTemplateExpression' && GRAPHQL_TAGS.has(inner.tag?.name)
          ? inner.quasi
          : GRAPHQL_TAGS.has(inner.callee?.name) && argument?.type === 'TemplateLiteral'
            ? argument
            : undefined;
      const text = template
        ? template.quasis.map((quasi: any) => quasi.value.cooked ?? quasi.value.raw).join(' ')
        : GRAPHQL_TAGS.has(inner.callee?.name) && argument?.type === 'StringLiteral'
          ? argument.value
          : '';
      for (const match of text.matchAll(OPERATION)) names.push(match[1]);
    });
  if (!only) readTemplates(body);
  else {
    walk(body, (node) => {
      if (node.type === 'VariableDeclarator' && only.has(node.id?.name)) readTemplates(node.init);
    });
  }
  return names;
}

function dataLibraryOf(source: string): boolean {
  return DATA_LIBRARIES.some((library) =>
    library.endsWith('/')
      ? source.startsWith(library)
      : source === library || source.startsWith(`${library}/`)
  );
}

function jsxIn(node: unknown): boolean {
  let found = false;
  walk(node, (inner) => {
    if (inner.type === 'JSXElement' || inner.type === 'JSXFragment') found = true;
  });
  return found;
}

/** The facts as the lines a person or an agent reads. */
export function factsLines(facts: ScreenFacts): string[] {
  const list = (items: string[], none: string) => (items.length > 0 ? items.join(', ') : none);
  return [
    `${facts.name}  ${facts.routeFile ?? facts.file}${
      facts.routeFile ? ` renders only ${facts.file} (the real screen)` : ''
    }`,
    `draws       ${list(facts.draws, 'no other component of the app')}`,
    `data        ${list(facts.data, 'none found')}`,
    ...(facts.queries.length > 0 ? [`queries     ${facts.queries.join(', ')}`] : []),
    `link param  ${list(facts.linkParams, 'none')}`,
    `states      ${facts.states.length > 0 ? facts.states.join(' | ') : 'none found'}`,
    `test ids    ${
      facts.testIDs.length > 0
        ? facts.testIDs.slice(0, 12).join(', ')
        : 'none (the ready view must be found by text)'
    }`,
  ];
}

export const factsFileOf = (root: string, given: string): string =>
  path.relative(root, path.resolve(root, given)).split(path.sep).join('/');
