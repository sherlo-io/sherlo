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
  try {
    if (stillReal.isTesting) installNativeRecorder();
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
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return;

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
  // old one nothing is installed and nothing is recorded. The files that reach native code hand
  // their module over as they finish running (metro/mockSpecifierTransformer.js markNativeRoads):
  // TurboModuleRegistry's and Expo's lookups and NativeModules are wrapped, and every module they
  // hand out is a Proxy whose methods note the call and native's answer. The Fabric renderer hands
  // over its commit and its event entry. global.nativeFabricUIManager itself is never wrapped:
  // native code reads it back as its own on every event, and a Proxy over it aborts the app. Nor is
  // global.nativeModuleProxy, which cannot be replaced. What the recorder cannot write down it notes
  // as a blind road. Every entry takes the next number of one order. The SDK starts and reads each
  // story's part (src/nativeRecording.ts); what came before the first story belongs to every story.
  function installNativeRecorder() {
    if (typeof Proxy !== 'function' || !global.nativeFabricUIManager) return;

    // Sherlo's own module is the SDK talking, not the story: not recorded.
    var NOT_RECORDED = { SherloModule: true };
    var MAX_DEPTH = 12;
    var recorder = {
      order: 0,
      // The story recording now; null before the first, whose entries every story shares.
      story: null,
      // Each entry, as { story, list, entry }: list is the StoryRecording field it belongs to.
      kept: [],
      // What the current story already noted once: a lookup, a constant, a blind road.
      notedInStory: {},
      notedInLaunch: {},
      picturesAt: {},
      placeOfView: function () {
        return null;
      },
      rendererRoads: { commit: false, viewEvents: false },
      // How many of Expo's own lookups are running: a read of Expo's modules outside one skipped it.
      expoLookups: 0,
      watchedExpoModules: null,
      // The device events delivered since the first story began, each a blind road of every story
      // that starts later.
      deviceEventsForLaterStories: {},
    };

    function keep(list, entry, shared) {
      entry.order = recorder.order++;
      recorder.kept.push({ story: shared ? null : recorder.story, list: list, entry: entry });
      return entry;
    }

    function keepBlindRoadOnce(kind, name, shared) {
      var noted = shared ? recorder.notedInLaunch : recorder.notedInStory;
      var key = 'blind ' + kind + ' ' + name;
      if (noted[key]) return;
      noted[key] = true;
      keep('blindRoads', { kind: kind, name: name }, shared);
    }

    var tagOf = function (value) {
      return Object.prototype.toString.call(value);
    };

    // A JSON-safe copy of a value, with every value JSON cannot carry marked by a "$" key.
    function serialise(value, depth, seen) {
      if (value === undefined) return { $: 'undefined' };
      if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
      if (typeof value === 'number')
        return isFinite(value) ? value : { $: 'number', value: String(value) };
      if (typeof value === 'bigint') return { $: 'bigint', value: String(value) };
      if (typeof value === 'symbol') return { $unserialisable: 'symbol' };
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
        var proto = Object.getPrototypeOf(value);
        var plain =
          proto === null || (Object.getPrototypeOf(proto) === null && tag === '[object Object]');
        if (!plain) {
          // A host object, a class instance (an Expo shared object) or anything JSON would flatten.
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

    // A module's method, noting each call with what native answered: the return, the promise's
    // value or each callback's arguments, and what it threw. A listener added to an Expo module
    // hears events native code sends straight to it, which the recorder cannot see.
    function wrapMethod(moduleName, methodName, method, target, fromExpo) {
      return function () {
        var args = Array.prototype.slice.call(arguments);
        var call = keep('nativeCalls', {
          module: moduleName,
          method: methodName,
          args: serialised(args),
          kind: 'sync',
        });
        if (fromExpo && methodName === 'addListener') {
          keepBlindRoadOnce('expoNativeEvent', moduleName, false);
        }
        for (var i = 0; i < args.length; i++) {
          if (typeof args[i] === 'function') {
            args[i] = wrapCallback(call, i, args[i]);
            call.kind = 'async';
          }
        }
        var answer;
        try {
          answer = method.apply(target, args);
        } catch (failure) {
          call.threw = serialised(failure);
          throw failure;
        }
        if (answer && typeof answer.then === 'function') {
          call.kind = 'async';
          answer.then(
            function (value) {
              call.answer = serialised(value);
            },
            function (failure) {
              call.threw = serialised(failure);
            }
          );
        } else {
          call.answer = serialised(answer);
        }
        return answer;
      };
    }

    function wrapCallback(call, index, callback) {
      return function () {
        var callbacks = call.callbacks || (call.callbacks = []);
        callbacks.push({ arg: index, args: serialised(Array.prototype.slice.call(arguments)) });
        return callback.apply(this, arguments);
      };
    }

    var wrappedModules = {};
    // Every stand-in handed out, so a module reached by two roads (TurboModuleRegistry asks
    // NativeModules) is wrapped once and each call noted once.
    var standIns = typeof WeakSet === 'function' ? new WeakSet() : null;
    function wrapModule(moduleName, module, fromExpo) {
      if (!module || (typeof module !== 'object' && typeof module !== 'function')) return module;
      if (NOT_RECORDED[moduleName]) return module;
      if (standIns && standIns.has(module)) return module;
      var known = wrappedModules[moduleName];
      if (known && known.module === module) return known.standIn;
      var methods = {};
      var standIn = new Proxy(module, {
        get: function (target, key) {
          var value = target[key];
          if (typeof key !== 'string') return value;
          if (typeof value === 'function') {
            var description = null;
            try {
              description = Object.getOwnPropertyDescriptor(target, key);
            } catch (_) {
              // A host object may refuse the look: the method is then wrapped as any other.
            }
            // A frozen property must be handed back as it is, or the Proxy throws.
            if (description && description.configurable === false && !description.writable) {
              return value;
            }
            var cached = methods[key];
            if (cached && cached.method === value) return cached.wrapper;
            var wrapper = wrapMethod(moduleName, key, value, target, fromExpo);
            methods[key] = { method: value, wrapper: wrapper };
            return wrapper;
          }
          // A constant the module carries: noted once a story, as a call of its name.
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
        },
      });
      wrappedModules[moduleName] = { module: module, standIn: standIn };
      if (standIns) standIns.add(standIn);
      return standIn;
    }

    // A lookup that hands out a native module by name. Whether it found one changes what the app
    // draws, so each lookup is noted once a story; the module goes out as its recording stand-in.
    function wrapLookup(lookupModule, lookupName, real, fromExpo) {
      return function (moduleName) {
        var noted = typeof moduleName === 'string' && !NOT_RECORDED[moduleName];
        var lookupKey = 'lookup ' + lookupModule + '.' + lookupName + '(' + moduleName + ')';
        var lookup = { module: lookupModule, method: lookupName, args: [moduleName], kind: 'sync' };
        if (noted && !recorder.notedInStory[lookupKey]) {
          recorder.notedInStory[lookupKey] = true;
          keep('nativeCalls', lookup);
        }
        var module;
        if (fromExpo) recorder.expoLookups++;
        try {
          module = real.apply(this, arguments);
        } catch (failure) {
          lookup.threw = serialised(failure);
          throw failure;
        } finally {
          if (fromExpo) recorder.expoLookups--;
        }
        lookup.answer = module == null ? null : { $: 'module' };
        return noted ? wrapModule(moduleName, module, fromExpo) : module;
      };
    }

    // Lays `wrapper` as `exportName` of the module's exports: assigned, or else defined anew.
    function replaceExport(module, exportName, wrapper) {
      try {
        module.exports[exportName] = wrapper;
      } catch (_) {
        // A read-only export: it is defined anew below.
      }
      if (module.exports[exportName] === wrapper) return;
      Object.defineProperty(module.exports, exportName, {
        value: wrapper,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    function wrapLookups(lookupModule, names, fromExpo) {
      return function (module) {
        names.forEach(function (name) {
          var real = module.exports[name];
          if (typeof real === 'function') {
            replaceExport(module, name, wrapLookup(lookupModule, name, real, fromExpo));
          }
        });
        if (fromExpo) watchExpoModules();
      };
    }

    // NativeModules hands out each module as a property of its default export, which Babel may
    // lay as a getter: the exports are then laid again around a Proxy of it.
    function wrapNativeModules(module) {
      var real = module.exports.default;
      if (!real) return;
      var wrapped = new Proxy(
        {},
        {
          get: function (_, key) {
            var nativeModule = real[key];
            return typeof key === 'string' ? wrapModule(key, nativeModule, false) : nativeModule;
          },
          has: function (_, key) {
            return key in real;
          },
        }
      );
      try {
        module.exports.default = wrapped;
      } catch (_) {
        // A getter export: the exports are laid again below.
      }
      if (module.exports.default === wrapped) return;
      var exportsAgain = { __esModule: true };
      Object.keys(module.exports).forEach(function (key) {
        exportsAgain[key] = module.exports[key];
      });
      exportsAgain.default = wrapped;
      module.exports = exportsAgain;
    }

    // Every device event native sends to the JavaScript goes out through the emitter's `emit`. It is
    // not recorded, and what it told the JavaScript stays (the app's state, the screen's size), so
    // it blinds the story it lands in before that story's picture and every story that starts
    // after it. A listener alone changes nothing until an event comes.
    function keepDeviceEventInStory(road) {
      // An event the app got before the first story is already carried by every story.
      if (recorder.notedInLaunch['blind expoNativeEvent ' + road]) return;
      keepBlindRoadOnce('expoNativeEvent', road, false);
    }
    // Sherlo's own messages are the SDK talking, not the app. The polyfill runs before any module,
    // so it cannot import their names: the same names as src/connection/appLine.ts (MESSAGE_EVENT)
    // and src/mocking/networkNative.ts (UNANSWERED_EVENT), held to them by the recorder's test.
    var SHERLO_OWN_DEVICE_EVENTS = { SherloMessage: true, SherloUnansweredRequest: true };
    function noteDeviceEvent(eventName) {
      if (SHERLO_OWN_DEVICE_EVENTS[eventName] === true) return;
      var road = 'deviceEvent:' + eventName;
      var story = recorder.story;
      if (story === null) {
        keepBlindRoadOnce('expoNativeEvent', road, true);
        return;
      }
      recorder.deviceEventsForLaterStories[road] = true;
      if (recorder.picturesAt[story] === undefined) keepDeviceEventInStory(road);
    }
    function watchDeviceEvents(module) {
      var emitter = module.exports.default;
      var emit = emitter && emitter.emit;
      if (typeof emit !== 'function') return;
      emitter.emit = function (eventName) {
        try {
          noteDeviceEvent(String(eventName));
        } catch (_) {
          // Recording never stops an event: this one goes on unmarked.
        }
        return emit.apply(this, arguments);
      };
    }

    var roadHooks = {
      'react-native/Libraries/TurboModule/TurboModuleRegistry.js': wrapLookups(
        'TurboModuleRegistry',
        ['get', 'getEnforcing'],
        false
      ),
      'react-native/Libraries/BatchedBridge/NativeModules.js': wrapNativeModules,
      'expo-modules-core/src/requireNativeModule.ts': wrapLookups(
        'expo',
        ['requireNativeModule', 'requireOptionalNativeModule'],
        true
      ),
      'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter.js': watchDeviceEvents,
    };
    // Called by the line each road's file ends with, as that file's module finishes running.
    global.__sherloNativeRoad = function (road, module) {
      var hook = roadHooks[road];
      if (!hook || !module || !module.exports) return;
      try {
        hook(module);
      } catch (_) {
        // A road that cannot be wrapped is left as it is: the app runs on, its calls unrecorded.
      }
    };

    // The Fabric renderer's commit of the tree, handed over by the line rewritten in it.
    global.__sherloCommitRoad = function (completeRoot) {
      recorder.rendererRoads.commit = true;
      return function () {
        keep('commits', {});
        return completeRoot.apply(this, arguments);
      };
    };

    // The Fabric renderer's event entry: every event a view sends passes here, with the view it
    // came from, before React runs it.
    global.__sherloViewEventRoad = function (dispatchEvent) {
      recorder.rendererRoads.viewEvents = true;
      return function (target, type, nativeEvent) {
        try {
          keep('viewEvents', viewEventOf(target, type, nativeEvent));
        } catch (_) {
          // Recording never stops an event: this one goes on unrecorded.
        }
        return dispatchEvent.apply(this, arguments);
      };
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

    // Expo's modules, read straight from global.expo.modules: a read outside Expo's own lookup
    // skipped it, so its module's calls go unrecorded. Watched as soon as the global is there.
    function watchExpoModules() {
      var expo = global.expo;
      var modules = expo && expo.modules;
      if (!modules || modules === recorder.watchedExpoModules) return;
      var watched = new Proxy(modules, {
        get: function (target, key) {
          var module = target[key];
          if (recorder.expoLookups === 0 && typeof key === 'string' && module != null) {
            keepBlindRoadOnce('expoSkippedLookup', key, false);
          }
          return module;
        },
      });
      try {
        expo.modules = watched;
      } catch (_) {
        // Expo's modules cannot be replaced: reads that skip the lookup then go unseen.
      }
      if (expo.modules === watched) recorder.watchedExpoModules = watched;
    }

    // Globals that appeared since the bundle began: a library's native install (a worklet runtime,
    // a native function, a host object) shows here. Never a getter: reading one may run it.
    var globalsSeen = {};
    var namesOfGlobals = function () {
      try {
        return Object.getOwnPropertyNames(global);
      } catch (_) {
        // A global object that refuses the look shows no new names.
        return [];
      }
    };
    // What native installed before the bundle began cannot be told from the app's own globals here,
    // so every one is handed over with each story, by name, for the quick check to judge.
    namesOfGlobals().forEach(function (name) {
      globalsSeen[name] = true;
      if (name.indexOf('__sherlo') === 0) return;
      keepBlindRoadOnce('jsiGlobal', 'atStart:' + name, true);
    });
    function isInstalledByNative(value) {
      if (typeof value === 'function') {
        var source = Function.prototype.toString.call(value);
        return source.indexOf('[native code]') !== -1 && String(value.name).indexOf('bound ') !== 0;
      }
      return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === null;
    }
    function noteNewGlobals() {
      namesOfGlobals().forEach(function (name) {
        if (globalsSeen[name]) return;
        globalsSeen[name] = true;
        if (name.indexOf('__sherlo') === 0 || name === 'expo') return;
        var description = Object.getOwnPropertyDescriptor(global, name);
        if (!description || !('value' in description)) return;
        if (!isInstalledByNative(description.value)) return;
        keepBlindRoadOnce(/worklet/i.test(name) ? 'workletRuntime' : 'jsiGlobal', name, true);
      });
    }

    function lookAround() {
      noteNewGlobals();
      watchExpoModules();
    }

    function startStory(storyId, placeOfView) {
      lookAround();
      recorder.kept = recorder.kept.filter(function (kept) {
        return kept.story !== storyId;
      });
      delete recorder.picturesAt[storyId];
      recorder.notedInStory = {};
      recorder.story = storyId;
      Object.keys(recorder.deviceEventsForLaterStories).forEach(keepDeviceEventInStory);
      if (typeof placeOfView === 'function') recorder.placeOfView = placeOfView;
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
      lookAround();
      var roads = recorder.rendererRoads;
      // A renderer that did not take its roads hides the commits and the events of the views.
      if (!roads.commit || !roads.viewEvents) {
        keepBlindRoadOnce('jsiGlobal', 'nativeFabricUIManager', true);
      }
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

    watchExpoModules();
    global.__sherloNativeRecorder = { startStory: startStory, readStory: readStory };
  }
})();
