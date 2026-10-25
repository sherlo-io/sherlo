/**
 * THE BUNDLER LINE'S LOG LINES: when a live capture finds no app, the phone's log shows whether the
 * app dialed the bundler, sent its hello, was answered, or gave up waiting. Native code holds the
 * socket (src/connection/appLine), so the JavaScript logs what it does and hears, never a body.
 */
import { __emitMessageFromTheConnection, __resetConnection } from './__mocks__/react-native';

beforeEach(async () => {
  vi.resetModules();
  __resetConnection();
  vi.stubGlobal('__DEV__', true);
  const { NativeModules } = await import('react-native');
  NativeModules.SourceCode = {
    getConstants: () => ({ scriptURL: 'http://192.168.1.5:8081/index.bundle?platform=ios' }),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the bundler line logs', () => {
  it('the app writes a log line when it dials the bundler, sends its hello, and loses the line', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { startTheLine, sendAndAwaitAnswer } = await import('../connection/appLine');

    startTheLine();
    __emitMessageFromTheConnection({ action: 'story', storyId: 'secret-id', requestId: 'r' });

    vi.useFakeTimers();
    const wait = sendAndAwaitAnswer({ action: 'STORYBOOK_LOADED' }, 'story', 500);
    const rejection = wait.catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(500);
    await rejection;

    const lines = logged.mock.calls.map((call) => String(call[0]));
    expect(lines.every((line) => line.startsWith('@sherlo/react-native-storybook: '))).toBe(true);
    expect(lines.some((line) => line.includes('dials ws://192.168.1.5:8081'))).toBe(true);
    expect(lines.some((line) => line.includes('sent its hello'))).toBe(true);
    expect(lines.some((line) => line.includes('answered: story'))).toBe(true);
    expect(lines.some((line) => line.includes('brought no story within 500ms'))).toBe(true);
    expect(lines.join('\n')).not.toContain('secret-id');
  });
});
