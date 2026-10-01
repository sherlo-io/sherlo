// Spike swap-the-core: run the sealed core the native loader picked, once, and hand it out.
//
// The core is not part of the app's JS bundle. Native code reads it from the app's storage folder
// (a newer core Sherlo signed) or from the SDK's own assets, and this module evaluates its source on
// the app's JS runtime. Every caller goes through getSealedCore(), so the core is always installed
// before its first use, whatever order the SDK's modules are imported in.
import { NativeModules } from 'react-native';
import TurboModule from './specs/NativeSherloModule';

let sealedCore = null;
let hasTried = false;

export function getSealedCore() {
  if (hasTried) return sealedCore;
  hasTried = true;

  const nativeModule = TurboModule || NativeModules.SherloModule;
  if (!nativeModule || typeof nativeModule.loadCore !== 'function') {
    console.log('[sherlo-core] this native build has no core loader');
    return null;
  }

  const picked = JSON.parse(nativeModule.loadCore());
  if (!picked.source) {
    console.log('[sherlo-core] no core to run: ' + picked.reason);
    return null;
  }

  const started = Date.now();
  const evaluatedWith = evaluate(picked.source);
  const evaluateMs = Date.now() - started;

  sealedCore = globalThis.__SHERLO_CORE__ || null;
  const summary =
    '[sherlo-core] running ' +
    picked.origin +
    ' core ' +
    (sealedCore ? sealedCore.describe() : '(it installed nothing)') +
    (picked.reason ? ' - ' + picked.reason : '') +
    ' | native ' +
    picked.nativeMs.toFixed(2) +
    ' ms, ' +
    evaluatedWith +
    ' ' +
    evaluateMs +
    ' ms' +
    (picked.nativeCore ? ' | ' + picked.nativeCore : '');
  console.log(summary);
  globalThis.__SHERLO_CORE_SUMMARY__ = summary;
  return sealedCore;
}

// Indirect eval runs the source in global scope. If the engine refuses eval, try the Function
// constructor, and say which one worked - that is one of the questions this spike answers.
function evaluate(source) {
  try {
    (0, eval)(source + '\n//# sourceURL=sherlo-core.js');
    return 'eval';
  } catch (evalError) {
    try {
      new Function(source)();
      return 'Function (eval failed: ' + evalError.message + ')';
    } catch (functionError) {
      return 'nothing (eval: ' + evalError.message + '; Function: ' + functionError.message + ')';
    }
  }
}
