// 'testing' so the SHERLO-1765 B2 activation mode guard lets activateMocks install.
vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';
import { IMPORTED_CONSTANT, ImportedHelper, otherModuleReal } from './fixtures';

afterEach(() => {
  clearMocks();
});

describe('createMockable - mocks referencing local/lexical state (LJ-01..06)', () => {
  it('LJ-01: closes over a local variable', () => {
    const localGreeting = 'hello from closure';
    const realModule = { greet: () => 'real' };
    const mockable = createMockable('pkg/lj-closure', realModule);

    activateMocks({ 'pkg/lj-closure': { greet: () => localGreeting } });

    expect(mockable.greet()).toBe('hello from closure');
  });

  it('LJ-02: references an imported constant', () => {
    const realModule = { label: 'real' };
    const mockable = createMockable('pkg/lj-imported-constant', realModule);

    activateMocks({ 'pkg/lj-imported-constant': { label: IMPORTED_CONSTANT } });

    expect(mockable.label).toBe('imported-constant-value');
  });

  it('LJ-03: uses an imported helper class', () => {
    const realModule = { format: (value: string) => `real:${value}` };
    const mockable = createMockable('pkg/lj-imported-class', realModule);

    activateMocks({
      'pkg/lj-imported-class': { format: (value: string) => new ImportedHelper().format(value) },
    });

    expect(mockable.format('x')).toBe('formatted:x');
  });

  it('LJ-04: shares mutable state between two mocked exports of the same module', () => {
    let counter = 0;
    const realModule = { increment: () => 0, getCount: () => 0 };
    const mockable = createMockable('pkg/lj-shared-state', realModule);

    activateMocks({
      'pkg/lj-shared-state': {
        increment: () => (counter += 1),
        getCount: () => counter,
      },
    });

    mockable.increment();
    mockable.increment();
    expect(mockable.getCount()).toBe(2);
  });

  it('LJ-05: uses a local data-builder helper to construct the mock value', () => {
    function buildUser(name: string) {
      return { id: 1, name, role: 'mock' };
    }
    const realModule = { getUser: () => ({ id: 0, name: 'real', role: 'real' }) };
    const mockable = createMockable('pkg/lj-data-builder', realModule);

    activateMocks({ 'pkg/lj-data-builder': { getUser: () => buildUser('Ada') } });

    expect(mockable.getUser()).toEqual({ id: 1, name: 'Ada', role: 'mock' });
  });

  it("LJ-06: mock references another module's real export", () => {
    const realModule = { getRegion: () => 'eu-west' };
    const mockable = createMockable('pkg/lj-other-real', realModule);

    activateMocks({ 'pkg/lj-other-real': { getRegion: () => otherModuleReal.getRegion() } });

    expect(mockable.getRegion()).toBe('us-east');
  });
});
