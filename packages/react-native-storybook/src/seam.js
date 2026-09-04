/**
 * THE SEAM - the entire public JS surface a late-attached runtime needs.
 *
 * It is not imported by the customer. The generated entry (metro/entry.js)
 * requires it before the customer's own entry point, which matters for two
 * reasons: the customer's code stays untouched, and it is GUARANTEED to run -
 * unlike an import the app might never make, since a standalone Storybook
 * entry may never reach this package at all.
 *
 * WHY EVERYTHING IS PASSED BY VALUE
 *
 * The customer's bundle and a spliced runtime have SEPARATE module registries.
 * A package required from both is instantiated twice - a mock registry held in
 * module scope would have the emitted shims registering into the customer
 * bundle's copy while the runtime read its own, so every mock would silently
 * do nothing while the run stayed green. So the private runtime imports
 * NOTHING from the host directly: every module instance it needs arrives
 * through this one global, by value.
 *
 * Written as plain JS, not TypeScript: this file is required directly out of
 * `src/` by the customer's own Metro build (the generated entry resolves
 * `@sherlo/react-native-storybook/seam` to this file, exactly like
 * `metro/polyfill.js`), so it must already be something Metro can transform
 * without a TypeScript step over node_modules.
 */
const React = require('react');
const ReactNative = require('react-native');

const SherloModule = require('@sherlo/react-native-storybook/dist/SherloModule.js').default;
const mocking = require('@sherlo/react-native-storybook/mocking');
// Reached off the already-frozen ./dist/SherloModule.js export rather than a
// new subpath of its own - see SherloModule.ts's `constants` field.
const constants = SherloModule.constants;

/**
 * Optional peers.
 *
 * These live in the PUBLIC package even though only private code will ever
 * consume most of them, because they must resolve from the CUSTOMER's
 * node_modules - a specifier resolved inside a spliced runtime would look in
 * the wrong place, or find nothing at all. Every one is a BARE
 * `try { require(x) } catch {}`, sitting directly inside the try block's
 * statement list, because that is the exact shape Metro's optional-dependency
 * rule recognises (`collectDependencies.js`, isOptionalDependency) - reaching
 * for a peer through a helper function or a variable specifier loses the
 * exemption and turns a missing optional package into a build failure naming
 * a file the customer has never heard of.
 */
function optional(load) {
  try {
    return load();
  } catch {
    return null;
  }
}

/**
 * Read once, at seam time, and never re-derived.
 *
 * mode / config / lastState / nativeVersion are all decided PRE-MAIN - by a
 * dyld constructor on iOS and a ContentProvider on Android, both before
 * Application.onCreate(). A runtime attached later reads these frozen values;
 * it can never influence them and must never try to recompute them.
 */
function readNative() {
  const mode = SherloModule.getMode();
  const nativeVersion = SherloModule.getNativeVersion();

  // getConfig()/getLastState() throw or return undefined when nothing was
  // written for this launch (the ordinary case outside a real test run) -
  // absence here must not crash bundle evaluation.
  let config;
  try {
    config = SherloModule.getConfig();
  } catch {
    config = undefined;
  }

  return { mode, config, lastState: SherloModule.getLastState(), nativeVersion };
}

