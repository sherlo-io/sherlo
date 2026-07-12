// 'testing' so the SHERLO-1765 B2 activation mode guard lets activateMocks install.
vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

// SHERLO-1765 B1: modules whose CJS export is itself a function (`module.exports = fn`,
// axios-style) must stay callable AND constructable through the shim - both when a mock is
// active and when mocks are dormant. Before the apply/construct traps existed, the Proxy over
// a plain object was non-callable, so any such module shipped a latent TypeError into the
// client's production bundle.
describe('createMockable - callable-export modules (B1)', () => {
  it('stays callable when mocks are dormant, falling through to the real function', () => {
    // module.exports = function () { ... }
    const realFn = Object.assign((a: number, b: number) => a + b, { flavor: 'real' });
    const mockable = createMockable('pkg/callable-dormant', realFn as never) as typeof realFn;

    // Callable with no active mock -> the real function runs.
    expect(mockable(2, 3)).toBe(5);
    // Own properties on the function still read through the get trap.
    expect(mockable.flavor).toBe('real');
  });

  it('routes calls to the mock when the active mock resolves to a callable', () => {
    const realFn = (a: number, b: number) => a + b;
    const mockable = createMockable('pkg/callable-mocked', realFn as never) as typeof realFn;

    // A top-level function mock is a FACTORY (resolveMockExports calls it with the real
    // module), so a callable replacement is supplied as a factory that RETURNS the callable.
    activateMocks({ 'pkg/callable-mocked': (() => (a: number, b: number) => a * b) as never });

    // The mock function replaces the call.
    expect(mockable(2, 3)).toBe(6);

    clearMocks();
    // Back to the real function once cleared.
    expect(mockable(2, 3)).toBe(5);
  });

  it('falls through to the real function when the active mock is a non-callable object', () => {
    const realFn = Object.assign((a: number, b: number) => a + b, { extra: () => 'real-extra' });
    const mockable = createMockable('pkg/callable-objmock', realFn as never) as typeof realFn;

    // Mock replaces one property but is not itself callable -> calls fall through to real,
    // mirroring the per-property fall-through of the get/has traps.
    activateMocks({ 'pkg/callable-objmock': { extra: () => 'mock-extra' } as never });

    expect(mockable(4, 5)).toBe(9); // call falls through to the real function
    expect((mockable as { extra: () => string }).extra()).toBe('mock-extra'); // property is mocked
  });

  it('stays constructable when dormant - `new shim()` builds a real instance', () => {
    class Real {
      tag = 'real';
      constructor(public value: number) {}
    }
    const Mockable = createMockable('pkg/ctor-dormant', Real as never) as typeof Real;

    const instance = new Mockable(7);
    expect(instance.value).toBe(7);
    expect(instance.tag).toBe('real');
    expect(instance).toBeInstanceOf(Real);
  });

  it('routes construction to the mock when the active mock resolves to a constructor', () => {
    class Real {
      kind = 'real';
    }
    class Mock {
      kind = 'mock';
    }
    const Mockable = createMockable('pkg/ctor-mocked', Real as never) as typeof Real;

    // Factory returning the replacement constructor (a bare class would be read as a factory
    // and invoked without `new`, throwing) - this is how a callable/class export is mocked.
    activateMocks({ 'pkg/ctor-mocked': (() => Mock) as never });

    const instance = new Mockable();
    expect((instance as { kind: string }).kind).toBe('mock');
  });
});
