/**
 * THE PROPS THE STORY'S COMPONENTS WERE DRAWN WITH, read from the story's fiber (./componentNames).
 *
 * SPIKE (sherlo-coverage / drawn-props). The capture answer is built by the sealed core; this reads
 * the tree beside it and adds one field, `drawnProps`, as the answer crosses the public wrapper in
 * ./captureTransport. Nothing here touches the core.
 *
 * Which file a component comes from: React keeps no definition site on a fiber in production, and
 * in React 19 not even in development (`_debugSource` is gone; `_debugStack` points at the caller).
 * The bundle does know: Metro's development `require.getModules()` lists every module with its
 * `verboseName` (a path) and its exports, so a component is joined to a file by function identity.
 */
import type { WalkedFiber } from './sealedCore/seam';
import { storyOfTheAppFiber } from './componentNames';

export type DrawnPropValue = string | number | boolean | null | 'present';

export type DrawnComponent = {
  /** displayName or name of the component function/class. */
  component: string;
  /** Best source file (as Metro names the module), or absent when no module exports it. */
  file?: string;
  /** Every module that exports this very component (a barrel file shows up here too). */
  files?: string[];
  /** True when the component lives under node_modules. */
  library?: boolean;
  props: Record<string, DrawnPropValue>;
};

/** What a Metro module record looks like in development (metro-runtime require.js). */
export type MetroModuleLike = {
  isInitialized?: boolean;
  verboseName?: string;
  publicModule?: { exports?: unknown };
};

const MOST_COMPONENTS = 2000;
const LONGEST_STRING = 80;

// React fiber tags
const FUNCTION_COMPONENT = 0;
const CLASS_COMPONENT = 1;
const FORWARD_REF = 11;
const MEMO = 14;
const SIMPLE_MEMO = 15;

type Fiber = WalkedFiber & { alternate?: Fiber | null };

/** The component function behind a fiber, or nothing for a host, fragment, context and so on. */
function componentOf(fiber: Fiber): Function | undefined {
  const tag = fiber.tag;
  if (tag === FUNCTION_COMPONENT || tag === CLASS_COMPONENT || tag === SIMPLE_MEMO) {
    return typeof fiber.type === 'function' ? fiber.type : undefined;
  }
  if (tag === FORWARD_REF) return fiber.type?.render ?? undefined;
  if (tag === MEMO) return fiber.type?.type ?? undefined;
  return undefined;
}

function nameOf(fiber: Fiber, component: Function): string {
  return (
    fiber.type?.displayName ||
    (component as any).displayName ||
    component.name ||
    (fiber.tag === FORWARD_REF ? 'ForwardRef' : 'Anonymous')
  );
}

function primitiveOf(value: unknown): DrawnPropValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string') {
    return value.length > LONGEST_STRING ? value.slice(0, LONGEST_STRING) + '...' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'undefined') return undefined;
  return 'present';
}

function propsOf(memoizedProps: unknown): Record<string, DrawnPropValue> {
  const out: Record<string, DrawnPropValue> = {};
  if (!memoizedProps || typeof memoizedProps !== 'object') return out;
  for (const key of Object.keys(memoizedProps)) {
    const value = primitiveOf((memoizedProps as Record<string, unknown>)[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Component function -> every module path that exports it, from Metro's development module map. */
export function filesByComponent(modules: unknown): Map<unknown, string[]> {
  const files = new Map<unknown, string[]>();
  const records: MetroModuleLike[] =
    modules instanceof Map
      ? Array.from(modules.values())
      : modules && typeof modules === 'object'
        ? Object.values(modules as object)
        : [];

  for (const record of records) {
    if (!record || !record.isInitialized || typeof record.verboseName !== 'string') continue;
    const exported = record.publicModule?.exports as any;
    if (!exported || (typeof exported !== 'object' && typeof exported !== 'function')) continue;

    const candidates: unknown[] = [exported];
    try {
      for (const key of Object.keys(exported)) candidates.push(exported[key]);
    } catch {
      // A getter that throws is a module we cannot read; skip the rest of it.
    }

    for (const candidate of candidates) {
      const target =
        typeof candidate === 'function'
          ? candidate
          : ((candidate as any)?.render ?? (candidate as any)?.type);
      if (typeof target !== 'function') continue;
      for (const key of candidate === target ? [target] : [target, candidate]) {
        const list = files.get(key) ?? [];
        if (!list.includes(record.verboseName)) list.push(record.verboseName);
        files.set(key, list);
      }
    }
  }
  return files;
}

/** Prefer the file named like the component, then any file that is not an index barrel. */
function bestFile(name: string, list: string[]): string {
  const stem = (path: string) => path.replace(/\.[a-z]+$/i, '').split('/').pop();
  const named = list.find((path) => stem(path) === name);
  if (named) return named;
  const notBarrel = list.find((path) => stem(path) !== 'index');
  return notBarrel ?? list[0];
}

/**
 * The fiber of the story as the screen has it now. The one the story keeps may be the other of a
 * fiber and its alternate; the root's `current` tree knows which, so find this one in it.
 */
function currentFiber(fiber: Fiber): Fiber {
  let top: Fiber = fiber;
  for (let up = top.return as Fiber | null | undefined; up; up = top.return as Fiber | null | undefined) {
    top = up;
  }
  const rootCurrent = (top.stateNode as any)?.current as Fiber | undefined;
  if (!rootCurrent) return fiber;

  const stack: Fiber[] = [rootCurrent];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (node === fiber || node === fiber.alternate) return node;
    for (let child = node.child as Fiber | null | undefined; child; child = child.sibling as any) {
      stack.push(child);
    }
  }
  return fiber;
}

/**
 * Every component under the story, in document order, with the props it was drawn with. `modules`
 * is Metro's `require.getModules()` (development only); without it components carry no file.
 */
export function readDrawnProps(fiber: WalkedFiber | undefined, modules?: unknown): DrawnComponent[] {
  if (!fiber) return [];
  const files = modules ? filesByComponent(modules) : new Map<unknown, string[]>();
  const drawn: DrawnComponent[] = [];

  const stack: Fiber[] = [currentFiber(fiber as Fiber)];
  for (let node = stack.pop(); node && drawn.length < MOST_COMPONENTS; node = stack.pop()) {
    const component = componentOf(node);
    if (component) {
      const name = nameOf(node, component);
      const list = files.get(component) ?? files.get(node.type);
      const entry: DrawnComponent = { component: name, props: propsOf(node.memoizedProps) };
      if (list && list.length > 0) {
        entry.file = bestFile(name, list);
        entry.files = list;
        if (list.every((path) => path.includes('node_modules'))) entry.library = true;
      }
      drawn.push(entry);
    }
    const children: Fiber[] = [];
    for (let child = node.child as Fiber | null | undefined; child; child = child.sibling as any) {
      children.push(child);
    }
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return drawn;
}

/** Metro's module map in development, or nothing in a release bundle. */
function metroModules(): unknown {
  try {
    const requirer = (globalThis as any).__r;
    return typeof requirer?.getModules === 'function' ? requirer.getModules() : undefined;
  } catch {
    return undefined;
  }
}

/** The story's drawn props for the answer being handed over, or nothing. Never throws. */
export function drawnPropsOfTheStory(): DrawnComponent[] | undefined {
  try {
    const fiber = storyOfTheAppFiber();
    if (!fiber) return undefined;
    return readDrawnProps(fiber as WalkedFiber, metroModules());
  } catch {
    return undefined;
  }
}
