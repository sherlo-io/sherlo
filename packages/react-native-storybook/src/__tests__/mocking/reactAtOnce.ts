/**
 * React for the mocking tests, which have none installed beside the package: rendering is calling
 * each component at once with its props, and the two hooks Sherlo's decorator uses keep their
 * state per component, the way React keeps it for a component that stays mounted. A state change
 * calls that component again with its last props, and an effect runs after the call that changed
 * its dependencies, so a story held for its mocks renders when the hold ends.
 *
 * A test mocks React with it: vi.mock('react', async () => (await import('./reactAtOnce')).reactModule),
 * and likewise 'react/jsx-runtime' and 'react/jsx-dev-runtime' with `jsxRuntimeModule`.
 */
type Component = (props: Record<string, unknown>) => unknown;

type Instance = {
  props: Record<string, unknown>;
  slots: unknown[];
  effectDependencies: (unknown[] | undefined)[];
  effectCleanups: (void | (() => void))[];
  queuedEffects: (() => void)[];
  cursor: number;
};

const instances = new Map<Component, Instance>();
let rendering: Instance | null = null;

/** Forget every component's state: the next test starts with nothing mounted. */
export function unmountEverything(): void {
  instances.clear();
  rendering = null;
}

function callComponent(type: Component, props: Record<string, unknown>): unknown {
  const instance = instances.get(type) ?? {
    props,
    slots: [],
    effectDependencies: [],
    effectCleanups: [],
    queuedEffects: [],
    cursor: 0,
  };
  instances.set(type, instance);
  instance.props = props;
  instance.cursor = 0;

  const outer = rendering;
  rendering = instance;
  const output = type(props);
  rendering = outer;

  const effects = instance.queuedEffects;
  instance.queuedEffects = [];
  effects.forEach((effect) => effect());
  return output;
}

export function renderAtOnce(type: unknown, props: Record<string, unknown>): unknown {
  return typeof type === 'function' ? callComponent(type as Component, props) : null;
}

function useState<Value>(initial: Value): [Value, (next: Value) => void] {
  const instance = rendering!;
  const slot = instance.cursor++;
  if (!(slot in instance.slots)) instance.slots[slot] = initial;
  const type = [...instances.entries()].find(([, found]) => found === instance)![0];
  const setValue = (next: Value) => {
    instance.slots[slot] = next;
    callComponent(type, instance.props);
  };
  return [instance.slots[slot] as Value, setValue];
}

function useEffect(effect: () => void | (() => void), dependencies?: unknown[]): void {
  const instance = rendering!;
  const slot = instance.cursor++;
  const before = instance.effectDependencies[slot];
  const unchanged =
    before !== undefined &&
    dependencies !== undefined &&
    before.length === dependencies.length &&
    before.every((value, index) => Object.is(value, dependencies[index]));
  if (unchanged) return;

  instance.effectDependencies[slot] = dependencies;
  instance.queuedEffects.push(() => {
    const cleanup = instance.effectCleanups[slot];
    if (typeof cleanup === 'function') cleanup();
    instance.effectCleanups[slot] = effect();
  });
}

const Fragment = Symbol('Fragment');

export const reactModule = {
  default: { useState, useEffect, Fragment },
  useState,
  useEffect,
  Fragment,
};

export const jsxRuntimeModule = {
  jsx: renderAtOnce,
  jsxs: renderAtOnce,
  jsxDEV: renderAtOnce,
  Fragment,
};

/** Let every promise already on its way settle, and the renders that follow them run. */
export function letPendingWorkSettle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
