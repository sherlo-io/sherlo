/**
 * Tests for the live SherloModule wrapper (createSherloModule).
 * Mocks the underlying TurboModule (NativeSherloModule spec) and asserts:
 *  - appendFile base64-encodes the content before calling native
 *  - readFile base64-decodes the native return value
 *  - getMode/getConfig/getLastState delegate to getConstants()
 *  - constants merge correctly across new-arch (getSherloConstants) and old-arch (getConstants)
 */
import base64 from 'base-64';
import utf8 from 'utf8';

// vi.hoisted() runs before mock factories, making these safe to use in factory closures.
const {
  mockGetSherloConstants,
  mockGetConstants,
  mockAppendFile,
  mockReadFile,
  mockSendNativeError,
  mockGetInspectorData,
  mockStabilize,
  mockIsScrollable,
  mockScrollToCheckpoint,
  mockOpenTesting,
} = vi.hoisted(() => ({
  mockGetSherloConstants: vi.fn(),
  mockGetConstants: vi.fn(),
  mockAppendFile: vi.fn(),
  mockReadFile: vi.fn(),
  mockSendNativeError: vi.fn(),
  mockGetInspectorData: vi.fn(),
  mockStabilize: vi.fn(),
  mockIsScrollable: vi.fn(),
  mockScrollToCheckpoint: vi.fn(),
  mockOpenTesting: vi.fn(),
}));

vi.mock('../specs/NativeSherloModule', () => ({
  default: {
    getSherloConstants: mockGetSherloConstants,
    getConstants: mockGetConstants,
    appendFile: mockAppendFile,
    readFile: mockReadFile,
    sendNativeError: mockSendNativeError,
    getInspectorData: mockGetInspectorData,
    stabilize: mockStabilize,
    isScrollable: mockIsScrollable,
    scrollToCheckpoint: mockScrollToCheckpoint,
    openStorybook: vi.fn(),
    toggleStorybook: vi.fn(),
    notifyGetStorybookCalled: vi.fn(),
    openTesting: mockOpenTesting,
  },
}));

vi.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'ios' },
}));

vi.mock('../helpers/isExpoGo', () => ({ default: false }));

import SherloModule from '../SherloModule';

const NEW_ARCH_CONSTANTS = {
  mode: 'testing',
  config: JSON.stringify({
    stabilization: {
      requiredMatches: 3,
      minScreenshotsCount: 3,
      intervalMs: 500,
      timeoutMs: 5000,
      threshold: 0,
      includeAA: true,
    },
  }),
  lastState: JSON.stringify({ nextSnapshot: { storyId: 'comp--story' }, requestId: 'req-1' }),
  nativeVersion: '2.0.0',
};

const OLD_ARCH_CONSTANTS = {
  mode: 'default',
  config: JSON.stringify({
    stabilization: {
      requiredMatches: 2,
      minScreenshotsCount: 2,
      intervalMs: 300,
      timeoutMs: 4000,
      threshold: 0,
      includeAA: false,
    },
  }),
  lastState: '',
  nativeVersion: '1.5.0',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SherloModule live - appendFile base64 encoding', () => {
  it('encodes the data with base64(utf8(content)) before calling native', async () => {
    mockAppendFile.mockResolvedValue(undefined);
    await SherloModule.appendFile('protocol.sherlo', 'hello world');
    const expectedEncoded = base64.encode(utf8.encode('hello world'));
    expect(mockAppendFile).toHaveBeenCalledWith('protocol.sherlo', expectedEncoded);
  });

  it('encodes JSON content correctly (round-trips through base64)', async () => {
    mockAppendFile.mockResolvedValue(undefined);
    const content = '{"action":"START","timestamp":1234567890}';
    await SherloModule.appendFile('protocol.sherlo', content);
    const expectedEncoded = base64.encode(utf8.encode(content));
    expect(mockAppendFile).toHaveBeenCalledWith('protocol.sherlo', expectedEncoded);
  });
});

describe('SherloModule live - readFile base64 decoding', () => {
  it('decodes the native return value with utf8.decode(base64.decode())', async () => {
    const original = 'hello world\n';
    const encoded = base64.encode(utf8.encode(original));
    mockReadFile.mockResolvedValue(encoded);
    const result = await SherloModule.readFile('protocol.sherlo');
    expect(result).toBe(original);
  });
});

describe('SherloModule live - constants merge (new-arch vs old-arch)', () => {
  it('new-arch (getSherloConstants) supplies mode and nativeVersion', () => {
    mockGetSherloConstants.mockReturnValue(NEW_ARCH_CONSTANTS);
    mockGetConstants.mockReturnValue({});
    expect(SherloModule.getMode()).toBe('testing');
    expect(SherloModule.getNativeVersion()).toBe('2.0.0');
  });

  it('old-arch (getConstants only) supplies mode when getSherloConstants returns empty', () => {
    mockGetSherloConstants.mockReturnValue({});
    mockGetConstants.mockReturnValue(OLD_ARCH_CONSTANTS);
    expect(SherloModule.getMode()).toBe('default');
    expect(SherloModule.getNativeVersion()).toBe('1.5.0');
  });
});

