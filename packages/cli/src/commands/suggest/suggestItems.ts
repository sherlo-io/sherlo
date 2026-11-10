/**
 * WHAT TO TEST NEXT - pure, no file system, no git: the app's source files and the git signals
 * in, a ranked list out.
 *
 * ZERO CONFIG. Every signal comes from the code or from `git log`, and every threshold is a rank
 * within this app, never a fixed number. The graph is componentGaps' (its parser, resolver and
 * barrel-following export reader); this file only adds what a plan needs on top:
 *
 *   entry     a component that draws but is never rendered as a JSX tag: nobody imports its file
 *             (Expo Router's `app/`), or it is only passed as a value (`component={X}`).
 *             An entry is a scene; any other component is a story.
 *   owned     a file only one entry reaches through JSX tags. It is part of that entry's scene,
 *             not an item of its own.
 *   wrapper   renders `{children}` and has no drawing condition: its look never changes.
 *   tested    a story file imports it, or a `*.scenes.tsx` file reaches it.
 *
 * Rules that settle what the graph alone gets wrong (the cheap misclassifications):
 *   - an expo-router `_layout` file is never a screen;
 *   - a file-based route is named by its route path (`series/[id]`, `login`);
 *   - a thin file (one app component, no drawing condition) is not the screen: the component it
 *     renders is, which also folds a `*.container.tsx` into the screen that renders it;
 *   - an entry outside the routes folder is marked `unsure` with the reason the rules cannot tell.
 */
import path from 'path';
import {
  NOT_APP_CODE,
  makeExports,
  makeResolver,
  parseFile,
  hasJsx,
  type ParsedFile,
  type SourceFile,
} from '../coverage/componentGaps';
import { isStoryFile } from '../coverage/storyPropValues';

/** What git says about one file over the window. */
export type FileHistory = {
  changes: number;
  /** Lines rewritten within 21 days of being written. */
  rework: number;
  reverts: number;
  /** Commits whose subject is a Conventional Commits `fix`. */
  fixes: number;
};

export type SuggestItem = {
  kind: 'scene' | 'story';
  /** A route file's route path (`series/[id]`), else the component's name. */
  name: string;
  /** The real screen: behind a thin route file, the one component it renders. */
  file: string;
  /** The thin route file in front of `file`, when there is one. */
  routeFile?: string;
  reason: string;
  /** `test`: a story or scene already tells it; `rule`: the rules settled it; `unsure`: they could not. */
  source: 'test' | 'rule' | 'unsure';
  /** Why the rules could not settle whether this is a screen; the agent decides. */
  unsure?: string;
  score: number;
};

export type Suggestion = {
  items: SuggestItem[];
  wrappers: number;
  tested: number;
  entries: number;
};

const SCENES_FILE = /\.scenes?\.[jt]sx?$/;
const LAYOUT_FILE = /(^|\/)_layout\.[jt]sx?$/;
const NOT_PLANNED = /(^|\/)(__mocks__|__tests__|__snapshots__)\//;

type Facts = {
  /** Local names used as a JSX tag (`<X>`, `<X.Y>`). */
  tags: Set<string>;
  /** Local names used as a value anywhere else (`component={X}`, `{ screen: X }`). */
  values: Set<string>;
  states: number;
  children: number;
};

const SKIPPED_KEYS = new Set([
  'loc',
  'extra',
  'leadingComments',
  'trailingComments',
  'typeAnnotation',
  'typeParameters',
  'returnType',
  'typeArguments',
]);

/** Walks a Babel tree once and reads what a plan needs: tags, values, drawing conditions, children. */
function readFacts(program: ParsedFile['ast']): Facts {
  const facts: Facts = { tags: new Set(), values: new Set(), states: 0, children: 0 };

  function tagRoot(name: any): string | undefined {
    if (name.type === 'JSXIdentifier') return name.name;
    if (name.type === 'JSXMemberExpression') return tagRoot(name.object);
    return undefined;
  }

  function visit(node: any, parent?: any, key?: string): void {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, key);
      return;
    }
    if (typeof node !== 'object' || node === null || typeof node.type !== 'string') return;

    switch (node.type) {
      case 'ImportDeclaration':
        return;
      case 'JSXOpeningElement': {
        const root = tagRoot(node.name);
        if (root) facts.tags.add(root);
        break;
      }
      case 'Identifier': {
        const isMemberName =
          parent?.type === 'MemberExpression' && key === 'property' && !parent.computed;
        const isKey = parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed;
        if (!isMemberName && !isKey) facts.values.add(node.name);
        break;
      }
      case 'ConditionalExpression':
        if (hasJsx(node.consequent) || hasJsx(node.alternate)) facts.states += 1;
        break;
      case 'LogicalExpression':
        if (hasJsx(node.right)) facts.states += 1;
        break;
      case 'IfStatement':
        if (hasJsx(node.consequent) || hasJsx(node.alternate)) facts.states += 1;
        break;
      case 'SwitchCase':
        if (hasJsx(node.consequent)) facts.states += 1;
        break;
      case 'JSXExpressionContainer': {
        const expression = node.expression;
        const name =
          expression.type === 'Identifier'
            ? expression.name
            : expression.type === 'MemberExpression' && !expression.computed
              ? expression.property.name
              : undefined;
        if (name === 'children') facts.children += 1;
        break;
      }
    }
    for (const [property, child] of Object.entries(node)) {
      if (!SKIPPED_KEYS.has(property)) visit(child, node, property);
    }
  }

  visit(program);
  return facts;
}

