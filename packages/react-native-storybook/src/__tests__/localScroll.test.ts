import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __emitMessageFromTheConnection,
  __getSentMessages,
  __resetConnection,
} from './__mocks__/react-native';
import { startCaptureTransport, stopCaptureTransport } from '../captureTransport';
import { __resetForTests as __resetTheLine, startTheLine } from '../connection/appLine';
import { startLocalScroll, stopLocalScroll } from '../localScroll';
import SherloModule from '../SherloModule';

/** Long enough for an answer of the native module to land on the line. */
const landed = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  __resetTheLine();
  startTheLine();
  __resetConnection();
});

afterEach(() => {
  stopLocalScroll();
  stopCaptureTransport();
  vi.restoreAllMocks();
});

describe('the app scrolls the scene when asked', () => {
  it('the app answers whether the scene scrolls and moves it to each asked position over the local line', async () => {
    vi.spyOn(SherloModule, 'isScrollable').mockResolvedValue({
      scrollable: true,
      scrollViewFrame: { x: 0, y: 80, width: 400, height: 700 },
    });
    const scrollTo = vi.spyOn(SherloModule, 'scrollToCheckpoint').mockResolvedValue({
      reachedBottom: false,
      appliedIndex: 2,
      appliedOffsetPx: 700,
      viewportPx: 700,
      contentPx: 2100,
    });
    startLocalScroll();
    // A second start does not answer twice.
    startLocalScroll();

    __emitMessageFromTheConnection({ action: 'is-scrollable', askId: 'a1' });
    await landed();
    __emitMessageFromTheConnection({
      action: 'scroll-to',
      askId: 'a2',
      index: 2,
      offset: 350,
      maxIndex: 20,
    });
    await landed();

    expect(scrollTo).toHaveBeenCalledWith(2, 350, 20);
    expect(__getSentMessages()).toEqual([
      {
        action: 'scroll-answer',
        askId: 'a1',
        scrollable: true,
        scrollViewFrame: { x: 0, y: 80, width: 400, height: 700 },
      },
      {
        action: 'scroll-answer',
        askId: 'a2',
        reachedBottom: false,
        appliedIndex: 2,
        appliedOffsetPx: 700,
        viewportPx: 700,
        contentPx: 2100,
      },
    ]);
  });

  it('an app that has not started waiting for a capture leaves a scroll ask unanswered', async () => {
    __emitMessageFromTheConnection({ action: 'is-scrollable', askId: 'a1' });
    await landed();

    expect(__getSentMessages()).toEqual([]);
  });

  it('starting the capture transport starts the scroll answers', async () => {
    startCaptureTransport({
      channel: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } as never,
      capture: { waitForACapture: vi.fn() },
    });

    __emitMessageFromTheConnection({ action: 'is-scrollable', askId: 'a1' });
    await landed();

    expect(__getSentMessages()).toEqual([
      { action: 'scroll-answer', askId: 'a1', scrollable: false },
    ]);
  });
});
