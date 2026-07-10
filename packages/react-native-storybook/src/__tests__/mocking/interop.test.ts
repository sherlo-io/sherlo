import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

describe('createMockable - ESM/CJS interop (VT-14..16)', () => {
  it('VT-14: mirrors __esModule and default for a default-object module', () => {
    const realModule = { __esModule: true, default: { real: true } };
    const mockable = createMockable('pkg/default-object', realModule);

    activateMocks({ 'pkg/default-object': { default: { mocked: true } } });

    expect(mockable.__esModule).toBe(true);
    expect(mockable.default).toEqual({ mocked: true });
  });

  it('VT-15: mirrors __esModule and default for a default-function module', () => {
    const RealFn = () => 'real';
    const MockFn = () => 'mock';
    const realModule = { __esModule: true, default: RealFn };
    const mockable = createMockable('pkg/default-function', realModule);

    activateMocks({ 'pkg/default-function': { default: MockFn } });

    expect(mockable.__esModule).toBe(true);
    expect(mockable.default).toBe(MockFn);
    expect(mockable.default()).toBe('mock');
  });

  it('VT-16: mixed default + named exports mock independently per export', () => {
    const realModule = {
      __esModule: true,
      default: { real: true },
      namedHelper: () => 'real-named',
    };
    const mockable = createMockable('pkg/mixed', realModule);

    activateMocks({
      'pkg/mixed': {
        default: { mocked: true },
        // namedHelper intentionally left unmocked - should fall through to real (CP-06).
      },
    });

    expect(mockable.default).toEqual({ mocked: true });
    expect(mockable.namedHelper()).toBe('real-named');
    expect(mockable.__esModule).toBe(true);
  });

  it('mirrors a CJS module with no __esModule flag unchanged when unmocked', () => {
    const realModule = { helper: () => 'real' };
    const mockable = createMockable('pkg/cjs', realModule);

    expect(mockable.__esModule).toBeUndefined();
    expect('__esModule' in mockable).toBe(false);
  });
});
