/**
 * Tests for the live SherloModule wrapper (createSherloModule).
 * Mocks the underlying TurboModule (the six-method NativeSherloModule spec)
 * and asserts:
 *  - appendFile base64-encodes the content before calling native
 *  - readFile base64-decodes the native return value
 *  - getMode/getConfig/getLastState delegate to getSherloConstants()
 *  - the public invoke()/invokeSync() generic transport JSON-encodes args,
 *    decodes the result (invoke) or unwraps the ok/value envelope
 *    (invokeSync) - everything beyond the frozen named methods (screenshots,
 *    settle, scroll, inspector data, sendNativeError, ...) is the PRIVATE
 *    runtime calling through these two by name, never a named method here
 */
import base64 from 'base-64';
import utf8 from 'utf8';

// vi.hoisted() runs before mock factories, making these safe to use in factory closures.
const { mockGetSherloConstants, mockAppendFile, mockReadFile, mockInvoke, mockInvokeSync } =
  vi.hoisted(() => ({
    mockGetSherloConstants: vi.fn(),
    mockAppendFile: vi.fn(),
    mockReadFile: vi.fn(),
    mockInvoke: vi.fn(),
    mockInvokeSync: vi.fn(),
  }));

vi.mock('../specs/NativeSherloModule', () => ({
  default: {
    getSherloConstants: mockGetSherloConstants,
    reportEarlyJsError: vi.fn(),
    appendFile: mockAppendFile,
    readFile: mockReadFile,
    invoke: mockInvoke,
    invokeSync: mockInvokeSync,
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

describe('SherloModule live - constants', () => {
  it('getSherloConstants supplies mode and nativeVersion', () => {
    mockGetSherloConstants.mockReturnValue(NEW_ARCH_CONSTANTS);
    expect(SherloModule.getMode()).toBe('testing');
    expect(SherloModule.getNativeVersion()).toBe('2.0.0');
  });
});

describe('SherloModule live - getConfig / getLastState', () => {
  beforeEach(() => {
    mockGetSherloConstants.mockReturnValue(NEW_ARCH_CONSTANTS);
  });

  it('getConfig() parses the config JSON string', () => {
    const config = SherloModule.getConfig();
    expect(config.stabilization).toBeDefined();
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

  it('invoke() JSON-encodes name and args, and decodes the resolved JSON', async () => {
    mockInvoke.mockResolvedValue(JSON.stringify({ scrollable: false }));
    const result = await SherloModule.invoke<{ scrollable: boolean }>('isScrollable', {
      viewTag: 42,
    });
    expect(mockInvoke).toHaveBeenCalledWith('isScrollable', JSON.stringify({ viewTag: 42 }));
    expect(result).toEqual({ scrollable: false });
  });

  it('invoke() defaults args to {} when omitted', async () => {
    mockInvoke.mockResolvedValue('null');
    await SherloModule.invoke('notifyGetStorybookCalled');
    expect(mockInvoke).toHaveBeenCalledWith('notifyGetStorybookCalled', JSON.stringify({}));
  });

  it('invokeSync() JSON-encodes name and args, and unwraps the ok/value envelope', () => {
    mockInvokeSync.mockReturnValue(JSON.stringify({ ok: true, value: { stable: true } }));
    const result = SherloModule.invokeSync<{ stable: boolean }>('stabilize', {
      requiredMatches: 3,
    });
    expect(mockInvokeSync).toHaveBeenCalledWith(
      'stabilize',
      JSON.stringify({ requiredMatches: 3 })
    );
    expect(result).toEqual({ stable: true });
  });

  it('invokeSync() returns undefined when the envelope is not ok', () => {
    mockInvokeSync.mockReturnValue(JSON.stringify({ ok: false, code: 'UNKNOWN_METHOD' }));
    expect(SherloModule.invokeSync('unknownCapability')).toBeUndefined();
  });

  it('isTurboModule is true when TurboModule is present', () => {
    expect(SherloModule.isTurboModule).toBe(true);
  });
});
