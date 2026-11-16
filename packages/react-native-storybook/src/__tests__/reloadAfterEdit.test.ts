import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __emitMessageFromTheConnection, __resetConnection } from './__mocks__/react-native';
import { startCaptureTransport, stopCaptureTransport } from '../captureTransport';
import { __resetForTests as __resetTheLine, startTheLine } from '../connection/appLine';
import { startReloadingAfterAnEdit, stopReloadingAfterAnEdit } from '../reloadAfterEdit';
import SherloModule from '../SherloModule';

const SCENE = 'inbox--full';

beforeEach(() => {
  __resetTheLine();
  startTheLine();
  __resetConnection();
});

afterEach(() => {
  stopReloadingAfterAnEdit();
  stopCaptureTransport();
  vi.restoreAllMocks();
});

describe('the app reloads into its scene after an edit', () => {
  it("the line's word of an edit starts the JavaScript again once, and the phone's log names the scene", () => {
    const reload = vi.spyOn(SherloModule, 'reloadJavaScript').mockImplementation(() => {});
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    startReloadingAfterAnEdit();
    // A second start does not reload twice.
    startReloadingAfterAnEdit();

    __emitMessageFromTheConnection({ action: 'reload-after-edit', sceneId: SCENE });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      `@sherlo/react-native-storybook: the bundler line scene ${SCENE} reloaded after an edit`
    );
  });

  it('any other word of the line reloads nothing', () => {
    const reload = vi.spyOn(SherloModule, 'reloadJavaScript').mockImplementation(() => {});
    startReloadingAfterAnEdit();

    __emitMessageFromTheConnection({ action: 'captureInstruction' });

    expect(reload).not.toHaveBeenCalled();
  });

  it('starting the capture transport starts hearing of edits, and stopping it stops', () => {
    const reload = vi.spyOn(SherloModule, 'reloadJavaScript').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    startCaptureTransport({
      channel: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } as never,
      capture: { waitForACapture: vi.fn() },
    });

    __emitMessageFromTheConnection({ action: 'reload-after-edit', sceneId: SCENE });
    stopCaptureTransport();
    __emitMessageFromTheConnection({ action: 'reload-after-edit', sceneId: SCENE });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
