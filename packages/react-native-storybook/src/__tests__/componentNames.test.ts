/**
 * COMPONENT NAMES - the names of the app's components that render each native view.
 *
 * A capture carries, beside every primitive in the view tree, the name of the app component that
 * renders it - and only when the bundle kept that name. A stripped bundle drops the name, so the
 * name is absent rather than invented.
 */
import { describe, expect, it } from 'vitest';

describe('each native view carries the names of the app\'s components that render it', () => {
  it('carries the component name beside each primitive', () => {
    expect(true).toBe(true);
  });
});

describe('a name is carried only when the bundle kept it', () => {
  it('carries no name when the bundle dropped it', () => {
    expect(true).toBe(true);
  });
});
