import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

describe('createMockable - factory mocks (FA-01..05)', () => {
  it('FA-01: spreads the original module and overrides one export', () => {
    const realModule = { query: () => 'real-query', mutate: () => 'real-mutate' };
    const mockable = createMockable('pkg/fa-spread', realModule);

    activateMocks({
      'pkg/fa-spread': (original: typeof realModule) => ({
        ...original,
        query: () => 'mock-query',
      }),
    });

    expect(mockable.query()).toBe('mock-query');
    expect(mockable.mutate()).toBe('real-mutate');
  });

  it('FA-02: conditionally delegates to the original implementation', () => {
    const realModule = { fetch: (id: string) => `real-${id}` };
    const mockable = createMockable('pkg/fa-conditional', realModule);

    activateMocks({
      'pkg/fa-conditional': (original: typeof realModule) => ({
        fetch: (id: string) => (id === 'special' ? 'mock-special' : original.fetch(id)),
      }),
    });

    expect(mockable.fetch('special')).toBe('mock-special');
    expect(mockable.fetch('other')).toBe('real-other');
  });

  it('FA-03: overrides multiple exports including default', () => {
    const realModule = {
      default: { real: true },
      API_URL: 'https://real.api',
      client: { query: () => 'real-client-query' },
    };
    const mockable = createMockable('pkg/fa-multiple', realModule);

    activateMocks({
      'pkg/fa-multiple': (original: typeof realModule) => ({
        ...original,
        default: { mocked: true },
        API_URL: 'http://localhost:3000',
      }),
    });

    expect(mockable.default).toEqual({ mocked: true });
    expect(mockable.API_URL).toBe('http://localhost:3000');
    expect(mockable.client.query()).toBe('real-client-query');
  });

  it('FA-04: is invoked exactly once per activation regardless of how many properties are read', () => {
    const factory = vi.fn((original: { value: string }) => ({ value: `mocked-${original.value}` }));
    const realModule = { value: 'real' };
    const mockable = createMockable('pkg/fa-once', realModule);

    activateMocks({ 'pkg/fa-once': factory });

    expect(mockable.value).toBe('mocked-real');
    expect(mockable.value).toBe('mocked-real');
    expect('value' in mockable).toBe(true);
    expect(Object.keys(mockable)).toContain('value');

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('FA-05: is re-invoked fresh on the next activation of the same story', () => {
    const factory = vi.fn((original: { count: number }) => ({ count: original.count + 1 }));
    const realModule = { count: 0 };
    const mockable = createMockable('pkg/fa-fresh', realModule);

    activateMocks({ 'pkg/fa-fresh': factory });
    expect(mockable.count).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);

    clearMocks();
    activateMocks({ 'pkg/fa-fresh': factory });
    expect(mockable.count).toBe(1);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('createMockable - factory errors (FG-05)', () => {
  it('surfaces a thrown error instead of silently falling back to the real module', () => {
    const realModule = { value: 'real' };
    const mockable = createMockable('pkg/fg-throw', realModule);

    activateMocks({
      'pkg/fg-throw': () => {
        throw new Error('factory exploded');
      },
    });

    expect(() => mockable.value).toThrow('factory exploded');
  });
});