/** The route path of an expo-router route file, or nothing when the file is not one. */
export function routeNameOf(file: string): string | undefined {
  const parts = file.split('/');
  const at = parts.indexOf('app');
  if (at < 0 || at === parts.length - 1) return undefined;
  const rest = parts.slice(at + 1);
  rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[jt]sx?$/, '');
  if (rest[rest.length - 1] === '_layout') return undefined;
  const plain = rest.filter((part) => !/^\(.*\)$/.test(part));
  if (plain[plain.length - 1] === 'index') plain.pop();
  const group = [...rest].reverse().find((part) => /^\(.*\)$/.test(part));
  return plain.join('/') || group?.slice(1, -1) || 'index';
}

/** The graph of the app's component files that the ranking and the facts both read. */
export function screenGraph(params: { files: SourceFile[]; tsconfig?: string }) {
  const parsed = new Map<string, ParsedFile>();
  for (const file of params.files) {
    const result = parseFile(file);
    if (result) parsed.set(file.path, result);
  }
  const resolve = makeResolver(new Set(parsed.keys()), params.tsconfig);
  const { exported } = makeExports(parsed, resolve);
  const facts = new Map([...parsed].map(([file, value]) => [file, readFacts(value.ast)]));

  const isApp = (file: string) =>
    !isStoryFile(file) && !SCENES_FILE.test(file) && !NOT_APP_CODE.test(file);

  /** The component files: those that export something returning JSX, and are not tests. */
  const components = new Set<string>();
  for (const [file, value] of parsed) {
    if (!isApp(file) || NOT_PLANNED.test(file) || LAYOUT_FILE.test(file)) continue;
    const base = path.basename(file).replace(/\..*$/, '');
    for (const [name, own] of value.own) {
      const isHook = /^use[A-Z]/.test(own.label) || /^use[A-Z]/.test(base);
      if (own.isComponent && !isHook && (/^[A-Z]/.test(own.label) || name === 'default')) {
        components.add(file);
      }
    }
  }

  // Edges between component files, from the imports and how each local name is used.
  const rendersOf = new Map<string, Set<string>>(); // file -> component files it draws as a tag
  const passesOf = new Map<string, Set<string>>(); // file -> component files it uses as a value
  const importers = new Map<string, Set<string>>(); // component file -> every file importing it
  const storyImports = new Set<string>(); // component files a story file imports
  const lazyRouted = new Set<string>(); // component files a route map requires lazily
  const add = (map: Map<string, Set<string>>, key: string, value: string) =>
    map.set(key, (map.get(key) ?? new Set()).add(value));

  for (const [file, value] of parsed) {
    const own = facts.get(file)!;
    for (const { source, names, locals, lazy } of value.imports) {
      const target = resolve(file, source);
      if (!target) continue;
      names.forEach((name, index) => {
        for (const found of exported(target, name, new Set())) {
          if (!components.has(found.file) || found.file === file) continue;
          add(importers, found.file, file);
          if (isStoryFile(file)) storyImports.add(found.file);
          else if (lazy) {
            add(passesOf, file, found.file);
            lazyRouted.add(found.file);
          } else if (own.tags.has(locals[index])) add(rendersOf, file, found.file);
          else if (own.values.has(locals[index])) add(passesOf, file, found.file);
        }
      });
    }
  }

  const sceneFiles = [...parsed.keys()].filter((file) => SCENES_FILE.test(file));
  const rendered = new Set<string>();
  const passed = new Set<string>();
  for (const [from, targets] of rendersOf) if (isApp(from)) targets.forEach((t) => rendered.add(t));
  for (const [from, targets] of passesOf) if (isApp(from)) targets.forEach((t) => passed.add(t));

  const wrappers = new Set(
    [...components].filter((file) => {
      const own = facts.get(file)!;
      return own.children > 0 && own.states === 0;
    })
  );

  const entries = new Set(
    [...components].filter((file) => {
      if (wrappers.has(file) || rendered.has(file)) return false;
      if (passed.has(file)) return true;
      return !importers.has(file) && parsed.get(file)!.own.has('default');
    })
  );

  // Everything an entry draws through JSX tags, stopping at the next entry.
  const ownersOf = new Map<string, Set<string>>(); // file -> entries reaching it
  const closure = new Map<string, Set<string>>();
  for (const entry of entries) {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const next = queue.pop()!;
      for (const child of rendersOf.get(next) ?? []) {
        if (seen.has(child) || entries.has(child) || child === entry) continue;
        seen.add(child);
        queue.push(child);
      }
    }
    closure.set(entry, seen);
    for (const file of seen) add(ownersOf, file, entry);
  }

  // Tested: a story imports it, or a scenes file reaches it.
  const tested = new Set(storyImports);
  const queue: string[] = [];
  for (const scene of sceneFiles) {
    for (const target of [...(rendersOf.get(scene) ?? []), ...(passesOf.get(scene) ?? [])]) {
      queue.push(target);
    }
  }
  const sceneReached = new Set<string>();
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (sceneReached.has(next)) continue;
    sceneReached.add(next);
    tested.add(next);
    queue.push(...(rendersOf.get(next) ?? []));
  }

  /** The real screen behind a thin file: it follows files that draw one app component and no condition. */
  const realScreenOf = (file: string): string => {
    const seen = new Set([file]);
    let current = file;
    for (;;) {
      const next = [...(rendersOf.get(current) ?? [])].filter((target) => !wrappers.has(target));
      if (next.length !== 1 || facts.get(current)!.states > 0 || seen.has(next[0])) return current;
      current = next[0];
      seen.add(current);
    }
  };

  const labelOf = (file: string): string => {
    const own = [...parsed.get(file)!.own].filter(([, value]) => value.isComponent);
    const base = path.basename(file).replace(/\..*$/, '');
    const nameFile = base === 'index' ? path.basename(path.dirname(file)) : base;
    const pick =
      own.find(([, value]) => value.label === nameFile) ??
      own.find(([name, value]) => name === 'default' && /^[A-Z]/.test(value.label)) ??
      own.find(([, value]) => /^[A-Z]/.test(value.label));
    return pick ? pick[1].label : nameFile;
  };

  return {
    parsed,
    resolve,
    exported,
    facts,
    components,
    wrappers,
    entries,
    passed,
    lazyRouted,
    tested,
    ownersOf,
    closure,
    rendersOf,
    labelOf,
    realScreenOf,
  };
}