const host = {
  /**
   * An independent integer, bumped only when the seam contract changes - NOT
   * the package version. Kept in sync BY EYE with the literal string
   * assignment below; the two exist for different readers (JS callers vs. a
   * bundle-text grep) and must never be derived from one another, or a
   * minifier could fold the derivation away and leave the grep target stale.
   */
  seamVersion: 1,

  /** What the runtime negotiates against. */
  native: readNative(),

  /** Frozen file names and ids, so the runtime never hardcodes them. */
  constants,

  /** The native shim, wrapped. Never hand out the raw TurboModule. */
  module: SherloModule,

  /**
   * Host module INSTANCES. Not specifiers - instances. A specifier resolved
   * inside the spliced runtime would find a SECOND copy of the module, not
   * the one the customer's bundle is already running.
   */
  host: {
    React,
    ReactNative,
    jsxRuntime: optional(() => require('react/jsx-runtime')),
    SafeAreaContext: optional(() => require('react-native-safe-area-context')),
    itsFine: optional(() => require('its-fine')),
    deepmerge: optional(() => require('deepmerge')),
    Theming: optional(() => require('@storybook/react-native-theming')),
    optional: {
      expoDevMenu: optional(() => require('expo-dev-menu')),
      expoConstants: optional(() => require('expo-constants')),
      expoSplashScreen: optional(() => require('expo-splash-screen')),
      rnSplashScreen: optional(() => require('react-native-splash-screen')),
      bootSplash: optional(() => require('react-native-bootsplash')),
    },
  },

  /**
   * The mocking registry is PUBLIC and must stay so: createMockable's traps
   * run on every property access of every mocked module, so it cannot live
   * on the far side of a splice.
   */
  mocking,

  /** Filled in by the generated Storybook wrapper when it captures the view. */
  storybook: null,

  /** Set by the runtime when it takes the screen. */
  takenOverBy: null,

  handOff(rootComponent) {
    host.takenOverBy = rootComponent;
    return true;
  },

  /**
   * Story failures, recorded here by the generated Storybook wrapper's
   * boundary.
   *
   * It is a LIST on the host rather than a callback into the runtime, because
   * the throw can land before any runtime exists to call - and because this
   * file has to work with no runtime at all, in every customer's ordinary
   * build. The wrapper's boundary is the only position from which a story's
   * throw is visible: Storybook React Native wraps every story in its own
   * ErrorBoundary whose entire error handling is a `console.log`, so from
   * anywhere outside it, a story that threw looks exactly like a story that
   * renders a red box.
   */
  storyErrors: [],

  reportStoryError(failure) {
    host.storyErrors.push(failure);
  },

  /** The door. A runtime calls this to register itself. */
  runtime: null,
  attach(runtime) {
    host.runtime = runtime;
    return host;
  },
};

globalThis.__SHERLO_HOST__ = host;
globalThis.__sherlo = host;

/**
 * The seam version marker.
 *
 * A SEPARATE, literal string assignment on a global - not a property read off
 * `host` - because this line has to survive minification as searchable BUNDLE
 * TEXT. The splice gate (private) greps the built bundle for it rather than
 * evaluating any code, and a bundle with no marker is refused as "built
 * without the Sherlo package". See __tests__/seam.test.ts, which asserts this
 * literal shape holds after a real minifier runs over the source.
 */
globalThis.__SHERLO_SEAM_VERSION__ = '1';

/**
 * JS_EVAL_COMPLETE - the JS bundle reached Sherlo's code.
 *
 * PUBLIC on purpose, and lives HERE rather than in the package's `.` export:
 * it is the marker that separates "the app never started" from "the app
 * started and then failed", and those are the same blank screen from the
 * runner's side but completely different conclusions. It has to be written by
 * code that is present even when no runtime was ever attached AND even when
 * the customer's own code never imports this package directly - which the
 * seam is, and the `.` export is not, since a standalone Storybook entry may
 * never reach it.
 *
 * Fire-and-forget: this is a marker, and a marker that can block boot is
 * worse than no marker.
 */
if (host.native.mode === 'testing') {
  host.module
    .appendFile(
      constants.PROTOCOL_FILE,
      JSON.stringify({ action: 'JS_EVAL_COMPLETE', timestamp: Date.now(), entity: 'app' }) + '\n'
    )
    .catch(() => {
      /* the protocol file is the runner's problem, not the app's */
    });
}

/**
 * Takeover, without the app's cooperation.
 *
 * The app registers its root normally and knows nothing about this. The
 * generated wrapper defers to `takenOverBy` at the moment the root is
 * actually REQUESTED, which is after the whole bundle has evaluated - so a
 * runtime attaching at any point during startup still wins.
 *
 * Registering a root instead of wrapping one does not work: the app registers
 * its own afterwards and simply overwrites it, and the result is Sherlo
 * screenshotting the customer's app instead of stories, silently.
 */
const originalRegisterComponent = ReactNative.AppRegistry.registerComponent;

ReactNative.AppRegistry.registerComponent = function registerComponent(appKey, provider, section) {
  return originalRegisterComponent.call(
    ReactNative.AppRegistry,
    appKey,
    function resolveRoot() {
      return host.takenOverBy || provider();
    },
    section
  );
};

// Announce, for a runtime spliced ahead of this module and waiting.
if (typeof globalThis.__SHERLO_ATTACH__ === 'function') {
  globalThis.__SHERLO_ATTACH__(host);
}

module.exports = host;