describe('SherloModule live - getConfig / getLastState', () => {
  beforeEach(() => {
    mockGetSherloConstants.mockReturnValue(NEW_ARCH_CONSTANTS);
    mockGetConstants.mockReturnValue({});
  });

  it('getConfig() parses the config JSON string', () => {
    const config = SherloModule.getConfig();
    expect(config.stabilization).toBeDefined();
    expect(config.stabilization.requiredMatches).toBe(3);
  });

  it('getConfigOrDefault() parses the config JSON string too, when there is one', () => {
    const config = SherloModule.getConfigOrDefault();
    expect(config.stabilization.requiredMatches).toBe(3);
  });

  it('getLastState() returns parsed last state when set', () => {
    const state = SherloModule.getLastState();
    expect(state).toBeDefined();
    expect(state?.nextSnapshot.storyId).toBe('comp--story');
    expect(state?.requestId).toBe('req-1');
  });

  it('getLastState() returns undefined when lastState is empty string', () => {
    mockGetSherloConstants.mockReturnValue({ ...NEW_ARCH_CONSTANTS, lastState: '' });
    expect(SherloModule.getLastState()).toBeUndefined();
  });

  it('getLastState() returns undefined when lastState is empty object', () => {
    mockGetSherloConstants.mockReturnValue({
      ...NEW_ARCH_CONSTANTS,
      lastState: JSON.stringify({}),
    });
    expect(SherloModule.getLastState()).toBeUndefined();
  });

  it('sendNativeError() JSON-stringifies data before calling native', () => {
    const data = { jsVersion: '2.0.0', nativeVersion: '1.0.0' };
    SherloModule.sendNativeError('ERROR_SDK_COMPATIBILITY', 'msg', data);
    expect(mockSendNativeError).toHaveBeenCalledWith(
      'ERROR_SDK_COMPATIBILITY',
      'msg',
      JSON.stringify(data)
    );
  });

  it('sendNativeError() passes empty string when data is undefined', () => {
    SherloModule.sendNativeError('ERROR_CODE', 'msg');
    expect(mockSendNativeError).toHaveBeenCalledWith('ERROR_CODE', 'msg', '');
  });

  it('isTurboModule is true when TurboModule is present', () => {
    expect(SherloModule.isTurboModule).toBe(true);
  });

  it("getDriver() reads the `driver` constant a run's config-based boot reports", () => {
    mockGetSherloConstants.mockReturnValue({ ...NEW_ARCH_CONSTANTS, driver: 'runner' });
    expect(SherloModule.getDriver()).toBe('runner');
  });

  it("getDriver() reads the `driver` constant a capture's restart reports", () => {
    mockGetSherloConstants.mockReturnValue({ ...NEW_ARCH_CONSTANTS, driver: 'capture' });
    expect(SherloModule.getDriver()).toBe('capture');
  });

  it('getDriver() returns undefined outside testing mode, where native reports no driver', () => {
    mockGetSherloConstants.mockReturnValue({ ...NEW_ARCH_CONSTANTS, driver: null });
    expect(SherloModule.getDriver()).toBeUndefined();
  });
});

describe('SherloModule live - openTesting', () => {
  it('JSON-encodes the config and defaults a missing storyId to the empty string', () => {
    const config = { stabilization: { requiredMatches: 3 } } as any;
    SherloModule.openTesting(undefined, config);
    expect(mockOpenTesting).toHaveBeenCalledWith('', JSON.stringify(config));
  });

  it('passes the storyId through when given', () => {
    const config = { stabilization: { requiredMatches: 3 } } as any;
    SherloModule.openTesting('comp--story', config);
    expect(mockOpenTesting).toHaveBeenCalledWith('comp--story', JSON.stringify(config));
  });
});

describe('SherloModule live - getConfigOrDefault() with nothing on disk', () => {
  // A capture restarts the app into testing mode with no config.sherlo ever written to the
  // device. Native reports that absence as null (NSNull on iOS, a null JSONObject on Android),
  // which crosses the bridge as the constant `config: null` below.
  const NO_CONFIG_ON_DISK = { ...NEW_ARCH_CONSTANTS, config: null as unknown as string };

  it('getConfig() throws, because there is nothing to parse', () => {
    mockGetSherloConstants.mockReturnValue(NO_CONFIG_ON_DISK);
    mockGetConstants.mockReturnValue({});
    expect(() => SherloModule.getConfig()).toThrow('Config is undefined');
  });

  it('getConfigOrDefault() falls back to the SDK defaults instead of throwing', () => {
    mockGetSherloConstants.mockReturnValue(NO_CONFIG_ON_DISK);
    mockGetConstants.mockReturnValue({});
    const config = SherloModule.getConfigOrDefault();
    expect(config.stabilization.requiredMatches).toBe(3);
  });
});
