'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ===========================================================================
// WHAT A CUSTOMER'S OWN METRO BUILD PRODUCES - no Sherlo CLI in the loop.
// ===========================================================================
//
// A developer running `expo run:ios` / `react-native run-android` never calls
// the CLI, so their build is decided entirely by the config object
// `withStorybook()` returns - which is what `metro/applySherloTransforms.js`
// computes. This suite asserts on that object.
//
// It deliberately covers only the facts about a NO-CLI build that
// withStorybook.test.ts does not already make (that file owns the resolver
// redirect, the polyfill injection and the wrapper generation). What is left
// here is the part that is specific to a plain customer build:
//
//   1. require.context still works, or the app dies at launch.
//   2. The seam is ABSENT. `metro/entry.js`'s generateEntry() is the only
//      thing that requires src/seam.js, and it runs only on the CLI's
//      bundling road - so a build that never ran the CLI must never carry the
//      seam's rendezvous point.
//   3. `enabled: false` really is a disabled build, by the CONTENT of what it
//      emits, not just by the file name.
// ===========================================================================

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const POLYFILL_PATH = path.join(PACKAGE_ROOT, 'metro/polyfill.js');

const applySherloTransforms = require('../../metro/applySherloTransforms');

interface MetroConfig {
  transformer: { unstable_allowRequireContext?: boolean };
  resolver: {
    resolveRequest: (
      context: unknown,
      moduleName: string,
      platform: string
    ) => { type: string; filePath?: string };
  };
  serializer: { getPolyfills: (context: unknown) => string[] };
}

function freshProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-customer-build-'));
}

function transformFreshProject(sherloOptions: Record<string, unknown>): {
  projectRoot: string;
  config: MetroConfig;
} {
  const projectRoot = freshProjectRoot();
  return {
    projectRoot,
    config: applySherloTransforms({ projectRoot, resolver: {} }, sherloOptions) as MetroConfig,
  };
}

// A Metro resolver context minimally sufficient to drive `resolveRequest`: its
// delegate answers every name with a made-up file under /delegate, so any
// filePath NOT under /delegate is one Sherlo's resolver chose itself.
function fakeContext(originModulePath: string) {
  return {
    originModulePath,
    resolveRequest: (_context: unknown, moduleName: string) => ({
      type: 'sourceFile',
      filePath: `/delegate/${moduleName}`,
    }),
  };
}

describe('customer build - require.context', () => {
  it('resolves rather than becoming a throwing stub', () => {
    const { config } = transformFreshProject({});

    expect(
      config.transformer.unstable_allowRequireContext,
      'Metro emits a THROWING STUB for require.context unless ' +
        "unstable_allowRequireContext is set, and Storybook's own storybook.requires uses " +
        'require.context - an app built without this flag dies at launch, before any Sherlo ' +
        'error handling can fire'
    ).toBe(true);
  });
});

describe('customer build - the seam is never pulled in by the Metro plugin alone', () => {
  it('no polyfill references the seam, and no app module resolves into it', () => {
    const { projectRoot, config } = transformFreshProject({});

    // Precondition, so the two negative assertions below cannot pass
    // vacuously on a plugin that silently no-opped: the redirect of
    // @storybook/react-native to Sherlo's generated wrapper fires
    // unconditionally whenever the plugin actually ran.
    const storybookResolution = config.resolver.resolveRequest(
      fakeContext(path.join(projectRoot, 'src/App.tsx')),
      '@storybook/react-native',
      'ios'
    );
    expect(
      storybookResolution.filePath,
      'the Sherlo plugin did not run at all, so everything this test asserts about its ' +
        'output would be trivially true'
    ).toBe(path.join(projectRoot, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js'));

    const polyfills = config.serializer.getPolyfills(undefined);
    expect(polyfills.length).toBeGreaterThan(0);

    for (const polyfillPath of polyfills) {
      const content = fs.readFileSync(polyfillPath, 'utf8');
      expect(
        content.includes('__SHERLO_HOST__') || content.includes('seam.js'),
        `${path.basename(polyfillPath)} (one of the polyfills every customer build gets) ` +
          "references the seam. The seam is planted by the CLI's generated entry " +
          "(metro/entry.js), never by the Metro plugin's own polyfill list - a customer who " +
          "never runs the Sherlo CLI must never carry the seam's rendezvous point."
      ).toBe(false);
    }

    const appModuleResolution = config.resolver.resolveRequest(
      fakeContext(path.join(projectRoot, 'src/App.tsx')),
      './Widget',
      'ios'
    );
    expect(appModuleResolution.filePath?.endsWith('seam.js')).toBe(false);
  });
});

describe('customer build - opts.enabled === false emits a disabled build, not a quiet one', () => {
  it('the single polyfill sets the flags and carries none of the dispatcher body', () => {
    const { config } = transformFreshProject({ enabled: false });

    const polyfills = config.serializer.getPolyfills(undefined);
    expect(polyfills).toHaveLength(1);

    const content = fs.readFileSync(polyfills[0]!, 'utf8');
    expect(
      content.includes('global.__sherloWithStorybookApplied = true;'),
      'the disabled-flag polyfill must still set __sherloWithStorybookApplied - ' +
        'src/index.ts reads it at import time regardless of the disabled flag'
    ).toBe(true);
    expect(content.includes('global.__sherloStorybookDisabledFlag = true;')).toBe(true);
    expect(
      content.includes('ErrorUtils') || content.includes('__d'),
      'the disabled build must not carry the full polyfill body (ErrorUtils handler, __d ' +
        'wrap) - that is production overhead a disabled build has no use for'
    ).toBe(false);
  });

  it('the default (enabled) build emits the full dispatcher instead', () => {
    const { config } = transformFreshProject({});

    const polyfills = config.serializer.getPolyfills(undefined);
    expect(polyfills).toHaveLength(1);
    expect(polyfills[0]).toBe(POLYFILL_PATH);
  });
});
