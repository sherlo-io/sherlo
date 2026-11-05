import { mergeStoryMocks } from '../../mocking/mergeMocks';
import { MockDeclaration, resolveDeclarations } from '../../mocking/mockDeclaration';

describe('mergeStoryMocks - per-module-key precedence (CP-01..CP-05, CP-07)', () => {
  it('CP-01: global mocks apply everywhere', () => {
    const merged = mergeStoryMocks({ 'pkg/a': { value: 'global' } }, {}, {});

    expect(merged).toEqual({ 'pkg/a': { value: 'global' } });
  });

  it('CP-02: meta mocks apply to the file', () => {
    const merged = mergeStoryMocks({}, { 'pkg/a': { value: 'meta' } }, {});

    expect(merged).toEqual({ 'pkg/a': { value: 'meta' } });
  });

  it('CP-03: story overrides meta for the same key', () => {
    const merged = mergeStoryMocks(
      {},
      { 'pkg/a': { value: 'meta', extra: 'only-on-meta' } },
      { 'pkg/a': { value: 'story' } }
    );

    // The two fakes of 'pkg/a' merge part by part: the story wins 'value', and 'extra', which
    // only meta names, stays.
    expect(merged).toEqual({ 'pkg/a': { value: 'story', extra: 'only-on-meta' } });
  });

  it('CP-04: story overrides global while untouched global keys still apply', () => {
    const merged = mergeStoryMocks(
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
    const merged = mergeStoryMocks(
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
    const merged = mergeStoryMocks(
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

  // Title kept: the sherlo book's mocking/index.md cites it (its words say "wholesale", which the
  // merge no longer is - the page and this title are to be renamed together).
  it('meta overrides global for the same key wholesale', () => {
    const merged = mergeStoryMocks(
      { 'pkg/a': { value: 'global', extra: 'only-on-global' } },
      { 'pkg/a': { value: 'meta' } },
      {}
    );

    // meta wins 'value'; 'extra', which only global names, stays.
    expect(merged).toEqual({ 'pkg/a': { value: 'meta', extra: 'only-on-global' } });
  });

  it('untouched keys from every level all survive in the merged set', () => {
    const merged = mergeStoryMocks(
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
    const merged = mergeStoryMocks(
      { 'pkg/a': { value: 'global' } },
      { 'pkg/a': { value: 'meta' } },
      { 'pkg/a': { value: 'story' } }
    );

    expect(merged).toEqual({ 'pkg/a': { value: 'story' } });
  });

  it('two fakes of one module merge part by part, the later part winning', async () => {
    const metaGet = () => 'meta get';
    const storyGet = () => 'story get';
    const merged = mergeStoryMocks(
      { 'pkg/a': { client: { users: { list: () => 'global list' }, version: 1 }, kept: 1 } },
      { 'pkg/a': { client: { users: { get: metaGet, list: () => 'meta list' } } } },
      { 'pkg/a': { client: { users: { get: storyGet } } } }
    ) as Record<string, any>;

    expect(merged['pkg/a'].client.users.get).toBe(storyGet);
    expect(merged['pkg/a'].client.users.list()).toBe('meta list');
    expect(merged['pkg/a'].client.version).toBe(1);
    expect(merged['pkg/a'].kept).toBe(1);

    // The list form names its modules only once its imports resolve; it merges the same way.
    const declare = (definition: Record<string, unknown>) => ({
      kind: 'module' as const,
      moduleKey: () => Promise.resolve('pkg/a'),
      definition,
    });
    const resolved = (await resolveDeclarations(
      mergeStoryMocks(
        [declare({ client: { a: 'global', b: 'global' } })],
        [],
        [declare({ client: { b: 'story' } })]
      ) as MockDeclaration[]
    )) as Record<string, any>;
    expect(resolved['pkg/a']).toEqual({ client: { a: 'global', b: 'story' } });
  });

  it('a factory fake is the later fake whole', () => {
    const factory = () => ({ value: 'factory' });
    const merged = mergeStoryMocks(
      { 'pkg/a': { value: 'global', extra: 1 } },
      {},
      { 'pkg/a': factory }
    );

    expect(merged['pkg/a' as never]).toBe(factory);
  });

  it('defaults every level to an empty set, returning {} when nothing is declared', () => {
    expect(mergeStoryMocks()).toEqual({});
  });
});
