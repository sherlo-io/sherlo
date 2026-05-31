import checkSdkCompatibility from './checkSdkCompatibility';
import { PROTOCOL_FILE } from './constants';

export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

export * from './types';

try {
  installSherloIntegration();
} catch (_) {}

function installSherloIntegration(): void {
  const SherloModule = require('./SherloModule').default;

  const isTesting =
    SherloModule &&
    typeof SherloModule.getMode === 'function' &&
    SherloModule.getMode() === 'testing';

  if (isTesting) {
    SherloModule.appendFile(
      PROTOCOL_FILE,
      JSON.stringify({ action: 'JS_EVAL_COMPLETE', timestamp: Date.now(), entity: 'app' }) + '\n'
    );

    // Run SDK compatibility check BEFORE writing WITHSTORYBOOK_APPLIED.
    // checkSdkCompatibility() is idempotent: a second call from getStorybook.tsx returns
    // the cached result without calling sendNativeError again.
    let isSdkCompatible: boolean | null = null;
    try {
      isSdkCompatible = checkSdkCompatibility();
    } catch (_) {}

    // Only write WITHSTORYBOOK_APPLIED when SDK is compatible.
    // When incompatible, sendNativeError(ERROR_SDK_COMPATIBILITY) was dispatched async on iOS
    // (methodQueue = RCTGetUIManagerQueue). appendFile goes through a different (faster) queue
    // on iOS new-arch, so WITHSTORYBOOK_APPLIED can land in the file before NATIVE_ERROR,
    // causing waitForAnyProtocolEntry to resolve prematurely and miss the compat error.
    if ((global as any).__sherloWithStorybookApplied === true && isSdkCompatible !== false) {
      try {
        SherloModule.appendFile(
          PROTOCOL_FILE,
          JSON.stringify({ action: 'WITHSTORYBOOK_APPLIED', timestamp: Date.now(), entity: 'app' }) + '\n'
        );
      } catch (_) {}
    }
    if ((global as any).__sherloStorybookDisabledFlag === true) {
      try {
        SherloModule.appendFile(
          PROTOCOL_FILE,
          JSON.stringify({ action: 'WITHSTORYBOOK_DISABLED', timestamp: Date.now(), entity: 'app' }) + '\n'
        );
      } catch (_) {}
    }
  }
}
