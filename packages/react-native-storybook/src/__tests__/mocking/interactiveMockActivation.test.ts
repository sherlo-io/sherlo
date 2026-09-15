vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('storybook'),
  },
}));

import createMockable from '../../mocking/createMockable';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import {
  startInteractiveMockActivation,
  stopInteractiveMockActivation,
  __resetInteractiveMockActivationForTests,
} from '../../getStorybook/interactiveMockActivation';
import { enumerateStories } from '../../storybook/adapter';
import type { StorybookView } from '../../types';

// A minimal stand-in for Storybook's channel: records on()/off() and lets a test
// emit an event to whatever listener the SDK bound.
function makeChannel() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] ??= []).push(listener);
    }),
    off: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((listener) => listener(...args));
    },
  };
}

// Registers a STORIES require.context with two stories, each declaring a distinct
// story-level mock for the same module key. Returns the fake view plus both story ids.
function setupTwoStoryView() {
  const fileExports = {
    default: { title: 'Mocking/Switch' },
    Interactive: {
      parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'interactive-mock' } } } },
    },
    Other: {
      parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'other-mock' } } } },
    },
  };
  const req = Object.assign((_filename: string) => fileExports, {
    keys: () => ['./Switch.stories.tsx'],
  });
  (globalThis as any).STORIES = [{ directory: './src', req }];

  const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
  const stories = enumerateStories(view);
  const initial = stories.find((s) => s.id.endsWith('--interactive'))!;
  const other = stories.find((s) => s.id.endsWith('--other'))!;
  return { view, initialStoryId: initial.id, otherStoryId: other.id };
}

afterEach(() => {
  __resetInteractiveMockActivationForTests();
  clearMocks();
  __resetShimmedKeysForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete (globalThis as any).STORIES;
});

describe('startInteractiveMockActivation - initial story activation (EB-06, IS-05)', () => {
  it('activates the initial story’s mocks immediately, WITHOUT any storyChanged event', () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    const { view, initialStoryId } = setupTwoStoryView();
    const channel = makeChannel();

    // Before activation the module passes through to the real value.
    expect(mockable.label).toBe('real-switch');

    // Start tracking on the initial story WITHOUT emitting storyChanged - exactly
    // the device case where the session lands directly on inspect.initialStoryId and
    // Storybook never fires storyChanged for that first selection. Before the fix the
    // module still read `real-switch` here (the defect behind EB-06 / IS-05).
    startInteractiveMockActivation(view, channel, initialStoryId);

    expect(mockable.label).toBe('interactive-mock');
  });

  it('subscribes to storyChanged for subsequent selections and shares one activation path', () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    const { view, initialStoryId, otherStoryId } = setupTwoStoryView();
    const channel = makeChannel();

    startInteractiveMockActivation(view, channel, initialStoryId);
    expect(channel.on).toHaveBeenCalledWith('storyChanged', expect.any(Function));
    expect(mockable.label).toBe('interactive-mock');

    // Navigating to another story routes through the same activation path.
    channel.emit('storyChanged', otherStoryId);
    expect(mockable.label).toBe('other-mock');
  });

  it('leaves the initial story inactive when no initialStoryId is provided (still binds the listener)', () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    const { view, otherStoryId } = setupTwoStoryView();
    const channel = makeChannel();

    startInteractiveMockActivation(view, channel);
    expect(mockable.label).toBe('real-switch');

    // A later storyChanged still activates, proving the listener was bound.
    channel.emit('storyChanged', otherStoryId);
    expect(mockable.label).toBe('other-mock');
  });

  it('stopInteractiveMockActivation clears the active set - modules pass through to real again', () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    const { view, initialStoryId } = setupTwoStoryView();
    const channel = makeChannel();

    startInteractiveMockActivation(view, channel, initialStoryId);
    expect(mockable.label).toBe('interactive-mock');

    stopInteractiveMockActivation();

    expect(channel.off).toHaveBeenCalledWith('storyChanged', expect.any(Function));
    expect(mockable.label).toBe('real-switch');
  });
});
