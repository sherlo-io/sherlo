/**
 * Minimal react stub for Vitest, mirroring the react-native stub in this
 * directory. react is a peerDependency of this package (resolved by the
 * consuming app at runtime) and is not installed in this workspace, so
 * component-level tests need an alias providing just enough of the React API
 * to construct class components, run hooks once, and build plain element
 * objects - without a real renderer.
 */

export class Component<P = unknown, S = unknown> {
  props: P;
  state: S;
  context: unknown;

  constructor(props: P) {
    this.props = props;
    this.state = {} as S;
  }

  setState(partial: Partial<S> | ((state: S) => Partial<S>)): void {
    const next =
      typeof partial === 'function' ? (partial as (state: S) => Partial<S>)(this.state) : partial;
    this.state = { ...this.state, ...next };
  }

  forceUpdate(): void {}
}

export function createElement(type: unknown, props: unknown, ...children: unknown[]): unknown {
  return {
    type,
    props: { ...(props as object), children },
    key: (props as { key?: unknown })?.key ?? null,
  };
}

export function useEffect(effect: () => void | (() => void)): void {
  effect();
}

export function useState<S>(initial: S): [S, (value: S) => void] {
  let value = initial;
  const setValue = (next: S) => {
    value = next;
  };
  return [value, setValue];
}

export const Fragment = Symbol.for('sherlo-test.react.Fragment');

const React = { Component, createElement, useEffect, useState, Fragment };
export default React;
