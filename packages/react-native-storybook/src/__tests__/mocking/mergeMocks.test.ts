import { mergeMockSet } from '../../mocking/mergeMocks';

describe('mergeMockSet - per-module-key precedence (CP-01..CP-05, CP-07)', () => {
  it('CP-01: global mocks apply everywhere', () => {
    const merged = mergeMockSet({ 'pkg/a': { value: 'global' } }, {}, {});

    expect(merged).toEqual({ 'pkg/a': { value: 'global' } });
  });

  it('CP-02: meta mocks apply to the file', () => {
    const merged = mergeMockSet({}, { 'pkg/a': { value: 'meta' } }, {});

    expect(merged).toEqual({ 'pkg/a': { value: 'meta' } });
  });

  it('CP-03: story overrides meta for the same key', () => {
    const merged = mergeMockSet(
      {},
      { 'pkg/a': { value: 'meta', extra: 'only-on-meta' } },
      { 'pkg/a': { value: 'story' } }
    );

    // story's definition for 'pkg/a' replaces meta's ENTIRELY - it does not merge
    // fields within the definition, so 'extra' from meta is gone too.
    expect(merged).toEqual({ 'pkg/a': { value: 'story' } });
  });

  it('CP-04: story overrides global while untouched global keys still apply', () => {
    const merged = mergeMockSet(
      { 'pkg/a': { value: 'global' }, 'pkg/b': { value: 'global - untouched' } },
      {},
      { 'pkg/a': { value: 'story' } }
    );

    expect(merged).toEqual({
      'pkg/a': { value: 'story' },
      'pkg/b': { value: 'global - untouched' },
    });
  });

  it('CP-05: story adds a module alongside inherited ones', () => {
    const merged = mergeMockSet(
      { 'pkg/a': { value: 'global' }, 'pkg/shared-global': { value: 'global-shared' } },
      { 'pkg/b': { value: 'meta' } },
      { 'pkg/c': { value: 'story-new' } }
    );

    // 'pkg/c' is a new story-only key that coexists with keys inherited from
    // global and meta - it doesn't replace or remove them.
    expect(merged).toEqual({
      'pkg/a': { value: 'global' },
      'pkg/shared-global': { value: 'global-shared' },
      'pkg/b': { value: 'meta' },
      'pkg/c': { value: 'story-new' },
    });
  });

  it('CP-07: story with no own mocks inherits global', () => {
    const merged = mergeMockSet(
      { 'pkg/a': { value: 'global' } },
      { 'pkg/b': { value: 'meta - unrelated key' } },
      {}
    );

    // The story declares no mocks of its own, so 'pkg/a' passes through from
    // global untouched.
    expect(merged).toEqual({
      'pkg/a': { value: 'global' },
      'pkg/b': { value: 'meta - unrelated key' },
    });
  });

  it('meta overrides global for the same key wholesale', () => {
    const merged = mergeMockSet(
      { 'pkg/a': { value: 'global', extra: 'only-on-global' } },
      { 'pkg/a': { value: 'meta' } },
      {}
    );

    // meta's definition for 'pkg/a' replaces global's ENTIRELY - it does not merge
    // fields within the definition, so 'extra' from global is gone too.
    expect(merged).toEqual({ 'pkg/a': { value: 'meta' } });
  });

  it('untouched keys from every level all survive in the merged set', () => {
    const merged = mergeMockSet(
      { 'pkg/global-only': { value: 'global' } },
      { 'pkg/meta-only': { value: 'meta' } },
      { 'pkg/story-only': { value: 'story' } }
    );

    expect(merged).toEqual({
      'pkg/global-only': { value: 'global' },
      'pkg/meta-only': { value: 'meta' },
      'pkg/story-only': { value: 'story' },
    });
  });

  it('story wins even when all three levels declare the same key', () => {
    const merged = mergeMockSet(
      { 'pkg/a': { value: 'global' } },
      { 'pkg/a': { value: 'meta' } },
      { 'pkg/a': { value: 'story' } }
    );

    expect(merged).toEqual({ 'pkg/a': { value: 'story' } });
  });

  it('defaults every level to an empty set, returning {} when nothing is declared', () => {
    expect(mergeMockSet()).toEqual({});
  });
});
