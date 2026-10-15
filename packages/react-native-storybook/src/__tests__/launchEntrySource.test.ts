/**
 * The launch entry Sherlo writes on Storybook's default setup (metro/launchTimeEntry.js): what it
 * requires, and in which order, for each mode the native module can answer. The source is run with
 * a stubbed `require` and a stubbed native module; the open and capture listeners go to the suite's
 * fake core (./__mocks__/fakeSealedCore).
 */
import * as vm from 'vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NativeModules } from 'react-native';
import { startWaitingAsTheApp } from '../openStoryChannel';
import { getSealedCore } from '../sealedCore/loadSealedCore';
import type { FakeSealedCore } from './__mocks__/fakeSealedCore';

const {
  launchEntrySource,
  APP_SIDE_REQUEST,
  STORYBOOK_SIDE_REQUEST,
} = require('../../metro/launchTimeEntry');

type Mode = 'default' | 'storybook' | 'testing';
type SherloBuild = 'storybook' | 'app-and-storybook';

/**
 * Runs the launch entry of a build carrying `sherloBuild`, in an app the native module says is in
 * `mode`. Returns what happened, in order.
 */
function launch(sherloBuild: SherloBuild, mode: Mode): string[] {
  const happened: string[] = [];
  const modules: Record<string, () => unknown> = {
    '@sherlo/react-native-storybook': () => {
      happened.push('the SDK');
      return {};
    },
    '@sherlo/react-native-storybook/dist/SherloModule.js': () => ({
      default: {
        getMode: () => {
          happened.push('the mode');
          return mode;
        },
      },
    }),
    '@sherlo/react-native-storybook/dist/addStorybookToDevMenu.js': () => ({
      default: () => happened.push('the developer menu item'),
    }),
    '@sherlo/react-native-storybook/dist/openStoryChannel.js': () => ({
      startWaitingAsTheApp: () => {
        happened.push('the open and capture listeners');
        startWaitingAsTheApp();
      },
    }),
    [STORYBOOK_SIDE_REQUEST]: () => {
      happened.push('the Storybook side');
      return {};
    },
    [APP_SIDE_REQUEST]: () => {
      happened.push('the app side');
      return {};
    },
  };

  function stubbedRequire(moduleName: string): unknown {
    const loadModule = modules[moduleName];
    if (!loadModule) {
      throw new Error('The launch entry required an unexpected module: ' + moduleName);
    }
    return loadModule();
  }

  const runLaunchEntry = vm.runInThisContext(
    '(function (require) {\n' + launchEntrySource(sherloBuild) + '\n})'
  );
  runLaunchEntry(stubbedRequire);
  return happened;
}

function fakeCore(): FakeSealedCore {
  return getSealedCore() as FakeSealedCore;
}

beforeEach(() => {
  fakeCore().calls.length = 0;
  NativeModules.SourceCode = {
    getConstants: () => ({ scriptURL: 'http://localhost:8081/index.bundle?platform=ios' }),
  };
});

afterEach(() => {
  delete NativeModules.SourceCode;
});

describe('the generated launch entry', () => {
  it('the launch entry loads the SDK before either side', () => {
    const launches: [SherloBuild, Mode][] = [
      ['app-and-storybook', 'default'],
      ['app-and-storybook', 'storybook'],
      ['app-and-storybook', 'testing'],
      ['storybook', 'default'],
      ['storybook', 'testing'],
    ];

    for (const [sherloBuild, mode] of launches) {
      expect(launch(sherloBuild, mode)[0]).toBe('the SDK');
    }
  });

  it('the launch entry requires the Storybook side in Storybook and testing mode', () => {
    expect(launch('app-and-storybook', 'storybook')).toEqual([
      'the SDK',
      'the mode',
      'the Storybook side',
    ]);
    expect(launch('app-and-storybook', 'testing')).toEqual([
      'the SDK',
      'the mode',
      'the Storybook side',
    ]);

    // A build carrying Storybook alone never reaches the app side, whatever the mode.
    expect(launch('storybook', 'default')).toEqual(['the SDK', 'the Storybook side']);
    expect(launchEntrySource('storybook')).not.toContain(APP_SIDE_REQUEST);
  });

  it('the launch entry starts the open and capture listeners in default mode', () => {
    expect(launch('app-and-storybook', 'default')).toEqual([
      'the SDK',
      'the mode',
      'the developer menu item',
      'the open and capture listeners',
      'the app side',
    ]);

    const handedToTheCore = fakeCore().calls.filter(
      (call) => call.method === 'startWaitingAsTheApp'
    );
    expect(handedToTheCore).toHaveLength(1);
    const { letterbox, capture } = handedToTheCore[0].args[0] as {
      letterbox: { waitForStory: unknown };
      capture: { waitForACapture: unknown };
    };
    expect(typeof letterbox.waitForStory).toBe('function');
    expect(typeof capture.waitForACapture).toBe('function');

    // A built app has no bundler beside it, so nothing starts.
    fakeCore().calls.length = 0;
    delete NativeModules.SourceCode;
    launch('app-and-storybook', 'default');
    expect(fakeCore().calls.filter((call) => call.method === 'startWaitingAsTheApp')).toEqual([]);
  });
});
