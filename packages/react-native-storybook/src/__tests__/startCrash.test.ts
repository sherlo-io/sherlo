/**
 * An app whose JavaScript dies as it starts, before Sherlo's Storybook ever drew: metro/polyfill.js
 * is the earliest code in the bundle, so it is the one that says so over the app's line, as one
 * `start-failed` message, dialing the bundler first when the line is not open yet.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { BUNDLER_LINE_PATH } from '../constants';

const polyfillSource = fs.readFileSync(path.join(__dirname, '../../metro/polyfill.js'), 'utf8');

/**
 * A phone's JavaScript as the polyfill meets it: its native module, the bundle's url, Metro's __d.
 * `mode` is what native code reports (none: the probe finds no mode); `scriptURL` is where the
 * bundle came from, a bundler by default.
 */
function aStartingApp({
  mode,
  scriptURL = 'http://10.0.2.2:8081/index.bundle?platform=android',
}: { mode?: 'default' | 'storybook' | 'testing'; scriptURL?: string } = {}) {
  const sherloModule = {
    sendMessage: vi.fn(),
    dialBundler: vi.fn(),
    ...(mode && { getSherloConstants: () => ({ mode }) }),
  };
  const sourceCode = { getConstants: () => ({ scriptURL }) };
  const modules: Record<string, unknown> = { SherloModule: sherloModule, SourceCode: sourceCode };
  let globalHandler: ((error: Error, isFatal: boolean) => void) | null = null;
  const definedFactories: Array<(...args: any[]) => unknown> = [];
  const defineCalls: unknown[][] = [];
  const metrosOwnDefine = (factory: (...args: any[]) => unknown, ...rest: unknown[]) => {
    definedFactories.push(factory);
    defineCalls.push([factory, ...rest]);
  };

  const fakeGlobal: Record<string, any> = {
    __turboModuleProxy: (name: string) => modules[name] ?? null,
    ErrorUtils: {
      getGlobalHandler: () => globalHandler,
      setGlobalHandler: (handler: (error: Error, isFatal: boolean) => void) => {
        globalHandler = handler;
      },
    },
    __d: metrosOwnDefine,
  };

  // The polyfill runs as Metro runs it: plain script source, with the app's global handed in.
  // eslint-disable-next-line no-new-func
  new Function('global', `"use strict";\n${polyfillSource}`)(fakeGlobal);

  /** Run the module `__d` was handed at `index`, as Metro's require does, with its exports. */
  function requireModule(index: number) {
    return definedFactories[index](
      {},
      () => {},
      () => {},
      () => {},
      {},
      {},
      []
    );
  }

  return {
    fakeGlobal,
    metrosOwnDefine,
    /** Every call Metro's own __d received, the factory first. */
    defineCalls,
    sherloModule,
    requireModule,
    /** Let the polyfill's deferred ErrorUtils handler install, as it does once the bundle ran. */
    finishTheBundle: () => Promise.resolve().then(() => undefined),
    globalHandler: () => globalHandler!,
    startFailedMessagesSent: () =>
      sherloModule.sendMessage.mock.calls
        .map(([json]) => JSON.parse(json))
        .filter((message) => message.action === 'start-failed'),
  };
}

