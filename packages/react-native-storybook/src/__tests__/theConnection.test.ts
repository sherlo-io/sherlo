/**
 * THE APP'S CONNECTION, from the JavaScript's side: everything it sends or hears goes through the
 * native client (src/connection/appLine), and a bundle that no bundler served opens nothing.
 *
 * Native code is the react-native stub (./__mocks__/react-native), which keeps what the JavaScript
 * sends and the addresses it asks native code to dial. The line starts once per run of the
 * JavaScript, so each test imports the SDK fresh.
 */
import {
  __emitMessageFromTheConnection,
  __getDialedAddresses,
  __getSentMessages,
  __resetConnection,
  __resetNativeMode,
  __setNativeMode,
} from './__mocks__/react-native';
import { JS_MODULE_VERSION } from '../sdk-compatibility.json';
import { SHERLO_PROTOCOL_VERSION } from '../sealedCore/seam';

const BUNDLER = 'http://localhost:8081';

beforeEach(async () => {
  vi.resetModules();
  __resetConnection();
  __resetNativeMode();
  // A testing-mode log line reads React Native's __DEV__.
  vi.stubGlobal('__DEV__', true);
  const { NativeModules } = await import('react-native');
  delete NativeModules.SourceCode;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The bundle was served by the bundler at `BUNDLER`, as React Native names it. */
async function servedByABundler(): Promise<void> {
  const { NativeModules } = await import('react-native');
  NativeModules.SourceCode = {
    getConstants: () => ({ scriptURL: `${BUNDLER}/index.bundle?platform=ios` }),
  };
}

/** The actions of every message the JavaScript sent, in order. */
function actionsSent(): string[] {
  return __getSentMessages().map((message) => message.action);
}

describe('the connection', () => {
  it('the JavaScript sends and receives through the native client and opens no socket of its own', async () => {
    const openedSockets = vi.fn();
    vi.stubGlobal('WebSocket', openedSockets);
    await servedByABundler();
    const { startTheLine, send, onMessage } = await import('../connection/appLine');
    const { default: RunnerBridge } = await import('../helpers/RunnerBridge');

    startTheLine();
    send({ action: 'STORYBOOK_LOADED' });
    const heard: unknown[] = [];
    onMessage((message) => heard.push(message));
    const story = {
      action: 'story',
      storyId: 'components-button--primary',
      requestId: 'req-1',
      parameters: {},
    };
    __emitMessageFromTheConnection(story);

    // What went out went through native code's sendMessage, and what came in came through its event.
    expect(actionsSent()).toEqual(['hello', 'STORYBOOK_LOADED']);
    expect(heard).toEqual([story]);

    // The core's own send is the same line: it sends over it and resolves with the answer it brings.
    const answer = RunnerBridge.send({
      action: 'REQUEST_SNAPSHOT',
      storyId: 'components-button--primary',
      requestId: 'req-1',
    });
    expect(actionsSent()).toEqual(['hello', 'STORYBOOK_LOADED', 'REQUEST_SNAPSHOT']);
    const scroll = { action: 'scroll', requestId: 'req-1', scrollIndex: 1, offsetPx: 700 };
    __emitMessageFromTheConnection(scroll);
    await expect(answer).resolves.toEqual(scroll);

    expect(openedSockets).not.toHaveBeenCalled();
  });

  it("a bundle served by a bundler dials that bundler's own Sherlo address", async () => {
    await servedByABundler();
    const { startTheLine } = await import('../connection/appLine');

    startTheLine();
    startTheLine();

    expect(__getDialedAddresses()).toEqual(['ws://localhost:8081/sherlo/line']);
  });

  it('a bundle loaded from the device with no address handed at launch opens no connection', async () => {
    const { startTheLine } = await import('../connection/appLine');

    startTheLine();

    expect(__getDialedAddresses()).toEqual([]);
  });

  it("the app's first message on every connection is hello, carrying the protocol version and the SDK's JS and native versions", async () => {
    await servedByABundler();
    const { NativeModules } = await import('react-native');
    const sendMessage = vi.spyOn(NativeModules.SherloModule, 'sendMessage');
    const dialBundler = vi.spyOn(NativeModules.SherloModule, 'dialBundler');
    const { startTheLine } = await import('../connection/appLine');

    startTheLine();

    // The hello goes out at the start, ahead of the dial; native code absorbs it, keeps the JS
    // version, and says its own first on every connection.
    expect(__getSentMessages()[0]).toEqual({
      action: 'hello',
      protocolVersion: SHERLO_PROTOCOL_VERSION,
      nativeVersion: '2.0.0',
      jsVersion: JS_MODULE_VERSION,
    });
    expect(sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      dialBundler.mock.invocationCallOrder[0]
    );
  });

  it('outside testing mode the app sends no story report and no error over the connection', async () => {
    for (const mode of ['default', 'storybook']) {
      vi.resetModules();
      __resetConnection();
      __setNativeMode(mode);
      await import('../index');
      const { default: RunnerBridge } = await import('../helpers/RunnerBridge');

      RunnerBridge.log('a line a story formed');

      expect(actionsSent(), mode).toEqual(['hello']);
    }

    // CONTROL: the same app in testing mode sends its log line and its load events.
    vi.resetModules();
    __resetConnection();
    __setNativeMode('testing');
    await import('../index');
    const { default: RunnerBridge } = await import('../helpers/RunnerBridge');
    RunnerBridge.log('a line a story formed');

    // The first 'log' is the stage line "sent its hello", the second the line the story formed.
    expect(actionsSent()).toEqual(['hello', 'log', 'JS_EVAL_COMPLETE', 'log']);
  });
});
