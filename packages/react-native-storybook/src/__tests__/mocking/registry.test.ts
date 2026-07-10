import { activateMocks, clearMocks, resolveMockExports } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

describe('registry', () => {
  it('returns undefined for every key when no mock set is active', () => {
    expect(resolveMockExports('pkg/a', {})).toBeUndefined();
  });

  it('returns undefined for keys not present in the active mock set', () => {
    activateMocks({ 'pkg/a': { value: 1 } });

    expect(resolveMockExports('pkg/b', {})).toBeUndefined();
  });

  it('resolves each mocked key independently within one activation', () => {
    activateMocks({
      'pkg/a': { value: 'a' },
      'pkg/b': { value: 'b' },
    });

    expect(resolveMockExports('pkg/a', {})).toEqual({ value: 'a' });
    expect(resolveMockExports('pkg/b', {})).toEqual({ value: 'b' });
  });

  it('swaps the active mock set atomically - the previous set is fully gone after re-activation', () => {
    activateMocks({ 'pkg/a': { value: 'first' } });
    activateMocks({ 'pkg/b': { value: 'second' } });

    expect(resolveMockExports('pkg/a', {})).toBeUndefined();
    expect(resolveMockExports('pkg/b', {})).toEqual({ value: 'second' });
  });

  it('clearMocks removes the active set entirely', () => {
    activateMocks({ 'pkg/a': { value: 'a' } });
    clearMocks();

    expect(resolveMockExports('pkg/a', {})).toBeUndefined();
  });
});