describe('an app whose JavaScript dies as it starts', () => {
  it("an error that kills the app's JavaScript as it starts is sent over the app's line with its name and message", async () => {
    const app = aStartingApp();
    app.fakeGlobal.__d(() => {
      throw new TypeError("undefined is not a function (near '...useStore...')");
    });

    // The entry module throws as the bundle runs; Metro rethrows it as fatal, and the app dies.
    expect(() => app.requireModule(0)).toThrow(TypeError);
    await app.finishTheBundle();
    // RN's own fatal handler sees it too, after the polyfill chained over it: it is sent once.
    app.globalHandler()(new TypeError('the same error, reported fatal'), true);

    expect(app.startFailedMessagesSent()).toEqual([
      {
        action: 'start-failed',
        name: 'TypeError',
        message: "undefined is not a function (near '...useStore...')",
      },
    ]);
    // The line is dialed first, at the bundler the bundle came from, the way startTheLine dials it.
    expect(app.sherloModule.dialBundler).toHaveBeenCalledWith(
      `ws://10.0.2.2:8081${BUNDLER_LINE_PATH}`
    );
    expect(app.sherloModule.dialBundler.mock.invocationCallOrder[0]).toBeLessThan(
      app.sherloModule.sendMessage.mock.invocationCallOrder[0]
    );
  });

  it('a fatal error after the bundle ran but before the Storybook drew is a start error too', async () => {
    const app = aStartingApp();
    await app.finishTheBundle();

    app.globalHandler()(new RangeError('Maximum call stack size exceeded'), true);

    expect(app.startFailedMessagesSent()).toEqual([
      { action: 'start-failed', name: 'RangeError', message: 'Maximum call stack size exceeded' },
    ]);
  });

  it('an app that starts cleanly sends no start error', async () => {
    const app = aStartingApp();
    app.fakeGlobal.__d(() => ({ ok: true }));
    app.requireModule(0);
    await app.finishTheBundle();
    app.fakeGlobal.__sherloStorybookRendered = true;

    // A fatal error once the Storybook drew is a story's, and a non-fatal one is no death at all.
    app.globalHandler()(new Error('a story threw'), true);
    app.globalHandler()(new Error('a warning'), false);

    expect(app.startFailedMessagesSent()).toEqual([]);
    expect(app.sherloModule.dialBundler).not.toHaveBeenCalled();
  });

  it("a module's throw the app itself catches, as an optional require does, is no start error", async () => {
    const app = aStartingApp();
    app.fakeGlobal.__d(() => {
      throw new Error("Cannot find module 'optional-peer'");
    });
    app.fakeGlobal.__d(() => {
      try {
        app.requireModule(0);
      } catch {
        return { optionalPeer: null };
      }
      return { optionalPeer: true };
    });

    app.requireModule(1);
    await app.finishTheBundle();

    expect(app.startFailedMessagesSent()).toEqual([]);
  });

  it('an app that renders Storybook from its own root and throws as it starts sends its own error', async () => {
    // Storybook's old setup, started by hand: native code reports the default mode, the entry
    // requires App.tsx, and App.tsx imports the Storybook entry, which throws - three modules deep.
    const app = aStartingApp({ mode: 'default' });
    app.fakeGlobal.__d(() => {
      throw new Error('Intentional crash at launch: the Storybook entry throws as it loads');
    });
    app.fakeGlobal.__d(() => app.requireModule(0));
    app.fakeGlobal.__d(() => app.requireModule(1));

    expect(() => app.requireModule(2)).toThrow('Intentional crash at launch');
    await app.finishTheBundle();

    expect(app.startFailedMessagesSent()).toEqual([
      {
        action: 'start-failed',
        name: 'Error',
        message: 'Intentional crash at launch: the Storybook entry throws as it loads',
      },
    ]);
    expect(app.sherloModule.dialBundler).toHaveBeenCalledWith(
      `ws://10.0.2.2:8081${BUNDLER_LINE_PATH}`
    );
  });

  it('an app that throws as it starts sends its own error before any capture has reloaded it', async () => {
    // No capture has reloaded the app into testing mode yet: it was opened on Storybook by hand.
    const app = aStartingApp({ mode: 'storybook' });
    app.fakeGlobal.__d(() => {
      throw new TypeError('Cannot read property of undefined');
    });

    expect(() => app.requireModule(0)).toThrow(TypeError);
    await app.finishTheBundle();

    expect(app.startFailedMessagesSent()).toEqual([
      { action: 'start-failed', name: 'TypeError', message: 'Cannot read property of undefined' },
    ]);
  });

  it("outside testing mode, a fatal error once the bundle ran is the app's own business", async () => {
    const app = aStartingApp({ mode: 'default' });
    app.fakeGlobal.__d(() => ({ ok: true }));
    app.requireModule(0);
    await app.finishTheBundle();

    // The app runs on: a module it requires later, from a screen, throws.
    app.fakeGlobal.__d(() => {
      throw new Error('a screen of the app threw');
    });
    expect(() => app.requireModule(1)).toThrow('a screen of the app threw');

    expect(app.startFailedMessagesSent()).toEqual([]);
  });

  it.each([
    ['in testing mode', 'testing' as const],
    ['outside testing mode', 'default' as const],
  ])(
    "the wrapped module definer hands Metro every argument it was given, the module's verbose name included, %s",
    (_label, mode) => {
      const app = aStartingApp({ mode });
      const factory = () => ({ ok: true });
      const noop = () => {};
      const factoryArguments = [{}, noop, noop, noop, { exports: {} }, {}, [7], 'extra'];
      const factorySaw = vi.fn();

      app.fakeGlobal.__d(factory, 42, [7], 'src/App.tsx', 'a fifth argument');
      app.fakeGlobal.__d(factorySaw, 43, [], 'src/Other.tsx');

      const [wrappedFactory, ...rest] = app.defineCalls[0];
      expect(wrappedFactory).not.toBe(factory);
      expect(rest).toEqual([42, [7], 'src/App.tsx', 'a fifth argument']);
      (app.defineCalls[1][0] as (...args: unknown[]) => unknown)(...factoryArguments);
      expect(factorySaw).toHaveBeenCalledWith(...factoryArguments);
    }
  );

  it('a store build, whose bundle comes from the device, is left untouched outside testing mode', () => {
    const app = aStartingApp({ mode: 'default', scriptURL: 'assets://index.android.bundle' });

    expect(app.fakeGlobal.__d).toBe(app.metrosOwnDefine);
    expect(app.fakeGlobal.ErrorUtils.getGlobalHandler()).toBeNull();
  });

  it("a line that cannot send leaves the app's own error handling unchanged", async () => {
    const app = aStartingApp();
    app.sherloModule.sendMessage.mockImplementation(() => {
      throw new Error('the native module is gone');
    });
    const appsOwnHandler = vi.fn();
    app.fakeGlobal.ErrorUtils.setGlobalHandler(appsOwnHandler);
    await app.finishTheBundle();

    const fatal = new Error('boom');
    expect(() => app.globalHandler()(fatal, true)).not.toThrow();
    expect(appsOwnHandler).toHaveBeenCalledWith(fatal, true);
  });
});