/**
 * The ranked suggestions for an app. `variants` maps a story-covered file to the variant it lacks.
 * `scenes`: whether scenes are on for the project's team; off, a screen is offered as a story too.
 */
export function suggestItems(params: {
  files: SourceFile[];
  tsconfig?: string;
  history: Map<string, FileHistory>;
  variants: Map<string, string>;
  scenes: boolean;
}): Suggestion {
  const graph = screenGraph(params);
  const { facts, components, wrappers, entries, passed, tested, ownersOf, closure, labelOf } =
    graph;
  const { realScreenOf, lazyRouted } = graph;

  type Draft = {
    kind: SuggestItem['kind'];
    file: string;
    history: FileHistory;
    states: number;
    reach: number;
    variant?: string;
    /** The real screen when it is not `file`. */
    screen?: string;
    routeName?: string;
    unsure?: string;
  };
  const drafts: Draft[] = [];
  let testedCount = 0;
  const none: FileHistory = { changes: 0, rework: 0, reverts: 0, fixes: 0 };
  const historyOf = (file: string) => params.history.get(file) ?? none;

  for (const file of components) {
    if (wrappers.has(file)) continue;
    if (tested.has(file)) {
      const variant = params.variants.get(file);
      if (!variant) {
        testedCount += 1;
        continue;
      }
      drafts.push({
        kind: 'story',
        file,
        history: historyOf(file),
        states: facts.get(file)!.states,
        reach: ownersOf.get(file)?.size ?? 0,
        variant,
      });
    } else if (entries.has(file)) {
      const owned = [...(closure.get(file) ?? [])].filter(
        (member) => ownersOf.get(member)?.size === 1 && !wrappers.has(member) && !tested.has(member)
      );
      const members = [file, ...owned];
      const total = { changes: 0, rework: 0, reverts: 0, fixes: 0 };
      for (const member of members) {
        const value = historyOf(member);
        total.changes += value.changes;
        total.rework += value.rework;
        total.reverts += value.reverts;
        total.fixes += value.fixes;
      }
      drafts.push({
        kind: params.scenes ? 'scene' : 'story',
        file,
        history: total,
        states: members.reduce((sum, member) => sum + facts.get(member)!.states, 0),
        reach: 0,
        screen: realScreenOf(file),
        routeName: routeNameOf(file),
        unsure:
          routeNameOf(file) || lazyRouted.has(file)
            ? undefined
            : passed.has(file)
              ? 'passed as a value: a screen, or a list part such as a header or a separator?'
              : 'no file imports it and it is not a route: a lazy screen or home-made navigation?',
      });
    } else if (ownersOf.get(file)?.size !== 1) {
      drafts.push({
        kind: 'story',
        file,
        history: historyOf(file),
        states: facts.get(file)!.states,
        reach: ownersOf.get(file)?.size ?? 0,
      });
    }
  }

  // Ranks within this app: the share of items a value beats, a tie counting half.
  function percentiles(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    return values.map((value) => {
      if (value <= 0) return 0;
      const below = sorted.filter((other) => other < value).length;
      const equal = sorted.filter((other) => other === value).length;
      return (below + equal / 2) / sorted.length;
    });
  }
  const signal = (pick: (draft: Draft) => number) => {
    const values = drafts.map(pick);
    return { values, ranks: percentiles(values), max: Math.max(0, ...values) };
  };
  const changes = signal((d) => d.history.changes);
  const rework = signal((d) => d.history.rework);
  const trouble = signal((d) => d.history.reverts + d.history.fixes);
  const states = signal((d) => d.states);
  const stories = drafts.filter((d) => d.kind === 'story');
  const storyReach = percentiles(stories.map((d) => d.reach));

  const items = drafts.map((draft, index): SuggestItem => {
    const reachRank = draft.kind === 'story' ? storyReach[stories.indexOf(draft)] : undefined;
    // The geometric mean of (1 + rank) over the signals the item has: a scene has no reach.
    const ranks = [
      changes.ranks[index],
      rework.ranks[index],
      trouble.ranks[index],
      states.ranks[index],
    ];
    if (reachRank !== undefined) ranks.push(reachRank);
    let score = Math.exp(ranks.reduce((sum, rank) => sum + Math.log(1 + rank), 0) / ranks.length);
    // A story that exists already: only a missing variant is left to do.
    if (draft.variant) score *= 0.7;

    const phrases: { text: string; strength: number }[] = [];
    if (changes.values[index] > 0 && changes.ranks[index] >= 0.8) {
      phrases.push({
        text: changes.values[index] === changes.max ? 'changed most' : 'changed often',
        strength: changes.ranks[index],
      });
    }
    if (rework.values[index] > 0 && rework.ranks[index] >= 0.8) {
      phrases.push({ text: 'rewritten often', strength: rework.ranks[index] });
    }
    const { reverts, fixes } = draft.history;
    if (reverts > 0) {
      const times = reverts === 1 ? 'once' : reverts === 2 ? 'twice' : `${reverts} times`;
      phrases.push({ text: `reverted ${times}`, strength: 0.95 });
    }
    if (fixes > 0 && trouble.ranks[index] >= 0.8) {
      phrases.push({
        text: `${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`,
        strength: trouble.ranks[index],
      });
    }
    if (draft.reach >= 3 && (reachRank ?? 0) >= 0.7) {
      phrases.push({ text: `on ${draft.reach} screens`, strength: reachRank ?? 0 });
    }
    if (draft.states >= 5 && states.ranks[index] >= 0.7) {
      phrases.push({ text: `${draft.states} states`, strength: states.ranks[index] });
    }
    phrases.sort((a, b) => b.strength - a.strength);
    let reason = phrases
      .slice(0, 2)
      .map((phrase) => phrase.text)
      .join(', ');
    if (!reason) {
      reason =
        draft.history.changes > 0
          ? `changed ${draft.history.changes} times`
          : draft.states > 0
            ? `${draft.states} states`
            : 'no history yet';
    }
    if (draft.variant) reason = `add variant: ${draft.variant}`;
    const screen = draft.screen ?? draft.file;
    return {
      kind: draft.kind,
      name: draft.routeName ?? labelOf(screen),
      file: screen,
      ...(screen !== draft.file && { routeFile: draft.file }),
      reason,
      source: draft.unsure ? 'unsure' : draft.variant ? 'test' : 'rule',
      ...(draft.unsure && { unsure: draft.unsure }),
      score,
    };
  });

  items.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return { items, wrappers: wrappers.size, tested: testedCount, entries: entries.size };
}

/**
 * The first `count` items, holding at least one of each kind the list has: a kind missing from the
 * top takes the last place with its best item, so the next step can always be one of each.
 */
export function topOfEachKind(items: SuggestItem[], count: number): SuggestItem[] {
  const shown = items.slice(0, count);
  for (const kind of ['scene', 'story'] as const) {
    if (shown.length === 0 || shown.some((item) => item.kind === kind)) continue;
    const best = items.find((item) => item.kind === kind);
    if (!best) continue;
    const otherKind = kind === 'scene' ? 'story' : 'scene';
    const last = shown.map((item) => item.kind).lastIndexOf(otherKind);
    shown.splice(last, 1);
    shown.push(best);
  }
  return shown;
}
