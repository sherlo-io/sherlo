'use strict';

//
// Sherlo metro polyfill - JS error capture via ErrorUtils.setGlobalHandler + __d wrap.
//
// PRODUCTION SAFETY (read carefully):
// This file ships in every customer bundle that uses sherlo's withStorybook, including
// production App Store / Play Store builds.
//
// IIFE-TIME MODE GATE (TurboModule bridge call):
//
// The FIRST statement inside the IIFE sets global.__sherloWithStorybookApplied = true.
// This is an in-memory boolean only; src/index.ts reads it at SDK-import time for
// WSU (withStorybook-applied) detection. It must be set BEFORE any early return.
//
// Immediately after, the polyfill performs ONE TurboModule bridge call to query mode.
// TurboModules are registered before bundle eval starts on both old and new arch, so
// the bridge call is deterministic (no race condition).
//
// If mode is 'default' OR 'storybook', the IIFE returns right after the gate. The polyfill
// body (ErrorUtils handler install, __d wrap, AppRegistry wrap, 10s NOT_DISPLAYED timer)
// does NOT run. Only in a bundle a bundler served does a lean __d wrap watch for a crash
// as the bundle runs (watchOnlyTheStart); a store build's bundle comes from the device,
// so a store build costs one SourceCode constants read and nothing more.
//
// Only when mode === 'testing' does the full polyfill body execute.
//
// WHY THE BRIDGE CALL IS SAFE (and the JSI global is not):
//
// A previous attempt used globalThis.__sherloRuntimeMode_v1 as a gate and caused
// an Android race condition: the JSI binding (TurboModuleWithJSIBindings
// .getBindingsInstaller) can race module evaluation on Android, so the polyfill
// would sometimes read __sherloRuntimeMode_v1 before the JSI binding had written it.
//
// The TurboModule bridge call is a separate, more deterministic mechanism. TurboModules
// are registered before bundle eval begins. The JSI global write can race; the bridge
// call cannot. Do NOT use __sherloRuntimeMode_v1 or any JSI-set global as a gate.
// The single IIFE-time bridge call is the only gate; do NOT add mode-check gates
// inside individual handlers or wrappers.
//
// TWO complementary capture paths (active when mode === 'testing'):
//
// 1. ErrorUtils.setGlobalHandler - catches module-eval throws in the ENTRY
//    module (Metro's guardedLoadModule → ErrorUtils.reportFatalError), async
//    unhandled rejections, and event-handler errors. Installed early in the
//    polyfill, before user entry.
//
// 2. __d wrap - wraps every module's factory function with try/catch.
//    Catches throws in module body regardless of how Metro's local metroRequire
//    (_$$_REQUIRE) was wired. Metro injects _$$_REQUIRE as a local reference
//    into each factory, so any global.__r replacement is bypassed for nested
//    calls; wrapping __d at the source is the only reliable way to catch
//    nested module-eval throws.
//    The wrap rethrows after capturing so RN's native path still fires.
//
// Both paths share a single reportToNative helper and a __sherloFirstErrorReported
// flag to ensure only one report per session even if both paths fire for the
// same root cause.
//
// No customer configuration is required. No env vars. No build flags.
//
// What the polyfill reports goes over the app's connection, through native code's sendMessage,
// as the messages src/sealedCore/seam.ts types, and the bundler's line its `start-failed`
// (metro/sherloLine.d.ts). It writes no file.
//
// The engine's rules for wrapping a value safely are shared with the mock layer
// (src/safeWrapping.ts), and so is the exact undo of a write (src/mocking/exactUndo.ts). The
// polyfill runs before any module exists, so scripts/bundlePolyfill.js inlines them into the
// polyfill that ships, which requires nothing: run this file only as built.
//

var safeWrapping = require('../src/safeWrapping');
var exactUndo = require('../src/mocking/exactUndo');

