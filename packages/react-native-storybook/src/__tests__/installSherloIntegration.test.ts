/**
 * Tests for installSherloIntegration() - runs at SDK-import time in src/index.ts.
 *
 * Native code is the react-native stub (vitest.config.ts aliases it), which keeps every message the
 * JavaScript sends over the connection and lets a test choose the mode native code reports.
 *
 * Test matrix (mode × __sherloWithStorybookApplied × __sherloStorybookDisabledFlag):
 *  - default mode  → says hello only
 *  - storybook mode → says hello only
 *  - testing + !applied → hello, JS_EVAL_COMPLETE
 *  - testing + applied  → + WITHSTORYBOOK_APPLIED
 *  - testing + disabled → + WITHSTORYBOOK_DISABLED
 */

import {
  __getSentMessages,
  __resetConnection,
  __resetNativeMode,
  __setNativeMode,
} from './__mocks__/react-native';
import { JS_MODULE_VERSION } from '../sdk-compatibility.json';

vi.mock('../checkSdkCompatibility', () => ({
  default: () => true,
  __resetCacheForTests: () => {},
}));
vi.mock('../isRunningVisualTests', () => ({ default: false }));
vi.mock('../isStorybookMode', () => ({ default: false }));
vi.mock('../openStorybook', () => ({ default: () => {} }));

// Reset native state before each test so tests are isolated.
beforeEach(() => {
  vi.resetModules();
  __resetNativeMode();
  __resetConnection();
  delete (global as any).__sherloWithStorybookApplied;
  delete (global as any).__sherloStorybookDisabledFlag;
});

/** The actions of the messages the JavaScript sent over the connection, in order. */
function getSentActions(): string[] {
  return __getSentMessages().map((message) => message.action);
}

describe('installSherloIntegration - mode guard', () => {
  it('default mode → sends only hello', async () => {
    __setNativeMode('default');
    await import('../index');
    expect(getSentActions()).toEqual(['hello']);
  });

  it('storybook mode → sends only hello', async () => {
    __setNativeMode('storybook');
    await import('../index');
    expect(getSentActions()).toEqual(['hello']);
  });
});

describe('installSherloIntegration - testing mode messages', () => {
  it('testing + !applied → sends that the JavaScript loaded, with its version', async () => {
    __setNativeMode('testing');
    await import('../index');

    // The 'log' is the stage line "sent its hello", which a testing run also sends over the line.
    expect(getSentActions()).toEqual(['hello', 'log', 'JS_EVAL_COMPLETE']);
    expect(__getSentMessages()[2]).toEqual({
      action: 'JS_EVAL_COMPLETE',
      jsVersion: JS_MODULE_VERSION,
    });
  });

  it('testing + applied + !disabled → sends that the JavaScript loaded and the bundler setup is in place', async () => {
    __setNativeMode('testing');
    (global as any).__sherloWithStorybookApplied = true;
    await import('../index');

    expect(getSentActions()).toEqual(['hello', 'log', 'JS_EVAL_COMPLETE', 'WITHSTORYBOOK_APPLIED']);
  });

  it('testing + applied + disabled → sends that the JavaScript loaded, the bundler setup is in place and Storybook is switched off', async () => {
    __setNativeMode('testing');
    (global as any).__sherloWithStorybookApplied = true;
    (global as any).__sherloStorybookDisabledFlag = true;
    await import('../index');

    expect(getSentActions()).toEqual([
      'hello',
      'log',
      'JS_EVAL_COMPLETE',
      'WITHSTORYBOOK_APPLIED',
      'WITHSTORYBOOK_DISABLED',
    ]);
  });
});
