// 'testing' so the SHERLO-1765 B2 activation mode guard lets activateMocks install.
vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

class RealProcessor {
  process(data: string) {
    return `real: ${data}`;
  }
}

describe('createMockable - class mocks (VT-11..13)', () => {
  it('VT-11: a mocked class keeps working instance methods with `new`', () => {
    class MockProcessor {
      process(data: string) {
        return `mock: ${data}`;
      }
    }
    const mockable = createMockable('pkg/class-instance', { Processor: RealProcessor });

    activateMocks({ 'pkg/class-instance': { Processor: MockProcessor } });

    const instance = new mockable.Processor();
    expect(instance).toBeInstanceOf(MockProcessor);
    expect(instance.process('x')).toBe('mock: x');
  });

  it('VT-12: a mocked class keeps its static methods and properties', () => {
    class MockProcessor {
      static VERSION = 'mock-v1';
      static describe() {
        return 'mock-processor';
      }
    }
    const mockable = createMockable('pkg/class-static', { Processor: RealProcessor });

    activateMocks({ 'pkg/class-static': { Processor: MockProcessor } });

    expect(mockable.Processor.VERSION).toBe('mock-v1');
    expect(mockable.Processor.describe()).toBe('mock-processor');
  });

  it('VT-13: a mocked class supports the singleton getInstance pattern', () => {
    class MockSingleton {
      static instance: MockSingleton | undefined;
      static getInstance() {
        if (!MockSingleton.instance) {
          MockSingleton.instance = new MockSingleton();
        }
        return MockSingleton.instance;
      }
      value = 'mock-singleton';
    }
    const realModule = { Singleton: class RealSingleton {} };
    const mockable = createMockable('pkg/singleton', realModule);

    activateMocks({ 'pkg/singleton': { Singleton: MockSingleton } });

    const first = mockable.Singleton.getInstance();
    const second = mockable.Singleton.getInstance();
    expect(first).toBe(second);
    expect(first.value).toBe('mock-singleton');
  });
});
