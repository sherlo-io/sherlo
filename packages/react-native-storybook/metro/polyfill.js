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
  // old one nothing is installed and nothing is recorded. Native code reaches the bundle by four
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
  // - A global native code installed, whether before the bundle or during a recorded call:
  //   { module: 'global', method: 'installed', args: [name], answer: { $: 'native', handle: name,
  //   type: 'object' or 'function' } }, before any use of it: one there before the first story
  //   belongs to every story, one a call installed follows that call.
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
  // never left out: a global native code had at the start that is not recordable ('jsiGlobal',
  // 'atStart:<name>'), a native global first seen outside a recorded call ('jsiGlobal', <name>), a
  // value handed to native that cannot be written down ('jsiGlobal', 'unrecordable:<handle>.<op>'),
  // a function bound for a second runtime ('workletRuntime', '<handle>.<op>'), a native value the
  // bundle must get unwrapped ('jsiGlobal', 'unrecordable:<handle>.<key>'), a seam not taken
  // ('jsiGlobal' '__turboModuleProxy' or 'nativeFabricUIManager', 'expoNativeEvent'
  // 'callableModules').
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

    // A module's method, noting each call with what native answered: the return, the promise's
    // value or each callback's arguments, and what it threw. Native code may install globals as
    // it runs: they are taken up right after.
    function wrapMethod(moduleName, methodName, method, target) {
      return function () {
        var args = Array.prototype.slice.call(arguments);
        var call = keep('nativeCalls', {
          module: moduleName,
          method: methodName,
          args: serialised(args),
          kind: 'sync',
        });
        for (var i = 0; i < args.length; i++) {
          if (typeof args[i] === 'function') {
            args[i] = wrapCallback(call, i, args[i]);
            call.kind = 'async';
          } else {
            args[i] = nativeOf(args[i]);
          }
        }
        var answer;
        try {
          answer = method.apply(target, args);
        } catch (failure) {
          call.threw = serialised(failure);
          throw failure;
        } finally {
          takeUpNewGlobals();
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
    function wrapModule(moduleName, module) {
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
            var wrapper = wrapMethod(moduleName, key, value, target);
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

    // A lookup of a native module by name, noted each time it is made with whether it found one:
    // that changes what the app draws. The module goes out as its recording stand-in.
    function noteLookup(lookupModule, moduleName, find) {
      if (typeof moduleName !== 'string' || NOT_RECORDED[moduleName]) return find();
      var lookup = keep('nativeCalls', {
        module: lookupModule,
        method: 'lookup',
        args: [moduleName],
        kind: 'sync',
      });
      var module;
      try {
        module = find();
      } catch (failure) {
        lookup.threw = serialised(failure);
        throw failure;
      }
      lookup.answer = module == null ? null : { $: 'module' };
      return wrapModule(moduleName, module);
    }

    // The lookup TurboModuleRegistry reads as it loads, which native code installs off the
    // bridgeless runtime; a bridgeless runtime looks up through global.nativeModuleProxy alone.
    function watchTurboModuleProxy() {
      var real = global.__turboModuleProxy;
      if (typeof real !== 'function') return;
      var watched = function (moduleName) {
        var self = this;
        var args = arguments;
        return noteLookup('__turboModuleProxy', moduleName, function () {
          return real.apply(self, args);
        });
      };
      try {
        global.__turboModuleProxy = watched;
      } catch (_) {
        // A lookup that cannot be replaced is checked below.
      }
      if (global.__turboModuleProxy !== watched) {
        keepBlindRoadOnce('jsiGlobal', '__turboModuleProxy', true);
      }
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

    // NativeModules hands out each module as a property of its default export, which Babel may
    // lay as a getter: the exports are then laid again around a Proxy of it. Each read of a module
    // is a lookup, and so is each check with `in`.
    function wrapNativeModules(module) {
      var real = module.exports.default;
      if (!real) return;
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
              keep('nativeCalls', {
                module: 'nativeModuleProxy',
                method: 'has',
                args: [key],
                kind: 'sync',
                answer: found,
              });
            }
            return found;
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
      if (!callable || (typeof callable !== 'object' && typeof callable !== 'function')) {
        return callable;
      }
      var methods = {};
      return new Proxy(callable, {
        get: function (target, key) {
          var value = target[key];
          if (typeof key !== 'string' || typeof value !== 'function') return value;
          var cached = methods[key];
          if (cached && cached.method === value) return cached.wrapper;
          var wrapper = function () {
            var args = Array.prototype.slice.call(arguments);
            if (!isSherloOwnCall(moduleName, key, args)) {
              keep('nativeCalls', {
                module: 'callable:' + moduleName,
                method: key,
                args: serialised(args),
                kind: 'async',
              });
              if (recorder.story !== null) {
                recorder.callsForLaterStories['callable:' + moduleName + '.' + key] = true;
              }
            }
            return value.apply(target, args);
          };
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
      replaceExport(module, 'default', function (name, moduleOrFactory) {
        var factory =
          typeof moduleOrFactory === 'function'
            ? moduleOrFactory
            : function () {
                return moduleOrFactory;
              };
        return register.call(this, name, function () {
          return callableStandIn(String(name), factory.apply(this, arguments));
        });
      });
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

    // THE NATIVE VALUES. A global native code installed, and every object or function reached
    // from it, goes to the bundle as a stand-in that notes each use with its answer.

    // The JavaScript engine's own prototypes: what a native value inherits from them is the
    // engine's, handed back as it is, so `call`, `bind` and the like run on the stand-in itself.
    var enginePrototypes = [Object.prototype, Function.prototype, Array.prototype];
    if (typeof Error === 'function') enginePrototypes.push(Error.prototype);
    if (typeof Promise === 'function') enginePrototypes.push(Promise.prototype);

    function isNativeFunction(value) {
      if (typeof value !== 'function') return false;
      var source = Function.prototype.toString.call(value);
      return source.indexOf('[native code]') !== -1 && String(value.name).indexOf('bound ') !== 0;
    }

    // Made by native code: a function whose source it holds, an object with no prototype, or an
    // object carrying such a function. Read through descriptors only: a getter is never run.
    function isNativeValue(value) {
      if (value === null || value === global || enginePrototypes.indexOf(value) !== -1) {
        return false;
      }
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
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
        return value;
      }
      if (refs.get(value)) {
        return standInOfNative.get(value) || functionOfCallback.get(value) || value;
      }
      if (typeof Promise === 'function' && value instanceof Promise) return settlingOf(value);
      if (typeof value === 'object' && isData(value)) return value;
      return standInFor(value, nextHandle());
    }

    // Data: an object written down whole, holding nothing a stand-in would have to watch. Only its
    // own keys are read (serialise goes by Object.keys), so a member reached through `super` or
    // the prototype is not recorded: the draw meets it unwritten and throws, never draws it wrong.
    function isData(value) {
      var written = JSON.stringify(serialised(value));
      return written.indexOf('"$unserialisable"') === -1 && written.indexOf('"handle"') === -1;
    }

    function settlingOf(promise) {
      var ref = { $: 'promise', handle: nextHandle() };
      var settled = promise.then(
        function (value) {
          var given = toBundle(value);
          keep('nativeCalls', {
            module: ref.handle,
            method: 'resolve',
            args: [serialised(given)],
            kind: 'async',
          });
          return given;
        },
        function (failure) {
          keep('nativeCalls', {
            module: ref.handle,
            method: 'reject',
            args: [serialised(failure)],
            kind: 'async',
          });
          throw failure;
        }
      );
      refs.set(promise, ref);
      refs.set(settled, ref);
      standInOfNative.set(promise, settled);
      return settled;
    }

    // What native code gets of a value the bundle hands it: a stand-in as the native value it
    // stands for, a function as a callback that notes each call native makes of it, at any depth
    // of an array or a plain object. A function carrying properties of its own is bound for
    // another runtime (a worklet's), whose globals the recorder cannot see; any other value that
    // cannot be written down is noted as such too.
    function toNative(value, handle, operation) {
      return nativeAtDepth(value, handle, operation, 1, []);
    }

    function nativeAtDepth(value, handle, operation, depth, seen) {
      if (value !== null && typeof value === 'object') {
        return membersToNative(value, handle, operation, depth, seen);
      }
      if (typeof value !== 'function') return value;
      if (nativeOfStandIn.has(value) || refs.get(value)) {
        return nativeOf(callbackOfFunction.get(value) || value);
      }
      if (Object.keys(value).length > 0) {
        keepBlindRoadOnce('workletRuntime', handle + '.' + operation, false);
        return value;
      }
      return callbackFor(value);
    }

    // An array or a plain object of the bundle holding a function or a stand-in at some depth is
    // handed to native as a copy, each member as native code must get it; any other object goes as
    // it is. Past the depth the recording writes down, or round a cycle, a value goes as it is and
    // its recording marks the road blind.
    function membersToNative(value, handle, operation, depth, seen) {
      if (nativeOfStandIn.has(value) || refs.get(value)) return nativeOf(value);
      if (depth > MAX_DEPTH || seen.indexOf(value) !== -1) return value;
      var isArray = Array.isArray(value);
      if (!isArray && !isPlainObject(value)) return value;
      seen.push(value);
      try {
        var copy = isArray ? [] : Object.create(Object.getPrototypeOf(value));
        var changed = false;
        Object.keys(value).forEach(function (key) {
          copy[key] = nativeAtDepth(value[key], handle, operation, depth + 1, seen);
          if (copy[key] !== value[key]) changed = true;
        });
        return changed ? copy : value;
      } catch (_) {
        // A member that throws as it is read goes to native as it is; its recording is unreadable.
        return value;
      } finally {
        seen.pop();
      }
    }

    function callbackFor(callable) {
      var ref = { $: 'callback', handle: nextHandle() };
      var callback = function () {
        var given = Array.prototype.slice.call(arguments).map(toBundle);
        keep('nativeCalls', {
          module: ref.handle,
          method: 'apply',
          args: [serialised(this), serialised(given)],
          kind: 'async',
        });
        return callable.apply(this, given);
      };
      refs.set(callable, ref);
      refs.set(callback, ref);
      callbackOfFunction.set(callable, callback);
      functionOfCallback.set(callback, callable);
      return callback;
    }

    // The arguments as written down, with a blind road when any part of them cannot be. They have
    // been through toNative first, which gave every function within the depth written down a
    // callback handle, so the only function left unwritten there is one bound for another runtime,
    // which has a blind road of its own; one deeper is written as too deep, a blind road too.
    function argumentsAsRecorded(args, handle, operation) {
      var written = serialised(args);
      var unwritten = JSON.stringify(written).replace(/"\$unserialisable":"function"/g, '');
      if (unwritten.indexOf('"$unserialisable"') !== -1) {
        keepBlindRoadOnce('jsiGlobal', 'unrecordable:' + handle + '.' + operation, false);
      }
      return written;
    }

    // One use of a native value: noted before it runs, so whatever it sets off comes after it,
    // with its answer or what it threw. A call may install globals as it runs: they are taken up.
    function noteUse(handle, operation, args, run) {
      var use = keep('nativeCalls', {
        module: handle,
        method: operation,
        args: args,
        kind: 'sync',
      });
      var answer;
      try {
        answer = run();
      } catch (failure) {
        use.threw = serialised(failure);
        throw failure;
      } finally {
        if (operation === 'apply' || operation === 'construct') takeUpNewGlobals();
      }
      use.answer = serialised(answer);
      return answer;
    }

    // Whether the engine's own prototypes hand out the property: the engine's, not native code's.
    function isEngineOwn(real, key) {
      var owner = real;
      while (owner) {
        if (Object.prototype.hasOwnProperty.call(owner, key)) {
          return enginePrototypes.indexOf(owner) !== -1;
        }
        owner = nativeOf(Object.getPrototypeOf(owner));
      }
      return false;
    }

    // A property the engine holds to its value, neither configurable nor writable: a Proxy must
    // hand back that very value.
    function isHeldToItsValue(real, key) {
      var description = Object.getOwnPropertyDescriptor(real, key);
      return !!description && description.configurable === false && description.writable === false;
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

    function standInHandler(handle) {
      return {
        get: function (real, key, receiver) {
          var self = nativeOf(receiver);
          if (typeof key !== 'string' || isEngineOwn(real, key)) {
            return Reflect.get(real, key, self);
          }
          var isHeld = isHeldToItsValue(real, key);
          return noteUse(handle, 'get', [key], function () {
            var value = Reflect.get(real, key, self);
            if (!isHeld) return toBundle(value);
            // The bundle gets it unwrapped, so its own uses go unseen.
            if (isNativeValue(value) && !refs.get(value)) {
              keepBlindRoadOnce('jsiGlobal', 'unrecordable:' + handle + '.' + key, false);
            }
            return value;
          });
        },
        has: function (real, key) {
          if (typeof key !== 'string') return Reflect.has(real, key);
          return noteUse(handle, 'has', [key], function () {
            return Reflect.has(real, key);
          });
        },
        ownKeys: function (real) {
          var keys = Reflect.ownKeys(real);
          noteUse(handle, 'ownKeys', [], function () {
            return keys.filter(function (key) {
              return typeof key === 'string';
            });
          });
          return keys;
        },
        getOwnPropertyDescriptor: function (real, key) {
          if (typeof key !== 'string') return Reflect.getOwnPropertyDescriptor(real, key);
          var description;
          noteUse(handle, 'getOwnPropertyDescriptor', [key], function () {
            description = Reflect.getOwnPropertyDescriptor(real, key);
            if (description && description.configurable && 'value' in description) {
              description.value = toBundle(description.value);
            }
            return descriptorAsRecorded(description);
          });
          return description;
        },
        getPrototypeOf: function (real) {
          return noteUse(handle, 'getPrototypeOf', [], function () {
            var prototype = Reflect.getPrototypeOf(real);
            return Reflect.isExtensible(real) ? toBundle(prototype) : prototype;
          });
        },
        set: function (real, key, value, receiver) {
          if (typeof key !== 'string') return Reflect.set(real, key, value, nativeOf(receiver));
          var given = toNative(value, handle, 'set');
          var args = [key, argumentsAsRecorded(value, handle, 'set')];
          return noteUse(handle, 'set', args, function () {
            return Reflect.set(real, key, given, nativeOf(receiver));
          });
        },
        defineProperty: function (real, key, description) {
          if (typeof key !== 'string') return Reflect.defineProperty(real, key, description);
          var given = {};
          Object.keys(description).forEach(function (field) {
            given[field] = toNative(description[field], handle, 'defineProperty');
          });
          var args = [key, descriptorAsRecorded(description)];
          return noteUse(handle, 'defineProperty', args, function () {
            return Reflect.defineProperty(real, key, given);
          });
        },
        deleteProperty: function (real, key) {
          if (typeof key !== 'string') return Reflect.deleteProperty(real, key);
          return noteUse(handle, 'deleteProperty', [key], function () {
            return Reflect.deleteProperty(real, key);
          });
        },
        apply: function (real, self, args) {
          var given = args.map(function (arg) {
            return toNative(arg, handle, 'apply');
          });
          var recorded = [serialised(self), argumentsAsRecorded(args, handle, 'apply')];
          return noteUse(handle, 'apply', recorded, function () {
            return toBundle(Reflect.apply(real, nativeOf(self), given));
          });
        },
        construct: function (real, args, newTarget) {
          var given = args.map(function (arg) {
            return toNative(arg, handle, 'construct');
          });
          var isOwn = nativeOf(newTarget) === real;
          var recorded = [
            argumentsAsRecorded(args, handle, 'construct'),
            isOwn ? refs.get(real) : { $: 'subclass' },
          ];
          return noteUse(handle, 'construct', recorded, function () {
            var made = Reflect.construct(real, given, isOwn ? real : newTarget);
            return refs.get(made) ? toBundle(made) : standInFor(made, nextHandle());
          });
        },
      };
    }

    function standInFor(real, handle) {
      var ref = { $: 'native', handle: handle, type: typeof real };
      var standIn = new Proxy(real, standInHandler(handle));
      refs.set(real, ref);
      refs.set(standIn, ref);
      standInOfNative.set(real, standIn);
      nativeOfStandIn.set(standIn, real);
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

    // A global native code installed, as a value the bundle may be handed a stand-in of: a plain
    // property, there to be read and replaced. Never a getter: reading one may run it.
    function nativeGlobalOf(name) {
      if (REACT_NATIVE_GLOBALS[name] === true) return null;
      var description = Object.getOwnPropertyDescriptor(global, name);
      if (!description || !('value' in description)) return null;
      return isNativeValue(description.value) ? description : null;
    }

    // Lays a native global's stand-in in its place and notes it for every story, before any use of
    // it; false when the global cannot be replaced.
    function recordGlobal(name, description) {
      if (!description.writable || !description.enumerable) return false;
      var standIn = standInFor(description.value, name);
      try {
        global[name] = standIn;
      } catch (_) {
        // A global that cannot be replaced is checked below.
      }
      if (global[name] !== standIn) return false;
      keep(
        'nativeCalls',
        {
          module: 'global',
          method: 'installed',
          args: [name],
          kind: 'sync',
          answer: refs.get(standIn),
        },
        true
      );
      return true;
    }

    // The globals the bundle began with: each native one is recorded where it can be. Every other
    // is handed over by name with each story, for the quick check to judge.
    namesOfGlobals().forEach(function (name) {
      globalsSeen[name] = true;
      if (name.indexOf('__sherlo') === 0) return;
      var description = nativeGlobalOf(name);
      if (description && recordGlobal(name, description)) return;
      keepBlindRoadOnce('jsiGlobal', 'atStart:' + name, true);
    });

    // Globals that appeared since: `asItRan` after a recorded call, whose native code installed
    // them, so each native one is recorded; seen any other time, the bundle may have used one
    // already, so it is a blind road of every story.
    function noteNewGlobals(asItRan) {
      namesOfGlobals().forEach(function (name) {
        if (globalsSeen[name]) return;
        globalsSeen[name] = true;
        if (name.indexOf('__sherlo') === 0) return;
        var description = nativeGlobalOf(name);
        if (!description) return;
        if (asItRan && recordGlobal(name, description)) return;
        keepBlindRoadOnce('jsiGlobal', name, true);
      });
    }
    function takeUpNewGlobals() {
      noteNewGlobals(true);
    }

    watchTurboModuleProxy();

    function startStory(storyId, placeOfView) {
      noteNewGlobals(false);
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
      noteNewGlobals(false);
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
