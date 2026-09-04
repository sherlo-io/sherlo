import { PROTOCOL_FILE } from './constants';

export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

/**
 * The runner's base-binary gate reads these four - see constants.ts for the
 * full rationale. Exported from the package ROOT rather than a dedicated
 * `./constants` subpath: a subpath is itself a new frozen surface (see
 * exportMap.test.ts), and these four names don't need one of their own.
 */
export {
  ANDROID_SHIM_LIBRARY_NAME,
  IOS_SHIM_REGISTRATION_SYMBOL,
  SEAM_VERSION_GLOBAL_NAME,
  SEAM_VERSION_GATE_REGEX,
} from './constants';

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
    // JS_EVAL_COMPLETE itself moved to src/seam.js: the seam runs unconditionally
    // from the generated entry, even when the customer's own code never imports
    // this package - which a standalone Storybook entry may never do.
    if ((global as any).__sherloWithStorybookApplied === true) {
      try {
        SherloModule.appendFile(
          PROTOCOL_FILE,
          JSON.stringify({
            action: 'WITHSTORYBOOK_APPLIED',
            timestamp: Date.now(),
            entity: 'app',
          }) + '\n'
        );
      } catch (_) {}
    }
    if ((global as any).__sherloStorybookDisabledFlag === true) {
      try {
        SherloModule.appendFile(
          PROTOCOL_FILE,
          JSON.stringify({
            action: 'WITHSTORYBOOK_DISABLED',
            timestamp: Date.now(),
            entity: 'app',
          }) + '\n'
        );
      } catch (_) {}
    }
  }
}