(function () {
  if (typeof globalThis === 'undefined') return;
  if (typeof global === 'undefined') return;

  // Mark first - SDK's WSU detection (src/index.ts) reads this at import time.
  // Must be set BEFORE early return so detection still works when customer's
  // app is imported under testing mode later in the same session.
  global.__sherloWithStorybookApplied = true;

  // True while the bundle's modules run as it is evaluated; false from its first microtask on.
  var bundleStillEvaluating = true;
  // How many module factories are running inside each other: 1 is a module Metro's top-level
  // require ran, whose throw nobody but Metro's fatal report catches.
  var factoryDepth = 0;

  // IIFE-time mode gate: customer is not running Sherlo visual tests -> only a start crash is
  // watched, and only in a bundle a bundler served (watchOnlyTheStart below).
  var _outsideTesting = false;
  try {
    var _gateNm = global.__turboModuleProxy ? global.__turboModuleProxy('SherloModule') : null;
    if (!_gateNm && global.nativeModuleProxy && global.nativeModuleProxy.SherloModule) {
      _gateNm = global.nativeModuleProxy.SherloModule;
    }
    if (_gateNm) {
      var _gateC =
        (typeof _gateNm.getSherloConstants === 'function' ? _gateNm.getSherloConstants() : null) ||
        (typeof _gateNm.getConstants === 'function' ? _gateNm.getConstants() : null);
      var _gateMode = _gateC && _gateC.mode;
      _outsideTesting = _gateMode === 'default' || _gateMode === 'storybook';
    }
  } catch (_) {
    // Probe threw - conservative default: continue (run full body).
  }
  if (_outsideTesting) {
    watchOnlyTheStart();
    return;
  }

  // The recording stand-in on every app module.
  //
  // Only in a capture: testing mode (the gate above has returned for 'default' and 'storybook', and
  // no store build carries this file) in a bundle that lists the app's own modules in
  // __sherloStillRealPaths, which only a bundle the bundler served does (metro/stillReal.js). A
  // cloud test run reports testing mode too, and its bundle has no list. The list is a script that
  // runs after this polyfill, so it is read on first use. A listed module's exports are replaced,
  // right after its factory ran, by a Proxy that notes which exports are read - it hands back the
  // very value; the SDK reads the notes per story (src/mocking/stillReal.ts). All of it guarded.
  var stillReal = {
    isTesting: typeof _gateMode !== 'undefined' && _gateMode === 'testing',
    paths: global.__sherloStillRealPaths || null,
    entries: {},
  };
  if (stillReal.isTesting) global.__sherloStillReal = stillReal;
  // The quick check replays this very bundle, and its Sherlo module says `isReplay` in its
  // constants, which a phone never sets: there the recorder installs nothing, so it never walks
  // the replay's own globals, whose reads the replay would then have to answer.
  try {
    var isReplay = !!_gateC && _gateC.isReplay === true;
    if (stillReal.isTesting && !isReplay) installNativeRecorder();
  } catch (_) {
    // Recording never stops the app: a recorder that cannot be installed leaves the run unrecorded.
  }
  stillReal.isCapture = function () {
    if (!stillReal.paths) stillReal.paths = global.__sherloStillRealPaths || null;
    return stillReal.isTesting && !!stillReal.paths;
  };

  function watchModuleExports(moduleId, moduleObj) {
    if (!stillReal.isCapture()) return;
    var modulePath = stillReal.paths[moduleId];
    if (!modulePath || !moduleObj || typeof Proxy !== 'function') return;
    var target = moduleObj.exports;
    if (!safeWrapping.isObjectOrFunction(target)) return;

    var entry = { path: modulePath, used: null };
    var note = function (name) {
      var used = entry.used || (entry.used = {});
      used[name] = 1;
    };
    var handler = {
      get: function (t, key) {
        if (typeof key === 'string' && key !== '__esModule' && key !== 'then') note(key);
        return t[key];
      },
    };
    if (typeof target === 'function') {
      handler.apply = function (t, thisArg, args) {
        note('(call)');
        return Reflect.apply(t, thisArg, args);
      };
      handler.construct = function (t, args, newTarget) {
        note('(new)');
        return Reflect.construct(t, args, newTarget === undefined ? t : newTarget);
      };
    }
    stillReal.entries[moduleId] = entry;
    moduleObj.exports = new Proxy(target, handler);
  }

  stillReal.startStory = function () {
    for (var id in stillReal.entries) stillReal.entries[id].used = null;
  };

  stillReal.readStory = function () {
    var modules = [];
    for (var id in stillReal.entries) {
      var entry = stillReal.entries[id];
      if (entry.used) modules.push({ module: entry.path, exports: Object.keys(entry.used).sort() });
    }
    modules.sort(function (a, b) {
      return a.module < b.module ? -1 : a.module > b.module ? 1 : 0;
    });
    return modules;
  };

  function getSherloNativeModule() {
    // Each attempt is isolated: a throw in one does not block the next.
    try {
      if (global.__turboModuleProxy) {
        var tm = global.__turboModuleProxy('SherloModule');
        if (tm) return tm;
      }
    } catch (_) {}
    try {
      // RN 0.81 old-arch: nativeModuleProxy may exist but return null for non-TurboModules.
      if (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule) {
        return global.nativeModuleProxy.SherloModule;
      }
    } catch (_) {}
    // NOTE: a third fallback via global.__r('react-native') used to live here and was
    // removed. Metro's string-to-moduleId resolution (getModuleIdForVerboseName) only
    // runs under __DEV__ (see metro-runtime/src/polyfills/require.js) - in release
    // builds global.__r('react-native') looks up the literal string 'react-native' in
    // a Map keyed by numeric module ids, always misses, and falls through to Metro's
    // guardedLoadModule, which calls global.ErrorUtils.reportFatalError() on the miss.
    // Since that call can happen while this very function is being invoked from inside
    // reportToNative() (itself invoked from an ErrorUtils/1 __d-wrap handler), it risked
    // recursively re-entering the same reporting path for a bogus "unknown module" error
    // instead of - or interleaved with - the real one. It never provided real coverage in
    // release (the only mode this polyfill's capture logic is active in - see IIFE-time
    // mode gate above), so removing it is a strict improvement.
    return null;
  }

  // Stash a reference to React when we see it (any module whose exports has both
  // createElement and Component as functions).
  function maybeCaptureReact(_e) {
    if (global.__sherloReactRef) return;
    if (!_e) return;
    if (typeof _e.createElement === 'function' && typeof _e.Component === 'function') {
      global.__sherloReactRef = _e;
    }
  }

  // Send one message over the app's connection, as JSON, through native code's sendMessage.
  function sendOverTheConnection(message) {
    var nm = getSherloNativeModule();
    if (nm && typeof nm.sendMessage === 'function') {
      nm.sendMessage(JSON.stringify(message));
    }
  }

  // THE START ERROR. A fatal error before Sherlo's Storybook drew is the app's JavaScript dying as
  // it starts, before the SDK's own code ran: this polyfill is the earliest code in the bundle, and
  // native code holds the socket, so it is the one that can still say so. It sends one
  // `start-failed` message per run of the JavaScript (metro/sherloLine.d.ts types it), and a
  // `sherlo capture` waiting on the bundler hears the app's own error instead of a silence.

  // The bundler's Sherlo address, worked out the way startTheLine (src/connection/appLine.ts) does
  // from the url React Native loaded the bundle from; null for a bundle loaded from the device.
  function bundlerLineAddress() {
    var sourceCode = null;
    try {
      if (global.__turboModuleProxy) sourceCode = global.__turboModuleProxy('SourceCode');
    } catch (_) {
      // No TurboModule of that name: the old architecture's proxy is tried next.
    }
    try {
      if (!sourceCode && global.nativeModuleProxy) sourceCode = global.nativeModuleProxy.SourceCode;
    } catch (_) {
      // No SourceCode module at all: the bundle came from no bundler this can name.
    }
    if (!sourceCode) return null;
    var constants =
      typeof sourceCode.getConstants === 'function' ? sourceCode.getConstants() : null;
    var scriptURL =
      constants && constants.scriptURL != null ? constants.scriptURL : sourceCode.scriptURL;
    if (typeof scriptURL !== 'string') return null;
    var origin = /^(https?:\/\/[^/]+)/.exec(scriptURL);
    return origin ? origin[1].replace(/^http/, 'ws') + '/sherlo/line' : null;
  }

  // Say over the app's line that its JavaScript died as it started, dialing the bundler first when
  // the line is not open yet (native code dials only once). Never throws: a failure to send is
  // dropped, and the app's own error handling goes on unchanged.
  function sayTheStartFailed(error) {
    try {
      if (global.__sherloStartFailedSent || global.__sherloStorybookRendered === true) return;
      var nm = getSherloNativeModule();
      if (!nm || typeof nm.sendMessage !== 'function') return;
      global.__sherloStartFailedSent = true;
      var address = bundlerLineAddress();
      if (address !== null && typeof nm.dialBundler === 'function') nm.dialBundler(address);
      nm.sendMessage(
        JSON.stringify({
          action: 'start-failed',
          name: (error && error.name) || 'Error',
          message: (error && error.message) || String(error),
        })
      );
    } catch (_) {
      // Dropped on purpose: the app's own handler still gets the error.
    }
  }

  // A throw out of a top-level module as the bundle runs reaches Metro's fatal report, before any
  // ErrorUtils handler of ours is chained in; a deeper one the app may catch, and if it does not, it
  // comes out of the top-level module too.
  function sayIfTheStartFailed(error) {
    if (bundleStillEvaluating && factoryDepth === 1) sayTheStartFailed(error);
  }

  // Outside testing mode - an app started by hand, before any capture reloaded it into testing mode
  // - only a crash as the bundle runs is watched, so a capture waiting on the bundler hears the
  // app's own error, on either Storybook setup: on the old one the app's root imports the Storybook
  // entry in every mode. Only in a bundle a bundler served; a store build's comes from the device,
  // and it is left as it is.
  function watchOnlyTheStart() {
    if (bundlerLineAddress() === null) return;
    wrapEveryModule(null, null);
  }

  // The one __d wrap. Every module's factory runs counted, so a throw out of a top-level module as
  // the bundle runs is told as a start crash, then thrown on. `extras` (testing mode only) adds the
  // rest around each module: beforeModule(exportsObj), afterModule(moduleId, moduleObj),
  // moduleThrew(error), moduleEnded(exportsObj). Every argument Metro hands __d and the factory
  // passes on as given, the factory alone replaced: a debug run reads __d's 4th, the module's
  // verbose name. `afterTheBundle` runs in the bundle's first microtask, once its modules all ran.
  function wrapEveryModule(extras, afterTheBundle) {
    if (typeof global.__d === 'function' && !global.__sherloDefineWrapped) {
      global.__sherloDefineWrapped = true;
      var originalDefine = global.__d;
      global.__d = function sherloGuardedDefine(factory, moduleId) {
        if (typeof factory !== 'function') {
          // Fallback for any unexpected shape - pass through unwrapped.
          return originalDefine.apply(this, arguments);
        }
        function wrappedFactory(
          _globalObj,
          _requireFn,
          _importDefault,
          _importAll,
          moduleObj,
          exportsObj
        ) {
          if (extras) extras.beforeModule(exportsObj);
          factoryDepth += 1;
          try {
            var factoryResult = factory.apply(this, arguments);
            if (extras) extras.afterModule(moduleId, moduleObj);
            return factoryResult;
          } catch (e) {
            if (extras) extras.moduleThrew(e);
            sayIfTheStartFailed(e);
            throw e;
          } finally {
            factoryDepth -= 1;
            if (extras) extras.moduleEnded(exportsObj);
          }
        }
        var defineArguments = Array.prototype.slice.call(arguments);
        defineArguments[0] = wrappedFactory;
        return originalDefine.apply(this, defineArguments);
      };
    }
    try {
      Promise.resolve().then(function () {
        bundleStillEvaluating = false;
        if (afterTheBundle) afterTheBundle();
      });
    } catch (_) {
      // No promises yet: a later throw out of a top-level module is still told, as a start crash.
    }
  }

  // Patch AppRegistry.registerComponent to wrap the root component in a
  // polyfill-level SherloErrorBoundary. React is resolved lazily at call time
  // from the globally stashed reference.
  function patchAppRegistry(AR) {
    if (!AR || typeof AR.registerComponent !== 'function') return;
    if (AR.__sherloBoundaryPatched) return;

    // Production safety + storybook-mode safety: only patch in testing mode.
    // Mode is queryable here because module factories run after native
    // SherloModule is fully initialized.
    var nm = getSherloNativeModule();
    if (!nm) {
      return;
    }
    var mode = null;
    try {
      var c =
        (typeof nm.getSherloConstants === 'function' ? nm.getSherloConstants() : null) ||
        (typeof nm.getConstants === 'function' ? nm.getConstants() : null);
      mode = c && c.mode;
    } catch (_) {}

    if (mode !== 'testing') {
      return;
    }

    AR.__sherloBoundaryPatched = true;

    var orig = AR.registerComponent.bind(AR);
    AR.registerComponent = function sherloRegisterComponentPolyfill(appKey, componentProvider) {
      return orig(appKey, function () {
        var React = global.__sherloReactRef;
        if (!React) {
          return componentProvider();
        }

        function SherloErrorBoundaryP(props) {
          React.Component.call(this, props);
          this.state = { caught: false };
        }
        SherloErrorBoundaryP.prototype = Object.create(React.Component.prototype);
        SherloErrorBoundaryP.prototype.constructor = SherloErrorBoundaryP;
        SherloErrorBoundaryP.displayName = 'SherloErrorBoundary';
        SherloErrorBoundaryP.getDerivedStateFromError = function (_error) {
          return { caught: true };
        };
        SherloErrorBoundaryP.prototype.componentDidCatch = function (error, _info) {
          try {
            sendOverTheConnection({
              action: 'JS_ERROR',
              data: {
                name: (error && error.name) || 'Error',
                message: (error && error.message) || String(error),
                stack: (error && error.stack) || '',
                componentStack: '',
              },
            });
          } catch (_) {}
          try {
            if (global.ErrorUtils && typeof global.ErrorUtils.reportFatalError === 'function') {
              global.ErrorUtils.reportFatalError(error);
            }
          } catch (_) {}
        };
        SherloErrorBoundaryP.prototype.render = function () {
          return this.state.caught ? null : this.props.children;
        };

        // Wrap user's component in boundary.
        var Component = componentProvider();
        if (!Component || Component._sherloWrapped) return Component;
        function SherloRootP(props) {
          return React.createElement(
            SherloErrorBoundaryP,
            null,
            React.createElement(Component, props)
          );
        }
        SherloRootP._sherloWrapped = true;
        SherloRootP.displayName =
          'SherloRoot(' +
          ((Component && (Component.displayName || Component.name)) || appKey) +
          ')';
        return SherloRootP;
      });
    };
  }

  function reportToNative(error) {
    if (global.__sherloFirstErrorReported) return;
    // Stash the original JS error in a global so the native exception handler can
    // recover the real message if the bridge-call path fails (e.g. on old-arch Android,
    // getSherloNativeModule() returns null and the C++ layer produces a secondary
    // "Could not get BatchedBridge" exception that would otherwise overwrite the message).
    // The native SherloJSExceptionCapture reads this via JSI on the same JS thread.
    try {
      global.__sherloLastJsError = {
        name: (error && error.name) || 'Error',
        message: (error && error.message) || String(error),
        stack: (error && error.stack) || '',
      };
    } catch (_) {}
    try {
      var nm = getSherloNativeModule();
      if (nm && typeof nm.reportEarlyJsError === 'function') {
        nm.reportEarlyJsError(
          (error && error.name) || 'Error',
          (error && error.message) || String(error),
          (error && error.stack) || ''
        );
        global.__sherloFirstErrorReported = true;
      }
    } catch (_) {}
  }

  // 0. globalThis.reportError interceptor - React 19 routes uncaught render-time errors
  //    through globalThis.reportError() (defaultOnUncaughtError → reportGlobalError).
  //    Installing BEFORE ErrorUtils.setGlobalHandler ensures we intercept before the
  //    SDK's setupErrorSilencing replaces console.error with a no-op, which would
  //    otherwise swallow the error before it reaches ExceptionsManager or native handlers.
  //    Reuses the existing reportToNative helper (same sync path as module-eval errors;
  //    reportEarlyJsError is a synchronous TurboModule call returning boolean).
  if (typeof globalThis !== 'undefined' && !globalThis.__sherloReportErrorInstalled) {
    globalThis.__sherloReportErrorInstalled = true;
    var __sherloPrevReportError = globalThis.reportError;
    globalThis.reportError = function (err) {
      try {
        reportToNative(err);
      } catch (_) {}
      if (typeof __sherloPrevReportError === 'function') {
        try {
          __sherloPrevReportError.call(globalThis, err);
        } catch (_) {}
      }
    };
  }

  // 1. ErrorUtils deferred handler - catches async/event errors and entry-level throws.
  //    We DEFER installing until after ExceptionsManager has run, because
  //    ExceptionsManager unconditionally calls setGlobalHandler() during module
  //    evaluation and would OVERWRITE an early-installed handler (spike finding #2).
  //    We late-install by wrapping whatever handler ExceptionsManager set, chaining to it.
  //    Scheduled via Promise.resolve().then() at the bottom of the IIFE so it runs
  //    after all synchronous module evaluation completes.
  function installSherloErrorUtilsHandler() {
    try {
      var EU = typeof ErrorUtils !== 'undefined' ? ErrorUtils : global && global.ErrorUtils;
      if (
        !EU ||
        typeof EU.getGlobalHandler !== 'function' ||
        typeof EU.setGlobalHandler !== 'function'
      ) {
        return;
      }
      var existing = EU.getGlobalHandler();
      if (existing && existing.__sherlo) {
        return;
      }
      function sherloWrapping(error, isFatal) {
        try {
          reportToNative(error);
        } catch (_) {}
        if (isFatal) sayTheStartFailed(error);
        if (typeof existing === 'function') {
          try {
            existing(error, isFatal);
          } catch (_) {}
        }
      }
      sherloWrapping.__sherlo = true;
      EU.setGlobalHandler(sherloWrapping);
    } catch (err) {}
  }

  // 2. __d wrap - wraps every module's factory function with try/catch.
  //    Catches throws in module body regardless of nested _$$_REQUIRE chain
  //    (Metro's local metroRequire ref bypasses any global.__r replacement,
  //    so wrapping __d at the source is the only reliable way to catch
  //    nested module-eval throws).
  //    Rethrows after capturing so RN's native path still fires.
  // 1b. The deferred ErrorUtils handler is installed in the bundle's first microtask.
  //     By the time it runs, ExceptionsManager's setGlobalHandler call
  //     (synchronous, during module evaluation) will already have completed, so
  //     installSherloErrorUtilsHandler wraps it rather than getting overwritten by it.
  wrapEveryModule(
    {
      // Install a setter trap so we can intercept _e.AppRegistry = t synchronously.
      // (UNCONDITIONAL - patchAppRegistry has its own internal mode gate via
      // getSherloConstants. Gating this trap on a JSI-set global risks Android races.)
      beforeModule: function (exportsObj) {
        try {
          var _arValue;
          Object.defineProperty(exportsObj, 'AppRegistry', {
            configurable: true,
            enumerable: false,
            get: function () {
              return _arValue;
            },
            set: function (v) {
              _arValue = v;
              // RN's AR re-exporter writes `_e.AppRegistry = void 0` first, then
              // `_e.AppRegistry = t`; keep the trap armed across the void-0 init.
              if (v && typeof v.registerComponent === 'function') {
                try {
                  patchAppRegistry(v);
                } catch (_) {
                  // Unpatched, the app's root runs without Sherlo's error boundary, as it would.
                }
                try {
                  Object.defineProperty(exportsObj, 'AppRegistry', {
                    value: v,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                  });
                } catch (_) {
                  // The trap's getter still hands back the very AppRegistry.
                }
              }
            },
          });
        } catch (_) {
          // A frozen or odd exports object takes no trap; the module runs on untouched.
        }
      },
      // After the module ran, put the recording stand-in on it.
      afterModule: function (moduleId, moduleObj) {
        try {
          watchModuleExports(moduleId, moduleObj);
        } catch (_) {
          // Watching never breaks the module it watches: it stays as it was.
        }
      },
      moduleThrew: reportToNative,
      moduleEnded: function (exportsObj) {
        try {
          maybeCaptureReact(exportsObj);
        } catch (_) {
          // An exports object that cannot be read is no React; the next module may be.
        }
        // Prong 1 - patch global.RN$AppRegistry directly (new arch).
        // The setter trap on exportsObj.AppRegistry gets overwritten by RN's own
        // getter-only Object.defineProperty redefinition (spike finding #1), so we
        // can't rely on it. New arch publishes AppRegistry as global.RN$AppRegistry
        // - patch that reference directly after each module factory runs.
        try {
          var _arGlobal =
            (typeof global !== 'undefined' && global.RN$AppRegistry) ||
            (typeof globalThis !== 'undefined' && globalThis.RN$AppRegistry);
          if (_arGlobal && !_arGlobal.__sherloBoundaryPatched) {
            patchAppRegistry(_arGlobal);
          }
        } catch (_) {
          // Unpatched, the app's root runs without Sherlo's error boundary, as it would.
        }
      },
    },
    installSherloErrorUtilsHandler
  );

  // 3. ERROR_STORYBOOK_NOT_DISPLAYED timer - fires if the Sherlo Storybook wrapper
  //    was never mounted (e.g. user forgot to wire getStorybook in App.tsx).
  //    Runs unconditionally at boot so the error is detected even when the wrapper
  //    component's useEffect never executes. Mode is read lazily inside the callback
  //    (after 10s) to avoid the Android JSI race condition described above.
  //    global.__sherloStorybookRendered is set by Storybook.tsx when the wrapper renders.
  //    Error code source of truth: src/checkSdkCompatibility.ts
  //    setTimeout may not be available at IIFE time on old-arch Expo 52 (bridge timers
  //    polyfill loads after metro polyfills); the try/catch prevents a polyfill crash.
  try {
    if (!global.__sherloStorybookNotDisplayedTimerInstalled) {
      global.__sherloStorybookNotDisplayedTimerInstalled = true;
      setTimeout(function () {
        try {
          if (global.__sherloStorybookRendered === true) return;
          var sherloNm = getSherloNativeModule();
          if (!sherloNm) return;
          var turboConsts =
            (typeof sherloNm.getSherloConstants === 'function' && sherloNm.getSherloConstants()) ||
            {};
          var nativeConsts =
            (typeof sherloNm.getConstants === 'function' && sherloNm.getConstants()) || {};
          var mode = turboConsts.mode || nativeConsts.mode;
          if (mode !== 'testing') return;
          if (typeof sherloNm.sendNativeError === 'function') {
            sherloNm.sendNativeError(
              'ERROR_STORYBOOK_NOT_DISPLAYED',
              'Storybook did not appear within 10s of app launch',
              ''
            );
          }
        } catch (_) {}
      }, 10000);
    }
  } catch (_) {}

  // THE RECORDER OF A TEST RUN: what the phone does for each story, for the quick check to replay.
  //
  // Installed only in testing mode (the gate above has returned for 'default' and 'storybook') and
  // only on the new architecture, whose Fabric UI manager is there before the bundle runs: on the
  // old one nothing is installed and nothing is recorded, nor in the quick check's replay of the
  // bundle, whose Sherlo module says `isReplay`. Native code reaches the bundle by four
  // seams, each watched here: the module lookups (global.__turboModuleProxy, wrapped here, and
  // NativeModules, the read-only global.nativeModuleProxy handed over by its file), the globals
  // native code installs, the modules native code calls into (handed over as they are registered)
  // and the Fabric renderer's commit and event entry (handed over by lines rewritten in it). The
  // files hand their part over as they finish running (metro/mockSpecifierTransformer.js
  // markNativeRoads). global.nativeFabricUIManager itself is never wrapped: native code reads it
  // back as its own on every event, and a Proxy over it aborts the app. The SDK starts and reads
  // each story's part (src/nativeRecording.ts).
  //
  // THE SHAPE OF THE RECORDING. Every entry takes the next number of one order (`order`), and what
  // came before the first story belongs to every story. A call goes in nativeCalls as
  // { module, method, args, kind: 'sync' | 'async', answer?, threw?, callbacks? }:
  // - A module's method: module and method by name. A constant read is a call of its name with no
  //   arguments, noted once a story; a promise's value or each callback's arguments come later.
  // - A module lookup, each time it is made, found or not: { module: '__turboModuleProxy' or
  //   'nativeModuleProxy', method: 'lookup', args: [name], answer: { $: 'module' } or null }; a
  //   check with `in` on nativeModuleProxy is method 'has', answered true or false.
  // - A global native code installed, before the bundle, during a recorded call or read, or
  //   off every run of native code the recorder sees (then as first seen, with a blind road):
  //   { module: 'global', method: 'installed', args: [name], answer: { $: 'native', handle: name,
  //   type: 'object' or 'function' } }, before any use of it: one there before the first story
  //   belongs to every story, one a call installed follows that call, and one the read of a
  //   module's constant installed comes ahead of the constant's entry. A global holding data as
  //   the bundle began is the same entry with the data written down as its answer. The globals the
  //   bundle began with that the engine or the bundle's own code made come once, ahead of every
  //   story: { module: 'global', method: 'notFromThePhone', args: [name, ...], kind: 'sync' }.
  // - What the quick check needs beyond the calls, each a note of module 'global' that answers
  //   nothing of itself: a global that cannot be replaced as its 'shape' ('laidAfter' when native
  //   code laid it as a run of it ended), each function member's own 'shape' by its handle, and
  //   what lies below them left unread as 'shapeCut' ['unread'] [handle, ...] (keepShape), the
  //   read of a module's method
  //   as 'memberRead' [module, key], and a lookup a story made as 'lookedUp' [lookup, name] with
  //   its answer, the last two once for every story read from then on.
  // - Each use of a native value: module is the value's handle, method the operation, args its
  //   arguments: 'get' [key], 'has' [key], 'ownKeys' [], 'getOwnPropertyDescriptor' [key],
  //   'getPrototypeOf' [], 'set' [key, value], 'defineProperty' [key, descriptor],
  //   'deleteProperty' [key], 'apply' [this, [arg, ...]] and 'construct' [[arg, ...], newTarget],
  //   newTarget the value itself or { $: 'subclass' } for a class of the bundle's extending it.
  //   Symbol keys are not recorded. A descriptor answers { configurable, enumerable, writable?,
  //   value?, get?: true, set?: true }, and this, when it is the global object, { $: 'global' }.
  // - A native object or function, in an answer or an argument, is { $: 'native', handle: '#n',
  //   type }, numbered as first seen; its own uses follow under its handle.
  // - A function of the bundle handed to native is { $: 'callback', handle: '#n' }; native calling
  //   it is { module: '#n', method: 'apply', args: [this, [arg, ...]], kind: 'async' }.
  // - A promise a native value answered is { $: 'promise', handle: '#n' }; as it settles,
  //   { module: '#n', method: 'resolve' or 'reject', args: [value], kind: 'async' }.
  // - A call native code makes into a module the bundle registered as callable (every device event
  //   is one): { module: 'callable:<name>', method, args, kind: 'async' }. One made during a story
  //   is a blind road ('expoNativeEvent', 'callable:<name>.<method>') of every later story.
  // Views' events go in viewEvents, commits in commits. What cannot be recorded is a blind road,
  // never left out: a global the bundle began with that is neither recorded nor its own
  // ('jsiGlobal', 'atStart:<name>'), what the bundle read of a native global laid off every run
  // of native code the recorder sees, before it saw the global ('jsiGlobal', <name>; the global
  // itself is recorded from then on), a value handed to native that cannot be written down ('jsiGlobal', 'unrecordable:<handle>.<op>'),
  // a function bound for a second runtime ('workletRuntime', '<handle>.<op>'), a native value the
  // bundle must get unwrapped ('jsiGlobal', 'unrecordable:<handle>.<key>'), a seam not taken
  // ('jsiGlobal' '__turboModuleProxy' or 'nativeFabricUIManager', 'expoNativeEvent'
  // 'callableModules'). The recorder never changes what the app and native exchange: a module
  // whose method native holds fixed is handed to the bundle as it is, and a stand-in swapped for
  // its native value where the bundle held it goes unseen from then on, both a blind road of every
  // story ('jsiGlobal', 'unwrapped:<module>' or 'unwrapped:<handle>'). A native value whose
  // members native holds fixed is recorded as any other: its stand-in stands on a value of the
  // recorder's own, and native gets back the value itself. A throw in the recorder's own work stops the recording, never the app:
  // every story is then blind ('jsiGlobal', 'recorderStopped'), and the road carries what threw
  // (`why`: its name, message and the top of its stack, each cut short).
  function installNativeRecorder() {
    if (typeof Proxy !== 'function' || typeof WeakMap !== 'function') return;
    if (!global.nativeFabricUIManager) return;

    // Sherlo's own module is the SDK talking, not the story: not recorded.
    var NOT_RECORDED = { SherloModule: true };
    var MAX_DEPTH = 12;
    var recorder = {
      order: 0,
      // The story recording now; null before the first, whose entries every story shares.
      story: null,
      // Each entry, as { story, list, entry }: list is the StoryRecording field it belongs to.
      kept: [],
      // What the current story already noted once: a constant, a blind road.
      notedInStory: {},
      notedInLaunch: {},
      picturesAt: {},
      placeOfView: function () {
        return null;
      },
      rendererRoads: { commit: false, viewEvents: false },
      callableRoad: false,
      // The calls native code made into callable modules since the first story began, each a blind
      // road of every story that starts later.
      callsForLaterStories: {},
      // The number the next native value, callback or promise is handed out under.
      nextHandle: 1,
      // The wrap on the language's source of chance while the load's draws are recorded: what
      // takes it off exactly, the wrap itself, and how many draws it wrote down.
      chance: { undo: null, wrapped: null, drawn: 0 },
    };

    function keep(list, entry, shared) {
      entry.order = recorder.order++;
      recorder.kept.push({ story: shared ? null : recorder.story, list: list, entry: entry });
      return entry;
    }

    function keepBlindRoadOnce(kind, name, shared) {
      var noted = shared ? recorder.notedInLaunch : recorder.notedInStory;
      var key = 'blind ' + kind + ' ' + name;
      if (noted[key]) return null;
      noted[key] = true;
      return keep('blindRoads', { kind: kind, name: name }, shared);
    }

    // The recorder's own work, never the app's nor native's: a throw in it writes the shared blind
    // road that marks every story from then on as unseen, and the app gets `otherwise` instead.
    // Recording goes on after it, so stand-ins and the values behind them keep being exchanged at
    // every crossing as before.
    function quietly(work, otherwise) {
      try {
        return work();
      } catch (failure) {
        stopRecording(failure);
        return otherwise;
      }
    }

    // The first stop writes down what threw, for the stop to be found from the recording alone:
    // the error's name and message and the top frames of its stack, the recorder's step by its
    // place in the bundle, each cut short. Writing it never throws.
    function stopRecording(failure) {
      takeOffChanceWrap();
      var road = keepBlindRoadOnce('jsiGlobal', 'recorderStopped', true);
      if (!road) return;
      var frames = readQuietly(failure, 'stack')
        .split('\n')
        .filter(function (line) {
          return /^\s*at /.test(line);
        });
      road.why = {
        name: cutShort(readQuietly(failure, 'name'), 100),
        message: cutShort(readQuietly(failure, 'message'), 200),
        step: cutShort(frames.slice(0, 3).join('\n'), 400),
      };
    }

    // A member of what was thrown, as text: empty when there is none or reading it throws.
    function readQuietly(failure, key) {
      try {
        var value = failure == null ? undefined : failure[key];
        return value == null ? '' : String(value);
      } catch (_) {
        return '';
      }
    }

    function cutShort(text, length) {
      return text.length > length ? text.slice(0, length) : text;
    }

    var tagOf = function (value) {
      return Object.prototype.toString.call(value);
    };

    // An object of keys and values alone: no prototype, or the plain object's own.
    function isPlainObject(value) {
      var proto = Object.getPrototypeOf(value);
      if (proto === null) return true;
      return Object.getPrototypeOf(proto) === null && tagOf(value) === '[object Object]';
    }

    // A JSON-safe copy of a value, with every value JSON cannot carry marked by a "$" key.
    function serialise(value, depth, seen) {
      if (value === undefined) return { $: 'undefined' };
      if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
      if (typeof value === 'number')
        return isFinite(value) ? value : { $: 'number', value: String(value) };
      if (typeof value === 'bigint') return { $: 'bigint', value: String(value) };
      if (typeof value === 'symbol') return { $unserialisable: 'symbol' };
      if (value === global) return { $: 'global' };
      // A native value, a callback or a promise already handed out is written as its handle.
      var ref = refs.get(value);
      if (ref) return ref;
      if (typeof value === 'function') return { $unserialisable: 'function' };
      if (depth > MAX_DEPTH) return { $unserialisable: 'too deep' };
      if (seen.indexOf(value) !== -1) return { $unserialisable: 'cycle' };
      if (typeof ArrayBuffer !== 'undefined') {
        if (value instanceof ArrayBuffer)
          return { $unserialisable: 'ArrayBuffer', byteLength: value.byteLength };
        if (ArrayBuffer.isView && ArrayBuffer.isView(value))
          return { $unserialisable: tagOf(value), byteLength: value.byteLength };
      }
      if (typeof value.then === 'function') return { $unserialisable: 'promise' };
      var tag = tagOf(value);
      if (tag === '[object Error]') {
        var code = value.code === undefined ? null : value.code;
        return { $: 'error', name: value.name, message: value.message, code: code };
      }
      if (tag === '[object Date]')
        return { $: 'date', value: isNaN(value.getTime()) ? 'Invalid' : value.toISOString() };
      seen.push(value);
      try {
        if (Array.isArray(value)) {
          return value.map(function (item) {
            return serialise(item, depth + 1, seen);
          });
        }
        if (!isPlainObject(value)) {
          // A host object, a class instance or anything JSON would flatten.
          var proto = Object.getPrototypeOf(value);
          var name = proto && proto.constructor && proto.constructor.name;
          return { $unserialisable: 'object', tag: tag, constructor: name || null };
        }
        var copy = {};
        Object.keys(value).forEach(function (key) {
          copy[key] = serialise(value[key], depth + 1, seen);
        });
        return copy;
      } catch (_) {
        // A value that throws as it is read is written down as unreadable.
        return { $unserialisable: 'unreadable', tag: tag };
      } finally {
        seen.pop();
      }
    }
    var serialised = function (value) {
      return serialise(value, 0, []);
    };

    // A native value's handle and its stand-in, both ways, and the handle of every callback and
    // promise handed out; each value is wrapped once, so every use of it is noted once.
    var refs = new WeakMap();
    var standInOfNative = new WeakMap();
    var nativeOfStandIn = new WeakMap();
    var callbackOfFunction = new WeakMap();
    var functionOfCallback = new WeakMap();
    var nextHandle = function () {
      return '#' + recorder.nextHandle++;
    };

    // Every object and function native made that the bundle may hold: each value behind a
    // stand-in and each handed over as it is. Native always gets one back as it is.
    var madeByNative = new WeakSet();

    // Every value native hands the bundle passes here, by whatever road it comes: the one place
    // that marks what native made. One the recorder already knows (a stand-in, a callback, the
    // value behind a stand-in) is not marked again; `forBundle` makes what the bundle gets of the
    // rest, which it gets as it is without one. A known one goes as before: as it is without
    // `forBundle` (a held property must be), else as the bundle met it.
    function fromNative(value, forBundle) {
      if (!safeWrapping.isObjectOrFunction(value) || nativeOfStandIn.has(value)) return value;
      var ref = refs.get(value);
      if (!ref) madeByNative.add(value);
      if (!forBundle) return value;
      if (ref) return standInOfNative.get(value) || functionOfCallback.get(value) || value;
      return forBundle(value);
    }

    // The arguments native calls a bundle function with, each through `fromNative`, as an array.
    function argumentsFromNative(given) {
      return Array.prototype.map.call(given, function (arg) {
        return fromNative(arg, null);
      });
    }

    // Native code may lay globals whenever it runs, in a call or in a read: the globals laid
    // before one of its runs the recorder sees are taken up as it begins, and the ones it laid as
    // it ends, before the bundle runs one more step and could read one unseen.
    function acrossNative(run) {
      quietly(function () {
        takeUpIfLaid(false);
      });
      // The order of the last entry kept before native code runs: what it lays was not there yet.
      var laidAfter = recorder.order - 1;
      try {
        return run();
      } finally {
        quietly(function () {
          takeUpIfLaid(true, laidAfter);
        });
      }
    }

    // A module's method, noting each call with what native answered: the return, the promise's
    // value or each callback's arguments, and what it threw.
    function wrapMethod(moduleName, methodName, method, target) {
      return safeWrapping.withNameAndLengthOf(function () {
        var args = Array.prototype.slice.call(arguments);
        var given = args.map(function (arg) {
          return toNative(arg, moduleName + '.' + methodName, false);
        });
        var call = quietly(function () {
          var noted = keep('nativeCalls', {
            module: moduleName,
            method: methodName,
            args: serialised(args),
            kind: 'sync',
          });
          for (var i = 0; i < args.length; i++) {
            if (typeof args[i] === 'function') {
              given[i] = wrapCallback(noted, i, args[i], moduleName + '.' + methodName);
              noted.kind = 'async';
            }
          }
          return noted;
        }, null);
        var answer;
        try {
          answer = acrossNative(function () {
            return method.apply(target, given);
          });
        } catch (failure) {
          quietly(function () {
            if (call) call.threw = serialised(failure);
          });
          throw failure;
        }
        quietly(function () {
          if (!call) return;
          if (answer && typeof answer.then === 'function') {
            call.kind = 'async';
            answer.then(
              function (value) {
                quietly(function () {
                  fromNative(value, null);
                  call.answer = serialised(value);
                });
              },
              function (failure) {
                quietly(function () {
                  call.threw = serialised(failure);
                });
              }
            );
          } else {
            call.answer = serialised(answer);
          }
        });
        return fromNative(answer, null);
      }, method);
    }

    function wrapCallback(call, index, callback, road) {
      return safeWrapping.withNameAndLengthOf(function () {
        var args = argumentsFromNative(arguments);
        quietly(function () {
          var callbacks = call.callbacks || (call.callbacks = []);
          callbacks.push({ arg: index, args: serialised(args) });
        });
        return toNative(callback.apply(this, arguments), road, false);
      }, callback);
    }

    var wrappedModules = {};
    // A module as the bundle gets it. One reached by two roads (TurboModuleRegistry asks
    // NativeModules) is wrapped once and each call noted once: its stand-in goes on as it is.
    function wrapModule(moduleName, module) {
      return fromNative(module, function (real) {
        if (NOT_RECORDED[moduleName]) return real;
        var known = wrappedModules[moduleName];
        if (known && known.module === real) return known.standIn;
        if (hasHeldNativeMethod(real)) {
          keepBlindRoadOnce('jsiGlobal', 'unwrapped:' + moduleName, true);
          return real;
        }
        var methods = {};
        var standIn = new Proxy(real, {
          get: function (target, key) {
            var value = fromNative(
              acrossNative(function () {
                return target[key];
              }),
              null
            );
            if (typeof key !== 'string') return value;
            return quietly(function () {
              return moduleMemberForBundle(moduleName, methods, target, key, value);
            }, value);
          },
        });
        wrappedModules[moduleName] = { module: real, standIn: standIn };
        nativeOfStandIn.set(standIn, real);
        return standIn;
      });
    }

    // What the bundle gets of a module's member: a method as one that notes each call, a constant
    // as it is, noted once a story as a call of its name. The read of a method is noted too, once,
    // for every story, as { module: 'global', method: 'memberRead', args: [module, key], kind:
    // 'sync', answer: what it is (kindOf) }: the bundle may read one to bind or test it and never
    // call it, and a module's file the bundle first runs in a story runs in no later story.
    function moduleMemberForBundle(moduleName, methods, target, key, value) {
      if (typeof value === 'function') {
        noteOnceForEveryStory('memberRead', [moduleName, key], kindOf(value));
        var isHeld = false;
        try {
          isHeld = safeWrapping.isHeldToItsValue(target, key);
        } catch (_) {
          // A host object may refuse the look: the method is then wrapped as any other.
        }
        // A frozen property must be handed back as it is, or the Proxy throws.
        if (isHeld) return value;
        var cached = methods[key];
        if (cached && cached.method === value) return cached.wrapper;
        var wrapper = wrapMethod(moduleName, key, value, target);
        methods[key] = { method: value, wrapper: wrapper };
        return wrapper;
      }
      var constantKey = 'constant ' + moduleName + '.' + key;
      if (!recorder.notedInStory[constantKey]) {
        recorder.notedInStory[constantKey] = true;
        keep('nativeCalls', {
          module: moduleName,
          method: key,
          args: [],
          kind: 'sync',
          answer: serialised(value),
        });
      }
      return value;
    }

    // A lookup of a native module by name, noted each time it is made with whether it found one:
    // that changes what the app draws. The module goes out as its recording stand-in.
    function noteLookup(lookupModule, moduleName, find) {
      if (typeof moduleName !== 'string' || NOT_RECORDED[moduleName]) return find();
      var lookup = quietly(function () {
        return keep('nativeCalls', {
          module: lookupModule,
          method: 'lookup',
          args: [moduleName],
          kind: 'sync',
        });
      }, null);
      var module;
      try {
        module = acrossNative(find);
      } catch (failure) {
        quietly(function () {
          if (lookup) lookup.threw = serialised(failure);
        });
        throw failure;
      }
      return quietly(function () {
        lookup.answer = module == null ? null : { $: 'module' };
        if (recorder.story !== null) {
          noteOnceForEveryStory('lookedUp', [lookupModule, moduleName], lookup.answer);
        }
        return wrapModule(moduleName, module);
      }, module);
    }

    // A fact of the run a story learned, noted once for every story read from then on: a file
    // the bundle first runs in a story is not run again by a later story of the same run, which
    // the quick check runs fresh.
    function noteOnceForEveryStory(method, args, answer) {
      var key = method + ' ' + JSON.stringify(args);
      if (recorder.notedInLaunch[key]) return;
      recorder.notedInLaunch[key] = true;
      keep(
        'nativeCalls',
        { module: 'global', method: method, args: args, kind: 'sync', answer: answer },
        true
      );
    }

    // The lookup TurboModuleRegistry reads as it loads, which native code installs off the
    // bridgeless runtime; a bridgeless runtime looks up through global.nativeModuleProxy alone.
    function watchTurboModuleProxy() {
      var real = global.__turboModuleProxy;
      if (typeof real !== 'function') return;
      var watched = safeWrapping.withNameAndLengthOf(function (moduleName) {
        var self = this;
        var args = arguments;
        return noteLookup('__turboModuleProxy', moduleName, function () {
          return real.apply(self, args);
        });
      }, real);
      try {
        global.__turboModuleProxy = watched;
      } catch (_) {
        // A lookup that cannot be replaced is checked below.
      }
      if (global.__turboModuleProxy !== watched) {
        keepBlindRoadOnce('jsiGlobal', '__turboModuleProxy', true);
      }
    }

    // Lays `wrapper` as `exportName` of the module's exports: assigned, or else defined anew. An
    // export the engine holds fixed (a compiler may lay one as a getter that is not configurable)
    // can be neither, nor can a new one on exports that take none: the exports are then laid again
    // around the wrapper.
    function replaceExport(module, exportName, wrapper) {
      try {
        module.exports[exportName] = wrapper;
      } catch (_) {
        // A read-only export: it is laid below.
      }
      if (module.exports[exportName] === wrapper) return;
      var canDefine = safeWrapping.hasOwn(module.exports, exportName)
        ? !safeWrapping.isFixedProperty(module.exports, exportName)
        : Object.isExtensible(module.exports);
      if (canDefine) {
        Object.defineProperty(module.exports, exportName, {
          value: wrapper,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        return;
      }
      var exportsAgain = { __esModule: true };
      Object.keys(module.exports).forEach(function (key) {
        exportsAgain[key] = module.exports[key];
      });
      exportsAgain[exportName] = wrapper;
      module.exports = exportsAgain;
    }

    // NativeModules hands out each module as a property of its default export: a Proxy of it is
    // laid in its place. Each read of a module is a lookup, and so is each check with `in`.
    function wrapNativeModules(module) {
      var real = module.exports.default;
      var wrapped = fromNative(real, standInOfModuleTable);
      if (wrapped === real) return;
      replaceExport(module, 'default', wrapped);
    }

    function standInOfModuleTable(real) {
      var wrapped = new Proxy(
        {},
        {
          get: function (_, key) {
            if (typeof key !== 'string') return real[key];
            return noteLookup('nativeModuleProxy', key, function () {
              return real[key];
            });
          },
          has: function (_, key) {
            var found = key in real;
            if (typeof key === 'string' && !NOT_RECORDED[key]) {
              quietly(function () {
                keep('nativeCalls', {
                  module: 'nativeModuleProxy',
                  method: 'has',
                  args: [key],
                  kind: 'sync',
                  answer: found,
                });
              });
            }
            return found;
          },
        }
      );
      nativeOfStandIn.set(wrapped, real);
      return wrapped;
    }

    // Sherlo's own messages are the SDK talking, not the app. The polyfill runs before any module,
    // so it cannot import their names: the same names as src/connection/appLine.ts (MESSAGE_EVENT)
    // and src/mocking/networkNative.ts (UNANSWERED_EVENT), held to them by the recorder's test.
    var SHERLO_OWN_DEVICE_EVENTS = { SherloMessage: true, SherloUnansweredRequest: true };
    var isSherloOwnCall = function (moduleName, methodName, args) {
      return (
        moduleName === 'RCTDeviceEventEmitter' &&
        methodName === 'emit' &&
        SHERLO_OWN_DEVICE_EVENTS[args[0]] === true
      );
    };

    // A module native code calls into, as native code gets it: every call is noted with its
    // arguments, in order, before the module runs it. What a call told the JavaScript stays (the
    // app's state, the screen's size), so one made during a story blinds every later story.
    function callableStandIn(moduleName, callable) {
      if (!safeWrapping.isObjectOrFunction(callable)) return callable;
      var methods = {};
      return new Proxy(callable, {
        get: function (target, key) {
          var value = target[key];
          if (typeof key !== 'string' || typeof value !== 'function') return value;
          var cached = methods[key];
          if (cached && cached.method === value) return cached.wrapper;
          var wrapper = safeWrapping.withNameAndLengthOf(function () {
            var args = argumentsFromNative(arguments);
            quietly(function () {
              if (isSherloOwnCall(moduleName, key, args)) return;
              keep('nativeCalls', {
                module: 'callable:' + moduleName,
                method: key,
                args: serialised(args),
                kind: 'async',
              });
              if (recorder.story !== null) {
                recorder.callsForLaterStories['callable:' + moduleName + '.' + key] = true;
              }
            });
            return value.apply(target, args);
          }, value);
          methods[key] = { method: value, wrapper: wrapper };
          return wrapper;
        },
      });
    }

    // The registration of a module native code may call into: native code is handed each module
    // as its recording stand-in.
    function watchCallableModules(module) {
      var register = module.exports.default;
      if (typeof register !== 'function') return;
      var registerWatched = safeWrapping.withNameAndLengthOf(function (name, moduleOrFactory) {
        var factory =
          typeof moduleOrFactory === 'function'
            ? moduleOrFactory
            : function () {
                return moduleOrFactory;
              };
        var made = safeWrapping.withNameAndLengthOf(function () {
          return callableStandIn(String(name), factory.apply(this, arguments));
        }, factory);
        return register.call(this, name, made);
      }, register);
      replaceExport(module, 'default', registerWatched);
      recorder.callableRoad = module.exports.default !== register;
    }

    var roadHooks = {
      'react-native/Libraries/BatchedBridge/NativeModules.js': wrapNativeModules,
      'react-native/Libraries/Core/registerCallableModule.js': watchCallableModules,
    };
    // Called by the line each road's file ends with, as that file's module finishes running.
    global.__sherloNativeRoad = function (road, module) {
      var hook = roadHooks[road];
      if (!hook || !module || !module.exports) return;
      // A road that cannot be wrapped is left as it is, and the app runs on unrecorded.
      quietly(function () {
        hook(module);
      });
    };

    // The Fabric renderer's commit of the tree, handed over by the line rewritten in it.
    global.__sherloCommitRoad = function (completeRoot) {
      recorder.rendererRoads.commit = true;
      return safeWrapping.withNameAndLengthOf(function () {
        quietly(function () {
          keep('commits', {});
        });
        return completeRoot.apply(this, arguments);
      }, completeRoot);
    };

    // The Fabric renderer's event entry: every event a view sends passes here, with the view it
    // came from, before React runs it.
    global.__sherloViewEventRoad = function (dispatchEvent) {
      recorder.rendererRoads.viewEvents = true;
      return safeWrapping.withNameAndLengthOf(function (target, type, nativeEvent) {
        quietly(function () {
          keep('viewEvents', viewEventOf(target, type, nativeEvent));
        });
        return dispatchEvent.apply(this, arguments);
      }, dispatchEvent);
    };

    function viewEventOf(target, type, nativeEvent) {
      var canonical = target && target.stateNode && target.stateNode.canonical;
      var viewName = canonical && canonical.viewConfig && canonical.viewConfig.uiViewClassName;
      var place = null;
      try {
        place = recorder.placeOfView(target);
      } catch (_) {
        // A view whose place cannot be read is written down as outside the story.
      }
      return {
        component: viewName || (target && typeof target.type === 'string' ? target.type : ''),
        event: String(type),
        payload: serialised(nativeEvent),
        place: place,
      };
    }

    // THE NATIVE VALUES. A global native code installed, and every object or function reached
    // from it, goes to the bundle as a stand-in that notes each use with its answer.

    // The JavaScript engine's own prototypes: what a native value inherits from them is the
    // engine's, handed back as it is, so `call`, `bind` and the like run on the stand-in itself.
    var enginePrototypes = [Object.prototype, Function.prototype, Array.prototype];
    if (typeof Error === 'function') enginePrototypes.push(Error.prototype);
    if (typeof Promise === 'function') enginePrototypes.push(Promise.prototype);

    // A function native code made. Never a stand-in, though a Proxy's source reads as native code.
    function isNativeFunction(value) {
      if (typeof value !== 'function' || nativeOfStandIn.has(value)) return false;
      var source = Function.prototype.toString.call(value);
      return source.indexOf('[native code]') !== -1 && String(value.name).indexOf('bound ') !== 0;
    }

    // Made by native code: a function whose source it holds, an object with no prototype, or an
    // object carrying such a function; never a stand-in. Read through descriptors only: a getter is
    // never run.
    function isNativeValue(value) {
      if (value === null || value === global || enginePrototypes.indexOf(value) !== -1) {
        return false;
      }
      if (nativeOfStandIn.has(value)) return false;
      if (typeof value === 'function') return isNativeFunction(value);
      if (typeof value !== 'object') return false;
      try {
        if (Object.getPrototypeOf(value) === null) return true;
        return Object.getOwnPropertyNames(value).some(function (key) {
          var description = Object.getOwnPropertyDescriptor(value, key);
          return !!description && 'value' in description && isNativeFunction(description.value);
        });
      } catch (_) {
        // An object that refuses the look is a host object's.
        return true;
      }
    }

    var nativeOf = function (value) {
      return nativeOfStandIn.get(value) || value;
    };

    // What the bundle gets of a value a native value handed it: data as it is, written down whole;
    // a promise as one that notes how it settled; a callback as the bundle's own function; any
    // other object or function as its stand-in, so nothing reached from native goes unseen.
    function toBundle(value) {
      return fromNative(value, function (real) {
        if (typeof Promise === 'function' && real instanceof Promise) return settlingOf(real);
        if (typeof real === 'object' && isData(real)) return real;
        return standInFor(real, nextHandle());
      });
    }

    // Whether the engine holds an own property of the value to a native function, neither
    // configurable nor writable: a Proxy on the value must hand back that very function, which
    // the bundle then calls with the Proxy as `this`, and native would get the Proxy. A value that
    // refuses the look may hold one.
    function hasHeldNativeMethod(value) {
      try {
        return Object.getOwnPropertyNames(value).some(function (key) {
          return safeWrapping.isHeldToItsValue(value, key) && isNativeFunction(value[key]);
        });
      } catch (_) {
        return true;
      }
    }

    // Data: an object written down whole, holding nothing a stand-in would have to watch. Only its
    // own keys are read (serialise goes by Object.keys), so a member reached through `super` or
    // the prototype is not recorded: the draw meets it unwritten and throws, never draws it wrong.
    function isData(value) {
      return isWrittenWhole(serialised(value), false);
    }

    // Whether a value written down holds nothing left unwritten nor any handle; a function left
    // unwritten is let pass when `exceptFunctions`.
    function isWrittenWhole(written, exceptFunctions) {
      var text = JSON.stringify(written);
      if (exceptFunctions) text = withoutUnwrittenFunctions(text);
      return text.indexOf('"$unserialisable"') === -1 && text.indexOf('"handle"') === -1;
    }

    function withoutUnwrittenFunctions(text) {
      return text.replace(/"\$unserialisable":"function"/g, '');
    }

    function settlingOf(promise) {
      var ref = { $: 'promise', handle: nextHandle() };
      var settled = promise.then(
        function (value) {
          return quietly(function () {
            var given = toBundle(value);
            keep('nativeCalls', {
              module: ref.handle,
              method: 'resolve',
              args: [serialised(given)],
              kind: 'async',
            });
            return given;
          }, value);
        },
        function (failure) {
          quietly(function () {
            keep('nativeCalls', {
              module: ref.handle,
              method: 'reject',
              args: [serialised(failure)],
              kind: 'async',
            });
          });
          throw failure;
        }
      );
      refs.set(promise, ref);
      refs.set(settled, ref);
      standInOfNative.set(promise, settled);
      return settled;
    }

    // What native code gets of a value the bundle hands it (`road`: the handle and the use it goes
    // by). What native made goes as it is, never copied, wrapped or changed inside. Each stand-in
    // goes as the native value it stands for, at any depth: in an array or a plain object, which
    // goes as a copy; in any other container, which is changed in place, its road noted blind, or
    // copied where it cannot be changed. A function of the bundle goes as a callback that notes
    // each call native makes of it, where `makesCallbacks` (the caller wraps the top-level ones
    // itself otherwise); one left as it is inside the value goes unseen, so the road is blind. One
    // carrying properties of its own is bound for another runtime (a worklet's), whose globals the
    // recorder cannot see, so it goes as it is, its members as native code must get them, and the
    // road is blind.
    function toNative(value, road, makesCallbacks) {
      var walk = { road: road, makesCallbacks: makesCallbacks, copies: new Map() };
      return nativeWithin(value, walk, false);
    }

    // `walk.copies`: each container met so far and what native gets of it, so a cycle stays a
    // cycle. `inPlace`: the value sits in a container changed in place, so it is changed in place
    // too. A throw as a container is read is the recorder's own, which stops the recording; the
    // rest of the walk goes on, and the container goes as it is: what the recorder cannot read of
    // it, native cannot read either, so no stand-in reaches native through it.
    function nativeWithin(value, walk, inPlace) {
      if (!safeWrapping.isObjectOrFunction(value)) return value;
      if (nativeOfStandIn.has(value)) return nativeOfStandIn.get(value);
      if (madeByNative.has(value)) return value;
      if (refs.get(value)) return callbackOfFunction.get(value) || value;
      if (walk.copies.has(value)) return walk.copies.get(value);
      try {
        return containerToNative(value, walk, inPlace);
      } catch (failure) {
        stopRecording(failure);
        walk.copies.set(value, value);
        return value;
      }
    }

    function containerToNative(value, walk, inPlace) {
      if (typeof value === 'function') {
        if (Object.keys(value).length > 0) {
          keepBlindRoadOnce('workletRuntime', walk.road, false);
          return membersToNative(value, walk);
        }
        // One in a container changed in place stays the app's own.
        if (walk.makesCallbacks && !inPlace) return callbackFor(value);
        if (walk.copies.size > 0) {
          keepBlindRoadOnce('jsiGlobal', 'unrecordable:' + walk.road, false);
        }
        return value;
      }
      var isTree = Array.isArray(value) || isPlainObject(value);
      if (isTree && (!inPlace || Object.isFrozen(value))) return treeToNative(value, walk);
      if (!isTree && isUnwalked(value)) return value;
      return membersToNative(value, walk);
    }

    // What holds no stand-in the bundle could have put there: a promise, binary data, the global
    // object.
    function isUnwalked(value) {
      if (value === global || (typeof Promise === 'function' && value instanceof Promise)) {
        return true;
      }
      if (typeof ArrayBuffer === 'undefined') return false;
      return value instanceof ArrayBuffer || (!!ArrayBuffer.isView && ArrayBuffer.isView(value));
    }

    // An array or a plain object of the bundle holding a function or a stand-in at some depth is
    // handed to native as a copy, frozen if it was, each member as native code must get it, so
    // the bundle keeps its stand-ins and their uses are still noted. A getter goes onto the copy
    // as it is, never run. One holding neither goes as it is; a cycle is always copied, as its
    // copy holds itself.
    function treeToNative(value, walk) {
      var copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
      walk.copies.set(value, copy);
      var changed = false;
      Object.keys(value).forEach(function (key) {
        var description = Object.getOwnPropertyDescriptor(value, key);
        if (!('value' in description)) {
          Object.defineProperty(copy, key, description);
          return;
        }
        copy[key] = nativeWithin(description.value, walk, false);
        if (copy[key] !== description.value) changed = true;
      });
      if (!changed) {
        walk.copies.set(value, value);
        return value;
      }
      if (Object.isFrozen(value)) Object.freeze(copy);
      return copy;
    }

    // Any other container (a class instance, a Map, a Set, a function's own properties) cannot be
    // copied without changing what the app holds: each stand-in in it is swapped for its native
    // value in place, a member read through its descriptor so no getter runs. The bundle holds the
    // native value from then on, so its uses go unseen: a blind road of every story. One with a
    // member that cannot be changed (frozen, or not writable) is copied instead, with what it is
    // made from, frozen if it was, and the bundle keeps its stand-ins: an object onto its
    // prototype, a function as one that runs it.
    function membersToNative(value, walk) {
      walk.copies.set(value, value);
      var swaps = [];
      Object.getOwnPropertyNames(value).forEach(function (key) {
        var description = Object.getOwnPropertyDescriptor(value, key);
        if (!description || !('value' in description)) return;
        var given = nativeWithin(description.value, walk, true);
        if (given !== description.value) {
          swaps.push({ key: key, description: description, given: given });
        }
      });
      entriesToNative(value, walk);
      if (swaps.length === 0) return value;
      var canSwap =
        !Object.isFrozen(value) &&
        swaps.every(function (swap) {
          return swap.description.writable;
        });
      if (canSwap) {
        swaps.forEach(function (swap) {
          noteUnwrapped(swap.description.value);
          value[swap.key] = swap.given;
        });
        return value;
      }
      var madeOf = {};
      Object.getOwnPropertyNames(value).forEach(function (key) {
        madeOf[key] = Object.getOwnPropertyDescriptor(value, key);
      });
      swaps.forEach(function (swap) {
        madeOf[swap.key].value = swap.given;
      });
      var copy;
      if (typeof value === 'function') {
        copy = function () {
          return value.apply(this, arguments);
        };
        Object.defineProperties(copy, madeOf);
      } else {
        copy = Object.create(Object.getPrototypeOf(value), madeOf);
      }
      if (Object.isFrozen(value)) Object.freeze(copy);
      walk.copies.set(value, copy);
      return copy;
    }

    // A Map's keys and values and a Set's members, swapped in place as membersToNative swaps.
    function entriesToNative(value, walk) {
      var tag = tagOf(value);
      if (tag !== '[object Map]' && tag !== '[object Set]') return;
      var isMap = tag === '[object Map]';
      var kind = isMap ? Map : Set;
      var entries = [];
      var changed = false;
      kind.prototype.forEach.call(value, function (member, key) {
        var given = nativeWithin(member, walk, true);
        var givenKey = isMap ? nativeWithin(key, walk, true) : given;
        if (given !== member || givenKey !== key) changed = true;
        entries.push([givenKey, given, key, member]);
      });
      if (!changed) return;
      kind.prototype.clear.call(value);
      entries.forEach(function (entry) {
        if (entry[1] !== entry[3]) noteUnwrapped(entry[3]);
        if (isMap && entry[0] !== entry[2]) noteUnwrapped(entry[2]);
        if (isMap) Map.prototype.set.call(value, entry[0], entry[1]);
        else Set.prototype.add.call(value, entry[0]);
      });
    }

    // A stand-in the bundle no longer holds where it held it: what it is used for there goes unseen.
    // A native value's stand-in goes by its handle, a module's by the module's name, and the
    // modules' own by the name it has in the bundle.
    function noteUnwrapped(held) {
      if (!nativeOfStandIn.has(held)) return;
      var ref = refs.get(held);
      var moduleNames = Object.keys(wrappedModules).filter(function (name) {
        return wrappedModules[name].standIn === held;
      });
      var name = ref ? ref.handle : moduleNames[0] || 'nativeModuleProxy';
      keepBlindRoadOnce('jsiGlobal', 'unwrapped:' + name, true);
    }

    function callbackFor(callable) {
      var ref = { $: 'callback', handle: nextHandle() };
      var callback = safeWrapping.withNameAndLengthOf(function () {
        var self = this;
        var args = Array.prototype.slice.call(arguments);
        var given = quietly(function () {
          var bundled = args.map(function (arg) {
            return toBundle(arg);
          });
          keep('nativeCalls', {
            module: ref.handle,
            method: 'apply',
            args: [serialised(self), serialised(bundled)],
            kind: 'async',
          });
          return bundled;
        }, args);
        return toNative(callable.apply(this, given), ref.handle + '.apply', false);
      }, callable);
      refs.set(callable, ref);
      refs.set(callback, ref);
      callbackOfFunction.set(callable, callback);
      functionOfCallback.set(callback, callable);
      return callback;
    }

    // The arguments as written down, with a blind road when any part of them cannot be. They have
    // been through toNative first, which gave every function a callback handle, so the only
    // function left unwritten within the depth written down is one bound for another runtime,
    // which has a blind road of its own; one deeper is written as too deep, a blind road too.
    function argumentsAsRecorded(args, road) {
      var written = serialised(args);
      var unwritten = withoutUnwrittenFunctions(JSON.stringify(written));
      if (unwritten.indexOf('"$unserialisable"') !== -1) {
        keepBlindRoadOnce('jsiGlobal', 'unrecordable:' + road, false);
      }
      return written;
    }

    // One use of a native value: noted before it runs, so whatever it sets off comes after it,
    // with its answer or what it threw. `run` is native's own work, the only part a throw of which
    // reaches the bundle; `forBundle` makes what the bundle gets of the answer (the answer itself
    // when absent) and `asRecorded` what is written down of that (serialised when absent). Any use,
    // a read as much as a call, may install globals as it runs: they are taken up.
    function noteUse(handle, operation, argsAsRecorded, run, forBundle, asRecorded) {
      var use = quietly(function () {
        return keep('nativeCalls', {
          module: handle,
          method: operation,
          args: argsAsRecorded(),
          kind: 'sync',
        });
      }, null);
      var answer;
      try {
        answer = acrossNative(run);
      } catch (failure) {
        quietly(function () {
          if (use) use.threw = serialised(failure);
        });
        throw failure;
      }
      return quietly(function () {
        var given = forBundle ? forBundle(answer) : answer;
        if (use) use.answer = asRecorded ? asRecorded(given) : serialised(given);
        return given;
      }, answer);
    }

    // Whether the engine's own prototypes hand out the property: the engine's, not native code's.
    function isEngineOwn(real, key) {
      var owner = real;
      while (owner) {
        if (safeWrapping.hasOwn(owner, key)) {
          return enginePrototypes.indexOf(owner) !== -1;
        }
        owner = nativeOf(Object.getPrototypeOf(owner));
      }
      return false;
    }

    // WHAT THE GROUND ALLOWS. The engine checks a stand-in's answers against its ground, and an
    // answer it refuses throws in the bundle. So each answer it checks is made, by the rules of
    // what a target allows (src/safeWrapping.ts), from the value's answer and the ground as it is
    // at that moment, on every path, a raw answer after a failed recording too.

    // A member's description as the bundle gets it: its value, where it has one, as the bundle
    // gets it.
    function asBundleGetsIt(description) {
      if (description && 'value' in description) description.value = toBundle(description.value);
      return description;
    }

    // The member as the value holds it once the bundle defined it with `description`: each field
    // the bundle gave as it gave it, the rest as the value has them, a value as the bundle gets it.
    // Read only where the member may be fixed, and none where the value has no such member.
    function heldAfterDefinition(ground, real, key, description) {
      var mayBeFixed =
        description.configurable !== true || safeWrapping.isFixedProperty(ground, key);
      var held = mayBeFixed ? Reflect.getOwnPropertyDescriptor(real, key) : undefined;
      if (!held) return undefined;
      if (!('value' in description)) asBundleGetsIt(held);
      Object.keys(description).forEach(function (field) {
        held[field] = description[field];
      });
      return held;
    }

    function descriptorAsRecorded(description) {
      if (!description) return { $: 'undefined' };
      var written = { configurable: description.configurable, enumerable: description.enumerable };
      if ('value' in description) {
        written.writable = description.writable;
        written.value = serialised(description.value);
      }
      if (description.get) written.get = true;
      if (description.set) written.set = true;
      return written;
    }

    // Each use goes to `real`; `ground`, what the stand-in stands on (groundOfStandIn), is read
    // only where the engine checks an answer against it.
    function standInHandler(handle, real) {
      // A use whose answer the engine checks, made as the ground allows inside the use, so the
      // recording holds what the bundle gets. `allows` never throws, so the answer is always made
      // so. A key that is no string goes unrecorded.
      function checkedUse(trap, key, recordedArguments, use, allows) {
        if (typeof key !== 'string') return allows(use());
        return noteUse(handle, trap, recordedArguments, use, allows);
      }

      return {
        get: function (ground, key, receiver) {
          var self = nativeOf(receiver);
          var isHeld = safeWrapping.isReadHeldByTarget(ground, key);
          var isNativeUse = quietly(function () {
            return typeof key === 'string' && !isEngineOwn(real, key);
          }, false);
          if (!isNativeUse) return Reflect.get(isHeld ? ground : real, key, self);
          return noteUse(
            handle,
            'get',
            function () {
              return [key];
            },
            function () {
              return Reflect.get(isHeld ? ground : real, key, self);
            },
            function (value) {
              if (!isHeld) return toBundle(value);
              // The bundle gets what the ground holds, laid there as the bundle gets it; a native
              // value laid unwrapped keeps its own uses unseen.
              if (isNativeValue(value) && !refs.get(value)) {
                keepBlindRoadOnce('jsiGlobal', 'unrecordable:' + handle + '.' + key, false);
              }
              return value;
            }
          );
        },
        // Each answer below the engine checks is made as the ground allows.
        has: function (ground, key) {
          return checkedUse(
            'has',
            key,
            function () {
              return [key];
            },
            function () {
              return Reflect.has(real, key);
            },
            function (isIn) {
              return safeWrapping.hasTargetAllows(ground, key, isIn);
            }
          );
        },
        ownKeys: function (ground) {
          return noteUse(
            handle,
            'ownKeys',
            function () {
              return [];
            },
            function () {
              return Reflect.ownKeys(real);
            },
            function (answer) {
              return safeWrapping.keysTargetAllows(ground, answer);
            },
            function (answer) {
              return answer.filter(function (key) {
                return typeof key === 'string';
              });
            }
          );
        },
        // Made as the ground allows once the use is noted: a value that refuses the look as the
        // bundle would get it, which stops the recording, hands back its member as it holds it.
        getOwnPropertyDescriptor: function (ground, key) {
          var description =
            typeof key !== 'string'
              ? Reflect.getOwnPropertyDescriptor(real, key)
              : noteUse(
                  handle,
                  'getOwnPropertyDescriptor',
                  function () {
                    return [key];
                  },
                  function () {
                    return Reflect.getOwnPropertyDescriptor(real, key);
                  },
                  asBundleGetsIt,
                  descriptorAsRecorded
                );
          // A member the value holds fixed is laid on the ground as for a definition, so the
          // stand-in reports it as the value holds it. A ground that cannot take it keeps its own.
          safeWrapping.defineTargetAllows(ground, key, description, true);
          return safeWrapping.descriptionTargetAllows(ground, key, description);
        },
        getPrototypeOf: function (ground) {
          return noteUse(
            handle,
            'getPrototypeOf',
            function () {
              return [];
            },
            function () {
              return Reflect.getPrototypeOf(real);
            },
            function (answer) {
              return safeWrapping.prototypeTargetAllows(ground, toBundle(answer));
            }
          );
        },
        // As the value says, unrecorded; a value that took no new members since its stand-in was
        // made closes the ground first, as the engine asks. A value that refuses the look is
        // answered as the ground is.
        isExtensible: function (ground) {
          var isOpen = true;
          try {
            isOpen = Reflect.isExtensible(real);
          } catch (_) {
            // A host object's refusal: the ground's own answer stands.
          }
          if (!isOpen && Reflect.isExtensible(ground)) closeGround(ground, real);
          return Reflect.isExtensible(ground);
        },
        // The value's own prototype changes, unrecorded; a closed ground keeps its own, and the
        // stand-in says so, as the engine asks.
        setPrototypeOf: function (ground, prototype) {
          var isSet = Reflect.setPrototypeOf(real, nativeOf(prototype));
          return isSet && safeWrapping.prototypeTargetAllows(ground, prototype) === prototype;
        },
        // As the value answers: the ground holds fixed only what the value holds fixed, as the
        // bundle gets it, so a write the value takes the ground allows.
        set: function (_ground, key, value, receiver) {
          if (typeof key !== 'string') return Reflect.set(real, key, value, nativeOf(receiver));
          var road = handle + '.set';
          var given = toNative(value, road, true);
          return noteUse(
            handle,
            'set',
            function () {
              return [key, argumentsAsRecorded(value, road)];
            },
            function () {
              return Reflect.set(real, key, given, nativeOf(receiver));
            }
          );
        },
        // A member the value then holds fixed is laid on the ground too, as the bundle gave it.
        defineProperty: function (ground, key, description) {
          var given = description;
          if (typeof key === 'string') {
            given = {};
            Object.keys(description).forEach(function (field) {
              given[field] = toNative(description[field], handle + '.defineProperty', true);
            });
          }
          return checkedUse(
            'defineProperty',
            key,
            function () {
              return [key, descriptorAsRecorded(description)];
            },
            function () {
              return Reflect.defineProperty(real, key, given);
            },
            // A value that refuses the look is taken to hold the member as the bundle gave it.
            function (isDefined) {
              var held = !isDefined
                ? undefined
                : quietly(function () {
                    return heldAfterDefinition(ground, real, key, description);
                  }, description);
              return safeWrapping.defineTargetAllows(ground, key, held, isDefined);
            }
          );
        },
        // A member the value lost, the ground loses too.
        deleteProperty: function (ground, key) {
          return checkedUse(
            'deleteProperty',
            key,
            function () {
              return [key];
            },
            function () {
              return Reflect.deleteProperty(real, key);
            },
            function (isDeleted) {
              return safeWrapping.deleteTargetAllows(ground, key, isDeleted);
            }
          );
        },
        // The value itself stops taking members, as unrecorded; its ground closes with it.
        preventExtensions: function (ground) {
          var isPrevented = Reflect.preventExtensions(real);
          if (isPrevented && Reflect.isExtensible(ground)) {
            closeGround(ground, real);
          }
          return isPrevented;
        },
        apply: function (_ground, self, args) {
          var road = handle + '.apply';
          var given = args.map(function (arg) {
            return toNative(arg, road, true);
          });
          var givenSelf = toNative(self, road, false);
          return noteUse(
            handle,
            'apply',
            function () {
              return [serialised(self), argumentsAsRecorded(args, road)];
            },
            function () {
              return Reflect.apply(real, givenSelf, given);
            },
            function (answer) {
              return toBundle(answer);
            }
          );
        },
        construct: function (_ground, args, newTarget) {
          var road = handle + '.construct';
          var given = args.map(function (arg) {
            return toNative(arg, road, true);
          });
          var isOwn = nativeOf(newTarget) === real;
          return noteUse(
            handle,
            'construct',
            function () {
              return [argumentsAsRecorded(args, road), isOwn ? refs.get(real) : { $: 'subclass' }];
            },
            function () {
              return Reflect.construct(real, given, isOwn ? real : newTarget);
            },
            function (made) {
              return fromNative(made, function (madeReal) {
                return standInFor(madeReal, nextHandle());
              });
            }
          );
        },
      };
    }

    // What a stand-in stands on: an empty object, array or function of the recorder's own, never
    // the native value itself nor handed to native. The engine checks a Proxy's answers against
    // what it stands on, and a host object may answer the engine otherwise than it answers the
    // recorder, or otherwise each time it is asked; a ground of the recorder's own answers only
    // as the recorder laid it (what the ground allows, above). A function's ground takes `new` only
    // where the function does.
    function groundOfStandIn(real) {
      if (typeof real === 'function') {
        return safeWrapping.isConstructor(real)
          ? safeWrapping.callableTarget(real)
          : safeWrapping.callOnlyTarget(real);
      }
      try {
        if (Array.isArray(real)) return [];
      } catch (_) {
        // A value that refuses the look stands on an object.
      }
      return Object.create(null);
    }

    // A ground takes no new members once its value takes none: the engine then checks every
    // answer against the ground, so it first takes the value's prototype and each member as the
    // bundle gets it, and loses any member the value lacks. A throw as it is laid is the
    // recorder's own, which stops the recording; each part is laid on its own, so one that
    // throws leaves the rest laid, and a value the bundle cannot be given is laid as it is.
    function closeGround(ground, real) {
      quietly(function () {
        Reflect.ownKeys(ground).forEach(function (key) {
          if (!safeWrapping.hasOwn(real, key)) Reflect.deleteProperty(ground, key);
        });
      });
      quietly(function () {
        var prototype = Object.getPrototypeOf(real);
        Object.setPrototypeOf(
          ground,
          quietly(function () {
            return toBundle(prototype);
          }, prototype)
        );
      });
      quietly(function () {
        Reflect.ownKeys(real).forEach(function (key) {
          quietly(function () {
            if (safeWrapping.isFixedProperty(ground, key)) return;
            var description = Object.getOwnPropertyDescriptor(real, key);
            var given = Object.assign({}, description);
            Object.defineProperty(
              ground,
              key,
              quietly(function () {
                return asBundleGetsIt(given);
              }, description)
            );
          });
        });
      });
      Object.preventExtensions(ground);
    }

    function standInFor(real, handle) {
      var ref = { $: 'native', handle: handle, type: typeof real };
      var ground = groundOfStandIn(real);
      var standIn = new Proxy(ground, standInHandler(handle, real));
      refs.set(real, ref);
      refs.set(standIn, ref);
      standInOfNative.set(real, standIn);
      nativeOfStandIn.set(standIn, real);
      var isClosed = false;
      try {
        isClosed = !Object.isExtensible(real);
      } catch (_) {
        // A host object that refuses the look takes new members, as host objects do.
      }
      if (isClosed) closeGround(ground, real);
      return standIn;
    }

    // THE GLOBALS. React Native's own, which native code installs for every app: the quick check
    // stands each one itself, so they are not recorded. No rule on the phone tells them from a
    // library's, so they are named; every other global is judged by what it is.
    var REACT_NATIVE_GLOBALS = {
      HermesInternal: true,
      __turboModuleProxy: true,
      nativeModuleProxy: true,
      nativeFabricUIManager: true,
      nativeRuntimeScheduler: true,
      nativeLoggingHook: true,
      nativePerformanceNow: true,
      nativeCallSyncHook: true,
      nativeFlushQueueImmediate: true,
      nativeRequire: true,
      nativeTraceBeginSection: true,
      nativeTraceEndSection: true,
      nativeTraceBeginAsyncSection: true,
      nativeTraceEndAsyncSection: true,
      nativeTraceCounter: true,
      nativeTraceIsTracing: true,
      __nativeComponentRegistry__hasComponent: true,
      console: true,
      setTimeout: true,
      clearTimeout: true,
      setInterval: true,
      clearInterval: true,
      setImmediate: true,
      clearImmediate: true,
      queueMicrotask: true,
      requestAnimationFrame: true,
      cancelAnimationFrame: true,
      globalEvalWithSourceUrl: true,
      _jsiRuntimeDataCleanUp: true,
    };

    var globalsSeen = {};
    var namesOfGlobals = function () {
      try {
        return Object.getOwnPropertyNames(global);
      } catch (_) {
        // A global object that refuses the look shows no new names.
        return [];
      }
    };

    // A global as a plain property, there to be read and replaced; never a getter, as reading one
    // may run it, and never one of React Native's own.
    function plainGlobalOf(name) {
      if (REACT_NATIVE_GLOBALS[name] === true) return null;
      var description = Object.getOwnPropertyDescriptor(global, name);
      return description && 'value' in description ? description : null;
    }

    // Lays a native global's stand-in in its place and notes it for every story, before any use of
    // it; false when the global cannot be replaced.
    function recordGlobal(name, description) {
      var standIn = fromNative(description.value, function (real) {
        if (!description.writable) return real;
        return standInFor(real, name);
      });
      if (standIn === description.value) return false;
      try {
        global[name] = standIn;
      } catch (_) {
        // A global that cannot be replaced is checked below.
      }
      if (global[name] !== standIn) return false;
      keepInstalled(name, refs.get(standIn));
      return true;
    }

    // A global the bundle was handed, noted for every story with what it held: a native value's
    // handle, or data written down whole.
    function keepInstalled(name, answer) {
      keep(
        'nativeCalls',
        { module: 'global', method: 'installed', args: [name], kind: 'sync', answer: answer },
        true
      );
    }

    // A global holding data, noted for every story as its value; false when it holds more.
    function keepIfData(name, value) {
      var written = serialised(value);
      if (!isWrittenWhole(written, false)) return false;
      keepInstalled(name, written);
      return true;
    }

    // What a global that cannot be replaced holds: its own members, each read through its
    // description alone, so no getter runs, nothing is written and nothing is handed to native.
    // Data is written down, an object or function is named by where it hangs, a getter as one.
    // Neither the global nor its members can be stood in for: native reads the members back by
    // name, past every crossing the recorder sees, and would meet a stand-in, not its own value.
    // Each member that is a function is put in `functions` by its handle, when it is given.
    function shapeOf(name, value, functions) {
      var members = {};
      Object.getOwnPropertyNames(value).forEach(function (key) {
        var member = Object.getOwnPropertyDescriptor(value, key);
        if (!member) return;
        if (!('value' in member)) {
          members[key] = { $: 'accessor' };
        } else if (safeWrapping.isObjectOrFunction(member.value)) {
          var handle = name + '.' + key;
          members[key] = { $: 'native', handle: handle, type: typeof member.value };
          if (functions && typeof member.value === 'function') functions[handle] = member.value;
        } else {
          members[key] = serialised(member.value);
        }
      });
      return { $: 'shape', type: typeof value, members: members };
    }

    // The shapes of a global that cannot be replaced, [name, shape] each: its own, then one level
    // below it the own shape of each member that is a function, by its handle. A function is never
    // an object native answers as it is asked: a native side's function keeps its members as the
    // engine keeps any function's, so reading their descriptions asks native nothing. An object
    // member may be one, so it is never read. Nothing below the functions' own members is read.
    function shapesOf(name, value) {
      var functions = {};
      var shapes = [[name, shapeOf(name, value, functions)]];
      Object.keys(functions).forEach(function (handle) {
        shapes.push([handle, shapeOf(handle, functions[handle], null)]);
      });
      return shapes;
    }

    // The globals that cannot be replaced, by name: the value, its road and its shape as noted.
    var shapesKept = {};

    // Notes a global that cannot be replaced for every story as its shape, for the quick check to
    // stand it up and judge each story by what its draw asks of it beyond the shape; `road` names
    // it should a story meet it changed. One native code laid as a run of it ended carries
    // `laidAfter`, the order of the last entry kept before that run began: the global was not
    // there at that entry, and is from the end of that run on.
    //
    // What lies below the global is read only as shapesOf says: an object native answers as it is
    // asked (a host object) answers the list of its keys and the description of each member
    // itself, and the language tells it from a plain object by no look that does not ask it. So
    // the recorder asks nothing of an object below a shaped global that the app did not ask for
    // itself, and notes each member it left unread, by its handle, once with the shapes, for the
    // quick check to read a miss there: { module: 'global', method: 'shapeCut', args: ['unread'],
    // kind: 'sync', answer: [handle, ...] }. A member whose own shape is noted is not unread.
    // Each function member's shape is a 'shape' note of its handle, with the global's `laidAfter`.
    function keepShape(name, value, road, laidAfter) {
      var shapes = shapesOf(name, value);
      shapesKept[name] = {
        value: value,
        road: road,
        written: JSON.stringify(shapes),
        isNative: isNativeValue(value),
      };
      var shaped = {};
      shapes.forEach(function (named) {
        shaped[named[0]] = true;
        var note = {
          module: 'global',
          method: 'shape',
          args: [named[0]],
          kind: 'sync',
          answer: named[1],
        };
        if (laidAfter !== undefined) note.laidAfter = laidAfter;
        keep('nativeCalls', note, true);
      });
      var unread = [];
      shapes.forEach(function (named) {
        var members = named[1].members;
        Object.keys(members).forEach(function (key) {
          var member = members[key];
          if (member !== null && member.$ === 'native' && !shaped[member.handle]) {
            unread.push(member.handle);
          }
        });
      });
      if (unread.length === 0) return;
      keep(
        'nativeCalls',
        { module: 'global', method: 'shapeCut', args: ['unread'], kind: 'sync', answer: unread },
        true
      );
    }

    // The bundle's reads of a member of the global object, as its code names them, routed here at
    // transform time (metro/lockedGlobalReads.js). Each gets the member as it is, but for a native
    // global noted as a shape and still the value noted: that one gets its stand-in, under the
    // global's name, which leaves the global itself in place for native, so each read below it is
    // a use recorded as any other.
    global.__sherloGlobalRead = function (object, name) {
      var value = object[name];
      if (object !== global || !safeWrapping.hasOwn(shapesKept, name)) return value;
      var kept = shapesKept[name];
      if (!kept.isNative || kept.value !== value) return value;
      return quietly(function () {
        return fromNative(value, function (real) {
          return standInFor(real, name);
        });
      }, value);
    };

    // A global that cannot be replaced whose members, or whose function members' own, changed
    // since its shapes were noted: what the story read of it may not be the shapes, so the
    // story's road through it is unseen.
    function noteChangedShapes() {
      Object.keys(shapesKept).forEach(function (name) {
        var kept = shapesKept[name];
        if (JSON.stringify(shapesOf(name, kept.value)) === kept.written) return;
        keepBlindRoadOnce('jsiGlobal', kept.road, false);
      });
    }

    // An own data member's value, read through its description, so no getter runs.
    function ownDataOf(value, key) {
      var member = Object.getOwnPropertyDescriptor(value, key);
      return member && 'value' in member ? serialised(member.value) : { $: 'undefined' };
    }

    // What a start global the recorder does not record is, read through descriptions alone, for
    // the quick check to tell its own global of that name from the phone's: data as its value, a
    // function by whether native code made it with its name and length, an object by its tag.
    function kindOf(value) {
      if (typeof value === 'function') {
        return {
          type: 'function',
          native: isNativeFunction(value),
          name: ownDataOf(value, 'name'),
          length: ownDataOf(value, 'length'),
        };
      }
      if (safeWrapping.isObjectOrFunction(value)) {
        return { type: 'object', tag: ownDataOf(value, Symbol.toStringTag) };
      }
      return { type: typeof value, value: serialised(value) };
    }

    // The globals the bundle began with. The engine lays its own as it starts, before a native side
    // or the bundle lays any, and the language lays each of them not enumerable: the engine's are
    // the run of globals not enumerable that the global object lists first, as it lists them in
    // the order they were laid. A native side may lay a global not enumerable too, but only after
    // the engine's, so it is judged by what it is, as every later global is. A global that is
    // neither native nor data and is written down whole but for functions of JavaScript source
    // only JavaScript made, and before the recorder only the bundle's own code runs. Neither the
    // engine's nor the bundle's is the phone's: both come again wherever the bundle loads, so
    // their names are handed over once, in one entry every story shares, for the quick check to
    // find them there, each with what it is (kindOf), so that one taken wrongly for the engine's
    // is told from the quick check's own of that name. A native one is recorded where it can be,
    // one holding data as its value, whoever wrote it, and an object or function that cannot be
    // replaced as its shape. Every other (a getter, React Native's own, a value that cannot be
    // written down) is handed over by name with each story, for the quick check to judge.
    quietly(function () {
      var notFromThePhone = [];
      var kinds = {};
      var listNotFromThePhone = function (name, value) {
        notFromThePhone.push(name);
        kinds[name] = kindOf(value);
      };
      var isInTheEnginesRun = true;
      namesOfGlobals().forEach(function (name) {
        globalsSeen[name] = true;
        var laid = Object.getOwnPropertyDescriptor(global, name);
        isInTheEnginesRun = isInTheEnginesRun && !!laid && !laid.enumerable;
        if (name.indexOf('__sherlo') === 0) return;
        var description = plainGlobalOf(name);
        if (description && isInTheEnginesRun) return listNotFromThePhone(name, description.value);
        var isNative = !!description && isNativeValue(description.value);
        if (isNative && recordGlobal(name, description)) return;
        if (description && !isNative) {
          if (keepIfData(name, description.value)) return;
          if (isWrittenWhole(serialised(description.value), true)) {
            return listNotFromThePhone(name, description.value);
          }
        }
        if (description && safeWrapping.isObjectOrFunction(description.value)) {
          return keepShape(name, description.value, 'atStart:' + name);
        }
        keepBlindRoadOnce('jsiGlobal', 'atStart:' + name, true);
      });
      if (notFromThePhone.length > 0) {
        keep(
          'nativeCalls',
          {
            module: 'global',
            method: 'notFromThePhone',
            args: notFromThePhone,
            kind: 'sync',
            answer: kinds,
          },
          true
        );
      }
    });

    // Globals that appeared since: `asItRan` as a run of native code the recorder sees ends, a call
    // or a read, whose native code laid them (the globals laid before it were taken up as it
    // began), so the bundle has read none of them yet. Seen any other time, as a story starts or
    // is read, or as a run of native code begins, a global was laid by native code off every run
    // the recorder sees, as each such run is followed by a take-up: one that is not native is the
    // bundle's own, and a native one may have been read by the bundle already. Either way each
    // native one is recorded from then on, so each later read of its members is written down, as
    // a stand-in, else as its shape as first seen, and one holding data as its value. What the
    // bundle read of a native one before it was seen, and kept as it was, stays unseen: that one
    // is a blind road of every story, named by the global alone, and so is every other global
    // that native code laid, never skipped. One laid as a run ended is noted with `laidAfter`, the
    // order of the last entry kept before that run began.
    function noteNewGlobals(asItRan, names, laidAfter) {
      namesWalked = names;
      names.forEach(function (name) {
        if (globalsSeen[name]) return;
        globalsSeen[name] = true;
        if (name.indexOf('__sherlo') === 0) return;
        var description = plainGlobalOf(name);
        var isNative = !!description && isNativeValue(description.value);
        if (!isNative && !asItRan) return;
        var isRecorded = isNative && recordGlobal(name, description);
        if (!isRecorded && description && !isNative && keepIfData(name, description.value)) return;
        if (!isRecorded && isNative) {
          // The bundle holds it as it is.
          fromNative(description.value, null);
          keepShape(name, description.value, name, asItRan ? laidAfter : undefined);
        }
        if (asItRan && isNative) return;
        keepBlindRoadOnce('jsiGlobal', name, true);
      });
    }
    // As a story starts or is read: every name is walked.
    function takeUpBundleGlobals() {
      noteNewGlobals(false, namesOfGlobals());
    }

    // The global object's names as last walked, in the order listed.
    var namesWalked = [];

    // Around each run of native code, the app's hot path: the names are walked only when the
    // listing differs from the one last walked. Every name of that one was seen as it was walked,
    // so a listing the same, name for name in order, holds none not seen; any name laid since,
    // whatever was deleted with it, makes the listing differ, and then every name is walked.
    // The comparison stops at the first difference and reads nothing but the names.
    function takeUpIfLaid(asItRan, laidAfter) {
      var names = namesOfGlobals();
      if (isListedAsWalked(names)) return;
      noteNewGlobals(asItRan, names, laidAfter);
    }

    function isListedAsWalked(names) {
      if (names.length !== namesWalked.length) return false;
      for (var i = 0; i < names.length; i++) {
        if (names[i] !== namesWalked[i]) return false;
      }
      return true;
    }

    quietly(watchTurboModuleProxy);

    // THE LOAD'S DRAWS OF CHANCE. No two engines draw alike, so the replay hands the load the
    // phone's own draws, in the phone's order: each is noted for every story as
    // { module: 'global', method: 'drawn', args: [], kind: 'sync', answer: <the draw> }. The
    // language's source (safeWrapping.CHANCE_SOURCE) is wrapped from here to the first story, then
    // taken off exactly, so the app holds its own untouched function again. A source already
    // replaced, or one the engine holds to its value, is not wrapped, and a recording past the cap
    // or of the stop takes the wrap off: each is told once, as { module: 'global', method:
    // 'drawnNoMore', args: [why], kind: 'sync' }, why 'replaced', 'heldToItsValue' or 'cap', and a
    // draw the recording does not hold is one the replay cannot answer.
    // The cap: a load draws a few dozen times (one identifier of 36 characters takes 31 draws), and
    // every story's recording carries each draw again.
    var MOST_DRAWS_RECORDED = 256;

    function noteNoMoreDraws(why) {
      keep(
        'nativeCalls',
        { module: 'global', method: 'drawnNoMore', args: [why], kind: 'sync' },
        true
      );
    }

    function noteDraw(drawn) {
      var chance = recorder.chance;
      if (chance.drawn >= MOST_DRAWS_RECORDED) {
        takeOffChanceWrap();
        noteNoMoreDraws('cap');
        return;
      }
      chance.drawn++;
      keep(
        'nativeCalls',
        { module: 'global', method: 'drawn', args: [], kind: 'sync', answer: serialised(drawn) },
        true
      );
    }

    function wrapChance() {
      var holder = global[CHANCE_SOURCE.holder];
      if (!safeWrapping.isObjectOrFunction(holder)) return;
      var held = Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key);
      if (!held) return;
      if (safeWrapping.isHeldToItsValue(holder, CHANCE_SOURCE.key)) {
        return noteNoMoreDraws('heldToItsValue');
      }
      if (!('value' in held) || !isNativeFunction(held.value)) return noteNoMoreDraws('replaced');
      var chance = recorder.chance;
      var wrapped = new Proxy(held.value, {
        apply: function (source, self, args) {
          var drawn = Reflect.apply(source, self, args);
          if (chance.wrapped === wrapped) {
            quietly(function () {
              noteDraw(drawn);
            });
          }
          return drawn;
        },
      });
      var undo = exactUndo.undoOfWrite(holder, CHANCE_SOURCE.key);
      Object.defineProperty(holder, CHANCE_SOURCE.key, {
        value: wrapped,
        writable: held.writable,
        enumerable: held.enumerable,
        configurable: held.configurable,
      });
      chance.wrapped = wrapped;
      chance.undo = function () {
        var now = Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key);
        // One the app laid over the wrap since stays: the wrap under it only passes draws on.
        if (now && now.value === wrapped) undo();
      };
    }

    // Takes the wrap off the source of chance, once; it never throws.
    function takeOffChanceWrap() {
      var chance = recorder.chance;
      var undo = chance.undo;
      chance.undo = null;
      chance.wrapped = null;
      if (!undo) return;
      try {
        undo();
      } catch (_) {
        // A holder that refuses the undo keeps the wrap, which only passes draws on from now.
      }
    }

    var CHANCE_SOURCE = safeWrapping.CHANCE_SOURCE;
    quietly(wrapChance);

    // From the first story on, a throw in the recorder stops it as one anywhere else does.
    function startStory(storyId, placeOfView) {
      takeOffChanceWrap();
      quietly(takeUpBundleGlobals);
      recorder.kept = recorder.kept.filter(function (kept) {
        return kept.story !== storyId;
      });
      delete recorder.picturesAt[storyId];
      recorder.notedInStory = {};
      recorder.story = storyId;
      Object.keys(recorder.callsForLaterStories).forEach(function (road) {
        keepBlindRoadOnce('expoNativeEvent', road, false);
      });
      if (typeof placeOfView === 'function') recorder.placeOfView = placeOfView;
      quietly(noteChangedShapes);
    }

    function copyOf(entry) {
      var copy = {};
      Object.keys(entry).forEach(function (key) {
        copy[key] = entry[key];
      });
      return copy;
    }

    // The story's recording so far: what came before the first story and the story's own. The
    // first read is the picture moment.
    function readStory(storyId) {
      quietly(takeUpBundleGlobals);
      if (storyId === recorder.story) quietly(noteChangedShapes);
      var roads = recorder.rendererRoads;
      // A renderer that did not take its roads hides the commits and the events of the views.
      if (!roads.commit || !roads.viewEvents) {
        keepBlindRoadOnce('jsiGlobal', 'nativeFabricUIManager', true);
      }
      // Without its road, the calls native code makes into the bundle's modules go unseen.
      if (!recorder.callableRoad) keepBlindRoadOnce('expoNativeEvent', 'callableModules', true);
      if (recorder.picturesAt[storyId] === undefined)
        recorder.picturesAt[storyId] = recorder.order++;
      var pictureAt = recorder.picturesAt[storyId];
      var recording = {
        storyId: storyId,
        nativeCalls: [],
        viewEvents: [],
        commits: [],
        pictureAt: pictureAt,
        blindRoads: [],
      };
      recorder.kept.forEach(function (kept) {
        if (kept.story !== null && kept.story !== storyId) return;
        if (kept.list === 'commits') {
          recording.commits.push(kept.entry.order);
          return;
        }
        var copy = copyOf(kept.entry);
        if (kept.list === 'nativeCalls') copy.afterPicture = copy.order > pictureAt;
        recording[kept.list].push(copy);
      });
      return recording;
    }

    global.__sherloNativeRecorder = { startStory: startStory, readStory: readStory };
  }
})();
